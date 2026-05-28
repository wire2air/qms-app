import {
  IconTextSize,
  IconNotes,
  IconHash,
  IconLock,
  IconSelector,
  IconSquareCheck,
  IconListCheck,
  IconTable,
  IconCalendar,
  IconPaperclip,
  IconCamera,
  IconStar,
  IconAdjustments,
  IconToggleRight,
  IconPalette,
  IconBold,
  IconLayoutList,
  IconColumns,
  IconLayoutRows,
  IconRepeat,
  IconMinus,
  IconGrid3x3,
  IconSitemap,
  IconLayoutGrid,
  IconInfoCircle,
} from '@tabler/icons-vue'

export const CATEGORY_LABELS = Object.freeze({
  input: 'Input Fields',
  selection: 'Selection Fields',
  special: 'Special Fields',
  layout: 'Layout Elements',
  widget: 'Widgets',
  tools: 'Tools',
})

// Field type definitions with icons and labels
export const FIELD_TYPES = Object.freeze({
  // Input Types
  input: { icon: IconTextSize, label: 'Text Input', category: 'input' },
  textarea: { icon: IconNotes, label: 'Text Area', category: 'input' },
  number: { icon: IconHash, label: 'Number', category: 'input' },
  password: { icon: IconLock, label: 'Password', category: 'input' },

  // Selection Types
  select: { icon: IconSelector, label: 'Dropdown', category: 'selection' },
  checkbox: { icon: IconSquareCheck, label: 'Checkbox', category: 'selection' },
  optionGroup: { icon: IconListCheck, label: 'Option Group', category: 'selection' },
  checklist: { icon: IconTable, label: 'Checklist', category: 'selection' },

  // Special Types
  datetime: { icon: IconCalendar, label: 'Date/Time', category: 'special' },
  file: { icon: IconPaperclip, label: 'File Upload', category: 'special' },
  photo: { icon: IconCamera, label: 'Photo', category: 'special' },
  rating: { icon: IconStar, label: 'Rating', category: 'special' },
  slider: { icon: IconAdjustments, label: 'Slider', category: 'special' },
  toggle: { icon: IconToggleRight, label: 'Toggle', category: 'special' },
  colorPicker: { icon: IconPalette, label: 'Color Picker', category: 'special' },
  textEditor: { icon: IconBold, label: 'Rich Text', category: 'special' },

  // Layout Types
  section: { icon: IconLayoutList, label: 'Section', category: 'layout' },
  row: { icon: IconColumns, label: 'Row', category: 'layout' },
  column: { icon: IconLayoutRows, label: 'Column', category: 'layout' },
  repeater: { icon: IconRepeat, label: 'Repeater', category: 'layout' },
  separator: { icon: IconMinus, label: 'Separator', category: 'layout' },
  // Display-only block — gives form authors a place to put rich
  // instructions (links to SOPs via the # mention shortcut, headings,
  // bold callouts, etc.). Not an input; doesn't produce a value.
  instructions: { icon: IconInfoCircle, label: 'Instructions', category: 'layout' },

  // widgets
  inputTable: { icon: IconGrid3x3, label: 'Input Table', category: 'widget' },

  // tools
  rca: { icon: IconSitemap, label: 'Root Cause Analysis', category: 'tools' },
  riskAssessment: { icon: IconLayoutGrid, label: 'Risk Assessment', category: 'tools' },
})

export const WIDGET_CONFIG = Object.freeze({
  inputTable: {
    type: 'repeater',
    name: 'inputtable_1',
    label: 'Input Table',
    placeholder: '',
    hint: '',
    required: false,
    readonly: false,
    disabled: false,
    class: '',
    style: '',
    minItems: 1,
    maxItems: 5,
    addLabel: 'Add Product',
    itemLabel: 'Product',
    template: [
      {
        type: 'row',
        children: [
          {
            type: 'input',
            name: 'productName',
            label: 'Product Name',
            placeholder: '',
            hint: '',
            required: false,
            readonly: false,
            disabled: false,
            class: 'tw:grow',
            style: '',
          },
          {
            type: 'input',
            name: 'productCategory',
            label: 'Product Category',
            placeholder: '',
            hint: '',
            required: false,
            readonly: false,
            disabled: false,
            class: 'tw:grow',
            style: '',
          },
        ],
        name: 'Product',
        colClass: 'tw:flex-1',
      },
    ],
  },
})

export const FIELD_TYPES_CONFIG = Object.freeze({
  base: {
    name: '',
    label: '',
    placeholder: '',
    hint: '',
    required: false,
    readonly: false,
    disabled: false,
    class: '',
    style: '',
  },
  select: {
    options: [],
  },
  get radio() {
    return this.select
  },
  optionGroup: {
    options: [],
    groupType: 'radio',
    inline: false,
  },
  checklist: {
    rows: ['Row 1'],
    columns: [
      {
        label: 'Column 1',
        value: 'column1',
        inputType: 'radio',
      },
    ],
    options: [],
    dense: false,
    tableClass: '',
    headerClass: '',
    rowLabelClass: '',
    cellClass: '',
  },
  number: {
    min: undefined,
    max: undefined,
    step: 1,
  },
  get slider() {
    return this.number
  },
  rating: {
    max: 5,
    icon: 'star_border',
    iconSelected: 'star',
    color: 'primary',
  },
  file: {
    multiple: false,
    accept: '',
    maxFileSize: undefined,
  },
  photo: {
    mode: 'both',
    maxFileSize: 5242880, // 5MB
    previewSize: '150px',
    facingMode: 'environment',
  },
  toggle: {
    color: 'primary',
  },
  textarea: {
    autogrow: false,
  },
  datetime: {
    mode: 'datetime',
  },
  section: {
    collapsible: false,
    collapsed: false,
    children: [],
  },
  row: {
    children: [],
  },
  column: {
    children: [],
  },
  repeater: {
    template: [],
    minItems: 0,
    maxItems: undefined,
    addLabel: 'Add Item',
    itemLabel: 'Item',
  },
  separator: {
    type: 'separator',
    props: {},
  },
  instructions: {
    // Rich HTML produced by the TipTap editor in the properties panel.
    // Rendered read-only via v-html in DynamicForm — same component the
    // document body field uses (so the # mention picker and document
    // links work out of the box).
    html: '<p>Add instructions for the user filling this form…</p>',
  },
  ...WIDGET_CONFIG,
  rca: {
    rcaTemplateId: null,
    problemField: '_parent_problem',
  },
  riskAssessment: {
    riskAssessmentTemplateId: null,
  },
})

export const PLACEHOLDER_TYPES = new Set(['input', 'textarea', 'number', 'password', 'select'])
export const NO_HINT_TYPES = new Set(['separator', 'section', 'row', 'column', 'instructions'])
export const TYPE_SETTINGS_TYPES = new Set([
  'number',
  'slider',
  'select',
  'radio',
  'optionGroup',
  'checklist',
  'file',
  'rating',
  'section',
  'repeater',
  'row',
  'datetime',
  'rca',
  'riskAssessment',
  'instructions',
])
export const NUMBER_TYPES = new Set(['number', 'slider'])
export const OPTIONS_TYPES = new Set(['select', 'radio', 'optionGroup'])
export const NO_LABEL_TYPES = new Set(['row', 'column', 'instructions'])
export const NO_STATE_TYPES = new Set([
  'row',
  'column',
  'separator',
  'section',
  'rca',
  'riskAssessment',
  'instructions',
])

export const DATETIME_MODE_OPTIONS = [
  { label: 'Date & Time', value: 'datetime' },
  { label: 'Date Only', value: 'date' },
  { label: 'Time Only', value: 'time' },
]

export const GROUP_TYPE_OPTIONS = [
  { label: 'Radio', value: 'radio' },
  { label: 'Checkbox', value: 'checkbox' },
  { label: 'Toggle', value: 'toggle' },
]

export const COLUMN_INPUT_TYPES = [
  { label: 'Radio', value: 'radio' },
  { label: 'Checkbox', value: 'checkbox' },
  { label: 'Text', value: 'text' },
  { label: 'Number', value: 'number' },
  { label: 'Dropdown', value: 'select' },
  { label: 'Date', value: 'date' },
  { label: 'Time', value: 'time' },
]

export const COL_CLASS_OPTIONS = [
  { label: 'Auto (default)', value: 'tw:flex-1' },
  { label: 'Auto (Fit Content)', value: 'tw:w-auto' },
  { label: 'Grow to Fill', value: 'tw:flex-grow' },
  { label: 'Shrink if needed', value: 'tw:flex-shrink' },
  { label: '8.33% (1/12)', value: 'tw:w-1/12' },
  { label: '16.66% (2/12)', value: 'tw:w-2/12' },
  { label: '25% (3/12)', value: 'tw:w-3/12' },
  { label: '33.33% (4/12)', value: 'tw:w-4/12' },
  { label: '41.66% (5/12)', value: 'tw:w-5/12' },
  { label: '50% (6/12)', value: 'tw:w-6/12' },
  { label: '58.33% (7/12)', value: 'tw:w-7/12' },
  { label: '66.66% (8/12)', value: 'tw:w-8/12' },
  { label: '75% (9/12)', value: 'tw:w-9/12' },
  { label: '83.33% (10/12)', value: 'tw:w-10/12' },
  { label: '91.66% (11/12)', value: 'tw:w-11/12' },
  { label: '100% (12/12)', value: 'tw:w-full' },
]
