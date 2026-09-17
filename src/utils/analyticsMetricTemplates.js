/**
 * Metric templates — a starting point, not a second schema.
 *
 * ── WHY A TEMPLATE IS JUST A DEFINITION ─────────────────────────────────────
 * Every template below produces exactly the object the builder would have
 * produced by hand, and applying one fills the SAME form fields. There is no
 * template id on the saved row, no server-side template concept and nothing to
 * migrate later: a template is a set of default answers, and once applied it is
 * indistinguishable from a metric someone configured themselves.
 *
 * That is deliberate. A template system with its own persistence would have to
 * answer what happens when the template changes after a metric was created from
 * it, and there is no good answer — the metric is the tenant's, and it must not
 * move under them.
 *
 * ── THE CONSTRAINT THAT SHAPES THIS WHOLE FILE ──────────────────────────────
 * Every column named here must exist in analytics_module_fields for that module
 * and source table, and every status value must exist in the lookup the column
 * points at. Neither is checked at author time: a wrong column or a stale status
 * id produces a template that populates the form, looks entirely reasonable, and
 * fails to compile on save with a message about something the user did not type.
 *
 * So the spec pins both against the registry rather than trusting this comment.
 *
 * ── WHY THE STATUS VALUES LOOK REPETITIVE ───────────────────────────────────
 * capas, nonconformances, complaints and change_requests were all unified onto
 * one DRAFT / OPEN / CLOSED / CANCELLED machine, so "still open" is the same
 * filter in four modules. The pre-unification vocabularies (NEW, IN_PROGRESS,
 * UNDER_REVIEW, APPROVED, IN_IMPLEMENTATION…) no longer exist as rows and a
 * template using one would not compile.
 *
 * documents and audit_findings did NOT join that machine and keep their own:
 * documents are ACTIVE / ARCHIVED, findings are OPEN / IN_REVIEW /
 * IN_REMEDIATION / VERIFIED / CLOSED / CANCELLED.
 *
 * ── WHAT IS DELIBERATELY ABSENT ─────────────────────────────────────────────
 * "Overdue CAPAs", "Documents due for review" and every other template phrased
 * against today's date. They need a due_date < now() comparison, and the
 * compiler's relational operators compare a column to a quote_literal()'d
 * CONSTANT — there is no token for "today" and no way to express one. A template
 * pretending otherwise would be the fake capability this work exists to avoid.
 */
import { MEASURES } from '@/utils/analyticsCustomMetricAccess.js'

/**
 * @typedef {object} MetricTemplate
 * @property {string}  id          Stable key for the list; never persisted.
 * @property {string}  moduleId    An authz module id, as analytics_module_fields uses.
 * @property {string}  name        Prefills the metric name; the user may change it.
 * @property {string}  description Prefills the description AND labels the card.
 * @property {'neutral'|'higher_is_better'|'lower_is_better'} direction
 * @property {'day'|'week'|'month'|'quarter'|'year'} grain
 * @property {object}  definition  Exactly the shape blankDefinition() returns.
 */

/** @type {MetricTemplate[]} */
export const METRIC_TEMPLATES = [
  // ── capa ──────────────────────────────────────────────────────────────────
  {
    id: 'capa-open',
    moduleId: 'capa',
    name: 'Open CAPAs',
    description: 'CAPAs that have been raised and not yet closed or cancelled.',
    // Fewer open CAPAs is better only if they are being CLOSED rather than not
    // raised, which this metric cannot tell apart. Saying "lower is better"
    // would quietly reward under-reporting — the opposite of what a QMS wants.
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'capas',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'status_id', op: 'in', values: ['OPEN'] }],
      groupBy: [],
    },
  },
  {
    id: 'capa-by-priority',
    moduleId: 'capa',
    name: 'CAPAs by priority',
    description: 'How raised CAPAs split across priority levels.',
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'capas',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['priority_id'],
    },
  },
  {
    id: 'capa-by-department',
    moduleId: 'capa',
    name: 'CAPAs by department',
    description: 'Where CAPAs are being raised across the organisation.',
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'capas',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['department_id'],
    },
  },
  {
    id: 'capa-closed',
    moduleId: 'capa',
    name: 'CAPAs closed',
    description: 'CAPAs closed in each period, counted by their closure date.',
    // Counted by closed_at, not created_at — the difference is the whole point
    // of the metric, and it is the distinction the builder's date section is
    // there to make visible.
    direction: 'higher_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'capas',
      timeField: 'closed_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'status_id', op: 'in', values: ['CLOSED'] }],
      groupBy: [],
    },
  },

  // ── ncr ───────────────────────────────────────────────────────────────────
  {
    id: 'ncr-open',
    moduleId: 'ncr',
    name: 'Open nonconformances',
    description: 'Nonconformances raised and not yet closed or cancelled.',
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'nonconformances',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'status_id', op: 'in', values: ['OPEN'] }],
      groupBy: [],
    },
  },
  {
    id: 'ncr-by-severity',
    moduleId: 'ncr',
    name: 'Nonconformances by severity',
    description: 'How raised nonconformances split across severity levels.',
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'nonconformances',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['severity_id'],
    },
  },
  {
    id: 'ncr-by-root-cause',
    moduleId: 'ncr',
    name: 'Nonconformances by root cause',
    description: 'Which root-cause categories recur most often.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'nonconformances',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['root_cause_category_id'],
    },
  },

  // ── document_control ──────────────────────────────────────────────────────
  // ⚠ documents are ACTIVE / ARCHIVED, not the unified vocabulary.
  {
    id: 'doc-active',
    moduleId: 'document_control',
    name: 'Active documents',
    description: 'Controlled documents currently in force.',
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'documents',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'status_id', op: 'in', values: ['ACTIVE'] }],
      groupBy: [],
    },
  },
  {
    id: 'doc-by-type',
    moduleId: 'document_control',
    name: 'Documents by type',
    description: 'How the controlled document set splits across document types.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'documents',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['document_type_id'],
    },
  },
  {
    id: 'doc-by-department',
    moduleId: 'document_control',
    name: 'Documents by department',
    description: 'Which departments own the controlled document set.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'documents',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['department_id'],
    },
  },

  // ── complaints ────────────────────────────────────────────────────────────
  // The INTERNAL quality complaint. Complaint Management (the customer-facing
  // customer_complaints table) is a separate module, granted separately, and is
  // not in the field registry — so it has no templates here.
  {
    id: 'complaint-open',
    moduleId: 'complaints',
    name: 'Open complaints',
    description: 'Quality complaints logged and not yet closed.',
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'complaints',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'status_id', op: 'in', values: ['OPEN'] }],
      groupBy: [],
    },
  },
  {
    id: 'complaint-by-severity',
    moduleId: 'complaints',
    name: 'Complaints by severity',
    description: 'How logged complaints split across severity levels.',
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'complaints',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['severity_id'],
    },
  },
  {
    id: 'complaint-safety',
    moduleId: 'complaints',
    name: 'Safety-related complaints',
    description: 'Complaints flagged as a safety issue when they were assessed.',
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'complaints',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      // A boolean column compared with `in` and the literal 'true' — the
      // compiler quote_literal()s the value and Postgres coerces it against a
      // boolean column, the same way the shipped metrics' filter_sql does.
      filters: [{ field: 'safety_issue', op: 'in', values: ['true'] }],
      groupBy: [],
    },
  },

  // ── change_control ────────────────────────────────────────────────────────
  {
    id: 'cr-open',
    moduleId: 'change_control',
    name: 'Open change requests',
    description: 'Change requests raised and not yet closed or cancelled.',
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'change_requests',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'status_id', op: 'in', values: ['OPEN'] }],
      groupBy: [],
    },
  },
  {
    id: 'cr-by-type',
    moduleId: 'change_control',
    name: 'Change requests by type',
    description: 'How raised change requests split across change types.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'change_requests',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['change_type_id'],
    },
  },

  // ── quality_events ────────────────────────────────────────────────────────
  // ⚠ quality_events kept its own vocabulary: DRAFT / OPEN / UNDER_REVIEW /
  // AWAITING_DECISION / CLOSED / CANCELLED. "Still being worked" is therefore
  // three ids, not one.
  {
    id: 'qe-in-progress',
    moduleId: 'quality_events',
    name: 'Quality events in progress',
    description: 'Events submitted and not yet closed or cancelled.',
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'quality_events',
      timeField: 'reported_date',
      measure: { type: MEASURES.COUNT },
      filters: [
        { field: 'status_id', op: 'in', values: ['OPEN', 'UNDER_REVIEW', 'AWAITING_DECISION'] },
      ],
      groupBy: [],
    },
  },
  {
    id: 'qe-by-category',
    moduleId: 'quality_events',
    name: 'Quality events by category',
    description: 'Which categories of event are reported most often.',
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'quality_events',
      timeField: 'reported_date',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['category_id'],
    },
  },

  // ── audit_findings ────────────────────────────────────────────────────────
  // ⚠ audit_findings keeps its own vocabulary too, and has no site column — a
  // finding's site lives on its audit instance, which the compiler cannot join
  // to. Grouping by status may show raw ids rather than labels for readers
  // without SELECT on audit_finding_statuses; that is pre-existing and
  // documented on analytics_dimension_label_table().
  {
    id: 'finding-open',
    moduleId: 'audit_findings',
    name: 'Open audit findings',
    description: 'Findings raised and not yet verified, closed or cancelled.',
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'audit_findings',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [
        { field: 'status_id', op: 'in', values: ['OPEN', 'IN_REVIEW', 'IN_REMEDIATION'] },
      ],
      groupBy: [],
    },
  },
  {
    id: 'finding-by-department',
    moduleId: 'audit_findings',
    name: 'Audit findings by department',
    description: 'Where audit findings are concentrated.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'audit_findings',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['department_id'],
    },
  },
  {
    id: 'finding-avg-risk',
    moduleId: 'audit_findings',
    name: 'Average finding risk score',
    description: 'The mean risk score of findings raised in each period.',
    // The one template anywhere that is not a count. risk_score is a number
    // column, which the compiler requires for avg — a non-numeric field is
    // rejected with "is not a number, so it cannot be summed or averaged".
    direction: 'lower_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'audit_findings',
      timeField: 'created_at',
      measure: { type: MEASURES.AVG, field: 'risk_score' },
      filters: [],
      groupBy: [],
    },
  },
]

/**
 * Templates for a module, or every template when no module is given.
 *
 * Returns deep copies. The builder mutates the definition it is handed — adding
 * a filter row, clearing a groupBy — and handing out the module-level constant
 * would let the first metric someone builds permanently edit the template for
 * everyone after them, in a way that survives until reload and looks like
 * nothing at all.
 *
 * @param {string|null} moduleId
 * @returns {MetricTemplate[]}
 */
export function templatesForModule(moduleId = null) {
  return METRIC_TEMPLATES.filter((t) => !moduleId || t.moduleId === moduleId).map((t) =>
    JSON.parse(JSON.stringify(t)),
  )
}
