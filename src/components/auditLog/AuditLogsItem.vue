<script setup>
import { ENTITY_LABEL_RESOLVERS } from '@/utils/auditConstants.js'
import { DISPLAY_TYPE_LABELS } from '@/utils/auditFieldFormatters.js'
import { singular } from 'pluralize'
import { IconChevronUp, IconChevronDown } from '@tabler/icons-vue'

const props = defineProps({
  log: {
    type: Object,
    required: true,
  },
})

const expanded = ref(false)
const hasDiff = computed(() => props.log.oldValueJson || props.log.newValueJson)

// Resolve performer from synced User model in IDB
const performer = useLiveQuery(
  (db) => (props.log.performedBy ? db.User.findByPk(props.log.performedBy) : Promise.resolve(null)),
  { models: 'User' },
)

const performerName = computed(() => {
  if (!performer.value) return 'System'
  return `${performer.value.firstName} ${performer.value.lastName}`.trim()
})

// Resolve entity display label live from IDB.
// Child entity resolvers (e.g. WorkflowStep) chain to their parent via `this`.
// isChild=true when the entity resolved to a different (parent) type.
const resolvedEntity = useLiveQueryWithDeps(
  [() => props.log.entityType, () => props.log.entityId],
  async (db, [entityType, entityId]) => {
    if (!entityType || !entityId)
      return { label: null, displayType: entityType, displayId: entityId, isChild: false }

    const singularType = singular(entityType)
    const resolver = ENTITY_LABEL_RESOLVERS[singularType]
    if (!resolver)
      return { label: entityId, displayType: singularType, displayId: entityId, isChild: false }
    const result = await resolver.call(ENTITY_LABEL_RESOLVERS, entityId, db)
    if (!result) return null
    return { ...result, isChild: result.displayType !== singularType }
  },
  { models: '*', initial: { label: null, displayType: null, displayId: null, isChild: false } },
)

const displayAction = computed(() => (resolvedEntity.value?.isChild ? 'UPDATE' : props.log.action))
</script>

<template>
  <div v-if="resolvedEntity" class="tw:hover:bg-main-hover tw:transition-colors">
    <BaseClickableRow
      class="tw:px-5 tw:py-3 tw:flex tw:items-start tw:gap-4"
      :class="{ 'tw:cursor-pointer': hasDiff }"
      :disabled="!hasDiff"
      :aria-label="expanded ? 'Collapse change details' : 'Expand change details'"
      :aria-expanded="hasDiff ? expanded : undefined"
      @click="hasDiff && (expanded = !expanded)"
    >
      <!-- Action badge -->
      <div class="tw:shrink-0 tw:pt-0.5">
        <AuditLogActionBadge :action="displayAction" />
      </div>

      <!-- Content -->
      <div class="tw:flex-1 tw:min-w-0">
        <div class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
          <AuditLogEntityLink
            :entityType="resolvedEntity.displayType"
            :entityId="resolvedEntity.displayId"
            :contextLabel="resolvedEntity.label"
          />
          <span
            class="tw:text-micro tw:px-1.5 tw:py-0.5 tw:rounded tw:bg-main tw:text-secondary tw:border tw:border-divider"
          >
            {{ DISPLAY_TYPE_LABELS[resolvedEntity.displayType] || resolvedEntity.displayType }}
          </span>
        </div>
        <div class="tw:text-xs tw:text-secondary tw:mt-0.5">
          by {{ performerName }}
          <span class="tw:mx-1">&middot;</span>
          {{ log.createdAt?.formatDate('datetime') }}
        </div>
      </div>

      <!-- Expand toggle if there's a diff -->
      <div v-if="hasDiff" class="tw:shrink-0 tw:text-secondary">
        <IconChevronUp v-if="expanded" :size="16" />
        <IconChevronDown v-else :size="16" />
      </div>
    </BaseClickableRow>

    <!-- Diff viewer -->
    <div v-if="expanded && hasDiff" class="tw:px-5 tw:pb-4">
      <AuditLogsDiffViewer :log="log" :resolvedEntity="resolvedEntity" />
    </div>
  </div>
</template>
