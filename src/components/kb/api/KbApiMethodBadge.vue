<script setup>
/**
 * The HTTP method of an API operation, coloured the way developers expect:
 * GET green, POST blue, PUT/PATCH amber, DELETE red. EVENT (an OpenAPI 3.1
 * webhook, docs/plans/api-docs-portal.md "Open points") is purple.
 */
const props = defineProps({
  method: { type: String, required: true },
  size: { type: String, default: 'sm', validator: (v) => ['xs', 'sm'].includes(v) },
})
const SCHEME_MAP = {
  GET: 'tw:bg-green-100 tw:text-green-800',
  POST: 'tw:bg-blue-100 tw:text-blue-800',
  PUT: 'tw:bg-amber-100 tw:text-amber-800',
  PATCH: 'tw:bg-amber-100 tw:text-amber-800',
  DELETE: 'tw:bg-red-100 tw:text-red-800',
  EVENT: 'tw:bg-purple-100 tw:text-purple-800',
}
const scheme = computed(
  () => SCHEME_MAP[String(props.method).toUpperCase()] || 'tw:bg-gray-100 tw:text-gray-700',
)
</script>

<template>
  <span
    class="tw:inline-flex tw:shrink-0 tw:items-center tw:justify-center tw:rounded tw:font-semibold tw:uppercase tw:tracking-wide"
    :class="[
      scheme,
      size === 'xs'
        ? 'tw:min-w-10 tw:px-1 tw:text-micro'
        : 'tw:min-w-14 tw:px-1.5 tw:py-0.5 tw:text-xs',
    ]"
  >
    {{ method }}
  </span>
</template>
