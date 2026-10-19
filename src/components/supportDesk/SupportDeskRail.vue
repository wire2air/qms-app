<script setup>
import {
  IconHeadset,
  IconPlus,
  IconSettings,
  IconLayoutGrid,
  IconListDetails,
  IconLogout,
  IconChevronDown,
  IconBuildingStore,
  IconX,
  IconChartBar,
  IconUserCog,
  IconSpeakerphone,
} from '@tabler/icons-vue'
import { currentSession, isAllowed, logoutCurrentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { isSupportHost } from '@/utils/tenant'
import { DESK_VIEWS } from './deskViews.js'

defineProps({
  view: { type: String, required: true },
  counts: { type: Object, default: () => ({}) },
  brands: { type: Array, default: () => [] },
  open: { type: Boolean, default: true },
  overlay: { type: Boolean, default: false },
})
const emit = defineEmits(['select', 'close'])
const router = useRouter()

const canCreate = computed(() => isAllowed(['complaint_management:create']))
const canConfigure = computed(() => isAllowed(['complaint_management:update']))

// "Back to QMS" only makes sense for people who have somewhere else to go: any
// readable module besides the desk itself and the baseline org lookups.
const BASELINE = new Set(['complaint_management', 'sites', 'departments', 'users'])
const hasQmsAccess = computed(() => {
  const s = currentSession.value
  if (!s) return false
  if (s.isSupportUser || isSupportHost()) return false
  if (s.isOwner) return true
  return (s.permissions || []).some((p) => {
    const [mod, verb] = p.split(':')
    return verb === 'read' && !BASELINE.has(mod)
  })
})

const name = computed(() => {
  const s = currentSession.value
  return [s?.firstName, s?.lastName].filter(Boolean).join(' ') || s?.email || ''
})

const userMenu = computed(() => [
  {
    name: 'My preferences',
    icon: IconUserCog,
    click: () => router.push(getCompanyPath('/desk/me')),
  },
  {
    name: 'Ticketing view',
    icon: IconListDetails,
    click: () => router.push(getCompanyPath('/customer-complaints')),
  },
  {
    name: 'Reports',
    icon: IconChartBar,
    click: () => router.push(getCompanyPath('/customer-complaints/reports')),
  },
  ...(hasQmsAccess.value
    ? [
        {
          name: 'Open QMS',
          icon: IconLayoutGrid,
          click: () => router.push(getCompanyPath('/dashboard')),
        },
      ]
    : []),
  { name: 'Sign out', icon: IconLogout, click: () => logoutCurrentSession() },
])

function itemClass(active) {
  return [
    'tw:flex tw:w-full tw:items-center tw:gap-2 tw:rounded-md tw:px-2 tw:py-1.5 tw:text-sm tw:text-left tw:transition-colors',
    active
      ? 'tw:bg-main-selected tw:font-semibold tw:text-on-main'
      : 'tw:text-secondary tw:hover:bg-main-hover tw:hover:text-on-main',
  ]
}
</script>

<template>
  <!-- Phone overlay backdrop -->
  <button
    v-if="overlay && open"
    class="tw:fixed tw:inset-0 tw:z-30 tw:bg-black/40"
    aria-label="Close menu"
    @click="emit('close')"
  />
  <aside
    v-show="open"
    class="tw:flex tw:h-full tw:w-60 tw:shrink-0 tw:flex-col tw:border-r tw:border-divider tw:bg-card"
    :class="overlay ? 'tw:fixed tw:inset-y-0 tw:left-0 tw:z-40 tw:shadow-xl' : ''"
  >
    <!-- Header -->
    <div class="tw:flex tw:items-center tw:gap-2 tw:px-3 tw:pt-3 tw:pb-2">
      <IconHeadset :size="20" class="tw:text-primary" />
      <span class="tw:text-base tw:font-semibold tw:flex-1">Inbox</span>
      <BaseTooltip v-if="canCreate" content="New ticket">
        <RouterLink
          :to="getCompanyPath('/customer-complaints/create')"
          class="tw:rounded-md tw:p-1 tw:text-secondary tw:hover:bg-main-hover tw:hover:text-on-main"
          aria-label="New ticket"
        >
          <IconPlus :size="18" />
        </RouterLink>
      </BaseTooltip>
      <button
        v-if="overlay"
        class="tw:rounded-md tw:p-1 tw:text-secondary tw:hover:bg-main-hover"
        aria-label="Close menu"
        @click="emit('close')"
      >
        <IconX :size="18" />
      </button>
    </div>

    <!-- Presence -->
    <div class="tw:px-3 tw:pb-2">
      <SupportAgentPresence />
    </div>

    <nav class="tw:flex-1 tw:overflow-y-auto tw:px-2 tw:pb-2">
      <!-- Views -->
      <ul class="tw:flex tw:flex-col tw:gap-0.5">
        <li v-for="v in DESK_VIEWS" :key="v.id">
          <button :class="itemClass(view === v.id)" @click="emit('select', v.id)">
            <component :is="v.icon" :size="16" class="tw:shrink-0" />
            <span class="tw:flex-1 tw:truncate">{{ v.label }}</span>
            <span
              v-if="counts[v.id]"
              class="tw:text-xs tw:tabular-nums"
              :class="view === v.id ? 'tw:text-on-main' : 'tw:text-secondary'"
            >
              {{ counts[v.id] }}
            </span>
          </button>
        </li>
      </ul>

      <!-- Team inboxes = brands -->
      <template v-if="brands.length > 1">
        <div
          class="tw:mt-4 tw:mb-1 tw:flex tw:items-center tw:justify-between tw:px-2 tw:text-micro tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary"
        >
          <span>Team inboxes</span>
          <RouterLink
            v-if="canConfigure"
            :to="getCompanyPath('/desk/settings')"
            class="tw:rounded tw:p-0.5 tw:hover:bg-main-hover"
            aria-label="Manage brands"
          >
            <IconPlus :size="14" />
          </RouterLink>
        </div>
        <ul class="tw:flex tw:flex-col tw:gap-0.5">
          <li v-for="b in brands" :key="b.id">
            <button
              :class="itemClass(view === `brand:${b.id}`)"
              @click="emit('select', `brand:${b.id}`)"
            >
              <span
                class="tw:inline-block tw:h-2.5 tw:w-2.5 tw:shrink-0 tw:rounded-full"
                :style="{ background: b.accentColor || '#1f6feb' }"
              />
              <span class="tw:flex-1 tw:truncate">{{ b.name }}</span>
              <span
                v-if="counts[`brand:${b.id}`]"
                class="tw:text-xs tw:tabular-nums tw:text-secondary"
              >
                {{ counts[`brand:${b.id}`] }}
              </span>
            </button>
          </li>
        </ul>
      </template>
      <div v-else-if="brands.length === 1 && canConfigure" class="tw:mt-4 tw:px-2">
        <RouterLink
          :to="getCompanyPath('/desk/settings')"
          class="tw:flex tw:items-center tw:gap-2 tw:text-xs tw:text-secondary tw:hover:text-primary"
        >
          <IconBuildingStore :size="14" />
          Add a brand for a second team inbox
        </RouterLink>
      </div>
    </nav>

    <!-- Footer: settings + user -->
    <div class="tw:border-t tw:border-divider tw:p-2 tw:flex tw:flex-col tw:gap-1">
      <RouterLink
        v-if="canConfigure"
        :to="getCompanyPath('/desk/settings?tab=outbound')"
        :class="itemClass(false)"
      >
        <IconSpeakerphone :size="16" />
        <span class="tw:flex-1">Outbound messages</span>
      </RouterLink>
      <RouterLink
        v-if="canConfigure"
        :to="getCompanyPath('/desk/settings')"
        :class="itemClass(false)"
      >
        <IconSettings :size="16" />
        <span class="tw:flex-1">Settings</span>
      </RouterLink>
      <BaseMenu :items="userMenu" flip>
        <template #trigger>
          <button
            class="tw:flex tw:w-full tw:items-center tw:gap-2 tw:rounded-md tw:px-2 tw:py-1.5 tw:text-left tw:hover:bg-main-hover"
            aria-label="Account menu"
          >
            <BaseAvatar :name="name" size="sm" />
            <span class="tw:flex-1 tw:truncate tw:text-sm">{{ name }}</span>
            <IconChevronDown :size="14" class="tw:text-secondary" />
          </button>
        </template>
      </BaseMenu>
    </div>
  </aside>
</template>
