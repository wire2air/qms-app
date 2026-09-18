<script setup>
// "Who can see Mumbai?" — the inverse of a user's site list.
//
// Auditors and admins ask the question this way round, and before multi-site it
// had a trivial answer (users.site_id = X). Now access comes from two places, so
// this shows both and tags which is which: PRIMARY (users.site_id) and
// ADDITIONAL (user_sites). From an access standpoint they are equivalent — a
// `site`-scoped grant reaches this site either way — but only the additional
// ones are removable here, since clearing someone's primary site is a different
// decision that belongs on their profile.
//
// A drawer rather than a detail page: sites have no detail route (they are a
// table + edit dialog), and this is a peek at a related record, not a workspace.
import { IconMapPin } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const props = defineProps({
  siteId: { type: String, default: null },
})
const open = defineModel({ type: Boolean, default: false })

const canManage = computed(() => isAllowed(['user_management:update']))

const site = useLiveQueryWithDeps(
  [() => props.siteId],
  async (db, [id]) => (id ? db.Site.findByPk(id) : null),
  { models: ['Site'] },
)

// Primary members — users whose site_id IS this site.
const primaryMembers = useLiveQueryWithDeps(
  [() => props.siteId],
  async (db, [id]) => {
    if (!id) return []
    return db.User.where('siteId', id).exec()
  },
  { models: ['User'], initial: [] },
)

// Additional members — via the user_sites pivot.
const assignments = useLiveQueryWithDeps(
  [() => props.siteId],
  async (db, [id]) => {
    if (!id) return []
    return db.UserSite.where('siteId', id).exec()
  },
  { models: ['UserSite'], initial: [] },
)

const members = computed(() => {
  const primary = primaryMembers.value.map((u) => ({
    key: `p-${u.id}`,
    userId: u.id,
    membership: 'PRIMARY',
    assignment: null,
  }))
  // A user can legitimately hold this site as BOTH primary and additional: the
  // profile screen writes the primary through the syncEngine, so the server-side
  // overlap cleanup in the users controller never runs for that path, and the
  // client-side tidy-up only fires on a genuine change. The union is harmless
  // for access — effective sites are a set — but listing someone twice and
  // counting them twice makes this drawer answer "how many people can reach this
  // site?" wrongly, which is the one question it exists to answer.
  //
  // Primary wins: it is the stronger statement about where the person works, and
  // it is the row that cannot be removed from here.
  const primaryUserIds = new Set(primary.map((m) => m.userId))
  const additional = assignments.value
    .filter((a) => !primaryUserIds.has(a.userId))
    .map((a) => ({
      key: `a-${a.id}`,
      userId: a.userId,
      membership: 'ADDITIONAL',
      assignment: a,
    }))
  return [...primary, ...additional]
})

const removeError = ref(null)

const removing = ref(null)

async function removeAssignment(row) {
  if (!row.assignment) return
  removing.value = row.key
  removeError.value = null
  try {
    await row.assignment.delete()
  } catch (err) {
    // Deletes go straight to instance.delete(), which — unlike useLiveMutation —
    // does not toast on failure. Saves here are pessimistic, so a rejected
    // delete changes nothing anywhere and the row simply stays put; without
    // this the × looks like it did not register and invites repeat clicks.
    //
    // The most likely rejection is RLS: user_sites forbids editing your OWN
    // assignments (user_id <> current_user_id), so an admin removing themselves
    // from a site lands here even though the button was enabled.
    removeError.value = err?.message || 'Could not remove this assignment.'
  } finally {
    removing.value = null
  }
}
</script>

<template>
  <BaseDrawer v-model="open" :title="site?.name || 'Site members'" size="md">
    <div class="tw:flex tw:flex-col tw:gap-4">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-secondary">
        <IconMapPin :size="16" />
        <span>
          <strong class="tw:text-on-main">{{ members.length }}</strong>
          {{ members.length === 1 ? 'person has' : 'people have' }} access to this site
        </span>
      </div>

      <p v-if="removeError" class="tw:text-sm tw:text-red-500" role="alert">
        {{ removeError }}
      </p>

      <p class="tw:text-xs tw:text-secondary">
        A role with <em>Site</em> access reaches this site's records for everyone listed here,
        whether it is their primary site or an additional assignment.
      </p>

      <div v-if="!members.length" class="tw:text-sm tw:text-secondary tw:py-6 tw:text-center">
        Nobody is assigned to this site yet.
      </div>

      <ul v-else class="tw:flex tw:flex-col tw:divide-y tw:divide-divider">
        <li
          v-for="row in members"
          :key="row.key"
          class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:py-2"
        >
          <UserBadgeById :userId="row.userId" />
          <!-- Only ADDITIONAL assignments are clearable here. Clearing someone's
               primary site is a different decision — it changes where they
               belong, not just what they can reach — and lives on their
               profile. -->
          <BaseBadge
            :clearable="canManage && row.membership === 'ADDITIONAL' && removing !== row.key"
            clearLabel="Remove site assignment"
            @clear="removeAssignment(row)"
          >
            {{ row.membership === 'PRIMARY' ? 'Primary' : 'Additional' }}
          </BaseBadge>
        </li>
      </ul>
    </div>
  </BaseDrawer>
</template>
