<script setup>
import { IconHelpCircle, IconExternalLink } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { useHelpContent } from '@/composables/useHelpContent.js'

/**
 * Contextual help launcher. Drop `<HelpButton slug="KB/quality/capas" />` next to
 * a page/section title; clicking opens the help article inline in a dialog (so the
 * user keeps their place), with an "Open full article" escape to the Help Center.
 * Slugs map to `content/help/**` (see the bundle built by build-help-content.mjs).
 */
const props = defineProps({
  slug: { type: String, required: true },
  // Optional text beside the icon (e.g. "Help"); icon-only when empty.
  label: { type: String, default: '' },
  size: { type: Number, default: 16 },
})

const { getArticle } = useHelpContent()
const open = ref(false)
const article = computed(() => getArticle(props.slug))
const fullPath = computed(() => getCompanyPath(`/help/${props.slug}`))
</script>

<template>
  <button
    type="button"
    class="tw:inline-flex tw:items-center tw:gap-1 tw:text-secondary tw:hover:text-primary tw:transition-colors"
    :aria-label="`Help: ${article?.title || slug}`"
    @click="open = true"
  >
    <IconHelpCircle :size="size" />
    <span v-if="label" class="tw:text-sm tw:font-medium">{{ label }}</span>
  </button>

  <BaseDialog v-model="open" :title="article?.title || 'Help'" size="2xl">
    <div class="tw:max-h-[70vh] tw:overflow-y-auto tw:px-1">
      <HelpArticleBody :slug="slug" />
      <RouterLink
        :to="fullPath"
        class="tw:mt-5 tw:inline-flex tw:items-center tw:gap-1.5 tw:text-sm tw:font-medium tw:text-primary tw:hover:underline"
        @click="open = false"
      >
        Open full article
        <IconExternalLink :size="15" />
      </RouterLink>
    </div>
  </BaseDialog>
</template>
