<script setup>
import { IconFileText, IconTrash, IconPlus, IconX } from '@tabler/icons-vue'

const props = defineProps({
  trainingId: { type: String, required: true },
  editable: { type: Boolean, default: false },
})

const toast = useToast()

const documentLinks = useLiveQueryWithDeps(
  [() => props.trainingId],
  async (db, [trainingId]) => db.TrainingDocumentLink.where('trainingId', trainingId).exec(),

  { models: ['TrainingDocumentLink'], initial: [] },
)

const selectedDocumentId = ref(null)
const showPicker = ref(false)
const pickerRef = ref(null)

const addLink = useLiveMutation(async (db, { trainingId, documentId }) => {
  const link = db.TrainingDocumentLink.create({ trainingId, documentId })
  await link.save()
  return link
})

watch(selectedDocumentId, async (documentId) => {
  if (!documentId) return
  const alreadyLinked = documentLinks.value.some((l) => l.documentId === documentId)
  if (!alreadyLinked) {
    try {
      await addLink({ trainingId: props.trainingId, documentId })
    } catch (err) {
      toast.notify({ type: 'negative', message: err?.message || 'Failed to link document' })
    }
  }
  selectedDocumentId.value = null
  showPicker.value = false
})

async function openPicker() {
  showPicker.value = true
  await nextTick()
  pickerRef.value?.open()
}

async function removeLink(link) {
  try {
    await link.delete()
  } catch (err) {
    toast.notify({ type: 'negative', message: err?.message || 'Failed to remove document' })
  }
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-1">
    <!-- Linked documents -->
    <div
      v-for="link in documentLinks"
      :key="link.id"
      class="tw:flex tw:items-center tw:gap-2 tw:px-3 tw:py-2 tw:rounded-lg tw:border tw:border-divider tw:bg-white"
    >
      <IconFileText :size="15" class="tw:text-secondary tw:shrink-0" />
      <DocumentBadgeById :documentId="link.documentId" class="tw:flex-1" />
      <button
        v-if="editable"
        class="tw:text-secondary tw:hover:text-red-500 tw:transition-colors"
        @click="removeLink(link)"
      >
        <IconTrash :size="15" />
      </button>
    </div>

    <p v-if="!documentLinks.length && !editable" class="tw:text-sm tw:text-secondary tw:italic">
      No documents linked.
    </p>

    <!-- Picker row (visible after clicking Add Document) -->
    <div v-if="editable && showPicker" class="tw:flex tw:items-center tw:gap-2 tw:mt-1">
      <DocumentSelectMenu
        ref="pickerRef"
        v-model="selectedDocumentId"
        class="tw:flex-1"
        hideNullOption
      />
      <button
        class="tw:text-secondary tw:hover:text-on-main tw:transition-colors"
        @click="showPicker = false"
      >
        <IconX :size="16" />
      </button>
    </div>

    <!-- Add button (shown when picker is hidden) -->
    <button
      v-else-if="editable"
      class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-primary tw:hover:underline tw:mt-1 tw:w-fit"
      @click="openPicker"
    >
      <IconPlus :size="14" /> Add Document
    </button>
  </div>
</template>
