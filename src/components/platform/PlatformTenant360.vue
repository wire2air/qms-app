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
  IconAlertTriangle,
  IconTrash,
  IconLock,
  IconClock,
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
  getBlastRadius,
  requestCompanyPurge,
  setLegalHold,
  cancelApproval,
} from '@/api/platform.js'
import { hasPlatformRole } from '@/utils/currentSession.js'
import { useConfirm } from '@shared/composables/useConfirm.js'
import { useToast } from '@shared/composables/useToast.js'
import { useStepUp } from '@/composables/useStepUp'

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

// ── Danger Zone (governance) ─────────────────────────────────────────────────
const { confirm } = useConfirm()
const toast = useToast()
const { stepUpOpen, run, onVerified } = useStepUp()
const blast = ref(null)
const legalHoldBusy = ref(false)
const legalHoldDialog = ref(false)
const purgeDialog = ref(false)
const purgeForm = ref({ reason: '', delayHours: 72, confirmCode: '' })
const purgeReasonError = ref('')
const purgeBusy = ref(false)

const legalHold = computed(() => blast.value?.company?.legalHold)
const openPurge = computed(() => blast.value?.openRequest || null)
const canRequestPurge = computed(
  () => blast.value?.company?.status === 'cancelled' && !legalHold.value && !openPurge.value,
)
const purgeConfirmOk = computed(
  () =>
    purgeForm.value.confirmCode.trim().toLowerCase() ===
    (blast.value?.company?.code || '').toLowerCase(),
)

async function loadBlast() {
  blast.value = await getBlastRadius(props.companyId)
}

async function onToggleLegalHold() {
  if (legalHold.value) {
    const ok = await confirm({
      title: 'Clear legal hold',
      message: `Remove the legal hold on ${company.value?.name}? Purge becomes possible again.`,
      okLabel: 'Clear hold',
    })
    if (!ok) return
    legalHoldBusy.value = true
    try {
      await run(async () => {
        await setLegalHold(props.companyId, false)
        await loadBlast()
      })
    } finally {
      legalHoldBusy.value = false
    }
  } else {
    legalHoldDialog.value = true
  }
}

async function onPlaceLegalHold(reason) {
  legalHoldBusy.value = true
  try {
    await run(async () => {
      await setLegalHold(props.companyId, true, reason)
      legalHoldDialog.value = false
      await loadBlast()
    })
  } finally {
    legalHoldBusy.value = false
  }
}

function openPurgeDialog() {
  purgeForm.value = { reason: '', delayHours: 72, confirmCode: '' }
  purgeDialog.value = true
}

async function onRequestPurge() {
  const f = purgeForm.value
  if (!f.reason.trim()) {
    purgeReasonError.value = 'A reason is required'
    return
  }
  if (!purgeConfirmOk.value) {
    toast.notify({ type: 'negative', message: 'Type the tenant code to confirm' })
    return
  }
  purgeBusy.value = true
  try {
    await run(async () => {
      await requestCompanyPurge(props.companyId, {
        reason: f.reason.trim(),
        delayHours: Number(f.delayHours) || 72,
      })
      purgeDialog.value = false
      await loadBlast()
    })
  } finally {
    purgeBusy.value = false
  }
}

async function onCancelPurge() {
  const ok = await confirm({
    title: 'Cancel scheduled purge',
    message: 'Cancel the scheduled purge for this tenant?',
    okLabel: 'Cancel purge',
    danger: true,
  })
  if (!ok) return
  await cancelApproval(openPurge.value.id, 'Cancelled from Tenant 360')
  await loadBlast()
}

async function load() {
  loading.value = true
  try {
    const [detail, userData] = await Promise.all([
      getCompany(props.companyId),
      listCompanyUsers(props.companyId),
      loadEntitlements(),
      loadBlast(),
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
              <p class="tw:text-on-main">{{ company.code }}</p>
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

      <!-- Danger Zone (governance) -->
      <PageSection v-if="canAdmin && blast" title="Danger Zone" :icon="IconAlertTriangle">
        <BaseCard class="tw:border tw:border-red-200 dark:tw:border-red-900/50">
          <div class="tw:flex tw:flex-col tw:gap-5">
            <!-- Legal hold -->
            <div class="tw:flex tw:items-start tw:justify-between tw:gap-4">
              <div>
                <div class="tw:flex tw:items-center tw:gap-2">
                  <component :is="legalHold ? IconLock : IconLockOpen" :size="16" />
                  <span class="tw:font-semibold tw:text-on-main">Legal hold</span>
                  <BaseBadge v-if="legalHold" class="tw:bg-indigo-100 tw:text-indigo-700">
                    On hold
                  </BaseBadge>
                </div>
                <p class="tw:text-sm tw:text-secondary tw:mt-1">
                  A legal hold vetoes purge — the tenant can't be destroyed while held.
                  <span v-if="legalHold && blast.company.legalHoldReason">
                    Reason: {{ blast.company.legalHoldReason }}
                  </span>
                </p>
              </div>
              <BaseButton
                :variant="legalHold ? 'secondary' : 'primary'"
                size="sm"
                :disabled="legalHoldBusy"
                @click="onToggleLegalHold"
              >
                {{ legalHold ? 'Clear hold' : 'Place hold' }}
              </BaseButton>
            </div>

            <hr class="tw:border-red-100 dark:tw:border-red-900/40" />

            <!-- Blast radius + purge -->
            <div>
              <div class="tw:flex tw:items-center tw:gap-2">
                <IconTrash :size="16" class="tw:text-red-600" />
                <span class="tw:font-semibold tw:text-on-main">Purge tenant</span>
              </div>
              <p class="tw:text-sm tw:text-secondary tw:mt-1">
                Irreversibly deletes this tenant and all its data across
                <span class="tw:font-semibold">{{ blast.tablesSwept }}</span> tables. Requires a
                second operator's approval and a cooling-off window before it runs.
              </p>

              <div class="tw:mt-3 tw:flex tw:flex-wrap tw:gap-2">
                <span
                  v-for="c in blast.counts"
                  :key="c.label"
                  class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded-md tw:bg-gray-100 dark:tw:bg-gray-800 tw:px-2 tw:py-1 tw:text-xs"
                >
                  <span class="tw:font-semibold tw:text-on-main">{{ c.count }}</span>
                  <span class="tw:text-secondary">{{ c.label }}</span>
                </span>
              </div>

              <!-- Open request state -->
              <div
                v-if="openPurge"
                class="tw:mt-4 tw:flex tw:items-center tw:justify-between tw:gap-3 tw:rounded-lg tw:bg-amber-50 dark:tw:bg-amber-950/30 tw:px-3 tw:py-2"
              >
                <div class="tw:flex tw:items-center tw:gap-2 tw:text-sm">
                  <IconClock :size="16" class="tw:text-amber-600" />
                  <span class="tw:text-on-main">
                    Purge {{ openPurge.status }}
                    <template v-if="openPurge.status === 'approved' && openPurge.executeAfter">
                      — runs {{ openPurge.executeAfter?.formatDate('datetime') }}
                    </template>
                    <template v-else> — awaiting a second operator's approval </template>
                  </span>
                </div>
                <BaseButton variant="secondary" size="sm" @click="onCancelPurge">Cancel</BaseButton>
              </div>

              <!-- Request button -->
              <div v-else class="tw:mt-4">
                <BaseTooltip
                  v-if="!canRequestPurge"
                  :text="
                    legalHold
                      ? 'Tenant is under legal hold'
                      : 'Tenant must be cancelled before it can be purged'
                  "
                >
                  <BaseButton variant="danger" size="sm" disabled>
                    <template #icon><IconTrash :size="16" /></template>
                    Request purge
                  </BaseButton>
                </BaseTooltip>
                <BaseButton v-else variant="danger" size="sm" @click="openPurgeDialog">
                  <template #icon><IconTrash :size="16" /></template>
                  Request purge
                </BaseButton>
              </div>
            </div>
          </div>
        </BaseCard>
      </PageSection>

      <CredentialActionDialog
        v-model="actionDialog"
        :title="dialogCfg.title"
        :confirmLabel="dialogCfg.confirmLabel"
        :danger="dialogCfg.danger"
        :description="pendingUser && dialogCfg.describe ? dialogCfg.describe(pendingUser) : ''"
        @confirm="onCredentialConfirm"
      />

      <CredentialActionDialog
        v-model="legalHoldDialog"
        title="Place legal hold"
        confirmLabel="Place hold"
        :description="`Place a legal hold on ${company?.name}. Purge will be blocked until the hold is cleared.`"
        @confirm="onPlaceLegalHold"
      />

      <BaseDialog v-model="purgeDialog" title="Request tenant purge">
        <div class="tw:flex tw:flex-col tw:gap-4">
          <div
            class="tw:flex tw:items-start tw:gap-2 tw:rounded-lg tw:bg-red-50 dark:tw:bg-red-950/30 tw:p-3"
          >
            <IconAlertTriangle :size="18" class="tw:text-red-600 tw:mt-0.5 tw:shrink-0" />
            <p class="tw:text-sm tw:text-on-main">
              This requests the irreversible deletion of
              <span class="tw:font-semibold">{{ company?.name }}</span> and all its data. It runs
              only after a second operator approves and the cooling-off window elapses.
            </p>
          </div>
          <BaseTextarea v-model="purgeForm.reason" label="Reason" :rows="2" :required="true" @input="purgeReasonError = ''" />
          <p v-if="purgeReasonError" class="tw:text-xs tw:text-bad">{{ purgeReasonError }}</p>
          <BaseTextInput
            v-model="purgeForm.delayHours"
            type="number"
            label="Cooling-off window (hours)"
            hint="Delay before the purge runs once approved. Default 72h."
          />
          <BaseTextInput
            v-model="purgeForm.confirmCode"
            :label="`Type the tenant code (${company?.code}) to confirm`"
            :placeholder="company?.code"
          />
        </div>
        <template #footer="{ close }">
          <BaseButton variant="secondary" :disabled="purgeBusy" @click="close">Cancel</BaseButton>
          <BaseButton
            variant="danger"
            :disabled="purgeBusy || !purgeConfirmOk || !purgeForm.reason.trim()"
            @click="onRequestPurge"
          >
            {{ purgeBusy ? 'Requesting…' : 'Request purge' }}
          </BaseButton>
        </template>
      </BaseDialog>

      <CompanyStatusDialog v-model="statusDialog" :company="company" @updated="onStatusUpdated" />

      <StepUpDialog v-model="stepUpOpen" @verified="onVerified" />
    </template>

    <BaseEmptyState
      v-else
      :icon="IconBuildingCommunity"
      title="Tenant not found"
      description="This tenant may have been removed."
    />
  </BasePage>
</template>
