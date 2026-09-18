<script setup>
/**
 * Additional entry reviewers for a log book (2026-08-09). The designated
 * supervisor is always a reviewer; here you add MORE reviewers — specific
 * users or whole roles — so entries can be signed off when the supervisor is
 * out. Specific-user choices are gated to users with access to the book's
 * site(s); role members are gated at review time. Editable while the book is
 * ACTIVE (not part of the frozen contract).
 */
import { IconUserPlus, IconX, IconShieldCheck } from '@tabler/icons-vue'
import { resolveSiteEligibleUserIds } from '@/composables/useLogBookReviewAuth.js'

const props = defineProps({
  logBookId: { type: String, required: true },
  // The log book row — supervisor + sites drive the display + site gating.
  logBook: { type: Object, default: null },
  canEdit: { type: Boolean, default: false },
})

const toast = useToast()

const reviewers = useLiveQueryWithDeps(
  [() => props.logBookId],
  async (db, [id]) => (id ? db.LogBookReviewer.where('logBookId', id).exec() : []),
  { models: ['LogBookReviewer'], initial: [] },
)
const reviewerUserIds = computed(() => reviewers.value.filter((r) => r.userId).map((r) => r.userId))
const reviewerRoleIds = computed(() => reviewers.value.filter((r) => r.roleId).map((r) => r.roleId))

// Site-eligible internal users, minus the supervisor + already-added users.
const eligibleUsers = useLiveQueryWithDeps(
  [() => props.logBookId, () => props.logBook?.supervisorUserId, () => reviewerUserIds.value.join(',')],
  async (db, [, supId]) => {
    if (!props.logBook) return []
    const ids = new Set(await resolveSiteEligibleUserIds(props.logBook))
    const taken = new Set([supId, ...reviewerUserIds.value].filter(Boolean))
    const users = await db.User.where().exec()
    return users
      .filter((u) => ids.has(u.id) && !taken.has(u.id))
      .map((u) => ({ id: u.id, name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email }))
      .sort((a, b) => a.name.localeCompare(b.name))
  },
  { models: ['User', 'UserSite', 'SiteOnLogBook', 'LogBookReviewer'], initial: [] },
)

const roles = useLiveQueryWithDeps(
  [() => reviewerRoleIds.value.join(',')],
  async (db) => {
    const taken = new Set(reviewerRoleIds.value)
    return (await db.Role.where('statusId', 'ACTIVE').exec())
      .filter((r) => !taken.has(r.id))
      .map((r) => ({ id: r.id, name: r.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  },
  { models: ['Role', 'LogBookReviewer'], initial: [] },
)

const addUserId = ref(null)
const addRoleId = ref(null)

const addReviewer = useLiveMutation(async (db, payload) => {
  const row = db.LogBookReviewer.create({ logBookId: props.logBookId, ...payload })
  await row.save()
  return row
})

async function onAddUser(userId) {
  if (!userId) return
  try {
    await addReviewer({ userId })
    addUserId.value = null
  } catch (e) {
    toast.error(e?.message || 'Failed to add reviewer')
  }
}
async function onAddRole(roleId) {
  if (!roleId) return
  try {
    await addReviewer({ roleId })
    addRoleId.value = null
  } catch (e) {
    toast.error(e?.message || 'Failed to add reviewer role')
  }
}
async function removeReviewer(row) {
  try {
    await row.delete()
  } catch (e) {
    toast.error(e?.message || 'Failed to remove reviewer')
  }
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <div>
      <BaseText as="h4" class="tw:text-sm tw:font-semibold tw:text-on-main">Reviewers</BaseText>
      <p class="tw:text-caption tw:text-secondary">
        Who can approve or reject entries. The Supervisor is always a reviewer; add more people or
        roles so entries can be signed off when the supervisor is unavailable. Specific users are
        limited to those with access to this log book's site.
      </p>
    </div>

    <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
      <!-- Supervisor (always a reviewer) -->
      <span v-if="logBook?.supervisorUserId" class="tw:inline-flex tw:items-center tw:gap-1">
        <IconShieldCheck :size="14" class="tw:text-emerald-600" />
        <UserBadgeById :userId="logBook.supervisorUserId" />
        <span class="tw:text-caption tw:text-secondary">Supervisor</span>
      </span>

      <!-- Additional user reviewers -->
      <span v-for="row in reviewers.filter((r) => r.userId)" :key="row.id" class="tw:inline-flex tw:items-center tw:gap-1">
        <UserBadgeById :userId="row.userId" />
        <button v-if="canEdit" type="button" class="tw:text-secondary tw:hover:text-red-600" @click="removeReviewer(row)">
          <IconX :size="13" />
        </button>
      </span>

      <!-- Additional role reviewers -->
      <span v-for="row in reviewers.filter((r) => r.roleId)" :key="row.id" class="tw:inline-flex tw:items-center tw:gap-1">
        <RoleBadgeById :roleId="row.roleId" />
        <button v-if="canEdit" type="button" class="tw:text-secondary tw:hover:text-red-600" @click="removeReviewer(row)">
          <IconX :size="13" />
        </button>
      </span>

      <span
        v-if="!logBook?.supervisorUserId && reviewers.length === 0"
        class="tw:text-xs tw:text-secondary tw:italic"
      >
        No reviewers yet — set a Supervisor above, and optionally add more here.
      </span>
    </div>

    <div v-if="canEdit" class="tw:flex tw:flex-wrap tw:items-center tw:gap-3 tw:pt-1">
      <div class="tw:flex tw:items-center tw:gap-1.5">
        <IconUserPlus :size="16" class="tw:text-secondary" />
        <BaseSelect
          v-model="addUserId"
          :options="eligibleUsers"
          optionLabel="name"
          optionValue="id"
          nullLabel="Add a user…"
          class="tw:min-w-52"
          @update:modelValue="onAddUser"
        />
      </div>
      <BaseSelect
        v-model="addRoleId"
        :options="roles"
        optionLabel="name"
        optionValue="id"
        nullLabel="Add a role…"
        class="tw:min-w-52"
        @update:modelValue="onAddRole"
      />
    </div>
  </div>
</template>
