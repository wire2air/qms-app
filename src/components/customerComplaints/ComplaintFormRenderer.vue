<script setup>
import { IconSend } from '@tabler/icons-vue'
import DynamicForm from '@/components/form/DynamicForm.js'

/**
 * Schema-driven complaint form renderer — THE single renderer for:
 *   - the public customer page (/support/<slug>)
 *   - the admin Preview (Form Builder → "see it as the customer will")
 *   - (readonly) re-rendering old tickets from their stored snapshot
 *
 * It renders purely from a `definition` object (the same canonical
 * shape stored in ticket.form_snapshot):
 *   { formName|name, companyName?, branding, systemFields, schema }
 * No network calls — the caller supplies the definition and handles
 * submission.
 */
const props = defineProps({
  definition: { type: Object, required: true },
  // Preview mode: banner shown, submit emits nothing.
  preview: { type: Boolean, default: false },
  submitting: { type: Boolean, default: false },
  submitError: { type: String, default: null },
})

const emit = defineEmits(['submit'])

// ─── System fields ────────────────────────────────────────────────────────────
const SYSTEM_FIELD_ORDER = [
  { key: 'name', label: 'Your name', type: 'input' },
  { key: 'email', label: 'Email address', type: 'email' },
  { key: 'phone', label: 'Phone', type: 'input' },
  { key: 'company', label: 'Company', type: 'input' },
  { key: 'subject', label: 'Subject', type: 'input' },
  { key: 'description', label: 'Description', type: 'textarea' },
]

const values = ref({ name: '', email: '', phone: '', company: '', subject: '', description: '' })
const fieldErrors = ref({})

const visibleSystemFields = computed(() =>
  SYSTEM_FIELD_ORDER.filter((f) => props.definition?.systemFields?.[f.key]?.visible),
)

function isRequired(key) {
  return !!props.definition?.systemFields?.[key]?.required
}

function validateSystemFields() {
  const errors = {}
  for (const field of visibleSystemFields.value) {
    if (isRequired(field.key) && !values.value[field.key]?.trim()) {
      errors[field.key] = `${field.label} is required`
    }
  }
  if (values.value.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.value.email.trim())) {
    errors.email = 'Enter a valid email address'
  }
  fieldErrors.value = errors
  return Object.keys(errors).length === 0
}

// ─── Dynamic fields (attached schema) ────────────────────────────────────────
const customValues = ref({})
const dynamicFormRef = ref(null)

// ─── Submit ───────────────────────────────────────────────────────────────────
function handleSubmitClick() {
  if (!validateSystemFields()) return
  if (props.definition.schema && dynamicFormRef.value) {
    // DynamicForm validates the custom fields and emits @submit when valid.
    dynamicFormRef.value.submit()
  } else {
    emitSubmit()
  }
}

function onDynamicFormValid(_values, done) {
  emitSubmit()
  done?.()
}

function emitSubmit() {
  if (props.preview) return
  emit('submit', {
    systemValues: { ...values.value },
    customValues: props.definition.schema ? { ...customValues.value } : null,
  })
}

const headerTitle = computed(
  () =>
    props.definition?.branding?.headerTitle ||
    props.definition?.formName ||
    props.definition?.name ||
    'Contact Support',
)

// Branding look & feel — colors / font / logo from the definition.
const headerStyle = computed(() => ({
  backgroundColor: props.definition?.branding?.primaryColor || '#1d4ed8',
}))
const containerStyle = computed(() => ({
  fontFamily: props.definition?.branding?.font || undefined,
}))
const logoUrl = computed(() => props.definition?.branding?.logoUrl || null)
</script>

<template>
  <div
    class="tw:bg-white tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden"
    :style="containerStyle"
  >
    <div
      v-if="preview"
      class="tw:bg-amber-50 tw:border-b tw:border-amber-200 tw:text-amber-800 tw:text-xs tw:font-semibold tw:text-center tw:py-1.5"
    >
      Preview — this is exactly what your customer will see. Submissions are disabled.
    </div>

    <!-- Branded header -->
    <div class="tw:px-8 tw:py-6" :style="headerStyle">
      <img
        v-if="logoUrl"
        :src="logoUrl"
        alt=""
        class="tw:h-10 tw:mb-3 tw:object-contain tw:object-left"
      />
      <h1 class="tw:text-xl tw:font-bold tw:text-white">{{ headerTitle }}</h1>
      <p v-if="definition.companyName" class="tw:text-white/80 tw:text-sm tw:mt-0.5">
        {{ definition.companyName }}
      </p>
    </div>

    <div class="tw:p-8 tw:flex tw:flex-col tw:gap-4">
      <p v-if="definition.branding?.introText" class="tw:text-sm tw:text-secondary">
        {{ definition.branding.introText }}
      </p>

      <!-- System fields -->
      <div
        v-for="field in visibleSystemFields"
        :key="field.key"
        class="tw:flex tw:flex-col tw:gap-1"
      >
        <label class="tw:text-sm tw:font-medium tw:text-secondary">
          {{ field.label }}
          <span v-if="isRequired(field.key)" class="tw:text-red-500">*</span>
        </label>
        <BaseTextarea
          v-if="field.type === 'textarea'"
          v-model="values[field.key]"
          :rows="5"
          placeholder="Describe your issue in as much detail as possible…"
        />
        <BaseTextInput
          v-else
          v-model="values[field.key]"
          :type="field.type === 'email' ? 'email' : 'text'"
        />
        <p v-if="fieldErrors[field.key]" class="tw:text-xs tw:text-red-600">
          {{ fieldErrors[field.key] }}
        </p>
      </div>

      <!-- Custom fields (attached dynamic form schema) -->
      <div v-if="definition.schema" class="tw:border-t tw:border-divider tw:pt-4">
        <DynamicForm
          ref="dynamicFormRef"
          v-model="customValues"
          :fields="definition.schema"
          @submit="onDynamicFormValid"
        >
          <template #footer><span /></template>
        </DynamicForm>
      </div>

      <div
        v-if="submitError"
        class="tw:bg-red-50 tw:border tw:border-red-200 tw:text-red-700 tw:rounded-md tw:p-3 tw:text-sm"
      >
        {{ submitError }}
      </div>

      <div class="tw:flex tw:justify-end tw:pt-2">
        <BaseButton variant="primary" :disabled="submitting" @click="handleSubmitClick">
          <IconSend :size="16" class="tw:mr-1" />
          {{ submitting ? 'Submitting…' : 'Submit Complaint' }}
        </BaseButton>
      </div>

      <p
        v-if="definition.branding?.footerText"
        class="tw:text-xs tw:text-secondary tw:text-center tw:pt-2 tw:border-t tw:border-divider"
      >
        {{ definition.branding.footerText }}
      </p>
    </div>
  </div>
</template>
