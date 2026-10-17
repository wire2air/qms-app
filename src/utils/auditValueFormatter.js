import { DateTime } from 'luxon'
import { ENTITY_LABEL_RESOLVERS } from './auditConstants.js'
import {
  AUDIT_FIELD_FORMATTERS,
  isHiddenField,
  DISPLAY_TYPE_LABELS,
} from './auditFieldFormatters.js'

/**
 * Formats a single audit field value using its field metadata.
 * For FK and status types, requires a `db` reference for live IDB lookups.
 * For non-async contexts (summary generation), pass db=null — FK/status will fall back to humanized value.
 *
 * @param {*} value
 * @param {{ label, type, refModel?, statusModel?, enumMap? } | null} fieldMeta
 * @param {object | null} db  — syncEngine db reference
 * @returns {Promise<string>}
 */
export async function formatAuditValue(value, fieldMeta, db) {
  if (value === null || value === undefined) return '—'

  const type = fieldMeta?.type || 'text'

  if (type === 'fk' && fieldMeta?.refModel) {
    if (db) {
      const resolver = ENTITY_LABEL_RESOLVERS[fieldMeta.refModel]
      if (resolver) {
        const result = await resolver.call(ENTITY_LABEL_RESOLVERS, value, db)
        return result?.label ?? String(value)
      }
    }
    return String(value)
  }

  if (type === 'status' && fieldMeta?.statusModel) {
    if (db?.[fieldMeta.statusModel]) {
      const record = await db[fieldMeta.statusModel].findByPk(value)
      if (record?.name) return record.name
    }
    return humanizeCode(value)
  }

  if (type === 'date') {
    const dt = value instanceof DateTime ? value : DateTime.fromISO(String(value))
    return dt.isValid ? dt.formatDate('date') : String(value)
  }

  if (type === 'datetime') {
    const dt = value instanceof DateTime ? value : DateTime.fromISO(String(value))
    return dt.isValid ? dt.formatDate('datetime') : String(value)
  }

  if (type === 'boolean') return value ? 'Yes' : 'No'

  if (type === 'enum' && fieldMeta?.enumMap) return fieldMeta.enumMap[value] ?? String(value)

  if (type === 'richtext' || looksLikeHtml(value)) return richTextToPlain(value)

  if (type === 'json') {
    if (typeof value === 'object' && value !== null) {
      const count = Array.isArray(value) ? value.length : Object.keys(value).length
      const unit = Array.isArray(value) ? 'item' : 'field'
      return `{ ${count} ${unit}${count !== 1 ? 's' : ''} }`
    }
    return String(value)
  }

  return String(value)
}

/**
 * Rich-text columns (RichTextAttachments) hold editor HTML plus an optional
 * `\n[qms-attachments]::<json>` tail. The audit trail is read by people, so
 * render the words: tags out, block boundaries kept as line breaks, the
 * attachment marker summarised. Also applied to any 'text' value that looks
 * like markup, so a field nobody registered as richtext still reads.
 */
export function looksLikeHtml(value) {
  return typeof value === 'string' && /<\/?[a-z][^>]*>/i.test(value)
}
export function richTextToPlain(value) {
  const [raw = '', marker] = String(value ?? '').split('\n[qms-attachments]::')
  let text = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (marker) {
    let n = 0
    try {
      const parsed = JSON.parse(marker)
      n = Array.isArray(parsed) ? parsed.length : Object.keys(parsed || {}).length
    } catch {
      n = 0
    }
    if (n) text = `${text}${text ? '\n' : ''}(${n} attachment${n === 1 ? '' : 's'})`
  }
  return text || '—'
}

/**
 * Turns SCREAMING_SNAKE_CASE into Title Case.
 */
function humanizeCode(str) {
  if (!str) return '—'
  return str
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Extracts diff rows from old/new JSON, filtering hidden and unchanged fields.
 * Rows are ready to be rendered — no async resolution here.
 *
 * @returns {{ field, meta, oldVal, newVal }[]}
 */
export function extractDiffRows(entityType, oldJson, newJson) {
  const old = oldJson || {}
  const neu = newJson || {}
  const formatters = AUDIT_FIELD_FORMATTERS[entityType] || {}
  const rows = []
  const allKeys = new Set([...Object.keys(old), ...Object.keys(neu)])

  for (const field of allKeys) {
    if (isHiddenField(field)) continue
    const meta = formatters[field]
    if (meta?.hidden) continue

    const oldVal = old[field] !== undefined ? old[field] : undefined
    const newVal = neu[field] !== undefined ? neu[field] : undefined

    if (oldVal === newVal) continue

    rows.push({ field, meta: meta ?? { label: field, type: 'text' }, oldVal, newVal })
  }

  return rows
}

/**
 * Generates a human-readable summary sentence for an audit log entry.
 * Returns { prefix, entityLabel, displayType, singleField? }
 *
 * @param {object} log — the raw audit log record
 * @param {{ label, displayType, displayId, isChild }} resolvedEntity
 * @param {{ field, meta, oldVal, newVal }[]} diffRows
 */
export function generateAuditSummary(log, resolvedEntity, diffRows) {
  const { action } = log
  const entityLabel = resolvedEntity?.label || resolvedEntity?.displayId || null
  const displayType = resolvedEntity?.displayType || null
  const isChild = resolvedEntity?.isChild ?? false

  const DISPLAY_TYPE_LABELS_LOCAL = DISPLAY_TYPE_LABELS

  // ── Child entity bubbled up to parent ────────────────────────────────────────
  if (isChild) {
    const originalType = _singularize(log.entityType)
    const phrases = CHILD_ACTION_PHRASES[originalType]
    if (phrases) {
      return { prefix: phrases[action] ?? phrases.DEFAULT ?? 'Updated', entityLabel, displayType }
    }
    const typeName = DISPLAY_TYPE_LABELS_LOCAL[originalType] || originalType
    const verb = action === 'DELETE' ? 'Removed' : action === 'CREATE' ? 'Added' : 'Updated'
    return { prefix: `${verb} ${typeName} in`, entityLabel, displayType }
  }

  // ── Friendly display type name ────────────────────────────────────────────────
  const typeName = DISPLAY_TYPE_LABELS_LOCAL[displayType] || displayType || ''

  // ── CREATE / DELETE ───────────────────────────────────────────────────────────
  if (action === 'CREATE') return { prefix: `Created ${typeName}`, entityLabel, displayType }
  if (action === 'DELETE') return { prefix: `Deleted ${typeName}`, entityLabel, displayType }

  // ── Pure field changes (UPDATE / DRAFT) ───────────────────────────────────────
  if (action === 'UPDATE' || action === 'DRAFT') {
    if (diffRows.length === 1) {
      const fieldLabel = diffRows[0].meta?.label || diffRows[0].field
      return {
        prefix: `Changed ${fieldLabel} on`,
        entityLabel,
        displayType,
        singleField: diffRows[0],
      }
    }
    if (diffRows.length > 1) {
      return {
        prefix: `Updated ${diffRows.length} fields on`,
        entityLabel,
        displayType,
      }
    }
    return { prefix: `Updated ${typeName}`, entityLabel, displayType }
  }

  // ── Named status-transition actions ───────────────────────────────────────────
  const ACTION_VERBS = {
    APPROVE: 'Approved',
    REJECT: 'Rejected',
    ACTIVATE: 'Activated',
    DEACTIVATE: 'Deactivated',
    ARCHIVE: 'Archived',
    RESTORE: 'Restored',
    COMPLETE: 'Completed',
    BLOCK: 'Blocked',
    REQUALIFY: 'Requalified',
    SUBMIT_FOR_REVIEW: 'Submitted for review',
    INITIATE: 'Initiated',
    CLOSE: 'Closed',
    REOPEN: 'Reopened',
    OBSOLETE: 'Marked obsolete',
    PUBLISH: 'Published',
    INVITE: 'Invited',
    ASSIGN_ROLE: 'Assigned role on',
    REVOKE_ROLE: 'Revoked role from',
    ASSIGN_TEAM: 'Assigned to team',
    REASSIGN: 'Reassigned',
    LOCK: 'Locked',
    ROTATE: 'Rotated API key for',
    CANCEL: 'Cancelled',
    STEP_APPROVED: 'Approved step on',
    STEP_REJECTED: 'Rejected step on',
    USER_APPROVED: 'User approved step on',
    USER_REJECTED: 'User rejected step on',
    INVESTIGATE: 'Started investigation on',
    DISPOSITION: 'Set disposition on',
    SHARE_DOC: 'Shared document for',
  }

  const verb = ACTION_VERBS[action]
  if (verb) return { prefix: `${verb}`, entityLabel, displayType }

  return { prefix: `${action} on ${typeName}`, entityLabel, displayType }
}

/**
 * Describes how child-entity audit events should be phrased
 * when bubbled up to display under their parent entity.
 * Keys are singular PascalCase entity types.
 */
export const CHILD_ACTION_PHRASES = {
  WorkflowStep: {
    CREATE: 'Added a step to',
    UPDATE: 'Updated step settings on',
    DELETE: 'Removed a step from',
    DEFAULT: 'Modified step on',
  },
  WorkflowStepRole: {
    CREATE: 'Added a role to step in',
    UPDATE: 'Updated step role on',
    DELETE: 'Removed a role from step in',
    DEFAULT: 'Modified step role in',
  },
  StepSendBackTarget: {
    CREATE: 'Configured send-back target on',
    UPDATE: 'Updated send-back target on',
    DELETE: 'Removed send-back target from',
    DEFAULT: 'Modified send-back target on',
  },
  AllowedOutcomeOnStep: {
    CREATE: 'Added an outcome to step in',
    UPDATE: 'Updated outcome on step in',
    DELETE: 'Removed an outcome from step in',
    DEFAULT: 'Modified step outcome in',
  },
  PermissionOnRole: {
    CREATE: 'Added permission to',
    UPDATE: 'Updated permission on',
    DELETE: 'Removed permission from',
    DEFAULT: 'Modified permission on',
  },
  UsersOnDocument: {
    CREATE: 'was granted access to',
    UPDATE: 'had access updated on',
    DELETE: 'had access revoked from',
    DEFAULT: 'had access modified on',
  },
  RolesOnUser: {
    CREATE: 'was assigned role on',
    UPDATE: 'had role updated on',
    DELETE: 'had role revoked from',
    DEFAULT: 'had role modified on',
  },
  UsersOnTeam: {
    CREATE: 'was added to',
    UPDATE: 'had membership updated on',
    DELETE: 'was removed from',
    DEFAULT: 'had membership modified on',
  },
  UsersOnApprovalWorkflowInstanceStep: {
    CREATE: 'was assigned as approver on',
    UPDATE: 'had approver status updated on',
    DELETE: 'was removed as approver from',
    DEFAULT: 'had approver assignment modified on',
  },
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _singularize(str) {
  if (!str) return str
  // Very simple suffix rules for our known entity names.
  // pluralize.singular() is used in AuditLogsItem but we avoid the import here.
  if (str.endsWith('ies')) return str.slice(0, -3) + 'y'
  if (str.endsWith('sses')) return str.slice(0, -2)
  if (str.endsWith('s') && !str.endsWith('ss') && !str.endsWith('us') && !str.endsWith('is'))
    return str.slice(0, -1)
  return str
}
