<script setup>
/**
 * Right-rail metadata for an inspection lot — mirrors the NC/CAPA detail rail.
 * All glanceable lot info (identity, references, traceability dates, in-process
 * context, sampling, disposition, lifecycle) plus the read-only COA card live
 * here, keeping the centre column for results capture.
 */
import { DateTime } from 'luxon'
import {
  IconClipboardCheck,
  IconHash,
  IconCalendar,
  IconTool,
  IconRuler,
  IconInfoCircle,
} from '@tabler/icons-vue'

const props = defineProps({ lotId: { type: String, required: true } })

const POINT_LABELS = {
  INCOMING: 'Incoming (IQC)',
  IN_PROCESS: 'In-process (IPQC)',
  FINAL: 'Final (FQC)',
  OUTGOING: 'Outgoing (OQC)',
}

const lot = useLiveQueryWithDeps(
  [() => props.lotId],
  async (db, [id]) => (id ? db.InspectionLot.findByPk(id) : null),
  { models: ['InspectionLot'] },
)
const product = useLiveQueryWithDeps(
  [() => lot.value?.productId],
  async (db, [id]) => (id ? db.Product.findByPk(id) : null),
  { models: ['Product'] },
)
const supplier = useLiveQueryWithDeps(
  [() => lot.value?.supplierId],
  async (db, [id]) => (id ? db.Supplier.findByPk(id) : null),
  { models: ['Supplier'] },
)
const lotUom = useLiveQueryWithDeps(
  [() => lot.value?.uomId],
  async (db, [id]) => (id ? db.Uom.findByPk(id) : null),
  { models: ['Uom'] },
)
const isFormulaLot = computed(() => lot.value?.samplingSnapshot?.planType === 'FORMULA')
const equipment = useLiveQueryWithDeps(
  [() => lot.value?.equipmentId],
  async (db, [id]) => (id ? db.Equipment.findByPk(id) : null),
  { models: ['Equipment'] },
)
// Active production lot — carries the line clearance (per-lot).
const activeBatch = useLiveQueryWithDeps(
  [() => lot.value?.activeBatchId],
  async (db, [id]) => (id ? db.InspectionBatch.findByPk(id) : null),
  { models: ['InspectionBatch'] },
)

const isExpired = computed(() => !!lot.value?.expiryDate && lot.value.expiryDate < DateTime.now())
const isIncoming = computed(() => lot.value?.inspectionPoint === 'INCOMING')
const isInProcess = computed(() => lot.value?.inspectionPoint === 'IN_PROCESS')
const sampling = computed(() => lot.value?.samplingSnapshot || null)

// The snapshot's standardCode holds a real code string for global standards
// ("Z1.4-2008") but a UUID for tenant custom clones — resolve the latter to its
// name so the rail never shows a raw id.
const samplingStandard = useLiveQueryWithDeps(
  [() => sampling.value?.standardCode],
  async (db, [code]) => (code ? db.SamplingStandard.findByPk(code) : null),
  { models: ['SamplingStandard'] },
)
const standardLabel = computed(() => {
  const code = sampling.value?.standardCode
  if (!code) return null
  if (samplingStandard.value) return samplingStandard.value.name || samplingStandard.value.code
  return code
})
const hasReferences = computed(
  () =>
    !!(lot.value?.batchNumber || lot.value?.poNumber || lot.value?.receiptNumber || lot.value?.workOrder || lot.value?.equipmentId),
)
const hasTraceability = computed(
  () => !!(lot.value?.manufacturingDate || lot.value?.expiryDate || lot.value?.receivedDate),
)
const hasInProcess = computed(
  () =>
    isInProcess.value &&
    !!(lot.value?.lineId || lot.value?.shiftId || lot.value?.operatorUserId || lot.value?.samplingTime),
)
</script>

<template>
  <div v-if="lot" class="tw:contents">
    <!-- Identity -->
    <BaseRailCard title="General" :icon="IconClipboardCheck">
      <dl class="tw:flex tw:flex-col tw:gap-2 tw:text-sm">
        <div class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
          <dt class="tw:text-secondary tw:shrink-0">Status</dt>
          <dd><InspectionLotStatusBadgeById :statusId="lot.statusId" /></dd>
        </div>
        <div class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
          <dt class="tw:text-secondary tw:shrink-0">Inspection point</dt>
          <dd class="tw:text-right tw:text-on-main">{{ POINT_LABELS[lot.inspectionPoint] || lot.inspectionPoint }}</dd>
        </div>
        <div v-if="product" class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
          <dt class="tw:text-secondary tw:shrink-0">Item</dt>
          <dd class="tw:text-right tw:text-on-main tw:min-w-0 tw:truncate">
            {{ product.name }}<span v-if="product.sku" class="tw:text-secondary"> · {{ product.sku }}</span>
          </dd>
        </div>
        <div v-if="supplier" class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
          <dt class="tw:text-secondary tw:shrink-0">Supplier</dt>
          <dd class="tw:text-right tw:text-on-main tw:min-w-0 tw:truncate">{{ supplier.name }}</dd>
        </div>
        <div class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
          <dt class="tw:text-secondary tw:shrink-0">Quantity</dt>
          <dd class="tw:text-right tw:text-on-main">{{ lot.quantity != null ? [lot.quantity, lotUom?.name].filter(Boolean).join(' ') : '—' }}</dd>
        </div>
        <div v-if="lot.containerCount != null" class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
          <dt class="tw:text-secondary tw:shrink-0">Containers (N)</dt>
          <dd class="tw:text-right tw:text-on-main">{{ lot.containerCount }}</dd>
        </div>
        <div class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
          <dt class="tw:text-secondary tw:shrink-0">Sample size</dt>
          <dd class="tw:text-right tw:text-on-main">{{ lot.sampleSize ?? '—' }}<template v-if="isFormulaLot && lot.sampleSize != null"> containers</template></dd>
        </div>
        <div v-if="lot.qualityState" class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
          <dt class="tw:text-secondary tw:shrink-0">Quality state</dt>
          <dd class="tw:text-right tw:text-on-main">{{ lot.qualityState }}</dd>
        </div>
      </dl>
    </BaseRailCard>

    <!-- References -->
    <BaseRailCard v-if="hasReferences" title="References" :icon="IconHash">
      <dl class="tw:flex tw:flex-col tw:gap-2 tw:text-sm">
        <div v-if="lot.batchNumber" class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
          <dt class="tw:text-secondary tw:shrink-0">Batch / Lot</dt>
          <dd class="tw:text-right tw:text-on-main tw:min-w-0 tw:truncate">{{ lot.batchNumber }}</dd>
        </div>
        <div v-if="lot.poNumber" class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
          <dt class="tw:text-secondary tw:shrink-0">PO #</dt>
          <dd class="tw:text-right tw:text-on-main tw:min-w-0 tw:truncate">{{ lot.poNumber }}</dd>
        </div>
        <div v-if="lot.receiptNumber" class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
          <dt class="tw:text-secondary tw:shrink-0">Receipt #</dt>
          <dd class="tw:text-right tw:text-on-main tw:min-w-0 tw:truncate">{{ lot.receiptNumber }}</dd>
        </div>
        <div v-if="lot.workOrder" class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
          <dt class="tw:text-secondary tw:shrink-0">Work order</dt>
          <dd class="tw:text-right tw:text-on-main tw:min-w-0 tw:truncate">{{ lot.workOrder }}</dd>
        </div>
        <div v-if="equipment" class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
          <dt class="tw:text-secondary tw:shrink-0">Instrument</dt>
          <dd class="tw:text-right tw:text-on-main tw:min-w-0 tw:truncate">{{ equipment.name }}</dd>
        </div>
      </dl>
    </BaseRailCard>

    <!-- Traceability dates -->
    <BaseRailCard v-if="hasTraceability" title="Traceability" :icon="IconCalendar">
      <dl class="tw:flex tw:flex-col tw:gap-2 tw:text-sm">
        <div v-if="lot.manufacturingDate" class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
          <dt class="tw:text-secondary tw:shrink-0">Manufactured</dt>
          <dd class="tw:text-right tw:text-on-main">{{ lot.manufacturingDate.formatDate('date') }}</dd>
        </div>
        <div v-if="lot.expiryDate" class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
          <dt class="tw:text-secondary tw:shrink-0">Expiry</dt>
          <dd class="tw:text-right" :class="isExpired ? 'tw:text-bad tw:font-medium' : 'tw:text-on-main'">
            {{ lot.expiryDate.formatDate('date') }}{{ isExpired ? ' (expired)' : '' }}
          </dd>
        </div>
        <div v-if="lot.receivedDate" class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
          <dt class="tw:text-secondary tw:shrink-0">Received</dt>
          <dd class="tw:text-right tw:text-on-main">{{ lot.receivedDate.formatDate('date') }}</dd>
        </div>
      </dl>
    </BaseRailCard>

    <!-- In-process context -->
    <BaseRailCard v-if="hasInProcess" title="In-process" :icon="IconTool">
      <dl class="tw:flex tw:flex-col tw:gap-2 tw:text-sm">
        <div v-if="lot.lineId" class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
          <dt class="tw:text-secondary tw:shrink-0">Line</dt>
          <dd class="tw:text-right tw:text-on-main tw:min-w-0 tw:truncate">
            <ProductionLineBadgeById :lineId="lot.lineId" />
          </dd>
        </div>
        <div v-if="lot.shiftId" class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
          <dt class="tw:text-secondary tw:shrink-0">Shift</dt>
          <dd class="tw:text-right tw:text-on-main"><ShiftBadgeById :shiftId="lot.shiftId" /></dd>
        </div>
        <div v-if="lot.operatorUserId" class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
          <dt class="tw:text-secondary tw:shrink-0">Operator</dt>
          <dd><UserBadgeById :userId="lot.operatorUserId" /></dd>
        </div>
        <div v-if="lot.samplingTime" class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
          <dt class="tw:text-secondary tw:shrink-0">Sampled</dt>
          <dd class="tw:text-right tw:text-on-main">{{ lot.samplingTime.formatDate('datetime') }}</dd>
        </div>
      </dl>
    </BaseRailCard>

    <!-- Line clearance (active production lot, in-process) -->
    <BaseRailCard
      v-if="isInProcess && activeBatch && activeBatch.lineClearanceStatus && activeBatch.lineClearanceStatus !== 'NOT_STARTED'"
      title="Line clearance"
      :icon="IconClipboardCheck"
    >
      <dl class="tw:flex tw:flex-col tw:gap-2 tw:text-sm">
        <div v-if="activeBatch.lotNumber" class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
          <dt class="tw:text-secondary tw:shrink-0">Lot</dt>
          <dd class="tw:text-right tw:text-on-main tw:min-w-0 tw:truncate">{{ activeBatch.lotNumber }}</dd>
        </div>
        <div class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
          <dt class="tw:text-secondary tw:shrink-0">Status</dt>
          <dd
            class="tw:text-right tw:font-medium"
            :class="activeBatch.lineClearanceStatus === 'PASSED' ? 'tw:text-good' : 'tw:text-bad'"
          >
            {{ activeBatch.lineClearanceStatus === 'PASSED' ? 'Released (passed)' : 'On hold (failed)' }}
          </dd>
        </div>
        <div v-if="activeBatch.lineClearanceBy" class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
          <dt class="tw:text-secondary tw:shrink-0">By</dt>
          <dd><UserBadgeById :userId="activeBatch.lineClearanceBy" /></dd>
        </div>
        <div v-if="activeBatch.lineClearanceAt" class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
          <dt class="tw:text-secondary tw:shrink-0">At</dt>
          <dd class="tw:text-right tw:text-on-main">{{ activeBatch.lineClearanceAt.formatDate('datetime') }}</dd>
        </div>
      </dl>
    </BaseRailCard>

    <!-- Sampling / AQL -->
    <BaseRailCard v-if="sampling" title="Sampling" :icon="IconRuler">
      <dl class="tw:flex tw:flex-col tw:gap-2 tw:text-sm">
        <div v-if="lot.specSnapshot?.name" class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
          <dt class="tw:text-secondary tw:shrink-0">Specification</dt>
          <dd class="tw:text-right tw:text-on-main tw:min-w-0 tw:truncate">{{ lot.specSnapshot.name }}</dd>
        </div>
        <div class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
          <dt class="tw:text-secondary tw:shrink-0">Sampling</dt>
          <dd class="tw:text-right tw:text-on-main tw:min-w-0 tw:truncate">{{ sampling.name || '—' }}</dd>
        </div>
        <div v-if="standardLabel" class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
          <dt class="tw:text-secondary tw:shrink-0">Standard · Level</dt>
          <dd class="tw:text-right tw:text-on-main tw:min-w-0 tw:truncate">
            {{ standardLabel }}<span v-if="sampling.inspectionLevel"> · {{ String(sampling.inspectionLevel).replace(/^S_/, 'S-') }}</span>
          </dd>
        </div>
        <div class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
          <dt class="tw:text-secondary tw:shrink-0">Sample size</dt>
          <dd class="tw:text-right tw:text-on-main">
            <template v-if="lot.sampleSize != null">
              <span v-if="sampling.codeLetter && !sampling.sampleSizeOverridden" class="tw:text-secondary">Code {{ sampling.codeLetter }} · </span>n&nbsp;=&nbsp;{{ lot.sampleSize }}
              <span v-if="sampling.sampleSizeOverridden" class="tw:text-amber-700 tw:text-xs">
                (set manually<span v-if="sampling.computedSampleSize != null">; calc {{ sampling.computedSampleSize }}</span>)
              </span>
            </template>
            <span v-else class="tw:text-amber-700">Not calculated</span>
          </dd>
        </div>

        <!-- Per-severity accept/reject (mirrors the sampling-plan preview). -->
        <div
          v-if="sampling.perSeverity?.length"
          class="tw:flex tw:flex-col tw:gap-1 tw:pt-2 tw:border-t tw:border-divider"
        >
          <div v-for="p in sampling.perSeverity" :key="p.severity" class="tw:text-xs tw:text-secondary">
            <span class="tw:font-semibold tw:text-on-main">{{ p.severity }}</span>
            <!-- Custom-table rows have no AQL — fixed Ac/Re by definition. -->
            — {{ p.aql != null ? `AQL ${p.aql}%` : 'fixed' }} → accept ≤ {{ p.accept }}, reject ≥
            {{ p.reject }}
          </div>
        </div>
        <!-- Couldn't compute — explain why (commonly a special level not in the seeded tables). -->
        <div
          v-else-if="lot.sampleSize == null"
          class="tw:text-xs tw:text-amber-700 tw:pt-2 tw:border-t tw:border-divider tw:leading-relaxed"
        >
          {{
            sampling.computeError ||
            'Sample size could not be calculated for this plan / inspection level. Re-check the sampling plan or choose a different level.'
          }}
        </div>
      </dl>
    </BaseRailCard>

    <!-- COA (incoming) — read-only -->
    <InspectionLotCoaCard v-if="isIncoming" :lotId="lotId" :canUpdate="false" />

    <!-- Retain samples kept from this lot -->
    <InspectionLotRetainSamplesCard :lotId="lotId" />

    <!-- Lifecycle / notes -->
    <BaseRailCard title="Lifecycle" :icon="IconInfoCircle">
      <dl class="tw:flex tw:flex-col tw:gap-2 tw:text-sm">
        <div class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
          <dt class="tw:text-secondary tw:shrink-0">Active inspector</dt>
          <dd v-if="lot.assignedTo"><UserBadgeById :userId="lot.assignedTo" /></dd>
          <dd v-else class="tw:text-amber-700 tw:text-xs">None — checked out</dd>
        </div>
        <div v-if="lot.createdBy" class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
          <dt class="tw:text-secondary tw:shrink-0">Created by</dt>
          <dd><UserBadgeById :userId="lot.createdBy" /></dd>
        </div>
        <div v-if="lot.createdAt" class="tw:flex tw:items-baseline tw:justify-between tw:gap-3">
          <dt class="tw:text-secondary tw:shrink-0">Created</dt>
          <dd class="tw:text-right tw:text-on-main">{{ lot.createdAt.formatDate('date') }}</dd>
        </div>
        <div v-if="lot.notes" class="tw:flex tw:flex-col tw:gap-1 tw:pt-1">
          <dt class="tw:text-secondary">Notes</dt>
          <dd class="tw:text-on-main tw:whitespace-pre-wrap">{{ lot.notes }}</dd>
        </div>
      </dl>
    </BaseRailCard>

    <!-- Reopen / re-inspection history — collapsed by default, at the rail bottom. -->
    <InspectionLotHistory :lotId="lotId" />
  </div>
</template>
