<script setup>
/**
 * Build a metric without writing SQL.
 *
 * ── WHAT THIS DIALOG IS ACTUALLY DOING ──────────────────────────────────────
 * Assembling a structured `definition` object. It never composes a query, and it
 * never sees one: on save the row goes to analytics_custom_metrics and a database
 * trigger compiles it into analytics_metrics, checking every identifier against
 * analytics_module_fields. So the only failure this form can cause is a bad
 * question — never a bad query.
 *
 * That is why the field pickers are populated from the SYNCED REGISTRY rather
 * than from anything hardcoded here. A field this dialog cannot offer is one the
 * compiler would reject anyway, and a field the registry gains appears here with
 * no frontend change at all.
 *
 * ── WHY compileError IS SHOWN AS PROMINENTLY AS IT IS ───────────────────────
 * A save that "worked" but produced no usable metric is the confusing outcome,
 * and it is reachable: the client's checks are a deliberate subset of the
 * compiler's, so the server can refuse something this form allowed. When that
 * happens the row still exists — it is a draft that does not compile — and the
 * banner is the only thing that says so. Silence here would leave a metric that
 * is saved, listed, and quietly absent from every dashboard.
 *
 * ── FILTER VALUES ARE PICKED, NOT TYPED ─────────────────────────────────────
 * Enum and uuid filter values come from the lookup table the registry names,
 * resolved through analyticsLookupOptions. This was previously typed, and the
 * reason it changed is worth keeping: the compiler checks that the FIELD is
 * registered but never that the VALUE exists, so `Active` instead of `ACTIVE`
 * compiled, published, and rendered a tile that read 0 forever with no error
 * anywhere. That is not a usability gap — a permanently-zero figure on a
 * quality dashboard is a confident wrong answer.
 *
 * A field whose lookup table the client does not mirror, or whose model has no
 * rows yet, keeps the typed input with a hint saying the value must match
 * exactly. Falling back beats an empty dropdown there is no way past.
 *
 * `reporting_key` is the EXCEPTION, and deliberately so: its values are not
 * rows in a lookup table at all, they are the keys an author typed in the form
 * builder, and they reach this client already — the parent reads FormTemplate
 * to decide which modules are the tenant's own. So that one field gets a real
 * picker today (reportingKeyOptions). It is also the field that most needed
 * one: a metric on analytics_field_values is WRONG without a reporting_key
 * filter, because the table holds one row per (record, field), and a mistyped
 * key compiles cleanly and renders an empty series.
 */
import {
  MEASURES,
  MEASURE_OPTIONS,
  OP_OPTIONS,
  VALUELESS_OPS,
  DIRECTION_OPTIONS,
  GRAIN_OPTIONS,
  blankDefinition,
  blankFilter,
  definitionProblem,
  definitionSentence,
  problemSection,
  sectionSummary,
  BUILDER_SECTIONS,
  humaniseCode,
  reportingKeyOptions,
  reportingFields,
  eavFilterConflict,
  customFilterFields,
  customFieldKey,
  expandCustomFilters,
  foldCustomFilters,
  customGroupFields,
  expandCustomGroupBy,
  foldCustomGroupBy,
  FIELD_HELP,
} from '@/utils/analyticsCustomMetricAccess.js'
import { loadLookupOptions, hasLookup } from '@/utils/analyticsLookupOptions.js'
import { templatesForModule } from '@/utils/analyticsMetricTemplates.js'
import {
  IconPlus,
  IconTrash,
  IconAlertTriangle,
  IconSparkles,
  IconPencil,
} from '@tabler/icons-vue'

const props = defineProps({
  /** An existing AnalyticsCustomMetric row, or null to create. */
  metric: { type: Object, default: null },
  /** Every AnalyticsModuleField the viewer can see — the parent fetches once. */
  fields: { type: Array, default: () => [] },
  /** The tenant's own promoted FormTemplates — source of the reporting-key picker. */
  templates: { type: Array, default: () => [] },
  /** analytics_dimension_capacity(), read from the metric catalog. */
  dimensionCap: { type: Number, default: 3 },
})

const emit = defineEmits(['saved'])
const open = defineModel('open', { type: Boolean, default: false })

const toast = useToast()
const saving = ref(false)
const form = ref(blank())

function blank() {
  return {
    name: '',
    description: '',
    moduleId: null,
    direction: 'neutral',
    grain: 'month',
    definition: blankDefinition(),
  }
}

/**
 * True while the form is being filled from an existing row.
 *
 * ⚠ Load-bearing. The two watchers below clear dependent fields when the module
 * or the source table changes, which is right when a PERSON changes them and
 * wrong when the form is merely being populated: seeding an existing metric
 * moves sourceTable from null to its saved value, which looks identical to a
 * user picking it, and the reset then wiped the saved filters and groupBy.
 *
 * The failure was almost invisible, which is why it survived a build, four lints
 * and a full unit run. `timeField` came back anyway — BaseSelect's autoFill
 * re-picks the first option on a required single select, and the first date
 * field happened to be the saved one — so the dialog looked correctly populated.
 * Only `Split by`, a multiple select with no autoFill, stayed visibly empty, and
 * the next Save would have written the emptied definition back. Found by
 * comparing a screenshot against the stored row: groupBy was ["status_id"] in
 * the database and blank on screen.
 */
const seeding = ref(false)

/**
 * Hold `seeding` true until the reset watchers have flushed for this change.
 *
 * ⚠ THE OBVIOUS IMPLEMENTATION OF THIS IS WRONG, AND IT WAS SHIPPED.
 * The original cleared the flag in `nextTick(() => { seeding.value = false })`,
 * whose comment says it runs "AFTER the reset watchers have flushed". It does
 * not. A default `watch` is a PRE-flush watcher: it runs in the scheduler's
 * pre-queue, ahead of nextTick callbacks. Measured ordering for
 * `seeding = true; nextTick(clear); form.value = {...}`:
 *
 *     flag cleared        ← nextTick ran FIRST
 *     watcher seeding=false
 *
 * So the guard was already false by the time the watcher it guards consulted
 * it, and the reset it exists to suppress ran anyway.
 *
 * The edit path survived this by luck rather than by the flag. Replacing
 * `form.value` wholesale makes the moduleId watcher fire and blank the
 * definition — but the very next statement assigned the seeded definition over
 * the top, so the damage was overwritten within the same tick and nothing was
 * visible. That luck does not extend to a template, which writes the definition
 * as part of the same object replacement rather than after it; there the blanked
 * definition is the one that survives.
 *
 * `flush: 'post'` is what the original comment described: it runs after the
 * component's pre-flush watchers for the same tick, so the flag is true exactly
 * while they look at it. Verified by the template specs, which fail without it.
 */
function seedForm(next) {
  seeding.value = true
  const stop = watch(
    () => [form.value.moduleId, form.value.definition.sourceTable],
    () => {
      seeding.value = false
      stop()
    },
    { flush: 'post' },
  )
  form.value = next
  // A seed that changes NEITHER watched value — reopening an unchanged metric —
  // leaves the watcher above waiting for a change that never comes. Clearing on
  // the next tick as well is harmless when the watcher already fired (the flag
  // is false and stop() has run) and is the only thing that clears it when it
  // did not.
  nextTick(() => {
    seeding.value = false
    stop()
  })
}

// Re-seed on open, so cancelling and reopening does not resurrect the abandoned
// draft. JSON round-trip rather than structuredClone: `props.metric` is a live
// SyncEngine row and its `definition` arrives wrapped in a Vue reactive Proxy,
// which structuredClone refuses outright with DataCloneError — the defect that
// made the report Edit button silently inert (see A12). A definition is plain
// JSON by construction, so the round-trip is total.
watch(
  () => [open.value, props.metric?.id],
  () => {
    if (!open.value) return
    seedForm(
      props.metric
        ? {
            name: props.metric.name ?? '',
            description: props.metric.description ?? '',
            moduleId: props.metric.moduleId ?? null,
            direction: props.metric.direction ?? 'neutral',
            grain: props.metric.grain ?? 'month',
            // Stored (reporting_key, text_value) pairs fold back into the one
            // virtual row the author chose, so editing shows the question they
            // asked rather than the shape it is kept in. Only unambiguous pairs
            // fold — see foldCustomFilters.
            definition: (() => {
              const d = {
                ...blankDefinition(),
                ...JSON.parse(JSON.stringify(props.metric.definition ?? {})),
              }
              return {
                ...d,
                groupBy: foldCustomGroupBy(d.groupBy, d.filters),
                filters: foldCustomFilters(d.filters),
              }
            })(),
          }
        : blank(),
    )
  },
  { immediate: true },
)

// ── the registry, sliced the way the form needs it ──────────────────────────
const modules = computed(() => {
  const seen = new Map()
  for (const f of props.fields) if (!seen.has(f.moduleId)) seen.set(f.moduleId, f.moduleId)
  return [...seen.keys()].sort().map((id) => ({ value: id, label: moduleLabel(id) }))
})

/** Module ids are snake_case slugs; the nav shows title case. */
function moduleLabel(id) {
  return String(id ?? '')
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

const moduleFields = computed(() =>
  props.fields.filter((f) => f.moduleId === form.value.moduleId),
)

const sourceTables = computed(() => {
  const seen = new Set()
  for (const f of moduleFields.value) seen.add(f.sourceTable)
  return [...seen].sort().map((t) => ({ value: t, label: sourceLabel(t) }))
})

/**
 * The human name for a source table.
 *
 * For a built-in module the table IS the module ('capas' → "Capas"), so
 * title-casing the identifier reads fine. For a CUSTOM module it does not: its
 * answers live in the shared EAV projection, so every custom module's only
 * source is `analytics_field_values` and the picker read "Analytics Field
 * Values" — the name of internal plumbing, in a dialog whose whole job is to
 * hide it. The author has already chosen the module one field up; this row is
 * telling them which of its tables to measure, and there is exactly one.
 *
 * Named for what it holds instead. The stored VALUE is untouched — it is still
 * `analytics_field_values`, which is what the compiler validates against and
 * what pins module_key — so this is presentation only.
 */
function sourceLabel(t) {
  if (t === 'analytics_field_values') return 'Form responses'
  return String(t ?? '')
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

const tableFields = computed(() =>
  moduleFields.value
    .filter((f) => f.sourceTable === form.value.definition.sourceTable)
    .slice()
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
)

const dateFields = computed(() =>
  tableFields.value.filter((f) => f.kind === 'date').map(asOption),
)
const registryFilterFields = computed(() =>
  tableFields.value.filter((f) => f.filterable).map(asOption),
)

/** The form's own reportable fields, for a custom module. [] for a built-in one. */
const ownFields = computed(() => reportingFields(props.templates, form.value.moduleId))

/**
 * What the filter-row Field picker offers.
 *
 * On a custom module the storage shape (Field + Answer) is replaced by the
 * form's own fields — see customFilterFields. Everywhere else the registry is
 * offered unchanged, because there a field already IS a column.
 */
const filterFields = computed(() => {
  if (form.value.definition.sourceTable !== 'analytics_field_values') {
    return registryFilterFields.value
  }
  if (!ownFields.value.length) return registryFilterFields.value
  return customFilterFields(registryFilterFields.value, ownFields.value)
})
const registryGroupFields = computed(() =>
  tableFields.value.filter((f) => f.groupable).map(asOption),
)

/**
 * What the breakdown picker offers.
 *
 * Same swap as the filter list, and for a sharper reason: breaking down by the
 * raw `Answer` column groups every field's answers into one chart — statuses
 * and sources as though they were values of one thing. See customGroupFields.
 */
const groupFields = computed(() => {
  if (form.value.definition.sourceTable !== 'analytics_field_values') {
    return registryGroupFields.value
  }
  if (!ownFields.value.length) return registryGroupFields.value
  return customGroupFields(registryGroupFields.value, ownFields.value)
})
const numberFields = computed(() =>
  tableFields.value.filter((f) => f.kind === 'number').map(asOption),
)

function asOption(f) {
  return { value: f.columnName, label: f.label }
}

// Changing the module or the source table invalidates every field chosen under
// the old one. Clearing them is not tidiness: a stale field belongs to another
// table, so the definition would look complete and fail to compile with a message
// about a column the user can no longer see in any picker.
watch(
  () => form.value.moduleId,
  () => {
    if (seeding.value) return
    form.value.definition = blankDefinition()
  },
)

/**
 * Choose the source table when the module leaves no choice.
 *
 * Every module in the registry currently declares exactly one, so the picker
 * above is hidden — but the field still has to be SET, because the compiler
 * needs it and every section after this one is gated on it. Asking a required
 * question with a single answer was the gate that confirmed nothing; setting it
 * is the same decision made without the click.
 *
 * Still a watcher rather than a default, because the set of tables depends on
 * the module and changes when it does.
 */
watch(
  sourceTables,
  (tables) => {
    if (seeding.value) return
    if (tables.length === 1 && !form.value.definition.sourceTable) {
      form.value.definition.sourceTable = tables[0].value
    }
  },
  { immediate: true },
)
watch(
  () => form.value.definition.sourceTable,
  () => {
    if (seeding.value) return
    form.value.definition.timeField = null
    form.value.definition.filters = []
    form.value.definition.groupBy = []
    form.value.definition.measure = { type: form.value.definition.measure?.type ?? MEASURES.COUNT }
  },
)

const measureType = computed({
  get: () => form.value.definition.measure?.type ?? MEASURES.COUNT,
  set: (type) => {
    // Rebuilt rather than mutated: switching away from a ratio must drop its
    // numerator, and switching away from a sum must drop its field, or the
    // leftover key travels to the compiler and is rejected.
    form.value.definition.measure =
      type === MEASURES.RATIO ? { type, numerator: [blankFilter()] } : { type }
  },
})

const needsMeasureField = computed(() =>
  [MEASURES.SUM, MEASURES.AVG, MEASURES.COUNT_DISTINCT].includes(measureType.value),
)
const isRatio = computed(() => measureType.value === MEASURES.RATIO)

/**
 * What the chosen measurement needs next.
 *
 * The dropdown's own descriptions are truncated to one line, so the two options
 * that need a SECOND answer — a percentage needs its success condition, a total
 * or average needs a number column — say so here where there is room. The other
 * three need nothing further and get no hint rather than a filler sentence.
 */
const measureHint = computed(() => {
  if (isRatio.value) {
    return 'A percentage needs a success condition as well — set it below.'
  }
  if ([MEASURES.SUM, MEASURES.AVG].includes(measureType.value)) {
    return 'Works on number fields only, so the list below is short.'
  }
  if (measureType.value === MEASURES.COUNT_DISTINCT) {
    return 'Counts how many different values appear, not how many records.'
  }
  return ''
})

/**
 * The definition as it will be STORED — virtual custom-field rows expanded.
 *
 * ⚠ Every check must read this, not `form.definition`. The validators and the
 * conflict warning reason about `reporting_key` / `text_value` rows, which a
 * virtual row does not contain until it is expanded. Reading the unexpanded
 * form makes the sum/avg guard demand a pin the author has already given, and
 * makes the two-field conflict warning go quiet exactly when it is needed.
 */
const storedDefinition = computed(() => {
  const { groupBy, pins } = expandCustomGroupBy(form.value.definition.groupBy)
  const filters = expandCustomFilters(form.value.definition.filters)
  // The breakdown's pin is a filter, so it merges into the same list — unless
  // the author already pinned that field themselves, in which case adding it
  // again would read as "two fields at once" to the conflict warning.
  const pinned = new Set(
    filters
      .filter((f) => f.field === 'reporting_key' && (f.op ?? 'in') === 'in')
      .flatMap((f) => f.values ?? []),
  )
  const extra = pins.filter((p) => !p.values.every((v) => pinned.has(v)))
  return { ...form.value.definition, groupBy, filters: [...filters, ...extra] }
})

const problem = computed(() => definitionProblem(storedDefinition.value, form.value, props.dimensionCap))
const canSave = computed(() => !problem.value && !saving.value)

// ── templates ───────────────────────────────────────────────────────────────
/**
 * Offered only when CREATING, and only until the form has been started.
 *
 * Not on the edit path: applying one would silently replace a definition that is
 * already in use by dashboards, reports and alerts, and the card gives no hint
 * that it would. Hidden once a module is chosen for a milder reason — by then
 * the user has told us what they are doing, and a row of cards offering to throw
 * it away is noise.
 */
const templates = computed(() => (props.metric ? [] : templatesForModule()))

/**
 * True while the template chooser is the whole dialog.
 *
 * ── WHY THIS IS A MODE RATHER THAN A PANEL ABOVE THE FORM ──────────────────
 * The first version showed the cards and the empty form together. That reads as
 * "here are some shortcuts, and here is the real work" — so the form is what the
 * user starts filling in, and the templates are decoration they scroll past.
 *
 * Making it a choice inverts that. Most people want one of eight common
 * measures and should be finished in two clicks; the blank form is the escape
 * hatch for the minority who want something else. Showing one at a time is what
 * says so.
 *
 * Never shown when editing: a template would silently replace a definition that
 * dashboards, reports and alerts may already be built on.
 */
const choosing = ref(false)

watch(
  () => [open.value, props.metric?.id],
  () => {
    if (open.value) choosing.value = !props.metric
  },
  { immediate: true },
)

function startFromScratch() {
  choosing.value = false
}

/** Templates grouped by module, so the chooser reads as a QMS menu. */
const templateGroups = computed(() => {
  const groups = new Map()
  for (const t of templates.value) {
    if (!groups.has(t.moduleId)) groups.set(t.moduleId, [])
    groups.get(t.moduleId).push(t)
  }
  return [...groups.entries()].map(([moduleId, items]) => ({
    moduleId,
    label: moduleLabel(moduleId),
    items,
  }))
})

/**
 * Fill the whole form from a template.
 *
 * ⚠ Goes through seedForm(), and must. Assigning moduleId fires the watcher that
 * blanks the definition, and assigning sourceTable fires the one that clears
 * timeField, filters and groupBy — so a template applied directly loses every
 * filter and breakdown it carries, leaving a form that looks half-filled for no
 * visible reason.
 *
 * This is the same trap the edit path documents, and it is where that path's
 * guard turned out to be broken: see seedForm(). The edit path survived a
 * non-working flag by accident; a template does not, which is how the defect was
 * finally caught.
 */
function applyTemplate(t) {
  choosing.value = false
  seedForm({
    name: t.name,
    description: t.description ?? '',
    moduleId: t.moduleId,
    direction: t.direction ?? 'neutral',
    grain: t.grain ?? 'month',
    definition: { ...blankDefinition(), ...JSON.parse(JSON.stringify(t.definition)) },
  })
}

/**
 * The sentence the compiler will store, or null while it cannot be known.
 *
 * Passed `tableFields` rather than the whole registry so a column name can only
 * resolve against the table actually selected — a label from another table would
 * describe a metric that does not exist.
 */
// Reads the STORED shape for the same reason the validators do: the sentence
// resolves a filter's label from the registry, and a virtual row's field name
// is not a registry column until it is expanded.
const sentence = computed(() =>
  definitionSentence(storedDefinition.value, form.value, tableFields.value),
)

// ── the configuration, read back ────────────────────────────────────────────
// Each of these restates something the form already holds. That is the point:
// the panel is a CHECK before saving, not a computation, so nothing here may
// derive a fact the user did not enter.
const measureLabel = computed(
  () => MEASURE_OPTIONS.find((o) => o.value === measureType.value)?.label ?? '—',
)

const grainLabel = computed(
  () => GRAIN_OPTIONS.find((o) => o.value === form.value.grain)?.label ?? '—',
)

function fieldLabel(column) {
  return tableFields.value.find((f) => f.columnName === column)?.label ?? column
}

/** "Status is Open, and Priority is High" — or null when there are none. */
const filterSummary = computed(() => {
  const parts = []
  for (const f of form.value.definition.filters ?? []) {
    if (!f.field) continue
    const label = fieldLabel(f.field)
    if (f.op === 'isNull') parts.push(`${label} is not set`)
    else if (f.op === 'isNotNull') parts.push(`${label} is set`)
    else if ((f.values ?? []).length) {
      parts.push(`${label} is ${f.op === 'notIn' ? 'not ' : ''}${f.values.map(humaniseCode).join(' or ')}`)
    }
  }
  return parts.length ? parts.join(', and ') : null
})

const breakdownSummary = computed(() => {
  const labels = (form.value.definition.groupBy ?? []).map(fieldLabel)
  return labels.length ? labels.join(', ') : null
})

// ── the section accordion ───────────────────────────────────────────────────
/**
 * ── WHY THE FORM COLLAPSES AT ALL ──────────────────────────────────────────
 * Six stacked sections in one scroll is roughly 1,200px of form, and the save
 * error lived only on the footer — so "Give the metric a name" appeared while
 * the name field was several hundred pixels off screen, naming a problem with
 * no way to see where it was. Collapsing turns the finished parts into one line
 * each, which both shortens the scroll and makes the open section the place to
 * look.
 *
 * ── WHY EACH SUMMARY NAMES A VALUE ─────────────────────────────────────────
 * A collapsed section still has to be auditable at a glance, so the summaries
 * read "Counted by Raised" rather than "When ✓". The one choice most often got
 * wrong is which date a record counts by, and a tick would hide exactly that.
 */
const SECTION_ORDER = [
  BUILDER_SECTIONS.WHAT,
  BUILDER_SECTIONS.RECORDS,
  BUILDER_SECTIONS.FILTERS,
  BUILDER_SECTIONS.WHEN,
  BUILDER_SECTIONS.BREAKDOWN,
]

const SECTION_TITLES = {
  [BUILDER_SECTIONS.WHAT]: 'What are you measuring?',
  [BUILDER_SECTIONS.RECORDS]: 'Which records, and what about them?',
  [BUILDER_SECTIONS.FILTERS]: 'Which records should be included?',
  [BUILDER_SECTIONS.WHEN]: 'When should a record count?',
  [BUILDER_SECTIONS.BREAKDOWN]: 'Breakdown and reporting',
}

/** Which section the current save-blocking problem belongs to, if any. */
const blockedSection = computed(() => problemSection(problem.value))

/** The completed-state line for each section, keyed by section id. */
const summaries = computed(() => {
  const ctx = {
    name: form.value.name,
    moduleLabel: form.value.moduleId ? moduleLabel(form.value.moduleId) : null,
    recordsLabel: form.value.definition.sourceTable
      ? sourceLabel(form.value.definition.sourceTable)
      : null,
    measureLabel: form.value.definition.sourceTable ? measureLabel.value : null,
    filterCount: (form.value.definition.filters ?? []).filter((f) => f.field).length,
    timeLabel: form.value.definition.timeField ? fieldLabel(form.value.definition.timeField) : null,
    breakdownLabel: breakdownSummary.value,
  }
  return Object.fromEntries(SECTION_ORDER.map((id) => [id, sectionSummary(id, ctx)]))
})

/**
 * A section is reachable once the answers it depends on exist.
 *
 * The same two gates the form had as `v-if`, kept because they are real: with
 * no module there are no fields to filter on, and with no source table there is
 * nothing to measure. Expressed as `disabled` rather than by hiding the row, so
 * the shape of the task is visible from the start instead of appearing a
 * section at a time.
 */
function sectionEnabled(id) {
  if (id === BUILDER_SECTIONS.WHAT) return true
  if (!form.value.moduleId) return false
  if (id === BUILDER_SECTIONS.RECORDS) return true
  return !!form.value.definition.sourceTable
}

const sectionItems = computed(() =>
  SECTION_ORDER.map((id) => ({
    value: id,
    title: SECTION_TITLES[id],
    disabled: !sectionEnabled(id),
  })),
)

const openSections = ref([BUILDER_SECTIONS.WHAT])

/**
 * Open the section a blocked save points at, and scroll to it.
 *
 * Driven by the footer error, which is what the user is looking at. NOT
 * automatic: `problem` changes on every keystroke while a name is being typed,
 * so a section that opened itself would fight the person filling in another.
 */
function revealProblem() {
  const id = blockedSection.value
  if (!id) return
  if (!openSections.value.includes(id)) openSections.value = [...openSections.value, id]
  nextTick(() => {
    document.getElementById(`builder-section-${id}`)?.scrollIntoView({ block: 'center' })
  })
}

/** Advance to the next reachable section, collapsing the one just finished. */
function goToSection(id) {
  if (!id) return
  openSections.value = [id]
  nextTick(() => {
    document.getElementById(`builder-section-${id}`)?.scrollIntoView({ block: 'start' })
  })
}

function nextSectionAfter(id) {
  return SECTION_ORDER.slice(SECTION_ORDER.indexOf(id) + 1).find((x) => sectionEnabled(x)) ?? null
}

/**
 * Re-open the first section whenever the dialog is opened fresh.
 *
 * Without this, closing the dialog mid-edit and reopening it for a DIFFERENT
 * metric would show whatever section the last one was left on.
 */
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) openSections.value = [BUILDER_SECTIONS.WHAT]
  },
)

// ── filter rows ─────────────────────────────────────────────────────────────
function addFilter(list) {
  list.push(blankFilter())
}
function removeFilter(list, i) {
  list.splice(i, 1)
}

/**
 * Values are held as an array but edited as one comma-separated line.
 *
 * Split on save rather than on every keystroke: splitting live turns "CLOSED, "
 * into an empty second value the moment the comma is typed, and the row then
 * reports itself invalid while the user is still mid-word.
 */
/**
 * The reporting keys this module declares, or [] when it has none to offer.
 *
 * Empty for every built-in module, and for a custom one whose form marks no
 * field reportable — both of which fall back to the typed input below rather
 * than rendering an empty dropdown the user cannot get past.
 */
const keyOptions = computed(() => reportingKeyOptions(props.templates, form.value.moduleId))

/**
 * Does this filter row get the reporting-key picker?
 *
 * `reporting_key` keeps its own path because its options come from the form
 * template's schema, not from a lookup table — see reportingKeyOptions.
 */
function picksFromKeys(f) {
  return f?.field === 'reporting_key' && keyOptions.value.length > 0
}

// ── lookup-backed value pickers ─────────────────────────────────────────────
/**
 * Options for every lookup table the CURRENT module and source table reference.
 *
 * Loaded as one live query rather than one per filter row: the rows are
 * reference data already in IndexedDB, the same table is usually referenced by
 * several fields, and a query per row would re-read the same vocabulary each
 * time a condition is added.
 */
const lookupTablesInScope = computed(() =>
  [...new Set(tableFields.value.map((f) => f.lookupTable).filter(Boolean))].sort().join(','),
)

const lookupOptions = useLiveQueryWithDeps(
  [() => lookupTablesInScope.value],
  async (db, [joined]) => {
    const out = {}
    for (const t of joined ? joined.split(',') : []) out[t] = await loadLookupOptions(db, t)
    return out
  },
  { initial: {} },
)

/** Whether the client mirrors each lookup table at all. */
const mirrored = useLiveQueryWithDeps(
  [() => lookupTablesInScope.value],
  async (db, [joined]) =>
    Object.fromEntries((joined ? joined.split(',') : []).map((t) => [t, hasLookup(db, t)])),
  { initial: {} },
)

/** The registry row for a filter's field, or null. */
function fieldRow(f) {
  return tableFields.value.find((r) => r.columnName === f?.field) ?? null
}

/**
 * Does this filter row get a lookup picker instead of a text box?
 *
 * Requires BOTH that the client mirrors the table and that it currently holds
 * rows. The second half matters: a mirrored-but-empty model (bootstrap has not
 * reached it yet) would render a dropdown with nothing in it and no way past,
 * which is strictly worse than the text box it replaced.
 */
function picksFromLookup(f) {
  const table = fieldRow(f)?.lookupTable
  if (!table || picksFromKeys(f)) return false
  return !!mirrored.value?.[table] && (lookupOptions.value?.[table]?.length ?? 0) > 0
}

/** The options for a lookup-backed filter row. */
function lookupOptionsFor(f) {
  return lookupOptions.value?.[fieldRow(f)?.lookupTable] ?? []
}

// ── custom-module answers ───────────────────────────────────────────────────
/**
/**
 * The answers a custom module's `text_value` filter can hold.
 *
 * ── WHERE THE OPTIONS COME FROM, AND WHY NOT A LOOKUP TABLE ────────────────
 * `text_value` is registered as kind 'text' with no lookupTable, and it could
 * not have one: it holds the answers of EVERY dropdown on EVERY custom module
 * in the tenant, whose option lists live in form_templates.schema and differ
 * per module. So the picker above (lookupOptionsFor) cannot serve it — the set
 * of legal answers exists only in the form.
 *
 * ── WHY IT DEPENDS ON ANOTHER FILTER ROW ───────────────────────────────────
 * Which answers are legal depends on WHICH FIELD the metric has been pinned to,
 * and that pin is a separate `reporting_key` filter. Two rows, read together:
 *
 *     reporting_key is lead_source     ← names the field
 *     Answer        is WEB             ← this picker
 *
 * Both predicates land on the same row, which is what makes the pair compile
 * and count. With no pin, or a pin naming several fields, the answer set is
 * ambiguous and this returns [] — the text box comes back rather than a
 * dropdown offering answers from a field the metric is not measuring.
 *
 * Reading the distinct values out of the data instead would be wrong both ways:
 * an option nobody has chosen yet would be missing, and a value left behind by
 * a since-renamed option would appear as though it were current.
 */
/**
 * The answers a VIRTUAL custom-field row offers.
 *
 * Unlike eavAnswerOptions below, this needs no second filter row to tell it
 * which field is meant — the row names its own field. That is the whole point
 * of the virtual reference, and the reason this is a different function rather
 * than a branch inside that one.
 *
 * Returns [] for a field with no fixed option list (text, number, date). The
 * typed input then comes back, which is correct: those answers are open.
 */
function customFieldAnswerOptions(f) {
  const key = customFieldKey(f?.field)
  if (!key) return []
  const field = ownFields.value.find((r) => r.key === key)
  return (field?.options ?? []).map((o) => ({ value: o, label: humaniseCode(o) }))
}

function eavAnswerOptions(f) {
  if (f?.field !== 'text_value') return []
  if (form.value.definition.sourceTable !== 'analytics_field_values') return []

  const pinned = new Set()
  for (const other of form.value.definition.filters ?? []) {
    if (other?.field !== 'reporting_key' || (other.op ?? 'in') !== 'in') continue
    for (const v of other.values ?? []) pinned.add(String(v))
  }
  if (pinned.size !== 1) return []

  const field = reportingFields(props.templates, form.value.moduleId).find((r) =>
    pinned.has(r.key),
  )
  return (field?.options ?? []).map((o) => ({ value: o, label: humaniseCode(o) }))
}

/**
 * Why an Answer filter has no picker yet — shown in place of one.
 *
 * The pin is not obvious: an author who adds "Answer is …" first has no way to
 * know it depends on a second row they have not written. Saying so beats a
 * silent text box.
 */
function answerHint(f) {
  if (f?.field !== 'text_value') return null
  if (eavAnswerOptions(f).length) return null
  return 'Add a "Field is …" condition naming one field, and the answers it allows appear here.'
}

/**
 * The warning shown when two custom fields are filtered at once.
 *
 * Not a save blocker — the definition is legal and the compiler accepts it. It
 * simply cannot match, because each answer is its own row.
 */
const eavConflict = computed(() => eavFilterConflict(storedDefinition.value))

/**
 * The hint under a value input that is still typed.
 *
 * Only when a field HAS a lookup table the client cannot serve — the case where
 * the author must reproduce a stored code exactly with no way to see the list.
 */
function typedValueHint(f) {
  const row = fieldRow(f)
  if (row?.lookupTable && !picksFromLookup(f)) {
    return 'Type the stored codes exactly — an unrecognised value saves without error and counts nothing.'
  }
  return 'Comma separated'
}

/**
 * ── "WHICH ANSWER" — asked with the measure, stored as a filter ─────────────
 *
 * Every numeric answer on a custom module lands in the SAME column
 * (analytics_field_values.numeric_value), one row per reportable field. So a
 * sum or an average has to name the field it means, or it aggregates all of
 * them together — kronor added to percentages.
 *
 * With one numeric field in the form that mistake is invisible, because the
 * answer is right. It only becomes wrong when someone ticks "report on this
 * field" on a SECOND number, months later, and the stored metric silently
 * changes meaning. Measured on lead_crm against a simulated second field:
 * sum 4,249,000 → 4,251,775 (0.07% off, nobody would question it) and
 * avg 84,980 → 42,518.
 *
 * The compiler REFUSES this outright (analytics_compile_custom_metric), so the
 * rule is enforced whatever writes the definition. This control exists so the
 * author never meets that refusal: it asks the question at the moment the
 * measure is chosen, in the words of the thing they picked.
 *
 * It reads and writes the ordinary `reporting_key` filter rather than a field
 * of its own — the compiler's requirement is about the DEFINITION, and inventing
 * a parallel place to store it would mean two things to keep in step. The filter
 * row stays visible below, and editing it either way is the same edit.
 */
// Not asked when the author is already breaking down BY field: that gives each
// one its own series, so nothing is added across two and the compiler accepts
// it. Asking anyway would demand they narrow a chart they deliberately widened.
const measuresEav = computed(
  () =>
    form.value.definition.sourceTable === 'analytics_field_values' &&
    [MEASURES.SUM, MEASURES.AVG].includes(measureType.value) &&
    !(form.value.definition.groupBy ?? []).includes('reporting_key'),
)

const measuredKey = computed({
  get() {
    const f = (form.value.definition.filters ?? []).find(
      (x) => x.field === 'reporting_key' && (x.op ?? 'in') === 'in',
    )
    return f?.values?.length === 1 ? f.values[0] : null
  },
  set(key) {
    const filters = form.value.definition.filters ?? (form.value.definition.filters = [])
    const existing = filters.find((x) => x.field === 'reporting_key' && (x.op ?? 'in') === 'in')
    if (!key) {
      // Clearing it removes the row rather than leaving an empty filter behind,
      // which the compiler rejects with a different, more confusing message
      // ("Every filter needs at least one value").
      if (existing) filters.splice(filters.indexOf(existing), 1)
      return
    }
    if (existing) existing.values = [key]
    else filters.push({ field: 'reporting_key', op: 'in', values: [key] })
  },
})

/**
 * Changing the field invalidates the values chosen for the old one.
 *
 * It always did — `lead_status` is not a site id either — but typed text at
 * least stayed visible and obviously wrong. Values picked from a dropdown
 * would survive into a field whose picker cannot display them, leaving a row
 * that looks blank and saves a filter the author never sees. Cleared on the
 * change instead, which is the same thing the user would do by hand.
 */
function onFilterFieldChange(f) {
  f.values = []
}

function valuesText(f) {
  return (f.values ?? []).join(', ')
}
function setValues(f, text) {
  f.values = String(text ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

const saveMetric = useLiveMutation(async (db, payload) => {
  if (payload.id) {
    const existing = await db.AnalyticsCustomMetric.findByPk(payload.id)
    if (!existing) throw new Error('That metric no longer exists.')
    Object.assign(existing, payload.attrs)
    await existing.save()
    return existing
  }
  const created = db.AnalyticsCustomMetric.create(payload.attrs)
  await created.save()
  return created
})

async function save() {
  if (!canSave.value) return
  saving.value = true
  try {
    const saved = await saveMetric({
      id: props.metric?.id ?? null,
      attrs: {
        name: form.value.name.trim(),
        description: form.value.description.trim() || null,
        moduleId: form.value.moduleId,
        direction: form.value.direction,
        grain: form.value.grain,
        // Virtual custom-field rows become the (reporting_key, text_value)
        // pairs the compiler expects. Nothing else in the definition changes,
        // so what is stored is byte-for-byte what the two-row form produced.
        definition: storedDefinition.value,
      },
    })
    toast.success(props.metric ? 'Metric updated' : 'Metric created')
    emit('saved', saved)
    open.value = false
  } catch (err) {
    toast.error(err?.message || 'Could not save the metric')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog
    v-model="open"
    :title="choosing ? 'What would you like to track?' : metric ? 'Edit metric' : 'New metric'"
    :subtitle="
      choosing
        ? undefined
        : 'Describe the question. The server works out how to count it, and every reader still sees only the records their own access allows.'
    "
    size="2xl"
    persistent
    showClose
  >
    <div class="tw:flex tw:flex-col tw:gap-4">
      <!--
        Shown at the top, not buried at the bottom: a definition that did not
        compile is the single most important thing about the row being edited,
        and it is invisible everywhere else in the app.
      -->
      <BaseBanner
        v-if="metric?.compileError"
        tone="warning"
        :icon="IconAlertTriangle"
        title="This metric is saved but not usable yet"
        :message="metric.compileError"
      />

      <!-- ── THE CHOOSER ───────────────────────────────────────────────────
           The whole dialog while it is open, not a panel above the form. Most
           people want one of these and are finished in two clicks; the blank
           form is the escape hatch, not the main event. -->
      <template v-if="choosing">
        <BaseText variant="caption" color="secondary">
          Pick a common quality measure to start from — you can change any part of it before
          saving.
        </BaseText>

        <div v-for="group in templateGroups" :key="group.moduleId">
          <BaseText weight="medium" class="tw:mb-2">{{ group.label }}</BaseText>
          <ContentGrid min="15rem">
            <BaseClickableRow
              v-for="t in group.items"
              :key="t.id"
              :aria-label="`Track ${t.name}`"
              class="tw:rounded tw:border tw:border-divider tw:p-3 tw:hover:border-primary"
              @click="applyTemplate(t)"
            >
              <div class="tw:flex tw:items-start tw:gap-2">
                <IconSparkles :size="14" class="tw:mt-0.5 tw:shrink-0" aria-hidden="true" />
                <div class="tw:min-w-0">
                  <BaseText weight="medium">{{ t.name }}</BaseText>
                  <BaseText variant="caption" color="secondary">{{ t.description }}</BaseText>
                </div>
              </div>
            </BaseClickableRow>
          </ContentGrid>
        </div>

        <div class="tw:border-t tw:border-divider tw:pt-3">
          <BaseButton variant="outline" size="sm" @click="startFromScratch">
            <IconPencil :size="14" aria-hidden="true" />
            Create your own
          </BaseButton>
        </div>
      </template>

      <template v-else>
        <!-- ── THE FORM, ONE SECTION AT A TIME ───────────────────────────────
             Was six stacked blocks in a single scroll. The accordion keeps the
             finished ones as a line each, so the open section is the only place
             to look and the save error is never pointing off screen. -->
        <BaseAccordion v-model="openSections" :items="sectionItems" multiple :level="3">
          <template #title="{ item }">
            <span class="tw:flex tw:min-w-0 tw:flex-1 tw:items-center tw:gap-2">
              <span class="tw:shrink-0">{{ item.title }}</span>
              <!-- The completed VALUE, not a tick. Which date a record counts
                   by is the choice most often got wrong, and "When ✓" would
                   hide exactly that. -->
              <BaseText
                v-if="summaries[item.value] && !openSections.includes(item.value)"
                variant="caption"
                color="secondary"
                class="tw:truncate"
              >
                {{ summaries[item.value] }}
              </BaseText>
              <BaseBadge
                v-if="blockedSection === item.value"
                class="tw:ml-auto tw:shrink-0 tw:bg-amber-100 tw:text-amber-800"
              >
                Needs an answer
              </BaseBadge>
            </span>
          </template>

          <!-- A. WHAT ──────────────────────────────────────────────────────── -->
          <template #what>
            <div :id="`builder-section-${BUILDER_SECTIONS.WHAT}`">
        <BaseText variant="caption" color="secondary" class="tw:mb-2">
          Use a name your quality team will recognise on a dashboard.
        </BaseText>
        <div class="tw:grid tw:gap-3 tw:sm:grid-cols-2">
          <BaseTextInput
            v-model="form.name"
            label="Metric name"
            placeholder="e.g. Open documents by site"
            :errorMsg="blockedSection === BUILDER_SECTIONS.WHAT ? problem : ''"
          />
          <BaseSelect
            v-model="form.moduleId"
            :options="modules"
            :searchable="false"
            required
          >
            <template #label>
              <BaseLabel :help="FIELD_HELP.module" required>Module</BaseLabel>
            </template>
          </BaseSelect>
        </div>
        <BaseTextarea
          v-model="form.description"
          label="Description"
          :rows="2"
          class="tw:mt-3"
          placeholder="What this measures, and who reads it."
        />
              <div v-if="form.moduleId" class="tw:mt-3 tw:flex tw:justify-end">
                <BaseButton size="sm" variant="outline" @click="goToSection(nextSectionAfter(BUILDER_SECTIONS.WHAT))">
                  Next
                </BaseButton>
              </div>
            </div>
          </template>

          <!-- B. WHICH RECORDS ─────────────────────────────────────────────── -->
          <template #records>
            <div :id="`builder-section-${BUILDER_SECTIONS.RECORDS}`">
          <BaseText variant="caption" color="secondary" class="tw:mb-2">
            The records this metric counts, and what it works out about them.
          </BaseText>
          <!-- Shown only when there is a genuine choice. Every module in the
               registry currently has exactly one source table, so asking would
               be a required field with a single option — a gate that confirms
               something the author never chose. -->
          <BaseSelect
            v-if="sourceTables.length > 1"
            v-model="form.definition.sourceTable"
            :options="sourceTables"
            :searchable="false"
            required
            class="tw:mb-3"
          >
            <template #label>
              <BaseLabel :help="FIELD_HELP.records" required>Records</BaseLabel>
            </template>
          </BaseSelect>

          <div class="tw:grid tw:gap-3 tw:sm:grid-cols-2">
            <BaseSelect
              v-model="measureType"
              :options="MEASURE_OPTIONS"
              optionDescription="description"
              :hint="measureHint"
              :searchable="false"
              required
            >
              <template #label>
                <BaseLabel :help="FIELD_HELP.measure" required>What to work out</BaseLabel>
              </template>
            </BaseSelect>
            <BaseSelect
              v-if="needsMeasureField"
              v-model="form.definition.measure.field"
              :options="measureType === MEASURES.COUNT_DISTINCT ? filterFields : numberFields"
              :searchable="false"
              required
            >
              <template #label>
                <BaseLabel :help="FIELD_HELP.measureField" required>Field to measure</BaseLabel>
              </template>
            </BaseSelect>
            <!-- Asked here, stored as a reporting_key filter. Without it a sum
                 mixes every numeric answer on the module together — see
                 `measuredKey`. The compiler refuses the save outright, so this
                 is the path that stops the author ever seeing that. -->
            <BaseSelect
              v-if="measuresEav && keyOptions.length"
              v-model="measuredKey"
              label="Which answer?"
              :options="keyOptions"
              hint="Every number on this module is stored together, so this picks the one to measure."
              required
            />
          </div>

          <!-- The ratio's numerator. Its own block, because "the top half of the
               fraction" is a genuinely different idea from "which records count
               at all", and merging the two lists is how people build a
               percentage that is always 100%. -->
          <div v-if="isRatio" class="tw:rounded tw:border tw:border-divider tw:p-3">
            <div class="tw:mb-1 tw:flex tw:items-center tw:justify-between">
              <BaseLabel :help="FIELD_HELP.numerator">Counted as a success when…</BaseLabel>
              <BaseButton size="sm" variant="outline" @click="addFilter(form.definition.measure.numerator)">
                <IconPlus :size="14" aria-hidden="true" />
                Add condition
              </BaseButton>
            </div>
            <!--
              Says the quiet part, because a percentage is the one measurement
              here with TWO halves and the picker above gives no hint of it.

              The sentence about filters applying to both is the load-bearing
              one. Without it the natural thing to do is filter the records down
              to the very thing being measured — filter Status is Closed, then
              call Closed a success — which yields a metric that reads 100% in
              every period and looks like it is working.
            -->
            <BaseText variant="caption" color="secondary" class="tw:mb-3">
              A percentage is a fraction: these conditions decide the top half, and every record
              this metric includes is the bottom half. Any filters you set above apply to
              <strong>both</strong>, so do not repeat them here.
            </BaseText>
            <div
              v-for="(f, i) in form.definition.measure.numerator"
              :key="`num-${i}`"
              class="tw:mb-2 tw:grid tw:items-end tw:gap-2 tw:sm:grid-cols-[1fr_1fr_1fr_auto]"
            >
              <BaseSelect
                v-model="f.field"
                label="Field"
                :options="filterFields"
                @update:modelValue="onFilterFieldChange(f)"
              />
              <BaseSelect v-model="f.op" label="Comparison" :options="OP_OPTIONS" :searchable="false" />
              <BaseSelect
                v-if="!VALUELESS_OPS.includes(f.op) && picksFromKeys(f)"
                v-model="f.values"
                label="Values"
                multiple
                :options="keyOptions"
                hint="The fields this form reports on"
              />
              <!-- The stored id is what the compiler filters on, but the NAME is
                   what the author recognises. Picking makes a value that does not
                   exist unreachable — a typed one compiles fine and counts nothing. -->
              <BaseSelect
                v-else-if="!VALUELESS_OPS.includes(f.op) && picksFromLookup(f)"
                v-model="f.values"
                label="Values"
                multiple
                :options="lookupOptionsFor(f)"
              />
              <!-- A custom module's own field: the row names it, so its answers
                   need no second row to disambiguate them. -->
              <BaseSelect
                v-else-if="!VALUELESS_OPS.includes(f.op) && customFieldAnswerOptions(f).length"
                v-model="f.values"
                label="Values"
                multiple
                :options="customFieldAnswerOptions(f)"
                hint="The answers this field offers"
              />
              <!-- A custom module's answers, read from the form that defines
                   them. Needs a `reporting_key` row pinning ONE field first —
                   which answers are legal depends on which field is measured. -->
              <BaseSelect
                v-else-if="!VALUELESS_OPS.includes(f.op) && eavAnswerOptions(f).length"
                v-model="f.values"
                label="Values"
                multiple
                :options="eavAnswerOptions(f)"
                hint="The answers this field offers"
              />
              <BaseTextInput
                v-else-if="!VALUELESS_OPS.includes(f.op)"
                :modelValue="valuesText(f)"
                label="Values"
                placeholder="CLOSED, CANCELLED"
                :hint="answerHint(f) || typedValueHint(f)"
                @update:modelValue="setValues(f, $event)"
              />
              <BaseButton
                size="sm"
                variant="ghost"
                aria-label="Remove condition"
                @click="removeFilter(form.definition.measure.numerator, i)"
              >
                <IconTrash :size="14" aria-hidden="true" />
              </BaseButton>
            </div>
          </div>

              <div class="tw:mt-3 tw:flex tw:justify-end">
                <BaseButton size="sm" variant="outline" @click="goToSection(nextSectionAfter(BUILDER_SECTIONS.RECORDS))">
                  Next
                </BaseButton>
              </div>
            </div>
          </template>

          <!-- C. WHICH ARE INCLUDED ────────────────────────────────────────
               Every row here is joined with AND, because that is the only thing
               the compiler can express. The copy says "all of" rather than
               leaving it implied: a user who assumes OR would build a filter
               that silently returns nothing. -->
          <template #filters>
            <div :id="`builder-section-${BUILDER_SECTIONS.FILTERS}`">
            <div class="tw:mb-1 tw:flex tw:items-center tw:justify-between">
              <BaseLabel :help="FIELD_HELP.filters">Conditions</BaseLabel>
              <BaseButton size="sm" variant="outline" @click="addFilter(form.definition.filters)">
                <IconPlus :size="14" aria-hidden="true" />
                Add filter
              </BaseButton>
            </div>
            <!--
              Reported, not refused. The definition is legal and the compiler
              accepts it — it simply cannot match, because each answer on this
              module is stored as its own row and one row cannot be two fields.
              Blocking the save here would be this form overruling the server.
            -->
            <BaseBanner
              v-if="eavConflict"
              tone="warning"
              :icon="IconAlertTriangle"
              title="This combination will count nothing"
              :message="eavConflict"
              class="tw:mb-2"
            />
            <BaseText variant="caption" color="secondary" class="tw:mb-2">
              Add a filter to measure only some records. A record must match
              <strong>all</strong> of them to be counted.
            </BaseText>
            <BaseText v-if="!form.definition.filters.length" variant="caption" color="secondary">
              No filters — every record counts.
            </BaseText>
            <div
              v-for="(f, i) in form.definition.filters"
              :key="`flt-${i}`"
              class="tw:mb-2 tw:grid tw:items-end tw:gap-2 tw:sm:grid-cols-[1fr_1fr_1fr_auto]"
            >
              <BaseSelect
                v-model="f.field"
                label="Field"
                :options="filterFields"
                @update:modelValue="onFilterFieldChange(f)"
              />
              <BaseSelect v-model="f.op" label="Comparison" :options="OP_OPTIONS" :searchable="false" />
              <BaseSelect
                v-if="!VALUELESS_OPS.includes(f.op) && picksFromKeys(f)"
                v-model="f.values"
                label="Values"
                multiple
                :options="keyOptions"
                hint="The fields this form reports on"
              />
              <!-- The stored id is what the compiler filters on, but the NAME is
                   what the author recognises. Picking makes a value that does not
                   exist unreachable — a typed one compiles fine and counts nothing. -->
              <BaseSelect
                v-else-if="!VALUELESS_OPS.includes(f.op) && picksFromLookup(f)"
                v-model="f.values"
                label="Values"
                multiple
                :options="lookupOptionsFor(f)"
              />
              <!-- A custom module's own field: the row names it, so its answers
                   need no second row to disambiguate them. -->
              <BaseSelect
                v-else-if="!VALUELESS_OPS.includes(f.op) && customFieldAnswerOptions(f).length"
                v-model="f.values"
                label="Values"
                multiple
                :options="customFieldAnswerOptions(f)"
                hint="The answers this field offers"
              />
              <!-- A custom module's answers, read from the form that defines
                   them. Needs a `reporting_key` row pinning ONE field first —
                   which answers are legal depends on which field is measured. -->
              <BaseSelect
                v-else-if="!VALUELESS_OPS.includes(f.op) && eavAnswerOptions(f).length"
                v-model="f.values"
                label="Values"
                multiple
                :options="eavAnswerOptions(f)"
                hint="The answers this field offers"
              />
              <BaseTextInput
                v-else-if="!VALUELESS_OPS.includes(f.op)"
                :modelValue="valuesText(f)"
                label="Values"
                placeholder="CLOSED, CANCELLED"
                :hint="answerHint(f) || typedValueHint(f)"
                @update:modelValue="setValues(f, $event)"
              />
              <BaseButton
                size="sm"
                variant="ghost"
                aria-label="Remove filter"
                @click="removeFilter(form.definition.filters, i)"
              >
                <IconTrash :size="14" aria-hidden="true" />
              </BaseButton>
            </div>

              <div class="tw:mt-3 tw:flex tw:justify-end">
                <BaseButton size="sm" variant="outline" @click="goToSection(nextSectionAfter(BUILDER_SECTIONS.FILTERS))">
                  Next
                </BaseButton>
              </div>
            </div>
          </template>

          <!-- D. WHEN ──────────────────────────────────────────────────────
               Its own section rather than a field beside "Records", because
               which date a record is counted by is the single most consequential
               choice in the form and the one most often got wrong. A CAPA raised
               in March and closed in June is a March figure or a June figure
               depending only on this. -->
          <template #when>
            <div :id="`builder-section-${BUILDER_SECTIONS.WHEN}`">
            <BaseText variant="caption" color="secondary" class="tw:mb-2">
              The date that decides which period a record falls into. Counting by when something
              was raised answers a different question from counting by when it was closed.
            </BaseText>
            <BaseSelect
              v-model="form.definition.timeField"
              :options="dateFields"
              required
            >
              <template #label>
                <BaseLabel :help="FIELD_HELP.timeField" required>Counted by date</BaseLabel>
              </template>
            </BaseSelect>

              <div v-if="form.definition.timeField" class="tw:mt-3 tw:flex tw:justify-end">
                <BaseButton size="sm" variant="outline" @click="goToSection(nextSectionAfter(BUILDER_SECTIONS.WHEN))">
                  Next
                </BaseButton>
              </div>
            </div>
          </template>

          <!-- E + F. Breakdown and reporting, merged: both are about how the
               finished figure is PRESENTED rather than what it counts, and two
               accordion rows for four controls is more chrome than content. -->
          <template #breakdown>
            <div :id="`builder-section-${BUILDER_SECTIONS.BREAKDOWN}`">
          <div>
            <BaseText weight="medium">How should the results be broken down?</BaseText>
            <BaseText variant="caption" color="secondary" class="tw:mb-2">
              Optional. Choose a field to compare the figure across groups — by department, by
              site, by severity. Leave it empty for a single total.
            </BaseText>
            <BaseSelect
              v-model="form.definition.groupBy"
              :options="groupFields"
              multiple
              :hint="`Up to ${dimensionCap}. This is what a breakdown can be split on later.`"
            >
              <template #label>
                <BaseLabel :help="FIELD_HELP.breakdown">Break down by</BaseLabel>
              </template>
            </BaseSelect>
          </div>

          <!-- F. PERFORMANCE ─────────────────────────────────────────────── -->
          <div class="tw:mt-4 tw:border-t tw:border-divider tw:pt-4">
            <BaseText weight="medium">How should performance be interpreted?</BaseText>
            <BaseText variant="caption" color="secondary" class="tw:mb-2">
              How a dashboard should colour a rise or a fall, and how often the figure is
              reported.
            </BaseText>
            <div class="tw:grid tw:gap-3 tw:sm:grid-cols-2">
              <BaseSelect
                v-model="form.direction"
                :options="DIRECTION_OPTIONS"
                :searchable="false"
              >
                <template #label>
                  <BaseLabel :help="FIELD_HELP.direction">Direction</BaseLabel>
                </template>
              </BaseSelect>
              <BaseSelect
                v-model="form.grain"
                :options="GRAIN_OPTIONS"
                :searchable="false"
              >
                <template #label>
                  <BaseLabel :help="FIELD_HELP.grain">Reported</BaseLabel>
                </template>
              </BaseSelect>
            </div>

            </div>
            </div>
          </template>
        </BaseAccordion>

          <!--
            The definition, in words.

            ⚠ There are NO FIGURES here, and that is not a limitation being worked
            around. The metric does not exist until it is saved and compiled, and
            its first figures arrive with the next rollup refresh — so any number
            shown at this point would be invented. In a product where every tile
            prints the timestamp its figure was computed at, a plausible-looking
            fabricated count is worse than no preview at all.

            The sentence is what CAN honestly be shown, and it is the same
            sentence the compiler will store and every tile will display.
          -->
          <div
            v-if="sentence"
            class="tw:rounded tw:border tw:border-divider tw:bg-gray-50 tw:p-3"
          >
            <BaseText weight="medium" class="tw:mb-2">What you'll see</BaseText>

            <!-- The configuration, read back as a list. Deliberately the same
                 facts the form holds rather than anything computed: it is here
                 so the last thing before Save is a check, not a discovery. -->
            <dl class="tw:grid tw:gap-x-3 tw:gap-y-1 tw:sm:grid-cols-[auto_1fr]">
              <BaseText as="dt" variant="caption" color="secondary">Metric</BaseText>
              <BaseText as="dd">{{ form.name || 'Not named yet' }}</BaseText>

              <BaseText as="dt" variant="caption" color="secondary">Calculation</BaseText>
              <BaseText as="dd">{{ measureLabel }}</BaseText>

              <template v-if="filterSummary">
                <BaseText as="dt" variant="caption" color="secondary">Filters</BaseText>
                <BaseText as="dd">{{ filterSummary }}</BaseText>
              </template>

              <template v-if="breakdownSummary">
                <BaseText as="dt" variant="caption" color="secondary">Breakdown</BaseText>
                <BaseText as="dd">{{ breakdownSummary }}</BaseText>
              </template>

              <BaseText as="dt" variant="caption" color="secondary">Time</BaseText>
              <BaseText as="dd">{{ grainLabel }}</BaseText>
            </dl>

            <BaseText class="tw:mt-3">{{ sentence }}</BaseText>
            <BaseText variant="caption" color="secondary" class="tw:mt-2">
              Figures appear once the metric is saved, published and the next analytics refresh
              has run. Every reader sees only the records their own access allows.
            </BaseText>
          </div>
      </template>
    </div>

    <!-- No footer while choosing: there is nothing to save yet, and a disabled
         Save button next to the cards reads as "these do not work". -->
    <template v-if="!choosing" #footer="{ close }">
      <div class="tw:flex tw:w-full tw:flex-col tw:gap-2">
        <!--
          The reason a save is blocked, as a way BACK to the field.

          It used to be a plain string on the footer, which meant "Give the
          metric a name" could appear while the name field was several hundred
          pixels off screen — naming a problem with no way to reach it. When the
          message belongs to a section, this opens that section and scrolls to
          it; when it does not, it stays the plain sentence it was.
        -->
        <button
          v-if="problem && blockedSection"
          type="button"
          class="tw:flex tw:items-center tw:gap-1 tw:self-start tw:rounded tw:text-left tw:text-xs tw:text-bad tw:underline tw:underline-offset-2 tw:hover:opacity-80 tw:focus-visible:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-primary/40"
          @click="revealProblem"
        >
          <IconAlertTriangle :size="14" aria-hidden="true" />
          {{ problem }}
        </button>
        <BaseDialogFooter
          :loading="saving"
          :disabled="!canSave"
          :submitLabel="metric ? 'Save changes' : 'Save metric'"
          :submitTitle="problem || undefined"
          :error="blockedSection ? '' : problem || ''"
          @cancel="close"
          @submit="save"
        />
      </div>
    </template>
  </BaseDialog>
</template>
