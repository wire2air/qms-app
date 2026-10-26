<script setup>
import { IconMenu2 } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'

/**
 * The desk portal around a page that is not the inbox (Tickets, a ticket, a
 * new ticket, Reports): the desk's rail on the left, a top bar, the page.
 * The top bar carries the same title/actions slots as the QMS header, so a
 * page built with PageHeader shows its title and buttons here unchanged.
 */
defineProps({ view: { type: String, default: '' } })
const router = useRouter()
const isNarrow = useMediaQuery('(max-width: 1023px)')
const railOpen = ref(false)
const route = useRoute()
watch(
  () => route.fullPath,
  () => (railOpen.value = false),
)
const brands = useLiveQuery(
  async (db) =>
    (await db.SupportBrand.where().exec())
      .filter((b) => b.stateId !== 'INACTIVE')
      .sort((a, b) => a.name.localeCompare(b.name)),
  { models: ['SupportBrand'], initial: [] },
)
function openView(view) {
  router.push(getCompanyPath(`/desk/${view}`))
}
</script>

<template>
  <div class="tw:flex tw:h-screen tw:w-full tw:overflow-hidden tw:bg-main tw:text-on-main">
    <SupportDeskRail
      :view="view"
      :counts="{}"
      :brands="brands"
      :open="railOpen || !isNarrow"
      :overlay="isNarrow"
      @select="openView"
      @close="railOpen = false"
    />
    <div class="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col">
      <header
        class="tw:flex tw:min-h-12 tw:items-center tw:gap-2 tw:border-b tw:border-divider tw:bg-card tw:px-4 tw:py-2"
      >
        <button
          v-if="isNarrow"
          type="button"
          class="tw:rounded-md tw:p-1 tw:text-secondary tw:hover:bg-main-hover"
          aria-label="Open menu"
          @click="railOpen = true"
        >
          <IconMenu2 :size="18" />
        </button>
        <div id="main-header-title" class="tw:min-w-0 tw:flex-1" />
        <div id="main-header-actions" class="tw:flex tw:items-center tw:gap-1 tw:sm:gap-2" />
      </header>
      <main class="tw:min-h-0 tw:flex-1 tw:overflow-y-auto">
        <slot />
      </main>
    </div>
  </div>
</template>
