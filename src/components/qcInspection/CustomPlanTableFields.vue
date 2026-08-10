<script setup>
/**
 * Custom plan-table editor (2026-08-10) — the fixed-number alternative to an
 * AQL standard. Mirrors how Z1.4 actually works: ONE sample size for the
 * whole inspection (the custom analogue of the code letter's n), plus one
 * Ac/Re row per defect class evaluated against that shared sample. Shared by
 * SamplingPlanCreateDialog (CUSTOM plan type), InspectionLotCreateDialog and
 * InspectionLotReopenDialog (ad-hoc overrides); all edit the same shape:
 *   { sampleSize, rows: [{ severityLabel, accept, reject }] }
 */
import { IconPlus, IconTrash } from '@tabler/icons-vue'
import { required, minValue } from '@shared/components/form/validators.js'

const table = defineModel({ type: Object, required: true })

// Matches the defect catalog classes the verdict engine tallies against.
const DEFECT_CLASSES = [
  { id: 'CRITICAL', name: 'Critical' },
  { id: 'MAJOR', name: 'Major' },
  { id: 'MINOR', name: 'Minor' },
]

function addRow() {
  table.value.rows.push({ severityLabel: 'MAJOR', accept: 0, reject: 1 })
}
function removeRow(i) {
  table.value.rows.splice(i, 1)
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <div class="tw:flex tw:items-end tw:justify-between tw:gap-3">
      <!-- The sample size applies to the WHOLE inspection — like the code
           letter's n in the AQL table; full how-it-works copy in the tooltip
           registry (qc.customPlanTable). -->
      <BaseField
        :value="table.sampleSize"
        :rules="[required(), minValue(1)]"
        class="tw:w-40"
      >
        <template #label>
          <BaseLabel dataKey="qc.customPlanTable">Sample size</BaseLabel>
        </template>
        <template #default="field">
          <BaseTextInput
            v-bind="field"
            v-model.number="table.sampleSize"
            type="number"
            size="sm"
            placeholder="e.g. 32"
          />
        </template>
      </BaseField>
      <BaseButton variant="text-link" size="sm" class="tw:shrink-0" @click="addRow">
        <IconPlus :size="14" /> Add class
      </BaseButton>
    </div>

    <div
      v-for="(row, i) in table.rows"
      :key="i"
      class="tw:flex tw:items-center tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-main-hover tw:border tw:border-divider"
    >
      <!-- The label binds the row to a defect class at inspection time; the
           row only sets that class's Ac/Re against the shared sample. -->
      <BaseField label="Defect class" class="tw:flex-1">
        <BaseInlineSelect
          v-model="row.severityLabel"
          :items="DEFECT_CLASSES"
          :required="true"
          class="tw:w-full"
        />
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
