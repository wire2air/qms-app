<script setup>
import { useDocuments } from '@/composables/useDocuments.js'

const props = defineProps({
  documentId: { type: String, required: true },
  versionId: { type: String, required: true },
})
const emit = defineEmits(['confirm'])

const show = defineModel({ type: Boolean, default: false })

const toast = useToast()
const { submitForReview } = useDocuments()
const submitting = ref(false)

// ── Local data from IDB ───────────────────────────────────────────────────
const document = useLiveQueryWithDeps([() => props.documentId], async (db, [documentId]) =>
  db.Document.findByPk(documentId),
)

const allWorkflowSteps = useLiveQueryWithDeps(
  [() => document.value?.workflowVersionId],
  async (db, [workflowVersionId]) =>
    workflowVersionId
      ? db.WorkflowStep.where('workflowVersionId', workflowVersionId).orderBy('stepOrder').exec()
      : [],
  {
    initial: [],
  },
)

const stepIds = computed(() => allWorkflowSteps.value.map((s) => s.id))

const allStepUsers = useLiveQueryWithDeps(
  [stepIds],
  async (db, [stepIds]) => db.WorkflowStepUser.where('stepId', stepIds).exec(),
  {
    initial: [],
  },
)

const allStepRoles = useLiveQueryWithDeps(
  [stepIds],
  async (db, [stepIds]) => db.WorkflowStepRole.where('stepId', stepIds).exec(),
  {
    initial: [],
  },
)

const rolesOnUsers = useLiveQueryWithDeps(
  [allStepRoles],
  async (db, [allStepRoles]) => {
    const roleIds = [...new Set(allStepRoles.map((sr) => sr.roleId))]
    if (roleIds.length === 0) return []
    return await db.RoleOnUser.where('roleId', roleIds).exec()
  },
  { initial: [] },
)

const allUsers = useLiveQuery(
  async (db) => (await db.User.where().exec()).filter((u) => u.userStatusId === 'ACTIVE'),
  { initial: [] },
)

const usersById = computed(() => {
  const map = {}
  for (const u of allUsers.value) map[u.id] = u
  return map
})

const steps = computed(() => {
  const stepUserIdMap = {}
  for (const su of allStepUsers.value ?? []) {
    if (!stepUserIdMap[su.stepId]) stepUserIdMap[su.stepId] = []
    stepUserIdMap[su.stepId].push(su.userId)
  }

  for (const sr of allStepRoles.value ?? []) {
    const roleUsers = rolesOnUsers.value.filter((ru) => ru.roleId === sr.roleId)
    if (!stepUserIdMap[sr.stepId]) stepUserIdMap[sr.stepId] = []
    for (const ru of roleUsers) {
      if (!stepUserIdMap[sr.stepId].includes(ru.userId)) {
        stepUserIdMap[sr.stepId].push(ru.userId)
      }
    }
  }

  return allWorkflowSteps.value.map((step) => {
    step.reviewers = (stepUserIdMap[step.id] ?? [])
      .map((userId) => usersById.value[userId])
      .filter(Boolean)
    return step
  })
})

const loading = computed(() => document.value === undefined)

// ── Actions ────────────────────────────────────────────────────────────────
async function confirm() {
  submitting.value = true
  try {
    await submitForReview(props.documentId, props.versionId)
    toast.success('Document submitted for review')
    emit('confirm')
    show.value = false
  } catch (e) {
    toast.error(e.message || 'Failed to submit for review')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="show" title="Workflow Preview" maxWidth="lg" persistent>
    <div class="tw:max-h-[60vh] tw:overflow-auto">
      <div v-if="loading" class="tw:flex tw:items-center tw:justify-center tw:py-12">
        <div
          class="tw:animate-spin tw:rounded-full tw:size-10 tw:border-4 tw:border-primary tw:border-t-transparent"
        />
      </div>

      <div v-else class="tw:space-y-4">
        <h2 class="tw:text-lg tw:font-bold tw:text-on-main tw:px-1">Approval Workflow</h2>

        <div v-for="(step, idx) in steps" :key="step.id" class="tw:relative tw:pl-8 tw:group">
          <!-- Vertical connector line -->
          <div
            v-if="idx < steps.length - 1"
            class="tw:absolute tw:left-2.75 tw:top-6 tw:bottom-0 tw:w-0.5 tw:bg-divider"
          ></div>

          <!-- Step circle indicator -->
          <div
            class="tw:absolute tw:left-0 tw:top-6 tw:size-6 tw:rounded-full tw:bg-main tw:border-2 tw:border-divider tw:flex tw:items-center tw:justify-center tw:text-secondary tw:z-10 tw:text-xs tw:font-bold"
          >
            {{ step.stepOrder }}
          </div>

          <!-- Step card -->
          <div
            class="tw:bg-main-hover tw:rounded-xl tw:border tw:border-dashed tw:border-divider tw:p-5"
          >
            <!-- Step header -->
            <div class="tw:mb-4">
              <h3 class="tw:font-bold tw:text-on-main">
                Step {{ step.stepOrder }}: {{ step.name }}
              </h3>
              <p class="tw:text-xs tw:text-secondary tw:mt-0.5">
                Rule: {{ step.approvalRule }} &bull;
                {{
                  step.approvalRule === 'ANY'
                    ? 'First approval completes step'
                    : 'All reviewers must approve'
                }}
              </p>
            </div>

            <!-- Reviewers -->
            <div class="tw:space-y-2">
              <div
                v-for="reviewer in step.reviewers"
                :key="reviewer.id"
                class="tw:flex tw:items-center tw:gap-3"
              >
                <UserAvatar :user="reviewer" class="tw:size-8" />
                <div>
                  <p class="tw:text-sm tw:font-semibold tw:text-on-main">
                    {{ reviewer.firstName }} {{ reviewer.lastName }}
                  </p>
                  <p class="tw:text-xs tw:text-secondary">{{ reviewer.email }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <BaseButton variant="outline" :disabled="submitting" @click="show = false">Cancel</BaseButton>
      <BaseButton
        data-testid="document-workflow-preview-submit"
        :disabled="submitting"
        @click="confirm"
      >
        {{ submitting ? 'Submitting…' : 'Submit' }}
      </BaseButton>
    </template>
  </BaseDialog>
</template>
