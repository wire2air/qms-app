<script setup>
// First-class envelope for a module record: Initiator (fixed — the creator),
// Owner, Site, Department. These are RECORD columns, not form fields — scoped
// access, automation and notifications key on them, and a module author may
// never add equivalents to the form. They're collected on the create page and
// live here for edit/view. (Record due date has no UI — removed 2026-08-23.)
const props = defineProps({
  recordId: { type: String, required: true },
  editable: { type: Boolean, default: true },
})

const record = useLiveQueryWithDeps(
  [() => props.recordId],
  async (db, [id]) => (id ? db.Record.findByPk(id) : null),
  { models: ['Record'] },
)

const toast = useToast()
const saving = ref(false)
const isFirst = ref(true)
const save = useDebounceFn(async () => {
  if (!record.value) return
  saving.value = true
  try {
    await record.value.save()
  } catch (e) {
    // Pessimistic saves fail loudly by design — a refused envelope edit
    // (authz) must not die silently while the pooled instance keeps showing
    // the phantom value.
    toast.error(e?.message || 'Could not save record details')
  } finally {
    saving.value = false
  }
}, 600)

// Watch only the rail-owned fields so payload autosave elsewhere doesn't fire us.
watch(
  () =>
    record.value && [
      record.value.ownerUserId,
      record.value.siteId,
      record.value.departmentId,
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

      <div class="tw:flex tw:flex-col tw:gap-1">
        <p class="tw:text-xs tw:font-medium tw:text-secondary">Site</p>
        <SiteSelectMenu v-if="editable" v-model="record.siteId" />
        <SiteBadgeById v-else-if="record.siteId" :siteId="record.siteId" />
        <span v-else class="tw:text-secondary">—</span>
      </div>

      <div class="tw:flex tw:flex-col tw:gap-1">
        <p class="tw:text-xs tw:font-medium tw:text-secondary">Department</p>
        <DepartmentSelectMenu
          v-if="editable"
          v-model="record.departmentId"
          :siteId="record.siteId"
        />
        <DepartmentBadgeById v-else-if="record.departmentId" :departmentId="record.departmentId" />
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
