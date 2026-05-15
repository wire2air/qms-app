<script setup>
import { getCompanyPath } from '@/utils/routeHelpers'
import { IconMail, IconBriefcase, IconCrown, IconExternalLink } from '@tabler/icons-vue'

const props = defineProps({
  user: { type: Object, required: true },
})

const fullName = computed(() => {
  const parts = [props.user?.firstName, props.user?.lastName].filter(Boolean)
  return parts.join(' ') || props.user?.email || '—'
})

const roles = useLiveQueryWithDeps(
  [() => props.user?.id],
  async (db, [userId]) => {
    if (!userId) return []
    const assignments = await db.RoleOnUser.where('userId', userId).exec()
    const list = await Promise.all(assignments.map((ra) => db.Role.findByPk(ra.roleId)))
    return list.filter(Boolean)
  },
  { initial: [] },
)

const site = useLiveQueryWithDeps(
  [() => props.user?.siteId],
  async (db, [siteId]) => (siteId ? db.Site.findByPk(siteId) : null),
)

const department = useLiveQueryWithDeps(
  [() => props.user?.departmentId],
  async (db, [deptId]) => (deptId ? db.Department.findByPk(deptId) : null),
)

const profileLink = computed(() => getCompanyPath(`/users/${props.user?.id}`))
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3 tw:p-4 tw:min-w-72 tw:max-w-80">
    <div class="tw:flex tw:items-start tw:gap-3">
      <UserAvatar :user="user" class="tw:size-14" :bordered="false" />
      <div class="tw:flex tw:flex-col tw:min-w-0 tw:flex-1">
        <div class="tw:flex tw:items-center tw:gap-1.5">
          <span class="tw:text-base tw:font-semibold tw:text-on-sidebar tw:truncate">
            {{ fullName }}
          </span>
          <IconCrown v-if="user.isOwner" :size="14" class="tw:text-amber-500 tw:shrink-0" />
        </div>
        <span v-if="user.jobTitle" class="tw:text-xs tw:text-secondary tw:truncate">
          {{ user.jobTitle }}
        </span>
        <UserStatusBadgeById
          v-if="user.userStatusId"
          :statusId="user.userStatusId"
          class="tw:mt-1 tw:self-start tw:text-[10px]"
        />
      </div>
    </div>

    <div class="tw:flex tw:flex-col tw:gap-1.5 tw:text-xs">
      <div v-if="user.email" class="tw:flex tw:items-center tw:gap-2 tw:text-secondary">
        <IconMail :size="14" class="tw:shrink-0" />
        <a :href="`mailto:${user.email}`" class="tw:truncate tw:hover:text-primary">
          {{ user.email }}
        </a>
      </div>
      <div v-if="site || department" class="tw:flex tw:items-center tw:gap-2 tw:text-secondary">
        <IconBriefcase :size="14" class="tw:shrink-0" />
        <span class="tw:truncate">
          {{ [site?.name, department?.name].filter(Boolean).join(' · ') || '—' }}
        </span>
      </div>
    </div>

    <div v-if="roles.length" class="tw:flex tw:flex-col tw:gap-1">
      <div class="tw:text-[10px] tw:font-semibold tw:uppercase tw:tracking-wider tw:text-secondary">
        Roles
      </div>
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <BaseBadge
          v-for="role in roles"
          :key="role.id"
          class="tw:text-[10px] tw:bg-main-hover tw:text-on-main"
        >
          {{ role.name }}
        </BaseBadge>
      </div>
    </div>

    <RouterLink
      :to="profileLink"
      class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:font-medium tw:text-primary tw:hover:underline"
    >
      View profile
      <IconExternalLink :size="12" />
    </RouterLink>
  </div>
</template>
