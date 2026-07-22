<script setup>
/**
 * Admin card for the per-tenant Production Lines lookup (Settings → Lookups).
 * Reads + writes via syncEngine (RLS allows app_user writes with
 * inspection_qc:create). Each line has a code/name/area and can point at its
 * primary equipment/asset.
 */
import { IconPlus, IconPencil, IconTrash, IconRestore } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { required } from '@shared/components/form/validators.js'

const toast = useToast()
const { confirm } = useConfirm()
const canConfigure = computed(() => isAllowed(['inspection_qc:create']))

const rows = useLiveQuery(
  async (db) => (await db.ProductionLine.where().exec()).sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
  { models: ['ProductionLine'], initial: [] },
)
const deactivated = useLiveQuery(
  async (db) => (await db.ProductionLine.where('id', undefined, { force: true }).exec()).filter((d) => d.deletedAt),
  { models: ['ProductionLine'], initial: [] },
)

const columns = [
  { name: 'name', label: 'NAME', field: 'name', align: 'left' },
  { name: 'area', label: 'AREA', field: 'area', align: 'left' },
  { name: 'code', label: 'CODE', field: 'code', align: 'left' },
  { name: 'displayOrder', label: 'ORDER', field: 'displayOrder', align: 'center' },
]
const rowActions = computed(() =>
  canConfigure.value
    ? [
        { key: 'edit', label: 'Edit', icon: IconPencil, onClick: (row) => openEdit(row) },
        { key: 'deactivate', label: 'Deactivate', icon: IconTrash, danger: true, onClick: (row) => handleDeactivate(row) },
      ]
    : null,
)

const showDialog = ref(false)
const editing = ref(null)
const formRef = ref(null)
const saving = ref(false)
const saveError = ref('')
const showDeactivated = ref(false)
const codeEditable = ref(false)
const codeDirty = ref(false)
const form = ref({ code: '', name: '', description: '', area: '', defaultEquipmentId: null, displayOrder: 1000 })

function slugify(text) {
  return (text || '').toString().trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/_+/g, '_').toUpperCase()
}
watch(
  () => form.value.name,
  (n) => {
    if (editing.value || codeDirty.value) return
    form.value.code = slugify(n)
  },
)

function openAdd() {
  editing.value = null
  codeDirty.value = false
  codeEditable.value = false
  form.value = {
    code: '', name: '', description: '', area: '', defaultEquipmentId: null,
    displayOrder: (rows.value?.length ?? 0) * 100 + 100,
  }
  showDialog.value = true
}
function openEdit(row) {
  editing.value = row
  codeDirty.value = true
  form.value = {
    code: row.code, name: row.name, description: row.description ?? '', area: row.area ?? '',
    defaultEquipmentId: row.defaultEquipmentId ?? null, displayOrder: row.displayOrder ?? 1000,
  }
  showDialog.value = true
}
watch(showDialog, (v) => {
  if (v) saveError.value = ''
})

const createRow = useLiveMutation(async (db, payload) => {
  const row = db.ProductionLine.create(payload)
  await row.save()
  return row
})

async function onValidSubmit() {
  saving.value = true
  saveError.value = ''
  try {
    const base = {
      name: form.value.name.trim(),
      description: form.value.description?.trim() || null,
      area: form.value.area?.trim() || null,
      defaultEquipmentId: form.value.defaultEquipmentId || null,
      displayOrder: form.value.displayOrder,
    }
    if (editing.value) {
      Object.assign(editing.value, base)
      await editing.value.save()
      toast.success('Production line updated')
    } else {
      await createRow({ ...base, code: form.value.code.trim().toUpperCase() })
      toast.success('Production line created')
    }
    showDialog.value = false
  } catch (e) {
    saveError.value = e.message || 'Failed to save'
  } finally {
    saving.value = false
  }
}
async function handleDeactivate(row) {
  if (!(await confirm({ title: 'Deactivate', message: `Deactivate "${row.name}"?`, okLabel: 'Deactivate', danger: true }))) return
  try {
    await row.delete()
    toast.success('Deactivated')
  } catch (e) {
    toast.error(e.message || 'Failed to deactivate')
  }
}
async function handleRestore(row) {
  try {
    await row.restore()
    toast.success('Restored')
  } catch (e) {
    toast.error(e.message || 'Failed to restore')
  }
}
</script>

<template>
  <div class="tw:rounded-xl tw:border tw:border-divider tw:shadow-sm tw:overflow-hidden tw:bg-sidebar">
    <BaseSectionHeader
      title="Production Lines"
      :level="2"
      size="section-title"
      class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover"
    >
      <template #subtitle>Production lines / stages for in-process (IPQC) inspection. Scoped to this company.</template>
      <template #actions>
        <BaseButton v-if="canConfigure" variant="primary" size="sm" @click="openAdd">
          <template #icon><IconPlus :size="16" /></template>
          Add
        </BaseButton>
      </template>
    </BaseSectionHeader>

    <div class="tw:p-4">
      <DataTable
        :rows="rows"
        :columns="columns"
        :rowActions="rowActions"
        rowKey="id"
        :mobileCards="false"
        hidePagination
        searchable
        persistKey="lookups:ProductionLine"
        noDataLabel="No production lines yet. Add one above."
      >
        <template #body-cell-name="{ row }">
          <span class="tw:font-medium tw:text-on-sidebar">{{ row.name }}</span>
          <div v-if="row.description" class="tw:text-xs tw:text-secondary tw:mt-0.5">{{ row.description }}</div>
        </template>
        <template #body-cell-area="{ row }">
          <span class="tw:text-sm tw:text-secondary">{{ row.area || '—' }}</span>
        </template>
        <template #body-cell-code="{ row }">
          <code class="tw:text-xs tw:px-2 tw:py-0.5 tw:rounded tw:bg-main-hover tw:text-secondary">{{ row.code }}</code>
        </template>
      </DataTable>

      <div v-if="deactivated.length" class="tw:mt-4 tw:border-t tw:border-divider tw:pt-4">
        <button class="tw:text-xs tw:font-semibold tw:text-secondary tw:hover:text-on-sidebar" @click="showDeactivated = !showDeactivated">
          {{ showDeactivated ? '▾' : '▸' }} Deactivated ({{ deactivated.length }})
        </button>
        <div v-if="showDeactivated" class="tw:mt-2 tw:flex tw:flex-col tw:gap-1">
          <div
            v-for="row in deactivated"
            :key="row.id"
            class="tw:flex tw:items-center tw:justify-between tw:px-3 tw:py-2 tw:rounded-lg tw:bg-main-hover/40 tw:text-sm"
          >
            <span class="tw:font-medium tw:text-secondary tw:line-through">{{ row.name }}</span>
            <button v-if="canConfigure" class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-primary tw:hover:underline" @click="handleRestore(row)">
              <IconRestore :size="14" /> Restore
            </button>
          </div>
        </div>
      </div>
    </div>

    <BaseDialog v-model="showDialog" :title="editing ? 'Edit Production Line' : 'Add Production Line'" maxWidth="md">
      <BaseForm ref="formRef" hideFooter @submit="onValidSubmit">
        <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
          <BaseField label="Name" required :value="form.name" :rules="[required()]">
            <template #default="field">
              <BaseTextInput v-bind="field" v-model="form.name" placeholder="e.g. Filling Line 1" />
            </template>
          </BaseField>

          <div v-if="!editing">
            <div class="tw:flex tw:items-center tw:justify-between tw:mb-1">
              <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary">
                Code <span class="tw:text-red-500">*</span>
              </p>
              <button type="button" class="tw:text-caption tw:text-primary tw:hover:underline tw:bg-transparent tw:border-0 tw:cursor-pointer" @click="codeEditable = !codeEditable">
                {{ codeEditable ? 'Lock' : 'Edit' }}
              </button>
            </div>
            <BaseField :value="form.code" :rules="[required()]">
              <template #default="field">
                <BaseTextInput v-bind="field" v-model="form.code" placeholder="LINE_1" :disabled="!codeEditable" @input="codeDirty = true" />
              </template>
            </BaseField>
            <p class="tw:text-caption tw:text-secondary tw:mt-1">SCREAMING_SNAKE_CASE. Cannot be changed later.</p>
          </div>

          <BaseField label="Production area / department" :value="form.area">
            <template #default="field">
              <BaseTextInput v-bind="field" v-model="form.area" placeholder="e.g. Filling Hall" />
            </template>
          </BaseField>

          <BaseField label="Primary equipment" :value="form.defaultEquipmentId">
            <EquipmentSelectMenu v-model="form.defaultEquipmentId" />
          </BaseField>

          <BaseField label="Description" :value="form.description">
            <template #default="field">
              <BaseTextarea v-bind="field" v-model="form.description" :rows="2" />
            </template>
          </BaseField>

          <BaseField label="Display Order" :value="form.displayOrder">
            <template #default="field">
              <BaseTextInput v-bind="field" v-model.number="form.displayOrder" type="number" :min="0" />
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
