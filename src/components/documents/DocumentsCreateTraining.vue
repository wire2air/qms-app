<script setup>
import { defaultTrainingConfig } from './documentTrainingConfig.js'
import {
  IconCirclePlus,
  IconTrash,
  IconAlertCircle,
  IconExternalLink,
  IconHelpCircle,
} from '@tabler/icons-vue'
import { useTooltipData } from '@shared/composables/useTooltipData.js'
import { getCompanyPath } from '@/utils/routeHelpers'
import { isAllowed } from '@/utils/currentSession.js'
import { commonSupervisorId } from '@/utils/trainingManager'

// The third copy of this shape, now the same one. A `default` on a model that
// every caller passes is a fallback, not a policy — enabled:false so an
// unbound instance never reads as opted in.
const config = defineModel({
  type: Object,
  default: () => defaultTrainingConfig(false),
})

// Training cannot run without someone accountable for it, so an enabled
// config with no manager is an error state rather than a hint.
const managerMissing = computed(() => config.value.enabled && !config.value.managerId)

// Section headings are not form labels, so this reads the registry directly
// rather than through BaseLabel — same copy, BaseRailCard's presentation.
const { getFromTooltipData } = useTooltipData({})
const assessmentHelp = computed(() => getFromTooltipData('training.assessment', 'tooltip'))

// Same gate the /training-curriculum route uses — offering a link the router
// will bounce them off is worse than offering nothing.
const canManageCurricula = computed(() => isAllowed(['training:read']))

// The training audience: users mapped to the selected curricula (via roles) plus
// any directly-added users.
const audienceUsers = useLiveQueryWithDeps(
  [() => config.value.curriculumIds, () => config.value.userIds],
  async (db, [curriculumIds, userIds]) => {
    const set = new Set(userIds || [])
    if (curriculumIds?.length) {
      const rcs = await db.RoleCurriculum.where().exec()
      const roleIds = [
        ...new Set(
          rcs.filter((rc) => curriculumIds.includes(rc.curriculumId)).map((rc) => rc.roleId),
        ),
      ]
      if (roleIds.length) {
        const assignments = await db.RoleOnUser.where().exec()
        assignments.filter((a) => roleIds.includes(a.roleId)).forEach((a) => set.add(a.userId))
      }
    }
    const ids = [...set]
    if (!ids.length) return []
    return (await Promise.all(ids.map((id) => db.User.findByPk(id)))).filter(Boolean)
  },
  { models: ['RoleCurriculum', 'RoleOnUser', 'User'], initial: [] },
)

// Default the Training Manager to the audience's common supervisor (they verify).
// Only fills when the manager is unset or still holds a prior auto-default, so a
// manual choice is never overwritten. No default when supervisors differ.
const autoManagerId = ref(null)
watch(audienceUsers, (users) => {
  const sup = commonSupervisorId(users)
  if (!config.value.managerId || config.value.managerId === autoManagerId.value) {
    config.value.managerId = sup
    autoManagerId.value = sup
  }
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
    <!-- The toggle lives HERE, not only on Properties.
         It used to say "turn it on from the Properties tab", which is a
         dead-end on the document DETAIL page: there is no Properties tab
         there, only a Properties rail, and until 2026-09-20 no toggle at all.
         An author who turned training off at the submit-for-review prompt was
         then looking at a screen telling them to use a tab that does not
         exist. A control is a better answer than a pointer to one. -->
    <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:p-5">
      <div class="tw:flex tw:items-center tw:gap-3">
        <IconAlertCircle v-if="!config.enabled" :size="18" class="tw:text-secondary tw:shrink-0" />
        <div class="tw:flex-1 tw:min-w-0">
          <p class="tw:text-sm tw:font-medium tw:text-on-sidebar">Training for this version</p>
          <p class="tw:text-xs tw:text-secondary">
            {{
              config.enabled
                ? 'Readers are assigned training when the document becomes effective.'
                : 'Turn on to choose who must be trained and add assessment questions.'
            }}
          </p>
        </div>
        <BaseSwitch v-model="config.enabled" label="Enable training for this version" />
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
                <!-- "Curriculum" means nothing to someone meeting it here for
                     the first time, and the sentence that used to sit under
                     the picker explained the EFFECT without explaining the
                     THING. The article does that properly, opened inline so
                     the author does not lose a half-filled form; the manage
                     link is for when the answer is "there isn't one yet".
                     Inline prose stays out of it — see the tooltip/help
                     preference, 2026-09-20. -->
                <div class="tw:flex tw:items-center tw:gap-1.5 tw:mb-1">
                  <p
                    class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary"
                  >
                    Curriculum
                  </p>
                  <HelpButton slug="KB/training/training-curriculum" :size="14" />
                </div>
                <CurriculumSelectMenu v-model="config.curriculumIds" :multiple="true" />
                <RouterLink
                  v-if="canManageCurricula"
                  :to="getCompanyPath('/training-curriculum')"
                  target="_blank"
                  class="tw:inline-flex tw:items-center tw:gap-1 tw:text-caption tw:text-primary tw:hover:underline tw:mt-1"
                >
                  Manage curricula
                  <IconExternalLink :size="12" />
                </RouterLink>
              </div>
              <div>
                <p
                  class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1"
                >
                  Specific Users
                </p>
                <UserSelectMenu v-model="config.userIds" :multiple="true" />
              </div>
            </div>
          </div>

          <!-- Assessment -->
          <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:p-5">
            <div class="tw:flex tw:items-start tw:justify-between tw:gap-4 tw:mb-4">
              <div class="tw:flex tw:items-center tw:gap-1.5">
                <BaseText as="h4" weight="bold">Assessment</BaseText>
                <BaseTooltip :content="assessmentHelp">
                  <span
                    class="tw:inline-flex tw:cursor-help tw:text-secondary tw:hover:text-on-main"
                  >
                    <IconHelpCircle :size="14" aria-hidden="true" />
                  </span>
                </BaseTooltip>
              </div>
              <BaseSwitch v-model="hasAssessment" label="Add an assessment the trainee must pass" />
            </div>

            <div v-if="hasAssessment" class="tw:flex tw:flex-col tw:gap-3">
              <div
                v-for="(q, qIdx) in config.assessment"
                :key="q.id"
                class="tw:rounded-lg tw:p-3 tw:flex tw:flex-col tw:gap-3 tw:border"
                :class="
                  questionError(q) ? 'tw:border-red-300 tw:bg-red-50/30' : 'tw:border-divider'
                "
              >
                <div class="tw:flex tw:items-start tw:gap-2">
                  <span
                    class="tw:w-6 tw:h-6 tw:rounded-full tw:bg-gray-100 tw:text-gray-600 tw:text-xs tw:font-bold tw:flex tw:items-center tw:justify-center tw:shrink-0 tw:mt-1"
                    >{{ qIdx + 1 }}</span
                  >
                  <BaseTextInput v-model="q.text" placeholder="Question text" class="tw:flex-1" />
                  <button
                    class="tw:p-1 tw:text-secondary tw:hover:text-red-600"
                    @click="removeQuestion(qIdx)"
                  >
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
                    :class="
                      q.type === 'single'
                        ? 'tw:bg-primary tw:text-white'
                        : 'tw:bg-gray-100 tw:text-secondary'
                    "
                    @click="q.type = 'single'"
                  >
                    Single Choice
                  </button>
                  <button
                    class="tw:px-2 tw:py-1 tw:text-xs tw:rounded tw:transition-colors"
                    :class="
                      q.type === 'multiple'
                        ? 'tw:bg-primary tw:text-white'
                        : 'tw:bg-gray-100 tw:text-secondary'
                    "
                    @click="q.type = 'multiple'"
                  >
                    Multiple Choice
                  </button>
                  <span class="tw:text-xs tw:text-secondary tw:ml-2">
                    {{
                      q.type === 'single'
                        ? 'Select the one correct answer.'
                        : 'Select all correct answers.'
                    }}
                  </span>
                </div>
                <div class="tw:ml-8 tw:flex tw:flex-col tw:gap-2">
                  <div
                    v-for="opt in q.options"
                    :key="opt.id"
                    class="tw:flex tw:items-center tw:gap-2"
                  >
                    <input
                      :type="q.type === 'single' ? 'radio' : 'checkbox'"
                      :checked="opt.isCorrect"
                      @change="setCorrect(q, opt.id)"
                    />
                    <BaseTextInput v-model="opt.text" placeholder="Option text" class="tw:flex-1" />
                    <button
                      v-if="q.options.length > 2"
                      class="tw:p-1 tw:text-secondary tw:hover:text-red-600"
                      @click="removeOption(q, opt.id)"
                    >
                      <IconTrash :size="14" />
                    </button>
                  </div>
                  <button
                    class="tw:text-xs tw:text-primary tw:hover:underline tw:self-start"
                    @click="addOption(q)"
                  >
                    + Add option
                  </button>
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
              <!-- The caption here did two jobs: it explained the role AND it
                   was the validation message, turning red when training is on
                   with no manager picked. Only the explanation belongs behind
                   the `?` — an unmet requirement has to stay visible, so it
                   moves to BaseErrorText (role="alert", announced) and renders
                   only in the error state. -->
              <BaseLabel dataKey="training.manager" required class="tw:mb-1">
                Training manager
              </BaseLabel>
              <UserSelectMenu v-model="config.managerId" nullLabel="Select a manager" />
              <BaseErrorText v-if="managerMissing" class="tw:mt-1">
                Required before this training can run.
              </BaseErrorText>
            </div>
            <div>
              <p
                class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1"
              >
                Due (days after effective)
              </p>
              <BaseTextInput v-model.number="config.completionDueDays" type="number" min="1" />
            </div>
            <div v-if="hasAssessment">
              <p
                class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1"
              >
                Passing Score (%)
              </p>
              <BaseTextInput v-model.number="config.passingScore" type="number" min="0" max="100" />
            </div>
            <div v-if="hasAssessment">
              <p
                class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1"
              >
                Max Attempts
              </p>
              <BaseTextInput v-model.number="config.maxAttempts" type="number" min="1" max="10" />
            </div>
          </div>

          <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:p-5 tw:space-y-4">
            <!-- Explanations live behind the `?`, not under the label: two
                 settings with a sentence each turned this panel into prose.
                 BaseLabel resolves the copy from the tooltip registry and
                 renders the icon as a focusable button, so it is reachable by
                 keyboard rather than hover-only.

                 Each BaseSwitch also gets a real `label`: the prop defaults to
                 "Toggle setting", so both switches announced identically to a
                 screen reader and the text leaked into copied page text. -->
            <div class="tw:flex tw:items-center tw:justify-between tw:gap-3">
              <BaseLabel dataKey="training.managerVerification">
                Manager verification required
              </BaseLabel>
              <BaseSwitch
                v-model="config.requireManagerVerification"
                label="Require manager verification before the training counts as complete"
              />
            </div>
            <div class="tw:flex tw:items-center tw:justify-between tw:gap-3">
              <BaseLabel dataKey="training.autoLaunch">Auto-launch on effective</BaseLabel>
              <BaseSwitch
                v-model="config.autoLaunch"
                label="Launch the training automatically when this document becomes effective"
              />
            </div>
          </div>

          <div
            class="tw:flex tw:items-start tw:gap-2 tw:p-3 tw:rounded-lg tw:bg-blue-50 tw:border tw:border-blue-200 tw:text-xs tw:text-blue-800"
          >
            <IconAlertCircle :size="16" class="tw:shrink-0 tw:mt-0.5" />
            <p>
              A new training instance is launched for the selected employees every time this
              document becomes effective (each revision). The instance is pinned to that specific
              effective version.
            </p>
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>
