<script setup>
/**
 * Chat card for a `propose_form_fields` tool call — the "apply step" of the
 * conversational form assistant. Renders the proposed field list from the
 * tool-call ARGS (streamed live via tool_call_start; recovered from the
 * assistant row's tool_calls on history replay) and, when the host can apply
 * (the chat is docked in a form builder), an Apply button.
 *
 * In surfaces with no apply target (the global Ask-AI panel replaying a
 * form-builder thread) the card is a read-only preview.
 */
import { IconSparkles, IconCheck, IconAlertTriangle } from '@tabler/icons-vue'

const props = defineProps({
  // The chat item: { toolName, args: { title, description?, fields[] }, status, isError, result }
  card: { type: Object, required: true },
  // Host can apply the proposal into a live form builder.
  canApply: { type: Boolean, default: false },
  // Host-tracked: this proposal (by toolUseId) has been applied.
  applied: { type: Boolean, default: false },
})

const emit = defineEmits(['apply'])

const proposal = computed(() => props.card.args ?? null)
const fields = computed(() => (Array.isArray(proposal.value?.fields) ? proposal.value.fields : []))
</script>

<template>
  <div
    class="tw:rounded-xl tw:border tw:border-primary/30 tw:bg-primary/5 tw:overflow-hidden tw:max-w-[95%]"
  >
    <div class="tw:flex tw:items-center tw:gap-2 tw:px-3 tw:py-2 tw:border-b tw:border-primary/20">
      <IconSparkles :size="15" class="tw:text-primary tw:flex-none" />
      <div class="tw:flex-1 tw:min-w-0">
        <div class="tw:text-sm tw:font-semibold tw:text-on-main tw:truncate">
          {{ proposal?.title || 'Field proposal' }}
        </div>
        <div v-if="proposal?.description" class="tw:text-xs tw:text-secondary tw:truncate">
          {{ proposal.description }}
        </div>
      </div>
      <span class="tw:text-caption tw:text-secondary tw:flex-none">
        {{ fields.length }} field{{ fields.length === 1 ? '' : 's' }}
      </span>
    </div>

    <div v-if="card.isError" class="tw:flex tw:items-start tw:gap-2 tw:p-3 tw:text-xs tw:text-red-800">
      <IconAlertTriangle :size="14" class="tw:mt-0.5 tw:flex-none" />
      <span>{{ card.result?.message || 'The proposal could not be validated.' }}</span>
    </div>

    <div v-else-if="fields.length" class="tw:p-3 tw:max-h-72 tw:overflow-y-auto">
      <AiFieldPreviewList :fields="fields" />
    </div>

    <div
      v-if="!card.isError"
      class="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:px-3 tw:py-2 tw:border-t tw:border-primary/20"
    >
      <span class="tw:text-caption tw:text-secondary">
        <template v-if="applied">Applied to the form.</template>
        <template v-else-if="canApply">Applying replaces the form with these fields.</template>
        <template v-else>Open this chat from the form builder to apply.</template>
      </span>
      <BaseButton
        v-if="canApply && !applied"
        variant="primary"
        size="sm"
        @click="emit('apply', proposal)"
      >
        <template #icon><IconSparkles :size="14" /></template>
        Apply {{ fields.length }} field{{ fields.length === 1 ? '' : 's' }}
      </BaseButton>
      <span
        v-else-if="applied"
        class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:font-medium tw:text-good"
      >
        <IconCheck :size="14" /> Applied
      </span>
    </div>
  </div>
</template>
