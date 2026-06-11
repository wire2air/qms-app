<script setup>
const props = defineProps({
  entityType: { type: String, default: null },
  entityId: { type: String, default: null },
  contextLabel: { type: String, default: null },
})

// Subdomain tenancy: routes are flat (the tenant is the host), so entity links
// no longer carry a company slug.
const ENTITY_ROUTES = {
  Document: (id) => `/documents/${id}`,
  Workflow: (id) => `/workflows/${id}`,
  WorkflowInstance: (id) => `/workflows/instances/${id}`,
  Nonconformance: (id) => `/nonconformances/${id}`,
  Supplier: (id) => `/suppliers/${id}`,
  AssetRequest: (id) => `/asset-requests/${id}`,
  FormTemplate: (id) => `/form-templates/${id}`,
}

const href = computed(() => {
  if (!props.entityType || !props.entityId) return null
  const routeFn = ENTITY_ROUTES[props.entityType]
  return routeFn ? routeFn(props.entityId) : null
})

const displayLabel = computed(() => props.contextLabel || props.entityType || props.entityId)
</script>

<template>
  <RouterLink
    v-if="href"
    :to="href"
    class="tw:text-primary tw:hover:underline tw:font-medium tw:text-sm"
  >
    {{ displayLabel }}
  </RouterLink>
  <span v-else class="tw:font-medium tw:text-sm tw:text-on-main">{{ displayLabel }}</span>
</template>
