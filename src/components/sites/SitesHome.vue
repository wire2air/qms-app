<script setup>
import { IconMapPin } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const showDialog = ref(false)
const selectedSiteId = ref(null)

const confirmDelete = ref({ open: false, site: null })

const canCreateSite = computed(() => isAllowed(['sites:create']))
const canUpdateSite = computed(() => isAllowed(['sites:update']))
const canDeleteSite = computed(() => isAllowed(['sites:delete']))

// Filters
const filters = ref({ search: '' })

// Live query for sites
const sites = useLiveQueryWithDeps(
  [() => filters.value.search],
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

function onDeleteSite(row) {
  confirmDelete.value = { open: true, site: row }
}

async function confirmDeleteSite() {
  await confirmDelete.value.site.delete()
  confirmDelete.value = { open: false, site: null }
}
</script>

<template>
  <BasePage width="standard" density="compact">
    <PageHeader :icon="IconMapPin" title="Sites" />

    <SafeTeleport to="#main-header-actions">
      <BaseButton v-if="canCreateSite" @click="openDialog()">
        <span>Create New Site</span>
      </BaseButton>
    </SafeTeleport>

    <!-- Page Header -->
    <div class="tw:flex tw:items-center tw:justify-between">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Sites</div>
        <div class="tw:text-sm tw:text-secondary">
          Manage your organization's physical locations and sites.
        </div>
      </div>
    </div>

    <SitesFilterToolbar v-model:filters="filters" />

    <SitesTable
      :rows="sites"
      :canUpdate="canUpdateSite"
      :canDelete="canDeleteSite"
      @delete="onDeleteSite"
      @edit="onEditSite"
    />
  </BasePage>

  <!-- Create/Edit Site Dialog -->
  <SitesCreateUpdateDialog v-if="showDialog" :id="selectedSiteId" v-model="showDialog" />

  <!-- Delete Confirm Dialog -->
  <ConfirmDialog
    v-model="confirmDelete.open"
    title="Delete Site"
    :message="`Are you sure you want to delete '${confirmDelete.site?.name}' (${confirmDelete.site?.code})? This cannot be undone.`"
    okLabel="Delete"
    @ok="confirmDeleteSite"
  />
</template>
