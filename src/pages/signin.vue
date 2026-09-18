<script setup>
import LoginForm from '@/components/auth/LoginForm.vue'
import WorkspacePicker from '@/components/auth/WorkspacePicker.vue'
import { currentSubdomain } from '@/utils/tenant'
import { SIGNOUT_REASON_KEY } from '@/utils/currentSession.js'
import { IconFileText, IconClipboardCheck, IconChartDots } from '@tabler/icons-vue'

defineOptions({
  name: 'LoginPage',
})

// Subdomain tenancy splits sign-in in two (the Zendesk model):
//  • tenant host (acme.qability.com) → the real credential form, which sets the
//    session cookie on the right host.
//  • apex / reserved host (no tenant) → a workspace picker that routes the user
//    to their tenant's own /signin.
const onTenant = computed(() => currentSubdomain() !== null)

// An automatic sign-out has to say so. Landing on a login screen with no
// explanation reads as the app having crashed, not as the company's idle
// timeout doing its job (2026-08-30).
const route = useRoute()
const REASONS = { inactivity: 'You were signed out because of inactivity.' }

// The query param is the happy path; the stashed copy covers the case where a
// racing 401 redirect replaced the URL with a bare /signin. Read once and
// clear, so a later manual visit to /signin is not still explaining itself.
const stashedReason = (() => {
  try {
    const v = sessionStorage.getItem(SIGNOUT_REASON_KEY)
    if (v) sessionStorage.removeItem(SIGNOUT_REASON_KEY)
    return v
  } catch {
    return null
  }
})()

const signedOutReason = computed(() => REASONS[route.query.reason] ?? REASONS[stashedReason] ?? null)

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
          <!-- tone="light": this panel is dark in BOTH themes. -->
          <BrandLogo tone="mono" class="branding-logo" />
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
            <div class="brand-dots" aria-hidden="true"><span></span><span></span><span></span></div>
            Trusted by quality teams to stay audit-ready, every day.
          </div>
        </div>
      </div>

      <!-- Right side - tenant credential form, or apex workspace picker -->
      <div class="login-form-section">
        <!-- compact brand mark for mobile, where the left panel is hidden -->
        <div class="mobile-brand">
          <!-- The form side is light in light mode, so tone follows the theme
               here — unlike the always-dark branding panel opposite. -->
          <BrandLogo class="mobile-brand-logo" />
        </div>

        <div class="form-wrap">
          <div class="form-card">
            <div
              v-if="signedOutReason"
              class="tw:mb-4 tw:rounded-lg tw:border tw:border-amber-200 tw:bg-amber-50 tw:px-3 tw:py-2 tw:text-sm tw:text-amber-800"
              role="status"
            >
              {{ signedOutReason }}
            </div>
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

.branding-logo {
  height: 52px;
  width: auto;
  margin-bottom: 8px;
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
  height: 34px;
  width: auto;
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
