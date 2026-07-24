<script setup>
import { IconStarFilled, IconStar } from '@tabler/icons-vue'
import { DateTime } from 'luxon'
import { getFormComponent } from './formComponentRegistry.js'
import { LOOKUP_ENTITY_BY_VALUE } from '@/constants/formBuilderConfig'
import ProductBadgeById from '@/components/badges/ProductBadgeById.vue'
import SupplierBadgeById from '@/components/badges/SupplierBadgeById.vue'
import SiteBadgeById from '@/components/badges/SiteBadgeById.vue'
import DepartmentBadgeById from '@/components/badges/DepartmentBadgeById.vue'
import UserBadgeById from '@/components/badges/UserBadgeById.vue'
import EquipmentBadgeById from '@/components/badges/EquipmentBadgeById.vue'
import CountryBadgeById from '@/components/badges/CountryBadgeById.vue'
import RegionBadgeById from '@/components/badges/RegionBadgeById.vue'

const props = defineProps({
  fields: { type: Array, required: true },
  values: { type: Object, default: () => ({}) },
})

// Entity badges for readonly `lookup` fields (resolve the stored id live).
const LOOKUP_BADGES = {
  product: ProductBadgeById,
  supplier: SupplierBadgeById,
  site: SiteBadgeById,
  department: DepartmentBadgeById,
  user: UserBadgeById,
  equipment: EquipmentBadgeById,
  country: CountryBadgeById,
  region: RegionBadgeById,
}
function isLookupField(field) {
  return field.type === 'lookup'
}
// Option-set-sourced lookup — renders resolved text, not an entity badge.
function isOptionSetLookup(field) {
  return field.type === 'lookup' && field.lookupEntity === 'optionSet' && field.optionSetId
}
function optionSetLookupText(field) {
  const rawVal = getFieldValue(field)
  if (rawVal == null || rawVal === '') return '—'
  // Frozen labels (written at submit by freezeOptionLabels) win so sealed
  // records don't shift if the option set is later edited.
  const frozen = props.values?._optionLabels?.[field.name]
  if (Array.isArray(rawVal)) {
    if (Array.isArray(frozen) && frozen.length === rawVal.length) {
      return frozen.map((v) => String(v)).join(', ') || '—'
    }
    return rawVal.map((v) => resolveOptionLabel(field, v)).join(', ') || '—'
  }
  if (frozen != null && !Array.isArray(frozen)) return String(frozen)
  return resolveOptionLabel(field, rawVal)
}
function lookupBadge(field) {
  return LOOKUP_BADGES[field.lookupEntity] || null
}
// The id prop the entity's BadgeById expects (e.g. ProductBadgeById → productId).
function lookupIdProp(field) {
  return LOOKUP_ENTITY_BY_VALUE[field.lookupEntity]?.idProp || 'id'
}

// ─── Option set resolution ────────────────────────────────────────────────────
// Only fetch the FK for fields that DON'T already carry an embedded
// snapshot. Embedded fields are the supplier-safe path and skip the
// IDB lookup entirely.
const optionSetIds = computed(() => {
  const ids = new Set()
  function collect(fields) {
    for (const f of fields) {
      if (f.optionSetId && !f.optionSet) ids.add(f.optionSetId)
      if (f.children) collect(f.children)
      if (f.template) collect(f.template)
    }
  }
  collect(props.fields)
  return [...ids]
})

const fkOptionSets = useLiveQueryWithDeps(
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

  { models: ['OptionSet'], initial: {} },
)

function getEffectiveOptionSet(field) {
  // Embedded snapshot wins; fall back to the FK lookup for legacy rows.
  return field.optionSet ?? (field.optionSetId ? fkOptionSets.value[field.optionSetId] : null)
}

// ─── Value resolution helpers ─────────────────────────────────────────────────
function getFieldValue(field) {
  if (!field.name) return null
  return props.values?.[field.name] ?? null
}

function resolveOptionLabel(field, val) {
  if (val == null) return '—'

  // Check optionSet first — embedded snapshot preferred over FK lookup.
  const effectiveOptionSet = getEffectiveOptionSet(field)
  if (effectiveOptionSet) {
    const options = effectiveOptionSet.options || []
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
    case 'email':
    case 'phone':
      return String(rawVal)

    case 'textEditor':
      return rawVal // will be rendered with v-html

    case 'select':
    case 'radio':
    case 'optionGroup': {
      // Frozen labels (written at submit by freezeOptionLabels) win over
      // any live OptionSet lookup so a sealed record's display doesn't
      // shift if the admin later renames an option. Falls through to the
      // FK/embedded lookup for legacy unfrozen records.
      const frozen = props.values?._optionLabels?.[field.name]
      if (Array.isArray(rawVal)) {
        if (Array.isArray(frozen) && frozen.length === rawVal.length) {
          return frozen.map((v) => String(v)).join(', ') || '—'
        }
        return rawVal.map((v) => resolveOptionLabel(field, v)).join(', ') || '—'
      }
      if (frozen != null && !Array.isArray(frozen)) return String(frozen)
      return resolveOptionLabel(field, rawVal)
    }

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

function isInstructionsField(field) {
  return field.type === 'instructions'
}

function isColorPickerField(field) {
  return field.type === 'colorPicker'
}

function isSignatureField(field) {
  return field.type === 'signature'
}

function isHeaderField(field) {
  return field.type === 'header'
}

function headerSizeClass(field) {
  return (
    { default: 'tw:text-xl', large: 'tw:text-3xl', small: 'tw:text-base' }[field.size || 'large'] ||
    'tw:text-3xl'
  )
}

function headerAlignClass(field) {
  return (
    { left: 'tw:text-left', center: 'tw:text-center', right: 'tw:text-right' }[
      field.align || 'center'
    ] || 'tw:text-center'
  )
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
    !isInstructionsField(field) &&
    !isColorPickerField(field) &&
    !isSignatureField(field) &&
    !isHeaderField(field) &&
    !isLookupField(field)
  )
}

function getVisibleFields(fields) {
  const result = []
  for (const field of fields) {
    if (field.hidden) continue // "Hide field" — omit from the readonly/submitted view
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
    } else if (isInstructionsField(field)) {
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
  <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:lg:grid-cols-3 tw:gap-3">
    <template v-for="field in getVisibleFields(fields)" :key="field.name || field.label">
      <!-- Section with children (full-width) -->
      <template v-if="isSectionField(field)">
        <div class="tw:col-span-3">
          <div
            v-if="field.label"
            class="tw:text-caption tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:mt-1 tw:mb-2"
          >
            {{ field.label }}
          </div>
          <FormSchemaReadonlyView :fields="field.children" :values="getContainerValues(field)" />
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
            class="tw:text-caption tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:mt-1 tw:mb-2"
          >
            {{ field.label }}
          </div>
          <template v-if="Array.isArray(getFieldValue(field)) && getFieldValue(field).length">
            <div
              v-for="(item, idx) in getFieldValue(field)"
              :key="idx"
              class="tw:border tw:border-divider tw:rounded-md tw:p-3 tw:mb-2"
            >
              <div class="tw:text-caption tw:text-secondary tw:font-medium tw:mb-2">
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
        <div class="tw:text-caption tw:text-secondary tw:font-medium">{{ field.label }}</div>
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

      <!-- Rich text + attachments field (full-width). Rendered via the
           component so the HTML renders AND the attachment/document links show;
           v-html alone would leak the encoded "[qms-attachments]::" marker. -->
      <div
        v-else-if="field.type === 'richTextAttachment'"
        class="tw:col-span-3 tw:flex tw:flex-col tw:gap-0.5"
      >
        <div class="tw:text-caption tw:text-secondary tw:font-medium">{{ field.label }}</div>
        <RichTextAttachments
          v-if="getFieldValue(field)"
          :modelValue="getFieldValue(field)"
          :readonly="true"
        />
        <span v-else class="tw:text-xs tw:text-secondary tw:italic">Not provided</span>
      </div>

      <!-- HTML / textEditor field (full-width) -->
      <div v-else-if="isHtmlField(field)" class="tw:col-span-3 tw:flex tw:flex-col tw:gap-0.5">
        <div class="tw:text-caption tw:text-secondary tw:font-medium">{{ field.label }}</div>
        <div
          v-if="getFieldValue(field)"
          class="tw:text-sm tw:text-on-main tw:leading-relaxed"
          v-html="getFieldValue(field)"
        />
        <span v-else class="tw:text-xs tw:text-secondary tw:italic">Not provided</span>
      </div>

      <!-- Textarea field (full-width) -->
      <div
        v-else-if="field.type === 'textarea'"
        class="tw:col-span-3 tw:flex tw:flex-col tw:gap-0.5"
      >
        <div class="tw:text-caption tw:text-secondary tw:font-medium">{{ field.label }}</div>
        <p class="tw:text-sm tw:text-on-main tw:leading-relaxed">
          {{ getFieldValue(field) || '—' }}
        </p>
      </div>

      <!-- File field (full-width) -->
      <div v-else-if="isFileField(field)" class="tw:col-span-3 tw:flex tw:flex-col tw:gap-0.5">
        <div class="tw:text-caption tw:text-secondary tw:font-medium">{{ field.label }}</div>
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
        <div class="tw:text-caption tw:text-secondary tw:font-medium">{{ field.label }}</div>
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
        <div class="tw:text-caption tw:text-secondary tw:font-medium">{{ field.label }}</div>
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

      <!-- Instructions — display-only rich HTML callout (full-width). -->
      <div
        v-else-if="isInstructionsField(field)"
        class="tw:col-span-3 tw:rounded-lg tw:border tw:border-blue-200 tw:bg-blue-50 tw:px-4 tw:py-3 tw:text-sm tw:text-on-main tw:prose tw:prose-sm tw:max-w-none"
        :class="field.class"
        :style="field.style"
        v-html="field.html || ''"
      />

      <!-- Color picker — swatch + hex value (grid cell) -->
      <div v-else-if="isColorPickerField(field)" class="tw:flex tw:flex-col tw:gap-0.5">
        <div class="tw:text-caption tw:text-secondary tw:font-medium">{{ field.label }}</div>
        <div v-if="getFieldValue(field)" class="tw:flex tw:items-center tw:gap-2">
          <span
            class="tw:inline-block tw:size-4 tw:rounded tw:border tw:border-divider tw:shrink-0"
            :style="{ backgroundColor: getFieldValue(field) }"
          />
          <span class="tw:text-sm tw:font-medium tw:text-on-main">
            {{ getFieldValue(field) }}
          </span>
        </div>
        <span v-else class="tw:text-sm tw:text-secondary">—</span>
      </div>

      <!-- Heading — display-only heading + optional subheading -->
      <div v-else-if="isHeaderField(field)" class="tw:col-span-3" :class="headerAlignClass(field)">
        <div class="tw:font-bold tw:text-on-main" :class="headerSizeClass(field)">
          {{ field.text }}
        </div>
        <div v-if="field.subtext" class="tw:text-sm tw:text-secondary tw:mt-1">
          {{ field.subtext }}
        </div>
      </div>

      <!-- Signature — the saved PNG data-URL rendered as an image -->
      <div v-else-if="isSignatureField(field)" class="tw:flex tw:flex-col tw:gap-0.5">
        <div class="tw:text-caption tw:text-secondary tw:font-medium">{{ field.label }}</div>
        <img
          v-if="getFieldValue(field)"
          :src="getFieldValue(field)"
          :alt="field.label || 'Signature'"
          class="tw:rounded tw:border tw:border-divider tw:bg-white tw:object-contain"
          :style="{ maxWidth: '320px', maxHeight: '160px' }"
        />
        <span v-else class="tw:text-sm tw:text-secondary">—</span>
      </div>

      <!-- Custom registered field (rca, riskAssessment, …) — full-width -->
      <div v-else-if="isCustomField(field)" class="tw:col-span-3 tw:flex tw:flex-col tw:gap-0.5">
        <div v-if="field.label" class="tw:text-caption tw:text-secondary tw:font-medium">
          {{ field.label }}
        </div>
        <component
          :is="getFormComponent(field.type).readonlyComponent"
          :field="field"
          :values="getFieldValue(field) || {}"
          :formValues="values"
        />
      </div>

      <!-- Lookup — entity-backed resolves the stored id to a live badge;
           option-set-backed renders text (frozen label wins, then the
           fetched set, then the raw value — same rules as select fields). -->
      <div v-else-if="isLookupField(field)" class="tw:flex tw:flex-col tw:gap-0.5">
        <div class="tw:text-caption tw:text-secondary tw:font-medium">{{ field.label }}</div>
        <span v-if="isOptionSetLookup(field)" class="tw:text-sm tw:text-on-main">
          {{ optionSetLookupText(field) }}
        </span>
        <template v-else-if="getFieldValue(field) && lookupBadge(field)">
          <component
            :is="lookupBadge(field)"
            v-for="v in Array.isArray(getFieldValue(field)) ? getFieldValue(field) : [getFieldValue(field)]"
            :key="v"
            v-bind="{ [lookupIdProp(field)]: v }"
          />
        </template>
        <span v-else class="tw:text-sm tw:text-secondary">—</span>
      </div>

      <!-- Standard field (grid cell) -->
      <div v-else-if="isRenderableField(field)" class="tw:flex tw:flex-col tw:gap-0.5">
        <div class="tw:text-caption tw:text-secondary tw:font-medium">{{ field.label }}</div>
        <span class="tw:text-sm tw:font-medium tw:text-on-main">
          {{ formatDisplayValue(field, getFieldValue(field)) }}
        </span>
      </div>
    </template>
  </div>
</template>
