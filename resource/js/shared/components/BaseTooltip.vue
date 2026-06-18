<script setup>
/**
 * BaseTooltip — an accessible hover/focus tooltip built on the installed
 * @floating-ui/dom (no new dependency). Wraps a trigger in its default slot and
 * shows `content` (or the #content slot) as a role="tooltip" element, wiring
 * `aria-describedby` from the trigger to it. Shows on hover AND keyboard focus,
 * hides on leave / blur / Escape — so it's usable without a mouse (WCAG 1.4.13).
 *
 *   <BaseTooltip content="Drives SLA timers">
 *     <IconHelpCircle class="tw:size-4 tw:text-secondary" />
 *   </BaseTooltip>
 *
 * Tooltip content must be non-interactive (it's teleported out of the trigger,
 * so it can't be hovered into) — for interactive popovers use BasePopover.
 */
import { autoUpdate, computePosition, flip, offset as offsetMW, shift } from '@floating-ui/dom'

const props = defineProps({
  content: { type: String, default: '' },
  placement: { type: String, default: 'top' },
  offset: { type: Number, default: 8 },
  disabled: { type: Boolean, default: false },
  // Teleport the tooltip to <body> (default). Set false to render inline.
  teleport: { type: Boolean, default: true },
})

const slots = useSlots()
const triggerRef = ref(null)
const tipRef = ref(null)
const visible = ref(false)
const tipId = useId()
const tipStyles = ref({ position: 'fixed', top: '0px', left: '0px' })
let cleanup

const hasContent = computed(() => !!(props.content || slots.content))

async function position() {
  const reference = triggerRef.value
  const floating = tipRef.value
  if (!reference || !floating) return
  try {
    const { x, y } = await computePosition(reference, floating, {
      placement: props.placement,
      strategy: 'fixed',
      middleware: [offsetMW(props.offset), flip(), shift({ padding: 8 })],
    })
    tipStyles.value = { position: 'fixed', left: `${x}px`, top: `${y}px` }
  } catch {
    /* positioning is best-effort; the tooltip still renders */
  }
}

function show() {
  if (props.disabled || !hasContent.value || visible.value) return
  visible.value = true
  nextTick(() => {
    position()
    const reference = triggerRef.value
    const floating = tipRef.value
    if (reference && floating && typeof autoUpdate === 'function') {
      cleanup = autoUpdate(reference, floating, position)
    }
  })
}

function hide() {
  visible.value = false
  cleanup?.()
  cleanup = null
}

function onKeydown(e) {
  if (e.key === 'Escape') hide()
}

onBeforeUnmount(() => cleanup?.())
</script>

<template>
  <span
    ref="triggerRef"
    class="tw:inline-flex"
    :aria-describedby="visible ? tipId : undefined"
    @mouseenter="show"
    @mouseleave="hide"
    @focusin="show"
    @focusout="hide"
    @keydown="onKeydown"
  >
    <slot />

    <Teleport to="body" :disabled="!teleport">
      <div
        v-if="visible"
        :id="tipId"
        ref="tipRef"
        role="tooltip"
        :style="tipStyles"
        class="tw:z-max tw:pointer-events-none tw:max-w-xs tw:rounded-lg tw:bg-code tw:px-2 tw:py-1 tw:text-xs tw:font-medium tw:text-white tw:shadow-floating"
      >
        <slot name="content">{{ content }}</slot>
      </div>
    </Teleport>
  </span>
</template>
