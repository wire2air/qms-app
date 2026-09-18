/**
 * Chart colour scales — the JS-side companion to the CSS design tokens.
 *
 * SVG fills can't take CSS custom properties reliably, so ApexCharts needs real
 * hex values. Everything here therefore ships as literal hex in a light and a
 * dark variant, selected by `isDark` from `@/utils/theme.js` (the app's single
 * dark-mode source of truth) rather than by a CSS class.
 *
 * **Categorical palette: Okabe & Ito (2008), "Color Universal Design".** Chosen
 * over Tableau 10 / ColorBrewer because it is the one qualitative set designed
 * from the start to stay separable under protanopia, deuteranopia *and*
 * tritanopia rather than merely surviving a post-hoc check. Two of its eight
 * members are unusable in a themed UI and are dropped:
 *   - black `#000000` — zero chroma (reads as axis ink, not a series) and
 *     invisible on the dark surface;
 *   - yellow `#F0E442` — OKLCH L 0.90, 1.29:1 on white.
 * The remaining six keep their published hue and chroma; only lightness is
 * nudged, and only where the published step misses the per-mode lightness band
 * or the 3:1 contrast floor against the surface the chart actually paints on
 * (`--card`: `#ffffff` light, `#1a222c` dark). Blue, green and vermillion are
 * unchanged from the published palette; sky, orange and purple are darkened.
 *
 * Slot **order** is the CVD-safety mechanism, not decoration — neighbouring
 * slots are the ones that touch in a stack or a legend. All 720 orderings were
 * scored and this one maximises the worst adjacent pair. Measured (OKLab ΔE×100,
 * Machado-Oliveira-Fernandes 2009 at severity 1.0):
 *
 *   light  worst adjacent CVD ΔE 11.0 · normal-vision ΔE 18.0 · all ≥ 3:1
 *   dark   worst adjacent CVD ΔE 11.0 · normal-vision ΔE 17.8 · all ≥ 3:1
 *
 * against targets of ≥ 8 (CVD) and ≥ 15 (normal vision). Assign slots in order
 * and never cycle: a 7th series folds into "Other" or the chart gets facetted.
 * Colour follows the entity, never its rank — a filter that drops a series must
 * not repaint the survivors.
 *
 * Sequential and diverging scales are one-hue / two-hue ramps built on the same
 * Okabe-Ito anchors (blue for sequential, vermillion ↔ blue for diverging).
 * Blue↔orange is the diverging pair that survives red-green CVD, because it
 * rides the intact blue-yellow opponent axis; red↔green does not. The diverging
 * midpoint is the app's own `--divider` token so "no deviation" reads as the
 * same neutral the rest of the UI uses.
 */

/** Categorical slots, in assignment order. Six is the cap — see the header. */
export const CATEGORICAL_LIGHT = [
  '#0072b2', // blue       (Okabe-Ito, unchanged)
  '#009e73', // green      (Okabe-Ito, unchanged)
  '#d55e00', // vermillion (Okabe-Ito, unchanged)
  '#3d9dd1', // sky        (Okabe-Ito #56B4E9 darkened to clear 3:1 on white)
  '#cc8600', // orange     (Okabe-Ito #E69F00 darkened to clear 3:1 on white)
  '#cc79a7', // purple     (Okabe-Ito, unchanged)
]

export const CATEGORICAL_DARK = [
  '#0072b2', // blue
  '#009e73', // green
  '#d55e00', // vermillion
  '#3d9dd1', // sky
  '#c88300', // orange     (held inside the dark lightness band)
  '#c774a2', // purple     (held inside the dark lightness band)
]

/** Sequential (magnitude). Index 0 = near zero, last = maximum. */
export const SEQUENTIAL_LIGHT = [
  '#d5f3ff',
  '#b1d7f6',
  '#83bcea',
  '#57a1da',
  '#2b86c5',
  '#006baa',
  '#00518a',
]

export const SEQUENTIAL_DARK = [
  '#002649',
  '#003e70',
  '#005994',
  '#0774b5',
  '#3e91cf',
  '#6caee3',
  '#9bcaf1',
]

/**
 * Diverging (polarity). Nine steps; index 4 is the neutral midpoint and equals
 * the `--divider` token. Negative arm is vermillion, positive arm is blue.
 */
export const DIVERGING_LIGHT = [
  '#982800',
  '#c24e00',
  '#e17a41',
  '#f6aa84',
  '#e5e7eb', // neutral — matches --divider (light)
  '#92c5ef',
  '#57a1da',
  '#1b7dbd',
  '#005a96',
]

export const DIVERGING_DARK = [
  '#f3a177',
  '#dd7235',
  '#bc4700',
  '#932400',
  '#2d3748', // neutral — matches --divider (dark)
  '#005590',
  '#1077b8',
  '#4d9bd6',
  '#87beeb',
]

/**
 * Fill for a cell whose value was withheld by small-cell privacy suppression.
 * Deliberately a low-chroma neutral that appears in no scale above, so a
 * suppressed cell can never be mistaken for a low value. Matches
 * `--input-border` in each mode.
 */
export const SUPPRESSED_FILL = { light: '#cbd5e1', dark: '#4a5568' }

/**
 * Chart chrome fallbacks, mirroring the tokens of the same name in
 * `src/css/base.css`. `resolveChartChrome()` prefers the live CSS custom
 * property so these only apply outside a browser (unit tests, SSR).
 */
const CHROME_FALLBACK = {
  light: { grid: '#e5e7eb', text: '#617289', ink: '#111418', surface: '#ffffff' },
  dark: { grid: '#2d3748', text: '#a0aec0', ink: '#ffffff', surface: '#1a222c' },
}

/** Categorical slots for the current mode. */
export function categoricalScale(dark) {
  return dark ? CATEGORICAL_DARK : CATEGORICAL_LIGHT
}

/** Sequential ramp for the current mode, near-zero first. */
export function sequentialScale(dark) {
  return dark ? SEQUENTIAL_DARK : SEQUENTIAL_LIGHT
}

/** Diverging ramp for the current mode, negative arm first, neutral at index 4. */
export function divergingScale(dark) {
  return dark ? DIVERGING_DARK : DIVERGING_LIGHT
}

/** The suppression fill for the current mode. */
export function suppressedFill(dark) {
  return dark ? SUPPRESSED_FILL.dark : SUPPRESSED_FILL.light
}

/**
 * Ordinal ramp (funnel stages, age bands, tiers) — one hue, monotone lightness,
 * so the reader sees the ORDER in the colour. Distinct from categorical: if
 * swapping two members would change the meaning, the encoding is ordinal.
 *
 * The two palest sequential steps are skipped because an ordinal mark must stay
 * visible against the surface (≥ 2:1), where a sequential "near zero" step is
 * allowed to recede into it. Verified: the light end clears 2.03:1 on `#ffffff`
 * and 2.18:1 on `#1a222c`.
 *
 * **Six steps is a hard cap.** The usable lightness window is ~0.35 wide and
 * adjacent ordinal steps must differ by ΔL ≥ 0.06 to be told apart, so a
 * seventh step is measurably indistinguishable from its neighbour. Past six,
 * this returns a single hue: mark position and the direct labels already carry
 * the order, and seven near-identical blues carry nothing but noise.
 */
const ORDINAL_OFFSET = 2
export const ORDINAL_MAX_STEPS = 6

export function ordinalScale(dark, count = 5) {
  const steps = sequentialScale(dark).slice(ORDINAL_OFFSET)
  const n = Math.max(1, count)
  if (n === 1 || n > ORDINAL_MAX_STEPS) return [steps[steps.length - 1]]
  return Array.from({ length: n }, (_, i) => lerpHex(steps, (i / (n - 1)) * (steps.length - 1)))
}

/** Linear sample of a hex ramp at a fractional index — keeps L monotone. */
function lerpHex(steps, at) {
  const lo = Math.floor(at)
  const hi = Math.min(steps.length - 1, lo + 1)
  const t = at - lo
  const parse = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [a, b] = [parse(steps[lo]), parse(steps[hi])]
  return (
    '#' +
    a
      .map((v, i) => Math.round(v + (b[i] - v) * t))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  )
}

/**
 * Grid / axis / tooltip colours for the current mode.
 *
 * Read from the live CSS custom properties so the chart chrome can never drift
 * from `base.css` — the raw (unprefixed) token names are declared on `:root`
 * and `.dark`, and `.dark` sits on `<html>`, so one `getComputedStyle` of
 * `documentElement` resolves whichever is active. `dark` is still passed in
 * because the *reactivity* comes from the `isDark` ref, not from the DOM read.
 */
export function resolveChartChrome(dark) {
  const fallback = dark ? CHROME_FALLBACK.dark : CHROME_FALLBACK.light
  if (typeof document === 'undefined' || !document.documentElement) return { ...fallback }
  const style = getComputedStyle(document.documentElement)
  function token(name, fb) {
    return style.getPropertyValue(name).trim() || fb
  }
  return {
    grid: token('--divider', fallback.grid),
    text: token('--secondary', fallback.text),
    ink: token('--on-main', fallback.ink),
    surface: token('--card', fallback.surface),
  }
}

/**
 * ApexCharts `plotOptions.heatmap.colorScale.ranges` for a numeric domain.
 *
 * ApexCharts has no first-class "no value" heatmap cell, so BaseChart maps
 * suppressed cells to `SUPPRESSED_SENTINEL` and this builds a dedicated range
 * that paints them with the neutral suppression fill — never a scale step, so a
 * withheld cell is visually distinct from a zero cell.
 */
export const SUPPRESSED_SENTINEL = -999999

export function heatmapRanges({ min = 0, max = 1, dark = false, diverging = false } = {}) {
  const scale = diverging ? divergingScale(dark) : sequentialScale(dark)
  const lo = Number.isFinite(min) ? min : 0
  const hi = Number.isFinite(max) && max > lo ? max : lo + 1
  const width = (hi - lo) / scale.length
  const ranges = scale.map((color, i) => ({
    from: lo + width * i,
    // last band swallows the max so the top value is never left uncoloured
    to: i === scale.length - 1 ? hi : lo + width * (i + 1),
    color,
  }))
  return [
    {
      from: SUPPRESSED_SENTINEL,
      to: SUPPRESSED_SENTINEL,
      color: suppressedFill(dark),
      name: 'Suppressed',
    },
    ...ranges,
  ]
}
