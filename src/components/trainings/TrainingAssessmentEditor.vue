<script setup>
import { IconPlus, IconTrash, IconCheck } from '@tabler/icons-vue'

const props = defineProps({
  training: { type: Object, required: true },
  editable: { type: Boolean, default: false },
})

const questions = computed({
  get: () => props.training.assessment ?? [],
  set: (val) => {
    props.training.assessment = val
  },
})

function addQuestion() {
  if (!props.training.assessment) props.training.assessment = []
  props.training.assessment.push({
    id: crypto.randomUUID(),
    text: '',
    type: 'single',
    options: [
      { id: crypto.randomUUID(), text: '', isCorrect: false },
      { id: crypto.randomUUID(), text: '', isCorrect: false },
    ],
  })
}

function removeQuestion(idx) {
  props.training.assessment.splice(idx, 1)
}

function addOption(question) {
  question.options.push({ id: crypto.randomUUID(), text: '', isCorrect: false })
}

function removeOption(question, optIdx) {
  question.options.splice(optIdx, 1)
}

function toggleCorrect(question, option) {
  if (question.type === 'single') {
    question.options.forEach((o) => {
      o.isCorrect = false
    })
  }
  option.isCorrect = !option.isCorrect
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4">
    <div class="tw:flex tw:items-center tw:justify-between">
      <div>
        <p class="tw:font-semibold tw:text-on-sidebar">Assessment Questions</p>
        <p class="tw:text-xs tw:text-secondary">
          {{ questions.length }} question{{ questions.length !== 1 ? 's' : '' }}
        </p>
      </div>
      <BaseButton v-if="editable" variant="secondary" @click="addQuestion">
        <IconPlus :size="16" class="tw:mr-1" /> Add Question
      </BaseButton>
    </div>

    <div
      v-if="!questions.length"
      class="tw:rounded-lg tw:border tw:border-dashed tw:border-divider tw:p-8 tw:text-center tw:text-secondary"
    >
      No questions yet. {{ editable ? 'Add a question to build the assessment.' : '' }}
    </div>

    <div
      v-for="(q, qIdx) in questions"
      :key="q.id"
      class="tw:rounded-lg tw:border tw:border-divider tw:bg-white tw:p-4 tw:flex tw:flex-col tw:gap-3"
    >
      <div class="tw:flex tw:items-start tw:gap-3">
        <span
          class="tw:w-6 tw:h-6 tw:rounded-full tw:bg-gray-100 tw:text-gray-600 tw:text-xs tw:font-bold tw:flex tw:items-center tw:justify-center tw:shrink-0 tw:mt-0.5"
        >
          {{ qIdx + 1 }}
        </span>
        <div class="tw:flex-1 tw:flex tw:flex-col tw:gap-2">
          <BaseTextInput
            v-if="editable"
            v-model="q.text"
            placeholder="Question text..."
            class="tw:font-medium"
          />
          <p v-else class="tw:font-medium tw:text-on-sidebar">{{ q.text || '(empty question)' }}</p>

          <div v-if="editable" class="tw:flex tw:gap-1">
            <button
              v-for="t in [
                { id: 'single', label: 'Single Choice' },
                { id: 'multiple', label: 'Multiple Choice' },
              ]"
              :key="t.id"
              class="tw:px-2.5 tw:py-0.5 tw:rounded tw:text-xs tw:font-medium tw:transition-colors"
              :class="
                q.type === t.id
                  ? 'tw:bg-primary tw:text-white'
                  : 'tw:bg-gray-100 tw:text-secondary tw:hover:bg-gray-200'
              "
              @click="q.type = t.id"
            >
              {{ t.label }}
            </button>
          </div>
          <span
            v-else
            class="tw:text-xs tw:bg-gray-100 tw:text-gray-600 tw:px-2 tw:py-0.5 tw:rounded"
          >
            {{ q.type === 'single' ? 'Single Choice' : 'Multiple Choice' }}
          </span>
        </div>
        <button v-if="editable" @click="removeQuestion(qIdx)">
          <IconTrash :size="16" class="tw:text-red-400 tw:hover:text-red-600" />
        </button>
      </div>

      <!-- Options -->
      <div class="tw:ml-9 tw:flex tw:flex-col tw:gap-2">
        <p class="tw:text-xs tw:text-secondary">
          {{
            q.type === 'single' ? 'Select the one correct answer.' : 'Select all correct answers.'
          }}
        </p>
        <div
          v-for="(opt, oIdx) in q.options"
          :key="opt.id"
          class="tw:flex tw:items-center tw:gap-2"
        >
          <button
            class="tw:w-5 tw:h-5 tw:rounded tw:border tw:flex tw:items-center tw:justify-center tw:shrink-0 tw:transition-colors"
            :class="
              opt.isCorrect
                ? 'tw:bg-green-100 tw:border-green-500 tw:text-green-600'
                : 'tw:border-divider tw:hover:border-green-400'
            "
            :disabled="!editable"
            :title="editable ? 'Toggle correct answer' : ''"
            @click="editable && toggleCorrect(q, opt)"
          >
            <IconCheck v-if="opt.isCorrect" :size="12" />
          </button>
          <BaseTextInput
            v-if="editable"
            v-model="opt.text"
            placeholder="Option text..."
            class="tw:flex-1"
          />
          <span
            v-else
            class="tw:flex-1 tw:text-sm"
            :class="opt.isCorrect ? 'tw:text-green-700 tw:font-medium' : 'tw:text-on-sidebar'"
          >
            {{ opt.text || '(empty option)' }}
          </span>
          <button v-if="editable && q.options.length > 2" @click="removeOption(q, oIdx)">
            <IconTrash :size="14" class="tw:text-red-400 tw:hover:text-red-600" />
          </button>
        </div>
        <button
          v-if="editable"
          class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-primary tw:hover:underline tw:self-start"
          @click="addOption(q)"
        >
          <IconPlus :size="12" /> Add option
        </button>
      </div>
    </div>
  </div>
</template>
