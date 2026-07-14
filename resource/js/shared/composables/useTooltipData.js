import { computed } from 'vue'
import { TOOLTIPS } from '../data/tooltips.js'

export function useTooltipData(props = {}) {
  const getFromTooltipData = (key, field) => {
    if (!key) return ''
    const tooltipItem = TOOLTIPS.find((item) => item.key === key)
    return tooltipItem ? tooltipItem[field] || '' : ''
  }

  const computedTooltip = computed(
    () => props.tooltip || getFromTooltipData(props.dataKey, 'tooltip'),
  )
  const computedPlaceholder = computed(() => getFromTooltipData(props.dataKey, 'placeholder'))
  const computedLabel = computed(() => getFromTooltipData(props.dataKey, 'label'))
  const computedhelplinkkey = computed(() => getFromTooltipData(props.dataKey, 'helplinkkey'))

  //I want to create one func

  return {
    computedTooltip,
    computedPlaceholder,
    computedLabel,
    computedhelplinkkey,
    getFromTooltipData,
  }
}
