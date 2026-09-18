<script setup>
import { IconSearch, IconCornerDownLeft } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { useHelpContent } from '@/composables/useHelpContent.js'

const { search } = useHelpContent()
const router = useRouter()

const query = ref('')
const open = ref(false)
const activeIndex = ref(0)

const results = computed(() => (query.value.trim() ? search(query.value).slice(0, 8) : []))

watch(query, () => {
  activeIndex.value = 0
  open.value = true
})

function go(slug) {
  open.value = false
  query.value = ''
  router.push(getCompanyPath(`/help/${slug}`))
}

function onEnter() {
  const hit = results.value[activeIndex.value]
  if (hit) go(hit.slug)
}

function move(delta) {
  if (!results.value.length) return
  activeIndex.value = (activeIndex.value + delta + results.value.length) % results.value.length
}
</script>

<template>
  <div class="tw:relative" @keydown.escape="open = false">
    <div class="tw:relative">
      <IconSearch
        :size="18"
        class="tw:absolute tw:left-3 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary"
      />
      <BaseTextInput
        v-model="query"
        placeholder="Search help articles…"
        class="tw:pl-10"
        @focus="open = true"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="onEnter"
      />
    </div>

    <div
      v-if="open && query.trim()"
      class="tw:absolute tw:z-20 tw:mt-1 tw:w-full tw:rounded-lg tw:border tw:border-divider tw:bg-card tw:shadow-lg tw:overflow-hidden"
    >
      <button
        v-for="(r, i) in results"
        :key="r.slug"
        type="button"
        class="tw:w-full tw:text-left tw:px-4 tw:py-2.5 tw:flex tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-divider tw:last:border-0"
        :class="i === activeIndex ? 'tw:bg-main-hover' : 'tw:hover:bg-main-hover'"
        @mouseenter="activeIndex = i"
        @click="go(r.slug)"
      >
        <span class="tw:min-w-0">
          <span class="tw:block tw:text-sm tw:font-medium tw:text-on-main tw:truncate">{{ r.title }}</span>
          <span v-if="r.description" class="tw:block tw:text-xs tw:text-secondary tw:truncate">
            {{ r.description }}
          </span>
        </span>
        <IconCornerDownLeft
          v-if="i === activeIndex"
          :size="14"
          class="tw:text-secondary tw:shrink-0"
        />
      </button>
      <div v-if="!results.length" class="tw:px-4 tw:py-6 tw:text-center tw:text-sm tw:text-secondary">
        No articles match “{{ query }}”.
      </div>
    </div>
  </div>
</template>
