<script setup>
/**
 * AQL Standards — global (canonical ANSI/ISO, read-only) + tenant custom clones.
 * Clone a global into an editable copy; edit a custom standard's plan cells
 * (sample size / accept / reject) inline (saved live via the SyncEngine; RLS
 * allows writes only on the tenant's own clone rows).
 */
import { IconCopy, IconArrowDown, IconArrowUp } from '@tabler/icons-vue'
import { aqlSeverityHint, AQL_PAIRING_SUMMARY } from '@/utils/aqlGuidance.js'

defineProps({ canManage: { type: Boolean, default: false } })
const toast = useToast()

// Registry-authored help copy (resource/js/shared/data/tooltips.js).
const acReHelp = useTooltipData().getFromTooltipData('qc.acceptReject', 'tooltip')
const switchingHelp = useTooltipData().getFromTooltipData('qc.switchingState', 'tooltip')
const arrowHelp = useTooltipData().getFromTooltipData('qc.planArrowCell', 'tooltip')

const cloneSource = ref(null) // { id, name }
const showClone = ref(false)
const selectedId = ref(null)
const letterFilter = ref(null)

const standards = useLiveQuery(
  async (db) => {
    const rows = await db.SamplingStandard.where().exec()
    return rows.sort(
      (a, b) => Number(!!a.companyId) - Number(!!b.companyId) || a.name.localeCompare(b.name),
    )
  },

  { models: ['SamplingStandard'], initial: [] },
)

const TYPE_OPTIONS = [
  { value: true, label: 'Custom' },
  { value: false, label: 'Global' },
]
const columns = [
  { name: 'name', label: 'Standard', field: 'name', align: 'left', sortable: true },
  {
    name: 'type',
    label: 'Type',
    field: (s) => !!s.companyId,
    align: 'left',
    filterType: 'select',
    filterOptions: TYPE_OPTIONS,
  },
  { name: 'actions', label: '', field: 'actions', align: 'right' },
]

const selected = computed(() => standards.value.find((s) => s.id === selectedId.value) || null)
// Global standards are view-only; only tenant custom clones are editable.
const selectedEditable = computed(() => !!selected.value?.companyId)

const cells = useLiveQueryWithDeps(
  [() => selectedId.value],
  async (db, [id]) => {
    if (!id) return []
    const rows = await db.SamplingPlanTable.where('standardId', id).exec()
    return rows.sort(
      (a, b) =>
        a.codeLetter.localeCompare(b.codeLetter) ||
        a.aql - b.aql ||
        a.severity.localeCompare(b.severity),
    )
  },

  { models: ['SamplingPlanTable'], initial: [] },
)
const codeLetters = computed(() => [...new Set(cells.value.map((c) => c.codeLetter))].sort())
const visibleCells = computed(() =>
  letterFilter.value ? cells.value.filter((c) => c.codeLetter === letterFilter.value) : cells.value,
)

function openClone(s) {
  cloneSource.value = { id: s.id, name: s.name }
  showClone.value = true
}
function select(s) {
  selectedId.value = s.id
  letterFilter.value = null
}
async function saveCell(cell) {
  if (!selectedEditable.value) return // globals are read-only
  try {
    await cell.save()
    // An arrow cell only becomes an explicit plan when ALL THREE values are
    // set — the resolver ignores a partial fill and keeps following the arrow.
    if (cell.arrowDirection) {
      const filled = [cell.sampleSize, cell.accept, cell.reject].filter((v) => v != null)
      if (filled.length > 0 && filled.length < 3) {
        toast.warning(
          'Partial values on an arrow cell are ignored — fill Sample, Ac AND Re to override the arrow.',
        )
      }
    }
  } catch (err) {
    toast.error(err?.message || 'Could not save cell (custom standards only)')
  }
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4">
    <DataTable
      :rows="standards"
      :columns="columns"
      rowKey="id"
      :mobileCards="false"
      searchable
      filterable
      exportManager
      exportFilename="aql-standards.csv"
      persistKey="qcInspection:aqlStandards"
      noDataLabel="No standards."
    >
      <template #body-cell-name="{ row }">
        <span class="tw:font-medium tw:text-on-main">{{ row.name }}</span>
      </template>

      <template #body-cell-type="{ row }">
        <span
          class="tw:text-micro tw:font-semibold tw:px-2 tw:py-0.5 tw:rounded-full"
          :class="
            row.companyId ? 'tw:bg-blue-100 tw:text-blue-700' : 'tw:bg-gray-100 tw:text-gray-600'
          "
        >
          {{ row.companyId ? 'Custom' : 'Global' }}
        </span>
      </template>

      <template #body-cell-actions="{ row }">
        <div class="tw:flex tw:items-center tw:justify-end tw:gap-4">
          <BaseButton variant="text-link" size="sm" @click="select(row)">
            {{ row.companyId ? 'Edit cells' : 'View' }}
          </BaseButton>
          <BaseButton
            v-if="canManage && !row.companyId"
            variant="text-link"
            size="sm"
            @click="openClone(row)"
          >
            <IconCopy :size="14" /> Clone
          </BaseButton>
        </div>
      </template>
    </DataTable>

    <!-- Cell editor for the selected custom standard -->
    <div
      v-if="selected"
      class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden"
    >
      <div
        class="tw:px-5 tw:py-3 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:gap-3"
      >
        <h3 class="tw:text-sm tw:font-semibold tw:text-on-main">
          {{ selected.name }} — plan cells
          <span v-if="!selectedEditable" class="tw:text-xs tw:font-normal tw:text-secondary"
            >(read-only — clone to edit)</span
          >
        </h3>
        <BaseInlineSelect
          v-model="letterFilter"
          :items="codeLetters.map((l) => ({ id: l, name: `Letter ${l}` }))"
          nullLabel="— All code letters —"
          class="tw:w-44 tw:ml-auto"
        />
      </div>

      <!-- How to read this table — AQL/severity pairing + Ac/Re + arrows. -->
      <div
        class="tw:px-5 tw:py-2.5 tw:border-b tw:border-divider tw:text-xs tw:text-secondary tw:flex tw:flex-col tw:gap-1"
      >
        <p>
          <strong class="tw:text-on-main">AQL %</strong> = worst tolerable percent defective for a
          defect class. {{ AQL_PAIRING_SUMMARY }} <strong class="tw:text-on-main">Ac</strong> =
          accept the lot at ≤ this many defects; <strong class="tw:text-on-main">Re</strong> =
          reject at ≥ this many.
        </p>
        <p class="tw:flex tw:items-center tw:gap-1 tw:flex-wrap">
          Cells showing
          <span class="tw:inline-flex tw:items-center tw:gap-0.5 tw:text-secondary"
            ><IconArrowDown :size="12" /> larger sample</span
          >
          /
          <span class="tw:inline-flex tw:items-center tw:gap-0.5 tw:text-secondary"
            ><IconArrowUp :size="12" /> smaller sample</span
          >
          have no plan of their own — use the first plan in that direction (its sample size AND
          Ac/Re), exactly as the printed Z1.4 arrows. The system follows them automatically.
        </p>
      </div>
      <div class="tw:max-h-[28rem] tw:overflow-y-auto">
        <table class="tw:w-full tw:text-sm">
          <thead class="tw:text-secondary tw:text-xs tw:uppercase tw:sticky tw:top-0 tw:bg-sidebar">
            <tr>
              <th class="tw:text-left tw:px-5 tw:py-2">Letter</th>
              <th class="tw:text-left tw:px-5 tw:py-2">AQL</th>
              <th class="tw:text-left tw:px-5 tw:py-2" :title="switchingHelp">State</th>
              <th class="tw:text-left tw:px-5 tw:py-2">Sample</th>
              <th class="tw:text-left tw:px-5 tw:py-2" :title="acReHelp">Ac</th>
              <th class="tw:text-left tw:px-5 tw:py-2" :title="acReHelp">Re</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in visibleCells" :key="c.id" class="tw:border-t tw:border-divider">
              <td class="tw:px-5 tw:py-1.5">{{ c.codeLetter }}</td>
              <td class="tw:px-5 tw:py-1.5">
                <span class="tw:inline-flex tw:items-center tw:gap-1.5">
                  {{ c.aql }}
                  <span
                    v-if="aqlSeverityHint(c.aql)"
                    class="tw:text-micro tw:font-medium tw:px-1.5 tw:py-0.5 tw:rounded-full"
                    :class="aqlSeverityHint(c.aql).class"
                    >{{ aqlSeverityHint(c.aql).label }}</span
                  >
                </span>
              </td>
              <td class="tw:px-5 tw:py-1.5 tw:text-secondary tw:text-xs">{{ c.severity }}</td>
              <td class="tw:px-5 tw:py-1.5">
                <!-- Arrow cell: no plan of its own — points at the neighbouring
                     letter's plan (Z1.4 arrow). DB 'UP' = next larger sample.
                     The chip stays visible on editable clones so the editor can
                     tell arrow cells from blanked-out ones; filling all three
                     values overrides the arrow with an explicit plan. -->
                <span class="tw:inline-flex tw:items-center tw:gap-2">
                  <span
                    v-if="c.arrowDirection && c.sampleSize == null"
                    class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:text-secondary tw:shrink-0"
                    :title="
                      (c.arrowDirection === 'UP'
                        ? 'Use the first plan at a larger code letter (bigger sample). '
                        : 'Use the first plan at a smaller code letter (smaller sample). ') +
                      arrowHelp
                    "
                  >
                    <IconArrowDown v-if="c.arrowDirection === 'UP'" :size="14" />
                    <IconArrowUp v-else :size="14" />
                    {{ c.arrowDirection === 'UP' ? 'larger sample' : 'smaller sample' }}
                  </span>
                  <BaseTextInput
                    v-if="selectedEditable || !c.arrowDirection || c.sampleSize != null"
                    v-model.number="c.sampleSize"
                    type="number"
                    size="sm"
                    class="tw:w-20"
                    :disabled="!selectedEditable"
                    @blur="saveCell(c)"
                  />
                </span>
              </td>
              <td class="tw:px-5 tw:py-1.5">
                <span
                  v-if="c.arrowDirection && c.accept == null && !selectedEditable"
                  class="tw:text-secondary"
                  >—</span
                >
                <BaseTextInput
                  v-else
                  v-model.number="c.accept"
                  type="number"
                  size="sm"
                  class="tw:w-16"
                  :disabled="!selectedEditable"
                  @blur="saveCell(c)"
                />
              </td>
              <td class="tw:px-5 tw:py-1.5">
                <span
                  v-if="c.arrowDirection && c.reject == null && !selectedEditable"
                  class="tw:text-secondary"
                  >—</span
                >
                <BaseTextInput
                  v-else
                  v-model.number="c.reject"
                  type="number"
                  size="sm"
                  class="tw:w-16"
                  :disabled="!selectedEditable"
                  @blur="saveCell(c)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="tw:text-caption tw:text-secondary tw:px-5 tw:py-2">
        <template v-if="selectedEditable">
          Edits save automatically. Arrow cells have empty Sample/Ac/Re — fill in all three to
          replace the arrow with an explicit plan for this custom standard.
        </template>
        <template v-else>Clone this standard to customise plan cells for your company.</template>
      </p>
    </div>

    <CloneStandardDialog
      v-model="showClone"
      :sourceStandardId="cloneSource?.id"
      :sourceName="cloneSource?.name"
      @cloned="(id) => (selectedId = id)"
    />
  </div>
</template>
