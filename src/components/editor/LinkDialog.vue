<script setup>
import { IconLink, IconLetterT, IconLinkOff, IconCheck } from '@tabler/icons-vue'
import { required } from '@shared/components/form/validators.js'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  initialUrl: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['update:modelValue', 'submit', 'remove'])

const show = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const formRef = ref(null)

const linkUrl = ref('')
const linkText = ref('')

watch(
  () => props.modelValue,
  (newValue) => {
    if (newValue) {
      linkUrl.value = props.initialUrl || ''
      linkText.value = ''
    }
  },
)

function handleSubmit() {
  // Basic URL validation and formatting
  let url = linkUrl.value.trim()
  if (url && !url.match(/^https?:\/\//)) {
    url = 'https://' + url
  }

  emit('submit', { url, text: linkText.value.trim() })
  show.value = false
}

function handleRemove() {
  emit('remove')
  show.value = false
}
</script>

<template>
  <BaseDialog
    v-model="show"
    :title="initialUrl ? 'Edit Link' : 'Insert Link'"
    @close="show = false"
  >
    <BaseForm ref="formRef" hideFooter @submit="handleSubmit">
      <div class="tw:flex tw:flex-col tw:gap-4 tw:p-4">
        <BaseField
          label="URL"
          required
          :value="linkUrl"
          :rules="[required(), (v) => !v || v.includes('.') || 'Please enter a valid URL']"
        >
          <template #default="field">
            <div class="tw:relative">
              <IconLink
                :size="18"
                class="tw:absolute tw:left-3 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary tw:pointer-events-none"
              />
              <BaseTextInput
                v-bind="field"
                v-model="linkUrl"
                placeholder="https://example.com"
                autofocus
                class="tw:pl-9"
              />
            </div>
          </template>
        </BaseField>

        <BaseField label="Link Text (optional)" :value="linkText">
          <template #default="field">
            <div class="tw:relative">
              <IconLetterT
                :size="18"
                class="tw:absolute tw:left-3 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary tw:pointer-events-none"
              />
              <BaseTextInput
                v-bind="field"
                v-model="linkText"
                placeholder="Leave empty to use selection"
                class="tw:pl-9"
              />
            </div>
          </template>
        </BaseField>
      </div>
    </BaseForm>

    <template #actions>
      <div class="tw:flex tw:w-full tw:items-center tw:justify-between">
        <button
          v-if="initialUrl"
          class="tw:flex tw:items-center tw:gap-1.5 tw:text-sm tw:font-medium tw:text-red-600 tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:underline"
          @click="handleRemove"
        >
          <IconLinkOff :size="16" />
          Remove Link
        </button>
        <div v-else />
        <div class="tw:flex tw:gap-2">
          <button
            class="tw:px-4 tw:py-2 tw:text-sm tw:font-medium tw:text-secondary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:text-on-main"
            @click="show = false"
          >
            Cancel
          </button>
          <button
            class="tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-2 tw:text-sm tw:font-bold tw:text-white tw:bg-primary tw:rounded-lg tw:cursor-pointer tw:hover:bg-primary/90 tw:transition-colors tw:border-0"
            @click="formRef?.submit()"
          >
            <IconCheck :size="16" />
            Apply
          </button>
        </div>
      </div>
    </template>
  </BaseDialog>
</template>
