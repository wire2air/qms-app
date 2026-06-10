<script setup>
/**
 * AI sidecar — writing assist. Drops into BaseRichTextEditor's #toolbar-extra
 * slot (which exposes the tiptap `editor`). Offers a small menu: fix grammar,
 * improve clarity, make formal, make concise, or a custom instruction.
 *
 * Safety: it operates on the user's SELECTION (replacing only that range) so it
 * never clobbers the rest of a formatted document or embedded images. If there
 * is no selection it falls back to the whole field, but either way the result
 * is shown in a preview the user edits + Applies — never a silent overwrite.
 *
 * Gate with `canUseAi` at the call site so non-AI tenants never see it.
 */
import { IconSparkles, IconLoader2, IconChevronDown } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'

const props = defineProps({
  // The tiptap editor instance from the slot (`:editor="editor"`).
  editor: { type: Object, required: true },
})

const toast = useToast()

const OPS = [
  { id: 'grammar', label: 'Fix grammar & spelling' },
  { id: 'clarity', label: 'Improve clarity' },
  { id: 'formal', label: 'Make more formal' },
  { id: 'concise', label: 'Make concise' },
  { id: 'custom', label: 'Custom instruction…' },
]
const OP_LABEL = Object.fromEntries(OPS.map((o) => [o.id, o.label]))

const menuRef = ref(null)
const showMenu = ref(false)
onClickOutside(menuRef, () => (showMenu.value = false))

const showDialog = ref(false)
const op = ref(null)
const instruction = ref('')
const loading = ref(false)
const result = ref('')
const sourceText = ref('')
const mode = ref('selection') // 'selection' | 'all'
let range = null

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function toInline(s) {
  return esc(s).replace(/\n/g, '<br>')
}
function toBlocks(s) {
  return String(s)
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

function captureSelection() {
  const ed = props.editor
  const sel = ed.state.selection
  if (!sel.empty) {
    range = { from: sel.from, to: sel.to }
    sourceText.value = ed.state.doc.textBetween(sel.from, sel.to, '\n')
    mode.value = 'selection'
  } else {
    range = null
    sourceText.value = ed.getText()
    mode.value = 'all'
  }
}

function pickOp(id) {
  showMenu.value = false
  captureSelection()
  if (!sourceText.value.trim()) {
    toast.info('Select some text to improve (or type something in the field first).')
    return
  }
  op.value = id
  instruction.value = ''
  result.value = ''
  showDialog.value = true
  if (id !== 'custom') run()
}

async function run() {
  if (op.value === 'custom' && !instruction.value.trim()) return
  loading.value = true
  try {
    const data = await post('/v1/services/ai/text/assist', {
      text: sourceText.value,
      operation: op.value,
      instruction: op.value === 'custom' ? instruction.value.trim() : undefined,
    })
    result.value = data?.result ?? ''
    if (!result.value) toast.info('No suggestion returned.')
  } catch (e) {
    toast.error(e?.message || 'AI assist failed.')
  } finally {
    loading.value = false
  }
}

function apply() {
  if (!result.value) return
  const ed = props.editor
  if (mode.value === 'selection' && range) {
    ed.chain().focus().insertContentAt(range, toInline(result.value)).run()
  } else {
    ed.chain().focus().setContent(toBlocks(result.value)).run()
  }
  showDialog.value = false
}
</script>

<template>
  <div ref="menuRef" class="tw:relative tw:inline-flex">
    <button
      type="button"
      title="AI writing assist"
      class="tw:min-w-8 tw:min-h-8 tw:rounded tw:flex tw:items-center tw:gap-0.5 tw:justify-center tw:border-0 tw:cursor-pointer tw:p-1 tw:text-purple-600 tw:bg-transparent tw:hover:bg-purple-50"
      @click="showMenu = !showMenu"
    >
      <IconSparkles :size="18" />
      <IconChevronDown :size="12" />
    </button>

    <div
      v-if="showMenu"
      class="tw:absolute tw:right-0 tw:top-full tw:mt-1 tw:z-30 tw:w-52 tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:shadow-lg tw:py-1"
    >
      <button
        v-for="o in OPS"
        :key="o.id"
        type="button"
        class="tw:w-full tw:text-left tw:text-sm tw:px-3 tw:py-1.5 tw:bg-transparent tw:border-0 tw:cursor-pointer tw:text-on-main tw:hover:bg-main-hover"
        @click="pickOp(o.id)"
      >
        {{ o.label }}
      </button>
    </div>

    <BaseDialog v-model="showDialog" :title="`AI assist — ${OP_LABEL[op] || ''}`" maxWidth="lg">
      <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
        <p class="tw:text-[11px] tw:text-secondary">
          {{ mode === 'selection' ? 'Working on your selected text.' : 'No selection — working on the whole field.' }}
        </p>

        <div v-if="op === 'custom'">
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Instruction</p>
          <BaseTextInput
            v-model="instruction"
            placeholder="e.g. rephrase as a formal nonconformity statement"
            @keyup.enter="run"
          />
        </div>

        <div v-if="loading" class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-secondary tw:py-4">
          <IconLoader2 :size="18" class="tw:animate-spin" /> Rewriting…
        </div>

        <div v-else-if="result">
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Result (edit before applying)</p>
          <!-- autosize + maxRows so the box grows with the text and then
               scrolls — a plain rows= textarea clips (overflow hidden). -->
          <BaseTextarea v-model="result" autosize :rows="6" :maxRows="14" />
        </div>
      </div>

      <template #footer>
        <BaseButton variant="outline" :disabled="loading" @click="showDialog = false">Cancel</BaseButton>
        <BaseButton
          v-if="op === 'custom' || result"
          variant="secondary"
          :loading="loading"
          :disabled="loading || (op === 'custom' && !instruction.trim())"
          @click="run"
        >
          {{ result ? 'Regenerate' : 'Run' }}
        </BaseButton>
        <BaseButton variant="primary" :disabled="!result || loading" @click="apply">Apply</BaseButton>
      </template>
    </BaseDialog>
  </div>
</template>
