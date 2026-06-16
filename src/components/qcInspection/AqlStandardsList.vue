<script setup>
/**
 * AQL Standards — global (canonical ANSI/ISO, read-only) + tenant custom clones.
 * Clone a global into an editable copy; edit a custom standard's plan cells
 * (sample size / accept / reject) inline (saved live via the SyncEngine; RLS
 * allows writes only on the tenant's own clone rows).
 */
import { IconCopy } from '@tabler/icons-vue'

defineProps({ canManage: { type: Boolean, default: false } })
const toast = useToast()

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
  } catch (err) {
    toast.error(err?.message || 'Could not save cell (custom standards only)')
  }
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4">
    <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
      <table class="tw:w-full tw:text-sm">
        <thead class="tw:bg-main-hover tw:text-secondary tw:text-xs tw:uppercase">
          <tr>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Standard</th>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Type</th>
            <th class="tw:text-right tw:px-4 tw:py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in standards" :key="s.id" class="tw:border-t tw:border-divider">
            <td class="tw:px-4 tw:py-2.5 tw:font-medium tw:text-on-main">{{ s.name }}</td>
            <td class="tw:px-4 tw:py-2.5">
              <span
                class="tw:text-[10px] tw:font-semibold tw:px-2 tw:py-0.5 tw:rounded-full"
                :class="
                  s.companyId
                    ? 'tw:bg-blue-100 tw:text-blue-700'
                    : 'tw:bg-gray-100 tw:text-gray-600'
                "
              >
                {{ s.companyId ? 'Custom' : 'Global' }}
              </span>
            </td>
            <td class="tw:px-4 tw:py-2.5">
              <div class="tw:flex tw:items-center tw:justify-end tw:gap-4">
                <BaseButton variant="text-link" size="sm" @click="select(s)">
                  {{ s.companyId ? 'Edit cells' : 'View' }}
                </BaseButton>
                <BaseButton
                  v-if="canManage && !s.companyId"
                  variant="text-link"
                  size="sm"
                  @click="openClone(s)"
                >
                  <IconCopy :size="14" /> Clone
                </BaseButton>
              </div>
            </td>
          </tr>
          <tr v-if="!standards.length">
            <td colspan="3" class="tw:px-4 tw:py-8 tw:text-center tw:text-secondary tw:italic">
              No standards.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Cell editor for the selected custom standard -->
    <div
      v-if="selected"
      class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden"
    >
      <div
        class="tw:px-5 tw:py-3 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:gap-3"
      >
        <h3 class="tw:font-bold tw:text-on-main">
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
      <div class="tw:max-h-[28rem] tw:overflow-y-auto">
        <table class="tw:w-full tw:text-sm">
          <thead class="tw:text-secondary tw:text-xs tw:uppercase tw:sticky tw:top-0 tw:bg-sidebar">
            <tr>
              <th class="tw:text-left tw:px-5 tw:py-2">Letter</th>
              <th class="tw:text-left tw:px-5 tw:py-2">AQL</th>
              <th class="tw:text-left tw:px-5 tw:py-2">State</th>
              <th class="tw:text-left tw:px-5 tw:py-2">Sample</th>
              <th class="tw:text-left tw:px-5 tw:py-2">Ac</th>
              <th class="tw:text-left tw:px-5 tw:py-2">Re</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in visibleCells" :key="c.id" class="tw:border-t tw:border-divider">
              <td class="tw:px-5 tw:py-1.5 tw:font-mono">{{ c.codeLetter }}</td>
              <td class="tw:px-5 tw:py-1.5">{{ c.aql }}</td>
              <td class="tw:px-5 tw:py-1.5 tw:text-secondary tw:text-xs">{{ c.severity }}</td>
              <td class="tw:px-5 tw:py-1.5">
                <BaseTextInput
                  v-model.number="c.sampleSize"
                  type="number"
                  size="sm"
                  class="tw:w-20"
                  :disabled="!selectedEditable"
                  @blur="saveCell(c)"
                />
              </td>
              <td class="tw:px-5 tw:py-1.5">
                <BaseTextInput
                  v-model.number="c.accept"
                  type="number"
                  size="sm"
                  class="tw:w-16"
                  :disabled="!selectedEditable"
                  @blur="saveCell(c)"
                />
              </td>
              <td class="tw:px-5 tw:py-1.5">
                <BaseTextInput
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
      <p class="tw:text-[11px] tw:text-secondary tw:px-5 tw:py-2">
        <template v-if="selectedEditable">Edits save automatically. </template>
        Empty Sample/Ac/Re with an arrow cell means "use the arrowed code letter".
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
