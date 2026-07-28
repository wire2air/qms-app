# Demo-video pipeline

Turns any Playwright run into a narrated MP4 that looks like a hand-made product
demo: title card, live step captions with status and timestamps, a visible mouse
cursor with click ripples, typed-text and keyboard readouts, and a summary card
with the step ledger and total duration.

```
npm run test:video                       # everything: record → build → report
npm run test:video -- --project=users    # one module
npm run test:video -- --project=users -g "roster"   # one test
```

Outputs land in `artifacts/` and the report opens with `npm run video:report`.

**Each module owns `artifacts/<module>/`.** Filming one module resets only that
folder; the other modules' videos stay on disk and are reused as-is for the
combined index, so `--project=users` costs one module of encoding rather than
the whole suite. `npm run video:clean` drops everything;
`npm run video:clean:module -- users` drops one.

---

## Two things that shaped the design

**1. This suite has 62 spec files and none of them call `test.step()`.**

A pipeline that narrates only `test.step()` would have produced 62 silent videos.
So captions come from the step tree Playwright builds anyway: every action is a
`pw:api` step and every assertion is an `expect` step, and the reporter API
receives all of them. Narration works today with **zero edits to any spec**, and
gets better on its own as `test.step()` is adopted — authored titles take
priority whenever a test has them ([reporter.js](reporter.js), `_collectSteps`).

**2. The cursor has to run inside the page — that part cannot be bolted on from
outside.**

Playwright drives input over CDP, so no OS cursor appears in the recording;
without a synthetic one, fields fill themselves and buttons depress untouched,
which reads as a glitch rather than a demo. Drawing it requires
`page.addInitScript`, which requires a fixture, which requires the spec to import
our `test`. No config-level hook can inject a fixture into a spec.

`npm run video:instrument` does that rewrite mechanically — one line per file:

```diff
-import { test, expect } from '@playwright/test'
+import { test, expect } from '../../video/fixtures/videoTest.js'
```

It is **safe to commit and leave in place**: `videoTest.js` re-exports
`@playwright/test` unchanged and its fixture is inert unless `VIDEO_MODE=1`
(only `test:video` sets it). Ordinary `playwright test` runs are unaffected.
`npm run video:uninstrument` reverses it; `npm run video:check` fails CI if a new
spec was added without it.

> A Chromium `--load-extension` content script would avoid the rewrite, but it is
> Chromium-only, so it cannot satisfy the Firefox requirement.

---

## Install

```bash
pnpm add -D @ffmpeg-installer/ffmpeg @ffprobe-installer/ffprobe fluent-ffmpeg sharp
npx playwright install chromium          # firefox / chrome / msedge as needed
```

No system FFmpeg required — static binaries come from npm, which is what makes
this work identically on a laptop and in a slim CI container.

**Two traps the code already handles, so you don't hit them:**

- Playwright ships its own `ffmpeg` (`ms-playwright/ffmpeg-*`). Do **not** reuse
  it: it is a capture-only build with no `libx264`, no `overlay` filter and no
  `drawtext`. `assertCapabilities()` fails loudly if it is picked up.
- pnpm blocks postinstall scripts by default, so `@ffmpeg-installer`'s binary
  arrives without the `+x` bit and fails with EACCES that looks like a missing
  install. [ffmpeg-bin.js](ffmpeg-bin.js) chmods defensively on load.

---

## Layout

```
video/
  config.js            theme, paths, all tunables (env-overridable)
  ffmpeg-bin.js        resolves + validates ffmpeg/ffprobe
  reporter.js          Playwright reporter → artifacts/<module>/logs/*.json
  instrument.js        the one-line spec codemod (+ --undo / --check)
  run.js               `npm run test:video` orchestrator
  build-videos.js      post-run builder (runs standalone too)
  fixtures/
    videoTest.js       drop-in @playwright/test replacement
    cursor-overlay.js  injected in-page HUD
  render/
    cards.js           title + summary + module cards (SVG → sharp)
    overlays.js        per-step overlay track
    subtitles.js       .srt + .vtt
    pipeline.js        webm + overlays + cards → MP4
    merge.js           per-module reel
    htmlReport.js      per-module + combined index.html

artifacts/
  training/                       one self-contained folder per module
    videos/                       raw .webm harvested from test-results/
    final-videos/                 built .mp4 + _module-training.mp4 reel
    subtitles/  traces/  screenshots/  logs/
    reports/index.html            just this module
  users/
    …
  logs/run-manifest.json          run-level: what was filmed this time
  reports/index.html              combined index, links out to the modules
```

`artifacts/` is gitignored.

---

## How a video is assembled

```
Playwright .webm ─┐
                  ├─► overlay composite ─► body.mp4 ─┐
step PNG track ───┘                                  ├─► concat ─► final .mp4
title card ─────────────────────────► title.mp4 ─────┤
summary card ───────────────────────► summary.mp4 ───┘
```

Three encode passes, then a stream-copy concat. Two details that are easy to get
wrong and are load-bearing here:

- **Every segment shares one `ENCODE_ARGS`.** The concat *demuxer* requires
  identical codec, pixel format, resolution, framerate and timebase. An early
  version varied `-r` between cards and body and produced a file that played at
  the wrong speed in QuickTime while looking fine in VLC.
- **Overlays are a concat-demuxer image track, not N `enable='between(t,…)'`
  filters.** One `overlay` filter regardless of step count, instead of a filter
  graph that grows with the test.

Subtitle cues are shifted by the title-card length, since the final MP4 is
`[title][recording][summary]`. Cues authored against raw recording time would
drift by exactly that offset.

---

## Configuration

All via env, all with working defaults ([config.js](config.js)):

| Variable | Default | Purpose |
|---|---|---|
| `VIDEO_BROWSER` | auto | `chrome` \| `chromium` \| `firefox` \| `edge` \| `all` |
| `VIDEO_HEADED` | `0` | watch the run |
| `VIDEO_MODULES` | all 8 | which suites to film |
| `VIDEO_WIDTH` / `VIDEO_HEIGHT` | `1280`×`720` | recording + overlay canvas |
| `VIDEO_FPS` / `VIDEO_CRF` / `VIDEO_PRESET` | `25` / `20` / `veryfast` | encode quality |
| `VIDEO_TITLE_SECONDS` / `VIDEO_SUMMARY_SECONDS` | `3.5` / `4` | card hold |
| `VIDEO_STEP_MIN_MS` | `220` | fold shorter steps into the previous caption |
| `VIDEO_MAX_STEPS` | `60` | ceiling on overlay frames |
| `VIDEO_STEP_CATEGORIES` | `test.step,pw:api,expect` | caption sources |
| `E2E_ENV_LABEL` | `Local Dev` / `CI` | label on the cards |
| `VIDEO_ALLURE` | `0` | also emit Allure results |
| `FFMPEG_PATH` / `FFPROBE_PATH` | npm binaries | use a system build instead |

**Browser selection is strict on purpose.** Branded Chrome and Edge are real
installed applications, not downloads. If you ask for `edge` and it is missing,
the config throws with an install hint rather than silently substituting
Chromium — a QA artifact that misreports the browser on its title card is worse
than one that refuses to build. With no explicit choice it auto-detects Chrome
and falls back to bundled Chromium.

---

## CI

```yaml
- run: pnpm install --frozen-lockfile
- run: npx playwright install --with-deps chromium
- run: npm run video:check            # fails if a spec was added un-instrumented
- run: npm run test:video
  env:
    CI: "1"
    E2E_ENV_LABEL: Staging
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: e2e-demo-videos
    path: qms-app/artifacts
```

`test:video` exits with **Playwright's** code, so CI still gates on the tests.
Videos are built even when tests fail — that is when the recording is most
useful. Only a genuinely broken pipeline (bad ffmpeg, unwritable output) exits 2.

A slim container needs a font, or SVG text renders as boxes:
`apt-get install -y fonts-dejavu-core`.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `artifacts/logs/` empty | `--reporter=...` on the CLI **replaces** the config's reporters, including this one. Don't pass it to `video:record`. |
| Overlay but no cursor | spec not instrumented (`npm run video:check`), or `VIDEO_MODE` unset. |
| `missing: encoder libx264` | Playwright's bundled ffmpeg got picked up. Unset `FFMPEG_PATH`. |
| EACCES on ffmpeg | pnpm skipped the postinstall chmod — handled on load; if it persists run `pnpm approve-builds`. |
| Emoji are white blobs | Only in generated SVG; emoji are colour-layer glyphs that flatten under `fill`. `sesc()` strips them — use it for anything drawn into SVG. |
| Video is blank | An API-only test that never drives a page still records an `about:blank` context. Expected. |
| Wrong playback speed | A segment was encoded with different args. Keep `ENCODE_ARGS` shared. |

---

## Requirement coverage

| # | Requirement | Where |
|---|---|---|
| 1 | Record the browser session | `video: 'on'`, [playwright.video.config.js](../playwright.video.config.js) |
| 2 | Test name on screen | top HUD, [overlays.js](render/overlays.js) |
| 3 | Step titles as overlay | lower third — `test.step` when present, else the action/assert tree |
| 4 | Running / Passed / Failed | status pill + colour-coded rail |
| 5 | Timestamps per step | `mm:ss.cs` start → end on every caption |
| 6 | Execution duration | summary card + HUD clock |
| 7 | Browser + environment | title card, HUD, summary card |
| 8 | Visible cursor | [cursor-overlay.js](fixtures/cursor-overlay.js) |
| 9 | Click highlight | ripple + press dot on `pointerdown` |
| 10 | Typed text | `input` listener; passwords masked |
| 11 | Keyboard shortcuts | `keydown` → key chips (`⌘`, `⇥ Tab`, `↵ Enter`) |
| 12 | Screenshots on failure | `screenshot: 'only-on-failure'` → `artifacts/screenshots/` |
| 13 | Attach videos + traces | harvested and copied by [build-videos.js](build-videos.js) |
| 14 | Subtitles from steps | `.srt` + `.vtt`, [subtitles.js](render/subtitles.js) |
| 15 | Professional MP4 | [pipeline.js](render/pipeline.js) |
| 16 | One video per test | one context per test → one recording |
| 17 | Merged module video | [merge.js](render/merge.js) |
| 18 | Chrome / Firefox / Edge | `VIDEO_BROWSER`, real channels |
| 19 | Local + CI | npm-provided ffmpeg; headless default; artifact upload |
| 20 | Fully automatic | `npm run test:video` |

### Deliberate deviations from the brief

- **`playwright-video` is not used.** It is abandoned and predates Playwright's
  built-in recording, which is what this uses.
- **`node-canvas` is not used.** It needs a cairo/pango toolchain that regularly
  fails to build in CI images. Overlays are SVG rasterised by `sharp`, which
  ships prebuilt binaries.
- **Allure is opt-in** (`VIDEO_ALLURE=1`). It is a test report, not part of a
  video pipeline; the generated HTML report already links every MP4, SRT, trace
  and screenshot.
