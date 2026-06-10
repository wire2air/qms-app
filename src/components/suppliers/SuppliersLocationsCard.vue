<script setup>
/**
 * Supplier's own physical locations (A.5) — production / offices / warehouses /
 * technical / engineering. Inline card CRUD via SyncEngine. Distinct from the
 * "Associated Sites" card (which is OUR sites that use this supplier).
 */
import {
  IconBuildingFactory2,
  IconPlus,
  IconTrash,
  IconStar,
  IconStarFilled,
  IconChevronDown,
  IconChevronRight,
} from '@tabler/icons-vue'

const props = defineProps({
  supplierId: { type: String, required: true },
  canUpdate: { type: Boolean, default: false },
})

const LOCATION_TYPES = [
  { id: 'PRODUCTION', name: 'Production Facility' },
  { id: 'CORPORATE_OFFICE', name: 'Corporate Office' },
  { id: 'WAREHOUSE', name: 'Warehouse' },
  { id: 'TECHNICAL', name: 'Technical Services' },
  { id: 'ENGINEERING', name: 'Engineering Services' },
  { id: 'OTHER', name: 'Other' },
]

const locations = useLiveQueryWithDeps(
  [() => props.supplierId],
  async (db, [supplierId]) =>
    db.SupplierLocation.where('supplierId', supplierId).orderBy('displayOrder').exec(),
  { initial: [] },
)

// Collapsed by default — locations are reference detail, expand to view/edit.
const open = ref(false)

const draft = ref(null)
function addLocation() {
  open.value = true
  if (draft.value) return
  draft.value = {
    name: '',
    locationType: 'PRODUCTION',
    streetAddress: '',
    city: '',
    stateProvince: '',
    zipPostalCode: '',
    country: '',
    products: '',
    turnoverUsdM: null,
  }
}
function cancelDraft() {
  draft.value = null
}

const saveDraft = useLiveMutation(async (db) => {
  const isFirst = locations.value.length === 0
  const loc = db.SupplierLocation.create({
    supplierId: props.supplierId,
    ...draft.value,
    turnoverUsdM: draft.value.turnoverUsdM === '' ? null : draft.value.turnoverUsdM,
    isPrimary: isFirst,
    displayOrder: (locations.value.length + 1) * 10,
  })
  await loc.save()
  draft.value = null
  return loc
})

async function saveLocation(loc) {
  await loc.save()
}
async function removeLocation(loc) {
  await loc.delete()
}
async function setPrimary(loc) {
  for (const l of locations.value) {
    if (l.isPrimary && l.id !== loc.id) {
      l.isPrimary = false
      await l.save()
    }
  }
  loc.isPrimary = true
  await loc.save()
}
</script>

<template>
  <div class="tw:bg-sidebar tw:rounded-xl tw:shadow-sm tw:border tw:border-divider tw:overflow-hidden">
    <div class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:justify-between tw:gap-2">
      <button
        type="button"
        class="tw:flex tw:items-center tw:gap-3 tw:flex-1 tw:text-left tw:bg-transparent tw:border-0 tw:cursor-pointer"
        @click="open = !open"
      >
        <div class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-gray-100 tw:flex tw:items-center tw:justify-center">
          <IconBuildingFactory2 :size="20" class="tw:text-secondary" />
        </div>
        <h3 class="tw:text-lg tw:font-bold tw:text-on-main">Locations</h3>
        <span
          v-if="locations.length"
          class="tw:text-xs tw:font-semibold tw:text-secondary tw:bg-white tw:border tw:border-divider tw:rounded-full tw:px-2 tw:py-0.5"
        >
          {{ locations.length }}
        </span>
        <component :is="open ? IconChevronDown : IconChevronRight" :size="18" class="tw:text-secondary" />
      </button>
      <BaseButton v-if="canUpdate && !draft" variant="text-link" size="sm" @click="addLocation">
        <IconPlus :size="14" />
        Add Location
      </BaseButton>
    </div>
    <div v-show="open" class="tw:p-6">
      <div v-if="locations.length || draft" class="tw:space-y-4">
        <div
          v-for="loc in locations"
          :key="loc.id"
          class="tw:flex tw:flex-col tw:gap-3 tw:p-4 tw:border tw:border-divider tw:rounded-lg"
        >
          <div class="tw:flex tw:items-center tw:justify-between">
            <div class="tw:flex tw:items-center tw:gap-2">
              <button
                class="tw:p-0.5 tw:rounded"
                :class="loc.isPrimary ? 'tw:text-amber-500' : 'tw:text-secondary tw:hover:text-amber-500'"
                :title="loc.isPrimary ? 'Primary (HQ)' : 'Set as primary'"
                @click="!loc.isPrimary && canUpdate && setPrimary(loc)"
              >
                <IconStarFilled v-if="loc.isPrimary" :size="16" />
                <IconStar v-else :size="16" />
              </button>
              <span class="tw:text-sm tw:font-semibold tw:text-on-main">{{ loc.name || 'Location' }}</span>
            </div>
            <button
              v-if="canUpdate"
              class="tw:p-1 tw:rounded tw:text-red-400 tw:hover:text-red-600"
              @click="removeLocation(loc)"
            >
              <IconTrash :size="14" />
            </button>
          </div>
          <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3">
            <div>
              <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">Name / label</label>
              <BaseTextInput v-if="canUpdate" v-model="loc.name" placeholder="e.g. Detroit Plant" @blur="saveLocation(loc)" />
              <span v-else class="tw:text-sm tw:text-on-main">{{ loc.name || '—' }}</span>
            </div>
            <div>
              <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">Type</label>
              <BaseSelectMenu v-if="canUpdate" v-model="loc.locationType" :items="LOCATION_TYPES" :required="true" @update:modelValue="saveLocation(loc)" />
              <span v-else class="tw:text-sm tw:text-on-main">{{ LOCATION_TYPES.find((t) => t.id === loc.locationType)?.name || '—' }}</span>
            </div>
            <div class="tw:md:col-span-2">
              <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">Street address</label>
              <BaseTextInput v-if="canUpdate" v-model="loc.streetAddress" @blur="saveLocation(loc)" />
              <span v-else class="tw:text-sm tw:text-on-main">{{ loc.streetAddress || '—' }}</span>
            </div>
            <div>
              <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">City</label>
              <BaseTextInput v-if="canUpdate" v-model="loc.city" @blur="saveLocation(loc)" />
              <span v-else class="tw:text-sm tw:text-on-main">{{ loc.city || '—' }}</span>
            </div>
            <div>
              <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">State / Province</label>
              <BaseTextInput v-if="canUpdate" v-model="loc.stateProvince" @blur="saveLocation(loc)" />
              <span v-else class="tw:text-sm tw:text-on-main">{{ loc.stateProvince || '—' }}</span>
            </div>
            <div>
              <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">ZIP / Postal</label>
              <BaseTextInput v-if="canUpdate" v-model="loc.zipPostalCode" @blur="saveLocation(loc)" />
              <span v-else class="tw:text-sm tw:text-on-main">{{ loc.zipPostalCode || '—' }}</span>
            </div>
            <div>
              <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">Country</label>
              <BaseTextInput v-if="canUpdate" v-model="loc.country" @blur="saveLocation(loc)" />
              <span v-else class="tw:text-sm tw:text-on-main">{{ loc.country || '—' }}</span>
            </div>
            <div>
              <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">Products</label>
              <BaseTextInput v-if="canUpdate" v-model="loc.products" placeholder="What's made/handled here" @blur="saveLocation(loc)" />
              <span v-else class="tw:text-sm tw:text-on-main">{{ loc.products || '—' }}</span>
            </div>
            <div>
              <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">Turnover (USD M)</label>
              <BaseTextInput v-if="canUpdate" v-model.number="loc.turnoverUsdM" type="number" @blur="saveLocation(loc)" />
              <span v-else class="tw:text-sm tw:text-on-main">{{ loc.turnoverUsdM ?? '—' }}</span>
            </div>
          </div>
        </div>

        <!-- Draft -->
        <div v-if="draft" class="tw:flex tw:flex-col tw:gap-3 tw:p-4 tw:border tw:border-primary/40 tw:rounded-lg tw:bg-primary/5">
          <div class="tw:flex tw:items-center tw:justify-between">
            <span class="tw:text-xs tw:font-bold tw:text-secondary tw:uppercase tw:tracking-wide">New Location</span>
            <button class="tw:p-1 tw:rounded tw:text-secondary tw:hover:text-red-500" @click="cancelDraft">
              <IconTrash :size="14" />
            </button>
          </div>
          <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3">
            <div>
              <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">Name / label</label>
              <BaseTextInput v-model="draft.name" placeholder="e.g. Detroit Plant" />
            </div>
            <div>
              <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">Type</label>
              <BaseSelectMenu v-model="draft.locationType" :items="LOCATION_TYPES" :required="true" />
            </div>
            <div class="tw:md:col-span-2">
              <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">Street address</label>
              <BaseTextInput v-model="draft.streetAddress" />
            </div>
            <div><label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">City</label><BaseTextInput v-model="draft.city" /></div>
            <div><label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">State / Province</label><BaseTextInput v-model="draft.stateProvince" /></div>
            <div><label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">ZIP / Postal</label><BaseTextInput v-model="draft.zipPostalCode" /></div>
            <div><label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">Country</label><BaseTextInput v-model="draft.country" /></div>
            <div><label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">Products</label><BaseTextInput v-model="draft.products" /></div>
            <div><label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">Turnover (USD M)</label><BaseTextInput v-model.number="draft.turnoverUsdM" type="number" /></div>
          </div>
          <div class="tw:flex tw:justify-end">
            <BaseButton size="sm" :disabled="!draft.name && !draft.city" @click="saveDraft">Save Location</BaseButton>
          </div>
        </div>
      </div>
      <BaseEmptyState v-else :icon="IconBuildingFactory2" title="No locations yet." />
    </div>
  </div>
</template>
