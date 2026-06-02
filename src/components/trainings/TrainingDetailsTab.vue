<script setup>
const props = defineProps({
  training: { type: Object, required: true },
  editable: { type: Boolean, default: false },
})
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4">
    <div>
      <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Title</p>
      <BaseTextInput v-if="editable" v-model="props.training.title" placeholder="Training title" />
      <p v-else class="tw:text-sm tw:text-on-sidebar">{{ training.title || '—' }}</p>
    </div>

    <div>
      <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Description</p>
      <BaseTextarea
        v-if="editable"
        v-model="props.training.description"
        placeholder="Brief description"
        :rows="3"
      />
      <p v-else class="tw:text-sm tw:text-on-sidebar tw:whitespace-pre-wrap">
        {{ training.description || '—' }}
      </p>
    </div>

    <div class="tw:grid tw:grid-cols-3 tw:gap-4">
      <div>
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
          Completion Due (days)
        </p>
        <BaseTextInput
          v-if="editable"
          v-model.number="props.training.completionDueDays"
          type="number"
          placeholder="e.g. 14"
          min="1"
        />
        <p v-else class="tw:text-sm tw:text-on-sidebar">
          {{ training.completionDueDays ? `${training.completionDueDays} days` : 'No deadline' }}
        </p>
      </div>

      <div>
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
          Passing Score (%)
        </p>
        <BaseTextInput
          v-if="editable"
          v-model.number="props.training.passingScore"
          type="number"
          placeholder="70"
          min="0"
          max="100"
        />
        <p v-else class="tw:text-sm tw:text-on-sidebar">{{ training.passingScore }}%</p>
      </div>

      <div>
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Max Attempts</p>
        <BaseTextInput
          v-if="editable"
          v-model.number="props.training.maxAttempts"
          type="number"
          placeholder="1"
          min="1"
          max="10"
        />
        <p v-else class="tw:text-sm tw:text-on-sidebar">{{ training.maxAttempts ?? 1 }}</p>
      </div>
    </div>

    <div>
      <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Training Manager</p>
      <UserSelectMenu v-if="editable" v-model="props.training.managerId" nullLabel="No manager" />
      <UserBadgeById v-else-if="training.managerId" :userId="training.managerId" />
      <span v-else class="tw:text-sm tw:text-secondary">—</span>
    </div>

    <div
      class="tw:flex tw:items-start tw:justify-between tw:gap-4 tw:p-3 tw:rounded-lg tw:border tw:border-divider"
    >
      <div>
        <p class="tw:text-sm tw:font-medium tw:text-on-sidebar">
          Manager Verification Required
          <span class="tw:text-xs tw:font-normal tw:text-secondary">(For compliance)</span>
        </p>
        <p class="tw:text-xs tw:text-secondary tw:mt-0.5">
          When on, completed trainees enter Pending Verification and need manager sign-off before
          the instance closes. When off, the training closes automatically on completion.
        </p>
      </div>
      <BaseSwitch v-if="editable" v-model="props.training.requireManagerVerification" />
      <span
        v-else
        class="tw:text-sm tw:font-medium"
        :class="
          training.requireManagerVerification === false ? 'tw:text-secondary' : 'tw:text-green-600'
        "
      >
        {{ training.requireManagerVerification === false ? 'No' : 'Yes' }}
      </span>
    </div>
  </div>
</template>
