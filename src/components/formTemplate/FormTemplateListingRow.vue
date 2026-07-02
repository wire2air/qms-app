<script setup>
import { IconHistory, IconClock, IconEdit, IconBrush, IconEye, IconTrash } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers'

const props = defineProps({
  template: {
    type: Object,
    required: true,
  },
  canDelete: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['navigate', 'preview', 'delete'])

const router = useRouter()

function navigateToTemplate(mode) {
  const path = getCompanyPath(`/templates/${props.template.id}`)
  const query = mode ? { mode } : undefined
  router.push({ path, query })
  emit('navigate', props.template, mode)
}

function menuItems() {
  const items = [
    { name: 'Edit', icon: IconEdit, click: () => navigateToTemplate() },
    { name: 'Design', icon: IconBrush, click: () => navigateToTemplate('schema') },
    { name: 'Preview', icon: IconEye, click: () => emit('preview', props.template) },
  ]
  if (props.canDelete) {
    items.push({ name: 'Delete', icon: IconTrash, click: () => emit('delete', props.template) })
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
