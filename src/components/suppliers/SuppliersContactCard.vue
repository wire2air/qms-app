<script setup>
import { IconMail, IconPlus, IconTrash, IconStar, IconStarFilled } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'

const props = defineProps({
  supplierId: { type: String, required: true },
  canUpdate: { type: Boolean, default: false },
})

const toast = useToast()

const contacts = useLiveQueryWithDeps(
  [() => props.supplierId],
  async (db, [supplierId]) =>
    db.SupplierContact.where('supplierId', supplierId).orderBy('createdAt').exec(),
  { initial: [] },
)

// Locations for the optional "tagged to location" select.
const locations = useLiveQueryWithDeps(
  [() => props.supplierId],
  async (db, [supplierId]) =>
    db.SupplierLocation.where('supplierId', supplierId).orderBy('displayOrder').exec(),
  { initial: [] },
)
const locationItems = computed(() =>
  locations.value.map((l) => ({ id: l.id, name: l.name || locationLabel(l) })),
)
function locationLabel(l) {
  return [l.city, l.country].filter(Boolean).join(', ') || 'Location'
}

const draft = ref(null)
function addContact() {
  if (draft.value) return
  draft.value = {
    name: '',
    jobTitle: '',
    email: '',
    phoneNumber: '',
    supplierLocationId: null,
    inviteAsUser: false,
  }
}
function cancelDraft() {
  draft.value = null
}

const saveDraft = useLiveMutation(async (db) => {
  const isFirst = contacts.value.length === 0
  const contact = db.SupplierContact.create({
    supplierId: props.supplierId,
    name: draft.value.name,
    jobTitle: draft.value.jobTitle,
    email: draft.value.email,
    phoneNumber: draft.value.phoneNumber,
    supplierLocationId: draft.value.supplierLocationId || null,
    isPrimary: isFirst,
  })
  await contact.save()
  draft.value = null
  return contact
})

const savingDraft = ref(false)
// Save the contact, and — when "invite as portal user" is ticked — also create
// + invite a supplier user (kind EXTERNAL_SUPPLIER) so they can actually log in
// and be assigned work. Reuses the existing supplier-user invite endpoint.
async function onSaveDraft() {
  if (savingDraft.value) return
  const name = (draft.value.name || '').trim()
  const email = (draft.value.email || '').trim()
  const invite = draft.value.inviteAsUser && name && email
    ? { name, email, jobTitle: (draft.value.jobTitle || '').trim() }
    : null
  savingDraft.value = true
  try {
    await saveDraft()
    if (invite) {
      const [firstName, ...rest] = invite.name.split(/\s+/)
      await post(`/v1/services/suppliers/${props.supplierId}/users`, {
        firstName,
        lastName: rest.join(' '),
        email: invite.email,
        jobTitle: invite.jobTitle,
      })
      toast.success('Contact added and portal-user invite sent.')
    }
  } catch (e) {
    toast.error(e?.message || 'Contact saved, but the portal-user invite failed.')
  } finally {
    savingDraft.value = false
  }
}

// Existing contacts edit inline; persist on blur / change.
async function saveContact(contact) {
  await contact.save()
}

async function removeContact(contact) {
  await contact.delete()
}

async function setPrimary(contact) {
  for (const c of contacts.value) {
    if (c.isPrimary && c.id !== contact.id) {
      c.isPrimary = false
      await c.save()
    }
  }
  contact.isPrimary = true
  await contact.save()
}
</script>

<template>
  <div class="tw:bg-sidebar tw:rounded-xl tw:shadow-sm tw:border tw:border-divider tw:overflow-hidden">
    <div
      class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:justify-between"
    >
      <div class="tw:flex tw:items-center tw:gap-3">
        <div class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-gray-100 tw:flex tw:items-center tw:justify-center">
          <IconMail :size="20" class="tw:text-secondary" />
        </div>
        <h3 class="tw:text-lg tw:font-bold tw:text-on-main">Contacts</h3>
      </div>
      <BaseButton v-if="canUpdate && !draft" variant="text-link" size="sm" @click="addContact">
        <IconPlus :size="14" />
        Add Contact
      </BaseButton>
    </div>
    <div class="tw:p-6">
      <div v-if="contacts.length || draft" class="tw:space-y-4">
        <div
          v-for="contact in contacts"
          :key="contact.id"
          class="tw:flex tw:flex-col tw:gap-3 tw:p-4 tw:border tw:border-divider tw:rounded-lg"
        >
          <div class="tw:flex tw:items-center tw:justify-between">
            <div class="tw:flex tw:items-center tw:gap-2">
              <button
                class="tw:p-0.5 tw:rounded tw:transition-colors"
                :class="contact.isPrimary ? 'tw:text-amber-500' : 'tw:text-secondary tw:hover:text-amber-500'"
                :title="contact.isPrimary ? 'Primary' : 'Set as primary'"
                @click="!contact.isPrimary && canUpdate && setPrimary(contact)"
              >
                <IconStarFilled v-if="contact.isPrimary" :size="16" />
                <IconStar v-else :size="16" />
              </button>
              <span class="tw:text-xs tw:font-bold tw:text-secondary tw:uppercase tw:tracking-wide">
                {{ contact.isPrimary ? 'Primary' : 'Contact' }}
              </span>
            </div>
            <button
              v-if="canUpdate && contacts.length > 1"
              class="tw:p-1 tw:rounded tw:text-red-400 tw:hover:text-red-600 tw:transition-colors"
              @click="removeContact(contact)"
            >
              <IconTrash :size="14" />
            </button>
          </div>
          <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3">
            <div>
              <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">Name</label>
              <BaseTextInput v-if="canUpdate" v-model="contact.name" placeholder="Full name" @blur="saveContact(contact)" />
              <span v-else class="tw:text-sm tw:font-medium tw:text-on-main">{{ contact.name || '—' }}</span>
            </div>
            <div>
              <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">Job Title</label>
              <BaseTextInput v-if="canUpdate" v-model="contact.jobTitle" placeholder="e.g. Quality Manager" @blur="saveContact(contact)" />
              <span v-else class="tw:text-sm tw:text-on-main">{{ contact.jobTitle || '—' }}</span>
            </div>
            <div>
              <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">Email</label>
              <BaseTextInput v-if="canUpdate" v-model="contact.email" placeholder="email@supplier.com" @blur="saveContact(contact)" />
              <a v-else-if="contact.email" :href="`mailto:${contact.email}`" class="tw:text-primary tw:font-medium tw:text-sm tw:hover:underline">{{ contact.email }}</a>
              <span v-else class="tw:text-sm tw:text-secondary">—</span>
            </div>
            <div>
              <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">Phone</label>
              <BaseTextInput v-if="canUpdate" v-model="contact.phoneNumber" placeholder="+1 (555) 000-0000" @blur="saveContact(contact)" />
              <span v-else class="tw:text-sm tw:font-medium tw:text-on-main">{{ contact.phoneNumber || '—' }}</span>
            </div>
            <div v-if="locationItems.length" class="tw:md:col-span-2">
              <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">Location (optional)</label>
              <BaseInlineSelect
                v-if="canUpdate"
                v-model="contact.supplierLocationId"
                :items="locationItems"
                nullLabel="No location"
                placeholder="No location"
                @update:modelValue="saveContact(contact)"
              />
              <span v-else class="tw:text-sm tw:text-on-main">
                {{ locationItems.find((l) => l.id === contact.supplierLocationId)?.name || '—' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Draft new contact -->
        <div
          v-if="draft"
          class="tw:flex tw:flex-col tw:gap-3 tw:p-4 tw:border tw:border-primary/40 tw:rounded-lg tw:bg-primary/5"
        >
          <div class="tw:flex tw:items-center tw:justify-between">
            <span class="tw:text-xs tw:font-bold tw:text-secondary tw:uppercase tw:tracking-wide">New Contact</span>
            <button class="tw:p-1 tw:rounded tw:text-secondary tw:hover:text-red-500" @click="cancelDraft">
              <IconTrash :size="14" />
            </button>
          </div>
          <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3">
            <div>
              <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">Name</label>
              <BaseTextInput v-model="draft.name" placeholder="Full name" />
            </div>
            <div>
              <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">Job Title</label>
              <BaseTextInput v-model="draft.jobTitle" placeholder="e.g. Quality Manager" />
            </div>
            <div>
              <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">Email</label>
              <BaseTextInput v-model="draft.email" placeholder="email@supplier.com" />
            </div>
            <div>
              <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">Phone</label>
              <BaseTextInput v-model="draft.phoneNumber" placeholder="+1 (555) 000-0000" />
            </div>
            <div v-if="locationItems.length" class="tw:md:col-span-2">
              <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">Location (optional)</label>
              <BaseInlineSelect v-model="draft.supplierLocationId" :items="locationItems" nullLabel="No location" placeholder="No location" />
            </div>
          </div>
          <label
            class="tw:flex tw:items-start tw:gap-2 tw:text-sm tw:cursor-pointer"
            :class="!draft.name || !draft.email ? 'tw:opacity-50' : ''"
          >
            <input
              v-model="draft.inviteAsUser"
              type="checkbox"
              class="tw:mt-0.5"
              :disabled="!draft.name || !draft.email"
            />
            <span>
              Also invite as <strong>portal user</strong>
              <span class="tw:text-xs tw:text-secondary tw:block">
                Creates a supplier login + sends an invite, so they can respond and be assigned
                CAPAs/NCs/asset requests. Needs a name + email.
              </span>
            </span>
          </label>
          <div class="tw:flex tw:justify-end">
            <BaseButton size="sm" :loading="savingDraft" :disabled="!draft.name && !draft.email" @click="onSaveDraft">
              {{ draft.inviteAsUser ? 'Save & Invite' : 'Save Contact' }}
            </BaseButton>
          </div>
        </div>
      </div>
      <BaseEmptyState v-else :icon="IconMail" title="No contacts yet." />
    </div>
  </div>
</template>
