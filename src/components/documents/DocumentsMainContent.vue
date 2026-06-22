<script setup>
import { IconFileText, IconSchool, IconHistory } from '@tabler/icons-vue'

const props = defineProps({
  documentId: {
    type: String,
    required: true,
  },
  versionId: {
    type: String,
    default: null,
  },
  reviewMode: {
    type: Boolean,
    default: false,
  },
})

// Tab is a model so the parent (e.g. the submit-for-review training reminder)
// can jump the author straight to the Training tab.
const activeTab = defineModel('activeTab', { type: String, default: 'content' })

// Change Control only applies to a REVISION — it captures what changed versus
// the prior version. The first draft (v1.0, no earlier version) has nothing to
// compare against, so the tab is hidden until a revision exists.
const versions = useLiveQueryWithDeps(
  [() => props.documentId],
  async (db, [id]) => (id ? db.DocumentVersion.where('documentId', id).exec() : []),
  { models: ['DocumentVersion'], initial: [] },
)
const selectedVersion = useLiveQueryWithDeps(
  [() => props.versionId],
  async (db, [id]) => (id ? db.DocumentVersion.findByPk(id) : null),
  { models: ['DocumentVersion'] },
)
const isRevisionVersion = computed(() => {
  const sel = selectedVersion.value
  if (!sel) return false
  // True when an older version of this document exists (selected is not the first).
  return versions.value.some(
    (v) =>
      v.versionMajor < sel.versionMajor ||
      (v.versionMajor === sel.versionMajor && v.versionMinor < sel.versionMinor),
  )
})

// Training is always reachable so an author can set it up on any version.
// Change Control is revision-only (see above).
const contentTabs = computed(() => [
  { value: 'content', label: 'Content', icon: IconFileText },
  ...(isRevisionVersion.value
    ? [{ value: 'changeControl', label: 'Change Control', icon: IconHistory }]
    : []),
  { value: 'training', label: 'Training', icon: IconSchool },
])

// If the tab gets hidden (e.g. switching to the first version), fall back.
watch(isRevisionVersion, (isRev) => {
  if (!isRev && activeTab.value === 'changeControl') activeTab.value = 'content'
})
</script>

<template>
  <main class="tw:pt-4 tw:pb-8 tw:w-full">
    <BaseTabs v-model="activeTab" :tabs="contentTabs" ariaLabel="Document sections">
      <BaseTabPanel value="content">
        <PrintTeleport>
          <div class="tw:grid tw:grid-cols-1 tw:lg:grid-cols-3 tw:gap-8 tw:py-4 tw:items-start">
            <!-- Left Column: Document Content (2/3 width) -->
            <DocumentsMainContentLeft
              :documentId="documentId"
              :versionId="versionId"
              :reviewMode="reviewMode"
            />

            <!-- Right Column: Sidebar (1/3 width, sticky) -->
            <DocumentsMainContentRight
              :documentId="documentId"
              :versionId="versionId"
              :reviewMode="reviewMode"
            />
          </div>
        </PrintTeleport>
      </BaseTabPanel>
      <BaseTabPanel v-if="isRevisionVersion" value="changeControl">
        <PrintTeleport>
          <DocumentsChangeControlTab :documentId="documentId" :versionId="versionId" />
        </PrintTeleport>
      </BaseTabPanel>
      <BaseTabPanel value="training">
        <PrintTeleport>
          <DocumentsTrainingTab :documentId="documentId" :versionId="versionId" />
        </PrintTeleport>
      </BaseTabPanel>
    </BaseTabs>
  </main>
</template>
