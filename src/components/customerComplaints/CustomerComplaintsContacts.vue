<script setup>
import { IconMail, IconArrowLeft } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { DateTime } from 'luxon'

const router = useRouter()

const allComplaints = useLiveQuery((db) => db.CustomerComplaint.where().exec(), { initial: [] })

const contacts = computed(() => {
  const map = new Map()
  for (const c of allComplaints.value) {
    if (!c.customerEmail) continue
    const key = c.customerEmail.toLowerCase()
    const existing = map.get(key)
    if (existing) {
      existing.ticketCount++
      existing.openCount += ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED'].includes(c.statusId) ? 1 : 0
      if (!existing.lastActivity || c.createdAt > existing.lastActivity) {
        existing.lastActivity = c.createdAt
      }
    } else {
      map.set(key, {
        email: c.customerEmail,
        name: c.customerName || c.customerEmail,
        ticketCount: 1,
        openCount: ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED'].includes(c.statusId) ? 1 : 0,
        lastActivity: c.createdAt,
      })
    }
  }
  return [...map.values()].sort((a, b) => {
    if (!a.lastActivity) return 1
    if (!b.lastActivity) return -1
    return b.lastActivity - a.lastActivity
  })
})

const search = ref('')

const filtered = computed(() => {
  const q = search.value.toLowerCase()
  if (!q) return contacts.value
  return contacts.value.filter(
    (c) => c.email.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
  )
})

function viewTickets(email) {
  router.push({
    path: getCompanyPath('/customer-complaints'),
    query: { customerEmail: email },
  })
}

function formatDate(dt) {
  if (!dt) return '—'
  if (dt instanceof DateTime) return dt.toRelative()
  return '—'
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3 tw:h-full tw:p-5">
    <SafeTeleport to="#main-header-title">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
        <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-nowrap">Contacts</h2>
      </div>
    </SafeTeleport>

    <div class="tw:flex tw:items-center tw:gap-2">
      <button
        class="tw:flex tw:items-center tw:gap-1 tw:text-sm tw:text-secondary tw:hover:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer"
        @click="router.push(getCompanyPath('/customer-complaints'))"
      >
        <IconArrowLeft :size="16" />
        <span>Back to tickets</span>
      </button>
    </div>

    <div class="tw:flex tw:flex-col tw:gap-1">
      <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Contacts</div>
      <div class="tw:text-sm tw:text-secondary">
        All customers who have submitted complaints — via web form, email, or the live chat widget.
      </div>
    </div>

    <div class="tw:flex tw:items-center tw:gap-2">
      <BaseTextInput v-model="search" placeholder="Search by name or email…" class="tw:max-w-xs" />
      <span class="tw:text-sm tw:text-secondary tw:ml-auto">{{ filtered.length }} contacts</span>
    </div>

    <div v-if="!filtered.length" class="tw:text-sm tw:text-secondary tw:italic tw:py-12 tw:text-center">
      No contacts yet. Contacts are created automatically when tickets come in.
    </div>

    <div v-else class="tw:flex tw:flex-col tw:gap-1">
      <div
        v-for="contact in filtered"
        :key="contact.email"
        class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4 tw:flex tw:items-center tw:gap-4 tw:cursor-pointer tw:hover:bg-main-hover tw:transition-colors"
        @click="viewTickets(contact.email)"
      >
        <div class="tw:w-9 tw:h-9 tw:rounded-full tw:bg-blue-100 tw:text-blue-600 tw:flex tw:items-center tw:justify-center tw:shrink-0 tw:font-bold tw:text-sm">
          {{ contact.name.charAt(0).toUpperCase() }}
        </div>
        <div class="tw:flex-1 tw:min-w-0">
          <div class="tw:font-medium tw:text-sm tw:text-on-sidebar tw:truncate">{{ contact.name }}</div>
          <div class="tw:text-xs tw:text-secondary tw:flex tw:items-center tw:gap-1 tw:truncate">
            <IconMail :size="12" />
            {{ contact.email }}
          </div>
        </div>
        <div class="tw:flex tw:items-center tw:gap-4 tw:shrink-0">
          <div class="tw:text-right">
            <div class="tw:text-xs tw:text-secondary">Tickets</div>
            <div class="tw:font-bold tw:text-sm tw:text-on-sidebar">{{ contact.ticketCount }}</div>
          </div>
          <div class="tw:text-right">
            <div class="tw:text-xs tw:text-secondary">Open</div>
            <div
              class="tw:font-bold tw:text-sm"
              :class="contact.openCount > 0 ? 'tw:text-blue-600' : 'tw:text-on-sidebar'"
            >
              {{ contact.openCount }}
            </div>
          </div>
          <div class="tw:text-right tw:hidden tw:md:block">
            <div class="tw:text-xs tw:text-secondary">Last activity</div>
            <div class="tw:text-xs tw:text-on-sidebar">{{ formatDate(contact.lastActivity) }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
