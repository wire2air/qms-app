<script setup>
/**
 * BaseMenu — an action menu (the "⋮ more actions" dropdown). Built on BasePopover
 * for positioning, with the WAI-ARIA menu pattern layered on: role="menu" +
 * role="menuitem", arrow/Home/End focus navigation, and Enter/Space/Escape — so
 * it's fully keyboard-operable (rule #8 / 4.1.2), which the old plain-button
 * version was not.
 *
 *   <BaseMenu :items="[{ name: 'Edit', icon: IconPencil, click: onEdit },
 *                      { name: 'Delete', icon: IconTrash, click: onDelete, disabled: !canDelete }]" />
 *
 * Slots: #trigger (custom trigger button) and #items (fully custom menu body —
 * keyboard nav applies to the default rendering only).
 */
import { IconDotsVertical } from '@tabler/icons-vue'

const props = defineProps({
  /** @type {import('vue').PropType<Array<{name: string, icon?: object, click: () => void, disabled?: boolean, title?: string}>>} */
  items: {
    type: Array,
    default: () => [],
  },
  /**
   * Flip to the opposite side when the preferred `bottom-end` placement does
   * not fit the viewport.
   *
   * BasePopover already carries floating-ui's `flip()` middleware, but its own
   * `flip` prop defaults to FALSE and BaseMenu never passed it — so every menu
   * in the app opens downward unconditionally. A trigger near the bottom of the
   * viewport therefore renders its panel BELOW THE FOLD: the items resolve and
   * report visible + enabled + stable, and every click retries with "element is
   * outside of the viewport" until it times out.
   *
   * That is not hypothetical. The workflow step-actions menu hits it on a
   * 1280x720 viewport whenever the step card sits low on the page, and three
   * Playwright suites carry an explicit
   * `el.scrollIntoView({ block: 'center' })` workaround for it, each with a
   * comment saying the menu not flipping is a real UI issue and not a test one:
   *   e2e/nonconformances/j2-reviewer-workflow.spec.js:107-110
   *   e2e/capas/j2-reviewer-workflow.spec.js:92-94
   *   e2e/changeRequests/j3-reject-sendback.spec.js:76,178,265
   *
   * OPT-IN, not the default, deliberately. `shift` (already on) handles
   * cross-axis overflow; `flip` is the main-axis fix, and turning it on for all
   * 31 BaseMenu call sites at once is a wider change than the one reported
   * defect justifies in a pass whose tests are run by someone else. Callers
   * that can sit low on a scrolling page should set it. Making it the default
   * is the right follow-up for whoever owns this design-system directory —
   * floating-ui only repositions when the preferred placement genuinely does
   * not fit, so a menu with room behaves identically either way.
   */
  flip: {
    type: Boolean,
    default: false,
  },
})

// Roving focus between the rendered menuitems. Driven off the live DOM so it
// works regardless of which items are disabled/hidden.
function onMenuKeydown(e) {
  const menu = e.currentTarget
  const items = Array.from(menu.querySelectorAll('[role="menuitem"]:not([disabled])'))
  if (!items.length) return
  const idx = items.indexOf(document.activeElement)
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      items[idx < 0 || idx === items.length - 1 ? 0 : idx + 1].focus()
      break
    case 'ArrowUp':
      e.preventDefault()
      items[idx <= 0 ? items.length - 1 : idx - 1].focus()
      break
    case 'Home':
      e.preventDefault()
      items[0].focus()
      break
    case 'End':
      e.preventDefault()
      items[items.length - 1].focus()
      break
  }
}
</script>

<template>
  <BasePopover placement="bottom-end" :shift="8" :arrow="false" :flip="props.flip">
    <template #button>
      <slot name="trigger">
        <button
          type="button"
          aria-label="More actions"
          aria-haspopup="menu"
          class="tw:flex tw:items-center tw:justify-center tw:rounded-md tw:p-1 tw:text-secondary tw:hover:bg-sidebar-hover tw:hover:text-on-sidebar tw:transition-colors tw:duration-150"
        >
          <IconDotsVertical :size="16" />
        </button>
      </slot>
    </template>

    <template #content="{ close }">
      <slot name="items" :close="close">
        <div role="menu" class="tw:flex tw:flex-col tw:py-1" @keydown="onMenuKeydown">
          <button
            v-for="item in items"
            :key="item.name"
            type="button"
            role="menuitem"
            :disabled="item.disabled"
            :title="item.title"
            :class="[
              'tw:group tw:flex tw:w-full tw:items-center tw:gap-2 tw:px-3 tw:py-2 tw:text-sm tw:transition-colors tw:duration-100 tw:focus-visible:outline-none tw:focus-visible:bg-main-hover',
              item.disabled
                ? 'tw:text-secondary tw:opacity-50 tw:cursor-not-allowed'
                : 'tw:text-on-sidebar tw:hover:bg-main-hover tw:hover:text-on-main',
            ]"
            @click="
              () => {
                if (item.disabled) return
                item.click()
                close()
              }
            "
          >
            <component
              :is="item.icon"
              v-if="item.icon"
              :size="15"
              class="tw:shrink-0 tw:text-secondary tw:group-hover:text-on-main"
            />
            {{ item.name }}
          </button>
        </div>
      </slot>
    </template>
  </BasePopover>
</template>
