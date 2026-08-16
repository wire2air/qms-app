<script setup>
import {
  IconLayoutList,
  IconArrowUp,
  IconArrowDown,
  IconTrash,
  IconPlus,
  IconGripVertical,
} from '@tabler/icons-vue'
import { useSortable, moveArrayElement } from '@vueuse/integrations/useSortable'
import { canUseAi } from '@/utils/currentSession.js'
import { renumber } from './sectionOrder.js'

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

function addSection() {
  const order = (sections.value?.length || 0) + 1
  sections.value = [
    ...(sections.value || []),
    {
      id: crypto.randomUUID(),
      order,
      title: '',
      sectionType: 'text',
      content: '',
      // Author-facing guidance carried from the template onto every document
      // made from it. Rich text so it can link to other documents.
      instructions: '',
      isAddOn: true,
    },
  ]
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

// Drag-to-reorder (user request 2026-08-15), alongside the arrows rather than
// replacing them: the arrows stay reachable by keyboard, which a drag is not.
// The handle only renders in edit mode, so a missing handle is what disables
// dragging in read-only mode.
const listRef = ref(null)
useSortable(listRef, sections, {
  handle: '.section-drag-handle',
  animation: 150,
  ghostClass: 'tw:opacity-40',
  onUpdate(e) {
    // moveArrayElement resets the DOM SortableJS just mutated and updates the
    // array on the NEXT tick — so renumber after it lands, not before, or the
    // orders are written against the pre-move positions.
    moveArrayElement(sections, e.oldIndex, e.newIndex, e)
    nextTick(() => {
      sections.value = renumber(sections.value)
    })
  },
})
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
      <div v-if="sections?.length" ref="listRef" class="tw:space-y-3">
        <div
          v-for="(section, sectionIndex) in sections"
          :key="section.id"
          class="tw:flex tw:items-start tw:gap-4 tw:p-4 tw:bg-main-hover tw:rounded-lg"
        >
          <!-- Grip + order badge. The badge shows `order`, which every
               reorder path rewrites — see renumber(). -->
          <div class="tw:flex tw:items-center tw:gap-1 tw:shrink-0 tw:mt-1">
            <span
              v-if="!isReadonly(section)"
              class="section-drag-handle tw:cursor-grab tw:active:cursor-grabbing tw:text-secondary tw:hover:text-primary tw:transition-colors"
              :aria-label="`Drag to reorder section ${section.order}`"
            >
              <IconGripVertical :size="16" />
            </span>
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
              <!-- 'textAttachment' renders BOTH — one section that carries a
                   written body and its supporting files, rather than forcing
                   the author to split them across two sections. -->
              <div
                v-if="section.sectionType === 'text' || section.sectionType === 'textAttachment'"
              >
                <BaseRichTextEditor v-model="section.content" :sectionNumber="sectionIndex + 1">
                  <template #toolbar-extra="{ editor }">
                    <AiTextAssistButton v-if="canUseAi && editor" :editor="editor" />
                  </template>
                </BaseRichTextEditor>
              </div>
              <div
                v-if="
                  section.sectionType === 'attachment' || section.sectionType === 'textAttachment'
                "
              >
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
