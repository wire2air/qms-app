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
 * ── THE ONE THING THIS DOES NOT DO YET ──────────────────────────────────────
 * Filter values are typed, not picked. The registry names a `lookupTable` for
 * every enum and uuid field, so a picker is buildable — it needs a mapping from
 * a Postgres table name to the SyncEngine model that mirrors it, which does not
 * exist yet. Typed values are validated by the compiler and quote_literal()'d, so
 * this is a usability gap and not a correctness one. It is called out on the
 * field itself rather than left for the user to discover.
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
} from '@/utils/analyticsCustomMetricAccess.js'
import { IconPlus, IconTrash, IconAlertTriangle } from '@tabler/icons-vue'

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

function sourceLabel(t) {
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
const filterFields = computed(() => tableFields.value.filter((f) => f.filterable).map(asOption))
const groupFields = computed(() => tableFields.value.filter((f) => f.groupable).map(asOption))
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
    form.value.definition = blankDefinition()
  },
)
watch(
  () => form.value.definition.sourceTable,
  () => {
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

const problem = computed(() => definitionProblem(form.value.definition, form.value, props.dimensionCap))
const canSave = computed(() => !problem.value && !saving.value)

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
    subtitle="Describe the question. The server works out how to count it, and every reader still sees only the records their own access allows."
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

      <div class="tw:grid tw:gap-3 tw:sm:grid-cols-2">
        <BaseTextInput
          v-model="form.name"
          label="Metric name"
          placeholder="e.g. Open documents by site"
        />
        <BaseSelect
          v-model="form.moduleId"
          label="Module"
          :options="modules"
          :searchable="false"
          required
        />
      </div>

      <BaseTextarea
        v-model="form.description"
        label="Description"
        :rows="2"
        placeholder="What this measures, and who reads it."
      />

      <template v-if="form.moduleId">
        <div class="tw:border-t tw:border-divider tw:pt-4">
          <BaseText weight="medium" class="tw:mb-2">What is counted</BaseText>
          <div class="tw:grid tw:gap-3 tw:sm:grid-cols-2">
            <BaseSelect
              v-model="form.definition.sourceTable"
              label="Records"
              :options="sourceTables"
              :searchable="false"
              required
            />
            <BaseSelect
              v-model="form.definition.timeField"
              label="Counted by date"
              :options="dateFields"
              :searchable="false"
              :disabled="!form.definition.sourceTable"
              required
            />
          </div>
        </div>

        <template v-if="form.definition.sourceTable">
          <div class="tw:grid tw:gap-3 tw:sm:grid-cols-2">
            <BaseSelect
              v-model="measureType"
              label="Measurement"
              :options="MEASURE_OPTIONS"
              optionDescription="description"
              :searchable="false"
              required
            />
            <BaseSelect
              v-if="needsMeasureField"
              v-model="form.definition.measure.field"
              label="Field to measure"
              :options="measureType === MEASURES.COUNT_DISTINCT ? filterFields : numberFields"
              :searchable="false"
              required
            />
          </div>

          <!-- The ratio's numerator. Its own block, because "the top half of the
               fraction" is a genuinely different idea from "which records count
               at all", and merging the two lists is how people build a
               percentage that is always 100%. -->
          <div v-if="isRatio" class="tw:rounded tw:border tw:border-divider tw:p-3">
            <div class="tw:mb-2 tw:flex tw:items-center tw:justify-between">
              <BaseText weight="medium">Counted as a success when…</BaseText>
              <BaseButton size="sm" variant="outline" @click="addFilter(form.definition.measure.numerator)">
                <IconPlus :size="14" aria-hidden="true" />
                Add condition
              </BaseButton>
            </div>
            <div
              v-for="(f, i) in form.definition.measure.numerator"
              :key="`num-${i}`"
              class="tw:mb-2 tw:grid tw:items-end tw:gap-2 tw:sm:grid-cols-[1fr_1fr_1fr_auto]"
            >
              <BaseSelect v-model="f.field" label="Field" :options="filterFields" :searchable="false" />
              <BaseSelect v-model="f.op" label="Comparison" :options="OP_OPTIONS" :searchable="false" />
              <BaseTextInput
                v-if="!VALUELESS_OPS.includes(f.op)"
                :modelValue="valuesText(f)"
                label="Values"
                placeholder="CLOSED, CANCELLED"
                hint="Comma separated"
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

          <!-- Shared filters. -->
          <div class="tw:border-t tw:border-divider tw:pt-4">
            <div class="tw:mb-2 tw:flex tw:items-center tw:justify-between">
              <BaseText weight="medium">Only include records where…</BaseText>
              <BaseButton size="sm" variant="outline" @click="addFilter(form.definition.filters)">
                <IconPlus :size="14" aria-hidden="true" />
                Add filter
              </BaseButton>
            </div>
            <BaseText v-if="!form.definition.filters.length" variant="caption" color="secondary">
              No filters — every record counts.
            </BaseText>
            <div
              v-for="(f, i) in form.definition.filters"
              :key="`flt-${i}`"
              class="tw:mb-2 tw:grid tw:items-end tw:gap-2 tw:sm:grid-cols-[1fr_1fr_1fr_auto]"
            >
              <BaseSelect v-model="f.field" label="Field" :options="filterFields" :searchable="false" />
              <BaseSelect v-model="f.op" label="Comparison" :options="OP_OPTIONS" :searchable="false" />
              <BaseTextInput
                v-if="!VALUELESS_OPS.includes(f.op)"
                :modelValue="valuesText(f)"
                label="Values"
                placeholder="CLOSED, CANCELLED"
                hint="Comma separated, exactly as stored"
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
          </div>

          <!-- Grouping. The cap comes from the rollup, not from this form. -->
          <div class="tw:border-t tw:border-divider tw:pt-4">
            <BaseSelect
              v-model="form.definition.groupBy"
              label="Split by"
              :options="groupFields"
              multiple
              :searchable="false"
              :hint="`Up to ${dimensionCap}. This is what a breakdown can be split on later.`"
            />
          </div>

          <div class="tw:grid tw:gap-3 tw:sm:grid-cols-2">
            <BaseSelect
              v-model="form.direction"
              label="Which way is good?"
              :options="DIRECTION_OPTIONS"
              :searchable="false"
            />
            <BaseSelect
              v-model="form.grain"
              label="Reported by"
              :options="GRAIN_OPTIONS"
              :searchable="false"
            />
          </div>
        </template>
      </template>
    </div>

    <template #footer="{ close }">
      <BaseDialogFooter
        :loading="saving"
        :disabled="!canSave"
        :submitLabel="metric ? 'Save changes' : 'Create metric'"
        :submitTitle="problem || undefined"
        :error="problem || ''"
        @cancel="close"
        @submit="save"
      />
    </template>
  </BaseDialog>
</template>
