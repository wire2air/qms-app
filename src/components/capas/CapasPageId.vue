<script setup>
import { currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { post } from '@/api'
import { DateTime } from 'luxon'

const props = defineProps({
  id: { type: String, required: true },
})

const router = useRouter()

const capa = useLiveQueryWithDeps([() => props.id], async (db, [id]) => db.Capa.findByPk(id))

const loading = computed(() => capa.value === undefined)

const breadcrumbs = computed(() => [
  { label: 'CAPAs', to: getCompanyPath('/capas') },
  { label: capa.value?.capaNumber || capa.value?.title || 'Loading…' },
])

const isFirstLoad = ref(true)
const isEditable = computed(
  () => capa.value && capa.value.statusId !== 'CLOSED' && capa.value.statusId !== 'VERIFIED',
)

const debouncedSave = useDebounceFn(async () => {
  if (!capa.value) return
  await capa.value.save()
}, 500)

watch(
  capa,
  () => {
    if (isFirstLoad.value) {
      isFirstLoad.value = false
      return
    }
    if (capa.value) debouncedSave()
  },
  { deep: true },
)

const saving = ref(false)
const saveError = ref(null)

const showCloseDialog = ref(false)
const closing = ref(false)

const isOwner = computed(
  () => capa.value?.ownerId && capa.value.ownerId === currentSession.value?.userId,
)

async function handleCloseCapa() {
  if (!capa.value) return
  closing.value = true
  saveError.value = null
  try {
    await post(`/v1/services/capas/${props.id}/close`, {})
    showCloseDialog.value = false
    router.push(getCompanyPath('/capas'))
  } catch (e) {
    saveError.value = e.message || 'Failed to close CAPA'
  } finally {
    closing.value = false
  }
}

async function handleSubmitForReview() {
  if (!capa.value) return
  saving.value = true
  try {
    await post(`/v1/services/capas/${props.id}/submitForReview`, {})
  } catch (e) {
    saveError.value = e.message || 'Failed to submit for review'
  } finally {
    saving.value = false
  }
}

const isOverdue = computed(() => {
  if (!capa.value?.dueDate) return false
  if (capa.value.statusId === 'CLOSED') return false
  return capa.value.dueDate < DateTime.now()
})

const workflowInstance = useLiveQueryWithDeps([() => props.id], async (db, [id]) => {
  const results = await db.WorkflowInstance.where('[resourceType+resourceId]', ['Capa', id]).exec()
  return results.find((i) => i.statusId === 'IN_PROGRESS') || results[0] || null
})

// Resolve the WorkflowVersion (for label + workflowId link target). Prefer the
// instance's version; fall back to the CAPA's directly-assigned version if no
// instance exists yet (DRAFT CAPAs).
const workflowVersion = useLiveQueryWithDeps(
  [() => workflowInstance.value?.workflowVersionId ?? capa.value?.workflowVersionId],
  async (db, [versionId]) => {
    if (!versionId) return null
    return db.WorkflowVersion.findByPk(versionId)
  },
)

const workflow = useLiveQueryWithDeps(
  [() => workflowVersion.value?.workflowId],
  async (db, [workflowId]) => {
    if (!workflowId) return null
    return db.Workflow.findByPk(workflowId)
  },
)

function workflowVersionLabel(v) {
  if (!v) return ''
  return v.versionLabel || `${v.versionMajor ?? 1}.${v.versionMinor ?? 0}`
}

// Resolve the originating Nonconformance only when this CAPA was spawned
// from one (source_type='NC' → source_id points at a Nonconformance row).
const sourceNc = useLiveQueryWithDeps(
  [() => capa.value?.sourceType, () => capa.value?.sourceId],
  async (db, [sourceType, sourceId]) => {
    if (sourceType !== 'NC' || !sourceId) return null
    return db.Nonconformance.findByPk(sourceId)
  },
)

const editingTitle = ref(false)
const editingDescription = ref(false)
</script>

<template>
  <div class="tw:flex tw:flex-col tw:h-full">
    <SafeTeleport to="#main-header-title">
      <BaseBreadcrumbs :items="breadcrumbs" />
    </SafeTeleport>

    <SafeTeleport to="#main-header-actions">
      <div class="tw:flex tw:items-center tw:gap-2">
        <TaskActionBar v-if="capa?.id" entityType="Capa" :entityId="capa.id" />
        <BaseButton
          v-if="capa?.statusId === 'DRAFT'"
          variant="primary"
          :disabled="saving"
          @click="handleSubmitForReview"
        >
          Submit for review
        </BaseButton>
        <BaseButton
          v-if="isOwner && capa?.statusId !== 'CLOSED'"
          variant="danger"
          :disabled="closing"
          @click="showCloseDialog = true"
        >
          Close CAPA
        </BaseButton>
      </div>
    </SafeTeleport>

    <div v-if="loading" class="tw:flex tw:items-center tw:justify-center tw:h-full">
      <div
        class="tw:animate-spin tw:rounded-full tw:w-8 tw:h-8 tw:border-2 tw:border-primary tw:border-t-transparent"
      />
    </div>

    <div v-else-if="capa" class="tw:overflow-y-auto tw:flex-1">
      <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
        <div class="tw:grid tw:grid-cols-1 tw:lg:grid-cols-[1fr_280px] tw:gap-4 tw:items-start">
          <!-- Left column -->
          <div class="tw:flex tw:flex-col tw:gap-4">
            <!-- CAPA Details -->
            <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
              <div
                class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
              >
                CAPA Details
              </div>

              <BaseTextInput
                v-if="editingTitle && isEditable"
                v-model="capa.title"
                placeholder="CAPA title"
                autofocus
                class="tw:mb-2"
                @blur="editingTitle = false"
              />
              <div
                v-else
                class="tw:text-base tw:font-semibold tw:text-on-main tw:mb-2"
                :class="isEditable ? 'tw:cursor-pointer tw:hover:text-primary' : ''"
                @click="isEditable && (editingTitle = true)"
              >
                {{ capa.title }}
              </div>

              <BaseTextarea
                v-if="editingDescription && isEditable"
                v-model="capa.description"
                placeholder="Add a description…"
                autofocus
                rows="3"
                class="tw:mb-4"
                @blur="editingDescription = false"
              />
              <div v-else class="tw:mb-4" @click="isEditable && (editingDescription = true)">
                <p
                  class="tw:text-sm tw:text-secondary tw:leading-relaxed tw:whitespace-pre-wrap"
                  :class="isEditable ? 'tw:cursor-pointer tw:hover:text-primary' : ''"
                >
                  {{ capa.description || (isEditable ? 'Add a description…' : '—') }}
                </p>
              </div>

              <div class="tw:grid tw:grid-cols-3 tw:gap-3">
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Priority</div>
                  <CapaPriorityBadgeById :priorityId="capa.priorityId" />
                </div>
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Type</div>
                  <CapaTypeBadgeById :typeId="capa.typeId" />
                </div>
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Source</div>
                  <CapaSourceBadgeById :sourceId="capa.sourceType" />
                </div>
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Initiated</div>
                  <span class="tw:text-sm tw:font-medium">
                    {{ capa.initiatedAt?.formatDate('date') || '—' }}
                  </span>
                </div>
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Due</div>
                  <span
                    class="tw:text-sm tw:font-medium"
                    :class="isOverdue ? 'tw:text-red-600' : ''"
                  >
                    {{ capa.dueDate?.formatDate('date') || '—' }}
                  </span>
                </div>
                <div v-if="sourceNc" class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Source NC</div>
                  <RouterLink
                    :to="getCompanyPath(`/nonconformances/${sourceNc.id}`)"
                    class="tw:text-sm tw:font-mono tw:font-medium tw:text-primary tw:hover:underline"
                  >
                    {{ sourceNc.ncNumber }}
                  </RouterLink>
                </div>
              </div>
            </div>

            <!-- Workflow steps -->
            <CapaWorkflowDetail
              :capaId="id"
              :workflowInstanceId="workflowInstance?.id"
              :isOwner="isOwner"
            />

            <!-- Action plan -->
            <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
              <div
                class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
              >
                Action plan
              </div>

              <div class="tw:flex tw:flex-col tw:gap-4">
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase">
                    Root cause
                  </label>
                  <BaseTextarea
                    v-if="isEditable"
                    v-model="capa.rootCause"
                    placeholder="What caused this?"
                    :rows="3"
                  />
                  <p v-else class="tw:text-sm tw:text-on-main tw:whitespace-pre-wrap">
                    {{ capa.rootCause || '—' }}
                  </p>
                </div>

                <div class="tw:flex tw:flex-col tw:gap-1">
                  <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase">
                    Corrective action
                  </label>
                  <BaseTextarea
                    v-if="isEditable"
                    v-model="capa.correctiveAction"
                    placeholder="How will the existing problem be eliminated?"
                    :rows="3"
                  />
                  <p v-else class="tw:text-sm tw:text-on-main tw:whitespace-pre-wrap">
                    {{ capa.correctiveAction || '—' }}
                  </p>
                </div>

                <div class="tw:flex tw:flex-col tw:gap-1">
                  <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase">
                    Preventive action
                  </label>
                  <BaseTextarea
                    v-if="isEditable"
                    v-model="capa.preventiveAction"
                    placeholder="How will recurrence be prevented?"
                    :rows="3"
                  />
                  <p v-else class="tw:text-sm tw:text-on-main tw:whitespace-pre-wrap">
                    {{ capa.preventiveAction || '—' }}
                  </p>
                </div>

                <div class="tw:flex tw:flex-col tw:gap-1">
                  <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase">
                    Effectiveness verification
                  </label>
                  <BaseTextarea
                    v-if="isEditable"
                    v-model="capa.effectivenessVerification"
                    placeholder="How was effectiveness verified?"
                    :rows="3"
                  />
                  <p v-else class="tw:text-sm tw:text-on-main tw:whitespace-pre-wrap">
                    {{ capa.effectivenessVerification || '—' }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Effectiveness Check (post-closure follow-up) -->
            <CapaEffectivenessCheckCard :capaId="id" :isOwner="isOwner" />
          </div>

          <!-- Right column -->
          <div class="tw:flex tw:flex-col tw:gap-4">
            <!-- Meta card -->
            <aside
              class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5 tw:flex! tw:flex-col tw:gap-4"
            >
              <div class="tw:flex tw:flex-col tw:gap-1">
                <div class="tw:text-xs tw:text-secondary tw:uppercase tw:font-semibold">Number</div>
                <div class="tw:text-sm tw:font-mono tw:text-on-main">{{ capa.capaNumber }}</div>
              </div>
              <div class="tw:flex tw:flex-col tw:gap-1">
                <div class="tw:text-xs tw:text-secondary tw:uppercase tw:font-semibold">Status</div>
                <CapaStatusBadgeById :statusId="capa.statusId" />
              </div>
              <div class="tw:flex tw:flex-col tw:gap-1">
                <div class="tw:text-xs tw:text-secondary tw:uppercase tw:font-semibold">Owner</div>
                <UserBadgeById :userId="capa.ownerId" />
              </div>
              <div class="tw:flex tw:flex-col tw:gap-1">
                <div class="tw:text-xs tw:text-secondary tw:uppercase tw:font-semibold">Site</div>
                <SiteBadgeById :siteId="capa.siteId" />
              </div>
              <div class="tw:flex tw:flex-col tw:gap-1">
                <div class="tw:text-xs tw:text-secondary tw:uppercase tw:font-semibold">
                  Department
                </div>
                <DepartmentBadgeById :departmentId="capa.departmentId" />
              </div>
              <div v-if="capa.verifiedAt" class="tw:flex tw:flex-col tw:gap-1">
                <div class="tw:text-xs tw:text-secondary tw:uppercase tw:font-semibold">
                  Verified
                </div>
                <span class="tw:text-sm tw:text-on-main">
                  {{ capa.verifiedAt.formatDate('dateTime') }}
                </span>
              </div>
              <div v-if="capa.closedAt" class="tw:flex tw:flex-col tw:gap-1">
                <div class="tw:text-xs tw:text-secondary tw:uppercase tw:font-semibold">Closed</div>
                <span class="tw:text-sm tw:text-on-main">
                  {{ capa.closedAt.formatDate('dateTime') }}
                </span>
              </div>
            </aside>

            <!-- Workflow template card -->
            <RouterLink
              v-if="workflow && workflowVersion"
              :to="
                getCompanyPath(
                  `/workflow-templates/${workflow.id}?version=${encodeURIComponent(
                    workflowVersionLabel(workflowVersion),
                  )}`,
                )
              "
              class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5 tw:flex tw:flex-col tw:gap-2 tw:hover:border-primary tw:hover:bg-main-hover tw:transition-colors"
            >
              <div class="tw:text-xs tw:text-secondary tw:uppercase tw:font-semibold">
                Workflow template
              </div>
              <div class="tw:flex tw:items-center tw:justify-between tw:gap-2">
                <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:truncate">
                  {{ workflow.name }}
                </span>
                <span
                  class="tw:text-xs tw:font-mono tw:text-secondary tw:bg-main-hover tw:px-2 tw:py-0.5 tw:rounded"
                >
                  v{{ workflowVersionLabel(workflowVersion) }}
                </span>
              </div>
            </RouterLink>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="tw:p-5">
      <BaseEmptyState
        :icon="null"
        title="CAPA not found"
        description="This CAPA could not be found."
      />
    </div>

    <ConfirmDialog
      v-model="showCloseDialog"
      title="Close CAPA?"
      message="Are you sure you want to close this CAPA? This will cancel any in-progress workflow."
      confirmLabel="Close CAPA"
      variant="danger"
      @confirm="handleCloseCapa"
    />
  </div>
</template>
