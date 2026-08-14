<script setup>
import { IconHistory, IconClock, IconEdit, IconBrush, IconEye, IconArchive, IconCopy } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers'

const props = defineProps({
  template: {
    type: Object,
    required: true,
  },
  canUpdate: {
    type: Boolean,
    default: false,
  },
  canClone: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['navigate', 'preview', 'archive', 'clone'])

const router = useRouter()

function navigateToTemplate(mode) {
  const path = getCompanyPath(`/templates/${props.template.id}`)
  const query = mode ? { mode } : undefined
  router.push({ path, query })
  emit('navigate', props.template, mode)
}

function menuItems() {
  // Edit and Design both mutate the template, so they require the Update
  // capability — a role with only read/write scope but no `forms_templates:update`
  // must not see them (the detail page itself is already read-only for them).
  const items = []
  if (props.canUpdate) {
    items.push(
      { name: 'Edit', icon: IconEdit, click: () => navigateToTemplate() },
      { name: 'Design', icon: IconBrush, click: () => navigateToTemplate('schema') },
    )
  } else {
    items.push({ name: 'View', icon: IconEye, click: () => navigateToTemplate() })
  }
  items.push({ name: 'Preview', icon: IconEye, click: () => emit('preview', props.template) })
  if (props.canClone) {
    items.push({ name: 'Clone', icon: IconCopy, click: () => emit('clone', props.template) })
  }
  // Archive-only lifecycle: templates are never deleted (archived rows are the
  // version history; existing records keep referencing them by id).
  if (props.canUpdate) {
    items.push({
      name: props.template.statusId === 'ARCHIVED' ? 'Restore' : 'Archive',
      icon: IconArchive,
      click: () => emit('archive', props.template),
    })
  }
  return items
}
</script>

<template>
  <BaseClickableRow
    class="tw:group tw:bg-sidebar tw:border tw:border-divider tw:rounded-lg tw:p-3 tw:transition-all tw:hover:shadow-md tw:hover:border-primary/30"
    :aria-label="`Open template ${template.title}`"
    @click="navigateToTemplate()"
  >
    <div class="tw:flex tw:items-center tw:justify-between">
      <div class="tw:flex tw:gap-3 tw:items-start">
        <!-- Content Section -->
        <div class="tw:flex tw:flex-col tw:gap-1">
          <!-- Title and Code -->
          <div class="tw:flex tw:items-center tw:gap-3">
            <h4 class="tw:text-lg tw:font-bold tw:text-on-sidebar">
              {{ template.title }}
            </h4>
            <span
              class="tw:text-xs tw:px-2 tw:py-0.5 tw:rounded tw:bg-main tw:text-secondary"
            >
              Code: {{ template.code }}
            </span>
          </div>

          <!-- Metadata Row -->
          <div class="tw:flex tw:items-center tw:gap-4 tw:text-sm tw:text-secondary">
            <div class="tw:flex tw:items-center tw:gap-1.5">
              <IconHistory :size="18" />
              <span>Version: v{{ template.version }}</span>
            </div>
            <div class="tw:flex tw:items-center tw:gap-1.5">
              <IconClock :size="18" />
              <span>Modified: {{ template.updatedAt?.toRelative() }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Status and Actions -->
      <div class="tw:flex tw:items-center tw:gap-3">
        <FormTemplateStatusBadgeById :statusId="template.statusId" />
        <BaseMenu :items="menuItems()" @click.stop />
      </div>
    </div>
  </BaseClickableRow>
</template>
