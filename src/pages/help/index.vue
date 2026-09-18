<script setup>
import { IconBook, IconCertificate, IconChevronRight } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { useHelpContent } from '@/composables/useHelpContent.js'

const pageInfo = usePageInfo()
pageInfo.value = { showHeader: true }

const { grouped } = useHelpContent()
const groups = grouped()
</script>

<template>
  <div class="tw:max-w-5xl tw:mx-auto tw:px-6 tw:py-8">
    <div class="tw:mb-8">
      <h1 class="tw:text-2xl tw:font-semibold tw:tracking-tight tw:text-on-main tw:mb-1">
        Help Center
      </h1>
      <p class="tw:text-secondary tw:mb-5">
        Guides and reference for using the Qability QMS. Search, or browse by topic below.
      </p>
      <div class="tw:max-w-xl">
        <HelpSearch />
      </div>
    </div>

    <!-- Cross-link, not a category. Someone searching Help for "validation"
         wants the qualification protocols, which live in their own section
         because they are executed and signed rather than read. -->
    <RouterLink
      :to="getCompanyPath('/validation')"
      class="tw:group tw:mb-5 tw:flex tw:items-center tw:gap-3 tw:rounded-xl tw:border tw:border-divider tw:bg-card tw:p-4 tw:no-underline tw:hover:bg-main-hover"
    >
      <IconCertificate :size="20" class="tw:shrink-0 tw:text-primary" />
      <span class="tw:min-w-0 tw:flex-1">
        <span class="tw:block tw:text-sm tw:font-medium tw:text-on-main">Validation Package</span>
        <span class="tw:block tw:text-sm tw:text-secondary">
          Qualification protocols for validating the system in a regulated environment — VMP, 21 CFR
          Part 11 assessment, IQ, and OQ test scripts for each module.
        </span>
      </span>
      <IconChevronRight :size="16" class="tw:shrink-0 tw:text-secondary" />
    </RouterLink>

    <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-5">
      <div
        v-for="group in groups"
        :key="group.dir"
        class="tw:bg-card tw:rounded-xl tw:border tw:border-divider tw:p-5"
      >
        <div class="tw:flex tw:items-center tw:gap-2 tw:mb-3">
          <IconBook :size="18" class="tw:text-primary" />
          <BaseText variant="overline">{{ group.label }}</BaseText>
        </div>
        <ul class="tw:flex tw:flex-col tw:gap-1">
          <li v-for="a in group.articles" :key="a.slug">
            <RouterLink
              :to="getCompanyPath(`/help/${a.slug}`)"
              class="tw:group tw:flex tw:items-center tw:justify-between tw:gap-2 tw:rounded-md tw:px-2 tw:py-1.5 tw:hover:bg-main-hover"
            >
              <span class="tw:text-sm tw:text-on-main tw:truncate">{{ a.title }}</span>
              <IconChevronRight
                :size="15"
                class="tw:text-secondary tw:opacity-0 tw:group-hover:opacity-100 tw:shrink-0"
              />
            </RouterLink>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
