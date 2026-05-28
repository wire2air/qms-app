<script setup>
import { IconRocket, IconUsers, IconX, IconPlus } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { getCompanyPath } from '@/utils/routeHelpers'

const props = defineProps({
  trainingId: { type: String, required: true },
  trainingTitle: { type: String, default: '' },
})

const model = defineModel({ type: Boolean, default: false })
const router = useRouter()

// Resolve the assignee list (roles → users + direct users, deduplicated)
const resolvedUserIds = useLiveQueryWithDeps(
  [() => props.trainingId, () => model.value],
  async (db, [tid, open]) => {
    if (!tid || !open) return []
    const [roles, users] = await Promise.all([
      db.TrainingRole.where('trainingId', tid).exec(),
      db.TrainingUser.where('trainingId', tid).exec(),
    ])
    const set = new Set()
    if (roles.length) {
      const roleIds = roles.map((r) => r.roleId)
      const assignments = await db.RoleOnUser.where().exec()
      assignments.filter((a) => roleIds.includes(a.roleId)).forEach((a) => set.add(a.userId))
    }
    users.forEach((u) => set.add(u.userId))
    return [...set]
  },
  { initial: [] },
)

// Final list the manager actually wants to launch with (starts as resolved, editable)
const selectedUserIds = ref([])
const addPickerMode = ref(null) // 'user' | 'role' | null
const pickerUserValue = ref(null)
const pickerRoleValue = ref(null)
const lastAddSummary = ref(null)

watch(
  () => [model.value, resolvedUserIds.value],
  ([open, ids]) => {
    if (open) selectedUserIds.value = [...ids]
  },
  { immediate: true },
)

function removeUser(uid) {
  selectedUserIds.value = selectedUserIds.value.filter((x) => x !== uid)
}

// Commit immediately when the user picks from the dropdown (no separate Add button)
watch(pickerUserValue, (uid) => {
  if (!uid) return
  if (!selectedUserIds.value.includes(uid)) {
    selectedUserIds.value = [...selectedUserIds.value, uid]
    lastAddSummary.value = 'Added 1 user'
  } else {
    lastAddSummary.value = 'User is already on the list'
  }
  pickerUserValue.value = null
  addPickerMode.value = null
})

// Live-query users assigned to the picked role, then merge them on a watch
const roleResolvedUserIds = useLiveQueryWithDeps(
  [() => pickerRoleValue.value],
  async (db, [roleId]) => {
    if (!roleId) return null
    const assignments = await db.RoleOnUser.where().exec()
    return assignments.filter((a) => a.roleId === roleId).map((a) => a.userId)
  },
  { initial: null },
)

watch(roleResolvedUserIds, (roleUserIds) => {
  if (!Array.isArray(roleUserIds)) return
  const before = new Set(selectedUserIds.value)
  const added = roleUserIds.filter((u) => !before.has(u))
  if (added.length) selectedUserIds.value = [...before, ...added]
  lastAddSummary.value = added.length
    ? `Added ${added.length} user${added.length === 1 ? '' : 's'} from role`
    : 'No new users added — already on the list (or role has no users)'
  pickerRoleValue.value = null
  addPickerMode.value = null
})

function cancelAdd() {
  pickerUserValue.value = null
  pickerRoleValue.value = null
  addPickerMode.value = null
}

const launching = ref(false)
const error = ref(null)
const launched = ref(null)

async function handleLaunch() {
  if (!selectedUserIds.value.length) {
    error.value = 'At least one employee is required'
    return
  }
  launching.value = true
  error.value = null
  try {
    const data = await post(`/v1/services/trainings/${props.trainingId}/launch`, {
      userIds: selectedUserIds.value,
    })
    launched.value = data
  } catch (err) {
    error.value = err.message || 'Failed to launch training'
  } finally {
    launching.value = false
  }
}

function handleClose() {
  if (launched.value) {
    router.push(getCompanyPath(`/training-instances/${launched.value.trainingInstance?.id}`))
  }
  model.value = false
  launched.value = null
  error.value = null
  selectedUserIds.value = []
}
</script>

<template>
  <BaseDialog v-model="model" title="Launch Training" maxWidth="2xl">
    <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
      <template v-if="!launched">
        <div class="tw:flex tw:items-start tw:gap-3 tw:bg-blue-50 tw:rounded-lg tw:p-3">
          <IconRocket :size="20" class="tw:text-blue-600 tw:shrink-0 tw:mt-0.5" />
          <div>
            <p class="tw:text-sm tw:font-medium tw:text-on-sidebar">{{ trainingTitle }}</p>
            <p class="tw:text-xs tw:text-secondary tw:mt-0.5">
              Review the assignees below. You can remove people or add additional users for this
              launch without changing the training template.
            </p>
          </div>
        </div>

        <!-- Assignees preview/editor -->
        <div class="tw:border tw:border-divider tw:rounded-lg">
          <div
            class="tw:flex tw:items-center tw:justify-between tw:px-4 tw:py-2 tw:border-b tw:border-divider tw:bg-gray-50"
          >
            <span
              class="tw:text-sm tw:font-semibold tw:text-on-sidebar tw:flex tw:items-center tw:gap-1.5"
            >
              <IconUsers :size="14" />
              Assignees ({{ selectedUserIds.length }})
            </span>
            <div v-if="!addPickerMode" class="tw:flex tw:items-center tw:gap-3">
              <button
                class="tw:text-xs tw:text-primary tw:hover:underline tw:flex tw:items-center tw:gap-1"
                @click="addPickerMode = 'user'"
              >
                <IconPlus :size="12" /> Add user
              </button>
              <button
                class="tw:text-xs tw:text-primary tw:hover:underline tw:flex tw:items-center tw:gap-1"
                @click="addPickerMode = 'role'"
              >
                <IconPlus :size="12" /> Add by role
              </button>
            </div>
          </div>

          <div
            v-if="addPickerMode === 'user'"
            class="tw:px-4 tw:py-2 tw:border-b tw:border-divider tw:flex tw:items-center tw:gap-2"
          >
            <UserSelectMenu v-model="pickerUserValue" class="tw:flex-1" />
            <button class="tw:text-xs tw:text-secondary tw:hover:underline" @click="cancelAdd">
              Cancel
            </button>
          </div>

          <div
            v-if="addPickerMode === 'role'"
            class="tw:px-4 tw:py-2 tw:border-b tw:border-divider tw:flex tw:items-center tw:gap-2"
          >
            <RoleSelectMenu v-model="pickerRoleValue" class="tw:flex-1" />
            <button class="tw:text-xs tw:text-secondary tw:hover:underline" @click="cancelAdd">
              Cancel
            </button>
          </div>

          <p
            v-if="lastAddSummary"
            class="tw:px-4 tw:py-1.5 tw:text-xs tw:text-secondary tw:bg-green-50 tw:border-b tw:border-green-100"
          >
            {{ lastAddSummary }}
          </p>

          <div
            v-if="!selectedUserIds.length"
            class="tw:p-4 tw:text-sm tw:text-secondary tw:italic tw:text-center"
          >
            No assignees selected.
          </div>
          <div v-else class="tw:max-h-72 tw:overflow-y-auto tw:divide-y tw:divide-divider">
            <div
              v-for="uid in selectedUserIds"
              :key="uid"
              class="tw:flex tw:items-center tw:gap-3 tw:px-4 tw:py-2.5 tw:hover:bg-gray-50"
            >
              <UserBadgeById :userId="uid" class="tw:flex-1" />
              <button
                class="tw:p-1 tw:text-secondary tw:hover:text-red-600"
                @click="removeUser(uid)"
              >
                <IconX :size="14" />
              </button>
            </div>
          </div>
        </div>

        <div v-if="error" class="tw:text-sm tw:text-red-600 tw:bg-red-50 tw:rounded-lg tw:p-3">
          {{ error }}
        </div>

        <div class="tw:flex tw:justify-end tw:gap-2">
          <BaseButton variant="secondary" @click="model = false">Cancel</BaseButton>
          <BaseButton
            variant="primary"
            :loading="launching"
            :disabled="!selectedUserIds.length"
            @click="handleLaunch"
          >
            <IconRocket :size="16" class="tw:mr-1" /> Launch ({{ selectedUserIds.length }})
          </BaseButton>
        </div>
      </template>

      <template v-else>
        <div class="tw:flex tw:flex-col tw:items-center tw:gap-3 tw:py-4">
          <div
            class="tw:w-12 tw:h-12 tw:rounded-full tw:bg-green-100 tw:text-green-600 tw:flex tw:items-center tw:justify-center"
          >
            <IconUsers :size="24" />
          </div>
          <div class="tw:text-center">
            <p class="tw:font-semibold tw:text-on-sidebar">Training Launched!</p>
            <p class="tw:text-sm tw:text-secondary tw:mt-1">
              Assigned to <strong>{{ launched.assigneeCount }}</strong> user{{
                launched.assigneeCount !== 1 ? 's' : ''
              }}.
            </p>
          </div>
        </div>
        <div class="tw:flex tw:justify-end">
          <BaseButton variant="primary" @click="handleClose">View Instance</BaseButton>
        </div>
      </template>
    </div>
  </BaseDialog>
</template>
