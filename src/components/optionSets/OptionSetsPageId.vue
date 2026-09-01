<script setup>
import { IconEdit, IconTrash, IconPlus, IconInfoCircle } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { buildOptionSetSections, buildOptionSetActions } from './optionSetDetailConfig.js'

const props = defineProps({
  id: {
    type: String,
    required: true,
  },
})

const router = useRouter()

const optionSet = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    return db.OptionSet.findByPk(id)
  },
  { models: ['OptionSet'] },
)

const loading = computed(() => optionSet.value === undefined)
const canUpdate = computed(() => isAllowed(['option_sets:update']))
// CFL L-1. Delete used to be gated on `canUpdate` here while the list pages
// (OptionSetsTab / OptionSetsHome) gated the identical operation on
// `option_sets:delete`. `delete` is the correct verb — the authz catalog
// registers it, the REST route enforces it (routes/optionSets.js), and the
// seeded Quality Manager role deliberately withholds it — so the detail page was
// the outlier. Enforced in the database too, by the soft-delete guard in
// migration 20260902301000: option_sets is paranoid, so `delete()` below is an
// UPDATE that sets deleted_at, which option_set_update_rls alone would admit.
const canDelete = computed(() => isAllowed(['option_sets:delete']))

const editingOptionIndex = ref(-1)
const editingName = ref(false)
const firstInitialized = ref(false)

const breadcrumbs = computed(() => [
  { label: 'Option Sets', to: getCompanyPath('/option-sets') },
  { label: optionSet.value?.name || 'Edit Option Set' },
])

const debouncedSave = useDebounceFn(async () => {
  if (!optionSet.value) return

  const hasEmptyOption = optionSet.value.options.some((opt) => !opt || opt.trim() === '')
  if (hasEmptyOption) return

  await optionSet.value.save()
}, 500)

watch(
  optionSet,
  () => {
    if (!firstInitialized.value) {
      firstInitialized.value = true
      return
    }

    debouncedSave()
  },
  { immediate: true, deep: true },
)

function goBack() {
  const currentPath = router.currentRoute.value.path
  const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/'))
  router.push(parentPath)
}

function startEditOption(index) {
  editingOptionIndex.value = index
}

function stopEditOption() {
  editingOptionIndex.value = -1
}

function addOption() {
  optionSet.value.options.push('')
  startEditOption(optionSet.value.options.length - 1)
}

function removeOption(index) {
  optionSet.value.options.splice(index, 1)
}

async function confirmDelete() {
  await optionSet.value.delete()
  goBack()
}

// ─── BaseDetailLayout config ──────────────────────────────────────────────────
const optionSetActions = computed(() =>
  buildOptionSetActions({ canDelete: canDelete.value }, { delete: confirmDelete }),
)
const optionSetDetailConfig = computed(() =>
  defineDetailConfig({
    variant: 'standard',
    width: 'standard',
    breadcrumbs: breadcrumbs.value,
    actions: optionSetActions.value,
    sections: buildOptionSetSections(optionSet.value),
  }),
)
</script>

<template>
  <BaseDetailLayout
    :config="optionSetDetailConfig"
    :record="optionSet"
    :loading="loading"
    :notFound="!loading && !optionSet"
    notFoundTitle="Option set not found"
    notFoundDescription="This option set could not be found."
  >
    <template #title>
      <BaseTextInput
        v-if="editingName && canUpdate"
        v-model="optionSet.name"
        size="sm"
        autofocus
        @keyup.enter="editingName = false"
        @blur="editingName = false"
      />
      <BaseClickableRow
        v-else
        class="tw:text-base tw:font-semibold tw:text-on-main"
        :class="canUpdate ? 'tw:hover:text-primary' : ''"
        :disabled="!canUpdate"
        aria-label="Edit option set name"
        @click="canUpdate && (editingName = true)"
      >
        {{ optionSet?.name }}
      </BaseClickableRow>
    </template>

    <template v-if="optionSet" #meta>
      <span>{{ optionSet.options?.length || 0 }} options</span>
    </template>

    <template #actions>
      <DetailActionBar :actions="optionSetActions" />
    </template>

    <template v-if="optionSet" #section-details>
      <!-- Options Manager Card -->
      <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
        <div class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover">
          <div class="tw:flex tw:items-center tw:justify-between">
            <div class="tw:text-xl tw:font-bold tw:text-on-main">Options</div>
            <BaseButton v-if="canUpdate" size="sm" @click="addOption">
              <IconPlus :size="14" />
              Add Option
            </BaseButton>
          </div>
        </div>
        <div class="tw:p-6">
          <div
            v-if="!optionSet.options?.length"
            class="tw:text-secondary tw:text-center tw:p-12 tw:bg-main-hover tw:rounded-xl tw:border-2 tw:border-dashed tw:border-divider"
          >
            No options added yet. Click "Add Option" to start.
          </div>

          <div v-else class="tw:flex tw:flex-col">
            <div
              v-for="(opt, idx) in optionSet.options"
              :key="idx"
              class="tw:flex tw:items-center tw:gap-1 tw:group"
            >
              <!-- Number -->
              <div class="tw:w-6 tw:text-secondary tw:text-xs">{{ idx + 1 }}.</div>

              <!-- Option Content -->
              <div class="tw:flex-1">
                <!-- Display Mode -->
                <BaseClickableRow
                  v-if="editingOptionIndex !== idx"
                  class="tw:text-base tw:px-2 tw:py-1 tw:rounded-lg tw:transition-all tw:duration-200 tw:text-on-main tw:flex tw:items-center tw:justify-between tw:hover:bg-main-hover"
                  :disabled="!canUpdate"
                  :aria-label="`Edit option ${opt || 'Empty option'}`"
                  @click="startEditOption(idx)"
                >
                  <span>{{ opt || 'Empty option' }}</span>
                  <IconEdit
                    v-if="canUpdate"
                    :size="18"
                    class="tw:text-secondary tw:opacity-0 tw:group-hover:opacity-100 tw:transition-opacity"
                  />
                </BaseClickableRow>

                <!-- Edit Mode -->
                <BaseTextInput
                  v-else
                  v-model="optionSet.options[idx]"
                  placeholder="Option value"
                  size="sm"
                  @blur="stopEditOption"
                  @keyup.enter="stopEditOption"
                />
              </div>

              <!-- Delete Button -->
              <button
                v-if="canUpdate"
                class="tw:p-1 tw:text-secondary tw:hover:text-red-600 tw:hover:bg-red-50 tw:rounded tw:transition-colors tw:opacity-0 tw:group-hover:opacity-100"
                @click="removeOption(idx)"
              >
                <IconTrash :size="16" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template v-if="optionSet" #rail>
      <BaseRailCard title="Settings">
        <div class="tw:flex tw:flex-col tw:gap-1">
          <div class="tw:text-sm tw:text-secondary">Description</div>
          <BaseTextarea
            v-if="canUpdate"
            v-model="optionSet.description"
            placeholder="Briefly describe this option set"
            rows="2"
          />
          <div v-else class="tw:text-sm tw:leading-relaxed tw:text-on-main">
            {{ optionSet?.description || '—' }}
          </div>
        </div>
      </BaseRailCard>

      <BaseRailCard title="Pro Tip" :icon="IconInfoCircle">
        <div class="tw:text-sm tw:text-secondary tw:leading-relaxed">
          Name and description save automatically. Options require an explicit save.
        </div>
      </BaseRailCard>
    </template>
  </BaseDetailLayout>
</template>
