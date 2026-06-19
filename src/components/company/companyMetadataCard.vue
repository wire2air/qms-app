<script setup>
import { IconCalendar, IconHistory, IconInfoCircle } from '@tabler/icons-vue'
import { currentCompany } from '@/utils/currentCompany.js'

const company = useLiveQueryWithDeps(
  [() => currentCompany.value?.id],
  async (db, [id]) => {
    if (!id) return null
    return db.Company.findByPk(id)
  },
  { models: ['Company'] },
)

const subscriptionBadgeColor = computed(() => {
  const state = company.value?.subscriptionState?.toUpperCase()
  if (state === 'PREMIUM') return 'tw:bg-purple-100 tw:text-purple-800'
  if (state === 'TRIAL') return 'tw:bg-blue-100 tw:text-blue-800'
  return 'tw:bg-green-100 tw:text-green-800'
})

const statusBadgeColor = computed(() => {
  const state = company.value?.stateId?.toUpperCase()
  if (state === 'ACTIVE') return 'tw:bg-primary/10 tw:text-primary'
  return 'tw:bg-gray-100 tw:text-gray-800'
})

const formattedCreatedAt = computed(() => company.value?.createdAt?.formatDate?.('date'))
const formattedUpdatedAt = computed(() => company.value?.updatedAt?.formatDate?.('date'))
</script>

<template>
  <div v-if="company" class="tw:flex tw:flex-col tw:gap-6">
    <!-- System Information Card -->
    <div class="tw:rounded-xl tw:border tw:border-divider tw:shadow-sm tw:p-6 tw:bg-sidebar">
      <BaseText as="h3" variant="overline" color="inherit" class="tw:text-on-sidebar tw:mb-6">
        System Information
      </BaseText>
      <div class="tw:flex tw:flex-col tw:gap-6">
        <div class="tw:flex tw:justify-between tw:items-center">
          <span class="tw:text-sm tw:text-secondary">Subscription</span>
          <span
            class="tw:inline-flex tw:items-center tw:px-2.5 tw:py-0.5 tw:rounded-full tw:text-xs tw:font-bold"
            :class="subscriptionBadgeColor"
          >
            {{ company.subscriptionState || 'NORMAL' }}
          </span>
        </div>

        <div class="tw:flex tw:justify-between tw:items-center">
          <span class="tw:text-sm tw:text-secondary">Account Status</span>
          <span
            class="tw:inline-flex tw:items-center tw:px-2.5 tw:py-0.5 tw:rounded-full tw:text-xs tw:font-bold"
            :class="statusBadgeColor"
          >
            {{ company.stateId || 'ACTIVE' }}
          </span>
        </div>

        <div class="tw:border-t tw:border-divider tw:pt-4">
          <div class="tw:flex tw:flex-col tw:gap-1">
            <BaseText variant="overline">Created On</BaseText>
            <p
              class="tw:text-sm tw:font-medium tw:text-on-sidebar tw:flex tw:items-center tw:gap-2"
            >
              <IconCalendar :size="16" class="tw:text-secondary" />
              {{ formattedCreatedAt }}
            </p>
          </div>
        </div>

        <div class="tw:pt-2">
          <div class="tw:flex tw:flex-col tw:gap-1">
            <BaseText variant="overline">Last Updated</BaseText>
            <p
              class="tw:text-sm tw:font-medium tw:text-on-sidebar tw:flex tw:items-center tw:gap-2"
            >
              <IconHistory :size="16" class="tw:text-secondary" />
              {{ formattedUpdatedAt }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <div class="tw:rounded-xl tw:bg-primary/5 tw:p-6 tw:border tw:border-primary/10">
      <div class="tw:flex tw:items-start tw:gap-3">
        <IconInfoCircle class="tw:text-primary tw:size-6 tw:shrink-0" />
        <div class="tw:flex tw:flex-col tw:gap-1">
          <p class="tw:text-sm tw:font-bold tw:text-primary">Need help?</p>
          <p class="tw:text-xs tw:text-secondary tw:leading-relaxed">
            Changes to company settings might take up to 5 minutes to reflect across all user
            sessions.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
