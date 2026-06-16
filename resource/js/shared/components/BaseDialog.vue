<script setup>
import { TransitionRoot, TransitionChild, Dialog, DialogPanel, DialogTitle } from '@headlessui/vue'
import { IconX } from '@tabler/icons-vue'

const props = defineProps({
  title: {
    type: String,
    default: '',
  },
  // `size` is the canonical prop; `maxWidth` is kept for backwards compat.
  size: {
    type: String,
    default: null,
    validator: (v) => !v || ['sm', 'md', 'lg', 'xl', '2xl', '3xl', 'full'].includes(v),
  },
  maxWidth: {
    type: String,
    default: '2xl',
    validator: (v) => ['sm', 'md', 'lg', 'xl', '2xl', '3xl', 'full'].includes(v),
  },
  persistent: {
    type: Boolean,
    default: false,
  },
})

const isOpen = defineModel({
  type: Boolean,
  default: false,
})

// `size` wins over `maxWidth`; default resolves to 2xl.
const resolvedSize = computed(() => props.size || props.maxWidth)

function close() {
  isOpen.value = false
}

const maxWidthClass = {
  sm: 'tw:max-w-sm',
  md: 'tw:max-w-md',
  lg: 'tw:max-w-lg',
  xl: 'tw:max-w-xl',
  '2xl': 'tw:max-w-2xl',
  '3xl': 'tw:max-w-3xl',
  full: 'tw:max-w-full',
}
</script>

<template>
  <TransitionRoot appear :show="isOpen" as="template">
    <Dialog as="div" class="tw:relative tw:z-50" @close="persistent ? null : close()">
      <!-- Backdrop -->
      <TransitionChild
        as="template"
        enter="tw:duration-300 tw:ease-out"
        enterFrom="tw:opacity-0"
        enterTo="tw:opacity-100"
        leave="tw:duration-200 tw:ease-in"
        leaveFrom="tw:opacity-100"
        leaveTo="tw:opacity-0"
      >
        <div class="tw:fixed tw:inset-0 tw:bg-black/40" />
      </TransitionChild>

      <div class="tw:fixed tw:inset-0 tw:overflow-y-auto">
        <div class="tw:flex tw:min-h-full tw:items-center tw:justify-center tw:p-4">
          <TransitionChild
            as="template"
            enter="tw:duration-300 tw:ease-out"
            enterFrom="tw:opacity-0 tw:scale-95"
            enterTo="tw:opacity-100 tw:scale-100"
            leave="tw:duration-200 tw:ease-in"
            leaveFrom="tw:opacity-100 tw:scale-100"
            leaveTo="tw:opacity-0 tw:scale-95"
          >
            <DialogPanel
              class="tw:w-full tw:transform tw:rounded-2xl tw:bg-sidebar tw:shadow-overlay tw:transition-all tw:overflow-hidden"
              :class="maxWidthClass[resolvedSize]"
            >
              <!-- Header -->
              <div
                v-if="title || $slots.title"
                class="tw:flex tw:items-center tw:justify-between tw:px-6 tw:pt-5 tw:pb-4 tw:border-b tw:border-divider"
              >
                <DialogTitle as="h3" class="tw:text-base tw:font-semibold tw:text-on-main">
                  <slot name="title">{{ title }}</slot>
                </DialogTitle>
                <button
                  v-if="!persistent"
                  class="tw:p-1 tw:rounded tw:text-secondary tw:hover:bg-main-hover tw:transition-colors"
                  @click="close"
                >
                  <IconX :size="18" />
                </button>
              </div>

              <!-- Body -->
              <div class="tw:px-6 tw:py-5">
                <slot :close="close" />
              </div>

              <!-- Footer -->
              <div
                v-if="$slots.footer"
                class="tw:flex tw:items-center tw:justify-end tw:gap-3 tw:px-6 tw:py-4 tw:border-t tw:border-divider tw:bg-main"
              >
                <slot name="footer" :close="close" />
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </div>
    </Dialog>
  </TransitionRoot>
</template>
