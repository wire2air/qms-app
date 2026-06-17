<script setup>
import { IconCirclePlus, IconTrash, IconAlertCircle } from '@tabler/icons-vue'

const config = defineModel({
  type: Object,
  default: () => ({
    enabled: false,
    autoLaunch: true,
    managerId: null,
    requireManagerVerification: true,
    completionDueDays: 7,
    passingScore: 80,
    maxAttempts: 1,
    roleIds: [],
    userIds: [],
    assessment: [],
  }),
})

function addQuestion() {
  config.value.assessment = [
    ...(config.value.assessment ?? []),
    {
      id: crypto.randomUUID(),
      text: '',
      type: 'single',
      options: [
        { id: crypto.randomUUID(), text: '', isCorrect: true },
        { id: crypto.randomUUID(), text: '', isCorrect: false },
      ],
    },
  ]
}

function removeQuestion(idx) {
  config.value.assessment = config.value.assessment.filter((_, i) => i !== idx)
}

function addOption(q) {
  q.options = [...(q.options ?? []), { id: crypto.randomUUID(), text: '', isCorrect: false }]
}

function removeOption(q, optId) {
  q.options = q.options.filter((o) => o.id !== optId)
}

function setCorrect(q, optId) {
  if (q.type === 'single') {
    q.options = q.options.map((o) => ({ ...o, isCorrect: o.id === optId }))
  } else {
    q.options = q.options.map((o) => (o.id === optId ? { ...o, isCorrect: !o.isCorrect } : o))
  }
}

// Per-question incompleteness hint — drives the red border + tooltip so the
// user can see which card is blocking auto-save (the parent toast tells
// them what's wrong; this points at where).
function questionError(q) {
  if (!q.text?.trim()) return 'Question text required'
  if (!Array.isArray(q.options) || q.options.length < 2) return 'Needs at least 2 options'
  for (let j = 0; j < q.options.length; j++) {
    if (!q.options[j].text?.trim()) return `Option ${j + 1} text required`
  }
  const correct = q.options.filter((o) => o.isCorrect).length
  if (q.type === 'single' && correct !== 1) return 'Select exactly one correct answer'
  if (q.type === 'multiple' && correct < 1) return 'Select at least one correct answer'
  return null
}

const hasAssessment = computed({
  get: () => (config.value.assessment?.length ?? 0) > 0,
  set: (v) => {
    if (v && !config.value.assessment?.length) addQuestion()
    if (!v) config.value.assessment = []
  },
})
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-5">
    <!-- Enable training -->
    <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:p-5">
      <div class="tw:flex tw:items-start tw:justify-between tw:gap-4">
        <div>
          <BaseText as="h3" weight="bold">Enable training for this document</BaseText>
          <p class="tw:text-sm tw:text-secondary tw:mt-1">
            When enabled, a training will be automatically launched for the selected employees each time
            this document becomes effective. They'll be required to read the document and (optionally) pass
            an assessment.
          </p>
        </div>
        <BaseSwitch v-model="config.enabled" />
      </div>
    </div>

    <template v-if="config.enabled">
      <div class="tw:grid tw:grid-cols-1 tw:lg:grid-cols-[1fr_320px] tw:gap-5">
        <!-- Left column — assignees + assessment -->
        <div class="tw:flex tw:flex-col tw:gap-5">
          <!-- Assignees -->
          <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:p-5">
            <BaseText as="h4" weight="bold" class="tw:mb-3">Who needs this training</BaseText>
            <div class="tw:space-y-4">
              <div>
                <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Roles</p>
                <RoleSelectMenu v-model="config.roleIds" :multiple="true" />
              </div>
              <div>
                <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Specific Users</p>
                <UserSelectMenu v-model="config.userIds" :multiple="true" />
              </div>
            </div>
          </div>

          <!-- Assessment -->
          <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:p-5">
            <div class="tw:flex tw:items-start tw:justify-between tw:gap-4 tw:mb-4">
              <div>
                <BaseText as="h4" weight="bold">Assessment</BaseText>
                <p class="tw:text-xs tw:text-secondary tw:mt-1">
                  Quiz the trainee on the document content. Leave disabled for read-and-acknowledge only.
                </p>
              </div>
              <BaseSwitch v-model="hasAssessment" />
            </div>

            <div v-if="hasAssessment" class="tw:flex tw:flex-col tw:gap-3">
              <div
                v-for="(q, qIdx) in config.assessment"
                :key="q.id"
                class="tw:rounded-lg tw:p-3 tw:flex tw:flex-col tw:gap-3 tw:border"
                :class="questionError(q) ? 'tw:border-red-300 tw:bg-red-50/30' : 'tw:border-divider'"
              >
                <div class="tw:flex tw:items-start tw:gap-2">
                  <span class="tw:w-6 tw:h-6 tw:rounded-full tw:bg-gray-100 tw:text-gray-600 tw:text-xs tw:font-bold tw:flex tw:items-center tw:justify-center tw:shrink-0 tw:mt-1">{{ qIdx + 1 }}</span>
                  <BaseTextInput v-model="q.text" placeholder="Question text" class="tw:flex-1" />
                  <button class="tw:p-1 tw:text-secondary tw:hover:text-red-600" @click="removeQuestion(qIdx)">
                    <IconTrash :size="16" />
                  </button>
                </div>
                <p
                  v-if="questionError(q)"
                  class="tw:text-xs tw:text-red-600 tw:ml-8 tw:flex tw:items-center tw:gap-1"
                >
                  <IconAlertCircle :size="12" />
                  {{ questionError(q) }}
                </p>
                <div class="tw:flex tw:items-center tw:gap-2 tw:ml-8">
                  <button
                    class="tw:px-2 tw:py-1 tw:text-xs tw:rounded tw:transition-colors"
                    :class="q.type === 'single' ? 'tw:bg-primary tw:text-white' : 'tw:bg-gray-100 tw:text-secondary'"
                    @click="q.type = 'single'"
                  >Single Choice</button>
                  <button
                    class="tw:px-2 tw:py-1 tw:text-xs tw:rounded tw:transition-colors"
                    :class="q.type === 'multiple' ? 'tw:bg-primary tw:text-white' : 'tw:bg-gray-100 tw:text-secondary'"
                    @click="q.type = 'multiple'"
                  >Multiple Choice</button>
                  <span class="tw:text-xs tw:text-secondary tw:ml-2">
                    {{ q.type === 'single' ? 'Select the one correct answer.' : 'Select all correct answers.' }}
                  </span>
                </div>
                <div class="tw:ml-8 tw:flex tw:flex-col tw:gap-2">
                  <div v-for="opt in q.options" :key="opt.id" class="tw:flex tw:items-center tw:gap-2">
                    <input
                      :type="q.type === 'single' ? 'radio' : 'checkbox'"
                      :checked="opt.isCorrect"
                      @change="setCorrect(q, opt.id)"
                    />
                    <BaseTextInput v-model="opt.text" placeholder="Option text" class="tw:flex-1" />
                    <button v-if="q.options.length > 2" class="tw:p-1 tw:text-secondary tw:hover:text-red-600" @click="removeOption(q, opt.id)">
                      <IconTrash :size="14" />
                    </button>
                  </div>
                  <button class="tw:text-xs tw:text-primary tw:hover:underline tw:self-start" @click="addOption(q)">+ Add option</button>
                </div>
              </div>

              <button
                class="tw:w-full tw:py-3 tw:border-2 tw:border-dashed tw:border-divider tw:rounded-lg tw:text-secondary tw:hover:text-primary tw:hover:border-primary tw:transition-all tw:flex tw:items-center tw:justify-center tw:gap-2 tw:font-medium tw:text-sm"
                @click="addQuestion"
              >
                <IconCirclePlus :size="16" />
                Add Question
              </button>
            </div>
          </div>
        </div>

        <!-- Right column — settings sidebar -->
        <aside class="tw:flex tw:flex-col tw:gap-5">
          <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:p-5 tw:space-y-4">
            <div>
              <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
                Training Manager
                <span class="tw:text-red-600 tw:font-normal">*</span>
              </p>
              <UserSelectMenu v-model="config.managerId" nullLabel="Select a manager" />
              <p
                class="tw:text-[11px] tw:mt-1"
                :class="config.enabled && !config.managerId ? 'tw:text-red-600 tw:font-medium' : 'tw:text-secondary'"
              >
                <template v-if="config.enabled && !config.managerId">
                  Required — receives completion notifications and verifies competency.
                </template>
                <template v-else>
                  Receives completion notifications and verifies competency.
                </template>
              </p>
            </div>
            <div>
              <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Due (days after effective)</p>
              <BaseTextInput v-model.number="config.completionDueDays" type="number" min="1" />
            </div>
            <div v-if="hasAssessment">
              <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Passing Score (%)</p>
              <BaseTextInput v-model.number="config.passingScore" type="number" min="0" max="100" />
            </div>
            <div v-if="hasAssessment">
              <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Max Attempts</p>
              <BaseTextInput v-model.number="config.maxAttempts" type="number" min="1" max="10" />
            </div>
          </div>

          <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:p-5 tw:space-y-4">
            <div class="tw:flex tw:items-start tw:justify-between">
              <div>
                <label class="tw:text-sm tw:font-medium tw:text-on-sidebar">
                  Manager Verification Required
                  <span class="tw:text-xs tw:font-normal tw:text-secondary">(For compliance)</span>
                </label>
                <p class="tw:text-[11px] tw:text-secondary">If off, the training closes automatically on completion.</p>
              </div>
              <BaseSwitch v-model="config.requireManagerVerification" />
            </div>
            <div class="tw:flex tw:items-start tw:justify-between">
              <div>
                <label class="tw:text-sm tw:font-medium tw:text-on-sidebar">Auto-launch on Effective</label>
                <p class="tw:text-[11px] tw:text-secondary">Launch the training when this document becomes effective.</p>
              </div>
              <BaseSwitch v-model="config.autoLaunch" />
            </div>
          </div>

          <div class="tw:flex tw:items-start tw:gap-2 tw:p-3 tw:rounded-lg tw:bg-blue-50 tw:border tw:border-blue-200 tw:text-xs tw:text-blue-800">
            <IconAlertCircle :size="16" class="tw:shrink-0 tw:mt-0.5" />
            <p>
              A new training instance is launched for the selected employees every time this document
              becomes effective (each revision). The instance is pinned to that specific effective version.
            </p>
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>
