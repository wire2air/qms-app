<script setup>
import ResetPasswordForm from '@/components/auth/ResetPasswordForm.vue'
import { IconShieldCheck, IconCircleCheck } from '@tabler/icons-vue'

defineOptions({
  name: 'ResetPasswordPage',
})
</script>

<template>
  <div class="login-page">
    <div class="login-container">
      <!-- Left side - Branding -->
      <div class="login-branding">
        <div class="branding-content">
          <IconShieldCheck :size="48" class="tw:text-white" />
          <h1 class="branding-title">QMS</h1>
          <p class="branding-subtitle">Quality Management System</p>
          <div class="branding-features">
            <div class="tw:flex tw:items-center tw:gap-2 tw:mb-4">
              <IconCircleCheck :size="20" class="tw:text-white" />
              <span>Document Control</span>
            </div>
            <div class="tw:flex tw:items-center tw:gap-2 tw:mb-4">
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

      <!-- Right side - Reset Password Form -->
      <div class="login-form-section tw:flex tw:flex-col tw:items-center tw:justify-center tw:p-8">
        <ResetPasswordForm />

        <div class="tw:text-xs tw:text-secondary tw:text-center tw:mt-6">
          © 2026 Quality Management System. All rights reserved.
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.login-page {
  min-height: 100vh;
  background-color: var(--main);
}

.login-container {
  display: flex;
  min-height: 100vh;
}

.login-branding {
  flex: 1;
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark, var(--primary)) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px;
  color: white;

  @media (max-width: 900px) {
    display: none;
  }
}

.branding-content {
  max-width: 400px;
}

.branding-title {
  font-size: 3rem;
  font-weight: 700;
  margin: 24px 0 8px;
  letter-spacing: -0.5px;
}

.branding-subtitle {
  font-size: 1.1rem;
  opacity: 0.9;
  margin-bottom: 48px;
}

.login-form-section {
  flex: 1;
  background-color: var(--sidebar);

  @media (max-width: 900px) {
    min-height: 100vh;
  }
}

.login-card {
  width: 100%;
  max-width: 420px;
  background-color: var(--card);
}

a {
  color: var(--primary);
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
}
</style>
