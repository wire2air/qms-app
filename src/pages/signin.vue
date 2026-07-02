<script setup>
import LoginForm from '@/components/auth/LoginForm.vue'
import WorkspacePicker from '@/components/auth/WorkspacePicker.vue'
import { currentSubdomain } from '@/utils/tenant'
import { IconShieldCheck, IconFileText, IconClipboardCheck, IconChartDots } from '@tabler/icons-vue'

defineOptions({
  name: 'LoginPage',
})

// Subdomain tenancy splits sign-in in two (the Zendesk model):
//  • tenant host (acme.qability.com) → the real credential form, which sets the
//    session cookie on the right host.
//  • apex / reserved host (no tenant) → a workspace picker that routes the user
//    to their tenant's own /signin.
const onTenant = computed(() => currentSubdomain() !== null)

const features = [
  { icon: IconFileText, title: 'Document Control', desc: 'Versioned, audited, always current' },
  { icon: IconClipboardCheck, title: 'Audit Management', desc: 'Plan, track and close findings' },
  { icon: IconChartDots, title: 'Compliance Tracking', desc: 'Real-time status across standards' },
]
</script>

<template>
  <div class="login-page">
    <div class="login-container">
      <!-- Left side - Branding -->
      <div class="login-branding">
        <!-- decorative depth layers -->
        <div class="brand-grid" aria-hidden="true"></div>
        <div class="brand-orb brand-orb--one" aria-hidden="true"></div>
        <div class="brand-orb brand-orb--two" aria-hidden="true"></div>

        <div class="branding-content">
          <div class="brand-logo">
            <IconShieldCheck :size="30" class="tw:text-white" :stroke="2" />
          </div>

          <h1 class="branding-title">QMS</h1>
          <p class="branding-subtitle">Quality Management System</p>

          <div class="branding-features">
            <div v-for="feature in features" :key="feature.title" class="feature-card">
              <div class="feature-icon">
                <component :is="feature.icon" :size="20" class="tw:text-white" :stroke="2" />
              </div>
              <div>
                <div class="feature-title">{{ feature.title }}</div>
                <div class="feature-desc">{{ feature.desc }}</div>
              </div>
            </div>
          </div>

          <div class="brand-footer">
            <div class="brand-dots" aria-hidden="true">
              <span></span><span></span><span></span>
            </div>
            Trusted by quality teams to stay audit-ready, every day.
          </div>
        </div>
      </div>

      <!-- Right side - tenant credential form, or apex workspace picker -->
      <div class="login-form-section">
        <!-- compact brand mark for mobile, where the left panel is hidden -->
        <div class="mobile-brand">
          <div class="mobile-brand-logo">
            <IconShieldCheck :size="22" class="tw:text-white" :stroke="2" />
          </div>
          <span class="mobile-brand-name">QMS</span>
        </div>

        <div class="form-wrap">
          <div class="form-card">
            <LoginForm v-if="onTenant" mode="signin" />
            <WorkspacePicker v-else />
          </div>

          <div class="form-footer">© 2026 Quality Management System. All rights reserved.</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.login-page {
  min-height: 100vh;
  background-color: var(--sidebar);
}

.login-container {
  display: flex;
  min-height: 100vh;
}

/* ---------- Left brand panel ---------- */
.login-branding {
  position: relative;
  flex: 1.1;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 56px;
  color: white;
  isolation: isolate;
  background:
    radial-gradient(125% 125% at 0% 0%, #2f7bf6 0%, transparent 55%),
    linear-gradient(155deg, #1457c9 0%, #0f47a8 45%, #0a306f 100%);

  @media (max-width: 900px) {
    display: none;
  }
}

/* faint blueprint grid for texture */
.brand-grid {
  position: absolute;
  inset: 0;
  z-index: -1;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: radial-gradient(120% 100% at 30% 20%, black 30%, transparent 80%);
}

/* soft glowing orbs for depth */
.brand-orb {
  position: absolute;
  z-index: -1;
  border-radius: 50%;
  filter: blur(70px);
  opacity: 0.55;
}
.brand-orb--one {
  width: 460px;
  height: 460px;
  top: -160px;
  right: -120px;
  background: radial-gradient(circle, #5b9bff 0%, transparent 70%);
}
.brand-orb--two {
  width: 360px;
  height: 360px;
  bottom: -140px;
  left: -100px;
  background: radial-gradient(circle, #1e3a8a 0%, transparent 70%);
  opacity: 0.7;
}

.branding-content {
  position: relative;
  width: 100%;
  max-width: 420px;
}

.brand-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  border-radius: 16px;
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.06));
  border: 1px solid rgba(255, 255, 255, 0.22);
  box-shadow:
    0 10px 30px rgba(8, 30, 80, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.35);
  backdrop-filter: blur(8px);
}

.branding-title {
  font-size: 3rem;
  font-weight: 700;
  line-height: 1;
  margin: 26px 0 10px;
  letter-spacing: -0.025em;
}

.branding-subtitle {
  font-size: 1.05rem;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.78);
  margin-bottom: 44px;
}

.branding-features {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.feature-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(6px);
  transition:
    transform 0.2s ease,
    background 0.2s ease,
    border-color 0.2s ease;
}
.feature-card:hover {
  transform: translateX(4px);
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.25);
}

.feature-icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.feature-title {
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.2;
}
.feature-desc {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.65);
  margin-top: 2px;
}

.brand-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 48px;
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.6);
}
.brand-dots {
  display: inline-flex;
  gap: 4px;
}
.brand-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.45);
}
.brand-dots span:nth-child(2) {
  background: rgba(255, 255, 255, 0.7);
}
.brand-dots span:nth-child(3) {
  background: rgba(255, 255, 255, 0.95);
}

/* ---------- Right form panel ---------- */
.login-form-section {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background-color: var(--main);
}

.mobile-brand {
  display: none;
  align-items: center;
  gap: 10px;
  margin-bottom: 32px;

  @media (max-width: 900px) {
    display: flex;
  }
}
.mobile-brand-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 11px;
  background: linear-gradient(160deg, var(--primary), #0a306f);
}
.mobile-brand-name {
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: -0.025em;
  color: var(--on-main);
}

.form-wrap {
  width: 100%;
  max-width: 460px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* Elevated card sits on the subtle grey panel for clear enterprise depth. */
.form-card {
  width: 100%;
  padding: 40px 38px;
  background-color: var(--sidebar);
  border: 1px solid var(--divider);
  border-radius: 18px;
  box-shadow:
    0 1px 2px rgba(16, 24, 40, 0.04),
    0 12px 32px rgba(16, 24, 40, 0.06);

  @media (max-width: 480px) {
    padding: 28px 22px;
  }
}

.form-footer {
  font-size: 0.72rem;
  color: var(--secondary);
  text-align: center;
  margin-top: 24px;
}

a {
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
}
</style>
