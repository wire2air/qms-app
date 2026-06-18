<script setup>
/**
 * BaseChart — a thin, lazy-loaded wrapper over ApexCharts (vue3-apexcharts) for
 * dashboards and reports. ApexCharts (~140KB) is `defineAsyncComponent`-loaded,
 * so it ships only on routes that actually render a chart (BaseSpinner shows
 * while it loads). Sensible brand defaults (no toolbar, inherited font, brand
 * palette, dashed grid, bottom legend) are merged with the consumer's `options`.
 *
 *   <BaseChart type="area" :series="[{ name: 'Open NCs', data: [3,5,2,8,6] }]"
 *              :options="{ xaxis: { categories: ['Mon','Tue','Wed','Thu','Fri'] } }" />
 *   <BaseChart type="donut" :series="[44, 55, 13]" :options="{ labels: ['Open','Closed','Draft'] }" />
 *
 * ApexCharts renders SVG (needs a real DOM) — verify in Storybook/app, not jsdom.
 */
import { defineAsyncComponent } from 'vue'
import BaseSpinner from './BaseSpinner.vue'

const props = defineProps({
  // line | area | bar | column | donut | pie | radialBar | scatter | heatmap | …
  type: { type: String, default: 'line' },
  series: { type: Array, required: true },
  height: { type: [Number, String], default: 300 },
  // ApexCharts options; deep-merged over the brand defaults below.
  options: { type: Object, default: () => ({}) },
})

const ApexChart = defineAsyncComponent({
  loader: () => import('vue3-apexcharts'),
  loadingComponent: BaseSpinner,
})

// Hex palette (SVG fills can't reliably use CSS vars) — mirrors the brand/semantic tokens.
const PALETTE = ['#136dec', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

const DEFAULTS = {
  chart: { toolbar: { show: false }, fontFamily: 'inherit', animations: { speed: 300 } },
  colors: PALETTE,
  dataLabels: { enabled: false },
  grid: { borderColor: '#e5e7eb', strokeDashArray: 4 },
  legend: { position: 'bottom' },
  stroke: { curve: 'smooth', width: 2 },
}

const mergedOptions = computed(() => {
  const o = props.options || {}
  return {
    ...DEFAULTS,
    ...o,
    // re-merge the nested keys we default so consumer overrides compose, not replace
    chart: { ...DEFAULTS.chart, ...o.chart },
    dataLabels: { ...DEFAULTS.dataLabels, ...o.dataLabels },
    grid: { ...DEFAULTS.grid, ...o.grid },
    legend: { ...DEFAULTS.legend, ...o.legend },
    stroke: { ...DEFAULTS.stroke, ...o.stroke },
    colors: o.colors || DEFAULTS.colors,
  }
})
</script>

<template>
  <ApexChart :type="type" :series="series" :height="height" :options="mergedOptions" />
</template>
