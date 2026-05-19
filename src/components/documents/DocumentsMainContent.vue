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

// Tabs are always shown — Change Control captures audit data on every
// revision (we may not require training), and Training is opt-in but the
// tab is always reachable so an author can set it up on any version even
// if v1.0 had no training. The hasTraining gate was removed because it
// hid the tab on plain documents, blocking authors from adding training
// later.
const activeTab = ref('content')
</script>

<template>
  <main class="tw:max-w-360 tw:mx-auto tw:px-6 tw:pt-4 tw:pb-8 tw:w-full">
    <!-- Tab toggle — always visible. -->
    <div class="tw:flex tw:gap-1 tw:border-b tw:border-divider tw:mb-2">
      <button
        class="tw:px-4 tw:py-2 tw:text-sm tw:font-medium tw:flex tw:items-center tw:gap-1.5 tw:border-b-2 tw:-mb-px tw:transition-colors"
        :class="
          activeTab === 'content'
            ? 'tw:border-primary tw:text-primary'
            : 'tw:border-transparent tw:text-secondary tw:hover:text-on-sidebar'
        "
        @click="activeTab = 'content'"
      >
        <IconFileText :size="16" /> Content
      </button>
      <button
        class="tw:px-4 tw:py-2 tw:text-sm tw:font-medium tw:flex tw:items-center tw:gap-1.5 tw:border-b-2 tw:-mb-px tw:transition-colors"
        :class="
          activeTab === 'changeControl'
            ? 'tw:border-primary tw:text-primary'
            : 'tw:border-transparent tw:text-secondary tw:hover:text-on-sidebar'
        "
        @click="activeTab = 'changeControl'"
      >
        <IconHistory :size="16" /> Change Control
      </button>
      <button
        class="tw:px-4 tw:py-2 tw:text-sm tw:font-medium tw:flex tw:items-center tw:gap-1.5 tw:border-b-2 tw:-mb-px tw:transition-colors"
        :class="
          activeTab === 'training'
            ? 'tw:border-primary tw:text-primary'
            : 'tw:border-transparent tw:text-secondary tw:hover:text-on-sidebar'
        "
        @click="activeTab = 'training'"
      >
        <IconSchool :size="16" /> Training
      </button>
    </div>

    <PrintTeleport>
      <div
        v-if="activeTab === 'content'"
        class="tw:grid tw:grid-cols-1 tw:lg:grid-cols-3 tw:gap-8 tw:py-4"
      >
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
      <DocumentsChangeControlTab
        v-else-if="activeTab === 'changeControl'"
        :documentId="documentId"
        :versionId="versionId"
      />
      <DocumentsTrainingTab
        v-else-if="activeTab === 'training'"
        :documentId="documentId"
        :versionId="versionId"
      />
    </PrintTeleport>
  </main>
</template>
