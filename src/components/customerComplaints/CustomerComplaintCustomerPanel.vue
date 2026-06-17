<script setup>
import { IconUser, IconBuilding } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'

/**
 * Customer panel — the requester layer in action: linked customer
 * profile, their organization, and their previous complaints (the
 * "4th complaint this quarter" view). Snapshot fields on the ticket
 * stay the immutable record; this panel is the live profile.
 */
const props = defineProps({
  complaintId: { type: String, required: true },
  customerId: { type: String, default: null },
})

const customer = useLiveQueryWithDeps(
  [() => props.customerId],
  async (db, [id]) => {
    if (!id) return null
    return db.Customer.findByPk(id)
  },
  { models: ['Customer'] },
)

const organization = useLiveQueryWithDeps(
  [() => customer.value?.organizationId],

  async (db, [orgId]) => {
    if (!orgId) return null
    return db.CustomerOrganization.findByPk(orgId)
  },
  { models: ['CustomerOrganization'] },
)

// Previous complaints from the same customer (excluding this one).
const history = useLiveQueryWithDeps(
  [() => props.customerId, () => props.complaintId],
  async (db, [customerId, complaintId]) => {
    if (!customerId) return []
    const rows = await db.CustomerComplaint.where('customerId', customerId).exec()
    return rows
      .filter((r) => r.id !== complaintId && !r.isSpam)
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      .slice(0, 8)
  },

  { models: ['CustomerComplaint'], initial: [] },
)
</script>

<template>
  <div v-if="customerId" class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4">
    <div class="tw:flex tw:items-center tw:gap-2 tw:pb-2 tw:border-b tw:border-divider tw:mb-3">
      <IconUser :size="16" class="tw:text-primary" />
      <BaseText variant="overline">Customer Profile</BaseText>
    </div>

    <div class="tw:flex tw:flex-col tw:gap-1">
      <div class="tw:text-sm tw:font-medium">{{ customer?.name || customer?.email || '—' }}</div>
      <div v-if="customer?.email" class="tw:text-xs tw:text-secondary">{{ customer.email }}</div>
      <div
        v-if="organization"
        class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-secondary"
      >
        <IconBuilding :size="12" />
        {{ organization.name }}
      </div>
    </div>

    <div class="tw:mt-3 tw:pt-2 tw:border-t tw:border-divider">
      <div class="tw:text-xs tw:font-semibold tw:text-secondary tw:mb-1.5">
        Previous complaints {{ history.length ? `(${history.length})` : '' }}
      </div>
      <div v-if="history.length" class="tw:flex tw:flex-col tw:gap-1.5">
        <RouterLink
          v-for="prev in history"
          :key="prev.id"
          :to="getCompanyPath(`/customer-complaints/${prev.id}`)"
          class="tw:flex tw:items-center tw:gap-2 tw:text-xs tw:hover:bg-main-hover tw:rounded tw:px-1.5 tw:py-1"
        >
          <span class="tw:font-mono tw:text-secondary tw:shrink-0">{{ prev.complaintNumber }}</span>
          <span class="tw:truncate tw:flex-1">{{ prev.subject }}</span>
          <CustomerComplaintStatusBadgeById :statusId="prev.statusId" class="tw:shrink-0" />
        </RouterLink>
      </div>
      <p v-else class="tw:text-xs tw:text-secondary tw:italic">
        First complaint from this customer.
      </p>
    </div>
  </div>
</template>
