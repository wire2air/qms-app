<script setup>
/**
 * Lookup field settings — pick which company table the field resolves against.
 * The rendered field is an entity picker (ProductSelectMenu, SupplierSelectMenu,
 * …) that stores the chosen entity's id; readonly views resolve it back to a
 * badge. Writes `field.lookupEntity`.
 */
import { LOOKUP_ENTITIES } from '@/constants/formBuilderConfig'

const field = defineModel('field', { type: Object, required: true })

// Backfill a default so an older/blank schema still resolves to a valid source.
if (!field.value.lookupEntity) field.value.lookupEntity = 'product'
</script>

<template>
  <BaseField label="Source" hint="The company list this field looks up. Stores the selected record's id.">
    <BaseSelect
      v-model="field.lookupEntity"
      :options="LOOKUP_ENTITIES"
      optionLabel="label"
      optionValue="value"
      :required="true"
    />
  </BaseField>
</template>
