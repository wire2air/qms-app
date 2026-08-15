import {
  IconTextSize,
  IconNotes,
  IconHash,
  IconLock,
  IconMail,
  IconPhone,
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
  IconSignature,
  IconHeading,
  IconDatabaseSearch,
  IconFileText,
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
// Each entry: icon + label + category + a one-line `description` explaining the
// field's purpose (shown as a tooltip in the palette and on the canvas card).
export const FIELD_TYPES = Object.freeze({
  // Input Types
  input: {
    icon: IconTextSize,
    label: 'Text Input',
    category: 'input',
    description: 'A single-line box for short free text — names, references, titles.',
  },
  textarea: {
    icon: IconNotes,
    label: 'Text Area',
    category: 'input',
    description: 'A multi-line box for longer free text — descriptions, notes, comments.',
  },
  // Rich text lives in Input Fields (user decision 2026-08-10) — it's a
  // primary authoring control, not a "special" type.
  textEditor: {
    icon: IconBold,
    label: 'Rich Text',
    category: 'input',
    description: 'A rich-text editor for formatted content the respondent writes.',
  },
  richTextAttachment: {
    icon: IconFileText,
    label: 'Rich Text + Attachments',
    category: 'input',
    description: 'A rich-text editor with inline images and file attachments in one field (replaces a Rich Text + File Upload pair).',
  },
  number: {
    icon: IconHash,
    label: 'Number',
    category: 'input',
    description: 'A numeric entry for quantities, counts, or measurements.',
  },
  email: {
    icon: IconMail,
    label: 'Email Address',
    category: 'input',
    description: 'An email field that validates the address format.',
  },
  phone: {
    icon: IconPhone,
    label: 'Phone Number',
    category: 'input',
    description: 'A phone number field with a country-code selector.',
  },
  password: {
    icon: IconLock,
    label: 'Password',
    category: 'input',
    description: 'A masked text field for secrets or passwords.',
  },

  // Selection Types
  select: {
    icon: IconSelector,
    label: 'Dropdown',
    category: 'selection',
    description: 'A single choice picked from a fixed list of options.',
  },
  checkbox: {
    icon: IconSquareCheck,
    label: 'Checkbox',
    category: 'selection',
    description: 'A single yes/no tick, or a multi-select set when you add options.',
  },
  // UI label only (user decision 2026-08-10) — the type key stays optionGroup.
  optionGroup: {
    icon: IconListCheck,
    label: 'Multiple Choice',
    category: 'selection',
    description:
      'A set of choices. Pick whether the respondent may give one answer (radio) or several (checkboxes) — the control on the field.',
  },
  checklist: {
    icon: IconTable,
    label: 'Checklist',
    category: 'widget',
    description: 'A rows×columns grid — items down the side, a fixed answer set (e.g. Yes/No/N/A) across the top.',
  },
  lookup: {
    icon: IconDatabaseSearch,
    label: 'Lookup (entity)',
    category: 'selection',
    description: 'A dropdown whose options load live from a company list — Item, Supplier, Site, Department, User, Equipment, or one of your Option Sets.',
  },

  // Special Types
  datetime: {
    icon: IconCalendar,
    label: 'Date/Time',
    category: 'special',
    description: 'A date and/or time picker.',
  },
  file: {
    icon: IconPaperclip,
    label: 'File Upload',
    category: 'special',
    description: 'Lets respondents attach one or more files.',
  },
  photo: {
    icon: IconCamera,
    label: 'Photo',
    category: 'special',
    description: 'Capture from the camera or upload a photo.',
  },
  rating: {
    icon: IconStar,
    label: 'Rating',
    category: 'special',
    description: 'A star rating on a fixed scale.',
  },
  slider: {
    icon: IconAdjustments,
    label: 'Slider',
    category: 'special',
    description: 'Pick a number on a sliding scale.',
  },
  toggle: {
    icon: IconToggleRight,
    label: 'Toggle',
    category: 'special',
    description: 'A simple on/off switch.',
  },
  colorPicker: {
    icon: IconPalette,
    label: 'Color Picker',
    category: 'special',
    description: 'Pick a color value.',
  },
  signature: {
    icon: IconSignature,
    label: 'Signature',
    category: 'special',
    description: 'Capture a drawn signature.',
  },

  // Layout Types
  header: {
    icon: IconHeading,
    label: 'Heading',
    category: 'layout',
    description: 'A display-only heading with optional subheading. Not an input.',
  },
  section: {
    icon: IconLayoutList,
    label: 'Section',
    category: 'layout',
    description: 'Groups related fields under a titled, optionally collapsible block.',
  },
  row: {
    icon: IconColumns,
    label: 'Row',
    category: 'layout',
    description: 'Lays out its child fields side by side.',
  },
  column: {
    icon: IconLayoutRows,
    label: 'Column',
    category: 'layout',
    description: 'Stacks its child fields vertically.',
  },
  repeater: {
    icon: IconRepeat,
    label: 'Repeater',
    category: 'layout',
    description: 'A repeating group of fields respondents can add multiple times.',
  },
  separator: {
    icon: IconMinus,
    label: 'Separator',
    category: 'layout',
    description: 'A horizontal divider line. Not an input.',
  },
  instructions: {
    icon: IconInfoCircle,
    label: 'Instructions',
    category: 'layout',
    description: 'A display-only rich-text block for guidance (link SOPs via #). Not an input.',
  },

  // widgets
  inputTable: {
    icon: IconGrid3x3,
    label: 'Input Table',
    category: 'widget',
    description: 'A table of fields (columns) respondents fill in row by row — e.g. a line-item or product list.',
  },

  // tools
  rca: {
    icon: IconSitemap,
    label: 'Root Cause Analysis',
    category: 'tools',
    description: 'A Root Cause Analysis widget (5-Whys / Fishbone).',
  },
  riskAssessment: {
    icon: IconLayoutGrid,
    label: 'Risk Assessment',
    category: 'tools',
    description: 'A risk assessment matrix (likelihood × severity).',
  },
})

export const WIDGET_CONFIG = Object.freeze({
  inputTable: {
    type: 'repeater',
    // Marks this repeater as an Input Table so the builder shows the column
    // manager (add/remove columns) instead of the raw nested-repeater drop zone.
    // At runtime it's still an ordinary repeater; respondents add rows.
    widget: 'inputTable',
    // 'table' → real table (item label = fixed first column); 'cards' → stacked
    // item cards (the plain-repeater look). Toggle in the settings panel.
    layout: 'table',
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

// Field layout widths → 12-column grid span. Fields flow left-to-right and
// pack into rows; all spans evenly divide 12 so rows never leave a gap
// (½+½, ⅓+⅓+⅓, ¼+¼+¼+¼). Used by the form builder (Width control + canvas)
// and DynamicForm (record-time render). `width` lives on each field's schema.
export const FIELD_WIDTHS = Object.freeze([
  { value: 'full', label: 'Full', span: 12 },
  { value: 'half', label: '½', span: 6 },
  { value: 'third', label: '⅓', span: 4 },
  { value: 'quarter', label: '¼', span: 3 },
])

const WIDTH_SPAN = Object.freeze(Object.fromEntries(FIELD_WIDTHS.map((w) => [w.value, w.span])))

/** Resolve a field's `width` to its 12-col span (defaults to full = 12). */
export function fieldWidthSpan(width) {
  return WIDTH_SPAN[width] ?? 12
}

export const FIELD_TYPES_CONFIG = Object.freeze({
  base: {
    name: '',
    label: '',
    placeholder: '',
    hint: '',
    required: false,
    readonly: false,
    disabled: false,
    // Layout width — fields flow left-to-right and pack into rows by their
    // span (see FIELD_WIDTHS). 'full' = a row to itself. Missing = treated as
    // full, so pre-existing schemas are unaffected.
    width: 'full',
    // Hide on the rendered/submitted form (still shown + editable in the
    // builder). Missing = visible, so pre-existing schemas are unaffected.
    hidden: false,
    class: '',
    style: '',
  },
  // Choice fields start with ONE option rather than an empty list (user
  // request 2026-08-15, Google Forms parity): a brand-new choice field that
  // renders nothing looks broken, and "Option 1" is the obvious thing to type
  // over. Applies to Dropdown, Multiple Choice and Checkboxes — `radio` is an
  // alias of `select`, so it inherits this too.
  select: {
    options: ['Option 1'],
  },
  get radio() {
    return this.select
  },
  optionGroup: {
    options: ['Option 1'],
    groupType: 'radio',
    inline: false,
  },
  lookup: {
    // Which company table this field resolves against (see LOOKUP_ENTITIES).
    lookupEntity: 'product',
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
  email: {
    // Blank = use the built-in email validation; set a custom regex to override.
    formatRegex: '',
  },
  phone: {
    defaultCountry: 'US',
    // '#' = a digit; literals are kept. Drives both the input mask and the
    // default validation (required digit count).
    mask: '###-###-####',
    // Blank = validate by the mask's digit count; set a regex to override.
    formatRegex: '',
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
  signature: {
    // Canvas height in px (BaseSignaturePad). Value is stored as a data-URL string.
    height: 180,
  },
  header: {
    text: 'Heading',
    subtext: '',
    size: 'large', // 'default' | 'large' | 'small'
    align: 'center', // 'left' | 'center' | 'right'
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

export const PLACEHOLDER_TYPES = new Set([
  'input',
  'textarea',
  'number',
  'password',
  'select',
  'email',
  'phone',
])
export const NO_HINT_TYPES = new Set([
  'separator',
  'section',
  'row',
  'column',
  'instructions',
  'header',
])
export const TYPE_SETTINGS_TYPES = new Set([
  'number',
  'slider',
  'email',
  'phone',
  'select',
  'radio',
  'optionGroup',
  'lookup',
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
  'header',
])
export const NUMBER_TYPES = new Set(['number', 'slider'])
export const OPTIONS_TYPES = new Set(['select', 'radio', 'optionGroup'])

// Company tables a `lookup` field can bind to. `selectMenu` renders the edit
// control (emits the entity id); `badgeById` renders the readonly value; `idProp`
// is that badge's id prop; `model` + `labelFields` resolve the display label when
// sealing the payload. Keep in sync with the entity triads under
// components/menus + components/badges.
export const LOOKUP_ENTITIES = [
  {
    value: 'product',
    label: 'Product / Item Master',
    selectMenu: 'ProductSelectMenu',
    badgeById: 'ProductBadgeById',
    idProp: 'productId',
    model: 'Product',
    labelFields: ['name'],
  },
  {
    value: 'supplier',
    label: 'Supplier',
    selectMenu: 'SupplierSelectMenu',
    badgeById: 'SupplierBadgeById',
    idProp: 'supplierId',
    model: 'Supplier',
    labelFields: ['name'],
  },
  {
    value: 'site',
    label: 'Site',
    selectMenu: 'SiteSelectMenu',
    badgeById: 'SiteBadgeById',
    idProp: 'siteId',
    model: 'Site',
    labelFields: ['name'],
  },
  {
    value: 'department',
    label: 'Department',
    selectMenu: 'DepartmentSelectMenu',
    badgeById: 'DepartmentBadgeById',
    idProp: 'departmentId',
    model: 'Department',
    labelFields: ['name'],
  },
  {
    value: 'user',
    label: 'User',
    selectMenu: 'UserSelectMenu',
    badgeById: 'UserBadgeById',
    idProp: 'userId',
    model: 'User',
    labelFields: ['firstName', 'lastName'],
  },
  {
    value: 'equipment',
    label: 'Equipment / Instrument',
    selectMenu: 'EquipmentSelectMenu',
    badgeById: 'EquipmentBadgeById',
    idProp: 'equipmentId',
    model: 'Equipment',
    labelFields: ['name'],
  },
  // Global reference lookups (companyId NULL rows synced to every tenant) —
  // replaced the seeded Country/Region option sets 2026-07-24.
  {
    value: 'country',
    label: 'Country',
    selectMenu: 'CountrySelectMenu',
    badgeById: 'CountryBadgeById',
    idProp: 'countryId',
    model: 'Country',
    labelFields: ['name'],
  },
  {
    value: 'region',
    label: 'Region',
    selectMenu: 'RegionSelectMenu',
    badgeById: 'RegionBadgeById',
    idProp: 'regionId',
    model: 'Region',
    labelFields: ['name'],
  },
]
export const LOOKUP_ENTITY_BY_VALUE = Object.fromEntries(LOOKUP_ENTITIES.map((e) => [e.value, e]))
export const NO_LABEL_TYPES = new Set(['row', 'column', 'instructions', 'header'])
// Layout/decor types only — they hold no value, so Required/Readonly/Disabled
// are meaningless. rca/riskAssessment were WRONGLY in this set (2026-08-10):
// they carry a payload, RcaField/RiskAssessmentField honor readonly/disabled,
// and the step-form submit gate already deep-checks their emptiness — the
// builder just never let authors mark them required.
export const NO_STATE_TYPES = new Set([
  'row',
  'column',
  'separator',
  'section',
  'instructions',
  'header',
])

export const DATETIME_MODE_OPTIONS = [
  { label: 'Date & Time', value: 'datetime' },
  { label: 'Date Only', value: 'date' },
  { label: 'Time Only', value: 'time' },
]

// How a Multiple Choice field accepts answers. Named for what the respondent
// can DO rather than for the widget, matching how Google Forms puts it —
// "Radio / Checkbox" described the glyph and left authors guessing whether
// they'd get one answer or several (user report 2026-08-15).
//
// 'toggle' was a third option here and is gone: a yes/no switch isn't a set of
// choices, and Toggle already exists as its own field type. Legacy fields
// stored with groupType 'toggle' still RENDER as a toggle (DynamicForm passes
// the value straight through) — they just can't be created that way anymore.
export const GROUP_TYPE_OPTIONS = [
  { label: 'One answer (radio)', value: 'radio' },
  { label: 'Multiple answers (checkboxes)', value: 'checkbox' },
]

/**
 * The field-type picker that sits next to a field's label on the canvas
 * (user request 2026-08-15, Google Forms parity).
 *
 * These are KINDS, not raw types: "Multiple choice" and "Checkboxes" are the
 * same `optionGroup` type with a different `groupType`, exactly how Google
 * Forms lists them. That's what let the Multiple Choice card drop its own
 * one-answer/multiple-answers dropdown — switching between them is now just
 * switching kind, in the one place a field's type is chosen.
 *
 * Deliberately NOT everything in FIELD_TYPES: only leaf inputs whose config
 * converts cleanly. Checklists, Input Tables, RCA, Risk Assessment and the
 * layout containers carry structure (rows, columns, templates, children) that
 * no other type can hold, so they don't offer the picker at all rather than
 * silently dropping it.
 */
// Ordered by how often QMS forms actually use them, not alphabetically or by
// palette category (user request 2026-08-15): narrative capture with evidence
// attached — findings, investigations, containment write-ups — is the bread
// and butter here, so the rich-text pair sits near the top rather than buried
// under the plain inputs.
export const FIELD_KIND_OPTIONS = [
  { id: 'input', label: 'Short answer', type: 'input' },
  { id: 'textarea', label: 'Paragraph', type: 'textarea' },
  { id: 'textEditor', label: 'Rich text', type: 'textEditor' },
  {
    id: 'richTextAttachment',
    label: 'Rich text + attachments',
    type: 'richTextAttachment',
  },
  { id: 'optionGroup:radio', label: 'Multiple choice', type: 'optionGroup', groupType: 'radio' },
  { id: 'optionGroup:checkbox', label: 'Checkboxes', type: 'optionGroup', groupType: 'checkbox' },
  { id: 'select', label: 'Dropdown', type: 'select' },
  { id: 'datetime', label: 'Date / time', type: 'datetime' },
  { id: 'file', label: 'File upload', type: 'file' },
  { id: 'lookup', label: 'Lookup (Item, Supplier, Site…)', type: 'lookup' },
  { id: 'number', label: 'Number', type: 'number' },
  { id: 'checkbox', label: 'Single checkbox', type: 'checkbox' },
  { id: 'toggle', label: 'Toggle', type: 'toggle' },
  { id: 'signature', label: 'Signature', type: 'signature' },
  { id: 'photo', label: 'Photo', type: 'photo' },
  { id: 'rating', label: 'Rating', type: 'rating' },
  { id: 'slider', label: 'Slider', type: 'slider' },
  { id: 'email', label: 'Email', type: 'email' },
  { id: 'phone', label: 'Phone', type: 'phone' },
  { id: 'colorPicker', label: 'Color picker', type: 'colorPicker' },
]

/** The kind id for a field as stored (optionGroup splits on groupType). */
export function fieldKindId(field) {
  if (!field) return null
  if (field.type === 'optionGroup') {
    return field.groupType === 'checkbox' ? 'optionGroup:checkbox' : 'optionGroup:radio'
  }
  return FIELD_KIND_OPTIONS.some((k) => k.id === field.type) ? field.type : null
}

export const COLUMN_INPUT_TYPES = [
  { label: 'Radio', value: 'radio' },
  { label: 'Checkbox', value: 'checkbox' },
  // ONE column holding a mutually-exclusive radio set (or checkbox set with
  // groupType 'checkbox'), options inline, horizontal or vertical. The safe
  // alternative to separate Radio columns (whose stale keys break read-back).
  { label: 'Option Group', value: 'optionGroup' },
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
