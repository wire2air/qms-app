<script setup>
/**
 * Supplier performance / QMS activity — open audits, NCs and CAPAs tied to this
 * supplier (suppliers all carry a supplier_id FK), with deep links into the
 * main NC / CAPA lists pre-filtered to this supplier. Shared Documents lives
 * here too as the "everything shared with / about this supplier" surface.
 */
import {
  IconClipboardCheck,
  IconAlertTriangle,
  IconTool,
  IconExternalLink,
} from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const props = defineProps({
  supplierId: { type: String, required: true },
  canUpdate: { type: Boolean, default: false },
})

const router = useRouter()
const TERMINAL = ['CLOSED', 'CANCELLED']

const openAudits = useLiveQueryWithDeps(
  [() => props.supplierId],
  async (db, [id]) => {
    const rows = await db.AuditInstance.where('supplierId', id).exec()
    return rows
      .filter((a) => !TERMINAL.includes(a.statusId))
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
  },

  { models: ['AuditInstance'], initial: [] },
)
const openNcs = useLiveQueryWithDeps(
  [() => props.supplierId],
  async (db, [id]) => {
    const rows = await db.Nonconformance.where('supplierId', id).exec()
    return rows
      .filter((r) => !TERMINAL.includes(r.statusId))
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
  },

  { models: ['Nonconformance'], initial: [] },
)
const openCapas = useLiveQueryWithDeps(
  [() => props.supplierId],
  async (db, [id]) => {
    const rows = await db.Capa.where('supplierId', id).exec()
    return rows
      .filter((r) => !TERMINAL.includes(r.statusId))
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
  },

  { models: ['Capa'], initial: [] },
)

function openAudit(id) {
  router.push(getCompanyPath(`/audits/instances/${id}`))
}
function openNc(id) {
  router.push(getCompanyPath(`/nonconformances/${id}`))
}
function openCapa(id) {
  router.push(getCompanyPath(`/capas/${id}`))
}
function viewAllNcs() {
  router.push(getCompanyPath(`/nonconformances?supplierId=${props.supplierId}`))
}
function viewAllCapas() {
  router.push(getCompanyPath(`/capas?supplierId=${props.supplierId}`))
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-6">
    <div class="tw:grid tw:grid-cols-1 tw:lg:grid-cols-3 tw:gap-6">
      <!-- Open Audits -->
      <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
        <div
          class="tw:px-5 tw:py-3 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:gap-2"
        >
          <IconClipboardCheck :size="18" class="tw:text-secondary" />
          <h3 class="tw:text-sm tw:font-semibold tw:text-on-main">Open Audits</h3>
          <span class="tw:ml-auto tw:text-sm tw:font-semibold tw:text-secondary">{{
            openAudits.length
          }}</span>
        </div>
        <div class="tw:p-3 tw:flex tw:flex-col tw:gap-1.5">
          <button
            v-for="a in openAudits"
            :key="a.id"
            type="button"
            class="tw:flex tw:items-center tw:gap-2 tw:text-left tw:rounded tw:px-2 tw:py-1.5 tw:bg-white tw:border tw:border-divider tw:hover:border-primary tw:cursor-pointer"
            @click="openAudit(a.id)"
          >
            <span class="tw:text-sm tw:text-secondary tw:shrink-0">{{
              a.auditNumber
            }}</span>
            <span class="tw:text-sm tw:flex-1 tw:min-w-0 tw:truncate">{{
              a.displayMeta?.standardName || 'Audit'
            }}</span>
            <span class="tw:text-micro tw:uppercase tw:font-semibold tw:text-secondary">{{
              a.statusId
            }}</span>
          </button>
          <p v-if="!openAudits.length" class="tw:text-xs tw:text-secondary tw:italic tw:py-2">
            No open audits.
          </p>
        </div>
      </div>

      <!-- Open NCs -->
      <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
        <div
          class="tw:px-5 tw:py-3 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:gap-2"
        >
          <IconAlertTriangle :size="18" class="tw:text-secondary" />
          <h3 class="tw:text-sm tw:font-semibold tw:text-on-main">Open NCs</h3>
          <span class="tw:ml-auto tw:text-sm tw:font-semibold tw:text-secondary">{{
            openNcs.length
          }}</span>
        </div>
        <div class="tw:p-3 tw:flex tw:flex-col tw:gap-1.5">
          <button
            v-for="n in openNcs.slice(0, 6)"
            :key="n.id"
            type="button"
            class="tw:flex tw:items-center tw:gap-2 tw:text-left tw:rounded tw:px-2 tw:py-1.5 tw:bg-white tw:border tw:border-divider tw:hover:border-primary tw:cursor-pointer"
            @click="openNc(n.id)"
          >
            <span class="tw:text-sm tw:text-secondary tw:shrink-0">{{
              n.ncNumber
            }}</span>
            <span class="tw:text-sm tw:flex-1 tw:min-w-0 tw:truncate">{{ n.title }}</span>
            <span class="tw:text-micro tw:uppercase tw:font-semibold tw:text-secondary">{{
              n.statusId
            }}</span>
          </button>
          <p v-if="!openNcs.length" class="tw:text-xs tw:text-secondary tw:italic tw:py-2">
            No open NCs.
          </p>
          <button
            type="button"
            class="tw:mt-1 tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:font-medium tw:text-primary tw:hover:underline tw:bg-transparent tw:border-0 tw:cursor-pointer tw:self-start"
            @click="viewAllNcs"
          >
            <IconExternalLink :size="13" /> View all in NC list
          </button>
        </div>
      </div>

      <!-- Open CAPAs -->
      <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
        <div
          class="tw:px-5 tw:py-3 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:gap-2"
        >
          <IconTool :size="18" class="tw:text-secondary" />
          <h3 class="tw:text-sm tw:font-semibold tw:text-on-main">Open CAPAs</h3>
          <span class="tw:ml-auto tw:text-sm tw:font-semibold tw:text-secondary">{{
            openCapas.length
          }}</span>
        </div>
        <div class="tw:p-3 tw:flex tw:flex-col tw:gap-1.5">
          <button
            v-for="c in openCapas.slice(0, 6)"
            :key="c.id"
            type="button"
            class="tw:flex tw:items-center tw:gap-2 tw:text-left tw:rounded tw:px-2 tw:py-1.5 tw:bg-white tw:border tw:border-divider tw:hover:border-primary tw:cursor-pointer"
            @click="openCapa(c.id)"
          >
            <span class="tw:text-sm tw:text-secondary tw:shrink-0">{{
              c.capaNumber
            }}</span>
            <span class="tw:text-sm tw:flex-1 tw:min-w-0 tw:truncate">{{ c.title }}</span>
            <span class="tw:text-micro tw:uppercase tw:font-semibold tw:text-secondary">{{
              c.statusId
            }}</span>
          </button>
          <p v-if="!openCapas.length" class="tw:text-xs tw:text-secondary tw:italic tw:py-2">
            No open CAPAs.
          </p>
          <button
            type="button"
            class="tw:mt-1 tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:font-medium tw:text-primary tw:hover:underline tw:bg-transparent tw:border-0 tw:cursor-pointer tw:self-start"
            @click="viewAllCapas"
          >
            <IconExternalLink :size="13" /> View all in CAPA list
          </button>
        </div>
      </div>
    </div>

    <!-- Shared documents — everything shared with / about this supplier. -->
    <SuppliersSharedDocumentsTab :supplierId="supplierId" :canUpdate="canUpdate" />
  </div>
</template>
