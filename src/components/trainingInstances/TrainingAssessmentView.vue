<script setup>
import { IconCheck, IconX } from '@tabler/icons-vue'

const props = defineProps({
  questions: { type: Array, default: () => [] },
  passingScore: { type: Number, default: 70 },
  attemptCount: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 1 },
  readonly: { type: Boolean, default: false },
  showCorrect: { type: Boolean, default: false },
})

const answers = defineModel('answers', { type: Object, default: () => ({}) })

const attemptsLeft = computed(() => Math.max(0, props.maxAttempts - props.attemptCount))

function optionState(question, opt) {
  const selected = isSelected(question.id, opt.id)
  if (!props.showCorrect) return selected ? 'selected' : 'idle'
  if (selected && opt.isCorrect) return 'correctSelected'
  if (selected && !opt.isCorrect) return 'wrongSelected'
  if (!selected && opt.isCorrect) return 'correctMissed'
  return 'idle'
}

function isSelected(questionId, optionId) {
  const ans = answers.value[questionId]
  if (!ans) return false
  return Array.isArray(ans) ? ans.includes(optionId) : ans === optionId
}

function toggleAnswer(question, optionId) {
  const current = answers.value[question.id]
  if (question.type === 'single') {
    answers.value = { ...answers.value, [question.id]: optionId }
  } else {
    const arr = Array.isArray(current) ? [...current] : []
    const idx = arr.indexOf(optionId)
    if (idx >= 0) arr.splice(idx, 1)
    else arr.push(optionId)
    answers.value = { ...answers.value, [question.id]: arr }
  }
}

const answeredCount = computed(() => {
  return props.questions.filter((q) => {
    const ans = answers.value[q.id]
    return ans !== undefined && ans !== null && (Array.isArray(ans) ? ans.length > 0 : ans !== '')
  }).length
})
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4">
    <div class="tw:flex tw:items-center tw:justify-between tw:bg-gray-50 tw:rounded-lg tw:p-3">
      <div class="tw:flex tw:items-center tw:gap-3 tw:flex-wrap">
        <p class="tw:text-sm tw:font-medium tw:text-on-sidebar">
          {{ questions.length }} question{{ questions.length !== 1 ? 's' : '' }} — passing score
          {{ passingScore }}%
        </p>
        <span class="tw:text-secondary">·</span>
        <p
          class="tw:text-sm tw:font-medium"
          :class="
            attemptsLeft === 0
              ? 'tw:text-red-600'
              : attemptsLeft === 1 && attemptCount > 0
                ? 'tw:text-amber-600'
                : 'tw:text-secondary'
          "
        >
          Attempt {{ Math.min(attemptCount + 1, maxAttempts) }} of {{ maxAttempts }}
          <span v-if="attemptsLeft > 0 && attemptCount > 0" class="tw:text-xs">
            ({{ attemptsLeft }} {{ attemptsLeft === 1 ? 'retry' : 'retries' }} remaining)
          </span>
        </p>
      </div>
      <p class="tw:text-xs tw:text-secondary">
        {{ answeredCount }}/{{ questions.length }} answered
      </p>
    </div>

    <div
      v-for="(q, idx) in questions"
      :key="q.id"
      class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:flex-col tw:gap-3"
    >
      <div class="tw:flex tw:items-start tw:gap-2">
        <span
          class="tw:w-6 tw:h-6 tw:rounded-full tw:bg-gray-100 tw:text-gray-600 tw:text-xs tw:font-bold tw:flex tw:items-center tw:justify-center tw:shrink-0"
        >
          {{ idx + 1 }}
        </span>
        <p class="tw:font-medium tw:text-on-sidebar">{{ q.text }}</p>
      </div>
      <p class="tw:text-xs tw:text-secondary tw:ml-8">
        {{ q.type === 'single' ? 'Select one answer' : 'Select all that apply' }}
      </p>
      <div class="tw:ml-8 tw:flex tw:flex-col tw:gap-2">
        <button
          v-for="opt in q.options"
          :key="opt.id"
          :disabled="readonly"
          class="tw:flex tw:items-center tw:gap-3 tw:text-left tw:px-3 tw:py-2 tw:rounded-lg tw:border tw:transition-colors tw:text-sm tw:disabled:cursor-default"
          :class="{
            'tw:border-green-500 tw:bg-green-50 tw:text-green-700 tw:font-medium':
              optionState(q, opt) === 'correctSelected',
            'tw:border-red-500 tw:bg-red-50 tw:text-red-700 tw:font-medium':
              optionState(q, opt) === 'wrongSelected',
            'tw:border-green-300 tw:bg-green-50/40 tw:text-green-700':
              optionState(q, opt) === 'correctMissed',
            'tw:border-primary tw:bg-blue-50 tw:text-primary tw:font-medium':
              optionState(q, opt) === 'selected',
            'tw:border-divider tw:text-on-sidebar': optionState(q, opt) === 'idle',
            'tw:hover:border-primary tw:hover:bg-gray-50':
              optionState(q, opt) === 'idle' && !readonly,
          }"
          @click="readonly ? null : toggleAnswer(q, opt.id)"
        >
          <span
            class="tw:w-4 tw:h-4 tw:rounded-full tw:border tw:flex tw:items-center tw:justify-center tw:shrink-0"
            :class="
              isSelected(q.id, opt.id) ? 'tw:border-primary tw:bg-primary' : 'tw:border-gray-300'
            "
          >
            <span
              v-if="isSelected(q.id, opt.id)"
              class="tw:w-2 tw:h-2 tw:rounded-full tw:bg-white"
            />
          </span>
          <span class="tw:flex-1">{{ opt.text }}</span>
          <IconCheck
            v-if="
              showCorrect &&
              (optionState(q, opt) === 'correctSelected' || optionState(q, opt) === 'correctMissed')
            "
            :size="16"
            class="tw:text-green-600 tw:shrink-0"
          />
          <IconX
            v-else-if="showCorrect && optionState(q, opt) === 'wrongSelected'"
            :size="16"
            class="tw:text-red-600 tw:shrink-0"
          />
        </button>
      </div>
    </div>
  </div>
</template>
