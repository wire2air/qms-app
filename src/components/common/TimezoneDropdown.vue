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
    <BaseSelectMenu v-model="model" :items="timezoneItems" :required="true">
      <template #button>
        <BaseBadge v-if="model" class="tw:text-sm tw:text-on-sidebar tw:font-medium">
          {{ timezoneItems.find((item) => item.id === model)?.name || model }}
        </BaseBadge>
        <span v-else class="tw:text-sm tw:text-placeholder tw:font-medium"> Select Timezone </span>
      </template>
    </BaseSelectMenu>
  </BaseField>
</template>
