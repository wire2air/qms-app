<script setup>
import {
  IconFileCode,
  IconChevronDown,
  IconChevronRight,
  IconArrowRight,
  IconAlertTriangle,
} from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception: a staged
// import is reviewed, applied or discarded on the server in one transaction.
import { get, post, del } from '@/api'

/**
 * THE REVIEW OF AN UPLOADED OPENAPI FILE (docs/plans/api-docs-portal.md
 * "Import, review, apply"): every operation the portal would hold after the
 * file is applied, with its state (New / Changed / Unchanged / Removed) and a
 * Published checkbox pre-filled from the current state. Unticking an existing
 * operation unpublishes it; ticking a new one publishes it. Nothing changes
 * until Apply. Removed operations are unpublished by the server itself.
 *
 * The same screen shows a past (applied / superseded / discarded) import from
 * History, read-only: what the file contained, no checkboxes, no footer.
 */
const props = defineProps({
  importId: { type: String, default: null },
  canPublish: { type: Boolean, default: false },
  canManage: { type: Boolean, default: false },
})
const emit = defineEmits(['applied', 'discarded'])
const open = defineModel({ type: Boolean, default: false })
const toast = useToast()
const { confirm } = useConfirm()

// ── Load ─────────────────────────────────────────────────────────────────────
const imp = ref(null)
const review = ref(null)
const loading = ref(false)
const ticked = ref({})
async function load() {
  if (!props.importId) return
  loading.value = true
  imp.value = null
  review.value = null
  try {
    const res = await get(`/v1/services/kb/api-imports/${props.importId}`)
    imp.value = res.import
    review.value = res.review
    // The proposed Published value is the starting point of every checkbox.
    const t = {}
    for (const r of rows.value) t[r.key] = !!r.published
    ticked.value = t
  } catch (e) {
    toast.error(e.message || 'The review could not be loaded')
    open.value = false
  } finally {
    loading.value = false
  }
}
watch(
  [() => open.value, () => props.importId],
  ([isOpen]) => {
    if (isOpen) load()
  },
  { immediate: true },
)

const readOnly = computed(() => !!review.value?.recorded || imp.value?.status !== 'STAGED')
const canTick = computed(() => props.canPublish && !readOnly.value)

// ── Rows ─────────────────────────────────────────────────────────────────────
const STATES = [
  { value: 'NEW', label: 'New', class: 'tw:bg-green-100 tw:text-green-700' },
  { value: 'CHANGED', label: 'Changed', class: 'tw:bg-amber-100 tw:text-amber-800' },
  { value: 'UNCHANGED', label: 'Unchanged', class: 'tw:bg-gray-100 tw:text-gray-600' },
  { value: 'REMOVED', label: 'Removed from file', class: 'tw:bg-gray-200 tw:text-gray-700' },
]
function stateOf(s) {
  return STATES.find((x) => x.value === s) || STATES[2]
}
const rows = computed(() => {
  const r = review.value
  if (!r) return []
  return [...(r.added || []), ...(r.changed || []), ...(r.unchanged || []), ...(r.removed || [])]
})
const counts = computed(() => {
  const c = review.value?.counts || {}
  return {
    added: c.added ?? review.value?.added?.length ?? 0,
    changed: c.changed ?? review.value?.changed?.length ?? 0,
    unchanged: c.unchanged ?? review.value?.unchanged?.length ?? 0,
    removed: c.removed ?? review.value?.removed?.length ?? 0,
    skipped: c.skipped ?? review.value?.skipped?.length ?? 0,
  }
})

const stateFilter = ref('ALL')
const search = ref('')
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return rows.value.filter((r) => {
    if (stateFilter.value !== 'ALL' && r.state !== stateFilter.value) return false
    if (!q) return true
    return [r.path, r.summary, r.title, r.key, r.method].some((v) =>
      String(v || '')
        .toLowerCase()
        .includes(q),
    )
  })
})
// Grouped by tag, in the order the file lists its tags; untagged rows last.
const groupedRows = computed(() => {
  const order = (review.value?.groups || []).map((g) => g.tag)
  const map = new Map()
  for (const r of filtered.value) {
    const tag = r.tag || r.group || ''
    if (!map.has(tag)) map.set(tag, [])
    map.get(tag).push(r)
  }
  const keys = [...map.keys()].sort((a, b) => {
    if (!a) return 1
    if (!b) return -1
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib) || a.localeCompare(b)
  })
  return keys.map((tag) => ({
    tag,
    isNew: !!(review.value?.groups || []).find((g) => g.tag === tag)?.isNew,
    rows: map.get(tag),
  }))
})

const stateOptions = computed(() => [
  { value: 'ALL', label: `All (${rows.value.length})` },
  { value: 'NEW', label: `New (${counts.value.added})` },
  { value: 'CHANGED', label: `Changed (${counts.value.changed})` },
  { value: 'UNCHANGED', label: `Unchanged (${counts.value.unchanged})` },
  { value: 'REMOVED', label: `Removed (${counts.value.removed})` },
])

function setNew(on) {
  for (const r of rows.value) if (r.state === 'NEW') ticked.value[r.key] = on
}

// ── Skipped ──────────────────────────────────────────────────────────────────
const skippedOpen = ref(false)
const REASONS = {
  'session-only': 'Session-only: only a browser session can call it',
  'x-kb-skip': 'Marked x-kb-skip',
}

// ── Apply / discard ──────────────────────────────────────────────────────────
// publish = ticked and not currently published (every ticked NEW row, plus an
// existing row whose proposed value was false); unpublish = unticked and
// currently published. REMOVED rows are the server's business.
const choices = computed(() => {
  const publish = []
  const unpublish = []
  for (const r of rows.value) {
    if (r.state === 'REMOVED') continue
    const on = !!ticked.value[r.key]
    if (r.state === 'NEW') {
      if (on) publish.push(r.key)
    } else if (on && !r.published) publish.push(r.key)
    else if (!on && r.published) unpublish.push(r.key)
  }
  return { publish, unpublish }
})
const applying = ref(false)
async function apply() {
  if (!imp.value) return
  applying.value = true
  try {
    const body = canTick.value ? choices.value : { publish: [], unpublish: [] }
    const res = await post(`/v1/services/kb/api-imports/${imp.value.id}/apply`, body)
    const s = res.summary || {}
    toast.success(
      `Applied: ${s.added ?? counts.value.added} new, ${s.changed ?? counts.value.changed} changed, ${s.removed ?? counts.value.removed} removed`,
    )
    open.value = false
    emit('applied', res)
  } catch (e) {
    toast.error(e.message || 'The file could not be applied')
  } finally {
    applying.value = false
  }
}
const discarding = ref(false)
async function discard() {
  if (!imp.value) return
  const ok = await confirm({
    title: 'Discard this file?',
    message: 'Nothing changes; the portal stays as it is. Upload again any time.',
    okLabel: 'Discard',
    danger: true,
  })
  if (!ok) return
  discarding.value = true
  try {
    await del(`/v1/services/kb/api-imports/${imp.value.id}`)
    open.value = false
    emit('discarded')
  } catch (e) {
    toast.error(e.message || 'The file could not be discarded')
  } finally {
    discarding.value = false
  }
}

const heading = computed(() => {
  const i = imp.value
  if (!i) return 'Review'
  const spec = [i.info?.title, i.info?.version].filter(Boolean).join(' ')
  return spec ? `${spec} — ${i.filename}` : i.filename || 'Review'
})
</script>

<template>
  <BaseDialog v-model="open" size="5xl" :title="heading" :persistent="applying || discarding">
    <div class="tw:flex tw:max-h-[72vh] tw:min-h-[24rem] tw:flex-col tw:gap-3">
      <div v-if="loading" class="tw:flex tw:flex-1 tw:items-center tw:justify-center">
        <BaseSpinner />
      </div>
      <template v-else-if="review">
        <!-- Counts + filters -->
        <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
          <p class="tw:text-sm tw:text-secondary">
            New {{ counts.added }} · Changed {{ counts.changed }} · Unchanged
            {{ counts.unchanged }} · Removed {{ counts.removed }} · Skipped {{ counts.skipped }}
          </p>
          <BaseBadge v-if="readOnly" size="sm" class="tw:bg-gray-100 tw:text-gray-600">
            {{ imp?.status === 'STAGED' ? 'Read only' : 'Recorded' }}
          </BaseBadge>
          <div class="tw:flex-1" />
          <div class="tw:w-44">
            <BaseSelect
              v-model="stateFilter"
              :options="stateOptions"
              required
              :searchable="false"
              aria-label="State"
            />
          </div>
          <BaseTextInput
            v-model="search"
            placeholder="Search path or title"
            class="tw:w-56"
            aria-label="Search"
          />
        </div>
        <div v-if="canTick && counts.added" class="tw:flex tw:items-center tw:gap-2">
          <BaseButton size="xs" variant="outline" @click="setNew(true)">Select all new</BaseButton>
          <BaseButton size="xs" variant="outline" @click="setNew(false)">Clear new</BaseButton>
        </div>
        <p v-if="!canPublish && !readOnly" class="tw:text-xs tw:text-secondary">
          Publishing needs the Publish right; applying keeps every operation as it is.
        </p>

        <!-- Rows -->
        <div
          class="tw:min-h-0 tw:flex-1 tw:overflow-y-auto tw:rounded-md tw:border tw:border-divider"
        >
          <p v-if="!groupedRows.length" class="tw:p-6 tw:text-center tw:text-sm tw:text-secondary">
            No operation matches.
          </p>
          <div v-for="g in groupedRows" :key="g.tag">
            <div
              class="tw:sticky tw:top-0 tw:flex tw:items-center tw:gap-2 tw:border-b tw:border-divider tw:bg-main tw:px-3 tw:py-1.5 tw:text-xs tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary"
            >
              {{ g.tag || 'No tag' }}
              <BaseBadge v-if="g.isNew" size="sm" class="tw:bg-green-100 tw:text-green-700"
                >New group</BaseBadge
              >
            </div>
            <div
              v-for="r in g.rows"
              :key="r.key"
              class="tw:flex tw:items-center tw:gap-3 tw:border-b tw:border-divider tw:px-3 tw:py-2 tw:text-sm tw:last:border-b-0"
              :class="r.state === 'REMOVED' && 'tw:opacity-70'"
            >
              <div class="tw:w-6 tw:shrink-0">
                <BaseCheckbox
                  v-if="r.state !== 'REMOVED' && !readOnly"
                  v-model="ticked[r.key]"
                  :disabled="!canTick"
                  :label="`Published: ${r.method} ${r.path}`"
                />
              </div>
              <BaseBadge
                size="sm"
                :class="stateOf(r.state).class"
                class="tw:w-32 tw:justify-center"
                >{{ stateOf(r.state).label }}</BaseBadge
              >
              <KbApiMethodBadge :method="r.method" />
              <div class="tw:min-w-0 tw:flex-1">
                <p class="tw:truncate tw:text-xs">
                  {{ r.path }}
                  <span v-if="r.deprecated" class="tw:ml-1 tw:font-sans tw:text-amber-700"
                    >deprecated</span
                  >
                </p>
                <p class="tw:truncate tw:text-xs tw:text-secondary">
                  {{ r.title || r.summary || r.key }}
                  <template v-if="r.wasRemoved"> · was removed, comes back</template>
                  <template v-if="r.renamedFrom"> · renamed from {{ r.renamedFrom }}</template>
                  <template v-if="r.renamedTo"> · renamed to {{ r.renamedTo }}</template>
                </p>
              </div>
              <BaseBadge
                v-if="readOnly && r.state !== 'REMOVED'"
                size="sm"
                :class="
                  r.published
                    ? 'tw:bg-green-100 tw:text-green-700'
                    : 'tw:bg-gray-100 tw:text-gray-600'
                "
                >{{ r.published ? 'Published' : 'Not published' }}</BaseBadge
              >
            </div>
          </div>
        </div>

        <!-- Skipped -->
        <div v-if="review.skipped?.length" class="tw:rounded-md tw:border tw:border-divider">
          <button
            type="button"
            class="tw:flex tw:w-full tw:items-center tw:gap-2 tw:px-3 tw:py-2 tw:text-left tw:text-sm tw:font-medium tw:hover:bg-main-hover"
            :aria-expanded="skippedOpen"
            @click="skippedOpen = !skippedOpen"
          >
            <component :is="skippedOpen ? IconChevronDown : IconChevronRight" :size="16" />
            Skipped ({{ review.skipped.length }})
            <span class="tw:text-xs tw:font-normal tw:text-secondary"
              >— never imported, by the file's own markers</span
            >
          </button>
          <ul v-if="skippedOpen" class="tw:border-t tw:border-divider">
            <li
              v-for="s in review.skipped"
              :key="s.key"
              class="tw:flex tw:items-center tw:gap-3 tw:px-3 tw:py-1.5 tw:text-xs"
            >
              <KbApiMethodBadge :method="s.method" size="xs" />
              <code>{{ s.path }}</code>
              <span class="tw:text-secondary">{{ REASONS[s.reason] || s.reason }}</span>
            </li>
          </ul>
        </div>
      </template>
      <BaseEmptyState v-else :icon="IconFileCode" dense title="Nothing to review" />
    </div>

    <template v-if="review && !readOnly" #footer>
      <div class="tw:flex tw:w-full tw:items-center tw:gap-3">
        <p class="tw:flex tw:items-center tw:gap-1 tw:text-sm tw:text-secondary">
          <IconAlertTriangle
            v-if="counts.removed"
            :size="14"
            class="tw:text-amber-600"
            aria-hidden="true"
          />
          Will publish {{ canTick ? choices.publish.length : 0 }}, unpublish
          {{ canTick ? choices.unpublish.length : 0
          }}<template v-if="counts.removed"
            >; {{ counts.removed }} removed from the file go off the portal</template
          >
        </p>
        <div class="tw:flex-1" />
        <BaseButton
          v-if="canManage"
          variant="outline"
          :disabled="applying"
          :isLoading="discarding"
          @click="discard"
          >Discard</BaseButton
        >
        <BaseButton v-if="canManage" :disabled="discarding" :isLoading="applying" @click="apply">
          Apply <IconArrowRight :size="16" class="tw:ml-1" />
        </BaseButton>
      </div>
    </template>
  </BaseDialog>
</template>
