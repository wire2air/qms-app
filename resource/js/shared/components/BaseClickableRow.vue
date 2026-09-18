<script setup>
/**
 * BaseClickableRow — keyboard-accessible clickable container.
 *
 * Replaces the `<div class="tw:cursor-pointer" @click="...">` anti-pattern,
 * which is not in the tab order, has no role, and ignores Enter/Space — making
 * the whole row unusable by keyboard and screen-reader users (WCAG 2.1.1 / 4.1.2).
 *
 * Two modes:
 *  - `to` set  → renders a <RouterLink> (semantic <a>: keyboard, middle-click,
 *                open-in-new-tab for free). Use for rows whose only job is to
 *                navigate and that DON'T contain nested interactive controls
 *                (interactive content nested in an <a> is invalid HTML).
 *  - otherwise → renders a focusable `role="button"` element that emits `click`
 *                on Enter/Space. Use for action rows, or nav rows that contain a
 *                nested menu/button (those nested controls must `@click.stop`).
 *
 * The element is focusable (tabindex=0), so the app-wide `*:focus-visible`
 * ring (see tokens.css) now applies automatically.
 *
 * Always pass an `aria-label` (or ensure the slot has accessible text) so the
 * control announces its purpose.
 */
const props = defineProps({
  // Route target. When set, renders a RouterLink instead of a role=button.
  to: { type: [String, Object], default: null },
  disabled: { type: Boolean, default: false },
  // Element to render in the non-link branch.
  tag: { type: String, default: 'div' },
})

const emit = defineEmits(['click'])

function activate(e) {
  if (props.disabled) return
  emit('click', e)
}

function onKeydown(e) {
  if (props.disabled) return
  // Activate ONLY when the row itself is the focused target. Keys typed into
  // nested interactive children (an in-place edit input, a select, …) must
  // keep their native behavior — a Space there is a character, not a click.
  // Without this guard the row eats every Space bubbling up from its
  // children (found via the form builder's in-place label editor).
  if (e.target !== e.currentTarget) return
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
    e.preventDefault()
    emit('click', e)
  }
}
</script>

<template>
  <RouterLink v-if="to && !disabled" :to="to" class="tw:cursor-pointer">
    <slot />
  </RouterLink>
  <component
    :is="tag"
    v-else
    role="button"
    :tabindex="disabled ? -1 : 0"
    :aria-disabled="disabled || undefined"
    :class="['tw:cursor-pointer', { 'tw:cursor-not-allowed': disabled }]"
    @click="activate"
    @keydown="onKeydown"
  >
    <slot />
  </component>
</template>
