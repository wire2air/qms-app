<script setup>
const props = defineProps({
  field: { type: Object, required: true },
  values: { type: Object, default: () => ({}) },
})

// Prefer the embedded snapshot from the field definition (stamped
// when the workflow author picked the template), fall back to looking
// up the value-recorded _templateId. The embed path is the supplier-
// safe path; the FK path is the legacy fallback.
const template = useLiveQueryWithDeps(
  [() => props.field?.rcaTemplate, () => props.values?._templateId],

  async (db, [embedded, id]) => {
    if (embedded?.config) return embedded
    if (!id) return null
    return db.RcaTemplate.findByPk(id)
  },
  { models: ['RcaTemplate'] },
)
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <!-- Header -->
    <div class="tw:flex tw:items-center tw:gap-2">
      <RcaMethodBadge v-if="values._method" :method="values._method" />
      <span v-if="template" class="tw:text-sm tw:font-medium tw:text-on-main">{{
        template.name
      }}</span>
    </div>

    <!-- Root cause -->
    <div
      v-if="values.outcome?.rootCause"
      class="tw:bg-primary/5 tw:border tw:border-primary/20 tw:rounded-lg tw:p-3"
    >
      <div class="tw:text-xs tw:font-semibold tw:text-primary tw:uppercase tw:mb-1">Root Cause</div>
      <p class="tw:text-sm tw:text-on-main">{{ values.outcome.rootCause }}</p>
    </div>

    <!-- Fishbone summary -->
    <template v-if="values._method === 'fishbone' && values.fishbone">
      <div class="tw:text-xs tw:text-secondary tw:font-semibold tw:uppercase">
        Contributing Causes
      </div>
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <span
          v-for="cause in (values.fishbone.branches ?? []).flatMap((b) =>
            b.causes.filter((c) => c.selected),
          )"
          :key="cause.id"
          class="tw:text-xs tw:bg-main-hover tw:rounded tw:px-2 tw:py-0.5"
          :class="
            cause.isRootCause
              ? 'tw:border tw:border-amber-400 tw:text-amber-700'
              : 'tw:text-secondary'
          "
        >
          {{ cause.text }}
        </span>
      </div>
    </template>

    <!-- 5 Why summary -->
    <template v-if="values._method === '5why' && values['5why']">
      <div
        v-for="(why, idx) in (values['5why'].whys ?? []).filter((w) => w.answer)"
        :key="why.id"
        class="tw:text-xs tw:text-secondary"
      >
        <span class="tw:font-medium">Why {{ idx + 1 }}:</span> {{ why.answer }}
      </div>
    </template>

    <!-- Is/Is Not summary -->
    <template v-if="values._method === 'isnot' && values.isnot">
      <div v-if="values.isnot.probableCauses" class="tw:text-xs tw:text-secondary">
        <span class="tw:font-medium">Probable causes:</span> {{ values.isnot.probableCauses }}
      </div>
    </template>

    <!-- FTA summary -->
    <template v-if="values._method === 'fta' && values.fta">
      <div v-if="(values.fta.criticalPath ?? []).length" class="tw:text-xs tw:text-secondary">
        <span class="tw:font-medium">Critical path:</span>
        {{ (values.fta.criticalPath ?? []).join(' → ') }}
      </div>
    </template>

    <div v-if="!values.outcome?.rootCause && !values._method" class="tw:text-sm tw:text-secondary">
      —
    </div>
  </div>
</template>
