import BaseChart from './BaseChart.vue'

/**
 * BaseChart — lazy ApexCharts wrapper with theme-aware brand defaults. Verify
 * rendering here (charts need a real DOM), and flip the Storybook theme to
 * check the dark palette — every story below re-paints from `isDark`.
 */
export default {
  title: 'Data/BaseChart',
  component: BaseChart,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}

const CARD = 'tw:max-w-2xl tw:bg-card tw:rounded-xl tw:border tw:border-divider tw:p-4'

export const Area = {
  render: () => ({
    components: { BaseChart },
    setup: () => ({
      series: [{ name: 'Open NCs', data: [3, 5, 2, 8, 6, 4, 7] }],
      options: { xaxis: { categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] } },
      CARD,
    }),
    template: `<div :class="CARD"><BaseChart type="area" :series="series" :options="options" ariaLabel="Open nonconformances per day" /></div>`,
  }),
}

export const Bar = {
  render: () => ({
    components: { BaseChart },
    setup: () => ({
      series: [
        { name: 'Open', data: [12, 8, 15, 6] },
        { name: 'Closed', data: [30, 22, 18, 27] },
      ],
      options: { xaxis: { categories: ['NC', 'CAPA', 'Complaints', 'Audits'] } },
      CARD,
    }),
    template: `<div :class="CARD"><BaseChart type="bar" :series="series" :options="options" ariaLabel="Open and closed records by module" /></div>`,
  }),
}

export const Donut = {
  render: () => ({
    components: { BaseChart },
    setup: () => ({
      series: [44, 55, 13, 33],
      options: { labels: ['Draft', 'In Review', 'Approved', 'Effective'] },
      CARD,
    }),
    template: `<div class="tw:max-w-md tw:bg-card tw:rounded-xl tw:border tw:border-divider tw:p-4"><BaseChart type="donut" :series="series" :height="320" :options="options" ariaLabel="Documents by status" /></div>`,
  }),
}

/** Stacked bar — segments are separated by a 2px surface gap, never bled together. */
export const StackedBar = {
  render: () => ({
    components: { BaseChart },
    setup: () => ({
      series: [
        { name: 'Minor', data: [11, 14, 9, 12, 8] },
        { name: 'Major', data: [6, 4, 7, 3, 5] },
        { name: 'Critical', data: [2, 1, 3, 1, 2] },
      ],
      options: { xaxis: { categories: ['Apr', 'May', 'Jun', 'Jul', 'Aug'] } },
      CARD,
    }),
    template: `<div :class="CARD"><BaseChart type="stackedBar" :series="series" :options="options" ariaLabel="Nonconformances by severity per month" /></div>`,
  }),
}

/**
 * Heatmap — sequential (one-hue) scale. The `null` cell is *suppressed*, not
 * zero: it paints in the neutral suppression fill and reads "Withheld" on hover.
 */
export const Heatmap = {
  render: () => ({
    components: { BaseChart },
    setup: () => ({
      series: [
        { name: 'Plant A', data: [{ x: 'Mon', y: 4 }, { x: 'Tue', y: 9 }, { x: 'Wed', y: 2 }, { x: 'Thu', y: 12 }, { x: 'Fri', y: 6 }] },
        { name: 'Plant B', data: [{ x: 'Mon', y: 1 }, { x: 'Tue', y: null }, { x: 'Wed', y: 7 }, { x: 'Thu', y: 3 }, { x: 'Fri', y: 10 }] },
        { name: 'Plant C', data: [{ x: 'Mon', y: 8 }, { x: 'Tue', y: 5 }, { x: 'Wed', y: 0 }, { x: 'Thu', y: 6 }, { x: 'Fri', y: 2 }] },
      ],
      CARD,
    }),
    template: `<div :class="CARD"><BaseChart type="heatmap" :series="series" :suppressedCount="1" scope="site" ariaLabel="Findings by site and weekday" /></div>`,
  }),
}

/** Sparkline — a trend glyph for a stat tile: no axes, grid or legend. */
export const Sparkline = {
  render: () => ({
    components: { BaseChart },
    setup: () => ({ series: [{ name: 'Backlog', data: [12, 14, 11, 15, 13, 17, 16, 19] }] }),
    template: `<div class="tw:max-w-3xs tw:bg-card tw:rounded-xl tw:border tw:border-divider tw:p-4">
      <div class="tw:text-2xl tw:font-bold tw:text-on-main">19</div>
      <div class="tw:text-xs tw:text-secondary tw:mb-1">Open CAPAs</div>
      <BaseChart type="sparkline" :series="series" ariaLabel="Open CAPA backlog, last 8 weeks" />
    </div>`,
  }),
}

/** Combo — bar + line on ONE y-axis. A second y-scale is deliberately not offered. */
export const Combo = {
  render: () => ({
    components: { BaseChart },
    setup: () => ({
      series: [
        { name: 'Raised', type: 'column', data: [14, 18, 11, 21, 16, 19] },
        { name: 'Closed', type: 'line', data: [10, 15, 13, 17, 18, 20] },
      ],
      options: { xaxis: { categories: ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'] } },
      CARD,
    }),
    template: `<div :class="CARD"><BaseChart type="combo" :series="series" :options="options" ariaLabel="CAPAs raised versus closed per month" /></div>`,
  }),
}

/** Aging histogram — pre-binned server-side; bins touch, one hue, no legend. */
export const AgingHistogram = {
  render: () => ({
    components: { BaseChart },
    setup: () => ({
      series: [{ name: 'Open NCs', data: [42, 28, 17, 9, 6, 3] }],
      options: {
        xaxis: {
          categories: ['0–7d', '8–14d', '15–30d', '31–60d', '61–90d', '90d+'],
          title: { text: 'Age' },
        },
      },
      CARD,
    }),
    template: `<div :class="CARD"><BaseChart type="histogram" :series="series" :options="options" ariaLabel="Open nonconformances by age bucket" /></div>`,
  }),
}

/** Funnel — stages are ordinal, so a one-hue ramp plus mandatory direct labels. */
export const Funnel = {
  render: () => ({
    components: { BaseChart },
    setup: () => ({
      series: [{ name: 'Records', data: [180, 124, 71, 38, 21] }],
      options: {
        xaxis: {
          categories: ['Quality Event', 'Nonconformance', 'CAPA', 'Effectiveness check', 'Verified'],
        },
      },
      CARD,
    }),
    template: `<div :class="CARD"><BaseChart type="funnel" :series="series" :height="360" :options="options" ariaLabel="Quality event to verified CAPA conversion" /></div>`,
  }),
}

/**
 * Figure metadata — scope, freshness and the withheld-cell count are stated
 * under the plot, because two viewers at different scopes legitimately see
 * different totals for the same KPI. `significance` carries `true` / `false` /
 * `null`; the `null` points render NO marker at all.
 */
export const WithFigureMetadata = {
  render: () => ({
    components: { BaseChart },
    setup: () => ({
      series: [{ name: 'Overdue %', data: [18, null, 22, 15, null, 11] }],
      // index 1 and 4 are withheld; index 3 had no applicable test
      significance: [true, null, false, null, null, true],
      options: { xaxis: { categories: ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'] } },
      computedAt: '2026-08-17T09:15:00.000Z',
      CARD,
    }),
    template: `<div :class="CARD"><BaseChart type="bar" :series="series" :options="options"
      :significance="significance" :suppressedCount="2" scope="department" :computedAt="computedAt"
      ariaLabel="Overdue percentage by month" /></div>`,
  }),
}

/** Loading — a chart-shaped skeleton, so the tile keeps its height. */
export const Loading = {
  render: () => ({
    components: { BaseChart },
    setup: () => ({ CARD }),
    template: `<div :class="CARD"><BaseChart type="bar" :series="[]" loading /></div>`,
  }),
}

/** Error — never an axis frame the reader could mistake for real zeroes. */
export const ErrorState = {
  render: () => ({
    components: { BaseChart },
    setup: () => ({ CARD }),
    template: `<div :class="CARD"><BaseChart type="bar" :series="[]" error="Request timed out" /></div>`,
  }),
}

/** Empty — says there is no data instead of drawing an empty axis frame. */
export const Empty = {
  render: () => ({
    components: { BaseChart },
    setup: () => ({ CARD }),
    template: `<div :class="CARD"><BaseChart type="bar" :series="[]" emptyDescription="No nonconformances were raised in this period." /></div>`,
  }),
}

/** Suppressed — every value withheld for small-cell privacy. Not "no data". */
export const Suppressed = {
  render: () => ({
    components: { BaseChart },
    setup: () => ({
      series: [{ name: 'Failures by assessor', data: [null, null, null, null] }],
      CARD,
    }),
    template: `<div :class="CARD"><BaseChart type="bar" :series="series" :suppressedCount="4" scope="own" /></div>`,
  }),
}
