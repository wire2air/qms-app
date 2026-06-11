<script setup>
import { IconPlus, IconTrash, IconGripVertical } from '@tabler/icons-vue'

const props = defineProps({
  training: { type: Object, required: true },
  editable: { type: Boolean, default: false },
})

const toast = useToast()

// ─── External Links ───────────────────────────────────────────────────────────

const externalLinks = useLiveQueryWithDeps(
  [() => props.training.id],
  async (db, [trainingId]) => {
    if (!trainingId) return []
    return db.TrainingExternalLink.where('trainingId', trainingId).orderBy('displayOrder', 'asc').exec()
  },
  { initial: [] },
)

const createLink = useLiveMutation(async (db, trainingId) => {
  const link = db.TrainingExternalLink.create({
    trainingId,
    title: '',
    url: '',
    type: 'web',
    displayOrder: externalLinks.value.length,
  })
  await link.save()
})

async function handleAddLink() {
  try {
    await createLink(props.training.id)
  } catch (err) {
    toast.notify({ type: 'negative', message: err?.message || 'Failed to add link' })
  }
}

async function saveLink(link) {
  try {
    await link.save()
  } catch (err) {
    toast.notify({ type: 'negative', message: err?.message || 'Failed to save link' })
  }
}

async function handleRemoveLink(link) {
  try {
    await link.delete()
  } catch (err) {
    toast.notify({ type: 'negative', message: err?.message || 'Failed to remove link' })
  }
}

const LINK_TYPES = [
  { id: 'web', name: 'Web' },
  { id: 'youtube', name: 'YouTube' },
]
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-6">
    <!-- Instructions -->
    <div>
      <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-2">Instructions</p>
      <BaseRichTextEditor
        v-model="props.training.instructions"
        :editable="editable"
        placeholder="Describe what the trainee needs to read or do..."
      />
    </div>

    <!-- Document Links -->
    <div>
      <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-2">Linked Documents</p>
      <TrainingDocumentSelector :trainingId="training.id" :editable="editable" />
    </div>

    <!-- External Links -->
    <div>
      <div class="tw:flex tw:items-center tw:justify-between tw:mb-2">
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary">External Links</p>
        <button
          v-if="editable"
          class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-primary tw:hover:underline"
          @click="handleAddLink"
        >
          <IconPlus :size="14" /> Add Link
        </button>
      </div>

      <div v-if="externalLinks.length" class="tw:flex tw:flex-col tw:gap-2">
        <div
          v-for="link in externalLinks"
          :key="link.id"
          class="tw:flex tw:items-center tw:gap-2 tw:p-2 tw:rounded-lg tw:border tw:border-divider tw:bg-white"
        >
          <IconGripVertical v-if="editable" :size="16" class="tw:text-secondary tw:shrink-0" />
          <div v-if="editable" class="tw:flex tw:flex-1 tw:gap-2 tw:flex-wrap">
            <BaseTextInput
              v-model="link.title"
              placeholder="Title"
              class="tw:flex-1 tw:min-w-0"
              @blur="saveLink(link)"
            />
            <BaseTextInput
              v-model="link.url"
              placeholder="URL"
              class="tw:flex-1 tw:min-w-0"
              @blur="saveLink(link)"
            />
            <select
              v-model="link.type"
              class="tw:text-sm tw:border tw:border-divider tw:rounded tw:px-2 tw:py-1"
              @change="saveLink(link)"
            >
              <option v-for="t in LINK_TYPES" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </div>
          <a
            v-else
            :href="link.url"
            target="_blank"
            class="tw:flex-1 tw:text-sm tw:text-primary tw:hover:underline"
          >
            {{ link.title || link.url }}
          </a>
          <button v-if="editable" @click="handleRemoveLink(link)">
            <IconTrash :size="16" class="tw:text-red-400 tw:hover:text-red-600" />
          </button>
        </div>
      </div>
      <p v-else class="tw:text-sm tw:text-secondary tw:italic">No external links.</p>
    </div>
  </div>
</template>
