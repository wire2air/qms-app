<script setup>
// Read-only preview of the section workflow shown while a record is in Draft —
// the creator sees every routed section (the steps that will fire on Start),
// its type/roles, and the fields each assignee will fill. Mirrors the CAPA/NC
// draft preview, but sourced from the template's sections (no workflow instance
// exists yet).

const props = defineProps({
  schema: { type: Array, default: () => [] },
})

const routedSections = computed(() =>
  (props.schema || [])
    .filter((f) => f.type === 'section' && f.routing && f.routing.type)
    .sort((a, b) => (a.routing.order ?? 0) - (b.routing.order ?? 0)),
)

function rolesFor(sec) {
  const r = sec.routing || {}
  if (r.roles?.length) return r.roles
  return r.assigneeRole ? [r.assigneeRole] : []
}
</script>

<template>
  <div v-if="routedSections.length" class="tw:flex tw:flex-col tw:gap-2">
    <h3 class="tw:text-sm tw:font-medium tw:text-on-main">Workflow steps</h3>
    <div
      v-for="(sec, i) in routedSections"
      :key="sec.name"
      class="tw:flex tw:flex-col tw:gap-2 tw:rounded-lg tw:border tw:border-divider tw:p-3"
    >
      <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
        <span class="tw:text-xs tw:text-secondary">Step {{ i + 1 }}</span>
        <span class="tw:font-medium tw:text-on-main">{{ sec.label || sec.name }}</span>
        <span
          class="tw:rounded tw:px-2 tw:py-0.5 tw:text-xs tw:font-medium"
          :class="
            sec.routing.type === 'APPROVAL'
              ? 'tw:bg-amber-100 tw:text-amber-700'
              : 'tw:bg-blue-100 tw:text-blue-700'
          "
        >
          {{ sec.routing.type === 'APPROVAL' ? 'Approval' : 'Action' }}
        </span>
        <div class="tw:flex-1" />
        <RoleBadgeById v-for="rid in rolesFor(sec)" :key="rid" :roleId="rid" />
      </div>

      <FormSchemaReadonlyView
        v-if="sec.routing.type !== 'APPROVAL' && sec.children && sec.children.length"
        :fields="sec.children"
        :values="{}"
      />
      <p v-else class="tw:text-xs tw:text-secondary">
        {{ sec.routing.type === 'APPROVAL' ? 'Approve / Reject sign-off.' : 'No fields.' }}
      </p>
    </div>
  </div>
</template>
