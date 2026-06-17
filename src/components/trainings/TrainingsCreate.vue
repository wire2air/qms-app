<script setup>
import { IconBook } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const router = useRouter()
const toast = useToast()
const saving = ref(false)

const title = ref('')
const description = ref('')

const createTraining = useLiveMutation(async (db, payload) => {
  const training = db.Training.create(payload)
  await training.save()
  return training
})

async function handleSubmit() {
  if (!title.value.trim()) {
    toast.notify({ type: 'negative', message: 'Title is required' })
    return
  }
  saving.value = true
  try {
    const training = await createTraining({
      title: title.value.trim(),
      description: description.value.trim() || null,
    })
    if (!training?.id) throw new Error('Failed to create training')
    router.push(getCompanyPath(`/trainings/${training.id}`))
  } catch (err) {
    toast.notify({ type: 'negative', message: err.message || 'Failed to create training' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BasePage width="standard" fullHeight>
    <PageHeader>
      <template #title>
        <BaseBreadcrumbs
          :items="[
            { label: 'Training Library', to: getCompanyPath('/trainings') },
            { label: 'New Training' },
          ]"
        />
      </template>
      <template #actions>
        <BaseButton
          variant="secondary"
          :disabled="saving"
          @click="router.push(getCompanyPath('/trainings'))"
          >Cancel</BaseButton
        >
        <BaseButton variant="primary" :loading="saving" @click="handleSubmit"
          >Create Training</BaseButton
        >
      </template>
    </PageHeader>

    <div class="tw:overflow-y-auto tw:flex-1 tw:min-h-0">
      <div class="tw:max-w-xl tw:mx-auto tw:p-6 tw:flex tw:flex-col tw:gap-4">
        <div class="tw:flex tw:items-center tw:gap-3">
          <div class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-blue-50 tw:text-blue-600 tw:flex tw:items-center tw:justify-center tw:shrink-0">
            <IconBook :size="20" />
          </div>
          <div>
            <div class="tw:text-xl tw:font-bold tw:text-on-sidebar">New Training</div>
            <div class="tw:text-sm tw:text-secondary">After creating, add material, assessment questions, and assign roles or users.</div>
          </div>
        </div>

        <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5 tw:flex tw:flex-col tw:gap-4">
          <BaseField v-slot="{ id: fieldId }" label="Title" required>
            <BaseTextInput
              :id="fieldId"
              v-model="title"
              placeholder="e.g. Fire Safety Procedures"
              @keyup.enter="handleSubmit"
            />
          </BaseField>
          <BaseField v-slot="{ id: fieldId }" label="Description">
            <BaseTextarea
              :id="fieldId"
              v-model="description"
              placeholder="Brief overview of what this training covers…"
              :rows="3"
            />
          </BaseField>
        </div>

        <div class="tw:bg-blue-50 tw:border tw:border-blue-100 tw:rounded-lg tw:p-4 tw:text-sm tw:text-blue-700">
          <p class="tw:font-medium tw:mb-1">What you can configure on the next page:</p>
          <ul class="tw:list-disc tw:list-inside tw:text-blue-600 tw:space-y-0.5">
            <li>Instructions and linked documents</li>
            <li>Assessment questions (single / multiple choice)</li>
            <li>Role and user assignments</li>
            <li>Passing score and completion deadline</li>
          </ul>
        </div>
      </div>
    </div>
  </BasePage>
</template>
