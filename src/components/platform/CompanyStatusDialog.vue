<script setup>
// Change a tenant's lifecycle status (active/trial/suspended/locked/cancelled).
// Suspending/locking a tenant makes every request from its users return 423
// (platform admins exempt) — so a reason is mandatory for non-active states.
// Audited server-side as COMPANY_SET_STATUS.
import { IconAlertTriangle } from '@tabler/icons-vue'
import { setCompanyStatus, COMPANY_STATUSES } from '@/api/platform.js'

const props = defineProps({
  company: { type: Object, default: null },
})
const emit = defineEmits(['updated'])
const show = defineModel({ type: Boolean, default: false })

const status = ref(null)
const reason = ref('')
const reasonError = ref('')
const saving = ref(false)

// Non-active states gate the whole tenant — require an operator reason.
const RESTRICTIVE = ['suspended', 'locked', 'cancelled']
const isRestrictive = computed(() => RESTRICTIVE.includes(status.value))

watch(show, (open) => {
  if (open && props.company) {
    status.value = props.company.status
    reason.value = props.company.statusReason || ''
  }
})

async function handleSave() {
  if (!props.company || !status.value) return
  if (isRestrictive.value && !reason.value.trim()) {
    reasonError.value = 'A reason is required for this status'
    return
  }
  saving.value = true
  try {
    await setCompanyStatus(props.company.id, status.value, reason.value.trim() || null)
    emit('updated', status.value)
    show.value = false
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="show" :title="`Set status — ${company?.name || ''}`">
    <div class="tw:flex tw:flex-col tw:gap-4">
      <BaseSelect
        v-model="status"
        label="Status"
        :options="COMPANY_STATUSES"
        optionLabel="label"
        optionValue="id"
        :required="true"
        :clearable="false"
      />

      <BaseTextarea
        v-model="reason"
        label="Reason"
        :rows="3"
        :required="isRestrictive"
        placeholder="Why is this tenant's status changing? (visible in the platform audit trail)"
        @input="reasonError = ''"
      />
      <p v-if="reasonError" class="tw:text-xs tw:text-bad">{{ reasonError }}</p>

      <div
        v-if="isRestrictive"
        class="tw:flex tw:items-start tw:gap-2 tw:rounded-lg tw:bg-amber-50 tw:p-3 tw:text-sm tw:text-amber-800"
      >
        <IconAlertTriangle :size="18" class="tw:mt-0.5 tw:flex-none" />
        <span>
          Users of this tenant will be blocked (HTTP 423) on every request until it is
          reactivated. Platform operators remain exempt.
        </span>
      </div>
    </div>

    <template #footer="{ close }">
      <BaseButton variant="secondary" :disabled="saving" @click="close">Cancel</BaseButton>
      <BaseButton variant="primary" :disabled="saving" @click="handleSave">
        {{ saving ? 'Saving…' : 'Save status' }}
      </BaseButton>
    </template>
  </BaseDialog>
</template>
