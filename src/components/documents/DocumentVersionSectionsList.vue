<script setup>
import { IconPlus, IconFileText } from '@tabler/icons-vue'

const props = defineProps({
  documentVersionId: {
    type: String,
    required: true,
  },
  documentId: {
    type: String,
    required: true,
  },
  canEdit: {
    type: Boolean,
    default: false,
  },
  dense: {
    type: Boolean,
    default: false,
  },
  reviewMode: {
    type: Boolean,
    default: false,
  },
})

const sections = useLiveQueryWithDeps(
  [() => props.documentVersionId],
  async (db, [versionId]) => {
    return db.DocumentSection.where('documentVersionId', versionId).orderBy('order', 'asc').exec()
  },

  { models: ['DocumentSection'], initial: [] },
)

// A document built from a template takes its structure from the template:
// the sections ARE the controlled layout, so authors may not bolt extra ones
// on (user decision 2026-10-17). Add-on sections remain for template-less
// documents.
const document = useLiveQueryWithDeps(
  [() => props.documentId],
  async (db, [id]) => (id ? db.Document.findByPk(id) : null),
  { models: ['Document'] },
)
const canAddSection = computed(
  () => props.canEdit && !!document.value && !document.value.documentTemplateId,
)

const showAddSectionDialog = ref(false)
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4">
    <section v-for="(section, index) in sections" :id="section.id" :key="section.id">
      <DocumentVersionSection
        :sectionId="section.id"
        :documentVersionId="documentVersionId"
        :canEdit="canEdit"
        :dense="dense"
        :reviewMode="reviewMode"
        :index="index"
      />
    </section>

    <!-- Empty state -->
    <BaseEmptyState
      v-if="sections.length === 0"
      :icon="IconFileText"
      title="No content sections available"
      dense
    />

    <!-- Add Section Button — template-less documents only (see canAddSection). -->
    <div v-if="canAddSection" class="tw:border-t tw:border-divider tw:print:hidden">
      <BaseButton variant="outline" class="tw:w-full" @click="showAddSectionDialog = true">
        <template #icon>
          <IconPlus :size="20" />
        </template>
        Add Section
      </BaseButton>
    </div>

    <DocumentsAddSectionDialog
      v-if="canAddSection"
      v-model="showAddSectionDialog"
      :documentVersionId="documentVersionId"
      :documentId="documentId"
      :currentSectionCount="sections.length"
    />
  </div>
</template>
