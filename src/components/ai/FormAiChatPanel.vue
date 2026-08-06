<script setup>
/**
 * The form builder's Ask-AI assistant — a chat docked beside the canvas.
 *
 * Replaces the one-shot FormAiGenerateDialog: the user converses (optionally
 * attaching their existing paper form as PDF/spreadsheet — extracted to text
 * in the browser), the model proposes fields via the propose_form_fields
 * tool, and the proposal renders as a card whose Apply hands the field list
 * to the host builder. Nothing is written server-side; the builder's normal
 * save flow persists the schema.
 *
 * Context is REBUILT on every send (kind: 'form_builder' + the serialized
 * current schema) so the assistant always sees the form as it stands — e.g.
 * right after an Apply or a manual edit.
 *
 * AI-sidecar isolation: this component owns all AI wiring; the host only
 * mounts it behind `v-if="canUseAi"` and reacts to @apply.
 */
import { IconSparkles, IconX, IconPlus } from '@tabler/icons-vue'
import { serializeSchemaForAi } from '@/utils/aiFormSerialize.js'

const props = defineProps({
  // The builder's live schema tree (used to build edit-mode context).
  currentSchema: { type: Array, default: () => [] },
  // Optional form title, shown to the model as context.
  builderTitle: { type: String, default: '' },
})

// apply: ({ proposal, onApplied }) — host applies (may show a confirm
// dialog) and calls onApplied() only when the fields actually landed.
const emit = defineEmits(['apply', 'close'])

const threadId = ref(null)
const conversationRef = ref(null)
const appliedIds = reactive(new Set())

const isEdit = computed(
  () => Array.isArray(props.currentSchema) && props.currentSchema.length > 0,
)

function contextProvider() {
  return {
    kind: 'form_builder',
    builderTitle: props.builderTitle || undefined,
    currentForm: isEdit.value ? serializeSchemaForAi(props.currentSchema) : undefined,
  }
}

const suggestions = computed(() =>
  isEdit.value
    ? [
        'Add a sign-off section with signature and date',
        'Make every field in the first section required',
        'Add a number field for temperature between 2 and 8 °C',
      ]
    : [
        'Draft a supplier onboarding form',
        'A daily line-clearance checklist with Yes/No/N-A answers',
        'Build the form from my attached file',
      ],
)

function handleApplyProposal({ toolUseId, proposal }) {
  emit('apply', {
    proposal,
    onApplied: () => appliedIds.add(toolUseId),
  })
}

function handleNewChat() {
  conversationRef.value?.cancel?.()
  threadId.value = null
  appliedIds.clear()
}
</script>

<template>
  <aside
    class="tw:w-96 tw:border-l tw:border-divider tw:bg-sidebar tw:flex! tw:flex-col tw:shrink-0 tw:overflow-hidden"
  >
    <div
      class="tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-3 tw:border-b tw:border-divider tw:bg-main/50"
    >
      <IconSparkles :size="16" class="tw:text-primary tw:flex-none" />
      <div class="tw:flex-1 tw:min-w-0">
        <div class="tw:text-sm tw:font-bold tw:text-on-sidebar tw:truncate">AI Form Assistant</div>
        <div class="tw:text-micro tw:text-secondary tw:truncate">
          Chat to design the fields, then apply
        </div>
      </div>
      <button
        class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:bg-main-hover tw:transition-colors"
        title="New chat"
        @click="handleNewChat"
      >
        <IconPlus :size="16" />
      </button>
      <button
        class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:bg-main-hover tw:transition-colors"
        title="Close"
        @click="emit('close')"
      >
        <IconX :size="16" />
      </button>
    </div>

    <ChatConversation
      ref="conversationRef"
      v-model:threadId="threadId"
      :contextProvider="contextProvider"
      :suggestions="suggestions"
      :allowAttachments="true"
      :canApplyProposals="true"
      :appliedIds="appliedIds"
      placeholder="Describe the form, or ask for changes…"
      @applyProposal="handleApplyProposal"
    >
      <template #emptyTitle>
        {{ isEdit ? 'What should change on this form?' : 'What should this form capture?' }}
      </template>
    </ChatConversation>
  </aside>
</template>
