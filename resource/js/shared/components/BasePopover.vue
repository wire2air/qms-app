<script setup>
import { Popover, PopoverButton, PopoverPanel, TransitionRoot } from '@headlessui/vue'
import {
  autoUpdate,
  computePosition,
  flip as flipMiddleware,
  offset as offsetMiddleware,
  shift as shiftMiddleware,
  arrow as arrowMiddleware,
} from '@floating-ui/dom'

const props = defineProps({
  flip: {
    type: Boolean,
    default: false,
  },
  arrow: {
    type: Boolean,
    default: true,
  },
  offset: {
    type: Number,
    default: 12,
  },
  shift: {
    type: Number,
    default: 12,
  },
  placement: {
    type: String,
    default: 'bottom',
  },
  menuItemsClasses: {
    type: String,
    default: '',
  },
  portal: {
    type: Boolean,
    default: true,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  showContent: {
    type: Boolean,
    default: true,
  },
})

const popoverPanelRef = ref(null)
const triggerRef = ref(null)
const arrowRef = ref(null)
const floatingStyles = ref({
  position: props.portal ? 'fixed' : 'absolute',
  top: '0px',
  left: '0px',
})
const arrowStyles = ref({})
const resolvedPlacement = ref(props.placement)
let cleanupAutoUpdate

function getTriggerEl() {
  return triggerRef.value?.$el ?? triggerRef.value ?? null
}

function getPanelEl() {
  return popoverPanelRef.value?.$el ?? popoverPanelRef.value ?? null
}

function middlewareForPlacement() {
  const middleware = [offsetMiddleware(props.offset)]
  if (props.shift !== false && props.shift !== null && props.shift !== undefined) {
    middleware.push(
      shiftMiddleware({
        padding: typeof props.shift === 'number' ? props.shift : 8,
      }),
    )
  }

  if (props.flip) {
    middleware.push(flipMiddleware())
  }

  if (props.arrow && arrowRef.value) {
    middleware.push(
      arrowMiddleware({
        element: arrowRef.value,
      }),
    )
  }

  return middleware
}

async function updateFloatingPosition() {
  const referenceEl = getTriggerEl()
  const floatingEl = getPanelEl()
  if (!referenceEl || !floatingEl) return

  const { x, y, placement, middlewareData } = await computePosition(referenceEl, floatingEl, {
    placement: props.placement,
    strategy: props.portal ? 'fixed' : 'absolute',
    middleware: middlewareForPlacement(),
  })

  floatingStyles.value = {
    position: props.portal ? 'fixed' : 'absolute',
    left: `${x}px`,
    top: `${y}px`,
    zIndex: 50,
  }

  resolvedPlacement.value = placement

  if (props.arrow && middlewareData.arrow && arrowRef.value) {
    const { x: arrowX, y: arrowY } = middlewareData.arrow
    arrowStyles.value = {
      left: arrowX != null ? `${arrowX}px` : '',
      top: arrowY != null ? `${arrowY}px` : '',
    }
  }
}

function stopAutoUpdate() {
  if (cleanupAutoUpdate) {
    cleanupAutoUpdate()
    cleanupAutoUpdate = null
  }
}

function initAutoUpdate() {
  const referenceEl = getTriggerEl()
  const floatingEl = getPanelEl()
  if (!referenceEl || !floatingEl) return
  stopAutoUpdate()
  cleanupAutoUpdate = autoUpdate(referenceEl, floatingEl, () => {
    updateFloatingPosition()
  })
}

watch(popoverPanelRef, (panel) => {
  const el = panel?.$el ?? panel
  if (el) {
    nextTick(() => el.focus?.())
  }
  if (panel) {
    nextTick(() => {
      updateFloatingPosition()
      initAutoUpdate()
    })
  } else {
    stopAutoUpdate()
  }
})

watch(
  () => [props.placement, props.offset, props.shift, props.flip, props.portal, props.arrow],
  () => {
    nextTick(() => updateFloatingPosition())
  },
)

watch(arrowRef, () => {
  if (arrowRef.value) {
    nextTick(() => updateFloatingPosition())
  }
})

onBeforeUnmount(() => {
  stopAutoUpdate()
})

const arrowOrientation = computed(() => {
  if (resolvedPlacement.value.startsWith('bottom')) return 'tw:rotate-45'
  if (resolvedPlacement.value.startsWith('top')) return 'tw:rotate-225'
  if (resolvedPlacement.value.startsWith('left')) return 'tw:rotate-135'
  return 'tw:-rotate-45'
})
</script>

<template>
  <template v-if="disabled">
    <div><slot name="button" /></div>
  </template>
  <Popover v-else v-slot="{ open }" class="tw:relative tw:w-fit">
    <PopoverButton ref="triggerRef" as="div" @click.stop>
      <div>
        <slot name="button" :open="open" />
      </div>
    </PopoverButton>

    <Teleport v-if="portal" to="body">
      <TransitionRoot
        as="template"
        :show="open && props.showContent"
        enter="tw:transition tw:duration-200 tw:ease-out"
        enterFrom="tw:scale-95 tw:opacity-0"
        enterTo="tw:scale-100 tw:opacity-100"
        leave="tw:transition tw:duration-150 tw:ease-in"
        leaveFrom="tw:scale-100 tw:opacity-100"
        leaveTo="tw:scale-95 tw:opacity-0"
      >
        <PopoverPanel
          v-slot="{ open: panelOpen, close }"
          ref="popoverPanelRef"
          tabindex="-1"
          :style="floatingStyles"
          :class="[
            'tw:flex tw:min-h-8 tw:min-w-31 tw:items-center tw:rounded-xl tw:border tw:border-divider tw:bg-sidebar tw:text-sm tw:text-on-sidebar tw:shadow-floating tw:ring-1 tw:ring-black/5 tw:focus:outline-none tw:backdrop-blur-sm',
            props.menuItemsClasses,
          ]"
        >
          <div
            v-if="arrow"
            ref="arrowRef"
            class="tw:pointer-events-none tw:absolute tw:h-2.5 tw:w-2.5 tw:border-l tw:border-t tw:border-divider tw:bg-sidebar"
            :class="arrowOrientation"
            :style="arrowStyles"
          ></div>
          <div class="tw:relative tw:w-full tw:overflow-hidden">
            <slot name="content" :open="panelOpen" :close="close" />
          </div>
        </PopoverPanel>
      </TransitionRoot>
    </Teleport>

    <TransitionRoot
      v-else
      as="template"
      :show="open && props.showContent"
      enter="tw:transition tw:duration-200 tw:ease-out"
      enterFrom="tw:scale-95 tw:opacity-0"
      enterTo="tw:scale-100 tw:opacity-100"
      leave="tw:transition tw:duration-150 tw:ease-in"
      leaveFrom="tw:scale-100 tw:opacity-100"
      leaveTo="tw:scale-95 tw:opacity-0"
    >
      <PopoverPanel
        v-slot="{ open: panelOpen, close }"
        ref="popoverPanelRef"
        tabindex="-1"
        :style="floatingStyles"
        :class="[
          'tw:flex tw:min-h-8 tw:min-w-31 tw:items-center tw:rounded-xl tw:border tw:border-divider tw:bg-sidebar tw:text-sm tw:text-on-sidebar tw:shadow-floating tw:ring-1 tw:ring-black/5 tw:focus:outline-none tw:backdrop-blur-sm',
          props.menuItemsClasses,
        ]"
      >
        <div
          v-if="arrow"
          ref="arrowRef"
          class="tw:pointer-events-none tw:absolute tw:h-2.5 tw:w-2.5 tw:border-l tw:border-t tw:border-divider tw:bg-sidebar"
          :class="arrowOrientation"
          :style="arrowStyles"
        ></div>
        <div class="tw:relative tw:w-full tw:overflow-hidden">
          <slot name="content" :open="panelOpen" :close="close" />
        </div>
      </PopoverPanel>
    </TransitionRoot>
  </Popover>
</template>
