<script setup>
import { useImpersonate } from '@/composables/useImpersonate.js'

const { companyUsers } = useImpersonate()

const startDialog = ref(false)
const selectedUser = ref(null)

function onSelect(user) {
  selectedUser.value = user
  startDialog.value = true
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-2">
    <ImpersonateListItem
      v-for="user in companyUsers"
      :key="user.id"
      :user="user"
      @select="onSelect"
    />
  </div>

  <ImpersonateStartDialog v-model="startDialog" :user="selectedUser" />
</template>
