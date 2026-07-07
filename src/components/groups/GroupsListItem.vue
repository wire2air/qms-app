<script setup>
import { IconTrash } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers'

const props = defineProps({
  group: {
    type: Object,
    required: true,
  },
  canDelete: {
    type: Boolean,
    default: false,
  },
})

const router = useRouter()
const { confirm } = useConfirm()

const memberships = useLiveQueryWithDeps(
  [() => props.group.id],
  async (db, [id]) => db.UserOnTeam.where('teamId', id).exec(),

  { models: ['UserOnTeam'], initial: [] },
)

const memberCount = computed(() => memberships.value.length)

function onClick() {
  router.push(getCompanyPath(`/groups/${props.group.id}`))
}

async function onDelete() {
  const ok = await confirm({
    title: 'Delete Group',
    message: `Are you sure you want to delete '${props.group.name}'? This action cannot be undone.`,
    okLabel: 'Delete',
    danger: true,
  })
  if (ok) await props.group.delete()
}
</script>

<template>
  <BaseClickableRow
    class="tw:flex tw:items-center tw:gap-3 tw:border tw:border-divider tw:rounded-lg tw:bg-sidebar tw:px-3.5 tw:py-2.5 tw:hover:border-primary/40 tw:hover:shadow-sm tw:transition-all"
    :aria-label="`Open group ${group.name}`"
    @click="onClick"
  >
    <!-- Avatar with group color -->
    <TeamAvatar :team="group" class="tw:size-9 tw:shrink-0" />

    <!-- Group Info -->
    <div class="tw:flex-1 tw:min-w-0">
      <div class="tw:truncate tw:text-sm tw:font-semibold tw:text-on-main">
        {{ group.name }}
      </div>
      <div class="tw:truncate tw:text-xs tw:text-secondary">
        {{ memberCount }} member{{ memberCount !== 1 ? 's' : '' }}
      </div>
    </div>

    <!-- Leadership Badge -->
    <span
      v-if="group.isLeadership"
      class="tw:flex-none tw:text-xs tw:font-semibold tw:bg-primary/10 tw:text-primary tw:px-2.5 tw:py-1 tw:rounded-full"
    >
      Leadership
    </span>

    <!-- Actions Menu -->
    <div v-if="canDelete" class="tw:flex-none" @click.stop>
      <BaseMenu>
        <template #items>
          <button
            class="tw:flex tw:items-center tw:gap-2 tw:w-full tw:px-3 tw:py-2 tw:text-sm tw:text-red-600 tw:hover:bg-red-50 tw:transition-colors"
            @click="onDelete"
          >
            <IconTrash :size="14" />
            Delete
          </button>
        </template>
      </BaseMenu>
    </div>
  </BaseClickableRow>
</template>
