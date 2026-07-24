import { defineComponent, ref, computed, h, onMounted } from 'vue'
import { DateTime } from 'luxon'
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
import BaseEmailInput from '@shared/components/BaseEmailInput.vue'
import BasePhoneInput from '@shared/components/BasePhoneInput.vue'
import BaseCheckbox from '@shared/components/BaseCheckbox.vue'
import BaseSwitch from '@shared/components/BaseSwitch.vue'
import BaseColorPicker from '@shared/components/BaseColorPicker.vue'
import BaseSignaturePad from '@shared/components/BaseSignaturePad.vue'
import BaseRichTextEditor from '@/components/editor/BaseRichTextEditor.vue'
import RichTextAttachments from '@/components/shared/RichTextAttachments.vue'
import { tableStyleClasses, cx } from '@/utils/tableStyle'
import BaseDateField from '@shared/components/BaseDateField.vue'
import OptionSetSelect from '@/components/common/OptionSetSelect.vue'
import OptionSetOptionGroup from '@/components/common/OptionSetOptionGroup.vue'
import BaseChecklist from '@shared/components/BaseChecklist.vue'
import { useValidator } from '@shared/composables/validator.js'
import BasePhoto from '@shared/components/BasePhoto.vue'
import BaseSpinner from '@shared/components/BaseSpinner.vue'
import BaseUploader from '@/components/common/BaseUploader.vue'
import { required, email as emailValidator, helpers } from '@vuelidate/validators'
import { getFormComponent } from './formComponentRegistry.js'
import { fieldWidthSpan } from '@/constants/formBuilderConfig'
import ProductSelectMenu from '@/components/menus/ProductSelectMenu.vue'
import SupplierSelectMenu from '@/components/menus/SupplierSelectMenu.vue'
import SiteSelectMenu from '@/components/menus/SiteSelectMenu.vue'
import DepartmentSelectMenu from '@/components/menus/DepartmentSelectMenu.vue'
import UserSelectMenu from '@/components/menus/UserSelectMenu.vue'
import EquipmentSelectMenu from '@/components/menus/EquipmentSelectMenu.vue'
import CountrySelectMenu from '@/components/menus/CountrySelectMenu.vue'
import RegionSelectMenu from '@/components/menus/RegionSelectMenu.vue'

// Entity pickers a `lookup` field can render, keyed by field.lookupEntity.
const LOOKUP_MENUS = {
  product: ProductSelectMenu,
  supplier: SupplierSelectMenu,
  site: SiteSelectMenu,
  department: DepartmentSelectMenu,
  user: UserSelectMenu,
  equipment: EquipmentSelectMenu,
  country: CountrySelectMenu,
  region: RegionSelectMenu,
}

function safeRegExp(src) {
  try {
    return src ? new RegExp(src) : null
  } catch {
    return null
  }
}

// A phone passes if: a custom regex matches; else its national digit count
// equals the mask's '#' count; else it has at least 7 digits. Empty passes —
// `required` owns emptiness.
function makePhoneValidator(field) {
  const re = safeRegExp(field.formatRegex)
  const maskCount = field.mask ? (field.mask.match(/#/g) || []).length : 0
  return (value) => {
    if (!helpers.req(value)) return true
    const v = String(value)
    if (re) return re.test(v)
    const national = v.replace(/^\+\d{1,4}\s*/, '').replace(/\D/g, '')
    return maskCount ? national.length === maskCount : national.length >= 7
  }
}

// Built-in validation rules an input field's type contributes, on top of
// `required`. Email → email check (or a custom regex); phone → phone check.
function buildTypeRules(field) {
  const rules = {}
  if (field.type === 'email') {
    const re = safeRegExp(field.formatRegex)
    if (re) rules.format = helpers.withMessage('Invalid format.', helpers.regex(re))
    else rules.email = helpers.withMessage('Enter a valid email address.', emailValidator)
  } else if (field.type === 'phone') {
    rules.phone = helpers.withMessage('Enter a valid phone number.', makePhoneValidator(field))
  }
  return rules
}

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

    // The value a `defaultToday` datetime field seeds into a NEW entry, in the
    // same shape BaseDateField emits (valueFormat 'iso'): full ISO for datetime,
    // date-only ISO for date, minutes-since-midnight for time.
    function defaultDateValue(field) {
      const now = DateTime.now()
      if (field.mode === 'time') return now.hour * 60 + now.minute
      if (field.mode === 'date') return now.toISODate()
      return now.toISO()
    }

    // Seed defaults for brand-new entries once on mount. A field is seeded only
    // when its stored value is `undefined` (never set) — an explicit `null`
    // (user-cleared) is left alone, so this never clobbers an existing entry a
    // user intentionally blanked. Skipped entirely for readonly/disabled views.
    function seedFieldDefaults(fields, ancestors) {
      for (const field of fields) {
        if (!field || typeof field !== 'object') continue
        const nextAncestors = field.name ? [...ancestors, field.name] : ancestors
        if (['section', 'row', 'column'].includes(field.type)) {
          if (Array.isArray(field.children)) seedFieldDefaults(field.children, nextAncestors)
          continue
        }
        if (field.type === 'datetime' && field.defaultToday && field.name) {
          const path = nextAncestors.join('.')
          if (getProp(modelValue.value, path) === undefined) {
            if (!modelValue.value) modelValue.value = {}
            setProp(modelValue.value, path, defaultDateValue(field), true)
          }
        }
      }
    }

    onMounted(() => {
      if (props.readonly || props.disabled) return
      seedFieldDefaults(props.fields || [], [])
    })

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
        Object.assign(obj, buildTypeRules(field))
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
      if (field.hidden) return false // "Hide field" — omit from the rendered form
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
            optionSet: field.optionSet,
          })

        case 'optionGroup':
          return h(OptionSetOptionGroup, {
            ...selectFieldProps,
            type: field.groupType,
            optionSetId: field.optionSetId,
            optionSet: field.optionSet,
            inline: field.inline,
          })

        case 'text':
        case 'input':
        case 'password':
          return h(BaseTextInput, {
            ...inputFieldProps,
            type: field.type === 'input' || field.type === 'text' ? 'text' : field.type,
          })

        case 'email':
          return h(BaseEmailInput, inputFieldProps)

        case 'phone':
          return h(BasePhoneInput, {
            ...inputFieldProps,
            defaultCountry: field.defaultCountry,
            mask: field.mask,
          })

        case 'textarea':
          // BaseRichTextEditor doesn't accept a `label` prop, so wrap with an
          // explicit label row. Same reason datetime/colorPicker/slider do.
          return h('div', { class: 'tw:flex tw:flex-col' }, [
            field.label
              ? h(
                  'div',
                  { class: 'tw:text-sm tw:font-medium tw:text-secondary tw:mb-1' },
                  field.label,
                )
              : null,
            h(BaseRichTextEditor, { ...inputFieldProps, editable: !inputFieldProps.readonly }),
          ])

        case 'number':
          return h(BaseTextInput, {
            ...inputFieldProps,
            type: 'number',
            step: field.step,
            min: field.min,
            max: field.max,
          })

        case 'textEditor':
          return h('div', { class: 'tw:flex tw:flex-col' }, [
            field.label
              ? h(
                  'div',
                  { class: 'tw:text-sm tw:font-medium tw:text-secondary tw:mb-1' },
                  field.label,
                )
              : null,
            h(BaseRichTextEditor, { ...inputFieldProps, editable: !inputFieldProps.readonly }),
          ])

        // Rich text + inline file/image attachments packed into a single string
        // (RichTextAttachments). One field replaces the textEditor+file pair.
        case 'richTextAttachment':
          return h('div', { class: 'tw:flex tw:flex-col' }, [
            field.label
              ? h(
                  'div',
                  { class: 'tw:text-sm tw:font-medium tw:text-secondary tw:mb-1' },
                  field.label,
                )
              : null,
            h(RichTextAttachments, inputFieldProps),
          ])

        case 'date': {
          const isDisabled = props.disabled || field.disabled
          return h('div', { class: 'tw:flex tw:flex-col' }, [
            field.label
              ? h('div', { class: 'tw:text-sm tw:font-medium tw:text-secondary tw:mb-1' }, field.label)
              : null,
            h(BaseDateField, {
              ...inputFieldProps,
              mode: 'date',
              valueFormat: 'iso',
              modelValue: scope.value || null,
              disabled: isDisabled,
              'onUpdate:modelValue': (v) => {
                scope.value = v || null
              },
            }),
          ])
        }

        case 'datetime': {
          const isDisabled = props.disabled || field.disabled
          const mode = field.mode || 'datetime'
          const labelEl = field.label
            ? h('div', { class: 'tw:text-sm tw:font-medium tw:text-secondary tw:mb-1' }, field.label)
            : null

          if (mode === 'time') {
            // Stored as minutes-since-midnight; bridge to a HH:mm string for the field.
            const mins = Number(scope.value ?? 0)
            const hh = String(Math.floor(mins / 60)).padStart(2, '0')
            const mm = String(mins % 60).padStart(2, '0')
            return h('div', { class: 'tw:flex tw:flex-col' }, [
              labelEl,
              h(BaseDateField, {
                mode: 'time',
                valueFormat: 'iso',
                modelValue: mins ? `${hh}:${mm}` : null,
                disabled: isDisabled,
                'onUpdate:modelValue': (v) => {
                  if (!v) return (scope.value = 0)
                  const [h2, m2] = String(v).split(':').map(Number)
                  scope.value = h2 * 60 + m2
                },
              }),
            ])
          }

          return h('div', { class: 'tw:flex tw:flex-col' }, [
            labelEl,
            h(BaseDateField, {
              mode: mode === 'date' ? 'date' : 'datetime',
              valueFormat: 'iso',
              modelValue: scope.value || null,
              disabled: isDisabled,
              // Optional per-field bounds: no past / no future dates (author opt-in).
              minDate: field.noPastDates ? DateTime.now().startOf('day') : null,
              maxDate: field.noFutureDates ? DateTime.now().endOf('day') : null,
              'onUpdate:modelValue': (v) => {
                scope.value = v || null
              },
            }),
          ])
        }

        case 'colorPicker':
          return h('div', { class: 'tw:flex tw:flex-col tw:gap-1' }, [
            field.label
              ? h('div', { class: 'tw:text-sm tw:font-medium tw:text-secondary' }, field.label)
              : null,
            h(BaseColorPicker, fieldProps),
          ])

        case 'signature':
          // BaseSignaturePad's model is a String data-URL; it only takes
          // height/penColor/disabled, so pass those explicitly rather than the
          // generic fieldProps (which carry label/required/etc it doesn't use).
          return h('div', { class: 'tw:flex tw:flex-col tw:gap-1' }, [
            field.label
              ? h('div', { class: 'tw:text-sm tw:font-medium tw:text-secondary' }, field.label)
              : null,
            h(BaseSignaturePad, {
              modelValue: scope.value ?? '',
              height: field.height || 180,
              disabled:
                props.readonly || field.readonly || props.disabled || field.disabled || false,
              [updateModelValueEvent]: (val) => {
                scope.value = val
              },
            }),
            field.hint
              ? h('div', { class: 'tw:text-xs tw:text-secondary' }, field.hint)
              : null,
          ])

        case 'select':
          return h(OptionSetSelect, {
            ...selectFieldProps,
            optionSetId: field.optionSetId,
            optionSet: field.optionSet,
          })

        case 'lookup': {
          const commonProps = {
            modelValue: scope.value,
            'onUpdate:modelValue': (val) => {
              scope.value = val
            },
            required: field.required,
            disabled:
              props.readonly || field.readonly || props.disabled || field.disabled
                ? true
                : undefined,
          }
          // Option-set-sourced lookup — same FK key select fields use, so
          // freezing/readonly resolution reuse the option-set machinery.
          if (field.lookupEntity === 'optionSet' && field.optionSetId) {
            return h('div', { class: 'tw:flex tw:flex-col tw:gap-1' }, [
              field.label
                ? h(
                    'div',
                    { class: 'tw:text-sm tw:font-medium tw:text-secondary tw:mb-1' },
                    field.label,
                  )
                : null,
              h(OptionSetSelect, {
                ...commonProps,
                optionSetId: field.optionSetId,
                optionSet: field.optionSet,
              }),
              field.hint ? h('div', { class: 'tw:text-xs tw:text-secondary' }, field.hint) : null,
            ])
          }
          const Menu = LOOKUP_MENUS[field.lookupEntity || 'product']
          const control = Menu
            ? h(Menu, commonProps)
            : h(
                'div',
                { class: 'tw:text-sm tw:text-red-500' },
                `Unknown lookup source: ${field.lookupEntity}`,
              )
          return h('div', { class: 'tw:flex tw:flex-col tw:gap-1' }, [
            field.label
              ? h(
                  'div',
                  { class: 'tw:text-sm tw:font-medium tw:text-secondary tw:mb-1' },
                  field.label,
                )
              : null,
            control,
            field.hint ? h('div', { class: 'tw:text-xs tw:text-secondary' }, field.hint) : null,
          ])
        }

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
            // All form uploads land in the ASSET bucket; the old per-field
            // "File Type" category (company logo / avatar / editor image) was a
            // storage-bucket concept, not a form concern, so it's no longer set.
            fileType: field.fileType || 'ASSET',
            // Blank accept = any readable format (a QMS default). Only restrict
            // when the author explicitly set an allow-list on the field.
            accept: field.accept || '',
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

        case 'checklist': {
          const ts = tableStyleClasses(field)
          return h(BaseChecklist, {
            ...fieldProps,
            rows: field.rows || [],
            columns: field.columns || [],
            options: field.options || [],
            optionLabel: field.optionLabel,
            optionValue: field.optionValue,
            hint: field.hint,
            dense: field.dense,
            tableClass: cx(field.tableClass, ts.tableClass),
            headerClass: cx(field.headerClass, ts.headerClass, ts.headerCellClass),
            rowLabelClass: cx(field.rowLabelClass, ts.cellClass),
            cellClass: cx(field.cellClass, ts.cellClass),
            rowClass: ts.rowClass,
          })
        }

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

      // Table layout — each item is a row, the item label is a fixed first
      // column, and each template field is a column. Same data model as the
      // card layout (paths unchanged), so switching layout doesn't move data.
      if (field.layout === 'table') {
        return createRepeaterTable(field, path, minItems, maxItems)
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

    function createRepeaterTable(field, path, minItems, maxItems) {
      const items = getProp(modelValue.value, path) || []
      const canEdit = !props.readonly && !props.disabled
      const ts = tableStyleClasses(field)

      // Columns are the template fields. The seeded Input Table wraps them in a
      // single row (template[0]); a hand-built repeater may list them flat.
      const rowWrap =
        field.template.length === 1 && field.template[0].type === 'row'
          ? field.template[0]
          : null
      const columns = rowWrap ? rowWrap.children || [] : field.template

      // Cell path must match the card layout exactly. When the columns live in a
      // named row wrapper, that name is part of the item's key path.
      const cellAncestors = (i) => {
        const a = [path, String(i)]
        if (rowWrap && rowWrap.name) a.push(rowWrap.name)
        return a
      }

      const headerCells = [
        h(
          'th',
          {
            class: cx(
              'tw:text-left tw:text-sm tw:font-medium tw:px-2 tw:py-1.5 tw:w-px tw:whitespace-nowrap',
              ts.headerClass,
              ts.headerCellClass,
            ),
          },
          '',
        ),
        ...columns.map((col) =>
          h(
            'th',
            {
              class: cx(
                'tw:text-left tw:text-sm tw:font-medium tw:px-2 tw:py-1.5',
                ts.headerClass,
                ts.headerCellClass,
              ),
            },
            col.label || '',
          ),
        ),
        canEdit ? h('th', { class: cx('tw:w-px', ts.headerClass) }, '') : null,
      ]

      const bodyRows = items.map((item, i) => {
        const cells = [
          h(
            'td',
            {
              class: cx(
                'tw:px-2 tw:py-1.5 tw:text-sm tw:text-on-main tw:whitespace-nowrap tw:align-middle',
                ts.cellClass,
              ),
            },
            `${field.itemLabel || 'Item'} ${i + 1}`,
          ),
          ...columns.map((col, ci) =>
            // label blanked — the column header carries it, not each cell.
            h('td', { class: cx('tw:px-2 tw:py-1.5 tw:align-top', ts.cellClass) }, [
              createField({ ...col, label: '' }, cellAncestors(i), ci),
            ]),
          ),
          canEdit
            ? h(
                'td',
                { class: cx('tw:px-2 tw:py-1.5 tw:align-middle', ts.cellClass) },
                items.length > minItems
                  ? [
                      h(
                        'button',
                        {
                          class:
                            'tw:p-1.5 tw:rounded tw:text-red-500 tw:hover:bg-red-50 tw:transition-colors',
                          onClick: () => removeRepeaterItem(field, path, i),
                        },
                        [h(IconTrash, { size: 16 })],
                      ),
                    ]
                  : [],
              )
            : null,
        ]
        return h('tr', { key: i, class: cx('tw:border-t tw:border-divider', ts.rowClass) }, cells)
      })

      return h('div', { class: ['repeater-field', field.class], style: field.style }, [
        field.label ? h('div', { class: 'tw:text-base tw:mb-2' }, field.label) : null,
        h('div', { class: 'tw:overflow-x-auto tw:border tw:border-divider tw:rounded-lg' }, [
          h('table', { class: cx('tw:w-full tw:border-collapse', ts.tableClass) }, [
            h('thead', {}, [h('tr', {}, headerCells)]),
            h('tbody', {}, bodyRows),
          ]),
        ]),
        canEdit && items.length < maxItems
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
          { class: 'tw:grid tw:grid-cols-1 tw:sm:grid-cols-12 tw:gap-4' },
          createGridFields(field.children, sectionAncestors),
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

      if (field.type === 'instructions') {
        // Display-only rich HTML block. Authors edit the html via the
        // properties panel's TipTap editor; runtime renders it via
        // v-html inside an info-styled callout. No payload value.
        return h('div', {
          class: [
            'instructions-field tw:mb-3 tw:rounded-lg tw:border tw:border-blue-200 tw:bg-blue-50 tw:px-4 tw:py-3 tw:text-sm tw:text-on-main tw:prose tw:prose-sm tw:max-w-none',
            field.class,
          ],
          style: field.style,
          innerHTML: field.html || '',
        })
      }

      if (field.type === 'header') {
        // Display-only heading + optional subheading. No payload value.
        const sizeClass =
          { default: 'tw:text-xl', large: 'tw:text-3xl', small: 'tw:text-base' }[
            field.size || 'large'
          ] || 'tw:text-3xl'
        const alignClass =
          { left: 'tw:text-left', center: 'tw:text-center', right: 'tw:text-right' }[
            field.align || 'center'
          ] || 'tw:text-center'
        return h('div', { class: ['header-field tw:mb-2', alignClass, field.class], style: field.style }, [
          h('div', { class: [sizeClass, 'tw:font-bold tw:text-on-main'] }, field.text || ''),
          field.subtext
            ? h('div', { class: 'tw:text-sm tw:text-secondary tw:mt-1' }, field.subtext)
            : null,
        ])
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

    // Width-aware variant: each field becomes a cell in a 12-column grid,
    // spanning its `width` (full/half/third/quarter) so fields pack into rows.
    // The caller MUST render the result inside GRID_CONTAINER_CLASS. The span
    // is an inline style (Tailwind can't JIT a dynamic col-span-N); on the
    // mobile single-column grid every span clamps to full width. Layout fields
    // (section/row/column) default to full and keep their own inner layout.
    function createGridFields(fields, ancestors = []) {
      if (!fields) {
        return []
      }

      return fields
        .map((field, index) => {
          const vnode = createField(field, ancestors, index)
          if (vnode === null) return null
          const span = fieldWidthSpan(field.width)
          return h(
            'div',
            { key: field.name || index, style: { gridColumn: `span ${span} / span ${span}` } },
            [vnode],
          )
        })
        .filter((vnode) => vnode !== null)
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

    // Validate-only: touch + run all rules, returning a boolean without
    // emitting 'submit'. Lets a parent gate its own save on this form's
    // validity (e.g. required custom fields on a create form).
    async function validate() {
      return await validator.value.$validate()
    }

    // Expose submit + validate for parent components to call via ref
    expose({ submit, validate })

    return () => {
      const contents = []

      if (slots.header) {
        contents.push(slots.header())
      }

      contents.push(
        h(
          'div',
          { class: 'tw:grid tw:grid-cols-1 tw:sm:grid-cols-12 tw:gap-4' },
          createGridFields(props.fields),
        ),
      )

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
            [h(BaseSpinner, { size: 'lg' })],
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
