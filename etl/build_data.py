"""
NFL Season Hub — ETL

Converts raw nflverse data into the small, typed static JSON the frontend reads.
Run once; the output is committed to public/data.

    python etl/build_data.py [--seasons 2020 ... 2025] [--out public/data] [--clean]
    python etl/build_data.py --refresh          # in-season update, see below

Output layout:
    public/data/teams-index.json        league dashboard (the covered season)
    public/data/games-index.json        every game, all seasons
    public/data/team/<TEAM_ID>.json     one per team, 32 total
    public/data/game/<GAME_ID>.json     one per game

The team layer covers the most recent season in range; `lastSeason` is the
regular-season record of the year before it. The game layer spans every season,
so all six seasons of replays are reachable from the game browser.

Refresh mode rebuilds only the newest season and merges it into the existing
index, leaving finished seasons untouched — a completed game never changes, so
re-deriving five seasons to pick up Sunday's results would be 1,700 rewritten
files for a handful of real ones.

It also decides, by a stated rule rather than by whoever ran it, which season
the team layer describes. See PROMOTE_MIN_PLAYED.

Data: nflverse (https://github.com/nflverse), CC BY 4.0.
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
from datetime import date, datetime, timezone
from pathlib import Path

import nflreadpy as nfl
import polars as pl

# The unattended decisions live next door, dependency-free, so they can be
# fault-injected without installing this file's dependencies.
from refresh_rules import (
    PROMOTE_MIN_PLAYED,
    build_meta,
    choose_display_season,
    load_existing_index,
    merge_index,
)

# --------------------------------------------------------------------------
# tunable constants — every threshold in the pipeline lives here
# --------------------------------------------------------------------------

SEASONS = [2020, 2021, 2022, 2023, 2024, 2025]
# Standard deviation of NFL game margins. Converting a closing point spread to
# a win probability with the normal CDF at this sigma is the conventional
# approximation, and it is what `projectedWins` is built from.
MARGIN_SIGMA = 13.86

# --- key-play rule -------------------------------------------------------
# A play is flagged isKeyPlay when ANY of these hold:
#   1. the home win probability moved at least KEY_PLAY_WP_SWING
#   2. the play scored a touchdown
#   3. the play was a turnover (interception or lost fumble)
#   4. the play was a made field goal
# Rule 1 catches drama the box score misses (a stop on 4th and goal); rules
# 2-4 guarantee every scoring play and giveaway is marked even when the game
# is already decided and the win-probability needle barely moves.
KEY_PLAY_WP_SWING = 0.10

# Play types that represent a real snap or kick. Everything else in the raw
# feed (end of quarter, two-minute warning, game end) is timeline noise.
REPLAY_PLAY_TYPES = {
    "pass", "run", "punt", "field_goal", "kickoff",
    "extra_point", "qb_kneel", "qb_spike", "no_play",
}

# Longest description kept, in characters. Full nflverse descriptions run to
# ~250 chars and are the single largest contributor to game file size.
MAX_DESCRIPTION = 140

# nflverse keeps historical and Pro-Football-Reference abbreviations in some
# datasets; the schedule uses the modern ones, so everything is normalised to
# the schedule's vocabulary.
ABBR_FIXES = {
    # relocations
    "OAK": "LV", "SD": "LAC", "SDG": "LAC", "STL": "LA", "LAR": "LA",
    # Pro-Football-Reference codes, used by the draft dataset
    "GNB": "GB", "KAN": "KC", "LVR": "LV", "NWE": "NE",
    "NOR": "NO", "SFO": "SF", "TAM": "TB",
}

# Keys that are optional in the TypeScript contract. They are omitted from the
# JSON entirely when unknown: `null` does not satisfy `number | undefined`
# under strict TypeScript, so an absent key is the only encoding that fits.
PLAYER_OPTIONAL = ("number", "age", "college", "status")
PLAY_OPTIONAL = ("down", "distance", "epa")


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def win_prob_from_spread(spread: float) -> float:
    """Closing spread (positive = home favored) -> P(home win)."""
    return norm_cdf(spread / MARGIN_SIGMA)


def num(value, digits: int = 4) -> float | None:
    """Coerce to a JSON-safe float. NaN and infinity become None."""
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    result = round(f, digits)
    return 0.0 if result == 0 else result  # collapse -0.0


def whole(value) -> int | None:
    """Coerce to a JSON-safe int, tolerating floats and numeric strings."""
    f = num(value)
    return None if f is None else int(f)


def text(value) -> str:
    return "" if value is None else str(value).strip()


def drop_absent(record: dict, optional: tuple[str, ...]) -> dict:
    """Remove optional keys whose value is None, so `?` properties typecheck."""
    for key in optional:
        if record.get(key) is None:
            record.pop(key, None)
    return record


def write_json(path: Path, payload) -> int:
    """Serialise strictly: allow_nan=False makes NaN/Infinity a hard error."""
    path.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    path.write_text(body, encoding="utf-8")
    return len(body.encode("utf-8"))


def age_on(birth_date, season: int) -> int | None:
    """Approximate age at the start of the given season (September 1)."""
    if birth_date is None:
        return None
    if isinstance(birth_date, str):
        try:
            birth_date = datetime.fromisoformat(birth_date[:10]).date()
        except ValueError:
            return None
    if not isinstance(birth_date, (date, datetime)):
        return None
    if isinstance(birth_date, datetime):
        birth_date = birth_date.date()
    ref = date(season, 9, 1)
    years = ref.year - birth_date.year - ((ref.month, ref.day) < (birth_date.month, birth_date.day))
    return years if 15 < years < 60 else None


def fix_abbr(abbr):
    return ABBR_FIXES.get(abbr, abbr) if abbr else abbr


# --------------------------------------------------------------------------
# teams
# --------------------------------------------------------------------------

def build_team_meta(live_abbrs: set[str]) -> dict[str, dict]:
    """Static identity per team: name, conference, division, colors, logo."""
    teams = nfl.load_teams().filter(pl.col("team_abbr").is_in(sorted(live_abbrs)))
    meta: dict[str, dict] = {}
    for row in teams.iter_rows(named=True):
        meta[row["team_abbr"]] = {
            "id": row["team_abbr"],
            "name": text(row["team_name"]),
            "conference": text(row["team_conf"]),
            "division": text(row["team_division"]),
            "logo": text(row["team_logo_espn"]),
            "primaryColor": text(row["team_color"]),
            "secondaryColor": text(row["team_color2"]),
        }
    missing = live_abbrs - set(meta)
    if missing:
        raise SystemExit(f"No team metadata for: {sorted(missing)}")
    return meta


def build_season_records(schedules: pl.DataFrame) -> dict[int, dict[str, dict]]:
    """
    Per season, per team: regular-season W-L-T, points, and market-implied
    expected wins summed from each game's closing spread.

    Regular season only. A record and an expected-win total are both 17-game
    figures, so folding playoff games in would make them incomparable.
    """
    out: dict[int, dict[str, dict]] = {}
    played = schedules.filter(
        pl.col("home_score").is_not_null() & (pl.col("game_type") == "REG")
    )

    for row in played.iter_rows(named=True):
        season = int(row["season"])
        home, away = fix_abbr(row["home_team"]), fix_abbr(row["away_team"])
        hs, aws = int(row["home_score"]), int(row["away_score"])
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

        spread = num(row["spread_line"])
        if spread is not None:
            p_home = win_prob_from_spread(spread)
            bucket[home]["expectedWins"] += p_home
            bucket[away]["expectedWins"] += 1.0 - p_home

    return out


def build_stat_lines(pbp: pl.DataFrame, records: dict[str, dict]) -> dict[str, dict]:
    """Offense and defense stat lines for one season, from play-by-play."""
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
        return {fix_abbr(r[team_col]): r for r in agg.iter_rows(named=True)}

    offense, defense = side("posteam"), side("defteam")

    def line(agg: dict | None, points: int, games: int) -> dict:
        return {
            "epaPerPlay": num(agg["epa_per_play"]) if agg else 0.0,
            "pointsPerGame": num(points / games),
            "yardsPerGame": num(agg["yards"] / games) if agg else 0.0,
            "successRate": num(agg["success_rate"]) if agg else 0.0,
            "explosiveRate": num(agg["explosive_rate"]) if agg else 0.0,
            "plays": int(agg["plays"]) if agg else 0,
        }

    lines: dict[str, dict] = {}
    for team, rec in records.items():
        games = max(rec["gamesPlayed"], 1)
        lines[team] = {
            "offense": line(offense.get(team), rec["pointsFor"], games),
            "defense": line(defense.get(team), rec["pointsAgainst"], games),
        }
    return lines


# --------------------------------------------------------------------------
# rosters, depth charts, draft
# --------------------------------------------------------------------------

def build_rosters(season: int) -> tuple[dict[str, list[dict]], dict[str, dict], pl.DataFrame]:
    """
    Returns (players by team, players by nflverse id, the raw roster frame).

    The id index lets the depth chart reuse full Player objects instead of
    re-deriving a thinner copy of the same person. The frame goes to the player
    builder, which needs the columns a roster row does not carry — headshot,
    height, weight, draft position — without downloading the rosters twice.
    """
    rosters = nfl.load_rosters(seasons=[season])
    by_team: dict[str, list[dict]] = {}
    by_id: dict[str, dict] = {}

    for r in rosters.iter_rows(named=True):
        team = fix_abbr(r.get("team"))
        name = text(r.get("full_name"))
        if not team or not name:
            continue
        gsis = text(r.get("gsis_id"))
        player = drop_absent({
            "id": gsis or f"{team}-{name}",
            "name": name,
            "position": text(r.get("position")),
            "number": whole(r.get("jersey_number")),
            "age": age_on(r.get("birth_date"), season),
            "college": text(r.get("college")) or None,
            "status": text(r.get("status")) or None,
        }, PLAYER_OPTIONAL)
        by_team.setdefault(team, []).append(player)
        if gsis:
            by_id[gsis] = player

    for players in by_team.values():
        players.sort(key=lambda p: (p["position"] or "ZZ", p["name"]))
    return by_team, by_id, rosters


def build_depth_charts(season: int, by_id: dict[str, dict]) -> dict[str, dict[str, list[dict]]]:
    """
    Team -> position -> Player[] in depth order (index 0 is the starter).

    nflverse changed this schema in 2025: seasons through 2024 are weekly
    snapshots (club_code/depth_team/week), 2025 onward are dated snapshots
    (team/pos_abb/pos_rank). Both normalise to the same shape.
    """
    try:
        dc = nfl.load_depth_charts(seasons=[season])
    except Exception as exc:
        print(f"    ! depth charts unavailable for {season}: {exc}")
        return {}
    if dc.is_empty():
        return {}

    if "depth_team" in dc.columns:  # legacy weekly schema (<= 2024)
        # The LAST REGULAR-SEASON week. Later weeks exist but only cover teams
        # still in the playoffs, which would leave most teams with no chart.
        reg = dc.filter((pl.col("game_type") == "REG") & pl.col("week").is_not_null())
        snap = reg.filter(pl.col("week") == reg["week"].max())
        rows = [
            {
                "team": fix_abbr(r["club_code"]),
                "position": text(r["position"]),
                "rank": whole(r["depth_team"]),
                # football_name is the FIRST name, not the full name.
                "name": " ".join(x for x in (
                    text(r.get("football_name")) or text(r.get("first_name")),
                    text(r.get("last_name")),
                ) if x),
                "gsis": text(r.get("gsis_id")),
                "number": whole(r.get("jersey_number")),
            }
            for r in snap.iter_rows(named=True)
        ]
    else:  # dated schema (>= 2025)
        snap = dc.filter(pl.col("dt") == dc["dt"].max())
        rows = [
            {
                "team": fix_abbr(r["team"]),
                "position": text(r.get("pos_abb")) or text(r.get("pos_name")),
                "rank": whole(r.get("pos_rank")),
                "name": text(r.get("player_name")),
                "gsis": text(r.get("gsis_id")),
                "number": None,
            }
            for r in snap.iter_rows(named=True)
        ]

    out: dict[str, dict[str, list[dict]]] = {}
    seen: set[tuple[str, str, str]] = set()
    for r in rows:
        team, pos, name = r["team"], r["position"], r["name"]
        if not team or not pos or not name:
            continue
        key = (team, pos, name)
        if key in seen:
            continue
        seen.add(key)

        # Prefer the full roster entry so the depth chart carries age/college.
        player = by_id.get(r["gsis"])
        if player is None:
            player = drop_absent({
                "id": r["gsis"] or f"{team}-{name}",
                "name": name,
                "position": pos,
                "number": r["number"],
            }, PLAYER_OPTIONAL)
        out.setdefault(team, {}).setdefault(pos, []).append(
            (player, r["rank"] if r["rank"] is not None else 99)
        )

    # Sort by depth rank, then drop the rank — array order encodes it.
    return {
        team: {
            pos: [p for p, _ in sorted(entries, key=lambda e: e[1])]
            for pos, entries in positions.items()
        }
        for team, positions in out.items()
    }


def build_draft(season: int) -> dict[str, list[dict]]:
    """Team -> that season's draft class, in pick order."""
    try:
        picks = nfl.load_draft_picks(seasons=[season])
    except Exception as exc:
        print(f"    ! draft picks unavailable for {season}: {exc}")
        return {}

    out: dict[str, list[dict]] = {}
    for r in picks.iter_rows(named=True):
        team = fix_abbr(r.get("team"))
        rnd, pick = whole(r.get("round")), whole(r.get("pick"))
        player = text(r.get("pfr_player_name"))
        if not team or rnd is None or pick is None or not player:
            continue
        out.setdefault(team, []).append({
            "round": rnd,
            "pick": pick,
            "player": player,
            # Required by the contract; a handful of picks have no listed
            # position or college, which become "" rather than a missing key.
            "position": text(r.get("position")),
            "college": text(r.get("college")),
        })
    for picks_ in out.values():
        picks_.sort(key=lambda p: (p["round"], p["pick"]))
    return out


# --------------------------------------------------------------------------
# games and replay plays
# --------------------------------------------------------------------------

def build_plays(game_pbp: pl.DataFrame) -> list[dict]:
    """Trim one game's play-by-play to exactly the GamePlay contract."""
    rows = (
        game_pbp.filter(
            pl.col("home_wp").is_not_null()
            & pl.col("play_type").is_in(sorted(REPLAY_PLAY_TYPES))
            # Timeouts are logged as no_play rows and often carry a stale score
            # (frequently 0-0), which would make the scoreboard jump. They are
            # not snaps, so they have no place in a replay either.
            & (pl.col("timeout").fill_null(0) != 1)
        )
        # play_id is NOT reliably chronological: penalty and replay-review rows
        # can carry a later id than the snap they belong to. The game clock is
        # the real ordering.
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
        wp = num(r["home_wp"], 3)
        if wp is None:
            continue
        wp = min(max(wp, 0.0), 1.0)  # guarantee the 0..1 contract
        swing = abs(wp - prev_wp) if prev_wp is not None else 0.0

        # Football scores only ever increase; a running max repairs any row
        # whose score field lags the play it belongs to.
        max_home = max(max_home, whole(r["total_home_score"]) or 0)
        max_away = max(max_away, whole(r["total_away_score"]) or 0)

        down = whole(r.get("down"))
        is_key = (
            swing >= KEY_PLAY_WP_SWING
            or bool(r.get("touchdown"))
            or bool(r.get("interception"))
            or bool(r.get("fumble_lost"))
            or bool(r.get("field_goal_result") == "made")
        )

        plays.append(drop_absent({
            "playId": whole(r["play_id"]) or 0,
            "quarter": whole(r["qtr"]) or 0,
            "clockSeconds": whole(r["quarter_seconds_remaining"]) or 0,
            "homeWinProb": wp,
            "scoreHome": max_home,
            "scoreAway": max_away,
            "down": down,
            # Yards to go is only meaningful when there IS a down. Kickoffs and
            # extra points carry ydstogo=0, which would otherwise emit a
            # meaningless `distance: 0` with no accompanying `down`.
            "distance": whole(r.get("ydstogo")) if down is not None else None,
            "posteam": text(fix_abbr(r.get("posteam"))),
            "playType": text(r.get("play_type")),
            "description": text(r.get("desc"))[:MAX_DESCRIPTION],
            "epa": num(r.get("epa"), 2),
            "isKeyPlay": is_key,
        }, PLAY_OPTIONAL))
        prev_wp = wp

    return plays


# Per-player statistics, mapped from nflverse's 150 columns to the handful a
# reader actually looks for. Order matters: it is the order the UI renders.
#
# Absent means absent, as everywhere else in this contract — a zero is dropped
# rather than emitted, so a quarterback's file carries no tackle counts and a
# lineman's carries nothing at all, which is why linemen get no page.
PLAYER_STATS = {
    "completions": "completions",
    "attempts": "attempts",
    "passingYards": "passing_yards",
    "passingTds": "passing_tds",
    "interceptions": "passing_interceptions",
    "passingEpa": "passing_epa",
    "carries": "carries",
    "rushingYards": "rushing_yards",
    "rushingTds": "rushing_tds",
    "rushingEpa": "rushing_epa",
    "targets": "targets",
    "receptions": "receptions",
    "receivingYards": "receiving_yards",
    "receivingTds": "receiving_tds",
    "receivingEpa": "receiving_epa",
    "tackles": "def_tackles_solo",
    "sacks": "def_sacks",
    "defInterceptions": "def_interceptions",
    "forcedFumbles": "def_fumbles_forced",
    "passesDefended": "def_pass_defended",
    "fgMade": "fg_made",
    "fgAtt": "fg_att",
    "fgLong": "fg_long",
    "patMade": "pat_made",
    "patAtt": "pat_att",
}


def stat_line(row: dict, columns: set[str]) -> dict:
    """One player's numbers, with the zeros left out."""
    out: dict[str, float | int] = {}
    for key, column in PLAYER_STATS.items():
        if column not in columns:
            continue
        value = row.get(column)
        if value is None:
            continue
        value = round(float(value), 2) if isinstance(value, float) else int(value)
        if value:
            out[key] = value
    return out


def sum_lines(rows: list[dict], columns: set[str]) -> dict:
    """Season totals. EPA sums like everything else — it is an additive metric."""
    totals: dict[str, float] = {}
    for row in rows:
        for key, value in stat_line(row, columns).items():
            totals[key] = totals.get(key, 0) + value
    # fg_long is a maximum, not a total; summing it would invent a 300-yard kick.
    longs = [r.get("fg_long") for r in rows if r.get("fg_long")]
    if longs:
        totals["fgLong"] = max(int(v) for v in longs)
    return {k: (round(v, 2) if isinstance(v, float) else v) for k, v in totals.items() if v}


def build_players(
    seasons: list[int],
    display: int,
    roster_rows: pl.DataFrame,
    out: Path,
) -> tuple[int, int, set[str]]:
    """
    One file per player who has actually done something measurable.

    A page for a player with no recorded production would be their roster row
    with a photograph on it, which is not worth a route. Of 3,135 players on a
    2025 roster, 1,115 have no stat row in any season — 289 of them offensive
    linemen, whose contribution this dataset simply does not measure. They get
    no page and the roster does not link them.
    """
    stats = nfl.load_player_stats(seasons=seasons).filter(pl.col("season_type") == "REG")
    columns = set(stats.columns)
    by_player = dict(stats.partition_by("player_id", as_dict=True, include_key=True))

    written = 0
    total_bytes = 0
    profiled: set[str] = set()

    for row in roster_rows.iter_rows(named=True):
        pid = row.get("gsis_id")
        if not pid:
            continue
        frame = by_player.get((pid,))
        if frame is None or frame.is_empty():
            continue

        rows = list(frame.iter_rows(named=True))
        by_season: dict[int, list[dict]] = {}
        for r in rows:
            by_season.setdefault(int(r["season"]), []).append(r)

        history = []
        for season in sorted(by_season):
            line = sum_lines(by_season[season], columns)
            if not line:
                continue
            history.append({
                "season": season,
                "team": fix_abbr(by_season[season][-1]["team"]),
                "games": len(by_season[season]),
                "stats": line,
            })
        if not history:
            continue

        weeks = []
        for r in sorted(by_season.get(display, []), key=lambda x: x["week"]):
            line = stat_line(r, columns)
            if not line:
                continue
            week = {
                "season": int(r["season"]),
                "week": int(r["week"]),
                "opponent": fix_abbr(r.get("opponent_team")) or "",
                "stats": line,
            }
            if r.get("game_id"):
                week["gameId"] = text(r["game_id"])
            weeks.append(week)

        player = {
            "id": pid,
            "name": text(row.get("full_name")),
            "position": text(row.get("position")),
            "team": fix_abbr(row.get("team")),
            "seasons": history,
            "weeks": weeks,
        }
        optional = {
            "headshot": text(row.get("headshot_url")) or None,
            "number": whole(row.get("jersey_number")),
            "age": age_on(row.get("birth_date"), display),
            "college": text(row.get("college")) or None,
            "height": whole(row.get("height")),
            "weight": whole(row.get("weight")),
            "experience": whole(row.get("years_exp")),
        }
        player.update({k: v for k, v in optional.items() if v is not None})

        draft_year = whole(row.get("entry_year"))
        draft_pick = whole(row.get("draft_number"))
        if draft_year or draft_pick:
            draft = {"year": draft_year, "pick": draft_pick, "club": fix_abbr(row.get("draft_club"))}
            player["draft"] = {k: v for k, v in draft.items() if v}

        total_bytes += write_json(out / "player" / f"{pid}.json", player)
        profiled.add(pid)
        written += 1

    return written, total_bytes, profiled


def season_states(schedules: pl.DataFrame, seasons: list[int]) -> list[dict]:
    """
    Per season: how many games are on the schedule, and how many have a result.

    This is what lets the frontend say "2026, 2 of 272 games played" instead of
    presenting a two-game sample as a season.
    """
    states = []
    for season in seasons:
        rows = schedules.filter(pl.col("season") == season)
        scheduled = len(rows)
        played = len(rows.filter(pl.col("home_score").is_not_null()))
        states.append({
            "season": season,
            "scheduled": scheduled,
            "played": played,
            "complete": scheduled > 0 and played == scheduled,
        })
    return states


def game_summary(row: dict) -> dict:
    """One GameSummary from a schedule row."""
    return {
        "gameId": text(row["game_id"]),
        "season": int(row["season"]),
        "week": int(row["week"]),
        "home": fix_abbr(row["home_team"]),
        "away": fix_abbr(row["away_team"]),
        "homeScore": whole(row["home_score"]) or 0,
        "awayScore": whole(row["away_score"]) or 0,
        "date": text(row.get("gameday"))[:10],
        "gameType": text(row.get("game_type")),
    }


def game_team(meta: dict, final_score: int) -> dict:
    """The compact team block embedded in a Game file."""
    return {
        "id": meta["id"],
        "name": meta["name"],
        "logo": meta["logo"],
        "color": meta["primaryColor"],
        "finalScore": final_score,
    }


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

def main() -> None:
    ap = argparse.ArgumentParser(description="Build NFL Season Hub static JSON.")
    ap.add_argument("--seasons", type=int, nargs="+", default=SEASONS)
    ap.add_argument("--out", type=Path, default=Path("public/data"))
    ap.add_argument("--clean", action="store_true", help="wipe the output dir first")
    ap.add_argument(
        "--refresh",
        action="store_true",
        help="in-season update: rebuild only the newest season, merge it into the existing index",
    )
    ap.add_argument(
        "--display-season",
        type=int,
        help="force the season the team layer describes, overriding the promotion rule",
    )
    args = ap.parse_args()

    out: Path = args.out

    if args.clean and out.exists():
        shutil.rmtree(out)

    # The whole span the site covers, plus anything nflverse has started
    # publishing since the last full build.
    known = sorted(set(args.seasons))
    # Every season at once — the schedule file is 7,500 rows, and asking for a
    # range that runs past what nflverse publishes is an error rather than an
    # empty frame. Filtering afterwards is how a new season is discovered.
    all_schedules = nfl.load_schedules().filter(pl.col("season") >= known[0] - 1)
    available = sorted({int(s) for s in all_schedules["season"].to_list() if s >= known[0]})
    states = season_states(all_schedules, available)
    display = args.display_season or choose_display_season(states)

    if args.refresh:
        seasons = [max(available)]
        existing = load_existing_index(out)
        print(f"Refresh: rebuilding {seasons[0]} only, merging into {len(existing)} indexed games")
    else:
        seasons = available
        existing = []
        print(f"Full build: seasons {seasons[0]}-{seasons[-1]}")

    for state in states:
        mark = "complete" if state["complete"] else "IN PROGRESS"
        star = "  <- team layer" if state["season"] == display else ""
        print(f"  {state['season']}: {state['played']}/{state['scheduled']} played, {mark}{star}")

    current = display
    schedules = all_schedules
    # A career spans the whole dataset even when only one season is rebuilt.
    seasons_for_players = [s for s in available if s <= display]
    live = {
        fix_abbr(a)
        for a in set(schedules["home_team"].to_list()) | set(schedules["away_team"].to_list())
        if a
    }
    team_meta = build_team_meta(live)
    records = build_season_records(schedules)
    print(f"  {len(team_meta)} teams")

    total_bytes = 0
    games_index: list[dict] = []
    game_sizes: list[int] = []
    rebuilt_seasons = set(seasons)

    # ---- game layer: every season ----
    for season in seasons:
        sched = schedules.filter(
            (pl.col("season") == season) & pl.col("home_score").is_not_null()
        )
        summaries = [game_summary(r) for r in sched.iter_rows(named=True)]

        pbp = nfl.load_pbp(seasons=[season])
        by_game = dict(pbp.partition_by("game_id", as_dict=True, include_key=True))

        written = 0
        for s in summaries:
            frame = by_game.get((s["gameId"],))
            if frame is None or frame.is_empty():
                continue
            plays = build_plays(frame)
            if not plays:
                continue
            size = write_json(out / "game" / f"{s['gameId']}.json", {
                "gameId": s["gameId"],
                "season": s["season"],
                "week": s["week"],
                "date": s["date"],
                "gameType": s["gameType"],
                "home": game_team(team_meta[s["home"]], s["homeScore"]),
                "away": game_team(team_meta[s["away"]], s["awayScore"]),
                "plays": plays,
            })
            total_bytes += size
            game_sizes.append(size)
            games_index.append(s)
            written += 1

        print(f"  [{season}] {len(pbp):,} pbp rows -> {written} game files")

    # A refresh rebuilt one season; the rest of the index has to survive it.
    # Rebuilding the index from just the rebuilt season is the single most
    # destructive thing this script could do, so it is not possible to express.
    games_index = merge_index(existing, games_index, rebuilt_seasons)
    total_bytes += write_json(out / "games-index.json", games_index)

    # ---- team layer: the current season only ----
    print(f"\n  team layer [{current}]")
    pbp_now = nfl.load_pbp(seasons=[current])
    rec_now = records.get(current, {})
    stat_lines = build_stat_lines(pbp_now, rec_now)
    rosters, by_id, roster_rows = build_rosters(current)
    depth = build_depth_charts(current, by_id)
    draft = build_draft(current)
    prior = records.get(current - 1, {})

    teams_index: list[dict] = []
    for team_id in sorted(team_meta):
        rec = rec_now.get(team_id)
        if not rec:
            continue
        p = prior.get(team_id, {"wins": 0, "losses": 0, "ties": 0})
        teams_index.append({
            **team_meta[team_id],
            "lastSeason": {"wins": p["wins"], "losses": p["losses"], "ties": p["ties"]},
            "projectedWins": num(rec["expectedWins"], 2),
        })

    # ---- player layer ----
    player_count, player_bytes, profiled = build_players(seasons_for_players, current, roster_rows, out)
    total_bytes += player_bytes
    print(f"  {player_count} player files ({len(roster_rows.unique(subset=['gsis_id']))} rostered)")

    # A roster row says whether there is a page behind the name, so the UI can
    # link the ones that lead somewhere and leave the rest as plain text.
    for player in by_id.values():
        if player["id"] in profiled:
            player["hasProfile"] = True

    if len(teams_index) < len(team_meta):
        missing = sorted(set(team_meta) - {s["id"] for s in teams_index})
        raise SystemExit(
            f"Only {len(teams_index)} of {len(team_meta)} teams have a {current} record "
            f"({', '.join(missing[:6])}{'...' if len(missing) > 6 else ''}). "
            "Refusing to publish a dashboard missing teams; the promotion rule should "
            "have kept the team layer on an earlier season."
        )

    total_bytes += write_json(out / "teams-index.json", teams_index)

    for summary in teams_index:
        team_id = summary["id"]
        # Every season, not just the one the stat lines describe. The site
        # ships six seasons of replays and the team page is the way in; when
        # this carried one season, 1,409 of 1,694 replays had no route to them
        # at all. Ordered oldest first so the page can group by season without
        # sorting again. Costs about 2 KB gzipped per team file.
        team_games = sorted(
            (s for s in games_index if s["home"] == team_id or s["away"] == team_id),
            key=lambda s: (s["season"], s["week"], s["date"]),
        )
        total_bytes += write_json(out / "team" / f"{team_id}.json", {
            **summary,
            "roster": rosters.get(team_id, []),
            "depthChart": depth.get(team_id, {}),
            "draftClass": draft.get(team_id, []),
            "stats": stat_lines.get(team_id, {}),
            "games": team_games,
        })

    total_bytes += write_json(out / "meta.json", build_meta(states, display))

    avg = sum(game_sizes) / len(game_sizes) / 1024 if game_sizes else 0
    print(
        f"\nDone. {len(teams_index)} teams, {len(games_index)} games, "
        f"{total_bytes / 1_048_576:.1f} MB total, avg game file {avg:.1f} KB"
    )


if __name__ == "__main__":
    main()
