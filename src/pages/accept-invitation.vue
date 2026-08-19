<script setup>
import AcceptInvitationForm from '@/components/auth/AcceptInvitationForm.vue'
import { IconCircleCheck } from '@tabler/icons-vue'

defineOptions({
  name: 'AcceptInvitationPage',
})
</script>

<template>
  <div class="tw:min-h-screen tw:bg-main tw:flex">
    <!-- Left side - Branding -->
    <div
      class="tw:flex-1 tw:bg-linear-to-br tw:from-primary tw:to-primary tw:hidden tw:md:flex tw:items-center tw:justify-center tw:p-12 tw:text-white"
    >
      <div class="tw:max-w-sm">
        <BrandLogo tone="mono" class="tw:h-12 tw:mb-4" />
        <p class="tw:text-lg tw:opacity-90 tw:mb-12">Quality Management System</p>
        <div class="tw:flex tw:flex-col tw:gap-4">
          <div class="tw:flex tw:items-center tw:gap-2">
            <IconCircleCheck :size="20" class="tw:text-white" />
            <span>Document Control</span>
          </div>
          <div class="tw:flex tw:items-center tw:gap-2">
            <IconCircleCheck :size="20" class="tw:text-white" />
            <span>Audit Management</span>
          </div>
          <div class="tw:flex tw:items-center tw:gap-2">
            <IconCircleCheck :size="20" class="tw:text-white" />
            <span>Compliance Tracking</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Right side - Accept Invitation Form -->
    <div
      class="tw:flex-1 tw:min-h-screen tw:bg-sidebar tw:flex tw:flex-col tw:items-center tw:justify-center tw:p-8"
    >
      <AcceptInvitationForm />

      <div class="tw:text-xs tw:text-secondary tw:text-center tw:mt-6">
        © 2026 Quality Management System. All rights reserved.
      </div>
    </div>
  </div>
</template>
