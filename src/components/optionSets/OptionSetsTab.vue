<script setup>
/**
 * Slim Option Sets surface for embedding inside another page (today:
 * Form Templates → Option Sets tab). Omits the SafeTeleport blocks
 * that OptionSetsHome uses to claim the main header — the host page
 * owns those.
 *
 * The standalone `/option-sets` route still mounts OptionSetsHome
 * for back-compat. New navigation routes through the Form Templates
 * tab.
 */
import { IconChecklist, IconPlus } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const showCreateDialog = ref(false)
const selectedOptionSetId = ref(null)

const canCreateOptionSet = computed(() => isAllowed(['option_sets:create']))
const canDeleteOptionSet = computed(() => isAllowed(['option_sets:delete']))

const filters = ref({ search: '' })

const optionSets = useLiveQueryWithDeps(
  [() => filters.value.search],
  async (db, [search]) => {
    let results = await db.OptionSet.where().exec()
    if (search) {
      const q = search.toLowerCase()
      results = results.filter(
        (os) =>
          os.name.toLowerCase().includes(q) || (os.description || '').toLowerCase().includes(q),
      )
    }
    return results.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },

  { models: ['OptionSet'], initial: [] },
)

function openDialog(id = null) {
  selectedOptionSetId.value = id
  showCreateDialog.value = true
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <!-- Embedded header bar — softer than the full-page hero in
         OptionSetsHome since the host page already shows the H1. -->
    <div class="tw:flex tw:items-center tw:justify-between">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
        <IconChecklist :size="20" class="tw:text-primary" />
        <span class="tw:text-base tw:font-bold">Option Sets</span>
        <span class="tw:text-xs tw:text-secondary tw:font-normal tw:ml-1">
          Reusable option lists for dropdowns / radios / checklists across form fields.
        </span>
      </div>
      <BaseButton v-if="canCreateOptionSet" variant="primary" size="sm" @click="openDialog()">
        <template #icon><IconPlus :size="16" /></template>
        Create Option Set
      </BaseButton>
    </div>

    <OptionSetsFilterToolbar v-model:filters="filters" />

    <OptionSetsTable :rows="optionSets" :canDelete="canDeleteOptionSet" />

    <OptionSetCreateDialog
      v-if="showCreateDialog"
      :id="selectedOptionSetId"
      v-model="showCreateDialog"
    />
  </div>
</template>
