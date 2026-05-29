/**
 * Freeze OptionSet labels into a form payload at save / submit time.
 *
 * Why: option-set-backed fields (select / radio / optionGroup) store the
 * option's id as the form value. If the OptionSet is later edited
 * (renamed, label tweaked) the *raw* value stays stable, but the
 * rendered label shifts because the renderer resolves the id against
 * the live OptionSet at view time.
 *
 * For sealed / approved records that's not acceptable — what the user
 * picked must read the same five years from now. This util walks the
 * form schema, looks up the live OptionSet for any option-set-backed
 * field that has a value, and writes the display label into a sibling
 * `_optionLabels` map on the payload AT THE SAME SCOPE AS THE VALUE:
 *
 *   payload = {
 *     severity: 'sev-uuid',
 *     details: {
 *       disposition: 'disp-uuid',
 *     },
 *     items: [
 *       { part: 'part-uuid-1' },
 *       { part: 'part-uuid-2' },
 *     ],
 *   }
 *
 *   becomes
 *
 *   payload = {
 *     severity: 'sev-uuid',
 *     details: {
 *       disposition: 'disp-uuid',
 *       _optionLabels: { disposition: 'Scrap' },
 *     },
 *     items: [
 *       { part: 'part-uuid-1', _optionLabels: { part: 'Bolt M6' } },
 *       { part: 'part-uuid-2', _optionLabels: { part: 'Washer' } },
 *     ],
 *     _optionLabels: { severity: 'Major' },
 *   }
 *
 * FormSchemaReadonlyView's `formatDisplayValue` reads
 * `values._optionLabels[fieldName]` for select / radio / optionGroup and
 * falls back to the live OptionSet lookup when absent. Because the
 * readonly view already passes the scoped sub-payload down at named
 * sections + repeater items via `getContainerValues`, no readonly-view
 * change is needed beyond the top-level reader — each scope already
 * carries its own labels.
 *
 * Container handling matches DynamicForm.js's value path traversal:
 *   - Named section / row / column → children open a new value scope
 *     (values[field.name]); recurse with a sub-payload + sub-labels.
 *   - Unnamed row / column           → transparent; children read from
 *     the same scope as the parent (no sub-payload).
 *   - Repeater                       → values[field.name] is an array;
 *     each item is its own scope with its own _optionLabels map.
 *
 * Re-running the freeze on a payload that was already frozen (edit /
 * amend flows) is safe — labels are overwritten with the *current*
 * OptionSet reading, which is the intended behaviour: an amended
 * payload should reflect labels as they read at the moment of amend.
 *
 * @param {object} db                The syncEngine db handle
 * @param {Array<object>} formSchema The field definitions for the form
 * @param {object} payload           The current values map
 * @returns {Promise<object>}        Payload with `_optionLabels` populated
 *                                   at every relevant scope.
 */
export async function freezeOptionLabels(db, formSchema, payload) {
  if (!Array.isArray(formSchema) || !payload || typeof payload !== 'object') {
    return payload
  }

  // 1. Find every OptionSet id referenced anywhere in the schema —
  //    section children + repeater templates included. Dedup before
  //    fetching so a form that reuses the same OptionSet across nested
  //    fields only fires one IDB lookup.
  const ids = new Set()
  collectOptionSetIds(formSchema, ids)
  if (ids.size === 0) return payload

  // 2. Batch-fetch the live OptionSets up front. Keyed by id so the
  //    recursive walk can look up synchronously.
  const sets = {}
  for (const id of ids) {
    const os = await db.OptionSet.findByPk(id)
    if (os) sets[id] = os
  }

  // 3. Walk schema + payload together, stamping _optionLabels at each
  //    scope that has at least one option-set value. Returns a new
  //    object (does not mutate the caller's payload).
  return freezeScope(formSchema, payload, sets)
}

/**
 * Pre-scan: gather every distinct OptionSet id the schema references,
 * regardless of where it sits (top-level, inside a section, inside a
 * repeater template).
 */
function collectOptionSetIds(fields, out) {
  for (const f of fields) {
    if (!f) continue
    const usesOptionSet =
      ['select', 'radio', 'optionGroup'].includes(f.type) && f.optionSetId
    if (usesOptionSet) out.add(f.optionSetId)
    if (Array.isArray(f.children)) collectOptionSetIds(f.children, out)
    if (Array.isArray(f.template)) collectOptionSetIds(f.template, out)
  }
}

/**
 * Freeze labels for one value scope.
 *
 * "Scope" mirrors how DynamicForm reads values: anything that doesn't
 * open a new path (unnamed row/column) is processed at the *current*
 * scope, anything that does (named section, repeater item) recurses
 * into a fresh scope with the sub-payload.
 */
function freezeScope(fields, values, sets) {
  if (!values || typeof values !== 'object') return values

  // Copy so we don't mutate the caller's object. Start labels from
  // whatever was already on the payload (re-freeze on amend should
  // refresh stale entries, not blow them away).
  const out = { ...values }
  const labels = { ...(values._optionLabels || {}) }

  // processFields runs at the current scope: option-set values land in
  // `labels`, sub-payloads dispatch back into freezeScope. Defined
  // inline so unnamed containers can recurse cheaply without spinning
  // up another labels map.
  function processFields(fieldsList) {
    for (const f of fieldsList) {
      if (!f) continue

      // Option-set value at this scope → freeze its label here.
      const usesOptionSet =
        ['select', 'radio', 'optionGroup'].includes(f.type) && f.optionSetId
      if (usesOptionSet && f.name) {
        const v = out[f.name]
        const os = sets[f.optionSetId]
        if (v != null && os) {
          const opts = os.options || []
          labels[f.name] = Array.isArray(v)
            ? v.map((x) => resolveLabel(opts, x))
            : resolveLabel(opts, v)
        }
      }

      // Children container: named section/row/column open a sub-scope
      // (values[name]), unnamed row/column is transparent and shares
      // the parent scope.
      if (Array.isArray(f.children)) {
        if (f.name) {
          const sub = out[f.name]
          if (sub && typeof sub === 'object') {
            out[f.name] = freezeScope(f.children, sub, sets)
          }
        } else {
          processFields(f.children)
        }
      }

      // Repeater: each array item is its own scope, freeze per item.
      // No-name repeaters don't exist in the builder (the array needs a
      // key) — guard anyway and skip rather than mis-freeze.
      if (Array.isArray(f.template) && f.name) {
        const arr = out[f.name]
        if (Array.isArray(arr)) {
          out[f.name] = arr.map((item) =>
            item && typeof item === 'object' ? freezeScope(f.template, item, sets) : item,
          )
        }
      }
    }
  }

  processFields(fields)

  // Only stamp _optionLabels on the scope if there's something to
  // record. Skips writing an empty map onto payloads with no option-set
  // values at this level — keeps the saved JSON noise-free.
  if (Object.keys(labels).length > 0) {
    out._optionLabels = labels
  }
  return out
}

/**
 * Find the display label for a single picked value against an
 * OptionSet's `options` array. Handles both string-array OptionSets
 * (value === label) and object-array OptionSets ({id,name} or
 * {value,label}).
 *
 * Falls back to the raw value when no match is found — better a stable
 * stringification than a silent "—" on a sealed record.
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
