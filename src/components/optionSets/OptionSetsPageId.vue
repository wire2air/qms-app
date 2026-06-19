<script setup>
import { IconEdit, IconTrash, IconPlus, IconInfoCircle } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

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
const canUpdate = computed(() => isAllowed(['optionSets:update']))

const editingOptionIndex = ref(-1)
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
</script>

<template>
  <BaseDetailPage
    :breadcrumbs="breadcrumbs"
    :loading="loading"
    :notFound="!loading && !optionSet"
    notFoundTitle="Option set not found"
    width="standard"
    :fullHeight="false"
  >
    <template #actions>
      <button
        v-if="canUpdate"
        class="tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-2 tw:bg-red-50 tw:text-red-600 tw:rounded-lg tw:text-sm tw:font-medium tw:hover:bg-red-100 tw:transition-colors"
        @click="confirmDelete"
      >
        <IconTrash :size="16" />
        Delete
      </button>
    </template>

    <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-4">
      <!-- Main Content -->
      <div class="tw:md:col-span-2 tw:flex tw:flex-col tw:gap-8">
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
                <div class="tw:w-6 tw:text-secondary tw:text-xs tw:font-mono">{{ idx + 1 }}.</div>

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

        <!-- Settings Sidebar -->
        <aside class="tw:flex tw:flex-col tw:gap-6">
          <!-- Name & Description Card -->
          <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
            <div class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover">
              <div class="tw:text-lg tw:font-bold tw:text-on-main">Settings</div>
            </div>
            <div class="tw:p-6 tw:flex tw:flex-col tw:gap-6">
              <!-- Name Field -->
              <div class="tw:flex tw:flex-col tw:gap-2">
                <div class="tw:text-sm tw:text-secondary">Name</div>
                <BaseTextInput
                  v-if="canUpdate"
                  v-model="optionSet.name"
                  placeholder="Option set name"
                />
                <div v-else class="tw:text-base tw:p-3 tw:rounded-lg tw:text-on-main">
                  {{ optionSet?.name || '—' }}
                </div>
              </div>

              <!-- Description Field -->
              <div class="tw:flex tw:flex-col tw:gap-2">
                <div class="tw:text-sm tw:text-secondary">Description</div>
                <BaseTextarea
                  v-if="canUpdate"
                  v-model="optionSet.description"
                  placeholder="Briefly describe this option set"
                  rows="2"
                />
                <div
                  v-else
                  class="tw:text-sm tw:leading-relaxed tw:p-3 tw:rounded-lg tw:text-on-main"
                >
                  {{ optionSet?.description || '—' }}
                </div>
              </div>
            </div>
          </div>

          <!-- Pro Tip -->
          <div class="tw:bg-primary/5 tw:p-6 tw:rounded-xl tw:border tw:border-primary/10">
            <div class="tw:flex tw:items-center tw:gap-2 tw:text-primary tw:mb-2">
              <IconInfoCircle :size="18" />
              <div class="tw:text-sm tw:font-bold">Pro Tip</div>
            </div>
            <div class="tw:text-sm tw:text-secondary tw:leading-relaxed">
              Name and description save automatically. Options require an explicit save.
            </div>
          </div>
        </aside>
      </div>
    </div>
  </BaseDetailPage>
</template>
