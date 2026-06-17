<script setup>
/**
 * Supplier company profile (A.1 / A.3 / A.4). Headline identity fields are
 * first-class supplier columns; the employee/area/alliance breakdown lives in
 * the supplier's `profile` JSONB. Inline edit + save-on-blur on the supplier
 * model instance (a deep-clone reassign on profile guarantees dirty tracking).
 */
const props = defineProps({
  supplier: { type: Object, required: true },
  canUpdate: { type: Boolean, default: false },
})

function blankProfile() {
  return {
    employees: { managers: null, engineers: null, technicians: null, workers: null, temporary: null, qualityTeam: null },
    areas: { propertySqft: null, manufacturingSqft: null, warehouseSqft: null },
    alliances: {
      parent: { name: '', revenueUsdM: null },
      partner: { name: '', revenueUsdM: null },
      subsidiary: { name: '', revenueUsdM: null },
    },
  }
}

// Local working copy of the JSONB profile (merged over defaults so older rows
// missing keys still render).
const p = ref(blankProfile())
watch(
  () => props.supplier?.id,
  () => {
    const src = props.supplier?.profile || {}
    const base = blankProfile()
    p.value = {
      employees: { ...base.employees, ...(src.employees || {}) },
      areas: { ...base.areas, ...(src.areas || {}) },
      alliances: {
        parent: { ...base.alliances.parent, ...(src.alliances?.parent || {}) },
        partner: { ...base.alliances.partner, ...(src.alliances?.partner || {}) },
        subsidiary: { ...base.alliances.subsidiary, ...(src.alliances?.subsidiary || {}) },
      },
    }
  },
  { immediate: true },
)

const saving = ref(false)
const saveError = ref(null)

// Persist a discrete supplier column edit.
async function commit() {
  if (!props.canUpdate || !props.supplier) return
  saving.value = true
  saveError.value = null
  try {
    await props.supplier.save()
  } catch (e) {
    saveError.value = e?.message || 'Failed to save'
  } finally {
    saving.value = false
  }
}

// Persist the JSONB profile (deep-clone reassign so the change is detected).
async function commitProfile() {
  if (!props.canUpdate || !props.supplier) return
  props.supplier.profile = JSON.parse(JSON.stringify(p.value))
  await commit()
}

const EMPLOYEE_FIELDS = [
  ['managers', 'Managers'],
  ['engineers', 'Engineers'],
  ['technicians', 'Technicians'],
  ['workers', 'Workers'],
  ['temporary', 'Temporary Workers'],
  ['qualityTeam', 'Quality Team'],
]
const AREA_FIELDS = [
  ['propertySqft', 'Property (sqft)'],
  ['manufacturingSqft', 'Manufacturing (sqft)'],
  ['warehouseSqft', 'Warehouse (sqft)'],
]
const ALLIANCE_ROWS = [
  ['parent', 'Parent Company'],
  ['partner', 'Partner'],
  ['subsidiary', 'Subsidiary'],
]
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-6">
    <div v-if="saveError" class="tw:text-xs tw:text-red-600">{{ saveError }}</div>

    <!-- A.1 Company Data -->
    <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
      <div class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover">
        <h3 class="tw:text-lg tw:font-bold tw:text-on-main">Company Data</h3>
      </div>
      <div class="tw:p-6 tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-4">
        <div>
          <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">Homepage / Website</label>
          <BaseTextInput v-if="canUpdate" v-model="supplier.website" placeholder="https://…" @blur="commit" />
          <span v-else class="tw:text-sm tw:text-on-main">{{ supplier.website || '—' }}</span>
        </div>
        <div>
          <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">DUNS Number</label>
          <BaseTextInput v-if="canUpdate" v-model="supplier.dunsNumber" @blur="commit" />
          <span v-else class="tw:text-sm tw:text-on-main">{{ supplier.dunsNumber || '—' }}</span>
        </div>
        <div>
          <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">Founded Year</label>
          <BaseTextInput v-if="canUpdate" v-model.number="supplier.foundedYear" type="number" @blur="commit" />
          <span v-else class="tw:text-sm tw:text-on-main">{{ supplier.foundedYear || '—' }}</span>
        </div>
        <div>
          <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">Annual Revenue (USD M)</label>
          <BaseTextInput v-if="canUpdate" v-model.number="supplier.annualRevenueUsdM" type="number" @blur="commit" />
          <span v-else class="tw:text-sm tw:text-on-main">{{ supplier.annualRevenueUsdM ?? '—' }}</span>
        </div>
      </div>
    </div>

    <!-- A.3 Company Details -->
    <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
      <div class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover">
        <h3 class="tw:text-lg tw:font-bold tw:text-on-main">Company Details</h3>
      </div>
      <div class="tw:p-6 tw:flex tw:flex-col tw:gap-5">
        <div>
          <BaseText variant="overline" class="tw:block tw:mb-2">Workforce</BaseText>
          <div class="tw:grid tw:grid-cols-2 tw:md:grid-cols-4 tw:gap-4">
            <div>
              <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">Total Employees</label>
              <BaseTextInput v-if="canUpdate" v-model.number="supplier.totalEmployees" type="number" @blur="commit" />
              <span v-else class="tw:text-sm tw:text-on-main">{{ supplier.totalEmployees ?? '—' }}</span>
            </div>
            <div v-for="[key, label] in EMPLOYEE_FIELDS" :key="key">
              <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">{{ label }}</label>
              <BaseTextInput v-if="canUpdate" v-model.number="p.employees[key]" type="number" @blur="commitProfile" />
              <span v-else class="tw:text-sm tw:text-on-main">{{ p.employees[key] ?? '—' }}</span>
            </div>
          </div>
        </div>
        <div>
          <BaseText variant="overline" class="tw:block tw:mb-2">Facility Area</BaseText>
          <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-3 tw:gap-4">
            <div v-for="[key, label] in AREA_FIELDS" :key="key">
              <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">{{ label }}</label>
              <BaseTextInput v-if="canUpdate" v-model.number="p.areas[key]" type="number" @blur="commitProfile" />
              <span v-else class="tw:text-sm tw:text-on-main">{{ p.areas[key] ?? '—' }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- A.4 Alliances / Partnerships -->
    <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
      <div class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover">
        <h3 class="tw:text-lg tw:font-bold tw:text-on-main">Alliances / Partnerships</h3>
      </div>
      <div class="tw:p-6 tw:flex tw:flex-col tw:gap-3">
        <div v-for="[key, label] in ALLIANCE_ROWS" :key="key" class="tw:grid tw:grid-cols-1 tw:md:grid-cols-3 tw:gap-3 tw:items-end">
          <div class="tw:text-sm tw:font-medium tw:text-on-main">{{ label }}</div>
          <div>
            <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">Name</label>
            <BaseTextInput v-if="canUpdate" v-model="p.alliances[key].name" @blur="commitProfile" />
            <span v-else class="tw:text-sm tw:text-on-main">{{ p.alliances[key].name || '—' }}</span>
          </div>
          <div>
            <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">Revenue (USD M)</label>
            <BaseTextInput v-if="canUpdate" v-model.number="p.alliances[key].revenueUsdM" type="number" @blur="commitProfile" />
            <span v-else class="tw:text-sm tw:text-on-main">{{ p.alliances[key].revenueUsdM ?? '—' }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
