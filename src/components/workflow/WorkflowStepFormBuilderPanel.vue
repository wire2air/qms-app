<script setup>
import { Portal } from '@headlessui/vue'
import { IconArrowLeft, IconX, IconSearch, IconFileText, IconChevronRight } from '@tabler/icons-vue'
import FormBuilder from '@/components/form-builder/FormBuilder.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  initialSchema: { type: Array, default: () => [] },
  startAtSelect: { type: Boolean, default: false },
  // Title shown inside the FormBuilder canvas — the panel is generic
  // (workflow steps + complaint forms both embed schemas through it).
  builderTitle: { type: String, default: 'Step Form Schema' },
})

const emit = defineEmits(['update:modelValue', 'save'])

const currentStep = ref('build') // 'select' | 'build'
const buildSchema = ref([])

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    if (props.startAtSelect) {
      currentStep.value = 'select'
      buildSchema.value = []
    } else {
      currentStep.value = 'build'
      buildSchema.value = [...(props.initialSchema ?? [])]
    }
  },
)

// Template picker
const templateSearch = ref('')

// Only FORM BLOCKS (reusable fragments) — an embedded step form copies from
// blocks, not from standalone form templates.
const templates = useLiveQuery(
  async (db) =>
    (await db.FormTemplate.where('statusId', 'ACTIVE').exec()).filter(
      // Exclude LOG_FORM blocks — those are exclusive to log books.
      (t) => t.kind === 'BLOCK' && (t.blockCategory ?? 'GENERAL') !== 'LOG_FORM',
    ),
  {
    models: ['FormTemplate'],
    initial: [],
  },
)

const filteredTemplates = computed(() => {
  if (!templateSearch.value) return templates.value
  const q = templateSearch.value.toLowerCase()
  return templates.value.filter(
    (t) => t.title.toLowerCase().includes(q) || t.code.toLowerCase().includes(q),
  )
})

function selectTemplate(template) {
  // True snapshot: deep-clone so builder edits can never mutate the pooled
  // IDB block instance's field objects (a shallow [...schema] shares them).
  buildSchema.value = Array.isArray(template.schema)
    ? JSON.parse(JSON.stringify(template.schema))
    : []
  currentStep.value = 'build'
}

function handleBuilderSave(schema) {
  emit('save', schema)
  emit('update:modelValue', false)
}

function goBack() {
  if (props.startAtSelect && currentStep.value === 'build') {
    currentStep.value = 'select'
    templateSearch.value = ''
  } else {
    emit('update:modelValue', false)
  }
}

function handleClose() {
  emit('update:modelValue', false)
}

const headerTitle = computed(() => {
  if (currentStep.value === 'select') return 'Select a Template'
  return 'Form Builder'
})

// Recreate the Portal on every OPEN so its node is (re)appended as the LAST
// child of the portal root at that moment. Stacking among equal z-modal
// layers is DOM order, and the portal node is otherwise created when this
// COMPONENT mounts — fine when the panel lives inside the launching dialog
// (workflow step config), wrong when it lives at page level (Form Blocks /
// Log Forms design dialog, bug 2026-08-14): the page-mount node predates the
// dialog's, so the builder opened BEHIND it. Key only bumps on open — close
// keeps the same instance so the leave transition still plays.
const portalSession = ref(0)
watch(
  () => props.modelValue,
  (open) => {
    if (open) portalSession.value++
  },
)

const showBackButton = computed(() => {
  // Back from build → select only when we started from template flow
  if (currentStep.value === 'build' && props.startAtSelect) return true
  // On select step, back closes the panel
  if (currentStep.value === 'select') return true
  return false
})
</script>

<template>
  <!-- HeadlessUI Portal (not a bare Teleport): the panel is opened from
       inside BaseDialogs (step configuration, CAPA/CR add-child-step), and a
       plain body teleport lands OUTSIDE the dialog's portal tree — HeadlessUI
       marks it inert and its z-overlay painted below the dialog's z-modal, so
       the builder was unreachable behind the dialog (bug 2026-08-14). Inside
       the HUI portal stack it participates in dialog stacking: appended after
       the launching dialog (above it at equal z-modal), and the FormBuilder's
       own dialogs (Generate with AI, JSON, Clear, Preview) open later still,
       so they stack above this panel. -->
  <Portal :key="portalSession">
    <!-- `appear`: after a key-bump the subtree mounts with modelValue already
         true, so the enter animation must run on initial render. -->
    <Transition
      appear
      enterActiveClass="tw:transition-transform tw:duration-300 tw:ease-out"
      enterFromClass="tw:translate-y-full"
      enterToClass="tw:translate-y-0"
      leaveActiveClass="tw:transition-transform tw:duration-200 tw:ease-in"
      leaveFromClass="tw:translate-y-0"
      leaveToClass="tw:translate-y-full"
    >
      <div v-if="modelValue" class="tw:fixed tw:inset-0 tw:flex tw:flex-col tw:bg-main tw:z-modal">
        <div class="tw:flex tw:flex-col tw:h-full tw:flex-nowrap">
          <!-- Header -->
          <div
            class="tw:flex tw:items-center tw:border-b tw:border-divider tw:py-3 tw:px-4 tw:shrink-0"
          >
            <div class="tw:flex tw:items-center tw:gap-2">
              <button
                v-if="showBackButton"
                class="tw:p-1.5 tw:rounded-full tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:bg-main-hover tw:text-secondary tw:transition-colors"
                @click="goBack"
              >
                <IconArrowLeft :size="20" />
              </button>
              <div class="tw:text-lg tw:font-medium tw:text-on-main">{{ headerTitle }}</div>
            </div>
            <div class="tw:flex-1" />
            <button
              class="tw:p-1.5 tw:rounded-full tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:bg-main-hover tw:text-secondary tw:transition-colors"
              @click="handleClose"
            >
              <IconX :size="20" />
            </button>
          </div>

          <!-- Step: Template Selection -->
          <div v-if="currentStep === 'select'" class="tw:flex-1 tw:overflow-auto tw:bg-sidebar">
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
                title="No active templates found"
                dense
              />

              <!-- Template List -->
              <div v-else class="tw:flex tw:flex-col tw:gap-2">
                <BaseClickableRow
                  v-for="template in filteredTemplates"
                  :key="template.id"
                  :aria-label="`Select template ${template.title}`"
                  class="tw:bg-main tw:border tw:border-divider tw:rounded-lg tw:p-3 tw:transition-all tw:hover:shadow-md tw:hover:border-primary/30"
                  @click="selectTemplate(template)"
                >
                  <div class="tw:flex tw:items-center tw:gap-3">
                    <div class="tw:flex tw:flex-col tw:gap-0.5">
                      <div class="tw:font-bold tw:text-on-main">{{ template.title }}</div>
                      <div class="tw:text-caption tw:text-secondary tw:uppercase tw:tracking-wider">
                        {{ template.code }}
                      </div>
                    </div>
                    <div class="tw:flex-1" />
                    <IconChevronRight :size="20" class="tw:text-secondary" />
                  </div>
                </BaseClickableRow>
              </div>
            </div>
          </div>

          <!-- Step: Form Builder -->
          <div v-else class="tw:flex-1 tw:min-h-0 tw:overflow-hidden">
            <FormBuilder
              :initialSchema="buildSchema"
              :title="builderTitle"
              @save="handleBuilderSave"
            />
          </div>
        </div>
      </div>
    </Transition>
  </Portal>
</template>
