<script setup>
const props = defineProps({
  banners: { type: Array, default: () => [] },
})
const dismissed = ref(new Set())
const shown = computed(() => props.banners.filter((b) => !dismissed.value.has(b.id)))

function dismiss(id) {
  const next = new Set(dismissed.value)
  next.add(id)
  dismissed.value = next
}
</script>

<template>
  <div v-if="shown.length" data-test="banner-region" class="tw:flex tw:flex-col tw:gap-2 tw:py-2">
    <BaseBanner
      v-for="b in shown"
      :key="b.id"
      :tone="b.tone"
      :icon="b.icon || null"
      :title="b.title"
      :message="b.message || ''"
      :dismissible="b.dismissible === true"
      @dismiss="dismiss(b.id)"
    >
      <template v-if="b.actions && b.actions.length" #actions>
        <button
          v-for="a in b.actions"
          :key="a.id"
          type="button"
          class="tw:text-body tw:font-semibold tw:underline"
          @click="a.onSelect && a.onSelect()"
        >
          {{ a.label }}
        </button>
      </template>
    </BaseBanner>
  </div>
</template>
