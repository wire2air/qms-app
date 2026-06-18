<script setup>
import { DateTime } from 'luxon'
import { ENTITY_LABEL_RESOLVERS } from '@/utils/auditConstants.js'

const props = defineProps({
  value: { type: Object, default: null },
  fieldMeta: { type: Object, default: null },
  /** 'old' = red strikethrough pill, 'new' = green pill, 'plain' = neutral pill */
  variant: { type: String, default: 'plain' },
})

const showRaw = ref(false)

const isJson = computed(
  () => props.fieldMeta?.type === 'json' && props.value !== null && typeof props.value === 'object',
)

// Resolve the display value live from IDB so FK renames stay fresh.
const displayValue = useLiveQuery(
  async (db) => {
    const value = props.value
    if (value === null || value === undefined) return '—'

    const type = props.fieldMeta?.type || 'text'

    if (type === 'fk' && props.fieldMeta?.refModel) {
      const resolver = ENTITY_LABEL_RESOLVERS[props.fieldMeta.refModel]
      if (resolver) {
        const result = await resolver.call(ENTITY_LABEL_RESOLVERS, value, db)
        return result?.label ?? String(value)
      }
      return String(value)
    }

    if (type === 'status' && props.fieldMeta?.statusModel) {
      const model = db[props.fieldMeta.statusModel]
      if (model) {
        const record = await model.findByPk(value)
        if (record?.name) return record.name
      }
      return humanizeCode(String(value))
    }

    if (type === 'date') {
      const dt = value instanceof DateTime ? value : DateTime.fromISO(String(value))
      return dt.isValid ? dt.formatDate('date') : String(value)
    }

    if (type === 'datetime') {
      const dt = value instanceof DateTime ? value : DateTime.fromISO(String(value))
      return dt.isValid ? dt.formatDate('datetime') : String(value)
    }

    if (type === 'boolean') return value ? 'Yes' : 'No'

    if (type === 'enum' && props.fieldMeta?.enumMap) {
      return props.fieldMeta.enumMap[value] ?? String(value)
    }

    if (type === 'json') {
      if (typeof value === 'object' && value !== null) {
        const count = Array.isArray(value) ? value.length : Object.keys(value).length
        const unit = Array.isArray(value) ? 'item' : 'field'
        return `{ ${count} ${unit}${count !== 1 ? 's' : ''} }`
      }
      return String(value)
    }

    return String(value)
  },
  { models: '*', initial: '…' },
)

const pillClass = computed(() => {
  if (props.variant === 'old')
    return 'tw:bg-red-50 tw:text-red-700 tw:border-red-200 tw:line-through'
  if (props.variant === 'new') return 'tw:bg-green-50 tw:text-green-700 tw:border-green-200'
  return 'tw:bg-main tw:text-primary tw:border-divider'
})

function humanizeCode(str) {
  if (!str) return '—'
  return str
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}
</script>

<template>
  <span class="tw:inline-flex tw:items-start tw:gap-1 tw:flex-wrap">
    <span class="tw:px-1.5 tw:py-0.5 tw:rounded tw:text-xs tw:border" :class="pillClass">
      {{ displayValue }}
    </span>
    <button
      v-if="isJson"
      class="tw:text-micro tw:text-secondary tw:underline tw:underline-offset-2 tw:pt-0.5"
      @click.stop="showRaw = !showRaw"
    >
      {{ showRaw ? 'hide' : 'raw' }}
    </button>
    <pre
      v-if="isJson && showRaw"
      class="tw:w-full tw:text-micro tw:bg-main tw:border tw:border-divider tw:rounded tw:p-2 tw:mt-1 tw:whitespace-pre-wrap tw:break-all tw:max-w-sm"
      >{{ JSON.stringify(value, null, 2) }}</pre
    >
  </span>
</template>
