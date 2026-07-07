<script setup>
import { IconCategory, IconChevronDown } from '@tabler/icons-vue'
import {
  getCategoryLabel,
  getCategoryIcon,
  getCategoryDescription,
  formatActionLabel,
} from '@/utils/categoryConfig.js'

defineProps({
  permissionActions: { type: Array, required: true },
  isSelected: { type: Function, required: true },
  togglePermission: { type: Function, required: true },
  isActionLocked: { type: Function, required: true },
  getPermissionForAction: { type: Function, required: true },
  canUpdateRole: { type: Boolean, default: false },
})

const model = defineModel({
  type: Object,
  required: true,
})

// Per-card collapse state (keyed by item.key). Cards start expanded; this set
// holds the keys the user has collapsed.
const collapsed = ref(new Set())
function isCollapsed(key) {
  return collapsed.value.has(key)
}
function toggle(key) {
  const next = new Set(collapsed.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  collapsed.value = next
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <!-- Section Header -->
    <div class="tw:flex tw:items-center tw:gap-3">
      <IconCategory :size="20" class="tw:text-secondary" />
      <h4 class="tw:font-bold tw:text-on-sidebar">
        {{ model.name }}
      </h4>
    </div>

    <!-- Category Items — up to 4 per row, collapsing to fewer on narrow screens -->
    <div
      class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:lg:grid-cols-3 tw:xl:grid-cols-4 tw:gap-3 tw:items-stretch"
    >
      <BaseCard
        v-for="item in model.items"
        :key="item.key"
        padding="none"
        class="tw:overflow-hidden tw:shadow-sm"
      >
        <!-- Item Header — click to collapse/expand the permissions -->
        <button
          type="button"
          class="tw:w-full tw:text-left tw:bg-sidebar/30 tw:px-5 tw:py-3 tw:flex tw:items-center tw:gap-3 tw:transition-colors tw:hover:bg-sidebar/50 tw:focus-visible:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-primary/40"
          :class="isCollapsed(item.key) ? '' : 'tw:border-b tw:border-divider'"
          :aria-expanded="!isCollapsed(item.key)"
          :aria-controls="`perm-body-${item.key}`"
          @click="toggle(item.key)"
        >
          <component
            :is="getCategoryIcon(item.key)"
            :size="20"
            class="tw:shrink-0 tw:text-secondary"
            aria-hidden="true"
          />
          <div class="tw:min-w-0 tw:flex-1">
            <p class="tw:text-sm tw:font-semibold tw:text-on-sidebar">
              {{ getCategoryLabel(item.key) }}
            </p>
            <p class="tw:text-xs tw:text-secondary">
              {{ getCategoryDescription(item.key) }}
            </p>
          </div>
          <IconChevronDown
            :size="18"
            class="tw:shrink-0 tw:text-secondary tw:transition-transform tw:duration-150"
            :class="isCollapsed(item.key) ? 'tw:-rotate-90' : ''"
            aria-hidden="true"
          />
        </button>

        <!-- Item Body - Checkboxes in a wrapping row -->
        <div
          v-show="!isCollapsed(item.key)"
          :id="`perm-body-${item.key}`"
          class="tw:px-5 tw:py-3 tw:flex tw:flex-wrap tw:gap-x-6 tw:gap-y-1"
        >
          <template v-for="action in permissionActions" :key="`${item.key}-${action}`">
            <BaseCheckbox
              v-if="getPermissionForAction(item.group.permissions, action)"
              :modelValue="isSelected(getPermissionForAction(item.group.permissions, action))"
              :disabled="!canUpdateRole || isActionLocked(item.group.permissions, action)"
              :title="
                isActionLocked(item.group.permissions, action)
                  ? 'Read is required while create, update or delete is enabled'
                  : undefined
              "
              @update:modelValue="
                togglePermission(getPermissionForAction(item.group.permissions, action))
              "
            >
              {{ formatActionLabel(action) }}
            </BaseCheckbox>
          </template>
        </div>
      </BaseCard>
    </div>
  </div>
</template>
