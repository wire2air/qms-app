<script setup>
import { IconInfoCircle } from '@tabler/icons-vue'

const field = defineModel('field', {
  type: Object,
  required: true,
})
</script>

<template>
  <div class="tw:mb-4 tw:last:mb-0">
    <BaseText
      variant="overline"
      class="tw:block tw:mb-2 tw:pb-2 tw:border-b tw:border-divider"
    >
      Styling
    </BaseText>

    <div
      class="tw:mb-3 tw:text-xs tw:text-on-sidebar tw:bg-main-selected tw:p-2 tw:rounded tw:border tw:border-primary/20"
    >
      <div class="tw:mb-1 tw:flex tw:items-center">
        <IconInfoCircle :size="14" class="tw:text-primary tw:mr-1" />
        <strong>Advanced Settings</strong>
      </div>
      <div class="tw:mb-1">Only modify these settings if you are familiar with CSS.</div>
      <div>
        Useful references:
        <ul class="tw:pl-4 tw:my-1 tw:pr-2">
          <li>
            <a href="https://tailwindcss.com/docs" target="_blank" class="tw:text-primary"
              >Tailwind CSS</a
            >
          </li>
          <li>
            <a href="https://tailwindcss.com/docs/flex" target="_blank" class="tw:text-primary"
              >Flexbox & Grid</a
            >
          </li>
        </ul>
      </div>
    </div>

    <div class="tw:flex tw:flex-col tw:gap-3">
      <BaseTextInput v-model="field.class" label="CSS Classes" placeholder="tw:w-1/2 tw:mb-4" />

      <BaseTextInput v-model="field.style" label="Inline Styles" placeholder="width: 100%" />
    </div>
  </div>
</template>
