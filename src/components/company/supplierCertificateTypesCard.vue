<script setup>
/**
 * Admin card: manage Supplier Certificate Types (per-tenant lookup).
 *
 * Lives under Company Settings → Lookups tab. Reads via the syncEngine
 * (the `supplier_certificate_types` table is replicated). Writes go
 * through REST endpoints in `routes/supplierCertificateTypes.js`,
 * gated by the company owner or holders of
 * `supplierCertificateTypes:manage`. Soft-delete (paranoid) preserves
 * historical supplier_assets references — the FK is SET NULL on delete
 * but historical rows keep is_certificate + expires_at intact.
 *
 * Mirror of NcDispositionTypesCard + RootCauseCategoriesCard. The
 * lookup has a `color` column (rendered as the badge background tint),
 * same as root_cause_categories / hazard_categories — the dialog uses
 * a colour picker.
 */

import { IconPlus, IconPencil, IconTrash, IconRestore } from '@tabler/icons-vue'
import { currentSession, isAllowed } from '@/utils/currentSession.js'
import { post, patch, del } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { required } from '@shared/components/form/validators.js'

const toast = useToast()
const { confirm } = useConfirm()

const canManage = computed(
  () => !!currentSession.value?.isOwner || isAllowed(['supplierCertificateTypes:manage']),
)

const certificateTypes = useLiveQuery(
  async (db) => db.SupplierCertificateType.where().orderBy('displayOrder', 'asc').exec(),

  { models: ['SupplierCertificateType'], initial: [] },
)

const deactivated = useLiveQuery(
  async (db) => {
    const all = await db.SupplierCertificateType.where('id', undefined, { force: true }).exec()
    return all.filter((c) => c.deletedAt)
  },

  { models: ['SupplierCertificateType'], initial: [] },
)

// Active-list table config (DataTable). Name carries a description subline, Code
// renders as a chip, and Colour renders the certificate-type badge — all via
// slots; per-row Edit/Deactivate come from rowActions (gated by canManage — null
// hides the actions column entirely for users without the permission).
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
    displayOrder: (certificateTypes.value?.length ?? 0) * 100 + 100,
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
      await patch(`/v1/services/supplierCertificateTypes/${editing.value.id}`, {
        name: form.value.name.trim(),
        description: form.value.description?.trim() || null,
        color: form.value.color?.trim() || null,
        displayOrder: form.value.displayOrder,
      })
      toast.success('Certificate type updated')
    } else {
      await post('/v1/services/supplierCertificateTypes', {
        code: form.value.code.trim().toUpperCase(),
        name: form.value.name.trim(),
        description: form.value.description?.trim() || null,
        color: form.value.color?.trim() || null,
        displayOrder: form.value.displayOrder,
      })
      toast.success('Certificate type created')
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
      title: 'Deactivate certificate type',
      message: `Deactivate "${row.name}"? Existing supplier_assets rows referencing this category will keep their is_certificate + expires_at; new uploads won't see it in the picker.`,
      okLabel: 'Deactivate',
      danger: true,
    }))
  ) {
    return
  }
  try {
    await del(`/v1/services/supplierCertificateTypes/${row.id}`)
    toast.success('Certificate type deactivated')
  } catch (e) {
    toast.error(e.message || 'Failed to deactivate')
  }
}

async function handleRestore(row) {
  try {
    await post(`/v1/services/supplierCertificateTypes/${row.id}/restore`, {})
    toast.success('Certificate type restored')
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
      title="Supplier Certificate Types"
      subtitle="Categories the admin picks when uploading a supplier certificate (ISO 9001 / 13485 / AS9100 / FDA 21 CFR 820 / Insurance / etc.). The cert row's expiry date drives the daily reminder worker — colour drives the badge styling across the supplier panel and dashboards."
      :level="2"
      size="section-title"
      class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover"
    >
      <template #actions>
        <BaseButton v-if="canManage" variant="primary" size="sm" @click="openAdd">
          <template #icon><IconPlus :size="16" /></template>
          Add Certificate Type
        </BaseButton>
      </template>
    </BaseSectionHeader>

    <div
      v-if="!canManage"
      class="tw:p-4 tw:bg-amber-50 tw:border-b tw:border-amber-200 tw:text-xs tw:text-amber-800"
    >
      You don't have the "Manage Supplier Certificate Types" permission. View only.
    </div>

    <div class="tw:p-4">
      <DataTable
        :rows="certificateTypes"
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
        exportFilename="supplier-certificate-types.csv"
        persistKey="lookups:supplierCertificateTypes"
        noDataLabel="No active certificate types. Add one above."
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
          <SupplierCertificateTypeBadge :certificateType="row" />
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
      :title="editing ? 'Edit Certificate Type' : 'Add Certificate Type'"
      maxWidth="md"
    >
      <BaseForm ref="formRef" hideFooter @submit="onValidSubmit">
        <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
          <BaseField label="Name" required :value="form.name" :rules="[required()]">
            <template #default="field">
              <BaseTextInput v-bind="field" v-model="form.name" placeholder="e.g. NADCAP" />
            </template>
          </BaseField>

          <div v-if="!editing">
            <div class="tw:flex tw:items-center tw:justify-between tw:mb-1">
              <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary">
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
                  placeholder="NADCAP"
                  :disabled="!codeEditable"
                  @input="codeDirty = true"
                />
              </template>
            </BaseField>
            <p class="tw:text-caption tw:text-secondary tw:mt-1">
              SCREAMING_SNAKE_CASE. Stable identifier saved on every supplier_assets row using this
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
