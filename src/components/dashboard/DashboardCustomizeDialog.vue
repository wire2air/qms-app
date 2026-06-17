<script setup>
/**
 * Pick which widgets show on the dashboard. Selection is persisted per
 * user + company (localStorage) by the parent.
 */
const props = defineProps({
  widgets: { type: Array, required: true }, // [{ id, label }]
  enabledIds: { type: Array, required: true },
})
const emit = defineEmits(['save'])
const show = defineModel({ type: Boolean, default: false })

const local = ref([])
watch(show, (v) => {
  if (v) local.value = [...props.enabledIds]
})

function toggle(id) {
  if (local.value.includes(id)) local.value = local.value.filter((x) => x !== id)
  else local.value = [...local.value, id]
}

function save() {
  emit('save', local.value)
  show.value = false
}
</script>

<template>
  <BaseDialog v-model="show" title="Customize Dashboard" size="md">
    <div class="tw:p-5 tw:flex tw:flex-col tw:gap-1">
      <p class="tw:text-sm tw:text-secondary tw:mb-2">
        Choose what appears on your dashboard. Tip: drag a panel by the grip in its header to
        reorder it.
      </p>
      <label
        v-for="w in widgets"
        :key="w.id"
        class="tw:flex tw:items-center tw:gap-3 tw:px-3 tw:py-2.5 tw:rounded-lg tw:hover:bg-main-hover tw:cursor-pointer tw:text-sm tw:text-on-main"
      >
        <BaseCheckbox :modelValue="local.includes(w.id)" @update:modelValue="() => toggle(w.id)" />
        {{ w.label }}
      </label>
    </div>
    <div class="tw:flex tw:justify-end tw:gap-2 tw:px-4 tw:pb-4">
      <BaseButton variant="outline" @click="show = false">Cancel</BaseButton>
      <BaseButton @click="save">Save</BaseButton>
    </div>
  </BaseDialog>
</template>
