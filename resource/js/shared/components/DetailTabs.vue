<script setup>
const props = defineProps({
  tabs: { type: Array, required: true },
  ariaLabel: { type: String, default: undefined },
})
const model = defineModel({ type: [String, Number], default: null })

function val(v) {
  return typeof v === 'function' ? v() : v
}
const visibleTabs = computed(() => props.tabs.filter((t) => t.visible !== false))
const baseTabs = computed(() =>
  visibleTabs.value.map((t) => ({
    value: t.value,
    label: t.label,
    icon: t.icon,
    badge: t.count != null ? val(t.count) : undefined,
    disabled: !!t.disabled,
  })),
)
</script>

<template>
  <BaseTabs v-model="model" :tabs="baseTabs" :ariaLabel="ariaLabel">
    <BaseTabPanel
      v-for="t in visibleTabs"
      :key="t.value"
      :value="t.value"
      :keepAlive="t.lazy === false"
    >
      <slot :name="`tab-${t.value}`" />
    </BaseTabPanel>
  </BaseTabs>
</template>
