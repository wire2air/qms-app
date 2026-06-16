<script setup>
import { IconLoader2 } from '@tabler/icons-vue'

const props = defineProps({
  variant: {
    type: String,
    default: 'primary',
    validator(value) {
      return [
        'primary',
        'danger',
        'warning',
        'secondary',
        'outline',
        'text',
        'text-link',
        'transparent',
        'filter',
      ].includes(value)
    },
  },
  type: {
    type: String,
    default: 'button',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  iconOnly: {
    type: Boolean,
    default: false,
  },
  as: {
    type: String,
    default: 'button',
    validator(value) {
      return ['button', 'a', 'RouterLink'].includes(value)
    },
  },
  size: {
    type: String,
    default: 'md',
    validator(value) {
      return ['xs', 'sm', 'md', 'lg'].includes(value)
    },
  },
  isOpen: {
    type: Boolean,
    default: false,
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
})

const variantClassMap = {
  primary:
    'tw:gap-1.5 tw:bg-primary tw:text-on-primary tw:border tw:border-primary tw:hover:enabled:bg-primary-hover tw:hover:enabled:border-primary-hover tw:focus:enabled:ring-2 tw:focus:enabled:ring-primary/30 tw:focus:enabled:ring-offset-2 tw:transition-[border,background-color,color,opacity,box-shadow] tw:duration-200',
  danger:
    'tw:bg-bad tw:text-white tw:hover:enabled:brightness-90 tw:focus:enabled:ring-2 tw:focus:enabled:ring-danger/30 tw:focus:enabled:ring-offset-2 tw:transition-[background-color,box-shadow] tw:duration-200',
  warning:
    'tw:bg-warning tw:text-white tw:hover:enabled:brightness-90 tw:focus:enabled:ring-2 tw:focus:enabled:ring-warning/30 tw:focus:enabled:ring-offset-2 tw:transition-[background-color,box-shadow] tw:duration-200',
  secondary:
    'tw:gap-1.5 tw:bg-sidebar tw:text-on-sidebar tw:border tw:border-divider tw:hover:enabled:bg-sidebar-hover tw:hover:enabled:border-divider-hover tw:focus:enabled:ring-2 tw:focus:enabled:ring-primary/30 tw:focus:enabled:ring-offset-2 tw:transition-[border,background-color,color,opacity,box-shadow] tw:duration-200',
  outline:
    'tw:gap-1.5 tw:border tw:border-divider tw:disabled:opacity-60 tw:text-on-sidebar tw:hover:enabled:bg-main-hover tw:focus:enabled:ring-2 tw:focus:enabled:ring-primary/30 tw:focus:enabled:ring-offset-2 tw:transition-[border,background-color,color,opacity,box-shadow] tw:duration-200',
  text: 'tw:gap-1.5 tw:border-0 tw:!px-0 tw:bg-transparent tw:text-on-sidebar tw:hover:enabled:text-primary tw:focus:enabled:ring-2 tw:focus:enabled:ring-primary/30 tw:focus:enabled:ring-offset-2 tw:rounded tw:transition-[color,box-shadow] tw:duration-200',
  'text-link':
    'tw:gap-1.5 tw:border-0 tw:!px-0 tw:bg-transparent tw:text-primary tw:font-semibold tw:hover:enabled:brightness-90 tw:focus:enabled:ring-2 tw:focus:enabled:ring-primary/30 tw:focus:enabled:ring-offset-2 tw:rounded tw:transition-[color,box-shadow] tw:duration-200',
  transparent:
    'tw:hover:enabled:brightness-90 tw:focus:enabled:ring-2 tw:focus:enabled:ring-primary/30 tw:focus:enabled:ring-offset-2 tw:transition-[background-color,box-shadow] tw:duration-200',
  filter:
    'tw:h-8 tw:items-center tw:gap-1.5 tw:rounded-lg tw:border tw:border-divider tw:bg-sidebar tw:text-sm tw:text-on-sidebar tw:transition-[border,background-color,color,opacity,box-shadow] tw:duration-200 tw:hover:enabled:border-divider-hover tw:hover:enabled:bg-sidebar-hover tw:focus:enabled:ring-2 tw:focus:enabled:ring-primary/30 tw:focus:enabled:ring-offset-2',
}

const variantIsOpenClassMap = {
  primary: 'tw:!bg-primary-hover tw:!text-primary-text',
  danger: 'tw:!brightness-90',
  warning: 'tw:!brightness-90',
  secondary: 'tw:!bg-sidebar-hover tw:!border-divider-hover',
  outline: 'tw:!border-primary',
  text: 'tw:!text-primary',
  'text-link': 'tw:!brightness-90',
  transparent: '',
  filter: 'tw:!border-divider-hover tw:!bg-sidebar-hover',
}

const heightClass = computed(() => {
  switch (props.size) {
    case 'xs':
      return 'tw:h-4'
    case 'sm':
      return 'tw:h-6'
    case 'lg':
      return 'tw:h-10'
    case 'md':
    default:
      return 'tw:h-8'
  }
})

const widthClass = computed(() => {
  if (!props.iconOnly) return ''
  switch (props.size) {
    case 'xs':
      return 'tw:w-4'
    case 'sm':
      return 'tw:w-6'
    case 'md':
      return 'tw:w-8'
    case 'lg':
    default:
      return 'tw:w-10'
  }
})

const fontClass = computed(() => {
  switch (props.size) {
    case 'xs':
      return 'tw:text-[10px]'
    case 'sm':
      return 'tw:text-xs'
    case 'lg':
      return 'tw:text-base'
    case 'md':
    default:
      return 'tw:text-sm'
  }
})

const paddingClass = computed(() => {
  if (props.iconOnly) return ''
  switch (props.size) {
    case 'xs':
      return 'tw:px-1'
    case 'sm':
      return 'tw:px-2'
    case 'lg':
      return 'tw:px-4'
    case 'md':
    default:
      return 'tw:px-3'
  }
})

const baseClasses = computed(() => {
  return [
    'tw:inline-flex tw:items-center tw:justify-center tw:disabled:cursor-not-allowed tw:disabled:opacity-60 tw:whitespace-nowrap tw:select-none tw:font-medium',
    !props.iconOnly ? 'tw:rounded-lg' : '',
    fontClass.value,
    heightClass.value,
    widthClass.value,
    paddingClass.value,
  ]
})

const classes = computed(() => {
  const cls = [baseClasses.value, variantClassMap[props.variant]]

  if (props.iconOnly) {
    const textSizeClass =
      props.size === 'xs' ? 'tw:text-[10px]' : props.size === 'sm' ? 'tw:text-xs' : 'tw:text-xl'
    cls.push(`tw:!rounded-lg ${widthClass.value} ${heightClass.value} ${textSizeClass}`)
  }

  if (props.isOpen) {
    cls.push(variantIsOpenClassMap[props.variant])
  }

  return cls
})

const attr = useAttrs()
const computedAs = computed(() => {
  if (attr.to) {
    return 'RouterLink'
  }

  if (attr.href) {
    return 'a'
  }

  return props.as
})

const computedDisabled = computed(() => {
  // in native HTML the disabled false value is treated as true, so we need to return null instead of false to avoid that
  return props.disabled || props.isLoading ? true : null
})

const buttonRef = ref()

// a11y: an icon-only button has no text, so it needs an accessible name.
// Warn in dev if neither aria-label nor title is supplied.
if (import.meta.env.DEV) {
  onMounted(() => {
    if (props.iconOnly && !attr['aria-label'] && !attr['title']) {
      console.warn(
        '[BaseButton] iconOnly button is missing an accessible name — add aria-label or title.',
        buttonRef.value,
      )
    }
  })
}

defineExpose({
  buttonRef,
})
</script>

<template>
  <component
    :is="computedAs"
    ref="buttonRef"
    as="button"
    :disabled="computedDisabled"
    :class="classes"
    :type="type"
  >
    <slot v-if="!isLoading" name="icon" />
    <template v-else>
      <IconLoader2 class="tw:size-4 tw:animate-spin" />
    </template>
    <slot />
    <slot name="append" />
  </component>
</template>
