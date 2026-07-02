<script setup>
/**
 * Admin card: manage NC Disposition Types.
 *
 * Lives under Company Settings → Lookups tab. Reads via the syncEngine
 * (the `nc_disposition_types` table is replicated). Writes go through
 * REST endpoints in `routes/ncDispositionTypes.js`, gated by company
 * owner. Soft-delete (paranoid) preserves historical NC references.
 */

import {
  IconPlus,
  IconPencil,
  IconTrash,
  IconRestore,
  IconCircleCheckFilled,
} from '@tabler/icons-vue'
import { currentSession } from '@/utils/currentSession.js'
import { post, patch, del } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { required } from '@shared/components/form/validators.js'

const toast = useToast()
const { confirm } = useConfirm()

const isOwner = computed(() => !!currentSession.value?.isOwner)

// Active dispositions (paranoid filter — deletedAt is null).
const dispositions = useLiveQuery(
  async (db) => db.NcDispositionType.where().orderBy('displayOrder', 'asc').exec(),

  { models: ['NcDispositionType'], initial: [] },
)

// Deactivated (soft-deleted) — read with force=true to bypass paranoid.
// Used for the "Deactivated" collapsible section + Restore action.
const deactivated = useLiveQuery(
  async (db) => {
    const all = await db.NcDispositionType.where('id', undefined, { force: true }).exec()
    return all.filter((d) => d.deletedAt)
  },

  { models: ['NcDispositionType'], initial: [] },
)

// Active-list table config (DataTable). Name carries a description subline, Code
// renders as a chip, and Tracks Cost renders an icon — all via slots; per-row
// Edit/Deactivate come from rowActions (owner-only — null hides the actions column).
const columns = [
  { name: 'name', label: 'NAME', field: 'name', align: 'left' },
  { name: 'code', label: 'CODE', field: 'code', align: 'left' },
  { name: 'tracksCost', label: 'TRACKS COST', field: 'tracksCost', align: 'center' },
  { name: 'displayOrder', label: 'ORDER', field: 'displayOrder', align: 'center' },
]
const rowActions = computed(() =>
  isOwner.value
    ? [
        { key: 'edit', label: 'Edit', icon: IconPencil, onClick: (row) => openEdit(row) },
        {
          key: 'deactivate',
          label: 'Deactivate',
          icon: IconTrash,
          danger: true,
          onClick: (row) => handleDeactivate(row),
        },
      ]
    : null,
)

// ─── Dialog state ────────────────────────────────────────────────────────────
const showEditDialog = ref(false)
const editing = ref(null) // null = new row, otherwise existing row
const formRef = ref(null)
const saveError = ref('')
const form = ref({
  code: '',
  name: '',
  description: '',
  displayOrder: 1000,
  tracksCost: false,
})
const saving = ref(false)
// codeDirty: has the user manually edited the code? Until they do, we
// keep code auto-derived from the name as they type. codeEditable
// toggles the override input on/off.
const codeDirty = ref(false)
const codeEditable = ref(false)

function slugify(text) {
  return (text || '')
    .toString()
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .toUpperCase()
}

watch(
  () => form.value.name,
  (newName) => {
    if (editing.value) return
    if (codeDirty.value) return
    form.value.code = slugify(newName)
  },
)

// Reset dialog state on open so a previous error or dirty state never bleeds
// into the next invocation.
watch(showEditDialog, (val) => {
  if (val) {
    saveError.value = ''
  }
})

function openAdd() {
  editing.value = null
  codeDirty.value = false
  codeEditable.value = false
  form.value = {
    code: '',
    name: '',
    description: '',
    displayOrder: (dispositions.value?.length ?? 0) * 100 + 100,
    tracksCost: false,
  }
  showEditDialog.value = true
}

function openEdit(row) {
  editing.value = row
  codeDirty.value = true
  codeEditable.value = false
  form.value = {
    code: row.code,
    name: row.name,
    description: row.description ?? '',
    displayOrder: row.displayOrder ?? 1000,
    tracksCost: !!row.tracksCost,
  }
  showEditDialog.value = true
}

async function onValidSubmit() {
  saving.value = true
  saveError.value = ''
  try {
    if (editing.value) {
      await patch(`/v1/services/ncDispositionTypes/${editing.value.id}`, {
        name: form.value.name.trim(),
        description: form.value.description?.trim() || null,
        displayOrder: form.value.displayOrder,
        tracksCost: form.value.tracksCost,
      })
      toast.success('Disposition updated')
    } else {
      await post('/v1/services/ncDispositionTypes', {
        code: form.value.code.trim().toUpperCase(),
        name: form.value.name.trim(),
        description: form.value.description?.trim() || null,
        displayOrder: form.value.displayOrder,
        tracksCost: form.value.tracksCost,
      })
      toast.success('Disposition created')
    }
    showEditDialog.value = false
  } catch (e) {
    saveError.value = e.message || 'Failed to save'
  } finally {
    saving.value = false
  }
}

async function handleDeactivate(row) {
  if (
    !(await confirm({
      title: 'Deactivate disposition',
      message: `Deactivate "${row.name}"? Existing NC rows referencing this disposition will keep their reference; new NCs won't see it in the picker.`,
      okLabel: 'Deactivate',
      danger: true,
    }))
  ) {
    return
  }
  try {
    await del(`/v1/services/ncDispositionTypes/${row.id}`)
    toast.success('Disposition deactivated')
  } catch (e) {
    toast.error(e.message || 'Failed to deactivate')
  }
}

async function handleRestore(row) {
  try {
    await post(`/v1/services/ncDispositionTypes/${row.id}/restore`, {})
    toast.success('Disposition restored')
  } catch (e) {
    toast.error(e.message || 'Failed to restore')
  }
}

const showDeactivated = ref(false)
</script>

<template>
  <div
    class="tw:rounded-xl tw:border tw:border-divider tw:shadow-sm tw:overflow-hidden tw:bg-sidebar"
  >
    <BaseSectionHeader
      title="NC Disposition Types"
      :level="2"
      size="section-title"
      class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover"
    >
      <template #subtitle>
        The disposition options reviewers pick when closing out a nonconformance. Toggle
        <strong>Tracks cost</strong> for dispositions that generate Cost of NC (Scrap / Rework /
        Repair / Return-to-Supplier). Scoped to this company — changes only affect your tenant.
      </template>
      <template #actions>
        <BaseButton v-if="isOwner" variant="primary" size="sm" @click="openAdd">
          <template #icon><IconPlus :size="16" /></template>
          Add Disposition
        </BaseButton>
      </template>
    </BaseSectionHeader>

    <div
      v-if="!isOwner"
      class="tw:p-4 tw:bg-amber-50 tw:border-b tw:border-amber-200 tw:text-xs tw:text-amber-800"
    >
      Only the company owner can edit shared lookup data. You can view the list below.
    </div>

    <div class="tw:p-4">
      <DataTable
        :rows="dispositions"
        :columns="columns"
        :rowActions="rowActions"
        rowKey="id"
        :mobileCards="false"
        hidePagination
        searchable
        filterable
        densitySelector
        columnManager
        exportManager
        exportFilename="nc-dispositions.csv"
        persistKey="lookups:ncDispositions"
        noDataLabel="No active dispositions. Add one above."
      >
        <template #body-cell-name="{ row }">
          <div class="tw:font-medium tw:text-on-sidebar">{{ row.name }}</div>
          <div v-if="row.description" class="tw:text-xs tw:text-secondary tw:mt-0.5">
            {{ row.description }}
          </div>
        </template>
        <template #body-cell-code="{ row }">
          <code class="tw:text-xs tw:px-2 tw:py-0.5 tw:rounded tw:bg-main-hover tw:text-secondary">
            {{ row.code }}
          </code>
        </template>
        <template #body-cell-tracksCost="{ row }">
          <IconCircleCheckFilled
            v-if="row.tracksCost"
            :size="18"
            class="tw:text-green-600 tw:inline"
          />
          <span v-else class="tw:text-secondary">—</span>
        </template>
      </DataTable>

      <!-- Deactivated section (collapsed by default) -->
      <div v-if="deactivated.length" class="tw:mt-4 tw:border-t tw:border-divider tw:pt-4">
        <button
          class="tw:text-xs tw:font-semibold tw:text-secondary tw:hover:text-on-sidebar"
          @click="showDeactivated = !showDeactivated"
        >
          {{ showDeactivated ? '▾' : '▸' }} Deactivated ({{ deactivated.length }})
        </button>
        <div v-if="showDeactivated" class="tw:mt-2 tw:flex tw:flex-col tw:gap-1">
          <div
            v-for="row in deactivated"
            :key="row.id"
            class="tw:flex tw:items-center tw:justify-between tw:px-3 tw:py-2 tw:rounded-lg tw:bg-main-hover/40 tw:text-sm"
          >
            <div>
              <span class="tw:font-medium tw:text-secondary tw:line-through">{{ row.name }}</span>
              <code
                class="tw:text-micro tw:px-1.5 tw:py-0.5 tw:ml-2 tw:rounded tw:bg-white tw:text-secondary"
                >{{ row.code }}</code
              >
            </div>
            <button
              v-if="isOwner"
              class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-primary tw:hover:underline"
              @click="handleRestore(row)"
            >
              <IconRestore :size="14" />
              Restore
            </button>
          </div>
        </div>
      </div>
    </div>

    <BaseDialog
      v-model="showEditDialog"
      :title="editing ? 'Edit Disposition' : 'Add Disposition'"
      maxWidth="md"
    >
      <BaseForm ref="formRef" hideFooter @submit="onValidSubmit">
        <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
          <BaseField label="Name" required :value="form.name" :rules="[required()]">
            <template #default="field">
              <BaseTextInput
                v-bind="field"
                v-model="form.name"
                placeholder="e.g. Donate to Training"
              />
            </template>
          </BaseField>

          <div v-if="!editing">
            <div class="tw:flex tw:items-center tw:justify-between tw:mb-1">
              <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary">
                Code <span class="tw:text-red-500">*</span>
                <span class="tw:font-normal tw:normal-case tw:text-secondary tw:ml-1">
                  (auto-derived from name)
                </span>
              </p>
              <button
                type="button"
                class="tw:text-caption tw:text-primary tw:hover:underline tw:bg-transparent tw:border-0 tw:cursor-pointer"
                @click="codeEditable = !codeEditable"
              >
                {{ codeEditable ? 'Lock' : 'Edit' }}
              </button>
            </div>
            <BaseField :value="form.code" :rules="[required()]">
              <template #default="field">
                <BaseTextInput
                  v-bind="field"
                  v-model="form.code"
                  placeholder="DONATE_TO_TRAINING"
                  :disabled="!codeEditable"
                  @input="codeDirty = true"
                />
              </template>
            </BaseField>
            <p class="tw:text-caption tw:text-secondary tw:mt-1">
              SCREAMING_SNAKE_CASE. Stable identifier saved on every NC row that uses this
              disposition — cannot be changed later. We generate it from the name; click
              <strong>Edit</strong> to override.
            </p>
          </div>

          <BaseField label="Description" :value="form.description">
            <template #default="field">
              <BaseTextarea
                v-bind="field"
                v-model="form.description"
                :rows="2"
                placeholder="Optional description shown alongside the option in the picker"
              />
            </template>
          </BaseField>

          <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
            <BaseField label="Display Order" :value="form.displayOrder">
              <template #default="field">
                <BaseTextInput
                  v-bind="field"
                  v-model.number="form.displayOrder"
                  type="number"
                  :min="0"
                />
              </template>
            </BaseField>
            <BaseField label="Tracks Cost">
              <label class="tw:flex tw:items-center tw:gap-2 tw:cursor-pointer">
                <BaseSwitch v-model="form.tracksCost" />
                <span class="tw:text-xs tw:text-secondary">
                  Require Cost of NC when this disposition is picked
                </span>
              </label>
            </BaseField>
          </div>
        </div>
      </BaseForm>

      <template #footer="{ close }">
        <BaseDialogFooter
          :submitLabel="editing ? 'Save' : 'Add'"
          :loading="saving"
          :error="saveError"
          @cancel="close"
          @submit="formRef.submit()"
        />
      </template>
    </BaseDialog>
  </div>
</template>
