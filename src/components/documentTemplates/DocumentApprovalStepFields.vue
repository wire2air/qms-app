<script setup>
/**
 * The four settings that make up one gate of a document template's approval
 * flow, edited in place (user request 2026-08-16).
 *
 * Opening the full workflow builder to set who signs and whether e-signature
 * is required is a lot of surface for four fields, and the builder wasn't even
 * reachable while CREATING a template — the companion workflow doesn't exist
 * until the template is saved. So these live on the template form itself, and
 * the builder is reserved for what actually needs it: adding a third gate,
 * reordering, task forms.
 *
 * Deliberately dumb: v-model on a plain object. The create form binds local
 * state that is materialised into a workflow on save; the detail page binds a
 * live WorkflowStep. Neither concern belongs here.
 *
 * Roles are OPTIONAL. An empty role list is not an incomplete step — it means
 * "anyone", and the submit dialog already reads it that way: a step with no
 * roles offers every active internal user to pick from. Requiring a role would
 * have forced a fake one onto small teams who just want to choose a person at
 * submit time.
 */
defineProps({
  label: { type: String, required: true },
  disabled: { type: Boolean, default: false },
})

const step = defineModel({ type: Object, required: true })

const RULES = [
  { id: 'ALL', hint: 'Everyone picked must approve' },
  { id: 'ANY', hint: 'The first approval advances' },
]

function set(patch) {
  step.value = { ...step.value, ...patch }
}
</script>

<template>
  <div class="tw:rounded-lg tw:border tw:border-divider tw:bg-main-hover/40 tw:p-3 tw:space-y-3">
    <p class="tw:text-sm tw:font-semibold tw:text-on-sidebar">{{ label }}</p>

    <BaseField label="Who signs?" optional hint="Leave empty to choose anyone at submit time.">
      <RoleSelectMenu
        :modelValue="step.roleIds ?? []"
        :multiple="true"
        :disabled="disabled"
        @update:modelValue="(v) => set({ roleIds: v })"
      />
    </BaseField>

    <div class="tw:flex tw:flex-wrap tw:items-end tw:gap-4">
      <!-- ALL/ANY only bites with more than one signer, so it sits next to the
           role picker that creates that situation. -->
      <div class="tw:space-y-1">
        <p class="tw:text-xs tw:font-medium tw:text-secondary">When several are picked</p>
        <div class="tw:flex tw:rounded-full tw:bg-main-hover tw:p-0.5">
          <button
            v-for="r in RULES"
            :key="r.id"
            type="button"
            :disabled="disabled"
            :title="r.hint"
            :aria-pressed="(step.approvalRule ?? 'ALL') === r.id"
            class="tw:px-2.5 tw:py-0.5 tw:rounded-full tw:text-xs tw:font-bold tw:transition-colors tw:cursor-pointer tw:disabled:cursor-not-allowed"
            :class="
              (step.approvalRule ?? 'ALL') === r.id
                ? 'tw:bg-primary tw:text-white'
                : 'tw:text-secondary tw:hover:text-primary'
            "
            @click="set({ approvalRule: r.id })"
          >
            {{ r.id }}
          </button>
        </div>
      </div>

      <div class="tw:space-y-1">
        <p class="tw:text-xs tw:font-medium tw:text-secondary">Due in (days)</p>
        <BaseTextInput
          :modelValue="step.slaDays"
          type="number"
          size="sm"
          min="1"
          placeholder="—"
          class="tw:w-24"
          :disabled="disabled"
          @update:modelValue="(v) => set({ slaDays: v === '' || v == null ? null : Number(v) })"
        />
      </div>

      <div class="tw:space-y-1">
        <p class="tw:text-xs tw:font-medium tw:text-secondary">E-signature</p>
        <BaseSwitch
          :modelValue="step.requireEsignature ?? true"
          :disabled="disabled"
          @update:modelValue="(v) => set({ requireEsignature: v })"
        />
      </div>
    </div>
  </div>
</template>
