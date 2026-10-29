<script setup>
import { IconTrash, IconAlertTriangle, IconLock } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception: an operation's
// definition is fetched on demand and its annotations saved by the kb service.
import { get, put, del } from '@/api'

/**
 * ONE API OPERATION (docs/plans/api-docs-portal.md "Operation editor"): on the
 * left what the public page generates from the spec, read-only — method and
 * path, the spec's summary and description, auth, parameters, request body,
 * responses, code samples. On the right the admin's words and switches:
 * title override, slug, group, audience, published, and four markdown fields
 * (intro, notes, request example, response example) in the article editor.
 * Save sends only what changed.
 */
const props = defineProps({
  operationId: { type: String, default: null },
  kbId: { type: String, required: true },
  /** [{ id, title }] of the portal, for the group picker. */
  groups: { type: Array, default: () => [] },
  canUpdate: { type: Boolean, default: false },
  canPublish: { type: Boolean, default: false },
  canManage: { type: Boolean, default: false },
})
const emit = defineEmits(['saved', 'deleted'])
const open = defineModel({ type: Boolean, default: false })
const toast = useToast()
const { confirm } = useConfirm()

// ── Load ─────────────────────────────────────────────────────────────────────
const op = ref(null)
const loading = ref(false)
const draft = ref(null)
const base = ref('')
// The code-sample language shown on the left; curl when the server has it.
const lang = ref('curl')
const ADMIN_FIELDS = [
  'title',
  'slug',
  'groupId',
  'audience',
  'published',
  'introMd',
  'notesMd',
  'requestExampleMd',
  'responseExampleMd',
]
function setDraft(o) {
  draft.value = {
    title: o.title || '',
    slug: o.slug || '',
    groupId: o.groupId || null,
    audience: o.audience || 'PUBLIC',
    published: !!o.published,
    introMd: o.introMd || '',
    notesMd: o.notesMd || '',
    requestExampleMd: o.requestExampleMd || '',
    responseExampleMd: o.responseExampleMd || '',
  }
  base.value = JSON.stringify(draft.value)
}
async function load() {
  if (!props.operationId) return
  loading.value = true
  op.value = null
  draft.value = null
  try {
    const res = await get(`/v1/services/kb/api-operations/${props.operationId}`)
    op.value = res.operation
    setDraft(res.operation)
    lang.value =
      (res.operation.samples?.curl && 'curl') || Object.keys(res.operation.samples || {})[0]
  } catch (e) {
    toast.error(e.message || 'The endpoint could not be loaded')
    open.value = false
  } finally {
    loading.value = false
  }
}
watch(
  [() => open.value, () => props.operationId],
  ([isOpen]) => {
    if (isOpen) load()
  },
  { immediate: true },
)
const dirty = computed(() => !!draft.value && JSON.stringify(draft.value) !== base.value)

// ── Save / publish / delete ──────────────────────────────────────────────────
const saving = ref(false)
function changes() {
  const before = JSON.parse(base.value)
  const body = {}
  for (const k of ADMIN_FIELDS) {
    if (draft.value[k] === before[k]) continue
    if (k === 'title') body.title = draft.value.title.trim() || null
    else if (k === 'slug') body.slug = draft.value.slug.trim()
    else body[k] = draft.value[k]
  }
  return body
}
async function save() {
  if (!op.value || !draft.value) return
  const body = changes()
  if (!Object.keys(body).length) return
  if ('published' in body && !props.canPublish) delete body.published
  saving.value = true
  try {
    const res = await put(`/v1/services/kb/api-operations/${op.value.id}`, body)
    op.value = { ...op.value, ...res.operation }
    setDraft(op.value)
    toast.success('Endpoint saved')
    emit('saved', res.operation)
  } catch (e) {
    toast.error(e.message || 'The endpoint could not be saved')
  } finally {
    saving.value = false
  }
}
// "Publish current": the public page moves to the definition of the last
// upload (changedSincePublished goes away).
const publishing = ref(false)
async function publishCurrent() {
  if (!op.value) return
  publishing.value = true
  try {
    const res = await put(`/v1/services/kb/api-operations/${op.value.id}`, { published: true })
    op.value = { ...op.value, ...res.operation }
    draft.value.published = true
    base.value = JSON.stringify({ ...JSON.parse(base.value), published: true })
    toast.success('Published the current definition')
    emit('saved', res.operation)
  } catch (e) {
    toast.error(e.message || 'Could not publish')
  } finally {
    publishing.value = false
  }
}
const deleting = ref(false)
async function remove() {
  if (!op.value) return
  const ok = await confirm({
    title: 'Delete this endpoint?',
    message:
      'Its definition and notes are removed. It comes back as New if a later upload still has it.',
    okLabel: 'Delete',
    danger: true,
  })
  if (!ok) return
  deleting.value = true
  try {
    await del(`/v1/services/kb/api-operations/${op.value.id}`)
    open.value = false
    emit('deleted', op.value.id)
  } catch (e) {
    toast.error(e.message || 'The endpoint could not be deleted')
  } finally {
    deleting.value = false
  }
}
async function close() {
  if (dirty.value) {
    const ok = await confirm({
      title: 'Leave without saving?',
      message: 'The changes to this endpoint are lost.',
      okLabel: 'Leave',
      danger: true,
    })
    if (!ok) return
  }
  open.value = false
}

// ── Generated block ──────────────────────────────────────────────────────────
const groupOptions = computed(() => props.groups.map((g) => ({ value: g.id, label: g.title })))
const AUDIENCES = [
  { value: 'PUBLIC', label: 'Public' },
  { value: 'CUSTOMERS', label: 'Signed-in customers' },
]
const LANG_LABELS = { curl: 'curl', javascript: 'JavaScript', python: 'Python' }
const langOptions = computed(() =>
  Object.keys(op.value?.samples || {})
    .filter((k) => op.value.samples[k])
    .map((k) => ({ value: k, label: LANG_LABELS[k] || k })),
)
function pretty(v) {
  if (v == null) return ''
  return typeof v === 'string' ? v : JSON.stringify(v, null, 2)
}
function schemaType(s) {
  if (!s) return ''
  if (s.type === 'array') return `${schemaType(s.items) || 'any'}[]`
  return s.type || (s.enum ? 'enum' : s.$ref ? 'object' : '')
}
const security = computed(() => {
  const alts = op.value?.definition?.security || []
  return alts.map((alt) =>
    (alt || [])
      .map((s) => s.name || s.scheme || s.type)
      .filter(Boolean)
      .join(' + '),
  )
})
</script>

<template>
  <!-- Persistent + explicit X: every close (X, Close button) goes through
       close(), which asks before dropping unsaved words. -->
  <BaseDialog
    :modelValue="open"
    size="6xl"
    persistent
    showClose
    :title="op ? `${op.method} ${op.path}` : 'Endpoint'"
    @update:modelValue="(v) => (v ? (open = true) : close())"
  >
    <div class="tw:flex tw:max-h-[78vh] tw:min-h-[24rem] tw:flex-col">
      <div v-if="loading || !op" class="tw:flex tw:flex-1 tw:items-center tw:justify-center">
        <BaseSpinner />
      </div>
      <div
        v-else
        class="tw:grid tw:min-h-0 tw:flex-1 tw:gap-6 tw:overflow-y-auto tw:lg:grid-cols-2"
      >
        <!-- What the page shows, from the spec -->
        <section
          class="tw:flex tw:min-w-0 tw:flex-col tw:gap-4"
          aria-label="Generated from the spec"
        >
          <BaseBanner
            v-if="op.changedSincePublished"
            tone="warning"
            :icon="IconAlertTriangle"
            title="Changed since published"
            message="The last upload changed this endpoint; the public page still shows the older definition."
          >
            <template #actions>
              <BaseButton
                v-if="canPublish"
                size="sm"
                variant="outline"
                :isLoading="publishing"
                @click="publishCurrent"
                >Publish current</BaseButton
              >
            </template>
          </BaseBanner>
          <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
            <KbApiMethodBadge :method="op.method" />
            <code class="tw:text-sm">{{ op.path }}</code>
            <BaseBadge v-if="op.deprecated" size="sm" class="tw:bg-amber-100 tw:text-amber-800"
              >Deprecated</BaseBadge
            >
            <BaseBadge
              v-if="op.state === 'REMOVED'"
              size="sm"
              class="tw:bg-gray-200 tw:text-gray-700"
              >Removed from the last file</BaseBadge
            >
          </div>
          <p v-if="op.specSummary" class="tw:text-sm tw:font-medium">{{ op.specSummary }}</p>
          <div v-if="op.specDescriptionMd" class="tw:rounded-md tw:border tw:border-divider">
            <KbEditor :modelValue="op.specDescriptionMd" :kbId="kbId" :editable="false" bare />
          </div>

          <div v-if="security.length">
            <p
              class="tw:mb-1 tw:flex tw:items-center tw:gap-1 tw:text-xs tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary"
            >
              <IconLock :size="12" /> Authentication
            </p>
            <p class="tw:text-sm">{{ security.filter(Boolean).join(' or ') || 'None' }}</p>
          </div>

          <div v-if="op.definition?.parameters?.length">
            <p
              class="tw:mb-1 tw:text-xs tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary"
            >
              Parameters
            </p>
            <table class="tw:w-full tw:text-left tw:text-xs">
              <thead class="tw:text-secondary">
                <tr>
                  <th class="tw:py-1 tw:pr-2 tw:font-medium">Name</th>
                  <th class="tw:py-1 tw:pr-2 tw:font-medium">In</th>
                  <th class="tw:py-1 tw:pr-2 tw:font-medium">Type</th>
                  <th class="tw:py-1 tw:font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="p in op.definition.parameters"
                  :key="`${p.in}:${p.name}`"
                  class="tw:border-t tw:border-divider tw:align-top"
                >
                  <td class="tw:py-1.5 tw:pr-2">
                    {{ p.name }}<span v-if="p.required" class="tw:text-red-600">*</span>
                  </td>
                  <td class="tw:py-1.5 tw:pr-2">{{ p.in }}</td>
                  <td class="tw:py-1.5 tw:pr-2">{{ schemaType(p.schema) }}</td>
                  <td class="tw:py-1.5">{{ p.description }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="op.definition?.requestBody">
            <p
              class="tw:mb-1 tw:text-xs tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary"
            >
              Request body
              <span class="tw:font-normal tw:normal-case">
                ·
                {{
                  op.requestSample?.mime || Object.keys(op.definition.requestBody.content || {})[0]
                }}
                <template v-if="op.definition.requestBody.required"> · required</template>
              </span>
            </p>
            <p
              v-if="op.definition.requestBody.description"
              class="tw:mb-1 tw:text-xs tw:text-secondary"
            >
              {{ op.definition.requestBody.description }}
            </p>
            <pre v-if="op.requestSample" class="kb-api-pre">{{
              pretty(op.requestSample.value)
            }}</pre>
          </div>

          <div v-if="op.definition?.responses?.length">
            <p
              class="tw:mb-1 tw:text-xs tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary"
            >
              Responses
            </p>
            <ul class="tw:flex tw:flex-col tw:gap-1 tw:text-xs">
              <li v-for="r in op.definition.responses" :key="r.status" class="tw:flex tw:gap-2">
                <code class="tw:w-10 tw:shrink-0 tw:font-semibold">{{ r.status }}</code>
                <span>{{ r.description }}</span>
              </li>
            </ul>
            <pre v-if="op.responseSample" class="kb-api-pre tw:mt-2">{{
              pretty(op.responseSample.value)
            }}</pre>
          </div>

          <div v-if="langOptions.length">
            <div class="tw:mb-1 tw:flex tw:items-center tw:justify-between tw:gap-2">
              <p
                class="tw:text-xs tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary"
              >
                Code sample
              </p>
              <SegmentedControl
                v-model="lang"
                :options="langOptions"
                size="sm"
                :equalWidth="false"
                ariaLabel="Sample language"
              />
            </div>
            <pre class="kb-api-pre">{{ op.samples?.[lang] }}</pre>
          </div>
        </section>

        <!-- The admin's words -->
        <section
          v-if="draft"
          class="tw:flex tw:min-w-0 tw:flex-col tw:gap-4"
          aria-label="Annotations"
        >
          <div class="tw:grid tw:gap-3 tw:sm:grid-cols-2">
            <BaseTextInput
              v-model="draft.title"
              label="Title"
              :placeholder="op.specSummary || 'As in the spec'"
              :disabled="!canUpdate"
            />
            <BaseTextInput v-model="draft.slug" label="Slug" :disabled="!canUpdate" />
            <BaseSelect
              v-model="draft.groupId"
              :options="groupOptions"
              label="Group"
              nullLabel="No group"
              clearable
              :disabled="!canUpdate"
            />
            <BaseSelect
              v-model="draft.audience"
              :options="AUDIENCES"
              label="Audience"
              required
              :searchable="false"
              :disabled="!canUpdate"
            />
          </div>
          <div class="tw:flex tw:items-center tw:justify-between tw:gap-4">
            <div>
              <p class="tw:text-sm tw:font-medium">Published</p>
              <p class="tw:text-xs tw:text-secondary">
                {{
                  op.state === 'REMOVED'
                    ? 'Not in the last file; cannot be published.'
                    : 'Shown on the portal once the portal itself is published.'
                }}
              </p>
            </div>
            <BaseSwitch
              v-model="draft.published"
              label="Published"
              :disabled="!canPublish || op.state === 'REMOVED'"
            />
          </div>

          <div
            v-for="f in [
              { key: 'introMd', label: 'Intro', help: 'Above the generated block' },
              { key: 'notesMd', label: 'Notes', help: 'Below it: gotchas, limits, tips' },
              {
                key: 'requestExampleMd',
                label: 'Request example',
                help: 'Replaces the generated sample',
              },
              {
                key: 'responseExampleMd',
                label: 'Response example',
                help: 'Replaces the generated sample',
              },
            ]"
            :key="f.key"
          >
            <p class="tw:mb-1 tw:text-sm tw:font-medium">
              {{ f.label }}
              <span class="tw:text-xs tw:font-normal tw:text-secondary">· {{ f.help }}</span>
            </p>
            <div class="tw:rounded-md tw:border tw:border-divider">
              <KbEditor
                v-model="draft[f.key]"
                :kbId="kbId"
                :editable="canUpdate"
                placeholder="Write in Markdown"
              />
            </div>
          </div>
        </section>
      </div>
    </div>

    <template #footer>
      <div class="tw:flex tw:w-full tw:items-center tw:gap-3">
        <BaseButton
          v-if="canManage && op"
          variant="outline"
          :isLoading="deleting"
          :disabled="saving"
          @click="remove"
        >
          <IconTrash :size="16" class="tw:mr-1" /> Delete
        </BaseButton>
        <div class="tw:flex-1" />
        <span v-if="dirty" class="tw:text-xs tw:font-medium tw:text-amber-700"
          >Unsaved changes</span
        >
        <BaseButton variant="outline" :disabled="saving || deleting" @click="close"
          >Close</BaseButton
        >
        <BaseButton
          v-if="canUpdate"
          :disabled="!dirty || deleting"
          :isLoading="saving"
          @click="save"
          >Save</BaseButton
        >
      </div>
    </template>
  </BaseDialog>
</template>

<style scoped>
.kb-api-pre {
  max-height: 18rem;
  overflow: auto;
  border-radius: 6px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 12px;
  line-height: 1.5;
  padding: 10px 12px;
  white-space: pre;
}
</style>
