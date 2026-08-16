<script setup>
/**
 * One read-only approval gate, as a chip row (user request 2026-08-16).
 *
 * The template's approval flow used to render name + roles + "due in N days"
 * and nothing else, so the two facts an auditor actually asks about — is it
 * signed, is a rationale captured — were invisible unless you opened the full
 * workflow builder. This shows the same set, in the same order and the same
 * colours, as WorkflowStepCard's chip row: SLA, E-sign, Comment.
 *
 * Read-only on purpose: this is the view a user without edit rights on the
 * template gets. When they do have rights the same page swaps in
 * DocumentApprovalStepLive, which edits the identical set of fields.
 */
import { IconClock, IconWritingSign, IconMessage } from '@tabler/icons-vue'

defineProps({
  step: { type: Object, required: true },
  index: { type: Number, required: true },
})
</script>

<template>
  <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:text-sm">
    <span
      class="tw:flex tw:h-5 tw:w-5 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full tw:bg-primary/10 tw:text-micro tw:font-semibold tw:text-primary"
    >
      {{ index + 1 }}
    </span>
    <span class="tw:font-medium tw:text-on-sidebar">{{ step.name }}</span>

    <WorkflowStepRoleBadges :stepId="step.id" />

    <!-- ALL/ANY only says anything once more than one person can act on the
         step, which is exactly when roles are present. -->
    <span v-if="step.approvalRule === 'ANY'" class="tw:text-xs tw:text-secondary">
      first approval advances
    </span>

    <span v-if="step.slaDays" class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-secondary">
      <IconClock :size="14" />
      {{ step.slaDays }} day{{ step.slaDays !== 1 ? 's' : '' }}
    </span>

    <span
      v-if="step.requireEsignature"
      class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:font-medium tw:text-amber-700"
    >
      <IconWritingSign :size="14" />
      E-sign
    </span>

    <span
      v-if="step.requireComments"
      class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-secondary"
    >
      <IconMessage :size="14" />
      Comment
    </span>
  </div>
</template>
