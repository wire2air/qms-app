/**
 * Intro and outro cards, rendered as SVG and rasterised by sharp.
 *
 * SVG rather than node-canvas on purpose: node-canvas needs a native toolchain
 * (cairo/pango) that routinely fails to build in CI images, while sharp ships
 * prebuilt binaries for every platform we care about. The trade-off is that text
 * layout is ours to do by hand — hence the explicit truncation and the measured
 * line heights below, rather than relying on wrapping we do not control.
 *
 * The font stack ends in DejaVu Sans / Liberation Sans because those are what
 * exist in slim Linux containers; without them CI renders boxes.
 */
import sharp from 'sharp'
import { VIDEO, THEME, SVG_STATUS_GLYPH, STATUS_COLOR, formatDuration, sesc, clamp } from '../config.js'

const W = () => VIDEO.width
const H = () => VIDEO.height

function shell(inner) {
  return `<svg width="${W()}" height="${H()}" viewBox="0 0 ${W()} ${H()}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0B1220"/>
      <stop offset="55%" stop-color="#111C2F"/>
      <stop offset="100%" stop-color="#0B1220"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#38BDF8"/>
      <stop offset="100%" stop-color="#818CF8"/>
    </linearGradient>
  </defs>
  <rect width="${W()}" height="${H()}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${W()}" height="6" fill="url(#accent)"/>
  ${inner}
</svg>`
}

function metaRow(x, y, label, value) {
  return `
    <text x="${x}" y="${y}" font-family="${THEME.fontStack}" font-size="15"
          letter-spacing="1.6" fill="${THEME.textDim}">${sesc(label.toUpperCase())}</text>
    <text x="${x}" y="${y + 30}" font-family="${THEME.fontStack}" font-size="24"
          font-weight="600" fill="${THEME.text}">${sesc(value)}</text>`
}

/** Opening card: what this test is, where it ran, and how many steps. */
export async function renderTitleCard(test, outPath) {
  const browser = [test.browser, test.channel].filter(Boolean).join(' · ')
  const suite = test.describePath.join(' › ') || test.project

  const inner = `
    <text x="80" y="150" font-family="${THEME.fontStack}" font-size="17"
          letter-spacing="3.4" fill="${THEME.accent}">AUTOMATED TEST EXECUTION</text>

    <text x="80" y="232" font-family="${THEME.fontStack}" font-size="52"
          font-weight="700" fill="${THEME.text}">${sesc(clamp(test.title, 40))}</text>

    <text x="80" y="284" font-family="${THEME.fontStack}" font-size="24"
          fill="${THEME.textDim}">${sesc(clamp(suite, 74))}</text>

    <line x1="80" y1="332" x2="${W() - 80}" y2="332" stroke="${THEME.border}" stroke-width="1"/>

    ${metaRow(80, 388, 'Module', test.project)}
    ${metaRow(390, 388, 'Browser', browser || 'chromium')}
    ${metaRow(700, 388, 'Environment', test.environment)}
    ${metaRow(1000, 388, 'Steps', String(test.steps.length))}

    <text x="80" y="${H() - 74}" font-family="${THEME.monoStack}" font-size="16"
          fill="${THEME.textDim}">${sesc(clamp(test.file, 88))}</text>
    <text x="${W() - 80}" y="${H() - 74}" text-anchor="end"
          font-family="${THEME.monoStack}" font-size="16" fill="${THEME.textDim}"
          >${sesc(new Date(test.startedAt).toLocaleString())}</text>`

  await sharp(Buffer.from(shell(inner))).png().toFile(outPath)
  return outPath
}

/**
 * Closing card: the step ledger with per-step status and the total duration —
 * the "Step 1 … ✅ Passed / Duration: 00:00:18" summary.
 *
 * Long tests are truncated to what fits two columns rather than shrinking the
 * type into unreadability; the count of hidden steps is stated explicitly so the
 * card never implies the test did less than it did.
 */
export async function renderSummaryCard(test, outPath) {
  const PER_COL = 9
  const MAX = PER_COL * 2
  const shown = test.steps.slice(0, MAX)
  const hidden = test.steps.length - shown.length

  const verdictKey = test.status === 'passed' ? 'passed' : test.status
  const verdictColor = test.isExpected ? STATUS_COLOR[verdictKey] : THEME.fail
  const verdictText = test.isExpected
    ? test.status === 'passed'
      ? 'PASSED'
      : `${test.status.toUpperCase()} (EXPECTED)`
    : test.status.toUpperCase()

  const rows = shown
    .map((s, i) => {
      const col = i < PER_COL ? 0 : 1
      const row = i % PER_COL
      const x = 80 + col * 590
      const y = 250 + row * 42
      const color = STATUS_COLOR[s.status] || THEME.textDim
      const icon = SVG_STATUS_GLYPH[s.status] || '·'
      return `
        <text x="${x}" y="${y}" font-family="${THEME.monoStack}" font-size="16"
              fill="${THEME.textDim}">${String(i + 1).padStart(2, '0')}</text>
        <text x="${x + 34}" y="${y}" font-family="${THEME.fontStack}" font-size="19"
              fill="${THEME.text}">${sesc(clamp(s.title, 40))}</text>
        <text x="${x + 500}" y="${y}" text-anchor="end" font-family="${THEME.fontStack}"
              font-size="18" fill="${color}">${icon}</text>`
    })
    .join('')

  const hiddenNote = hidden
    ? `<text x="80" y="${250 + PER_COL * 42 + 16}" font-family="${THEME.fontStack}"
             font-size="16" fill="${THEME.textDim}">+ ${hidden} further step${hidden === 1 ? '' : 's'} — see the subtitle track</text>`
    : ''

  const inner = `
    <text x="80" y="118" font-family="${THEME.fontStack}" font-size="17"
          letter-spacing="3.4" fill="${THEME.accent}">EXECUTION SUMMARY</text>
    <text x="80" y="176" font-family="${THEME.fontStack}" font-size="40"
          font-weight="700" fill="${THEME.text}">${sesc(clamp(test.title, 36))}</text>

    <rect x="${W() - 372}" y="120" width="292" height="72" rx="10"
          fill="${verdictColor}" fill-opacity="0.14" stroke="${verdictColor}" stroke-width="2"/>
    <text x="${W() - 226}" y="166" text-anchor="middle" font-family="${THEME.fontStack}"
          font-size="30" font-weight="700" fill="${verdictColor}">${sesc(verdictText)}</text>

    <line x1="80" y1="212" x2="${W() - 80}" y2="212" stroke="${THEME.border}" stroke-width="1"/>
    ${rows}
    ${hiddenNote}

    <line x1="80" y1="${H() - 118}" x2="${W() - 80}" y2="${H() - 118}"
          stroke="${THEME.border}" stroke-width="1"/>
    <text x="80" y="${H() - 66}" font-family="${THEME.fontStack}" font-size="15"
          letter-spacing="1.6" fill="${THEME.textDim}">DURATION</text>
    <text x="80" y="${H() - 34}" font-family="${THEME.monoStack}" font-size="30"
          font-weight="700" fill="${THEME.text}">${formatDuration(test.durationMs)}</text>

    <text x="440" y="${H() - 66}" font-family="${THEME.fontStack}" font-size="15"
          letter-spacing="1.6" fill="${THEME.textDim}">STEPS</text>
    <text x="440" y="${H() - 34}" font-family="${THEME.monoStack}" font-size="30"
          font-weight="700" fill="${THEME.text}">${test.steps.length}</text>

    <text x="700" y="${H() - 66}" font-family="${THEME.fontStack}" font-size="15"
          letter-spacing="1.6" fill="${THEME.textDim}">BROWSER</text>
    <text x="700" y="${H() - 34}" font-family="${THEME.fontStack}" font-size="26"
          font-weight="600" fill="${THEME.text}">${sesc(test.browser)}</text>

    <text x="1000" y="${H() - 66}" font-family="${THEME.fontStack}" font-size="15"
          letter-spacing="1.6" fill="${THEME.textDim}">ENVIRONMENT</text>
    <text x="1000" y="${H() - 34}" font-family="${THEME.fontStack}" font-size="26"
          font-weight="600" fill="${THEME.text}">${sesc(test.environment)}</text>`

  await sharp(Buffer.from(shell(inner))).png().toFile(outPath)
  return outPath
}

/** Divider shown between tests in a merged module reel. */
export async function renderModuleCard(moduleName, tests, outPath) {
  const passed = tests.filter((t) => t.isExpected).length
  const total = tests.length
  const duration = tests.reduce((a, t) => a + t.durationMs, 0)

  const inner = `
    <text x="80" y="220" font-family="${THEME.fontStack}" font-size="17"
          letter-spacing="3.4" fill="${THEME.accent}">MODULE REGRESSION REEL</text>
    <text x="80" y="316" font-family="${THEME.fontStack}" font-size="72"
          font-weight="700" fill="${THEME.text}">${sesc(clamp(moduleName, 26))}</text>
    <line x1="80" y1="372" x2="${W() - 80}" y2="372" stroke="${THEME.border}" stroke-width="1"/>
    ${metaRow(80, 432, 'Test cases', String(total))}
    ${metaRow(390, 432, 'As expected', `${passed} / ${total}`)}
    ${metaRow(700, 432, 'Total duration', formatDuration(duration))}
    ${metaRow(1000, 432, 'Environment', tests[0]?.environment || '—')}`

  await sharp(Buffer.from(shell(inner))).png().toFile(outPath)
  return outPath
}
