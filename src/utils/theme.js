/**
 * Theme manager — applies the `.dark` class the design tokens have been
 * waiting for (base.css/tokens.css define full dark palettes).
 *
 * Mode: 'light' | 'dark' | 'system'. Persisted in localStorage (read by the
 * pre-mount script in index.html to avoid a light flash) and mirrored to
 * users.settings.theme by the toggle so it follows the user across devices.
 */
import { ref, watch } from 'vue'

const STORAGE_KEY = 'theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')

/** @type {import('vue').Ref<'light'|'dark'|'system'>} */
export const themeMode = ref(localStorage.getItem(STORAGE_KEY) || 'system')

/** True when the resolved theme is dark (mode dark, or system + OS dark). */
export const isDark = ref(resolve(themeMode.value))

function resolve(mode) {
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return media.matches
}

function apply() {
  isDark.value = resolve(themeMode.value)
  document.documentElement.classList.toggle('dark', isDark.value)
}

export function setThemeMode(mode) {
  themeMode.value = mode
  localStorage.setItem(STORAGE_KEY, mode)
}

watch(themeMode, apply)
media.addEventListener('change', () => {
  if (themeMode.value === 'system') apply()
})

apply()
