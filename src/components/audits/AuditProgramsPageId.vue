<script setup>
/**
 * Audit Program detail page.
 *
 * Layout mirrors AuditStandardsPageId: left column shows the program's
 * editable metadata + a recurrence/schedule card, right rail shows
 * Overview + the Auditor Pool. The program row carries the schedule;
 * the join table audit_program_auditors carries the rotating pool.
 *
 * Inline auto-save via debounce + PATCH. SyncEngine reads keep the FE
 * fresh; we never call .save() on the model itself because the BE
 * runs zod cross-field invariants the SyncEngine would skip.
 */
import {
  IconArrowBack,
  IconCalendarTime,
  IconUsers,
  IconPlus,
  IconTrash,
} from '@tabler/icons-vue'
import { isAllowed, currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
// Action RPCs (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { patch, post, del } from '@/api'

const props = defineProps({
  id: { type: String, required: true },
})

const toast = useToast()
const router = useRouter()

const program = useLiveQueryWithDeps([() => props.id], async (db, [id]) =>
  db.AuditProgram.findByPk(id),
)
const loading = computed(() => program.value === undefined)

const canUpdate = computed(() => isAllowed(['auditPrograms:update']))
const canDelete = computed(() => isAllowed(['auditPrograms:delete']))
const isOwner = computed(() => !!currentSession.value?.isOwner)
const isEditable = computed(() => canUpdate.value || isOwner.value)

const breadcrumbs = computed(() => [
  { label: 'Audits', to: getCompanyPath('/audits?tab=programs') },
  { label: 'Programs', to: getCompanyPath('/audits?tab=programs') },
  { label: program.value?.name || 'Loading…' },
])

// ─── Lookup-table labels (audit_program_types + audit_frequencies are
//     static enums — no SyncEngine model, just inline maps). ─────
const PROGRAM_TYPES = [
  { id: 'INTERNAL', name: 'Internal' },
  { id: 'EXTERNAL', name: 'External / Certification' },
  { id: 'SUPPLIER', name: 'Supplier' },
]
const FREQUENCIES = [
  { id: 'ONE_TIME', name: 'One-Time' },
  { id: 'MONTHLY', name: 'Monthly' },
  { id: 'QUARTERLY', name: 'Quarterly' },
  { id: 'SEMI_ANNUAL', name: 'Semi-Annual' },
  { id: 'ANNUAL', name: 'Annual' },
  { id: 'EVERY_X_DAYS', name: 'Every X Days' },
  { id: 'CUSTOM_RECURRENCE', name: 'Custom Cron' },
]
function freqLabel(id) {
  return FREQUENCIES.find((f) => f.id === id)?.name ?? id
}
function typeLabel(id) {
  return PROGRAM_TYPES.find((t) => t.id === id)?.name ?? id
}

// ─── Inline editing + auto-save ───────────────────────────────────
// The form is the program object itself, plus a yyyy-MM-dd string for
// nextDueDate (the DATE column round-trips as Luxon on read; the
// <input type="date"> needs a plain string). dirtyKey tracks WHICH
// field most recently changed so we can re-derive the cross-field
// blanking the BE does (frequency switch → null daysInterval/cron,
// type switch → null supplier) on the wire — same shape as
// normalizeBody() in the BE controller.
const nextDueDateStr = ref('')
const isFirstLoad = ref(true)
const saving = ref(false)
const saveError = ref(null)

function toDateInput(dt) {
  if (!dt) return ''
  if (dt.toFormat) return dt.toFormat('yyyy-LL-dd')
  return String(dt).slice(0, 10)
}

watch(
  program,
  (p) => {
    if (!p) return
    // Seed the local date-string once the model lands.
    if (isFirstLoad.value) {
      nextDueDateStr.value = toDateInput(p.nextDueDate)
      isFirstLoad.value = false
      return
    }
    if (!isEditable.value) return
    debouncedSave()
  },
  { deep: true },
)

watch(nextDueDateStr, () => {
  if (isFirstLoad.value || !isEditable.value) return
  debouncedSave()
})

const debouncedSave = useDebounceFn(async () => {
  const p = program.value
  if (!p) return
  saving.value = true
  saveError.value = null
  try {
    const payload = {
      name: p.name,
      description: p.description ?? null,
      programTypeId: p.programTypeId,
      auditStandardId: p.auditStandardId || null,
      frequencyId: p.frequencyId,
      daysInterval:
        p.frequencyId === 'EVERY_X_DAYS' ? Number(p.daysInterval) || null : null,
      cronExpression:
        p.frequencyId === 'CUSTOM_RECURRENCE' ? p.cronExpression || null : null,
      nextDueDate: nextDueDateStr.value || null,
      managerUserId: p.managerUserId || null,
      departmentId: p.departmentId || null,
      siteId: p.siteId || null,
      supplierId: p.programTypeId === 'SUPPLIER' ? p.supplierId || null : null,
      active: p.active,
    }
    await patch(`/v1/services/auditPrograms/${p.id}`, payload)
  } catch (e) {
    saveError.value = e.message || 'Failed to save'
    toast.error(saveError.value)
  } finally {
    saving.value = false
  }
}, 500)

// ─── Click-to-edit toggles ─────────────────────────────────────────
const editingName = ref(false)
const editingDescription = ref(false)

// ─── Auditor pool ─────────────────────────────────────────────────
const auditors = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [programId]) => {
    if (!programId) return []
    const rows = await db.AuditProgramAuditor.where('auditProgramId', programId).exec()
    return rows.sort((a, b) => {
      // LEAD first, then by createdAt asc.
      if (a.roleOnAudit !== b.roleOnAudit) {
        return a.roleOnAudit === 'LEAD' ? -1 : 1
      }
      return (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0)
    })
  },
  { initial: [] },
)

const showAddAuditorDialog = ref(false)
const addAuditorForm = ref({ userId: null, roleOnAudit: 'TEAM' })
const addingAuditor = ref(false)

watch(showAddAuditorDialog, (open) => {
  if (open) addAuditorForm.value = { userId: null, roleOnAudit: 'TEAM' }
})

async function handleAddAuditor() {
  if (!addAuditorForm.value.userId || addingAuditor.value) return
  addingAuditor.value = true
  try {
    await post(`/v1/services/auditPrograms/${props.id}/auditors`, {
      userId: addAuditorForm.value.userId,
      roleOnAudit: addAuditorForm.value.roleOnAudit,
    })
    toast.success('Auditor added')
    showAddAuditorDialog.value = false
  } catch (e) {
    toast.error(e.message || 'Failed to add auditor')
  } finally {
    addingAuditor.value = false
  }
}

async function toggleAuditorRole(auditor) {
  if (!isEditable.value) return
  const nextRole = auditor.roleOnAudit === 'LEAD' ? 'TEAM' : 'LEAD'
  try {
    await patch(
      `/v1/services/auditPrograms/${props.id}/auditors/${auditor.id}`,
      { roleOnAudit: nextRole },
    )
  } catch (e) {
    toast.error(e.message || 'Failed to update role')
  }
}

async function removeAuditor(auditor) {
  if (!isEditable.value) return
  try {
    await del(`/v1/services/auditPrograms/${props.id}/auditors/${auditor.id}`)
  } catch (e) {
    toast.error(e.message || 'Failed to remove auditor')
  }
}

// ─── Delete program ─────────────────────────────────────────────
const showDeleteDialog = ref(false)
const deleting = ref(false)

async function handleDelete() {
  if (!program.value?.id) return
  deleting.value = true
  try {
    await del(`/v1/services/auditPrograms/${program.value.id}`)
    toast.success('Program archived')
    showDeleteDialog.value = false
    router.push(getCompanyPath('/audits?tab=programs'))
  } catch (e) {
    toast.error(e.message || 'Failed to archive program')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:h-full">
    <SafeTeleport to="#main-header-title">
      <BaseBreadcrumbs :items="breadcrumbs" />
    </SafeTeleport>

    <SafeTeleport to="#main-header-actions">
      <div class="tw:flex tw:items-center tw:gap-2">
        <BaseButton
          v-if="program"
          variant="outline"
          size="sm"
          @click="router.push(getCompanyPath('/audits?tab=programs'))"
        >
          <IconArrowBack :size="16" class="tw:mr-1" />
          Back
        </BaseButton>
        <BaseButton
          v-if="canDelete && program"
          variant="danger"
          size="sm"
          :disabled="deleting"
          @click="showDeleteDialog = true"
        >
          Delete
        </BaseButton>
      </div>
    </SafeTeleport>

    <div v-if="loading" class="tw:flex tw:items-center tw:justify-center tw:h-full">
      <BaseSpinner size="lg" />
    </div>

    <BaseEmptyState
      v-else-if="!program"
      title="Program not found"
      description="This audit program could not be found."
    />

    <div v-else class="tw:overflow-y-auto tw:flex-1">
      <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
        <div class="tw:grid tw:grid-cols-1 tw:lg:grid-cols-[1fr_320px] tw:gap-4 tw:items-start">
          <!-- Left column -->
          <div class="tw:flex tw:flex-col tw:gap-4">
            <!-- Details card -->
            <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
              <div
                class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
              >
                Program Details
              </div>

              <BaseTextInput
                v-if="editingName && isEditable"
                v-model="program.name"
                placeholder="Program name"
                autofocus
                class="tw:mb-2"
                @blur="editingName = false"
              />
              <BaseClickableRow
                v-else
                class="tw:text-base tw:font-semibold tw:text-on-main tw:mb-2"
                :class="isEditable ? 'tw:cursor-pointer tw:hover:text-primary' : ''"
                :disabled="!isEditable"
                aria-label="Edit program name"
                @click="isEditable && (editingName = true)"
              >
                {{ program.name }}
              </BaseClickableRow>

              <div v-if="editingDescription && isEditable" class="tw:mb-4">
                <BaseTextarea
                  v-model="program.description"
                  :rows="3"
                  placeholder="Optional description"
                  @blur="editingDescription = false"
                />
              </div>
              <BaseClickableRow
                v-else
                class="tw:mb-4 tw:text-sm tw:text-secondary tw:leading-relaxed"
                :class="isEditable ? 'tw:cursor-pointer tw:hover:text-primary' : ''"
                :disabled="!isEditable"
                aria-label="Edit program description"
                @click="isEditable && (editingDescription = true)"
              >
                {{ program.description || (isEditable ? 'Add a description…' : '—') }}
              </BaseClickableRow>

              <div class="tw:grid tw:grid-cols-2 tw:gap-3">
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Type</div>
                  <BaseInlineSelect
                    v-if="isEditable"
                    v-model="program.programTypeId"
                    :items="PROGRAM_TYPES"
                    :required="true"
                  />
                  <span v-else class="tw:text-sm">{{ typeLabel(program.programTypeId) }}</span>
                </div>
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Standard</div>
                  <AuditStandardSelectMenu v-if="isEditable" v-model="program.auditStandardId" />
                  <AuditStandardBadgeById
                    v-else-if="program.auditStandardId"
                    :standardId="program.auditStandardId"
                  />
                  <span v-else class="tw:text-sm tw:text-secondary">—</span>
                </div>
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Manager</div>
                  <UserSelectMenu v-if="isEditable" v-model="program.managerUserId" />
                  <span v-else class="tw:text-sm tw:text-secondary">{{ program.managerUserId || '—' }}</span>
                </div>
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Department</div>
                  <DepartmentSelectMenu v-if="isEditable" v-model="program.departmentId" />
                  <DepartmentBadgeById
                    v-else-if="program.departmentId"
                    :departmentId="program.departmentId"
                  />
                  <span v-else class="tw:text-sm tw:text-secondary">—</span>
                </div>
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Site</div>
                  <SiteSelectMenu v-if="isEditable" v-model="program.siteId" />
                  <SiteBadgeById v-else-if="program.siteId" :siteId="program.siteId" />
                  <span v-else class="tw:text-sm tw:text-secondary">—</span>
                </div>
                <div
                  v-if="program.programTypeId === 'SUPPLIER'"
                  class="tw:flex tw:flex-col tw:gap-1"
                >
                  <div class="tw:text-xs tw:text-secondary">
                    Supplier <span class="tw:text-red-500">*</span>
                  </div>
                  <SupplierSelectMenu
                    v-if="isEditable"
                    v-model="program.supplierId"
                    :required="true"
                  />
                  <SupplierBadgeById
                    v-else-if="program.supplierId"
                    :supplierId="program.supplierId"
                  />
                  <span v-else class="tw:text-sm tw:text-secondary">—</span>
                </div>
              </div>
            </div>

            <!-- Schedule card -->
            <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
              <div
                class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-3 tw:border-b tw:border-divider tw:mb-4 tw:flex tw:items-center tw:gap-2"
              >
                <IconCalendarTime :size="14" />
                Schedule
              </div>
              <div class="tw:grid tw:grid-cols-2 tw:gap-3">
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Frequency</div>
                  <BaseInlineSelect
                    v-if="isEditable"
                    v-model="program.frequencyId"
                    :items="FREQUENCIES"
                    :required="true"
                  />
                  <span v-else class="tw:text-sm">{{ freqLabel(program.frequencyId) }}</span>
                </div>
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Next Due</div>
                  <BaseTextInput
                    v-if="isEditable"
                    v-model="nextDueDateStr"
                    type="date"
                  />
                  <span v-else class="tw:text-sm">
                    {{ program.nextDueDate ? program.nextDueDate.formatDate('date') : '—' }}
                  </span>
                </div>
                <div
                  v-if="program.frequencyId === 'EVERY_X_DAYS'"
                  class="tw:flex tw:flex-col tw:gap-1"
                >
                  <div class="tw:text-xs tw:text-secondary">
                    Days Interval <span class="tw:text-red-500">*</span>
                  </div>
                  <BaseTextInput
                    v-if="isEditable"
                    v-model="program.daysInterval"
                    type="number"
                    placeholder="e.g. 90"
                  />
                  <span v-else class="tw:text-sm">{{ program.daysInterval || '—' }}</span>
                </div>
                <div
                  v-if="program.frequencyId === 'CUSTOM_RECURRENCE'"
                  class="tw:flex tw:flex-col tw:gap-1 tw:col-span-2"
                >
                  <div class="tw:text-xs tw:text-secondary">
                    Cron Expression <span class="tw:text-red-500">*</span>
                  </div>
                  <BaseTextInput
                    v-if="isEditable"
                    v-model="program.cronExpression"
                    placeholder="0 0 1 */3 *"
                  />
                  <code v-else class="tw:text-xs">{{ program.cronExpression || '—' }}</code>
                </div>
              </div>
              <div
                class="tw:text-[11px] tw:text-secondary tw:italic tw:pt-3 tw:border-t tw:border-divider tw:mt-3"
              >
                The daily generator mints an Audit when nextDueDate ≤ today.
                Pausing a program stops new audits; existing audits keep running.
              </div>
            </div>

            <!-- Auditor pool card -->
            <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
              <div class="tw:flex tw:items-center tw:justify-between tw:pb-3 tw:border-b tw:border-divider tw:mb-4">
                <div
                  class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:flex tw:items-center tw:gap-2"
                >
                  <IconUsers :size="14" />
                  Auditor Pool
                  <span class="tw:font-normal tw:normal-case tw:text-secondary tw:ml-1">
                    {{ auditors.length }}
                  </span>
                </div>
                <BaseButton
                  v-if="isEditable"
                  variant="outline"
                  size="sm"
                  @click="showAddAuditorDialog = true"
                >
                  <template #icon><IconPlus :size="14" /></template>
                  Add
                </BaseButton>
              </div>

              <div
                v-if="!auditors.length"
                class="tw:py-8 tw:text-center tw:text-sm tw:text-secondary tw:italic"
              >
                No auditors assigned yet.
              </div>
              <div v-else class="tw:flex tw:flex-col tw:divide-y tw:divide-divider">
                <div
                  v-for="auditor in auditors"
                  :key="auditor.id"
                  class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:py-2"
                >
                  <div class="tw:flex tw:items-center tw:gap-2 tw:min-w-0">
                    <UserBadgeById :userId="auditor.userId" />
                    <button
                      type="button"
                      class="tw:text-[10px] tw:font-semibold tw:uppercase tw:tracking-wide tw:rounded tw:px-2 tw:py-0.5 tw:cursor-pointer tw:border-0"
                      :class="
                        auditor.roleOnAudit === 'LEAD'
                          ? 'tw:bg-amber-100 tw:text-amber-700'
                          : 'tw:bg-blue-100 tw:text-blue-700'
                      "
                      :title="isEditable ? 'Click to toggle LEAD / TEAM' : ''"
                      :disabled="!isEditable"
                      @click="toggleAuditorRole(auditor)"
                    >
                      {{ auditor.roleOnAudit }}
                    </button>
                  </div>
                  <button
                    v-if="isEditable"
                    type="button"
                    class="tw:text-red-600 tw:hover:bg-red-50 tw:rounded tw:p-1 tw:cursor-pointer tw:bg-transparent tw:border-0"
                    title="Remove from pool"
                    @click="removeAuditor(auditor)"
                  >
                    <IconTrash :size="14" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Right column / Overview -->
          <div class="tw:flex tw:flex-col tw:gap-3">
            <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4">
              <div
                class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-2 tw:border-b tw:border-divider tw:mb-3"
              >
                Overview
              </div>
              <div class="tw:flex tw:flex-col">
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">Active</span>
                  <BaseSwitch v-if="isEditable" v-model="program.active" />
                  <span
                    v-else
                    class="tw:text-[10px] tw:font-semibold tw:uppercase tw:tracking-wide tw:rounded tw:px-2 tw:py-0.5"
                    :class="
                      program.active
                        ? 'tw:bg-emerald-100 tw:text-emerald-700'
                        : 'tw:bg-gray-100 tw:text-gray-600'
                    "
                  >
                    {{ program.active ? 'Active' : 'Paused' }}
                  </span>
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">Created</span>
                  <span class="tw:text-xs">
                    {{ program.createdAt ? program.createdAt.formatDate('date') : '—' }}
                  </span>
                </div>
                <div v-if="saving" class="tw:text-[11px] tw:text-secondary tw:italic tw:pt-1">
                  Saving…
                </div>
                <div v-else-if="saveError" class="tw:text-[11px] tw:text-red-600 tw:pt-1">
                  {{ saveError }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <BaseDialog v-model="showAddAuditorDialog" title="Add Auditor" maxWidth="md">
      <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
            User <span class="tw:text-red-500">*</span>
          </p>
          <UserSelectMenu v-model="addAuditorForm.userId" />
        </div>
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Role</p>
          <BaseInlineSelect
            v-model="addAuditorForm.roleOnAudit"
            :items="[
              { id: 'TEAM', name: 'Team Member' },
              { id: 'LEAD', name: 'Lead Auditor' },
            ]"
            :required="true"
          />
          <p class="tw:text-[11px] tw:text-secondary tw:mt-1">
            LEAD users rotate into AuditInstance.leadAuditorUserId at generate-time.
            TEAM users go onto AuditTeamMember.
          </p>
        </div>
      </div>
      <template #footer>
        <BaseButton variant="outline" :disabled="addingAuditor" @click="showAddAuditorDialog = false">
          Cancel
        </BaseButton>
        <BaseButton
          variant="primary"
          :loading="addingAuditor"
          :disabled="addingAuditor || !addAuditorForm.userId"
          @click="handleAddAuditor"
        >
          Add
        </BaseButton>
      </template>
    </BaseDialog>

    <BaseDialog v-model="showDeleteDialog" title="Archive Program" maxWidth="md">
      <p class="tw:text-sm tw:text-on-main tw:mb-3">
        Archive <strong>{{ program?.name }}</strong>?
        Existing audit instances spawned from this program stay intact; the
        generator just stops minting new ones.
      </p>
      <div class="tw:flex tw:justify-end tw:gap-2 tw:pt-3 tw:border-t tw:border-divider">
        <BaseButton variant="outline" :disabled="deleting" @click="showDeleteDialog = false">
          Cancel
        </BaseButton>
        <BaseButton variant="danger" :disabled="deleting" @click="handleDelete">
          {{ deleting ? 'Archiving…' : 'Archive' }}
        </BaseButton>
      </div>
    </BaseDialog>
  </div>
</template>
