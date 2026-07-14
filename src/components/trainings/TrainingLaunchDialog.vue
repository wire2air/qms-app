<script setup>
/**
 * Ad-Hoc Training launch. Manually assigns a library training outside the
 * curriculum/document flows — e.g. off the back of an NC, CAPA or Change
 * Request, or a retraining event.
 *
 * Roles are pre-filled from the training's curricula (add/remove), plus any
 * individual users; the effective assignee list is roles→users ∪ added users,
 * minus anyone removed. The launch captures the reason, an optional link to the
 * source NC/CAPA/CR, and a "retraining" flag on the resulting instance.
 */
import { IconRocket, IconX } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { getCompanyPath } from '@/utils/routeHelpers'
import { commonSupervisorId } from '@/utils/trainingManager'

const props = defineProps({
  trainingId: { type: String, required: true },
  trainingTitle: { type: String, default: '' },
})

const model = defineModel({ type: Boolean, default: false })
const router = useRouter()

// Roles mapped to the training's curricula — the ad-hoc default audience.
const curriculumRoleIds = useLiveQueryWithDeps(
  [() => props.trainingId, () => model.value],
  async (db, [tid, open]) => {
    if (!tid || !open) return []
    const cts = await db.CurriculumTraining.where('trainingId', tid).exec()
    const curriculumIds = [...new Set(cts.map((ct) => ct.curriculumId))]
    if (!curriculumIds.length) return []
    const rcs = await db.RoleCurriculum.where().exec()
    return [...new Set(rcs.filter((rc) => curriculumIds.includes(rc.curriculumId)).map((rc) => rc.roleId))]
  },
  { models: ['CurriculumTraining', 'RoleCurriculum'], initial: [] },
)

const selectedRoleIds = ref([])
const additionalUserIds = ref([])
const excludedUserIds = ref([])
const reason = ref('')
const isRetraining = ref(false)
const sourceType = ref(null)
const sourceId = ref(null)
const managerId = ref(null)
const autoManagerId = ref(null)
const error = ref(null)
const launched = ref(null)
const launching = ref(false)

watch(
  () => [model.value, curriculumRoleIds.value],
  ([open, roleIds]) => {
    if (open) {
      selectedRoleIds.value = [...roleIds]
      additionalUserIds.value = []
      excludedUserIds.value = []
      reason.value = ''
      isRetraining.value = false
      sourceType.value = null
      sourceId.value = null
      managerId.value = null
      autoManagerId.value = null
      error.value = null
      launched.value = null
    }
  },
  { immediate: true },
)

// Users resolved from the selected roles.
const roleUserIds = useLiveQueryWithDeps(
  [() => selectedRoleIds.value],
  async (db, [roleIds]) => {
    if (!roleIds?.length) return []
    const assignments = await db.RoleOnUser.where().exec()
    return [...new Set(assignments.filter((a) => roleIds.includes(a.roleId)).map((a) => a.userId))]
  },
  { models: ['RoleOnUser'], initial: [] },
)

// Effective assignees: (role users ∪ added users) − removed.
const effectiveUserIds = computed(() => {
  const excluded = new Set(excludedUserIds.value)
  const set = new Set([...(roleUserIds.value || []), ...additionalUserIds.value])
  return [...set].filter((uid) => !excluded.has(uid))
})

function removeUser(uid) {
  additionalUserIds.value = additionalUserIds.value.filter((x) => x !== uid)
  if (!excludedUserIds.value.includes(uid)) excludedUserIds.value = [...excludedUserIds.value, uid]
}

// Training manager (verifier). Defaults to the assignees' common supervisor.
const effectiveUsers = useLiveQueryWithDeps(
  [() => effectiveUserIds.value],
  async (db, [ids]) => {
    if (!ids?.length) return []
    return (await Promise.all(ids.map((id) => db.User.findByPk(id)))).filter(Boolean)
  },
  { models: ['User'], initial: [] },
)
watch(effectiveUsers, (users) => {
  const sup = commonSupervisorId(users)
  if (!managerId.value || managerId.value === autoManagerId.value) {
    managerId.value = sup
    autoManagerId.value = sup
  }
})

// Source (NC / CAPA / CR) picker.
const sourceTypeOptions = [
  { id: 'Nonconformance', name: 'Nonconformance (NC)' },
  { id: 'Capa', name: 'CAPA' },
  { id: 'ChangeRequest', name: 'Change Request' },
]
const sourceRecords = useLiveQueryWithDeps(
  [() => sourceType.value],
  async (db, [type]) => {
    const fmt = (num, r) => ({ id: r.id, name: [num, r.title].filter(Boolean).join(' — ') })
    if (type === 'Nonconformance')
      return (await db.Nonconformance.where().exec()).map((r) => fmt(r.ncNumber, r))
    if (type === 'Capa') return (await db.Capa.where().exec()).map((r) => fmt(r.capaNumber, r))
    if (type === 'ChangeRequest')
      return (await db.ChangeRequest.where().exec()).map((r) => fmt(r.crNumber, r))
    return []
  },
  { models: ['Nonconformance', 'Capa', 'ChangeRequest'], initial: [] },
)
watch(sourceType, () => {
  sourceId.value = null
})

async function handleLaunch() {
  if (!effectiveUserIds.value.length) {
    error.value = 'At least one assignee is required.'
    return
  }
  if (!reason.value.trim()) {
    error.value = 'A reason is required for an ad-hoc training.'
    return
  }
  launching.value = true
  error.value = null
  try {
    launched.value = await post(`/v1/services/trainings/${props.trainingId}/launch`, {
      userIds: effectiveUserIds.value,
      reason: reason.value.trim(),
      isRetraining: isRetraining.value,
      sourceType: sourceType.value || undefined,
      sourceId: sourceId.value || undefined,
      managerId: managerId.value || undefined,
    })
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
}
</script>

<template>
  <BaseDialog v-model="model" title="Ad-Hoc Training" maxWidth="2xl">
    <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
      <template v-if="!launched">
        <div class="tw:flex tw:items-start tw:gap-3 tw:bg-blue-50 tw:rounded-lg tw:p-3">
          <IconRocket :size="20" class="tw:text-blue-600 tw:shrink-0 tw:mt-0.5" />
          <div>
            <p class="tw:text-sm tw:font-medium tw:text-on-sidebar">{{ trainingTitle }}</p>
            <p class="tw:text-xs tw:text-secondary tw:mt-0.5">
              Manually assign this training — e.g. from an NC/CAPA/CR or a retraining event. Roles
              are pre-filled from the training's curricula; adjust roles and users as needed.
            </p>
          </div>
        </div>

        <!-- Roles (from curriculum) -->
        <div>
          <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wide tw:mb-1.5 tw:block">
            Roles
          </label>
          <RoleSelectMenu v-model="selectedRoleIds" :multiple="true" />
        </div>

        <!-- Additional users -->
        <div>
          <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wide tw:mb-1.5 tw:block">
            Add specific users
          </label>
          <UserSelectMenu v-model="additionalUserIds" :multiple="true" />
        </div>

        <!-- Effective assignees -->
        <div class="tw:border tw:border-divider tw:rounded-lg">
          <div class="tw:px-4 tw:py-2 tw:border-b tw:border-divider tw:bg-gray-50 tw:text-sm tw:font-semibold tw:text-on-sidebar">
            Will assign to {{ effectiveUserIds.length }} user{{ effectiveUserIds.length === 1 ? '' : 's' }}
          </div>
          <div
            v-if="!effectiveUserIds.length"
            class="tw:p-4 tw:text-sm tw:text-secondary tw:italic tw:text-center"
          >
            No assignees — pick a role or add users above.
          </div>
          <div v-else class="tw:max-h-56 tw:overflow-y-auto tw:divide-y tw:divide-divider">
            <div
              v-for="uid in effectiveUserIds"
              :key="uid"
              class="tw:flex tw:items-center tw:gap-3 tw:px-4 tw:py-2 tw:hover:bg-gray-50"
            >
              <UserBadgeById :userId="uid" class="tw:flex-1" />
              <button class="tw:p-1 tw:text-secondary tw:hover:text-red-600" title="Remove" @click="removeUser(uid)">
                <IconX :size="14" />
              </button>
            </div>
          </div>
        </div>

        <!-- Training manager (verifier) -->
        <div>
          <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wide tw:mb-1.5 tw:block">
            Training manager (verifier)
          </label>
          <UserSelectMenu v-model="managerId" nullLabel="Select a manager" />
          <p class="tw:text-caption tw:text-secondary tw:mt-1">
            Defaults to the assignees' supervisor when they share one; otherwise select who verifies.
          </p>
        </div>

        <!-- Reason -->
        <div>
          <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wide tw:mb-1.5 tw:block">
            Reason <span class="tw:text-bad">*</span>
          </label>
          <BaseTextarea
            v-model="reason"
            :rows="2"
            placeholder="Why is this training being assigned? e.g. corrective action for NC-001, procedure change…"
          />
        </div>

        <!-- Source link + retraining -->
        <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
          <div>
            <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wide tw:mb-1.5 tw:block">
              Linked record
            </label>
            <BaseSelect
              v-model="sourceType"
              :options="sourceTypeOptions"
              optionLabel="name"
              optionValue="id"
              nullLabel="— None —"
              :clearable="true"
            />
          </div>
          <div v-if="sourceType">
            <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wide tw:mb-1.5 tw:block">
              Record
            </label>
            <BaseSelect
              v-model="sourceId"
              :options="sourceRecords"
              optionLabel="name"
              optionValue="id"
              nullLabel="— Select record —"
              :clearable="true"
            />
          </div>
        </div>

        <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:cursor-pointer">
          <input v-model="isRetraining" type="checkbox" />
          <span>Mark as <strong>retraining</strong> (re-assigning training a user has done before)</span>
        </label>

        <div v-if="error" class="tw:text-sm tw:text-red-600 tw:bg-red-50 tw:rounded-lg tw:p-3">
          {{ error }}
        </div>

        <div class="tw:flex tw:justify-end tw:gap-2">
          <BaseButton variant="secondary" @click="model = false">Cancel</BaseButton>
          <BaseButton
            variant="primary"
            :loading="launching"
            :disabled="!effectiveUserIds.length || !reason.trim()"
            @click="handleLaunch"
          >
            <IconRocket :size="16" class="tw:mr-1" /> Launch ({{ effectiveUserIds.length }})
          </BaseButton>
        </div>
      </template>

      <template v-else>
        <div class="tw:flex tw:flex-col tw:items-center tw:gap-3 tw:py-4">
          <div class="tw:w-12 tw:h-12 tw:rounded-full tw:bg-green-100 tw:text-green-600 tw:flex tw:items-center tw:justify-center">
            <IconRocket :size="24" />
          </div>
          <div class="tw:text-center">
            <p class="tw:font-semibold tw:text-on-sidebar">Ad-Hoc Training Launched</p>
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
