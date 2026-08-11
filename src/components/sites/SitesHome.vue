<script setup>
import { IconMapPin } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { buildDeleteSiteMessage, countSiteDependencies } from '@/utils/siteDependencies.js'

const showDialog = ref(false)
const selectedSiteId = ref(null)

const { confirm } = useConfirm()

const canCreateSite = computed(() => isAllowed(['sites:create']))
const canUpdateSite = computed(() => isAllowed(['sites:update']))
const canDeleteSite = computed(() => isAllowed(['sites:delete']))

// Filter state + URL sync + resolved content state (Enterprise Page Framework list template).
const list = useListLayout({
  filters: {},
  total: () => sites.value.length,
  empty: () => sites.value.length === 0,
  syncUrl: true,
})

// Live query for sites
const sites = useLiveQuery(
  async (db) => {
    const results = await db.Site.where().exec()
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

// The delete confirm used to claim "This cannot be undone" about a SOFT delete
// and query nothing first, so a site backing hundreds of records went on one
// click — and every one of those records then rendered a blank site field.
// Count the dependants and say what actually happens.
//
// useLiveMutation for a READ on purpose: this is an imperative one-shot at
// click time, not a live query, and it is the composable that hands a component
// `db` outside a live query — with the added benefit that a catastrophic
// failure surfaces as a toast rather than a silent undefined.
const countDependencies = useLiveMutation((db, siteId) => countSiteDependencies(db, siteId))

const isDeleting = ref(false)

async function onDeleteSite(row) {
  if (isDeleting.value) return
  isDeleting.value = true
  try {
    // A failed count must not block the delete — buildDeleteSiteMessage says
    // "we could not check" instead of asserting the site is unused.
    const dependencies = (await countDependencies(row.id)) ?? {
      items: [],
      total: 0,
      failed: ['*'],
    }

    const ok = await confirm({
      title: 'Delete Site',
      message: buildDeleteSiteMessage(row, dependencies),
      okLabel: 'Delete',
      danger: true,
    })
    if (ok) await row.delete()
  } finally {
    isDeleting.value = false
  }
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

    <SitesTable
      :rows="sites"
      :canUpdate="canUpdateSite"
      :canDelete="canDeleteSite"
      @delete="onDeleteSite"
      @edit="onEditSite"
    />
  </BaseListLayout>

  <!-- Create/Edit Site Dialog — outside BaseListLayout so it stays mounted in
       the empty state (else you can't create the first site). -->
  <SitesCreateUpdateDialog v-if="showDialog" :id="selectedSiteId" v-model="showDialog" />
</template>
