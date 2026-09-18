<script setup>
import { IconX } from '@tabler/icons-vue'

const props = defineProps({
  roleId: {
    type: String,
    required: true,
  },
  clearable: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['clear'])

const role = useLiveQueryWithDeps(
  [() => props.roleId],
  async (db, [roleId]) => db.Role.findByPk(roleId),
  { models: ['Role'] },
)
</script>

<template>
  <div
    v-if="role"
    class="tw:flex tw:items-center tw:gap-3 tw:rounded-lg tw:border tw:border-divider tw:bg-sidebar tw:px-4 tw:py-3"
  >
    <div class="tw:flex-1 tw:min-w-0">
      <p class="tw:text-sm tw:font-semibold tw:text-on-main tw:truncate">{{ role.name }}</p>
      <p v-if="role.description" class="tw:text-xs tw:text-secondary tw:truncate">
        {{ role.description }}
      </p>
    </div>
    <button
      v-if="clearable"
      class="tw:p-1 tw:rounded tw:text-secondary tw:hover:bg-main-hover tw:hover:text-on-main tw:transition-colors tw:shrink-0"
      @click.stop="emit('clear')"
    >
      <IconX :size="14" />
    </button>
  </div>
</template>
