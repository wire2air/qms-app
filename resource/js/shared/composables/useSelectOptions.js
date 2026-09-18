import { computed } from 'vue'

/**
 * Normalize a generic `options` array into a stable internal shape and resolve
 * the current selection from `modelValue`.
 *
 * Accessors (`optionLabel`, `optionValue`, ...) may be a string key or a
 * `fn(option) => any`. Primitive options (strings/numbers) are supported: the
 * option itself is used as both label and value when no accessor matches.
 *
 * @param {object} props   BaseSelect props (reactive)
 * @param {import('vue').Ref} modelRef  the v-model ref
 */
export function useSelectOptions(props, modelRef) {
  function resolve(accessor, option, fallback) {
    if (typeof accessor === 'function') return accessor(option)
    if (typeof accessor === 'string' && option != null && typeof option === 'object') {
      return option[accessor]
    }
    return fallback
  }

  function getLabel(option) {
    const label = resolve(props.optionLabel, option, option)
    return label == null ? '' : String(label)
  }
  function getValue(option) {
    return resolve(props.optionValue, option, option)
  }
  function getDisabled(option) {
    return !!resolve(props.optionDisabled, option, false)
  }
  function getGroup(option) {
    return resolve(props.optionGroup, option, null)
  }
  function getIcon(option) {
    return resolve(props.optionIcon, option, null)
  }
  function getAvatar(option) {
    return resolve(props.optionAvatar, option, null)
  }
  function getDescription(option) {
    return resolve(props.optionDescription, option, null)
  }

  /** Each raw option mapped to a normalized descriptor (label/value/etc.). */
  const normalizedOptions = computed(() =>
    (props.options || []).map((raw, index) => ({
      raw,
      index,
      label: getLabel(raw),
      value: getValue(raw),
      disabled: getDisabled(raw),
      group: getGroup(raw),
      icon: getIcon(raw),
      avatar: getAvatar(raw),
      description: getDescription(raw),
    })),
  )

  /** Pull the comparable value out of a model entry (object or raw value). */
  function valueOf(entry) {
    if (props.emitValue) return entry
    return getValue(entry)
  }

  /** What we actually emit for a given option, honoring `emitValue`. */
  function toEmitted(normOption) {
    return props.emitValue ? normOption.value : normOption.raw
  }

  const selectedValues = computed(() => {
    const v = modelRef.value
    if (props.multiple) {
      return (Array.isArray(v) ? v : []).map(valueOf)
    }
    return v == null ? [] : [valueOf(v)]
  })

  function isSelected(normOption) {
    return selectedValues.value.some((val) => val === normOption.value)
  }

  /** Normalized options matching the current model value, in model order. */
  const selectedOptions = computed(() => {
    const byValue = new Map(normalizedOptions.value.map((o) => [o.value, o]))
    return selectedValues.value
      .map((val) => byValue.get(val))
      .filter((o) => o != null)
  })

  /** Group name -> normalized options, preserving first-seen group order. */
  const groupedOptions = computed(() => {
    const groups = new Map()
    for (const option of normalizedOptions.value) {
      const key = option.group ?? '__ungrouped__'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(option)
    }
    return groups
  })

  const isGrouped = computed(() => props.optionGroup != null)

  return {
    getLabel,
    getValue,
    getDisabled,
    getGroup,
    normalizedOptions,
    selectedValues,
    selectedOptions,
    groupedOptions,
    isGrouped,
    isSelected,
    toEmitted,
  }
}
