<script setup>
import { IconMinus, IconPlus, IconX } from '@tabler/icons-vue'
import { required } from '@shared/components/form/validators.js'

const props = defineProps({
  document: {
    type: Object,
    required: true,
  },
  currentVersion: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['updated'])

const open = defineModel({
  type: Boolean,
  default: false,
})

const toast = useToast()

const formRef = ref(null)
const isSubmitting = ref(false)
const saveError = ref(null)

// Form state
const editForm = ref({
  departmentId: null,
  statusId: null,
  effectiveDate: null,
  workflowVersionId: null,
  tags: [],
  relatedStandardId: null,
  periodicReviewMonths: 12,
  autoEffectiveOnApproval: true,
})

const newTag = ref('')

// Load document data when dialog opens
watch(
  open,
  async (val) => {
    if (val) {
      editForm.value = {
        departmentId: props.document.departmentId,
        statusId: props.document.statusId,
        effectiveDate: props.currentVersion?.effectiveDate || null,
        workflowVersionId: props.document.workflowVersionId || null,
        tags: props.document.tags || [],
        relatedStandardId: props.document.relatedStandardId || null,
        periodicReviewMonths: props.document.periodicReviewMonths ?? 12,
        autoEffectiveOnApproval: props.document.autoEffectiveOnApproval ?? true,
      }
      saveError.value = null
    } else {
      newTag.value = ''
      saveError.value = null
    }
  },
  { immediate: true },
)

// Tags management
function addTag() {
  const tag = newTag.value.trim().toUpperCase()
  if (tag && !editForm.value.tags.includes(tag)) {
    editForm.value.tags.push(tag)
    newTag.value = ''
  }
}

function removeTag(index) {
  editForm.value.tags.splice(index, 1)
}

// Submit handler
async function onSubmit() {
  if (isSubmitting.value) return
  isSubmitting.value = true
  saveError.value = null
  try {
    props.document.departmentId = editForm.value.departmentId
    props.document.statusId = editForm.value.statusId
    props.document.workflowVersionId = editForm.value.workflowVersionId
    props.document.relatedStandardId = editForm.value.relatedStandardId
    props.document.periodicReviewMonths = editForm.value.periodicReviewMonths
    props.document.autoEffectiveOnApproval = editForm.value.autoEffectiveOnApproval
    await props.document.save()

    props.currentVersion.effectiveDate = editForm.value.effectiveDate
    await props.currentVersion.save()

    toast.success('Document updated successfully')
    emit('updated')
    open.value = false
  } catch (err) {
    saveError.value = err?.message || 'Failed to save document'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="open" title="Edit Document Properties">
    <BaseForm ref="formRef" hideFooter @submit="onSubmit">
      <div class="tw:space-y-6">
        <!-- Document Details -->
        <section class="tw:space-y-4">
          <BaseText variant="overline">Document Details</BaseText>
          <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-4">
            <!-- Department -->
            <BaseField
              label="Department"
              required
              :value="editForm.departmentId"
              :rules="[required()]"
            >
              <template #default="field">
                <DepartmentSelectMenu
                  v-bind="field"
                  v-model="editForm.departmentId"
                  :required="true"
                />
              </template>
            </BaseField>

            <!-- Effective Date -->
            <BaseField label="Effective Date">
              <BaseDateField v-model="editForm.effectiveDate" mode="date" :required="false" />
            </BaseField>

            <!-- Related Standard -->
            <BaseField label="Related Standard">
              <RelatedStandardSelectMenu v-model="editForm.relatedStandardId" />
            </BaseField>
          </div>

          <!-- Review Settings -->
          <div class="tw:flex tw:flex-col tw:md:flex-row tw:md:items-center tw:gap-6 tw:mt-4">
            <BaseField label="Periodic Review">
              <div class="tw:flex tw:items-center tw:gap-3">
                <div
                  class="tw:flex tw:items-center tw:border tw:border-divider tw:rounded-xl tw:overflow-hidden tw:bg-sidebar-hover"
                >
                  <button
                    class="tw:px-3 tw:py-2 tw:hover:bg-sidebar tw:text-secondary"
                    @click="
                      editForm.periodicReviewMonths = Math.max(1, editForm.periodicReviewMonths - 1)
                    "
                  >
                    <IconMinus :size="18" />
                  </button>
                  <input
                    v-model.number="editForm.periodicReviewMonths"
                    class="tw:w-16 tw:text-center tw:bg-transparent tw:border-none tw:focus:ring-0 tw:text-sm tw:font-bold tw:outline-none"
                    type="number"
                    min="1"
                  />
                  <button
                    class="tw:px-3 tw:py-2 tw:hover:bg-sidebar tw:text-secondary"
                    @click="editForm.periodicReviewMonths++"
                  >
                    <IconPlus :size="18" />
                  </button>
                </div>
                <span class="tw:text-sm tw:font-medium tw:text-secondary">months</span>
              </div>
            </BaseField>
            <div
              class="tw:flex tw:items-center tw:gap-4 tw:py-3 tw:px-5 tw:bg-sidebar-hover tw:rounded-2xl tw:border tw:border-divider/50"
            >
              <div class="tw:space-y-0.5">
                <p class="tw:text-sm tw:font-bold tw:text-on-sidebar">Auto-effective on approval</p>
                <p class="tw:text-xs tw:text-secondary">Skip manual release after final approval</p>
              </div>
              <BaseSwitch v-model="editForm.autoEffectiveOnApproval" />
            </div>
          </div>
        </section>

        <!-- Metadata Tags -->
        <section class="tw:space-y-4">
          <BaseText variant="overline">Metadata Tags</BaseText>
          <div
            class="tw:flex tw:flex-wrap tw:gap-2 tw:p-3 tw:bg-sidebar-hover tw:border tw:border-divider tw:rounded-xl"
          >
            <span
              v-for="(tag, index) in editForm.tags"
              :key="index"
              class="tw:inline-flex tw:items-center tw:gap-1 tw:bg-primary/10 tw:text-primary tw:text-xs tw:font-bold tw:px-3 tw:py-1.5 tw:rounded-full tw:border tw:border-primary/20"
            >
              {{ tag }}
              <button class="tw:hover:text-primary-dark" @click="removeTag(index)">
                <IconX :size="14" />
              </button>
            </span>
            <input
              v-model="newTag"
              class="tw:bg-transparent tw:border-none tw:focus:ring-0 tw:text-sm tw:py-0 tw:h-auto tw:w-32 tw:placeholder:text-secondary tw:outline-none"
              placeholder="Add tag..."
              type="text"
              @keyup.enter="addTag"
            />
          </div>
        </section>

        <!-- Approval Workflow -->
        <section class="tw:space-y-4">
          <BaseText variant="overline">Approval Workflow</BaseText>
          <WorkflowVersionSelect v-model="editForm.workflowVersionId" />
        </section>
      </div>
    </BaseForm>

    <template #footer>
      <BaseDialogFooter
        submitLabel="Save Changes"
        :loading="isSubmitting"
        :error="saveError"
        @cancel="open = false"
        @submit="formRef?.submit()"
      />
    </template>
  </BaseDialog>
</template>
