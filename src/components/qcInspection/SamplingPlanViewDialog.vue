<script setup>
/**
 * Read-only sampling-plan preview (2026-08-10) — opened from the plans list by
 * clicking a plan name. Mirrors the create/edit dialog's sections without the
 * form: scope + point + status, the AQL standard configuration (or the custom
 * plan table), in-process guidance, and the same live sample-size preview the
 * create dialog has (lot size → code letter + n + per-severity Ac/Re), plus
 * the Table-1 code-letter explainer.
 */
import { IconHelpCircle } from '@tabler/icons-vue'
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { aqlSeverityHint } from '@/utils/aqlGuidance.js'

const props = defineProps({
  planId: { type: String, default: null },
})
const show = defineModel({ type: Boolean, default: false })
const toast = useToast()

const plan = useLiveQueryWithDeps(
  [() => props.planId],
  async (db, [id]) => (id ? db.SamplingPlan.findByPk(id) : null),
  { models: ['SamplingPlan'], initial: null },
)

const standards = useLiveQuery(async (db) => db.SamplingStandard.where().exec(), {
  models: ['SamplingStandard'],
  initial: [],
})
const standardName = computed(() => {
  const s = standards.value.find((x) => x.id === plan.value?.standardCode)
  return s?.name || plan.value?.standardCode || '—'
})

const POINT_LABELS = {
  INCOMING: 'Incoming (IQC)',
  IN_PROCESS: 'In-process (IPQC)',
  FINAL: 'Final (FQC)',
  OUTGOING: 'Outgoing (OQC)',
}
const levelLabel = (lvl) => (lvl ? String(lvl).replace(/^S_/, 'S-') : '—')

// Live sample-size preview — same RPC the create dialog uses.
const previewLotSize = ref(1000)
const preview = ref(null)
const previewing = ref(false)
const showCodeLetterTable = ref(false)

watch(show, (v) => {
  if (v) {
    preview.value = null
    previewLotSize.value = 1000
  }
})

async function runPreview() {
  if (!plan.value?.standardCode || previewing.value) return
  previewing.value = true
  try {
    preview.value = await post('/v1/services/qcInspection/samplingPlans/preview', {
      standardCode: plan.value.standardCode,
      inspectionLevel: plan.value.inspectionLevel,
      switchingState: plan.value.switchingState || 'NORMAL',
      lotSize: Number(previewLotSize.value) || 0,
      severityAqls: plan.value.severityAqls ?? [],
    })
  } catch (err) {
    toast.error(err?.message || 'Preview failed')
  } finally {
    previewing.value = false
  }
}
</script>

<template>
  <div>
    <BaseDialog v-model="show" :title="plan?.name || 'Sampling plan'" size="2xl">
      <div v-if="plan" class="tw:p-5 tw:flex tw:flex-col tw:gap-5">
        <!-- ── At a glance ─────────────────────────────────────────────── -->
        <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
          <span
            class="tw:text-caption tw:font-semibold tw:px-2 tw:py-0.5 tw:rounded-full"
            :class="{
              'tw:bg-amber-100 tw:text-amber-700': plan.statusId === 'DRAFT',
              'tw:bg-green-100 tw:text-green-700': plan.statusId === 'ACTIVE',
              'tw:bg-gray-100 tw:text-gray-600': !['DRAFT', 'ACTIVE'].includes(plan.statusId),
            }"
            >{{ plan.statusId }}</span
          >
          <span v-if="plan.version > 1" class="tw:text-caption tw:text-secondary">v{{ plan.version }}</span>
          <span class="tw:text-caption tw:px-2 tw:py-0.5 tw:rounded-full tw:bg-main-hover tw:text-on-main">
            {{ POINT_LABELS[plan.inspectionPoint] || plan.inspectionPoint }}
          </span>
          <span class="tw:text-caption tw:px-2 tw:py-0.5 tw:rounded-full tw:bg-main-hover tw:text-on-main">
            {{ plan.planType === 'CUSTOM' ? 'Custom table' : 'AQL standard' }}
          </span>
        </div>

        <!-- Scope -->
        <div class="tw:flex tw:items-center tw:gap-2 tw:text-sm">
          <span class="tw:text-secondary">Applies to:</span>
          <ProductBadgeById v-if="plan.productId" :productId="plan.productId" />
          <ProductFamilyBadgeById v-else-if="plan.productFamilyId" :productFamilyId="plan.productFamilyId" />
          <ProductTypeBadgeById v-else-if="plan.productTypeId" :productTypeId="plan.productTypeId" />
          <span v-else class="tw:text-secondary">—</span>
        </div>

        <p v-if="plan.description" class="tw:text-sm tw:text-secondary">{{ plan.description }}</p>

        <hr class="tw:border-divider" />

        <!-- ── AQL standard configuration ───────────────────────────────── -->
        <div v-if="plan.planType === 'STANDARD'" class="tw:flex tw:flex-col tw:gap-3">
          <div class="tw:grid tw:grid-cols-2 tw:sm:grid-cols-3 tw:gap-3 tw:text-sm">
            <div>
              <div class="tw:text-xs tw:text-secondary tw:mb-0.5">AQL standard</div>
              <div class="tw:text-on-main">{{ standardName }}</div>
            </div>
            <div>
              <div class="tw:text-xs tw:text-secondary tw:mb-0.5 tw:flex tw:items-center tw:gap-1">
                Inspection level
                <button
                  type="button"
                  class="tw:text-secondary tw:hover:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:p-0 tw:inline-flex"
                  title="How inspection level picks a code letter (Table 1)"
                  aria-label="How inspection level picks a code letter"
                  @click="showCodeLetterTable = true"
                >
                  <IconHelpCircle :size="13" />
                </button>
              </div>
              <div class="tw:text-on-main">{{ levelLabel(plan.inspectionLevel) }}</div>
            </div>
            <div>
              <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Switching state</div>
              <div class="tw:text-on-main">{{ plan.switchingState || 'NORMAL' }}</div>
            </div>
          </div>

          <div v-if="plan.severityAqls?.length">
            <BaseText variant="overline" class="tw:block tw:mb-2">Defect class → AQL %</BaseText>
            <div class="tw:flex tw:flex-wrap tw:gap-2">
              <div
                v-for="sa in plan.severityAqls"
                :key="sa.severity"
                class="tw:border tw:border-divider tw:rounded-lg tw:px-3 tw:py-1.5 tw:text-center"
              >
                <div class="tw:text-caption tw:text-secondary tw:uppercase tw:tracking-wider">
                  {{ sa.severity }}
                </div>
                <div class="tw:font-semibold tw:text-on-main tw:text-sm tw:flex tw:items-center tw:gap-1.5">
                  AQL {{ sa.aql }}%
                  <span
                    v-if="aqlSeverityHint(sa.aql)"
                    class="tw:text-micro tw:font-medium tw:px-1.5 tw:py-0.5 tw:rounded-full"
                    :class="aqlSeverityHint(sa.aql).class"
                    >{{ aqlSeverityHint(sa.aql).label }}</span
                  >
                </div>
              </div>
            </div>
          </div>

          <!-- Live preview — resolves lot size → code letter + n + Ac/Re. -->
          <div>
            <BaseText variant="overline" class="tw:block tw:mb-2">Sample-size preview</BaseText>
            <div class="tw:flex tw:items-end tw:gap-3">
              <BaseField label="Lot size" class="tw:w-40">
                <template #default="field">
                  <BaseTextInput
                    v-bind="field"
                    v-model.number="previewLotSize"
                    type="number"
                    size="sm"
                    placeholder="e.g. 1000"
                  />
                </template>
              </BaseField>
              <BaseButton variant="outline" size="sm" :loading="previewing" @click="runPreview">
                Preview
              </BaseButton>
            </div>
            <div
              v-if="preview"
              class="tw:mt-3 tw:p-3 tw:rounded-lg tw:border tw:border-divider tw:bg-sidebar tw:flex tw:flex-col tw:gap-1"
            >
              <div class="tw:text-sm tw:font-semibold tw:text-on-main">
                Code letter {{ preview.codeLetter }} · Sample size {{ preview.sampleSize }}
              </div>
              <div
                v-for="s in preview.perSeverity"
                :key="s.severity + s.aql"
                class="tw:text-xs tw:text-secondary"
              >
                {{ s.severity }} — AQL {{ s.aql }}% → accept ≤ {{ s.accept }}, reject ≥ {{ s.reject }}
              </div>
            </div>
          </div>
        </div>

        <!-- ── Custom plan table ───────────────────────────────────────── -->
        <div v-if="plan.planType === 'CUSTOM' && plan.customPlanTable?.rows?.length">
          <BaseText variant="overline" class="tw:block tw:mb-2">Custom plan table</BaseText>
          <p class="tw:text-xs tw:text-secondary tw:mb-2">
            Fixed numbers — no lot-size lookup. Logged defects are tallied per class against the
            matching row; the lot's suggested sample size is the largest row's.
          </p>
          <div class="tw:overflow-x-auto">
            <table class="tw:text-xs tw:border tw:border-divider tw:rounded-lg tw:overflow-hidden">
              <thead class="tw:text-secondary tw:uppercase">
                <tr>
                  <th class="tw:text-left tw:px-3 tw:py-1.5">Defect class</th>
                  <th class="tw:text-left tw:px-3 tw:py-1.5">Sample size</th>
                  <th class="tw:text-left tw:px-3 tw:py-1.5">Accept</th>
                  <th class="tw:text-left tw:px-3 tw:py-1.5">Reject</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="cr in plan.customPlanTable.rows"
                  :key="cr.severityLabel"
                  class="tw:border-t tw:border-divider"
                >
                  <td class="tw:px-3 tw:py-1.5 tw:font-medium tw:text-on-main">{{ cr.severityLabel }}</td>
                  <td class="tw:px-3 tw:py-1.5">{{ cr.sampleSize }}</td>
                  <td class="tw:px-3 tw:py-1.5 tw:text-green-700">≤ {{ cr.accept }}</td>
                  <td class="tw:px-3 tw:py-1.5 tw:text-red-700">≥ {{ cr.reject }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- ── In-process collection guidance ──────────────────────────── -->
        <div
          v-if="plan.inspectionPoint === 'IN_PROCESS' && (plan.perCollectionSize || plan.collectionIntervalMinutes)"
          class="tw:grid tw:grid-cols-2 tw:gap-3 tw:text-sm"
        >
          <div v-if="plan.perCollectionSize">
            <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Samples per collection</div>
            <div class="tw:text-on-main">{{ plan.perCollectionSize }}</div>
          </div>
          <div v-if="plan.collectionIntervalMinutes">
            <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Collection interval</div>
            <div class="tw:text-on-main">every {{ plan.collectionIntervalMinutes }} min</div>
          </div>
        </div>

        <!-- ── Lifecycle ───────────────────────────────────────────────── -->
        <div class="tw:grid tw:grid-cols-2 tw:sm:grid-cols-3 tw:gap-3 tw:text-sm tw:border-t tw:border-divider tw:pt-3">
          <div v-if="plan.effectiveFrom">
            <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Effective from</div>
            <div class="tw:text-on-main">{{ plan.effectiveFrom?.formatDate('date') }}</div>
          </div>
          <div v-if="plan.approvedByUserId">
            <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Approved by</div>
            <UserBadgeById :userId="plan.approvedByUserId" />
          </div>
          <div v-if="plan.approvedAt">
            <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Approved at</div>
            <div class="tw:text-on-main">{{ plan.approvedAt?.formatDate('date') }}</div>
          </div>
        </div>
        <p v-if="plan.notes" class="tw:text-xs tw:text-secondary">{{ plan.notes }}</p>
      </div>
    </BaseDialog>

    <!-- Table 1 explainer — highlights this plan's level + previewed lot size. -->
    <BaseDialog v-model="showCodeLetterTable" title="Sample-size code letters (Table 1)" size="3xl">
      <div class="tw:p-5">
        <SampleSizeCodeLetterTable
          :standardCode="plan?.standardCode"
          :highlightLevel="plan?.inspectionLevel"
          :lotSize="Number(previewLotSize) || null"
        />
      </div>
    </BaseDialog>
  </div>
</template>
