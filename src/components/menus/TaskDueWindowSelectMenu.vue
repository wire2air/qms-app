<script setup>
/**
 * "Due within" filter for the task inbox — Overdue / 7 / 15 / 30 / 60 days /
 * Custom range. Not an entity select (the options are a static catalogue, not
 * records), so it composes BaseSelect directly rather than the badge triad.
 *
 * The v-model is the STORED value `{ id, from?, to? }`, never a resolved pair of
 * dates: a preset re-resolves against "now" on every filter run (see
 * @/utils/taskDueWindows), so a tab left open overnight rolls to the new day.
 * That shape is JSON-serializable, which is what lets useListLayout mirror it
 * into the URL and hydrate it back on reload.
 */
import { DUE_WINDOWS } from '@/utils/taskDueWindows.js'

const modelValue = defineModel({ type: Object, default: null })

// BaseDateField's range shape ({ start, end } ISO) ↔ our { from, to }.
const customRange = computed(() => ({
  start: modelValue.value?.from ?? '',
  end: modelValue.value?.to ?? '',
}))

function onPreset(id) {
  if (!id) {
    modelValue.value = null
    return
  }
  if (id === 'custom') {
    // Keep any bounds already picked so re-selecting Custom isn't destructive.
    modelValue.value = {
      id,
      from: modelValue.value?.from ?? null,
      to: modelValue.value?.to ?? null,
    }
    return
  }
  modelValue.value = { id }
}

function onRange(range) {
  modelValue.value = { id: 'custom', from: range?.start || null, to: range?.end || null }
}
</script>

<template>
  <div class="tw:flex tw:items-center tw:gap-2">
    <BaseSelect
      :modelValue="modelValue?.id ?? null"
      :options="DUE_WINDOWS"
      optionLabel="label"
      optionValue="id"
      nullLabel="— Any due date —"
      clearable
      :searchable="false"
      @update:modelValue="onPreset"
    />
    <BaseDateField
      v-if="modelValue?.id === 'custom'"
      mode="range"
      valueFormat="iso"
      size="sm"
      clearable
      placeholder="Pick due dates"
      :modelValue="customRange"
      @update:modelValue="onRange"
    />
  </div>
</template>
