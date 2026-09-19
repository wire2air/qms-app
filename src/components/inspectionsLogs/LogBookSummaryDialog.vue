<script setup>
import { IconAlertTriangle, IconCircleCheck } from '@tabler/icons-vue'
import { describeLogBook } from './logBookSummary.js'

/**
 * "What does this book actually do?" — the book's own configuration read back
 * as sentences, plus anything switched on that cannot take effect.
 *
 * Deliberately NOT the Help Center article. That explains what a log book IS
 * and is reachable from the module header; this explains what THIS one is set
 * up to do, which is the question someone has while looking at the form.
 *
 * Everything comes from `describeLogBook`, a pure function, so the wording is
 * unit-tested and this file only lays it out.
 */
const props = defineProps({
  book: { type: Object, default: null },
  equipmentName: { type: String, default: '' },
  departmentName: { type: String, default: '' },
  typeName: { type: String, default: '' },
  cronText: { type: String, default: '' },
  siteCount: { type: Number, default: 0 },
  documentCount: { type: Number, default: 0 },
  assignmentCount: { type: Number, default: 0 },
  hasWorkflow: { type: Boolean, default: false },
})

const open = defineModel({ type: Boolean, default: false })

const summary = computed(() =>
  describeLogBook(props.book, {
    equipmentName: props.equipmentName,
    departmentName: props.departmentName,
    typeName: props.typeName,
    cronText: props.cronText,
    siteCount: props.siteCount,
    documentCount: props.documentCount,
    assignmentCount: props.assignmentCount,
    hasWorkflow: props.hasWorkflow,
  }),
)
</script>

<template>
  <BaseDialog v-model="open" title="What this log book does" maxWidth="lg">
    <div v-if="summary" class="tw:space-y-4 tw:py-1">
      <div class="tw:text-sm tw:font-semibold tw:text-on-main">{{ summary.headline }}</div>

      <!-- Gaps first: a setting that silently does nothing is the thing worth
           reading, and burying it under the working configuration defeats it. -->
      <div
        v-if="summary.gaps.length"
        class="tw:bg-amber-50 tw:border tw:border-amber-200 tw:rounded-lg tw:p-3 tw:space-y-2"
      >
        <div class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:font-semibold tw:text-amber-900">
          <IconAlertTriangle :size="16" />
          Needs attention
        </div>
        <ul class="tw:list-disc tw:pl-5 tw:space-y-1">
          <li v-for="gap in summary.gaps" :key="gap" class="tw:text-sm tw:text-amber-900">
            {{ gap }}
          </li>
        </ul>
      </div>
      <div
        v-else
        class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-green-700 tw:bg-green-50 tw:border tw:border-green-200 tw:rounded-lg tw:p-3"
      >
        <IconCircleCheck :size="16" />
        Nothing is switched on that cannot take effect.
      </div>

      <div v-for="section in summary.sections" :key="section.title" class="tw:space-y-1">
        <div
          class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary"
        >
          {{ section.title }}
        </div>
        <p v-for="line in section.lines" :key="line" class="tw:text-sm tw:text-on-main">
          {{ line }}
        </p>
      </div>
    </div>
    <div v-else class="tw:text-sm tw:text-secondary tw:py-2">Loading…</div>
  </BaseDialog>
</template>
