<script setup>
/**
 * BaseCommandPalette — ⌘K/⌘P omnibox (Enterprise Page Framework C4).
 * Reads commands from the central registry (useCommandRegistry); navigation
 * entries are just commands whose `perform` pushes a route (registered by the
 * app via useNavigationCommands, so this stays framework-pure). Fuzzy-filters,
 * groups, and runs the selected command. WAI-ARIA combobox + listbox: focus
 * stays in the input, the active option is tracked via aria-activedescendant.
 *
 * Mount once near the app root (alongside HotkeyHelp / ConfirmDialogHost).
 */
import { IconSearch } from '@tabler/icons-vue'
import { filterCommands, groupCommands } from '../composables/commandHelpers.js'

const open = ref(false)
const query = ref('')
const activeIndex = ref(0)
const inputEl = ref(null)
const listboxId = 'command-palette-listbox'

const { commands } = useCommandRegistry()

const filtered = computed(() => filterCommands(commands.value, query.value, { limit: 50 }))
const groups = computed(() => groupCommands(filtered.value))
// Flat list in rendered order so keyboard nav and aria-activedescendant line up.
const flat = computed(() => groups.value.flatMap((g) => g.items))
const activeId = computed(() => {
  const cmd = flat.value[activeIndex.value]
  return cmd ? optionId(cmd) : undefined
})

function optionId(cmd) {
  return `command-palette-opt-${cmd.id}`
}

useHotkeys({
  keys: ['mod+k', 'mod+p'],
  description: 'Command palette',
  group: 'Global',
  allowInInput: true,
  handler: openPalette,
})

function openPalette() {
  open.value = true
  query.value = ''
  activeIndex.value = 0
  nextTick(() => inputEl.value?.focus())
}
function close() {
  open.value = false
}
function move(delta) {
  const n = flat.value.length
  if (!n) return
  activeIndex.value = (activeIndex.value + delta + n) % n
}
function runCommand(cmd) {
  if (!cmd) return
  close()
  cmd.perform?.()
}
function onKeydown(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    move(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    move(-1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    runCommand(flat.value[activeIndex.value])
  } else if (e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}

watch(query, () => {
  activeIndex.value = 0
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="tw:fixed tw:inset-0 tw:z-modal tw:flex tw:items-start tw:justify-center tw:bg-black/40 tw:p-4 tw:pt-[12vh]"
      @click="close"
    >
      <div
        class="tw:w-full tw:max-w-xl tw:overflow-hidden tw:rounded-xl tw:border tw:border-divider tw:bg-card tw:shadow-overlay"
        @click.stop
      >
        <!-- Search input (combobox) -->
        <div class="tw:flex tw:items-center tw:gap-2 tw:border-b tw:border-divider tw:px-3">
          <IconSearch :size="18" class="tw:shrink-0 tw:text-secondary" aria-hidden="true" />
          <input
            ref="inputEl"
            v-model="query"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-label="Command palette"
            :aria-controls="listboxId"
            :aria-activedescendant="activeId"
            placeholder="Search pages and actions…"
            class="tw:w-full tw:border-0 tw:bg-transparent tw:py-3 tw:text-body tw:text-on-main tw:outline-none tw:placeholder:text-placeholder"
            @keydown="onKeydown"
          />
        </div>

        <!-- Results (listbox) -->
        <div :id="listboxId" role="listbox" class="tw:max-h-[50vh] tw:overflow-y-auto tw:p-2">
          <template v-if="flat.length">
            <div v-for="g in groups" :key="g.group" class="tw:mb-1">
              <BaseText
                as="div"
                variant="overline"
                color="secondary"
                class="tw:px-2 tw:py-1"
              >
                {{ g.group }}
              </BaseText>
              <button
                v-for="cmd in g.items"
                :id="optionId(cmd)"
                :key="cmd.id"
                type="button"
                role="option"
                :aria-selected="flat[activeIndex]?.id === cmd.id"
                class="tw:flex tw:w-full tw:items-center tw:gap-3 tw:rounded-lg tw:px-2 tw:py-2 tw:text-left tw:text-body tw:text-on-main"
                :class="
                  flat[activeIndex]?.id === cmd.id
                    ? 'tw:bg-main-selected tw:text-primary'
                    : 'tw:hover:bg-main-hover'
                "
                @click="runCommand(cmd)"
                @mousemove="activeIndex = flat.findIndex((c) => c.id === cmd.id)"
              >
                <component :is="cmd.icon" v-if="cmd.icon" :size="16" class="tw:shrink-0" aria-hidden="true" />
                <span class="tw:truncate">{{ cmd.title }}</span>
              </button>
            </div>
          </template>
          <BaseStatusState v-else variant="empty" title="No matching commands" dense />
        </div>
      </div>
    </div>
  </Teleport>
</template>
