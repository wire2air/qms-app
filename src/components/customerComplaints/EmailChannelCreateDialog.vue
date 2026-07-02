<script setup>
import { IconWorld, IconMailForward } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { required, email } from '@shared/components/form/validators.js'

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

const formRef = ref(null)
const saving = ref(false)
const saveError = ref('')

const channelType = ref('SYSTEM')
const form = ref({ name: '', localPart: '', publicEmail: '' })

watch(model, (open) => {
  if (open) {
    channelType.value = 'SYSTEM'
    form.value = { name: '', localPart: '', publicEmail: '' }
    saveError.value = ''
  }
})

const normalizedLocalPart = computed(() =>
  form.value.localPart.trim().toLowerCase().replace(/\s+/g, ''),
)

function selectType(type) {
  channelType.value = type
  saveError.value = ''
}

async function onValidSubmit() {
  if (saving.value) return
  saving.value = true
  saveError.value = ''
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
    saveError.value = e.message || 'Failed to create address'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="model" title="Add Support Address" maxWidth="lg">
    <BaseForm ref="formRef" hideFooter @submit="onValidSubmit">
      <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
        <!-- Connection type choice -->
        <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
          <BaseClickableRow
            class="tw:rounded-xl tw:border-2 tw:p-4 tw:transition-all"
            :class="
              channelType === 'SYSTEM'
                ? 'tw:border-primary tw:bg-primary/5'
                : 'tw:border-divider tw:hover:border-primary/50'
           "
            aria-label="Create system address"
            @click="selectType('SYSTEM')"
          >
            <div class="tw:flex tw:items-center tw:gap-2 tw:mb-1">
              <IconWorld :size="18" class="tw:text-primary" />
              <span class="tw:text-sm tw:font-bold">Create system address</span>
            </div>
            <p class="tw:text-xs tw:text-secondary">
              A new address on your Qability domain — works immediately, no setup.
            </p>
            <p class="tw:text-xs tw:text-secondary tw:mt-1 tw:break-all">
              support@{{ companyMailDomain }}
            </p>
          </BaseClickableRow>
          <BaseClickableRow
            class="tw:rounded-xl tw:border-2 tw:p-4 tw:transition-all"
            :class="
              channelType === 'FORWARDING'
                ? 'tw:border-primary tw:bg-primary/5'
                : 'tw:border-divider tw:hover:border-primary/50'
           "
            aria-label="Connect external address"
            @click="selectType('FORWARDING')"
          >
            <div class="tw:flex tw:items-center tw:gap-2 tw:mb-1">
              <IconMailForward :size="18" class="tw:text-primary" />
              <span class="tw:text-sm tw:font-bold">Connect external address</span>
            </div>
            <p class="tw:text-xs tw:text-secondary">
              Your own email (support@yourcompany.com) — forward it here, then verify.
            </p>
          </BaseClickableRow>
        </div>

        <!-- Common: name -->
        <BaseField label="Name" :value="form.name">
          <template #default="field">
            <BaseTextInput
              v-bind="field"
              v-model="form.name"
              placeholder="e.g. Customer Support, Quality Complaints…"
            />
          </template>
        </BaseField>

        <!-- SYSTEM: address prefix on the tenant mail subdomain -->
        <BaseField
          v-if="channelType === 'SYSTEM'"
          label="Address prefix"
          required
          :value="form.localPart"
          :rules="[required()]"
          hint="Emails sent to this address become support tickets. No verification required."
        >
          <template #default="field">
            <div class="tw:flex tw:items-center tw:gap-2">
              <BaseTextInput
                v-bind="field"
                v-model="form.localPart"
                placeholder="support, sales, complaints…"
                class="tw:flex-1"
                @keyup.enter="formRef?.submit()"
              />
              <span class="tw:text-sm tw:text-secondary tw:whitespace-nowrap">
                @{{ companyMailDomain }}
              </span>
            </div>
          </template>
        </BaseField>

        <!-- FORWARDING: the tenant's public address -->
        <BaseField
          v-else
          label="Your support email address"
          required
          :value="form.publicEmail"
          :rules="[required(), email()]"
          hint="We'll generate a forwarding address for it. The address creates tickets only after forwarding is set up and verified."
        >
          <template #default="field">
            <BaseTextInput
              v-bind="field"
              v-model="form.publicEmail"
              type="email"
              placeholder="support@yourcompany.com"
              @keyup.enter="formRef?.submit()"
            />
          </template>
        </BaseField>
      </div>
    </BaseForm>
    <template #footer="{ close }">
      <BaseDialogFooter
        :submitLabel="channelType === 'SYSTEM' ? 'Create Address' : 'Connect Address'"
        :loading="saving"
        :error="saveError"
        @cancel="close"
        @submit="formRef?.submit()"
      />
    </template>
  </BaseDialog>
</template>
