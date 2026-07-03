<script setup>
/**
 * BaseAvatar — a user/entity avatar: shows the image when `src` loads, falls
 * back to initials from `name`, then to a generic icon. The initials background
 * is a deterministic colour derived from the name (stable per person). Folds the
 * ad-hoc initials/avatar markup (TeamAvatar + ~9 one-offs) into one primitive.
 *
 *   <BaseAvatar :name="user.fullName" :src="user.avatarUrl" size="md" />
 */
import { IconUser } from '@tabler/icons-vue'

const props = defineProps({
  name: { type: String, default: '' },
  src: { type: String, default: '' },
  // xs | sm | md | lg | xl
  size: {
    type: String,
    default: 'md',
    validator: (v) => ['xs', 'sm', 'md', 'lg', 'xl'].includes(v),
  },
  // circle (default) | square
  shape: {
    type: String,
    default: 'circle',
    validator: (v) => ['circle', 'square'].includes(v),
  },
})

const SIZE = {
  xs: 'tw:size-6 tw:text-micro',
  sm: 'tw:size-8 tw:text-xs',
  md: 'tw:size-10 tw:text-sm',
  lg: 'tw:size-12 tw:text-base',
  xl: 'tw:size-16 tw:text-lg',
}

// Deterministic tint per name (stable, theme-aware). Static map → Tailwind emits.
const TINTS = [
  'tw:bg-blue-100 tw:text-blue-700',
  'tw:bg-green-100 tw:text-green-700',
  'tw:bg-amber-100 tw:text-amber-700',
  'tw:bg-purple-100 tw:text-purple-700',
  'tw:bg-rose-100 tw:text-rose-700',
  'tw:bg-teal-100 tw:text-teal-700',
]

const initials = computed(() => {
  if (!props.name) return ''
  return props.name
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase()
})

const tint = computed(() => {
  if (!props.name) return 'tw:bg-main-hover tw:text-secondary'
  let hash = 0
  for (let i = 0; i < props.name.length; i++) hash = (hash + props.name.charCodeAt(i)) % TINTS.length
  return TINTS[hash]
})

// Fall back to initials/icon if the image errors.
const imgFailed = ref(false)
watch(
  () => props.src,
  () => (imgFailed.value = false),
)
const showImage = computed(() => props.src && !imgFailed.value)
</script>

<template>
  <span
    role="img"
    :aria-label="name || 'Avatar'"
    class="tw:inline-flex tw:shrink-0 tw:items-center tw:justify-center tw:overflow-hidden tw:font-semibold tw:select-none"
    :class="[SIZE[size], shape === 'circle' ? 'tw:rounded-full' : 'tw:rounded-lg', !showImage && tint]"
  >
    <img
      v-if="showImage"
      :src="src"
      :alt="name"
      class="tw:size-full tw:object-cover"
      @error="imgFailed = true"
    />
    <span v-else-if="initials">{{ initials }}</span>
    <IconUser v-else class="tw:size-2/3" aria-hidden="true" />
  </span>
</template>
