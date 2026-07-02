<script setup>
/**
 * Admin card: manage NC Issue Types.
 *
 * Lives under Company Settings → Lookups tab alongside NC Disposition
 * Types. Reads via the syncEngine (the `nc_issue_types` table is
 * replicated); writes go through REST endpoints in
 * `routes/ncIssueTypes.js`, gated by company owner or holders of
 * `ncIssueTypes:manage`. Soft-delete (paranoid) preserves historical
 * NC references.
 */

import { IconPlus, IconPencil, IconTrash, IconRestore } from '@tabler/icons-vue'
import { currentSession } from '@/utils/currentSession.js'
import { post, patch, del } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { required } from '@shared/components/form/validators.js'

const toast = useToast()
const { confirm } = useConfirm()

const isOwner = computed(() => !!currentSession.value?.isOwner)

const issueTypes = useLiveQuery(
  async (db) => db.NcIssueType.where().orderBy('displayOrder', 'asc').exec(),

  { models: ['NcIssueType'], initial: [] },
)

const deactivated = useLiveQuery(
  async (db) => {
    const all = await db.NcIssueType.where('id', undefined, { force: true }).exec()
    return all.filter((d) => d.deletedAt)
  },

  { models: ['NcIssueType'], initial: [] },
)

// Active-list table config (DataTable). Name carries a description subline and
// Code renders as a chip via slots; per-row Edit/Deactivate come from rowActions
// (owner-only — null hides the actions column entirely for non-owners).
const columns = [
  { name: 'name', label: 'NAME', field: 'name', align: 'left' },
  { name: 'code', label: 'CODE', field: 'code', align: 'left' },
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
const editing = ref(null)
const formRef = ref(null)
const saveError = ref('')
const form = ref({
  code: '',
  name: '',
  description: '',
  displayOrder: 1000,
})
const saving = ref(false)
// Has the user manually edited the code? While false, we keep the code
// auto-derived from the name as they type. First manual keystroke locks
// it so subsequent name edits don't blow away their override.
const codeDirty = ref(false)
const codeEditable = ref(false)

// "Out of Spec" → "OUT_OF_SPEC". Strips punctuation, collapses runs of
// underscores, uppercases. Matches the backend's
// /^[A-Z][A-Z0-9_]*$/ slug regex.
function slugify(text) {
  return (text || '')
    .toString()
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .toUpperCase()
}

// Auto-derive code from name as the user types — but only on new rows
// (editing existing rows preserves the saved code, which is immutable).
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
    displayOrder: (issueTypes.value?.length ?? 0) * 100 + 100,
  }
  showEditDialog.value = true
}

function openEdit(row) {
  editing.value = row
  codeDirty.value = true // existing rows never auto-rewrite
  codeEditable.value = false
  form.value = {
    code: row.code,
    name: row.name,
    description: row.description ?? '',
    displayOrder: row.displayOrder ?? 1000,
  }
  showEditDialog.value = true
}

async function onValidSubmit() {
  saving.value = true
  saveError.value = ''
  try {
    if (editing.value) {
      await patch(`/v1/services/ncIssueTypes/${editing.value.id}`, {
        name: form.value.name.trim(),
        description: form.value.description?.trim() || null,
        displayOrder: form.value.displayOrder,
      })
      toast.success('Issue type updated')
    } else {
      await post('/v1/services/ncIssueTypes', {
        code: form.value.code.trim().toUpperCase(),
        name: form.value.name.trim(),
        description: form.value.description?.trim() || null,
        displayOrder: form.value.displayOrder,
      })
      toast.success('Issue type created')
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
      title: 'Deactivate issue type',
      message: `Deactivate "${row.name}"? Existing NC rows referencing this issue type will keep their reference; new NCs won't see it in the picker.`,
      okLabel: 'Deactivate',
      danger: true,
    }))
  ) {
    return
  }
  try {
    await del(`/v1/services/ncIssueTypes/${row.id}`)
    toast.success('Issue type deactivated')
  } catch (e) {
    toast.error(e.message || 'Failed to deactivate')
  }
}

async function handleRestore(row) {
  try {
    await post(`/v1/services/ncIssueTypes/${row.id}/restore`, {})
    toast.success('Issue type restored')
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
      title="NC Issue Types"
      subtitle="The classification options shown on the NC intake form (Out of Spec / Receiving / Missing Standard, plus any tenant additions). Scoped to this company — changes only affect your tenant."
      :level="2"
      size="section-title"
      class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover"
    >
      <template #actions>
        <BaseButton v-if="isOwner" variant="primary" size="sm" @click="openAdd">
          <template #icon><IconPlus :size="16" /></template>
          Add Issue Type
        </BaseButton>
      </template>
    </BaseSectionHeader>

    <div
      v-if="!isOwner"
      class="tw:p-4 tw:bg-amber-50 tw:border-b tw:border-amber-200 tw:text-xs tw:text-amber-800"
    >
      Only the company owner (or someone with the "Manage NC Issue Types" permission) can edit
      shared lookup data. You can view the list below.
    </div>

    <div class="tw:p-4">
      <DataTable
        :rows="issueTypes"
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
        exportFilename="nc-issue-types.csv"
        persistKey="lookups:ncIssueTypes"
        noDataLabel="No active issue types. Add one above."
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
      </DataTable>

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
      :title="editing ? 'Edit Issue Type' : 'Add Issue Type'"
      maxWidth="md"
    >
      <BaseForm ref="formRef" hideFooter @submit="onValidSubmit">
        <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
          <BaseField label="Name" required :value="form.name" :rules="[required()]">
            <template #default="field">
              <BaseTextInput v-bind="field" v-model="form.name" placeholder="e.g. Out of Spec" />
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
                  placeholder="OUT_OF_SPEC"
                  :disabled="!codeEditable"
                  @input="codeDirty = true"
                />
              </template>
            </BaseField>
            <p class="tw:text-caption tw:text-secondary tw:mt-1">
              SCREAMING_SNAKE_CASE. Stable identifier saved on every NC row that uses this issue
              type — cannot be changed later. We generate it from the name; click
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
