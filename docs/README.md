# 🏁 Wikipedia Speedrun

**Wikipedia is the map. Hyperlinks are the roads.**

Wikipedia Speedrun is a navigation puzzle game. You get a **START** article and a **TARGET**
article, and you have to travel from one to the other using nothing but the hyperlinks inside
Wikipedia articles. Think route-finding on Google Maps — except the map is Wikipedia and the
roads are wiki links.

Built as a static, installable PWA. No backend, no accounts, everything stored locally.

---

## Contents

- [Play](#play)
- [Game modes](#game-modes)
- [Difficulty](#difficulty)
- [Scoring, stars and XP](#scoring-stars-and-xp)
- [Hints and power-ups](#hints-and-power-ups)
- [Daily challenge](#daily-challenge)
- [Stats, achievements, profile](#stats-achievements-profile)
- [Settings](#settings)
- [Architecture](#architecture)
- [Wikipedia API usage](#wikipedia-api-usage)
- [Running locally](#running-locally)
- [Testing](#testing)
- [Deploying to GitHub Pages](#deploying-to-github-pages)
- [Installing on iPhone](#installing-on-iphone)
- [Adding a language](#adding-a-language)
- [Adding a leaderboard backend](#adding-a-leaderboard-backend)
- [Accessibility](#accessibility)
- [License / attribution](#license--attribution)

---

## Play

Open the app, hit **Quick play** and go. The clock starts the moment the article loads and
**never stops when you change page** — that is the whole point. Click links inside the article
to travel; reach the target article to finish.

Only real article links count as a move. Links to `Special:`, `File:`, `Category:`, `Template:`,
`Help:`, `Talk:`, `User:`, `Wikipedia:` and `Portal:` (in every supported language) are shown
as inert text, are counted separately as *invalid clicks*, and never move you.

Keyboard: `Space` pause/resume · `H` hints · `P` power-ups · `T` inspect target · `S` inspect
start · `Esc` close sheets · `Alt+1…7` jump between screens.

---

## Game modes

| Mode | What it is |
| --- | --- |
| **Quick play** | Random start, random target, difficulty you picked. Timer runs. |
| **Custom run** | You choose language, start article, target article, optional time limit, difficulty, and whether hints/power-ups are allowed. |
| **Daily challenge** | One deterministic puzzle per day, identical for everyone. Retryable, personal best stored. |
| **Time attack** | Countdown of 1, 3, 5 or 10 minutes. Reach the target before it hits zero. |
| **Click attack** | Timer is secondary; the score is dominated by click count. |
| **Endless** | Chain of targets. Each stage raises the difficulty (easy → normal → hard → expert → chaos). One failure ends the run. |
| **Sandbox** | No timer, no score, no pressure. Free exploration. |

---

## Difficulty

Difficulty is **data, not decoration**. Each level changes the article pool that challenges are
drawn from, the expected route length (par), the default countdown and the score multiplier:

| Level | Article pool | Par clicks | Par time | Countdown | Score × |
| --- | --- | --- | --- | --- | --- |
| 🌱 Easy | top 18% most-read | 3 | 2:00 | 5:00 | 0.80 |
| 🎯 Normal | whole popularity range | 5 | 3:30 | 5:00 | 1.00 |
| 🔥 Hard | from rank 22% down | 7 | 5:30 | 5:00 | 1.35 |
| 💀 Expert | from rank 45% down | 9 | 7:00 | 5:00 | 1.75 |
| 🌀 Chaos | rank 30% down + random modifiers | 8 | 6:00 | 5:00 | 1.60 |

**Chaos modifiers** (randomly rolled, or hand-picked): Blind run (no hints), No gadgets (no
power-ups), Tight leash (12-click cap), Half time, Single freeze, Blind links (no previews),
Long road (higher par).

Challenges are *verified*: the generator runs a bounded breadth-first search between the
candidate start and target so you are never handed an impossible puzzle. If the API is
unreachable it falls back to the deterministic popularity-pool choice instead of failing.

---

## Scoring, stars and XP

Score is transparent — the results screen lists every component, and the breakdown always sums
exactly to the total:

```
base                    1000
difficulty              + 600 × difficultyMultiplier
speed                   + 700 × clamp((parTime − time) / parTime, −1, 1.5) × difficultyMultiplier
clicks                  + 700 × clamp((parClicks − clicks) / parClicks, −1, 1.5) × difficultyMultiplier
hints                   − 250 × hintsUsed
power-ups               −  90 × powerupsUsed
streak                  +  35 × min(streak, 10)
countdown rush          − 220 × (elapsed / timeLimit)          (time-limited modes)
endless stages          + 180 × stagesCleared
                        × mode multiplier (daily 1.15, click attack 1.15, endless 1.20, …)
```

**Stars** (0–5) come from the same objective metrics: time vs par (40%), clicks vs par (40%) and
cleanliness — hints/power-ups (20%). A 0-click run is capped at 4 stars; Chaos gets a small
forgiveness bump.

**XP** is cosmetic-only: it unlocks avatars and accent colours, never gameplay advantages.
Level curve is `120 × (n−1)^1.35` cumulative XP.

---

## Hints and power-ups

Three hints, all backed by real Wikipedia data:

1. **Topic hint** — categories / description of the target (`action=query&prop=categories`).
2. **Bridge hint** — suggests an article on the *current page* that plausibly shortens the path.
   It checks candidate links for a real 2-hop connection to the target first; if none exists it
   says so honestly instead of inventing a route.
3. **Distance hint** — is the target directly linked, within 2 clicks, or 3+ clicks away
   (bounded BFS).

Costs are configurable in Settings (default: +5s / +10s and +1 click / +15s).

Power-ups (optional, disabled in ranked-style setups): 📡 Search radar (vague clue),
↩️ Backtrack (free step back), 🧊 Time freeze (10s, clock stops), 🔎 Link scanner (highlights
links with real relevance scoring), 👁️ Double vision (extra context). Each has limited uses.

---

## Daily challenge

Deterministic and server-free. The seed is
`FNV-1a("v1|<YYYY-MM-DD>|<lang>|auto")` and the challenge is generated from the shared
popularity pool, so **the same date + language always produces the same start/target pair** on
every device. The screen shows the date, seed string, language, difficulty, your result
(attempts, best time, fewest clicks, best score), a 14-day calendar and an archive of past
challenges you can replay.

---

## Stats, achievements, profile

**Statistics** tracks runs, completions, failures, completion rate, fastest run, fewest clicks,
average time/clicks, longest/shortest route, best score, current and longest streak, total play
time, articles visited, unique articles, languages played, difficulty distribution, per-mode
records and a completion-time trend chart (line/bar/donut charts are hand-rolled SVG — no chart
library).

**19 achievements** unlock automatically from real run data (First steps, Speed demon,
Minimalist, Marathon, Purist, Explorer, Polyglot, Perfection, Unstoppable, Daily habit, Chaos
theory, Click master, Beat the clock, Endless runner, Rising star, Centurion, Night owl,
Bookworm, No help needed).

**Profile** holds your name, level, XP bar, records, favourite language and cosmetic unlocks.
There is also a **local leaderboard** (sortable by score/time/clicks, filterable by mode and
language).

---

## Settings

- **Gameplay** — timer style (auto/stopwatch/countdown), click counting rules, hint penalties,
  default difficulty, power-up default, confirm-before-abandon, auto-pause on tab blur, keep
  screen awake.
- **Appearance** — theme (light/dark/system), visual skin (Classic / Minimal / Retro / AMOLED),
  compact HUD, animations, route panel.
- **Audio** — synthesised sound effects (no audio files) with master toggle and volume; audio
  only ever starts after your first interaction.
- **Language** — interface language (English / Bahasa Indonesia, auto-detected) and Wikipedia
  language (English, Indonesian, Japanese, German, French, Spanish).
- **Data** — export/import the full save as JSON, clear the article cache, storage usage, and
  **Reset all data** behind a typed confirmation.

---

## Architecture

Modular ES modules, no framework, no build step:

```
index.html                 app shell (critical CSS inline, PWA meta)
manifest.webmanifest       installable metadata + shortcuts
sw.js                      service worker (shell + runtime caching)
css/
  base.css                 tokens, themes, skins, shell, nav
  components.css           cards, buttons, forms, badges, charts, toasts, modals
  article.css              HUD, route panel, Wikipedia article styling, previews
js/
  core/       util.js  i18n.js  store.js  save.js
  api/        wikipedia.js            (MediaWiki client, cache, BFS, discovery)
  game/       gameState.js  timer.js  scoring.js  difficulty.js
              challenges.js  hints.js  powerups.js
  navigation/ articleParser.js  articleRouter.js
  storage/    settings.js  statistics.js  achievements.js  profile.js
              bookmarks.js  leaderboard.js  articleCache.js
  ui/         router.js  hud.js  components.js  charts.js  notifications.js  sound.js
              screens/  (home, play, game, daily, results, replay, stats,
                         achievements, profile, settings, bookmarks, leaderboard)
  main.js                  bootstrap
data/         popular-<lang>.json    popularity pools built from the Pageviews API
tools/        build_data.py  make_icons.py  check-i18n.mjs  fixpaths.py
tests/        harness.mjs  env.mjs  unit.test.mjs  app.test.mjs  run.mjs
```

Design notes:

- **The engine owns the game.** `gameState.js` is a single `GameSession` with an event emitter;
  screens only render state and call methods. The timer keeps running across article loads
  because it lives in the engine, not in a view.
- **Lazy screens.** Only home/play/game/daily are statically imported; the rest are dynamic
  imports behind the router.
- **Incremental HUD updates.** The timer ticks mutate two DOM nodes; full re-renders happen only
  on real state changes.
- **Two-layer caching.** In-memory LRU (40 articles) + persistent localStorage cache
  (configurable, default 40 articles) so revisits are instant and work offline.
- **Sanitisation.** Retrieved Wikipedia HTML is parsed into a detached `<template>`, stripped of
  scripts/styles/iframes/forms/event handlers/`javascript:` URLs, then rendered. Article links
  become internal navigation events; the browser never leaves the app for an internal link.

---

## Wikipedia API usage

Only official read-only endpoints are used — nothing is scraped from wikipedia.org HTML:

- `action=parse` with `prop=text|displaytitle|categories|revid|properties|langlinks` (+ `redirects=1`)
- `action=query` with `prop=pageimages|description|extracts|pageprops|info`, `list=random`,
  `list=prefixsearch`, `list=search`, `prop=links`, `list=backlinks`, `prop=categories`
- `api/rest_v1/page/summary/<title>` for fast link previews
- `wikimedia.org/api/rest_v1/metrics/pageviews/top/...` **offline, in `tools/build_data.py`**, to
  build the popularity pools shipped in `data/`

All browser requests include `origin=*` (required for anonymous CORS). Requests are queued
(max 4 concurrent), time-bounded, retried with exponential backoff + jitter, and rate-limit
aware (429/503).

---

## Running locally

```bash
cd wikipedia-speedrun
python3 -m http.server 8080      # or: npm run serve
# open http://localhost:8080
```

Any static file server works. A server is required (ES modules + service worker do not work
from `file://`).

### Scripts

| Command | What it does |
| --- | --- |
| `npm run serve` | Static server on :8080 |
| `npm test` | Unit + integration tests (live Wikipedia API) |
| `npm test:ui` | Full jsdom UI suite (needs `npm run serve:test` in another shell) |
| `npm test:all` | Both suites |
| `npm run smoke` | Quick API smoke test |
| `npm run i18n` | Translation coverage report |
| `npm run pages` | Build + verify the `docs/` folder for GitHub Pages |
| `npm run data` | Rebuild popularity pools from the Pageviews API |
| `npm run icons` | Regenerate PNG icons |

Regenerate the popularity pools (optional, they are committed):

```bash
python3 tools/build_data.py
python3 tools/make_icons.py       # regenerate PNG icons
```

---

## Testing

```bash
npm install        # only jsdom, for the test harness
npm test           # unit + integration tests against the live Wikipedia API
npm test -- --filter timer      # single area
npm test -- --offline           # skip network tests
node tools/check-i18n.mjs       # translation coverage
node tests/smoke.mjs            # quick API smoke test
```

The integration suite boots a real DOM (jsdom), drives the **actual game engine** through
complete runs (navigation, click counting, hints, power-ups, completion, persistence, reload
restore), asserts daily-challenge determinism, save export/import round-trips and rejection of
malformed saves, and validates the HTML sanitiser against hostile markup.

---

## Deploying to GitHub Pages

The site is fully static and uses hash routing (`#/daily`), so it works from any subpath.

```bash
git init
git add .
git commit -m "Wikipedia Speedrun"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Then: **Settings → Pages → Source: Deploy from a branch → `main` / `root`**. The app will be at
`https://<you>.github.io/<repo>/`. `service-worker.js` registration uses a relative URL with
`scope: './'`, so subpath hosting works without changes.

---

## Installing on iPhone

1. Open the GitHub Pages URL in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. Launch from the home screen — it runs full-screen (standalone), respects the safe areas, and
   the app shell works offline.

The game also works on Android Chrome (with the in-app install prompt) and desktop browsers.

---

## Adding a language

1. Add the code to `LANGUAGES` in `js/api/wikipedia.js` (label, native name, flag).
2. Add the popularity pool: append the code to `LANGS` in `tools/build_data.py` and run it
   (or ship without a pool — the game then falls back to `list=random`).
3. Add namespace names for that wiki to `BLOCKED_NAMESPACES` in `js/navigation/articleParser.js`.
4. Optionally add a UI translation in `js/core/i18n.js` (English is the fallback; missing keys
   fall back automatically, and `tools/check-i18n.mjs` will tell you what is missing).

---

## Adding a leaderboard backend

`js/storage/leaderboard.js` defines the contract. A remote adapter only has to implement
`submit(entry)` and `top(query)`:

```js
import { Leaderboard, RemoteLeaderboardAdapter } from './storage/leaderboard.js';
Leaderboard.useAdapter(new RemoteLeaderboardAdapter({ baseUrl: 'https://api.example.com' }));
```

`RemoteLeaderboardAdapter` already implements the HTTP shape and throws until a real endpoint is
configured — no fake data is ever shown, and the UI labels the adapter honestly.

---

## Accessibility

Keyboard-navigable throughout (visible focus rings, `Alt+1…7` screen jumps, arrow keys in
suggestion lists), ARIA roles/labels on interactive widgets, live regions for toasts and
achievement pop-ups, `prefers-reduced-motion` respected plus a manual animations toggle,
44px+ touch targets, and link previews available via keyboard focus and long-press — never
hover-only.

---

## License / attribution

Game code: MIT.

Article text and images come from Wikipedia and are licensed **CC BY-SA**; each article view
shows the attribution line and links back to the source. This project is unofficial and not
affiliated with the Wikimedia Foundation.

Popularity data is derived from the Wikimedia Pageviews API (CC0).
