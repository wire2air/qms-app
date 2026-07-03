<script setup>
import { getCompanyPath } from '@/utils/routeHelpers'
import { IconCopy, IconCheck } from '@tabler/icons-vue'

const props = defineProps({ template: { type: Object, default: null } })
const open = defineModel({ type: Boolean, default: false })

const isModule = computed(() => !!props.template?.isModule)
const isActive = computed(() => props.template?.statusId === 'ACTIVE')

// Two distinct share modes:
//  - Module  → the internal create page (auth-gated). Signed-in users with
//    module access fill it and submit a Draft that can be Started / routed.
//  - Plain   → the public anonymous fill page (/form/:id). Anyone with the
//    link can submit; the entry lands in the generic Records list. Only works
//    once the template is ACTIVE (the public endpoint refuses inactive forms).
const shareUrl = computed(() => {
  const t = props.template
  if (!t) return ''
  if (isModule.value) {
    return t.internalName
      ? `${window.location.origin}${getCompanyPath(`/m/${t.internalName}/create`)}`
      : ''
  }
  return isActive.value ? `${window.location.origin}/form/${t.id}` : ''
})

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
      <template v-if="shareUrl">
        <div class="tw:flex tw:flex-col tw:gap-1.5">
          <label class="tw:text-sm tw:font-medium tw:text-on-main">
            {{ isModule ? 'Internal fill link' : 'Public fill link' }}
          </label>
          <div class="tw:flex tw:gap-2">
            <BaseTextInput :modelValue="shareUrl" readonly class="tw:flex-1" />
            <BaseButton variant="outline" @click="copy">
              <component :is="copied ? IconCheck : IconCopy" :size="16" class="tw:mr-1" />
              {{ copied ? 'Copied' : 'Copy' }}
            </BaseButton>
          </div>
        </div>

        <p v-if="isModule" class="tw:text-sm tw:text-secondary">
          Any signed-in user with access to this module can open the link, complete the form, and
          submit it — a new Draft record is created for them. To route it, open the record and use
          <strong>Start</strong>.
        </p>
        <p v-else class="tw:text-sm tw:text-secondary">
          Anyone with this link can submit the form — <strong>no sign-in required</strong>.
          Submissions are anonymous and appear in <strong>Records</strong>.
        </p>
      </template>

      <p v-else-if="isModule" class="tw:text-sm tw:text-secondary">
        This module is missing its internal name — re-open <strong>Promote to Module</strong> on the
        template's detail page.
      </p>
      <p v-else class="tw:text-sm tw:text-secondary">
        Activate this template first — only an <strong>Active</strong> form can be shared as a public
        link.
      </p>
    </div>
    <template #footer>
      <BaseButton variant="primary" @click="open = false">Done</BaseButton>
    </template>
  </BaseDialog>
</template>
