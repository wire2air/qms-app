<script setup>
import {
  IconDownload,
  IconSearch,
  IconX,
  IconColumns,
  IconFilter,
  IconLock,
  IconLockOpen,
} from '@tabler/icons-vue'
import { exportToCSV, exportToExcel } from '@/utils/exportUtils.js'
import { exportRecordPDFs } from '@/utils/exportRecordPDFs.js'
import { exportRecordPDFsHTML } from '@/utils/exportRecordPDFsHTML.js'
import { getProp, setProp } from '@shared/composables/object.js'
import DynamicForm from '@/components/form/DynamicForm.js'
import FormTemplateRecordsAdvancedFilter from './FormTemplateRecordsAdvancedFilter.vue'
import { isAllowed } from '@/utils/currentSession'

const props = defineProps({
  templateId: {
    type: String,
    required: true,
  },
})

const toast = useToast()

const template = useLiveQueryWithDeps(
  [() => props.templateId],
  async (db, [id]) => {
    if (!id) return null
    return db.FormTemplate.findByPk(id)
  },
  { models: ['FormTemplate'] },
)

const templateRecords = useLiveQueryWithDeps(
  [() => props.templateId],
  async (db, [id]) => {
    if (!id) return []
    return db.Record.where('templateId', id).exec()
  },

  { models: ['Record'], initial: [] },
)

const recordsLoading = computed(() => templateRecords.value === undefined)
const schema = computed(() => template.value?.schema || [])
const templateName = computed(() => template.value?.title || '')

// ---- Refs ----
const searchQuery = ref('')
const visibleColumns = ref([])
const editableColumns = ref(new Set())
const advancedFilters = ref([])
const showColumnMenu = ref(false)
const showFilterMenu = ref(false)

// Inline cell editing
const editModel = ref({})
const editingRecord = ref(null)
const editingField = ref(null)
const editSaving = ref(false)
const showEditDialog = ref(false)

const pagination = ref({
  page: 1,
  rowsPerPage: 50,
  sortBy: 'createdAt',
  descending: true,
  total: null,
})

// ---- Helpers ----
function getRawValue(obj, path) {
  if (!obj) return undefined
  const parts = path.split('.')
  let value = obj
  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = value[part]
    } else {
      return undefined
    }
  }
  return value
}

function getMaxRepeaterItems(path) {
  let max = 0
  for (const record of templateRecords.value || []) {
    const value = getRawValue(record.payload, path)
    if (Array.isArray(value)) {
      max = Math.max(max, value.length)
    }
  }
  return max
}

function extractTemplateLeafFields(templateItems) {
  const leaves = []
  function walk(items, path = []) {
    items.forEach((item) => {
      if (item.type === 'separator') return
      if (['section', 'row', 'column'].includes(item.type)) {
        const newPath = item.name ? [...path, item.name] : path
        if (item.children) walk(item.children, newPath)
        return
      }
      if (item.type === 'repeater') return
      if (item.name) {
        const fullPath = [...path, item.name].join('.')
        leaves.push({ name: item.name, path: fullPath, label: item.label || item.name })
      }
    })
  }
  walk(templateItems)
  return leaves
}

// ---- Computed ----
const schemaFields = computed(() => {
  const fields = []

  function extractFields(schemaItems, dataPath) {
    schemaItems.forEach((item) => {
      if (item.type === 'separator') return
      const newDataPath = item.name ? (dataPath ? `${dataPath}.${item.name}` : item.name) : dataPath

      if (['section', 'row', 'column'].includes(item.type)) {
        if (item.children) extractFields(item.children, newDataPath)
        return
      }

      if (item.type === 'repeater' && item.name) {
        fields.push({
          name: newDataPath,
          label: item.label || item.name,
          type: 'repeater',
          schemaItem: { ...item },
          templateFields: extractTemplateLeafFields(item.template || []),
        })
        return
      }

      if (item.name) {
        fields.push({
          name: newDataPath,
          label: item.label || item.name,
          type: item.type,
          schemaItem: { ...item },
        })
      }
    })
  }

  if (schema.value) extractFields(schema.value, '')
  return fields
})

const exportSchemaFields = computed(() => {
  const fields = []

  function extractFields(schemaItems, dataPath, labelParts) {
    schemaItems.forEach((item) => {
      if (item.type === 'separator') return
      const newDataPath = item.name ? (dataPath ? `${dataPath}.${item.name}` : item.name) : dataPath

      if (['section', 'row', 'column'].includes(item.type)) {
        const newLabelParts = item.label ? [...labelParts, item.label] : labelParts
        if (item.children) extractFields(item.children, newDataPath, newLabelParts)
        return
      }

      if (item.type === 'repeater' && item.name) {
        const repeaterLabel = item.label || item.name
        const maxItems = Math.max(getMaxRepeaterItems(newDataPath), item.minItems || 0)
        if (item.template && maxItems > 0) {
          for (let i = 0; i < maxItems; i++) {
            extractFields(item.template, `${newDataPath}.${i}`, [
              ...labelParts,
              `${repeaterLabel} (${i + 1})`,
            ])
          }
        }
        return
      }

      if (item.name) {
        fields.push({
          name: newDataPath,
          label: [...labelParts, item.label || item.name].join(' > '),
          type: item.type,
          schemaItem: { ...item },
        })
      }
    })
  }

  if (schema.value) extractFields(schema.value, '', [])
  return fields
})

const columns = computed(() => {
  const standardColumns = [
    {
      name: 'recordNumber',
      label: 'RECORD #',
      field: 'recordNumber',
      align: 'left',
      sortable: true,
      required: true,
      editable: false,
    },
    {
      name: 'statusId',
      label: 'STATUS',
      field: 'statusId',
      align: 'left',
      sortable: true,
      editable: false,
    },
    {
      name: 'createdAt',
      label: 'SUBMISSION DATE',
      field: 'createdAt',
      align: 'left',
      sortable: true,
      editable: false,
    },
    {
      name: 'createdBy',
      label: 'CREATED BY',
      field: (row) =>
        row.user ? `${row.user.firstName} ${row.user.lastName} \n ${row.user.email}` : '-',
      align: 'left',
      sortable: true,
      editable: false,
    },
    {
      name: 'submissionIp',
      label: 'SUBMISSION IP',
      field: 'submissionIp',
      align: 'left',
      sortable: true,
      editable: false,
    },
  ]

  const schemaColumns = schemaFields.value.map((field) => ({
    name: field.name,
    label: field.label.toUpperCase(),
    field: (row) =>
      field.type === 'repeater'
        ? getRawValue(row.payload, field.name) || []
        : getFieldValue(row.payload, field.name),
    align: 'left',
    sortable: true,
    fieldType: field.type,
    editable: true,
  }))

  return [...standardColumns, ...schemaColumns]
})

const exportColumns = computed(() => {
  const standardColumns = [
    {
      name: 'recordNumber',
      label: 'RECORD #',
      field: 'recordNumber',
      align: 'left',
      sortable: true,
    },
    { name: 'statusId', label: 'STATUS', field: 'statusId', align: 'left', sortable: true },
    {
      name: 'createdAt',
      label: 'SUBMISSION DATE',
      field: 'createdAt',
      align: 'left',
      sortable: true,
    },
    {
      name: 'createdBy',
      label: 'CREATED BY',
      field: (row) =>
        row.user ? `${row.user.firstName} ${row.user.lastName} ${row.user.email}` : '-',
      align: 'left',
      sortable: true,
    },
    {
      name: 'submissionIp',
      label: 'SUBMISSION IP',
      field: 'submissionIp',
      align: 'left',
      sortable: true,
    },
  ]

  const schemaColumns = exportSchemaFields.value.map((field) => ({
    name: field.name,
    label: field.label.toUpperCase(),
    field: (row) => getFieldValue(row.payload, field.name),
    align: 'left',
    sortable: true,
  }))

  return [...standardColumns, ...schemaColumns]
})

const activeColumns = computed(() =>
  columns.value.filter((c) => visibleColumns.value.includes(c.name)),
)

const selectableColumns = computed(() => columns.value.filter((col) => !col.required))

const allColumnsVisible = computed(() => visibleColumns.value.length === columns.value.length)

const filteredRecords = computed(() => {
  let records = templateRecords.value

  if (advancedFilters.value?.length > 0) {
    records = records.filter((record) => {
      return advancedFilters.value.every((filter) => {
        const value = getProp(record, filter.column)
        if (value === null || value === undefined) return false
        const valueStr = String(value).toLowerCase()
        const filterValue = filter.value.toLowerCase()

        switch (filter.operator) {
          case 'includes':
            return valueStr.includes(filterValue)
          case 'equals':
            return valueStr === filterValue
          case 'not-equals':
            return valueStr !== filterValue
          default:
            return true
        }
      })
    })
  }

  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    records = records.filter((record) => JSON.stringify(record).toLowerCase().includes(query))
  }

  return records
})

const canUpdate = computed(() => isAllowed(['records:update']))

// ---- Watchers ----
watch(
  columns,
  (newColumns) => {
    if (visibleColumns.value.length === 0) {
      visibleColumns.value = newColumns.map((col) => col.name)
    }
    if (editableColumns.value.size === 0) {
      editableColumns.value = new Set(
        newColumns.filter((col) => col.editable).map((col) => col.name),
      )
    }
  },
  { immediate: true },
)

// ---- Functions ----
function getFieldValue(payload, fieldPath) {
  if (!payload) return '-'
  const parts = fieldPath.split('.')
  let value = payload
  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = value[part]
    } else {
      return '-'
    }
  }
  if (value === null || value === undefined || value === '') return '-'
  if (Array.isArray(value)) return value?.length > 0 ? `${value.length} items` : '-'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function toggleAllColumns() {
  if (visibleColumns.value.length === columns.value.length) {
    visibleColumns.value = columns.value.filter((col) => col.required).map((col) => col.name)
  } else {
    visibleColumns.value = columns.value.map((col) => col.name)
  }
}

function toggleColumnVisible(colName) {
  const idx = visibleColumns.value.indexOf(colName)
  if (idx >= 0) {
    visibleColumns.value.splice(idx, 1)
  } else {
    visibleColumns.value.push(colName)
  }
}

function toggleColumnEditable(columnName) {
  const column = columns.value.find((col) => col.name === columnName)
  if (!column || !column.editable) return
  if (editableColumns.value.has(columnName)) {
    editableColumns.value.delete(columnName)
  } else {
    editableColumns.value.add(columnName)
  }
  editableColumns.value = new Set(editableColumns.value)
}

function isColumnEditable(columnName) {
  return editableColumns.value.has(columnName)
}

function getEditFieldSchema(field) {
  if (!field) return []
  if (field.type === 'repeater') return [{ ...field.schemaItem, name: 'value' }]
  return [{ ...field.schemaItem, name: 'value', label: field.schemaItem.label }]
}

function openCellEdit(row, colName) {
  if (!canUpdate.value) return
  const field = schemaFields.value.find((f) => f.name === colName)
  if (!field || !isColumnEditable(colName)) return

  editingRecord.value = row
  editingField.value = field
  const currentValue = getProp(row.payload, field.name)
  if (field.type === 'repeater') {
    editModel.value = { value: JSON.parse(JSON.stringify(currentValue || [])) }
  } else {
    editModel.value = { value: currentValue ?? null }
  }
  showEditDialog.value = true
}

function getRepeaterPreview(items, templateFields) {
  if (!Array.isArray(items) || items.length === 0) return { text: '-', moreCount: 0 }

  const firstItem = items[0]
  const maxFieldsToShow = 3

  const allParts = templateFields
    .map((f) => {
      const val = f.path ? getRawValue(firstItem, f.path) : firstItem?.[f.name]
      if (val === null || val === undefined || val === '') return null
      let displayVal = val
      if (Array.isArray(val)) displayVal = `[${val.length} items]`
      else if (typeof val === 'object') displayVal = '[Object]'
      else if (String(val).length > 50) displayVal = String(val).substring(0, 47) + '...'
      return { label: f.label, value: displayVal }
    })
    .filter(Boolean)

  const visibleParts = allParts.slice(0, maxFieldsToShow)
  const hasMoreFields = allParts.length > maxFieldsToShow
  const text = visibleParts.map((p) => `${p.label}: ${p.value}`).join(', ')
  const suffix = hasMoreFields
    ? ` (+${allParts.length - maxFieldsToShow} more field${allParts.length - maxFieldsToShow > 1 ? 's' : ''})`
    : ''

  return { text: text ? text + suffix : '-', moreCount: items.length > 1 ? items.length - 1 : 0 }
}

async function saveEditedCell() {
  const record = editingRecord.value
  const field = editingField.value
  if (!record || !field) {
    showEditDialog.value = false
    return
  }

  const oldValue = getProp(record.payload, field.name)
  const newValue = editModel.value.value

  if (JSON.stringify(oldValue) === JSON.stringify(newValue)) {
    showEditDialog.value = false
    return
  }

  editSaving.value = true
  const newPayload = JSON.parse(JSON.stringify(record.payload))
  setProp(newPayload, field.name, newValue, true)

  try {
    record.payload = newPayload
    await record.save()
    toast.success('Record updated')
  } catch {
    toast.error('Failed to update record')
  }

  editSaving.value = false
  showEditDialog.value = false
}

async function handleExport(format) {
  if (!templateRecords.value || templateRecords.value.length === 0) {
    toast.warning('No data to export')
    return
  }

  try {
    const filename = `${templateName.value}_records_${new Date().toISOString().split('T')[0]}`

    if (format === 'csv') {
      exportToCSV(templateRecords.value, exportColumns.value, filename)
    } else if (format === 'excel') {
      await exportToExcel(templateRecords.value, exportColumns.value, filename, 'Records')
    } else if (format === 'pdf') {
      await exportRecordPDFs(templateRecords.value, schema.value, templateName.value)
    } else if (format === 'pdf-html') {
      await exportRecordPDFsHTML(templateRecords.value, schema.value, templateName.value)
    }

    toast.success(`Exported to ${format.toUpperCase()} successfully`)
  } catch (error) {
    console.error('Export failed:', error)
    let errorMessage = `Failed to export to ${format.toUpperCase()}`
    if (error.message.includes('Cannot find module')) {
      errorMessage = `${format.toUpperCase()} export requires additional libraries. Please contact administrator.`
    }
    toast.error(errorMessage)
  }
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:h-full tw:p-6">
    <SafeTeleport to="#main-header-actions">
      <div class="tw:flex tw:gap-1">
        <BaseButton variant="outline" size="sm" @click="handleExport('csv')">
          <IconDownload :size="14" class="tw:mr-1" /> CSV
        </BaseButton>
        <BaseButton variant="outline" size="sm" @click="handleExport('excel')">
          <IconDownload :size="14" class="tw:mr-1" /> Excel
        </BaseButton>
        <BaseButton variant="outline" size="sm" @click="handleExport('pdf')">
          <IconDownload :size="14" class="tw:mr-1" /> PDF
        </BaseButton>
      </div>
    </SafeTeleport>

    <!-- Toolbar -->
    <div
      v-if="!recordsLoading && templateRecords.length > 0"
      class="tw:flex tw:justify-between tw:items-center tw:mb-4 tw:gap-4"
    >
      <div class="tw:flex tw:items-center tw:gap-2">
        <div class="tw:relative tw:w-64">
          <IconSearch
            :size="16"
            class="tw:absolute tw:left-2 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary"
          />
          <BaseTextInput v-model="searchQuery" placeholder="Search records..." class="tw:pl-8" />
          <button
            v-if="searchQuery"
            class="tw:absolute tw:right-2 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary tw:hover:text-on-main"
            @click="searchQuery = ''"
          >
            <IconX :size="14" />
          </button>
        </div>
        <div class="tw:text-sm tw:text-secondary">
          {{ filteredRecords.length }} / {{ templateRecords.length }} record{{
            templateRecords.length !== 1 ? 's' : ''
          }}
        </div>
      </div>
      <div class="tw:flex tw:gap-2">
        <!-- Column Visibility -->
        <div class="tw:relative">
          <button
            class="tw:p-2 tw:rounded tw:text-primary tw:hover:bg-main-hover"
            title="Show/Hide Columns"
            @click="showColumnMenu = !showColumnMenu"
          >
            <IconColumns :size="18" />
          </button>
          <div
            v-if="showColumnMenu"
            class="tw:absolute tw:right-0 tw:top-full tw:z-modal tw:bg-main tw:border tw:border-divider tw:rounded-lg tw:shadow-lg tw:min-w-64 tw:max-w-96 tw:max-h-80 tw:overflow-y-auto"
          >
            <div
              class="tw:flex tw:justify-between tw:items-center tw:p-3 tw:border-b tw:border-divider"
            >
              <BaseText as="h4" variant="body" weight="semibold">Show/Hide Columns</BaseText>
              <button
                class="tw:text-xs tw:text-primary tw:hover:underline"
                @click="toggleAllColumns"
              >
                {{ allColumnsVisible ? 'Hide All' : 'Show All' }}
              </button>
            </div>
            <div class="tw:p-2">
              <div
                v-for="column in selectableColumns"
                :key="column.name"
                class="tw:flex tw:items-center tw:justify-between tw:px-2 tw:py-1.5 tw:rounded tw:hover:bg-main-hover"
              >
                <div class="tw:flex tw:items-center tw:gap-2">
                  <BaseCheckbox
                    :modelValue="visibleColumns.includes(column.name)"
                    @update:modelValue="toggleColumnVisible(column.name)"
                  />
                  <span class="tw:text-sm tw:text-on-main">{{ column.label }}</span>
                </div>
                <button
                  v-if="column.editable"
                  class="tw:p-1 tw:rounded tw:hover:bg-main-hover"
                  :class="isColumnEditable(column.name) ? 'tw:text-green-600' : 'tw:text-secondary'"
                  :title="isColumnEditable(column.name) ? 'Lock column' : 'Unlock column'"
                  @click.stop="toggleColumnEditable(column.name)"
                >
                  <IconLockOpen v-if="isColumnEditable(column.name)" :size="14" />
                  <IconLock v-else :size="14" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Advanced Filter -->
        <div class="tw:relative">
          <button
            class="tw:p-2 tw:rounded tw:text-primary tw:hover:bg-main-hover tw:relative"
            title="Advanced Filters"
            @click="showFilterMenu = !showFilterMenu"
          >
            <IconFilter :size="18" />
            <span
              v-if="advancedFilters.length > 0"
              class="tw:absolute tw:-top-1 tw:-right-1 tw:size-4 tw:rounded-full tw:bg-primary tw:text-white tw:text-micro tw:flex tw:items-center tw:justify-center"
            >
              {{ advancedFilters.length }}
            </span>
          </button>
          <div
            v-if="showFilterMenu"
            class="tw:absolute tw:right-0 tw:top-full tw:z-modal tw:bg-main tw:border tw:border-divider tw:rounded-lg tw:shadow-lg"
          >
            <FormTemplateRecordsAdvancedFilter v-model="advancedFilters" :columns="columns" />
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <BaseEmptyState
      v-if="!recordsLoading && templateRecords.length === 0"
      title="No Records Found"
      description="No records have been created using this template yet."
    />

    <!-- Table -->
    <BaseTable
      v-else
      v-model:pagination="pagination"
      :columns="activeColumns"
      :rows="filteredRecords"
      :loading="recordsLoading"
      class="tw:flex-1"
    >
      <template #body-cell-statusId="{ row }">
        <span class="tw:text-xs tw:bg-gray-100 tw:text-gray-700 tw:px-2 tw:py-0.5 tw:rounded">
          {{ row.statusId }}
        </span>
      </template>

      <template #body-cell-createdAt="{ row }">
        {{ row.createdAt?.formatDate('date') }}
      </template>

      <template #body-cell-createdBy="{ row }">
        <div v-if="row.user" class="tw:flex tw:flex-col">
          <span class="tw:font-medium">{{ row.user.firstName }} {{ row.user.lastName }}</span>
          <span class="tw:text-xs tw:text-secondary">{{ row.user.email }}</span>
        </div>
        <span v-else class="tw:text-secondary">-</span>
      </template>

      <template #body-cell="{ row, column }">
        <template v-if="column.fieldType === 'repeater'">
          <BaseClickableRow
            v-for="(preview, idx) in [
              getRepeaterPreview(
                getRawValue(row.payload, column.name) || [],
                schemaFields.find((f) => f.name === column.name)?.templateFields || [],
              ),
            ]"
            :key="idx"
            :disabled="!isColumnEditable(column.name)"
            class="tw:max-w-80"
            :aria-label="`Edit ${column.label}`"
            @click="openCellEdit(row, column.name)"
          >
            <template v-if="preview.text !== '-'">
              <span
                class="tw:text-sm tw:whitespace-nowrap tw:text-ellipsis tw:overflow-hidden tw:block"
                >{{ preview.text }}</span
              >
              <span v-if="preview.moreCount > 0" class="tw:text-xs tw:text-secondary tw:ml-1"
                >+{{ preview.moreCount }} more</span
              >
            </template>
            <span v-else class="tw:text-secondary">-</span>
          </BaseClickableRow>
        </template>
        <template
          v-else-if="
            schemaFields.find((f) => f.name === column.name) && isColumnEditable(column.name)
          "
        >
          <BaseClickableRow
            class="tw:max-w-60 tw:overflow-hidden tw:whitespace-nowrap tw:text-ellipsis"
            :aria-label="`Edit ${column.label}`"
            @click="openCellEdit(row, column.name)"
          >
            {{ getFieldValue(row.payload, column.name) }}
          </BaseClickableRow>
        </template>
        <template v-else-if="schemaFields.find((f) => f.name === column.name)">
          <div class="tw:max-w-60 tw:overflow-hidden tw:whitespace-nowrap tw:text-ellipsis">
            {{ getFieldValue(row.payload, column.name) }}
          </div>
        </template>
        <template v-else>
          {{ typeof column.field === 'function' ? column.field(row) : row[column.field] }}
        </template>
      </template>
    </BaseTable>

    <!-- Inline Edit Dialog -->
    <BaseDialog v-model="showEditDialog" maxWidth="lg">
      <div class="tw:flex tw:justify-between tw:items-center tw:mb-4">
        <h3 class="tw:text-lg tw:font-bold tw:text-on-main">
          Edit: {{ editingField?.label || '' }}
        </h3>
        <button
          class="tw:p-1 tw:rounded tw:text-secondary tw:hover:bg-main-hover"
          @click="showEditDialog = false"
        >
          <IconX :size="20" />
        </button>
      </div>
      <div class="tw:min-w-80">
        <DynamicForm
          v-model="editModel"
          :fields="getEditFieldSchema(editingField)"
          :loading="editSaving"
          :readonly="!canUpdate"
        />
      </div>
      <div class="tw:flex tw:justify-end tw:gap-3 tw:mt-4">
        <BaseButton variant="outline" @click="showEditDialog = false">Cancel</BaseButton>
        <BaseButton :disabled="editSaving" @click="saveEditedCell">Save</BaseButton>
      </div>
    </BaseDialog>
  </div>
</template>
