<script setup>
import {
  IconArrowLeft,
  IconExternalLink,
  IconPlus,
  IconTrash,
  IconWorldDownload,
  IconPhoto,
  IconX,
} from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception: knowledge
// base settings, theme import and uploads go through /v1/services/kb.
import { get, post, put, upload } from '@/api'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { useUnsavedChangesGuard } from '@shared/composables/useUnsavedChangesGuard.js'
import { kbAssetUrl } from './kbMarkdown.js'

/**
 * THE HELP CENTER OF A KNOWLEDGE BASE (docs/plans/knowledge-base-public.md):
 * whether it is live and where, what its home page says, its header and footer
 * links, how readers reach a person, and how it looks — matched to a website
 * built with the marketing CMS (its /_theme.json) or set by hand. Saved on the
 * knowledge base (name, slug, status, settings, theme); the public site
 * (help-web) reads it on every page.
 */
const route = useRoute()
const router = useRouter()
const toast = useToast()
const canManage = computed(() => isAllowed(['knowledge_base:manage_settings']))
const canDomains = computed(() => isAllowed(['knowledge_base:manage_domains']))

const bases = useLiveQuery((db) => db.KbKnowledgeBase.where().exec(), {
  models: ['KbKnowledgeBase'],
  initial: [],
})
const baseOptions = computed(() =>
  [...bases.value]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((k) => ({ value: k.id, label: k.name })),
)
const kbId = computed({
  get: () =>
    bases.value.some((k) => k.id === route.query.kb)
      ? route.query.kb
      : (baseOptions.value[0]?.value ?? null),
  set: (v) => router.replace({ query: { ...route.query, kb: v || undefined } }),
})
const kb = computed(() => bases.value.find((k) => k.id === kbId.value) || null)

// ── The draft ────────────────────────────────────────────────────────────────
const SETTING_KEYS = [
  'homeTitle',
  'homeTagline',
  'footerText',
  'contactUrl',
  'contactEmail',
  'seoTitle',
  'seoDescription',
]
function blankTheme() {
  return { version: 1, tokens: {}, dark: null, fonts: [], logo: null, favicon: null }
}
const draft = ref(null)
const base = ref('')
const pendingSource = ref(null)
function load(k) {
  const s = k.settings || {}
  const t = { ...blankTheme(), ...(k.theme || {}) }
  draft.value = {
    name: k.name,
    slug: k.slug,
    status: k.status,
    settings: {
      ...Object.fromEntries(SETTING_KEYS.map((key) => [key, s[key] || ''])),
      headerLinks: (s.headerLinks || []).map((l) => ({ ...l })),
      footerLinks: (s.footerLinks || []).map((l) => ({ ...l })),
      widgetEnabled: !!s.widgetEnabled,
      noindex: !!s.noindex,
    },
    theme: JSON.parse(JSON.stringify(t)),
  }
  base.value = JSON.stringify(draft.value)
  pendingSource.value = null
}
watch(
  kb,
  (k, old) => {
    if (!k) return
    if (!draft.value || k.id !== old?.id) {
      load(k)
      loadAddress()
    }
  },
  { immediate: true },
)
const dirty = computed(() => !!draft.value && JSON.stringify(draft.value) !== base.value)
const { allowLeave } = useUnsavedChangesGuard(dirty)

// ── Address ──────────────────────────────────────────────────────────────────
const address = ref(null)
async function loadAddress() {
  if (!kbId.value) return
  try {
    address.value = await get(`/v1/services/kb/bases/${kbId.value}/site`)
  } catch {
    address.value = null
  }
}

// ── Save ─────────────────────────────────────────────────────────────────────
const saving = ref(false)
function cleanLinks(list) {
  return list
    .map((l) => ({ label: String(l.label || '').trim(), url: String(l.url || '').trim() }))
    .filter((l) => l.label && l.url)
}
async function save() {
  if (!draft.value || !kbId.value) return
  if (!draft.value.name.trim()) return toast.error('Give the help center a name')
  saving.value = true
  try {
    const d = draft.value
    const settings = {
      ...Object.fromEntries(
        SETTING_KEYS.map((k) => [k, String(d.settings[k] || '').trim() || null]),
      ),
      headerLinks: cleanLinks(d.settings.headerLinks),
      footerLinks: cleanLinks(d.settings.footerLinks),
      widgetEnabled: d.settings.widgetEnabled,
      noindex: d.settings.noindex,
    }
    await put(`/v1/services/kb/bases/${kbId.value}`, {
      name: d.name.trim(),
      slug: d.slug.trim(),
      status: d.status,
      settings,
      theme: d.theme,
      ...(pendingSource.value ? { themeSource: pendingSource.value } : {}),
    })
    base.value = JSON.stringify(draft.value)
    pendingSource.value = null
    toast.success('Help center saved')
    loadAddress()
  } catch (e) {
    toast.error(e.message || 'The help center could not be saved')
  } finally {
    saving.value = false
  }
}

// ── Links ────────────────────────────────────────────────────────────────────
function addLink(list) {
  if (list.length < 12) list.push({ label: '', url: '' })
}

// ── Appearance ───────────────────────────────────────────────────────────────
const COLOR_FIELDS = [
  { token: 'color-action', label: 'Buttons', fallback: '#136dec' },
  { token: 'color-link', label: 'Links', fallback: '#136dec' },
  { token: 'color-inverse', label: 'Home banner', fallback: '#0f172a' },
  { token: 'color-on-inverse', label: 'Banner text', fallback: '#ffffff' },
  { token: 'color-canvas', label: 'Page background', fallback: '#f8fafc' },
  { token: 'color-surface', label: 'Cards', fallback: '#ffffff' },
  { token: 'color-ink', label: 'Text', fallback: '#0f172a' },
]
const FONTS = [
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Poppins',
  'Source Sans 3',
  'Nunito',
  'Work Sans',
]
const RADII = [
  { value: '4px', label: 'Square' },
  { value: '12px', label: 'Rounded' },
  { value: '20px', label: 'Round' },
]
function token(name, fallback) {
  return draft.value?.theme?.tokens?.[name] || fallback
}
function setToken(name, value) {
  draft.value.theme.tokens = { ...draft.value.theme.tokens, [name]: value }
}
function hex(v, fallback) {
  return /^#[0-9a-f]{6}$/i.test(v || '') ? v : fallback
}
const fontFamily = computed({
  get: () => draft.value?.theme?.fonts?.[0]?.family || 'Inter',
  set: (family) => {
    draft.value.theme.fonts = [{ family, source: 'google', weights: [400, 500, 600, 700] }]
    setToken('font-sans', `'${family}', ui-sans-serif, system-ui, sans-serif`)
  },
})
const fontOptions = computed(() => {
  const list = [...FONTS]
  if (!list.includes(fontFamily.value)) list.unshift(fontFamily.value)
  return list.map((f) => ({ value: f, label: f }))
})
const radius = computed({
  get: () => token('radius-card', '12px'),
  set: (v) => {
    setToken('radius-card', v)
    setToken('radius-control', v === '4px' ? '4px' : v === '20px' ? '12px' : '8px')
  },
})
function resetTheme() {
  draft.value.theme = blankTheme()
  pendingSource.value = null
}

// Logo / favicon: images of this knowledge base (kb-asset:<id>).
const logoInput = ref(null)
const faviconInput = ref(null)
const uploading = ref(false)
async function onPicked(e, target) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file || !kbId.value) return
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    const res = await upload(`/v1/services/kb/bases/${kbId.value}/assets`, fd)
    const ref_ = `kb-asset:${res.asset.id}`
    if (target === 'logo')
      draft.value.theme.logo = { ...(draft.value.theme.logo || {}), light: ref_ }
    else draft.value.theme.favicon = ref_
  } catch (err) {
    toast.error(err.message || 'The image could not be uploaded')
  } finally {
    uploading.value = false
  }
}
function previewUrl(u) {
  const m = /^kb-asset:([0-9a-f-]{36})$/i.exec(u || '')
  return m ? kbAssetUrl(m[1]) : u || ''
}

// Match a website (its /_theme.json, published by the marketing CMS).
const importUrl = ref('')
const importing = ref(false)
const lastImport = ref(null)
watch(
  kb,
  (k) => {
    if (k?.themeSource?.url && !importUrl.value) importUrl.value = k.themeSource.url
  },
  { immediate: true },
)
async function importTheme() {
  const url = importUrl.value.trim()
  if (!/^https:\/\//i.test(url)) return toast.error('Enter the website address (https://…)')
  importing.value = true
  try {
    const res = await post(`/v1/services/kb/bases/${kbId.value}/theme/import`, { url })
    draft.value.theme = { ...blankTheme(), ...res.theme }
    pendingSource.value = res.source
    lastImport.value = { url, changed: res.changed || [] }
    toast.success('Design imported. Check the preview, then save.')
  } catch (e) {
    toast.error(e.message || 'That website’s design could not be read')
  } finally {
    importing.value = false
  }
}

// ── Preview ──────────────────────────────────────────────────────────────────
const previewStyle = computed(() => {
  const t = draft.value?.theme?.tokens || {}
  const v = (k, f) => t[k] || f
  return {
    '--p-action': v('color-action', '#136dec'),
    '--p-link': v('color-link', '#136dec'),
    '--p-inverse': v('color-inverse', '#0f172a'),
    '--p-on-inverse': v('color-on-inverse', '#ffffff'),
    '--p-canvas': v('color-canvas', '#f8fafc'),
    '--p-surface': v('color-surface', '#ffffff'),
    '--p-ink': v('color-ink', '#0f172a'),
    '--p-ink-3': v('color-ink-3', '#64748b'),
    '--p-line': v('color-line', '#e2e8f0'),
    '--p-radius': v('radius-card', '12px'),
    '--p-font': v('font-sans', 'Inter, system-ui, sans-serif'),
  }
})
const previewFontHref = computed(() => {
  const f = draft.value?.theme?.fonts?.find((x) => x.source === 'google')
  return f
    ? `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family).replace(/%20/g, '+')}:wght@400;600;700&display=swap`
    : ''
})
// The preview's font: one stylesheet link, swapped as the font changes.
let fontLink = null
watch(
  previewFontHref,
  (href) => {
    if (!href) return fontLink?.remove()
    if (!fontLink) {
      fontLink = document.createElement('link')
      fontLink.rel = 'stylesheet'
    }
    fontLink.href = href
    if (!fontLink.isConnected) document.head.appendChild(fontLink)
  },
  { immediate: true },
)
onBeforeUnmount(() => fontLink?.remove())
const previewCollections = useLiveQueryWithDeps(
  [() => kbId.value],
  async (db, [id]) =>
    id
      ? (await db.KbCollection.where('kbId', id).exec())
          .filter((c) => !c.parentId && c.audience === 'PUBLIC')
          .slice(0, 3)
      : [],
  { models: ['KbCollection'], initial: [] },
)

function back() {
  allowLeave()
  router.push(getCompanyPath(`/desk/kb${kbId.value ? `?kb=${kbId.value}` : ''}`))
}
</script>

<template>
  <div
    class="tw:flex tw:h-screen tw:w-full tw:flex-col tw:overflow-hidden tw:bg-main tw:text-on-main"
  >
    <header
      class="tw:flex tw:items-center tw:gap-2 tw:border-b tw:border-divider tw:bg-card tw:px-4 tw:py-2"
    >
      <button
        class="tw:rounded-md tw:p-1 tw:text-secondary tw:hover:bg-main-hover tw:hover:text-on-main"
        aria-label="Back to the knowledge base"
        @click="back"
      >
        <IconArrowLeft :size="18" />
      </button>
      <BaseHeading :level="1" class="tw:text-sm tw:font-semibold">Help center</BaseHeading>
      <div v-if="baseOptions.length > 1" class="tw:w-56">
        <BaseSelect v-model="kbId" :options="baseOptions" required aria-label="Knowledge base" />
      </div>
      <span v-else-if="kb" class="tw:text-sm tw:text-secondary">{{ kb.name }}</span>
      <a
        v-if="address?.url && kb?.status === 'LIVE'"
        :href="address.url"
        target="_blank"
        rel="noopener"
        class="tw:inline-flex tw:items-center tw:gap-1 tw:text-sm tw:text-primary tw:hover:underline"
      >
        {{ address.host }} <IconExternalLink :size="14" />
      </a>
      <div class="tw:flex-1" />
      <span v-if="dirty" class="tw:text-xs tw:font-medium tw:text-amber-700">Unsaved changes</span>
      <BaseButton v-if="canManage" :disabled="!dirty" :isLoading="saving" @click="save"
        >Save</BaseButton
      >
    </header>

    <BaseEmptyState
      v-if="!canManage"
      class="tw:mt-16"
      title="Help center settings are for KB admins"
      description="Ask someone with the KB Admin or Support Admin role."
    />
    <div v-else-if="draft" class="tw:flex tw:min-h-0 tw:flex-1">
      <!-- Settings -->
      <div class="tw:min-w-0 tw:flex-1 tw:overflow-y-auto">
        <div class="tw:mx-auto tw:flex tw:max-w-3xl tw:flex-col tw:gap-6 tw:p-6">
          <PageSection title="General" variant="card">
            <div class="tw:flex tw:flex-col tw:gap-4">
              <div class="tw:flex tw:items-center tw:justify-between tw:gap-4">
                <div>
                  <p class="tw:text-sm tw:font-medium">Help center is live</p>
                  <p class="tw:text-xs tw:text-secondary">
                    Off: visitors see “coming soon”. Only public, published articles ever show.
                  </p>
                </div>
                <BaseSwitch
                  :modelValue="draft.status === 'LIVE'"
                  label="Help center is live"
                  @update:modelValue="(v) => (draft.status = v ? 'LIVE' : 'DRAFT')"
                />
              </div>
              <BaseTextInput v-model="draft.name" label="Name" placeholder="Acme Help Center" />
              <div>
                <BaseTextInput
                  v-model="draft.slug"
                  label="Short name in the address"
                  placeholder="help"
                />
                <p class="tw:mt-1 tw:text-xs tw:text-secondary">
                  Address: <span class="tw:font-medium">{{ address?.host || '…' }}</span
                  >. To use your own domain (like help.example.com), see Custom domains.
                </p>
              </div>
            </div>
          </PageSection>

          <KbDomainsCard v-if="canDomains && kbId" :kbId="kbId" />

          <PageSection title="Home page" variant="card">
            <div class="tw:flex tw:flex-col tw:gap-4">
              <BaseTextInput
                v-model="draft.settings.homeTitle"
                label="Heading"
                placeholder="How can we help?"
              />
              <BaseTextInput
                v-model="draft.settings.homeTagline"
                label="Line under the heading"
                placeholder="Answers about your account, billing and setup."
              />
            </div>
          </PageSection>

          <PageSection title="Header and footer" variant="card">
            <div class="tw:flex tw:flex-col tw:gap-5">
              <div v-for="key in ['headerLinks', 'footerLinks']" :key="key">
                <p class="tw:mb-2 tw:text-sm tw:font-medium">
                  {{ key === 'headerLinks' ? 'Header links' : 'Footer links' }}
                </p>
                <div
                  v-for="(l, i) in draft.settings[key]"
                  :key="i"
                  class="tw:mb-2 tw:flex tw:items-center tw:gap-2"
                >
                  <BaseTextInput v-model="l.label" placeholder="Label" class="tw:w-40" />
                  <BaseTextInput
                    v-model="l.url"
                    placeholder="https://example.com/pricing"
                    class="tw:flex-1"
                  />
                  <button
                    type="button"
                    class="tw:rounded tw:p-1 tw:text-secondary tw:hover:bg-main-hover"
                    :aria-label="`Remove ${l.label || 'link'}`"
                    @click="draft.settings[key].splice(i, 1)"
                  >
                    <IconTrash :size="16" />
                  </button>
                </div>
                <BaseButton
                  size="sm"
                  variant="outline"
                  :disabled="draft.settings[key].length >= 12"
                  @click="addLink(draft.settings[key])"
                >
                  <IconPlus :size="14" class="tw:mr-1" /> Add link
                </BaseButton>
              </div>
              <BaseTextInput
                v-model="draft.settings.footerText"
                label="Footer text"
                placeholder="© Acme Inc."
              />
            </div>
          </PageSection>

          <PageSection title="Reaching a person" variant="card">
            <div class="tw:flex tw:flex-col tw:gap-4">
              <div class="tw:grid tw:gap-4 tw:md:grid-cols-2">
                <BaseTextInput
                  v-model="draft.settings.contactUrl"
                  label="“Contact us” link"
                  placeholder="https://example.com/contact"
                />
                <BaseTextInput
                  v-model="draft.settings.contactEmail"
                  label="Or an email address"
                  placeholder="support@example.com"
                />
              </div>
              <div class="tw:flex tw:items-center tw:justify-between tw:gap-4">
                <div>
                  <p class="tw:text-sm tw:font-medium">Chat widget on every page</p>
                  <p class="tw:text-xs tw:text-secondary">
                    The brand's live chat, as set in Desk → Settings → Brands.
                  </p>
                </div>
                <BaseSwitch v-model="draft.settings.widgetEnabled" label="Chat widget" />
              </div>
            </div>
          </PageSection>

          <PageSection title="Appearance" variant="card">
            <div class="tw:flex tw:flex-col tw:gap-5">
              <div class="tw:rounded-md tw:border tw:border-divider tw:bg-main tw:p-3">
                <p class="tw:text-sm tw:font-medium">Match a website</p>
                <p class="tw:mb-2 tw:text-xs tw:text-secondary">
                  A site built with our website builder shares its colours, fonts and logo. Enter
                  its address; the design loads into the preview, and Save keeps it.
                </p>
                <div class="tw:flex tw:items-center tw:gap-2">
                  <BaseTextInput
                    v-model="importUrl"
                    placeholder="https://www.example.com"
                    class="tw:flex-1"
                    @keyup.enter="importTheme"
                  />
                  <BaseButton variant="outline" :isLoading="importing" @click="importTheme">
                    <IconWorldDownload :size="16" class="tw:mr-1" /> Import design
                  </BaseButton>
                </div>
                <p v-if="lastImport" class="tw:mt-2 tw:text-xs tw:text-secondary">
                  From {{ lastImport.url }}: {{ lastImport.changed.length }} values changed.
                </p>
                <p
                  v-else-if="kb?.themeSource?.kind === 'cms' && kb.themeSource.syncedAt"
                  class="tw:mt-2 tw:text-xs tw:text-secondary"
                >
                  Last matched to {{ kb.themeSource.url }}. Import again to pick up its changes.
                </p>
              </div>

              <div class="tw:flex tw:flex-wrap tw:items-start tw:gap-6">
                <div>
                  <p class="tw:mb-1 tw:text-sm tw:font-medium">Logo</p>
                  <div class="tw:flex tw:items-center tw:gap-2">
                    <img
                      v-if="draft.theme.logo?.light"
                      :src="previewUrl(draft.theme.logo.light)"
                      alt="Logo"
                      class="tw:h-10 tw:max-w-40 tw:rounded tw:border tw:border-divider tw:bg-card tw:object-contain tw:p-1"
                    />
                    <BaseButton
                      size="sm"
                      variant="outline"
                      :isLoading="uploading"
                      @click="logoInput?.click()"
                    >
                      <IconPhoto :size="14" class="tw:mr-1" />
                      {{ draft.theme.logo?.light ? 'Replace' : 'Upload' }}
                    </BaseButton>
                    <button
                      v-if="draft.theme.logo?.light"
                      type="button"
                      class="tw:rounded tw:p-1 tw:text-secondary tw:hover:bg-main-hover"
                      aria-label="Remove logo"
                      @click="draft.theme.logo = null"
                    >
                      <IconX :size="14" />
                    </button>
                  </div>
                </div>
                <div>
                  <p class="tw:mb-1 tw:text-sm tw:font-medium">Browser tab icon</p>
                  <div class="tw:flex tw:items-center tw:gap-2">
                    <img
                      v-if="draft.theme.favicon"
                      :src="previewUrl(draft.theme.favicon)"
                      alt="Icon"
                      class="tw:size-8 tw:rounded tw:border tw:border-divider tw:object-contain"
                    />
                    <BaseButton size="sm" variant="outline" @click="faviconInput?.click()">
                      <IconPhoto :size="14" class="tw:mr-1" />
                      {{ draft.theme.favicon ? 'Replace' : 'Upload' }}
                    </BaseButton>
                  </div>
                </div>
                <input
                  ref="logoInput"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  class="tw:hidden"
                  @change="(e) => onPicked(e, 'logo')"
                />
                <input
                  ref="faviconInput"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  class="tw:hidden"
                  @change="(e) => onPicked(e, 'favicon')"
                />
              </div>

              <div>
                <p class="tw:mb-2 tw:text-sm tw:font-medium">Colours</p>
                <div class="tw:grid tw:grid-cols-2 tw:gap-3 tw:sm:grid-cols-4">
                  <div
                    v-for="c in COLOR_FIELDS"
                    :key="c.token"
                    class="tw:flex tw:items-center tw:gap-2 tw:text-sm"
                  >
                    <BaseColorPicker
                      :aria-label="`${c.label} colour`"
                      :modelValue="hex(token(c.token, c.fallback), c.fallback)"
                      @update:modelValue="(v) => setToken(c.token, v)"
                    />
                    {{ c.label }}
                  </div>
                </div>
              </div>
              <div class="tw:grid tw:gap-4 tw:md:grid-cols-2">
                <div>
                  <p class="tw:mb-1 tw:text-sm tw:font-medium">Font</p>
                  <BaseSelect
                    v-model="fontFamily"
                    :options="fontOptions"
                    required
                    aria-label="Font"
                  />
                </div>
                <div>
                  <p class="tw:mb-1 tw:text-sm tw:font-medium">Corners</p>
                  <SegmentedControl
                    v-model="radius"
                    :options="RADII"
                    size="sm"
                    ariaLabel="Corners"
                  />
                </div>
              </div>
              <div>
                <BaseButton size="sm" variant="outline" @click="resetTheme">
                  Back to the default look
                </BaseButton>
              </div>
            </div>
          </PageSection>

          <PageSection title="Search engines" variant="card">
            <div class="tw:flex tw:flex-col tw:gap-4">
              <BaseTextInput
                v-model="draft.settings.seoTitle"
                label="Title in search results"
                placeholder="Acme Help Center"
              />
              <BaseTextarea
                v-model="draft.settings.seoDescription"
                label="Description in search results"
                :rows="2"
                :maxlength="300"
              />
              <div class="tw:flex tw:items-center tw:justify-between tw:gap-4">
                <div>
                  <p class="tw:text-sm tw:font-medium">Hide from search engines</p>
                  <p class="tw:text-xs tw:text-secondary">
                    For a help center that is public but should not be found by Google.
                  </p>
                </div>
                <BaseSwitch v-model="draft.settings.noindex" label="Hide from search engines" />
              </div>
            </div>
          </PageSection>

          <KbApiAccessCard v-if="kbId" :kbId="kbId" />
        </div>
      </div>

      <!-- Live preview -->
      <aside
        class="tw:hidden tw:w-[26rem] tw:shrink-0 tw:overflow-y-auto tw:border-l tw:border-divider tw:bg-card tw:p-4 tw:xl:block"
        aria-label="Preview"
      >
        <p
          class="tw:mb-2 tw:text-xs tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary"
        >
          Preview
        </p>
        <div class="kb-hc-preview" :style="previewStyle">
          <div class="kb-hc-preview__header">
            <img
              v-if="draft.theme.logo?.light"
              :src="previewUrl(draft.theme.logo.light)"
              alt=""
              class="kb-hc-preview__logo"
            />
            <strong v-else>{{ draft.name || 'Help center' }}</strong>
            <span class="kb-hc-preview__links">
              <span v-for="l in draft.settings.headerLinks.slice(0, 3)" :key="l.label + l.url">{{
                l.label
              }}</span>
            </span>
          </div>
          <div class="kb-hc-preview__hero">
            <p class="kb-hc-preview__title">{{ draft.settings.homeTitle || 'How can we help?' }}</p>
            <p v-if="draft.settings.homeTagline" class="kb-hc-preview__tagline">
              {{ draft.settings.homeTagline }}
            </p>
            <div class="kb-hc-preview__search">
              <span>Search for answers</span><span class="kb-hc-preview__button">Search</span>
            </div>
          </div>
          <div class="kb-hc-preview__cards">
            <div
              v-for="c in previewCollections.length
                ? previewCollections
                : [
                    { id: 'a', title: 'Getting started' },
                    { id: 'b', title: 'Billing' },
                  ]"
              :key="c.id"
              class="kb-hc-preview__card"
            >
              <strong>{{ c.title }}</strong>
              <span>Articles</span>
            </div>
          </div>
          <div class="kb-hc-preview__footer">
            {{ draft.settings.footerText || `© ${draft.name}` }}
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.kb-hc-preview {
  font-family: var(--p-font);
  background: var(--p-canvas);
  color: var(--p-ink);
  border: 1px solid var(--p-line);
  border-radius: 12px;
  overflow: hidden;
  font-size: 12px;
}
.kb-hc-preview__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--p-surface);
  border-bottom: 1px solid var(--p-line);
}
.kb-hc-preview__logo {
  height: 20px;
}
.kb-hc-preview__links {
  display: flex;
  gap: 10px;
  color: var(--p-ink-3);
}
.kb-hc-preview__hero {
  background: var(--p-inverse);
  color: var(--p-on-inverse);
  padding: 22px 16px;
  text-align: center;
}
.kb-hc-preview__title {
  font-size: 18px;
  font-weight: 700;
  margin: 0 0 4px;
}
.kb-hc-preview__tagline {
  opacity: 0.8;
  margin: 0 0 10px;
}
.kb-hc-preview__search {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--p-surface);
  color: var(--p-ink-3);
  border-radius: var(--p-radius);
  padding: 4px 4px 4px 10px;
  margin-top: 8px;
}
.kb-hc-preview__button {
  background: var(--p-action);
  color: #fff;
  border-radius: calc(var(--p-radius) / 1.5);
  padding: 4px 10px;
  font-weight: 600;
}
.kb-hc-preview__cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 14px;
}
.kb-hc-preview__card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--p-surface);
  border: 1px solid var(--p-line);
  border-radius: var(--p-radius);
  padding: 10px;
}
.kb-hc-preview__card span {
  color: var(--p-link);
}
.kb-hc-preview__footer {
  padding: 10px 14px;
  border-top: 1px solid var(--p-line);
  background: var(--p-surface);
  color: var(--p-ink-3);
}
</style>
