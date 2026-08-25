<script setup>
/**
 * StickyFormFooter — the persistent action bar for long forms, pinned to the
 * bottom of the scroll region so the primary action is reachable the moment the
 * user finishes the last field. Fixes the pattern of parking "Submit" in the
 * PageHeader (NonconformancesCreate), which scrolls off-screen on a long form.
 *
 * The form analog of DetailActionBar: it owns the sticky chrome + submit/cancel
 * buttons + a left-aligned status region (dirty marker, inline error, or a
 * slotted AutosaveIndicator).
 *
 *   <StickyFormFooter
 *     :loading="saving" :disabled="!canSubmit" :dirty="isDirty" :error="serverError"
 *     submitLabel="Raise NC" @submit="handleSubmit" @cancel="goBack"
 *   />
 *
 * Place it as the last child of the page's scrolling container (BasePage
 * fullHeight). For autosave forms, slot the indicator into #status instead of
 * passing `dirty`.
 */
import { IconAlertTriangle, IconPointFilled } from '@tabler/icons-vue'

defineProps({
  submitLabel: { type: String, default: 'Save' },
  cancelLabel: { type: String, default: 'Cancel' },
  submitVariant: { type: String, default: 'primary' },
  // Submit in progress — spins the primary button and blocks re-submit.
  loading: { type: Boolean, default: false },
  // Submit not allowed (validation gate).
  disabled: { type: Boolean, default: false },
  // Show the "Unsaved changes" marker on the left (explicit-submit forms).
  dirty: { type: Boolean, default: false },
  // Inline error (e.g. a failed server save) shown on the left.
  error: { type: String, default: '' },
  // Hide the cancel button entirely.
  hideCancel: { type: Boolean, default: false },
  // Optional keyboard hint rendered next to the submit label (e.g. '⌘↵').
  submitHint: { type: String, default: '' },
})

const emit = defineEmits(['submit', 'cancel'])
</script>

<template>
  <div
    class="tw:sticky tw:bottom-0 tw:z-10 tw:-mx-px tw:border-t tw:border-divider tw:bg-card tw:px-4 tw:py-3 tw:shadow-[0_-1px_3px_rgba(0,0,0,0.04)] tw:lg:px-5"
  >
    <div class="tw:flex tw:flex-col tw:gap-2 tw:sm:flex-row tw:sm:items-center tw:sm:justify-between">
      <!-- Status region: explicit error wins, else slot, else dirty marker. -->
      <div class="tw:flex tw:min-w-0 tw:items-center tw:gap-1.5 tw:text-sm">
        <template v-if="error">
          <IconAlertTriangle :size="16" class="tw:shrink-0 tw:text-red-600" aria-hidden="true" />
          <span class="tw:truncate tw:text-red-700" role="alert">{{ error }}</span>
        </template>
        <slot v-else name="status">
          <template v-if="dirty">
            <IconPointFilled :size="16" class="tw:shrink-0 tw:text-amber-500" aria-hidden="true" />
            <span class="tw:text-secondary">Unsaved changes</span>
          </template>
        </slot>
      </div>

      <!-- Actions: override the whole cluster via #actions if needed. -->
      <div class="tw:flex tw:shrink-0 tw:items-center tw:gap-2 tw:sm:justify-end">
        <slot name="actions">
          <!-- A secondary action that sits BESIDE cancel/submit rather than
               replacing them. #actions overrides the whole cluster, which means
               re-implementing the loading and disabled wiring; this is for the
               common case of adding one button (e.g. "Save as Draft"). -->
          <slot name="actions-extra" />
          <BaseButton
            v-if="!hideCancel"
            variant="outline"
            size="md"
            :disabled="loading"
            @click="emit('cancel')"
          >
            {{ cancelLabel }}
          </BaseButton>
          <BaseButton
            :variant="submitVariant"
            size="md"
            :isLoading="loading"
            :disabled="disabled || loading"
            @click="emit('submit')"
          >
            {{ submitLabel }}
            <span v-if="submitHint" class="tw:ml-1.5 tw:text-xs tw:opacity-70">{{ submitHint }}</span>
          </BaseButton>
        </slot>
      </div>
    </div>
  </div>
</template>
