<script setup>
const props = defineProps({
  user: {
    type: Object,
    required: true,
  },
})
const emit = defineEmits(['select'])

const userForAvatar = computed(() => ({
  ...props.user,
  fullName: `${props.user.firstName} ${props.user.lastName}`,
}))

// Impersonation now requires a reason + mode captured in a dialog before the
// cross-subdomain handoff — the parent owns that dialog.
function onClick() {
  emit('select', props.user)
}
</script>

<template>
  <BaseClickableRow
    class="tw:block tw:p-3 tw:hover:bg-main-hover tw:transition-colors tw:rounded-xl tw:border tw:border-divider"
    :aria-label="`Impersonate ${user.firstName} ${user.lastName}`"
    @click="onClick"
  >
    <div class="tw:flex tw:items-center tw:gap-3">
      <UserAvatar :user="userForAvatar" class="tw:size-14" />

      <div class="tw:flex-1 tw:min-w-0">
        <div class="tw:text-lg tw:font-bold tw:text-on-main tw:flex tw:items-center tw:gap-2">
          {{ user.firstName }} {{ user.lastName }}
          <span
            v-if="user.isOwner"
            class="tw:text-xs tw:font-semibold tw:bg-primary/10 tw:text-primary tw:px-2 tw:py-0.5 tw:rounded-full"
          >
            Owner
          </span>
        </div>
        <div class="tw:text-sm tw:text-secondary">{{ user.email }}</div>
        <div v-if="user.jobTitle" class="tw:text-xs tw:text-secondary tw:mt-1">
          {{ user.jobTitle }}
        </div>
      </div>
    </div>
  </BaseClickableRow>
</template>
