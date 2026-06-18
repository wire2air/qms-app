<script setup>
import { IconArrowLeft, IconChevronRight } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { useHelpContent } from '@/composables/useHelpContent.js'

const props = defineProps({
  slug: { type: String, required: true },
})

const { getArticle, grouped, categoryLabel } = useHelpContent()

const article = computed(() => getArticle(props.slug))

// Sibling articles in the same category, for the "More in …" rail.
const siblings = computed(() => {
  if (!article.value) return []
  const group = grouped().find((g) => g.dir === article.value.category)
  return group?.articles.filter((a) => a.slug !== article.value.slug) ?? []
})

const helpHome = computed(() => getCompanyPath('/help'))
</script>

<template>
  <div v-if="article" class="tw:max-w-5xl tw:mx-auto tw:px-6 tw:py-6">
    <!-- Breadcrumb -->
    <nav class="tw:flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-secondary tw:mb-4">
      <RouterLink :to="helpHome" class="tw:hover:text-primary">Help</RouterLink>
      <IconChevronRight :size="13" />
      <span>{{ categoryLabel(article.category) }}</span>
      <IconChevronRight :size="13" />
      <span class="tw:text-on-main tw:font-medium tw:truncate">{{ article.title }}</span>
    </nav>

    <div class="tw:grid tw:grid-cols-1 tw:lg:grid-cols-[1fr_240px] tw:gap-8">
      <article>
        <h1 class="tw:text-2xl tw:font-bold tw:text-on-main tw:mb-2">{{ article.title }}</h1>
        <HelpArticleBody :slug="slug" />
      </article>

      <aside v-if="siblings.length" class="tw:lg:border-l tw:lg:border-divider tw:lg:pl-6">
        <BaseText variant="overline" class="tw:block tw:mb-3">
          More in {{ categoryLabel(article.category) }}
        </BaseText>
        <ul class="tw:flex tw:flex-col tw:gap-2">
          <li v-for="s in siblings" :key="s.slug">
            <RouterLink
              :to="getCompanyPath(`/help/${s.slug}`)"
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
    <p class="tw:text-on-main tw:font-medium tw:mb-1">Article not found</p>
    <p class="tw:text-sm tw:text-secondary tw:mb-6">
      The help article “{{ slug }}” doesn’t exist or has moved.
    </p>
    <RouterLink
      :to="helpHome"
      class="tw:inline-flex tw:items-center tw:gap-1.5 tw:text-sm tw:font-medium tw:text-primary"
    >
      <IconArrowLeft :size="16" /> Back to Help Center
    </RouterLink>
  </div>
</template>
