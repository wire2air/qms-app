<script setup>
import DynamicForm from '@/components/form/DynamicForm.js'
import {
  IconArrowLeft,
  IconX,
  IconSearch,
  IconChevronRight,
  IconCircleCheck,
  IconFileText,
  IconShieldLock,
} from '@tabler/icons-vue'
import { post } from '@/api'

const props = defineProps({
  /**
   * Restrict the template-picker list:
   *   - 'all'        — every active template (default)
   *   - 'inspections' — only OPERATIONAL_LOG + CONTROLLED_RECORD
   *                    (used by /inspections-logs/records entry point)
   *   - 'utility'    — only UTILITY (or unclassified)
   */
  classificationFilter: {
    type: String,
    default: 'all',
    validator: (v) => ['all', 'inspections', 'utility'].includes(v),
  },
})

const emit = defineEmits(['created', 'close'])
const model = defineModel({ type: Boolean, default: false })
const toast = useToast()

// E-sig dialog state for Inspections & Logs submissions. Pending data
// holds the form payload so we can replay it after the user signs.
const showEsignDialog = ref(false)
const pendingEsignPayload = ref(null)

/**
 * Translate the workflowInstanceEsignAuthDialog's `verified` emit shape
 * (which uses `{ method, provider, token }` and sends the password as
 * `token`) into the flat `{ strategy, code, token, password }` esign
 * sub-object that the backend signatureService expects.
 */
function buildEsignFromVerified(v) {
  if (!v) return null
  if (v.method === 'PASSWORD') return { password: v.token }
  if (v.method === 'OAUTH' && v.provider === 'MICROSOFT') {
    return { strategy: 'microsoft', token: v.token }
  }
  if (v.method === 'OAUTH' && v.provider === 'GOOGLE') {
    return { strategy: 'google', code: v.token, token: v.token }
  }
  return v
}

// Dialog state
const step = ref('select') // 'select' | 'form' | 'success'

// Template selection
const templateSearch = ref('')
const selectedTemplate = ref(null)

// Form state
const formData = ref({})
const submitting = ref(false)
const createdRecord = ref(null)

const templates = useLiveQuery(async (db) => db.FormTemplate.where('statusId', 'ACTIVE').exec(), {
  initial: [],
})

function templateMatchesFilter(t) {
  const cls = t.config?.recordClassification
  if (props.classificationFilter === 'inspections') {
    return cls === 'OPERATIONAL_LOG' || cls === 'CONTROLLED_RECORD'
  }
  if (props.classificationFilter === 'utility') {
    return !cls || cls === 'UTILITY'
  }
  return true
}

const filteredTemplates = computed(() => {
  let list = templates.value.filter(templateMatchesFilter)
  if (templateSearch.value) {
    const search = templateSearch.value.toLowerCase()
    list = list.filter(
      (t) => t.title.toLowerCase().includes(search) || t.code.toLowerCase().includes(search),
    )
  }
  return list
})

function selectTemplate(template) {
  selectedTemplate.value = template
  formData.value = {}
  step.value = 'form'
}

const createRecord = useLiveMutation(async (db, { templateId, payload }) => {
  const template = await db.FormTemplate.findByPk(templateId)
  if (!template) throw new Error('Template not found')

  const { documentTypeId, code } = template

  // Get or create counter scoped to this documentTypeId
  const allCounters = await db.RecordCounter.where().exec()
  let counter = allCounters.find((c) => c.documentTypeId === documentTypeId)

  if (!counter) {
    counter = db.RecordCounter.create({ documentTypeId, currentValue: 1 })
  } else {
    counter.currentValue += 1
  }

  const recordNumber = `${code}-${documentTypeId}-${String(counter.currentValue).padStart(4, '0')}`

  const record = db.Record.create({ templateId, documentTypeId, payload, recordNumber })
  await record.save()
  await counter.save()

  return record
})

/**
 * Read the Inspections & Logs classification from the selected
 * template's config (UTILITY / OPERATIONAL_LOG / CONTROLLED_RECORD).
 * Defaults to UTILITY so templates that haven't been classified keep
 * the existing legacy behaviour.
 */
const classification = computed(() => {
  const cls = selectedTemplate.value?.config?.recordClassification
  if (cls === 'OPERATIONAL_LOG' || cls === 'CONTROLLED_RECORD') return cls
  return 'UTILITY'
})

const isInspectionRecord = computed(() => classification.value !== 'UTILITY')

/**
 * Does this template require a signature at submission?
 *  - CONTROLLED_RECORD: always
 *  - OPERATIONAL_LOG: only if config.signature.requiredAtSubmission = true
 *  - UTILITY: never (and we route through the legacy path anyway)
 */
const requiresSignatureAtSubmit = computed(() => {
  if (classification.value === 'CONTROLLED_RECORD') return true
  if (classification.value === 'OPERATIONAL_LOG') {
    return Boolean(selectedTemplate.value?.config?.signature?.requiredAtSubmission)
  }
  return false
})

const editWindow = computed(() => selectedTemplate.value?.config?.editWindow ?? null)

/**
 * INSPECTIONS & LOGS submission path. Calls POST /v1/services/fieldRecords
 * with the proper payload. The backend enforces:
 *   - CONTROLLED_RECORD or opted-in OPERATIONAL_LOG → requires esign
 *   - Edit window computation (TIME_WINDOW / UNTIL_NEXT_ENTRY / UNTIL_REVIEW)
 *   - Snapshot the form schema onto the new field_record row
 *   - Write the INITIAL_SUBMIT revision in the same transaction
 */
async function submitFieldRecord(payload, esign) {
  const body = {
    formTemplateId: selectedTemplate.value.id,
    payload,
    submittedVia: 'MAIN_QMS',
  }
  if (esign) body.esign = esign

  const res = await post('/v1/services/fieldRecords', body)
  return res?.record ?? res
}

async function handleSubmit(data) {
  // UTILITY templates keep the legacy SyncEngine path — they write to
  // the `records` table and have no classification gating.
  if (!isInspectionRecord.value) {
    submitting.value = true
    try {
      const record = await createRecord({
        templateId: selectedTemplate.value.id,
        payload: data,
      })
      createdRecord.value = record
      step.value = 'success'
      emit('created', record)
    } catch (err) {
      toast.error(err.message || 'Failed to create record')
    } finally {
      submitting.value = false
    }
    return
  }

  // Inspections & Logs path. If a signature is required, hold the
  // payload, pop the e-sig dialog, replay after `verified` fires.
  if (requiresSignatureAtSubmit.value) {
    pendingEsignPayload.value = data
    showEsignDialog.value = true
    return
  }

  // OPERATIONAL_LOG without esign requirement → submit straight away.
  submitting.value = true
  try {
    const record = await submitFieldRecord(data, null)
    createdRecord.value = record
    step.value = 'success'
    emit('created', record)
  } catch (err) {
    toast.error(err?.message || 'Failed to submit record')
  } finally {
    submitting.value = false
  }
}

async function onEsignVerified(verified) {
  const esign = buildEsignFromVerified(verified)
  showEsignDialog.value = false
  if (!pendingEsignPayload.value) return
  submitting.value = true
  try {
    const record = await submitFieldRecord(pendingEsignPayload.value, esign)
    createdRecord.value = record
    pendingEsignPayload.value = null
    step.value = 'success'
    emit('created', record)
  } catch (err) {
    toast.error(err?.message || 'Submission failed after signature')
  } finally {
    submitting.value = false
  }
}

function goBackToSelect() {
  step.value = 'select'
  selectedTemplate.value = null
  formData.value = {}
}

function handleClose() {
  model.value = false
  emit('close')
}

const templateSchema = computed(() => {
  if (!selectedTemplate.value?.schema) return []
  return Array.isArray(selectedTemplate.value.schema) ? selectedTemplate.value.schema : []
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enterActiveClass="tw:transition-transform tw:duration-300 tw:ease-out"
      enterFromClass="tw:translate-y-full"
      enterToClass="tw:translate-y-0"
      leaveActiveClass="tw:transition-transform tw:duration-200 tw:ease-in"
      leaveFromClass="tw:translate-y-0"
      leaveToClass="tw:translate-y-full"
    >
      <div v-if="model" class="tw:fixed tw:inset-0 tw:z-50 tw:flex tw:flex-col tw:bg-main">
        <div class="tw:flex tw:flex-col tw:h-full tw:flex-nowrap">
          <!-- Header -->
          <div class="tw:flex tw:items-center tw:border-b tw:border-divider tw:py-3 tw:px-4">
            <div class="tw:flex tw:items-center tw:gap-2">
              <button
                v-if="step === 'form'"
                class="tw:p-1.5 tw:rounded-full tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:bg-main-hover tw:text-secondary tw:transition-colors"
                @click="goBackToSelect"
              >
                <IconArrowLeft :size="20" />
              </button>
              <div class="tw:text-lg tw:font-medium tw:text-on-main">
                <template v-if="step === 'select'">Select a Template</template>
                <template v-else-if="step === 'form'">{{ selectedTemplate?.title }}</template>
                <template v-else>Record Created</template>
              </div>
            </div>
            <div class="tw:flex-1" />
            <button
              class="tw:p-1.5 tw:rounded-full tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:bg-main-hover tw:text-secondary tw:transition-colors"
              @click="handleClose"
            >
              <IconX :size="20" />
            </button>
          </div>

          <!-- Step 1: Template Selection -->
          <div
            v-if="step === 'select'"
            class="tw:flex-1 tw:overflow-auto tw:bg-sidebar tw:relative"
          >
            <div class="tw:max-w-175 tw:mx-auto tw:flex tw:flex-col tw:gap-4 tw:p-4">
              <!-- Search -->
              <div class="tw:relative">
                <IconSearch
                  :size="18"
                  class="tw:absolute tw:left-3 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary tw:pointer-events-none"
                />
                <BaseTextInput
                  v-model="templateSearch"
                  placeholder="Search templates..."
                  class="tw:pl-9"
                />
              </div>

              <!-- Empty -->
              <BaseEmptyState
                v-if="filteredTemplates.length === 0"
                :icon="IconFileText"
                title="No templates found"
                dense
              />

              <!-- Template List -->
              <div v-else class="tw:flex tw:flex-col tw:gap-2">
                <div
                  v-for="template in filteredTemplates"
                  :key="template.id"
                  class="tw:cursor-pointer tw:bg-sidebar tw:border tw:border-divider tw:rounded-lg tw:p-3 tw:transition-all tw:hover:shadow-md tw:hover:border-primary/30"
                  @click="selectTemplate(template)"
                >
                  <div class="tw:flex tw:items-center tw:gap-3">
                    <div class="tw:flex tw:flex-col tw:gap-0.5">
                      <div class="tw:font-bold tw:text-on-sidebar">{{ template.title }}</div>
                      <div class="tw:text-xs tw:text-secondary tw:font-mono tw:uppercase">
                        {{ template.code }}
                      </div>
                    </div>
                    <div class="tw:flex-1" />
                    <IconChevronRight :size="24" class="tw:text-secondary" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Step 2: Form -->
          <div v-else-if="step === 'form'" class="tw:flex-1 tw:p-0 tw:overflow-auto tw:bg-sidebar">
            <div class="tw:p-5 tw:min-h-full">
              <div
                class="tw:bg-main tw:border tw:border-divider tw:rounded-lg tw:mx-auto"
                style="max-width: 800px"
              >
                <!-- Inspections & Logs banner: only shows for non-UTILITY templates -->
                <div
                  v-if="isInspectionRecord"
                  class="tw:px-4 tw:py-2.5 tw:border-b tw:border-divider tw:bg-amber-50 tw:text-amber-900 tw:flex tw:items-start tw:gap-2"
                >
                  <IconShieldLock :size="18" class="tw:mt-0.5 tw:shrink-0" />
                  <div class="tw:text-xs tw:leading-relaxed">
                    <div class="tw:font-bold tw:uppercase tw:tracking-wide">
                      {{ classification.replace('_', ' ') }}
                    </div>
                    <div>
                      This is a regulated record. Once submitted, the record is preserved
                      immutably; edits only allowed during the configured window
                      <span v-if="editWindow?.mode">({{ editWindow.mode }})</span>.
                      <span v-if="requiresSignatureAtSubmit">
                        E-signature required on submit.
                      </span>
                    </div>
                  </div>
                </div>

                <div class="tw:p-4">
                  <DynamicForm
                    v-model="formData"
                    :fields="templateSchema"
                    :loading="submitting"
                    @submit="handleSubmit"
                  >
                    <template #footer>
                      <div class="tw:flex tw:justify-end tw:gap-2 tw:mt-4">
                        <button
                          class="tw:px-4 tw:py-2 tw:text-sm tw:font-medium tw:text-secondary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:text-on-main"
                          @click="goBackToSelect"
                        >
                          Back
                        </button>
                        <button
                          class="tw:px-4 tw:py-2 tw:text-sm tw:font-bold tw:text-white tw:bg-primary tw:rounded-lg tw:cursor-pointer tw:hover:bg-primary/90 tw:transition-colors tw:border-0 tw:disabled:opacity-50"
                          :disabled="submitting"
                          @click="handleSubmit(formData)"
                        >
                          <span
                            v-if="submitting"
                            class="tw:inline-block tw:size-4 tw:animate-spin tw:rounded-full tw:border-2 tw:border-white tw:border-t-transparent tw:mr-2"
                          ></span>
                          {{ requiresSignatureAtSubmit ? 'Sign &amp; Submit' : 'Save Record' }}
                        </button>
                      </div>
                    </template>
                  </DynamicForm>
                </div>
              </div>

              <!-- E-sig prompt — reused from the workflow approver flow.
                   `@verified` fires with { method, provider, token }; we
                   translate to the backend's esign shape in buildEsignFromVerified. -->
              <WorkflowInstanceEsignAuthDialog
                v-model="showEsignDialog"
                @verified="onEsignVerified"
              />
            </div>
          </div>

          <!-- Step 3: Success -->
          <div v-else class="tw:flex-1 tw:flex tw:flex-col tw:items-center tw:justify-center">
            <IconCircleCheck :size="64" class="tw:text-green-500" />
            <div class="tw:text-2xl tw:font-bold tw:mt-4 tw:text-green-600">Record Created!</div>
            <p class="tw:text-secondary tw:mt-2">
              Record number: <strong>{{ createdRecord?.recordNumber }}</strong>
            </p>
            <button
              class="tw:mt-6 tw:px-6 tw:py-2 tw:text-sm tw:font-bold tw:text-white tw:bg-primary tw:rounded-lg tw:cursor-pointer tw:hover:bg-primary/90 tw:transition-colors tw:border-0"
              @click="handleClose"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
