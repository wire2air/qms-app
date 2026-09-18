<script setup>
/**
 * Lookup field settings — one unified Source picker: first-class company
 * tables (Item, Supplier, Site, …) AND the tenant's Option Sets, so authors
 * configure every lookup in one place.
 *
 * Storage: entity sources write `field.lookupEntity = '<entity>'`; option-set
 * sources write `field.lookupEntity = 'optionSet'` + `field.optionSetId` (the
 * same FK key select/radio fields use, so label freezing and readonly
 * resolution reuse the existing option-set machinery).
 */
import { LOOKUP_ENTITIES, LOOKUP_CASCADES } from '@/constants/formBuilderConfig'

const props = defineProps({
  // Sibling lookup fields in the same form ({ name, label, lookupEntity }) —
  // candidates for cascading ("Department options filtered by the Site field").
  siblingLookups: { type: Array, default: () => [] },
})

const field = defineModel('field', { type: Object, required: true })

// Backfill a default so an older/blank schema still resolves to a valid source.
if (!field.value.lookupEntity) field.value.lookupEntity = 'product'

const OPTION_SET_PREFIX = 'optionSet:'

const optionSets = useLiveQuery(async (db) => db.OptionSet.where().exec(), {
  models: ['OptionSet'],
  initial: [],
})

const sourceOptions = computed(() => [
  ...LOOKUP_ENTITIES,
  ...optionSets.value
    .slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map((os) => ({ value: `${OPTION_SET_PREFIX}${os.id}`, label: `Option Set: ${os.name}` })),
])

// ── Cascading parent ────────────────────────────────────────────────────────
// Offered exactly when LOOKUP_CASCADES supports this entity: the options are
// the OTHER lookup fields in this form whose entity can constrain it.
const cascadeParents = computed(() => LOOKUP_CASCADES[field.value.lookupEntity] || null)
const parentOptions = computed(() => {
  if (!cascadeParents.value) return []
  return props.siblingLookups
    .filter((f) => f.name !== field.value.name)
    .filter((f) => Object.hasOwn(cascadeParents.value, f.lookupEntity))
    .map((f) => ({ value: f.name, label: `${f.label || f.name} (${f.lookupEntity})` }))
})
// Entity changed (or the parent field was deleted/retyped): a stale parent
// reference would silently filter by a field that no longer matches.
watch(
  () => [field.value.lookupEntity, parentOptions.value.map((o) => o.value).join(',')],
  () => {
    if (
      field.value.parentField &&
      !parentOptions.value.some((o) => o.value === field.value.parentField)
    ) {
      field.value.parentField = null
    }
  },
)

// The dropdown speaks the namespaced value; the field stores the split form.
const sourceValue = computed({
  get() {
    return field.value.lookupEntity === 'optionSet' && field.value.optionSetId
      ? `${OPTION_SET_PREFIX}${field.value.optionSetId}`
      : field.value.lookupEntity
  },
  set(v) {
    if (typeof v === 'string' && v.startsWith(OPTION_SET_PREFIX)) {
      field.value.lookupEntity = 'optionSet'
      field.value.optionSetId = v.slice(OPTION_SET_PREFIX.length)
    } else {
      field.value.lookupEntity = v
      field.value.optionSetId = null
    }
  },
})
</script>

<template>
  <BaseField
    label="Source"
    hint="A company list (stores the selected record's id) or an Option Set (stores the chosen option)."
  >
    <BaseSelect
      v-model="sourceValue"
      :options="sourceOptions"
      optionLabel="label"
      optionValue="value"
      :required="true"
    />
  </BaseField>

  <BaseField
    v-if="cascadeParents && parentOptions.length"
    label="Filter by field"
    hint="Options narrow to the selected value of that field — e.g. Department filtered by the Site chosen above. Leave empty for the full list."
  >
    <BaseSelect
      v-model="field.parentField"
      :options="parentOptions"
      optionLabel="label"
      optionValue="value"
      nullLabel="— No filter —"
      :clearable="true"
    />
  </BaseField>
</template>
