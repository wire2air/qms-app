<script setup>
/**
 * Advanced export manager for the DataTable. Lets the user pick which columns to
 * export (all / a subset, grouped into system + custom fields), the file format,
 * and the row scope (current filtered view vs. all rows). Pure UI — it resolves a
 * selection and emits `confirm({ format, fieldKeys, scope })`; DataTable turns that
 * into the actual export (or hands it to the consumer via `@export`).
 *
 * Decoupled like the rest of dataTable/: no `@/` imports, no network, no xlsx.
 */
import { IconDownload } from '@tabler/icons-vue'

const props = defineProps({
  // Export-field universe: { key, label, group: 'system'|'custom', defaultSelected? }.
  fields: { type: Array, default: () => [] },
  // Formats offered. Single-entry arrays hide the format toggle.
  formats: { type: Array, default: () => ['csv'] },
  // Row counts for the two scope options (for the footer/labels).
  viewCount: { type: Number, default: 0 },
  allCount: { type: Number, default: 0 },
})

const emit = defineEmits(['confirm'])
const open = defineModel({ type: Boolean, default: false })

const FORMAT_LABELS = { csv: 'CSV', xlsx: 'Excel' }

const format = ref('csv')
const scope = ref('view')
const selected = ref(new Set())

const systemFields = computed(() => props.fields.filter((f) => f.group !== 'custom'))
const customFields = computed(() => props.fields.filter((f) => f.group === 'custom'))
const selectedCount = computed(() => selected.value.size)
const scopeCount = computed(() => (scope.value === 'all' ? props.allCount : props.viewCount))

// Re-seed the selection from each field's `defaultSelected` every time the dialog
// opens, so it always reflects the current column set (custom fields can change).
function initSelection() {
  format.value = props.formats[0] || 'csv'
  scope.value = 'view'
  selected.value = new Set(
    props.fields.filter((f) => f.defaultSelected !== false).map((f) => f.key),
  )
}
watch(open, (isOpen) => {
  if (isOpen) initSelection()
})

function isSelected(key) {
  return selected.value.has(key)
}
function toggle(key) {
  const next = new Set(selected.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  selected.value = next
}
function groupAllOn(list) {
  return list.length > 0 && list.every((f) => selected.value.has(f.key))
}
function setGroup(list, on) {
  const next = new Set(selected.value)
  for (const f of list) {
    if (on) next.add(f.key)
    else next.delete(f.key)
  }
  selected.value = next
}

function confirm() {
  if (!selectedCount.value) return
  emit('confirm', {
    format: format.value,
    fieldKeys: [...selected.value],
    scope: scope.value,
  })
  open.value = false
}
</script>

<template>
  <BaseDialog v-model="open" title="Export" subtitle="Choose columns and format" size="lg">
    <div class="tw:flex tw:flex-col tw:gap-5 tw:p-1">
      <!-- Format -->
      <div v-if="formats.length > 1">
        <p class="tw:mb-1.5 tw:text-xs tw:font-semibold tw:tracking-wide tw:text-secondary tw:uppercase">
          Format
        </p>
        <div class="tw:inline-flex tw:rounded-lg tw:border tw:border-divider tw:p-0.5">
          <button
            v-for="f in formats"
            :key="f"
            type="button"
            class="tw:rounded-md tw:px-3 tw:py-1.5 tw:text-sm tw:font-medium tw:transition-colors"
            :class="
              format === f
                ? 'tw:bg-primary tw:text-white'
                : 'tw:text-secondary tw:hover:bg-main-hover tw:hover:text-on-main'
            "
            @click="format = f"
          >
            {{ FORMAT_LABELS[f] || f.toUpperCase() }}
          </button>
        </div>
      </div>

      <!-- Row scope -->
      <div>
        <p class="tw:mb-1.5 tw:text-xs tw:font-semibold tw:tracking-wide tw:text-secondary tw:uppercase">
          Rows
        </p>
        <div class="tw:flex tw:flex-col tw:gap-1.5">
          <label class="tw:flex tw:cursor-pointer tw:items-center tw:gap-2 tw:text-sm tw:text-on-main">
            <input v-model="scope" type="radio" value="view" class="tw:accent-primary" />
            Current view ({{ viewCount }})
          </label>
          <label class="tw:flex tw:cursor-pointer tw:items-center tw:gap-2 tw:text-sm tw:text-on-main">
            <input v-model="scope" type="radio" value="all" class="tw:accent-primary" />
            All rows ({{ allCount }})
          </label>
        </div>
      </div>

      <!-- Columns -->
      <div>
        <p class="tw:mb-1.5 tw:text-xs tw:font-semibold tw:tracking-wide tw:text-secondary tw:uppercase">
          Columns
        </p>

        <div class="tw:max-h-64 tw:overflow-y-auto tw:rounded-lg tw:border tw:border-divider">
          <!-- System fields -->
          <div class="tw:border-b tw:border-divider tw:bg-main tw:px-3 tw:py-2">
            <label class="tw:flex tw:cursor-pointer tw:items-center tw:gap-2 tw:text-sm tw:font-semibold tw:text-on-main">
              <input
                type="checkbox"
                class="tw:size-4 tw:accent-primary"
                :checked="groupAllOn(systemFields)"
                @change="setGroup(systemFields, $event.target.checked)"
              />
              Fields
            </label>
          </div>
          <label
            v-for="f in systemFields"
            :key="f.key"
            class="tw:flex tw:cursor-pointer tw:items-center tw:gap-2 tw:px-3 tw:py-2 tw:text-sm tw:text-on-main tw:transition-colors tw:hover:bg-main-hover"
          >
            <input
              type="checkbox"
              class="tw:size-4 tw:accent-primary"
              :checked="isSelected(f.key)"
              @change="toggle(f.key)"
            />
            {{ f.label }}
          </label>

          <!-- Custom fields -->
          <template v-if="customFields.length">
            <div class="tw:border-y tw:border-divider tw:bg-main tw:px-3 tw:py-2">
              <label class="tw:flex tw:cursor-pointer tw:items-center tw:gap-2 tw:text-sm tw:font-semibold tw:text-on-main">
                <input
                  type="checkbox"
                  class="tw:size-4 tw:accent-primary"
                  :checked="groupAllOn(customFields)"
                  @change="setGroup(customFields, $event.target.checked)"
                />
                Custom fields
              </label>
            </div>
            <label
              v-for="f in customFields"
              :key="f.key"
              class="tw:flex tw:cursor-pointer tw:items-center tw:gap-2 tw:px-3 tw:py-2 tw:text-sm tw:text-on-main tw:transition-colors tw:hover:bg-main-hover"
            >
              <input
                type="checkbox"
                class="tw:size-4 tw:accent-primary"
                :checked="isSelected(f.key)"
                @change="toggle(f.key)"
              />
              {{ f.label }}
            </label>
          </template>
        </div>
      </div>
    </div>

    <template #footer="{ close }">
      <div class="tw:flex tw:items-center tw:justify-between tw:gap-3">
        <span class="tw:text-xs tw:text-secondary">
          {{ selectedCount }} column{{ selectedCount === 1 ? '' : 's' }} · {{ scopeCount }} row{{
            scopeCount === 1 ? '' : 's'
          }}
        </span>
        <div class="tw:flex tw:items-center tw:gap-2">
          <BaseButton variant="secondary" @click="close">Cancel</BaseButton>
          <BaseButton variant="primary" :disabled="!selectedCount" @click="confirm">
            <IconDownload :size="16" class="tw:mr-1" />
            Export
          </BaseButton>
        </div>
      </div>
    </template>
  </BaseDialog>
</template>
