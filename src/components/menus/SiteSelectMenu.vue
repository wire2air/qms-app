<script setup>
import { IconPlus } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const props = defineProps({
  required: {
    type: Boolean,
    default: false,
  },
  multiple: {
    type: Boolean,
    default: false,
  },
  allowCreate: {
    type: Boolean,
    default: true,
  },
})

const modelValue = defineModel({
  type: [String, Array, null],
  default: null,
})

const sites = useLiveQuery((db) => db.Site.where().exec(), { models: ['Site'], initial: [] })

const canCreateSite = computed(() => props.allowCreate && isAllowed(['sites:create']))

const showCreateDialog = ref(false)
const createIconRef = ref(null)

function openCreateDialog(closePopover) {
  closePopover?.()
  showCreateDialog.value = true
}

function onSiteCreated(newSite) {
  if (!newSite?.id) return

  if (props.multiple) {
    const arr = Array.isArray(modelValue.value) ? modelValue.value : []
    if (!arr.includes(newSite.id)) {
      modelValue.value = [...arr, newSite.id]
    }
  } else {
    modelValue.value = newSite.id
  }

  // BaseDialog returns focus to the previously focused element, but if the
  // create action came from inside the (now-closed) dropdown, send focus to
  // the inline + button as a stable landing spot.
  nextTick(() => createIconRef.value?.focus?.())
}

function getArray() {
  return Array.isArray(modelValue.value) ? modelValue.value : []
}
</script>

<template>
  <div class="tw:flex tw:items-center tw:gap-2">
    <div class="tw:flex-1 tw:min-w-0">
      <BaseSelectMenu
        v-model="modelValue"
        :items="sites"
        nullLabel="— All sites —"
        :required="required"
        :multiple="multiple"
      >
        <template #button="scope">
          <slot name="button" v-bind="scope">
            <!-- MULTIPLE MODE -->
            <template v-if="multiple">
              <div v-if="getArray().length" class="tw:flex tw:flex-wrap tw:gap-1">
                <SiteBadgeById
                  v-for="siteId in getArray()"
                  :key="siteId"
                  :siteId="siteId"
                  :clearable="!required || getArray().length > 1"
                  @clear="() => scope.clear(siteId)"
                />
              </div>
              <BaseBadge v-else class="tw:text-sm tw:font-medium tw:text-placeholder" selectable>
                Select Sites
              </BaseBadge>
            </template>

            <!-- SINGLE MODE -->
            <template v-else>
              <SiteBadgeById
                v-if="modelValue"
                :siteId="modelValue"
                :clearable="!required"
                selectable
                @clear="() => scope.clear(modelValue)"
              />
              <BaseBadge v-else class="tw:text-sm tw:font-medium tw:text-placeholder" selectable>
                Select Site
              </BaseBadge>
            </template>
          </slot>
        </template>

        <template v-if="canCreateSite" #footer="{ close }">
          <button
            type="button"
            class="tw:w-full tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-2.5 tw:text-sm tw:font-medium tw:text-primary tw:hover:bg-primary/5 tw:border-t tw:border-divider tw:transition-colors"
            @click="openCreateDialog(close)"
          >
            <IconPlus :size="16" />
            Add New Site
          </button>
        </template>
      </BaseSelectMenu>
    </div>

    <SitesCreateUpdateDialog
      v-if="showCreateDialog"
      v-model="showCreateDialog"
      @created="onSiteCreated"
    />
  </div>
</template>
