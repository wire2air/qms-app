<script setup>
/**
 * Ad-hoc AQL configuration sub-form — AQL standard + inspection level +
 * switching state + per-severity AQLs. Emits (via v-model) a plain
 * { standardCode, inspectionLevel, switchingState, severityAqls } object the
 * sample-size computer can consume directly (no persisted sampling plan).
 * Used for the QA-manager "Custom AQL" override on lot reopen.
 */
import { IconPlus, IconTrash } from '@tabler/icons-vue'

const config = defineModel({ type: Object, required: true })

// Values are the canonical underscore ids (S_1..); labels show the standard S-n
// notation. General levels I/II/III. Mirrors SamplingPlanCreateDialog.
const LEVELS = [
  { id: 'S_1', name: 'S-1' },
  { id: 'S_2', name: 'S-2' },
  { id: 'S_3', name: 'S-3' },
  { id: 'S_4', name: 'S-4' },
  { id: 'I', name: 'I' },
  { id: 'II', name: 'II' },
  { id: 'III', name: 'III' },
]
const SWITCHING_STATES = ['NORMAL', 'TIGHTENED', 'REDUCED'].map((id) => ({ id, name: id }))
const DEFECT_CLASSES = [
  { id: 'CRITICAL', name: 'Critical' },
  { id: 'MAJOR', name: 'Major' },
  { id: 'MINOR', name: 'Minor' },
]

const standards = useLiveQuery(async (db) => db.SamplingStandard.where().exec(), {
  models: ['SamplingStandard'],
  initial: [],
})
const standardOptions = computed(() =>
  standards.value.map((s) => ({ id: s.id, name: s.companyId ? `${s.name} (custom)` : s.name })),
)

function addRow() {
  if (!Array.isArray(config.value.severityAqls)) config.value.severityAqls = []
  config.value.severityAqls.push({ severity: 'MAJOR', aql: 1.0 })
}
function removeRow(i) {
  config.value.severityAqls.splice(i, 1)
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <!-- Standard names are long, so it takes its own full-width row; level +
         switching sit side by side below. -->
    <BaseField label="AQL standard" required>
      <BaseSelect
        v-model="config.standardCode"
        :options="standardOptions"
        optionLabel="name"
        optionValue="id"
        :required="true"
        placeholder="Select standard"
      />
    </BaseField>
    <div class="tw:grid tw:grid-cols-2 tw:gap-3">
      <BaseField label="Inspection level" required class="tw:min-w-0">
        <BaseSelect
          v-model="config.inspectionLevel"
          :options="LEVELS"
          optionLabel="name"
          optionValue="id"
          :required="true"
        />
      </BaseField>
      <BaseField label="Switching" class="tw:min-w-0">
        <BaseSelect
          v-model="config.switchingState"
          :options="SWITCHING_STATES"
          optionLabel="name"
          optionValue="id"
          :required="true"
        />
      </BaseField>
    </div>

    <div class="tw:flex tw:flex-col tw:gap-2">
      <div class="tw:flex tw:items-center tw:justify-between">
        <span class="tw:text-xs tw:font-medium tw:text-secondary">Per-severity AQLs</span>
        <BaseButton variant="ghost" size="sm" @click="addRow">
          <IconPlus :size="14" class="tw:mr-1" /> Add
        </BaseButton>
      </div>
      <div
        v-for="(row, i) in config.severityAqls"
        :key="i"
        class="tw:flex tw:items-center tw:gap-2"
      >
        <BaseSelect
          v-model="row.severity"
          :options="DEFECT_CLASSES"
          optionLabel="name"
          optionValue="id"
          class="tw:flex-1"
        />
        <BaseTextInput
          v-model.number="row.aql"
          type="number"
          step="0.01"
          class="tw:w-28"
          placeholder="AQL"
        />
        <button class="tw:text-secondary tw:hover:text-red-600" @click="removeRow(i)">
          <IconTrash :size="16" />
        </button>
      </div>
    </div>
  </div>
</template>
