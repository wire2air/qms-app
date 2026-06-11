<script setup>
import { IconArrowRight, IconBuilding, IconMail } from '@tabler/icons-vue'
import { rootDomain, tenantOrigin } from '@/utils/tenant'
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.

// Apex/marketing-host login: there's no tenant in the host, so we can't show a
// credential form (the session cookie would land on the wrong host). Instead we
// ask which workspace, then send the user to that tenant's own /signin — where
// the real password + Google/Microsoft form lives. Mirrors the Zendesk
// "yoursubdomain.zendesk.com" entry.

const toast = useToast()
const subdomain = ref('')
const loading = ref(false)

// "Forgot your workspace?" — collect an email and have the backend email the
// user the sign-in link for every workspace their address belongs to. The API
// always returns a generic success (no email enumeration), so we show the same
// confirmation regardless of whether any workspaces matched.
const forgotOpen = ref(false)
const forgotEmail = ref('')
const forgotLoading = ref(false)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function openForgot() {
  forgotEmail.value = ''
  forgotOpen.value = true
}

async function sendWorkspaceLinks() {
  const email = forgotEmail.value.trim().toLowerCase()
  if (!EMAIL_RE.test(email)) {
    toast.error('Enter a valid email address')
    return
  }

  forgotLoading.value = true
  try {
    // The API intentionally returns one generic response whether or not the
    // email matched any workspace (no enumeration). Always show the same
    // confirmation and close — never branch on the outcome.
    await post('/v1/auth/workspaces/forgot', { email }, { showError: false })

    toast.success(
      'If any workspaces are associated with that email, you will receive an email with sign-in links shortly.',
    )
    forgotOpen.value = false
  } catch (err) {
    // Surface the server's field-level validation message (e.g. invalid email)
    // when present; otherwise fall back to a generic failure.
    const fieldError = err?.errors?.email?.[0]
    toast.error(fieldError || err?.message || 'Something went wrong. Please try again.')
  } finally {
    forgotLoading.value = false
  }
}

const domainSuffix = computed(() => `.${rootDomain()}`)

function cleanInput(value) {
  // DNS label charset only; the backend enforces the same at signup.
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
}

function goToWorkspace() {
  const code = cleanInput(subdomain.value)
  if (!code) {
    toast.error('Enter your workspace name')
    return
  }
  // Full cross-origin navigation to the tenant's own sign-in page. Keep the
  // spinner up — the page is being torn down, so we never reset `loading`.
  loading.value = true
  window.location.assign(`${tenantOrigin(code)}/signin`)
}
</script>

<template>
  <div class="tw:w-full">
    <div class="tw:pb-1">
      <div class="tw:text-2xl tw:font-bold tw:text-on-main tw:tracking-tight">Sign in to QMS</div>
      <div class="tw:text-sm tw:text-secondary tw:mt-1.5">
        Enter your workspace to continue to its sign-in page.
      </div>
    </div>

    <div class="tw:pt-7 tw:flex tw:flex-col tw:gap-4">
      <div class="tw:flex tw:flex-col tw:gap-1.5">
        <label class="tw:text-sm tw:font-semibold tw:text-on-main">Workspace</label>

        <!-- Single unified control: org icon, slug input, and the domain suffix
             all share one border. The suffix is quiet inline text, not a box. -->
        <div class="ws-field tw:group">
          <span
            class="tw:pl-3.5 tw:text-secondary tw:group-focus-within:text-primary tw:transition-colors"
          >
            <IconBuilding :size="18" :stroke="1.75" />
          </span>
          <input
            v-model="subdomain"
            type="text"
            autocapitalize="none"
            autocomplete="off"
            spellcheck="false"
            placeholder="acme-industries"
            class="tw:flex-1 tw:min-w-0 tw:appearance-none tw:bg-transparent tw:border-0 tw:px-2.5 tw:text-on-main tw:font-medium tw:outline-none tw:ring-0 tw:shadow-none tw:focus:outline-none tw:focus:ring-0 tw:focus:border-0 tw:focus:shadow-none tw:placeholder:text-secondary/55 tw:placeholder:font-normal"
            @keyup.enter="goToWorkspace"
          />
          <span
            class="tw:pr-3.5 tw:text-secondary tw:text-sm tw:font-medium tw:whitespace-nowrap tw:select-none"
          >
            {{ domainSuffix }}
          </span>
        </div>

        <p class="tw:text-xs tw:text-secondary tw:mt-0.5">Enter your company workspace name.</p>
      </div>

      <button class="ws-submit tw:group" :disabled="loading" @click="goToWorkspace">
        <span
          v-if="loading"
          class="tw:size-4 tw:animate-spin tw:rounded-full tw:border-2 tw:border-white tw:border-t-transparent tw:inline-block"
        ></span>
        <template v-else>
          <span>Continue</span>
          <IconArrowRight
            :size="16"
            class="tw:transition-transform tw:group-hover:translate-x-0.5"
          />
        </template>
      </button>

      <div class="tw:text-center">
        <button
          class="tw:text-sm tw:font-medium tw:text-primary tw:cursor-pointer tw:bg-transparent tw:border-0 tw:p-0 tw:hover:underline"
          @click="openForgot"
        >
          Forgot your workspace?
        </button>
      </div>
    </div>

    <!-- Forgot-workspace dialog: enter your email to receive your workspaces'
         sign-in links. Submit wiring is added in a follow-up. -->
    <BaseDialog v-model="forgotOpen" title="Find your workspace" maxWidth="sm">
      <div class="tw:flex tw:flex-col tw:gap-4">
        <p class="tw:text-sm tw:text-secondary tw:leading-relaxed">
          Enter the email you sign in with and we'll send you a link to each of your workspaces.
        </p>

        <div class="tw:flex tw:flex-col tw:gap-1.5">
          <label class="tw:text-sm tw:font-semibold tw:text-on-main">Email</label>
          <BaseTextInput
            v-model="forgotEmail"
            type="email"
            placeholder="you@company.com"
            autocomplete="email"
            @keyup.enter="sendWorkspaceLinks"
          >
            <template #icon>
              <IconMail :size="16" class="tw:text-secondary" />
            </template>
          </BaseTextInput>
        </div>
      </div>

      <template #footer="{ close }">
        <button
          class="tw:text-sm tw:font-medium tw:text-secondary tw:cursor-pointer tw:bg-transparent tw:border-0 tw:px-3 tw:py-2 tw:rounded-lg tw:hover:bg-main-hover"
          :disabled="forgotLoading"
          @click="close"
        >
          Cancel
        </button>
        <button
          class="tw:inline-flex tw:items-center tw:gap-2 tw:text-sm tw:font-medium tw:text-white tw:cursor-pointer tw:bg-primary tw:border-0 tw:px-4 tw:py-2 tw:rounded-lg tw:hover:opacity-90 disabled:tw:opacity-60 disabled:tw:cursor-not-allowed"
          :disabled="forgotLoading"
          @click="sendWorkspaceLinks"
        >
          <span
            v-if="forgotLoading"
            class="tw:size-4 tw:animate-spin tw:rounded-full tw:border-2 tw:border-white tw:border-t-transparent tw:inline-block"
          ></span>
          {{ forgotLoading ? 'Sending...' : 'Send link' }}
        </button>
      </template>
    </BaseDialog>

    <div class="tw:pt-7">
      <hr class="tw:border-divider" />
      <div class="tw:text-sm tw:text-secondary tw:text-center tw:mt-4">
        Don't have a workspace?
        <a href="/signup" class="tw:text-primary! tw:font-semibold">Create one</a>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Single unified input control — one border wraps icon + field + suffix. */
.ws-field {
  display: flex;
  align-items: center;
  width: 100%;
  height: 52px;
  border: 1px solid var(--divider);
  border-radius: 12px;
  background-color: var(--main);
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background-color 0.18s ease;
}
.ws-field:focus-within {
  border-color: var(--primary);
  background-color: var(--sidebar);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary) 12%, transparent);
}

/* Premium submit button — subtle vertical gradient, hover lift, glow. */
.ws-submit {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 50px;
  padding: 0 16px;
  border: 0;
  border-radius: 12px;
  font-size: 0.9rem;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  background-image: linear-gradient(
    180deg,
    color-mix(in srgb, var(--primary) 88%, white) 0%,
    var(--primary) 100%
  );
  box-shadow: 0 4px 14px color-mix(in srgb, var(--primary) 22%, transparent);
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    filter 0.18s ease;
}
.ws-submit:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--primary) 28%, transparent);
  filter: brightness(1.04);
}
.ws-submit:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 3px 10px color-mix(in srgb, var(--primary) 22%, transparent);
}
.ws-submit:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

a {
  text-decoration: none;
}
a:hover {
  text-decoration: underline;
}
</style>
