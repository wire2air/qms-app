<script setup>
import { IconBuilding, IconChevronRight } from '@tabler/icons-vue'
import { useImpersonate } from '@/composables/useImpersonate.js'
import { getCompanyPath } from '@/utils/routeHelpers'

const { companies } = useImpersonate()
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-2">
    <BaseClickableRow
      v-for="company in companies"
      :key="company.id"
      :to="getCompanyPath(`/admin/impersonate/${company.id}`)"
      class="tw:block tw:p-3 tw:hover:bg-main-hover tw:transition-colors tw:rounded-xl tw:border tw:border-divider"
      :aria-label="`Impersonate company ${company.name}`"
    >
      <div class="tw:flex tw:items-center tw:gap-3">
        <div v-if="company.companyIconUrl" class="tw:flex-none">
          <img :src="company.companyIconUrl" alt="Company" class="tw:w-12 tw:h-12 tw:rounded" />
        </div>
        <div
          v-else
          class="tw:bg-primary tw:flex tw:items-center tw:justify-center tw:rounded-lg tw:size-12 tw:text-white"
        >
          <IconBuilding :size="24" />
        </div>

        <div class="tw:flex-1 tw:min-w-0">
          <div class="tw:text-lg tw:font-bold tw:text-on-main">{{ company.name }}</div>
          <div class="tw:text-sm tw:text-secondary">{{ company.code }}</div>
          <div v-if="company.defaultTimeZone" class="tw:text-xs tw:text-secondary tw:mt-1">
            {{ company.defaultTimeZone }}
          </div>
        </div>

        <IconChevronRight :size="24" class="tw:text-secondary" />
      </div>
    </BaseClickableRow>
  </div>
</template>
