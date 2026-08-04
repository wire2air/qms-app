<script setup>
import { IconPlus } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { selectableSites } from '@/utils/siteOptions.js'

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
  isFilter: {
    type: Boolean,
    default: false,
  },
  // Opt IN to the inactive-site gate. `is_active` governs who may be NEWLY
  // ASSIGNED TO a site — it is a user-placement rule, not a global "this site is
  // hidden" flag, and the backend scopes it exactly that way
  // (api/utils/siteAssignment.js).
  //
  // This menu is mounted at ~20 sites — CAPA/NC/CR/audit/supplier/log-book
  // record fields, the departments filter, the training report filter, the form
  // builder. Gating them all would mean that deactivating a site removes it from
  // the FILTERS you need to work through the records still open there, and blocks
  // creating a department at a site mid-closeout. That is the opposite of the
  // retain-what-exists behaviour the flag was designed for.
  //
  // So: default off, and turned on only where a site is being attached to a USER.
  forAssignment: {
    type: Boolean,
    default: false,
  },
  nullLabel: {
    type: String,
    default: null,
  },
})

const modelValue = defineModel({
  type: [String, Array, null],
  default: null,
})

const allSites = useLiveQuery((db) => db.Site.where().exec(), { models: ['Site'], initial: [] })

// Inactive sites can't be NEWLY assigned, but one that is ALREADY selected must
// keep being offered — see selectableSites for why.
const sites = computed(() =>
  props.forAssignment ? selectableSites(allSites.value, modelValue.value) : allSites.value,
)

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

const resolvedNullLabel = computed(
  () => props.nullLabel ?? (props.isFilter ? '— All sites —' : '— Select site —'),
)
</script>

<template>
  <div class="tw:flex tw:items-center tw:gap-2">
    <div class="tw:flex-1 tw:min-w-0">
      <BaseSelect
        v-model="modelValue"
        :options="sites"
        optionLabel="name"
        optionValue="id"
        :nullLabel="resolvedNullLabel"
        :required="props.required"
        :multiple="props.multiple"
        :clearable="!props.required"
      >
        <!-- Consumer may fully replace the trigger with a compact "+ Add" button. -->
        <template v-if="$slots.button" #trigger="scope">
          <slot name="button" v-bind="scope" />
        </template>

        <template #selected="{ options, remove }">
          <div class="tw:flex tw:flex-wrap tw:gap-1">
            <SiteBadgeById
              v-for="o in options"
              :key="o.value"
              :siteId="o.value"
              :clearable="props.multiple && (!props.required || options.length > 1)"
              @clear="() => remove(o)"
            />
          </div>
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
      </BaseSelect>
    </div>

    <SitesCreateUpdateDialog
      v-if="showCreateDialog"
      v-model="showCreateDialog"
      @created="onSiteCreated"
    />
  </div>
</template>
