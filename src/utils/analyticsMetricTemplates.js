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
 * documents, quality_events and audit_findings did NOT join that machine and
 * keep their own: documents are ACTIVE / ARCHIVED, events are DRAFT / OPEN /
 * UNDER_REVIEW / AWAITING_DECISION / CLOSED / CANCELLED, and findings are OPEN /
 * IN_REVIEW / IN_REMEDIATION / VERIFIED / CLOSED / CANCELLED.
 *
 * ── THE SEVEN MODULES, AND WHY THERE ARE NO OTHERS ──────────────────────────
 * analytics_module_fields is seeded by exactly two migrations, and between them
 * they register seven module/source-table pairs: ncr, capa and document_control
 * (20260828140000) and complaints, change_control, quality_events and
 * audit_findings (20260917120000). A template for anything else — inspections,
 * training, equipment, customer_complaints — has nowhere to resolve its columns
 * and fails to compile, so the coverage here stops where the registry does.
 *
 * ── WHAT IS DELIBERATELY ABSENT ─────────────────────────────────────────────
 * "Overdue CAPAs", "Documents due for review", "closed within 30 days" and every
 * other template phrased against today's date. They need a due_date < now()
 * comparison, and the compiler's relational operators compare a column to a
 * quote_literal()'d CONSTANT — there is no token for "today" and no way to
 * express one. A template pretending otherwise would be the fake capability this
 * work exists to avoid.
 *
 * Its near neighbours ARE here, because they are different questions rather than
 * consolation prizes: "documents never reviewed", "findings with no due date"
 * and "open changes not yet approved" all ask about an ABSENCE on the row, which
 * isNull answers exactly. A finding with no due date can never be overdue, which
 * is the reason it escapes notice.
 *
 * Also absent: anything needing a duration (time-to-close, cycle time), which
 * would be one date minus another and the compiler measures a single column;
 * anything spanning two tables, since there is no join — a finding's SITE lives
 * on its audit instance and is simply not reachable; and anything needing OR,
 * because filters combine with AND only.
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
  {
    id: 'capa-closure-rate',
    moduleId: 'capa',
    name: 'CAPA closure rate',
    description: 'The share of raised CAPAs that have reached a closed state.',
    // A ratio, not two counts a reader divides in their head. The denominator is
    // every row the shared filters leave (here: all of them) and the numerator
    // is the same rows FILTERed — which is why the numerator predicate must name
    // a registered, filterable column exactly as a filter row would.
    direction: 'higher_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'capas',
      timeField: 'created_at',
      measure: {
        type: MEASURES.RATIO,
        numerator: [{ field: 'status_id', op: 'in', values: ['CLOSED'] }],
      },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'capa-by-source',
    moduleId: 'capa',
    name: 'CAPAs by source',
    description: 'What triggers CAPAs — audit, complaint, nonconformance and so on.',
    // source_type, not source_id. The CAPA table names this column differently
    // from the NCR one, which is exactly why the registry is read per table
    // rather than a convention being assumed across them.
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'capas',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['source_type'],
    },
  },
  {
    id: 'capa-by-root-cause',
    moduleId: 'capa',
    name: 'CAPAs by root cause',
    description: 'Which root-cause categories keep producing corrective action.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'capas',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['root_cause_category_id'],
    },
  },
  {
    id: 'capa-verified',
    moduleId: 'capa',
    name: 'CAPAs verified effective',
    description: 'CAPAs whose effectiveness check was completed, by verification date.',
    // Counted by verified_at with no status filter at all: a row only carries a
    // verified_at once verification happened, so the date IS the condition. An
    // extra status filter would narrow it to CAPAs both verified AND currently
    // closed, which silently drops any verified row reopened afterwards.
    direction: 'higher_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'capas',
      timeField: 'verified_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'capa-by-owner',
    moduleId: 'capa',
    name: 'Open CAPAs by owner',
    description: 'How the open CAPA workload is distributed across owners.',
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'capas',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'status_id', op: 'in', values: ['OPEN'] }],
      groupBy: ['owner_id'],
    },
  },
  {
    id: 'capa-unowned',
    moduleId: 'capa',
    name: 'Unassigned CAPAs',
    description: 'Open CAPAs with nobody named as owner.',
    // isNull is the one operator that expresses an ABSENCE, and this is the
    // question it exists for. Pairing it with the open filter matters: a closed
    // CAPA with no owner is history, not a gap someone should act on.
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'capas',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [
        { field: 'status_id', op: 'in', values: ['OPEN'] },
        { field: 'owner_id', op: 'isNull', values: [] },
      ],
      groupBy: [],
    },
  },
  {
    id: 'capa-supplier-related',
    moduleId: 'capa',
    name: 'Supplier-related CAPAs',
    description: 'CAPAs attributed to a supplier, broken down by which one.',
    // isNotNull filters to the rows that HAVE a supplier, then groups by it.
    // Without the filter the breakdown's largest bucket is "no supplier", which
    // is every internal CAPA and tells a supplier-quality reader nothing.
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'capas',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'supplier_id', op: 'isNotNull', values: [] }],
      groupBy: ['supplier_id'],
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
  {
    id: 'ncr-closed',
    moduleId: 'ncr',
    name: 'Nonconformances closed',
    description: 'Nonconformances closed in each period, counted by their closure date.',
    direction: 'higher_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'nonconformances',
      timeField: 'closed_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'status_id', op: 'in', values: ['CLOSED'] }],
      groupBy: [],
    },
  },
  {
    id: 'ncr-closure-rate',
    moduleId: 'ncr',
    name: 'Nonconformance closure rate',
    description: 'The share of raised nonconformances that have been closed.',
    direction: 'higher_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'nonconformances',
      timeField: 'created_at',
      measure: {
        type: MEASURES.RATIO,
        numerator: [{ field: 'status_id', op: 'in', values: ['CLOSED'] }],
      },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'ncr-detected',
    moduleId: 'ncr',
    name: 'Nonconformances by detection date',
    description: 'When nonconformances actually occurred, rather than when they were logged.',
    // detected_at, not created_at. The gap between the two is reporting lag, and
    // a trend read on created_at moves when the backlog is cleared rather than
    // when quality changes. Both dates are registered so both questions are
    // askable; this template exists to make the choice visible.
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'nonconformances',
      timeField: 'detected_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'ncr-by-source',
    moduleId: 'ncr',
    name: 'Nonconformances by source',
    description: 'Which process surfaces nonconformances — inspection, audit, complaint.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'nonconformances',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['source_id'],
    },
  },
  {
    id: 'ncr-by-site-and-type',
    moduleId: 'ncr',
    name: 'Nonconformances by site and type',
    description: 'A two-dimensional view of where nonconformances arise and of what kind.',
    // Two dimensions, under the cap of three. Worth shipping as a template
    // because the second groupBy is the feature people do not discover: the
    // builder allows it, and nothing else in the product hints that it can.
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'nonconformances',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['site_id', 'type_id'],
    },
  },
  {
    id: 'ncr-supplier-related',
    moduleId: 'ncr',
    name: 'Supplier nonconformances',
    description: 'Nonconformances attributed to a supplier, broken down by which one.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'nonconformances',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'supplier_id', op: 'isNotNull', values: [] }],
      groupBy: ['supplier_id'],
    },
  },
  {
    id: 'ncr-products-affected',
    moduleId: 'ncr',
    name: 'Products affected by nonconformances',
    description: 'How many different products appear on nonconformances in each period.',
    // countDistinct, which answers a question no count can: ten nonconformances
    // against one product is a product problem, and against ten products is a
    // process one. The compiler only requires the field be registered and
    // filterable — unlike sum and avg, it does not have to be a number.
    direction: 'lower_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'nonconformances',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT_DISTINCT, field: 'product_id' },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'ncr-unowned',
    moduleId: 'ncr',
    name: 'Unassigned nonconformances',
    description: 'Open nonconformances with nobody named as owner.',
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'nonconformances',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [
        { field: 'status_id', op: 'in', values: ['OPEN'] },
        { field: 'owner_id', op: 'isNull', values: [] },
      ],
      groupBy: [],
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
  {
    id: 'doc-archived',
    moduleId: 'document_control',
    name: 'Documents archived',
    description: 'Documents taken out of force in each period, by obsoletion date.',
    // Counted by obsoleted_at, which is when it left circulation — created_at
    // would date an archived document to when it was first written, which puts
    // this year's withdrawals on a chart five years ago.
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'documents',
      timeField: 'obsoleted_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'status_id', op: 'in', values: ['ARCHIVED'] }],
      groupBy: [],
    },
  },
  {
    id: 'doc-reviewed',
    moduleId: 'document_control',
    name: 'Documents reviewed',
    description: 'Periodic reviews completed in each period, by review date.',
    // The honest version of "documents due for review". The compiler cannot
    // compare last_reviewed_at to today, so it cannot say what is OVERDUE — but
    // counting reviews as they land answers the adjacent question (is review
    // activity keeping up?) without pretending to the one it cannot.
    direction: 'higher_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'documents',
      timeField: 'last_reviewed_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'status_id', op: 'in', values: ['ACTIVE'] }],
      groupBy: [],
    },
  },
  {
    id: 'doc-never-reviewed',
    moduleId: 'document_control',
    name: 'Documents never reviewed',
    description: 'Active documents with no recorded review at all.',
    // Also NOT an overdue metric, and the distinction is the point: "has no
    // review date" is a property of the row, checkable with isNull, while "its
    // review date is more than a year ago" needs a comparison to today that the
    // compiler has no token for.
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'documents',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [
        { field: 'status_id', op: 'in', values: ['ACTIVE'] },
        { field: 'last_reviewed_at', op: 'isNull', values: [] },
      ],
      groupBy: [],
    },
  },
  {
    id: 'doc-by-owner',
    moduleId: 'document_control',
    name: 'Active documents by owner',
    description: 'Who carries the document-ownership load.',
    // user_id is the owner on this table, NOT owner_id — documents name the
    // column differently from every other module here, and author_id is a
    // different person again. The registry is what settles it.
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'documents',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'status_id', op: 'in', values: ['ACTIVE'] }],
      groupBy: ['user_id'],
    },
  },
  {
    id: 'doc-by-standard',
    moduleId: 'document_control',
    name: 'Documents by standard',
    description: 'Which standard or clause each controlled document answers to.',
    direction: 'neutral',
    grain: 'year',
    definition: {
      sourceTable: 'documents',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'related_standard_id', op: 'isNotNull', values: [] }],
      groupBy: ['related_standard_id'],
    },
  },
  {
    id: 'doc-unowned',
    moduleId: 'document_control',
    name: 'Active documents with no owner',
    description: 'Documents in force that nobody is named as responsible for.',
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'documents',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [
        { field: 'status_id', op: 'in', values: ['ACTIVE'] },
        { field: 'user_id', op: 'isNull', values: [] },
      ],
      groupBy: [],
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
  {
    id: 'complaint-resolved',
    moduleId: 'complaints',
    name: 'Complaints resolved',
    description: 'Complaints resolved in each period, counted by their resolution date.',
    // resolved_at and closed_at are different dates on this table: resolution is
    // when the customer got an answer, closure is when the record was finished
    // administratively. Counting by resolved_at is the one a quality manager
    // means by "how fast are we resolving complaints".
    direction: 'higher_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'complaints',
      timeField: 'resolved_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'complaint-resolution-rate',
    moduleId: 'complaints',
    name: 'Complaint closure rate',
    description: 'The share of logged complaints that have reached a closed state.',
    direction: 'higher_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'complaints',
      timeField: 'created_at',
      measure: {
        type: MEASURES.RATIO,
        numerator: [{ field: 'status_id', op: 'in', values: ['CLOSED'] }],
      },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'complaint-by-category',
    moduleId: 'complaints',
    name: 'Complaints by category',
    description: 'What customers are complaining about.',
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'complaints',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['category_id'],
    },
  },
  {
    id: 'complaint-by-product',
    moduleId: 'complaints',
    name: 'Complaints by product',
    description: 'Which products attract complaints.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'complaints',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'product_id', op: 'isNotNull', values: [] }],
      groupBy: ['product_id'],
    },
  },
  {
    id: 'complaint-reportable',
    moduleId: 'complaints',
    name: 'Regulatory-reportable complaints',
    description: 'Complaints assessed as requiring a report to a regulator.',
    // The same boolean-via-`in` treatment as the safety template above. The four
    // booleans on this table are registered filterable but NOT groupable, by
    // design — a two-bucket breakdown is a filter wearing a costume and it costs
    // one of the three dimension slots.
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'complaints',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'regulatory_reportable', op: 'in', values: ['true'] }],
      groupBy: [],
    },
  },
  {
    id: 'complaint-repeat',
    moduleId: 'complaints',
    name: 'Repeat-issue complaints',
    description: 'Complaints flagged as a recurrence of a known problem.',
    direction: 'lower_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'complaints',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'repeat_issue', op: 'in', values: ['true'] }],
      groupBy: ['category_id'],
    },
  },
  {
    id: 'complaint-by-risk',
    moduleId: 'complaints',
    name: 'Open complaints by risk level',
    description: 'How the open complaint backlog splits across assessed risk.',
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'complaints',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'status_id', op: 'in', values: ['OPEN'] }],
      groupBy: ['risk_level_id'],
    },
  },
  {
    id: 'complaint-by-source',
    moduleId: 'complaints',
    name: 'Complaints by source',
    description: 'Which channel complaints arrive through.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'complaints',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['source_id'],
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
  {
    id: 'cr-approved',
    moduleId: 'change_control',
    name: 'Change requests approved',
    description: 'Changes approved in each period, counted by their approval date.',
    // approved_at, which the table carries separately from closed_at: approval
    // authorises the work and closure records that it finished. A change control
    // board tracks the first; implementation tracks the second.
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'change_requests',
      timeField: 'approved_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'cr-closed',
    moduleId: 'change_control',
    name: 'Change requests closed',
    description: 'Change requests closed in each period, counted by their closure date.',
    direction: 'higher_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'change_requests',
      timeField: 'closed_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'status_id', op: 'in', values: ['CLOSED'] }],
      groupBy: [],
    },
  },
  {
    id: 'cr-cancelled-rate',
    moduleId: 'change_control',
    name: 'Change requests cancelled',
    description: 'The share of raised change requests that were cancelled rather than completed.',
    // CANCELLED exists in the unified vocabulary and is worth its own figure: a
    // rising cancellation share usually means changes are being raised before
    // they are properly scoped, which no count of closures would reveal.
    direction: 'lower_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'change_requests',
      timeField: 'created_at',
      measure: {
        type: MEASURES.RATIO,
        numerator: [{ field: 'status_id', op: 'in', values: ['CANCELLED'] }],
      },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'cr-by-classification',
    moduleId: 'change_control',
    name: 'Change requests by classification',
    description: 'Major, minor and the rest — how changes are classified on intake.',
    // classification is a plain text column with no lookup table, so the
    // breakdown shows the stored value verbatim rather than a resolved label.
    // That is the registry's design, not a gap: there is no enum table to join.
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'change_requests',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['classification'],
    },
  },
  {
    id: 'cr-regulatory-impact',
    moduleId: 'change_control',
    name: 'Change requests by regulatory impact',
    description: 'How many changes touch a regulated aspect of the system.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'change_requests',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['regulatory_impact'],
    },
  },
  {
    id: 'cr-by-department',
    moduleId: 'change_control',
    name: 'Change requests by department',
    description: 'Where change is originating across the organisation.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'change_requests',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['department_id'],
    },
  },
  {
    id: 'cr-open-by-priority',
    moduleId: 'change_control',
    name: 'Open change requests by priority',
    description: 'How the open change backlog splits across priority levels.',
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'change_requests',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'status_id', op: 'in', values: ['OPEN'] }],
      groupBy: ['priority_id'],
    },
  },
  {
    id: 'cr-unapproved',
    moduleId: 'change_control',
    name: 'Open changes not yet approved',
    description: 'Change requests in flight with no approval recorded against them.',
    // "Not yet approved" as an absence of approved_at, which is a fact about the
    // row. Note this cannot say how LONG they have been waiting — that would be
    // a comparison against today, which the compiler has no way to express.
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'change_requests',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [
        { field: 'status_id', op: 'in', values: ['OPEN'] },
        { field: 'approved_at', op: 'isNull', values: [] },
      ],
      groupBy: [],
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
  {
    id: 'qe-by-severity',
    moduleId: 'quality_events',
    name: 'Quality events by severity',
    description: 'How reported events split across severity levels.',
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'quality_events',
      timeField: 'reported_date',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['severity_id'],
    },
  },
  {
    id: 'qe-occurrence',
    moduleId: 'quality_events',
    name: 'Quality events by occurrence date',
    description: 'When events actually happened, rather than when they were reported.',
    // occurrence_date against reported_date is this module's reporting-lag pair.
    // ⚠ There is no closed_at on quality_events at all — the three dates are
    // occurrence, reported and review due — so "events closed per month" cannot
    // be expressed here the way it can for CAPA and NCR.
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'quality_events',
      timeField: 'occurrence_date',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'qe-closure-rate',
    moduleId: 'quality_events',
    name: 'Quality event closure rate',
    description: 'The share of reported events that have reached a closed state.',
    direction: 'higher_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'quality_events',
      timeField: 'reported_date',
      measure: {
        type: MEASURES.RATIO,
        numerator: [{ field: 'status_id', op: 'in', values: ['CLOSED'] }],
      },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'qe-by-site',
    moduleId: 'quality_events',
    name: 'Quality events by site',
    description: 'Where events are being reported across sites.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'quality_events',
      timeField: 'reported_date',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['site_id'],
    },
  },
  {
    id: 'qe-by-department',
    moduleId: 'quality_events',
    name: 'Quality events by department',
    description: 'Which departments generate the most events.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'quality_events',
      timeField: 'reported_date',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['department_id'],
    },
  },
  {
    id: 'qe-open-by-assignee',
    moduleId: 'quality_events',
    name: 'Open quality events by assignee',
    description: 'How in-flight event work is distributed across the people handling it.',
    // assigned_to_user_id, not owner_id — this table has no owner column, and
    // reported_by_user_id is a different person. Both are registered because
    // "events by reporter" and "events by assignee" are genuinely different
    // questions; this template is the assignee one.
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'quality_events',
      timeField: 'reported_date',
      measure: { type: MEASURES.COUNT },
      filters: [
        { field: 'status_id', op: 'in', values: ['OPEN', 'UNDER_REVIEW', 'AWAITING_DECISION'] },
      ],
      groupBy: ['assigned_to_user_id'],
    },
  },
  {
    id: 'qe-unassigned',
    moduleId: 'quality_events',
    name: 'Unassigned quality events',
    description: 'Events still in flight with nobody assigned to work them.',
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'quality_events',
      timeField: 'reported_date',
      measure: { type: MEASURES.COUNT },
      filters: [
        { field: 'status_id', op: 'in', values: ['OPEN', 'UNDER_REVIEW', 'AWAITING_DECISION'] },
        { field: 'assigned_to_user_id', op: 'isNull', values: [] },
      ],
      groupBy: [],
    },
  },
  {
    id: 'qe-awaiting-decision',
    moduleId: 'quality_events',
    name: 'Quality events awaiting decision',
    description: 'Events that have been reviewed and are waiting on a disposition.',
    // A single status from this module's longer vocabulary. The reason it earns
    // its own template rather than being folded into the in-progress count is
    // that it is the stage where work has STOPPED pending someone deciding —
    // a different management action from the rest of the backlog.
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'quality_events',
      timeField: 'reported_date',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'status_id', op: 'in', values: ['AWAITING_DECISION'] }],
      groupBy: [],
    },
  },
  {
    id: 'qe-supplier-related',
    moduleId: 'quality_events',
    name: 'Supplier-related quality events',
    description: 'Events attributed to a supplier, broken down by which one.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'quality_events',
      timeField: 'reported_date',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'supplier_id', op: 'isNotNull', values: [] }],
      groupBy: ['supplier_id'],
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
  {
    id: 'finding-total-risk',
    moduleId: 'audit_findings',
    name: 'Total open finding risk',
    description: 'The risk scores of unresolved findings added together.',
    // sum rather than avg, and the pair is deliberate: an average hides volume
    // (one catastrophic finding and fifty trivial ones average out to "fine"),
    // while a total hides concentration. Both columns the compiler will accept
    // for a sum — severity_score and risk_score — are registered as number.
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'audit_findings',
      timeField: 'created_at',
      measure: { type: MEASURES.SUM, field: 'risk_score' },
      filters: [
        { field: 'status_id', op: 'in', values: ['OPEN', 'IN_REVIEW', 'IN_REMEDIATION'] },
      ],
      groupBy: [],
    },
  },
  {
    id: 'finding-avg-severity',
    moduleId: 'audit_findings',
    name: 'Average finding severity score',
    description: 'The mean severity score of findings raised in each period.',
    direction: 'lower_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'audit_findings',
      timeField: 'created_at',
      measure: { type: MEASURES.AVG, field: 'severity_score' },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'finding-by-type',
    moduleId: 'audit_findings',
    name: 'Audit findings by type',
    description: 'Major, minor, observation — how findings are classified.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'audit_findings',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['finding_type_id'],
    },
  },
  {
    id: 'finding-by-process-area',
    moduleId: 'audit_findings',
    name: 'Audit findings by process area',
    description: 'Which processes audits keep finding problems in.',
    // process_area is free-ish text with no lookup table, so the breakdown shows
    // whatever was typed. That makes it only as good as the entry discipline —
    // registered anyway, because a repeated area name is exactly the signal an
    // audit programme is looking for.
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'audit_findings',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['process_area'],
    },
  },
  {
    id: 'finding-closed',
    moduleId: 'audit_findings',
    name: 'Audit findings closed',
    description: 'Findings closed in each period, counted by their closure date.',
    // CLOSED only, not CLOSED plus VERIFIED: in this vocabulary verification is
    // an earlier stage on the way to closure, so including it would double-count
    // a finding that passes through both.
    direction: 'higher_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'audit_findings',
      timeField: 'closed_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'status_id', op: 'in', values: ['CLOSED'] }],
      groupBy: [],
    },
  },
  {
    id: 'finding-closure-rate',
    moduleId: 'audit_findings',
    name: 'Audit finding closure rate',
    description: 'The share of raised findings that have been verified or closed.',
    // Here VERIFIED and CLOSED are counted together on purpose — as a RESOLUTION
    // rate, a finding that has passed verification is no longer outstanding even
    // if the paperwork is not filed. No double-counting risk, because each row
    // sits in exactly one status at the moment the rollup reads it.
    direction: 'higher_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'audit_findings',
      timeField: 'created_at',
      measure: {
        type: MEASURES.RATIO,
        numerator: [{ field: 'status_id', op: 'in', values: ['VERIFIED', 'CLOSED'] }],
      },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'finding-unassigned',
    moduleId: 'audit_findings',
    name: 'Unassigned audit findings',
    description: 'Unresolved findings with nobody assigned to remediate them.',
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'audit_findings',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [
        { field: 'status_id', op: 'in', values: ['OPEN', 'IN_REVIEW', 'IN_REMEDIATION'] },
        { field: 'assigned_to_user_id', op: 'isNull', values: [] },
      ],
      groupBy: [],
    },
  },
  {
    id: 'finding-no-due-date',
    moduleId: 'audit_findings',
    name: 'Findings with no due date',
    description: 'Unresolved findings that carry no remediation deadline at all.',
    // The closest this compiler can get to an overdue metric, and it is a
    // genuinely different question rather than a substitute: a finding with no
    // due date can never BE overdue, which is precisely why it goes unnoticed.
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'audit_findings',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [
        { field: 'status_id', op: 'in', values: ['OPEN', 'IN_REVIEW', 'IN_REMEDIATION'] },
        { field: 'due_date', op: 'isNull', values: [] },
      ],
      groupBy: [],
    },
  },
  {
    id: 'finding-supplier-related',
    moduleId: 'audit_findings',
    name: 'Supplier audit findings',
    description: 'Findings raised against a supplier, broken down by which one.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'audit_findings',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'supplier_id', op: 'isNotNull', values: [] }],
      groupBy: ['supplier_id'],
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
