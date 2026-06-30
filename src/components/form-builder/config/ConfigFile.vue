<script setup>
import { computed } from 'vue'

const field = defineModel('field', {
  type: Object,
  required: true,
})

const fileTypeOptions = [
  { id: 'ASSET', name: 'Asset' },
  { id: 'COMPANYLOGO', name: 'Company Logo' },
  { id: 'USERAVATAR', name: 'User Avatar' },
  { id: 'EDITORIMAGE', name: 'Editor Image' },
  { id: 'OPEN', name: 'Open' },
]

const formattedMaxSize = computed(() => {
  const size = field.value.maxSize
  if (!size || size === 0) {
    return ''
  }

  const kb = 1024
  const mb = kb * 1024
  const gb = mb * 1024

  if (size >= gb) {
    return `${(size / gb).toFixed(2)} GB`
  } else if (size >= mb) {
    return `${(size / mb).toFixed(2)} MB`
  } else if (size >= kb) {
    return `${(size / kb).toFixed(2)} KB`
  } else {
    return `${size} bytes`
  }
})
</script>

<template>
  <div class="tw:mb-4 tw:last:mb-0">
    <div class="tw:flex tw:flex-col tw:gap-3">
      <BaseField label="File Type" hint="Category for uploaded files">
        <BaseSelect
          v-model="field.fileType"
          :options="fileTypeOptions"
          optionLabel="name"
          optionValue="id"
          :required="true"
          placeholder="Select File Type"
        />
      </BaseField>
      <BaseTextInput
        v-model="field.accept"
        label="Accept (MIME types)"
        placeholder="image/*,video/*,application/pdf,.docx,.doc"
        instructions="Comma-separated list of allowed file types"
      />
      <div>
        <BaseTextInput
          v-model.number="field.maxSize"
          type="number"
          label="Max File Size (bytes)"
          placeholder="104857600"
          :instructions="
            formattedMaxSize
              ? `current: ${formattedMaxSize || 'No limit'}`
              : 'Default: 100 MB (104857600 bytes)'
          "
        />
      </div>
      <BaseCheckbox v-model="field.multiple">Allow multiple files</BaseCheckbox>
    </div>
  </div>
</template>
