<script setup>
import { IconMapPin } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const showDialog = ref(false)
const selectedSiteId = ref(null)

const { confirm } = useConfirm()

const canCreateSite = computed(() => isAllowed(['sites:create']))
const canUpdateSite = computed(() => isAllowed(['sites:update']))
const canDeleteSite = computed(() => isAllowed(['sites:delete']))

// Filter state + URL sync + resolved content state (Enterprise Page Framework list template).
const list = useListLayout({
  filters: { search: '' },
  total: () => sites.value.length,
  empty: () => sites.value.length === 0,
  syncUrl: true,
})

// Live query for sites
const sites = useLiveQueryWithDeps(
  [() => list.filters.value.search],
  async (db, [search]) => {
    let results = await db.Site.where().exec()
    if (search) {
      const q = search.toLowerCase()
      results = results.filter((s) => s.name.toLowerCase().includes(q))
    }
    return results.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },

  { models: ['Site'], initial: [] },
)

function openDialog(id = null) {
  selectedSiteId.value = id
  showDialog.value = true
}

function onEditSite(row) {
  openDialog(row.id)
}

async function onDeleteSite(row) {
  const ok = await confirm({
    title: 'Delete Site',
    message: `Are you sure you want to delete '${row.name}' (${row.code})? This cannot be undone.`,
    okLabel: 'Delete',
    danger: true,
  })
  if (ok) await row.delete()
}
</script>

<template>
  <BaseListLayout
    title="Sites"
    :icon="IconMapPin"
    subtitle="Manage your organization's physical locations and sites."
    :state="list.state.value"
    :emptyIcon="IconMapPin"
    :emptyTitle="list.hasActiveFilters.value ? 'No sites match your filters' : 'No sites yet'"
  >
    <template #actions>
      <BaseButton v-if="canCreateSite" @click="openDialog()">
        <span>Create New Site</span>
      </BaseButton>
    </template>

    <template #filters>
      <SitesFilterToolbar v-model:filters="list.filters.value" />
    </template>

    <SitesTable
      :rows="sites"
      :canUpdate="canUpdateSite"
      :canDelete="canDeleteSite"
      @delete="onDeleteSite"
      @edit="onEditSite"
    />

    <!-- Create/Edit Site Dialog -->
    <SitesCreateUpdateDialog v-if="showDialog" :id="selectedSiteId" v-model="showDialog" />
  </BaseListLayout>
</template>
