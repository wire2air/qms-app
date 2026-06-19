<script setup>
/**
 * HotkeyHelp — the `?` keyboard-shortcut cheat-sheet (Enterprise Page Framework F5).
 * Mount once near the app root (alongside ConfirmDialogHost). Self-registers the
 * `?` shortcut to open, and lists every described binding from the central
 * registry, grouped, with platform-aware <kbd> chips.
 */
import { formatChordParts } from '../composables/hotkeyHelpers.js'

const open = ref(false)
const { groups } = useHotkeyRegistry()
const isMac = computed(() =>
  /mac|iphone|ipad/i.test((navigator.platform || navigator.userAgent || '').toString()),
)

useHotkeys({
  keys: '?',
  description: 'Show keyboard shortcuts',
  group: 'General',
  handler: () => {
    open.value = true
  },
})

function parts(keys) {
  return formatChordParts(Array.isArray(keys) ? keys[0] : keys, isMac.value)
}
</script>

<template>
  <BaseDialog v-model="open" title="Keyboard shortcuts" size="lg">
    <div v-if="groups.length" class="tw:flex tw:flex-col tw:gap-6">
      <section v-for="g in groups" :key="g.group" class="tw:flex tw:flex-col tw:gap-2">
        <BaseText as="h3" variant="overline" color="secondary">{{ g.group }}</BaseText>
        <ul class="tw:flex tw:flex-col tw:divide-y tw:divide-divider">
          <li
            v-for="item in g.items"
            :key="item.id"
            class="tw:flex tw:items-center tw:justify-between tw:gap-4 tw:py-2"
          >
            <span class="tw:text-body tw:text-on-main">{{ item.description }}</span>
            <span class="tw:flex tw:items-center tw:gap-1">
              <kbd
                v-for="(p, i) in parts(item.keys)"
                :key="i"
                class="tw:inline-flex tw:min-w-5 tw:items-center tw:justify-center tw:rounded tw:border tw:border-divider tw:bg-main tw:px-1.5 tw:py-0.5 tw:text-caption tw:font-semibold tw:text-secondary"
              >
                {{ p }}
              </kbd>
            </span>
          </li>
        </ul>
      </section>
    </div>
    <BaseStatusState v-else variant="empty" title="No shortcuts registered" dense />
  </BaseDialog>
</template>
