<script setup>
/**
 * Read-only guidance for a document section, authored on the template
 * (user request 2026-08-15).
 *
 * Rich text rather than a plain string so instructions can link to other
 * documents, plus attachments for the reference material that isn't a link.
 * Renders nothing at all when a section has neither — most sections won't, and
 * an empty callout on every one of them is noise.
 *
 * Deliberately not editable here: on a document, instructions are something
 * the author reads, not another field to fill in. The template editor passes
 * `instructionsEditable` to get the authoring controls instead.
 */
import { IconInfoCircle, IconPaperclip } from '@tabler/icons-vue'

const props = defineProps({
  instructions: { type: String, default: '' },
  attachments: { type: Array, default: () => [] },
})

// A rich-text editor leaves markup behind after you delete the text ("<p></p>",
// a stray <br>), so an emptiness check on the raw HTML reports content that
// isn't there. Strip tags and entities before deciding.
const hasText = computed(() => {
  const stripped = (props.instructions ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim()
  return stripped.length > 0
})

const files = computed(() => (Array.isArray(props.attachments) ? props.attachments : []))
const show = computed(() => hasText.value || files.value.length > 0)

function fileName(f) {
  return f?.name || f?.fileName || f?.originalName || 'Attachment'
}
function fileHref(f) {
  return f?.url || f?.path || f?.location || null
}
</script>

<template>
  <div
    v-if="show"
    class="tw:rounded-lg tw:border tw:border-primary/20 tw:bg-primary/5 tw:p-3 tw:flex tw:gap-2"
  >
    <IconInfoCircle :size="16" class="tw:text-primary tw:shrink-0 tw:mt-0.5" />
    <div class="tw:min-w-0 tw:flex-1 tw:space-y-2">
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div
        v-if="hasText"
        class="tw:prose tw:prose-sm tw:max-w-none tw:text-sm tw:text-on-main"
        v-html="instructions"
      />
      <ul v-if="files.length" class="tw:flex tw:flex-wrap tw:gap-2 tw:list-none tw:m-0 tw:p-0">
        <li v-for="(f, i) in files" :key="fileHref(f) || i">
          <a
            v-if="fileHref(f)"
            :href="fileHref(f)"
            target="_blank"
            rel="noopener noreferrer"
            class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:text-primary tw:hover:underline"
          >
            <IconPaperclip :size="13" />
            {{ fileName(f) }}
          </a>
          <span v-else class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:text-secondary">
            <IconPaperclip :size="13" />
            {{ fileName(f) }}
          </span>
        </li>
      </ul>
    </div>
  </div>
</template>
