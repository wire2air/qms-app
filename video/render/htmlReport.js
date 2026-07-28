/**
 * Self-contained HTML index for the produced videos.
 *
 * Paths are written RELATIVE to artifacts/reports/ so the whole `artifacts/`
 * folder can be zipped, moved, or published as a CI artifact and still work.
 * Absolute paths were the first version and broke the moment it left the
 * machine that produced it.
 */
import fs from 'node:fs'
import path from 'node:path'
import { DIRS, THEME, STATUS_ICON, STATUS_COLOR, formatDuration, esc } from '../config.js'

const rel = (p) => (p ? path.relative(DIRS.reports, p).split(path.sep).join('/') : null)

export function writeHtmlReport(tests, videosById, reels, runMeta) {
  fs.mkdirSync(DIRS.reports, { recursive: true })

  const byModule = new Map()
  for (const t of tests) {
    if (!byModule.has(t.project)) byModule.set(t.project, [])
    byModule.get(t.project).push(t)
  }

  const totals = {
    total: tests.length,
    expected: tests.filter((t) => t.isExpected).length,
    unexpected: tests.filter((t) => !t.isExpected).length,
    withVideo: tests.filter((t) => videosById.has(t.id)).length,
    duration: tests.reduce((a, t) => a + t.durationMs, 0),
  }

  const moduleSections = [...byModule.entries()]
    .map(([mod, list]) => {
      const reel = reels.get(mod)
      const cards = list
        .map((t) => {
          const v = videosById.get(t.id)
          const color = t.isExpected ? STATUS_COLOR[t.status] || THEME.textDim : THEME.fail
          const icon = STATUS_ICON[t.status] || '•'
          const badge = t.isExpected
            ? t.status === 'passed' ? 'passed' : `${t.status} (expected)`
            : `${t.status} — UNEXPECTED`

          const player = v
            ? `<video controls preload="metadata" playsinline src="${esc(rel(v.finalPath))}">
                 <track default kind="subtitles" srclang="en" label="Steps" src="${esc(rel(v.vttPath))}">
               </video>`
            : `<div class="novideo">No recording captured for this test</div>`

          const steps = t.steps
            .map(
              (s, i) => `<li>
                 <span class="n">${String(i + 1).padStart(2, '0')}</span>
                 <span class="t">${esc(s.title)}</span>
                 <span class="s" style="color:${STATUS_COLOR[s.status] || THEME.textDim}">${STATUS_ICON[s.status] || '•'}</span>
               </li>`,
            )
            .join('')

          const links = [
            v && `<a href="${esc(rel(v.finalPath))}" download>MP4</a>`,
            v && `<a href="${esc(rel(v.srtPath))}" download>SRT</a>`,
            t.attachments.traces?.[0] && `<a href="${esc(rel(t.attachments.traces[0]))}" download>Trace</a>`,
            t.attachments.screenshots?.[0] && `<a href="${esc(rel(t.attachments.screenshots[0]))}">Screenshot</a>`,
          ]
            .filter(Boolean)
            .join('')

          return `<article class="card">
            <header>
              <h3>${esc(t.title)}</h3>
              <span class="badge" style="--c:${color}">${icon} ${esc(badge)}</span>
            </header>
            <p class="meta">${esc(t.browser)} · ${esc(t.environment)} · ${formatDuration(t.durationMs)} · ${t.steps.length} steps</p>
            ${player}
            <div class="links">${links}</div>
            <details><summary>${t.steps.length} steps</summary><ol class="steps">${steps}</ol></details>
            ${t.error ? `<pre class="err">${esc(t.error.message.split('\n').slice(0, 6).join('\n'))}</pre>` : ''}
          </article>`
        })
        .join('')

      return `<section>
        <div class="modhead">
          <h2>${esc(mod)}</h2>
          ${reel ? `<a class="reel" href="${esc(rel(reel))}" download>▶ Module reel</a>` : ''}
        </div>
        <div class="grid">${cards}</div>
      </section>`
    })
    .join('')

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>E2E Demo Videos — ${esc(runMeta.environment)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; background:${THEME.bg}; color:${THEME.text};
         font:16px/1.55 ${THEME.fontStack}; }
  .wrap { max-width:1400px; margin:0 auto; padding:40px 24px 80px; }
  h1 { font-size:34px; margin:0 0 6px; }
  .sub { color:${THEME.textDim}; margin:0 0 28px; }
  .totals { display:flex; flex-wrap:wrap; gap:14px; margin-bottom:40px; }
  .stat { background:${THEME.panelSolid}; border:1px solid ${THEME.border};
          border-radius:12px; padding:14px 20px; min-width:150px; }
  .stat b { display:block; font-size:28px; }
  .stat span { color:${THEME.textDim}; font-size:13px; letter-spacing:1.4px;
               text-transform:uppercase; }
  .modhead { display:flex; align-items:center; gap:16px; margin:36px 0 16px;
             border-bottom:1px solid ${THEME.border}; padding-bottom:10px; }
  h2 { font-size:23px; margin:0; }
  .reel { margin-left:auto; color:${THEME.accent}; text-decoration:none;
          border:1px solid ${THEME.accent}; padding:7px 15px; border-radius:8px; font-size:14px; }
  .grid { display:grid; gap:22px; grid-template-columns:repeat(auto-fill,minmax(430px,1fr)); }
  .card { background:${THEME.panelSolid}; border:1px solid ${THEME.border};
          border-radius:14px; padding:18px; overflow:hidden; }
  .card header { display:flex; gap:12px; align-items:flex-start; }
  .card h3 { font-size:17px; margin:0 0 6px; flex:1; }
  .badge { border:1px solid var(--c); color:var(--c); border-radius:999px;
           padding:3px 11px; font-size:12px; white-space:nowrap; }
  .meta { color:${THEME.textDim}; font-size:13px; margin:0 0 12px; }
  video { width:100%; border-radius:10px; background:#000; display:block; }
  .novideo { padding:36px; text-align:center; color:${THEME.textDim};
             border:1px dashed ${THEME.border}; border-radius:10px; }
  .links { display:flex; gap:10px; margin:12px 0 6px; flex-wrap:wrap; }
  .links a { font-size:13px; color:${THEME.accent}; text-decoration:none;
             border:1px solid ${THEME.border}; padding:5px 11px; border-radius:7px; }
  details { margin-top:8px; }
  summary { cursor:pointer; color:${THEME.textDim}; font-size:14px; }
  .steps { list-style:none; padding:10px 0 0; margin:0; max-height:280px; overflow:auto; }
  .steps li { display:flex; gap:10px; padding:5px 0; font-size:14px;
              border-bottom:1px solid rgba(148,163,184,.12); }
  .steps .n { color:${THEME.textDim}; font-family:${THEME.monoStack}; font-size:12px; }
  .steps .t { flex:1; }
  .err { background:rgba(239,68,68,.09); border:1px solid rgba(239,68,68,.35);
         color:#FCA5A5; padding:11px; border-radius:8px; font-size:12px;
         white-space:pre-wrap; overflow:auto; margin-top:12px; }
  @media (max-width:640px){ .grid{grid-template-columns:1fr} }
</style></head>
<body><div class="wrap">
  <h1>E2E Demo Videos</h1>
  <p class="sub">${esc(runMeta.environment)} · generated ${esc(new Date().toLocaleString())}</p>
  <div class="totals">
    <div class="stat"><b>${totals.total}</b><span>Tests</span></div>
    <div class="stat"><b style="color:${THEME.pass}">${totals.expected}</b><span>As expected</span></div>
    <div class="stat"><b style="color:${totals.unexpected ? THEME.fail : THEME.textDim}">${totals.unexpected}</b><span>Unexpected</span></div>
    <div class="stat"><b>${totals.withVideo}</b><span>Videos</span></div>
    <div class="stat"><b>${formatDuration(totals.duration)}</b><span>Total runtime</span></div>
  </div>
  ${moduleSections}
</div></body></html>`

  const out = path.join(DIRS.reports, 'index.html')
  fs.writeFileSync(out, html, 'utf8')
  return out
}
