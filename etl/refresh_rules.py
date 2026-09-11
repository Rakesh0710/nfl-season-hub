"""
The decisions a scheduled refresh makes on its own.

Split out of `build_data.py` for one reason: nothing in here needs nflreadpy or
polars, so CI can fault-inject it with a bare Python and no install. It is also
the honest shape — these are the rules that run unattended every Tuesday, and
they are worth reading without the download pipeline around them.

Verified by `test_refresh.py`.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

# How many games a new season must have played before the team layer moves to
# it.
#
# The team layer is one season's rosters, stat lines and projections. Pointed
# at a season two games old it does not degrade gracefully, it collapses: on
# 11 September 2026, with two games played, the league dashboard would have
# listed four teams and dropped the other twenty-eight, each with a
# "projected wins" of about 0.5 sitting beside a last-season record of 11-6.
#
# 64 games is roughly four weeks — enough for a stat line to mean something
# and for every team to have played. Until then the team layer stays on the
# last complete season and `meta.json` says a newer one is under way, so the
# two are never silently blended. `--display-season` overrides this by hand.
PROMOTE_MIN_PLAYED = 64


def choose_display_season(states: list[dict]) -> int:
    """
    Which season the team layer should describe.

    The newest season that is either finished or far enough along to be worth
    describing. Everything else about the refresh is mechanical; this is the
    one judgement call, so it is a rule in one place rather than a flag someone
    remembers to pass.
    """
    eligible = [
        s["season"] for s in states
        if s["complete"] or s["played"] >= PROMOTE_MIN_PLAYED
    ]
    if not eligible:
        raise SystemExit("No season has enough games played to describe. Refusing to guess.")
    return max(eligible)


def build_meta(states: list[dict], display: int, team_seasons: list[int]) -> dict:
    """The freshness and completeness record the frontend reads."""
    return {
        # Whole seconds, UTC: a timestamp with microseconds in it changes on
        # every run and would make an unchanged refresh look like a change.
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "source": "nflverse",
        "displaySeason": display,
        "latestSeason": max(s["season"] for s in states),
        # Which seasons have a team layer behind them, and so which ones the
        # league and team pages may offer. A season with two games played has
        # a schedule and a handful of replays but no squad worth describing.
        "teamSeasons": sorted(team_seasons),
        "seasons": states,
    }


def load_existing_index(out: Path) -> list[dict]:
    """The games-index a refresh is going to merge into."""
    path = out / "games-index.json"
    if not path.exists():
        raise SystemExit(
            f"{path} does not exist. A refresh updates an existing build; "
            "run a full build first."
        )
    return json.loads(path.read_text(encoding="utf-8"))


def merge_index(existing: list[dict], rebuilt: list[dict], seasons: set[int]) -> list[dict]:
    """
    The rebuilt seasons replace their own entries; every other season is kept
    exactly as it was.

    A game that was in the index and is not in the rebuild is a red flag, not a
    deletion: nflverse dropping a game, or a partial download, would otherwise
    quietly remove replays that are still linked from team pages.
    """
    kept = [g for g in existing if g["season"] not in seasons]
    was = {g["gameId"] for g in existing if g["season"] in seasons}
    now = {g["gameId"] for g in rebuilt}
    if lost := was - now:
        raise SystemExit(
            f"{len(lost)} game(s) present in the old index are missing from the rebuild "
            f"({', '.join(sorted(lost)[:5])}). Refusing to drop them."
        )
    merged = kept + rebuilt
    merged.sort(key=lambda g: (g["season"], g["week"], g["date"], g["gameId"]))
    return merged
