import BaseChart from './BaseChart.vue'

/**
 * BaseChart — lazy ApexCharts wrapper with brand defaults. Verify rendering here
 * (charts need a real DOM).
 */
export default {
  title: 'Data/BaseChart',
  component: BaseChart,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}

export const Area = {
  render: () => ({
    components: { BaseChart },
    setup: () => ({
      series: [{ name: 'Open NCs', data: [3, 5, 2, 8, 6, 4, 7] }],
      options: { xaxis: { categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] } },
    }),
    template: `<div class="tw:max-w-2xl tw:bg-card tw:rounded-xl tw:border tw:border-divider tw:p-4"><BaseChart type="area" :series="series" :options="options" /></div>`,
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
    }),
    template: `<div class="tw:max-w-2xl tw:bg-card tw:rounded-xl tw:border tw:border-divider tw:p-4"><BaseChart type="bar" :series="series" :options="options" /></div>`,
  }),
}

export const Donut = {
  render: () => ({
    components: { BaseChart },
    setup: () => ({
      series: [44, 55, 13, 33],
      options: { labels: ['Draft', 'In Review', 'Approved', 'Effective'] },
    }),
    template: `<div class="tw:max-w-md tw:bg-card tw:rounded-xl tw:border tw:border-divider tw:p-4"><BaseChart type="donut" :series="series" :height="320" :options="options" /></div>`,
  }),
}
