<script setup>
import { IconTrash, IconPlus, IconGripVertical, IconX } from '@tabler/icons-vue'

const form = defineModel({
  type: Object,
  default: () => ({
    questionText: '',
    answers: ['', ''],
    correctAnswer: 0,
  }),
})

function addAnswer() {
  if (!form.value.answers) {
    form.value.answers = []
  }
  form.value.answers.push('')
}

function removeAnswer(index) {
  const newAnswers = [...form.value.answers]
  if (newAnswers.length > 2) {
    newAnswers.splice(index, 1)
    form.value.answers = newAnswers
    if (form.value.correctAnswer === index) {
      form.value.correctAnswer = 0
    } else if (form.value.correctAnswer > index) {
      form.value.correctAnswer -= 1
    }
  }
}
</script>

<template>
  <div
    class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:shadow-sm tw:overflow-hidden tw:group"
  >
    <div
      class="tw:px-6 tw:py-3 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:justify-between"
    >
      <div class="tw:flex tw:items-center tw:gap-3">
        <IconGripVertical
          :size="16"
          class="tw:text-secondary tw:cursor-grab tw:active:cursor-grabbing tw:hover:text-on-sidebar tw:transition-colors drag-handle"
        />
        <BaseText variant="overline" color="inherit" class="tw:text-on-sidebar">Question 1</BaseText>
      </div>

      <BaseButton variant="danger" iconOnly size="xs">
        <IconTrash :size="16" />
      </BaseButton>
    </div>
    <div class="tw:p-6 tw:space-y-6">
      <BaseField v-slot="{ id: fieldId }" label="Question Text" class="tw:text-start">
        <BaseTextInput
          :id="fieldId"
          v-model="form.questionText"
          placeholder="eg. What is the correct procedure for reporting a minor deviation?"
        />
      </BaseField>
      <BaseField label="Answers (Select the correct one)" class="tw:text-start">
        <div class="tw:flex tw:flex-col tw:gap-3 tw:mt-1">
          <!-- Answer Option 1 -->
          <div
            v-for="(_, index) in form.answers"
            :key="index"
            class="tw:flex tw:flex-nowrap tw:items-center tw:gap-3"
          >
            <input
              :checked="form.correctAnswer === index"
              class="tw:w-4 tw:h-4 tw:text-primary tw:focus:ring-primary tw:border tw:border-divider tw:dark:bg-sidebar tw:cursor-pointer"
              name="q1"
              type="radio"
              @change="form.correctAnswer = index"
            />
            <BaseTextInput
              v-model="form.answers[index]"
              placeholder="Write the answer"
              class="tw:flex-1"
            />

            <button class="tw:text-secondary tw:hover:text-on-sidebar" @click="removeAnswer(index)">
              <IconX :size="14" />
            </button>
          </div>
        </div>

        <BaseButton variant="text-link" size="sm" @click="addAnswer">
          <IconPlus :size="16" />
          Add Answer
        </BaseButton>
      </BaseField>
    </div>
  </div>
</template>
