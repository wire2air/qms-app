<script setup>
import {
  IconDownload,
  IconPlus,
  IconChevronRight,
  IconEye,
  IconFolder,
  IconRepeat,
  IconLock,
  IconUserPlus,
  IconClipboardCheck,
  IconAlertTriangle,
  IconSchool,
  IconBuilding,
} from '@tabler/icons-vue'
import DynamicForm from '@/components/form/DynamicForm.js'

defineOptions({
  name: 'FormTemplates',
})

const isSubmitting = ref(false)
const showCreateForm = ref(false)
const isReadonly = ref(false)
const formData = ref({})

// Supported field types
const supportedFieldTypes = [
  'input',
  'textarea',
  'password',
  'number',
  'select',
  'checkbox',
  'radio',
  'optionGroup',
  'checklist',
  'datetime',
  'textEditor',
  'colorPicker',
  'slider',
  'toggle',
  'file',
  'photo',
  'rating',
  'section',
  'repeater',
  'row',
  'column',
  'separator',
]

// Sample form fields demonstrating all field types
const sampleFormFields = ref([
  // Basic Information Section (Collapsible)
  {
    type: 'section',
    name: 'basicInfoSection',
    label: 'Basic Information',
    collapsible: true,
    collapsed: false,
    children: [
      {
        type: 'row',
        class: 'col-12',
        children: [
          {
            type: 'input',
            name: 'firstName',
            label: 'First Name',
            placeholder: 'Enter first name',
            class: 'col-6',
          },
          {
            type: 'input',
            name: 'lastName',
            label: 'Last Name',
            placeholder: 'Enter last name',
            class: 'col-6',
          },
        ],
      },
      {
        type: 'input',
        name: 'email',
        label: 'Email Address',
        placeholder: 'example@company.com',
        hint: 'We will send confirmation here',
        props: { type: 'email' },
      },
      {
        type: 'password',
        name: 'password',
        label: 'Password',
        placeholder: 'Enter password',
        hint: 'Minimum 8 characters',
      },
      {
        type: 'photo',
        name: 'profilePhoto',
        label: 'Profile Photo',
        placeholder: 'Upload or take a photo',
        mode: 'both',
        previewSize: '150px',
        maxFileSize: 5242880,
        facingMode: 'user',
      },
    ],
  },

  // Employment Details Section
  {
    type: 'section',
    name: 'employmentSection',
    label: 'Employment Details',
    collapsible: true,
    children: [
      {
        type: 'select',
        name: 'department',
        label: 'Department',
        placeholder: 'Select department',
        options: [
          { label: 'Engineering', value: 'engineering' },
          { label: 'Marketing', value: 'marketing' },
          { label: 'Sales', value: 'sales' },
          { label: 'HR', value: 'hr' },
          { label: 'Quality', value: 'quality' },
          { label: 'Other', value: 'other' },
        ],
      },
      // Conditional field - only shows when department is 'other'
      {
        type: 'input',
        name: 'otherDepartment',
        label: 'Specify Department',
        placeholder: 'Enter department name',
        condition: (formData) => formData.department === 'other',
      },
      {
        type: 'radio',
        name: 'employmentType',
        label: 'Employment Type',
        options: [
          { label: 'Full-time', value: 'full-time' },
          { label: 'Part-time', value: 'part-time' },
          { label: 'Contract', value: 'contract' },
        ],
      },
      {
        type: 'row',
        class: 'col-12',
        children: [
          {
            type: 'datetime',
            name: 'startDate',
            label: 'Start Date',
            class: 'col-6',
          },
          {
            type: 'number',
            name: 'salary',
            label: 'Expected Salary',
            placeholder: '0',
            min: 0,
            step: 1000,
            class: 'col-6',
          },
        ],
      },
    ],
  },

  // Skills & Experience Section
  {
    type: 'section',
    name: 'skillsSection',
    label: 'Skills & Experience',
    collapsible: true,
    children: [
      {
        type: 'optionGroup',
        name: 'skills',
        label: 'Technical Skills',
        options: [
          { label: 'JavaScript', value: 'javascript' },
          { label: 'Python', value: 'python' },
          { label: 'Vue.js', value: 'vuejs' },
          { label: 'Node.js', value: 'nodejs' },
          { label: 'SQL', value: 'sql' },
        ],
      },
      {
        type: 'slider',
        name: 'experienceYears',
        label: 'Years of Experience',
        min: 0,
        max: 20,
        step: 1,
        labelAlways: true,
        markers: true,
      },
      {
        type: 'rating',
        name: 'selfRating',
        label: 'Self Assessment Rating',
        max: 5,
        size: 'lg',
        color: 'amber',
      },
      {
        type: 'checklist',
        name: 'skillsAssessment',
        label: 'Skills Self-Assessment',
        hint: 'Rate your proficiency level for each skill',
        rows: [
          { value: 'communication', label: 'Communication' },
          { value: 'teamwork', label: 'Teamwork' },
          { value: 'problemSolving', label: 'Problem Solving' },
          { value: 'leadership', label: 'Leadership' },
        ],
        columns: [
          { value: 'beginner', label: 'Beginner', inputType: 'radio' },
          { value: 'intermediate', label: 'Intermediate', inputType: 'checkbox' },
          { value: 'advanced', label: 'Advanced', inputType: 'text' },
          { value: 'expert', label: 'Expert', inputType: 'number' },
        ],
      },
    ],
  },

  // Contact Information - Repeatable
  {
    type: 'repeater',
    name: 'phoneNumbers',
    label: 'Phone Numbers',
    itemLabel: 'Phone',
    minItems: 1,
    maxItems: 3,
    addLabel: 'Add Phone Number',
    template: [
      {
        type: 'row',
        children: [
          {
            hint: '',
            name: 'email_1',
            type: 'input',
            class: 'col-3',
            label: 'Email Address',
            style: '',
            disabled: false,
            readonly: false,
            required: true,
            placeholder: 'example@mail.com',
          },
          {
            hint: '',
            name: 'phone_1',
            type: 'input',
            class: 'col-3',
            label: 'Phone Number',
            style: '',
            disabled: false,
            readonly: false,
            required: true,
            placeholder: '+1 234 567 8900',
          },
          {
            hint: '',
            name: 'address_1',
            type: 'input',
            class: 'col-3',
            label: 'Street Address',
            style: '',
            disabled: false,
            readonly: false,
            required: true,
            placeholder: '123 Main Street',
          },
          {
            hint: '',
            name: 'city_1',
            type: 'input',
            class: 'col-3',
            label: 'City',
            style: '',
            disabled: false,
            readonly: false,
            required: true,
            placeholder: 'New York',
          },
        ],
      },
    ],
  },

  { type: 'separator', props: { class: 'q-my-md' } },

  // Additional Options
  {
    type: 'row',
    class: 'col-12',
    children: [
      {
        type: 'toggle',
        name: 'isRemote',
        label: 'Remote Work Preferred',
        class: 'col-6',
      },
      {
        type: 'toggle',
        name: 'newsletter',
        label: 'Subscribe to Newsletter',
        class: 'col-6',
      },
    ],
  },

  // Resume Upload
  {
    type: 'file',
    name: 'resume',
    label: 'Upload Resume',
    accept: '.pdf,.doc,.docx',
    hint: 'PDF, DOC, or DOCX (max 5MB)',
    maxFileSize: 5242880,
  },

  // Bio with Text Editor
  {
    type: 'textarea',
    name: 'bio',
    label: 'About Yourself',
    placeholder: 'Write a brief bio...',
    hint: 'Tell us about your background and interests',
  },

  // Agreement
  {
    type: 'checkbox',
    name: 'agreeToTerms',
    props: { label: 'I agree to the Terms of Service and Privacy Policy' },
  },
])

// Available form templates
const formTemplates = ref([
  {
    id: 1,
    name: 'Employee Registration',
    description: 'Standard employee onboarding form',
    icon: IconUserPlus,
  },
  {
    id: 2,
    name: 'Audit Checklist',
    description: 'Quality audit assessment form',
    icon: IconClipboardCheck,
  },
  {
    id: 3,
    name: 'Incident Report',
    description: 'Safety and incident reporting',
    icon: IconAlertTriangle,
  },
  {
    id: 4,
    name: 'Training Feedback',
    description: 'Post-training evaluation form',
    icon: IconSchool,
  },
  {
    id: 5,
    name: 'Supplier Assessment',
    description: 'Vendor quality evaluation',
    icon: IconBuilding,
  },
])

function resetForm() {
  formData.value = {}
}

function selectTemplate(template) {
  console.info('Selected template:', template)
  // Load template fields here
}

function handleSubmit(data, done) {
  console.info('Form submitted:', data)

  // Simulate API call
  setTimeout(() => {
    done()
    console.info('Form submission complete')
  }, 2000)
}
</script>

<template>
  <div class="tw:p-5 tw:bg-main tw:min-h-screen">
    <!-- Page Header -->
    <div class="tw:flex tw:items-center tw:justify-between tw:mb-12">
      <div>
        <div class="tw:text-3xl tw:font-bold tw:text-on-main">Form Templates</div>
        <div class="tw:text-sm tw:text-secondary">
          Create and manage dynamic form templates for your organization.
        </div>
      </div>
      <div class="tw:flex tw:items-center tw:gap-3">
        <label
          class="tw:flex tw:items-center tw:gap-2 tw:cursor-pointer tw:text-sm tw:text-secondary"
        >
          <BaseSwitch v-model="isReadonly" />
          Read-only Mode
        </label>
        <button
          class="tw:flex tw:items-center tw:gap-1.5 tw:px-3 tw:py-2 tw:rounded tw:border tw:border-gray-300 tw:text-secondary tw:text-sm tw:font-medium tw:hover:bg-main-hover tw:transition-colors tw:bg-transparent tw:cursor-pointer"
        >
          <IconDownload :size="16" />
          Export
        </button>
        <button
          class="tw:flex tw:items-center tw:gap-1.5 tw:px-3 tw:py-2 tw:rounded tw:bg-primary tw:text-white tw:text-sm tw:font-medium tw:hover:opacity-90 tw:transition-opacity tw:border-0 tw:cursor-pointer"
          @click="showCreateForm = true"
        >
          <IconPlus :size="16" />
          New Template
        </button>
      </div>
    </div>

    <div class="tw:grid tw:grid-cols-12 tw:gap-8">
      <!-- Form Preview Section -->
      <div class="tw:col-span-12 tw:lg:col-span-8">
        <div class="tw:rounded-xl tw:border tw:border-divider">
          <div class="tw:flex tw:items-center tw:p-4 tw:pb-0">
            <div class="tw:text-lg tw:font-medium">Form Preview</div>
            <div class="tw:flex-1"></div>
            <button
              class="tw:px-3 tw:py-1.5 tw:text-primary tw:text-sm tw:font-medium tw:rounded tw:hover:bg-main-hover tw:transition-colors tw:bg-transparent tw:border-0 tw:cursor-pointer"
              @click="resetForm"
            >
              Reset
            </button>
          </div>
          <div class="tw:p-4">
            <DynamicForm
              v-model="formData"
              :fields="sampleFormFields"
              :loading="isSubmitting"
              :readonly="isReadonly"
              @submit="handleSubmit"
            >
              <template #header>
                <div class="tw:text-base tw:font-medium tw:mb-6">Employee Registration Form</div>
              </template>
              <template #footer="{ submit }">
                <div class="tw:flex tw:justify-end tw:mt-8 tw:gap-3">
                  <button
                    class="tw:px-4 tw:py-2 tw:rounded tw:border tw:border-gray-300 tw:text-secondary tw:text-sm tw:font-medium tw:hover:bg-main-hover tw:transition-colors tw:bg-transparent tw:cursor-pointer"
                    @click="resetForm"
                  >
                    Cancel
                  </button>
                  <button
                    class="tw:px-4 tw:py-2 tw:rounded tw:bg-primary tw:text-white tw:text-sm tw:font-medium tw:hover:opacity-90 tw:transition-opacity tw:border-0 tw:cursor-pointer disabled:tw:opacity-50 disabled:tw:cursor-not-allowed"
                    :disabled="isReadonly"
                    @click="submit"
                  >
                    <span v-if="isSubmitting" class="tw:inline-flex tw:items-center tw:gap-2">
                      <span
                        class="tw:size-3.5 tw:animate-spin tw:rounded-full tw:border-2 tw:border-white tw:border-t-transparent tw:inline-block"
                      ></span>
                      Submitting...
                    </span>
                    <span v-else>Submit</span>
                  </button>
                </div>
              </template>
            </DynamicForm>
          </div>
        </div>

        <!-- Form Data Preview -->
        <div class="tw:rounded-xl tw:border tw:border-divider tw:mt-8">
          <div class="tw:flex tw:items-center tw:p-4 tw:pb-0">
            <div class="tw:text-lg tw:font-medium">Form Data (v-model)</div>
            <div class="tw:flex-1"></div>
            <span
              class="tw:text-xs tw:font-medium tw:bg-blue-100 tw:text-blue-700 tw:px-2 tw:py-1 tw:rounded-full"
              >Live Preview</span
            >
          </div>
          <div class="tw:p-4">
            <pre
              class="tw:bg-[#1e293b] tw:text-[#4ade80] tw:p-4 tw:rounded-lg tw:font-mono tw:text-xs tw:overflow-x-auto tw:max-h-100 tw:m-0"
            >
              {{ JSON.stringify(formData, null, 2) }}
            </pre>
          </div>
        </div>
      </div>

      <!-- Form Templates List -->
      <div class="tw:col-span-12 tw:lg:col-span-4">
        <div class="tw:rounded-xl tw:border tw:border-divider">
          <div class="tw:p-4">
            <div class="tw:text-lg tw:font-medium tw:mb-6">Available Templates</div>
            <div class="tw:divide-y tw:divide-divider">
              <button
                v-for="template in formTemplates"
                :key="template.id"
                class="tw:flex tw:items-center tw:gap-3 tw:w-full tw:rounded-lg tw:transition-colors tw:duration-200 tw:hover:bg-main-hover tw:p-4 tw:text-left tw:bg-transparent tw:border-0 tw:cursor-pointer"
                @click="selectTemplate(template)"
              >
                <div
                  class="tw:size-10 tw:bg-primary tw:rounded-full tw:flex tw:items-center tw:justify-center tw:text-white tw:shrink-0"
                >
                  <component :is="template.icon" :size="20" />
                </div>
                <div class="tw:flex-1 tw:min-w-0">
                  <div class="tw:font-medium tw:text-sm tw:text-on-main">{{ template.name }}</div>
                  <div class="tw:text-xs tw:text-secondary tw:truncate">
                    {{ template.description }}
                  </div>
                </div>
                <IconChevronRight :size="18" class="tw:text-secondary tw:shrink-0" />
              </button>
            </div>
          </div>
        </div>

        <!-- Quick Info -->
        <div class="tw:rounded-xl tw:border tw:border-divider tw:mt-8">
          <div class="tw:p-4">
            <div class="tw:text-lg tw:font-medium tw:mb-6">Supported Field Types</div>
            <div class="tw:flex tw:flex-wrap tw:gap-2">
              <span
                v-for="fieldType in supportedFieldTypes"
                :key="fieldType"
                class="tw:text-xs tw:font-medium tw:bg-gray-100 tw:text-gray-700 tw:px-2 tw:py-1 tw:rounded-full"
              >
                {{ fieldType }}
              </span>
            </div>
          </div>
        </div>

        <!-- New Features -->
        <div class="tw:rounded-xl tw:border tw:border-divider tw:mt-8">
          <div class="tw:p-4">
            <div class="tw:text-lg tw:font-medium tw:mb-6">New Features</div>
            <div class="tw:flex tw:flex-col tw:gap-3">
              <div class="tw:flex tw:items-center tw:gap-3">
                <IconEye :size="20" class="tw:text-primary" />
                <span class="tw:text-sm">Conditional Fields</span>
              </div>
              <div class="tw:flex tw:items-center tw:gap-3">
                <IconFolder :size="20" class="tw:text-primary" />
                <span class="tw:text-sm">Collapsible Sections</span>
              </div>
              <div class="tw:flex tw:items-center tw:gap-3">
                <IconRepeat :size="20" class="tw:text-primary" />
                <span class="tw:text-sm">Repeatable Fields</span>
              </div>
              <div class="tw:flex tw:items-center tw:gap-3">
                <IconLock :size="20" class="tw:text-primary" />
                <span class="tw:text-sm">Read-only Mode</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
:deep(.repeater-item) {
  border: 1px solid var(--q-grey-3); // Keeping this for now as it affects DynamicForm internals
  border-radius: 8px;
}

:deep(.section-field) {
  border: 1px solid var(--q-grey-3);
  border-radius: 8px;
  overflow: hidden;
}
</style>
