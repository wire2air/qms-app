<script setup>
import { IconArrowLeft, IconChevronRight, IconPrinter } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { useValidationContent } from '@/composables/useValidationContent.js'

/**
 * One validation document, on screen, with a Print action.
 *
 * The Print action is the point of the page: these documents exist to be
 * executed on paper and filed. It routes to the shared print dispatcher
 * (`/print?module=ValidationProtocol&slug=…`) rather than calling
 * window.print() on this view, so protocols get the same company header,
 * orientation toggle and page setup as every other printable in the app.
 *
 * Landscape is the sensible default for a test-step table with blank
 * execution columns, and PrintLayout lets the user flip it.
 */
const props = defineProps({
  slug: { type: String, required: true },
})

const { getArticle, grouped, categoryLabel } = useValidationContent()

const article = computed(() => getArticle(props.slug))

// Sibling documents in the same part of the package, for the side rail.
const siblings = computed(() => {
  if (!article.value) return []
  const group = grouped().find((g) => g.dir === article.value.category)
  return group?.articles.filter((a) => a.slug !== article.value.slug) ?? []
})

const validationHome = computed(() => getCompanyPath('/validation'))
const printTo = computed(() =>
  getCompanyPath(`/print?module=ValidationProtocol&slug=${encodeURIComponent(props.slug)}`),
)
</script>

<template>
  <div v-if="article" class="tw:max-w-5xl tw:mx-auto tw:px-6 tw:py-6">
    <nav class="tw:flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-secondary tw:mb-4">
      <RouterLink :to="validationHome" class="tw:hover:text-primary">Validation</RouterLink>
      <IconChevronRight :size="13" />
      <span>{{ categoryLabel(article.category) }}</span>
      <IconChevronRight :size="13" />
      <span class="tw:text-on-main tw:font-medium tw:truncate">{{ article.title }}</span>
    </nav>

    <div class="tw:grid tw:grid-cols-1 tw:lg:grid-cols-[1fr_240px] tw:gap-8">
      <article>
        <div class="tw:flex tw:items-start tw:justify-between tw:gap-4 tw:mb-2">
          <h1 class="tw:text-2xl tw:font-semibold tw:tracking-tight tw:text-on-main">
            {{ article.title }}
          </h1>
          <RouterLink
            :to="printTo"
            target="_blank"
            class="tw:shrink-0 tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-md tw:border tw:border-divider tw:px-3 tw:py-1.5 tw:text-sm tw:font-medium tw:text-on-main tw:hover:bg-main-hover"
          >
            <IconPrinter :size="15" /> Print
          </RouterLink>
        </div>
        <p v-if="article.description" class="tw:text-secondary tw:mb-5">
          {{ article.description }}
        </p>
        <ValidationArticleBody :slug="slug" />
      </article>

      <aside v-if="siblings.length" class="tw:lg:border-l tw:lg:border-divider tw:lg:pl-6">
        <BaseText variant="overline" class="tw:block tw:mb-3">
          More in {{ categoryLabel(article.category) }}
        </BaseText>
        <ul class="tw:flex tw:flex-col tw:gap-2">
          <li v-for="s in siblings" :key="s.slug">
            <RouterLink
              :to="getCompanyPath(`/validation/${s.slug}`)"
              class="tw:text-sm tw:text-secondary tw:hover:text-primary"
            >
              {{ s.title }}
            </RouterLink>
          </li>
        </ul>
      </aside>
    </div>
  </div>

  <div v-else class="tw:max-w-2xl tw:mx-auto tw:px-6 tw:py-16 tw:text-center">
    <p class="tw:text-on-main tw:font-medium tw:mb-1">Document not found</p>
    <p class="tw:text-sm tw:text-secondary tw:mb-6">
      The validation document “{{ slug }}” doesn’t exist or has moved.
    </p>
    <RouterLink
      :to="validationHome"
      class="tw:inline-flex tw:items-center tw:gap-1.5 tw:text-sm tw:font-medium tw:text-primary"
    >
      <IconArrowLeft :size="16" /> Back to the Validation Package
    </RouterLink>
  </div>
</template>
