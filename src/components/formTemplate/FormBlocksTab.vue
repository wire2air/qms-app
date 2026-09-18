<script setup>
/**
 * Form Blocks — slim tab surface on the Form Templates page (pattern:
 * OptionSetsTab). Blocks are reusable form fragments (kind = 'BLOCK') embedded
 * inside hosts — workflow step task forms, CAPA/CR child-step forms, QC
 * checklists. They have no records, numbering, versioning, or module machinery
 * of their own, so there is no detail page: Design opens the form builder
 * dialog directly.
 */
import {
  IconLayoutGrid,
  IconPlus,
  IconPencil,
  IconArchive,
  IconCopy,
  IconCircleCheck,
  IconTrash,
  IconArrowsMaximize,
  IconSparkles,
} from '@tabler/icons-vue'
import { useDebounceFn } from '@vueuse/core'
import { isAllowed, canUseAi } from '@/utils/currentSession.js'
import WorkflowStepFormBuilderPanel from '@/components/workflow/WorkflowStepFormBuilderPanel.vue'
import MiniFormBuilder from '@/components/form-builder/MiniFormBuilder.vue'

const props = defineProps({
  // true when hosted by the standalone /form-blocks page — PageHeader owns the
  // title there, so the embedded mini-title is hidden (description + actions stay).
  standalone: { type: Boolean, default: false },
  // BLOCK sub-category this surface manages:
  //   'GENERAL'  — reusable task-form / QC fragments (the Form Blocks page)
  //   'LOG_FORM' — log-book templates (the Log Forms page); exclusive to logs
  category: {
    type: String,
    default: 'GENERAL',
    validator: (v) => ['GENERAL', 'LOG_FORM'].includes(v),
  },
})

const toast = useToast()
const { confirm: confirmDialog } = useConfirm()

// Category-aware copy so one component serves both Form Blocks and Log Forms.
const isLogForm = computed(() => props.category === 'LOG_FORM')
const noun = computed(() => (isLogForm.value ? 'Log Form' : 'Form Block'))
const nounPlural = computed(() => (isLogForm.value ? 'Log Forms' : 'Form Blocks'))
const blurb = computed(() =>
  isLogForm.value
    ? 'Reusable log templates — the fields a log book captures. Start a log book from one; its fields are copied in and frozen when the book is published.'
    : 'Reusable sections you can drop into workflow step forms and checklists.',
)

// Form Blocks has its own authz module; create needs read too (the create
// mutation reads the new row back through the SELECT policy).
const canCreate = computed(() => isAllowed(['form_blocks:create', 'form_blocks:read']))
const canUpdate = computed(() => isAllowed(['form_blocks:update']))

const search = ref('')

// Status filter — working set (Active + Draft) by default (user request
// 2026-08-14): archived blocks don't clutter the list, while a block you just
// created (drafts since 2026-08-14) stays visible.
const STATUS_FILTER_OPTIONS = [
  { id: 'LIVE', name: 'Active & Draft' },
  { id: 'ACTIVE', name: 'Active' },
  { id: 'DRAFT', name: 'Draft' },
  { id: 'ARCHIVED', name: 'Archived' },
  { id: 'ALL', name: 'All statuses' },
]
const statusFilter = ref('LIVE')

const blocks = useLiveQueryWithDeps(
  [() => search.value, () => props.category, () => statusFilter.value],
  async (db, [q, category, status]) => {
    let rows = (await db.FormTemplate.where().exec()).filter(
      (t) => t.kind === 'BLOCK' && (t.blockCategory ?? 'GENERAL') === category,
    )
    if (status === 'LIVE') {
      rows = rows.filter((t) => t.statusId !== 'ARCHIVED')
    } else if (status && status !== 'ALL') {
      rows = rows.filter((t) => t.statusId === status)
    }
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

// "Build with AI" is the same create, landing somewhere else: instead of the
// mini canvas it opens the full builder with the assistant docked, where the
// user can attach the paper form (PDF / spreadsheet) they're replacing and
// converse until the fields are right. Only the destination differs, so it
// reuses this dialog rather than forking the create path.
const createWithAi = ref(false)

function startCreate({ withAi = false } = {}) {
  createWithAi.value = withAi
  newTitle.value = ''
  showCreateDialog.value = true
}

// Blocks never show their code, but form_templates.code is NOT NULL + unique
// per company — derive a hidden, collision-safe one from the title.
function blockCode(title) {
  const slug = title
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  const prefix = isLogForm.value ? 'LOGF' : 'BLK'
  return `${prefix}-${slug || 'BLOCK'}-${rand}`
}

const createBlock = useLiveMutation(async (db, title) => {
  const block = db.FormTemplate.create({
    title,
    code: blockCode(title),
    schema: [],
    // Explicit null — the model's '' default would be serialized into the
    // CREATE mutation and violate the document_types FK.
    documentTypeId: null,
    // Explicit null — '' would violate form_templates_internal_name_company_uidx
    // (UNIQUE on (company_id, internal_name) WHERE NOT NULL) the moment a second
    // block exists; only promoted modules carry an internalName.
    internalName: null,
    // Draft-first (user decision 2026-08-14): a new block is a work-in-progress
    // — it only appears in embed pickers once explicitly Activated, and a
    // never-activated draft can be deleted outright (misclicked creates
    // shouldn't live forever as archived rows).
    statusId: 'DRAFT',
    kind: 'BLOCK',
    blockCategory: props.category,
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
    // The design dialog stays mounted underneath, exactly as the "Full builder"
    // escape hatch leaves it — closing the builder returns to the mini canvas.
    // Deferred a tick so the design dialog's portal node lands FIRST: stacking
    // among equal z-modal layers is DOM order, and opening both in one flush
    // leaves which portal is appended last up to render order.
    if (createWithAi.value) {
      await nextTick()
      openFullBuilder({ withAi: true })
    }
  } catch (e) {
    toast.error(e?.message || 'Failed to create block')
  } finally {
    creating.value = false
  }
}

// ── Clone ────────────────────────────────────────────────────────────────────
const cloneBlockMutation = useLiveMutation(async (db, source) => {
  const title = `${source.title} (Copy)`
  const clone = db.FormTemplate.create({
    title,
    code: blockCode(title),
    schema: JSON.parse(JSON.stringify(source.schema ?? [])),
    documentTypeId: null,
    // Never copy internalName — it's the system-block marker and unique.
    internalName: null,
    statusId: 'DRAFT', // clones start as drafts too — activate when ready
    kind: 'BLOCK',
    blockCategory: source.blockCategory ?? props.category,
    config: JSON.parse(JSON.stringify(source.config ?? {})),
  })
  await clone.save()
  return clone
})

async function handleClone(source) {
  try {
    const clone = await cloneBlockMutation(source)
    toast.success(`Cloned as "${clone.title}" — a draft until you activate it`)
    openDesign(clone)
  } catch (e) {
    toast.error(e?.message || 'Failed to clone block')
  }
}

// ── Design — MiniFormBuilder in a dialog (user request 2026-08-14) ──────────
// Blocks are small fragments; the full-screen builder threw people off. The
// inline mini canvas covers the common case, with the full builder (AI,
// preview, JSON, undo) one click away for heavy edits.
const designDialogOpen = ref(false)
const designBlock = ref(null)
// Re-mounts the mini builder to re-seed after an EXTERNAL schema change
// (full-builder save); its own edits must not re-mount it.
const designSession = ref(0)

// No versioning for blocks — but `version` is kept as a TRACE STAMP (user
// decision 2026-08-14): editing an ACTIVE block's fields bumps it once per
// design session, so "v3" tells an auditor the live block changed twice since
// activation. Drafts stay at their current stamp until activated.
let versionBumpedThisSession = false

function openDesign(block) {
  designBlock.value = block
  designSession.value++
  versionBumpedThisSession = false
  designDialogOpen.value = true
}

// Debounced autosave keyed to the block it belongs to — flushed immediately
// on dialog close / full-builder open so a quick edit-then-close never loses
// the last change (and a fast switch to ANOTHER block can't cross-save).
let pendingSave = null
async function flushSchemaSave() {
  if (!pendingSave) return
  const { block, schema } = pendingSave
  pendingSave = null
  try {
    block.schema = JSON.parse(JSON.stringify(schema))
    if (block.statusId === 'ACTIVE' && !versionBumpedThisSession) {
      versionBumpedThisSession = true
      block.version = (block.version ?? 1) + 1
    }
    await block.save()
  } catch (e) {
    toast.error(e?.message || 'Failed to save block')
  }
}
const debouncedSchemaSave = useDebounceFn(flushSchemaSave, 800)

function onSchemaChange(schema) {
  if (!designBlock.value) return
  pendingSave = { block: designBlock.value, schema }
  debouncedSchemaSave()
}

watch(designDialogOpen, (open) => {
  if (!open) flushSchemaSave()
})

// ── Full builder escape hatch (AI assistant / preview / JSON / undo) ─────────
const builderOpen = ref(false)
const builderStartWithAi = ref(false)

function openFullBuilder({ withAi = false } = {}) {
  flushSchemaSave() // seed the panel with the latest edits
  builderStartWithAi.value = withAi
  builderOpen.value = true
}

async function handleSchemaSave(schema) {
  if (!designBlock.value) return
  designBlock.value.schema = schema
  if (designBlock.value.statusId === 'ACTIVE' && !versionBumpedThisSession) {
    versionBumpedThisSession = true
    designBlock.value.version = (designBlock.value.version ?? 1) + 1
  }
  await designBlock.value.save()
  designSession.value++
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
const columns = computed(() => [
  { name: 'title', label: noun.value.toUpperCase(), field: 'title', align: 'left', sortable: true },
  { name: 'fields', label: 'FIELDS', field: 'fields', align: 'center', sortable: false },
  { name: 'version', label: 'VERSION', field: 'version', align: 'center', sortable: true },
  { name: 'statusId', label: 'STATUS', field: 'statusId', align: 'left', sortable: true },
  { name: 'updatedAt', label: 'UPDATED', field: 'updatedAt', align: 'left', sortable: true },
  { name: 'actions', label: '', field: 'actions', align: 'right' },
])
const pagination = ref({ page: 1, pageSize: 50 })
const sort = ref([{ id: 'updatedAt', desc: true }])

// System blocks are LIVE-referenced by feature code — QC Line Clearance is
// found by internalName in the inspection flow; the Task/Action block seeds
// CAPA/CR child-step forms by code. They can be edited, never deleted.
function isSystemBlock(row) {
  return !!row.internalName || row.code === 'TASK'
}

// Draft → Active is the explicit "publish" moment: the block starts appearing
// in embed pickers (they filter on ACTIVE).
async function handleActivate(row) {
  try {
    row.statusId = 'ACTIVE'
    await row.save()
    toast.success(`"${row.title}" is now active and available in pickers`)
  } catch (e) {
    toast.error(e?.message || 'Failed to activate block')
  }
}

// Deleting is DRAFT-only (never-activated blocks hold no references — nothing
// embeds a draft). Once activated, ARCHIVED is the lifecycle end; a DB trigger
// enforces both rules server-side.
async function handleDeleteDraft(row) {
  const ok = await confirmDialog({
    title: `Delete Draft ${noun.value}`,
    message: `Delete "${row.title}"? Drafts were never activated, so nothing references them — this permanently removes the ${noun.value.toLowerCase()}.`,
    okLabel: 'Delete',
    danger: true,
  })
  if (!ok) return
  try {
    await row.delete()
  } catch (e) {
    toast.error(e?.message || 'Failed to delete draft')
  }
}

function rowMenuItems(row) {
  const items = []
  if (canCreate.value) {
    items.push({ name: 'Clone', icon: IconCopy, click: () => handleClone(row) })
  }
  if (canUpdate.value) {
    items.push(
      { name: 'Design', icon: IconPencil, click: () => openDesign(row) },
      { name: 'Rename', icon: IconPencil, click: () => openRename(row) },
    )
    if (row.statusId === 'DRAFT') {
      items.push({ name: 'Activate', icon: IconCircleCheck, click: () => handleActivate(row) })
      if (!isSystemBlock(row)) {
        items.push({ name: 'Delete', icon: IconTrash, click: () => handleDeleteDraft(row) })
      }
    } else {
      items.push({
        // Activated blocks are never deleted — ARCHIVED is the lifecycle end.
        // Archived blocks disappear from pickers; everything already built
        // from them keeps working (copy-on-use / status-blind lookups).
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
      })
    }
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
          <span class="tw:text-base tw:font-bold">{{ nounPlural }}</span>
        </template>
        <HelpButton slug="KB/automation/task-forms-and-form-blocks" :size="15" />
        <span class="tw:text-xs tw:text-secondary tw:font-normal" :class="props.standalone ? '' : 'tw:ml-1'">
          {{ blurb }}
        </span>
      </div>
      <div class="tw:flex tw:items-center tw:gap-2">
        <BaseButton
          v-if="canCreate && canUseAi"
          variant="outline"
          size="sm"
          title="Describe the form, or attach the PDF / spreadsheet you're replacing, and let AI draft the fields"
          @click="startCreate({ withAi: true })"
        >
          <template #icon><IconSparkles :size="16" /></template>
          AI builder
        </BaseButton>
        <BaseButton v-if="canCreate" variant="primary" size="sm" @click="startCreate()">
          <template #icon><IconPlus :size="16" /></template>
          Create {{ noun }}
        </BaseButton>
      </div>
    </div>

    <BaseFilterBar v-model:search="search" :searchPlaceholder="`Search ${nounPlural.toLowerCase()}…`">
      <template #filters>
        <div class="tw:w-40">
          <BaseSelect
            v-model="statusFilter"
            :options="STATUS_FILTER_OPTIONS"
            optionLabel="name"
            optionValue="id"
            :required="true"
          />
        </div>
      </template>
    </BaseFilterBar>

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
      <template #body-cell-version="{ row }">
        <!-- Trace stamp, not versioning: bumps when an ACTIVE block's fields
             change so auditors can tell the live block was edited. -->
        <span class="tw:text-sm tw:text-secondary">v{{ row.version ?? 1 }}</span>
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
    <BaseDialog
      v-model="showCreateDialog"
      :title="createWithAi ? `Create ${noun} with AI` : `Create ${noun}`"
      maxWidth="md"
    >
      <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
        <p
          v-if="createWithAi"
          class="tw:flex tw:items-start tw:gap-1.5 tw:text-xs tw:text-secondary"
        >
          <IconSparkles :size="14" class="tw:text-primary tw:shrink-0 tw:mt-0.5" />
          <span>
            Name it, then the AI assistant opens alongside the canvas. Attach the PDF or spreadsheet
            you're replacing — it's read in your browser — or just describe the form, and keep
            asking for changes until the fields are right.
          </span>
        </p>
        <p class="tw:text-xs tw:text-secondary">
          <template v-if="isLogForm">
            A log form is the set of fields a log book captures — e.g. a daily temperature check or
            a calibration entry. Create a log book from it and its fields are copied in. You'll
            design its fields next — it stays a draft (deletable, not yet usable) until you
            Activate it.
          </template>
          <template v-else>
            A block is a reusable section — e.g. a containment checklist or sign-off — you can drop
            into any workflow step's task form. You'll design its fields next — it stays a draft
            (deletable, not yet pickable) until you Activate it.
          </template>
        </p>
        <BaseField v-slot="{ id: fieldId }" :label="`${noun} name`" required>
          <BaseTextInput
            :id="fieldId"
            v-model="newTitle"
            :placeholder="isLogForm ? 'e.g. Daily Temperature Check' : 'e.g. Containment Checklist'"
            autofocus
            @keyup.enter="handleCreate"
          />
        </BaseField>
      </div>
      <template #footer="{ close }">
        <BaseDialogFooter
          :submitLabel="createWithAi ? 'Create & Build with AI' : 'Create & Design'"
          :loading="creating"
          :disabled="creating || !newTitle.trim()"
          @cancel="close"
          @submit="handleCreate"
        />
      </template>
    </BaseDialog>

    <!-- Rename -->
    <BaseDialog v-model="showRenameDialog" :title="`Rename ${noun}`" maxWidth="md">
      <BaseField v-slot="{ id: fieldId }" :label="`${noun} name`" required class="tw:p-1">
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

    <!-- Design — MiniFormBuilder dialog; blocks have no detail page.
         persistent + explicit X so a stray Escape/backdrop click while the
         add-field or field-settings sub-dialogs are up can't drop the dialog
         (edits are flushed on close either way). -->
    <BaseDialog
      v-model="designDialogOpen"
      :title="designBlock?.title || `Design ${noun}`"
      size="4xl"
      persistent
      showClose
    >
      <div class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:px-1 tw:pb-3">
        <BaseCaption>
          Add and arrange fields; drag to reorder, click a field to configure it. Changes save
          automatically.
        </BaseCaption>
        <div class="tw:flex tw:items-center tw:gap-2 tw:shrink-0">
          <BaseButton
            v-if="canUseAi"
            variant="outline"
            size="sm"
            title="Attach the PDF / spreadsheet you're replacing, or describe the changes, and let AI draft the fields"
            @click="openFullBuilder({ withAi: true })"
          >
            <template #icon><IconSparkles :size="14" /></template>
            AI builder
          </BaseButton>
          <BaseButton variant="outline" size="sm" @click="openFullBuilder()">
            <template #icon><IconArrowsMaximize :size="14" /></template>
            Full builder
          </BaseButton>
        </div>
      </div>
      <MiniFormBuilder
        v-if="designBlock"
        :key="`${designBlock.id}:${designSession}`"
        :initialSchema="designBlock.schema ?? []"
        @update:schema="onSchemaChange"
      />
      <template #footer="{ close }">
        <BaseButton variant="primary" @click="close">Done</BaseButton>
      </template>
    </BaseDialog>

    <!-- Full builder — heavy edits (AI assistant, preview, JSON, undo) -->
    <WorkflowStepFormBuilderPanel
      v-model="builderOpen"
      :initialSchema="designBlock?.schema ?? []"
      :builderTitle="noun"
      :startWithAi="builderStartWithAi"
      @save="handleSchemaSave"
    />
  </div>
</template>
