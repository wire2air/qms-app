<script setup>
/**
 * Read-only primary-contact summary for the supplier Overview. Full contact
 * management lives on the Locations & Contacts tab — this just surfaces the
 * primary so it's visible on the main tab without duplicating the editor.
 */
import { IconMail, IconPhone, IconUser } from '@tabler/icons-vue'

const props = defineProps({
  supplierId: { type: String, required: true },
})

const contacts = useLiveQueryWithDeps(
  [() => props.supplierId],
  async (db, [supplierId]) =>
    db.SupplierContact.where('supplierId', supplierId).orderBy('createdAt').exec(),

  { models: ['SupplierContact'], initial: [] },
)
const primary = computed(() => contacts.value.find((c) => c.isPrimary) || contacts.value[0] || null)
</script>

<template>
  <div
    class="tw:bg-sidebar tw:rounded-xl tw:shadow-sm tw:border tw:border-divider tw:overflow-hidden"
  >
    <div class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover">
      <BaseSectionHeader
        title="Primary Contact"
        :icon="IconUser"
        iconVariant="boxed"
        iconColor="gray"
        :iconSize="20"
        :level="3"
        size="section-title"
      />
    </div>
    <div class="tw:p-6">
      <div v-if="primary" class="tw:flex tw:flex-col tw:gap-2">
        <div class="tw:text-base tw:font-semibold tw:text-on-main">
          {{ primary.name || '—' }}
          <span v-if="primary.jobTitle" class="tw:text-sm tw:font-normal tw:text-secondary">
            · {{ primary.jobTitle }}</span
          >
        </div>
        <a
          v-if="primary.email"
          :href="`mailto:${primary.email}`"
          class="tw:inline-flex tw:items-center tw:gap-2 tw:text-sm tw:text-primary tw:hover:underline"
        >
          <IconMail :size="14" /> {{ primary.email }}
        </a>
        <span
          v-if="primary.phoneNumber"
          class="tw:inline-flex tw:items-center tw:gap-2 tw:text-sm tw:text-on-main"
        >
          <IconPhone :size="14" class="tw:text-secondary" /> {{ primary.phoneNumber }}
        </span>
        <p class="tw:text-xs tw:text-secondary tw:mt-1">
          Manage all contacts on the <strong>Locations &amp; Contacts</strong> tab.
        </p>
      </div>
      <div v-else class="tw:text-sm tw:text-secondary tw:italic">
        No contact yet — add one on the <strong>Locations &amp; Contacts</strong> tab.
      </div>
    </div>
  </div>
</template>
