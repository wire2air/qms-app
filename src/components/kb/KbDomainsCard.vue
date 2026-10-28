<script setup>
import {
  IconWorldWww,
  IconPlus,
  IconCopy,
  IconTrash,
  IconRefresh,
  IconStar,
} from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception: domains
// carry server-computed DNS records and verification runs on the server.
import { get, post, put, del } from '@/api'

/**
 * CUSTOM DOMAINS of the help center (docs/plans/knowledge-base-phase2-5.md §6):
 * add help.example.com, set the two DNS records shown, and the domain is
 * checked (now, and every 15 minutes until it works). The primary domain is
 * the help center's address; the others redirect to it. Certificates are
 * issued automatically once a domain is verified (at Cloudflare for SaaS where
 * the platform uses it: `certificate` on each domain says how far it is).
 */
const props = defineProps({ kbId: { type: String, required: true } })
const toast = useToast()
const { confirm } = useConfirm()

const domains = ref([])
const loading = ref(false)
async function load() {
  loading.value = true
  try {
    const res = await get(`/v1/services/kb/bases/${props.kbId}/domains`)
    domains.value = res.domains || res || []
  } catch (e) {
    toast.error(e.message || 'Could not load the domains')
  } finally {
    loading.value = false
  }
}
watch(() => props.kbId, load, { immediate: true })
// A background check may finish while the page is open: look again now and then.
useIntervalFn(() => {
  if (domains.value.some((d) => d.status !== 'ACTIVE')) load()
}, 30000)

const hostname = ref('')
const adding = ref(false)
async function add() {
  const h = hostname.value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
  if (!h) return
  adding.value = true
  try {
    await post(`/v1/services/kb/bases/${props.kbId}/domains`, { hostname: h })
    hostname.value = ''
    toast.success(`${h} added. Set its DNS records below.`)
    await load()
  } catch (e) {
    toast.error(e.message || 'The domain could not be added')
  } finally {
    adding.value = false
  }
}
const checking = ref(null)
async function check(d) {
  checking.value = d.id
  try {
    const res = await post(`/v1/services/kb/domains/${d.id}/check`, {})
    const status = res.domain?.status || res.status
    if (status === 'ACTIVE') toast.success(`${d.hostname} is verified`)
    else toast.error(res.domain?.error || res.error || 'The DNS records are not right yet')
    await load()
  } catch (e) {
    toast.error(e.message || 'The check failed')
  } finally {
    checking.value = null
  }
}
async function makePrimary(d) {
  try {
    await put(`/v1/services/kb/domains/${d.id}`, { primary: true })
    toast.success(`${d.hostname} is now the help center's address`)
    await load()
  } catch (e) {
    toast.error(e.message || 'Could not change the primary domain')
  }
}
async function remove(d) {
  const ok = await confirm({
    title: `Remove ${d.hostname}?`,
    message: 'The help center stops answering on this domain.',
    okLabel: 'Remove',
    danger: true,
  })
  if (!ok) return
  try {
    await del(`/v1/services/kb/domains/${d.id}`)
    await load()
  } catch (e) {
    toast.error(e.message || 'The domain could not be removed')
  }
}
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Copied')
  } catch {
    toast.error('Copy failed: select the text and copy it')
  }
}
const STATUS = {
  ACTIVE: { label: 'Verified', class: 'tw:bg-green-100 tw:text-green-700' },
  PENDING: { label: 'Waiting for DNS', class: 'tw:bg-amber-100 tw:text-amber-800' },
  FAILED: { label: 'Not verified', class: 'tw:bg-red-100 tw:text-red-700' },
}
function when(d) {
  if (!d) return ''
  return typeof d === 'string' ? new Date(d).toLocaleString() : d.formatDate?.('datetime') || ''
}
</script>

<template>
  <PageSection title="Custom domains" :icon="IconWorldWww" variant="card">
    <div class="tw:flex tw:flex-col tw:gap-4">
      <p class="tw:text-sm tw:text-secondary">
        Serve the help center on your own address, like help.example.com. Add it here, then set the
        two DNS records at your domain provider.
      </p>
      <div class="tw:flex tw:items-center tw:gap-2">
        <BaseTextInput
          v-model="hostname"
          placeholder="help.example.com"
          class="tw:flex-1"
          aria-label="Domain"
          @keyup.enter="add"
        />
        <BaseButton :isLoading="adding" :disabled="!hostname.trim()" @click="add">
          <IconPlus :size="16" class="tw:mr-1" /> Add domain
        </BaseButton>
      </div>

      <ul v-if="domains.length" class="tw:flex tw:flex-col tw:gap-3" aria-label="Domains">
        <li
          v-for="d in domains"
          :key="d.id"
          class="tw:flex tw:flex-col tw:gap-2 tw:rounded-md tw:border tw:border-divider tw:p-3"
        >
          <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
            <span class="tw:text-sm tw:font-semibold">{{ d.hostname }}</span>
            <BaseBadge size="sm" :class="(STATUS[d.status] || STATUS.PENDING).class">{{
              (STATUS[d.status] || STATUS.PENDING).label
            }}</BaseBadge>
            <BaseBadge v-if="d.isPrimary" size="sm" class="tw:bg-sky-100 tw:text-sky-800">
              <IconStar :size="12" class="tw:mr-1" /> Primary
            </BaseBadge>
            <div class="tw:flex-1" />
            <BaseButton
              v-if="d.status !== 'ACTIVE'"
              size="sm"
              variant="outline"
              :isLoading="checking === d.id"
              @click="check(d)"
            >
              <IconRefresh :size="14" class="tw:mr-1" /> Check now
            </BaseButton>
            <BaseButton
              v-if="d.status === 'ACTIVE' && !d.isPrimary"
              size="sm"
              variant="outline"
              @click="makePrimary(d)"
              >Make primary</BaseButton
            >
            <button
              type="button"
              class="tw:rounded tw:p-1 tw:text-secondary tw:hover:bg-main-hover tw:hover:text-red-600"
              :aria-label="`Remove ${d.hostname}`"
              @click="remove(d)"
            >
              <IconTrash :size="16" />
            </button>
          </div>
          <p
            v-if="d.status !== 'ACTIVE' && d.error"
            class="tw:text-xs"
            :class="d.certificate && !d.certificate.active && d.error.startsWith('The DNS records are right') ? 'tw:text-amber-700' : 'tw:text-red-700'"
          >
            {{ d.error }}
          </p>
          <!-- Cloudflare for SaaS: the certificate is issued and renewed there; the domain serves once it is active. -->
          <p v-if="d.certificate" class="tw:text-xs" :class="d.certificate.active ? 'tw:text-green-700' : 'tw:text-secondary'">
            Certificate (Cloudflare):
            {{
              d.certificate.active
                ? 'active'
                : d.certificate.registered
                  ? `${d.certificate.status || 'pending'} · ${d.certificate.sslStatus || 'pending'}`
                  : 'registering…'
            }}<template v-if="d.certificate.error && !d.certificate.active"> — {{ d.certificate.error }}</template>
          </p>
          <p class="tw:text-xs tw:text-secondary">
            <template v-if="d.verifiedAt">Verified {{ when(d.verifiedAt) }}. </template>
            <template v-if="d.lastCheckedAt">Last checked {{ when(d.lastCheckedAt) }}.</template>
          </p>
          <table
            v-if="d.status !== 'ACTIVE' && d.dns?.length"
            class="tw:w-full tw:text-left tw:text-xs"
          >
            <thead class="tw:text-secondary">
              <tr>
                <th class="tw:py-1 tw:pr-2 tw:font-medium">Type</th>
                <th class="tw:py-1 tw:pr-2 tw:font-medium">Name</th>
                <th class="tw:py-1 tw:font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in d.dns" :key="r.type + r.name" class="tw:border-t tw:border-divider">
                <td class="tw:py-1.5 tw:pr-2 tw:font-medium">{{ r.type }}</td>
                <td class="tw:break-all tw:py-1.5 tw:pr-2">{{ r.name }}</td>
                <td class="tw:py-1.5">
                  <span class="tw:flex tw:items-center tw:gap-1">
                    <code class="tw:break-all">{{ r.value }}</code>
                    <button
                      type="button"
                      class="tw:rounded tw:p-0.5 tw:text-secondary tw:hover:bg-main-hover"
                      :aria-label="`Copy ${r.type} value`"
                      @click="copy(r.value)"
                    >
                      <IconCopy :size="13" />
                    </button>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </li>
      </ul>
      <p v-else-if="!loading" class="tw:text-sm tw:text-secondary">No custom domain yet.</p>
    </div>
  </PageSection>
</template>
