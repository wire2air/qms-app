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
const confirmDelete = ref(false)

const memberships = useLiveQueryWithDeps(
  [() => props.group.id],
  async (db, [id]) => db.UserOnTeam.where('teamId', id).exec(),
  { initial: [] },
)

const memberCount = computed(() => memberships.value.length)

function onClick() {
  router.push(getCompanyPath(`/groups/${props.group.id}`))
}

async function onConfirmDelete() {
  await props.group.delete()
  confirmDelete.value = false
}
</script>

<template>
  <BaseClickableRow
    class="tw:block tw:border tw:border-divider tw:rounded-xl tw:p-3 tw:hover:bg-main-hover tw:transition-colors"
    :aria-label="`Open group ${group.name}`"
    @click="onClick"
  >
    <div class="tw:flex tw:items-center tw:gap-3">
      <!-- Avatar with group color -->
      <TeamAvatar :team="group" class="tw:size-12" />

      <!-- Group Info -->
      <div class="tw:flex-1 tw:min-w-0">
        <div class="tw:text-lg tw:font-bold tw:text-on-main">
          {{ group.name }}
        </div>
        <div class="tw:text-sm tw:text-secondary">
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
              @click="confirmDelete = true"
            >
              <IconTrash :size="14" />
              Delete
            </button>
          </template>
        </BaseMenu>
      </div>
    </div>
  </BaseClickableRow>

  <ConfirmDialog
    v-model="confirmDelete"
    title="Delete Group"
    :message="`Are you sure you want to delete '${group.name}'? This action cannot be undone.`"
    okLabel="Delete"
    @ok="onConfirmDelete"
  />
</template>
