<script setup>
/**
 * Debounced table search input. Two-way binds a string model (the table's
 * `v-model:search`, which drives the engine's global filter). Local state is
 * echoed immediately for a responsive caret; the model updates on debounce.
 */
import { IconSearch, IconX } from '@tabler/icons-vue'

const props = defineProps({
  placeholder: { type: String, default: 'Search…' },
  debounce: { type: Number, default: 200 },
})
const model = defineModel({ type: String, default: '' })

const local = ref(model.value)
watch(model, (v) => {
  if ((v || '') !== local.value) local.value = v || ''
})
const pushDebounced = useDebounceFn((v) => {
  model.value = v
}, props.debounce)
watch(local, (v) => pushDebounced(v))

function clear() {
  local.value = ''
  model.value = ''
}
</script>

<template>
  <div class="tw:relative tw:flex tw:items-center">
    <IconSearch
      :size="15"
      class="tw:pointer-events-none tw:absolute tw:left-2.5 tw:text-placeholder"
    />
    <input
      v-model="local"
      type="search"
      :placeholder="placeholder"
      aria-label="Search table"
      class="tw:h-8 tw:w-full tw:rounded-md tw:border tw:border-divider tw:bg-sidebar tw:py-1 tw:pr-7 tw:pl-8 tw:text-sm tw:text-on-main tw:transition-colors tw:placeholder:text-placeholder tw:focus:border-primary tw:focus-visible:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-primary/30 sm:tw:w-56"
    />
    <button
      v-if="local"
      type="button"
      aria-label="Clear search"
      class="tw:absolute tw:right-1.5 tw:flex tw:size-5 tw:items-center tw:justify-center tw:rounded tw:text-secondary tw:transition-colors tw:hover:bg-main-hover tw:hover:text-on-main"
      @click="clear"
    >
      <IconX :size="13" />
    </button>
  </div>
</template>
