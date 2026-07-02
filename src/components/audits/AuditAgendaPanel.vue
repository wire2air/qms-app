<script setup>
/**
 * Supplier-audit agenda (#15/#17). Shown on supplier-type audits.
 *
 * The auditor picks which clauses go in the agenda (from the audit's frozen
 * requirementSchema), adds meeting notes, and sends it to the supplier:
 * grants the supplier's users read-only access to the audit + emails them.
 * Editable + re-sendable — "Send" upserts the agenda and re-notifies.
 */
import { IconCalendarEvent, IconSend, IconCheck, IconPaperclip } from '@tabler/icons-vue'
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.

const props = defineProps({
  auditInstance: { type: Object, required: true },
  readonly: { type: Boolean, default: false },
  // Forwarded to the embedded Document Request list (sent with the agenda).
  docRequestReadonly: { type: Boolean, default: false },
  canManageRequests: { type: Boolean, default: false },
})

const toast = useToast()
const sending = ref(false)

// Clauses with a question (skip pure section headers — they're not auditable
// agenda line items), sorted by clause number.
const clauses = computed(() =>
  [...(props.auditInstance.requirementSchema ?? [])]
    .filter((c) => c.question || c.title)
    .sort((a, b) =>
      String(a.clauseNumber ?? '').localeCompare(String(b.clauseNumber ?? ''), undefined, {
        numeric: true,
      }),
    ),
)

// Selected clause ids — seed from a saved agenda, else all.
const selected = ref(new Set())
const notes = ref('')
watch(
  () => props.auditInstance?.id,
  () => {
    const saved = props.auditInstance?.agenda
    if (saved?.clauseIds?.length) {
      selected.value = new Set(saved.clauseIds)
    } else {
      selected.value = new Set(clauses.value.map((c) => c.requirementId))
    }
    notes.value = saved?.notes ?? ''
  },
  { immediate: true },
)

function toggle(id) {
  if (props.readonly) return
  if (selected.value.has(id)) selected.value.delete(id)
  else selected.value.add(id)
  selected.value = new Set(selected.value) // trigger reactivity
}

const sentAt = computed(() => props.auditInstance?.agenda?.sentAt ?? null)
// Supplier audits send to the supplier's users; internal audits to the auditee.
const recipientLabel = computed(() =>
  props.auditInstance?.programTypeId === 'SUPPLIER' ? 'Supplier' : 'Auditee',
)
function fmt(d) {
  if (!d) return ''
  return new Date(d).toLocaleString()
}

async function send() {
  if (props.readonly || sending.value) return
  if (!selected.value.size) {
    toast.warning('Select at least one clause for the agenda.')
    return
  }
  sending.value = true
  try {
    const res = await post(`/v1/services/auditInstances/${props.auditInstance.id}/agenda`, {
      clauseIds: [...selected.value],
      notes: notes.value?.trim() || null,
    })
    const n = res?.notified ?? 0
    toast.success(n > 0 ? `Agenda sent to ${n} recipient${n === 1 ? '' : 's'}.` : 'Agenda saved.')
  } catch (e) {
    toast.error(e.message || 'Failed to send agenda')
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <BaseCard>
    <BaseText
      variant="overline"
      class="tw:block tw:pb-3 tw:border-b tw:border-divider tw:mb-4 tw:flex tw:items-center tw:gap-2"
    >
      <IconCalendarEvent :size="14" />
      Audit Agenda
      <span
        v-if="sentAt"
        class="tw:font-normal tw:normal-case tw:text-secondary tw:inline-flex tw:items-center tw:gap-1"
      >
        <IconCheck :size="12" class="tw:text-emerald-600" /> Sent {{ fmt(sentAt) }}
      </span>
    </BaseText>

    <p class="tw:text-xs tw:text-secondary tw:mb-3">
      Select the clauses to include in the agenda emailed to the {{ recipientLabel.toLowerCase() }}.
      They get read-only access to this audit and can upload requested documents.
    </p>

    <div
      class="tw:flex tw:flex-col tw:gap-1 tw:max-h-72 tw:overflow-y-auto tw:mb-3 tw:border tw:border-divider tw:rounded tw:p-2"
    >
      <label
        v-for="c in clauses"
        :key="c.requirementId"
        class="tw:flex tw:items-start tw:gap-2 tw:py-1 tw:cursor-pointer tw:text-xs"
      >
        <input
          type="checkbox"
          class="tw:mt-0.5"
          :checked="selected.has(c.requirementId)"
          :disabled="readonly"
          @change="toggle(c.requirementId)"
        />
        <span>
          <span class="tw:font-semibold tw:text-secondary">{{ c.clauseNumber }}</span>
          <span class="tw:text-on-main">
            {{ c.title }}{{ c.question ? `: ${c.question}` : '' }}</span
          >
        </span>
      </label>
      <div v-if="!clauses.length" class="tw:text-xs tw:text-secondary tw:italic tw:py-2">
        No clauses in this audit's standard snapshot.
      </div>
    </div>

    <BaseField v-slot="{ id: fieldId }" label="Agenda notes" class="tw:mb-3">
      <BaseTextarea
        :id="fieldId"
        v-model="notes"
        :rows="3"
        :disabled="readonly"
        placeholder="Meeting time, opening/closing arrangements, site contacts, documents to prepare…"
      />
    </BaseField>

    <!-- Requested documents — sent to the supplier with the agenda. -->
    <div class="tw:mb-3 tw:pt-3 tw:border-t tw:border-divider">
      <p
        class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-2 tw:flex tw:items-center tw:gap-1"
      >
        <IconPaperclip :size="14" /> Requested Documents
      </p>
      <AuditDocumentRequestPanel
        :auditInstance="auditInstance"
        :readonly="docRequestReadonly"
        :canManageRequests="canManageRequests"
      />
    </div>

    <div class="tw:flex tw:items-center tw:justify-between">
      <span class="tw:text-xs tw:text-secondary"
        >{{ selected.size }} of {{ clauses.length }} clauses selected</span
      >
      <BaseButton v-if="!readonly" variant="primary" size="sm" :loading="sending" @click="send">
        <template #icon><IconSend :size="14" /></template>
        {{ sentAt ? `Re-send to ${recipientLabel}` : `Generate & Send to ${recipientLabel}` }}
      </BaseButton>
    </div>
  </BaseCard>
</template>
