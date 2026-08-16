/**
 * Predefined QMS Form Templates
 */

export const QMS_TEMPLATES = [
  {
    title: 'Deviation Report',
    code: 'DEV-TMP',
    description: 'Report process or quality deviations.',
    documentTypeId: 'DEVIATION',
    schema: [
      {
        type: 'section',
        label: 'General Information',
        name: 'generalInfo',
        children: [
          {
            type: 'row',
            name: 'row1',
            children: [
              {
                type: 'input',
                label: 'Deviation Title',
                name: 'title',
                required: true,
                readonly: false,
                disabled: false,
                class: 'tw:flex-1',
              },
              {
                type: 'datetime',
                label: 'Date of Occurrence',
                name: 'occurrenceDate',
                required: true,
                readonly: false,
                disabled: false,
                class: 'tw:flex-1',
                mode: 'date',
              },
            ],
            colClass: 'tw:flex-1',
          },
          {
            type: 'select',
            label: 'Department',
            name: 'department',
            required: true,
            readonly: false,
            disabled: false,
            options: [
              'Production',
              'Quality Control',
              'Quality Assurance',
              'Maintenance',
              'Warehouse',
              'HR',
            ],
          },
        ],
      },
      {
        type: 'section',
        label: 'Deviation Details',
        name: 'details',
        children: [
          {
            type: 'textarea',
            label: 'Description of Deviation',
            name: 'description',
            required: true,
            readonly: false,
            disabled: false,
            placeholder: 'Provide a detailed description of what happened...',
          },
          {
            type: 'optionGroup',
            label: 'Impact Level',
            name: 'impactLevel',
            groupType: 'radio',
            inline: true,
            required: true,
            readonly: false,
            disabled: false,
            options: ['Critical', 'Major', 'Minor'],
          },
        ],
      },
      {
        type: 'section',
        label: 'Immediate Actions',
        name: 'immediateActionsSection',
        children: [
          {
            type: 'repeater',
            label: 'Action Items',
            name: 'actions',
            addLabel: 'Add Action',
            itemLabel: 'Action',
            minItems: 1,
            template: [
              {
                type: 'row',
                name: 'actionRow',
                children: [
                  { type: 'input', label: 'Action Taken', name: 'actionTaken', class: 'tw:flex-1' },
                  { type: 'input', label: 'By Whom', name: 'performedBy', class: 'tw:flex-1' },
                  {
                    type: 'datetime',
                    label: 'Date',
                    name: 'actionDate',
                    class: 'tw:flex-1',
                    mode: 'date',
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    title: 'Internal Audit Checklist',
    code: 'AUD-TMP',
    description: 'Standard checklist for internal quality audits.',
    documentTypeId: 'AUDIT',
    schema: [
      {
        type: 'section',
        label: 'Audit Info',
        name: 'auditInfo',
        children: [
          {
            type: 'row',
            name: 'r1',
            colClass: 'tw:flex-1',
            children: [
              { type: 'input', label: 'Lead Auditor', name: 'leadAuditor', class: 'tw:flex-1' },
              {
                type: 'datetime',
                label: 'Audit Date',
                name: 'auditDate',
                class: 'tw:flex-1',
                mode: 'date',
              },
            ],
          },
        ],
      },
      {
        type: 'section',
        label: 'Audit Findings',
        name: 'findings',
        children: [
          {
            type: 'checklist',
            label: 'Quality Requirements',
            name: 'qualityChecklist',
            rows: [
              'Are SOPs followed correctly?',
              'Is equipment calibrated and tagged?',
              'Are training records up to date?',
              'Is the workspace clean and organized?',
              'Are records signed and dated according to GDP?',
            ],
            // ONE mutually-exclusive Option Group ("Multiple choice"), not
            // three standalone radio columns (fixed 2026-08-16). Separate radio
            // COLUMNS are the pattern the Line Clearance seed warns about:
            // radio has no sibling-clear across columns, so re-answering a row
            // leaves the previous column's key behind and the row reads as two
            // contradictory answers. An optionGroup stores one value under one
            // key. `inline` lays the choices out horizontally, as they were.
            columns: [
              {
                label: 'Result',
                value: 'result',
                inputType: 'optionGroup',
                groupType: 'radio',
                inline: true,
                options: ['Compliant', 'Non-Compliant', 'N/A'],
              },
            ],
          },
          {
            type: 'textarea',
            label: 'Audit Comments/Observations',
            name: 'auditComments',
          },
        ],
      },
    ],
  },
  {
    title: 'CAPA Form',
    code: 'CAPA-TMP',
    description: 'Corrective and Preventive Action management.',
    documentTypeId: 'CAPA',
    schema: [
      {
        type: 'section',
        label: 'Problem Statement',
        name: 'problemSection',
        children: [
          {
            type: 'input',
            label: 'CAPA Source',
            name: 'source',
            placeholder: 'Audit, Deviation, Complaint...',
            required: true,
            readonly: false,
            disabled: false,
          },
          {
            type: 'textarea',
            label: 'Root Cause Analysis',
            name: 'rootCause',
            required: true,
            readonly: false,
            disabled: false,
          },
        ],
      },
      {
        type: 'section',
        label: 'Action Plan',
        name: 'actionPlan',
        children: [
          {
            type: 'checklist',
            label: 'Proposed Actions',
            name: 'actionList',
            rows: ['Corrective Action', 'Preventive Action', 'Verification of Effectiveness'],
            columns: [
              { label: 'Assigned To', value: 'assignedTo', inputType: 'text' },
              { label: 'Due Date', value: 'dueDate', inputType: 'date' },
              {
                label: 'Status',
                value: 'status',
                inputType: 'select',
                options: ['Pending', 'In-Progress', 'Completed'],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    title: 'Change Control Request',
    code: 'CC-TMP',
    description: 'Propose and track changes to established systems.',
    documentTypeId: 'CHANGE_CONTROL',
    schema: [
      {
        type: 'section',
        label: 'Change Description',
        name: 'descSection',
        children: [
          {
            type: 'input',
            label: 'Proposed Change',
            name: 'changeTitle',
            required: true,
            readonly: false,
            disabled: false,
          },
          {
            type: 'textarea',
            label: 'Reason for Change',
            name: 'reason',
            required: true,
            readonly: false,
            disabled: false,
          },
          {
            type: 'optionGroup',
            label: 'Type of Change',
            name: 'changeType',
            groupType: 'checkbox',
            options: ['Equipment', 'Software', 'Process', 'Document', 'Raw Material'],
            required: false,
            readonly: false,
            disabled: false,
            inline: true,
          },
        ],
      },
      {
        type: 'section',
        label: 'Impact Assessment',
        name: 'impactSection',
        children: [
          {
            type: 'optionGroup',
            label: 'Regulatory Impact?',
            name: 'regImpact',
            groupType: 'radio',
            inline: true,
            required: false,
            readonly: false,
            disabled: false,
            options: ['Yes', 'No'],
          },
          {
            type: 'textarea',
            label: 'Justification',
            name: 'justification',
            required: false,
            readonly: false,
            disabled: false,
          },
        ],
      },
    ],
  },
]

/**
 * QMS_BLOCKS — fragment-shaped presets for FORM BLOCKS: reusable sections
 * embedded inside a host (workflow step task forms, child-step forms, QC
 * checklists). Unlike QMS_TEMPLATES these are NOT whole standalone forms —
 * each captures one step's evidence. Checklists follow the house pattern:
 * ONE `select` verdict column (Yes/No/N/A) + a text Comments column (radio +
 * text mixes break answer persistence).
 */
export const QMS_BLOCKS = [
  {
    title: 'Task / Action',
    code: 'BLK-TASK',
    schema: [
      {
        type: 'textEditor',
        name: 'description',
        label: 'Description',
        required: true,
        placeholder: 'Describe what was done…',
      },
      { type: 'file', name: 'attachments', label: 'Attachments', required: false, multiple: true },
    ],
  },
  {
    title: 'Yes / No / N.A. Checklist',
    code: 'BLK-CHECKLIST',
    schema: [
      {
        type: 'checklist',
        name: 'checklist',
        label: 'Checklist',
        required: true,
        rows: [
          'Work area inspected',
          'Documentation reviewed',
          'Requirements verified',
          'Records updated',
          'Follow-up actions identified',
        ],
        columns: [
          {
            label: 'Verdict',
            value: 'verdict',
            inputType: 'select',
            options: ['Yes', 'No', 'N/A'],
          },
          { label: 'Comments', value: 'comments', inputType: 'text' },
        ],
      },
    ],
  },
  {
    title: 'Containment Actions',
    code: 'BLK-CONTAINMENT',
    schema: [
      {
        type: 'textEditor',
        name: 'containmentActions',
        label: 'Containment actions taken',
        required: true,
        placeholder: 'What was done to contain the issue…',
      },
      {
        type: 'textEditor',
        name: 'affectedScope',
        label: 'Affected lots / scope',
        required: false,
      },
      { type: 'datetime', name: 'containmentDate', label: 'Containment date', required: true },
      { type: 'file', name: 'evidence', label: 'Evidence', required: false, multiple: true },
    ],
  },
  {
    title: 'Root Cause Narrative',
    code: 'BLK-ROOTCAUSE',
    schema: [
      {
        type: 'textEditor',
        name: 'rootCause',
        label: 'Root cause analysis',
        required: true,
        placeholder: 'What caused the issue and how was it determined…',
      },
      {
        type: 'file',
        name: 'supportingFiles',
        label: 'Supporting files',
        required: false,
        multiple: true,
      },
    ],
  },
  {
    title: 'Sign-off',
    code: 'BLK-SIGNOFF',
    schema: [
      { type: 'signature', name: 'signature', label: 'Signature', required: true },
      {
        type: 'textarea',
        name: 'signoffComments',
        label: 'Comments',
        required: false,
        placeholder: 'Any notes for the record…',
      },
    ],
  },
]

/**
 * The form every Task (ACTION) step starts with: describe what was done, and
 * attach the evidence. Seeded automatically when a Task step is created —
 * the Add-Step wizard used to ask "blank, a QMS preset, or a saved block?"
 * before you could even name the step, which is a design decision nobody has
 * the context for at that moment (user request 2026-08-15). The step editor's
 * Task Form tab still swaps in a block or edits the fields afterwards.
 *
 * Mirrors TASK_ACTION_SCHEMA in bootstrapCompanyDefaults, so a hand-added step
 * matches the seeded workflows' steps.
 */
export const STANDARD_TASK_FORM = [
  {
    name: 'description',
    label: 'Description',
    type: 'textEditor',
    required: true,
    placeholder: 'Describe what was done…',
  },
  { name: 'attachments', label: 'Attachments', type: 'file', required: false, multiple: true },
]

/** Fresh deep copy — callers persist this onto a step and then edit it. */
export function standardTaskForm() {
  return JSON.parse(JSON.stringify(STANDARD_TASK_FORM))
}
