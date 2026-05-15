<script setup>
defineOptions({
  inheritAttrs: false,
})

const props = defineProps({
  user: {
    type: Object,
    default: () => ({}),
  },
  showBadge: {
    type: Boolean,
    default: false,
  },
  bordered: {
    type: Boolean,
    default: true,
  },
  showCardOnClick: {
    type: Boolean,
    default: false,
  },
})

const attrs = useAttrs()

const fullName = computed(() => {
  if (!props.user) return ''
  return props.user.fullName || `${props.user.firstName || ''} ${props.user.lastName || ''}`.trim()
})

const initials = computed(() => {
  if (fullName.value) {
    return fullName.value
      .split(' ')
      .map((name) => name.charAt(0))
      .slice(0, 2)
      .join('')
      .toUpperCase()
  }
  return props.user?.email?.charAt(0).toUpperCase() || 'U'
})

const hasAvatar = computed(() => !!props.user?.avatar)

const badgeColorClass = computed(() => {
  if (props.user?.userStatusId === 'ACTIVE') {
    return 'tw:bg-good'
  }
  return 'tw:bg-warn'
})

// Size to text size mapping
function sizeToTextSize(size) {
  if (size <= 6) return 'tw:text-xs tw:border-1!'
  if (size <= 8) return 'tw:text-sm'
  if (size <= 10) return 'tw:text-base'
  if (size <= 12) return 'tw:text-lg'
  if (size <= 14) return 'tw:text-xl'
  if (size <= 16) return 'tw:text-2xl'
  if (size <= 18) return 'tw:text-3xl'
  if (size <= 24) return 'tw:text-4xl'
  if (size <= 28) return 'tw:text-5xl'
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
</script>

<template>
  <BasePopover v-if="showCardOnClick" :flip="true" :offset="8" :arrow="true">
    <template #button>
      <div class="tw:relative tw:inline-block" :class="attrs.class">
        <div
          class="tw:rounded-full tw:flex tw:items-center tw:justify-center tw:text-white tw:font-bold tw:border-sidebar tw:shadow-sm tw:cursor-pointer tw:aspect-square tw:w-full tw:h-full"
          :class="[textSizeClass, { 'tw:border-4': bordered }]"
          :style="{ backgroundColor: user?.color || '#2563eb' }"
        >
          <img
            v-if="hasAvatar"
            :src="user.avatar"
            :alt="fullName"
            class="tw:w-full tw:h-full tw:rounded-full tw:object-cover"
          />
          <span v-else class="tw:uppercase">{{ initials }}</span>
        </div>
        <div
          v-if="showBadge"
          class="tw:absolute tw:bottom-1 tw:right-1 tw:size-5 tw:border-2 tw:border-sidebar tw:rounded-full"
          :class="badgeColorClass"
        ></div>
      </div>
    </template>
    <template #content>
      <UserCard :user="user" />
    </template>
  </BasePopover>

  <div v-else class="tw:relative tw:inline-block" :class="attrs.class">
    <div
      class="tw:rounded-full tw:flex tw:items-center tw:justify-center tw:text-white tw:font-bold tw:border-sidebar tw:shadow-sm tw:cursor-pointer tw:aspect-square tw:w-full tw:h-full"
      :class="[textSizeClass, { 'tw:border-4': bordered }]"
      :style="{ backgroundColor: user?.color || '#2563eb' }"
    >
      <img
        v-if="hasAvatar"
        :src="user.avatar"
        :alt="fullName"
        class="tw:w-full tw:h-full tw:rounded-full tw:object-cover"
      />
      <span v-else class="tw:uppercase">{{ initials }}</span>
    </div>
    <div
      v-if="showBadge"
      class="tw:absolute tw:bottom-1 tw:right-1 tw:size-5 tw:border-2 tw:border-sidebar tw:rounded-full"
      :class="badgeColorClass"
    ></div>
  </div>
</template>
