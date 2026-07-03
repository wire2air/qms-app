<script setup>
/**
 * Admin card: manage Related Standards (per-tenant lookup used by Documents &
 * Log Books). Reads AND writes go through the syncEngine; writes are gated by
 * RLS to the company owner OR `relatedStandards:configure`.
 */
import { IconPlus, IconPencil, IconTrash, IconRestore } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { required } from '@shared/components/form/validators.js'

const toast = useToast()
const { confirm } = useConfirm()

const canConfigure = computed(() => isAllowed(['relatedStandards:configure']))

const columns = [
  { name: 'name', label: 'NAME', field: 'name', align: 'left' },
  { name: 'code', label: 'CODE', field: 'code', align: 'left' },
  { name: 'displayOrder', label: 'ORDER', field: 'displayOrder', align: 'center' },
]
const rowActions = computed(() =>
  canConfigure.value
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

const standards = useLiveQuery(
  (db) => db.RelatedStandard.where().orderBy('displayOrder', 'asc').exec(),
  { models: ['RelatedStandard'], initial: [] },
)
const deactivated = useLiveQuery(
  async (db) =>
    (await db.RelatedStandard.where('id', undefined, { force: true }).exec()).filter(
      (d) => d.deletedAt,
    ),
  { models: ['RelatedStandard'], initial: [] },
)

const createStandard = useLiveMutation(async (db, payload) => {
  const r = db.RelatedStandard.create(payload)
  await r.save()
  return r
})

const showEditDialog = ref(false)
const editing = ref(null)
const formRef = ref(null)
const saveError = ref('')
const form = ref({ code: '', name: '', description: '', displayOrder: 1000 })
const saving = ref(false)
const codeDirty = ref(false)
const codeEditable = ref(false)
const showDeactivated = ref(false)

watch(showEditDialog, (val) => {
  if (val) saveError.value = ''
})

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
    code: '',
    name: '',
    description: '',
    displayOrder: (standards.value?.length ?? 0) * 100 + 100,
  }
  showEditDialog.value = true
}
function openEdit(row) {
  editing.value = row
  codeDirty.value = true
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
      editing.value.name = form.value.name.trim()
      editing.value.description = form.value.description?.trim() || ''
      editing.value.displayOrder = form.value.displayOrder
      await editing.value.save()
      toast.success('Standard updated')
    } else {
      await createStandard({
        code: form.value.code.trim().toUpperCase(),
        name: form.value.name.trim(),
        description: form.value.description?.trim() || '',
        displayOrder: form.value.displayOrder,
      })
      toast.success('Standard created')
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
      title: 'Deactivate standard',
      message: `Deactivate "${row.name}"? Documents/log books already referencing it keep the value.`,
      okLabel: 'Deactivate',
      danger: true,
    }))
  )
    return
  try {
    await row.delete()
    toast.success('Standard deactivated')
  } catch (e) {
    toast.error(e.message || 'Failed to deactivate')
  }
}
async function handleRestore(row) {
  try {
    await row.restore()
    toast.success('Standard restored')
  } catch (e) {
    toast.error(e.message || 'Failed to restore')
  }
}
</script>

<template>
  <div
    class="tw:rounded-xl tw:border tw:border-divider tw:shadow-sm tw:overflow-hidden tw:bg-sidebar"
  >
    <BaseSectionHeader
      title="Related Standards"
      :level="2"
      size="section-title"
      class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover"
    >
      <template #subtitle>
        The standards this company references on documents & log books (ISO 9001, IATF 16949, …).
        Scoped to this company.
      </template>
      <template #actions>
        <BaseButton v-if="canConfigure" variant="primary" size="sm" @click="openAdd">
          <template #icon><IconPlus :size="16" /></template>
          Add Standard
        </BaseButton>
      </template>
    </BaseSectionHeader>

    <div
      v-if="!canConfigure"
      class="tw:p-4 tw:bg-amber-50 tw:border-b tw:border-amber-200 tw:text-xs tw:text-amber-800"
    >
      You need the "Configure Related Standards" permission to edit these. You can view the list
      below.
    </div>

    <div class="tw:p-4">
      <DataTable
        :rows="standards"
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
        exportFilename="related-standards.csv"
        persistKey="lookups:relatedStandards"
        noDataLabel="No active standards. Add one above."
      >
        <template #body-cell-name="{ row }">
          <span class="tw:font-medium tw:text-on-sidebar">{{ row.name }}</span>
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
            <span class="tw:font-medium tw:text-secondary tw:line-through">{{ row.name }}</span>
            <button
              v-if="canConfigure"
              class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-primary tw:hover:underline"
              @click="handleRestore(row)"
            >
              <IconRestore :size="14" /> Restore
            </button>
          </div>
        </div>
      </div>
    </div>

    <BaseDialog
      v-model="showEditDialog"
      :title="editing ? 'Edit Standard' : 'Add Standard'"
      maxWidth="md"
    >
      <BaseForm ref="formRef" hideFooter @submit="onValidSubmit">
        <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
          <BaseField label="Name" required :value="form.name" :rules="[required()]">
            <template #default="field">
              <BaseTextInput v-bind="field" v-model="form.name" placeholder="e.g. ISO 9001:2015" />
            </template>
          </BaseField>

          <div v-if="!editing">
            <div class="tw:flex tw:items-center tw:justify-between tw:mb-1">
              <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary">
                Code <span class="tw:text-red-500">*</span>
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
                  placeholder="ISO_9001"
                  :disabled="!codeEditable"
                  @input="codeDirty = true"
                />
              </template>
            </BaseField>
            <p class="tw:text-caption tw:text-secondary tw:mt-1">
              SCREAMING_SNAKE_CASE. Cannot be changed later.
            </p>
          </div>

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
