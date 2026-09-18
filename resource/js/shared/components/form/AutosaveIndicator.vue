<script setup>
/**
 * AutosaveIndicator — the shared "Saving… / Saved / Couldn't save" affordance
 * for autosave forms (detail pages). The save LOGIC already exists (useAutoSave:
 * deep-watch + debounce + isSaving/saveError); this is the missing shared UI,
 * so every detail page stops hand-rolling its own save status.
 *
 * Drop it into StickyFormFooter's #status slot, a DetailHeader, or anywhere the
 * record's save state should be glanceable. The `state` maps directly from
 * useAutoSave: isSaving → 'saving', saveError → 'error', else 'saved'/'idle'.
 *
 *   <StickyFormFooter ...>
 *     <template #status>
 *       <AutosaveIndicator :state="saveState" :savedAtLabel="lastSavedLabel" @retry="save" />
 *     </template>
 *   </StickyFormFooter>
 *
 * The region is aria-live="polite" so changes are announced without stealing focus.
 */
import { IconCheck, IconAlertTriangle } from '@tabler/icons-vue'

const props = defineProps({
  // idle | saving | saved | error
  state: {
    type: String,
    default: 'idle',
    validator: (v) => ['idle', 'saving', 'saved', 'error'].includes(v),
  },
  // Optional already-formatted timestamp (e.g. dt.formatDate(...)) appended to
  // "Saved". Date formatting stays with the caller (project rule: dt.formatDate).
  savedAtLabel: { type: String, default: '' },
  // Show a Retry button in the error state.
  retryable: { type: Boolean, default: true },
})

const emit = defineEmits(['retry'])

const savedText = computed(() =>
  props.savedAtLabel ? `Saved ${props.savedAtLabel}` : 'Saved',
)
</script>

<template>
  <div class="tw:flex tw:items-center tw:gap-1.5 tw:text-sm" aria-live="polite">
    <template v-if="state === 'saving'">
      <BaseSpinner size="xs" color="secondary" label="Saving" />
      <span class="tw:text-secondary">Saving…</span>
    </template>

    <template v-else-if="state === 'saved'">
      <IconCheck :size="16" class="tw:shrink-0 tw:text-good" aria-hidden="true" />
      <span class="tw:text-secondary">{{ savedText }}</span>
    </template>

    <template v-else-if="state === 'error'">
      <IconAlertTriangle :size="16" class="tw:shrink-0 tw:text-red-600" aria-hidden="true" />
      <span class="tw:text-red-700">Couldn't save</span>
      <button
        v-if="retryable"
        type="button"
        class="tw:ml-1 tw:rounded tw:font-medium tw:text-primary tw:underline tw:underline-offset-2 tw:hover:no-underline tw:focus-visible:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-primary/40"
        @click="emit('retry')"
      >
        Retry
      </button>
    </template>

    <!-- idle: render nothing -->
  </div>
</template>
