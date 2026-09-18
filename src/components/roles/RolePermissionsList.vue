<script setup>
import { IconSearchOff } from '@tabler/icons-vue'
defineProps({
  permissionActions: { type: Array, required: true },
  isSelected: { type: Function, required: true },
  togglePermission: { type: Function, required: true },
  isActionLocked: { type: Function, required: true },
  getPermissionForAction: { type: Function, required: true },
  canUpdateRole: { type: Boolean, default: false },
})

const model = defineModel({
  type: Array,
  required: true,
})
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-6 tw:pb-12">
    <RolePermissionsListItem
      v-for="(section, index) in model"
      :key="section.name"
      v-model="model[index]"
      :permissionActions="permissionActions"
      :isSelected="isSelected"
      :togglePermission="togglePermission"
      :isActionLocked="isActionLocked"
      :getPermissionForAction="getPermissionForAction"
      :canUpdateRole="canUpdateRole"
    />

    <BaseEmptyState
      v-if="model.length === 0"
      :icon="IconSearchOff"
      title="No permissions found matching your search"
      dense
    />
  </div>
</template>
