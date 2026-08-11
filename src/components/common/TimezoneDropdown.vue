<script setup>
const props = defineProps({
  label: {
    type: String,
    default: 'Timezone',
  },
  hint: {
    type: String,
    default: '',
  },
  // Optional BaseField validation passthrough. Default-empty, so every existing
  // mount is unchanged; the Sites dialog uses it to assert the value is a real
  // IANA zone (the column had no validation at any layer).
  rules: {
    type: Array,
    default: () => [],
  },
})

const model = defineModel({ type: String, default: 'UTC' })

const changeNameOfTimezone = {
  'Asia/Calcutta': 'Asia/Kolkata',
}

const timezoneItems = computed(() => {
  const tzones = Intl.supportedValuesOf('timeZone')
  return tzones.map((zone) => {
    const offset = new Date()
      .toLocaleTimeString('en-US', {
        timeZone: zone,
        timeZoneName: 'short',
      })
      .split(' ')
      .at(-1)
    const text = changeNameOfTimezone[zone] || zone
    return { id: zone, name: `${text.replaceAll('_', ' ')} (${offset})` }
  })
})
</script>

<template>
  <BaseField :label="props.label" :hint="props.hint" :rules="props.rules" :value="model">
    <BaseSelect
      v-model="model"
      :options="timezoneItems"
      optionLabel="name"
      optionValue="id"
      :required="true"
      placeholder="Select Timezone"
    />
  </BaseField>
</template>
