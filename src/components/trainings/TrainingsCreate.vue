<script setup>
import { IconBook } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { required } from '@shared/components/form/validators.js'
import { useUnsavedChangesGuard } from '@shared/composables/useUnsavedChangesGuard.js'

const router = useRouter()
const toast = useToast()
const saving = ref(false)
// Server-side save failure — surfaced persistently in the form footer.
const submitError = ref('')

const title = ref('')
const description = ref('')

// Admin-defined custom fields — held locally, persisted after the training exists.
const customFieldsData = ref({})
const customFieldsRef = ref(null)

// Unsaved-changes marker for the footer + BaseForm's beforeunload guard.
const isDirty = ref(false)
watch([title, description, customFieldsData], () => (isDirty.value = true), { deep: true })

// Confirm before abandoning a half-filled training via in-app navigation
// (Cancel, back, sidebar). allowLeave() is called before the post-save
// redirect so a successful create doesn't prompt. BaseForm covers the
// browser-level exit.
const { allowLeave } = useUnsavedChangesGuard(isDirty)

const createTraining = useLiveMutation(async (db, payload) => {
  const training = db.Training.create(payload)
  await training.save()
  return training
})

function goBack() {
  router.push(getCompanyPath('/trainings'))
}

// Fires only after BaseForm's per-field rules pass.
async function onSubmit() {
  if ((await customFieldsRef.value?.validate()) === false) return
  saving.value = true
  submitError.value = ''
  try {
    const training = await createTraining({
      title: title.value.trim(),
      description: description.value.trim() || null,
    })
    if (!training?.id) throw new Error('Failed to create training')
    // Persist custom fields against the new training (best-effort).
    try {
      await customFieldsRef.value?.persist(training.id)
    } catch (cfErr) {
      toast.notify({
        type: 'warning',
        message:
          cfErr?.message ||
          'Training created, but custom fields could not be saved — add them on the training page',
      })
    }
    allowLeave() // saved — don't prompt on the redirect
    router.push(getCompanyPath(`/trainings/${training.id}`))
  } catch (err) {
    submitError.value = err.message || 'Failed to create training'
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
    </PageHeader>

    <div class="tw:overflow-y-auto tw:flex-1 tw:min-h-0">
      <BaseForm
        class="tw:py-6"
        :dirty="isDirty"
        :loading="saving"
        :submitError="submitError"
        submitLabel="Create Training"
        @submit="onSubmit"
        @cancel="goBack"
      >
        <FormSection id="training-details" title="Training details" :icon="IconBook">
          <div class="tw:flex tw:flex-col tw:gap-3">
            <BaseField
              id="training-title"
              label="Title"
              required
              :value="title"
              :rules="[required()]"
            >
              <template #default="field">
                <BaseTextInput
                  v-bind="field"
                  v-model="title"
                  placeholder="e.g. Fire Safety Procedures"
                />
              </template>
            </BaseField>
            <BaseField label="Description">
              <BaseTextarea
                v-model="description"
                placeholder="Brief overview of what this training covers…"
                :rows="3"
              />
            </BaseField>
          </div>
        </FormSection>

        <!-- Admin-defined custom fields. Self-hides when none configured. -->
        <CustomFieldsCreateSection
          ref="customFieldsRef"
          v-model="customFieldsData"
          entityType="Training"
        />

        <div
          class="tw:bg-blue-50 tw:border tw:border-blue-100 tw:rounded-lg tw:p-4 tw:text-sm tw:text-blue-700"
        >
          <p class="tw:font-medium tw:mb-1">What you can configure on the next page:</p>
          <ul class="tw:list-disc tw:list-inside tw:text-blue-600 tw:space-y-0.5">
            <li>Instructions and linked documents</li>
            <li>Assessment questions (single / multiple choice)</li>
            <li>Role and user assignments</li>
            <li>Passing score and completion deadline</li>
          </ul>
        </div>
      </BaseForm>
    </div>
  </BasePage>
</template>
