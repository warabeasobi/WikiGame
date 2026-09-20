#!/usr/bin/env python3
"""One-shot: final emoji removal from chrome (status text, toasts, effect chips)."""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

EDITS = {
    "js/ui/router.js": [
        ("node.textContent = online ? '' : `📴 ${t('common.offline')}`;",
         "node.textContent = online ? '' : t('common.offline');"),
        ("notify.success(t('home.installed'), { icon: '📲' });",
         "notify.success(t('home.installed'));"),
        ("notify.info(t('settings.installHint'), { icon: '📲', duration: 6000 });",
         "notify.info(t('settings.installHint'), { duration: 6000 });"),
        ("notify.success(t('common.online'), { icon: '🌐', duration: 1800 });",
         "notify.success(t('common.online'), { duration: 1800 });"),
        ("notify.warn(t('common.offlineNotice'), { icon: '📴', duration: 5000 });",
         "notify.warn(t('common.offlineNotice'), { duration: 5000 });"),
    ],
    "js/ui/hud.js": [
        ("text: `🧊 ${t('game.frozen')}` }));", "text: t('game.frozen') }));"),
        ("text: `💡 ${state.hintsUsed}` }));", "text: `${t('common.hints')} ${state.hintsUsed}` }));"),
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
