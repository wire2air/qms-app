import { DateTime } from 'luxon'
import { defineComponent, ref, computed, h } from 'vue'
import { useVModels } from '@vueuse/core'
import { getProp, injectMultipleProps, setProp } from '@shared/composables/object.js'
import {
  IconStar,
  IconStarFilled,
  IconTrash,
  IconPlus,
  IconChevronDown,
  IconChevronRight,
} from '@tabler/icons-vue'
import BaseTextInput from '@shared/components/BaseTextInput.vue'
import BaseCheckbox from '@shared/components/BaseCheckbox.vue'
import BaseSwitch from '@shared/components/BaseSwitch.vue'
import BaseColorPicker from '@shared/components/BaseColorPicker.vue'
import TiptapEditor from '@/components/editor/TiptapEditor.vue'
import BaseDatePicker from '@shared/components/BaseDatePicker.vue'
import BaseTimePicker from '@shared/components/BaseTimePicker.vue'
import BaseDateTimePicker from '@shared/components/BaseDateTimePicker.vue'
import OptionSetSelect from '@/components/common/OptionSetSelect.vue'
import OptionSetOptionGroup from '@/components/common/OptionSetOptionGroup.vue'
import BaseChecklist from '@shared/components/BaseChecklist.vue'
import { useValidator } from '@shared/composables/validator.js'
import BasePhoto from '@shared/components/BasePhoto.vue'
import BaseUploader from '@/components/common/BaseUploader.vue'
import { required } from '@vuelidate/validators'
import { getFormComponent } from './formComponentRegistry.js'

export default defineComponent({
  name: 'DynamicForm',
  props: {
    fields: {
      type: Array,
      required: true,
    },
    modelValue: {
      type: Object,
      default: () => ({}),
    },
    loading: {
      type: Boolean,
      default: undefined,
    },
    readonly: {
      type: Boolean,
      default: false,
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['update:modelValue', 'submit'],
  setup(props, { emit, slots, attrs, expose }) {
    const { modelValue } = useVModels(props, emit)
    const innerLoading = ref(false)
    const collapsedSections = ref({})

    const computedLoading = computed({
      get: () => {
        if (typeof props.loading === 'boolean') {
          return props.loading
        }
        return innerLoading.value
      },
      set: (val) => (innerLoading.value = val),
    })

    function setFieldRule(field, initial) {
      let obj = initial
      if (field.name) {
        initial[field.name] = field.rules ?? {}
        obj = initial[field.name]

        if (field.required) {
          obj.required = required
        }
      }

      if ('children' in field && Array.isArray(field.children)) {
        field.children.forEach((child) => setFieldRule(child, obj))
      }

      if ('template' in field && Array.isArray(field.template)) {
        field.template.forEach((child) => setFieldRule(child, obj))
      }

      return initial
    }

    const rules = computed(() => {
      if (props.readonly) {
        return {}
      }
      const fields = props.fields
      return fields.reduce((acc, field) => setFieldRule(field, acc), {})
    })

    const validator = useValidator(rules, modelValue, {
      $autoDirty: false,
      $lazy: false,
      $rewardEarly: false,
    })

    // Check if field should be visible based on condition
    function isFieldVisible(field) {
      if (!field.condition) return true
      if (typeof field.condition === 'function') {
        return field.condition(modelValue.value)
      }
      return true
    }

    function getFieldScope(data) {
      const { path } = data

      injectMultipleProps(data, {
        value: {
          get: () => {
            return getProp(modelValue.value, path)
          },
          set: (value) => {
            if (!modelValue.value) {
              modelValue.value = {}
            }
            setProp(modelValue.value, path, value, true)
          },
        },
        modelValue: () => ({ ...modelValue.value }),
      })

      return data
    }

    // Repeater functions
    function addRepeaterItem(field, path) {
      const currentValue = getProp(modelValue.value, path) || []
      const maxItems = field.maxItems || Infinity
      if (currentValue.length < maxItems) {
        const newItem = {}
        // Initialize with default values from template
        if (field.template) {
          field.template.forEach((templateField) => {
            if (templateField.name && templateField.default !== undefined) {
              newItem[templateField.name] = templateField.default
            }
          })
        }
        setProp(modelValue.value, path, [...currentValue, newItem], true)
      }
    }

    function removeRepeaterItem(field, path, index) {
      const currentValue = getProp(modelValue.value, path) || []
      const minItems = field.minItems || 0
      if (currentValue.length > minItems) {
        const newValue = [...currentValue]
        newValue.splice(index, 1)
        setProp(modelValue.value, path, newValue, true)
      }
    }

    function createFieldComponent(field, scope) {
      const updateModelValueEvent = 'onUpdate:modelValue'

      const fieldProps = {
        ...field.props,
        name: scope.path,
        label: field.label,
        modelValue: scope.value,
        readonly: props.readonly || field.readonly,
        disabled: props.disabled || field.disabled ? true : undefined,
        [updateModelValueEvent]: (val) => {
          scope.value = val
          if (typeof field.props?.[updateModelValueEvent] === 'function') {
            field.props[updateModelValueEvent](val)
          }
        },
        required: field.required,
      }

      const inputFieldProps = {
        ...fieldProps,
        placeholder: field.placeholder,
        instructions: field.hint,
      }

      const selectFieldProps = {
        optionLabel: 'label',
        optionValue: 'value',
        ...inputFieldProps,
        options: field.options,
        multiple: field.multiple,
      }

      switch (field.type) {
        case 'checkbox':
          return h(BaseCheckbox, fieldProps, () => field.label)

        case 'radio':
          return h(OptionSetOptionGroup, {
            ...selectFieldProps,
            type: 'radio',
            optionSetId: field.optionSetId,
          })

        case 'optionGroup':
          return h(OptionSetOptionGroup, {
            ...selectFieldProps,
            type: field.groupType,
            optionSetId: field.optionSetId,
            inline: field.inline,
          })

        case 'input':
        case 'password':
          return h(BaseTextInput, {
            ...inputFieldProps,
            type: field.type,
          })

        case 'textarea':
          return h(TiptapEditor, { ...inputFieldProps, editable: !inputFieldProps.readonly })

        case 'number':
          return h(BaseTextInput, {
            ...inputFieldProps,
            type: 'number',
            step: field.step,
            min: field.min,
            max: field.max,
          })

        case 'textEditor':
          return h(TiptapEditor, { ...inputFieldProps, editable: !inputFieldProps.readonly })

        case 'datetime': {
          const isDisabled = props.disabled || field.disabled
          const dtValue = scope.value ? DateTime.fromISO(scope.value) : null
          const onUpdate = (dt) => {
            scope.value = DateTime.isDateTime(dt) ? dt.toISO() : null
          }
          const mode = field.mode || 'datetime'
          if (mode === 'date') {
            return h(BaseDatePicker, {
              modelValue: dtValue,
              disabled: isDisabled,
              'onUpdate:modelValue': onUpdate,
            })
          }
          if (mode === 'time') {
            return h(BaseTimePicker, {
              timeInMins: scope.value ?? 0,
              disabled: isDisabled,
              'onUpdate:timeInMins': (val) => {
                scope.value = val
              },
            })
          }
          return h(BaseDateTimePicker, {
            modelValue: dtValue,
            disabled: isDisabled,
            'onUpdate:modelValue': onUpdate,
          })
        }

        case 'colorPicker':
          return h('div', { class: 'tw:flex tw:flex-col tw:gap-1' }, [
            field.label
              ? h('div', { class: 'tw:text-sm tw:font-medium tw:text-secondary' }, field.label)
              : null,
            h(BaseColorPicker, fieldProps),
          ])

        case 'select':
          return h(OptionSetSelect, {
            ...selectFieldProps,
            optionSetId: field.optionSetId,
          })

        case 'slider':
          return h('div', { class: 'tw:px-2' }, [
            field.label
              ? h(
                  'div',
                  { class: 'tw:text-sm tw:font-medium tw:text-secondary tw:mb-1' },
                  field.label,
                )
              : null,
            h('div', { class: 'tw:flex tw:items-center tw:gap-3' }, [
              h('input', {
                type: 'range',
                min: field.min ?? 0,
                max: field.max ?? 100,
                step: field.step ?? 1,
                value: scope.value ?? 0,
                disabled: props.readonly || field.readonly || props.disabled || field.disabled,
                class:
                  'tw:w-full tw:accent-primary tw:h-2 tw:rounded-lg tw:appearance-none tw:bg-gray-200 tw:cursor-pointer',
                onInput: (e) => {
                  scope.value = Number(e.target.value)
                },
              }),
              h(
                'span',
                { class: 'tw:text-sm tw:font-medium tw:text-secondary tw:min-w-8 tw:text-right' },
                String(scope.value ?? 0),
              ),
            ]),
          ])

        case 'toggle':
          return h('div', { class: 'tw:flex tw:items-center tw:gap-2 tw:py-1' }, [
            h(BaseSwitch, {
              modelValue: scope.value ?? false,
              disabled: props.readonly || field.readonly || props.disabled || field.disabled,
              [updateModelValueEvent]: (val) => {
                scope.value = val
              },
            }),
            field.label ? h('span', { class: 'tw:text-sm tw:text-on-main' }, field.label) : null,
          ])

        case 'file':
          return h(BaseUploader, {
            ...fieldProps,
            fileType: field.fileType || 'ASSET',
            accept: field.accept || 'image/*,video/*,application/pdf,.docx,.doc',
            label: field.label || 'Supporting Documents',
            maxSize: field.maxSize || 100 * 1024 * 1024,
            multiple: field.multiple !== false,
            required: field.required || false,
          })

        case 'rating': {
          const max = field.max ?? 5
          const currentVal = scope.value || 0
          const isDisabled = props.readonly || field.readonly || props.disabled || field.disabled
          return h('div', { class: 'tw:py-1' }, [
            field.label
              ? h(
                  'div',
                  { class: 'tw:text-sm tw:font-medium tw:text-secondary tw:mb-1' },
                  field.label,
                )
              : null,
            h(
              'div',
              { class: 'tw:flex tw:gap-1' },
              Array.from({ length: max }, (_, i) => {
                const filled = i < currentVal
                return h(filled ? IconStarFilled : IconStar, {
                  key: i,
                  size: 24,
                  class: [
                    filled ? 'tw:text-amber-400' : 'tw:text-gray-300',
                    isDisabled ? 'tw:cursor-default' : 'tw:cursor-pointer tw:hover:text-amber-400',
                  ],
                  onClick: isDisabled
                    ? undefined
                    : () => {
                        scope.value = i + 1
                      },
                })
              }),
            ),
          ])
        }

        case 'checklist':
          return h(BaseChecklist, {
            ...fieldProps,
            rows: field.rows || [],
            columns: field.columns || [],
            options: field.options || [],
            optionLabel: field.optionLabel,
            optionValue: field.optionValue,
            hint: field.hint,
            dense: field.dense,
            tableClass: field.tableClass,
            headerClass: field.headerClass,
            rowLabelClass: field.rowLabelClass,
            cellClass: field.cellClass,
          })

        case 'photo':
          return h(BasePhoto, {
            ...fieldProps,
            mode: field.mode,
            accept: field.accept,
            maxFileSize: field.maxFileSize,
            placeholder: field.placeholder,
            previewSize: field.previewSize,
            facingMode: field.facingMode,
          })

        default: {
          const custom = getFormComponent(field.type)
          if (custom) {
            return h(custom.component, {
              modelValue: scope.value ?? {},
              field,
              readonly: props.readonly || field.readonly,
              disabled: props.disabled || field.disabled,
              formValues: modelValue.value,
              'onUpdate:modelValue': (val) => {
                scope.value = val
              },
            })
          }
          return h(
            'div',
            { class: 'tw:text-red-500' },
            `Invalid Field.type "${field.type}" at "${scope.path}"`,
          )
        }
      }
    }

    function createRepeaterField(field, ancestors) {
      const path = [...ancestors, field.name].join('.')
      const items = getProp(modelValue.value, path) || []
      const minItems = field.minItems || 0
      const maxItems = field.maxItems || Infinity

      // Initialize with minimum items if empty
      if (items.length === 0 && minItems > 0) {
        const initialItems = Array.from({ length: minItems }, () => ({}))
        setProp(modelValue.value, path, initialItems, true)
      }

      const repeaterItems = items.map((item, itemIndex) => {
        const itemFields = field.template.map((templateField, fieldIndex) =>
          createField(templateField, [path, String(itemIndex)], fieldIndex),
        )

        return h(
          'div',
          {
            key: itemIndex,
            class: 'repeater-item tw:p-4 tw:mb-2 tw:bg-gray-50 tw:rounded',
          },
          [
            h('div', { class: 'tw:flex tw:flex-row tw:items-center tw:mb-2' }, [
              h(
                'div',
                { class: 'tw:text-sm tw:font-medium' },
                `${field.itemLabel || 'Item'} ${itemIndex + 1}`,
              ),
              h('div', { class: 'tw:flex-1' }),
              !props.readonly && !props.disabled && items.length > minItems
                ? h(
                    'button',
                    {
                      class:
                        'tw:p-1.5 tw:rounded tw:text-red-500 tw:hover:bg-red-50 tw:transition-colors',
                      onClick: () => removeRepeaterItem(field, path, itemIndex),
                    },
                    [h(IconTrash, { size: 16 })],
                  )
                : null,
            ]),
            h('div', { class: 'tw:flex tw:flex-col tw:gap-2' }, itemFields),
          ],
        )
      })

      return h('div', { class: ['repeater-field', field.class], style: field.style }, [
        field.label ? h('div', { class: 'tw:text-base tw:mb-2' }, field.label) : null,
        ...repeaterItems,
        !props.readonly && !props.disabled && items.length < maxItems
          ? h(
              'button',
              {
                class:
                  'tw:mt-2 tw:flex tw:items-center tw:gap-1 tw:px-3 tw:py-1.5 tw:text-primary tw:rounded-lg tw:hover:bg-primary/10 tw:transition-colors tw:text-sm tw:font-medium',
                onClick: () => addRepeaterItem(field, path),
              },
              [h(IconPlus, { size: 14 }), field.addLabel || 'Add Item'],
            )
          : null,
      ])
    }

    function createSectionField(field, ancestors, index) {
      const sectionKey = field.name || `section-${index}`
      const isCollapsed = collapsedSections.value[sectionKey] ?? field.collapsed ?? false
      const sectionAncestors = field.name ? [...ancestors, field.name] : ancestors

      if (field.collapsible) {
        return h(
          'div',
          {
            class: [
              'section-field tw:mb-4 tw:border tw:border-divider tw:rounded-lg tw:overflow-hidden',
              field.class,
            ],
            style: field.style,
          },
          [
            h(
              'button',
              {
                class:
                  'tw:flex tw:items-center tw:w-full tw:px-4 tw:py-3 tw:bg-gray-100 tw:text-left tw:hover:bg-gray-200 tw:transition-colors',
                onClick: () => {
                  collapsedSections.value[sectionKey] = !isCollapsed
                },
              },
              [
                h('span', { class: 'tw:flex-1 tw:text-base tw:font-medium' }, field.label),
                h(isCollapsed ? IconChevronRight : IconChevronDown, {
                  size: 18,
                  class: 'tw:text-secondary',
                }),
              ],
            ),
            !isCollapsed
              ? h(
                  'div',
                  { class: 'tw:p-4 tw:flex tw:flex-col tw:gap-4' },
                  createFields(field.children, sectionAncestors),
                )
              : null,
          ],
        )
      }

      return h('div', { class: ['section-field tw:mb-4', field.class], style: field.style }, [
        h('div', { class: 'tw:text-base tw:mb-4 tw:font-medium' }, field.label),
        h(
          'div',
          { class: 'tw:flex tw:flex-col tw:gap-4' },
          createFields(field.children, sectionAncestors),
        ),
      ])
    }

    function createField(field, ancestors, index) {
      // Check visibility condition
      if (!isFieldVisible(field)) {
        return null
      }

      if (field.type === 'separator') {
        return h('hr', { class: 'tw:border-divider tw:my-2', ...field.props })
      }

      if (field.type === 'section') {
        return createSectionField(field, ancestors, index)
      }

      if (field.type === 'repeater') {
        return createRepeaterField(field, ancestors, index)
      }

      if (!field.name && !['row', 'column'].includes(field.type)) {
        return h(
          'div',
          { class: 'tw:text-red-500' },
          `Field name is required at ${ancestors}.[${index}]`,
        )
      }

      ancestors = field.name ? [...ancestors, field.name] : ancestors

      const path = ancestors.join('.')
      const slotName = `field-${path}`
      const scope = getFieldScope({ field, path, index })
      const slot = slots[slotName]

      if (slot !== void 0) {
        return slot(scope)
      }

      if (field.type === 'row' || field.type === 'column') {
        const fieldClass = `${field.type === 'row' ? 'tw:flex tw:flex-row tw:items-start tw:justify-around' : 'tw:flex tw:flex-col'} tw:gap-4 tw:m-0`

        return h(
          'div',
          {
            ...field.props,
            key: field.name,
            class: [fieldClass, field.class],
            style: field.style,
          },
          createFields(field.children, ancestors),
        )
      }

      const prependSlot = slots[`${slotName}-prepend`]
      const appendSlot = slots[`${slotName}-append`]
      const internalAppendSlot = slots[`${slotName}-internal-append`]

      // Field types that support internal append slots
      const supportsInternalAppend = ['input', 'select', 'number', 'password', 'textarea']

      // Create component slots for fields that support internal append
      const componentSlots = {}
      if (supportsInternalAppend.includes(field.type) && internalAppendSlot) {
        componentSlots.append = internalAppendSlot
      }

      const Comp = createFieldComponent(field, scope, componentSlots)

      if (Comp) {
        const inner = [Comp]

        if (prependSlot) {
          inner.unshift(prependSlot())
        }

        // Add regular append slot outside the field
        if (appendSlot) {
          inner.push(appendSlot())
        }

        return h('div', { class: field.class, style: field.style }, inner)
      } else {
        return Comp
      }
    }

    function createFields(fields, ancestors = []) {
      if (!fields) {
        return []
      }

      return fields
        .map((field, index) => createField(field, ancestors, index))
        .filter((field) => field !== null)
    }

    async function submit(e) {
      if (e?.preventDefault) e.preventDefault()
      computedLoading.value = true
      const isValid = await validator.value.$validate()

      if (isValid) {
        emit('submit', modelValue.value, () => {
          computedLoading.value = false
        })
      } else {
        computedLoading.value = false
      }
    }

    // Expose submit for parent components to call via ref
    expose({ submit })

    return () => {
      const contents = []

      if (slots.header) {
        contents.push(slots.header())
      }

      contents.push(h('div', { class: 'tw:flex tw:flex-col tw:gap-4' }, createFields(props.fields)))

      if (slots.footer) {
        contents.push(slots.footer({ submit }))
      }

      if (computedLoading.value) {
        contents.push(
          h(
            'div',
            {
              class:
                'tw:absolute tw:inset-0 tw:bg-white/70 tw:flex tw:items-center tw:justify-center tw:z-10',
            },
            [
              h('div', {
                class:
                  'tw:size-10 tw:animate-spin tw:rounded-full tw:border-2 tw:border-primary tw:border-t-transparent',
              }),
            ],
          ),
        )
      }

      return h(
        'div',
        {
          ...attrs,
          class: [attrs.class, 'tw:relative tw:flex tw:flex-col tw:gap-4 dynamic-form'],
        },
        contents,
      )
    }
  },
})
