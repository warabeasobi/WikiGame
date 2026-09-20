#!/usr/bin/env python3
"""One-shot: remove emoji from the UI chrome (header, nav, HUD, home).

Ponytail: emoji are a design-skill tell in chrome (section 3.D). They are kept
where the brief treats them as game iconography (difficulty/mode emblems shown
as content, achievements, power-ups). Re-running is a no-op.
"""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

EDITS = {
    "js/ui/screens/index.js": [
        # Nav: labels already say what each item is. Icons were pure noise.
        ("{ id: 'home', labelKey: 'nav.home', icon: '🏠' }", "{ id: 'home', labelKey: 'nav.home' }"),
        ("{ id: 'play', labelKey: 'nav.play', icon: '🎮' }", "{ id: 'play', labelKey: 'nav.play' }"),
        ("{ id: 'daily', labelKey: 'nav.daily', icon: '📅' }", "{ id: 'daily', labelKey: 'nav.daily' }"),
        ("{ id: 'stats', labelKey: 'nav.stats', icon: '📊' }", "{ id: 'stats', labelKey: 'nav.stats' }"),
        ("{ id: 'achievements', labelKey: 'nav.achievements', icon: '🏆' }", "{ id: 'achievements', labelKey: 'nav.achievements' }"),
        ("{ id: 'profile', labelKey: 'nav.profile', icon: '🧑' }", "{ id: 'profile', labelKey: 'nav.profile' }"),
        ("{ id: 'settings', labelKey: 'nav.settings', icon: '⚙️' }", "{ id: 'settings', labelKey: 'nav.settings' }"),
    ],
    "js/ui/router.js": [
        # Brand: the wordmark is the mark. No flag emoji.
        ("      el('span', { class: 'app-header__logo', text: '🏁', 'aria-hidden': 'true' }),\n", ""),
        # Theme button: say the state instead of drawing a moon.
        ("      text: s.theme === 'dark' ? '🌙' : s.theme === 'light' ? '☀️' : '🖥',",
         "      text: s.theme === 'dark' ? 'Dark' : s.theme === 'light' ? 'Light' : 'Auto',"),
        ("      text: '📲',", "      text: 'Install',"),
    ],
    "js/ui/hud.js": [
        # HUD controls: words are unambiguous and remove 7 emoji from the chrome.
        ("      el('span', { class: 'hud__chip-icon', text: '🖱️', 'aria-hidden': 'true' }),\n", ""),
        ("      el('span', { class: 'hud__chip-icon', text: '🔥', 'aria-hidden': 'true' }),\n", ""),
        ("      el('span', { class: 'hud__chip-icon', text: '♾️', 'aria-hidden': 'true' }),\n", ""),
        ("      el('span', { text: '💡', 'aria-hidden': 'true' }),\n", ""),
        ("      el('span', { text: '🧰', 'aria-hidden': 'true' }),\n", ""),
        ("      el('span', { class: 'hud__pause-icon', text: '⏸', 'aria-hidden': 'true' }),",
         "      el('span', { class: 'hud__pause-icon', text: 'Pause' }),"),
        ("      el('span', { text: '⌄', 'aria-hidden': 'true' }),", "      el('span', { text: 'More' }),"),
    ],
    "js/ui/screens/home.js": [
        ("button({ label: t('home.quickPlay'), icon: '⚡', variant: 'primary', className: 'btn--lg',",
         "button({ label: t('home.quickPlay'), variant: 'primary', className: 'btn--lg',"),
    ],
}


def main() -> None:
    for rel, pairs in EDITS.items():
        path = ROOT / rel
        text = path.read_text(encoding="utf-8")
        before = text
        for old, new in pairs:
            if old not in text:
                print(f"  ! not found in {rel}: {old.strip()[:60]}")
            text = text.replace(old, new)
        if text != before:
            path.write_text(text, encoding="utf-8")
            print(f"updated {rel}")


if __name__ == "__main__":
    main()
