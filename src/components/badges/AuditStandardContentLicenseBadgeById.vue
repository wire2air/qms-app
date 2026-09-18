<script setup>
const props = defineProps({
  licenseId: { type: String, default: null },
})

// Static labels — drives the chip text. Styling lives in
// AuditStandardContentLicenseBadge's SCHEME_MAP.
const STATUS_MAP = {
  STRUCTURAL_SHELL: { id: 'STRUCTURAL_SHELL', name: 'Structural shell' },
  PUBLIC_DOMAIN: { id: 'PUBLIC_DOMAIN', name: 'Public domain' },
  OFFICIAL_LICENSED: { id: 'OFFICIAL_LICENSED', name: 'Vendor-licensed' },
  CUSTOMER_LICENSED: { id: 'CUSTOMER_LICENSED', name: 'Customer-licensed' },
  CUSTOMER_AUTHORED: { id: 'CUSTOMER_AUTHORED', name: 'Customer-authored' },
}

const license = computed(
  () =>
    STATUS_MAP[props.licenseId] ||
    (props.licenseId ? { id: props.licenseId, name: props.licenseId } : null),
)
</script>

<template>
  <AuditStandardContentLicenseBadge v-if="license" :license="license" v-bind="$attrs" />
</template>
