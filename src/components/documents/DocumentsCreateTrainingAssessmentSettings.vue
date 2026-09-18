<script setup>
import { IconSettings, IconInfoCircle } from '@tabler/icons-vue'

const form = defineModel({
  type: Object,
  default: () => ({
    passingScore: 80,
    requiredCompletion: true,
    assessmentDueDate: null,
    retryLimit: '3 attempts',
  }),
})

const retryLimitOptions = [
  { id: '3 attempts', name: '3 attempts' },
  { id: '5 attempts', name: '5 attempts' },
  { id: 'Unlimited', name: 'Unlimited' },
]
</script>

<template>
  <!-- Sidebar Controls -->
  <aside class="tw:w-full tw:lg:w-80 tw:space-y-6">
    <div
      class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:shadow-sm tw:p-6 tw:sticky tw:top-24"
    >
      <h3
        class="tw:text-lg tw:font-bold tw:text-on-sidebar tw:mb-6 tw:flex tw:items-center tw:gap-2"
      >
        <IconSettings class="tw:text-primary tw:size-5" />
        Assessment Settings
      </h3>
      <div class="tw:space-y-6">
        <div class="tw:space-y-2">
          <BaseTextInput v-model="form.passingScore" label="Passing Score" type="number" />
          <p class="tw:text-xs tw:text-secondary tw:font-medium">%</p>
        </div>

        <div class="tw:flex tw:items-center tw:justify-between">
          <div>
            <label class="tw:text-sm tw:font-medium tw:text-on-sidebar">Required Completion</label>
            <p class="tw:text-caption tw:text-secondary">Must pass before signing</p>
          </div>
          <BaseSwitch v-model="form.requiredCompletion" />
        </div>
        <BaseField label="Assessment Due Date">
          <BaseDateField v-model="form.assessmentDueDate" mode="date" />
        </BaseField>
        <BaseField label="Retry limit">
          <BaseSelect
            v-model="form.retryLimit"
            :options="retryLimitOptions"
            optionLabel="name"
            optionValue="id"
            :required="true"
          />
        </BaseField>
      </div>
      <div class="tw:mt-8 tw:pt-6 tw:border-t tw:border-divider">
        <div
          class="tw:flex tw:items-center tw:gap-2 tw:text-primary tw:bg-primary/20 tw:p-3 tw:rounded-lg"
        >
          <IconInfoCircle class="tw:size-5 tw:shrink-0" />
          <p class="tw:text-label tw:leading-tight tw:font-medium">
            Changes here will apply to all current trainees of this version.
          </p>
        </div>
      </div>
    </div>
  </aside>
</template>
