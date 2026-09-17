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
  definitionSentence,
} from '@/utils/analyticsCustomMetricAccess.js'
import { templatesForModule } from '@/utils/analyticsMetricTemplates.js'
import { IconPlus, IconTrash, IconAlertTriangle, IconSparkles } from '@tabler/icons-vue'

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
            definition: {
              ...blankDefinition(),
              ...JSON.parse(JSON.stringify(props.metric.definition ?? {})),
            },
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
const templates = computed(() =>
  props.metric || form.value.moduleId ? [] : templatesForModule(),
)

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
const sentence = computed(() =>
  definitionSentence(form.value.definition, form.value, tableFields.value),
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

      <!-- Start from a template. Shown only while creating and only before a
           module is picked, so it is an offer at the start rather than a
           standing invitation to discard work. -->
      <div v-if="templates.length" class="tw:rounded tw:border tw:border-divider tw:p-3">
        <BaseText weight="medium" class="tw:mb-1">Start with a template</BaseText>
        <BaseText variant="caption" color="secondary" class="tw:mb-3">
          A common quality measure, filled in and ready to adjust. Or fill in the form below to
          start from scratch.
        </BaseText>
        <ContentGrid min="15rem">
          <BaseClickableRow
            v-for="t in templates"
            :key="t.id"
            :aria-label="`Use template ${t.name}`"
            class="tw:rounded tw:border tw:border-divider tw:p-2 tw:hover:border-primary"
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

      <!-- A. WHAT ──────────────────────────────────────────────────────────── -->
      <div>
        <BaseText weight="medium">What are you measuring?</BaseText>
        <BaseText variant="caption" color="secondary" class="tw:mb-2">
          Use a name your quality team will recognise on a dashboard.
        </BaseText>
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
          class="tw:mt-3"
          placeholder="What this measures, and who reads it."
        />
      </div>

      <template v-if="form.moduleId">
        <!-- B. WHICH RECORDS ─────────────────────────────────────────────── -->
        <div class="tw:border-t tw:border-divider tw:pt-4">
          <BaseText weight="medium">Which records should we measure?</BaseText>
          <BaseText variant="caption" color="secondary" class="tw:mb-2">
            The records this metric counts, and what it works out about them.
          </BaseText>
          <BaseSelect
            v-model="form.definition.sourceTable"
            label="Records"
            :options="sourceTables"
            :searchable="false"
            required
          />
        </div>

        <template v-if="form.definition.sourceTable">
          <div class="tw:grid tw:gap-3 tw:sm:grid-cols-2">
            <BaseSelect
              v-model="measureType"
              label="What to work out"
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

          <!-- C. WHICH ARE INCLUDED ────────────────────────────────────────
               Every row here is joined with AND, because that is the only thing
               the compiler can express. The heading says "all of" rather than
               leaving it implied: a user who assumes OR would build a filter
               that silently returns nothing. -->
          <div class="tw:border-t tw:border-divider tw:pt-4">
            <div class="tw:mb-1 tw:flex tw:items-center tw:justify-between">
              <BaseText weight="medium">Which records should be included?</BaseText>
              <BaseButton size="sm" variant="outline" @click="addFilter(form.definition.filters)">
                <IconPlus :size="14" aria-hidden="true" />
                Add filter
              </BaseButton>
            </div>
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

          <!-- D. WHEN ──────────────────────────────────────────────────────
               Its own section rather than a field beside "Records", because
               which date a record is counted by is the single most consequential
               choice in the form and the one most often got wrong. A CAPA raised
               in March and closed in June is a March figure or a June figure
               depending only on this. -->
          <div class="tw:border-t tw:border-divider tw:pt-4">
            <BaseText weight="medium">When should a record count?</BaseText>
            <BaseText variant="caption" color="secondary" class="tw:mb-2">
              The date that decides which period a record falls into. Counting by when something
              was raised answers a different question from counting by when it was closed.
            </BaseText>
            <BaseSelect
              v-model="form.definition.timeField"
              label="Counted by date"
              :options="dateFields"
              :searchable="false"
              required
            />
          </div>

          <!-- E. BREAKDOWN. The cap comes from the rollup, not from this form. -->
          <div class="tw:border-t tw:border-divider tw:pt-4">
            <BaseText weight="medium">How should the results be broken down?</BaseText>
            <BaseText variant="caption" color="secondary" class="tw:mb-2">
              Optional. Choose a field to compare the figure across groups — by department, by
              site, by severity. Leave it empty for a single total.
            </BaseText>
            <BaseSelect
              v-model="form.definition.groupBy"
              label="Break down by"
              :options="groupFields"
              multiple
              :searchable="false"
              :hint="`Up to ${dimensionCap}. This is what a breakdown can be split on later.`"
            />
          </div>

          <!-- F. PERFORMANCE ─────────────────────────────────────────────── -->
          <div class="tw:border-t tw:border-divider tw:pt-4">
            <BaseText weight="medium">How should performance be interpreted?</BaseText>
            <BaseText variant="caption" color="secondary" class="tw:mb-2">
              How a dashboard should colour a rise or a fall, and how often the figure is
              reported.
            </BaseText>
            <div class="tw:grid tw:gap-3 tw:sm:grid-cols-2">
              <BaseSelect
                v-model="form.direction"
                label="Direction"
                :options="DIRECTION_OPTIONS"
                :searchable="false"
              />
              <BaseSelect
                v-model="form.grain"
                label="Reported"
                :options="GRAIN_OPTIONS"
                :searchable="false"
              />
            </div>
          </div>

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
            <BaseText weight="medium" class="tw:mb-1">What this metric will measure</BaseText>
            <BaseText>{{ sentence }}</BaseText>
            <BaseText variant="caption" color="secondary" class="tw:mt-2">
              Figures appear once the metric is saved, published and the next analytics refresh
              has run. Every reader sees only the records their own access allows.
            </BaseText>
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
