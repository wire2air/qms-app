<script setup>
import { getCompanyPath } from '@/utils/routeHelpers'
import { IconCopy, IconCheck } from '@tabler/icons-vue'

const props = defineProps({ template: { type: Object, default: null } })
const open = defineModel({ type: Boolean, default: false })
const toast = useToast()

const isModule = computed(() => !!props.template?.isModule)
const isActive = computed(() => props.template?.statusId === 'ACTIVE')
const isPublished = computed(() => !!props.template?.isPublic && !!props.template?.publicToken)

// ── FORMS F-01: publishing is now an ACT, not a side effect of activating ────
//
// This dialog used to build the public URL client-side, from the template id,
// for any ACTIVE template:
//
//   return isActive.value ? `${origin}/form/${t.id}` : ''
//
// There was no server-side notion of "shared" at all — no column, no flag, no
// token. So the string this dialog composed was not the thing that granted
// access; ACTIVATION was, and the backend served the schema of any ACTIVE
// template in any tenant to anyone holding its UUID. Opening this dialog was
// documentation of an exposure that already existed, and never opening it
// prevented nothing.
//
// The link is now a server-minted share token that exists only while the form is
// published, so the dialog has to be able to publish and unpublish — otherwise
// the honest default (unpublished) would simply mean nobody can ever share a
// form again. That is the reason this control exists; it is not a feature added
// alongside the fix, it is the other half of it.
//
// Unpublishing DESTROYS the token. Republishing mints a different one. Both are
// enforced in the database (enforce_form_template_integrity), so "revoke" here
// means the old URL is dead permanently, not parked.
const shareUrl = computed(() => {
  const t = props.template
  if (!t) return ''
  if (isModule.value) {
    return t.internalName
      ? `${window.location.origin}${getCompanyPath(`/m/${t.internalName}/create`)}`
      : ''
  }
  return isPublished.value ? `${window.location.origin}/form/${t.publicToken}` : ''
})

const busy = ref(false)
async function setPublished(next) {
  if (!props.template || busy.value) return
  busy.value = true
  const previous = props.template.isPublic
  try {
    props.template.isPublic = next
    await props.template.save()
    toast.success(next ? 'Public link created' : 'Public link revoked')
  } catch (e) {
    props.template.isPublic = previous
    toast.error(e?.message || 'Failed to update the public link')
  } finally {
    busy.value = false
  }
}

const copied = ref(false)
async function copy() {
  if (!shareUrl.value) return
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 1500)
  } catch {
    // clipboard blocked — the field is selectable as a fallback
  }
}
</script>

<template>
  <BaseDialog v-model="open" title="Share form link">
    <div class="tw:flex tw:flex-col tw:gap-4">
      <!-- Modules: an internal, auth-gated create page. Unchanged — nothing
           anonymous is involved, so there is nothing to publish or revoke. -->
      <template v-if="isModule">
        <div v-if="shareUrl" class="tw:flex tw:flex-col tw:gap-1.5">
          <label class="tw:text-sm tw:font-medium tw:text-on-main">Internal fill link</label>
          <div class="tw:flex tw:gap-2">
            <BaseTextInput :modelValue="shareUrl" readonly class="tw:flex-1" />
            <BaseButton variant="outline" @click="copy">
              <component :is="copied ? IconCheck : IconCopy" :size="16" class="tw:mr-1" />
              {{ copied ? 'Copied' : 'Copy' }}
            </BaseButton>
          </div>
          <p class="tw:text-sm tw:text-secondary tw:mt-2">
            Any signed-in user with access to this module can open the link, complete the form, and
            submit it — a new Draft record is created for them. To route it, open the record and use
            <strong>Start</strong>.
          </p>
        </div>
        <p v-else class="tw:text-sm tw:text-secondary">
          This module is missing its internal name — re-open <strong>Promote to Module</strong> on
          the template's detail page.
        </p>
      </template>

      <!-- Plain forms: the public, anonymous fill page. -->
      <template v-else-if="!isActive">
        <p class="tw:text-sm tw:text-secondary">
          Activate this template first — only an <strong>Active</strong> form can be published as a
          public link.
        </p>
      </template>

      <template v-else-if="!isPublished">
        <p class="tw:text-sm tw:text-secondary">
          This form is <strong>not published</strong>. Publishing creates a public link that anyone
          can open and submit without signing in. You can revoke it at any time — and archiving the
          form revokes it automatically.
        </p>
        <div>
          <BaseButton variant="primary" :disabled="busy" @click="setPublished(true)">
            Publish public link
          </BaseButton>
        </div>
      </template>

      <template v-else>
        <div class="tw:flex tw:flex-col tw:gap-1.5">
          <label class="tw:text-sm tw:font-medium tw:text-on-main">Public fill link</label>
          <div class="tw:flex tw:gap-2">
            <BaseTextInput :modelValue="shareUrl" readonly class="tw:flex-1" />
            <BaseButton variant="outline" @click="copy">
              <component :is="copied ? IconCheck : IconCopy" :size="16" class="tw:mr-1" />
              {{ copied ? 'Copied' : 'Copy' }}
            </BaseButton>
          </div>
        </div>
        <p class="tw:text-sm tw:text-secondary">
          Anyone with this link can submit the form — <strong>no sign-in required</strong>.
          Submissions are anonymous and appear in <strong>Records</strong>.
        </p>
        <div>
          <BaseButton variant="outline" :disabled="busy" @click="setPublished(false)">
            Revoke public link
          </BaseButton>
          <p class="tw:text-xs tw:text-secondary tw:mt-1.5">
            Revoking stops this link working immediately and permanently. Publishing again creates a
            different link.
          </p>
        </div>
      </template>
    </div>
    <template #footer>
      <BaseButton variant="primary" @click="open = false">Done</BaseButton>
    </template>
  </BaseDialog>
</template>
