<script setup>
import { uploadSupportEditorImage } from '@/composables/useSupportFileUpload'
import { IconArrowLeft, IconDeviceFloppy } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { put } from '@/api'
import { currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

/**
 * The agent's own Support Desk preferences (spec §6): status, working hours,
 * timezone, email signature, notifications. Writes through PUT
 * /supportDesk/agents/me — the agent's own row only; role, brands and the chat
 * cap stay with the lead on Settings → Agents.
 */
const toast = useToast()
const router = useRouter()
const userId = computed(() => currentSession.value?.userId ?? null)
const me = useLiveQueryWithDeps(
  [() => userId.value],
  async (db, [uid]) => (uid ? db.SupportAgent.where('userId', uid).first() : null),
  { models: ['SupportAgent'] },
)

// Brands this agent serves — one optional signature override each.
const brandLinks = useLiveQueryWithDeps(
  [() => me.value?.id ?? null],
  async (db, [agentId]) => (agentId ? db.SupportAgentBrand.where('agentId', agentId).exec() : []),
  { models: ['SupportAgentBrand'], initial: [] },
)
const brands = useLiveQuery((db) => db.SupportBrand.where().exec(), {
  models: ['SupportBrand'],
  initial: [],
})
const myBrands = computed(() =>
  brandLinks.value
    .map((l) => ({ link: l, brand: brands.value.find((b) => b.id === l.brandId) }))
    .filter((x) => x.brand),
)
const brandSignatures = ref({})
watch(
  brandLinks,
  (links) => {
    const next = { ...brandSignatures.value }
    for (const l of links) if (!(l.brandId in next)) next[l.brandId] = l.signatureHtml || ''
    brandSignatures.value = next
  },
  { immediate: true },
)
const form = ref(null)
const loadedFor = ref(null)
watch(
  me,
  (a) => {
    if (!a || loadedFor.value === a.id) return
    loadedFor.value = a.id
    form.value = {
      schedule: a.schedule ? JSON.parse(JSON.stringify(a.schedule)) : {},
      timezone: a.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      signatureHtml: a.signatureHtml || '',
      notifyMode: a.notifyMode || 'INSTANT',
      notificationPrefs: {
        newChat: a.notificationPrefs?.newChat !== false,
        assigned: a.notificationPrefs?.assigned !== false,
        mention: a.notificationPrefs?.mention !== false,
        sound: a.notificationPrefs?.sound !== false,
      },
    }
  },
  { immediate: true },
)

const saving = ref(false)
async function save() {
  if (!form.value || saving.value) return
  saving.value = true
  try {
    const hasHours = Object.entries(form.value.schedule || {}).some(
      ([k, v]) => k !== 'holidays' && Array.isArray(v) && v.length,
    )
    const { agent } = await put('/v1/services/supportDesk/agents/me', {
      schedule: hasHours ? form.value.schedule : null,
      timezone: form.value.timezone || null,
      signatureHtml: form.value.signatureHtml || null,
      notifyMode: form.value.notifyMode,
      notificationPrefs: form.value.notificationPrefs,
      brandSignatures: Object.fromEntries(
        Object.entries(brandSignatures.value).map(([k, v]) => [k, v?.trim() || null]),
      ),
    })
    for (const l of brandLinks.value)
      if (l.brandId in brandSignatures.value)
        l.signatureHtml = brandSignatures.value[l.brandId]?.trim() || null
    // The signature is not an audited field, so no sync event follows — patch
    // the local record so the page (and the composer) see it right away.
    if (me.value && agent) {
      me.value.schedule = agent.schedule
      me.value.timezone = agent.timezone
      me.value.signatureHtml = agent.signatureHtml
      me.value.notifyMode = agent.notifyMode
      me.value.notificationPrefs = agent.notificationPrefs
    }
    toast.success('Preferences saved')
  } catch (e) {
    toast.error(e?.message || 'Could not save')
  } finally {
    saving.value = false
  }
}

const NOTIFY_MODES = [
  { id: 'INSTANT', name: 'Instant — email me for each new chat / assignment' },
  { id: 'DIGEST', name: 'Digest — batch them' },
  { id: 'NONE', name: 'None — in-app only' },
]
const TOGGLES = [
  { key: 'newChat', label: 'New chat on one of my brands' },
  { key: 'assigned', label: 'A ticket is assigned or handed over to me' },
  { key: 'mention', label: 'A teammate mentions me in a note' },
  { key: 'sound', label: 'Play a sound for new messages while the inbox is open' },
]
const name = computed(() => {
  const s = currentSession.value
  return [s?.firstName, s?.lastName].filter(Boolean).join(' ') || s?.email || ''
})
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
        aria-label="Back to inbox"
        @click="router.push(getCompanyPath('/desk'))"
      >
        <IconArrowLeft :size="18" />
      </button>
      <div class="tw:flex-1">
        <BaseHeading :level="1" class="tw:text-sm tw:font-semibold"
          >My support preferences</BaseHeading
        >
        <p class="tw:text-xs tw:text-secondary">{{ name }}</p>
      </div>
      <SupportAgentPresence />
      <BaseButton v-if="form" variant="primary" size="sm" :disabled="saving" @click="save">
        <IconDeviceFloppy :size="14" class="tw:mr-1" />
        {{ saving ? 'Saving…' : 'Save' }}
      </BaseButton>
    </header>

    <div class="tw:flex-1 tw:overflow-y-auto">
      <div class="tw:mx-auto tw:flex tw:max-w-3xl tw:flex-col tw:gap-4 tw:p-4 tw:sm:p-6">
        <div v-if="me === undefined" class="tw:flex tw:justify-center tw:py-10">
          <BaseSpinner />
        </div>
        <BaseEmptyState
          v-else-if="me === null"
          title="You are not a support agent yet"
          description="Ask an admin to add you under Support Desk → Settings → Agents. Until then you can still work tickets from the ticketing view."
        />
        <template v-else-if="form">
          <BaseCard>
            <BaseText variant="overline" class="tw:mb-3 tw:block">Working hours</BaseText>
            <p class="tw:mb-3 tw:text-xs tw:text-secondary">
              When you are scheduled, going Online puts you in the auto-assign pool; outside these
              hours the widget shows you as away unless you set Online by hand. Leave every day
              empty to follow the brand's business hours instead.
            </p>
            <SupportHoursEditor v-model="form.schedule" />
            <BaseField label="Timezone" class="tw:mt-3">
              <BaseTextInput v-model="form.timezone" placeholder="Europe/Stockholm" />
            </BaseField>
          </BaseCard>

          <BaseCard>
            <BaseText variant="overline" class="tw:mb-1 tw:block">Email signature</BaseText>
            <p class="tw:mb-3 tw:text-xs tw:text-secondary">
              Appended to the replies you send by email; chat replies never carry it. Order: your
              signature for the ticket's brand → this general one → the brand's default. Variables
              work everywhere: <code>{agent.name}</code> <code>{brand.name}</code>.
            </p>
            <div class="tw:rounded-lg tw:border tw:border-divider">
              <BaseRichTextEditor
                v-model="form.signatureHtml"
                :uploadImage="uploadSupportEditorImage"
                placeholder="Kind regards, …"
              />
            </div>
            <template v-if="myBrands.length > 1">
              <BaseText variant="overline" class="tw:mb-1 tw:mt-4 tw:block">Per brand</BaseText>
              <p class="tw:mb-3 tw:text-xs tw:text-secondary">
                You serve more than one brand — sign differently for each. Leave one empty to fall
                back to the general signature above.
              </p>
              <div class="tw:flex tw:flex-col tw:gap-3">
                <div v-for="x in myBrands" :key="x.brand.id">
                  <div class="tw:mb-1 tw:flex tw:items-center tw:gap-1.5 tw:text-sm tw:font-medium">
                    <span
                      class="tw:inline-block tw:h-2 tw:w-2 tw:rounded-full"
                      :style="{ background: x.brand.accentColor || '#1f6feb' }"
                    />
                    {{ x.brand.name }}
                  </div>
                  <div class="tw:rounded-lg tw:border tw:border-divider">
                    <BaseRichTextEditor
                      v-model="brandSignatures[x.brand.id]"
                      :uploadImage="uploadSupportEditorImage"
                      :placeholder="`Signature when replying as ${x.brand.name}…`"
                    />
                  </div>
                </div>
              </div>
            </template>
          </BaseCard>

          <BaseCard>
            <BaseText variant="overline" class="tw:mb-3 tw:block">Notifications</BaseText>
            <div class="tw:flex tw:flex-col tw:gap-2">
              <BaseCheckbox
                v-for="t in TOGGLES"
                :key="t.key"
                v-model="form.notificationPrefs[t.key]"
              >
                {{ t.label }}
              </BaseCheckbox>
            </div>
            <BaseField label="Email cadence" class="tw:mt-3">
              <BaseSelect
                v-model="form.notifyMode"
                :options="NOTIFY_MODES"
                optionLabel="name"
                optionValue="id"
                required
              />
            </BaseField>
          </BaseCard>
        </template>
      </div>
    </div>
  </div>
</template>
