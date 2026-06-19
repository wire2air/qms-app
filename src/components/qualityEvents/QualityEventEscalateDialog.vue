<script setup>
import { post } from '@/api'

const props = defineProps({ eventId: { type: String, required: true } })
const emit = defineEmits(['escalated'])
const open = defineModel({ type: Boolean, default: false })
const toast = useToast()
const saving = ref(false)
const targetType = ref('Nonconformance')

// Targets wired today. (Customer Complaint escalation is deferred — its create
// needs customer + SLA context that doesn't map to an internal observation.)
const TARGETS = [
  { value: 'Nonconformance', label: 'Nonconformance (NC)', help: 'Raise a formal nonconformance from this event.' },
  { value: 'Capa', label: 'CAPA', help: 'Open a corrective/preventive action (source: Internal Observation).' },
  { value: 'ChangeRequest', label: 'Change Request', help: 'Initiate a change request from this event.' },
]

watch(open, (v) => {
  if (v) targetType.value = 'Nonconformance'
})

async function handleEscalate(close) {
  saving.value = true
  try {
    const res = await post(`/v1/services/qualityEvents/${props.eventId}/escalate`, {
      targetType: targetType.value,
    })
    close?.()
    emit('escalated', res?.target ?? null)
  } catch (e) {
    toast.error(e.message || 'Escalation failed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="open" title="Escalate Event" maxWidth="md">
    <div class="tw:flex tw:flex-col tw:gap-2 tw:p-1">
      <p class="tw:text-sm tw:text-secondary">
        Spawn a formal record from this event. The new record is created as a DRAFT, linked back to
        this event, and the event is marked <strong>Escalated</strong>. You can refine the new record
        afterwards.
      </p>
      <div class="tw:flex tw:flex-col tw:gap-2 tw:mt-2">
        <div
          v-for="t in TARGETS"
          :key="t.value"
          role="radio"
          :aria-checked="targetType === t.value"
          tabindex="0"
          class="tw:flex tw:items-start tw:gap-3 tw:border tw:border-divider tw:rounded-lg tw:p-3 tw:cursor-pointer"
          :class="targetType === t.value ? 'tw:border-primary tw:bg-primary/5' : ''"
          @click="targetType = t.value"
          @keydown.enter.prevent="targetType = t.value"
          @keydown.space.prevent="targetType = t.value"
        >
          <input v-model="targetType" type="radio" :value="t.value" class="tw:mt-1" tabindex="-1" />
          <span>
            <span class="tw:block tw:font-medium tw:text-on-main">{{ t.label }}</span>
            <span class="tw:block tw:text-xs tw:text-secondary">{{ t.help }}</span>
          </span>
        </div>
      </div>
    </div>
    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Escalate"
        :loading="saving"
        :disabled="saving"
        @cancel="close"
        @submit="() => handleEscalate(close)"
      />
    </template>
  </BaseDialog>
</template>
