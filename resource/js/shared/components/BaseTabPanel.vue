<script setup>
/**
 * BaseTabPanel — the content region for one BaseTabs tab. Must be a descendant
 * of <BaseTabs>; it reads the active id + id helpers from the tabs context and
 * renders role="tabpanel" wired to its tab via aria-labelledby.
 *
 * By default the panel is lazy: its content is only mounted while active
 * (matching the existing `v-if="activeTab === …"` usage — important for heavy
 * tabs like tables/editors). Pass `keepAlive` to keep it mounted and toggle
 * visibility with v-show instead (preserves scroll/input state).
 */
const props = defineProps({
  value: { type: [String, Number], required: true },
  keepAlive: { type: Boolean, default: false },
})

const tabs = inject('baseTabs', null)
if (import.meta.env.DEV && !tabs) {
  console.warn('[BaseTabPanel] must be used inside <BaseTabs>.')
}

const active = computed(() => tabs && tabs.activeValue.value === props.value)
const panelId = computed(() => (tabs ? tabs.panelId(props.value) : undefined))
const labelledBy = computed(() => (tabs ? tabs.tabId(props.value) : undefined))
</script>

<template>
  <div
    v-if="keepAlive || active"
    v-show="!keepAlive || active"
    :id="panelId"
    role="tabpanel"
    :aria-labelledby="labelledBy"
    :tabindex="0"
    class="tw:focus-visible:outline-none"
  >
    <slot />
  </div>
</template>
