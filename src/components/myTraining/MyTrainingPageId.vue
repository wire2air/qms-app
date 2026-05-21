<script setup>
import { IconChevronRight, IconCheck, IconExternalLink } from '@tabler/icons-vue'
import { currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { post, put } from '@/api'

const props = defineProps({
  id: { type: String, required: true },
})

const toast = useToast()

// ─── Data ─────────────────────────────────────────────────────────────────────
const instance = useLiveQueryWithDeps([() => props.id], async (db, [id]) =>
  db.TrainingInstance.findByPk(id),
)

const myAssignee = useLiveQueryWithDeps(
  [() => props.id, () => currentSession.value?.userId],
  async (db, [instanceId, userId]) => {
    if (!userId) return null
    const results = await db.TrainingAssignee
      .where('[trainingInstanceId+userId]', [instanceId, userId])
      .exec()
    return results[0] ?? null
  },
)

const loading = computed(() => instance.value === undefined)

// ─── Stepper ──────────────────────────────────────────────────────────────────
const step = ref('instructions') // 'instructions' | 'material' | 'assessment' | 'result'

// Start training
const starting = ref(false)
async function handleStart() {
  starting.value = true
  try {
    await post(`/v1/services/trainingInstances/${props.id}/start`, {})
    step.value = 'material'
  } catch (err) {
    toast.notify({ type: 'negative', message: err.message || 'Failed to start' })
  } finally {
    starting.value = false
  }
}

// ─── Interaction tracking ─────────────────────────────────────────────────────
const viewedDocIds = ref([])
const viewedLinkUrls = ref([])
const viewingDocId = ref(null)
const showDocDialog = ref(false)

const allMaterialViewed = computed(() => {
  const docs = instance.value?.snapshot?.documentIds ?? []
  const links = instance.value?.snapshot?.externalLinks ?? []
  return docs.every((id) => viewedDocIds.value.includes(id)) &&
    links.every((l) => viewedLinkUrls.value.includes(l.url))
})

const viewingVersionId = ref(null)
function openDocument(docId) {
  if (!viewedDocIds.value.includes(docId)) viewedDocIds.value = [...viewedDocIds.value, docId]
  viewingDocId.value = docId
  // Pin to the version that was effective at training launch (falls back to current effective)
  viewingVersionId.value = instance.value?.snapshot?.documentVersionByDocId?.[docId] ?? null
  showDocDialog.value = true
}

function markLinkViewed(url) {
  if (!viewedLinkUrls.value.includes(url)) viewedLinkUrls.value = [...viewedLinkUrls.value, url]
}

const interactionsLoaded = ref(false)
watch(myAssignee, (assignee) => {
  if (interactionsLoaded.value || !assignee) return
  interactionsLoaded.value = true
  const saved = assignee.assessmentAnswers?.__interactions
  if (saved?.docs) viewedDocIds.value = saved.docs
  if (saved?.links) viewedLinkUrls.value = saved.links
}, { immediate: true })

// ─── Answers ──────────────────────────────────────────────────────────────────
const answers = ref({})

const saveAnswersDebounced = useDebounceFn(async () => {
  try {
    await put(`/v1/services/trainingInstances/${props.id}/answers`, {
      answers: {
        ...answers.value,
        __interactions: { docs: viewedDocIds.value, links: viewedLinkUrls.value },
      },
    })
  } catch {
    // silent — auto-save failure shouldn't disrupt UX
  }
}, 1000)

function shouldAutoSave() {
  const a = myAssignee.value
  if (!a) return false
  if (a.status === 'IN_PROGRESS') return true
  // Allow saving during a retry attempt (FAILED but still has retries left)
  const max = instance.value?.snapshot?.maxAttempts ?? 1
  return a.status === 'FAILED' && (a.attemptCount ?? 0) < max
}

watch(answers, () => {
  if (shouldAutoSave()) saveAnswersDebounced()
}, { deep: true })

watch([viewedDocIds, viewedLinkUrls], () => {
  if (shouldAutoSave()) saveAnswersDebounced()
}, { deep: true })

const answersLoaded = ref(false)
watch(myAssignee, (assignee) => {
  if (answersLoaded.value || !assignee) return
  answersLoaded.value = true
  if (assignee.assessmentAnswers) {
    const { __interactions, ...rest } = assignee.assessmentAnswers
    answers.value = rest
  }
}, { immediate: true })

// ─── Submit ───────────────────────────────────────────────────────────────────
const submitting = ref(false)
const submitResult = ref(null)

// ─── Submit (with employee e-signature) ──────────────────────────────────────
const hasAssessment = computed(() => (instance.value?.snapshot?.assessment?.length ?? 0) > 0)
const showEsignDialog = ref(false)

const stepperSteps = computed(() => {
  const steps = [
    { id: 'instructions', label: 'Instructions' },
    { id: 'material', label: 'Material' },
  ]
  if (hasAssessment.value) steps.push({ id: 'assessment', label: 'Assessment' })
  return steps
})

function openSubmitSignDialog() {
  showEsignDialog.value = true
}

async function onEsignVerified(esign) {
  submitting.value = true
  try {
    submitResult.value = await post(
      `/v1/services/trainingInstances/${props.id}/submit`,
      {
        answers: hasAssessment.value ? answers.value : {},
        signatureMethod: esign?.method ?? 'password',
      },
    )
    showEsignDialog.value = false
    step.value = 'result'
  } catch (err) {
    toast.notify({ type: 'negative', message: err.message || 'Failed to submit' })
  } finally {
    submitting.value = false
  }
}

async function handleRetry() {
  // Clear local + remote answers so the retry starts fresh
  answers.value = {}
  try {
    await put(`/v1/services/trainingInstances/${props.id}/answers`, {
      answers: { __interactions: { docs: viewedDocIds.value, links: viewedLinkUrls.value } },
    })
  } catch {
    // best-effort; user can still submit and backend will accept body answers
  }
  submitResult.value = null
  step.value = 'assessment'
}

// Retry eligibility — prefer fresh API response data over (possibly stale) live query
const effectiveAssignee = computed(() => submitResult.value?.assignee ?? myAssignee.value)
const maxAttempts = computed(() => instance.value?.snapshot?.maxAttempts ?? 1)

const canRetry = computed(() => {
  const a = effectiveAssignee.value
  if (!a || a.status !== 'FAILED') return false
  return (a.attemptCount ?? 0) < maxAttempts.value
})

const isLockedOut = computed(() => {
  const a = effectiveAssignee.value
  if (!a) return false
  if (a.status === 'COMPLETED') return true
  if (a.status === 'FAILED' && (a.attemptCount ?? 0) >= maxAttempts.value) return true
  return false
})
</script>

<template>
  <div v-if="loading" class="tw:flex tw:items-center tw:justify-center tw:h-64">
    <BaseSpinner />
  </div>
  <div v-else-if="!instance" class="tw:flex tw:items-center tw:justify-center tw:h-64 tw:text-secondary">
    Training not found.
  </div>
  <div v-else-if="!myAssignee" class="tw:flex tw:items-center tw:justify-center tw:h-64 tw:text-secondary">
    You are not assigned to this training.
  </div>
  <div v-else class="tw:flex tw:flex-col tw:gap-4 tw:p-5">
    <SafeTeleport to="#main-header-title">
      <div class="tw:flex tw:items-center tw:gap-1 tw:text-sm tw:text-secondary">
        <RouterLink :to="getCompanyPath('/tasks')" class="tw:hover:text-primary">My Tasks</RouterLink>
        <IconChevronRight :size="14" />
        <span class="tw:text-on-sidebar tw:font-medium">{{ instance.snapshot?.title }}</span>
      </div>
    </SafeTeleport>

    <!-- Header -->
    <div class="tw:flex tw:items-start tw:justify-between">
      <div>
        <h1 class="tw:text-2xl tw:font-bold tw:text-on-sidebar">{{ instance.snapshot?.title }}</h1>
        <div class="tw:flex tw:items-center tw:gap-2 tw:mt-1">
          <TrainingAssigneeStatusBadgeById :statusId="myAssignee.status" />
          <span v-if="instance.dueDate" class="tw:text-xs tw:text-secondary">
            Due {{ instance.dueDate?.formatDate('date') }}
          </span>
        </div>
      </div>
    </div>

    <!-- Stepper (Assessment step hidden when training has no questions) -->
    <div class="tw:flex tw:items-center tw:gap-2 tw:bg-gray-50 tw:rounded-lg tw:p-3">
      <div
        v-for="(s, idx) in stepperSteps"
        :key="s.id"
        class="tw:flex tw:items-center tw:gap-1"
      >
        <div
          class="tw:flex tw:items-center tw:gap-1.5 tw:px-3 tw:py-1 tw:rounded-full tw:text-sm tw:font-medium tw:transition-colors"
          :class="step === s.id ? 'tw:bg-primary tw:text-white' : 'tw:text-secondary'"
        >
          <span v-if="step === s.id" class="tw:w-5 tw:h-5 tw:rounded-full tw:bg-white tw:text-primary tw:text-xs tw:flex tw:items-center tw:justify-center tw:font-bold">{{ idx + 1 }}</span>
          {{ s.label }}
        </div>
        <IconChevronRight v-if="idx < stepperSteps.length - 1" :size="14" class="tw:text-secondary" />
      </div>
    </div>

    <!-- Step: Instructions -->
    <div v-if="step === 'instructions'" class="tw:flex tw:flex-col tw:gap-4">
      <div class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-5">
        <h2 class="tw:text-lg tw:font-semibold tw:text-on-sidebar tw:mb-3">Instructions</h2>
        <TiptapEditor
          v-if="instance.snapshot?.instructions"
          :modelValue="instance.snapshot.instructions"
          :editable="false"
        />
        <p v-else class="tw:text-sm tw:text-secondary tw:italic">No specific instructions provided.</p>
      </div>
      <div v-if="instance.snapshot?.description" class="tw:text-sm tw:text-secondary">
        {{ instance.snapshot.description }}
      </div>
      <div class="tw:flex tw:justify-end">
        <BaseButton
          v-if="isLockedOut"
          variant="primary"
          @click="step = 'result-review'"
        >
          View Results
        </BaseButton>
        <BaseButton
          v-else-if="myAssignee.status === 'ASSIGNED'"
          variant="primary"
          :loading="starting"
          @click="handleStart"
        >
          Start Training
        </BaseButton>
        <BaseButton v-else variant="primary" @click="step = 'material'">
          Continue to Material
        </BaseButton>
      </div>
    </div>

    <!-- Step: Material -->
    <div v-else-if="step === 'material'" class="tw:flex tw:flex-col tw:gap-4">
      <div class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-5">
        <h2 class="tw:text-lg tw:font-semibold tw:text-on-sidebar tw:mb-3">Training Material</h2>

        <div v-if="instance.snapshot?.documentIds?.length" class="tw:mb-4">
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-2">Reference Documents</p>
          <div class="tw:flex tw:flex-col tw:gap-1">
            <div
              v-for="docId in instance.snapshot.documentIds"
              :key="docId"
              class="tw:flex tw:items-center tw:justify-between tw:p-2 tw:rounded-lg tw:border tw:border-divider tw:cursor-pointer tw:hover:bg-gray-50 tw:transition-colors"
              @click="openDocument(docId)"
            >
              <DocumentBadgeById :documentId="docId" />
              <div class="tw:flex tw:items-center tw:gap-1.5 tw:shrink-0">
                <span v-if="!viewedDocIds.includes(docId)" class="tw:text-xs tw:text-secondary">Click to view</span>
                <IconCheck v-else :size="16" class="tw:text-green-500" />
              </div>
            </div>
          </div>
        </div>

        <div v-if="instance.snapshot?.externalLinks?.length">
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-2">Links</p>
          <div class="tw:flex tw:flex-col tw:gap-1">
            <a
              v-for="link in instance.snapshot.externalLinks"
              :key="link.url"
              :href="link.url"
              target="_blank"
              class="tw:flex tw:items-center tw:justify-between tw:p-2 tw:rounded-lg tw:border tw:border-divider tw:hover:bg-gray-50 tw:transition-colors"
              @click="markLinkViewed(link.url)"
            >
              <span class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-primary">
                <IconExternalLink :size="14" class="tw:shrink-0" />
                {{ link.title || link.url }}
              </span>
              <div class="tw:flex tw:items-center tw:gap-1.5 tw:shrink-0">
                <span v-if="!viewedLinkUrls.includes(link.url)" class="tw:text-xs tw:text-secondary">Click to open</span>
                <IconCheck v-else :size="16" class="tw:text-green-500" />
              </div>
            </a>
          </div>
        </div>

        <p v-if="!instance.snapshot?.documentIds?.length && !instance.snapshot?.externalLinks?.length" class="tw:text-sm tw:text-secondary tw:italic">
          No material linked to this training.
        </p>
      </div>

      <p v-if="!allMaterialViewed" class="tw:text-xs tw:text-secondary tw:text-center">
        Please review all documents and links above before proceeding.
      </p>

      <div class="tw:flex tw:justify-between">
        <BaseButton variant="secondary" @click="step = 'instructions'">Back</BaseButton>
        <BaseButton
          v-if="instance.snapshot?.assessment?.length"
          variant="primary"
          :disabled="!allMaterialViewed"
          @click="step = 'assessment'"
        >
          Proceed to Assessment
        </BaseButton>
        <BaseButton
          v-else
          variant="primary"
          :disabled="!allMaterialViewed"
          :loading="submitting"
          @click="openSubmitSignDialog"
        >
          Mark Complete &amp; Submit
        </BaseButton>
      </div>
    </div>

    <!-- Step: Assessment -->
    <div v-else-if="step === 'assessment'" class="tw:flex tw:flex-col tw:gap-4">
      <TrainingAssessmentView
        :answers="answers"
        :questions="instance.snapshot?.assessment ?? []"
        :passingScore="instance.snapshot?.passingScore ?? 70"
        :attemptCount="effectiveAssignee?.attemptCount ?? 0"
        :maxAttempts="maxAttempts"
        @update:answers="answers = $event"
      />
      <div v-if="isLockedOut" class="tw:text-sm tw:text-secondary tw:italic tw:text-center">
        {{ effectiveAssignee?.status === 'COMPLETED'
          ? 'You have already completed this training.'
          : 'Maximum attempts reached. You can no longer submit this assessment.' }}
      </div>
      <div v-else class="tw:flex tw:justify-between">
        <BaseButton variant="secondary" @click="step = 'material'">Back</BaseButton>
        <BaseButton variant="primary" :loading="submitting" :disabled="isLockedOut" @click="openSubmitSignDialog">
          Submit Assessment
        </BaseButton>
      </div>
    </div>

    <!-- Step: Result -->
    <div v-else-if="step === 'result'" class="tw:flex tw:justify-center">
      <div class="tw:bg-white tw:rounded-xl tw:border tw:border-divider tw:p-8 tw:max-w-sm tw:w-full tw:flex tw:flex-col tw:items-center tw:gap-4">
        <div
          class="tw:w-16 tw:h-16 tw:rounded-full tw:flex tw:items-center tw:justify-center tw:text-2xl tw:font-black"
          :class="submitResult?.passed ? 'tw:bg-green-100 tw:text-green-700' : 'tw:bg-red-100 tw:text-red-700'"
        >
          {{ submitResult?.score }}%
        </div>
        <div class="tw:text-center">
          <p class="tw:text-xl tw:font-bold tw:text-on-sidebar">
            {{ submitResult?.passed ? 'Passed!' : 'Failed' }}
          </p>
          <p class="tw:text-sm tw:text-secondary tw:mt-1">
            <template v-if="submitResult?.passed">
              Congratulations! You completed this training.
            </template>
            <template v-else-if="canRetry">
              Score below passing threshold of {{ instance.snapshot?.passingScore ?? 70 }}%. Please review the material and try again.
            </template>
            <template v-else>
              Score below passing threshold of {{ instance.snapshot?.passingScore ?? 70 }}%. Maximum attempts reached.
            </template>
          </p>
        </div>
        <BaseButton v-if="canRetry" variant="secondary" @click="handleRetry">
          Retry Assessment
        </BaseButton>
      </div>
    </div>

    <!-- Locked-out review (read-only past attempt) -->
    <div v-if="step === 'result-review'" class="tw:flex tw:flex-col tw:gap-4">
      <div class="tw:bg-white tw:rounded-xl tw:border tw:border-divider tw:p-6 tw:flex tw:items-center tw:gap-4">
        <div
          class="tw:w-14 tw:h-14 tw:rounded-full tw:flex tw:items-center tw:justify-center tw:text-xl tw:font-black tw:shrink-0"
          :class="effectiveAssignee?.status === 'COMPLETED' ? 'tw:bg-green-100 tw:text-green-700' : 'tw:bg-red-100 tw:text-red-700'"
        >
          {{ effectiveAssignee?.score ?? 0 }}%
        </div>
        <div>
          <p class="tw:text-lg tw:font-bold tw:text-on-sidebar">
            {{ effectiveAssignee?.status === 'COMPLETED' ? 'Passed' : 'Failed' }}
          </p>
          <p class="tw:text-sm tw:text-secondary">
            Final attempt {{ effectiveAssignee?.attemptCount ?? 0 }} of {{ maxAttempts }} ·
            Passing score {{ instance.snapshot?.passingScore ?? 70 }}%
          </p>
          <p v-if="effectiveAssignee?.completedAt" class="tw:text-xs tw:text-secondary tw:mt-1">
            Completed {{ effectiveAssignee.completedAt.formatDate('date') }}
          </p>
        </div>
      </div>
      <TrainingAssessmentView
        :answers="answers"
        :questions="instance.snapshot?.assessment ?? []"
        :passingScore="instance.snapshot?.passingScore ?? 70"
        :attemptCount="effectiveAssignee?.attemptCount ?? 0"
        :maxAttempts="maxAttempts"
        :readonly="true"
        @update:answers="answers = $event"
      />
    </div>

    <TrainingDocumentViewDialog v-model="showDocDialog" :documentId="viewingDocId" :versionId="viewingVersionId" />
    <WorkflowInstanceEsignAuthDialog v-model="showEsignDialog" @verified="onEsignVerified" />
  </div>
</template>
