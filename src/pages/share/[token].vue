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
    const data = await get(`/v1/share/${token.value}`)
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
    // does not distinguish them and neither should the page.
    error.value = err?.response?.data?.message || 'This link is no longer valid.'
  } finally {
    loading.value = false
  }
}

async function requestCode() {
  sending.value = true
  error.value = ''
  try {
    const data = await post(`/v1/share/${token.value}/request-code`, {})
    maskedEmail.value = data.maskedEmail
    codeSent.value = true
  } catch (err) {
    error.value = err?.response?.data?.message || 'Could not send a code.'
  } finally {
    sending.value = false
  }
}

async function verify() {
  if (!code.value) return
  verifying.value = true
  error.value = ''
  try {
    await post(`/v1/share/${token.value}/verify`, { code: code.value })
    code.value = ''
    await load()
  } catch (err) {
    error.value = err?.response?.data?.message || 'That code is not correct.'
  } finally {
    verifying.value = false
  }
}

function formatSize(bytes) {
  if (!bytes) return ''
  const mb = bytes / 1024 / 1024
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(Math.round(bytes / 1024), 1)} KB`
}

onMounted(load)
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
            <h1 class="tw:text-xl tw:font-semibold">A {{ label }} has been shared with you</h1>
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

        <!-- The record -->
        <div v-else-if="record">
          <div class="tw:mb-6 tw:border-b tw:border-input-border tw:pb-4">
            <BaseText color="secondary" class="tw:text-xs tw:uppercase tw:tracking-wide">
              {{ record.label }}
            </BaseText>
            <h1 class="tw:mt-1 tw:text-2xl tw:font-semibold">
              {{ record.reference }}
            </h1>
            <p v-if="record.title" class="tw:mt-1 tw:text-secondary">{{ record.title }}</p>
          </div>

          <div class="tw:flex tw:flex-col tw:gap-6">
            <section v-for="section in record.sections" :key="section.title">
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
          <section v-if="record.attachments?.length" class="tw:mt-6">
            <h2
              class="tw:mb-2 tw:text-xs tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary"
            >
              Attachments
            </h2>
            <ul class="tw:flex tw:flex-col tw:gap-1.5">
              <li v-for="f in record.attachments" :key="f.url">
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
