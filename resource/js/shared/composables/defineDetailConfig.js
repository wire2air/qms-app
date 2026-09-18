/**
 * Detail-page config contract (SP-1 spec §2). Pure normalization + validation.
 * `header`, `breadcrumbs`, `banners` are always normalized to `(record) => value`.
 */
const VALID_VARIANTS = [
  'standard', 'readonly', 'embedded', 'print', 'approval', 'workflow-review', 'split',
]

function asFn(value, fallback) {
  if (value === undefined) return () => fallback
  return typeof value === 'function' ? value : () => value
}

export function normalizeDetailConfig(input = {}) {
  const warnings = []

  const rawVariant = input.variant ?? 'standard'
  const variantOk = VALID_VARIANTS.includes(rawVariant)
  if (!variantOk) warnings.push(`Unknown variant "${rawVariant}"; falling back to "standard".`)

  const tabs = (input.tabs ?? []).map((t) => {
    if (t.value == null) warnings.push('Tab descriptor missing "value".')
    return { ...t, mode: t.mode === 'anchor' ? 'anchor' : 'panel' }
  })

  const config = {
    variant: variantOk ? rawVariant : 'standard',
    width: input.width ?? 'standard',
    headerVariant: input.headerVariant ?? 'full',
    rail: input.rail, // undefined = auto
    header: asFn(input.header, {}),
    breadcrumbs: asFn(input.breadcrumbs, null),
    actions: input.actions ?? [],
    tabs,
    sections: input.sections ?? [],
    railCards: input.railCards ?? [],
    banners: asFn(input.banners, []),
    commands: input.commands ?? [],
    hotkeys: input.hotkeys ?? {},
    peek: { enabled: false, ...(input.peek ?? {}) },
    version: { enabled: false, ...(input.version ?? {}) },
    ai: { enabled: false, ...(input.ai ?? {}) },
  }
  return { config, warnings }
}

export function defineDetailConfig(input = {}) {
  const { config, warnings } = normalizeDetailConfig(input)
  if (import.meta.env?.DEV) {
    warnings.forEach((w) => console.warn(`[defineDetailConfig] ${w}`))
  }
  return config
}
