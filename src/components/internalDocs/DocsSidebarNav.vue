<script setup>
/**
 * In-pack navigation rail for the reading view: the module name linking back
 * to its pack home, then every doc grouped 00→20 (+ prior cycle), with the
 * current doc highlighted.
 */
import { getCompanyPath } from '@/utils/routeHelpers.js'

const props = defineProps({
  moduleSlug: { type: String, required: true },
  activeId: { type: String, default: null },
})

const { modulesBySlug } = useInternalDocs()

const module = computed(() => modulesBySlug.value.get(props.moduleSlug))
</script>

<template>
  <nav v-if="module" aria-label="Pack contents" class="tw:flex tw:flex-col tw:gap-4 tw:text-sm">
    <RouterLink
      :to="getCompanyPath(`/docs/${module.slug}`)"
      class="tw:font-semibold tw:text-on-main tw:no-underline tw:hover:text-primary"
    >
      {{ module.name }}
    </RouterLink>

    <div v-for="group in module.groups" :key="group.key" class="tw:flex tw:flex-col tw:gap-0.5">
      <p class="tw:mb-1 tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary">
        {{ group.label }}
      </p>
      <RouterLink
        v-for="doc in group.docs"
        :key="doc.id"
        :to="getCompanyPath(`/docs/${doc.id}`)"
        class="tw:flex tw:items-baseline tw:gap-2 tw:rounded-md tw:px-2 tw:py-1 tw:no-underline tw:transition-colors"
        :class="
          doc.id === activeId
            ? 'tw:bg-main-selected tw:text-primary'
            : 'tw:text-secondary tw:hover:bg-main-hover tw:hover:text-on-main'
        "
      >
        <span v-if="doc.number != null" class="tw:w-5 tw:shrink-0 tw:text-caption tw:tabular-nums">
          {{ String(doc.number).padStart(2, '0') }}
        </span>
        <span class="tw:truncate">{{ doc.title }}</span>
      </RouterLink>
    </div>
  </nav>
</template>
