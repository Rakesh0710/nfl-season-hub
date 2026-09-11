"""
Validate the generated JSON against the contract in src/types/nfl.ts.

Checks, per the Stage 1 requirements:
  1.  exactly 32 teams exist
  2.  every required field is present, with the right runtime type
  3.  no duplicate team ids
  4.  game ids are well-formed and unique
  5.  homeWinProb is a real number in 0..1
  6.  plays are chronologically ordered
  7.  every team game reference resolves to a generated game file
  8.  output re-serialises cleanly (no NaN, Infinity or non-JSON objects)
  9.  the data agrees with the TypeScript contract, including the rule that
      optional (`?`) properties are omitted rather than emitted as null

Exits non-zero on any violation.

    python etl/validate.py [--data public/data]
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from datetime import datetime
from pathlib import Path

GAME_ID = re.compile(r"^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$")
HEX_COLOR = re.compile(r"^#[0-9A-Fa-f]{6}$")
CONFERENCES = {"AFC", "NFC"}
GAME_TYPES = {"REG", "WC", "DIV", "CON", "SB"}

# name -> (type, required). Mirrors src/types/nfl.ts.
TEAM_SUMMARY = {
    "id": (str, True), "name": (str, True), "conference": (str, True),
    "division": (str, True), "logo": (str, True), "primaryColor": (str, True),
    "secondaryColor": (str, True), "lastSeason": (dict, True),
    "projectedWins": (float, True),
}
TEAM = TEAM_SUMMARY | {
    "roster": (list, True), "depthChart": (dict, True), "draftClass": (list, True),
    "stats": (dict, True), "games": (list, True),
}
PLAYER = {
    "id": (str, True), "name": (str, True), "position": (str, True),
    "number": (int, False), "age": (int, False),
    "college": (str, False), "status": (str, False),
}
DRAFT_PICK = {
    "round": (int, True), "pick": (int, True), "player": (str, True),
    "position": (str, True), "college": (str, True),
}
STAT_LINE = {
    "epaPerPlay": (float, True), "pointsPerGame": (float, True),
    "yardsPerGame": (float, True), "successRate": (float, True),
    "explosiveRate": (float, True), "plays": (int, True),
}
GAME_SUMMARY = {
    "gameId": (str, True), "season": (int, True), "week": (int, True),
    "home": (str, True), "away": (str, True), "homeScore": (int, True),
    "awayScore": (int, True), "date": (str, True), "gameType": (str, True),
}
GAME_TEAM = {
    "id": (str, True), "name": (str, True), "logo": (str, True),
    "color": (str, True), "finalScore": (int, True),
}
GAME = {
    "gameId": (str, True), "season": (int, True), "week": (int, True),
    "date": (str, True), "gameType": (str, True),
    "home": (dict, True), "away": (dict, True), "plays": (list, True),
}
PLAY = {
    "playId": (int, True), "quarter": (int, True), "clockSeconds": (int, True),
    "homeWinProb": (float, True), "scoreHome": (int, True), "scoreAway": (int, True),
    "down": (int, False), "distance": (int, False), "posteam": (str, True),
    "playType": (str, True), "description": (str, True), "epa": (float, False),
    "isKeyPlay": (bool, True),
}

errors: list[str] = []


def fail(msg: str) -> None:
    errors.append(msg)


def check_shape(where: str, obj, schema: dict[str, tuple[type, bool]]) -> None:
    """Exact key set and runtime types; optional keys must be absent, not null."""
    if not isinstance(obj, dict):
        fail(f"{where}: expected an object, got {type(obj).__name__}")
        return

    for key, (typ, required) in schema.items():
        if key not in obj:
            if required:
                fail(f"{where}: missing required field '{key}'")
            continue
        value = obj[key]
        if value is None:
            fail(f"{where}: '{key}' is null; optional fields must be omitted entirely")
            continue
        # bool is a subclass of int in Python; keep them distinct.
        if typ is float:
            ok = isinstance(value, (int, float)) and not isinstance(value, bool)
        elif typ is int:
            ok = isinstance(value, int) and not isinstance(value, bool)
        elif typ is bool:
            ok = isinstance(value, bool)
        else:
            ok = isinstance(value, typ)
        if not ok:
            fail(f"{where}: '{key}' is {type(value).__name__}, expected {typ.__name__}")
        elif typ is float and (math.isnan(value) or math.isinf(value)):
            fail(f"{where}: '{key}' is {value}, which is not valid JSON")

    for extra in set(obj) - set(schema):
        fail(f"{where}: unexpected field '{extra}' not in the contract")


def load(path: Path):
    """Load, and prove the file round-trips as strict JSON (check 8)."""
    if not path.exists():
        # A missing file is a contract failure like any other, and reporting it
        # alongside the rest beats a traceback that hides the other 40 problems.
        fail(f"{path}: missing")
        return {}
    raw = path.read_text(encoding="utf-8")
    for bad in ("NaN", "Infinity"):
        if re.search(rf"(?<![\"\w]){bad}(?![\"\w])", raw):
            fail(f"{path}: contains the literal {bad}, which is not valid JSON")
    data = json.loads(raw)
    json.dumps(data, allow_nan=False)  # raises if anything is unserialisable
    return data


def check_contract_drift(types_file: Path) -> None:
    """
    The schemas above are a hand-written mirror of src/types/nfl.ts. If the two
    drift apart, every other check here silently validates the wrong shape, so
    the agreement is itself verified.
    """
    if not types_file.exists():
        fail(f"{types_file}: not found; cannot verify the TypeScript contract")
        return
    ts = types_file.read_text(encoding="utf-8")

    def ts_fields(name: str):
        # The negative lookahead matters: "Game" would otherwise prefix-match
        # "GameSummary" and compare the wrong interface.
        m = re.search(
            rf"export interface {name}(?![A-Za-z0-9_])[^{{]*\{{(.*?)\n\}}", ts, re.S
        )
        if not m:
            return None
        found = {}
        for line in m.group(1).splitlines():
            line = re.sub(r"//.*", "", line).strip()
            f = re.match(r"(\w+)(\??):", line)
            if f:
                found[f.group(1)] = f.group(2) == ""
        return found

    for iface, schema in (
        ("TeamSummary", TEAM_SUMMARY), ("Player", PLAYER), ("DraftPick", DRAFT_PICK),
        ("TeamStatLine", STAT_LINE), ("GameSummary", GAME_SUMMARY),
        ("GamePlay", PLAY), ("GameTeam", GAME_TEAM), ("Game", GAME),
    ):
        declared = ts_fields(iface)
        if declared is None:
            fail(f"src/types/nfl.ts: interface {iface} not found")
            continue
        mine = {k: req for k, (_t, req) in schema.items()}
        for key in sorted(set(declared) | set(mine)):
            if key not in declared:
                fail(f"contract drift: validator has '{iface}.{key}', nfl.ts does not")
            elif key not in mine:
                fail(f"contract drift: nfl.ts has '{iface}.{key}', validator does not")
            elif declared[key] != mine[key]:
                fail(
                    f"contract drift: '{iface}.{key}' required={declared[key]} in nfl.ts "
                    f"but required={mine[key]} in the validator"
                )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, default=Path("public/data"))
    args = ap.parse_args()
    data: Path = args.data

    check_contract_drift(Path("src/types/nfl.ts"))

    # ---------- teams-index ----------
    teams_index = load(data / "teams-index.json")
    if not isinstance(teams_index, list):
        fail("teams-index.json: expected an array")
        teams_index = []

    # check 1: exactly 32 teams
    if len(teams_index) != 32:
        fail(f"teams-index.json: {len(teams_index)} teams, expected exactly 32")

    # check 3: no duplicate team ids
    ids = [t.get("id") for t in teams_index]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        fail(f"teams-index.json: duplicate team ids {sorted(dupes)}")

    for t in teams_index:
        where = f"teams-index[{t.get('id')}]"
        check_shape(where, t, TEAM_SUMMARY)
        if t.get("conference") not in CONFERENCES:
            fail(f"{where}: conference {t.get('conference')!r} not in {sorted(CONFERENCES)}")
        for key in ("primaryColor", "secondaryColor"):
            if not HEX_COLOR.match(str(t.get(key, ""))):
                fail(f"{where}: {key} {t.get(key)!r} is not a #rrggbb hex color")
        rec = t.get("lastSeason")
        if isinstance(rec, dict):
            check_shape(f"{where}.lastSeason", rec, {
                "wins": (int, True), "losses": (int, True), "ties": (int, True),
            })
        pw = t.get("projectedWins")
        if isinstance(pw, (int, float)) and not 0 <= pw <= 25:
            fail(f"{where}: projectedWins {pw} outside a plausible 0..25")

    # ---------- meta ----------
    # The freshness record. It is what lets the site say how old the data is
    # and which season is complete, so a wrong one is worse than none: it would
    # label an incomplete season as finished.
    meta = load(data / "meta.json")
    meta_seasons: dict[int, dict] = {}
    if not isinstance(meta, dict):
        fail("meta.json: expected an object")
    else:
        check_shape("meta", meta, {
            "generatedAt": (str, True), "source": (str, True),
            "displaySeason": (int, True), "latestSeason": (int, True),
            "seasons": (list, True),
        })
        try:
            datetime.fromisoformat(str(meta.get("generatedAt", "")).replace("Z", "+00:00"))
        except ValueError:
            fail(f"meta.generatedAt {meta.get('generatedAt')!r} is not an ISO 8601 timestamp")

        for s in meta.get("seasons", []):
            where = f"meta.seasons[{s.get('season')}]"
            check_shape(where, s, {
                "season": (int, True), "scheduled": (int, True),
                "played": (int, True), "complete": (bool, True),
            })
            if isinstance(s.get("season"), int):
                meta_seasons[s["season"]] = s
            played, scheduled = s.get("played"), s.get("scheduled")
            if isinstance(played, int) and isinstance(scheduled, int):
                if played > scheduled:
                    fail(f"{where}: {played} played of {scheduled} scheduled")
                if s.get("complete") is not (scheduled > 0 and played == scheduled):
                    fail(
                        f"{where}: complete={s.get('complete')} contradicts "
                        f"{played}/{scheduled} played"
                    )

        display = meta.get("displaySeason")
        if display not in meta_seasons:
            fail(f"meta.displaySeason {display!r} is not one of the seasons listed")
        if isinstance(meta.get("latestSeason"), int) and meta_seasons:
            if meta["latestSeason"] != max(meta_seasons):
                fail("meta.latestSeason is not the newest season listed")
            if isinstance(display, int) and display > meta["latestSeason"]:
                fail("meta.displaySeason is newer than meta.latestSeason")

    # ---------- games-index ----------
    games_index = load(data / "games-index.json")
    indexed_ids = [g.get("gameId") for g in games_index]

    # check 4: game ids well-formed and unique
    seen: set[str] = set()
    for g in games_index:
        gid = g.get("gameId", "")
        where = f"games-index[{gid}]"
        check_shape(where, g, GAME_SUMMARY)
        if not GAME_ID.match(str(gid)):
            fail(f"{where}: malformed game id")
        if gid in seen:
            fail(f"{where}: duplicate game id")
        seen.add(gid)
        if g.get("gameType") not in GAME_TYPES:
            fail(f"{where}: gameType {g.get('gameType')!r} not in {sorted(GAME_TYPES)}")

    team_ids = set(ids)
    for g in games_index:
        for side in ("home", "away"):
            if g.get(side) not in team_ids:
                fail(f"games-index[{g.get('gameId')}]: {side} team {g.get(side)!r} is not a known team")

    # ---------- game files ----------
    game_files = sorted((data / "game").glob("*.json"))
    generated_ids = {f.stem for f in game_files}
    print(f"Checking {len(game_files)} game files, {len(teams_index)} teams...")

    missing = set(indexed_ids) - generated_ids
    if missing:
        fail(f"{len(missing)} indexed games have no game file, e.g. {sorted(missing)[:3]}")
    orphaned = generated_ids - set(indexed_ids)
    if orphaned:
        fail(f"{len(orphaned)} game files are not in games-index, e.g. {sorted(orphaned)[:3]}")

    for gf in game_files:
        game = load(gf)
        where = f"game/{gf.stem}"
        check_shape(where, game, GAME)
        if game.get("gameId") != gf.stem:
            fail(f"{where}: gameId {game.get('gameId')!r} disagrees with its filename")
        for side in ("home", "away"):
            if isinstance(game.get(side), dict):
                check_shape(f"{where}.{side}", game[side], GAME_TEAM)

        sides = {game.get("home", {}).get("id"), game.get("away", {}).get("id")}
        plays = game.get("plays")
        if not isinstance(plays, list) or not plays:
            fail(f"{where}: no plays")
            continue

        for p in plays:
            check_shape(f"{where} play {p.get('playId')}", p, PLAY)
            # check 5: homeWinProb is a real number in 0..1
            wp = p.get("homeWinProb")
            if not isinstance(wp, (int, float)) or isinstance(wp, bool):
                fail(f"{where} play {p.get('playId')}: homeWinProb is not numeric")
            elif math.isnan(wp) or math.isinf(wp) or not 0.0 <= wp <= 1.0:
                fail(f"{where} play {p.get('playId')}: homeWinProb {wp} outside 0..1")
            # Regulation quarters are 900s; overtime is 600 in the regular
            # season and 900 in the playoffs.
            limit = 900 if p.get("quarter", 0) <= 4 else (
                600 if game.get("gameType") == "REG" else 900
            )
            if not 0 <= p.get("clockSeconds", -1) <= limit:
                fail(
                    f"{where} play {p.get('playId')}: clockSeconds "
                    f"{p.get('clockSeconds')} outside 0..{limit}"
                )
            # `distance` is only meaningful alongside a `down`.
            if "distance" in p and "down" not in p:
                fail(f"{where} play {p.get('playId')}: has 'distance' but no 'down'")
            # every possession must belong to one of the two teams in THIS game
            if p.get("posteam") not in sides:
                fail(
                    f"{where} play {p.get('playId')}: posteam {p.get('posteam')!r} "
                    f"is not one of {sorted(sides)}"
                )

        # check 6: chronological order — quarter ascending, clock descending
        for a, b in zip(plays, plays[1:]):
            if b["quarter"] < a["quarter"]:
                fail(f"{where}: quarter goes backwards at play {b['playId']}")
                break
            if b["quarter"] == a["quarter"] and b["clockSeconds"] > a["clockSeconds"]:
                fail(f"{where}: clock runs backwards at play {b['playId']}")
                break
        # scores are monotonic, and the replay must end on the real final score
        for a, b in zip(plays, plays[1:]):
            if b["scoreHome"] < a["scoreHome"] or b["scoreAway"] < a["scoreAway"]:
                fail(f"{where}: score decreases at play {b['playId']}")
                break
        last = plays[-1]
        if (last["scoreHome"], last["scoreAway"]) != (
            game["home"]["finalScore"], game["away"]["finalScore"]
        ):
            fail(
                f"{where}: replay ends {last['scoreAway']}-{last['scoreHome']}, "
                f"actual {game['away']['finalScore']}-{game['home']['finalScore']}"
            )

    # ---------- team files ----------
    team_files = sorted((data / "team").glob("*.json"))
    if len(team_files) != 32:
        fail(f"team/: {len(team_files)} files, expected exactly 32")

    for tf in team_files:
        team = load(tf)
        where = f"team/{tf.stem}"
        check_shape(where, team, TEAM)
        if team.get("id") != tf.stem:
            fail(f"{where}: id {team.get('id')!r} disagrees with its filename")

        for p in team.get("roster", []):
            check_shape(f"{where} roster[{p.get('id')}]", p, PLAYER)
        if not team.get("roster"):
            fail(f"{where}: empty roster")

        depth = team.get("depthChart", {})
        if not depth:
            fail(f"{where}: empty depth chart")
        for pos, players in depth.items():
            if not isinstance(players, list) or not players:
                fail(f"{where}: depthChart['{pos}'] is empty")
                continue
            for p in players:
                check_shape(f"{where} depthChart[{pos}]", p, PLAYER)

        if not team.get("draftClass"):
            fail(f"{where}: empty draft class")
        for d in team.get("draftClass", []):
            check_shape(f"{where} draftClass", d, DRAFT_PICK)

        stats = team.get("stats", {})
        for side in ("offense", "defense"):
            if side not in stats:
                fail(f"{where}: stats.{side} missing")
            else:
                check_shape(f"{where} stats.{side}", stats[side], STAT_LINE)

        # check 7: every team game reference resolves to a generated game file
        if not team.get("games"):
            fail(f"{where}: no games")
        for g in team.get("games", []):
            check_shape(f"{where} games[{g.get('gameId')}]", g, GAME_SUMMARY)
            if g.get("gameId") not in generated_ids:
                fail(f"{where}: game {g.get('gameId')!r} has no generated game file")
            if tf.stem not in (g.get("home"), g.get("away")):
                fail(f"{where}: game {g.get('gameId')!r} does not involve this team")

    if errors:
        print(f"\nFAILED — {len(errors)} problem(s):")
        for e in errors[:40]:
            print("  -", e)
        if len(errors) > 40:
            print(f"  ... and {len(errors) - 40} more")
        return 1

    print(
        f"\nOK — 32 teams, {len(game_files)} games, {len(games_index)} indexed. "
        "All checks pass; data matches the TypeScript contract."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
