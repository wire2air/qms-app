<script setup>
/**
 * The external view of a shared record — /share/:token
 *
 * Seen by people with no account: a customer who complained, a supplier's
 * quality lead, an auditor. They arrive from an email, verify a code sent to
 * that same address, and read one record.
 *
 * Three states, and the order matters: the code gate comes BEFORE anything
 * identifying the record. Someone who has the link but not the mailbox learns
 * only that a record of some type exists.
 *
 * Everything shown here comes from the server's curated projection. This page
 * renders labels and values it is handed — it has no model, no query, and no
 * way to ask for a field the projection did not include.
 */
import { IconLock, IconMail, IconAlertCircle, IconPaperclip } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { get, post } from '@/api'

defineOptions({ name: 'SharedRecordPage' })

/**
 * Every call on this page is `showError: false`: the reader is outside the
 * company, the page shows its own message in context, and the app-wide error
 * toast would repeat it — or, for a 401, tell someone with no account to "sign
 * in again".
 */
const QUIET = { showError: false }

/**
 * The words shown for a failed call.
 *
 * `@/api` throws an ApiError whose `.message` is the server's own
 * (`{ error: { message } }`). This page used to read `err.response.data.message`
 * — a shape ApiError does not have — so every failure showed the hard-coded
 * fallback: "Too many attempts. Request a new code." and "That code has
 * expired." both arrived as "That code is not correct.", which sends the reader
 * back to retype a code that can no longer work.
 */
function outsiderMessage(err, fallback) {
  const status = err?.status
  const own = err?.message && !/^Request failed/.test(err.message) ? err.message : null
  // A 401 here means THIS link's verified visit lapsed — never "sign in".
  if (status === 401) return 'Your verified visit has ended. Request a new code to continue.'
  if (status === 429) return own || 'Too many requests. Wait a minute and try again.'
  if (status >= 400 && status < 500 && own) return own
  return fallback
}

/**
 * RS-L-06 — a Content-Security-Policy for the external share page.
 *
 * This page hands server-sanitised HTML (v-html) to a browser OUTSIDE the
 * company. The sanitiser is the primary control; this is the second, so a
 * sanitiser regression cannot become a third-party beacon, an exfiltrating
 * fetch, or an injected script.
 *
 * Delivered as a `<meta http-equiv>` appended to <head>, which browsers enforce
 * for every load after insertion. A response header would be stronger (it
 * covers the shell itself and allows frame-ancestors), but the shell is served
 * by Vite / static hosting, so a header is an infrastructure change and is left
 * to one. Two consequences are deliberate:
 *   - Applied only when /share/ was the DOCUMENT'S ENTRY URL. A policy cannot be
 *     removed once added, so an internal user who navigated here inside the app
 *     must not have the rest of their session narrowed.
 *   - 'unsafe-inline' for styles only: Vue/Vite inject <style> for lazily
 *     loaded chunks. Scripts are 'self' — nothing on this page needs more.
 */
const SHARE_PAGE_CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

function applySharePageCsp() {
  if (typeof document === 'undefined' || !document.head) return
  if (document.querySelector('meta[http-equiv="Content-Security-Policy"]')) return
  const nav = window.performance?.getEntriesByType?.('navigation')?.[0]
  const entryPath = nav?.name ? new URL(nav.name, window.location.href).pathname : null
  const isEntry = entryPath ? entryPath.startsWith('/share/') : !window.history.state?.back
  if (!isEntry) return
  const meta = document.createElement('meta')
  meta.httpEquiv = 'Content-Security-Policy'
  meta.content = SHARE_PAGE_CSP
  document.head.appendChild(meta)
}

const route = useRoute()
const token = computed(() => route.params.token)

const loading = ref(true)
const error = ref('')
const needsVerification = ref(false)
const maskedEmail = ref('')
const label = ref('record')
const record = ref(null)

const code = ref('')
const sending = ref(false)
const verifying = ref(false)
const codeSent = ref(false)

// "A Nonconformance", but "An Audit Records Package".
const article = computed(() => (/^[aeiou]/i.test(label.value) ? 'An' : 'A'))

/**
 * The image the reader has opened, or null.
 *
 * Inline images render as thumbnails: an editor image is whatever size the
 * camera produced, and a 960px photo dropped into a two-column summary pushes
 * the record itself off the screen. The full picture is one click away rather
 * than always in the way.
 *
 * The click is delegated from the container because the images live inside
 * v-html — there is no element here to put @click on.
 */
/**
 * A value ready to show.
 *
 * The API client parses every ISO string in a response into a Luxon DateTime,
 * so a projected date reached the template as an object and rendered as
 * "2026-08-21T00:00:00.000-04:00" — an ISO timestamp shown to a customer.
 * Format it the way the rest of the app does, and pass anything the parser
 * left alone straight through.
 */
function displayValue(item) {
  if (item.type === 'date' && typeof item.value?.formatDate === 'function') {
    return item.value.formatDate('date')
  }
  return item.value
}

// ── Audit Records Package: the manifest, and the item being read ───────────
const packageRecord = computed(() => (record.value?.kind === 'package' ? record.value : null))
const openedItem = ref(null) // projection of the item being read
const openedItemMeta = ref(null) // {label, reference} for the back header
const loadingItem = ref(false)

async function openPackageItem(item) {
  if (loadingItem.value) return
  loadingItem.value = true
  error.value = ''
  try {
    const data = await get(`/v1/share/${token.value}/items/${item.id}`, QUIET)
    openedItem.value = data.record
    openedItemMeta.value = item
    window.scrollTo({ top: 0 })
  } catch (err) {
    if (err?.status === 404 && err?.message === 'This link is no longer valid.') {
      // The whole LINK died (withdrawn or expired) while the manifest was on
      // screen. Show the dead-link state rather than a stale manifest whose
      // every item silently does nothing.
      record.value = null
      needsVerification.value = false
      error.value = err.message
    } else if (err?.status === 401) {
      // The verified visit lapsed: back to the code gate for this same link.
      record.value = null
      await load()
    } else {
      error.value = outsiderMessage(err, 'This record is no longer available.')
    }
  } finally {
    loadingItem.value = false
  }
}

function closePackageItem() {
  openedItem.value = null
  openedItemMeta.value = null
}

// What the record layout below renders: the opened package item, or the
// single shared record — one template serves both shapes.
const shownRecord = computed(() => openedItem.value || (packageRecord.value ? null : record.value))

function printPage() {
  window.print()
}

const viewerImage = ref(null)

function openImage(event) {
  const img = event.target.closest?.('img')
  if (!img) return
  viewerImage.value = { src: img.getAttribute('src'), alt: img.getAttribute('alt') || '' }
}

function closeImage() {
  viewerImage.value = null
}

// Escape closes the overlay — the reader's first instinct, and this page has no
// dialog primitive to inherit it from.
function onViewerKey(event) {
  if (event.key === 'Escape') closeImage()
}

watch(viewerImage, (open) => {
  if (open) window.addEventListener('keydown', onViewerKey)
  else window.removeEventListener('keydown', onViewerKey)
})

onBeforeUnmount(() => window.removeEventListener('keydown', onViewerKey))

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await get(`/v1/share/${token.value}`, QUIET)
    if (data.needsVerification) {
      needsVerification.value = true
      maskedEmail.value = data.maskedEmail
      label.value = data.label || 'record'
    } else {
      needsVerification.value = false
      record.value = data.record
      label.value = data.record?.label || 'record'
    }
  } catch (err) {
    // One message for expired, revoked and never-existed alike — the server
    // does not distinguish them and neither should the page. Clear what was on
    // screen: the dead-link state only renders with no record behind it, so a
    // reload that fails after a verify would otherwise keep showing the record
    // the link no longer grants.
    record.value = null
    needsVerification.value = false
    error.value = outsiderMessage(err, 'This link is no longer valid.')
  } finally {
    loading.value = false
  }
}

async function requestCode() {
  sending.value = true
  error.value = ''
  try {
    const data = await post(`/v1/share/${token.value}/request-code`, {}, QUIET)
    maskedEmail.value = data.maskedEmail
    codeSent.value = true
  } catch (err) {
    error.value = outsiderMessage(err, 'Could not send a code.')
  } finally {
    sending.value = false
  }
}

async function verify() {
  if (!code.value) return
  verifying.value = true
  error.value = ''
  try {
    await post(`/v1/share/${token.value}/verify`, { code: code.value }, QUIET)
    code.value = ''
    await load()
  } catch (err) {
    error.value = outsiderMessage(err, 'That code is not correct.')
  } finally {
    verifying.value = false
  }
}

function formatSize(bytes) {
  if (!bytes) return ''
  const mb = bytes / 1024 / 1024
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(Math.round(bytes / 1024), 1)} KB`
}

onMounted(() => {
  applySharePageCsp()
  load()
})
</script>

<template>
  <div class="tw:min-h-screen tw:bg-sidebar tw:py-10 tw:px-4">
    <div class="tw:mx-auto tw:w-full tw:max-w-3xl">
      <div class="tw:mb-6 tw:flex tw:justify-center">
        <BrandLogo class="tw:h-8" />
      </div>

      <div class="tw:rounded-xl tw:bg-card tw:p-6 tw:shadow-sm sm:tw:p-8">
        <!-- Loading -->
        <div v-if="loading" class="tw:flex tw:justify-center tw:py-12">
          <BaseSpinner />
        </div>

        <!-- Dead link -->
        <div v-else-if="error && !needsVerification && !record" class="tw:text-center tw:py-8">
          <IconAlertCircle :size="40" class="tw:mx-auto tw:mb-3 tw:text-secondary" />
          <p class="tw:text-lg tw:font-medium">{{ error }}</p>
          <p class="tw:mt-2 tw:text-sm tw:text-secondary">
            Links expire, and the person who shared this can withdraw it at any time. Ask them to
            send a new one.
          </p>
        </div>

        <!-- Code gate -->
        <div v-else-if="needsVerification" class="tw:mx-auto tw:max-w-sm tw:py-4">
          <div class="tw:mb-5 tw:text-center">
            <div
              class="tw:mx-auto tw:mb-3 tw:flex tw:size-12 tw:items-center tw:justify-center tw:rounded-full tw:bg-sidebar tw:text-primary"
            >
              <IconLock :size="22" />
            </div>
            <h1 class="tw:text-xl tw:font-semibold">{{ article }} {{ label }} has been shared with you</h1>
            <p class="tw:mt-2 tw:text-sm tw:text-secondary">
              To open it, we’ll email a short code to
              <strong class="tw:text-on-main">{{ maskedEmail }}</strong
              >.
            </p>
          </div>

          <div v-if="!codeSent" class="tw:flex tw:flex-col tw:gap-3">
            <BaseButton :loading="sending" class="tw:w-full" @click="requestCode">
              <IconMail :size="16" class="tw:mr-1.5" />
              Email me a code
            </BaseButton>
          </div>

          <div v-else class="tw:flex tw:flex-col tw:gap-3">
            <BaseField label="Verification code">
              <BaseTextInput
                v-model="code"
                placeholder="6-digit code"
                inputmode="numeric"
                autocomplete="one-time-code"
                maxlength="6"
                @keyup.enter="verify"
              />
            </BaseField>
            <BaseButton :loading="verifying" :disabled="!code" class="tw:w-full" @click="verify">
              Open the {{ label }}
            </BaseButton>
            <button
              type="button"
              class="tw:text-xs tw:text-secondary tw:underline"
              :disabled="sending"
              @click="requestCode"
            >
              Send another code
            </button>
          </div>

          <p v-if="error" class="tw:mt-3 tw:text-center tw:text-sm tw:text-red-600">{{ error }}</p>
        </div>

        <!-- Audit Records Package: the manifest until an item is opened -->
        <div v-else-if="packageRecord && !openedItem">
          <div class="tw:mb-6 tw:border-b tw:border-input-border tw:pb-4">
            <BaseText color="secondary" class="tw:text-xs tw:uppercase tw:tracking-wide">
              {{ packageRecord.label }}
            </BaseText>
            <h1 class="tw:mt-1 tw:text-2xl tw:font-semibold">{{ packageRecord.reference }}</h1>
            <p v-if="packageRecord.title" class="tw:mt-1 tw:text-secondary">
              {{ packageRecord.title }}
            </p>
          </div>
          <p class="tw:mb-3 tw:text-sm tw:text-secondary">
            {{ packageRecord.items.length }} record{{ packageRecord.items.length === 1 ? '' : 's' }}
            shared with you — open any of them below. Your verification covers the whole package.
          </p>
          <ul class="tw:flex tw:flex-col tw:divide-y tw:divide-input-border tw:rounded-xl tw:border tw:border-input-border">
            <li v-for="item in packageRecord.items" :key="item.id">
              <button
                type="button"
                class="tw:flex tw:w-full tw:items-center tw:gap-3 tw:px-4 tw:py-3 tw:text-left tw:bg-transparent tw:border-0 tw:cursor-pointer hover:tw:bg-black/5"
                :disabled="loadingItem"
                @click="openPackageItem(item)"
              >
                <span class="tw:text-xs tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary tw:w-28 tw:shrink-0">
                  {{ item.label }}
                </span>
                <span class="tw:min-w-0 tw:flex-1">
                  <span class="tw:font-medium">{{ item.reference || '—' }}</span>
                  <span v-if="item.title && item.title !== item.reference" class="tw:text-secondary">
                    · {{ item.title }}</span
                  >
                </span>
                <span class="tw:text-primary tw:text-sm tw:shrink-0">Open →</span>
              </button>
            </li>
          </ul>
          <p v-if="error" class="tw:mt-3 tw:text-sm tw:text-red-600">{{ error }}</p>
        </div>

        <!-- The record (a single share, or an opened package item) -->
        <div v-else-if="shownRecord">
          <div v-if="openedItem" class="tw:mb-4 tw:flex tw:items-center tw:gap-2 tw:print:hidden">
            <button
              type="button"
              class="tw:text-sm tw:text-primary hover:tw:underline tw:bg-transparent tw:border-0 tw:cursor-pointer"
              @click="closePackageItem"
            >
              ← All shared records
            </button>
            <span class="tw:flex-1" />
            <button
              type="button"
              class="tw:text-sm tw:text-primary hover:tw:underline tw:bg-transparent tw:border-0 tw:cursor-pointer"
              @click="printPage"
            >
              Print
            </button>
          </div>
          <div class="tw:mb-6 tw:border-b tw:border-input-border tw:pb-4">
            <BaseText color="secondary" class="tw:text-xs tw:uppercase tw:tracking-wide">
              {{ shownRecord.label }}
            </BaseText>
            <h1 class="tw:mt-1 tw:text-2xl tw:font-semibold">
              {{ shownRecord.reference }}
            </h1>
            <p v-if="shownRecord.title" class="tw:mt-1 tw:text-secondary">{{ shownRecord.title }}</p>
          </div>

          <div class="tw:flex tw:flex-col tw:gap-6">
            <section v-for="section in shownRecord.sections" :key="section.title">
              <h2
                class="tw:mb-2 tw:text-xs tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary"
              >
                {{ section.title }}
              </h2>
              <dl class="tw:grid tw:gap-x-6 tw:gap-y-3 sm:tw:grid-cols-2">
                <div v-for="item in section.items" :key="item.label">
                  <dt class="tw:text-xs tw:text-secondary">{{ item.label }}</dt>
                  <!-- richText is HTML from the editor, already sanitised
                       server-side against a tight allow-list (no script, no
                       links; images only after every src has been rewritten to
                       our own share endpoint). Rendering it escaped showed
                       readers literal <p> tags; rendering it raw would be
                       stored XSS aimed at an external browser.
                       Click is delegated here to open an image full size. -->
                  <dd
                    v-if="item.type === 'richText'"
                    class="tw:mt-0.5 tw:text-sm tw:share-rich"
                    @click="openImage"
                    v-html="item.value"
                  />
                  <!-- A file field inside a step form. Same share endpoint as
                       the record's own attachments, so the same revocation
                       applies. -->
                  <dd v-else-if="item.type === 'files'" class="tw:mt-0.5 tw:text-sm">
                    <a
                      v-for="f in item.value"
                      :key="f.url"
                      :href="f.url"
                      target="_blank"
                      rel="noopener"
                      class="tw:flex tw:items-center tw:gap-2 tw:text-primary hover:tw:underline"
                    >
                      <IconPaperclip :size="14" class="tw:shrink-0" />
                      <span class="tw:truncate">{{ f.name }}</span>
                    </a>
                  </dd>
                  <dd v-else class="tw:mt-0.5 tw:text-sm tw:whitespace-pre-line">
                    {{ displayValue(item) }}
                  </dd>
                </div>
              </dl>
            </section>
          </div>

          <!-- Attachments. Served through /v1/share/:token/files/:assetId, which
               re-checks the link and the verified session on every request — so
               revoking the link kills these in the same instant, with no copies
               to clean up. -->
          <section v-if="shownRecord.attachments?.length" class="tw:mt-6">
            <h2
              class="tw:mb-2 tw:text-xs tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary"
            >
              Attachments
            </h2>
            <ul class="tw:flex tw:flex-col tw:gap-1.5">
              <li v-for="f in shownRecord.attachments" :key="f.url">
                <a
                  :href="f.url"
                  target="_blank"
                  rel="noopener"
                  class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-primary hover:tw:underline"
                >
                  <IconPaperclip :size="14" class="tw:shrink-0" />
                  <span class="tw:truncate">{{ f.name }}</span>
                  <span v-if="f.size" class="tw:shrink-0 tw:text-xs tw:text-secondary">
                    {{ formatSize(f.size) }}
                  </span>
                </a>
              </li>
            </ul>
          </section>

          <p
            class="tw:mt-8 tw:border-t tw:border-input-border tw:pt-4 tw:text-xs tw:text-secondary"
          >
            This is a shared view of a single record. It shows a summary, not the full internal
            record, and access can be withdrawn at any time.
          </p>
        </div>
      </div>
    </div>
  </div>

  <!-- Full-size image. A plain overlay rather than a dialog primitive: this
       page is deliberately standalone and carries no app chrome. -->
  <div
    v-if="viewerImage"
    class="tw:fixed tw:inset-0 tw:z-50 tw:flex tw:items-center tw:justify-center tw:bg-black/80 tw:p-4"
    role="dialog"
    aria-modal="true"
    :aria-label="viewerImage.alt || 'Image'"
    @click="closeImage"
  >
    <img
      :src="viewerImage.src"
      :alt="viewerImage.alt"
      class="tw:max-h-full tw:max-w-full tw:rounded"
    />
    <BaseButton
      variant="secondary"
      size="sm"
      class="tw:absolute tw:right-4 tw:top-4"
      aria-label="Close image"
      @click.stop="closeImage"
    >
      Close
    </BaseButton>
  </div>
</template>

<style scoped>
.tw\:share-rich :deep(p) {
  margin: 0 0 0.5rem;
}
.tw\:share-rich :deep(p:last-child) {
  margin-bottom: 0;
}
.tw\:share-rich :deep(ul),
.tw\:share-rich :deep(ol) {
  margin: 0 0 0.5rem;
  padding-left: 1.25rem;
}
.tw\:share-rich :deep(ul) {
  list-style: disc;
}
.tw\:share-rich :deep(ol) {
  list-style: decimal;
}
.tw\:share-rich :deep(li) {
  margin: 0.125rem 0;
}
/* Thumbnail, not full size — the record is the point, the photo is evidence
   for it. Click opens the full image (see openImage). */
.tw\:share-rich :deep(img) {
  max-width: 12rem;
  max-height: 12rem;
  width: auto;
  height: auto;
  border-radius: 0.375rem;
  border: 1px solid var(--color-input-border);
  margin: 0.25rem 0;
  cursor: zoom-in;
}
.tw\:share-rich :deep(blockquote) {
  margin: 0 0 0.5rem;
  padding-left: 0.75rem;
  border-left: 2px solid currentColor;
  opacity: 0.8;
}
</style>
