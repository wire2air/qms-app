<script setup>
import {
  IconUsers,
  IconClock,
  IconArrowUp,
  IconArrowDown,
  IconTrash,
  IconDots,
} from '@tabler/icons-vue'

const props = defineProps({
  step: {
    type: Object,
    required: true,
  },
  index: {
    type: Number,
    required: true,
  },
  isSelected: {
    type: Boolean,
    default: false,
  },
  isFirst: {
    type: Boolean,
    default: false,
  },
  isLast: {
    type: Boolean,
    default: false,
  },
  canUpdate: {
    type: Boolean,
    default: false,
  },
  isChild: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['select', 'remove', 'moveUp', 'moveDown'])

const roleCount = useLiveQueryWithDeps(
  [() => props.step?.id],
  async (db, [stepId]) => {
    if (!stepId) return 0
    const all = await db.WorkflowStepRole.where().exec()
    return all.filter((sr) => sr.stepId === stepId).length
  },
  { initial: 0 },
)

const userCount = useLiveQueryWithDeps(
  [() => props.step?.id],
  async (db, [stepId]) => {
    if (!stepId) return 0
    const all = await db.WorkflowStepUser.where().exec()
    return all.filter((su) => su.stepId === stepId).length
  },
  { initial: 0 },
)

const approverLabel = computed(() => {
  const roles = roleCount.value || 0
  const users = userCount.value || 0
  const parts = []
  if (roles > 0) parts.push(`${roles} Role${roles !== 1 ? 's' : ''}`)
  if (users > 0) parts.push(`${users} User${users !== 1 ? 's' : ''}`)
  return parts.length > 0 ? parts.join(', ') : 'No tasks'
})

const menuItems = computed(() => {
  const items = []
  if (!props.isFirst)
    items.push({ name: 'Move Up', icon: IconArrowUp, click: () => emit('moveUp') })
  if (!props.isLast)
    items.push({ name: 'Move Down', icon: IconArrowDown, click: () => emit('moveDown') })
  items.push({ name: 'Delete', icon: IconTrash, click: () => emit('remove') })
  return items
})
</script>

<template>
  <BaseClickableRow
    class="tw:group tw:relative tw:bg-main tw:transition-all"
    :aria-label="`Select step ${step.name}`"
    :class="[
      isChild ? 'tw:p-3 tw:rounded-lg tw:border' : 'tw:p-4 tw:rounded-xl tw:border-2 tw:shadow-sm',
      isSelected
        ? 'tw:border-primary tw:ring-4 tw:ring-primary/5'
        : 'tw:border-divider tw:hover:border-secondary',
    ]"
    @click="emit('select')"
  >
    <div class="tw:flex tw:items-start tw:gap-3">
      <!-- Step Number -->
      <div
        class="tw:mt-0.5 tw:rounded-full tw:flex tw:items-center tw:justify-center tw:font-bold tw:shrink-0"
        :class="[
          isChild ? 'tw:w-5 tw:h-5 tw:text-[10px]' : 'tw:w-6 tw:h-6 tw:text-xs',
          isSelected ? 'tw:bg-primary tw:text-white' : 'tw:bg-main-hover tw:text-secondary',
        ]"
      >
        {{ index + 1 }}
      </div>

      <!-- Step Info -->
      <div class="tw:flex-1 tw:min-w-0">
        <div class="tw:flex tw:items-center tw:justify-between tw:mb-1">
          <h3 class="tw:text-sm tw:font-bold tw:text-on-main tw:truncate">
            {{ step.name }}
          </h3>
          <span
            class="tw:text-[10px] tw:font-bold tw:px-1.5 tw:py-0.5 tw:rounded tw:shrink-0"
            :class="
              step.approvalRule === 'ALL'
                ? 'tw:bg-primary/10 tw:text-primary'
                : 'tw:bg-main-hover tw:text-secondary'
            "
          >
            {{ step.approvalRule }}
          </span>
        </div>

        <div class="tw:flex tw:items-center tw:gap-3 tw:text-xs tw:text-secondary">
          <span class="tw:flex tw:items-center tw:gap-1">
            <IconUsers :size="16" />
            {{ approverLabel }}
          </span>
          <span v-if="step.slaDays" class="tw:flex tw:items-center tw:gap-1">
            <IconClock :size="16" />
            {{ step.slaDays }} Day{{ step.slaDays !== 1 ? 's' : '' }}
          </span>
        </div>
      </div>

      <!-- Actions Menu -->
      <div
        v-if="canUpdate"
        class="tw:opacity-0 tw:group-hover:opacity-100 tw:transition-opacity tw:shrink-0"
      >
        <BaseMenu :items="menuItems">
          <template #trigger>
            <button
              class="tw:p-1 tw:rounded tw:hover:bg-main-hover tw:text-secondary tw:transition-colors"
            >
              <IconDots :size="18" />
            </button>
          </template>
        </BaseMenu>
      </div>
    </div>
  </BaseClickableRow>
</template>
