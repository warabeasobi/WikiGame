#!/usr/bin/env python3
"""Ponytail pre-flight: mechanical, countable rules the design skill bans.

Run before shipping any UI change:
    python3 tools/preflight.py

Fails (exit 1) on:
  - em-dash / en-dash inside quoted UI strings or markup (skill section 9.G)
  - emoji in UI chrome (skill section 3.D discourages emoji by default)

Emoji are allowed in the game-facing content layer (difficulty icons, mode
icons) which the brief treats as game iconography, not chrome. Chrome is the
header, nav, HUD, and screen scaffolding.
"""
import pathlib
import re
import sys

DASH = re.compile(r"[\u2014\u2013]")
# Wide enough to catch the dingbat/geometric glyphs actually used as UI icons
# (play, pause, chevrons), not just the emoji blocks.
EMOJI = re.compile(
    r"[\U0001F000-\U0001FAFF\u2190-\u21FF\u2300-\u27BF\u2B00-\u2BFF\uFE0F]"
)
# Exemptions, each with a reason. An arrow between two article titles is route
# notation (typography), not an icon.
ALLOWED = {
    "\u2190": "back arrow, standard navigation affordance",
    "\u2192": "route notation between article titles",
    "\u2192 ": "route notation",
    "\u2193": "route notation in the route list",
}

CHROME = [
    "js/ui/router.js",
    "js/ui/hud.js",
    "js/ui/screens/home.js",
]
STRINGISH = re.compile(r"['\"`]")


def main() -> int:
    root = pathlib.Path(__file__).resolve().parent.parent
    problems = []

    for path in sorted((root / "js").rglob("*.js")):
        rel = str(path.relative_to(root))
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            stripped = line.strip()
            if stripped.startswith(("/*", "*", "//")):
                continue
            if DASH.search(line) and STRINGISH.search(line):
                problems.append(f"dash   {rel}:{lineno}  {stripped[:90]}")

    for rel in CHROME:
        path = root / rel
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        for allowed in ALLOWED:
            text = text.replace(allowed, "")
        count = len(EMOJI.findall(text))
        if count:
            problems.append(f"emoji  {rel}  {count} in UI chrome (limit 0)")

    if problems:
        print(f"preflight FAILED ({len(problems)} problems)")
        for p in problems:
            print("  " + p)
        return 1

    print("preflight passed: no em-dashes, no emoji in UI chrome")
    return 0


if __name__ == "__main__":
    sys.exit(main())
