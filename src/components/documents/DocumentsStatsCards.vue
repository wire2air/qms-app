<script setup>
import {
  IconNotes,
  IconClipboardList,
  IconCircleCheck,
  IconChecks,
  IconArchive,
  IconFolder,
  IconFileDescription,
} from '@tabler/icons-vue'

const props = defineProps({
  stats: {
    type: Array,
    default: () => [],
  },
  total: {
    type: Number,
    default: 0,
  },
  loading: {
    type: Boolean,
    default: false,
  },
})

const iconMap = {
  DRAFT: IconNotes,
  IN_REVIEW: IconClipboardList,
  APPROVED: IconCircleCheck,
  EFFECTIVE: IconChecks,
  OBSOLETE: IconArchive,
  ARCHIVED: IconArchive,
}

// BaseStatStrip color keys (primary | blue | red | amber | green | secondary).
const colorMap = {
  DRAFT: 'secondary',
  IN_REVIEW: 'amber',
  APPROVED: 'green',
  EFFECTIVE: 'blue',
  OBSOLETE: 'secondary',
  ARCHIVED: 'secondary',
}

const nameMap = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In Review',
  APPROVED: 'Approved',
  EFFECTIVE: 'Effective',
  OBSOLETE: 'Obsolete',
  ARCHIVED: 'Archived',
}

// Compact KPI strip: Total first, then one item per status bucket.
const kpiItems = computed(() => [
  { key: '__total', label: 'Total', value: props.total, icon: IconFolder, color: 'primary' },
  ...props.stats.map((stat) => ({
    key: stat.statusId,
    label: nameMap[stat.statusId] || stat.statusId,
    value: stat.count,
    icon: iconMap[stat.statusId] || IconFileDescription,
    color: colorMap[stat.statusId] || 'secondary',
  })),
])
</script>

<template>
  <BaseStatStrip :items="kpiItems" />
</template>
