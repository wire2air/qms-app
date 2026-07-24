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
import { LOOKUP_ENTITIES } from '@/constants/formBuilderConfig'

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
</template>
