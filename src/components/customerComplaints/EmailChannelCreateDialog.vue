<script setup>
import { IconWorld, IconMailForward } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'

/**
 * Zendesk "Add address" flow: choose between creating a system address
 * on the tenant's mail subdomain (no verification) or connecting an
 * external address via forwarding (verification round trip).
 */
defineProps({
  companyMailDomain: { type: String, required: true },
})

const emit = defineEmits(['created'])
const model = defineModel({ type: Boolean, default: false })

const toast = useToast()
const saving = ref(false)

const channelType = ref('SYSTEM')
const form = ref({ name: '', localPart: '', publicEmail: '' })

watch(model, (open) => {
  if (open) {
    channelType.value = 'SYSTEM'
    form.value = { name: '', localPart: '', publicEmail: '' }
  }
})

const normalizedLocalPart = computed(() =>
  form.value.localPart.trim().toLowerCase().replace(/\s+/g, ''),
)

const canSubmit = computed(() =>
  channelType.value === 'SYSTEM'
    ? !!normalizedLocalPart.value
    : form.value.publicEmail.trim().includes('@'),
)

async function handleCreate() {
  if (!canSubmit.value || saving.value) return
  saving.value = true
  try {
    const response = await post('/v1/services/customerComplaints/emailChannels', {
      channelType: channelType.value,
      name: form.value.name.trim() || null,
      localPart: channelType.value === 'SYSTEM' ? normalizedLocalPart.value : null,
      publicEmail:
        channelType.value === 'FORWARDING' ? form.value.publicEmail.trim().toLowerCase() : null,
    })
    model.value = false
    emit('created', response)
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Failed to create address' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="model" title="Add Support Address" maxWidth="lg">
    <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
      <!-- Connection type choice -->
      <div class="tw:grid tw:grid-cols-2 tw:gap-3">
        <div
          class="tw:rounded-xl tw:border-2 tw:p-4 tw:cursor-pointer tw:transition-all"
          :class="
            channelType === 'SYSTEM'
              ? 'tw:border-primary tw:bg-primary/5'
              : 'tw:border-divider tw:hover:border-primary/50'
          "
          @click="channelType = 'SYSTEM'"
        >
          <div class="tw:flex tw:items-center tw:gap-2 tw:mb-1">
            <IconWorld :size="18" class="tw:text-primary" />
            <span class="tw:text-sm tw:font-bold">Create system address</span>
          </div>
          <p class="tw:text-xs tw:text-secondary">
            A new address on your Qability domain — works immediately, no setup.
          </p>
          <p class="tw:text-xs tw:font-mono tw:text-secondary tw:mt-1">
            support@{{ companyMailDomain }}
          </p>
        </div>
        <div
          class="tw:rounded-xl tw:border-2 tw:p-4 tw:cursor-pointer tw:transition-all"
          :class="
            channelType === 'FORWARDING'
              ? 'tw:border-primary tw:bg-primary/5'
              : 'tw:border-divider tw:hover:border-primary/50'
          "
          @click="channelType = 'FORWARDING'"
        >
          <div class="tw:flex tw:items-center tw:gap-2 tw:mb-1">
            <IconMailForward :size="18" class="tw:text-primary" />
            <span class="tw:text-sm tw:font-bold">Connect external address</span>
          </div>
          <p class="tw:text-xs tw:text-secondary">
            Your own email (support@yourcompany.com) — forward it here, then verify.
          </p>
        </div>
      </div>

      <!-- Common: name -->
      <div class="tw:flex tw:flex-col tw:gap-1">
        <label class="tw:text-sm tw:font-medium tw:text-secondary">Name</label>
        <BaseTextInput
          v-model="form.name"
          placeholder="e.g. Customer Support, Quality Complaints…"
        />
      </div>

      <!-- SYSTEM: address prefix on the tenant mail subdomain -->
      <div v-if="channelType === 'SYSTEM'" class="tw:flex tw:flex-col tw:gap-1">
        <label class="tw:text-sm tw:font-medium tw:text-secondary">
          Address prefix <span class="tw:text-red-500">*</span>
        </label>
        <div class="tw:flex tw:items-center tw:gap-2">
          <BaseTextInput
            v-model="form.localPart"
            placeholder="support, sales, complaints…"
            class="tw:flex-1"
            @keyup.enter="handleCreate"
          />
          <span class="tw:text-sm tw:font-mono tw:text-secondary tw:whitespace-nowrap">
            @{{ companyMailDomain }}
          </span>
        </div>
        <p class="tw:text-xs tw:text-secondary">
          Emails sent to this address become support tickets. No verification required.
        </p>
      </div>

      <!-- FORWARDING: the tenant's public address -->
      <div v-else class="tw:flex tw:flex-col tw:gap-1">
        <label class="tw:text-sm tw:font-medium tw:text-secondary">
          Your support email address <span class="tw:text-red-500">*</span>
        </label>
        <BaseTextInput
          v-model="form.publicEmail"
          type="email"
          placeholder="support@yourcompany.com"
          @keyup.enter="handleCreate"
        />
        <p class="tw:text-xs tw:text-secondary">
          We'll generate a forwarding address for it. The address creates tickets only after
          forwarding is set up and verified.
        </p>
      </div>
    </div>
    <template #footer="{ close }">
      <BaseButton variant="outline" :disabled="saving" @click="close">Cancel</BaseButton>
      <BaseButton variant="primary" :disabled="!canSubmit || saving" @click="handleCreate">
        {{ saving ? 'Creating…' : channelType === 'SYSTEM' ? 'Create Address' : 'Connect Address' }}
      </BaseButton>
    </template>
  </BaseDialog>
</template>
