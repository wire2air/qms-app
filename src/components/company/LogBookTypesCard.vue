<script setup>
/**
 * Admin card: Log Book Types — the taxonomy log books are classified by,
 * each carrying the record-id PREFIX that `{TYPECODE}` resolves to when a
 * new log book's code is minted (e.g. CAL → CAL-LOG-PROD → records
 * CAL-LOG-PROD-0001). Empty prefix falls back to the type's code.
 *
 * A standard per-tenant lookup: every row belongs to this company (the 9
 * defaults are seeded at onboarding) and is editable here. Writes go
 * through REST (routes/logBookTypes.js), gated by owner OR
 * `log_books:manage_types`. Existing log books keep the code stamped at
 * their creation; a prefix change applies to books created afterwards.
 */
import { IconPlus, IconPencil } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { post, patch } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { required } from '@shared/components/form/validators.js'

const toast = useToast()

const canManage = computed(() => isAllowed(['log_books:manage_types']))

const columns = [
  { name: 'name', label: 'NAME', field: 'name', align: 'left' },
  { name: 'code', label: 'CODE', field: 'code', align: 'left' },
  { name: 'prefix', label: 'PREFIX', field: 'prefix', align: 'left' },
  { name: 'sequence', label: 'ORDER', field: 'sequence', align: 'center' },
]

const types = useLiveQuery(
  async (db) => {
    const rows = await db.LogBookType.where().exec()
    return rows.sort(
      (a, b) => (a.sequence ?? 100) - (b.sequence ?? 100) || a.name.localeCompare(b.name),
    )
  },
  { models: ['LogBookType'], initial: [] },
)

const rowActions = computed(() =>
  canManage.value
    ? [{ key: 'edit', label: 'Edit', icon: IconPencil, onClick: (row) => openEdit(row) }]
    : null,
)

const showEditDialog = ref(false)
const editing = ref(null)
const formRef = ref(null)
const saveError = ref('')
const saving = ref(false)
const codeDirty = ref(false)
const form = ref({ code: '', name: '', prefix: '', description: '', sequence: 1000 })

watch(showEditDialog, (open) => {
  if (open) saveError.value = ''
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

// Mirror the server's charset rules inline so a bad value fails in the field,
// not as a round-trip 400 in the dialog footer. Both inputs uppercase as the
// user types, so what the field shows is what gets stored.
const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{0,99}$/
const PREFIX_RE = /^[A-Z0-9][A-Z0-9-]{0,19}$/
function codeRule(v) {
  if (!v) return true // `required` covers empty
  if (!CODE_RE.test(v)) return 'Letters, digits, _ or - (max 100), starting with a letter or digit'
  const clash = types.value.some(
    (t) => t.code?.toLowerCase() === v.trim().toLowerCase() && t.id !== editing.value?.id,
  )
  return clash ? `"${v}" is already used by another type` : true
}
function prefixRule(v) {
  if (!v) return true // optional — falls back to the code
  return PREFIX_RE.test(v) ? true : 'Letters, digits or - (max 20), starting with a letter or digit'
}
function onCodeInput() {
  codeDirty.value = true
  form.value.code = form.value.code.toUpperCase()
}
function onPrefixInput() {
  form.value.prefix = form.value.prefix.toUpperCase()
}

function openAdd() {
  editing.value = null
  codeDirty.value = false
  form.value = {
    code: '',
    name: '',
    prefix: '',
    description: '',
    sequence: ((types.value?.length ?? 0) + 1) * 100,
  }
  showEditDialog.value = true
}

function openEdit(row) {
  editing.value = row
  codeDirty.value = true
  form.value = {
    code: row.code,
    name: row.name,
    prefix: row.prefix ?? '',
    description: row.description ?? '',
    sequence: row.sequence ?? 1000,
  }
  showEditDialog.value = true
}

async function onValidSubmit() {
  saving.value = true
  saveError.value = ''
  try {
    const payload = {
      name: form.value.name.trim(),
      prefix: form.value.prefix.trim() || null,
      description: form.value.description?.trim() || null,
      sequence: Number.isFinite(Number(form.value.sequence)) && form.value.sequence !== ''
        ? Number(form.value.sequence)
        : 1000,
    }
    if (editing.value) {
      await patch(`/v1/services/logBookTypes/${editing.value.id}`, payload)
      toast.success('Log book type updated')
    } else {
      await post('/v1/services/logBookTypes', { code: form.value.code.trim(), ...payload })
      toast.success('Log book type created')
    }
    showEditDialog.value = false
  } catch (e) {
    saveError.value = e.message || 'Failed to save'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div
    class="tw:rounded-xl tw:border tw:border-divider tw:shadow-sm tw:overflow-hidden tw:bg-sidebar"
  >
    <BaseSectionHeader
      title="Log Book Types"
      :level="2"
      size="section-title"
      class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover"
    >
      <template #subtitle>
        Log book categories and the record-ID prefix each one mints — creating a log book resolves
        {TYPECODE} in its Record Id Prefix to the type's prefix. Scoped to this company.
      </template>
      <template #actions>
        <BaseButton v-if="canManage" variant="primary" size="sm" @click="openAdd">
          <template #icon><IconPlus :size="16" /></template>
          Add Type
        </BaseButton>
      </template>
    </BaseSectionHeader>

    <div
      v-if="!canManage"
      class="tw:p-4 tw:bg-amber-50 tw:border-b tw:border-amber-200 tw:text-xs tw:text-amber-800"
    >
      You need the "Manage log book types" permission to edit these. You can view the list below.
    </div>

    <div class="tw:p-4">
      <DataTable
        :rows="types"
        :columns="columns"
        :rowActions="rowActions"
        rowKey="id"
        :mobileCards="false"
        hidePagination
        searchable
        densitySelector
        exportManager
        exportFilename="log-book-types.csv"
        persistKey="lookups:logBookTypes"
        noDataLabel="No log book types. Add one above."
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
        <template #body-cell-prefix="{ row }">
          <code
            class="tw:text-xs tw:px-2 tw:py-0.5 tw:rounded tw:bg-primary/10 tw:text-primary tw:font-semibold"
          >
            {{ row.prefix || row.code }}
          </code>
          <span v-if="!row.prefix" class="tw:text-micro tw:text-secondary tw:ml-1">(code)</span>
        </template>
      </DataTable>
    </div>

    <BaseDialog
      v-model="showEditDialog"
      :title="editing ? 'Edit Log Book Type' : 'Add Log Book Type'"
      maxWidth="md"
    >
      <BaseForm ref="formRef" hideFooter @submit="onValidSubmit">
        <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
          <BaseField label="Name" required :value="form.name" :rules="[required()]">
            <template #default="field">
              <BaseTextInput v-bind="field" v-model="form.name" placeholder="e.g. Temperature Log" />
            </template>
          </BaseField>

          <BaseField
            v-if="!editing"
            label="Code"
            required
            :value="form.code"
            :rules="[required(), codeRule]"
          >
            <template #default="field">
              <BaseTextInput
                v-bind="field"
                v-model="form.code"
                placeholder="TEMPERATURE_LOG"
                @input="onCodeInput"
              />
            </template>
          </BaseField>
          <p v-if="!editing" class="tw:text-caption tw:text-secondary tw:-mt-2">
            Stable key, unique in this company. Cannot be changed later.
          </p>

          <BaseField label="Record ID Prefix" :value="form.prefix" :rules="[prefixRule]">
            <template #default="field">
              <BaseTextInput
                v-bind="field"
                v-model="form.prefix"
                placeholder="e.g. TEMP"
                @input="onPrefixInput"
              />
            </template>
          </BaseField>
          <p class="tw:text-caption tw:text-secondary tw:-mt-2">
            What {TYPECODE} resolves to in new log book IDs (e.g. TEMP → TEMP-LOG-PROD). Leave
            empty to use the code. Applies to log books created after the change.
          </p>

          <BaseField label="Description" :value="form.description">
            <template #default="field">
              <BaseTextarea v-bind="field" v-model="form.description" :rows="2" />
            </template>
          </BaseField>

          <BaseField label="Display Order" :value="form.sequence">
            <template #default="field">
              <BaseTextInput v-bind="field" v-model.number="form.sequence" type="number" :min="0" />
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
