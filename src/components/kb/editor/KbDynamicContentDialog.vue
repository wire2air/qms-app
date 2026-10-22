<script setup>
import { IconPlus, IconPencil, IconTrash, IconSearch, IconBraces } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception: dynamic
// content is written through /v1/services/kb (keys are checked there).
import { post, put, del } from '@/api'
import { isAllowed } from '@/utils/currentSession.js'
import { DC_KEY_RE } from './kbMarkdownDoc.js'

const props = defineProps({ kbId: { type: String, required: true } })
const emit = defineEmits(['insert'])
/**
 * DYNAMIC CONTENT: values written once and shown in every article that uses
 * them ({{dc.key}}), like a product name, a support phone number or a price.
 * Change the value here and every article shows the new one; nothing has to
 * be republished. Pick one to insert it; KB admins add and edit them.
 */
const open = defineModel({ type: Boolean, default: false })
const toast = useToast()
const { confirm } = useConfirm()
const canManage = computed(() => isAllowed(['knowledge_base:manage_settings']))

const items = useLiveQueryWithDeps(
  [() => props.kbId],
  async (db, [id]) => (id ? db.KbSnippet.where('kbId', id).exec() : []),
  { models: ['KbSnippet'], initial: [] },
)
const search = ref('')
const rows = computed(() => {
  const q = search.value.trim().toLowerCase()
  return [...items.value]
    .filter((s) => !q || `${s.title} ${s.key} ${s.value}`.toLowerCase().includes(q))
    .sort((a, b) => a.title.localeCompare(b.title))
})

const form = ref(null)
function startNew() {
  form.value = { id: null, key: '', title: '', value: '', keyTouched: false }
}
function startEdit(s) {
  form.value = { id: s.id, key: s.key, title: s.title, value: s.value, keyTouched: true }
}
watch(
  () => form.value?.title,
  (t) => {
    if (form.value && !form.value.id && !form.value.keyTouched)
      form.value.key = String(t || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 64)
  },
)
const saving = ref(false)
async function save() {
  const f = form.value
  if (!f.title.trim()) return toast.error('Give it a name')
  if (!DC_KEY_RE.test(f.key))
    return toast.error('The key uses lowercase letters, digits and _ (at most 64)')
  saving.value = true
  try {
    if (f.id)
      await put(`/v1/services/kb/snippets/${f.id}`, { title: f.title.trim(), value: f.value })
    else
      await post(`/v1/services/kb/bases/${props.kbId}/snippets`, {
        key: f.key,
        title: f.title.trim(),
        value: f.value,
      })
    toast.success(f.id ? 'Saved' : 'Added')
    form.value = null
  } catch (e) {
    toast.error(e.message || 'It could not be saved')
  } finally {
    saving.value = false
  }
}
async function remove(s) {
  const ok = await confirm({
    title: `Delete “${s.title}”?`,
    message: `Articles that use {{dc.${s.key}}} will show nothing in its place.`,
    okLabel: 'Delete',
  })
  if (!ok) return
  try {
    await del(`/v1/services/kb/snippets/${s.id}`)
    toast.success('Deleted')
  } catch (e) {
    toast.error(e.message || 'It could not be deleted')
  }
}
function dcToken(key) {
  return `{{dc.${key}}}`
}
function insert(s) {
  emit('insert', s.key)
  open.value = false
}
</script>

<template>
  <BaseDialog v-model="open" title="Dynamic content" size="xl">
    <div class="tw:flex tw:flex-col tw:gap-3">
      <p class="tw:text-sm tw:text-secondary">
        A value written once and shown wherever it is used. Change it here and every article shows
        the new value.
      </p>
      <div class="tw:flex tw:items-center tw:gap-2">
        <div class="tw:relative tw:flex-1">
          <IconSearch
            :size="16"
            class="tw:pointer-events-none tw:absolute tw:left-2.5 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary"
          />
          <input
            v-model="search"
            type="search"
            placeholder="Search dynamic content"
            aria-label="Search dynamic content"
            class="tw:h-9 tw:w-full tw:rounded-md tw:border tw:border-divider tw:bg-main tw:pl-8 tw:pr-2 tw:text-sm"
          />
        </div>
        <BaseButton v-if="canManage && !form" variant="outline" @click="startNew">
          <IconPlus :size="16" class="tw:mr-1" /> New
        </BaseButton>
      </div>

      <div
        v-if="form"
        class="tw:flex tw:flex-col tw:gap-3 tw:rounded-md tw:border tw:border-divider tw:bg-main tw:p-3"
      >
        <div class="tw:grid tw:grid-cols-2 tw:gap-3">
          <BaseTextInput v-model="form.title" label="Name" placeholder="Support phone number" />
          <BaseTextInput
            v-model="form.key"
            label="Key"
            :disabled="!!form.id"
            placeholder="support_phone"
            @input="form.keyTouched = true"
          />
        </div>
        <BaseTextarea
          v-model="form.value"
          label="Value"
          :rows="2"
          :maxlength="2000"
          placeholder="+1 555 010 0000"
        />
        <p class="tw:text-xs tw:text-secondary">
          In Markdown it is written <code>{{ dcToken(form.key || 'key') }}</code
          >. The key cannot change later, because articles refer to it.
        </p>
        <div class="tw:flex tw:justify-end tw:gap-2">
          <BaseButton variant="outline" @click="form = null">Cancel</BaseButton>
          <BaseButton :isLoading="saving" @click="save">{{ form.id ? 'Save' : 'Add' }}</BaseButton>
        </div>
      </div>

      <ul
        v-if="rows.length"
        class="tw:max-h-80 tw:divide-y tw:divide-divider tw:overflow-y-auto tw:rounded-md tw:border tw:border-divider"
        aria-label="Dynamic content"
      >
        <li v-for="s in rows" :key="s.id" class="tw:flex tw:items-center tw:gap-2 tw:px-3 tw:py-2">
          <button
            type="button"
            class="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:text-left tw:hover:underline"
            :aria-label="`Insert ${s.title}`"
            @click="insert(s)"
          >
            <span class="tw:text-sm tw:font-medium">{{ s.title }}</span>
            <span class="tw:truncate tw:text-xs tw:text-secondary"
              >{{ dcToken(s.key) }} · {{ s.value || '(empty)' }}</span
            >
          </button>
          <template v-if="canManage">
            <button
              type="button"
              class="tw:rounded tw:p-1 tw:text-secondary tw:hover:bg-main-hover"
              :aria-label="`Edit ${s.title}`"
              @click="startEdit(s)"
            >
              <IconPencil :size="15" />
            </button>
            <button
              type="button"
              class="tw:rounded tw:p-1 tw:text-secondary tw:hover:bg-main-hover"
              :aria-label="`Delete ${s.title}`"
              @click="remove(s)"
            >
              <IconTrash :size="15" />
            </button>
          </template>
        </li>
      </ul>
      <BaseEmptyState
        v-else-if="!form"
        :icon="IconBraces"
        title="No dynamic content yet"
        :description="
          canManage
            ? 'Add values you repeat across articles, like a phone number or a plan price.'
            : 'A KB admin can add values you repeat across articles.'
        "
      />
    </div>
  </BaseDialog>
</template>
