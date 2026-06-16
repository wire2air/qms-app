<script setup>
const props = defineProps({
  certificateTypeId: { type: String, default: null },
})

const certificateType = useLiveQueryWithDeps(
  [() => props.certificateTypeId],
  async (db, [id]) => {
    if (!id) return null
    return db.SupplierCertificateType.findByPk(id)
  },

  { models: ['SupplierCertificateType'], initial: null },
)
</script>

<template>
  <SupplierCertificateTypeBadge
    v-if="certificateType"
    :certificateType="certificateType"
    v-bind="$attrs"
  />
</template>
