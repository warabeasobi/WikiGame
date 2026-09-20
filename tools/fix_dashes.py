#!/usr/bin/env python3
"""One-shot: replace banned dashes and emoji placeholders in the UI layer.

Ponytail note: this is a codemod, not app code. It runs once and stays in the
repo as the record of what changed. Re-running is a no-op.
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Prose em-dashes: restructure with a period, comma or colon (never just swap
# the glyph, that produces a comma splice).
PROSE = [
    ("'First run — this is your record'", "'First run. This is your record'"),
    ("'No runs yet — your first one starts here.'", "'No runs yet. Your first one starts here.'"),
    ("'Reach the target as fast as you can — the timer never stops for a new page.'",
     "'Reach the target as fast as you can. The timer never stops for a new page.'"),
    ("'That link is not an article — it does not count as a move.'",
     "'That link is not an article, so it does not count as a move.'"),
    ("'Try: {title} — {reason}'", "'Try: {title} ({reason})'"),
    ("'Distance unknown — click around to find out.'", "'Distance unknown. Click around to find out.'"),
    ("'XP never affects gameplay — it only unlocks looks.'",
     "'XP never affects gameplay. It only unlocks looks.'"),
    ("'Run pertama — ini rekormu'", "'Run pertama. Ini rekormu'"),
    ("'Belum ada run — mulai dari sini.'", "'Belum ada run. Mulai dari sini.'"),
    ("'Capai target secepat mungkin — timer tidak berhenti saat pindah halaman.'",
     "'Capai target secepat mungkin. Timer tidak berhenti saat pindah halaman.'"),
    ("'Tautan itu bukan artikel — tidak dihitung sebagai langkah.'",
     "'Tautan itu bukan artikel, jadi tidak dihitung sebagai langkah.'"),
    ("'Coba: {title} — {reason}'", "'Coba: {title} ({reason})'"),
    ("'Jarak tidak diketahui — coba jelajah dulu.'", "'Jarak tidak diketahui. Coba jelajah dulu.'"),
    ("'XP tidak memengaruhi permainan — hanya membuka tampilan.'",
     "'XP tidak memengaruhi permainan. Hanya membuka tampilan.'"),
    ("'Par is raised — expect a longer route.'", "'Par is raised. Expect a longer route.'"),
    ("'Distance unknown — explore to find out.'", "'Distance unknown. Explore to find out.'"),
    ("`Try: ${target} — it links straight to the target`", "`Try: ${target} (it links straight to the target)`"),
    ("`Try: ${candidate.link} — a short path to the target runs through it`",
     "`Try: ${candidate.link} (a short path to the target runs through it)`"),
    ("`Try: ${best.link} — it shares context with the target`",
     "`Try: ${best.link} (it shares context with the target)`"),
    ("'You are offline — cached content still works.'", "'You are offline. Cached content still works.'"),
    ("'1–2 · 🌱'", "'1-2'"),
    ("'3–4 · 🎯'", "'3-4'"),
    ("'5–7 · 🔥'", "'5-7'"),
    ("'8–10 · 💀'", "'8-10'"),
    ("'11+ · 🌀'", "'11+'"),
    ("using in-memory storage for this session.", "using in-memory storage for this session."),
    ("— using in-memory", ": using in-memory"),
    ("— falling back to defaults", ": falling back to defaults"),
]


def main() -> None:
    changed = 0
    for path in sorted(ROOT.glob("js/**/*.js")):
        text = path.read_text(encoding="utf-8")
        original = text
        for old, new in PROSE:
            text = text.replace(old, new)
        # Placeholder glyph for "no value": the dash is banned, a hyphen is not.
        text = text.replace("'—'", "'-'").replace('"–"', '"-"')
        if text != original:
            path.write_text(text, encoding="utf-8")
            changed += 1
            print(f"updated {path.relative_to(ROOT)}")
    print(f"{changed} files updated")


if __name__ == "__main__":
    main()
