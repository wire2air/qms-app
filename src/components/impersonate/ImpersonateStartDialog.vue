<script setup>
// Impersonation start — collects a mandatory reason and the access mode before
// handing off to the tenant subdomain. Read-only is the default and the only
// option for support-tier operators; write mode (separation of duties) is
// offered only to admin-tier+ and is re-checked server-side. The reason + mode
// are recorded in the immutable platform audit trail.
import { IconEye, IconPencil, IconAlertTriangle } from '@tabler/icons-vue'
import { hasPlatformRole } from '@/utils/currentSession.js'

const props = defineProps({
  user: { type: Object, default: null },
})
const show = defineModel({ type: Boolean, default: false })

const reason = ref('')
const reasonError = ref('')
const mode = ref('readonly')

const canWrite = computed(() => hasPlatformRole('admin'))

const MODE_OPTIONS = computed(() => {
  const opts = [{ id: 'readonly', label: 'Read-only (recommended)' }]
  if (canWrite.value) opts.push({ id: 'write', label: 'Write — can make changes' })
  return opts
})

watch(show, (open) => {
  if (open) {
    reason.value = ''
    mode.value = 'readonly'
  }
})

function start() {
  if (!props.user) return
  if (!reason.value.trim()) {
    reasonError.value = 'A reason is required'
    return
  }
  const returnUrl = window.location.pathname
  const params = new URLSearchParams({
    id: props.user.id,
    returnUrl,
    reason: reason.value.trim(),
    mode: mode.value,
  })
  // Full-page navigation to the auth handoff (cross-subdomain), not an XHR.
  window.location.href = `/api/v1/auth/impersonate?${params.toString()}`
}
</script>

<template>
  <BaseDialog
    v-model="show"
    :title="`Impersonate ${user?.firstName || ''} ${user?.lastName || ''}`.trim()"
    subtitle="This access is logged to the platform audit trail."
  >
    <div class="tw:flex tw:flex-col tw:gap-4">
      <div class="tw:text-sm tw:text-secondary">
        {{ user?.email }}
      </div>

      <BaseTextarea
        v-model="reason"
        label="Reason"
        :rows="2"
        :required="true"
        placeholder="e.g. Investigating support ticket #1234"
        @input="reasonError = ''"
      />
      <p v-if="reasonError" class="tw:text-xs tw:text-bad">{{ reasonError }}</p>

      <BaseSelect
        v-model="mode"
        label="Access mode"
        :options="MODE_OPTIONS"
        optionLabel="label"
        optionValue="id"
        :required="true"
        :clearable="false"
      />

      <div
        v-if="mode === 'readonly'"
        class="tw:flex tw:items-start tw:gap-2 tw:rounded-lg tw:bg-blue-50 tw:p-3 tw:text-sm tw:text-blue-800"
      >
        <IconEye :size="18" class="tw:mt-0.5 tw:flex-none" />
        <span>You'll be able to view the workspace but every change is blocked.</span>
      </div>
      <div
        v-else
        class="tw:flex tw:items-start tw:gap-2 tw:rounded-lg tw:bg-amber-50 tw:p-3 tw:text-sm tw:text-amber-800"
      >
        <IconAlertTriangle :size="18" class="tw:mt-0.5 tw:flex-none" />
        <span>
          Write mode lets you change this tenant's data as the user. Use only when strictly
          necessary — every action is attributed to the user, not to you.
        </span>
      </div>
    </div>

    <template #footer="{ close }">
      <BaseButton variant="secondary" @click="close">Cancel</BaseButton>
      <BaseButton :variant="mode === 'write' ? 'danger' : 'primary'" @click="start">
        <template #icon>
          <component :is="mode === 'write' ? IconPencil : IconEye" :size="16" />
        </template>
        Start {{ mode === 'write' ? 'write' : 'read-only' }} session
      </BaseButton>
    </template>
  </BaseDialog>
</template>
