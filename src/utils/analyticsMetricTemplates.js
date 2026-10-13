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
 * documents are ACTIVE / ARCHIVED, and findings are OPEN / IN_REVIEW /
 * IN_REMEDIATION / VERIFIED / CLOSED / CANCELLED.
 *
 * ⚠ quality_events DID join it — DRAFT / OPEN / CLOSED / CANCELLED. This file
 * asserted otherwise until 2026-09-23 and four templates filtered on
 * UNDER_REVIEW / AWAITING_DECISION, which have no row in
 * quality_event_statuses. They compiled, published and matched nothing. The
 * lesson is the one this header already states: a status id is not checked
 * until the metric runs, so a comment claiming a vocabulary is not evidence —
 * the spec below reads the seeding migration instead.
 *
 * ── COVERAGE STOPS WHERE THE REGISTRY DOES ──────────────────────────────────
 * A template can only name columns analytics_module_fields registers for its
 * module; anything else has nowhere to resolve and fails to compile. So this
 * file grows when the registry does, and not before.
 *
 * It was seven modules until 2026-09-23, when 20260923140000 and 20260923170000
 * registered supplier_management, audit_management, tasks, training,
 * training_instances, complaint_management and inspection_qc. Fourteen now.
 *
 * ⚠ training_instances OWNS TWO SOURCE TABLES and they answer different
 * questions. `training_instances` is a ROLLOUT — one course pushed to a group.
 * `training_assignees` is ONE PERSON's record inside it. "How many rollouts are
 * active" and "how many people passed" are not the same number, and a
 * compliance figure that mixes them is wrong in the direction nobody checks.
 *
 * ⚠ complaint_management is NOT `complaints`. Customer-facing complaints
 * (customer_complaints) and internal Quality Complaints (complaints) are
 * separate authz modules, granted independently, and both have templates here.
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
 * DURATIONS ARE NO LONGER ABSENT. This paragraph used to rule out time-to-close
 * and cycle time on the grounds that the compiler measured a single column;
 * 20260923190000 added the `duration` measure, and sixteen templates here now
 * use it. Each counts only records that REACHED the end date — an open CAPA has
 * no closure time, so the backlog does not drag the figure toward zero.
 *
 * Still absent: anything spanning two tables, since there is no join — a
 * finding's SITE lives on its audit instance and is simply not reachable; and
 * anything needing OR, because filters combine with AND only.
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
    id: 'ncr-by-product',
    moduleId: 'ncr',
    name: 'Nonconformances by product',
    description: 'Which products nonconformances are raised against, in each period.',
    // Was a countDistinct ("how many DIFFERENT products"), which the storage
    // cannot answer honestly: figures are rolled up per period/scope bucket and
    // added at read time, so a product appearing in all four quarters counted
    // four times. The compiler refuses countDistinct as of 20260917240000.
    //
    // Counting BY product answers the same business question — ten
    // nonconformances against one product is a product problem, against ten
    // products a process one — and a count grouped by a dimension is additive,
    // so the breakdown and its total are both true.
    direction: 'lower_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'nonconformances',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'product_id', op: 'isNotNull', values: [] }],
      groupBy: ['product_id'],
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
  // ⚠ quality_events IS on the unified machine: DRAFT / OPEN / CLOSED /
  // CANCELLED. It is NOT the six-status vocabulary this file used to claim —
  // UNDER_REVIEW and AWAITING_DECISION have no row in quality_event_statuses
  // and never did in this schema. Four templates filtered on them, compiled
  // cleanly, and returned nothing for ever; the UI showed "Preparing", which
  // reads as "not computed yet" rather than "this status does not exist".
  // Found on Nordic, 2026-09-23. "Still being worked" is therefore
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
        { field: 'status_id', op: 'in', values: ['OPEN'] },
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
        { field: 'status_id', op: 'in', values: ['OPEN'] },
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
        { field: 'status_id', op: 'in', values: ['OPEN'] },
        { field: 'assigned_to_user_id', op: 'isNull', values: [] },
      ],
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
  // ── "Average finding risk/severity score" are deliberately NOT here ───────
  // Two avg templates were removed on 2026-09-17. They were arithmetically
  // broken (the compiler gave avg no denominator, so the rollup summed the
  // per-bucket averages and a mean score of ~7 rendered as ~280) and migration
  // 20260917240000 fixes that by compiling avg as sum/count.
  //
  // They are still not offered, because the fix carries a presentational cost:
  // analytics_compose_value divides for exactly two units, 'percent' and
  // 'days', so a plain mean has to be declared 'days' and the formatter then
  // renders a risk score as "7.2 days". Correct number, wrong noun — and a
  // starting template is the wrong place to hand someone that.
  //
  // `finding-total-risk` below is the honest version of the same question: a
  // sum is additive, so it needs no unit gymnastics. avg remains available in
  // the builder for anyone who wants it on a field that IS measured in days.
  // Restore these once a 'mean' unit exists in analytics_compose_value.
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

  // ── supplier_management ───────────────────────────────────────────────────
  // ⚠ NO SITE OR DEPARTMENT BREAKDOWN anywhere in this module. `suppliers`
  // carries no scope columns at all — a supplier is a company relationship, not
  // a site's record — so the registry declares no scope_role and the builder
  // rightly offers neither.
  {
    id: 'supplier-approved',
    moduleId: 'supplier_management',
    name: 'Approved suppliers',
    description: 'Suppliers cleared to be used.',
    direction: 'higher_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'suppliers',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'status_id', op: 'in', values: ['APPROVED'] }],
      groupBy: [],
    },
  },
  {
    id: 'supplier-by-risk',
    moduleId: 'supplier_management',
    name: 'Suppliers by risk level',
    description: 'How the supplier base splits across risk bands.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'suppliers',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['risk_level'],
    },
  },
  {
    id: 'supplier-high-risk',
    moduleId: 'supplier_management',
    name: 'High-risk suppliers',
    description: 'Suppliers carrying the highest risk rating.',
    direction: 'lower_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'suppliers',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'risk_level', op: 'in', values: ['HIGH'] }],
      groupBy: [],
    },
  },
  {
    id: 'supplier-blocked-share',
    moduleId: 'supplier_management',
    name: 'Blocked supplier share',
    description: 'What proportion of suppliers are currently blocked.',
    direction: 'lower_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'suppliers',
      timeField: 'created_at',
      measure: {
        type: MEASURES.RATIO,
        numerator: [{ field: 'status_id', op: 'in', values: ['BLOCKED'] }],
      },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'supplier-unrated',
    moduleId: 'supplier_management',
    name: 'Suppliers with no risk rating',
    description: 'Suppliers never assessed — they cannot appear in any risk report.',
    direction: 'lower_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'suppliers',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'risk_level', op: 'isNull', values: [] }],
      groupBy: [],
    },
  },

  // ── audit_management (the audit itself; findings are a separate module) ────
  {
    id: 'audit-open',
    moduleId: 'audit_management',
    name: 'Open audits',
    description: 'Audits started and not yet closed.',
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'audit_instances',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'status_id', op: 'in', values: ['OPEN'] }],
      groupBy: [],
    },
  },
  {
    id: 'audit-by-site',
    moduleId: 'audit_management',
    name: 'Audits by site',
    description: 'Where audit activity is concentrated.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'audit_instances',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['site_id'],
    },
  },
  {
    id: 'audit-by-programme',
    moduleId: 'audit_management',
    name: 'Audits by programme type',
    description: 'Internal, supplier and certification audits side by side.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'audit_instances',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['program_type_id'],
    },
  },
  {
    id: 'audit-closure-time',
    moduleId: 'audit_management',
    name: 'Audit completion time',
    description: 'Average days from an audit starting to being completed.',
    direction: 'lower_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'audit_instances',
      timeField: 'started_at',
      measure: { type: MEASURES.DURATION, from: 'started_at', to: 'completed_at' },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'audit-release-lag',
    moduleId: 'audit_management',
    name: 'Report release lag',
    description: 'Average days from completing an audit to releasing its report.',
    direction: 'lower_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'audit_instances',
      timeField: 'completed_at',
      measure: { type: MEASURES.DURATION, from: 'completed_at', to: 'released_at' },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'audit-never-started',
    moduleId: 'audit_management',
    name: 'Audits not yet started',
    description: 'Audits raised but never begun.',
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'audit_instances',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'started_at', op: 'isNull', values: [] }],
      groupBy: [],
    },
  },

  // ── tasks ─────────────────────────────────────────────────────────────────
  // ⚠ task_instances has NINE live statuses, not the four-state machine the
  // quality-record modules share. "Still open" is therefore expressed as
  // completed_at IS NULL rather than a status list — the statuses describe a
  // review stage (ASSIGNED, FORM_SUBMITTED, SENT_BACK, CHANGES_REQUESTED…) and
  // enumerating the open ones would silently miss any added later.
  {
    id: 'task-open',
    moduleId: 'tasks',
    name: 'Open tasks',
    description: 'Tasks assigned and not yet completed.',
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'task_instances',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'completed_at', op: 'isNull', values: [] }],
      groupBy: [],
    },
  },
  {
    id: 'task-completion-rate',
    moduleId: 'tasks',
    name: 'Task completion rate',
    description: 'What share of raised tasks have been completed.',
    direction: 'higher_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'task_instances',
      timeField: 'created_at',
      measure: {
        type: MEASURES.RATIO,
        numerator: [{ field: 'completed_at', op: 'isNotNull', values: [] }],
      },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'task-turnaround',
    moduleId: 'tasks',
    name: 'Task turnaround time',
    description: 'Average days from a task being raised to being completed.',
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'task_instances',
      timeField: 'created_at',
      measure: { type: MEASURES.DURATION, from: 'created_at', to: 'completed_at' },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'task-turnaround-by-priority',
    moduleId: 'tasks',
    name: 'Turnaround by priority',
    description: 'Whether urgent tasks actually move faster than routine ones.',
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'task_instances',
      timeField: 'created_at',
      measure: { type: MEASURES.DURATION, from: 'created_at', to: 'completed_at' },
      filters: [],
      groupBy: ['priority_id'],
    },
  },
  {
    id: 'task-by-assignee',
    moduleId: 'tasks',
    name: 'Open tasks by assignee',
    description: 'Where the outstanding workload sits.',
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'task_instances',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'completed_at', op: 'isNull', values: [] }],
      groupBy: ['assigned_to'],
    },
  },
  {
    id: 'task-rejection-rate',
    moduleId: 'tasks',
    name: 'Task rejection rate',
    description: 'What share of tasks were rejected rather than approved.',
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'task_instances',
      timeField: 'created_at',
      measure: {
        type: MEASURES.RATIO,
        numerator: [{ field: 'status_id', op: 'in', values: ['REJECTED'] }],
      },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'task-unassigned',
    moduleId: 'tasks',
    name: 'Unassigned tasks',
    description: 'Tasks with nobody named — they cannot appear on anyone’s list.',
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'task_instances',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'assigned_to', op: 'isNull', values: [] }],
      groupBy: [],
    },
  },

  // ── training (the course catalogue) ───────────────────────────────────────
  {
    id: 'training-active-courses',
    moduleId: 'training',
    name: 'Active courses',
    description: 'Training courses available to assign.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'trainings',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'status', op: 'in', values: ['ACTIVE'] }],
      groupBy: [],
    },
  },
  {
    id: 'training-courses-by-status',
    moduleId: 'training',
    name: 'Courses by status',
    description: 'Draft, active and archived courses side by side.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'trainings',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['status'],
    },
  },
  {
    id: 'training-draft-courses',
    moduleId: 'training',
    name: 'Courses still in draft',
    description: 'Written but never published, so nobody can be assigned them.',
    direction: 'lower_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'trainings',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'status', op: 'in', values: ['DRAFT'] }],
      groupBy: [],
    },
  },

  // ── training_instances — TWO SOURCE TABLES, and they answer different
  // questions. `training_instances` is a ROLLOUT (one course pushed to a group);
  // `training_assignees` is ONE PERSON's record within it. "How many rollouts
  // are active" and "how many people passed" are not the same question, and
  // mixing them is the classic way a compliance figure ends up wrong.
  {
    id: 'training-rollouts-active',
    moduleId: 'training_instances',
    name: 'Active rollouts',
    description: 'Training rollouts currently running.',
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'training_instances',
      timeField: 'due_date',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'status', op: 'in', values: ['ACTIVE'] }],
      groupBy: [],
    },
  },
  {
    id: 'training-rollouts-by-status',
    moduleId: 'training_instances',
    name: 'Rollouts by status',
    description: 'Where training rollouts stand.',
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'training_instances',
      timeField: 'due_date',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['status'],
    },
  },
  {
    id: 'training-completion-rate',
    moduleId: 'training_instances',
    name: 'Training completion rate',
    description: 'What share of assigned training has been completed.',
    direction: 'higher_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'training_assignees',
      timeField: 'created_at',
      measure: {
        type: MEASURES.RATIO,
        numerator: [{ field: 'completed_at', op: 'isNotNull', values: [] }],
      },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'training-outstanding',
    moduleId: 'training_instances',
    name: 'Outstanding training',
    description: 'People assigned training they have not finished.',
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'training_assignees',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'completed_at', op: 'isNull', values: [] }],
      groupBy: [],
    },
  },
  {
    id: 'training-average-score',
    moduleId: 'training_instances',
    name: 'Average assessment score',
    description: 'Mean score across completed assessments.',
    direction: 'higher_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'training_assignees',
      timeField: 'completed_at',
      measure: { type: MEASURES.AVG, field: 'score' },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'training-failure-rate',
    moduleId: 'training_instances',
    name: 'Training failure rate',
    description: 'What share of training records ended in a fail.',
    direction: 'lower_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'training_assignees',
      timeField: 'created_at',
      measure: {
        type: MEASURES.RATIO,
        numerator: [{ field: 'status', op: 'in', values: ['FAILED'] }],
      },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'training-retrain-required',
    moduleId: 'training_instances',
    name: 'Retraining required',
    description: 'People flagged to take their training again.',
    direction: 'lower_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'training_assignees',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'status', op: 'in', values: ['RETRAIN_REQUIRED'] }],
      groupBy: [],
    },
  },
  {
    id: 'training-time-to-complete',
    moduleId: 'training_instances',
    name: 'Time to complete training',
    description: 'Average days from assignment to completion.',
    direction: 'lower_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'training_assignees',
      timeField: 'created_at',
      measure: { type: MEASURES.DURATION, from: 'created_at', to: 'completed_at' },
      filters: [],
      groupBy: [],
    },
  },

  // ── complaint_management (CUSTOMER-facing) ────────────────────────────────
  // ⚠ NOT the `complaints` module, which is internal Quality Complaints on a
  // different table. They are separate authz modules, granted independently.
  {
    id: 'cc-open',
    moduleId: 'complaint_management',
    name: 'Open customer complaints',
    description: 'Complaints received and not yet closed.',
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'customer_complaints',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'closed_at', op: 'isNull', values: [] }],
      groupBy: [],
    },
  },
  {
    id: 'cc-first-response-time',
    moduleId: 'complaint_management',
    name: 'First response time',
    description: 'Average time from a complaint arriving to the first reply.',
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'customer_complaints',
      timeField: 'created_at',
      measure: { type: MEASURES.DURATION, from: 'created_at', to: 'first_response_at' },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'cc-resolution-time',
    moduleId: 'complaint_management',
    name: 'Resolution time',
    description: 'Average days from a complaint arriving to being resolved.',
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'customer_complaints',
      timeField: 'created_at',
      measure: { type: MEASURES.DURATION, from: 'created_at', to: 'resolved_at' },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'cc-by-status',
    moduleId: 'complaint_management',
    name: 'Complaints by status',
    description: 'Where customer complaints currently sit.',
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'customer_complaints',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['status_id'],
    },
  },
  {
    id: 'cc-by-source',
    moduleId: 'complaint_management',
    name: 'Complaints by source',
    description: 'Which channels complaints arrive through.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'customer_complaints',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['source_id'],
    },
  },
  {
    id: 'cc-escalated-to-nc',
    moduleId: 'complaint_management',
    name: 'Complaints raised as non-conformances',
    description: 'Complaints serious enough to become a quality record.',
    direction: 'lower_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'customer_complaints',
      timeField: 'created_at',
      measure: {
        type: MEASURES.RATIO,
        numerator: [{ field: 'status_id', op: 'in', values: ['CONVERTED_TO_NC'] }],
      },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'cc-never-answered',
    moduleId: 'complaint_management',
    name: 'Complaints never replied to',
    description: 'Complaints with no first response recorded at all.',
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'customer_complaints',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      // is_spam is excluded deliberately: an unanswered spam message is not a
      // service failure, and counting it would inflate the one number in this
      // module most likely to be reported upward.
      filters: [
        { field: 'first_response_at', op: 'isNull', values: [] },
        { field: 'is_spam', op: 'in', values: ['false'] },
      ],
      groupBy: [],
    },
  },
  {
    id: 'cc-unassigned',
    moduleId: 'complaint_management',
    name: 'Unassigned complaints',
    description: 'Complaints nobody owns yet.',
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'customer_complaints',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'assigned_to', op: 'isNull', values: [] }],
      groupBy: [],
    },
  },

  // ── inspection_qc ─────────────────────────────────────────────────────────
  {
    id: 'qc-open-lots',
    moduleId: 'inspection_qc',
    name: 'Open inspection lots',
    description: 'Lots raised and not yet closed.',
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'inspection_lots',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'status_id', op: 'in', values: ['OPEN'] }],
      groupBy: [],
    },
  },
  {
    id: 'qc-lots-by-status',
    moduleId: 'inspection_qc',
    name: 'Lots by status',
    description: 'Where inspection lots currently stand.',
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'inspection_lots',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['status_id'],
    },
  },
  {
    id: 'qc-lots-by-supplier',
    moduleId: 'inspection_qc',
    name: 'Lots by supplier',
    description: 'Which suppliers account for the most inspected material.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'inspection_lots',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['supplier_id'],
    },
  },
  {
    id: 'qc-by-disposition',
    moduleId: 'inspection_qc',
    name: 'Lots by disposition',
    description: 'How inspected lots were finally dispositioned.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'inspection_lots',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'disposition_type_id', op: 'isNotNull', values: [] }],
      groupBy: ['disposition_type_id'],
    },
  },
  {
    id: 'qc-coa-coverage',
    moduleId: 'inspection_qc',
    name: 'Certificate of analysis coverage',
    description: 'What share of lots arrived with a certificate of analysis.',
    direction: 'higher_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'inspection_lots',
      timeField: 'created_at',
      measure: {
        type: MEASURES.RATIO,
        numerator: [{ field: 'coa_received', op: 'in', values: ['true'] }],
      },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'qc-average-sample-size',
    moduleId: 'inspection_qc',
    name: 'Average sample size',
    description: 'How many units are typically inspected per lot.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'inspection_lots',
      timeField: 'created_at',
      measure: { type: MEASURES.AVG, field: 'sample_size' },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'qc-undispositioned',
    moduleId: 'inspection_qc',
    name: 'Lots with no disposition',
    description: 'Inspected lots left without a decision recorded.',
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'inspection_lots',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'disposition_type_id', op: 'isNull', values: [] }],
      groupBy: [],
    },
  },

  // ── DURATIONS FOR THE ORIGINAL SEVEN ─────────────────────────────────────
  // Added once the `duration` measure existed (20260923190000). Until then the
  // header of this file said outright that time-to-close could not be
  // expressed; these are the templates that statement was blocking.
  //
  // ⚠ Each counts ONLY records that reached the end date. An open CAPA has no
  // closure time — it is unknown, not zero — so the backlog does not drag these
  // figures down. The compiler enforces that; the description says it so the
  // reader knows which question is being answered.
  {
    id: 'capa-closure-time',
    moduleId: 'capa',
    name: 'CAPA closure time',
    description: 'Average days from initiating a CAPA to closing it. Open CAPAs are not counted.',
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'capas',
      timeField: 'initiated_at',
      measure: { type: MEASURES.DURATION, from: 'initiated_at', to: 'closed_at' },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'capa-verification-lag',
    moduleId: 'capa',
    name: 'Effectiveness verification lag',
    description: 'Average days from completing a CAPA to verifying it worked.',
    direction: 'lower_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'capas',
      timeField: 'completed_at',
      measure: { type: MEASURES.DURATION, from: 'completed_at', to: 'verified_at' },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'ncr-closure-time',
    moduleId: 'ncr',
    name: 'NCR closure time',
    description:
      'Average days from detecting a non-conformance to closing it. Open NCRs are not counted.',
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'nonconformances',
      timeField: 'detected_at',
      measure: { type: MEASURES.DURATION, from: 'detected_at', to: 'closed_at' },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'ncr-detection-lag',
    moduleId: 'ncr',
    name: 'Detection-to-record lag',
    description: 'Average days between something being detected and being recorded in the system.',
    direction: 'lower_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'nonconformances',
      timeField: 'detected_at',
      measure: { type: MEASURES.DURATION, from: 'detected_at', to: 'created_at' },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'cr-approval-time',
    moduleId: 'change_control',
    name: 'Change approval time',
    description: 'Average days from submitting a change to it being approved.',
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'change_requests',
      timeField: 'submitted_at',
      measure: { type: MEASURES.DURATION, from: 'submitted_at', to: 'approved_at' },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'cr-implementation-time',
    moduleId: 'change_control',
    name: 'Implementation time',
    description: 'Average days from approving a change to closing it out.',
    direction: 'lower_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'change_requests',
      timeField: 'approved_at',
      measure: { type: MEASURES.DURATION, from: 'approved_at', to: 'closed_at' },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'complaint-resolution-time',
    moduleId: 'complaints',
    name: 'Complaint resolution time',
    description: 'Average days from a complaint being raised to being resolved.',
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'complaints',
      timeField: 'created_at',
      measure: { type: MEASURES.DURATION, from: 'created_at', to: 'resolved_at' },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'finding-closure-time',
    moduleId: 'audit_findings',
    name: 'Finding closure time',
    description: 'Average days from raising an audit finding to closing it.',
    direction: 'lower_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'audit_findings',
      timeField: 'created_at',
      measure: { type: MEASURES.DURATION, from: 'created_at', to: 'closed_at' },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'document-review-cycle',
    moduleId: 'document_control',
    name: 'Document review cycle',
    description: 'Average days from a document being created to its last review.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'documents',
      timeField: 'created_at',
      measure: { type: MEASURES.DURATION, from: 'created_at', to: 'last_reviewed_at' },
      filters: [],
      groupBy: [],
    },
  },

  // ── CROSS-MODULE: DOES THE SYSTEM CLOSE ITS LOOPS? ───────────────────────
  // Added with 20260923200000, which registered the link columns these read.
  //
  // These answer questions that LOOK like they need a join — "what share of
  // findings led to a CAPA" — and do not, because the link is already a column
  // on the row. The numerator is `isNotNull` on that column and the denominator
  // is the record count, both from the same table. No join, no fan-out.
  //
  // ⚠ Several will read 0% on a dataset that never exercised the path. That is
  // the honest answer for that data, not a broken metric.
  {
    id: 'audit-finding-to-capa',
    moduleId: 'audit_findings',
    name: 'Findings that raised a CAPA',
    description:
      'What share of audit findings led to corrective action. Reads 0% if findings are being closed without one.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'audit_findings',
      timeField: 'created_at',
      measure: {
        type: MEASURES.RATIO,
        numerator: [{ field: 'spawned_capa_id', op: 'isNotNull', values: [] }],
      },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'audit-finding-to-nc',
    moduleId: 'audit_findings',
    name: 'Findings that raised a non-conformance',
    description: 'What share of audit findings were serious enough to become a quality record.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'audit_findings',
      timeField: 'created_at',
      measure: {
        type: MEASURES.RATIO,
        numerator: [{ field: 'spawned_nc_id', op: 'isNotNull', values: [] }],
      },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'capa-from-nc',
    moduleId: 'capa',
    name: 'CAPAs driven by a non-conformance',
    description: 'What share of CAPAs answer a specific NC rather than being raised on their own.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'capas',
      timeField: 'created_at',
      measure: {
        type: MEASURES.RATIO,
        numerator: [{ field: 'source_id', op: 'isNotNull', values: [] }],
      },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'capa-standalone',
    moduleId: 'capa',
    name: 'CAPAs with no source record',
    description: 'CAPAs not traceable to the record that prompted them.',
    direction: 'lower_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'capas',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'source_id', op: 'isNull', values: [] }],
      groupBy: [],
    },
  },
  {
    id: 'qc-lot-nc-rate',
    moduleId: 'inspection_qc',
    name: 'Inspection failure rate',
    description: 'What share of inspected lots raised a non-conformance.',
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'inspection_lots',
      timeField: 'created_at',
      measure: {
        type: MEASURES.RATIO,
        numerator: [{ field: 'nc_id', op: 'isNotNull', values: [] }],
      },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'complaint-escalated-from-customer',
    moduleId: 'complaints',
    name: 'Complaints escalated from a customer',
    description:
      'What share of internal quality complaints began as a customer complaint rather than internally.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'complaints',
      timeField: 'created_at',
      measure: {
        type: MEASURES.RATIO,
        numerator: [{ field: 'source_complaint_id', op: 'isNotNull', values: [] }],
      },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'cc-no-intake-form',
    moduleId: 'complaint_management',
    name: 'Complaints logged without a form',
    description:
      'Complaints typed in by hand rather than captured through an intake form — the ones most likely to be missing information.',
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'customer_complaints',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'form_id', op: 'isNull', values: [] }],
      groupBy: [],
    },
  },

  // ── BACKLOG AGE, AS COUNTS ───────────────────────────────────────────────
  // These are the substitute the compiler's `aging` refusal points at, shipped
  // alongside it (20260923210000) so the guidance lands on something real.
  //
  // ⚠ WHY NOT AN "AVERAGE AGE" METRIC. It cannot be stored honestly: it needs
  // the current clock, which makes the figure a function of WHEN THE ROLLUP LAST
  // RAN rather than of the data — while the rollup only rebuilds buckets whose
  // source rows changed. An open record nobody edits ages daily and its bucket
  // never refreshes, so its age freezes.
  //
  // Measured on Nordic CAPAs (39 open, 17 untouched for 30+ days): true average
  // age 81.4 days, a month later 111.4, what the metric would SHOW 93.7. And the
  // error points the wrong way — a backlog going stale renders as improving.
  //
  // A COUNT of what is still open, grouped by the month it was raised, answers
  // the same question and cannot go stale: the earliest bars ARE the old work,
  // and the reader sees the distribution rather than one number hiding it.
  {
    id: 'capa-backlog-age',
    moduleId: 'capa',
    name: 'Open CAPA backlog by month raised',
    description:
      'CAPAs still open, grouped by when they were raised. The earliest bars are the oldest work.',
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'capas',
      timeField: 'initiated_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'closed_at', op: 'isNull', values: [] }],
      groupBy: [],
    },
  },
  {
    id: 'ncr-backlog-age',
    moduleId: 'ncr',
    name: 'Open NCR backlog by month detected',
    description:
      'Non-conformances still open, grouped by when they were detected. The earliest bars are the ageing backlog.',
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'nonconformances',
      timeField: 'detected_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'closed_at', op: 'isNull', values: [] }],
      groupBy: [],
    },
  },
  {
    id: 'finding-backlog-age',
    moduleId: 'audit_findings',
    name: 'Open findings by month raised',
    description: 'Audit findings still open, grouped by when they were raised.',
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'audit_findings',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'closed_at', op: 'isNull', values: [] }],
      groupBy: [],
    },
  },
  {
    id: 'cc-backlog-age',
    moduleId: 'complaint_management',
    name: 'Open complaints by month received',
    description: 'Customer complaints still open, grouped by when they arrived.',
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'customer_complaints',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'closed_at', op: 'isNull', values: [] }],
      groupBy: [],
    },
  },
  {
    id: 'task-backlog-age',
    moduleId: 'tasks',
    name: 'Open tasks by month raised',
    description: 'Tasks still outstanding, grouped by when they were raised.',
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'task_instances',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'completed_at', op: 'isNull', values: [] }],
      groupBy: [],
    },
  },
  // ── retain_samples ────────────────────────────────────────────────────────
  // ⚠ STATUS AND SEAL STATE ARE DIFFERENT QUESTIONS. status_id is where the
  // sample is in its lifecycle (RETAINED → DISPOSED); seal_state is whether the
  // container has been opened. A sample can be RETAINED and BROKEN at once, and
  // that combination is the one worth alerting on.
  //
  // Verified against dev: status_id ∈ {RETAINED}, seal_state ∈ {SEALED},
  // sample_type ∈ {REFERENCE, RESERVE}. Only values that exist are filtered on
  // — the qe-awaiting-decision template filtered a status this schema never had
  // and read "Preparing" forever.
  {
    id: 'retain-held',
    moduleId: 'retain_samples',
    name: 'Samples retained',
    description: 'Retain samples taken into storage.',
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'retain_samples',
      timeField: 'retained_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'retain-by-type',
    moduleId: 'retain_samples',
    name: 'Samples by type',
    description: 'How retained samples split between reference and reserve.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'retain_samples',
      timeField: 'retained_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['sample_type'],
    },
  },
  {
    id: 'retain-by-status',
    moduleId: 'retain_samples',
    name: 'Samples by status',
    description: 'Where retained samples sit in their lifecycle.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'retain_samples',
      timeField: 'retained_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['status_id'],
    },
  },
  {
    id: 'retain-disposed',
    moduleId: 'retain_samples',
    name: 'Samples disposed',
    description: 'Retain samples destroyed once their retention period ended.',
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'retain_samples',
      timeField: 'disposed_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'disposed_at', op: 'isNotNull', values: [] }],
      groupBy: [],
    },
  },
  {
    id: 'retain-still-held',
    moduleId: 'retain_samples',
    name: 'Samples still held by month retained',
    description: 'Samples not yet disposed, grouped by when they were taken.',
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'retain_samples',
      timeField: 'retained_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'disposed_at', op: 'isNull', values: [] }],
      groupBy: [],
    },
  },
  {
    id: 'retain-retention-days',
    moduleId: 'retain_samples',
    name: 'Average time held before disposal',
    description: 'How long samples stay in storage before being destroyed.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'retain_samples',
      timeField: 'retained_at',
      measure: { type: MEASURES.DURATION, from: 'retained_at', to: 'disposed_at' },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'retain-by-location',
    moduleId: 'retain_samples',
    name: 'Samples by item',
    description: 'Which items account for the retained sample inventory.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'retain_samples',
      timeField: 'retained_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'disposed_at', op: 'isNull', values: [] }],
      groupBy: ['product_id'],
    },
  },

  // ── log_books ─────────────────────────────────────────────────────────────
  // ⚠ THESE COUNT LOG BOOKS, NOT ENTRIES. A log book is a controlled document
  // with a status, an effective date and a supersedes chain; the readings
  // written into it live in a separate table and answer a separate question.
  // "Entries completed this month" is NOT available from here, and a template
  // named that way would be read as though it were.
  //
  // Verified against dev: status_id ∈ {ACTIVE, DRAFT}.
  {
    id: 'logbook-active',
    moduleId: 'log_books',
    name: 'Active log books',
    description: 'Log books currently in use.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'log_books',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'status_id', op: 'in', values: ['ACTIVE'] }],
      groupBy: [],
    },
  },
  {
    id: 'logbook-by-status',
    moduleId: 'log_books',
    name: 'Log books by status',
    description: 'How log books split between draft and active.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'log_books',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['status_id'],
    },
  },
  {
    id: 'logbook-by-department',
    moduleId: 'log_books',
    name: 'Log books by department',
    description: 'Which departments maintain log books.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'log_books',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'status_id', op: 'in', values: ['ACTIVE'] }],
      groupBy: ['department_id'],
    },
  },
  {
    id: 'logbook-signature-required',
    moduleId: 'log_books',
    name: 'Log books requiring signature',
    description: 'Share of log books that demand a signature on each entry.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'log_books',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'signature_required', op: 'in', values: ['true'] }],
      groupBy: [],
    },
  },
  {
    id: 'logbook-draft-backlog',
    moduleId: 'log_books',
    name: 'Draft log books by month created',
    description: 'Log books never brought into use, grouped by when they were drafted.',
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'log_books',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'status_id', op: 'in', values: ['DRAFT'] }],
      groupBy: [],
    },
  },
  {
    id: 'logbook-draft-to-effective',
    moduleId: 'log_books',
    name: 'Average time from creation to effective',
    description: 'How long a log book takes to be brought into use.',
    direction: 'lower_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'log_books',
      timeField: 'created_at',
      measure: { type: MEASURES.DURATION, from: 'created_at', to: 'effective_at' },
      filters: [],
      groupBy: [],
    },
  },

  // ── training_instances (verifications) ────────────────────────────────────
  // ⚠ MODULE IS training_instances, NOT a module named after the table. The
  // table's SELECT policy gates on has_permission('training_instances','read'),
  // and the registry follows the policy, not the name.
  //
  // ⚠ signed_at IS THE EVENT, created_at IS THE ROW. "Verified in October"
  // means the signature. Both are registered; these templates use signed_at
  // except where the question is genuinely about the record appearing.
  //
  // Verified against dev: outcome ∈ {APPROVED} on all 250 rows. No template
  // filters on a rejection value, because none exists in the data to confirm
  // its spelling — an unverified guess is exactly the AWAITING_DECISION bug.
  {
    id: 'training-verified',
    moduleId: 'training_instances',
    name: 'Training verifications signed',
    description: 'Competency verifications completed and signed off.',
    direction: 'higher_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'training_verifications',
      timeField: 'signed_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'training-verified-by-outcome',
    moduleId: 'training_instances',
    name: 'Verifications by outcome',
    description: 'How competency verifications resolved.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'training_verifications',
      timeField: 'signed_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['outcome'],
    },
  },
  {
    id: 'training-retraining-required',
    moduleId: 'training_instances',
    name: 'Verifications requiring retraining',
    description: 'Competency checks that sent someone back for more training.',
    direction: 'lower_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'training_verifications',
      timeField: 'signed_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'retraining_required', op: 'in', values: ['true'] }],
      groupBy: [],
    },
  },
  {
    id: 'training-independent-rate',
    moduleId: 'training_instances',
    name: 'Share cleared to work independently',
    description: 'Verifications where the person was judged able to work unsupervised.',
    direction: 'higher_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'training_verifications',
      timeField: 'signed_at',
      measure: {
        type: MEASURES.RATIO,
        numerator: [{ field: 'can_perform_independently', op: 'in', values: ['true'] }],
      },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'training-practical-done',
    moduleId: 'training_instances',
    name: 'Practical observations completed',
    description: 'Verifications backed by an observed practical assessment.',
    direction: 'higher_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'training_verifications',
      timeField: 'signed_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'practical_observation_completed', op: 'in', values: ['true'] }],
      groupBy: [],
    },
  },
  {
    id: 'training-verification-lag',
    moduleId: 'training_instances',
    name: 'Average time from record to signature',
    description: 'How long a verification waits between being raised and being signed.',
    direction: 'lower_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'training_verifications',
      timeField: 'created_at',
      measure: { type: MEASURES.DURATION, from: 'created_at', to: 'signed_at' },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'training-unsigned-backlog',
    moduleId: 'training_instances',
    name: 'Unsigned verifications by month raised',
    description: 'Verifications still awaiting signature, grouped by when they were raised.',
    direction: 'lower_is_better',
    grain: 'month',
    definition: {
      sourceTable: 'training_verifications',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'signed_at', op: 'isNull', values: [] }],
      groupBy: [],
    },
  },

  // ── audit_programs ────────────────────────────────────────────────────────
  // ⚠ next_due_date IS IN THE FUTURE. Bucketing by it is a FORWARD schedule —
  // "what is coming" — not a history. That is the useful question here and the
  // templates using it say so in their names; a reader who expects a backward
  // trend from a forward field would misread every one of them.
  //
  // Verified against dev: program_type_id ∈ {INTERNAL, EXTERNAL, SUPPLIER},
  // frequency_id ∈ {ANNUAL, QUARTERLY, SEMI_ANNUAL}.
  {
    id: 'audit-programs-active',
    moduleId: 'audit_programs',
    name: 'Active audit programmes',
    description: 'Audit programmes currently on schedule.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'audit_programs',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'active', op: 'in', values: ['true'] }],
      groupBy: [],
    },
  },
  {
    id: 'audit-programs-by-type',
    moduleId: 'audit_programs',
    name: 'Programmes by type',
    description: 'How audit programmes split between internal, external and supplier.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'audit_programs',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'active', op: 'in', values: ['true'] }],
      groupBy: ['program_type_id'],
    },
  },
  {
    id: 'audit-programs-by-frequency',
    moduleId: 'audit_programs',
    name: 'Programmes by frequency',
    description: 'How often audit programmes are scheduled to run.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'audit_programs',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'active', op: 'in', values: ['true'] }],
      groupBy: ['frequency_id'],
    },
  },
  {
    id: 'audit-programs-due-ahead',
    moduleId: 'audit_programs',
    name: 'Programmes by month next due',
    description: 'The forward audit schedule — when each programme comes up next.',
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'audit_programs',
      timeField: 'next_due_date',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'active', op: 'in', values: ['true'] }],
      groupBy: [],
    },
  },
  {
    id: 'audit-programs-by-site',
    moduleId: 'audit_programs',
    name: 'Programmes by site',
    description: 'How audit coverage is spread across sites.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'audit_programs',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'active', op: 'in', values: ['true'] }],
      groupBy: ['site_id'],
    },
  },
  {
    id: 'audit-programs-supplier-share',
    moduleId: 'audit_programs',
    name: 'Share of programmes covering a supplier',
    description: 'How much of the audit schedule is aimed at the supply base.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'audit_programs',
      timeField: 'created_at',
      measure: {
        type: MEASURES.RATIO,
        numerator: [{ field: 'supplier_id', op: 'isNotNull', values: [] }],
      },
      filters: [{ field: 'active', op: 'in', values: ['true'] }],
      groupBy: [],
    },
  },

  // ── products ──────────────────────────────────────────────────────────────
  // ⚠ created_at IS THE ONLY TIME FIELD ON THIS TABLE. There is no approved_at
  // and no effective_at, so every products metric is "items ADDED in a period",
  // never "items approved". A template promising the latter cannot be built
  // here, and this note exists so nobody spends an afternoon looking for one.
  //
  // Verified against dev: status_id ∈ {ACTIVE, DISCONTINUED, OBSOLETE,
  // UNDER_REVIEW}. criticality is NULL on every row today — the by-criticality
  // template will read all-blank, which is an honest answer about the data
  // rather than a broken metric.
  {
    id: 'products-added',
    moduleId: 'products',
    name: 'Items added',
    description: 'New items registered in the item master.',
    direction: 'neutral',
    grain: 'month',
    definition: {
      sourceTable: 'products',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: [],
    },
  },
  {
    id: 'products-by-status',
    moduleId: 'products',
    name: 'Items by status',
    description: 'How the item master splits between active, obsolete and under review.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'products',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [],
      groupBy: ['status_id'],
    },
  },
  {
    id: 'products-under-review',
    moduleId: 'products',
    name: 'Items under review',
    description: 'Items whose master data is being reworked.',
    direction: 'lower_is_better',
    grain: 'quarter',
    definition: {
      sourceTable: 'products',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'status_id', op: 'in', values: ['UNDER_REVIEW'] }],
      groupBy: [],
    },
  },
  {
    id: 'products-inspection-required',
    moduleId: 'products',
    name: 'Share of items requiring inspection',
    description: 'How much of the item master is subject to incoming inspection.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'products',
      timeField: 'created_at',
      measure: {
        type: MEASURES.RATIO,
        numerator: [{ field: 'inspection_required', op: 'in', values: ['true'] }],
      },
      filters: [{ field: 'status_id', op: 'in', values: ['ACTIVE'] }],
      groupBy: [],
    },
  },
  {
    id: 'products-by-criticality',
    moduleId: 'products',
    name: 'Items by criticality',
    description: 'How active items split across criticality bands.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'products',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [{ field: 'status_id', op: 'in', values: ['ACTIVE'] }],
      groupBy: ['criticality'],
    },
  },
  {
    id: 'products-lot-controlled',
    moduleId: 'products',
    name: 'Lot-controlled items',
    description: 'Active items tracked by lot.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'products',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [
        { field: 'status_id', op: 'in', values: ['ACTIVE'] },
        { field: 'lot_controlled', op: 'in', values: ['true'] },
      ],
      groupBy: [],
    },
  },
  {
    id: 'products-hazardous',
    moduleId: 'products',
    name: 'Hazardous items',
    description: 'Active items flagged as hazardous.',
    direction: 'neutral',
    grain: 'quarter',
    definition: {
      sourceTable: 'products',
      timeField: 'created_at',
      measure: { type: MEASURES.COUNT },
      filters: [
        { field: 'status_id', op: 'in', values: ['ACTIVE'] },
        { field: 'is_hazardous', op: 'in', values: ['true'] },
      ],
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
