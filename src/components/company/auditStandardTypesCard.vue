<script setup>
/**
 * Admin card: manage Audit Standard Types (per-tenant lookup).
 *
 * Lives under Settings → Lookups. Reads via the syncEngine; writes go
 * through REST (controllers/auditStandardTypes.js) gated by company
 * owner or holders of `auditStandardTypes:manage`. Soft-delete
 * preserves historical audit_standards references — the FK on
 * audit_standards.audit_standard_type_id is SET NULL on delete so a
 * deactivation doesn't orphan the standard, just clears the
 * categorisation.
 *
 * Mirrors RootCauseCategoriesCard / HazardCategoriesCard /
 * SupplierCertificateTypesCard.
 */

import { IconPlus, IconPencil, IconTrash, IconRestore } from '@tabler/icons-vue'
import { currentSession, isAllowed } from '@/utils/currentSession.js'
import { post, patch, del } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { required } from '@shared/components/form/validators.js'

const toast = useToast()
const { confirm } = useConfirm()

const canManage = computed(
  () => !!currentSession.value?.isOwner || isAllowed(['auditStandardTypes:manage']),
)

const standardTypes = useLiveQuery(
  async (db) => db.AuditStandardType.where().orderBy('displayOrder', 'asc').exec(),

  { models: ['AuditStandardType'], initial: [] },
)

const deactivated = useLiveQuery(
  async (db) => {
    const all = await db.AuditStandardType.where('id', undefined, { force: true }).exec()
    return all.filter((c) => c.deletedAt)
  },

  { models: ['AuditStandardType'], initial: [] },
)

// Active-list table config (DataTable). Name carries a description subline,
// Code renders as a chip, and Colour renders the type badge — all via slots.
// Per-row Edit/Deactivate come from rowActions (null hides the actions column
// for users without manage permission).
const columns = [
  { name: 'name', label: 'NAME', field: 'name', align: 'left' },
  { name: 'code', label: 'CODE', field: 'code', align: 'left' },
  { name: 'color', label: 'COLOUR', field: 'color', align: 'center' },
  { name: 'displayOrder', label: 'ORDER', field: 'displayOrder', align: 'center' },
]
const rowActions = computed(() =>
  canManage.value
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

const showEditDialog = ref(false)
const editing = ref(null)
const formRef = ref(null)
const saveError = ref('')
const form = ref({
  code: '',
  name: '',
  description: '',
  color: '',
  displayOrder: 1000,
})
const saving = ref(false)
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
    color: '',
    displayOrder: (standardTypes.value?.length ?? 0) * 100 + 100,
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
    color: row.color ?? '',
    displayOrder: row.displayOrder ?? 1000,
  }
  showEditDialog.value = true
}

async function onValidSubmit() {
  saving.value = true
  saveError.value = ''
  try {
    if (editing.value) {
      await patch(`/v1/services/auditStandardTypes/${editing.value.id}`, {
        name: form.value.name.trim(),
        description: form.value.description?.trim() || null,
        color: form.value.color?.trim() || null,
        displayOrder: form.value.displayOrder,
      })
      toast.success('Standard type updated')
    } else {
      await post('/v1/services/auditStandardTypes', {
        code: form.value.code.trim().toUpperCase(),
        name: form.value.name.trim(),
        description: form.value.description?.trim() || null,
        color: form.value.color?.trim() || null,
        displayOrder: form.value.displayOrder,
      })
      toast.success('Standard type created')
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
      title: 'Deactivate standard type',
      message: `Deactivate "${row.name}"? Existing audit_standards referencing this category will keep their reference; new standards won't see it in the type picker.`,
      okLabel: 'Deactivate',
      danger: true,
    }))
  ) {
    return
  }
  try {
    await del(`/v1/services/auditStandardTypes/${row.id}`)
    toast.success('Standard type deactivated')
  } catch (e) {
    toast.error(e.message || 'Failed to deactivate')
  }
}

async function handleRestore(row) {
  try {
    await post(`/v1/services/auditStandardTypes/${row.id}/restore`, {})
    toast.success('Standard type restored')
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
      title="Audit Standard Types"
      subtitle="Categories the admin picks when registering an audit standard in the library (Internal Quality / Supplier Qualification / Certification Body / Process / Warehouse). Seeded with 5 common types; rename or add tenant-specific types below. Colour drives the badge styling across the standards list."
      :level="2"
      size="section-title"
      class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover"
    >
      <template #actions>
        <BaseButton v-if="canManage" variant="primary" size="sm" @click="openAdd">
          <template #icon><IconPlus :size="16" /></template>
          Add Standard Type
        </BaseButton>
      </template>
    </BaseSectionHeader>

    <div
      v-if="!canManage"
      class="tw:p-4 tw:bg-amber-50 tw:border-b tw:border-amber-200 tw:text-xs tw:text-amber-800"
    >
      You don't have the "Manage Audit Standard Types" permission. View only.
    </div>

    <div class="tw:p-4">
      <DataTable
        :rows="standardTypes"
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
        exportFilename="audit-standard-types.csv"
        persistKey="lookups:auditStandardTypes"
        noDataLabel="No active standard types. Add one above."
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
        <template #body-cell-color="{ row }">
          <AuditStandardTypeBadge :standardType="row" />
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
              >
                {{ row.code }}
              </code>
            </div>
            <button
              v-if="canManage"
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
      :title="editing ? 'Edit Standard Type' : 'Add Standard Type'"
      maxWidth="md"
    >
      <BaseForm ref="formRef" hideFooter @submit="onValidSubmit">
        <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
          <BaseField label="Name" required :value="form.name" :rules="[required()]">
            <template #default="field">
              <BaseTextInput
                v-bind="field"
                v-model="form.name"
                placeholder="e.g. Layered Process Audit"
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
                  placeholder="LAYERED_PROCESS_AUDIT"
                  :disabled="!codeEditable"
                  @input="codeDirty = true"
                />
              </template>
            </BaseField>
            <p class="tw:text-caption tw:text-secondary tw:mt-1">
              SCREAMING_SNAKE_CASE. Stable identifier saved on every audit_standards row using this
              type — cannot be changed later.
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
            <BaseField
              label="Colour"
              hint="Used as the badge background tint. Leave empty for neutral grey."
            >
              <BaseColorPicker v-model="form.color" allowNull />
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
