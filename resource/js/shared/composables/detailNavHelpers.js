/** Combine anchor sections + panel tabs into one nav model (SP-1 spec §5). Pure. */
export function resolveNavModel(sections = [], tabs = []) {
  const items = [
    ...sections
      .filter((s) => s.visible !== false)
      .map((s) => ({ key: s.id, label: s.label, icon: s.icon, mode: 'anchor', count: undefined })),
    ...tabs
      .filter((t) => t.visible !== false)
      .map((t) => ({
        key: t.value,
        label: t.label,
        icon: t.icon,
        mode: t.mode === 'anchor' ? 'anchor' : 'panel',
        count: typeof t.count === 'function' ? t.count() : t.count,
      })),
  ]
  return {
    items,
    hasAnchor: items.some((i) => i.mode === 'anchor'),
    hasPanel: items.some((i) => i.mode === 'panel'),
  }
}
