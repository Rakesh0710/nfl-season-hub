"""
Validate that the emitted JSON matches the contract in src/types/nfl.ts.

Checks every file for exact key sets, types, and a few semantic invariants
(win probabilities in range, plays ordered, scores monotonic). Run after
build_data.py; exits non-zero on any violation.

    python etl/validate.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

DATA = Path("public/data")

TEAM_IDENTITY = {
    "id", "name", "nick", "conference", "division",
    "logo", "primaryColor", "secondaryColor",
}
TEAM_SUMMARY = TEAM_IDENTITY | {
    "season", "record", "priorSeason", "projectedWins",
    "pointsFor", "pointsAgainst", "pointDiff", "gamesPlayed",
}
TEAM = TEAM_SUMMARY | {"roster", "depthChart", "draftClass", "stats", "games"}
GAME_SUMMARY = {
    "gameId", "season", "week", "gameType",
    "home", "away", "homeScore", "awayScore", "date",
}
GAME = GAME_SUMMARY | {"plays", "keyPlayCount"}
PLAY = {
    "playId", "quarter", "clockSeconds", "gameSecondsRemaining", "homeWinProb",
    "scoreHome", "scoreAway", "down", "distance", "posteam", "playType",
    "description", "epa", "isKeyPlay",
}
PLAYER = {"id", "name", "position", "number", "age", "college", "status", "yearsExp", "headshot"}
STAT_LINE = {"epaPerPlay", "successRate", "pointsPerGame", "yardsPerGame", "explosiveRate", "plays"}

errors: list[str] = []


def check_keys(where: str, obj: dict, expected: set[str]) -> None:
    got = set(obj)
    if got != expected:
        missing, extra = expected - got, got - expected
        detail = []
        if missing:
            detail.append(f"missing {sorted(missing)}")
        if extra:
            detail.append(f"unexpected {sorted(extra)}")
        errors.append(f"{where}: {'; '.join(detail)}")


def main() -> int:
    manifest = json.loads((DATA / "seasons.json").read_text())
    seasons = [s["season"] for s in manifest["seasons"]]
    print(f"Validating seasons {seasons}")

    game_ids_seen: set[str] = set()

    for season in seasons:
        sdir = DATA / str(season)

        index = json.loads((sdir / "teams-index.json").read_text())
        if len(index) != 32:
            errors.append(f"{season}/teams-index.json: {len(index)} teams, expected 32")
        for t in index:
            check_keys(f"{season}/teams-index[{t.get('id')}]", t, TEAM_SUMMARY)
            if t["conference"] not in ("AFC", "NFC"):
                errors.append(f"{season} {t['id']}: bad conference {t['conference']!r}")
            if not 0 <= t["projectedWins"] <= t["gamesPlayed"]:
                errors.append(f"{season} {t['id']}: projectedWins {t['projectedWins']} out of range")

        games_index = json.loads((sdir / "games-index.json").read_text())
        for g in games_index:
            check_keys(f"{season}/games-index[{g.get('gameId')}]", g, GAME_SUMMARY)

        for tf in sorted((sdir / "team").glob("*.json")):
            team = json.loads(tf.read_text())
            check_keys(f"{season}/team/{tf.stem}", team, TEAM)
            for p in team["roster"][:5]:
                check_keys(f"{season}/team/{tf.stem} roster", p, PLAYER)
            for side in ("offense", "defense"):
                check_keys(f"{season}/team/{tf.stem} stats.{side}", team["stats"][side], STAT_LINE)
            if not team["roster"]:
                errors.append(f"{season}/team/{tf.stem}: empty roster")
            if not team["depthChart"]:
                errors.append(f"{season}/team/{tf.stem}: empty depth chart")
            if not team["draftClass"]:
                errors.append(f"{season}/team/{tf.stem}: empty draft class")

        game_ids_seen |= {g["gameId"] for g in games_index}

    files = sorted((DATA / "game").glob("*.json"))
    print(f"Checking {len(files)} game files...")
    for gf in files:
        game = json.loads(gf.read_text())
        check_keys(f"game/{gf.stem}", game, GAME)
        plays = game["plays"]
        if not plays:
            errors.append(f"game/{gf.stem}: no plays")
            continue
        check_keys(f"game/{gf.stem} plays[0]", plays[0], PLAY)
        for p in plays:
            if not 0.0 <= p["homeWinProb"] <= 1.0:
                errors.append(f"game/{gf.stem} play {p['playId']}: wp {p['homeWinProb']} out of range")
                break
        # scores never decrease as the replay advances
        for a, b in zip(plays, plays[1:]):
            if b["scoreHome"] < a["scoreHome"] or b["scoreAway"] < a["scoreAway"]:
                errors.append(f"game/{gf.stem}: score decreases at play {b['playId']}")
                break
        if game["keyPlayCount"] != sum(1 for p in plays if p["isKeyPlay"]):
            errors.append(f"game/{gf.stem}: keyPlayCount mismatch")
        # End to end: the replay must finish on the real final score.
        last = plays[-1]
        if (last["scoreHome"], last["scoreAway"]) != (
            game["home"]["finalScore"], game["away"]["finalScore"]
        ):
            errors.append(
                f"game/{gf.stem}: replay ends {last['scoreAway']}-{last['scoreHome']}, "
                f"actual {game['away']['finalScore']}-{game['home']['finalScore']}"
            )

    missing_games = game_ids_seen - {f.stem for f in files}
    if missing_games:
        errors.append(f"{len(missing_games)} indexed games have no game file, e.g. {sorted(missing_games)[:3]}")

    if errors:
        print(f"\nFAILED — {len(errors)} problem(s):")
        for e in errors[:40]:
            print("  -", e)
        if len(errors) > 40:
            print(f"  ... and {len(errors) - 40} more")
        return 1

    print(f"\nOK — {len(files)} games, {len(seasons)} seasons, contract matches.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
