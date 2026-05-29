/**
 * Freeze OptionSet labels into a form payload at save / submit time.
 *
 * Why: option-set-backed fields (select / radio / optionGroup) store the
 * option's id as the form value. If the OptionSet is later edited
 * (renamed, label tweaked) the *raw* value in the saved record stays
 * stable, but the rendered label shifts because the renderer resolves
 * the id against the live OptionSet at view time.
 *
 * For sealed / approved records this is undesirable — what the user
 * picked must read the same five years from now. This util walks the
 * form schema, looks up the live OptionSet for any option-set-backed
 * field that has a value, finds the picked option's display label,
 * and writes it into a sibling `_optionLabels` map on the payload:
 *
 *   {
 *     disposition: 'scrap-uuid',
 *     notes: 'broken',
 *     _optionLabels: {
 *       disposition: 'Scrap'
 *     }
 *   }
 *
 * Renderers (FormSchemaReadonlyView etc.) prefer `_optionLabels[name]`
 * over the OptionSet lookup, so the label is frozen at the moment of
 * save and survives any later admin edits to the OptionSet.
 *
 * If a field's value is already a plain string (string-array
 * OptionSets, or custom inline options) the id IS the label — no
 * freeze needed and we skip.
 *
 * @param {object} db                The syncEngine db handle
 * @param {Array<object>} formSchema The field definitions for the form
 * @param {object} payload           The current values map
 * @returns {Promise<object>}        Payload with `_optionLabels` populated
 */
export async function freezeOptionLabels(db, formSchema, payload) {
  if (!Array.isArray(formSchema) || !payload || typeof payload !== 'object') {
    return payload
  }

  const labels = { ...(payload._optionLabels || {}) }

  // Walk the schema looking for option-set-backed fields. Children
  // (group fields) get traversed too so nested values are covered.
  const optionSetFields = []
  function collect(fields) {
    for (const f of fields) {
      if (!f) continue
      // Only fields that source from an OptionSet — the FK is the
      // marker. Inline `options` arrays don't need freezing because
      // the value IS the label.
      const usesOptionSet =
        ['select', 'radio', 'optionGroup'].includes(f.type) && f.optionSetId
      if (usesOptionSet) optionSetFields.push(f)
      if (Array.isArray(f.children)) collect(f.children)
    }
  }
  collect(formSchema)

  if (optionSetFields.length === 0) return payload

  // Batch-fetch any OptionSets we need (deduped) so we don't make N
  // round-trips for forms with many option-set fields against the same
  // tenant catalog.
  const optionSetIds = [...new Set(optionSetFields.map((f) => f.optionSetId))]
  const optionSets = {}
  for (const id of optionSetIds) {
    const os = await db.OptionSet.findByPk(id)
    if (os) optionSets[id] = os
  }

  for (const field of optionSetFields) {
    const value = payload[field.name]
    if (value == null) continue
    const os = optionSets[field.optionSetId]
    if (!os) continue
    const opts = os.options || []

    // Multi-select: value is an array of ids. Map each to its label.
    if (Array.isArray(value)) {
      labels[field.name] = value.map((v) => resolveLabel(opts, v))
    } else {
      labels[field.name] = resolveLabel(opts, value)
    }
  }

  return { ...payload, _optionLabels: labels }
}

/**
 * Find the display label for a single picked value against an
 * OptionSet's `options` array. Handles both string-array OptionSets
 * (value === label) and object-array OptionSets ({id,name} or
 * {value,label}).
 *
 * Falls back to the raw value when no match is found — better a
 * stable stringification than a silent "—" on a sealed record.
 *
 * @param {Array} options
 * @param {*} value
 * @returns {string}
 */
function resolveLabel(options, value) {
  for (const opt of options) {
    if (typeof opt === 'string') {
      if (opt === value) return opt
      continue
    }
    if (opt?.id === value || opt?.value === value) {
      return opt.label ?? opt.name ?? String(value)
    }
  }
  return String(value)
}
