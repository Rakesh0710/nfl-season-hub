"""
Fault injection for the refresh guardrails.

`validate.py` proves the output matches the contract. This proves the two
decisions the refresh makes on its own are safe to leave running on a schedule:
which season the team layer describes, and what happens to the games already in
the index.

Standard library only, no framework — same as validate.py. It imports
`refresh_rules`, not `build_data`, so it runs with a bare Python and no
install; importing the pipeline would have dragged nflreadpy in with it.

    python etl/test_refresh.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from refresh_rules import PROMOTE_MIN_PLAYED, choose_display_season, merge_index  # noqa: E402

failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  ok    {name}")
    else:
        failures.append(f"{name}{': ' + detail if detail else ''}")
        print(f"  FAIL  {name} {detail}")


def raises(name: str, fn) -> None:
    try:
        fn()
    except SystemExit as e:
        print(f"  ok    {name} -> refused: {str(e)[:70]}")
        return
    failures.append(f"{name}: did not refuse")
    print(f"  FAIL  {name}: did not refuse")


def season(year: int, scheduled: int, played: int) -> dict:
    return {
        "season": year,
        "scheduled": scheduled,
        "played": played,
        "complete": scheduled > 0 and played == scheduled,
    }


def game(gid: str, year: int, week: int = 1, date: str = "2026-09-10") -> dict:
    return {"gameId": gid, "season": year, "week": week, "date": date}


print("choose_display_season")

check(
    "the newest complete season wins",
    choose_display_season([season(2024, 285, 285), season(2025, 285, 285)]) == 2025,
)

check(
    "a barely-started season does not take over",
    choose_display_season([season(2025, 285, 285), season(2026, 272, 2)]) == 2025,
    "two games is not a season",
)

check(
    "a season past the threshold does take over",
    choose_display_season([season(2025, 285, 285), season(2026, 272, PROMOTE_MIN_PLAYED)]) == 2026,
)

check(
    "one short of the threshold does not",
    choose_display_season([season(2025, 285, 285), season(2026, 272, PROMOTE_MIN_PLAYED - 1)])
    == 2025,
)

raises(
    "refuses to guess when nothing qualifies",
    lambda: choose_display_season([season(2026, 272, 1)]),
)

print("\nmerge_index")

history = [game("2025_01_A_B", 2025), game("2025_02_C_D", 2025, week=2)]
rebuilt = [game("2026_01_E_F", 2026)]

merged = merge_index(history, rebuilt, {2026})
check("history survives a refresh of a different season", len(merged) == 3)
check("the new game is added", any(g["gameId"] == "2026_01_E_F" for g in merged))
check(
    "the result is ordered by season then week",
    [g["gameId"] for g in merged] == ["2025_01_A_B", "2025_02_C_D", "2026_01_E_F"],
)

replaced = merge_index(
    history + [game("2026_01_E_F", 2026)],
    [game("2026_01_E_F", 2026), game("2026_01_G_H", 2026)],
    {2026},
)
check("rebuilding a season replaces its own entries and adds new ones", len(replaced) == 4)

raises(
    "refuses to drop a game the rebuild no longer produces",
    lambda: merge_index(history + [game("2026_01_E_F", 2026)], [], {2026}),
)

raises(
    "refuses even when only one of several goes missing",
    lambda: merge_index(
        history + [game("2026_01_E_F", 2026), game("2026_01_G_H", 2026)],
        [game("2026_01_E_F", 2026)],
        {2026},
    ),
)

check(
    "an untouched season is passed through unchanged, object for object",
    merge_index(history, [], {2026})[0] is history[0],
)

if failures:
    print(f"\nFAILED — {len(failures)} problem(s):")
    for f in failures:
        print("  -", f)
    raise SystemExit(1)

print("\nOK — the promotion rule and the index merge behave as documented.")
