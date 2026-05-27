<script setup>
import { IconSearch } from '@tabler/icons-vue'

const filters = defineModel('filters', {
  type: Object,
  required: true,
})
</script>

<template>
  <div class="tw:bg-main-hover tw:mb-2 tw:rounded-xl">
    <div class="tw:flex tw:items-center tw:p-2 tw:gap-2 tw:flex-wrap">
      <!-- Search -->
      <div class="tw:w-full tw:md:w-1/4" data-testid="document-search">
        <BaseTextInput v-model="filters.search" placeholder="Search documents..." clearBtn>
          <template #icon>
            <IconSearch class="tw:size-4 tw:text-secondary" />
          </template>
        </BaseTextInput>
      </div>

      <!-- Document Type Filter -->
      <div class="tw:w-full tw:md:w-1/5">
        <label class="tw:block tw:mb-1 tw:text-md tw:font-medium tw:text-on-main">
          Document Type:
        </label>
        <DocumentTypeSelectMenu
          v-model="filters.documentTypeId"
          :multiple="false"
          :required="false"
        />
      </div>

      <!-- Department Filter -->
      <div class="tw:w-full tw:md:w-1/5">
        <label class="tw:block tw:mb-1 tw:text-md tw:font-medium tw:text-on-main">
          Department:
        </label>
        <DepartmentSelectMenu v-model="filters.departmentId" />
      </div>

      <!-- Status Filter -->
      <div class="tw:w-full tw:md:w-1/5">
        <label class="tw:block tw:mb-1 tw:text-md tw:font-medium tw:text-on-main"> Status: </label>
        <DocumentVersionStatusSelectMenu
          v-model="filters.statusId"
          label="Status"
          bgColor="white"
          hideBottomSpace
        />
      </div>
    </div>
  </div>
</template>
