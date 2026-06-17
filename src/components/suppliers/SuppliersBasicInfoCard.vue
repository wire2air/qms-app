<script setup>
import { IconInfoCircle } from '@tabler/icons-vue'

defineProps({
  supplier: {
    type: Object,
    required: true,
  },
  canUpdate: {
    type: Boolean,
    default: false,
  },
})
</script>

<template>
  <div
    class="tw:bg-sidebar tw:rounded-xl tw:shadow-sm tw:border tw:border-divider tw:overflow-hidden"
  >
    <div class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover">
      <BaseSectionHeader
        title="Basic Information"
        :icon="IconInfoCircle"
        iconVariant="boxed"
        iconColor="primary"
        :iconSize="20"
        :level="3"
        size="section-title"
      />
    </div>
    <div class="tw:p-6 tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-y-6 tw:gap-x-12">
      <BaseDetailField label="Supplier Code" :value="supplier.code" />
      <div>
        <label class="ds-label-sm tw:text-secondary tw:block tw:mb-1">Category</label>
        <SupplierCategorySelectMenu v-if="canUpdate" v-model="supplier.category" :required="true" />
        <template v-else>
          <SupplierCategoryBadge v-if="supplier.category" :categoryId="supplier.category" />
          <span v-else class="tw:text-sm tw:text-secondary">—</span>
        </template>
      </div>
      <BaseDetailField
        label="Created Date"
        :value="supplier.createdAt?.formatDate('date')"
      />
      <div>
        <label class="ds-label-sm tw:text-secondary tw:block tw:mb-1">Country</label>
        <BaseTextInput v-if="canUpdate" v-model="supplier.country" placeholder="Country" />
        <p v-else class="tw:text-sm tw:font-medium tw:text-on-main">
          {{ supplier.country || '—' }}
        </p>
      </div>
      <div>
        <label class="ds-label-sm tw:text-secondary tw:block tw:mb-1">Street Address</label>
        <BaseTextInput
          v-if="canUpdate"
          v-model="supplier.streetAddress"
          placeholder="Street Address"
        />
        <p v-else class="tw:text-sm tw:font-medium tw:text-on-main">
          {{ supplier.streetAddress || '—' }}
        </p>
      </div>
      <div>
        <label class="ds-label-sm tw:text-secondary tw:block tw:mb-1">City</label>
        <BaseTextInput v-if="canUpdate" v-model="supplier.city" placeholder="City" />
        <p v-else class="tw:text-sm tw:font-medium tw:text-on-main">{{ supplier.city || '—' }}</p>
      </div>
      <div>
        <label class="ds-label-sm tw:text-secondary tw:block tw:mb-1">State / Province</label>
        <BaseTextInput
          v-if="canUpdate"
          v-model="supplier.stateProvince"
          placeholder="State / Province"
        />
        <p v-else class="tw:text-sm tw:font-medium tw:text-on-main">
          {{ supplier.stateProvince || '—' }}
        </p>
      </div>
      <div>
        <label class="ds-label-sm tw:text-secondary tw:block tw:mb-1">Zip / Postal Code</label>
        <BaseTextInput
          v-if="canUpdate"
          v-model="supplier.zipPostalCode"
          placeholder="Zip / Postal Code"
        />
        <p v-else class="tw:text-sm tw:font-medium tw:text-on-main">
          {{ supplier.zipPostalCode || '—' }}
        </p>
      </div>
    </div>
  </div>
</template>
