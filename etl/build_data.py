"""
NFL Season Hub — ETL

Turns raw nflverse data into the small, typed JSON files the frontend reads.
Run once; output is committed to public/data.

    python etl/build_data.py [--seasons 2020 2021 ...] [--out public/data]

Data: nflverse (https://github.com/nflverse), CC BY 4.0.
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
from datetime import date, datetime
from pathlib import Path

import nflreadpy as nfl
import polars as pl

SEASONS = [2020, 2021, 2022, 2023, 2024, 2025]

# Standard deviation of NFL game margins. Converting a point spread to a win
# probability with the normal CDF at this sigma is the conventional approximation.
MARGIN_SIGMA = 13.86

# A play is "key" if the home win probability moves at least this much.
KEY_PLAY_WP_SWING = 0.10

# Plays we never want in the replay: no win-probability value or no real snap.
REPLAY_PLAY_TYPES = {
    "pass", "run", "punt", "field_goal", "kickoff",
    "extra_point", "qb_kneel", "qb_spike", "no_play",
}


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def win_prob_from_spread(spread: float) -> float:
    """Closing spread (positive = home favored) -> P(home win)."""
    return norm_cdf(spread / MARGIN_SIGMA)


def clean(value):
    """Make a value JSON-safe: NaN/inf -> None, numpy/polars scalars -> python."""
    if value is None:
        return None
    if isinstance(value, float):
        return None if (math.isnan(value) or math.isinf(value)) else round(value, 4)
    if isinstance(value, (date, datetime)):
        return value.isoformat()[:10]
    return value


def write_json(path: Path, payload) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    path.write_text(text, encoding="utf-8")
    return len(text.encode("utf-8"))


def age_on(birth_date, season: int) -> int | None:
    """Approximate age at the start of the given season (Sept 1)."""
    if birth_date is None:
        return None
    if isinstance(birth_date, str):
        try:
            birth_date = datetime.fromisoformat(birth_date[:10]).date()
        except ValueError:
            return None
    ref = date(season, 9, 1)
    years = ref.year - birth_date.year - ((ref.month, ref.day) < (birth_date.month, birth_date.day))
    return years if 15 < years < 60 else None


# --------------------------------------------------------------------------
# teams
# --------------------------------------------------------------------------

def build_team_meta(live_abbrs: set[str]) -> dict[str, dict]:
    """Static per-team identity: names, colors, logos, division."""
    teams = nfl.load_teams().filter(pl.col("team_abbr").is_in(list(live_abbrs)))
    meta: dict[str, dict] = {}
    for row in teams.iter_rows(named=True):
        division = row["team_division"] or ""
        meta[row["team_abbr"]] = {
            "id": row["team_abbr"],
            "name": row["team_name"],
            "nick": row["team_nick"],
            "conference": row["team_conf"],
            "division": division,
            "logo": row["team_logo_espn"],
            "primaryColor": row["team_color"],
            "secondaryColor": row["team_color2"],
        }
    missing = live_abbrs - set(meta)
    if missing:
        raise SystemExit(f"No team metadata for: {sorted(missing)}")
    return meta


# --------------------------------------------------------------------------
# records + market-implied expected wins (from closing spreads)
# --------------------------------------------------------------------------

def build_season_records(schedules: pl.DataFrame) -> dict[int, dict[str, dict]]:
    """
    Per season, per team: W-L-T, points for/against, and market-implied
    expected wins summed from each game's closing spread.

    The nflverse Vegas win-total dataset stops after 2020, so preseason
    over/unders are unavailable for most of our range. Summing per-game
    market win probabilities gives a comparable "how many games did the
    market expect this team to win" figure with full coverage.
    """
    out: dict[int, dict[str, dict]] = {}
    # Regular season only: a W-L record and an expected-win total are both
    # 17-game figures, so folding playoff games in would make them incomparable.
    played = schedules.filter(
        pl.col("home_score").is_not_null() & (pl.col("game_type") == "REG")
    )

    for row in played.iter_rows(named=True):
        season, home, away = row["season"], row["home_team"], row["away_team"]
        hs, aws = row["home_score"], row["away_score"]
        spread = row["spread_line"]

        bucket = out.setdefault(season, {})
        for team, own, opp in ((home, hs, aws), (away, aws, hs)):
            t = bucket.setdefault(team, {
                "wins": 0, "losses": 0, "ties": 0,
                "pointsFor": 0, "pointsAgainst": 0,
                "expectedWins": 0.0, "gamesPlayed": 0,
            })
            t["pointsFor"] += own
            t["pointsAgainst"] += opp
            t["gamesPlayed"] += 1
            if own > opp:
                t["wins"] += 1
            elif own < opp:
                t["losses"] += 1
            else:
                t["ties"] += 1

        if spread is not None:
            p_home = win_prob_from_spread(spread)
            bucket[home]["expectedWins"] += p_home
            bucket[away]["expectedWins"] += 1.0 - p_home

    return out


# --------------------------------------------------------------------------
# team stat lines from play-by-play
# --------------------------------------------------------------------------

def build_stat_lines(pbp: pl.DataFrame, records: dict[str, dict]) -> dict[str, dict]:
    """Offense and defense stat lines per team for one season."""
    # Regular season only: these are per-game rates divided by the 17-game
    # regular-season count, so postseason plays would inflate every total.
    scrimmage = pbp.filter(
        (pl.col("season_type") == "REG")
        & pl.col("play_type").is_in(["pass", "run"])
        & pl.col("epa").is_not_null()
    )

    def side(team_col: str) -> dict[str, dict]:
        agg = (
            scrimmage.group_by(team_col)
            .agg(
                epa_per_play=pl.col("epa").mean(),
                success_rate=(pl.col("epa") > 0).mean(),
                yards=pl.col("yards_gained").sum(),
                plays=pl.len(),
                explosive_rate=(pl.col("yards_gained") >= 20).mean(),
            )
            .filter(pl.col(team_col).is_not_null())
        )
        return {r[team_col]: r for r in agg.iter_rows(named=True)}

    offense, defense = side("posteam"), side("defteam")

    lines: dict[str, dict] = {}
    for team, rec in records.items():
        games = max(rec["gamesPlayed"], 1)
        o, d = offense.get(team), defense.get(team)
        lines[team] = {
            "offense": {
                "epaPerPlay": clean(o["epa_per_play"]) if o else None,
                "successRate": clean(o["success_rate"]) if o else None,
                "pointsPerGame": clean(rec["pointsFor"] / games),
                "yardsPerGame": clean(o["yards"] / games) if o else None,
                "explosiveRate": clean(o["explosive_rate"]) if o else None,
                "plays": o["plays"] if o else 0,
            },
            "defense": {
                "epaPerPlay": clean(d["epa_per_play"]) if d else None,
                "successRate": clean(d["success_rate"]) if d else None,
                "pointsPerGame": clean(rec["pointsAgainst"] / games),
                "yardsPerGame": clean(d["yards"] / games) if d else None,
                "explosiveRate": clean(d["explosive_rate"]) if d else None,
                "plays": d["plays"] if d else 0,
            },
        }
    return lines


# --------------------------------------------------------------------------
# rosters, depth charts, draft
# --------------------------------------------------------------------------

def build_rosters(season: int) -> dict[str, list[dict]]:
    rosters = nfl.load_rosters(seasons=[season])
    out: dict[str, list[dict]] = {}
    for r in rosters.iter_rows(named=True):
        team = fix_abbr(r.get("team"))
        if not team:
            continue
        out.setdefault(team, []).append({
            "id": r.get("gsis_id") or f"{team}-{r.get('full_name')}",
            "name": r.get("full_name"),
            "position": r.get("position"),
            "number": int(r["jersey_number"]) if r.get("jersey_number") is not None else None,
            "age": age_on(r.get("birth_date"), season),
            "college": r.get("college"),
            "status": r.get("status"),
            "yearsExp": int(r["years_exp"]) if r.get("years_exp") is not None else None,
            "headshot": r.get("headshot_url"),
        })
    for players in out.values():
        players.sort(key=lambda p: (p["position"] or "ZZ", p["name"] or ""))
    return out


def build_depth_charts(season: int) -> dict[str, dict[str, list[dict]]]:
    """
    Position -> ordered players, per team.

    nflverse changed this schema in 2025: seasons through 2024 are weekly
    snapshots (club_code/depth_team/position), 2025 onward are dated
    snapshots (team/pos_abb/pos_rank). Both are normalised to the same shape,
    taking the most recent snapshot of the season.
    """
    try:
        dc = nfl.load_depth_charts(seasons=[season])
    except Exception as exc:  # dataset is occasionally unavailable
        print(f"    ! depth charts unavailable for {season}: {exc}")
        return {}

    if dc.is_empty():
        return {}

    if "depth_team" in dc.columns:  # legacy weekly schema (<= 2024)
        # Use the final regular-season week. Later weeks exist but only cover
        # the teams still playing, which would leave most teams without a chart.
        reg = dc.filter((pl.col("game_type") == "REG") & pl.col("week").is_not_null())
        latest = reg["week"].max()
        snap = reg.filter(pl.col("week") == latest)
        rows = [
            {
                "team": fix_abbr(r["club_code"]),
                "position": r["position"],
                "rank": r["depth_team"],
                "name": " ".join(
                    x for x in (r.get("football_name") or r.get("first_name"), r.get("last_name")) if x
                ),
                "id": r.get("gsis_id"),
                "number": r.get("jersey_number"),
            }
            for r in snap.iter_rows(named=True)
        ]
    else:  # dated schema (>= 2025)
        latest = dc["dt"].max()
        snap = dc.filter(pl.col("dt") == latest)
        rows = [
            {
                "team": fix_abbr(r["team"]),
                "position": r.get("pos_abb") or r.get("pos_name"),
                "rank": r.get("pos_rank"),
                "name": r.get("player_name"),
                "id": r.get("gsis_id"),
                "number": None,
            }
            for r in snap.iter_rows(named=True)
        ]

    out: dict[str, dict[str, list[dict]]] = {}
    seen: set[tuple] = set()
    for r in rows:
        team, pos = r["team"], r["position"]
        if not team or not pos or not r["name"]:
            continue
        key = (team, pos, r["name"])
        if key in seen:
            continue
        seen.add(key)
        out.setdefault(team, {}).setdefault(pos, []).append({
            "id": r["id"] or f"{team}-{r['name']}",
            "name": r["name"],
            "position": pos,
            "number": int(r["number"]) if str(r["number"] or "").isdigit() else None,
            "rank": int(r["rank"]) if r["rank"] is not None else 99,
        })

    for positions in out.values():
        for players in positions.values():
            players.sort(key=lambda p: p["rank"])
    return out


def build_draft(season: int) -> dict[str, list[dict]]:
    try:
        picks = nfl.load_draft_picks(seasons=[season])
    except Exception as exc:
        print(f"    ! draft picks unavailable for {season}: {exc}")
        return {}

    out: dict[str, list[dict]] = {}
    for r in picks.iter_rows(named=True):
        team = fix_abbr(r.get("team"))
        if not team:
            continue
        out.setdefault(team, []).append({
            "round": int(r["round"]) if r.get("round") is not None else None,
            "pick": int(r["pick"]) if r.get("pick") is not None else None,
            "player": r.get("pfr_player_name"),
            "position": r.get("position"),
            "college": r.get("college"),
        })
    for pl_ in out.values():
        pl_.sort(key=lambda p: (p["round"] or 99, p["pick"] or 999))
    return out


# --------------------------------------------------------------------------
# games + replay plays
# --------------------------------------------------------------------------

# nflverse keeps historical abbreviations in some datasets; the schedule uses
# the modern ones, so everything is normalised to the schedule's vocabulary.
ABBR_FIXES = {
    # relocations
    "OAK": "LV", "SD": "LAC", "SDG": "LAC", "STL": "LA", "LAR": "LA",
    # Pro-Football-Reference codes, used by the draft dataset
    "GNB": "GB", "KAN": "KC", "LVR": "LV", "NWE": "NE",
    "NOR": "NO", "SFO": "SF", "TAM": "TB",
}


def fix_abbr(abbr: str | None) -> str | None:
    return ABBR_FIXES.get(abbr, abbr) if abbr else abbr


def build_plays(game_pbp: pl.DataFrame) -> list[dict]:
    """Trim one game's play-by-play down to just what the replay animates."""
    rows = (
        game_pbp.filter(
            pl.col("home_wp").is_not_null()
            & pl.col("play_type").is_in(list(REPLAY_PLAY_TYPES))
            # Timeouts are logged as no_play rows and often carry a stale score
            # (frequently 0-0), which would make the replay's scoreboard jump.
            # They aren't snaps, so they have no place in the replay either.
            & (pl.col("timeout").fill_null(0) != 1)
        )
        # play_id is NOT reliably chronological: penalty and replay rows can
        # carry a later id than the snap they belong to, which would make the
        # replay's score jump backwards. The game clock is the real ordering.
        .sort(
            ["qtr", "game_seconds_remaining", "play_id"],
            descending=[False, True, False],
        )
        .iter_rows(named=True)
    )

    plays: list[dict] = []
    prev_wp: float | None = None
    max_home = max_away = 0
    for r in rows:
        wp = float(r["home_wp"])
        swing = abs(wp - prev_wp) if prev_wp is not None else 0.0
        is_key = (
            swing >= KEY_PLAY_WP_SWING
            or bool(r.get("touchdown"))
            or bool(r.get("interception"))
            or bool(r.get("fumble_lost"))
        )
        # Football scores only ever go up; a running max repairs any remaining
        # row whose score field lags the play it belongs to.
        max_home = max(max_home, int(r["total_home_score"] or 0))
        max_away = max(max_away, int(r["total_away_score"] or 0))
        desc = (r.get("desc") or "").strip()
        plays.append({
            "playId": int(r["play_id"]),
            "quarter": int(r["qtr"]) if r["qtr"] is not None else 0,
            "clockSeconds": int(r["quarter_seconds_remaining"] or 0),
            "gameSecondsRemaining": int(r["game_seconds_remaining"] or 0),
            "homeWinProb": round(wp, 3),
            "scoreHome": max_home,
            "scoreAway": max_away,
            "down": int(r["down"]) if r.get("down") is not None else None,
            "distance": int(r["ydstogo"]) if r.get("ydstogo") is not None else None,
            "posteam": fix_abbr(r.get("posteam")),
            "playType": r.get("play_type"),
            "description": desc[:140],
            "epa": round(float(r["epa"]), 2) if r.get("epa") is not None else None,
            "isKeyPlay": is_key,
        })
        prev_wp = wp

    return plays


def game_summary(row: dict) -> dict:
    return {
        "gameId": row["game_id"],
        "season": int(row["season"]),
        "week": int(row["week"]),
        "gameType": row.get("game_type"),
        "home": row["home_team"],
        "away": row["away_team"],
        "homeScore": clean(row["home_score"]),
        "awayScore": clean(row["away_score"]),
        "date": clean(row.get("gameday")),
    }


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

def main() -> None:
    ap = argparse.ArgumentParser(description="Build NFL Season Hub static JSON.")
    ap.add_argument("--seasons", type=int, nargs="+", default=SEASONS)
    ap.add_argument("--out", type=Path, default=Path("public/data"))
    ap.add_argument("--clean", action="store_true", help="wipe the output dir first")
    args = ap.parse_args()

    seasons = sorted(args.seasons)
    out: Path = args.out
    if args.clean and out.exists():
        shutil.rmtree(out)

    print(f"Building seasons {seasons[0]}-{seasons[-1]} -> {out}")

    # Schedules cover one extra prior season so every season has a prior record.
    span = list(range(seasons[0] - 1, seasons[-1] + 1))
    schedules = nfl.load_schedules(seasons=span)
    live_abbrs = {
        fix_abbr(a)
        for a in set(schedules["home_team"].to_list()) | set(schedules["away_team"].to_list())
        if a
    }
    team_meta = build_team_meta(live_abbrs)
    records = build_season_records(schedules)
    print(f"  {len(team_meta)} teams, {len(schedules)} scheduled games")

    total_bytes = 0
    games_written = 0
    season_meta = []

    for season in seasons:
        print(f"\n[{season}]")
        sched = schedules.filter(
            (pl.col("season") == season) & pl.col("home_score").is_not_null()
        )
        summaries = [game_summary(r) for r in sched.iter_rows(named=True)]
        rec = records.get(season, {})
        prior = records.get(season - 1, {})

        pbp = nfl.load_pbp(seasons=[season])
        print(f"  pbp: {len(pbp):,} rows, {pbp['game_id'].n_unique()} games")
        stat_lines = build_stat_lines(pbp, rec)
        rosters = build_rosters(season)
        depth = build_depth_charts(season)
        draft = build_draft(season)

        # ---- per-game replay files ----
        by_game = dict(pbp.partition_by("game_id", as_dict=True, include_key=True))
        for summary in summaries:
            gid = summary["gameId"]
            key = (gid,)
            frame = by_game.get(key)
            if frame is None or frame.is_empty():
                continue
            plays = build_plays(frame)
            if not plays:
                continue
            home, away = summary["home"], summary["away"]
            game = {
                **summary,
                "home": {
                    **team_meta[home],
                    "finalScore": summary["homeScore"],
                },
                "away": {
                    **team_meta[away],
                    "finalScore": summary["awayScore"],
                },
                "plays": plays,
                "keyPlayCount": sum(1 for p in plays if p["isKeyPlay"]),
            }
            total_bytes += write_json(out / "game" / f"{gid}.json", game)
            games_written += 1

        # ---- teams index ----
        index = []
        for team_id, meta in sorted(team_meta.items()):
            r = rec.get(team_id)
            if not r:
                continue
            p = prior.get(team_id)
            index.append({
                **meta,
                "season": season,
                "record": {"wins": r["wins"], "losses": r["losses"], "ties": r["ties"]},
                "priorSeason": (
                    {"wins": p["wins"], "losses": p["losses"], "ties": p["ties"]} if p else None
                ),
                "projectedWins": clean(r["expectedWins"]),
                "pointsFor": r["pointsFor"],
                "pointsAgainst": r["pointsAgainst"],
                "pointDiff": r["pointsFor"] - r["pointsAgainst"],
                "gamesPlayed": r["gamesPlayed"],
            })
        total_bytes += write_json(out / str(season) / "teams-index.json", index)

        # ---- games index ----
        total_bytes += write_json(out / str(season) / "games-index.json", summaries)

        # ---- per-team files ----
        for entry in index:
            team_id = entry["id"]
            team_games = [
                s for s in summaries if s["home"] == team_id or s["away"] == team_id
            ]
            team_games.sort(key=lambda s: (s["week"], s["date"] or ""))
            total_bytes += write_json(
                out / str(season) / "team" / f"{team_id}.json",
                {
                    **entry,
                    "roster": rosters.get(team_id, []),
                    "depthChart": depth.get(team_id, {}),
                    "draftClass": draft.get(team_id, []),
                    "stats": stat_lines.get(team_id, {}),
                    "games": team_games,
                },
            )

        season_meta.append({
            "season": season,
            "teams": len(index),
            "games": len(summaries),
        })
        print(f"  wrote {len(index)} teams, {len(summaries)} games")

    write_json(out / "seasons.json", {
        "seasons": season_meta,
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "source": "nflverse (https://github.com/nflverse), CC BY 4.0",
        "projectedWins": (
            "Market-implied expected wins: each game's closing spread converted to a "
            f"win probability via the normal CDF (sigma={MARGIN_SIGMA}), summed over the season."
        ),
    })

    print(
        f"\nDone. {games_written} game files, "
        f"{total_bytes / 1_048_576:.1f} MB total in {out}"
    )


if __name__ == "__main__":
    main()
