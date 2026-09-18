<script setup>
const props = defineProps({
  selectedTemplate: {
    type: Object,
    default: null,
  },
  // True once a PDF import has supplied the sections. The template then stops
  // being the source of structure for this document — it still supplies the
  // approval flow (user decision 2026-08-16). Without this, choosing a template
  // after importing re-seeded the sections and discarded the import.
  preserveSections: {
    type: Boolean,
    default: false,
  },
})

const form = defineModel('form', {
  type: Object,
  required: true,
})

// Sections inherited from a template are read-only in the create form.
function isReadonly(section) {
  return section?.isAddOn === false
}

// Watch for template changes and copy sections
watch(
  () => props.selectedTemplate,
  (template) => {
    if (props.preserveSections) return
    if (template) {
      form.value.sections = template.sections.map((section) => ({
        ...section,
        isAddOn: false,
        id: crypto.randomUUID(),
      }))
    } else {
      form.value.sections = []
    }
  },
)
</script>

<template>
  <div class="tw:space-y-6">
    <!-- Section Builder -->
    <DocumentSectionsEditor v-model="form.sections" :readonly="isReadonly" />
  </div>
</template>
