<script setup>
defineProps({
  title: { type: String, required: true },
  rows: { type: Array, default: () => [] },
  columns: { type: Array, required: true },
  // [{ key, label, align?: 'right' | 'left', format?: 'usd' | 'number' }]
})

function fmt(value, format) {
  if (value == null) return '—'
  if (format === 'usd') return `$${Number(value).toFixed(Number(value) >= 1 ? 2 : 4)}`
  if (format === 'number') return new Intl.NumberFormat().format(value)
  if (typeof value === 'number') return new Intl.NumberFormat().format(value)
  return value
}
</script>

<template>
  <div class="tw:rounded-lg tw:border tw:border-divider tw:bg-main tw:overflow-hidden">
    <div class="tw:px-4 tw:py-2.5 tw:border-b tw:border-divider tw:text-sm tw:font-semibold tw:text-on-main">
      {{ title }}
    </div>
    <div class="tw:overflow-x-auto">
      <table v-if="rows.length > 0" class="tw:w-full tw:text-sm">
        <thead>
          <tr class="tw:bg-sidebar/40">
            <th
              v-for="c in columns"
              :key="c.key"
              class="tw:px-3 tw:py-2 tw:text-xs tw:text-secondary tw:font-semibold tw:uppercase tw:tracking-wide"
              :class="c.align === 'right' ? 'tw:text-right' : 'tw:text-left'"
            >
              {{ c.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in rows" :key="i" class="tw:border-t tw:border-divider">
            <td
              v-for="c in columns"
              :key="c.key"
              class="tw:px-3 tw:py-2 tw:text-on-main"
              :class="c.align === 'right' ? 'tw:text-right tw:font-mono tw:text-xs' : ''"
            >
              {{ fmt(r[c.key], c.format) }}
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="tw:py-6 tw:text-center tw:text-sm tw:text-secondary">No data.</div>
    </div>
  </div>
</template>
