<script setup>
/**
 * Create or edit a saved report DEFINITION — a set of questions, never answers.
 *
 * ── WHAT A REPORT IS, AND WHY IT STORES NO NUMBERS ──────────────────────────
 * The same reasoning as the dashboard builder, and for a stronger reason: a
 * report is EXPORTED. Its output leaves the system into a file, an inbox, an
 * auditor's hands. If a definition carried cached figures, every export would
 * ship its AUTHOR's scope-resolved numbers to whoever received it, and nothing
 * about the resulting spreadsheet would look wrong.
 *
 * So this dialog edits only `{ periodToken, sections: [{ title, metricKeys,
 * breakdown }] }` — exactly the shape `export_analytics_report` consumes. Each
 * export re-resolves every figure under the REQUESTER's own access.
 *
 * ── THE SHAPE IS THE EXPORTER'S, NOT A CONVENIENT ONE ───────────────────────
 * A section may carry any number of metric keys and AT MOST ONE breakdown,
 * because that is what the exporter's GATHER loop reads. Offering a second
 * breakdown here would produce a definition that saves fine, exports silently
 * incomplete, and is only discovered by someone comparing the PDF to the screen.
 *
 * ── PERIOD ──────────────────────────────────────────────────────────────────
 * One token for the WHOLE report, not per section, again because that is what
 * the exporter applies. `last_12_months` resolves to the server's own
 * whole-month window (its PERIOD_TOKENS entry is deliberately `relative: null`);
 * every other token resolves to a concrete range via
 * `analytics_resolve_period_token()` in SQL, so the screen and the PDF cannot
 * disagree about what the period meant.
 */
import { PERIOD_TOKEN_OPTIONS } from '@/utils/analyticsPeriods.js'
import {
  blankDefinition,
  blankSection,
  definitionHasContent,
  normaliseDefinition,
} from '@/utils/analyticsReportAccess.js'
import { VISIBILITY } from '@/utils/analyticsDashboardAccess.js'
import { dimensionOptionsFor } from '@/utils/analyticsViz.js'
import { IconGripVertical, IconPlus, IconTrash } from '@tabler/icons-vue'

const props = defineProps({
  // An existing report to edit; null to create.
  report: { type: Object, default: null },
  // metric_catalog rows, fetched by the page so the dialog does not re-query.
  metrics: { type: Array, default: () => [] },
  metricsLoading: { type: Boolean, default: false },
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
    visibility: VISIBILITY.PRIVATE,
    definition: blankDefinition(),
  }
}

// Re-seed whenever the dialog opens, so reopening after a cancel does not
// resurrect the abandoned draft.
watch(
  () => [open.value, props.report?.id],
  () => {
    if (!open.value) return
    form.value = props.report
      ? {
          name: props.report.name ?? '',
          description: props.report.description ?? '',
          visibility: props.report.visibility ?? VISIBILITY.PRIVATE,
          // Deep-copied. Editing the live SyncEngine object in place would
          // mutate what the list is rendering, so a cancelled edit would still
          // show its changes until the next sync.
          //
          // ⚠️ NOT structuredClone, and it was until 2026-08-24. `props.report`
          // is a live SyncEngine row, so `.definition` arrives wrapped in a Vue
          // reactive Proxy — and structuredClone refuses a Proxy outright:
          //   DataCloneError: #<Object> could not be cloned
          // It throws inside a watcher, so nothing caught it and nothing
          // rendered: the Edit button simply did nothing, with the error only in
          // the console. A definition is plain JSON by construction (periodToken
          // + sections of title/metricKeys/breakdown), so the round-trip is
          // total — and it is the clone the form builder already uses.
          definition: JSON.parse(
            JSON.stringify(
              props.report.definition?.sections ? props.report.definition : blankDefinition(),
            ),
          ),
        }
      : blank()
    // A definition can legitimately arrive with zero sections (an older or
    // hand-written row); the editor needs at least one to draw.
    if (!form.value.definition.sections?.length) {
      form.value.definition.sections = [blankSection()]
    }
  },
  { immediate: true },
)

const metricOptions = computed(() =>
  (props.metrics ?? []).map((m) => ({ value: m.metricKey, label: m.name || m.metricKey })),
)

const metricsByKey = computed(() => {
  const out = {}
  for (const m of props.metrics ?? []) out[m.metricKey] = m
  return out
})

/**
 * Dimensions offered for a breakdown.
 *
 * Delegated to `dimensionOptionsFor`, the same function the widget builder
 * uses, rather than mapping `metric.dimensions` by hand here. Two reasons, both
 * learned rather than assumed:
 *
 *  - The rollup stores THREE dimension slots and the refresh slices to three,
 *    so a metric declaring a fourth raises "column dim_4 does not exist" at
 *    render time. The catalog already truncates to the reachable set, and a
 *    hand-rolled mapper is free to stop respecting that.
 *  - Site, department and owner are additionally valid for a breakdown but are
 *    NOT in `metric.dimensions` — `dimensionOptionsFor` appends them for
 *    breakdown-sourced vizzes. A hand-rolled list silently omits them, so a
 *    report could never be broken down by site while a dashboard tile could.
 *
 * BREAKDOWN_VIZ is what the exporter renders a section breakdown as, so asking
 * for that viz's dimension list is asking the question the export will actually
 * ask.
 */
const BREAKDOWN_VIZ = 'table'

function dimensionOptions(metricKey) {
  return dimensionOptionsFor(metricsByKey.value[metricKey] ?? null, BREAKDOWN_VIZ)
}

function addSection() {
  form.value.definition.sections.push(blankSection())
}

function removeSection(index) {
  form.value.definition.sections.splice(index, 1)
  if (!form.value.definition.sections.length) {
    form.value.definition.sections = [blankSection()]
  }
}

function toggleBreakdown(section, on) {
  section.breakdown = on ? { metricKey: null, dimension: null } : null
}

// ── drag reorder ────────────────────────────────────────────────────────────
// Reuses the app's existing sortable wrapper rather than adding a drag library.
//
// The SIMPLER of the two cases the composable's docblock distinguishes: a
// section carries no stored `order` field, so there is nothing to renumber and
// nothing to persist per row. Moving the array element IS the change, and it
// reaches the database with the rest of the draft when the dialog is saved —
// hence no `onEnd`. A drag that the user then cancels out of is correctly
// discarded along with every other edit in the dialog.
//
// `handle` is mandatory here, not stylistic: a section row is mostly text
// inputs, and a whole-row drag would swallow click-to-place-cursor and text
// selection in the title field. It is also what switches on the composable's
// keyboard path (↑/↓/Home/End on the grip).
const sectionsRef = ref(null)

/** What a section is CALLED, for the grip's label and its move announcement. */
function sectionLabel(section, index) {
  return section?.title?.trim() || `Section ${index + 1}`
}

useListReorder(sectionsRef, () => form.value.definition.sections ?? [], {
  handle: '[data-drag-handle]',
  // Named rather than generic: a report can run to many sections, and "Moved to
  // position 3 of 7" leaves a screen-reader user to work out which one moved.
  // `to` is the destination index, so an untitled section is described by where
  // it LANDED — the number the listener is about to see next to it.
  announce: (section, to, total) =>
    `${sectionLabel(section, to)} moved to position ${to + 1} of ${total}.`,
})

const canSave = computed(
  () => !!form.value.name.trim() && definitionHasContent(form.value.definition) && !saving.value,
)

const saveBlockedReason = computed(() => {
  if (!form.value.name.trim()) return 'Give the report a name.'
  if (!definitionHasContent(form.value.definition))
    return 'At least one section needs a metric or a breakdown.'
  return undefined
})

const saveReport = useLiveMutation(async (db, payload) => {
  if (payload.id) {
    const existing = await db.AnalyticsReport.findByPk(payload.id)
    if (!existing) throw new Error('That report no longer exists.')
    Object.assign(existing, payload.attrs)
    await existing.save()
    return existing
  }
  const created = db.AnalyticsReport.create(payload.attrs)
  await created.save()
  return created
})

async function save() {
  if (!canSave.value) return
  saving.value = true
  try {
    const saved = await saveReport({
      id: props.report?.id ?? null,
      attrs: {
        name: form.value.name.trim(),
        // Stored as NULL rather than '', so the list falls back cleanly instead
        // of rendering an empty line where a description would be.
        description: form.value.description.trim() ? form.value.description.trim() : null,
        visibility: form.value.visibility,
        // Normalised at the boundary, not on every keystroke: the exporter reads
        // this jsonb directly and has no tolerance for empty keys or a
        // half-filled breakdown.
        definition: normaliseDefinition(form.value.definition),
      },
    })
    toast.success(props.report ? 'Report updated' : 'Report created')
    emit('saved', saved)
    open.value = false
  } catch (err) {
    // useLiveMutation resolves rather than rejects on some failures, so the
    // catch alone is not a guarantee — surface whatever we do get, and never
    // close the dialog on failure, which would silently discard the draft.
    toast.error(err?.message || 'Could not save the report')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog
    v-model="open"
    :title="report ? 'Edit report' : 'New report'"
    subtitle="Define the sections and metrics. Every figure is resolved for each reader under their own access when the report is opened or exported."
    size="lg"
    persistent
    showClose
  >
    <div class="tw:flex tw:flex-col tw:gap-4">
      <div class="tw:grid tw:gap-3 tw:sm:grid-cols-2">
        <BaseTextInput v-model="form.name" label="Report name" placeholder="e.g. Q3 Quality Review" />
        <BaseSelect
          v-model="form.definition.periodToken"
          label="Period"
          :options="PERIOD_TOKEN_OPTIONS"
        />
      </div>

      <BaseTextarea
        v-model="form.description"
        label="Description"
        :rows="2"
        placeholder="What this report is for, and who reads it."
      />

      <BaseSelect
        v-model="form.visibility"
        label="Visibility"
        :options="[
          { value: 'private', label: 'Private — only you' },
          { value: 'shared', label: 'Shared — anyone who can read reports' },
        ]"
      />

      <div class="tw:border-t tw:border-divider tw:pt-4">
        <div class="tw:mb-2 tw:flex tw:items-center tw:justify-between">
          <BaseText weight="medium">Sections</BaseText>
          <BaseButton size="sm" variant="outline" @click="addSection">
            <IconPlus :size="14" aria-hidden="true" />
            Add section
          </BaseButton>
        </div>

        <!--
          `key` is the section OBJECT, not the loop index, and that is what makes
          reordering correct rather than merely animated. With an index key Vue
          keeps each DOM node where it is and rewrites its contents, so a moved
          section's text input would keep the focus, caret and any uncommitted
          IME state belonging to whichever section previously sat at that
          position. Keying on identity moves the node with its data instead.
          Sections carry no id and `normaliseDefinition` rebuilds a clean object
          per section on save, so the object reference costs nothing stored.
        -->
        <div ref="sectionsRef" class="tw:flex tw:flex-col tw:gap-4">
          <BaseCard
            v-for="(section, i) in form.definition.sections"
            :key="section"
            class="tw:flex tw:flex-col tw:gap-3"
          >
            <div class="tw:flex tw:items-end tw:gap-2">
              <button
                data-drag-handle
                type="button"
                class="tw:mb-2 tw:cursor-grab tw:rounded tw:p-1 tw:text-secondary tw:hover:text-on-main"
                :aria-label="`Reorder ${sectionLabel(section, i)}. Use arrow keys to move it, Home or End to send it to either end.`"
                aria-keyshortcuts="ArrowUp ArrowDown Home End"
              >
                <IconGripVertical :size="16" aria-hidden="true" />
              </button>
              <BaseTextInput
                v-model="section.title"
                label="Section title"
                :placeholder="`Section ${i + 1}`"
                class="tw:flex-1"
              />
              <BaseButton
                size="sm"
                variant="ghost"
                aria-label="Remove section"
                @click="removeSection(i)"
              >
                <IconTrash :size="14" aria-hidden="true" />
              </BaseButton>
            </div>

            <div class="tw:flex tw:flex-col tw:gap-2">
              <BaseSelect
                v-model="section.metricKeys"
                label="Metrics"
                multiple
                :options="metricOptions"
                :loading="metricsLoading"
                placeholder="Choose what this section reports"
              />
              <!--
                The select CHOOSES; this list ORDERS. A `multiple` BaseSelect is
                a set control — it has no notion of position and renders its
                selection as the summary "3 selected" — yet `metricKeys` order
                is what the exporter prints. See the component for the full
                reasoning, including why the two are not fused into one control.
              -->
              <ReportSectionMetricList
                :metricKeys="section.metricKeys"
                :metricsByKey="metricsByKey"
              />
            </div>

            <BaseCheckbox
              :modelValue="!!section.breakdown"
              label="Add a breakdown table"
              @update:modelValue="(v) => toggleBreakdown(section, v)"
            />

            <div v-if="section.breakdown" class="tw:grid tw:gap-3 tw:sm:grid-cols-2">
              <BaseSelect
                v-model="section.breakdown.metricKey"
                label="Break down which metric"
                :options="metricOptions"
                :loading="metricsLoading"
              />
              <BaseSelect
                v-model="section.breakdown.dimension"
                label="By"
                :options="dimensionOptions(section.breakdown.metricKey)"
                :disabled="!section.breakdown.metricKey"
                placeholder="Choose a dimension"
              />
            </div>
          </BaseCard>
        </div>

        <BaseText variant="caption" color="secondary" class="tw:mt-2">
          A section needs at least one metric or a breakdown. Empty ones are dropped on save.
        </BaseText>
      </div>
    </div>

    <template #footer="{ close }">
      <BaseDialogFooter
        :loading="saving"
        :disabled="!canSave"
        :submitLabel="report ? 'Save changes' : 'Create report'"
        :submitTitle="saveBlockedReason"
        @cancel="close"
        @submit="save"
      />
    </template>
  </BaseDialog>
</template>
