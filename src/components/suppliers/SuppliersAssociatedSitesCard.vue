<script setup>
import { IconMapPin, IconX } from '@tabler/icons-vue'

const props = defineProps({
  supplierId: {
    type: String,
    required: true,
  },
  canUpdate: {
    type: Boolean,
    default: false,
  },
})

const supplierSites = useLiveQueryWithDeps(
  [() => props.supplierId],
  async (db, [supplierId]) => db.SupplierOnSite.where('supplierId', supplierId).exec(),

  { models: ['SupplierOnSite'], initial: [] },
)

const addSite = useLiveMutation(async (db, { supplierId, siteId }) => {
  const link = db.SupplierOnSite.create({ supplierId, siteId })
  await link.save()
  return link
})

async function removeSite(link) {
  await link.delete()
}

async function onAddSites(siteIds) {
  for (const siteId of siteIds) {
    const alreadyLinked = supplierSites.value.some((s) => s.siteId === siteId)
    if (!alreadyLinked) {
      await addSite({ supplierId: props.supplierId, siteId })
    }
  }
}

const siteIds = computed(() => supplierSites.value.map((s) => s.siteId))
</script>

<template>
  <div
    class="tw:bg-sidebar tw:rounded-xl tw:shadow-sm tw:border tw:border-divider tw:overflow-hidden"
  >
    <div
      class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:justify-between"
    >
      <div class="tw:flex tw:items-center tw:gap-3">
        <div
          class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-primary/10 tw:flex tw:items-center tw:justify-center"
        >
          <IconMapPin :size="20" class="tw:text-primary" />
        </div>
        <h3 class="tw:text-lg tw:font-bold tw:text-on-main">Associated Sites</h3>
      </div>

      <SiteSelectMenu
        :modelValue="siteIds"
        :required="true"
        :multiple="true"
        @update:modelValue="onAddSites"
      >
        <template #button>
          <BaseButton v-if="canUpdate" variant="text-link" size="sm"> + Add Site </BaseButton>
        </template>
      </SiteSelectMenu>
    </div>
    <div class="tw:p-6">
      <div v-if="supplierSites.length" class="tw:flex tw:flex-wrap tw:gap-2">
        <div v-for="link in supplierSites" :key="link.id" class="tw:relative">
          <SiteBadgeById :siteId="link.siteId" />
          <button
            v-if="canUpdate"
            class="tw:absolute tw:-top-1 tw:-right-1 tw:w-4 tw:h-4 tw:bg-red-500 tw:text-white tw:rounded-full tw:flex tw:items-center tw:justify-center tw:hover:bg-red-600"
            @click="removeSite(link)"
          >
            <IconX :size="10" />
          </button>
        </div>
      </div>
      <div v-else class="tw:text-sm tw:text-secondary tw:italic">No sites assigned</div>
    </div>
  </div>
</template>
