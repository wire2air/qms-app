<script setup>
/**
 * Test Library admin — the per-tenant master list of inspection tests, each with
 * a default severity (CRITICAL/MAJOR/MINOR), type, method and limits. Picking one
 * in the spec builder pre-fills a characteristic. Synced model (DefectCatalog) —
 * list live, edits via the dialog.
 */
import { IconPlus, IconPencil, IconTrash } from '@tabler/icons-vue'

defineProps({ canManage: { type: Boolean, default: false } })
const toast = useToast()

const showDialog = ref(false)
const editDefect = ref(null)

const SEVERITY_ORDER = { CRITICAL: 0, MAJOR: 1, MINOR: 2 }
const defects = useLiveQuery(
  async (db) => {
    const rows = await db.DefectCatalog.where().exec()
    return rows.sort(
      (a, b) =>
        (SEVERITY_ORDER[a.defaultSeverity] ?? 9) - (SEVERITY_ORDER[b.defaultSeverity] ?? 9) ||
        (a.name || '').localeCompare(b.name || ''),
    )
  },
  { initial: [] },
)

function openCreate() {
  editDefect.value = null
  showDialog.value = true
}
function openEdit(d) {
  editDefect.value = d
  showDialog.value = true
}
async function removeDefect(d) {
  if (!window.confirm(`Delete test "${d.name}"? Specs already built keep their copy.`)) return
  try {
    await d.delete()
    toast.success('Test deleted')
  } catch (err) {
    toast.error(err?.message || 'Failed to delete test')
  }
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4">
    <div class="tw:flex tw:items-center tw:justify-between">
      <p class="tw:text-sm tw:text-secondary">
        Reusable inspection tests with a default severity class. Pick one when building a
        specification to pre-fill the test (type, severity, method, limits — all overridable).
      </p>
      <BaseButton v-if="canManage" variant="primary" size="sm" @click="openCreate">
        <template #icon><IconPlus :size="16" /></template>
        Add test
      </BaseButton>
    </div>

    <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
      <table class="tw:w-full tw:text-sm">
        <thead class="tw:bg-main-hover tw:text-secondary tw:text-xs tw:uppercase">
          <tr>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Test</th>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Code</th>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Type</th>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Severity</th>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Status</th>
            <th class="tw:px-4 tw:py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in defects" :key="d.id" class="tw:border-t tw:border-divider">
            <td class="tw:px-4 tw:py-2.5">
              <div class="tw:font-medium tw:text-on-main">{{ d.name }}</div>
              <div v-if="d.description" class="tw:text-xs tw:text-secondary tw:line-clamp-1">{{ d.description }}</div>
            </td>
            <td class="tw:px-4 tw:py-2.5 tw:font-mono tw:text-xs tw:text-secondary">{{ d.code }}</td>
            <td class="tw:px-4 tw:py-2.5 tw:text-xs tw:text-secondary">{{ d.testType }}</td>
            <td class="tw:px-4 tw:py-2.5"><DefectSeverityBadgeById :severityId="d.defaultSeverity" /></td>
            <td class="tw:px-4 tw:py-2.5">
              <span
                class="tw:text-micro tw:font-semibold tw:px-2 tw:py-0.5 tw:rounded-full"
                :class="d.active ? 'tw:bg-green-100 tw:text-green-700' : 'tw:bg-gray-100 tw:text-gray-500'"
              >
                {{ d.active ? 'Active' : 'Inactive' }}
              </span>
            </td>
            <td class="tw:px-4 tw:py-2.5">
              <div v-if="canManage" class="tw:flex tw:items-center tw:justify-end tw:gap-3">
                <button
                  type="button"
                  class="tw:text-secondary tw:hover:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer"
                  title="Edit"
                  @click="openEdit(d)"
                >
                  <IconPencil :size="16" />
                </button>
                <button
                  type="button"
                  class="tw:text-secondary tw:hover:text-bad tw:bg-transparent tw:border-0 tw:cursor-pointer"
                  title="Delete"
                  @click="removeDefect(d)"
                >
                  <IconTrash :size="16" />
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="!defects.length">
            <td colspan="6" class="tw:px-4 tw:py-8 tw:text-center tw:text-secondary tw:italic">
              No tests defined yet.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <DefectCatalogCreateDialog v-model="showDialog" :editDefect="editDefect" />
  </div>
</template>
