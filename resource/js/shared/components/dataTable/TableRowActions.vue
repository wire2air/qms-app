<script setup>
/**
 * Standardized per-row actions: a few inline "quick" actions plus an overflow
 * menu for the rest. One config drives both, with permission/conditional
 * visibility and disabled predicates — so every module stops hand-rolling an
 * actions column.
 *
 * Action item:
 *   {
 *     key, label,
 *     icon?,                 // @tabler icon component
 *     onClick?(row),         // handler (omit if `to` is used)
 *     to?(row) | to,         // RouterLink target instead of a click handler
 *     visible?(row)|bool,    // default true — gate by permission/state
 *     disabled?(row)|bool,
 *     danger?: bool,         // destructive styling
 *     quick?: bool,          // force inline (else first `maxQuick` are inline)
 *   }
 */
import { IconDotsVertical } from '@tabler/icons-vue'

const props = defineProps({
  actions: { type: Array, default: () => [] },
  row: { type: Object, default: null },
  // How many inline icon buttons before the rest collapse into the overflow menu.
  maxQuick: { type: Number, default: 2 },
})

function pred(val, fallback) {
  if (typeof val === 'function') return val(props.row)
  return val === undefined ? fallback : val
}
function resolveTo(a) {
  return typeof a.to === 'function' ? a.to(props.row) : a.to
}

const visibleActions = computed(() => props.actions.filter((a) => pred(a.visible, true)))
const quickActions = computed(() => {
  const forced = visibleActions.value.filter((a) => a.quick)
  return forced.length ? forced : visibleActions.value.slice(0, props.maxQuick)
})
const overflowActions = computed(() =>
  visibleActions.value.filter((a) => !quickActions.value.includes(a)),
)

function run(a) {
  if (pred(a.disabled, false)) return
  a.onClick?.(props.row)
}
</script>

<template>
  <div class="tw:flex tw:items-center tw:justify-end tw:gap-1" @click.stop>
    <component
      :is="a.to ? 'RouterLink' : 'button'"
      v-for="a in quickActions"
      :key="a.key"
      :to="a.to ? resolveTo(a) : undefined"
      :type="a.to ? undefined : 'button'"
      :disabled="!a.to && pred(a.disabled, false)"
      :aria-label="a.label"
      :title="a.label"
      class="tw:flex tw:size-7 tw:items-center tw:justify-center tw:rounded-md tw:transition-colors tw:focus-visible:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-primary/40 disabled:tw:cursor-not-allowed disabled:tw:opacity-40"
      :class="
        a.danger
          ? 'tw:text-secondary tw:hover:bg-red-50 tw:hover:text-red-600'
          : 'tw:text-secondary tw:hover:bg-main-hover tw:hover:text-on-main'
      "
      @click="!a.to && run(a)"
    >
      <component :is="a.icon" v-if="a.icon" :size="16" />
      <span v-else class="tw:text-xs tw:font-medium">{{ a.label }}</span>
    </component>

    <BasePopover v-if="overflowActions.length" placement="bottom-end">
      <template #button>
        <button
          type="button"
          aria-label="More actions"
          title="More actions"
          class="tw:flex tw:size-7 tw:items-center tw:justify-center tw:rounded-md tw:text-secondary tw:transition-colors tw:hover:bg-main-hover tw:hover:text-on-main tw:focus-visible:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-primary/40"
        >
          <IconDotsVertical :size="16" />
        </button>
      </template>
      <template #content="{ close }">
        <div class="tw:w-48 tw:p-1" role="menu">
          <component
            :is="a.to ? 'RouterLink' : 'button'"
            v-for="a in overflowActions"
            :key="a.key"
            :to="a.to ? resolveTo(a) : undefined"
            :type="a.to ? undefined : 'button'"
            :disabled="!a.to && pred(a.disabled, false)"
            role="menuitem"
            class="tw:flex tw:w-full tw:items-center tw:gap-2.5 tw:rounded-md tw:px-3 tw:py-2 tw:text-left tw:text-sm tw:transition-colors disabled:tw:cursor-not-allowed disabled:tw:opacity-40"
            :class="
              a.danger
                ? 'tw:text-red-600 tw:hover:bg-red-50'
                : 'tw:text-on-sidebar tw:hover:bg-main-hover'
            "
            @click="
              () => {
                if (!a.to) run(a)
                close()
              }
            "
          >
            <component :is="a.icon" v-if="a.icon" :size="15" class="tw:shrink-0" />
            <span class="tw:truncate">{{ a.label }}</span>
          </component>
        </div>
      </template>
    </BasePopover>
  </div>
</template>
