<script setup>
import { IconFileText } from '@tabler/icons-vue'

const props = defineProps({
  document: {
    type: Object,
    required: true,
  },
  version: {
    type: Object,
    required: true,
  },
  dense: {
    type: Boolean,
    default: false,
  },
})

const versionLabel = computed(() => {
  return props.version.versionLabel || `${props.version.versionMajor}.${props.version.versionMinor}`
})

const documentSections = computed(() => props.version.sections || [])
</script>

<template>
  <div class="tw:space-y-6">
    <!-- Document Card -->
    <div
      class="tw:bg-sidebar tw:rounded-xl tw:shadow-sm tw:border tw:border-divider tw:overflow-hidden"
    >
      <!-- Document Header -->
      <div
        class="tw:border-b tw:border-divider tw:bg-main-hover"
        :class="dense ? 'tw:p-4' : 'tw:p-8'"
      >
        <div
          class="tw:flex tw:items-start tw:justify-between"
          :class="dense ? 'tw:mb-2' : 'tw:mb-4'"
        >
          <BaseBadge class="tw:bg-gray-100 tw:text-gray-700">
            {{ version.statusName || version.statusId }}
          </BaseBadge>

          <span class="tw:text-secondary tw:text-sm">
            {{ document.docNumber }} v{{ versionLabel }}
          </span>
        </div>
        <h2
          class="tw:font-bold tw:text-on-sidebar tw:leading-tight"
          :class="dense ? 'tw:text-xl' : 'tw:text-3xl'"
        >
          {{ document.title }}
        </h2>
        <p
          v-if="version.changeSummary"
          class="tw:text-secondary tw:max-w-2xl"
          :class="dense ? 'tw:mt-1 tw:text-xs' : 'tw:mt-2'"
        >
          {{ version.changeSummary }}
        </p>
      </div>

      <!-- Document Body Sections -->
      <div
        class="tw:prose tw:prose-slate tw:dark:prose-invert tw:max-w-none"
        :class="dense ? 'tw:p-4' : 'tw:p-8'"
      >
        <section
          v-for="(section, index) in documentSections"
          :id="section.id"
          :key="section.id"
          class="tw:break-inside-avoid"
          :class="{ 'tw:pt-10': index > 0 && !dense, 'tw:pt-4': index > 0 && dense }"
        >
          <!-- Section Title -->
          <h3
            class="tw:font-bold tw:flex tw:items-center tw:gap-2"
            :class="dense ? 'tw:text-base tw:mb-2' : 'tw:text-xl tw:mb-4'"
          >
            {{ index + 1 }}. {{ section.title }}
          </h3>

          <!-- Section Content -->
          <BaseRichTextEditor
            v-if="section.sectionType === 'text'"
            :key="section.id"
            :modelValue="section.content"
            :editable="false"
            class="tw:border-0! tw:min-h-fit!"
          />

          <BaseUploader
            v-if="section.sectionType === 'attachment'"
            :modelValue="section.attachments"
            :readonly="true"
            hideHeader
            class="tw:border-0 tw:shadow-none! tw:p-0"
          />
        </section>

        <!-- Empty state if no sections -->
        <BaseEmptyState
          v-if="documentSections.length === 0"
          :icon="IconFileText"
          title="No content sections available"
          dense
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.tw\:prose :deep(p) {
  margin-bottom: 1rem;
}

.tw\:prose :deep(ul),
.tw\:prose :deep(ol) {
  margin: 1rem 0;
  padding-left: 1.5rem;
}

.tw\:prose :deep(li) {
  margin-bottom: 0.5rem;
}

.tw\:prose :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
}

.tw\:prose :deep(th),
.tw\:prose :deep(td) {
  padding: 0.75rem 1rem;
  border: 1px solid #e2e8f0;
  text-align: left;
}

.tw\:prose :deep(th) {
  background-color: #f8fafc;
  font-weight: 600;
}

.tw\:prose :deep(blockquote) {
  border-left: 4px solid #136dec;
  padding-left: 1rem;
  margin: 1rem 0;
  font-style: italic;
  background-color: rgba(19, 109, 236, 0.05);
  padding: 1rem;
  border-radius: 0.25rem;
}
</style>
