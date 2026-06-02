<script setup>
import { IconArrowLeft } from '@tabler/icons-vue'
import { post } from '@/api'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { currentSession } from '@/utils/currentSession.js'

const router = useRouter()
const toast = useToast()
const saving = ref(false)

const me = computed(() => currentSession.value)
const fullName = computed(() =>
  [me.value?.firstName, me.value?.lastName].filter(Boolean).join(' ').trim() || '',
)

const form = ref({
  subject: '',
  description: '',
  priorityId: 'MEDIUM',
  sourceId: 'MANUAL',
  customerName: fullName.value,
  customerEmail: me.value?.email || '',
  assignedToUserId: null,
  productId: null,
  supplierId: null,
})

async function handleSubmit() {
  if (!form.value.subject?.trim()) {
    toast.notify({ type: 'negative', message: 'Subject is required' })
    return
  }
  saving.value = true
  try {
    // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
    // Server-side allocates the complaint number under a row-level
    // lock; doing it client-side would race with the inbound webhook.
    const res = await post('/v1/services/customerComplaints', form.value)
    toast.notify({
      type: 'positive',
      message: `Ticket ${res?.complaint?.complaintNumber ?? ''} created`,
    })
    const id = res?.complaint?.id
    if (id) {
      router.push(getCompanyPath(`/customer-complaints/${id}`))
    } else {
      router.push(getCompanyPath('/customer-complaints'))
    }
  } catch (err) {
    toast.notify({ type: 'negative', message: err?.message || 'Failed to create ticket' })
  } finally {
    saving.value = false
  }
}

function onCancel() {
  router.push(getCompanyPath('/customer-complaints'))
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3 tw:h-full tw:p-5">
    <SafeTeleport to="#main-header-title">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
        <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-nowrap">New Complaint</h2>
      </div>
    </SafeTeleport>

    <div class="tw:flex tw:items-center tw:gap-2">
      <button
        class="tw:flex tw:items-center tw:gap-1 tw:text-sm tw:text-secondary tw:hover:text-primary"
        @click="onCancel"
      >
        <IconArrowLeft :size="16" />
        <span>Back to tickets</span>
      </button>
    </div>

    <div class="tw:max-w-3xl tw:w-full tw:mx-auto tw:flex tw:flex-col tw:gap-4">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">New customer complaint</div>
        <div class="tw:text-sm tw:text-secondary">
          Log an issue raised through the app. Email-based intake is handled automatically by the
          inbound webhook.
        </div>
      </div>

      <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5 tw:flex tw:flex-col tw:gap-4">
        <div class="tw:flex tw:flex-col tw:gap-1">
          <label class="tw:text-sm tw:font-medium tw:text-secondary">
            Subject <span class="tw:text-red-500">*</span>
          </label>
          <BaseTextInput
            v-model="form.subject"
            placeholder="Short summary of the issue"
            autofocus
          />
        </div>

        <div class="tw:flex tw:flex-col tw:gap-1">
          <label class="tw:text-sm tw:font-medium tw:text-secondary">Description</label>
          <BaseTextarea
            v-model="form.description"
            placeholder="What happened, when, and any details that will help the agent triage…"
            rows="5"
          />
        </div>

        <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3">
          <div class="tw:flex tw:flex-col tw:gap-1">
            <label class="tw:text-sm tw:font-medium tw:text-secondary">Priority</label>
            <CustomerComplaintPrioritySelectMenu v-model="form.priorityId" />
          </div>
          <div class="tw:flex tw:flex-col tw:gap-1">
            <label class="tw:text-sm tw:font-medium tw:text-secondary">Source</label>
            <CustomerComplaintSourceSelectMenu v-model="form.sourceId" />
          </div>

          <div class="tw:flex tw:flex-col tw:gap-1">
            <label class="tw:text-sm tw:font-medium tw:text-secondary">Customer name</label>
            <BaseTextInput
              v-model="form.customerName"
              placeholder="Pre-filled from your profile"
            />
          </div>
          <div class="tw:flex tw:flex-col tw:gap-1">
            <label class="tw:text-sm tw:font-medium tw:text-secondary">Customer email</label>
            <BaseTextInput
              v-model="form.customerEmail"
              type="email"
              placeholder="customer@example.com"
            />
          </div>

          <div class="tw:flex tw:flex-col tw:gap-1">
            <label class="tw:text-sm tw:font-medium tw:text-secondary">Assign to</label>
            <UserSelectMenu v-model="form.assignedToUserId" />
          </div>
        </div>

        <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3">
          <div class="tw:flex tw:flex-col tw:gap-1">
            <label class="tw:text-sm tw:font-medium tw:text-secondary">
              Product <span class="tw:font-normal tw:text-secondary tw:ml-1">(optional)</span>
            </label>
            <ProductSelectMenu v-model="form.productId" :required="false" />
          </div>
          <div class="tw:flex tw:flex-col tw:gap-1">
            <label class="tw:text-sm tw:font-medium tw:text-secondary">
              Supplier <span class="tw:font-normal tw:text-secondary tw:ml-1">(optional)</span>
            </label>
            <SupplierSelectMenu v-model="form.supplierId" :required="false" />
          </div>
        </div>
      </div>

      <div class="tw:flex tw:items-center tw:justify-end tw:gap-2">
        <BaseButton variant="outline" :disabled="saving" @click="onCancel">Cancel</BaseButton>
        <BaseButton variant="primary" :loading="saving" :disabled="saving" @click="handleSubmit">
          Create ticket
        </BaseButton>
      </div>
    </div>
  </div>
</template>
