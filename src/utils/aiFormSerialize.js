/**
 * Serialize the form builder's schema tree into the flat, lightweight
 * descriptor list the AI form tasks consume (form.generate_schema's
 * currentForm / the form-builder chat context). Section containers become a
 * `section` label on each child — mirrors how the AI emits sections back.
 *
 * Extracted from FormAiGenerateDialog when the one-shot dialog became the
 * conversational assistant; shared by every AI surface that sends the
 * current form.
 */

function serializeField(field, section) {
  const d = { name: field.name, type: field.type, label: field.label ?? field.text ?? '' }
  if (section) d.section = section
  if (typeof field.required === 'boolean') d.required = field.required
  if (Array.isArray(field.options) && field.options.length) {
    d.options = field.options
      .map((o) => (typeof o === 'string' ? o : (o?.label ?? o?.value ?? '')))
      .filter(Boolean)
  }
  // Surface the editable extras so an AI edit can SEE them — otherwise
  // "change the range to 2-8" has no current min/max to revise against.
  if (Number.isFinite(field.min)) d.min = field.min
  if (Number.isFinite(field.max)) d.max = field.max
  if (typeof field.placeholder === 'string' && field.placeholder) d.placeholder = field.placeholder
  if (typeof field.hint === 'string' && field.hint) d.hint = field.hint
  if (typeof field.width === 'string' && field.width && field.width !== 'full') d.width = field.width
  if (field.type === 'checklist') {
    if (Array.isArray(field.rows) && field.rows.length) {
      d.rows = field.rows.filter((r) => typeof r === 'string')
    }
    if (Array.isArray(field.columns) && field.columns.length) {
      d.columns = field.columns
        .map((c) => {
          const col = { label: c?.label ?? '', inputType: c?.inputType ?? 'radio' }
          if (Array.isArray(c?.options) && c.options.length) col.options = c.options
          return col
        })
        .filter((c) => c.label)
    }
  }
  return d
}

export function serializeSchemaForAi(schema) {
  const out = []
  for (const field of schema ?? []) {
    if (!field || typeof field !== 'object' || !field.name) continue
    if (field.type === 'section' && Array.isArray(field.children)) {
      for (const child of field.children) {
        if (child && typeof child === 'object' && child.name) {
          out.push(serializeField(child, field.label || null))
        }
      }
    } else {
      out.push(serializeField(field, null))
    }
  }
  return out
}
