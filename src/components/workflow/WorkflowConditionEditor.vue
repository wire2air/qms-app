<script setup>
import { IconTrash, IconPlus } from '@tabler/icons-vue'

const conditions = defineModel('conditions', { type: Array, default: () => [] })

const conditionFieldItems = [
  { id: 'risk_level', name: 'Risk Level' },
  { id: 'impact_area', name: 'Impact Area' },
  { id: 'document_value', name: 'Document Value' },
  { id: 'department', name: 'Department' },
  { id: 'priority', name: 'Priority' },
]

const conditionOperatorItems = [
  { id: 'IS', name: 'IS' },
  { id: 'IS_NOT', name: 'IS NOT' },
  { id: 'CONTAINS', name: 'CONTAINS' },
  { id: 'GREATER_THAN', name: 'GREATER THAN' },
  { id: 'LESS_THAN', name: 'LESS THAN' },
]

const actionTypeItems = [
  { id: 'ADD_ROLE', name: 'Add Role' },
  { id: 'ADD_USER', name: 'Add User' },
]

function addCondition() {
  conditions.value.push({
    conditionField: '',
    conditionOperator: 'IS',
    conditionValue: '',
    actionType: 'ADD_ROLE',
    actionRoleId: null,
    actionUserId: null,
  })
}

function removeCondition(index) {
  conditions.value.splice(index, 1)
}
</script>

<template>
  <div
    class="tw:bg-main-hover tw:border tw:border-dashed tw:border-divider tw:p-6 tw:rounded-2xl tw:space-y-4"
  >
    <!-- Condition Rows -->
    <div
      v-for="(condition, index) in conditions"
      :key="index"
      class="tw:flex tw:flex-wrap tw:items-center tw:gap-3"
    >
      <span class="tw:text-xs tw:font-bold tw:text-secondary">IF</span>

      <BaseSelect
        v-model="condition.conditionField"
        :options="conditionFieldItems"
        optionLabel="name"
        optionValue="id"
        required
        placeholder="Select field"
        class="tw:w-40"
      />

      <BaseSelect
        v-model="condition.conditionOperator"
        :options="conditionOperatorItems"
        optionLabel="name"
        optionValue="id"
        required
        placeholder="IS"
        class="tw:w-36"
      />

      <BaseTextInput
        v-model="condition.conditionValue"
        placeholder="Value"
        size="sm"
        class="tw:w-32"
      />

      <span class="tw:text-xs tw:font-bold tw:text-secondary">THEN</span>

      <BaseSelect
        v-model="condition.actionType"
        :options="actionTypeItems"
        optionLabel="name"
        optionValue="id"
        required
        placeholder="Add Role"
        class="tw:w-32"
      />

      <!-- Action Target - shows inline text for now, role/user selection handled by parent -->
      <div
        class="tw:flex tw:items-center tw:gap-2 tw:bg-primary/10 tw:text-primary tw:border tw:border-primary/20 tw:rounded-lg tw:px-3 tw:py-1 tw:text-xs tw:font-bold"
      >
        <span>{{ condition.actionType === 'ADD_ROLE' ? 'Role' : 'User' }}</span>
      </div>

      <button
        class="tw:ml-auto tw:text-secondary tw:hover:text-bad tw:transition-colors"
        @click="removeCondition(index)"
      >
        <IconTrash :size="20" />
      </button>
    </div>

    <!-- Empty State -->
    <div v-if="conditions.length === 0" class="tw:text-center tw:py-4 tw:text-sm tw:text-secondary">
      No conditions defined. Add a rule to conditionally assign task.
    </div>

    <!-- Add Button -->
    <button
      class="tw:text-xs tw:font-bold tw:text-primary tw:flex tw:items-center tw:gap-1 tw:hover:underline"
      @click="addCondition"
    >
      <IconPlus :size="16" />
      Add another logic rule
    </button>
  </div>
</template>
