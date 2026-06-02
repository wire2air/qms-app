<script setup>
import { IconSitemap } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const showCreateDialog = ref(false)
const editTemplate = ref(null)
const confirmDelete = ref({ open: false, template: null })

const canCreate = computed(() => isAllowed(['rcaTemplates:create']))
const canUpdate = computed(() => isAllowed(['rcaTemplates:update']))
const canDelete = computed(() => isAllowed(['rcaTemplates:delete']))

const search = ref('')

const templates = useLiveQueryWithDeps(
  [() => search.value],
  async (db, [q]) => {
    const results = await db.RcaTemplate.where().exec()
    if (!q)
      return results.sort(
        (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
      )
    const lower = q.toLowerCase()
    return results
      .filter((t) => t.name.toLowerCase().includes(lower))
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
  },
  { initial: [] },
)

function onEdit(template) {
  editTemplate.value = template
  showCreateDialog.value = true
}

function onDelete(template) {
  confirmDelete.value = { open: true, template }
}

async function confirmDeleteTemplate() {
  await confirmDelete.value.template.delete()
  confirmDelete.value = { open: false, template: null }
}

function onDialogClose() {
  showCreateDialog.value = false
  editTemplate.value = null
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3 tw:h-full tw:p-5">
    <SafeTeleport to="#main-header-title">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
        <IconSitemap class="tw:text-primary" :size="24" />
        <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-nowrap">RCA Templates</h2>
      </div>
    </SafeTeleport>

    <SafeTeleport to="#main-header-actions">
      <BaseButton v-if="canCreate" @click="showCreateDialog = true"> New Template </BaseButton>
    </SafeTeleport>

    <div class="tw:flex tw:items-center tw:justify-between">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">RCA Templates</div>
        <div class="tw:text-sm tw:text-secondary">
          Pre-configure Root Cause Analysis frameworks for use in NC workflow steps.
        </div>
      </div>
    </div>

    <div class="tw:flex tw:items-center tw:gap-3">
      <BaseTextInput v-model="search" placeholder="Search templates..." class="tw:w-72" />
    </div>

    <RcaTemplatesTable
      :rows="templates"
      :canUpdate="canUpdate"
      :canDelete="canDelete"
      @edit="onEdit"
      @delete="onDelete"
    />
  </div>

  <RcaTemplateDialog v-model="showCreateDialog" :template="editTemplate" @close="onDialogClose" />

  <ConfirmDialog
    v-model="confirmDelete.open"
    title="Delete RCA Template"
    :message="`Are you sure you want to delete '${confirmDelete.template?.name}'? This cannot be undone.`"
    okLabel="Delete"
    @ok="confirmDeleteTemplate"
  />
</template>
