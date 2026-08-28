<script setup>
/**
 * "Add field" picker — the MiniFormBuilder popup, extracted (user request
 * 2026-08-26) so the FULL builder's insert-between affordances can open the
 * same thing: quick-pick grid of the common input components, plus a
 * searchable dropdown covering every other component.
 *
 * Emits `pick(type)` and closes; the host decides where the field lands
 * (append, or a specific parentPath + index for insert-between).
 */
import { FIELD_TYPES, CATEGORY_LABELS } from '@/constants/formBuilderConfig'

const emit = defineEmits(['pick'])
const open = defineModel({ type: Boolean, default: false })

const quickPickTypes = computed(() =>
  Object.entries(FIELD_TYPES)
    .filter(([, meta]) => meta.category === 'input')
    .map(([type, meta]) => ({ type, ...meta })),
)

const otherTypeOptions = computed(() =>
  Object.entries(FIELD_TYPES)
    .filter(([, meta]) => meta.category !== 'input')
    .map(([type, meta]) => ({
      id: type,
      name: `${meta.label} · ${CATEGORY_LABELS[meta.category] ?? meta.category}`,
    })),
)
const otherTypePick = ref(null)

function pickType(type) {
  if (!type) return
  emit('pick', type)
  otherTypePick.value = null
  open.value = false
}

watch(open, (v) => {
  if (v) otherTypePick.value = null
})
</script>

<template>
  <BaseDialog v-model="open" title="Add field" maxWidth="md">
    <div class="tw:flex tw:flex-col tw:gap-4">
      <div class="tw:grid tw:grid-cols-2 tw:gap-2 tw:sm:grid-cols-3">
        <button
          v-for="t in quickPickTypes"
          :key="t.type"
          type="button"
          class="tw:flex tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-2 tw:text-left tw:text-sm tw:hover:border-primary tw:hover:bg-primary/5"
          @click="pickType(t.type)"
        >
          <component :is="t.icon" v-if="t.icon" :size="16" class="tw:shrink-0 tw:text-secondary" />
          <span class="tw:truncate">{{ t.label }}</span>
        </button>
      </div>

      <BaseField label="Other components">
        <BaseSelect
          v-model="otherTypePick"
          :options="otherTypeOptions"
          optionLabel="name"
          optionValue="id"
          nullLabel="Search all components…"
          :clearable="true"
          @update:modelValue="(id) => pickType(id)"
        />
      </BaseField>
    </div>
  </BaseDialog>
</template>
