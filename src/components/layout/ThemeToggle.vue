<script setup>
/**
 * One-click light/dark toggle. Shows a moon in light mode (click → dark)
 * and a sun in dark mode (click → light). 'system' is only the initial
 * default — the first click pins an explicit choice, applied via
 * utils/theme.js and mirrored to users.settings.theme so it follows the
 * user across devices (localStorage handles the pre-mount flash).
 */
import { IconSun, IconMoon } from '@tabler/icons-vue'
import { isDark, themeMode, setThemeMode } from '@/utils/theme.js'
import { useUserSettings } from '@/composables/useUserSettings'

defineProps({
  size: { type: Number, default: 18 },
})

const { getSetting, setSetting, ready } = useUserSettings()

// Adopt the synced preference once the user row is available — another
// device may have changed it. localStorage already applied a best guess
// pre-mount; this corrects it if they differ.
const adopted = ref(false)
watch(
  ready,
  (r) => {
    if (!r || adopted.value) return
    adopted.value = true
    const saved = getSetting('theme', null)
    if (saved && saved !== themeMode.value) setThemeMode(saved)
  },
  { immediate: true },
)

async function toggle() {
  const next = isDark.value ? 'light' : 'dark'
  setThemeMode(next)
  try {
    await setSetting('theme', next)
  } catch {
    // Preference still applied locally; sync will catch up next change.
  }
}
</script>

<template>
  <button
    class="tw:p-1.5 tw:rounded-full tw:text-secondary tw:hover:text-primary tw:hover:bg-main-hover tw:transition-colors tw:bg-transparent tw:border-0 tw:cursor-pointer"
    :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
    @click="toggle"
  >
    <IconSun v-if="isDark" :size="size" />
    <IconMoon v-else :size="size" />
  </button>
</template>
