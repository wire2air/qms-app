<script setup>
/**
 * Admin card: manage Event Categories (per-tenant lookup for Events &
 * Observations). Reads via syncEngine; writes via REST (routes/qualityEvents.js),
 * gated by company owner OR `qualityEvents:configure`.
 */
import { IconPlus, IconPencil, IconTrash, IconRestore } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { post, patch, del } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { required } from '@shared/components/form/validators.js'

const toast = useToast()
const { confirm } = useConfirm()

const canConfigure = computed(() => isAllowed(['qualityEvents:configure']))

// Active-list table config (DataTable). Name renders a color swatch + optional
// description subline and Code renders as a chip via slots; per-row
// Edit/Deactivate come from rowActions (gated — null hides the actions column
// entirely when the user lacks configure permission).
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

const categories = useLiveQuery(
  (db) => db.EventCategory.where().orderBy('displayOrder', 'asc').exec(),
  {
    models: ['EventCategory'],
    initial: [],
  },
)
const deactivated = useLiveQuery(
  async (db) =>
    (await db.EventCategory.where('id', undefined, { force: true }).exec()).filter(
      (d) => d.deletedAt,
    ),
  { models: ['EventCategory'], initial: [] },
)

const showEditDialog = ref(false)
const editing = ref(null)
const formRef = ref(null)
const saveError = ref('')
const form = ref({ code: '', name: '', description: '', color: '#64748b', displayOrder: 1000 })
const saving = ref(false)
const codeDirty = ref(false)
const codeEditable = ref(false)
const showDeactivated = ref(false)

// Reset saveError on dialog open
watch(showEditDialog, (val) => {
  if (val) {
    saveError.value = ''
  }
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
    color: '#64748b',
    displayOrder: (categories.value?.length ?? 0) * 100 + 100,
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
    color: row.color ?? '#64748b',
    displayOrder: row.displayOrder ?? 1000,
  }
  showEditDialog.value = true
}

async function onValidSubmit() {
  saving.value = true
  saveError.value = ''
  try {
    if (editing.value) {
      await patch(`/v1/services/eventCategories/${editing.value.id}`, {
        name: form.value.name.trim(),
        description: form.value.description?.trim() || null,
        color: form.value.color || null,
        displayOrder: form.value.displayOrder,
      })
      toast.success('Category updated')
    } else {
      await post('/v1/services/eventCategories', {
        code: form.value.code.trim().toUpperCase(),
        name: form.value.name.trim(),
        description: form.value.description?.trim() || null,
        color: form.value.color || null,
        displayOrder: form.value.displayOrder,
      })
      toast.success('Category created')
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
      title: 'Deactivate category',
      message: `Deactivate "${row.name}"?`,
      okLabel: 'Deactivate',
      danger: true,
    }))
  )
    return
  try {
    await del(`/v1/services/eventCategories/${row.id}`)
    toast.success('Category deactivated')
  } catch (e) {
    toast.error(e.message || 'Failed to deactivate')
  }
}
async function handleRestore(row) {
  try {
    await post(`/v1/services/eventCategories/${row.id}/restore`, {})
    toast.success('Category restored')
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
      title="Event Categories"
      :level="2"
      size="section-title"
      class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover"
    >
      <template #subtitle>
        The categories used to classify events & observations. Scoped to this company.
      </template>
      <template #actions>
        <BaseButton v-if="canConfigure" variant="primary" size="sm" @click="openAdd">
          <template #icon><IconPlus :size="16" /></template>
          Add Category
        </BaseButton>
      </template>
    </BaseSectionHeader>

    <div
      v-if="!canConfigure"
      class="tw:p-4 tw:bg-amber-50 tw:border-b tw:border-amber-200 tw:text-xs tw:text-amber-800"
    >
      You need the "Configure Events" permission to edit these. You can view the list below.
    </div>

    <div class="tw:p-4">
      <DataTable
        :rows="categories"
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
        exportFilename="event-categories.csv"
        persistKey="lookups:eventCategories"
        noDataLabel="No active categories. Add one above."
      >
        <template #body-cell-name="{ row }">
          <div class="tw:flex tw:items-center tw:gap-2">
            <span
              class="tw:size-3 tw:rounded-full tw:shrink-0"
              :style="{ backgroundColor: row.color || '#cbd5e1' }"
            />
            <span class="tw:font-medium tw:text-on-sidebar">{{ row.name }}</span>
          </div>
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
      :title="editing ? 'Edit Category' : 'Add Category'"
      maxWidth="md"
    >
      <BaseForm ref="formRef" hideFooter @submit="onValidSubmit">
        <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
          <BaseField label="Name" required :value="form.name" :rules="[required()]">
            <template #default="field">
              <BaseTextInput v-bind="field" v-model="form.name" placeholder="e.g. Near Miss" />
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
                  placeholder="NEAR_MISS"
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

          <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
            <BaseField label="Color" :value="form.color">
              <template #default="field">
                <input
                  v-bind="field"
                  v-model="form.color"
                  type="color"
                  class="tw:h-9 tw:w-full tw:rounded tw:border tw:border-divider"
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
