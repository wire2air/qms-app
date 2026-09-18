<script setup>
/**
 * Read-only guidance for a document section, authored on the template
 * (user request 2026-08-15, simplified 2026-08-16).
 *
 * A single plain-text line. It started as rich text plus attachments; that was
 * more apparatus than a hint needs, and it pushed the section's actual body
 * down the page. Rendered as TEXT, not HTML — nothing here should be able to
 * inject markup, and there is no longer an editor producing any.
 *
 * Renders nothing when a section has no instructions, which most won't; an
 * empty callout on every section is noise.
 */
import { IconInfoCircle } from '@tabler/icons-vue'

const props = defineProps({
  instructions: { type: String, default: '' },
})

const text = computed(() => (props.instructions ?? '').trim())
</script>

<template>
  <p v-if="text" class="tw:flex tw:items-start tw:gap-1.5 tw:text-xs tw:text-secondary tw:italic">
    <IconInfoCircle :size="13" class="tw:text-primary tw:shrink-0 tw:mt-0.5 tw:not-italic" />
    <span>{{ text }}</span>
  </p>
</template>
