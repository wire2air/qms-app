<script setup>
import { IconUsersGroup } from '@tabler/icons-vue'

defineOptions({
  inheritAttrs: false,
})

const props = defineProps({
  team: {
    type: Object,
    default: () => ({}),
  },
  showBadge: {
    type: Boolean,
    default: false,
  },
})

const attrs = useAttrs()

const teamName = computed(() => {
  if (!props.team) return ''
  return props.team.name || 'Team'
})

const hasAvatar = computed(() => !!props.team?.avatar)

const badgeColorClass = computed(() => {
  return props.team?.isLeadership ? 'tw:bg-primary' : 'tw:bg-good'
})

// Size to text size mapping
function sizeToTextSize(size) {
  if (size <= 4) return 'tw:text-xs'
  if (size <= 6) return 'tw:text-sm'
  if (size <= 8) return 'tw:text-base'
  if (size <= 10) return 'tw:text-lg'
  if (size <= 12) return 'tw:text-xl'
  if (size <= 14) return 'tw:text-2xl'
  if (size <= 16) return 'tw:text-3xl'
  if (size <= 20) return 'tw:text-4xl'
  if (size <= 24) return 'tw:text-5xl'
  if (size <= 32) return 'tw:text-6xl'
  return 'tw:text-6xl' // default for larger sizes
}

const textSizeClass = computed(() => {
  const classAttr = attrs.class || ''
  const sizeMatch = classAttr.match(/tw:size-(\d+)/)

  if (sizeMatch) {
    const size = parseInt(sizeMatch[1])
    return sizeToTextSize(size)
  }

  return 'tw:text-3xl' // default
})

const initials = computed(() => {
  if (props.team?.name) {
    return props.team.name
      .split(' ')
      .map((name) => name.charAt(0))
      .slice(0, 2)
      .join('')
      .toUpperCase()
  }
  return null
})
</script>

<template>
  <div class="tw:relative tw:inline-block" :class="attrs.class">
    <div
      class="tw:rounded-2xl tw:flex tw:items-center tw:justify-center tw:text-white tw:font-bold tw:border-4 tw:border-sidebar tw:shadow-sm tw:cursor-pointer tw:aspect-square tw:w-full tw:h-full"
      :class="[textSizeClass]"
      :style="{ backgroundColor: team?.color || '#6366f1' }"
    >
      <img
        v-if="hasAvatar"
        :src="team.avatar"
        :alt="teamName"
        class="tw:w-full tw:h-full tw:rounded-2xl tw:object-cover"
      />
      <span v-else-if="initials" class="tw:uppercase">{{ initials }}</span>
      <IconUsersGroup v-else class="tw:size-1/2" />
    </div>
    <div
      v-if="showBadge"
      class="tw:absolute tw:bottom-1 tw:right-1 tw:size-5 tw:border-2 tw:border-sidebar tw:rounded-full"
      :class="badgeColorClass"
    ></div>
  </div>
</template>
