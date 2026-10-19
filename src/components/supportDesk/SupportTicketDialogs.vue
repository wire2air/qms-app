<script setup>
import { SNOOZE_PRESETS } from '@/composables/useSupportTicketActions.js'

/**
 * The dialogs behind useSupportTicketActions' verbs (assign / snooze / spam /
 * close / convert-to-NC / audit log). Renderless apart from the dialogs, so a
 * surface mounts it once next to its action bar and forgets about it.
 */
const props = defineProps({
  complaint: { type: Object, default: null },
  // The object returned by useSupportTicketActions(...)
  ticket: { type: Object, required: true },
})

const auditIncludeEntities = computed(() =>
  props.complaint
    ? [
        { entityType: 'CustomerComplaint', entityIds: [props.complaint.id] },
        { entityType: 'CustomerComplaints', entityIds: [props.complaint.id] },
      ]
    : [],
)
</script>

<template>
  <!-- Assign -->
  <BaseDialog v-model="ticket.dialogs.assign" title="Assign ticket" maxWidth="md">
    <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
      <p class="tw:text-sm tw:text-secondary">
        Pick the agent responsible for this ticket. They'll be notified.
      </p>
      <UserSelectMenu v-model="ticket.assignUserId" required />
    </div>
    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Assign"
        :loading="ticket.acting"
        :disabled="!ticket.assignUserId"
        @cancel="close"
        @submit="ticket.submitAssign"
      />
    </template>
  </BaseDialog>

  <!-- Snooze -->
  <BaseDialog v-model="ticket.dialogs.snooze" title="Snooze ticket" maxWidth="md">
    <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
      <p class="tw:text-sm tw:text-secondary">
        Hides the ticket from the open views until the time you pick — or until the customer
        replies, whichever comes first.
      </p>
      <div class="tw:flex tw:flex-wrap tw:gap-2">
        <BaseButton
          v-for="p in SNOOZE_PRESETS"
          :key="p.label"
          size="sm"
          variant="secondary"
          @click="ticket.snoozeUntil = p.pick()"
        >
          {{ p.label }}
        </BaseButton>
      </div>
      <BaseField label="Until">
        <BaseDateField v-model="ticket.snoozeUntil" mode="datetime" />
      </BaseField>
    </div>
    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Snooze"
        :loading="ticket.acting"
        :disabled="!ticket.snoozeUntil"
        @cancel="close"
        @submit="ticket.submitSnooze"
      />
    </template>
  </BaseDialog>

  <!-- Mark as spam + learn -->
  <BaseDialog v-model="ticket.dialogs.spam" title="Mark as spam" maxWidth="md">
    <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
      <p class="tw:text-sm tw:text-secondary">
        The ticket moves to the Spam box (kept, not deleted). Optionally remember the sender so
        future messages land there automatically — you can undo this with “Not spam”.
      </p>
      <label v-if="complaint?.customerEmail" class="tw:flex tw:items-center tw:gap-2 tw:text-sm">
        <BaseCheckbox v-model="ticket.spamLearn.email" />
        Block this address <span class="tw:text-secondary">({{ complaint.customerEmail }})</span>
      </label>
      <label v-if="ticket.senderDomain" class="tw:flex tw:items-center tw:gap-2 tw:text-sm">
        <BaseCheckbox v-model="ticket.spamLearn.domain" />
        Block the whole domain <span class="tw:text-secondary">(@{{ ticket.senderDomain }})</span>
      </label>
      <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm">
        <BaseCheckbox v-model="ticket.spamLearn.allBrands" />
        Apply to every brand <span class="tw:text-secondary">(default: this ticket’s brand)</span>
      </label>
    </div>
    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Mark as spam"
        submitVariant="danger"
        :loading="ticket.acting"
        @cancel="close"
        @submit="ticket.submitSpam"
      />
    </template>
  </BaseDialog>

  <!-- Escalate to Quality -->
  <BaseDialog v-model="ticket.dialogs.escalate" title="Escalate to Quality" maxWidth="md">
    <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
      <p class="tw:text-sm tw:text-secondary">
        Creates a Quality complaint for the QA team with this ticket's subject, description and
        customer details. QA accepts it and decides whether it becomes an NC or CAPA; you keep
        working the ticket here and can follow the complaint's status in the details.
      </p>
      <BaseTextarea
        v-model="ticket.escalateNote"
        :rows="4"
        placeholder="Note for Quality (optional) — what the customer reported, lot numbers, what you already told them…"
      />
    </div>
    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Escalate"
        :loading="ticket.acting"
        @cancel="close"
        @submit="ticket.submitEscalate"
      />
    </template>
  </BaseDialog>

  <!-- Close -->
  <BaseDialog v-model="ticket.dialogs.close" title="Close ticket" maxWidth="md">
    <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
      <p class="tw:text-sm tw:text-on-main">
        Closing marks this ticket as done. If the customer replies, the ticket reopens
        automatically.
      </p>
      <BaseTextarea
        v-model="ticket.closeComment"
        :rows="3"
        placeholder="Closing comment (optional)…"
      />
    </div>
    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Close ticket"
        :loading="ticket.acting"
        @cancel="close"
        @submit="ticket.submitClose"
      />
    </template>
  </BaseDialog>

  <!-- Convert to NC -->
  <CustomerComplaintConvertToNcDialog
    v-model="ticket.dialogs.convert"
    :complaints="complaint ? [complaint] : []"
    @converted="ticket.converted"
  />

  <!-- Audit log -->
  <AuditLogDialog
    v-model="ticket.dialogs.audit"
    :includeEntities="auditIncludeEntities"
    :title="`Audit Log — ${complaint?.complaintNumber ?? 'Ticket'}`"
  />
</template>
