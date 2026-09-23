/**
 * Filter values for a registry field, as pickable options.
 *
 * ── THE PROBLEM THIS SOLVES IS NOT SPELLING ─────────────────────────────────
 * Until now a filter value on an enum or uuid field was TYPED. The compiler
 * quote_literal()s whatever it is given and checks only that the FIELD is in
 * `analytics_module_fields` — never that the VALUE exists in the lookup table.
 * So `Active` instead of `ACTIVE` compiles cleanly, publishes, and renders a
 * tile that reads 0 forever, with no error anywhere.
 *
 * That is worse than a visible failure: a permanently-zero figure on a quality
 * dashboard reads as "there are none", which is a confident wrong answer. The
 * picker makes the typo unreachable rather than merely detectable, and the
 * stored value is still the id the compiler needs.
 *
 * ── HOW A TABLE NAME BECOMES A MODEL ────────────────────────────────────────
 * CustomMetricBuilderDialog's header described this as blocked on "a mapping
 * from a Postgres table name to the SyncEngine model that mirrors it, which
 * does not exist yet". That mapping turns out to exist already, on every model:
 * `@ClientModel('documentStatuses', …)` records its store name, and
 * ModelRegistry keeps it as `schema.tableName`. So the lookup is a REVERSE
 * SEARCH of the registry, not a transformation of the string.
 *
 * ── WHY NOT DERIVE THE NAME INSTEAD ─────────────────────────────────────────
 * Two spellings sit between a registry row and a model, and each would have to
 * be guessed:
 *
 *   analytics_module_fields.lookup_table   document_statuses   (snake, plural)
 *   @ClientModel store name                documentStatuses    (camel, plural)
 *   the key on `db`                        DocumentStatus      (Pascal, SINGULAR)
 *
 * `db` is keyed by CLASS name, which is singular, so reaching it from
 * `document_statuses` would mean singularising English in the client —
 * "statuses" → "status", "priorities" → "priority", "severities" → "severity".
 * A rule that handles those is a rule that will eventually be wrong about some
 * table nobody has added yet, and being wrong here is silent: the picker simply
 * does not appear and the text box comes back.
 *
 * Asking the registry cannot be wrong. It answers with the model that actually
 * declares that store, or with nothing.
 *
 * ── WHY IT IS NOT A HARDCODED 34-ROW TABLE EITHER ───────────────────────────
 * A literal map would go stale the moment the registry gains a field, and going
 * stale means falling back to a text box on exactly the new field nobody has
 * learned the values of yet. Resolving through the registry means a row added
 * tomorrow gets a picker with no frontend change — the same property the field
 * pickers themselves already have.
 */
import { ModelRegistry } from '@syncEngine/index'

/**
 * The `db` key for a Postgres lookup table, via the SyncEngine registry.
 *
 * ModelRegistry.schemas is keyed by MODEL name (the class, e.g.
 * 'DocumentStatus') and each schema carries the `tableName` its @ClientModel
 * declared ('documentStatuses'). `db` is keyed by that same model name, so the
 * model name is what this returns.
 *
 * The registry's tableName is camelCase while the analytics registry names the
 * table in snake_case, so the two are compared with punctuation and case
 * removed — the only normalisation involved, and it cannot mis-singularise
 * because it never rewrites the word.
 *
 * `schemas` is injectable purely for tests. Importing the models to populate
 * the real registry needs the TC39 decorator transform, which vitest.config.js
 * deliberately does not carry — so a test supplies the two or three schema
 * entries it cares about instead of pulling in 233 models.
 */
function modelNameFor(lookupTable, schemas = ModelRegistry?.schemas ?? {}) {
  if (!lookupTable) return null
  const want = String(lookupTable).replace(/_/g, '').toLowerCase()
  for (const [modelName, schema] of Object.entries(schemas ?? {})) {
    const table = schema?.tableName ?? modelName
    if (String(table).replace(/_/g, '').toLowerCase() === want) return modelName
  }
  return null
}

/**
 * How a row from each lookup becomes a label.
 *
 * Every lookup table in the registry carries `name` except `users`, which
 * stores firstName/lastName separately. Rather than special-casing at the call
 * site, the exception lives here with the reason attached.
 */
function labelFor(row) {
  if (!row) return ''
  if (row.name) return String(row.name)
  const person = [row.firstName, row.lastName].filter(Boolean).join(' ').trim()
  if (person) return person
  // Last resort. Showing the raw id is not pretty, but it is honest — and it
  // keeps a row selectable rather than presenting a blank line that stores a
  // value the author cannot see.
  return String(row.id ?? '')
}

/**
 * Load the options for one lookup table.
 *
 * Returns [] for anything not mirrored, which the caller reads as "no picker
 * available, keep the text input". Never throws: a lookup that cannot be read
 * must degrade to the old typed behaviour, not break the dialog.
 *
 * @param {object} db The SyncEngine database handle.
 * @param {string} lookupTable Postgres table name from the registry.
 * @returns {Promise<{value: string, label: string}[]>}
 */
export async function loadLookupOptions(db, lookupTable, schemas) {
  const modelName = modelNameFor(lookupTable, schemas)
  if (!modelName || !db?.[modelName]) return []

  let rows
  try {
    rows = await db[modelName].where().exec()
  } catch {
    return []
  }
  if (!Array.isArray(rows)) return []

  return rows
    .map((r) => ({ value: String(r.id ?? ''), label: labelFor(r), order: r.displayOrder ?? null }))
    .filter((o) => o.value)
    .sort((a, b) => {
      // displayOrder first where the table defines one — these vocabularies are
      // ordered deliberately (a status list reads DRAFT → CLOSED, not
      // alphabetically), and the lookup tables that have it seed it on purpose.
      if (a.order != null && b.order != null && a.order !== b.order) return a.order - b.order
      return a.label.localeCompare(b.label)
    })
    .map(({ value, label }) => ({ value, label }))
}

/**
 * Whether a field can offer a picker at all.
 *
 * Asked before rendering so the dialog can show a select or a text input
 * without first running a query that may return nothing.
 */
export function hasLookup(db, lookupTable, schemas) {
  const modelName = modelNameFor(lookupTable, schemas)
  return !!(modelName && db?.[modelName])
}

export const __testing = { modelNameFor, labelFor }
