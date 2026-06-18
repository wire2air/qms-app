<script setup>
/**
 * BaseDrawer — a side panel (right or left) for filters, detail peeks, and
 * create/edit flows that shouldn't take over the whole screen. Built on the same
 * HeadlessUI Dialog as BaseDialog, so it inherits focus-trap, focus-return, Esc,
 * and scroll-lock for free — it just slides in from an edge instead of centering.
 *
 *   <BaseDrawer v-model="open" title="Filters" side="right" size="md">
 *     …body…
 *     <template #footer><BaseButton @click="apply">Apply</BaseButton></template>
 *   </BaseDrawer>
 *
 * Pass `ariaLabel` when there's no visible title (accessible name — WCAG 4.1.2).
 */
import { TransitionRoot, TransitionChild, Dialog, DialogPanel, DialogTitle } from '@headlessui/vue'
import { IconX } from '@tabler/icons-vue'

const props = defineProps({
  side: {
    type: String,
    default: 'right',
    validator: (v) => ['right', 'left'].includes(v),
  },
  // Panel width.
  size: {
    type: String,
    default: 'md',
    validator: (v) => ['sm', 'md', 'lg', 'xl'].includes(v),
  },
  title: { type: String, default: '' },
  persistent: { type: Boolean, default: false },
  ariaLabel: { type: String, default: '' },
  initialFocus: { type: Object, default: null },
})

const isOpen = defineModel({ type: Boolean, default: false })

function close() {
  isOpen.value = false
}

const WIDTH = {
  sm: 'tw:max-w-sm',
  md: 'tw:max-w-md',
  lg: 'tw:max-w-lg',
  xl: 'tw:max-w-xl',
}

// Slide direction depends on the side it's anchored to.
const offscreen = computed(() => (props.side === 'right' ? 'tw:translate-x-full' : 'tw:-translate-x-full'))
const justify = computed(() => (props.side === 'right' ? 'tw:justify-end' : 'tw:justify-start'))
</script>

<template>
  <TransitionRoot appear :show="isOpen" as="template">
    <Dialog
      as="div"
      class="tw:relative tw:z-modal"
      :initialFocus="initialFocus || undefined"
      @close="persistent ? null : close()"
    >
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

      <div class="tw:fixed tw:inset-0 tw:overflow-hidden">
        <div class="tw:flex tw:h-full" :class="justify">
          <TransitionChild
            as="template"
            enter="tw:transition tw:duration-300 tw:ease-out"
            :enterFrom="offscreen"
            enterTo="tw:translate-x-0"
            leave="tw:transition tw:duration-200 tw:ease-in"
            leaveFrom="tw:translate-x-0"
            :leaveTo="offscreen"
          >
            <DialogPanel
              :aria-label="!title && !$slots.title && ariaLabel ? ariaLabel : undefined"
              class="tw:flex tw:h-full tw:w-full tw:transform tw:flex-col tw:bg-sidebar tw:shadow-overlay tw:transition-all"
              :class="WIDTH[size]"
            >
              <!-- Header -->
              <div
                v-if="title || $slots.title"
                class="tw:flex tw:shrink-0 tw:items-center tw:justify-between tw:border-b tw:border-divider tw:px-6 tw:pt-5 tw:pb-4"
              >
                <DialogTitle as="h3" class="tw:text-base tw:font-semibold tw:text-on-main">
                  <slot name="title">{{ title }}</slot>
                </DialogTitle>
                <button
                  v-if="!persistent"
                  aria-label="Close drawer"
                  class="tw:rounded tw:p-1 tw:text-secondary tw:transition-colors tw:hover:bg-main-hover"
                  @click="close"
                >
                  <IconX :size="18" />
                </button>
              </div>

              <!-- Body (the only scrollable region) -->
              <div class="tw:min-h-0 tw:flex-1 tw:overflow-y-auto tw:px-6 tw:py-5">
                <slot :close="close" />
              </div>

              <!-- Footer -->
              <div
                v-if="$slots.footer"
                class="tw:flex tw:shrink-0 tw:items-center tw:justify-end tw:gap-3 tw:border-t tw:border-divider tw:bg-main tw:px-6 tw:py-4"
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
