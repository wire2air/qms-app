<script setup>
import { IconUpload, IconFileText, IconX } from '@tabler/icons-vue'
import { useToast } from '@shared/composables/useToast.js'

const props = defineProps({
  columns: {
    type: Array,
    default: () => [],
  },
})

const open = defineModel({
  type: Boolean,
  default: false,
})

const toast = useToast()

const families = useLiveQuery(async (db) => db.ProductFamily.where().exec(), {
  models: ['ProductFamily'],
  initial: [],
})
const familyByName = computed(
  () => new Map(families.value.map((f) => [f.name.toLowerCase(), f.id])),
)

const fileInputRef = ref(null)
const selectedFile = ref(null)
const parsedRows = ref([])
const parseError = ref('')
const isImporting = ref(false)

// ── CSV parser ────────────────────────────────────────────────────────────────

// Build label→field map from the columns prop (excludes columns with no label or field='actions')
const headerMap = computed(() => {
  const map = {}
  for (const col of props.columns) {
    if (col.label && col.field && col.field !== 'actions') {
      map[col.label.toLowerCase().trim()] = col.field
    }
  }
  return map
})

function splitCsvRow(line) {
  const cells = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current.trim())
  return cells
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return []

  const rawHeaders = splitCsvRow(lines[0]).map((h) => h.toLowerCase().trim())
  const fieldKeys = rawHeaders.map((h) => headerMap.value[h] ?? null)

  return lines.slice(1).map((line) => {
    const cells = splitCsvRow(line)
    const row = {}
    fieldKeys.forEach((key, i) => {
      if (key) row[key] = cells[i] ?? ''
    })
    return row
  })
}

// ── File selection ────────────────────────────────────────────────────────────

function openFilePicker() {
  fileInputRef.value?.click()
}

function onFileChange(event) {
  const file = event.target.files?.[0]
  if (!file) return

  selectedFile.value = file
  parsedRows.value = []
  parseError.value = ''

  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      parsedRows.value = parseCsv(e.target.result)
      if (parsedRows.value.length === 0) {
        parseError.value = 'No data rows found in the file.'
      }
    } catch {
      parseError.value = 'Failed to parse the CSV file.'
    }
  }
  reader.onerror = () => {
    parseError.value = 'Failed to read the file.'
  }
  reader.readAsText(file)

  // Reset input so the same file can be re-selected
  event.target.value = ''
}

function clearFile() {
  selectedFile.value = null
  parsedRows.value = []
  parseError.value = ''
}

// ── Import ────────────────────────────────────────────────────────────────────

const createProduct = useLiveMutation(async (db, data) => {
  const p = db.Product.create(data)
  await p.save()
  return p
})

async function handleImport() {
  if (!parsedRows.value.length || isImporting.value) return

  isImporting.value = true
  try {
    const resolvedRows = parsedRows.value.map((row) => {
      const r = { ...row }
      if (r.productFamilyId) {
        r.productFamilyId = familyByName.value.get(r.productFamilyId.toLowerCase()) ?? null
      }
      return r
    })
    const results = await Promise.allSettled(resolvedRows.map((row) => createProduct(row)))

    const fulfilled = results.filter((r) => r.status === 'fulfilled').length
    const rejected = results.filter((r) => r.status === 'rejected').length

    if (fulfilled > 0)
      toast.success(`${fulfilled} product${fulfilled === 1 ? '' : 's'} imported successfully`)
    if (rejected > 0)
      toast.error(`${rejected} product${rejected === 1 ? '' : 's'} failed to import`)

    open.value = false
  } finally {
    isImporting.value = false
  }
}

// ── Reset on close ────────────────────────────────────────────────────────────

watch(open, (val) => {
  if (!val) {
    selectedFile.value = null
    parsedRows.value = []
    parseError.value = ''
    isImporting.value = false
  }
})

// ── Preview (first 5 rows) ────────────────────────────────────────────────────

const previewRows = computed(() => parsedRows.value.slice(0, 5))
</script>

<template>
  <BaseDialog v-model="open" title="Import Products from CSV" maxWidth="lg">
    <div class="tw:flex tw:flex-col tw:gap-5">
      <!-- Drop zone / file picker -->
      <div
        class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-3 tw:rounded-xl tw:border-2 tw:border-dashed tw:border-divider tw:px-6 tw:py-10 tw:cursor-pointer tw:transition-colors tw:hover:border-primary tw:hover:bg-primary/5"
        @click="openFilePicker"
      >
        <div
          class="tw:w-12 tw:h-12 tw:rounded-full tw:bg-primary/10 tw:flex tw:items-center tw:justify-center"
        >
          <IconUpload class="tw:size-6 tw:text-primary" />
        </div>
        <div class="tw:text-center">
          <p class="tw:text-sm tw:font-medium tw:text-on-main">Click to select a CSV file</p>
          <p class="tw:text-xs tw:text-secondary tw:mt-1">
            File must match the exported format: NAME, SKU, FAMILY, PRODUCT TYPE, STATUS. Family column matches by name.
          </p>
        </div>
        <input
          ref="fileInputRef"
          type="file"
          accept=".csv"
          class="tw:hidden"
          @change="onFileChange"
        />
      </div>

      <!-- Selected file indicator -->
      <div
        v-if="selectedFile"
        class="tw:flex tw:items-center tw:gap-3 tw:rounded-lg tw:border tw:border-divider tw:bg-main tw:px-4 tw:py-3"
      >
        <IconFileText class="tw:size-5 tw:text-secondary tw:shrink-0" />
        <span class="tw:text-sm tw:text-on-main tw:flex-1 tw:truncate">{{
          selectedFile.name
        }}</span>
        <button
          class="tw:p-1 tw:rounded tw:text-secondary tw:hover:bg-main-hover tw:transition-colors"
          @click.stop="clearFile"
        >
          <IconX :size="16" />
        </button>
      </div>

      <!-- Parse error -->
      <p v-if="parseError" class="tw:text-sm tw:text-red-500">{{ parseError }}</p>

      <!-- Row count + preview table -->
      <template v-if="parsedRows.length > 0">
        <p class="tw:text-sm tw:text-secondary">
          <span class="tw:font-semibold tw:text-on-main">{{ parsedRows.length }}</span>
          row{{ parsedRows.length === 1 ? '' : 's' }} detected
          <span v-if="parsedRows.length > 5" class="tw:text-xs"> — showing first 5</span>
        </p>

        <div class="tw:overflow-x-auto tw:rounded-lg tw:border tw:border-divider">
          <table class="tw:w-full tw:text-sm">
            <thead>
              <tr class="tw:bg-main tw:border-b tw:border-divider">
                <th
                  class="tw:px-3 tw:py-2 tw:text-left tw:font-semibold tw:text-secondary tw:text-caption tw:uppercase tw:tracking-wider"
                >
                  Name
                </th>
                <th
                  class="tw:px-3 tw:py-2 tw:text-left tw:font-semibold tw:text-secondary tw:text-caption tw:uppercase tw:tracking-wider"
                >
                  SKU
                </th>
                <th
                  class="tw:px-3 tw:py-2 tw:text-left tw:font-semibold tw:text-secondary tw:text-caption tw:uppercase tw:tracking-wider"
                >
                  Family
                </th>
                <th
                  class="tw:px-3 tw:py-2 tw:text-left tw:font-semibold tw:text-secondary tw:text-caption tw:uppercase tw:tracking-wider"
                >
                  Product Type
                </th>
                <th
                  class="tw:px-3 tw:py-2 tw:text-left tw:font-semibold tw:text-secondary tw:text-caption tw:uppercase tw:tracking-wider"
                >
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, i) in previewRows"
                :key="i"
                class="tw:border-b tw:border-divider tw:last:border-0"
              >
                <td class="tw:px-3 tw:py-2 tw:text-on-main">{{ row.name || '—' }}</td>
                <td class="tw:px-3 tw:py-2 tw:text-secondary tw:text-xs">
                  {{ row.sku || '—' }}
                </td>
                <td class="tw:px-3 tw:py-2 tw:text-secondary">{{ row.productFamilyId || '—' }}</td>
                <td class="tw:px-3 tw:py-2 tw:text-secondary">{{ row.productTypeId || '—' }}</td>
                <td class="tw:px-3 tw:py-2 tw:text-secondary">{{ row.statusId || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>

    <template #footer="{ close }">
      <BaseDialogFooter
        :submitLabel="`Import ${parsedRows.length > 0 ? `${parsedRows.length} Products` : 'Products'}`"
        :loading="isImporting"
        :disabled="!parsedRows.length || isImporting"
        @cancel="close"
        @submit="handleImport"
      />
    </template>
  </BaseDialog>
</template>
