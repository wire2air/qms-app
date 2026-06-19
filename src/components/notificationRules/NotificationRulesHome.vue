<script setup>
import { IconBell } from '@tabler/icons-vue'
import { NOTIFICATION_ENTITIES } from '@/utils/notificationEntities.js'

// Company DEFAULT cc recipients — one row per entity. The worker merges these
// with each record's own notify list. Empty default = nothing fires unless a
// record names recipients.
const rules = useLiveQuery(async (db) => db.NotificationRule.where().exec(), {
  models: ['NotificationRule'],
  initial: [],
})

const ruleByEntity = computed(() => {
  const map = {}
  for (const r of rules.value) map[r.entityType] = r
  return map
})

const createRule = useLiveMutation(async (db, payload) => {
  const rule = db.NotificationRule.create(payload)
  await rule.save()
  return rule
})

const saving = ref(false)

// Find-or-create the entity's default row, set one recipient list, persist.
async function update(entityType, key, value) {
  if (saving.value) return
  saving.value = true
  try {
    let rule = ruleByEntity.value[entityType]
    if (!rule) {
      rule = await createRule({
        entityType,
        recipients: { groupIds: [], userIds: [] },
        isActive: true,
      })
    }
    rule.recipients = { ...(rule.recipients || {}), [key]: value }
    await rule.save()
  } finally {
    saving.value = false
  }
}

function groupIdsOf(entityType) {
  return ruleByEntity.value[entityType]?.recipients?.groupIds ?? []
}
function userIdsOf(entityType) {
  return ruleByEntity.value[entityType]?.recipients?.userIds ?? []
}
</script>

<template>
  <BasePage width="standard">
    <PageHeader
      :icon="IconBell"
      title="Notification defaults"
      subtitle="Default groups/people cc'd on every record of a type. Per-record lists add to these."
    />

    <div class="tw:flex tw:flex-col tw:gap-4">
      <div
        v-for="entity in NOTIFICATION_ENTITIES"
        :key="entity.value"
        class="tw:bg-card tw:rounded-xl tw:border tw:border-divider tw:p-5"
      >
        <BaseText variant="overline" class="tw:block tw:mb-3">{{ entity.label }}</BaseText>
        <NotificationCcField
          :groupIds="groupIdsOf(entity.value)"
          :userIds="userIdsOf(entity.value)"
          @update:groupIds="(v) => update(entity.value, 'groupIds', v)"
          @update:userIds="(v) => update(entity.value, 'userIds', v)"
        />
      </div>
    </div>
  </BasePage>
</template>
