<script setup>
/**
 * Custom plan-table rows editor (2026-08-10) — the fixed-number alternative to
 * an AQL standard: one row per defect class with a fixed sample size and
 * accept/reject numbers. Shared by SamplingPlanCreateDialog (CUSTOM plan type)
 * and InspectionLotReopenDialog (ad-hoc custom-table override), so both
 * surfaces edit the exact same shape:
 *   rows: [{ severityLabel, sampleSize, accept, reject }]
 *
 * At inspection, logged defects are tallied per class against the matching
 * row (reject when tally ≥ Re); the lot's suggested sample size is the
 * largest row's.
 */
import { IconPlus, IconTrash } from '@tabler/icons-vue'
import { required, minValue } from '@shared/components/form/validators.js'

const rows = defineModel({ type: Array, required: true })

// Matches the defect catalog classes the verdict engine tallies against.
const DEFECT_CLASSES = [
  { id: 'CRITICAL', name: 'Critical' },
  { id: 'MAJOR', name: 'Major' },
  { id: 'MINOR', name: 'Minor' },
]

function addRow() {
  rows.value.push({ severityLabel: 'MAJOR', sampleSize: 8, accept: 0, reject: 1 })
}
function removeRow(i) {
  rows.value.splice(i, 1)
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-2">
    <div class="tw:flex tw:items-center tw:justify-between">
      <!-- Full how-it-works copy lives in the tooltip registry (qc.customPlanTable). -->
      <BaseLabel dataKey="qc.customPlanTable" class="tw:text-xs tw:text-secondary">
        Fixed sample &amp; accept/reject per defect class
      </BaseLabel>
      <BaseButton variant="text-link" size="sm" class="tw:shrink-0" @click="addRow">
        <IconPlus :size="14" /> Add row
      </BaseButton>
    </div>

    <div
      v-for="(row, i) in rows"
      :key="i"
      class="tw:flex tw:items-center tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-main-hover tw:border tw:border-divider"
    >
      <!-- The label binds the row to a defect class at inspection time. -->
      <BaseField label="Defect class" class="tw:flex-1">
        <BaseInlineSelect
          v-model="row.severityLabel"
          :items="DEFECT_CLASSES"
          :required="true"
          class="tw:w-full"
        />
      </BaseField>
      <BaseField
        label="Sample size"
        :value="row.sampleSize"
        :rules="[required(), minValue(1)]"
        class="tw:w-28"
      >
        <template #default="field">
          <BaseTextInput v-bind="field" v-model.number="row.sampleSize" type="number" size="sm" />
        </template>
      </BaseField>
      <BaseField
        label="Accept ≤"
        :value="row.accept"
        :rules="[required(), minValue(0)]"
        class="tw:w-24"
      >
        <template #default="field">
          <BaseTextInput v-bind="field" v-model.number="row.accept" type="number" size="sm" />
        </template>
      </BaseField>
      <BaseField
        label="Reject ≥"
        :value="row.reject"
        :rules="[required(), (v) => Number(v) > Number(row.accept) || 'Reject must exceed accept']"
        class="tw:w-24"
      >
        <template #default="field">
          <BaseTextInput v-bind="field" v-model.number="row.reject" type="number" size="sm" />
        </template>
      </BaseField>
      <button
        type="button"
        class="tw:p-1.5 tw:mt-4 tw:rounded tw:text-secondary tw:hover:text-bad tw:bg-transparent tw:border-0 tw:cursor-pointer"
        aria-label="Remove row"
        @click="removeRow(i)"
      >
        <IconTrash :size="16" />
      </button>
    </div>
  </div>
</template>
