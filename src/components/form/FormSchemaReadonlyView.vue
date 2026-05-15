<script setup>
import { IconStarFilled, IconStar } from '@tabler/icons-vue'
import { DateTime } from 'luxon'
import { getFormComponent } from './formComponentRegistry.js'

const props = defineProps({
  fields: { type: Array, required: true },
  values: { type: Object, default: () => ({}) },
})

// ─── Option set resolution ────────────────────────────────────────────────────
const optionSetIds = computed(() => {
  const ids = new Set()
  function collect(fields) {
    for (const f of fields) {
      if (f.optionSetId) ids.add(f.optionSetId)
      if (f.children) collect(f.children)
      if (f.template) collect(f.template)
    }
  }
  collect(props.fields)
  return [...ids]
})

const optionSets = useLiveQueryWithDeps(
  [() => optionSetIds.value.join(',')],
  async (db, [idsStr]) => {
    if (!idsStr) return {}
    const ids = idsStr.split(',')
    const results = await Promise.all(ids.map((id) => db.OptionSet.findByPk(id)))
    const map = {}
    for (const os of results) {
      if (os) map[os.id] = os
    }
    return map
  },
  { initial: {} },
)

// ─── Value resolution helpers ─────────────────────────────────────────────────
function getFieldValue(field) {
  if (!field.name) return null
  return props.values?.[field.name] ?? null
}

function resolveOptionLabel(field, val) {
  if (val == null) return '—'

  // Check optionSet first
  if (field.optionSetId && optionSets.value[field.optionSetId]) {
    const options = optionSets.value[field.optionSetId].options || []
    for (const opt of options) {
      if (typeof opt === 'string' && opt === val) return opt
      if (opt.value === val || opt.id === val) return opt.label || opt.name || String(val)
    }
  }

  // Check inline options
  if (field.options) {
    for (const opt of field.options) {
      if (typeof opt === 'string' && opt === val) return opt
      if (opt.value === val || opt.id === val) return opt.label || opt.name || String(val)
    }
  }

  return String(val)
}

function formatDisplayValue(field, rawVal) {
  if (rawVal == null || rawVal === '') return '—'

  switch (field.type) {
    case 'input':
    case 'password':
    case 'textarea':
    case 'number':
    case 'slider':
      return String(rawVal)

    case 'textEditor':
      return rawVal // will be rendered with v-html

    case 'select':
    case 'radio':
    case 'optionGroup':
      if (Array.isArray(rawVal)) {
        return rawVal.map((v) => resolveOptionLabel(field, v)).join(', ') || '—'
      }
      return resolveOptionLabel(field, rawVal)

    case 'checkbox':
    case 'toggle':
      return rawVal ? 'Yes' : 'No'

    case 'datetime': {
      if (!rawVal) return '—'
      const mode = field.mode || 'datetime'
      if (mode === 'time' && typeof rawVal === 'number') {
        const hrs = Math.floor(rawVal / 60)
        const mins = rawVal % 60
        return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
      }
      const dt = DateTime.fromISO(rawVal)
      if (dt.isValid) {
        if (mode === 'date') return dt.toLocaleString(DateTime.DATE_MED)
        return dt.toLocaleString(DateTime.DATETIME_MED)
      }
      return String(rawVal)
    }

    case 'rating':
      return rawVal // handled specially in template

    default:
      if (typeof rawVal === 'object') return JSON.stringify(rawVal)
      return String(rawVal)
  }
}

function isHtmlField(field) {
  return field.type === 'textEditor' || field.type === 'textarea'
}

function isRatingField(field) {
  return field.type === 'rating'
}

function isFileField(field) {
  return field.type === 'file'
}

function isPhotoField(field) {
  return field.type === 'photo'
}

function isChecklistField(field) {
  return field.type === 'checklist'
}

function isSeparatorField(field) {
  return field.type === 'separator'
}

function isColorPickerField(field) {
  return field.type === 'colorPicker'
}

function isSectionField(field) {
  return field.type === 'section'
}

function isRepeaterField(field) {
  return field.type === 'repeater'
}

function isLayoutContainer(field) {
  return field.type === 'row' || field.type === 'column'
}

// Layout containers with a name scope their children's values under that name
// (mirrors DynamicForm.js's path traversal). Without a name, children read from
// the parent values flat.
function getContainerValues(field) {
  if (!field.name) return props.values
  return props.values?.[field.name] || {}
}

function isCustomField(field) {
  const reg = getFormComponent(field.type)
  return !!reg?.readonlyComponent
}

function isRenderableField(field) {
  return (
    field.name &&
    !isSectionField(field) &&
    !isRepeaterField(field) &&
    !isLayoutContainer(field) &&
    !isCustomField(field) &&
    !isChecklistField(field) &&
    !isPhotoField(field) &&
    !isSeparatorField(field) &&
    !isColorPickerField(field)
  )
}

function getVisibleFields(fields) {
  const result = []
  for (const field of fields) {
    if (isSectionField(field)) {
      if (field.children?.length) {
        result.push(field)
      }
    } else if (isRepeaterField(field)) {
      result.push(field)
    } else if (isLayoutContainer(field)) {
      if (field.children?.length) result.push(field)
    } else if (isSeparatorField(field)) {
      result.push(field)
    } else if (field.name) {
      result.push(field)
    }
  }
  return result
}

function getPhotoUrl(field) {
  const val = getFieldValue(field)
  if (!val) return null
  if (typeof val === 'string') return val
  return val?.url || val?.thumbnailUrl || null
}

function getChecklistColumns(field) {
  if (!Array.isArray(field.columns)) return []
  return field.columns
}

function getChecklistRowValue(field, rowIndex) {
  const val = getFieldValue(field)
  if (!Array.isArray(val)) return null
  const entry = val[rowIndex]
  if (entry == null) return null
  return Array.isArray(entry) ? entry : [entry]
}

function getChecklistRowLabel(row) {
  if (typeof row === 'string') return row
  return row?.label || row?.value || ''
}

function getChecklistColumnLabel(col) {
  return col?.label || col?.value || ''
}
</script>

<template>
  <div class="tw:grid tw:grid-cols-3 tw:gap-3">
    <template v-for="field in getVisibleFields(fields)" :key="field.name || field.label">
      <!-- Section with children (full-width) -->
      <template v-if="isSectionField(field)">
        <div class="tw:col-span-3">
          <div
            v-if="field.label"
            class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:mt-1 tw:mb-2"
          >
            {{ field.label }}
          </div>
          <FormSchemaReadonlyView
            :fields="field.children"
            :values="getContainerValues(field)"
          />
        </div>
      </template>

      <!-- Layout container (row / column) — recurse into children with scoped values -->
      <template v-else-if="isLayoutContainer(field)">
        <div class="tw:col-span-3">
          <FormSchemaReadonlyView
            :fields="field.children || []"
            :values="getContainerValues(field)"
          />
        </div>
      </template>

      <!-- Repeater (full-width) -->
      <template v-else-if="isRepeaterField(field)">
        <div class="tw:col-span-3">
          <div
            v-if="field.label"
            class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:mt-1 tw:mb-2"
          >
            {{ field.label }}
          </div>
          <template v-if="Array.isArray(getFieldValue(field)) && getFieldValue(field).length">
            <div
              v-for="(item, idx) in getFieldValue(field)"
              :key="idx"
              class="tw:border tw:border-divider tw:rounded-md tw:p-3 tw:mb-2"
            >
              <div class="tw:text-[11px] tw:text-secondary tw:font-medium tw:mb-2">
                #{{ idx + 1 }}
              </div>
              <FormSchemaReadonlyView :fields="field.template || []" :values="item || {}" />
            </div>
          </template>
          <span v-else class="tw:text-sm tw:text-secondary">—</span>
        </div>
      </template>

      <!-- Rating field (full-width) -->
      <div v-else-if="isRatingField(field)" class="tw:col-span-3 tw:flex tw:flex-col tw:gap-0.5">
        <div class="tw:text-[11px] tw:text-secondary tw:font-medium">{{ field.label }}</div>
        <div class="tw:flex tw:gap-0.5">
          <component
            :is="i <= (getFieldValue(field) || 0) ? IconStarFilled : IconStar"
            v-for="i in field.max || 5"
            :key="i"
            :size="16"
            :class="i <= (getFieldValue(field) || 0) ? 'tw:text-amber-400' : 'tw:text-gray-300'"
          />
        </div>
      </div>

      <!-- HTML / textEditor field (full-width) -->
      <div v-else-if="isHtmlField(field)" class="tw:col-span-3 tw:flex tw:flex-col tw:gap-0.5">
        <div class="tw:text-[11px] tw:text-secondary tw:font-medium">{{ field.label }}</div>
        <div
          v-if="getFieldValue(field)"
          class="tw:text-sm tw:text-on-main tw:leading-relaxed"
          v-html="getFieldValue(field)"
        />
        <span v-else class="tw:text-sm tw:text-secondary">—</span>
      </div>

      <!-- Textarea field (full-width) -->
      <div
        v-else-if="field.type === 'textarea'"
        class="tw:col-span-3 tw:flex tw:flex-col tw:gap-0.5"
      >
        <div class="tw:text-[11px] tw:text-secondary tw:font-medium">{{ field.label }}</div>
        <p class="tw:text-sm tw:text-on-main tw:leading-relaxed">
          {{ getFieldValue(field) || '—' }}
        </p>
      </div>

      <!-- File field (full-width) -->
      <div v-else-if="isFileField(field)" class="tw:col-span-3 tw:flex tw:flex-col tw:gap-0.5">
        <div class="tw:text-[11px] tw:text-secondary tw:font-medium">{{ field.label }}</div>
        <template v-if="Array.isArray(getFieldValue(field)) && getFieldValue(field).length">
          <a
            v-for="(file, fi) in getFieldValue(field)"
            :key="fi"
            :href="typeof file === 'string' ? file : file?.url"
            target="_blank"
            rel="noopener"
            class="tw:text-sm tw:text-primary tw:hover:underline tw:break-all"
          >
            {{
              typeof file === 'string'
                ? file
                : file?.originalFilename || file?.filename || file?.name || 'File'
            }}
          </a>
        </template>
        <span v-else class="tw:text-sm tw:text-secondary">—</span>
      </div>

      <!-- Photo field (full-width) -->
      <div v-else-if="isPhotoField(field)" class="tw:col-span-3 tw:flex tw:flex-col tw:gap-0.5">
        <div class="tw:text-[11px] tw:text-secondary tw:font-medium">{{ field.label }}</div>
        <img
          v-if="getPhotoUrl(field)"
          :src="getPhotoUrl(field)"
          :alt="field.label"
          class="tw:rounded tw:border tw:border-divider tw:object-contain"
          :style="{
            maxWidth: field.previewSize || '150px',
            maxHeight: field.previewSize || '150px',
          }"
        />
        <span v-else class="tw:text-sm tw:text-secondary">—</span>
      </div>

      <!-- Checklist field (full-width) -->
      <div v-else-if="isChecklistField(field)" class="tw:col-span-3 tw:flex tw:flex-col tw:gap-1">
        <div class="tw:text-[11px] tw:text-secondary tw:font-medium">{{ field.label }}</div>
        <div class="tw:overflow-x-auto">
          <table class="tw:w-full tw:text-sm tw:border tw:border-divider tw:rounded">
            <thead class="tw:bg-main-hover">
              <tr>
                <th class="tw:text-left tw:font-semibold tw:text-secondary tw:px-3 tw:py-2"></th>
                <th
                  v-for="col in getChecklistColumns(field)"
                  :key="col.value || col.label"
                  class="tw:text-left tw:font-semibold tw:text-secondary tw:px-3 tw:py-2"
                >
                  {{ getChecklistColumnLabel(col) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, rowIndex) in field.rows || []"
                :key="rowIndex"
                class="tw:border-t tw:border-divider"
              >
                <td class="tw:px-3 tw:py-2 tw:text-on-main tw:font-medium">
                  {{ getChecklistRowLabel(row) }}
                </td>
                <td
                  v-for="col in getChecklistColumns(field)"
                  :key="col.value || col.label"
                  class="tw:px-3 tw:py-2 tw:text-on-main"
                >
                  <span v-if="(getChecklistRowValue(field, rowIndex) || []).includes(col.value)">
                    ✓
                  </span>
                  <span v-else class="tw:text-secondary">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Separator (full-width rule) -->
      <hr
        v-else-if="isSeparatorField(field)"
        class="tw:col-span-3 tw:border-0 tw:border-t tw:border-divider tw:my-1"
      />

      <!-- Color picker — swatch + hex value (grid cell) -->
      <div v-else-if="isColorPickerField(field)" class="tw:flex tw:flex-col tw:gap-0.5">
        <div class="tw:text-[11px] tw:text-secondary tw:font-medium">{{ field.label }}</div>
        <div v-if="getFieldValue(field)" class="tw:flex tw:items-center tw:gap-2">
          <span
            class="tw:inline-block tw:size-4 tw:rounded tw:border tw:border-divider tw:shrink-0"
            :style="{ backgroundColor: getFieldValue(field) }"
          />
          <span class="tw:text-sm tw:font-medium tw:font-mono tw:text-on-main">
            {{ getFieldValue(field) }}
          </span>
        </div>
        <span v-else class="tw:text-sm tw:text-secondary">—</span>
      </div>

      <!-- Custom registered field (rca, riskAssessment, …) — full-width -->
      <div v-else-if="isCustomField(field)" class="tw:col-span-3 tw:flex tw:flex-col tw:gap-0.5">
        <div v-if="field.label" class="tw:text-[11px] tw:text-secondary tw:font-medium">
          {{ field.label }}
        </div>
        <component
          :is="getFormComponent(field.type).readonlyComponent"
          :field="field"
          :values="getFieldValue(field) || {}"
          :formValues="values"
        />
      </div>

      <!-- Standard field (grid cell) -->
      <div v-else-if="isRenderableField(field)" class="tw:flex tw:flex-col tw:gap-0.5">
        <div class="tw:text-[11px] tw:text-secondary tw:font-medium">{{ field.label }}</div>
        <span class="tw:text-sm tw:font-medium tw:text-on-main">
          {{ formatDisplayValue(field, getFieldValue(field)) }}
        </span>
      </div>
    </template>
  </div>
</template>
