<script setup>
// Optional first-class envelope fields for a module record, in the right rail.
// All optional; edits autosave straight onto the Record. Initiator is fixed
// (the creator), so it's read-only.
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
      record.value.siteId,
      record.value.departmentId,
      record.value.dueDate,
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
        <DepartmentSelectMenu v-if="editable" v-model="record.departmentId" />
        <DepartmentBadgeById v-else-if="record.departmentId" :departmentId="record.departmentId" />
        <span v-else class="tw:text-secondary">—</span>
      </div>

      <div class="tw:flex tw:flex-col tw:gap-1">
        <p class="tw:text-xs tw:font-medium tw:text-secondary">Due date</p>
        <BaseDateField v-if="editable" v-model="record.dueDate" mode="date" />
        <span v-else-if="record.dueDate" class="tw:text-on-main">{{
          record.dueDate.formatDate?.('date') ?? record.dueDate
        }}</span>
        <span v-else class="tw:text-secondary">—</span>
      </div>

      <div v-if="saving" class="tw:text-xs tw:text-secondary">Saving…</div>
    </div>
  </BaseRailCard>
</template>
