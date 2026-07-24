<script setup>
/**
 * Form Blocks — slim tab surface on the Form Templates page (pattern:
 * OptionSetsTab). Blocks are reusable form fragments (kind = 'BLOCK') embedded
 * inside hosts — workflow step task forms, CAPA/CR child-step forms, QC
 * checklists. They have no records, numbering, versioning, or module machinery
 * of their own, so there is no detail page: Design opens the form builder
 * dialog directly.
 */
import { IconLayoutGrid, IconPlus, IconPencil, IconArchive } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import WorkflowStepFormBuilderPanel from '@/components/workflow/WorkflowStepFormBuilderPanel.vue'

const props = defineProps({
  // true when hosted by the standalone /form-blocks page — PageHeader owns the
  // title there, so the embedded mini-title is hidden (description + actions stay).
  standalone: { type: Boolean, default: false },
})

const toast = useToast()

// Form Blocks has its own authz module; create needs read too (the create
// mutation reads the new row back through the SELECT policy).
const canCreate = computed(() => isAllowed(['form_blocks:create', 'form_blocks:read']))
const canUpdate = computed(() => isAllowed(['form_blocks:update']))

const search = ref('')

const blocks = useLiveQueryWithDeps(
  [() => search.value],
  async (db, [q]) => {
    let rows = (await db.FormTemplate.where().exec()).filter((t) => t.kind === 'BLOCK')
    if (q) {
      const needle = q.toLowerCase()
      rows = rows.filter((t) => t.title?.toLowerCase().includes(needle))
    }
    return rows.sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0))
  },

  { models: ['FormTemplate'], initial: [] },
)

// ── Create ───────────────────────────────────────────────────────────────────
const showCreateDialog = ref(false)
const newTitle = ref('')
const creating = ref(false)

// Blocks never show their code, but form_templates.code is NOT NULL + unique
// per company — derive a hidden, collision-safe one from the title.
function blockCode(title) {
  const slug = title
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `BLK-${slug || 'BLOCK'}-${rand}`
}

const createBlock = useLiveMutation(async (db, title) => {
  const block = db.FormTemplate.create({
    title,
    code: blockCode(title),
    schema: [],
    // Explicit null — the model's '' default would be serialized into the
    // CREATE mutation and violate the document_types FK.
    documentTypeId: null,
    statusId: 'ACTIVE', // blocks skip the DRAFT ceremony — they hold no records
    kind: 'BLOCK',
    config: {},
  })
  await block.save()
  return block
})

async function handleCreate() {
  if (creating.value || !newTitle.value.trim()) return
  creating.value = true
  try {
    const block = await createBlock(newTitle.value.trim())
    showCreateDialog.value = false
    newTitle.value = ''
    openDesign(block)
  } catch (e) {
    toast.error(e?.message || 'Failed to create block')
  } finally {
    creating.value = false
  }
}

// ── Design (form builder dialog — no detail page for blocks) ─────────────────
const builderOpen = ref(false)
const designBlock = ref(null)

function openDesign(block) {
  designBlock.value = block
  builderOpen.value = true
}

async function handleSchemaSave(schema) {
  if (!designBlock.value) return
  designBlock.value.schema = schema
  await designBlock.value.save()
}

// ── Rename ──────────────────────────────────────────────────────────────────
const showRenameDialog = ref(false)
const renameBlock = ref(null)
const renameTitle = ref('')

function openRename(block) {
  renameBlock.value = block
  renameTitle.value = block.title
  showRenameDialog.value = true
}

async function handleRename() {
  if (!renameBlock.value || !renameTitle.value.trim()) return
  renameBlock.value.title = renameTitle.value.trim()
  await renameBlock.value.save()
  showRenameDialog.value = false
}

// ── Table ────────────────────────────────────────────────────────────────────
const columns = [
  { name: 'title', label: 'BLOCK', field: 'title', align: 'left', sortable: true },
  { name: 'fields', label: 'FIELDS', field: 'fields', align: 'center', sortable: false },
  { name: 'statusId', label: 'STATUS', field: 'statusId', align: 'left', sortable: true },
  { name: 'updatedAt', label: 'UPDATED', field: 'updatedAt', align: 'left', sortable: true },
  { name: 'actions', label: '', field: 'actions', align: 'right' },
]
const pagination = ref({ page: 1, pageSize: 50 })
const sort = ref([{ id: 'updatedAt', desc: true }])

// System blocks are LIVE-referenced by feature code — QC Line Clearance is
// found by internalName in the inspection flow; the Task/Action block seeds
// CAPA/CR child-step forms by code. They can be edited, never deleted.
function isSystemBlock(row) {
  return !!row.internalName || row.code === 'TASK'
}

function rowMenuItems(row) {
  const items = []
  if (canUpdate.value) {
    items.push(
      { name: 'Design', icon: IconPencil, click: () => openDesign(row) },
      { name: 'Rename', icon: IconPencil, click: () => openRename(row) },
      {
        // Blocks are never deleted — ARCHIVED is the lifecycle end (a misclicked
        // create included). Archived blocks disappear from pickers; everything
        // already built from them keeps working (copy-on-use / status-blind
        // lookups). A DB trigger enforces the no-delete rule server-side.
        name: row.statusId === 'ACTIVE' ? 'Archive' : 'Restore',
        icon: IconArchive,
        click: async () => {
          try {
            row.statusId = row.statusId === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE'
            await row.save()
          } catch (e) {
            toast.error(e?.message || 'Failed to update block status')
          }
        },
      },
    )
  }
  return items
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <div class="tw:flex tw:items-center tw:justify-between">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
        <template v-if="!props.standalone">
          <IconLayoutGrid :size="20" class="tw:text-primary" />
          <span class="tw:text-base tw:font-bold">Form Blocks</span>
        </template>
        <HelpButton slug="KB/automation/task-forms-and-form-blocks" :size="15" />
        <span class="tw:text-xs tw:text-secondary tw:font-normal" :class="props.standalone ? '' : 'tw:ml-1'">
          Reusable sections you can drop into workflow step forms and checklists.
        </span>
      </div>
      <BaseButton v-if="canCreate" variant="primary" size="sm" @click="showCreateDialog = true">
        <template #icon><IconPlus :size="16" /></template>
        Create Block
      </BaseButton>
    </div>

    <BaseFilterBar v-model:search="search" searchPlaceholder="Search blocks…" />

    <DataTable
      v-model:pagination="pagination"
      v-model:sort="sort"
      :rows="blocks"
      :columns="columns"
      @rowClick="(row) => canUpdate && openDesign(row)"
    >
      <template #body-cell-title="{ row }">
        <div class="tw:flex tw:items-center tw:gap-2 tw:min-w-0">
          <span class="tw:truncate">{{ row.title }}</span>
          <BaseTooltip
            v-if="isSystemBlock(row)"
            content="Used by built-in features (QC line clearance / child-step forms) — can be edited and archived, never deleted."
          >
            <span
              class="tw:shrink-0 tw:text-micro tw:uppercase tw:tracking-wide tw:rounded tw:px-1.5 tw:py-0.5 tw:bg-indigo-100 tw:text-indigo-700"
            >
              System
            </span>
          </BaseTooltip>
        </div>
      </template>
      <template #body-cell-fields="{ row }">
        {{ row.schema?.length ?? 0 }}
      </template>
      <template #body-cell-statusId="{ row }">
        <FormTemplateStatusBadgeById :statusId="row.statusId" />
      </template>
      <template #body-cell-updatedAt="{ row }">
        {{ row.updatedAt ? row.updatedAt.formatDate('date') : '—' }}
      </template>
      <template #body-cell-actions="{ row }">
        <BaseMenu :items="rowMenuItems(row)" />
      </template>
    </DataTable>

    <!-- Create -->
    <BaseDialog v-model="showCreateDialog" title="Create Form Block" maxWidth="md">
      <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
        <p class="tw:text-xs tw:text-secondary">
          A block is a reusable section — e.g. a containment checklist or sign-off — you can drop
          into any workflow step's task form. You'll design its fields next.
        </p>
        <BaseField v-slot="{ id: fieldId }" label="Block name" required>
          <BaseTextInput
            :id="fieldId"
            v-model="newTitle"
            placeholder="e.g. Containment Checklist"
            autofocus
            @keyup.enter="handleCreate"
          />
        </BaseField>
      </div>
      <template #footer="{ close }">
        <BaseDialogFooter
          submitLabel="Create & Design"
          :loading="creating"
          :disabled="creating || !newTitle.trim()"
          @cancel="close"
          @submit="handleCreate"
        />
      </template>
    </BaseDialog>

    <!-- Rename -->
    <BaseDialog v-model="showRenameDialog" title="Rename Block" maxWidth="md">
      <BaseField v-slot="{ id: fieldId }" label="Block name" required class="tw:p-1">
        <BaseTextInput :id="fieldId" v-model="renameTitle" autofocus @keyup.enter="handleRename" />
      </BaseField>
      <template #footer="{ close }">
        <BaseDialogFooter
          submitLabel="Rename"
          :disabled="!renameTitle.trim()"
          @cancel="close"
          @submit="handleRename"
        />
      </template>
    </BaseDialog>

    <!-- Design — form builder in a dialog; blocks have no detail page -->
    <WorkflowStepFormBuilderPanel
      v-model="builderOpen"
      :initialSchema="designBlock?.schema ?? []"
      builderTitle="Form Block"
      @save="handleSchemaSave"
    />
  </div>
</template>
