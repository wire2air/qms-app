# Marketing screenshots

Authentic product screenshots for the marketing site (`qms-marketing`), captured from
the running app against the **Nordic demo tenant**. Nothing is mocked: every image is
a real screen opened by a real persona. The editing step crops, scales and frames it.
It never changes a UI pixel.

```
shots.mjs ──► capture.mjs ──► edit.mjs ──► webp.mjs ──► catalog.mjs
 what to       raw PNG         framed,      1600px       catalog.json
 capture       2880×1624       cropped,     WebP         + COVERAGE.md
                               hero
```

## Prerequisites

1. **Stack running locally:** api, worker and sync (`qms`) plus the vite dev server
   (`qms-app`). Check that `http://nordic.localhost:5173` loads.
2. **Nordic demo tenant seeded**, including sections D22–D25. Without them several shots
   come out empty or blocked.
   ```bash
   cd ../qms && ./database/demo-seed/build.sh
   # apply one section on its own (idempotent):
   (echo 'BEGIN;'; cat database/demo-seed/sectionD22.sql; echo 'COMMIT;') \
     | docker exec -i qms-postgres-1 psql -U postgres -d app-db -v ON_ERROR_STOP=1
   ```
   Always pass `-i` to `docker exec`. Without it, stdin is silently dropped.
3. **Postgres container** `qms-postgres-1` reachable. Shots with a `sql` field look up
   their record with a read-only query.

Run every command from the `qms-app` directory.

## Generate everything

One command runs all four stages with live progress in the terminal:

```bash
node scripts/marketing-shots/run-all.mjs              # every shot (~20 min)
node scripts/marketing-shots/run-all.mjs capa audits  # only matching ids
```

```
══════ 1/4 Capture ═════════════════════════════════════════
▶ Capturing screenshots — 96 items
  … logging in as owner (astrid.lindqvist@qability.net) — 94 shot(s)
  … warming up the sync (first load bootstraps IndexedDB)…
[ 1/96 ░░░░░░░░░░░░░░░   1%] ✓ overview-dashboard  6s  · 18s elapsed · ETA 28m
[ 2/96 ░░░░░░░░░░░░░░░   2%] ✓ overview-my-tasks  5s  · 23s elapsed · ETA 18m
…
■ Capturing screenshots done in 14m02s — 96/96 ok
```

**Night mode:** `THEME=dark node scripts/marketing-shots/run-all.mjs` captures the same
shots in the app's dark theme into `../qms-marketing/marketing-assets-dark/` (same
layout as below). The theme is switched through the app's own theme manager, so the
logo, icons and charts are the real dark variants. Only localStorage changes; the
user's saved `settings.theme` is never written.

**Speed:** `WORKERS` (default 4) is how many tabs capture side by side. The full run
takes ~5 minutes. More than 4 loads the local sync and dev server, and pages start
coming out half-loaded.

`✓` = done, `✗` = failed (reason shown), `–` = skipped/blocked. The stages can
also be run one by one:

```bash
node scripts/marketing-shots/capture.mjs
node scripts/marketing-shots/edit.mjs
node scripts/marketing-shots/webp.mjs
node scripts/marketing-shots/catalog.mjs
```

Each script also takes id filters. Any shot whose id **contains** one of the words is
processed, and the others are left untouched:

```bash
node scripts/marketing-shots/capture.mjs capa audits-standard
node scripts/marketing-shots/edit.mjs capa audits-standard
node scripts/marketing-shots/webp.mjs capa audits-standard
node scripts/marketing-shots/catalog.mjs          # always rebuilds from disk
```

`capture-log.json` and `edit-log.json` are **merged**, so a filtered re-run keeps the
results of every other shot.

## Output

The default output folder is `../qms-marketing/marketing-assets/`. It sits outside
`public/`, so the large originals never ship with the site.

```
marketing-assets/
  product/<module>/
    originals/<id>-original.png          raw capture, 2880×1624 (1440×812 @2x)
    edited/<id>-full.png|.webp           full UI in an app frame, 16:10
    edited/<id>-marketing.png|.webp      sidebar + top bar removed, content trimmed
    feature-details/<id>-detail.png|.webp  zoom on the `focus` card
    hero/<id>-hero.png|.webp             3840×2160 composition (shots with `hero: true`)
    screens/<id>-screen.webp             raw UI, 1600×900: the site's slot format
  capture-log.json   per shot: status, url, persona, chrome/focus geometry, blockedWrites
  edit-log.json      per shot: files produced, sizes, crop rectangle, scale
  webp-log.json
  catalog.json       one entry per file (paths, dimensions, recommended page/slot, authenticity)
  COVERAGE.md        module matrix, empty site slots, gaps, recapture list
```

**To use an image on the site:** copy `screens/<id>-screen.webp` into
`qms-marketing/app/public/media/screenshots/<module>/` and set that slot's `src` in
`app/content/media.ts`. The existing slot images, such as
`audit-trail/audit-log-feed.webp`, have exactly this shape. `catalog.json` lists the
slot ids each shot can fill under `recommendedSlots`.

## Adding or changing a shot

Edit `shots.mjs`. The fields are documented in its header comment. A typical entry:

```js
{
  id: 'capa-closed-effectiveness',          // file names derive from this
  module: 'capa',                           // output folder
  feature: 'Closed CAPA with effectiveness verification',
  url: '/capas/db200001-1111-4000-8000-000000000133',
  // or pick the record from live data instead of hard-coding an id:
  // sql: `SELECT '/capas/' || id FROM capas WHERE company_id = ${NORDIC} AND status_id = 'CLOSED' LIMIT 1`,
  actions: [{ tab: 'Workflow' }],           // tab | click | clickText | fill+value | wait
  focus: 'CAPA Details',                    // heading of the card to zoom into (or focusSel)
  hero: true,                               // also build the hero composition
  slots: ['capa.effectiveness'],            // media.ts slots this can fill
  page: 'CAPA — effectiveness',             // recommended page — section
}
```

- **Supplier-portal screens:** set `persona: 'supplier'`. Personas and their
  credentials are defined in `PERSONAS` in `capture.mjs`.
- **Data that doesn't exist yet:** give the shot a `sql` lookup and a `blocked` reason.
  It is logged as blocked, and captures on its own once the data is seeded.
- **Before relying on a new shot:** re-run the four scripts for its id, then open the
  PNG to check it.

## Safety: capture never writes

Some pages **write to the database just by being opened**. A draft or open record fires
a GraphQL update on load, the document Training tab autosaves a default
`training_config`, and an open audit sends a PATCH. `capture.mjs` therefore aborts
every GraphQL mutation and every non-GET request (the auth session calls are allowed),
and records what it blocked under `blockedWrites` in `capture-log.json`.

- Never remove that guard.
- Never add an action that saves, submits, approves or signs. Dialogs may be opened,
  never confirmed.

## Environment variables

Set them in the shell or in `qms-app/.env` (the scripts load it; the shell wins). The full
commented list is at the bottom of `.env.example`.

| Variable | Default | Used by |
|---|---|---|
| `THEME` | `light` (`dark` = night mode → `marketing-assets-dark`) | all |
| `WORKERS` | `4` capture/edit, `6` webp | capture, edit, webp |
| `SHOTS_OWNER_EMAIL` / `_PASSWORD` | `astrid.lindqvist@qability.net` / `12345678` | capture |
| `SHOTS_SUPPLIER_EMAIL` / `_PASSWORD` | `mette.kristensen@qability.net` / `12345678` | capture |
| `NORDIC_URL` | `http://nordic.localhost:5173` | capture |
| `ASSETS_DIR` | `../qms-marketing/marketing-assets` | all |
| `PG_CONTAINER` / `PG_DB` | `qms-postgres-1` / `app-db` | capture (`sql` lookups) |
| `CAPTURE_LOG` | `<ASSETS_DIR>/capture-log.json` | edit |
| `MARKETING_DIR` | `../qms-marketing` | catalog (reads `app/content/media.ts`) |

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `login failed … 401` | The persona's email or password changed. Check the `users` table and update `PERSONAS`. |
| Shot `blocked: … locator.click: Timeout` | The UI changed. Fix the shot's `actions` selector. Tabs on detail pages are `role=tab`, but some headers (such as the document `Version:` selector) sit outside `<main>`. |
| Shot `blocked` with a data reason | The `sql` found no row. Seed the data (see prerequisites) and re-run capture for that id. |
| Half-empty or skeleton screenshot | The sync bootstrap hadn't finished. Re-run capture for that id; the first shot after login is the most exposed. |
| No `-detail` variant | `focus` text not found, or the card is smaller than 200×80 CSS px. Use a heading inside the card, or `focusSel`. |
| `COVERAGE.md` lists "sparse content" | The screen is probably an empty state. Pick a richer record or seed data. |
| A breadcrumb of other records above a record (`NC NC-1217 › CMP-001 › …`) | That is the app's per-tab record trail (navigation history, not lineage). `capture.mjs` clears it before every shot, so a record is always captured as opened directly. If it reappears, the `qms.recordTrail` sessionStorage key was renamed. |
| EMAIL-TEST / E2E rows in lists | `pnpm test:emails` and the E2E runs write into this tenant. Detail shots skip them; list pages still show them. |
