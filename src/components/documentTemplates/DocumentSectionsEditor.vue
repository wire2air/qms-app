<script setup>
import { IconLayoutList, IconArrowUp, IconArrowDown, IconTrash, IconPlus } from '@tabler/icons-vue'
import { canUseAi } from '@/utils/currentSession.js'
import { renumber, insertSectionAt } from './sectionOrder.js'

const props = defineProps({
  readonly: { type: [Boolean, Function], default: false },
  // Authoring the TEMPLATE (instructions are editable) vs authoring a DOCUMENT
  // from it (instructions render as read-only guidance above the body). The
  // same editor serves both, so the distinction has to be explicit.
  instructionsEditable: { type: Boolean, default: false },
})

const sections = defineModel({ type: Array, required: true })

function isReadonly(section) {
  return typeof props.readonly === 'function' ? props.readonly(section) : props.readonly
}

const SECTION_TYPE_MAP = {
  text: { label: 'TEXT', class: 'tw:bg-blue-100 tw:text-blue-700' },
  attachment: { label: 'ATTACHMENT', class: 'tw:bg-purple-100 tw:text-purple-700' },
  textAttachment: { label: 'TEXT + ATTACHMENT', class: 'tw:bg-teal-100 tw:text-teal-700' },
  form: { label: 'FORM', class: 'tw:bg-green-100 tw:text-green-700' },
  table: { label: 'TABLE', class: 'tw:bg-orange-100 tw:text-orange-700' },
}

function blankSection() {
  return {
    id: crypto.randomUUID(),
    // Set by insertSectionAt's renumber — never trust this value.
    order: 0,
    title: '',
    sectionType: 'text',
    content: '',
    // Author-facing guidance carried from the template onto every document
    // made from it. Rich text so it can link to other documents.
    instructions: '',
    isAddOn: true,
  }
}

/**
 * Insert a section at a gap in the list (user request 2026-08-16). Replaced
 * drag-and-drop, which was fiddly to land accurately and only ever used to put
 * a NEW section in the middle — two operations for one intent. `index` is the
 * position the new section takes: 0 before the first, length to append.
 */
function addSectionAt(index) {
  sections.value = insertSectionAt(sections.value, index, blankSection())
}

function addSection() {
  addSectionAt(sections.value?.length || 0)
}

function removeSection(sectionId) {
  sections.value = renumber(sections.value.filter((s) => s.id !== sectionId))
}

function moveSectionUp(index) {
  if (index === 0) return
  const arr = [...sections.value]
  ;[arr[index], arr[index - 1]] = [arr[index - 1], arr[index]]
  sections.value = renumber(arr)
}

function moveSectionDown(index) {
  if (index >= sections.value.length - 1) return
  const arr = [...sections.value]
  ;[arr[index], arr[index + 1]] = [arr[index + 1], arr[index]]
  sections.value = renumber(arr)
}

// Reordering is the arrows only. Drag-to-reorder (2026-08-15) was removed on
// 2026-08-16 — it never landed where authors aimed, and the thing they were
// actually reaching for is now the insert affordance above.
//
// The template is a plain v-for again, so nothing here owns a list ref.
</script>

<template>
  <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
    <div
      class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:gap-2"
    >
      <IconLayoutList :size="22" class="tw:text-primary" />
      <h2 class="tw:text-lg tw:font-semibold tw:text-on-sidebar">
        Sections ({{ sections?.length || 0 }})
      </h2>
    </div>
    <div class="tw:p-6">
      <div v-if="sections?.length">
        <template v-for="(section, sectionIndex) in sections" :key="section.id">
          <!-- Insert point. Occupies the gap the old space-y-3 left between
               cards, so revealing it on hover costs no layout shift. -->
          <SectionInsertPoint
            v-if="!isReadonly(null)"
            :position="sectionIndex + 1"
            @insert="addSectionAt(sectionIndex)"
          />
          <div v-else class="tw:h-3" />

          <div class="tw:flex tw:items-start tw:gap-4 tw:p-4 tw:bg-main-hover tw:rounded-lg">
            <!-- Order badge. Shows `order`, which every path that changes the
                 list rewrites — see renumber(). -->
            <div class="tw:flex tw:items-center tw:shrink-0 tw:mt-1">
              <div
                class="tw:flex tw:items-center tw:justify-center tw:w-8 tw:h-8 tw:rounded-full tw:bg-primary/10 tw:text-primary tw:font-bold tw:text-sm"
              >
                {{ section.order }}
              </div>
            </div>

            <!-- Edit mode -->
            <template v-if="!isReadonly(section)">
              <div class="tw:flex-1 tw:flex tw:flex-col tw:gap-2">
                <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-2">
                  <BaseTextInput v-model="section.title" placeholder="Section title" size="sm" />
                  <select
                    v-model="section.sectionType"
                    class="tw:text-sm tw:border tw:border-divider tw:rounded-lg tw:px-3 tw:py-1.5 tw:bg-sidebar tw:text-on-sidebar tw:focus:outline-none tw:focus:ring-2 tw:focus:ring-primary/30"
                  >
                    <option value="text">Text</option>
                    <option value="attachment">Attachment</option>
                    <option value="textAttachment">Text + Attachment</option>
                    <!-- <option value="form">Form</option>
                  <option value="table">Table</option> -->
                  </select>
                </div>
                <!-- 'textAttachment' is ONE control (user request 2026-08-16).
                   RichTextAttachments already combines a body and its files;
                   stacking an editor on an uploader was two widgets for what
                   the author thinks of as one section. separateAttachments
                   keeps content and attachments in their own fields, which is
                   what the rest of the system reads. -->
                <div v-if="section.sectionType === 'textAttachment'">
                  <RichTextAttachments
                    v-model="section.content"
                    v-model:attachments="section.attachments"
                    :separateAttachments="true"
                    :sectionNumber="sectionIndex + 1"
                  >
                    <template #toolbar-extra="{ editor }">
                      <AiTextAssistButton v-if="canUseAi && editor" :editor="editor" />
                    </template>
                  </RichTextAttachments>
                </div>
                <div v-else-if="section.sectionType === 'text'">
                  <BaseRichTextEditor v-model="section.content" :sectionNumber="sectionIndex + 1">
                    <template #toolbar-extra="{ editor }">
                      <AiTextAssistButton v-if="canUseAi && editor" :editor="editor" />
                    </template>
                  </BaseRichTextEditor>
                </div>
                <div v-else-if="section.sectionType === 'attachment'">
                  <BaseUploader v-model="section.attachments" :hideHeader="true" />
                </div>
                <div
                  v-else-if="section.sectionType !== 'text'"
                  class="tw:border tw:border-divider tw:rounded-lg tw:h-16 tw:flex tw:items-center tw:justify-center tw:bg-main-hover"
                >
                  <p class="tw:text-sm tw:text-secondary tw:italic">
                    {{ section.sectionType }} configuration coming soon...
                  </p>
                </div>

                <!-- Instructions LAST (user request 2026-08-16): they are a note
                   about the section, so they belong under it rather than
                   pushing the actual body down the page. One line — the
                   earlier rich-text-plus-attachments version was more
                   apparatus than a hint needs. -->
                <BaseTextInput
                  v-if="instructionsEditable"
                  v-model="section.instructions"
                  size="sm"
                  placeholder="Instructions for the author (optional) — shown on documents using this template"
                />
                <SectionInstructions v-else :instructions="section.instructions" />
              </div>
              <div class="tw:flex tw:items-center tw:gap-1 tw:shrink-0 tw:mt-1">
                <button
                  class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:text-primary tw:hover:bg-primary/10 tw:transition-colors tw:disabled:opacity-30"
                  :disabled="sectionIndex === 0"
                  @click="moveSectionUp(sectionIndex)"
                >
                  <IconArrowUp :size="16" />
                </button>
                <button
                  class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:text-primary tw:hover:bg-primary/10 tw:transition-colors tw:disabled:opacity-30"
                  :disabled="sectionIndex === sections.length - 1"
                  @click="moveSectionDown(sectionIndex)"
                >
                  <IconArrowDown :size="16" />
                </button>
                <button
                  class="tw:p-1.5 tw:rounded tw:text-red-400 tw:hover:text-red-600 tw:hover:bg-red-50 tw:transition-colors"
                  @click="removeSection(section.id)"
                >
                  <IconTrash :size="16" />
                </button>
              </div>
            </template>

            <!-- Read-only mode -->
            <template v-else>
              <div class="tw:flex-1">
                <div class="tw:font-bold tw:text-on-sidebar">{{ section.title }}</div>
                <SectionInstructions :instructions="section.instructions" class="tw:mt-2" />
                <div v-if="section.defaultContent" class="tw:text-xs tw:text-secondary tw:mt-1">
                  {{ section.defaultContent.substring(0, 100)
                  }}{{ section.defaultContent.length > 100 ? '...' : '' }}
                </div>
              </div>
              <span
                class="tw:inline-flex tw:items-center tw:rounded tw:px-3 tw:py-1 tw:text-xs tw:font-medium"
                :class="
                  SECTION_TYPE_MAP[section.sectionType]?.class || 'tw:bg-gray-100 tw:text-gray-600'
                "
              >
                {{
                  (
                    SECTION_TYPE_MAP[section.sectionType]?.label ||
                    section.sectionType ||
                    '—'
                  ).toUpperCase()
                }}
              </span>
            </template>
          </div>
        </template>
      </div>

      <div v-else class="tw:text-center tw:py-8 tw:text-secondary">
        No sections defined for this template.
      </div>

      <button
        v-if="!isReadonly(null)"
        class="tw:mt-4! tw:flex tw:items-center tw:justify-center tw:gap-2 tw:w-full tw:px-4 tw:py-2 tw:rounded-lg tw:border tw:border-dashed tw:border-primary tw:text-primary tw:text-sm tw:font-medium tw:hover:bg-primary/10 tw:transition-colors"
        @click="addSection"
      >
        <IconPlus :size="16" />
        Add Section
      </button>
    </div>
  </div>
</template>
