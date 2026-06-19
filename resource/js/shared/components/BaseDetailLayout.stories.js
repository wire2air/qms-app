// BaseDetailLayout.stories.js — CSF3 story set for Templates/Detail Page
import BaseDetailLayout from './BaseDetailLayout.vue'
import DetailHeader from './DetailHeader.vue'
import DetailRail from './DetailRail.vue'
import { ref } from 'vue'
import {
  supplierActions,
  supplierTabs,
  supplierRailCards,
  supplierIcon,
  capaActions,
  capaTabs,
  capaRailCards,
} from './detailLayout.fixtures.js'

export default {
  title: 'Templates/Detail Page',
  component: BaseDetailLayout,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Configurable detail-page template (spec §3). One shell renders simple → complex entities via descriptors (actions/tabs), slots (content), and flags (structure). See the Simple / Supplier / CAPA stories for the complexity range.',
      },
    },
  },
}

// ── Supplier — standard record ─────────────────────────────────────────────────

export const Supplier = {
  name: 'Supplier — standard record',
  render: () => ({
    components: { BaseDetailLayout },
    setup() {
      const tab = ref('overview')
      return { tab, supplierActions, supplierTabs, supplierRailCards, supplierIcon }
    },
    template: `
      <div style="height: 640px">
        <BaseDetailLayout
          v-model:tab="tab"
          title="Acme Corp"
          avatarName="Acme Corp"
          :icon="supplierIcon"
          :actions="supplierActions"
          :tabs="supplierTabs"
          :railCards="supplierRailCards"
          :breadcrumbs="[{ label: 'Suppliers', to: '/suppliers' }, { label: 'Acme Corp' }]"
        >
          <template #status><span class="tw:rounded-md tw:bg-green-100 tw:px-2 tw:py-0.5 tw:text-caption tw:font-semibold tw:text-green-700">Active</span></template>
          <template #meta>ACM-001 · Manufacturer · updated 2d ago</template>
          <template #tab-overview><div class="tw:py-4 tw:text-body">Overview sections…</div></template>
          <template #tab-profile><div class="tw:py-4 tw:text-body">Company profile…</div></template>
          <template #tab-locations><div class="tw:py-4 tw:text-body">Locations table…</div></template>
          <template #tab-documents><div class="tw:py-4 tw:text-body">Documents table…</div></template>
          <template #tab-evaluations><div class="tw:py-4 tw:text-body">Evaluations…</div></template>
          <template #tab-activity><div class="tw:py-4 tw:text-body">Activity timeline + comments (later spec)…</div></template>
        </BaseDetailLayout>
      </div>`,
  }),
}

// ── Simple entity — compact, no tabs/rail ─────────────────────────────────────

export const SimpleEntity = {
  name: 'Simple entity — compact, no tabs/rail',
  render: () => ({
    components: { BaseDetailLayout },
    template: `
      <div style="height: 480px">
        <BaseDetailLayout title="Finished Goods" headerVariant="compact" :rail="false"
          :actions="[{ id: 'edit', label: 'Edit', variant: 'primary', priority: 9, onSelect: () => {} }]"
          :breadcrumbs="[{ label: 'Option Sets', to: '/option-sets' }, { label: 'Finished Goods' }]">
          <div class="tw:py-4 tw:text-body">A few read-only fields — no tabs, no rail. Same shell.</div>
        </BaseDetailLayout>
      </div>`,
  }),
}

// ── CAPA — complex workflow ────────────────────────────────────────────────────

export const CAPA = {
  name: 'CAPA — complex workflow',
  render: () => ({
    components: { BaseDetailLayout },
    setup() {
      const tab = ref('overview')
      return { tab, capaActions, capaTabs, capaRailCards }
    },
    template: `
      <div style="height: 640px">
        <BaseDetailLayout v-model:tab="tab" title="CAPA-2026-014" :actions="capaActions" :tabs="capaTabs" :railCards="capaRailCards"
          :breadcrumbs="[{ label: 'CAPAs', to: '/capas' }, { label: 'CAPA-2026-014' }]">
          <template #status><span class="tw:rounded-md tw:bg-amber-100 tw:px-2 tw:py-0.5 tw:text-caption tw:font-semibold tw:text-amber-700">Pending approval</span></template>
          <template #meta>High priority · opened 01 Jun 2026 · due 30 Jun 2026</template>
          <template #tab-overview><div class="tw:py-4 tw:text-body">Problem statement…</div></template>
          <template #tab-rootcause><div class="tw:py-4 tw:text-body">Root-cause analysis…</div></template>
          <template #tab-actions><div class="tw:py-4 tw:text-body">Corrective actions table…</div></template>
          <template #tab-verification><div class="tw:py-4 tw:text-body">Effectiveness verification…</div></template>
          <template #tab-approvals><div class="tw:py-4 tw:text-body">Approval chain…</div></template>
          <template #tab-activity><div class="tw:py-4 tw:text-body">Activity…</div></template>
        </BaseDetailLayout>
      </div>`,
  }),
}

// ── L3 primitives — escape hatch ──────────────────────────────────────────────

export const RawL3Composition = {
  name: 'L3 primitives — escape hatch',
  render: () => ({
    components: { DetailHeader, DetailRail },
    setup: () => ({ capaActions, capaRailCards }),
    template: `
      <div class="tw:flex tw:flex-col tw:gap-4">
        <DetailHeader title="Custom arrangement" :actions="capaActions"><template #meta>Built from L3 primitives — no BaseDetailLayout</template></DetailHeader>
        <div class="tw:grid tw:grid-cols-[minmax(0,1fr)_340px] tw:gap-6 tw:max-lg:grid-cols-1">
          <div class="tw:text-body">Bespoke middle region.</div>
          <DetailRail :railCards="capaRailCards" />
        </div>
      </div>`,
  }),
}

// ── Loading state ──────────────────────────────────────────────────────────────

export const Loading = {
  render: () => ({
    components: { BaseDetailLayout },
    template: `<div style="height:640px"><BaseDetailLayout title="Loading…" :loading="true" /></div>`,
  }),
}

// ── Not found state ────────────────────────────────────────────────────────────

export const NotFound = {
  render: () => ({
    components: { BaseDetailLayout },
    template: `<div style="height:480px"><BaseDetailLayout :notFound="true" notFoundTitle="Supplier not found" /></div>`,
  }),
}

// ── Error state ────────────────────────────────────────────────────────────────

export const ErrorState = {
  name: 'Error',
  render: () => ({
    components: { BaseDetailLayout },
    template: `<div style="height:480px"><BaseDetailLayout :error="true" errorTitle="Couldn't load this record" errorDescription="Try again in a moment." /></div>`,
  }),
}

// ── No rail variant ────────────────────────────────────────────────────────────

export const NoRail = {
  render: () => ({
    components: { BaseDetailLayout },
    setup: () => ({ supplierTabs }),
    template: `<div style="height:640px"><BaseDetailLayout title="No rail" :tabs="supplierTabs" :rail="false">
      <template #tab-overview><div class="tw:py-4">Full-width content, no rail.</div></template>
    </BaseDetailLayout></div>`,
  }),
}

// ── Mobile viewport — proves rail collapse + header compression ────────────────

export const Mobile = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  render: () => ({
    components: { BaseDetailLayout },
    setup: () => ({ supplierActions, supplierTabs, supplierRailCards }),
    template: `<div style="height:720px"><BaseDetailLayout title="Acme Corp" :actions="supplierActions" :tabs="supplierTabs" :railCards="supplierRailCards">
      <template #meta>ACM-001 · updated 2d ago</template>
      <template #tab-overview><div class="tw:py-4">Overview…</div></template>
    </BaseDetailLayout></div>`,
  }),
}
