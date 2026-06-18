<script setup>
import { IconFileText, IconSchool, IconHistory } from '@tabler/icons-vue'

defineProps({
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

const contentTabs = [
  { value: 'content', label: 'Content', icon: IconFileText },
  { value: 'changeControl', label: 'Change Control', icon: IconHistory },
  { value: 'training', label: 'Training', icon: IconSchool },
]

// Tabs are always shown — Change Control captures audit data on every
// revision (we may not require training), and Training is opt-in but the
// tab is always reachable so an author can set it up on any version even
// if v1.0 had no training. The hasTraining gate was removed because it
// hid the tab on plain documents, blocking authors from adding training
// later.
const activeTab = ref('content')
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
      <BaseTabPanel value="changeControl">
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
