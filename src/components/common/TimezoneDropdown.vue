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
  <BaseField :label="props.label" :hint="props.hint">
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
