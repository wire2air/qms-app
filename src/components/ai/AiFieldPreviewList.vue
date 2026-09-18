<script setup>
/**
 * Grouped read-only preview of AI-proposed form fields — the shared renderer
 * behind the chat proposal card (FormFieldProposalCard). Groups fields by
 * their flat `section` label in first-appearance order so the preview reads
 * the way the built form will look.
 */
const props = defineProps({
  fields: { type: Array, default: () => [] },
})

const groups = computed(() => {
  const out = []
  const byLabel = new Map()
  for (const f of props.fields ?? []) {
    const label = f?.section?.trim() || null
    const key = label || '__top__'
    let g = byLabel.get(key)
    if (!g) {
      g = { label, fields: [] }
      byLabel.set(key, g)
      out.push(g)
    }
    g.fields.push(f)
  }
  return out
})

function typeLabel(type) {
  return type || 'input'
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <div v-for="(group, gi) in groups" :key="gi" class="tw:flex tw:flex-col tw:gap-1">
      <div
        v-if="group.label"
        class="tw:text-micro tw:uppercase tw:tracking-wide tw:text-primary tw:font-semibold tw:px-1"
      >
        {{ group.label }}
      </div>
      <div
        class="tw:rounded-lg tw:border tw:border-divider tw:overflow-hidden tw:divide-y tw:divide-divider"
      >
        <div
          v-for="(f, fi) in group.fields"
          :key="fi"
          class="tw:flex tw:items-center tw:gap-3 tw:px-3 tw:py-1.5 tw:text-xs tw:bg-main"
        >
          <span
            class="tw:shrink-0 tw:w-24 tw:text-micro tw:uppercase tw:tracking-wide tw:text-secondary tw:bg-main-hover tw:rounded tw:px-1.5 tw:py-0.5 tw:text-center tw:truncate"
          >
            {{ typeLabel(f.type) }}
          </span>
          <span class="tw:text-on-main tw:flex-1 tw:min-w-0 tw:truncate">{{ f.label }}</span>
          <span v-if="f.required" class="tw:text-bad tw:shrink-0" title="Required">*</span>
        </div>
      </div>
    </div>
  </div>
</template>
