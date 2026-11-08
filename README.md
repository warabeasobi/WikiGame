# WikiRace

WikiRace is a Wikipedia link race. You start on one article, you may only travel through real
article links, and you win by reaching the target article with as few clicks as possible. Every
click grows the route graph next to the article.

No backend, no accounts: the Wikipedia API is read directly from the browser and the profile
lives in `localStorage`.

## Stack

- React 19 + React Router (each screen is its own page/route)
- Vite + TypeScript (strict)
- Vitest + jsdom for unit tests
- The visual design comes from the approved mockup; the design kit is served from `public/kit/`

## Screens

Each screen has its own route (hash routing, so a static host can serve the built app as-is):

| Route | Screen | What it does |
| --- | --- | --- |
| `/` | Nama | Player name, then on to the mode picker |
| `/mode` | Mode | Free run / Time trial / Random, plus the "Dari mana ke mana?" picker |
| `/balapan` | Balapan | Article, route graph, HUD, buff bar |
| `/hasil` | Hasil | Rank, XP, route, prize chest, profile export/import |
| `/profil` | Profil | Name, recent races, buff bag, export/import |

The clock runs while you move between screens, and an interrupted race is restored after a
reload.

## Modes

| Mode | Rule | XP |
| --- | --- | --- |
| **Free run** | You type the start and the target yourself, no time limit | ×1.0 |
| **Time trial** | Same, but two minutes | ×1.5 |
| **Random** | Both articles are drawn from all of Indonesian Wikipedia | ×1.25 |

## Route picker

Start and target are typed, never invented by the app: the field searches
`action=query&generator=prefixsearch` on `id.wikipedia.org` and shows title, thumbnail and
short description. On submit the title is resolved again (`redirects=1`); missing articles and
disambiguation pages are rejected with a readable message.

## Buffs

Three one-shot buffs sit on the race bar (keys `1`, `2`, `3`):

| Buff | Effect |
| --- | --- |
| Mata Elang | Marks the two links that point closest to the target |
| Waktu Berhenti | Stops the clock for 15 seconds |
| Putar Balik | Undoes the last click |

Ramalan and Langkah Kilat exist in the chest pool and land in your bag on the profile page.

## Profile file

`Ekspor .json` downloads the whole profile; `Muat .json` reads it back. Imported files are
validated field by field, and unknown entries are dropped instead of trusted.

```json
{
  "name": "Sari",
  "xp": 220,
  "races": [{ "mode": "free", "from": "Indonesia", "to": "Gunung Fuji", "clicks": 2, "par": 2,
              "ms": 9800, "rank": "S", "xp": 220, "route": ["Indonesia", "Jepang", "Gunung Fuji"],
              "at": "2026-11-08T16:48:00.000Z" }],
  "inventory": [{ "id": "mata", "rarity": "langka", "at": "2026-11-08T16:48:10.000Z" }]
}
```

## Wikipedia API usage

Everything is read-only, from the browser, without an API key:

- `api.php?action=query&generator=prefixsearch` — the suggestion list
- `api.php?action=query&titles=…&redirects=1` — resolve a typed title, spot disambiguation pages
- `api.php?action=query&list=random` — the article pool for Random mode
- `api.php?action=query&prop=links` — the target's neighbours, used as the hint heuristic
- `api/rest_v1/page/html/<title>` — the Parsoid article body, reduced to reading text

Fetched articles are memoised in memory. Link handling follows the rule that only internal
article links count: `Berkas:`, `Kategori:`, `Templat:`, `Bantuan:`, `Wikipedia:` and the other
namespaces are rendered as inert text, and everything after `Referensi` / `Pranala luar` is cut.

## Known limits

- **Par is an estimate on live routes.** A real shortest-path search would need one API call per
  article, so par is only computed exactly for a one-hop and two-hop route; otherwise the HUD
  shows `par 4` as a floor.
- **The route graph is illustrative.** Nodes are laid out in a fixed zig-zag; edges are not
  fetched from Wikipedia.
- UI copy is Indonesian; the code and docs are English.

## Local development

```sh
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # type-check, then bundle to dist/
pnpm preview    # serve the build
```

## Deploying

GitHub Pages serves this repository from `main:/docs` (legacy Pages), so `pnpm build` writes the
bundled app straight into `docs/` and the folder is committed with the source. `base` is `./` and
routing is hash-based, so the build works from the `/WikiGame/` subpath without extra
configuration. `.nojekyll` is emitted with the build so Pages does not run Jekyll over it.

## Testing

```sh
pnpm test       # vitest run
pnpm typecheck  # tsc -b
```

The suite covers the pure logic: article HTML parsing and title normalisation, scoring, profile
file validation, the buff chest, and the hint/par helpers.

## Accessibility

Every control is reachable by keyboard, the article links are real links with a visible focus
ring, the picker is a proper `combobox` with `aria-expanded` and arrow-key navigation, and the
live status region announces buff effects and route changes. `prefers-reduced-motion` disables
the route pulse and the kit's entrance motion.

## License

MIT. Article text and images come from Wikipedia and stay under their own licences
(CC BY-SA 4.0 / public domain).
