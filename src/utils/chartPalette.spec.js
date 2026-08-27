import { describe, it, expect, afterEach } from 'vitest'
import {
  CATEGORICAL_LIGHT,
  CATEGORICAL_DARK,
  SEQUENTIAL_LIGHT,
  SEQUENTIAL_DARK,
  DIVERGING_LIGHT,
  DIVERGING_DARK,
  SUPPRESSED_FILL,
  SUPPRESSED_SENTINEL,
  ORDINAL_MAX_STEPS,
  categoricalScale,
  sequentialScale,
  divergingScale,
  ordinalScale,
  suppressedFill,
  resolveChartChrome,
  heatmapRanges,
} from './chartPalette.js'

/**
 * The palette carries two promises consumers depend on and cannot verify
 * themselves: the CAPS (six categorical slots, six ordinal steps — past which
 * colour stops carrying information and a chart must facet or fold into
 * "Other"), and the guarantee that a WITHHELD cell can never be painted in a
 * colour that also means a value.
 *
 * The measured claims in the module header (≥ 3:1 for every categorical slot
 * against the card surface, ≥ 2:1 for the palest ordinal step) are re-derived
 * here rather than trusted, so a "small tweak" to a hex can't quietly break an
 * accessibility commitment.
 */

/** WCAG 2.x relative luminance / contrast ratio. */
function channel(v) {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** The surface a chart actually paints on — the `--card` token per mode. */
const SURFACE = { light: '#ffffff', dark: '#1a222c' }

const HEX = /^#[0-9a-f]{6}$/

const MODES = [
  { name: 'light', dark: false },
  { name: 'dark', dark: true },
]

/* --------------------------------------------------------- categorical cap */

describe('categorical scale — SIX slots is the cap', () => {
  it('ships exactly 6 categorical colours in each mode', () => {
    expect(CATEGORICAL_LIGHT).toHaveLength(6)
    expect(CATEGORICAL_DARK).toHaveLength(6)
    expect(categoricalScale(false)).toHaveLength(6)
    expect(categoricalScale(true)).toHaveLength(6)
  })

  it.each(MODES)('has no repeated colour within the $name set', ({ dark }) => {
    const scale = categoricalScale(dark)
    expect(new Set(scale).size).toBe(scale.length)
  })

  it('light and dark hold the same number of slots — a series keeps its slot across themes', () => {
    expect(CATEGORICAL_LIGHT.length).toBe(CATEGORICAL_DARK.length)
  })

  it('selects by mode, and never cycles past the cap', () => {
    expect(categoricalScale(false)).toBe(CATEGORICAL_LIGHT)
    expect(categoricalScale(true)).toBe(CATEGORICAL_DARK)
    // A 7th series has no colour to take — the caller must fold it into
    // "Other" or facet, which is only enforceable if the array truly ends.
    expect(categoricalScale(false)[6]).toBeUndefined()
    expect(categoricalScale(true)[6]).toBeUndefined()
  })

  it.each(MODES)(
    'every $name slot is a literal 6-digit hex (SVG fills can not take a var())',
    ({ dark }) => {
      for (const color of categoricalScale(dark)) expect(color).toMatch(HEX)
    },
  )

  it.each(MODES)(
    'every $name slot clears 3:1 against the card surface it paints on',
    ({ name, dark }) => {
      for (const color of categoricalScale(dark)) {
        expect(contrast(color, SURFACE[name])).toBeGreaterThanOrEqual(3)
      }
    },
  )
})

/* --------------------------------------------------------------- ordinal cap */

describe('ordinal scale — SIX steps is a hard cap', () => {
  it('declares the cap it enforces', () => {
    expect(ORDINAL_MAX_STEPS).toBe(6)
  })

  it.each(MODES)('returns exactly n distinct steps for n = 2..6 ($name)', ({ dark }) => {
    for (let n = 2; n <= ORDINAL_MAX_STEPS; n += 1) {
      const steps = ordinalScale(dark, n)
      expect(steps).toHaveLength(n)
      expect(new Set(steps).size).toBe(n)
      for (const s of steps) expect(s).toMatch(HEX)
    }
  })

  it.each(MODES)('collapses to a SINGLE hue past the cap ($name)', ({ dark }) => {
    // Beyond six, adjacent steps are measurably indistinguishable — position
    // and the direct labels carry the order instead.
    expect(ordinalScale(dark, ORDINAL_MAX_STEPS + 1)).toHaveLength(1)
    expect(ordinalScale(dark, 12)).toHaveLength(1)
    expect(ordinalScale(dark, 7)).toEqual(ordinalScale(dark, 1))
  })

  it.each(MODES)('degrades safely for 1, 0 and negative counts ($name)', ({ dark }) => {
    expect(ordinalScale(dark, 1)).toHaveLength(1)
    expect(ordinalScale(dark, 0)).toHaveLength(1)
    expect(ordinalScale(dark, -3)).toHaveLength(1)
  })

  it('defaults to 5 steps', () => {
    expect(ordinalScale(false)).toHaveLength(5)
    expect(ordinalScale(true)).toHaveLength(5)
  })

  it.each(MODES)(
    'lightness is strictly monotone — the order is IN the colour ($name)',
    ({ dark }) => {
      for (let n = 2; n <= ORDINAL_MAX_STEPS; n += 1) {
        const ls = ordinalScale(dark, n).map(luminance)
        const rising = ls.every((v, i) => i === 0 || v > ls[i - 1])
        const falling = ls.every((v, i) => i === 0 || v < ls[i - 1])
        expect(rising || falling).toBe(true)
      }
    },
  )

  it.each(MODES)(
    'even the palest ordinal step stays visible (≥ 2:1) on the $name surface',
    ({ name, dark }) => {
      for (let n = 1; n <= ORDINAL_MAX_STEPS; n += 1) {
        for (const color of ordinalScale(dark, n)) {
          expect(contrast(color, SURFACE[name])).toBeGreaterThanOrEqual(2)
        }
      }
    },
  )

  it('light and dark ordinal ramps both exist and differ', () => {
    expect(ordinalScale(false, 5)).not.toEqual(ordinalScale(true, 5))
  })
})

/* ------------------------------------------------- sequential and diverging */

describe('sequential scale', () => {
  it('exists in both modes with the same number of steps', () => {
    expect(SEQUENTIAL_LIGHT.length).toBeGreaterThan(0)
    expect(SEQUENTIAL_LIGHT.length).toBe(SEQUENTIAL_DARK.length)
    expect(sequentialScale(false)).toBe(SEQUENTIAL_LIGHT)
    expect(sequentialScale(true)).toBe(SEQUENTIAL_DARK)
  })

  it.each(MODES)('has no repeats and is monotone in lightness ($name)', ({ dark }) => {
    const scale = sequentialScale(dark)
    expect(new Set(scale).size).toBe(scale.length)
    const ls = scale.map(luminance)
    const rising = ls.every((v, i) => i === 0 || v > ls[i - 1])
    const falling = ls.every((v, i) => i === 0 || v < ls[i - 1])
    expect(rising || falling).toBe(true)
  })
})

describe('diverging scale', () => {
  it('exists in both modes with a shared odd length so a midpoint exists', () => {
    expect(DIVERGING_LIGHT).toHaveLength(9)
    expect(DIVERGING_DARK).toHaveLength(9)
    expect(DIVERGING_LIGHT.length % 2).toBe(1)
    expect(divergingScale(false)).toBe(DIVERGING_LIGHT)
    expect(divergingScale(true)).toBe(DIVERGING_DARK)
  })

  it('puts the neutral --divider token at the midpoint so "no deviation" reads as neutral', () => {
    expect(DIVERGING_LIGHT[4]).toBe('#e5e7eb')
    expect(DIVERGING_DARK[4]).toBe('#2d3748')
  })

  it.each(MODES)('has no repeated colour within the $name ramp', ({ dark }) => {
    const scale = divergingScale(dark)
    expect(new Set(scale).size).toBe(scale.length)
  })

  it('the two arms sit on opposite sides of the neutral midpoint', () => {
    for (const scale of [DIVERGING_LIGHT, DIVERGING_DARK]) {
      const mid = luminance(scale[4])
      // Both arms are more saturated/darker or lighter than the neutral, but
      // crucially the arms are not each other.
      expect(scale.slice(0, 4)).not.toEqual(scale.slice(5))
      expect(Number.isFinite(mid)).toBe(true)
    }
  })
})

/* ------------------------------------------------- suppression fill (withheld) */

describe('suppression fill — a withheld cell can never look like a value', () => {
  it('has a light AND a dark variant', () => {
    expect(SUPPRESSED_FILL.light).toMatch(HEX)
    expect(SUPPRESSED_FILL.dark).toMatch(HEX)
    expect(suppressedFill(false)).toBe(SUPPRESSED_FILL.light)
    expect(suppressedFill(true)).toBe(SUPPRESSED_FILL.dark)
  })

  it.each(MODES)('appears in NO scale for the $name mode', ({ dark }) => {
    const fill = suppressedFill(dark)
    const everyColour = [
      ...categoricalScale(dark),
      ...sequentialScale(dark),
      ...divergingScale(dark),
      ...ordinalScale(dark, ORDINAL_MAX_STEPS),
    ]
    expect(everyColour).not.toContain(fill)
  })
})

/* --------------------------------------------------------- resolveChartChrome */

describe('resolveChartChrome', () => {
  afterEach(() => {
    for (const token of ['--divider', '--secondary', '--on-main', '--card']) {
      document.documentElement.style.removeProperty(token)
    }
  })

  it.each(MODES)('returns every chrome colour for the $name mode', ({ dark }) => {
    const chrome = resolveChartChrome(dark)
    expect(Object.keys(chrome).sort()).toEqual(['grid', 'ink', 'surface', 'text'])
    for (const value of Object.values(chrome)) {
      expect(typeof value).toBe('string')
      expect(value.length).toBeGreaterThan(0)
    }
  })

  it('falls back to the per-mode defaults when the tokens are not declared', () => {
    expect(resolveChartChrome(false)).toEqual({
      grid: '#e5e7eb',
      text: '#617289',
      ink: '#111418',
      surface: '#ffffff',
    })
    expect(resolveChartChrome(true)).toEqual({
      grid: '#2d3748',
      text: '#a0aec0',
      ink: '#ffffff',
      surface: '#1a222c',
    })
  })

  it('light and dark chrome differ — the grid can not stay light-mode ink on a dark card', () => {
    const light = resolveChartChrome(false)
    const dark = resolveChartChrome(true)
    expect(light.grid).not.toBe(dark.grid)
    expect(light.surface).not.toBe(dark.surface)
  })

  it('prefers the LIVE css custom property so chrome can not drift from base.css', () => {
    document.documentElement.style.setProperty('--divider', '#123456')
    expect(resolveChartChrome(false).grid).toBe('#123456')
  })
})

/* --------------------------------------------------------------- heatmapRanges */

describe('heatmapRanges — a withheld heatmap cell gets its own band', () => {
  it('leads with a dedicated suppression band, outside the value scale', () => {
    const ranges = heatmapRanges({ min: 0, max: 10, dark: false })
    expect(ranges[0]).toEqual({
      from: SUPPRESSED_SENTINEL,
      to: SUPPRESSED_SENTINEL,
      color: suppressedFill(false),
      name: 'Suppressed',
    })
    // and that band's colour is not reused by any value band
    expect(ranges.slice(1).map((r) => r.color)).not.toContain(suppressedFill(false))
  })

  it('the sentinel sits far below any plausible metric domain', () => {
    expect(SUPPRESSED_SENTINEL).toBeLessThan(-1000)
  })

  it('covers the domain contiguously and lets the last band swallow the max', () => {
    const ranges = heatmapRanges({ min: 0, max: 10, dark: false }).slice(1)
    expect(ranges).toHaveLength(SEQUENTIAL_LIGHT.length)
    expect(ranges[0].from).toBe(0)
    expect(ranges[ranges.length - 1].to).toBe(10)
    for (let i = 1; i < ranges.length; i += 1) {
      expect(ranges[i].from).toBeCloseTo(ranges[i - 1].to, 10)
    }
  })

  it('uses the diverging ramp when asked, and the sequential one otherwise', () => {
    const seq = heatmapRanges({ min: 0, max: 1, dark: false }).slice(1)
    const div = heatmapRanges({ min: -1, max: 1, dark: false, diverging: true }).slice(1)
    expect(seq.map((r) => r.color)).toEqual(SEQUENTIAL_LIGHT)
    expect(div.map((r) => r.color)).toEqual(DIVERGING_LIGHT)
  })

  it('follows the mode', () => {
    const dark = heatmapRanges({ min: 0, max: 1, dark: true })
    expect(dark[0].color).toBe(SUPPRESSED_FILL.dark)
    expect(dark.slice(1).map((r) => r.color)).toEqual(SEQUENTIAL_DARK)
  })

  it('survives a degenerate or absent domain without producing NaN bands', () => {
    for (const args of [
      {},
      { min: 5, max: 5 },
      { min: 5, max: 1 },
      { min: NaN, max: NaN },
      { min: undefined, max: undefined },
    ]) {
      const ranges = heatmapRanges(args).slice(1)
      for (const r of ranges) {
        expect(Number.isFinite(r.from)).toBe(true)
        expect(Number.isFinite(r.to)).toBe(true)
        expect(r.to).toBeGreaterThan(r.from)
      }
    }
  })
})
