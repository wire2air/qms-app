<script setup>
const props = defineProps({
  training: { type: Object, required: true },
  editable: { type: Boolean, default: false },
})
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-5">
    <BaseField v-if="editable" v-slot="{ id: fieldId }" label="Title">
      <BaseTextInput :id="fieldId" v-model="props.training.title" placeholder="Training title" />
    </BaseField>
    <BaseDetailField v-else label="Title" :value="training.title" />

    <BaseField v-if="editable" v-slot="{ id: fieldId }" label="Description">
      <BaseTextarea
        :id="fieldId"
        v-model="props.training.description"
        placeholder="Brief description"
        :rows="3"
      />
    </BaseField>
    <BaseDetailField v-else label="Description">
      <BaseText variant="body" class="tw:whitespace-pre-wrap tw:text-on-main">
        {{ training.description || '—' }}
      </BaseText>
    </BaseDetailField>

    <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:lg:grid-cols-3 tw:gap-4">
      <template v-if="editable">
        <BaseField v-slot="{ id: fieldId }" label="Completion Due (days)">
          <BaseTextInput
            :id="fieldId"
            v-model.number="props.training.completionDueDays"
            type="number"
            placeholder="e.g. 14"
            min="1"
          />
        </BaseField>
        <BaseField v-slot="{ id: fieldId }" label="Passing Score (%)">
          <BaseTextInput
            :id="fieldId"
            v-model.number="props.training.passingScore"
            type="number"
            placeholder="70"
            min="0"
            max="100"
          />
        </BaseField>
        <BaseField v-slot="{ id: fieldId }" label="Max Attempts">
          <BaseTextInput
            :id="fieldId"
            v-model.number="props.training.maxAttempts"
            type="number"
            placeholder="1"
            min="1"
            max="10"
          />
        </BaseField>
      </template>
      <template v-else>
        <BaseDetailField
          label="Completion Due (days)"
          :value="training.completionDueDays ? `${training.completionDueDays} days` : 'No deadline'"
        />
        <BaseDetailField label="Passing Score (%)" :value="`${training.passingScore}%`" />
        <BaseDetailField label="Max Attempts" :value="training.maxAttempts ?? 1" />
      </template>
    </div>

    <BaseField v-if="editable" label="Training Manager">
      <UserSelectMenu v-model="props.training.managerId" nullLabel="No manager" />
    </BaseField>
    <BaseDetailField v-else label="Training Manager">
      <UserBadgeById v-if="training.managerId" :userId="training.managerId" />
      <span v-else class="tw:text-sm tw:text-secondary">—</span>
    </BaseDetailField>

    <div class="tw:flex tw:items-start tw:justify-between tw:gap-4 tw:p-3 tw:rounded-lg tw:border tw:border-divider">
      <div>
        <p class="tw:text-sm tw:font-medium tw:text-on-sidebar">
          Manager Verification Required
          <span class="tw:text-xs tw:font-normal tw:text-secondary">(For compliance)</span>
        </p>
        <p class="tw:text-xs tw:text-secondary tw:mt-0.5">
          When on, completed trainees enter Pending Verification and need manager sign-off before the
          instance closes. When off, the training closes automatically on completion.
        </p>
      </div>
      <BaseSwitch v-if="editable" v-model="props.training.requireManagerVerification" />
      <span v-else class="tw:text-sm tw:font-medium" :class="training.requireManagerVerification === false ? 'tw:text-secondary' : 'tw:text-green-600'">
        {{ training.requireManagerVerification === false ? 'No' : 'Yes' }}
      </span>
    </div>
  </div>
</template>
