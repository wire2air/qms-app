<script setup>
import { IconArrowRight, IconBuilding } from '@tabler/icons-vue'
import { rootDomain, tenantOrigin } from '@/utils/tenant'

// Apex/marketing-host login: there's no tenant in the host, so we can't show a
// credential form (the session cookie would land on the wrong host). Instead we
// ask which workspace, then send the user to that tenant's own /signin — where
// the real password + Google/Microsoft form lives. Mirrors the Zendesk
// "yoursubdomain.zendesk.com" entry.

const toast = useToast()
const subdomain = ref('')
const showForgot = ref(false)
const loading = ref(false)

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
          <span class="tw:pl-3.5 tw:text-secondary tw:group-focus-within:text-primary tw:transition-colors">
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
          <IconArrowRight :size="16" class="tw:transition-transform tw:group-hover:translate-x-0.5" />
        </template>
      </button>

      <div class="tw:text-center">
        <button
          class="tw:text-sm tw:font-medium tw:text-primary tw:cursor-pointer tw:bg-transparent tw:border-0 tw:p-0 tw:hover:underline"
          @click="showForgot = !showForgot"
        >
          Forgot your workspace?
        </button>
        <p
          v-if="showForgot"
          class="tw:text-xs tw:text-secondary tw:mt-2 tw:leading-relaxed tw:rounded-lg tw:bg-main tw:border tw:border-divider tw:p-3 tw:text-left"
        >
          Your workspace URL was in your welcome email (e.g.
          <span class="tw:font-semibold tw:text-on-main">acme{{ domainSuffix }}</span
          >). If you can't find it, ask a workspace admin to share the link.
        </p>
      </div>
    </div>

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
  background-image: linear-gradient(180deg, color-mix(in srgb, var(--primary) 88%, white) 0%, var(--primary) 100%);
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
