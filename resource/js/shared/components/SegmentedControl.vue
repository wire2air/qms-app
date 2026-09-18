<script setup>
/**
 * SegmentedControl — accessible single-choice toggle for short, mutually
 * exclusive option sets (severity, priority, yes/no, status). The labeled-text
 * sibling of BaseSwitcher (which is icon-only): same WAI-ARIA radiogroup
 * contract — role="radiogroup" + role="radio" buttons, aria-checked, roving
 * tabindex, Arrow/Home/End navigation — plus sizes, equal-width columns,
 * optional per-option icon, and a `nullable` mode for optional fields.
 *
 * Replaces hand-rolled `<BaseButton v-for>` toggle groups (rule #8 — those were
 * not a labeled radiogroup: no roles, no aria-checked, no keyboard). Drops into
 * a BaseField slot — spread the field payload to inherit id + aria wiring:
 *
 *   <BaseField label="Severity" required>
 *     <template #default="field">
 *       <SegmentedControl v-bind="field" v-model="form.severityId" :options="[
 *         { label: 'Minor', value: 'MINOR' },
 *         { label: 'Major', value: 'MAJOR' },
 *         { label: 'Critical', value: 'CRITICAL' },
 *       ]" />
 *     </template>
 *   </BaseField>
 *
 *   <!-- nullable: clicking the active option clears it (e.g. optional Priority) -->
 *   <SegmentedControl v-model="form.priorityId" :options="priorities" nullable
 *     ariaLabel="Priority" />
 *
 * Options may be strings or { label, value, icon?, disabled? } objects;
 * optionLabel/optionValue pick the display/value keys (mirrors BaseOptionGroup).
 * Icons are NOT auto-imported — pass imported @tabler/icons-vue components.
 */
defineOptions({ inheritAttrs: false })

const props = defineProps({
  // [string] or [{ label, value, icon?, disabled? }].
  options: { type: Array, required: true },
  optionLabel: { type: [String, Function], default: 'label' },
  optionValue: { type: [String, Function], default: 'value' },
  // Row height: sm (28px) | md (36px) | lg (40px).
  size: { type: String, default: 'md' },
  // Stretch options to equal-width columns filling the container width.
  equalWidth: { type: Boolean, default: true },
  // Clicking the already-active option clears the selection (optional fields).
  nullable: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  // Focusable but rejects changes (consistent with BaseOptionGroup).
  readonly: { type: Boolean, default: false },
  // Accessible name when not wrapped by a labeled BaseField.
  ariaLabel: { type: String, default: undefined },
})

const model = defineModel({ type: [String, Number, Boolean], default: null })

// `disabled` strips interaction + focus; `readonly` stays focusable but rejects
// changes. `blocked` gates mutation + the muted visual for both.
const blocked = computed(() => props.disabled || props.readonly)

const SIZE = {
  sm: 'tw:h-7 tw:text-xs tw:px-2.5 tw:gap-1',
  md: 'tw:h-9 tw:text-sm tw:px-3 tw:gap-1.5',
  lg: 'tw:h-10 tw:text-sm tw:px-4 tw:gap-2',
}
const sizeClass = computed(() => SIZE[props.size] || SIZE.md)

function valueOf(option) {
  if (option === null || typeof option !== 'object') return option
  if (typeof props.optionValue === 'function') return props.optionValue(option)
  return option[props.optionValue]
}
function labelOf(option) {
  if (option === null || typeof option !== 'object') return String(option)
  if (typeof props.optionLabel === 'function') return props.optionLabel(option)
  return option[props.optionLabel]
}
function iconOf(option) {
  return option && typeof option === 'object' ? option.icon : null
}
function isOptionDisabled(option) {
  return props.disabled || !!(option && typeof option === 'object' && option.disabled)
}
function isChecked(option) {
  return model.value === valueOf(option)
}

// Roving tabindex: the checked option is the tab stop; if nothing is checked,
// the first enabled option is — so the group is always keyboard-reachable.
const tabbableValue = computed(() => {
  if (model.value !== null && model.value !== undefined) return model.value
  const first = props.options.find((o) => !isOptionDisabled(o))
  return first !== undefined ? valueOf(first) : null
})

function select(option) {
  if (blocked.value || isOptionDisabled(option)) return
  const v = valueOf(option)
  model.value = props.nullable && model.value === v ? null : v
}

// Roving-tabindex focus management (mirrors BaseSwitcher / BaseTabs).
const btnEls = new Map()
function setBtn(value, el) {
  if (el) btnEls.set(value, el)
  else btnEls.delete(value)
}

function move(kind) {
  if (blocked.value) return
  const items = props.options.filter((o) => !isOptionDisabled(o))
  if (!items.length) return
  const curIdx = items.findIndex((o) => valueOf(o) === model.value)
  let next
  if (kind === 'home') next = items[0]
  else if (kind === 'end') next = items[items.length - 1]
  else {
    const delta = kind === 'next' ? 1 : -1
    const base = curIdx === -1 ? (delta === 1 ? -1 : 0) : curIdx
    next = items[(base + delta + items.length) % items.length]
  }
  if (!next) return
  model.value = valueOf(next)
  nextTick(() => btnEls.get(valueOf(next))?.focus())
}

function onKeydown(e) {
  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      e.preventDefault()
      move('next')
      break
    case 'ArrowLeft':
    case 'ArrowUp':
      e.preventDefault()
      move('prev')
      break
    case 'Home':
      e.preventDefault()
      move('home')
      break
    case 'End':
      e.preventDefault()
      move('end')
      break
  }
}
</script>

<template>
  <div
    v-bind="$attrs"
    role="radiogroup"
    :aria-label="ariaLabel"
    :aria-disabled="disabled || undefined"
    :aria-readonly="readonly || undefined"
    class="tw:items-center tw:gap-1 tw:rounded-lg tw:border tw:border-divider tw:bg-sidebar tw:p-1"
    :class="[equalWidth ? 'tw:flex tw:w-full' : 'tw:inline-flex', blocked ? 'tw:opacity-60' : '']"
    @keydown="onKeydown"
  >
    <button
      v-for="option in options"
      :key="valueOf(option)"
      :ref="(el) => setBtn(valueOf(option), el)"
      type="button"
      role="radio"
      :aria-checked="isChecked(option)"
      :disabled="isOptionDisabled(option) || undefined"
      :tabindex="valueOf(option) === tabbableValue ? 0 : -1"
      class="tw:flex tw:items-center tw:justify-center tw:rounded-md tw:font-medium tw:transition-all tw:duration-150 tw:focus-visible:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-primary/40 tw:disabled:cursor-not-allowed tw:disabled:opacity-50"
      :class="[
        sizeClass,
        equalWidth ? 'tw:flex-1' : '',
        isChecked(option)
          ? 'tw:bg-primary tw:text-white tw:shadow-sm'
          : 'tw:text-secondary tw:hover:bg-sidebar-hover tw:hover:text-on-sidebar',
        blocked ? 'tw:cursor-not-allowed' : 'tw:cursor-pointer',
      ]"
      @click="select(option)"
    >
      <component :is="iconOf(option)" v-if="iconOf(option)" class="tw:size-4" aria-hidden="true" />
      <span>{{ labelOf(option) }}</span>
    </button>
  </div>
</template>
