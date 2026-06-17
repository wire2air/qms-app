/**
 * Typography tokens — the single source of truth for all text styling.
 *
 * Every BaseHeading / BaseText / BaseCaption / BaseLabel / BaseHelperText /
 * BaseErrorText maps its props through THIS file. Change a size / weight /
 * color here and it propagates everywhere — no raw `text-*` / `font-*` / color
 * utilities should appear in feature code.
 *
 * All values reference WIRED tokens only:
 *   - font sizes: the `--text-*` scale in src/css/base.css @theme
 *     (page-title 28 / section-title 18 / subheading 15 / body 14 / label 12 /
 *      caption 11), emitted by Tailwind as `tw:text-<name>`
 *   - colors: the semantic `--color-*` tokens, emitted as
 *     `tw:text-on-main | -secondary | -primary | -bad | -placeholder`
 */

// Semantic variant → rendered tag + one class PER dimension.
// Keeping each dimension a single class means a prop override (e.g. `weight`)
// replaces exactly one entry and never collides with the variant default
// (two competing `text-*` / `font-*` classes on one element).
export const TEXT_VARIANT = {
  'page-title': {
    tag: 'h1',
    size: 'tw:text-page-title',
    weight: 'tw:font-bold',
    leading: 'tw:leading-tight',
    color: 'default',
  },
  'section-title': {
    tag: 'h2',
    size: 'tw:text-section-title',
    weight: 'tw:font-semibold',
    leading: 'tw:leading-snug',
    color: 'default',
  },
  subheading: {
    tag: 'h3',
    size: 'tw:text-subheading',
    weight: 'tw:font-semibold',
    leading: '',
    color: 'default',
  },
  body: {
    tag: 'p',
    size: 'tw:text-body',
    weight: 'tw:font-normal',
    leading: '',
    color: 'default',
  },
  caption: {
    tag: 'span',
    size: 'tw:text-caption',
    weight: 'tw:font-normal',
    leading: '',
    color: 'secondary',
  },
  helper: {
    tag: 'p',
    size: 'tw:text-caption',
    weight: 'tw:font-normal',
    leading: '',
    color: 'secondary',
  },
  error: {
    tag: 'p',
    size: 'tw:text-caption',
    weight: 'tw:font-medium',
    leading: '',
    color: 'error',
  },
}

// BaseHeading `level` (1–6) → the variant that sets its default visual size.
// `level` always controls the rendered <h1>–<h6> tag (document outline); pass
// `as` to override only the *visual* size, decoupling structure from style.
export const HEADING_LEVEL = {
  1: 'page-title',
  2: 'section-title',
  3: 'subheading',
  4: 'subheading',
  5: 'subheading',
  6: 'subheading',
}

// BaseLabel sizes → wired font-size tokens (11 / 12 / 14 / 15px).
export const LABEL_SIZE = {
  xs: 'tw:text-caption',
  sm: 'tw:text-label',
  md: 'tw:text-body',
  lg: 'tw:text-subheading',
}

export const FONT_WEIGHT = {
  normal: 'tw:font-normal',
  medium: 'tw:font-medium',
  semibold: 'tw:font-semibold',
  bold: 'tw:font-bold',
}

// Semantic text colors only — never raw color utilities in feature code.
export const TEXT_COLOR = {
  default: 'tw:text-on-main',
  secondary: 'tw:text-secondary',
  primary: 'tw:text-primary',
  error: 'tw:text-bad',
  disabled: 'tw:text-placeholder',
  inherit: '',
}

export const TEXT_ALIGN = {
  left: '',
  center: 'tw:text-center',
  right: 'tw:text-right',
}

// Explicit map — Tailwind JIT won't emit a dynamic `line-clamp-${n}`.
export const LINE_CLAMP = {
  1: 'tw:line-clamp-1',
  2: 'tw:line-clamp-2',
  3: 'tw:line-clamp-3',
  4: 'tw:line-clamp-4',
}
