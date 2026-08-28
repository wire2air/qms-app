<script setup>
// Envelope fields for a module record, in the right rail: Initiator (fixed —
// the creator) and Owner. Site / Department / Due date left the rail
// 2026-08-28: authors add those as FORM fields where a module needs them, and
// a DB trigger mirrors the first site/department lookup answer onto the
// record's first-class columns so scoped access and automation keep working.
const props = defineProps({
  recordId: { type: String, required: true },
  editable: { type: Boolean, default: true },
})

const record = useLiveQueryWithDeps(
  [() => props.recordId],
  async (db, [id]) => (id ? db.Record.findByPk(id) : null),
  { models: ['Record'] },
)

const saving = ref(false)
const isFirst = ref(true)
const save = useDebounceFn(async () => {
  if (!record.value) return
  saving.value = true
  try {
    await record.value.save()
  } finally {
    saving.value = false
  }
}, 600)

// Watch only the rail-owned fields so payload autosave elsewhere doesn't fire us.
watch(
  () =>
    record.value && [
      record.value.ownerUserId,
    ],
  () => {
    if (isFirst.value) {
      isFirst.value = false
      return
    }
    save()
  },
)
</script>

<template>
  <BaseRailCard v-if="record" title="Details">
    <div class="tw:flex tw:flex-col tw:gap-3 tw:text-sm">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <p class="tw:text-xs tw:font-medium tw:text-secondary">Initiator</p>
        <UserBadgeById v-if="record.userId" :userId="record.userId" />
        <span v-else class="tw:text-secondary">—</span>
      </div>

      <div class="tw:flex tw:flex-col tw:gap-1">
        <p class="tw:text-xs tw:font-medium tw:text-secondary">Owner</p>
        <UserSelectMenu v-if="editable" v-model="record.ownerUserId" kind="INTERNAL" />
        <UserBadgeById v-else-if="record.ownerUserId" :userId="record.ownerUserId" />
        <span v-else class="tw:text-secondary">—</span>
      </div>

      <div v-if="saving" class="tw:text-xs tw:text-secondary">Saving…</div>
    </div>
  </BaseRailCard>

  <!-- External sharing — same card as CAPA/NC; the authz module is the
       record's own moduleKey (promoted modules carry manage_access since
       2026-08-27). Below Details (user request 2026-08-27): the envelope is
       what you consult constantly, sharing is occasional. -->
  <RecordShareCard
    v-if="record"
    entityType="Record"
    :entityId="record.id"
    :module="record.moduleKey"
    :record="record"
    scopeOwnerField="ownerUserId"
  />

  <!-- Supplier PORTAL access — read grants for supplier users, any status,
       CLOSED included (user request 2026-08-27). Distinct from the draft-time
       "Share with supplier" (workflow routing) and from the email link above.
       entityType = the moduleKey: records_sel matches shared_with_user rows
       against records.module_key. -->
  <SupplierPortalShareCard
    v-if="record?.moduleKey"
    :entityType="record.moduleKey"
    :entityId="record.id"
    :module="record.moduleKey"
    :supplierId="record.supplierId || null"
  />
</template>
