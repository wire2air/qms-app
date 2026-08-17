<script setup>
/**
 * The Qability logo. One component so the product mark is never hand-rolled
 * per page — the auth pages previously each drew their own IconShieldCheck.
 *
 * Two artworks, two tones:
 *
 *   variant="wordmark"  the full "QAbility" lockup — sign-in, password reset,
 *                       invitations. Anywhere with room to say the name.
 *   variant="mark"      the Q on its own — the sidebar, and anywhere square.
 *
 * The artwork is navy (#001031) with violet accents, so it disappears on a
 * dark surface. `tone` picks the recolored variant:
 *
 *   tone="auto"   follow the app theme (default) — right for in-app chrome
 *   tone="light"  navy inked white, violet accents kept — for a NEUTRAL dark
 *                 surface, where the violet still reads
 *   tone="mono"   one ink, all white — for a COLOURED surface. The auth panels
 *                 are brand blue, and #635BFF has too little contrast against
 *                 blue: the accent squares inside the Q vanished entirely
 *   tone="dark"   force the navy artwork
 *
 * The tagline in the supplied artwork was live <text> in Montserrat, which the
 * app does not load — it would have rendered in a fallback face. These assets
 * are the wordmark only, so there is no font dependency.
 */
// The app's own theme manager — NOT vueuse's useDark(). useDark() is a second
// source of truth: it reads a different localStorage key ('vueuse-color-scheme'
// vs the app's 'theme'), so it reported the wrong theme, and it WRITES the
// `.dark` class too, competing with theme.js over the same class.
import { isDark } from '@/utils/theme.js'

import wordmarkDark from '@/assets/brand/qability-logo.svg'
import wordmarkLight from '@/assets/brand/qability-logo-light.svg'
import wordmarkMono from '@/assets/brand/qability-logo-mono.svg'
import markDark from '@/assets/brand/qability-mark.svg'
import markLight from '@/assets/brand/qability-mark-light.svg'
import markMono from '@/assets/brand/qability-mark-mono.svg'

const props = defineProps({
  variant: {
    type: String,
    default: 'wordmark',
    validator: (v) => ['wordmark', 'mark'].includes(v),
  },
  tone: {
    type: String,
    default: 'auto',
    validator: (v) => ['auto', 'light', 'mono', 'dark'].includes(v),
  },
})

const resolvedTone = computed(() => {
  if (props.tone !== 'auto') return props.tone
  return isDark.value ? 'light' : 'dark'
})

const ART = {
  wordmark: { dark: wordmarkDark, light: wordmarkLight, mono: wordmarkMono },
  mark: { dark: markDark, light: markLight, mono: markMono },
}

const src = computed(() => ART[props.variant][resolvedTone.value])
</script>

<template>
  <img :src="src" alt="Qability" draggable="false" v-bind="$attrs" />
</template>
