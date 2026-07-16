<script setup>
// Platform Console — Seed Defaults. Seeds a tenant's QMS config for the selected
// modules (Main Site, roles, workflow/document/form templates, lookups, audit
// library, onboarding training) — either from the built-in ISO baseline or by
// cloning another company's config. Additive + idempotent on the server: only
// missing rows are inserted, anything already present is left untouched. View =
// support; seeding = admin. Every run is audited server-side (COMPANY_SEED_DEFAULTS).
import { IconDatabaseImport, IconSeeding, IconAlertTriangle } from '@tabler/icons-vue'
import { useToast } from '@shared/composables/useToast.js'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { listCompanies, listSeedModules, seedCompanyDefaults } from '@/api/platform.js'
import { hasPlatformRole } from '@/utils/currentSession.js'

const toast = useToast()
const canSeed = computed(() => hasPlatformRole('admin'))

// ── Data ─────────────────────────────────────────────────────────────────────
const companies = ref([])
const modules = ref([]) // [{ key, label, deps }]
const loading = ref(false)

// ── Selection ──────────────────────────────────────────────────────────────────
const companyId = ref(null)
// Seed source: built-in ISO defaults, or clone the selected modules' config from
// another company (the target itself is excluded — can't clone from self).
const DEFAULTS_SOURCE = {
  id: 'defaults',
  name: 'Built-in QMS defaults (ISO 9001 / 13485 baseline)',
}
const sourceId = ref('defaults')
const selectedKeys = ref([]) // module keys explicitly ticked

const selectedCompany = computed(
  () => companies.value.find((c) => c.id === companyId.value) || null,
)
const sourceOptions = computed(() => [
  DEFAULTS_SOURCE,
  ...companies.value.filter((c) => c.id !== companyId.value),
])
const cloningFromCompany = computed(() => sourceId.value && sourceId.value !== 'defaults')
const sourceCompany = computed(() => companies.value.find((c) => c.id === sourceId.value) || null)
const allSelected = computed(
  () => modules.value.length > 0 && selectedKeys.value.length === modules.value.length,
)
const someSelected = computed(
  () => selectedKeys.value.length > 0 && selectedKeys.value.length < modules.value.length,
)

// Effective set = ticked modules + their transitive deps (mirrors the server's
// resolveModules) so the operator sees exactly what will run.
const effectiveKeys = computed(() => {
  const byKey = new Map(modules.value.map((m) => [m.key, m]))
  const out = new Set()
  function add(key) {
    if (out.has(key) || !byKey.has(key)) return
    out.add(key)
    for (const dep of byKey.get(key).deps || []) add(dep)
  }
  for (const k of selectedKeys.value) add(k)
  return modules.value.map((m) => m.key).filter((k) => out.has(k))
})
// deps pulled in that weren't ticked directly — surfaced as a hint.
const autoIncludedKeys = computed(() =>
  effectiveKeys.value.filter((k) => !selectedKeys.value.includes(k)),
)
function labelFor(key) {
  return modules.value.find((m) => m.key === key)?.label || key
}

async function load() {
  loading.value = true
  try {
    const [companyData, moduleData] = await Promise.all([listCompanies(), listSeedModules()])
    companies.value = companyData?.companies || []
    modules.value = moduleData?.modules || []
    // Default to the full baseline — the common case.
    selectedKeys.value = modules.value.map((m) => m.key)
  } finally {
    loading.value = false
  }
}
onMounted(load)

// Can't clone from the target itself — fall back to built-in defaults if the
// picked target is currently the chosen source.
watch(companyId, (id) => {
  if (id && sourceId.value === id) sourceId.value = 'defaults'
})

function toggleAll() {
  selectedKeys.value = allSelected.value ? [] : modules.value.map((m) => m.key)
}
function isChecked(key) {
  return selectedKeys.value.includes(key)
}
function toggle(key) {
  selectedKeys.value = isChecked(key)
    ? selectedKeys.value.filter((k) => k !== key)
    : [...selectedKeys.value, key]
}

// ── Seed ───────────────────────────────────────────────────────────────────────
const confirmOpen = ref(false)
const seeding = ref(false)
const lastResult = ref(null)

function openConfirm() {
  if (!companyId.value) {
    toast.notify({ type: 'negative', message: 'Select a company first' })
    return
  }
  if (!effectiveKeys.value.length) {
    toast.notify({ type: 'negative', message: 'Select at least one module' })
    return
  }
  lastResult.value = null
  confirmOpen.value = true
}

async function handleSeed() {
  seeding.value = true
  try {
    // Full baseline ⇒ send null (server seeds everything); otherwise the ticked keys.
    const payload = allSelected.value ? null : selectedKeys.value
    const res = await seedCompanyDefaults(companyId.value, payload, sourceId.value)
    lastResult.value = res
    confirmOpen.value = false
    toast.notify({
      type: 'positive',
      message: `Seeded ${res?.appliedModules?.length ?? 0} module(s) into ${
        res?.company?.name || 'company'
      }`,
    })
  } catch (err) {
    toast.notify({ type: 'negative', message: err?.message || 'Seeding failed' })
  } finally {
    seeding.value = false
  }
}
</script>

<template>
  <BasePage width="standard">
    <PageHeader :icon="IconSeeding" title="Seed Defaults" />

    <div v-if="loading" class="tw:flex tw:justify-center tw:py-16">
      <BaseSpinner />
    </div>

    <template v-else>
      <PageSection title="Target & source" :icon="IconDatabaseImport">
        <div class="tw:grid tw:gap-4 tw:sm:grid-cols-2">
          <div>
            <p class="tw:text-secondary tw:text-xs tw:mb-1">Company</p>
            <BaseSelect
              v-model="companyId"
              :options="companies"
              optionLabel="name"
              optionValue="id"
              placeholder="Select a tenant…"
            />
            <p v-if="selectedCompany" class="tw:font-mono tw:text-xs tw:text-secondary tw:mt-1">
              {{ selectedCompany.code }}
            </p>
          </div>
          <div>
            <p class="tw:text-secondary tw:text-xs tw:mb-1">Seed from</p>
            <BaseSelect
              v-model="sourceId"
              :options="sourceOptions"
              optionLabel="name"
              optionValue="id"
              :clearable="false"
            />
            <p v-if="cloningFromCompany" class="tw:text-xs tw:text-secondary tw:mt-1">
              Clones the selected modules' config from
              <span class="tw:font-semibold">{{ sourceCompany?.name }}</span> (users & transactional
              records are not copied).
            </p>
          </div>
        </div>
      </PageSection>

      <PageSection title="Modules" :icon="IconDatabaseImport">
        <template #actions>
          <BaseButton variant="secondary" size="sm" @click="toggleAll">
            {{ allSelected ? 'Clear all' : 'Select all' }}
          </BaseButton>
        </template>

        <div class="tw:flex tw:flex-col tw:gap-3">
          <div class="tw:flex tw:items-center tw:gap-2 tw:pb-2 tw:border-b tw:border-divider">
            <BaseCheckbox
              :modelValue="allSelected"
              :indeterminate="someSelected"
              label="All modules"
              @update:modelValue="toggleAll"
            />
            <span class="tw:text-xs tw:text-secondary">
              {{ selectedKeys.length }} of {{ modules.length }} selected
            </span>
          </div>

          <ContentGrid min="16rem">
            <div
              v-for="m in modules"
              :key="m.key"
              class="tw:flex tw:flex-col tw:gap-1 tw:rounded-lg tw:border tw:border-divider tw:p-3"
            >
              <BaseCheckbox
                :modelValue="isChecked(m.key)"
                :label="m.label"
                @update:modelValue="() => toggle(m.key)"
              />
              <p v-if="m.deps?.length" class="tw:text-xs tw:text-secondary tw:pl-6">
                needs: {{ m.deps.map(labelFor).join(', ') }}
              </p>
            </div>
          </ContentGrid>

          <p
            v-if="autoIncludedKeys.length"
            class="tw:text-xs tw:text-secondary tw:flex tw:items-center tw:gap-1"
          >
            <IconAlertTriangle :size="14" class="tw:text-amber-500" />
            Dependencies auto-included: {{ autoIncludedKeys.map(labelFor).join(', ') }}
          </p>
        </div>
      </PageSection>

      <div class="tw:flex tw:items-center tw:justify-between tw:gap-3">
        <p class="tw:text-sm tw:text-secondary">
          Additive & idempotent — only rows the tenant is missing are inserted; anything already
          seeded is left untouched.
        </p>
        <BaseButton
          variant="primary"
          :disabled="!canSeed || !companyId || !effectiveKeys.length"
          @click="openConfirm"
        >
          <template #icon><IconSeeding :size="16" /></template>
          Seed defaults
        </BaseButton>
      </div>

      <BaseCard v-if="lastResult" class="tw:mt-2">
        <div class="tw:flex tw:flex-col tw:gap-2">
          <p class="tw:font-semibold tw:text-on-main">
            Seeded {{ lastResult.appliedModules?.length ?? 0 }} module(s) into
            {{ lastResult.company?.name }}
          </p>
          <div class="tw:flex tw:flex-wrap tw:gap-1">
            <BaseBadge
              v-for="k in lastResult.appliedModules"
              :key="k"
              class="tw:bg-green-100 tw:text-green-700"
            >
              {{ labelFor(k) }}
            </BaseBadge>
          </div>
        </div>
      </BaseCard>
    </template>

    <!-- Confirm -->
    <BaseDialog v-model="confirmOpen" title="Seed defaults?">
      <div class="tw:flex tw:flex-col tw:gap-3">
        <p class="tw:text-sm tw:text-on-main">
          Seed
          <span class="tw:font-semibold">{{
            cloningFromCompany ? sourceCompany?.name : 'built-in defaults'
          }}</span>
          into
          <span class="tw:font-semibold">{{ selectedCompany?.name }}</span>
          <span class="tw:font-mono tw:text-xs tw:text-secondary"
            >({{ selectedCompany?.code }})</span
          >?
        </p>
        <div>
          <p class="tw:text-secondary tw:text-xs tw:mb-1">
            {{ effectiveKeys.length }} module(s) will run (incl. dependencies):
          </p>
          <div class="tw:flex tw:flex-wrap tw:gap-1">
            <BaseBadge v-for="k in effectiveKeys" :key="k" class="tw:bg-gray-100 tw:text-gray-600">
              {{ labelFor(k) }}
            </BaseBadge>
          </div>
        </div>
        <p class="tw:text-xs tw:text-secondary">
          Safe to run repeatedly — existing rows are never duplicated or modified.
        </p>
      </div>
      <template #footer="{ close }">
        <BaseButton variant="secondary" :disabled="seeding" @click="close">Cancel</BaseButton>
        <BaseButton variant="primary" :disabled="seeding" @click="handleSeed">
          {{ seeding ? 'Seeding…' : 'Seed defaults' }}
        </BaseButton>
      </template>
    </BaseDialog>
  </BasePage>
</template>
