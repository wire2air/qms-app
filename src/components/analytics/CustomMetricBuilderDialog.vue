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
 * ── HOW IT IS ORGANISED, AND WHY THAT ORDER ─────────────────────────────────
 * Two questions and a sentence:
 *
 *   Module + date  — which records, and the date they are counted by
 *   Name           — what to call it, and an optional description
 *   →  a plain-English summary of what will be counted
 *   ▸  Refine (optional) — percentages, filters, breakdowns, period
 *
 * The summary is the load-bearing part. Every control above it answers one
 * question about the metric in isolation; nothing else in the form tells you
 * whether the eleven answers add up to the thing you were asked for, and a
 * definition is not something a non-analyst can read back off a row of selects.
 * It is rendered from the same definition that will be saved, so it cannot
 * describe a metric other than the one being built.
 *
 * Everything optional starts collapsed and every optional field has a default
 * that is right for most metrics (count, monthly, no direction), so a first
 * metric is genuinely three answers. Editing an existing metric auto-expands the
 * refinements if it uses any — nothing saved is ever hidden from the person
 * editing it.
 *
 * ── WHY compileError IS SHOWN AS PROMINENTLY AS IT IS ───────────────────────
 * A save that "worked" but produced no usable metric is the confusing outcome,
 * and it is reachable: the client's checks are a deliberate subset of the
 * compiler's, so the server can refuse something this form allowed. When that
 * happens the row still exists — it is a draft that does not compile — and the
 * banner is the only thing that says so. Silence here would leave a metric that
 * is saved, listed, and quietly absent from every dashboard.
 */
import {
  MEASURES,
  MEASURE_OPTIONS,
  DIRECTION_OPTIONS,
  GRAIN_OPTIONS,
  blankDefinition,
  definitionProblem,
  describeDefinition,
  lookupModelName,
  lookupRowLabel,
  moduleLabel,
  recordLabel,
} from '@/utils/analyticsCustomMetricAccess.js'
import { IconAlertTriangle, IconChevronRight, IconSparkles } from '@tabler/icons-vue'

const props = defineProps({
  /** An existing AnalyticsCustomMetric row, or null to create. */
  metric: { type: Object, default: null },
  /** Every AnalyticsModuleField the viewer can see — the parent fetches once. */
  fields: { type: Array, default: () => [] },
  /** analytics_dimension_capacity(), read from the metric catalog. */
  dimensionCap: { type: Number, default: 3 },
})

const emit = defineEmits(['saved'])
const open = defineModel('open', { type: Boolean, default: false })

const toast = useToast()
const saving = ref(false)
const form = ref(blank())

// Collapsed by default so a new metric is three answers instead of eleven.
// Auto-expanded when editing a metric that already uses any of them.
const showAdvanced = ref(false)

// Whether the name field has been visited — see `visibleProblem`. Declared up
// here, not next to the computed that reads it: the seed watcher below runs
// immediately at setup and assigns it, which a later `const` would have made a
// temporal-dead-zone throw before the dialog rendered at all.
const nameTouched = ref(false)

function hasAdvancedContent(metric) {
  if (!metric) return false
  const def = metric.definition ?? {}
  return (
    (def.measure?.type ?? MEASURES.COUNT) !== MEASURES.COUNT ||
    (def.filters ?? []).length > 0 ||
    (def.groupBy ?? []).length > 0 ||
    (metric.direction ?? 'neutral') !== 'neutral' ||
    (metric.grain ?? 'month') !== 'month'
  )
}

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
 * ⚠ Load-bearing. The watchers below clear dependent fields when the module or
 * the source table changes, which is right when a PERSON changes them and wrong
 * when the form is merely being populated: seeding an existing metric moves
 * sourceTable from null to its saved value, which looks identical to a user
 * picking it, and the reset then wiped the saved filters and groupBy.
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
    seeding.value = true
    nameTouched.value = !!props.metric
    showAdvanced.value = hasAdvancedContent(props.metric)
    // Cleared on the next tick, AFTER the reset watchers have flushed for this
    // change. Clearing it synchronously would leave them firing against a form
    // that is already seeded, which is the bug this flag exists for.
    nextTick(() => {
      seeding.value = false
    })
    form.value = props.metric
      ? {
          name: props.metric.name ?? '',
          description: props.metric.description ?? '',
          moduleId: props.metric.moduleId ?? null,
          direction: props.metric.direction ?? 'neutral',
          grain: props.metric.grain ?? 'month',
          definition: {
            ...blankDefinition(),
            ...JSON.parse(JSON.stringify(props.metric.definition ?? {})),
          },
        }
      : blank()
  },
  { immediate: true },
)

// ── the registry, sliced the way the form needs it ──────────────────────────
const modules = computed(() => {
  const seen = new Set()
  for (const f of props.fields) seen.add(f.moduleId)
  return [...seen].sort().map((id) => ({ value: id, label: moduleLabel(id) }))
})

const moduleFields = computed(() => props.fields.filter((f) => f.moduleId === form.value.moduleId))

const sourceTables = computed(() => {
  const seen = new Set()
  for (const f of moduleFields.value) seen.add(f.sourceTable)
  return [...seen].sort().map((t) => ({ value: t, label: recordLabel(t) }))
})

/**
 * Every module in the registry has exactly one source table today, so asking
 * which one is asking a question with one possible answer — and it is asked in
 * the vocabulary of the schema. Picked automatically, and the control is hidden
 * unless a module genuinely offers a choice.
 */
const needsSourceChoice = computed(() => sourceTables.value.length > 1)

watch(
  sourceTables,
  (list) => {
    if (seeding.value) return
    if (list.length === 1 && form.value.definition.sourceTable !== list[0].value) {
      form.value.definition.sourceTable = list[0].value
    }
  },
  { immediate: true },
)

const tableFields = computed(() =>
  moduleFields.value
    .filter((f) => f.sourceTable === form.value.definition.sourceTable)
    .slice()
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
)

const dateFields = computed(() => tableFields.value.filter((f) => f.kind === 'date').map(asOption))
const filterFields = computed(() => tableFields.value.filter((f) => f.filterable).map(asOption))
const groupFields = computed(() => tableFields.value.filter((f) => f.groupable).map(asOption))
const numberFields = computed(() =>
  tableFields.value.filter((f) => f.kind === 'number').map(asOption),
)

function asOption(f) {
  return { value: f.columnName, label: f.label }
}

/**
 * The real values behind every filterable field of the chosen table, so a
 * condition is picked rather than typed from memory.
 *
 * One query for the whole table rather than one per condition row: the same
 * lookup feeds the field pickers AND the summary sentence, the rows are small
 * static reference data already in IndexedDB, and a per-row query would re-read
 * the same statuses every time someone adds a condition.
 *
 * `models: '*'` because which models these are is only known at runtime, from
 * `lookupTable` — useLiveQuery fixes its subscription list at setup. These are
 * reference tables that essentially never change, so the wildcard costs a
 * debounced re-read on unrelated syncs and nothing else.
 */
const lookupOptions = useLiveQueryWithDeps(
  [() => tableFields.value.map((f) => `${f.columnName}:${f.lookupTable ?? ''}`).join('|')],
  async (db) => {
    const out = {}
    for (const f of tableFields.value) {
      if (!f.lookupTable || !f.filterable) continue
      const modelName = lookupModelName(db, f.lookupTable)
      if (!modelName) continue
      const rows = await db[modelName].where().exec()
      out[f.columnName] = rows
        .map((r) => ({ value: r.id, label: lookupRowLabel(r) }))
        .sort((a, b) => a.label.localeCompare(b.label))
    }
    return out
  },
  { initial: {} },
)

/** A stored code or uuid, as its label — used by the summary sentence. */
function valueLabel(column, value) {
  return (lookupOptions.value?.[column] ?? []).find((o) => o.value === value)?.label ?? ''
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
    form.value.definition.measure = type === MEASURES.RATIO ? { type, numerator: [] } : { type }
  },
})

const needsMeasureField = computed(() =>
  [MEASURES.SUM, MEASURES.AVG, MEASURES.COUNT_DISTINCT].includes(measureType.value),
)
const isRatio = computed(() => measureType.value === MEASURES.RATIO)

const numerator = computed({
  get: () => form.value.definition.measure?.numerator ?? [],
  set: (rows) => {
    form.value.definition.measure.numerator = rows
  },
})

const problem = computed(() =>
  definitionProblem(form.value.definition, form.value, props.dimensionCap),
)
const canSave = computed(() => !problem.value && !saving.value)

/**
 * The reason to SHOW, which is not always the reason to BLOCK.
 *
 * `problem` gates the save and is checked in save order, so on an untouched form
 * it reads "Give the metric a name." — a red error about a field that is not on
 * screen yet (the name section only appears once there are records to name) and
 * that nobody has been asked to fill in. That is a complaint, not guidance, and
 * it made the dialog look broken the moment it opened.
 *
 * So the inline error waits until the thing it names has actually been put to
 * the user. The submit button stays disabled either way and carries the same
 * text as its tooltip, and the name field carries its own required marker, so
 * nothing is hidden — only deferred until it is fair to say it.
 */
const visibleProblem = computed(() => {
  if (!problem.value) return null
  // Nothing has been chosen yet: the form is a question, not a failure.
  if (!form.value.definition.sourceTable) return null
  // The name is asked for but never yet visited, and is empty because it has
  // never been filled rather than because it was emptied.
  if (!form.value.name.trim() && !nameTouched.value) return null
  return problem.value
})

/** What this metric will count, in words. Null while there is nothing to describe. */
const summary = computed(() =>
  describeDefinition(form.value.definition, form.value, tableFields.value, valueLabel),
)

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
        definition: form.value.definition,
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
    :title="metric ? 'Edit metric' : 'New metric'"
    subtitle="Answer two questions. Qability works out how to count it, and every reader still sees only the records their own access allows."
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

      <!-- What is being measured -->
      <div class="tw:grid tw:gap-3 tw:sm:grid-cols-2">
        <BaseSelect
          v-model="form.moduleId"
          label="Module"
          placeholder="Choose the records to measure…"
          :options="modules"
          :searchable="false"
          required
          :autoFill="false"
        />
        <BaseSelect
          v-if="needsSourceChoice"
          v-model="form.definition.sourceTable"
          label="Which records"
          :options="sourceTables"
          :searchable="false"
          required
        />
        <BaseSelect
          v-if="form.definition.sourceTable"
          v-model="form.definition.timeField"
          label="Count each record by which date?"
          :options="dateFields"
          :searchable="false"
          required
          hint="A record is counted in the period this date falls in."
        />
      </div>

      <!-- What it is called -->
      <div v-if="form.definition.sourceTable" class="tw:border-t tw:border-divider tw:pt-4">
        <div class="tw:flex tw:flex-col tw:gap-3">
          <BaseTextInput
            v-model="form.name"
            label="Name"
            placeholder="e.g. Open documents by site"
            required
            @blur="nameTouched = true"
          />
          <BaseTextarea
            v-model="form.description"
            label="Description"
            :rows="2"
            placeholder="What this measures, and who reads it."
          />
        </div>
      </div>

      <!--
        The sentence. Rendered from the definition that will actually be saved,
        so it is a readback and not a second description that can drift.
      -->
      <BaseBanner
        v-if="summary"
        tone="info"
        :icon="IconSparkles"
        title="What this metric will show"
        :message="summary"
      />

      <template v-if="form.definition.sourceTable">
        <button
          type="button"
          class="tw:flex tw:w-full tw:items-center tw:justify-between tw:rounded tw:border tw:border-dashed tw:border-divider tw:px-3 tw:py-2 tw:text-sm tw:font-medium tw:text-primary"
          :aria-expanded="showAdvanced"
          aria-controls="metric-advanced-section"
          @click="showAdvanced = !showAdvanced"
        >
          <span>Refine it — percentages, filters, breakdowns (optional)</span>
          <IconChevronRight
            :size="16"
            aria-hidden="true"
            class="tw:transition-transform"
            :class="{ 'tw:rotate-90': showAdvanced }"
          />
        </button>

        <div
          v-show="showAdvanced"
          id="metric-advanced-section"
          class="tw:flex tw:flex-col tw:gap-4"
        >
          <div class="tw:grid tw:gap-3 tw:sm:grid-cols-2">
            <BaseSelect
              v-model="measureType"
              label="What number do you want?"
              :options="MEASURE_OPTIONS"
              optionDescription="description"
              :searchable="false"
              required
            />
            <BaseSelect
              v-if="needsMeasureField"
              v-model="form.definition.measure.field"
              label="Of which field?"
              :options="measureType === MEASURES.COUNT_DISTINCT ? filterFields : numberFields"
              :searchable="false"
              :autoFill="false"
              required
            />
          </div>

          <!-- The ratio's numerator. Its own block, because "the top half of the
               fraction" is a genuinely different idea from "which records count
               at all", and merging the two lists is how people build a
               percentage that is always 100%. -->
          <div v-if="isRatio" class="tw:rounded tw:border tw:border-divider tw:p-3">
            <MetricConditionList
              v-model="numerator"
              title="Counted as a success when…"
              addLabel="Add condition"
              removeLabel="Remove condition"
              emptyText="Add at least one condition — it is the top half of the percentage."
              :fields="filterFields"
              :lookupOptions="lookupOptions"
            />
          </div>

          <div class="tw:border-t tw:border-divider tw:pt-4">
            <MetricConditionList
              v-model="form.definition.filters"
              title="Only include records where…"
              addLabel="Add filter"
              removeLabel="Remove filter"
              emptyText="No filters — every record counts."
              :fields="filterFields"
              :lookupOptions="lookupOptions"
            />
          </div>

          <!-- Grouping. The cap comes from the rollup, not from this form. -->
          <div class="tw:border-t tw:border-divider tw:pt-4">
            <BaseSelect
              v-model="form.definition.groupBy"
              label="Break the number down by"
              :options="groupFields"
              multiple
              :searchable="false"
              :hint="`Optional, up to ${dimensionCap}. Lets a reader split this metric by site, status and so on.`"
            />
          </div>

          <div class="tw:grid tw:gap-3 tw:sm:grid-cols-2">
            <BaseSelect
              v-model="form.grain"
              label="How often is it reported?"
              :options="GRAIN_OPTIONS"
              :searchable="false"
            />
            <BaseSelect
              v-model="form.direction"
              label="Which way is good?"
              :options="DIRECTION_OPTIONS"
              :searchable="false"
              hint="Decides which way a trend arrow counts as an improvement."
            />
          </div>
        </div>
      </template>
    </div>

    <template #footer="{ close }">
      <BaseDialogFooter
        :loading="saving"
        :disabled="!canSave"
        :submitLabel="metric ? 'Save changes' : 'Create metric'"
        :submitTitle="problem || undefined"
        :error="visibleProblem || ''"
        @cancel="close"
        @submit="save"
      />
    </template>
  </BaseDialog>
</template>
