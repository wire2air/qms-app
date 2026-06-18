<script setup>
import { IconBook, IconChevronRight } from '@tabler/icons-vue'
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
      <h1 class="tw:text-2xl tw:font-bold tw:text-on-main tw:mb-1">Help Center</h1>
      <p class="tw:text-secondary tw:mb-5">
        Guides and reference for using the Qability QMS. Search, or browse by topic below.
      </p>
      <div class="tw:max-w-xl">
        <HelpSearch />
      </div>
    </div>

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
