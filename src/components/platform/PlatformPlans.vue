<script setup>
// Platform Console — Plans (C2 entitlement catalog). Global plan catalog: each
// plan bundles a set of modules (or entitles all). Per-tenant assignment lives
// in Tenant 360; this page defines the plans themselves. View = support;
// create/edit = admin. Every mutation is audited (PLAN_*).
import { IconLicense, IconPlus, IconEdit, IconInfinity } from '@tabler/icons-vue'
import { useToast } from '@shared/composables/useToast.js'
import {
  listPlans,
  createPlan,
  updatePlan,
  addPlanModule,
  removePlanModule,
} from '@/api/platform.js'
import { hasPlatformRole } from '@/utils/currentSession.js'

const toast = useToast()

const plans = ref([])
const modules = ref([])
const loading = ref(false)
const canManage = computed(() => hasPlatformRole('admin'))

const moduleCount = computed(() => modules.value.length)

// ── Create ───────────────────────────────────────────────────────────────────
const createDialog = ref(false)
const createForm = ref({ id: '', name: '', description: '', entitlesAllModules: false })
const creating = ref(false)

// ── Edit ─────────────────────────────────────────────────────────────────────
const editDialog = ref(false)
const editForm = ref(null)
const savingEdit = ref(false)

async function load() {
  loading.value = true
  try {
    const data = await listPlans()
    plans.value = data?.plans || []
    modules.value = data?.modules || []
  } finally {
    loading.value = false
  }
}

onMounted(load)

function openCreate() {
  createForm.value = { id: '', name: '', description: '', entitlesAllModules: false }
  createDialog.value = true
}

async function handleCreate() {
  const f = createForm.value
  if (!/^[a-z0-9_]+$/.test(f.id)) {
    toast.notify({
      type: 'negative',
      message: 'Id must be lowercase letters, digits, or underscore',
    })
    return
  }
  if (!f.name.trim()) {
    toast.notify({ type: 'negative', message: 'Name is required' })
    return
  }
  creating.value = true
  try {
    await createPlan({
      id: f.id,
      name: f.name.trim(),
      description: f.description.trim() || null,
      entitlesAllModules: f.entitlesAllModules,
    })
    createDialog.value = false
    await load()
  } finally {
    creating.value = false
  }
}

function openEdit(plan) {
  editForm.value = {
    id: plan.id,
    name: plan.name,
    description: plan.description || '',
    isActive: plan.isActive,
    entitlesAllModules: plan.entitlesAllModules,
    moduleIds: [...plan.moduleIds],
    originalModuleIds: [...plan.moduleIds],
  }
  editDialog.value = true
}

async function handleEdit() {
  const f = editForm.value
  if (!f.name.trim()) {
    toast.notify({ type: 'negative', message: 'Name is required' })
    return
  }
  savingEdit.value = true
  try {
    await updatePlan(f.id, {
      name: f.name.trim(),
      description: f.description.trim() || null,
      isActive: f.isActive,
      entitlesAllModules: f.entitlesAllModules,
    })
    // Diff the module bundle (skipped when the plan entitles all modules).
    if (!f.entitlesAllModules) {
      const toAdd = f.moduleIds.filter((m) => !f.originalModuleIds.includes(m))
      const toRemove = f.originalModuleIds.filter((m) => !f.moduleIds.includes(m))
      for (const m of toAdd) await addPlanModule(f.id, m)
      for (const m of toRemove) await removePlanModule(f.id, m)
    }
    editDialog.value = false
    await load()
  } finally {
    savingEdit.value = false
  }
}

function moduleLabel(plan) {
  if (plan.entitlesAllModules) return 'All modules'
  return `${plan.moduleIds.length} of ${moduleCount.value} modules`
}
</script>

<template>
  <BasePage width="standard">
    <PageHeader :icon="IconLicense" title="Plans">
      <template #actions>
        <BaseButton v-if="canManage" variant="primary" @click="openCreate">
          <template #icon><IconPlus :size="16" /></template>
          New plan
        </BaseButton>
      </template>
    </PageHeader>

    <div v-if="loading" class="tw:flex tw:justify-center tw:py-16">
      <BaseSpinner />
    </div>

    <BaseEmptyState
      v-else-if="!plans.length"
      :icon="IconLicense"
      title="No plans yet"
      description="Create a plan to bundle modules and assign it to tenants."
    />

    <ContentGrid v-else min="20rem">
      <BaseCard v-for="plan in plans" :key="plan.id">
        <div class="tw:flex tw:flex-col tw:gap-3">
          <div class="tw:flex tw:items-start tw:justify-between tw:gap-2">
            <div>
              <div class="tw:flex tw:items-center tw:gap-2">
                <span class="tw:font-semibold tw:text-on-main">{{ plan.name }}</span>
                <BaseBadge v-if="!plan.isActive" class="tw:bg-gray-200 tw:text-gray-600">
                  Inactive
                </BaseBadge>
              </div>
              <p class="tw:font-mono tw:text-xs tw:text-secondary tw:mt-0.5">{{ plan.id }}</p>
            </div>
            <BaseButton
              v-if="canManage"
              variant="secondary"
              size="sm"
              iconOnly
              aria-label="Edit plan"
              @click="openEdit(plan)"
            >
              <template #icon><IconEdit :size="16" /></template>
            </BaseButton>
          </div>

          <p v-if="plan.description" class="tw:text-sm tw:text-secondary">{{ plan.description }}</p>

          <div class="tw:flex tw:items-center tw:gap-2 tw:text-sm">
            <IconInfinity v-if="plan.entitlesAllModules" :size="16" class="tw:text-primary" />
            <span class="tw:text-on-main">{{ moduleLabel(plan) }}</span>
          </div>

          <div class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-secondary">
            <span class="tw:font-semibold tw:text-on-main">{{ plan.subscriberCount }}</span>
            {{ plan.subscriberCount === 1 ? 'tenant' : 'tenants' }}
          </div>
        </div>
      </BaseCard>
    </ContentGrid>

    <!-- Create -->
    <BaseDialog v-model="createDialog" title="New plan">
      <div class="tw:flex tw:flex-col tw:gap-4">
        <BaseTextInput
          v-model="createForm.id"
          label="Plan id"
          placeholder="e.g. starter"
          hint="Lowercase letters, digits, underscore. Permanent — used as the key."
          :required="true"
        />
        <BaseTextInput
          v-model="createForm.name"
          label="Name"
          placeholder="Starter"
          :required="true"
        />
        <BaseTextarea v-model="createForm.description" label="Description" :rows="2" />
        <BaseSwitch v-model="createForm.entitlesAllModules" label="Entitle all modules" />
        <p class="tw:text-xs tw:text-secondary">
          "Entitle all modules" covers every current and future module — use it for an Unlimited
          tier. Otherwise pick the bundled modules after creating, via Edit.
        </p>
      </div>
      <template #footer="{ close }">
        <BaseButton variant="secondary" :disabled="creating" @click="close">Cancel</BaseButton>
        <BaseButton variant="primary" :disabled="creating" @click="handleCreate">
          {{ creating ? 'Creating…' : 'Create plan' }}
        </BaseButton>
      </template>
    </BaseDialog>

    <!-- Edit -->
    <BaseDialog v-if="editForm" v-model="editDialog" :title="`Edit ${editForm.name}`">
      <div class="tw:flex tw:flex-col tw:gap-4">
        <BaseTextInput v-model="editForm.name" label="Name" :required="true" />
        <BaseTextarea v-model="editForm.description" label="Description" :rows="2" />
        <div class="tw:flex tw:items-center tw:gap-6">
          <BaseSwitch v-model="editForm.isActive" label="Active" />
          <BaseSwitch v-model="editForm.entitlesAllModules" label="Entitle all modules" />
        </div>
        <div v-if="!editForm.entitlesAllModules">
          <p class="tw:text-secondary tw:text-xs tw:mb-1">Bundled modules</p>
          <BaseSelect
            v-model="editForm.moduleIds"
            :options="modules"
            optionLabel="name"
            optionValue="id"
            :multiple="true"
            placeholder="Select modules…"
          />
        </div>
        <p v-else class="tw:text-xs tw:text-secondary">
          This plan entitles every module; there is no per-module bundle to edit.
        </p>
      </div>
      <template #footer="{ close }">
        <BaseButton variant="secondary" :disabled="savingEdit" @click="close">Cancel</BaseButton>
        <BaseButton variant="primary" :disabled="savingEdit" @click="handleEdit">
          {{ savingEdit ? 'Saving…' : 'Save' }}
        </BaseButton>
      </template>
    </BaseDialog>
  </BasePage>
</template>
