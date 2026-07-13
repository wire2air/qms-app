<script setup>
// Platform Console — Tenant 360. Single tenant: metadata, lifecycle status,
// at-a-glance counts, and its users (metadata only — platform operators are
// outsiders to the tenant compliance boundary; no tenant CONTENT is shown).
import {
  IconBuildingCommunity,
  IconArrowLeft,
  IconUsers,
  IconCrown,
  IconMapPin,
  IconSitemap,
  IconSettings,
  IconKey,
  IconLockOpen,
  IconShieldOff,
  IconLicense,
  IconCircleCheck,
  IconCircleX,
} from '@tabler/icons-vue'
import {
  getCompany,
  listCompanyUsers,
  sendUserPasswordReset,
  unlockUser,
  resetUserMfa,
  getCompanyEntitlements,
  setCompanyPlan,
  setCompanyModule,
} from '@/api/platform.js'
import { hasPlatformRole } from '@/utils/currentSession.js'

const props = defineProps({
  companyId: { type: String, required: true },
})

const router = useRouter()

const company = ref(null)
const counts = ref({})
const users = ref([])
const loading = ref(true)
const canSetStatus = computed(() => hasPlatformRole('admin'))
const statusDialog = ref(false)

const stats = computed(() => [
  { label: 'Users', value: counts.value.users ?? '—', icon: IconUsers },
  { label: 'Owners', value: counts.value.owners ?? '—', icon: IconCrown },
  { label: 'Sites', value: counts.value.sites ?? '—', icon: IconMapPin },
  { label: 'Departments', value: counts.value.departments ?? '—', icon: IconSitemap },
])

const canSupport = computed(() => hasPlatformRole('support'))
const canAdmin = computed(() => hasPlatformRole('admin'))

// ── Entitlements (C2) ────────────────────────────────────────────────────────
const entitlement = ref({ subscription: null, plans: [], modules: [] })
const planDraft = ref(null)
const savingPlan = ref(false)
const modulePagination = ref({ page: 1, pageSize: 25 })
const moduleSort = ref([{ id: 'section', desc: false }])

const planDirty = computed(
  () => planDraft.value && planDraft.value !== entitlement.value.subscription?.planId,
)

const moduleColumns = computed(() => {
  const cols = [
    { name: 'name', label: 'MODULE', field: 'name', align: 'left', sortable: true },
    { name: 'section', label: 'SECTION', field: 'section', align: 'left', sortable: true },
    { name: 'entitled', label: 'ENTITLED', field: 'entitled', align: 'left', sortable: true },
    { name: 'source', label: 'SOURCE', field: 'source', align: 'left' },
  ]
  if (canAdmin.value) cols.push({ name: 'actions', label: '', field: 'actions', align: 'right' })
  return cols
})

function moduleMenuItems(row) {
  return [
    { name: 'Force on (add-on)', icon: IconCircleCheck, click: () => onSetModule(row, true) },
    { name: 'Force off (remove)', icon: IconCircleX, click: () => onSetModule(row, false) },
    {
      name: 'Reset to plan',
      icon: IconLicense,
      disabled: row.source !== 'override',
      click: () => onSetModule(row, null),
    },
  ]
}

async function loadEntitlements() {
  const data = await getCompanyEntitlements(props.companyId)
  entitlement.value = {
    subscription: data?.subscription || null,
    plans: data?.plans || [],
    modules: data?.modules || [],
  }
  planDraft.value = data?.subscription?.planId || null
}

async function onSavePlan() {
  if (!planDirty.value) return
  savingPlan.value = true
  try {
    await setCompanyPlan(props.companyId, planDraft.value)
    await loadEntitlements()
  } finally {
    savingPlan.value = false
  }
}

async function onSetModule(row, enabled) {
  await setCompanyModule(props.companyId, row.id, enabled)
  await loadEntitlements()
}

const userColumns = computed(() => {
  const cols = [
    { name: 'name', label: 'NAME', field: 'name', align: 'left', sortable: true },
    { name: 'email', label: 'EMAIL', field: 'email', align: 'left', sortable: true },
    { name: 'jobTitle', label: 'JOB TITLE', field: 'jobTitle', align: 'left' },
    { name: 'kind', label: 'KIND', field: 'kind', align: 'left' },
    { name: 'isOwner', label: 'OWNER', field: 'isOwner', align: 'left', sortable: true },
  ]
  if (canSupport.value) cols.push({ name: 'actions', label: '', field: 'actions', align: 'right' })
  return cols
})
const userPagination = ref({ page: 1, pageSize: 25 })
const userSort = ref([{ id: 'isOwner', desc: true }])

// ── Credential support ops ───────────────────────────────────────────────────
const CREDENTIAL_ACTIONS = {
  reset: {
    title: 'Send password reset',
    confirmLabel: 'Send reset email',
    danger: false,
    describe: (u) => `Email a single-use password-reset link to ${u.email} on their tenant.`,
    run: sendUserPasswordReset,
  },
  unlock: {
    title: 'Unlock account',
    confirmLabel: 'Unlock',
    danger: false,
    describe: (u) => `Clear the lockout on ${u.email} so they can sign in again.`,
    run: unlockUser,
  },
  mfa: {
    title: 'Reset MFA',
    confirmLabel: 'Reset MFA',
    danger: true,
    describe: (u) =>
      `Remove all MFA factors for ${u.email}. They will re-enrol on next login. Verify identity first.`,
    run: resetUserMfa,
  },
}

const actionDialog = ref(false)
const pendingKey = ref(null)
const pendingUser = ref(null)
const dialogCfg = computed(() => CREDENTIAL_ACTIONS[pendingKey.value] || {})

function openAction(key, user) {
  pendingKey.value = key
  pendingUser.value = user
  actionDialog.value = true
}

async function onCredentialConfirm(reason) {
  const cfg = CREDENTIAL_ACTIONS[pendingKey.value]
  if (!cfg || !pendingUser.value) return
  await cfg.run(props.companyId, pendingUser.value.id, reason)
  actionDialog.value = false
}

function userMenuItems(user) {
  const items = [
    { name: 'Send password reset', icon: IconKey, click: () => openAction('reset', user) },
    { name: 'Unlock account', icon: IconLockOpen, click: () => openAction('unlock', user) },
  ]
  if (canAdmin.value) {
    items.push({ name: 'Reset MFA', icon: IconShieldOff, click: () => openAction('mfa', user) })
  }
  return items
}

async function load() {
  loading.value = true
  try {
    const [detail, userData] = await Promise.all([
      getCompany(props.companyId),
      listCompanyUsers(props.companyId),
      loadEntitlements(),
    ])
    company.value = detail?.company || null
    counts.value = detail?.counts || {}
    users.value = (userData?.users || []).map((u) => ({
      ...u,
      name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || '—',
    }))
  } finally {
    loading.value = false
  }
}

onMounted(load)

function onStatusUpdated(newStatus) {
  if (company.value) company.value.status = newStatus
  load()
}
</script>

<template>
  <BasePage width="wide">
    <PageHeader :icon="IconBuildingCommunity" :title="company?.name || 'Tenant'">
      <template #actions>
        <BaseButton variant="secondary" @click="router.push('/platform/companies')">
          <template #icon><IconArrowLeft :size="16" /></template>
          All tenants
        </BaseButton>
        <BaseButton v-if="canSetStatus && company" variant="primary" @click="statusDialog = true">
          <template #icon><IconSettings :size="16" /></template>
          Set status
        </BaseButton>
      </template>
    </PageHeader>

    <div v-if="loading" class="tw:flex tw:justify-center tw:py-16">
      <BaseSpinner />
    </div>

    <template v-else-if="company">
      <!-- Summary -->
      <PageSection title="Summary" :icon="IconBuildingCommunity">
        <BaseCard>
          <div class="tw:grid tw:grid-cols-2 tw:gap-6 tw:md:grid-cols-4">
            <div>
              <p class="tw:text-secondary tw:text-xs tw:mb-1">Code</p>
              <p class="tw:font-mono tw:text-on-main">{{ company.code }}</p>
            </div>
            <div>
              <p class="tw:text-secondary tw:text-xs tw:mb-1">Status</p>
              <CompanyStatusBadge :status="company.status" />
            </div>
            <div>
              <p class="tw:text-secondary tw:text-xs tw:mb-1">Created</p>
              <p class="tw:text-on-main">{{ company.createdAt?.formatDate('date') || '—' }}</p>
            </div>
            <div>
              <p class="tw:text-secondary tw:text-xs tw:mb-1">Status changed</p>
              <p class="tw:text-on-main">
                {{ company.statusChangedAt?.formatDate('datetime') || '—' }}
              </p>
            </div>
            <div v-if="company.statusReason" class="tw:col-span-2 tw:md:col-span-4">
              <p class="tw:text-secondary tw:text-xs tw:mb-1">Status reason</p>
              <p class="tw:text-on-main">{{ company.statusReason }}</p>
            </div>
          </div>
        </BaseCard>
      </PageSection>

      <!-- Counts -->
      <ContentGrid min="12rem">
        <BaseCard v-for="s in stats" :key="s.label">
          <div class="tw:flex tw:items-center tw:gap-3">
            <div
              class="tw:flex tw:items-center tw:justify-center tw:rounded-lg tw:size-10 tw:bg-primary/10 tw:text-primary"
            >
              <component :is="s.icon" :size="20" />
            </div>
            <div>
              <p class="tw:text-2xl tw:font-bold tw:text-on-main tw:leading-none">{{ s.value }}</p>
              <p class="tw:text-secondary tw:text-xs tw:mt-1">{{ s.label }}</p>
            </div>
          </div>
        </BaseCard>
      </ContentGrid>

      <!-- Plan & Entitlements (C2) -->
      <PageSection title="Plan & Entitlements" :icon="IconLicense">
        <BaseCard>
          <div
            class="tw:flex tw:flex-col tw:gap-4 tw:sm:flex-row tw:sm:items-end tw:sm:justify-between"
          >
            <div class="tw:flex tw:flex-col tw:gap-1">
              <p class="tw:text-secondary tw:text-xs">Current plan</p>
              <div class="tw:flex tw:items-center tw:gap-2">
                <span class="tw:font-semibold tw:text-on-main">
                  {{ entitlement.subscription?.planName || 'No subscription' }}
                </span>
                <BaseBadge v-if="entitlement.subscription" class="tw:bg-gray-100 tw:text-gray-600">
                  {{ entitlement.subscription.status }}
                </BaseBadge>
              </div>
            </div>
            <div v-if="canAdmin" class="tw:flex tw:items-end tw:gap-2">
              <div class="tw:min-w-52">
                <p class="tw:text-secondary tw:text-xs tw:mb-1">Assign plan</p>
                <BaseSelect
                  v-model="planDraft"
                  :options="entitlement.plans"
                  optionLabel="name"
                  optionValue="id"
                  :required="true"
                />
              </div>
              <BaseButton
                variant="primary"
                :disabled="!planDirty || savingPlan"
                :loading="savingPlan"
                @click="onSavePlan"
              >
                Save
              </BaseButton>
            </div>
          </div>
        </BaseCard>

        <div class="tw:mt-4">
          <DataTable
            v-model:pagination="modulePagination"
            v-model:sort="moduleSort"
            :rows="entitlement.modules"
            :columns="moduleColumns"
            rowKey="id"
            :mobileCards="false"
            searchable
          >
            <template #body-cell-name="{ row }">
              <span class="tw:font-medium tw:text-on-main">{{ row.name }}</span>
            </template>
            <template #body-cell-section="{ row }">
              <span class="tw:text-sm tw:text-secondary">{{ row.section }}</span>
            </template>
            <template #body-cell-entitled="{ row }">
              <span
                v-if="row.entitled"
                class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:font-semibold tw:text-green-600"
              >
                <IconCircleCheck :size="14" /> Entitled
              </span>
              <span
                v-else
                class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:font-semibold tw:text-gray-500"
              >
                <IconCircleX :size="14" /> Not entitled
              </span>
            </template>
            <template #body-cell-source="{ row }">
              <BaseBadge v-if="row.source === 'override'" class="tw:bg-amber-100 tw:text-amber-700">
                Override{{ row.overrideEnabled === false ? ' (off)' : '' }}
              </BaseBadge>
              <span v-else class="tw:text-sm tw:text-secondary">Plan</span>
            </template>
            <template #body-cell-actions="{ row }">
              <div class="tw:flex tw:justify-end" @click.stop>
                <BaseMenu :items="moduleMenuItems(row)" />
              </div>
            </template>
          </DataTable>
        </div>
      </PageSection>

      <!-- Users -->
      <PageSection title="Users" :icon="IconUsers">
        <DataTable
          v-model:pagination="userPagination"
          v-model:sort="userSort"
          :rows="users"
          :columns="userColumns"
          rowKey="id"
          :mobileCards="false"
          searchable
        >
          <template #body-cell-name="{ row }">
            <div class="tw:font-medium tw:text-on-main">{{ row.name }}</div>
          </template>
          <template #body-cell-email="{ row }">
            <span class="tw:text-sm tw:text-secondary">{{ row.email }}</span>
          </template>
          <template #body-cell-jobTitle="{ row }">
            <span class="tw:text-sm tw:text-secondary">{{ row.jobTitle || '—' }}</span>
          </template>
          <template #body-cell-kind="{ row }">
            <span class="tw:text-sm tw:text-secondary">{{ row.kind || 'INTERNAL' }}</span>
          </template>
          <template #body-cell-isOwner="{ row }">
            <span
              v-if="row.isOwner"
              class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:font-semibold tw:text-amber-600"
            >
              <IconCrown :size="14" /> Owner
            </span>
            <span v-else class="tw:text-secondary tw:text-sm">—</span>
          </template>

          <template #body-cell-actions="{ row }">
            <div class="tw:flex tw:justify-end" @click.stop>
              <BaseMenu :items="userMenuItems(row)" />
            </div>
          </template>
        </DataTable>
      </PageSection>

      <CredentialActionDialog
        v-model="actionDialog"
        :title="dialogCfg.title"
        :confirmLabel="dialogCfg.confirmLabel"
        :danger="dialogCfg.danger"
        :description="pendingUser && dialogCfg.describe ? dialogCfg.describe(pendingUser) : ''"
        @confirm="onCredentialConfirm"
      />

      <CompanyStatusDialog v-model="statusDialog" :company="company" @updated="onStatusUpdated" />
    </template>

    <BaseEmptyState
      v-else
      :icon="IconBuildingCommunity"
      title="Tenant not found"
      description="This tenant may have been removed."
    />
  </BasePage>
</template>
