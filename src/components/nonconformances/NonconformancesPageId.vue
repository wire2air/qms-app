<script setup>
import { IconAlertTriangle } from '@tabler/icons-vue'
import { currentSession, isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { post } from '@/api'
import { DateTime } from 'luxon'

const props = defineProps({
  id: { type: String, required: true },
})

const router = useRouter()

const nc = useLiveQueryWithDeps([() => props.id], async (db, [id]) =>
  db.Nonconformance.findByPk(id),
)

const loading = computed(() => nc.value === undefined)

const breadcrumbs = computed(() => [
  { label: 'Nonconformances', to: getCompanyPath('/nonconformances') },
  { label: nc.value?.ncNumber || nc.value?.title || 'Loading…' },
])

// ─── Inline disposition auto-save ─────────────────────────────────────────────
const isFirstLoad = ref(true)
const canUpdate = computed(() => isAllowed(['nonconformances:update']))
const isEditable = computed(
  () =>
    nc.value &&
    nc.value.statusId !== 'CLOSED' &&
    nc.value.statusId !== 'VOID' &&
    canUpdate.value,
)

const debouncedSave = useDebounceFn(async () => {
  if (!nc.value) return
  await nc.value.save()
}, 500)

watch(
  nc,
  () => {
    if (isFirstLoad.value) {
      isFirstLoad.value = false
      return
    }
    if (nc.value) debouncedSave()
  },
  { deep: true },
)

const saving = ref(false)
const saveError = ref(null)

// ─── Close NC (owner only) ────────────────────────────────────────────────────
const showCloseDialog = ref(false)
const closing = ref(false)

const isOwner = computed(
  () => nc.value?.ownerId && nc.value.ownerId === currentSession.value?.userId,
)

async function handleCloseNc() {
  if (!nc.value) return
  closing.value = true
  saveError.value = null
  try {
    await post(`/v1/services/nonconformances/${props.id}/close`, {})
    showCloseDialog.value = false
    router.push(getCompanyPath('/nonconformances'))
  } catch (e) {
    saveError.value = e.message || 'Failed to close NC'
  } finally {
    closing.value = false
  }
}

async function handleSubmitForReview() {
  if (!nc.value) return
  saving.value = true
  try {
    await post(`/v1/services/nonconformances/${props.id}/submitForReview`, {})
  } catch (e) {
    saveError.value = e.message || 'Failed to submit for review'
  } finally {
    saving.value = false
  }
}

const isOverdue = computed(() => {
  if (!nc.value?.dueDate) return false
  if (nc.value.statusId === 'CLOSED' || nc.value.statusId === 'VOID') return false
  return nc.value.dueDate < DateTime.now()
})

const workflowInstance = useLiveQueryWithDeps([() => props.id], async (db, [id]) => {
  const results = await db.WorkflowInstance.where('[resourceType+resourceId]', [
    'Nonconformance',
    id,
  ]).exec()
  return results.find((i) => i.statusId === 'IN_PROGRESS') || results[0] || null
})

// Resolve the underlying Workflow id from the version so we can link to the
// template (workflow-templates route is keyed by workflow id, not version id).
const workflowVersion = useLiveQueryWithDeps(
  [() => workflowInstance.value?.workflowVersionId ?? nc.value?.workflowVersionId],
  async (db, [versionId]) => {
    if (!versionId) return null
    return db.WorkflowVersion.findByPk(versionId)
  },
)

// ─── Inline-edit for cost fields ──────────────────────────────────────────────
const editingCost = ref(false)
const editingCredit = ref(false)

// ─── Inline-edit for overview fields ──────────────────────────────────────────
const editingTitle = ref(false)
const editingDescription = ref(false)
const editingSeverity = ref(false)
const editingDetected = ref(false)
const editingDueDate = ref(false)

// ─── Linked CAPAs ─────────────────────────────────────────────────────────────
const canCreateCapa = computed(() => isAllowed(['capas:create']))

const linkedCapas = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [ncId]) => {
    if (!ncId) return []
    return db.Capa.where('[sourceType+sourceId]', ['NC', ncId]).exec()
  },
  { initial: [] },
)

function onCreateLinkedCapa() {
  router.push({ path: getCompanyPath('/capas/create'), query: { ncId: props.id } })
}

// ─── Workflow steps are handled by NcWorkflowDetail component ────────────────
</script>

<template>
  <div class="tw:flex tw:flex-col tw:h-full">
    <SafeTeleport to="#main-header-title">
      <BaseBreadcrumbs :items="breadcrumbs" />
    </SafeTeleport>

    <SafeTeleport to="#main-header-actions">
      <div class="tw:flex tw:items-center tw:gap-2">
        <TaskActionBar v-if="nc?.id" entityType="Nonconformance" :entityId="nc.id" />
        <BaseButton
          v-if="nc?.statusId === 'DRAFT'"
          variant="primary"
          :disabled="saving"
          @click="handleSubmitForReview"
          >Submit for review</BaseButton
        >
        <BaseButton
          v-if="isOwner && nc?.statusId !== 'CLOSED'"
          variant="danger"
          :disabled="closing"
          @click="showCloseDialog = true"
          >Close NC</BaseButton
        >
      </div>
    </SafeTeleport>

    <div v-if="loading" class="tw:flex tw:items-center tw:justify-center tw:h-full">
      <div
        class="tw:animate-spin tw:rounded-full tw:w-8 tw:h-8 tw:border-2 tw:border-primary tw:border-t-transparent"
      />
    </div>

    <div v-else-if="nc" class="tw:overflow-y-auto tw:flex-1">
      <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
        <!-- 2-column layout -->
        <div class="tw:grid tw:grid-cols-1 tw:lg:grid-cols-[1fr_280px] tw:gap-4 tw:items-start">
          <!-- Left column -->
          <div class="tw:flex tw:flex-col tw:gap-4">
            <!-- NC Details card -->
            <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
              <div
                class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
              >
                NC Details
              </div>
              <BaseTextInput
                v-if="editingTitle && isEditable"
                v-model="nc.title"
                placeholder="NC title"
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
                {{ nc.title }}
              </div>
              <BaseTextarea
                v-if="editingDescription && isEditable"
                v-model="nc.description"
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
                  {{ nc.description || (isEditable ? 'Add a description…' : '—') }}
                </p>
              </div>

              <div class="tw:grid tw:grid-cols-3 tw:gap-3">
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Severity</div>
                  <NcSeverityBadgeById :severityId="nc.severityId" />
                </div>
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Type</div>
                  <NcTypeBadgeById :typeId="nc.typeId" />
                </div>
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Source</div>
                  <NcSourceBadgeById :sourceId="nc.sourceId" />
                </div>
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Detected</div>
                  <span class="tw:text-sm tw:font-medium">
                    {{ nc.detectedAt.formatDate('date') || '—' }}
                  </span>
                </div>
                <div v-if="nc.productId" class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Product</div>
                  <ProductBadgeById :productId="nc.productId" />
                </div>
                <div v-if="nc.qtyAffected" class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Qty affected</div>
                  <span class="tw:text-sm tw:font-medium">
                    {{ nc.qtyAffected }} {{ nc.unitOfMeasure }}
                  </span>
                </div>
              </div>

              <!-- Immediate containment action -->
              <div class="tw:flex tw:flex-col tw:gap-1 tw:mt-4">
                <label
                  class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider"
                >
                  Immediate containment action
                </label>
                <BaseTextarea
                  v-if="isEditable"
                  v-model="nc.immediateContainmentAction"
                  placeholder="Describe the immediate action taken to contain this nonconformance…"
                  :rows="3"
                />
                <p v-else class="tw:text-sm tw:text-on-main tw:leading-relaxed">
                  {{ nc.immediateContainmentAction || '—' }}
                </p>
              </div>
            </div>

            <NcWorkflowDetail
              :ncId="id"
              :workflowInstanceId="workflowInstance?.id"
              :isOwner="isOwner"
            />

            <!-- Disposition card -->
            <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
              <div
                class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
              >
                Disposition
              </div>

              <template v-if="isEditable">
                <div class="tw:grid tw:grid-cols-2 tw:gap-3">
                  <div class="tw:flex tw:flex-col tw:gap-1">
                    <label class="tw:text-sm tw:font-medium tw:text-secondary"> Disposition </label>
                    <NcDispositionTypeSelectMenu v-model="nc.dispositionTypeId" :required="false" />
                  </div>
                  <div class="tw:flex tw:flex-col tw:gap-1">
                    <label class="tw:text-sm tw:font-medium tw:text-secondary">
                      CAPA required?
                    </label>
                    <div class="tw:flex tw:gap-2">
                      <BaseButton
                        class="tw:flex-1 tw:justify-center"
                        :variant="nc.capaRequired === true ? 'primary' : 'outline'"
                        @click="nc.capaRequired = true"
                        >Yes</BaseButton
                      >
                      <BaseButton
                        class="tw:flex-1 tw:justify-center"
                        :variant="nc.capaRequired === false ? 'primary' : 'outline'"
                        @click="nc.capaRequired = false"
                        >No</BaseButton
                      >
                    </div>
                  </div>
                  <div class="tw:flex tw:flex-col tw:gap-1">
                    <div class="tw:text-xs tw:text-secondary">Cost of NC</div>
                    <BaseTextInput
                      v-if="editingCost"
                      v-model="nc.costOfNc"
                      type="number"
                      placeholder="0.00"
                      autofocus
                      @blur="editingCost = false"
                    />
                    <span
                      v-else
                      class="tw:text-sm tw:font-medium tw:cursor-pointer tw:hover:text-primary"
                      @click="editingCost = true"
                    >
                      {{
                        nc.costOfNc != null
                          ? nc.costOfNc.toLocaleString('en-US', {
                              style: 'currency',
                              currency: 'USD',
                            })
                          : '—'
                      }}
                    </span>
                  </div>
                  <div class="tw:flex tw:flex-col tw:gap-1">
                    <div class="tw:text-xs tw:text-secondary">Credit from Supplier</div>
                    <BaseTextInput
                      v-if="editingCredit"
                      v-model="nc.creditFromSupplier"
                      type="number"
                      placeholder="0.00"
                      autofocus
                      @blur="editingCredit = false"
                    />
                    <span
                      v-else
                      class="tw:text-sm tw:font-medium tw:cursor-pointer tw:hover:text-primary"
                      @click="editingCredit = true"
                    >
                      {{
                        nc.creditFromSupplier != null
                          ? nc.creditFromSupplier.toLocaleString('en-US', {
                              style: 'currency',
                              currency: 'USD',
                            })
                          : '—'
                      }}
                    </span>
                  </div>
                </div>

                <div class="tw:flex tw:flex-col tw:gap-1 tw:col-span-2">
                  <label class="tw:text-sm tw:font-medium tw:text-secondary">
                    Disposition notes
                  </label>
                  <BaseTextarea
                    v-model="nc.dispositionNotes"
                    placeholder="Justify your disposition decision and CAPA choice…"
                    :rows="3"
                  />
                </div>
              </template>

              <template v-else>
                <div class="tw:grid tw:grid-cols-2 tw:gap-3">
                  <div class="tw:flex tw:flex-col tw:gap-1">
                    <div class="tw:text-xs tw:text-secondary">Disposition</div>
                    <NcDispositionTypeBadgeById
                      v-if="nc.dispositionTypeId"
                      :dispositionTypeId="nc.dispositionTypeId"
                    />
                    <span v-else class="tw:text-sm tw:text-secondary">—</span>
                  </div>
                  <div class="tw:flex tw:flex-col tw:gap-1">
                    <div class="tw:text-xs tw:text-secondary">CAPA required?</div>
                    <span class="tw:text-sm tw:font-medium">
                      {{
                        nc.capaRequired === true ? 'Yes' : nc.capaRequired === false ? 'No' : '—'
                      }}
                    </span>
                  </div>
                  <div class="tw:flex tw:flex-col tw:gap-1">
                    <div class="tw:text-xs tw:text-secondary">Cost of NC</div>
                    <span class="tw:text-sm tw:font-medium">
                      {{
                        nc.costOfNc != null
                          ? nc.costOfNc.toLocaleString('en-US', {
                              style: 'currency',
                              currency: 'USD',
                            })
                          : '—'
                      }}
                    </span>
                  </div>
                  <div class="tw:flex tw:flex-col tw:gap-1">
                    <div class="tw:text-xs tw:text-secondary">Credit from Supplier</div>
                    <span class="tw:text-sm tw:font-medium">
                      {{
                        nc.creditFromSupplier != null
                          ? nc.creditFromSupplier.toLocaleString('en-US', {
                              style: 'currency',
                              currency: 'USD',
                            })
                          : '—'
                      }}
                    </span>
                  </div>
                  <div class="tw:flex tw:flex-col tw:gap-1 tw:col-span-2">
                    <div class="tw:text-xs tw:text-secondary">Disposition notes</div>
                    <p class="tw:text-sm tw:text-on-main tw:leading-relaxed">
                      {{ nc.dispositionNotes || '—' }}
                    </p>
                  </div>
                </div>
              </template>
            </div>

            <!-- Linked CAPAs -->
            <div
              v-if="nc.capaRequired === true"
              class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5"
            >
              <div
                class="tw:flex tw:items-center tw:justify-between tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
              >
                <div class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider">
                  Linked CAPAs
                </div>
                <BaseButton
                  v-if="canCreateCapa"
                  variant="outline"
                  size="sm"
                  @click="onCreateLinkedCapa"
                >
                  Create CAPA
                </BaseButton>
              </div>
              <div v-if="linkedCapas.length" class="tw:flex tw:flex-col tw:gap-2">
                <RouterLink
                  v-for="linked in linkedCapas"
                  :key="linked.id"
                  :to="getCompanyPath(`/capas/${linked.id}`)"
                  class="tw:flex tw:items-center tw:justify-between tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-2 tw:hover:bg-main-hover"
                >
                  <div class="tw:flex tw:items-center tw:gap-3 tw:min-w-0">
                    <span class="tw:text-xs tw:font-mono tw:text-secondary">
                      {{ linked.capaNumber }}
                    </span>
                    <span class="tw:text-sm tw:font-medium tw:text-on-main tw:truncate">
                      {{ linked.title }}
                    </span>
                  </div>
                  <CapaStatusBadgeById :statusId="linked.statusId" />
                </RouterLink>
              </div>
              <div v-else class="tw:text-sm tw:text-secondary tw:italic">
                No CAPAs linked yet.
              </div>
            </div>
          </div>

          <!-- Right column -->
          <div class="tw:flex tw:flex-col tw:gap-3">
            <!-- Overview side card -->
            <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4">
              <div
                class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-2 tw:border-b tw:border-divider tw:mb-3"
              >
                Overview
              </div>
              <div class="tw:flex tw:flex-col tw:divide-y tw:divide-border">
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2 tw:border-divider">
                  <span class="tw:text-xs tw:text-secondary">NC number</span>
                  <span class="tw:text-xs tw:font-mono tw:font-medium">{{
                    nc.ncNumber || '—'
                  }}</span>
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2 tw:border-divider">
                  <span class="tw:text-xs tw:text-secondary">Status</span>
                  <NcStatusBadgeById :statusId="nc.statusId" />
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2 tw:border-divider">
                  <span class="tw:text-xs tw:text-secondary">Severity</span>
                  <NcSeveritySelectMenu
                    v-if="editingSeverity && isEditable"
                    v-model="nc.severityId"
                    :required="true"
                    class="tw:w-32"
                    @blur="editingSeverity = false"
                  />
                  <span
                    v-else
                    class="tw:cursor-pointer tw:hover:opacity-70"
                    :class="isEditable ? '' : 'tw:pointer-events-none'"
                    @click="editingSeverity = true"
                  >
                    <NcSeverityBadgeById :severityId="nc.severityId" />
                  </span>
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2 tw:border-divider">
                  <span class="tw:text-xs tw:text-secondary">Owner</span>
                  <UserBadgeById v-if="nc.ownerId" :userId="nc.ownerId" />
                  <span v-else class="tw:text-sm tw:text-secondary">—</span>
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2 tw:border-divider">
                  <span class="tw:text-xs tw:text-secondary">Detected</span>
                  <BaseDatePicker
                    v-if="editingDetected && isEditable"
                    v-model="nc.detectedAt"
                    class="tw:w-36"
                    @blur="editingDetected = false"
                  />
                  <span
                    v-else
                    class="tw:text-sm tw:font-medium"
                    :class="isEditable ? 'tw:cursor-pointer tw:hover:text-primary' : ''"
                    @click="isEditable && (editingDetected = true)"
                  >
                    {{ nc.detectedAt ? nc.detectedAt.formatDate('date') : '—' }}
                  </span>
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2 tw:border-divider">
                  <span class="tw:text-xs tw:text-secondary">Due date</span>
                  <BaseDatePicker
                    v-if="editingDueDate && isEditable"
                    v-model="nc.dueDate"
                    class="tw:w-36"
                    @blur="editingDueDate = false"
                  />
                  <span
                    v-else
                    class="tw:text-sm tw:font-medium tw:flex tw:items-center tw:gap-1 tw:flex-nowrap"
                    :class="[
                      isOverdue ? 'tw:text-red-600' : '',
                      isEditable ? 'tw:cursor-pointer tw:hover:text-primary' : '',
                    ]"
                    @click="isEditable && (editingDueDate = true)"
                  >
                    <span>{{ nc.dueDate ? nc.dueDate.formatDate('date') : '—' }}</span>
                    <IconAlertTriangle v-if="isOverdue" :size="16" class="tw:text-red-600" />
                  </span>
                </div>
                <div
                  v-if="nc.supplierId"
                  class="tw:flex tw:justify-between tw:items-center tw:py-2"
                >
                  <span class="tw:text-xs tw:text-secondary">Supplier</span>
                  <SupplierBadgeById :supplierId="nc.supplierId" />
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">CAPA</span>
                  <span
                    class="tw:text-sm tw:font-medium"
                    :class="nc.capaRequired === null ? 'tw:text-secondary tw:italic' : ''"
                  >
                    {{
                      nc.capaRequired === true
                        ? 'Required'
                        : nc.capaRequired === false
                          ? 'Not required'
                          : 'Not yet decided'
                    }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Workflow panel -->
            <div
              v-if="nc.workflowVersionId || workflowInstance"
              class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4"
            >
              <div
                class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-2 tw:border-b tw:border-divider tw:mb-3"
              >
                NC workflow
              </div>

              <!-- Active workflow instance -->
              <div v-if="workflowInstance">
                <WorkflowInstanceStatusBadgeById :statusId="workflowInstance.statusId" showDot />
                <RouterLink
                  class="tw:mt-3 tw:flex tw:items-center tw:text-sm tw:text-primary tw:font-medium tw:hover:underline"
                  :to="getCompanyPath(`/workflow-instances/${workflowInstance.id}`)"
                >
                  View workflow details →
                </RouterLink>
                <RouterLink
                  v-if="workflowVersion?.workflowId"
                  class="tw:mt-1 tw:flex tw:items-center tw:text-sm tw:text-primary tw:font-medium tw:hover:underline"
                  :to="
                    getCompanyPath(
                      `/workflow-templates/${workflowVersion.workflowId}?version=${encodeURIComponent(
                        workflowVersion.versionLabel ||
                          `${workflowVersion.versionMajor ?? 1}.${workflowVersion.versionMinor ?? 0}`,
                      )}`,
                    )
                  "
                >
                  View workflow template →
                </RouterLink>
              </div>

              <!-- Not yet submitted -->
              <div v-else-if="nc.workflowVersionId" class="tw:text-sm tw:text-secondary">
                workflow assigned but not yet submitted.
              </div>
            </div>

            <!-- Workflow detail component (steps, reassign, send-back, record viewer) -->
          </div>
        </div>
      </div>
    </div>

    <BaseEmptyState
      v-else
      title="NC not found"
      description="This nonconformance could not be found."
    />

    <!-- Close NC confirmation dialog -->
    <BaseDialog v-model="showCloseDialog" title="Close Nonconformance" maxWidth="md">
      <p class="tw:text-sm tw:text-secondary tw:mb-4">
        Are you sure you want to close this nonconformance?
      </p>
      <p
        v-if="workflowInstance?.statusId === 'IN_PROGRESS'"
        class="tw:text-sm tw:text-amber-700 tw:bg-amber-50 tw:border tw:border-amber-200 tw:rounded-md tw:p-3 tw:mb-4"
      >
        This NC has an in-progress workflow. Closing will cancel the workflow and all pending tasks.
      </p>
      <div
        v-if="saveError"
        class="tw:bg-red-50 tw:border tw:border-red-200 tw:text-red-700 tw:rounded-md tw:p-2 tw:text-sm tw:mb-3"
      >
        {{ saveError }}
      </div>
      <div class="tw:flex tw:justify-end tw:gap-2 tw:pt-3 tw:border-t tw:border-divider">
        <BaseButton variant="outline" @click="showCloseDialog = false">Cancel</BaseButton>
        <BaseButton variant="danger" :disabled="closing" @click="handleCloseNc">
          {{ closing ? 'Closing…' : 'Close NC' }}
        </BaseButton>
      </div>
    </BaseDialog>
  </div>
</template>
