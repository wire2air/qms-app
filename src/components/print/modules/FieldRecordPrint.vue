<script setup>
import FormSchemaReadonlyView from '@/components/form/FormSchemaReadonlyView.vue'
import { fieldRecordStatusLabel } from '@/utils/logBookSchemaUtils.js'

/**
 * FieldRecord (a.k.a. "Log entry") print module.
 *
 * Self-contained: takes ?id=<fieldRecordId> from the route, fetches the
 * record + its current revision + the parent log book template + the
 * full revision history via SyncEngine, then wraps the body in
 * PrintLayout so it gets the same company-branded header / footer /
 * status badge / audit chrome every other printed QMS doc gets.
 *
 * Body sections:
 *   1. Metadata table (Entry ID, classification, status, dates, submitter)
 *   2. Entry content — full FormSchemaReadonlyView so complex fields
 *      (checklists, signatures, attachments) render the same way they
 *      do in the in-app preview, not the scalar-only stripped-down
 *      view used by the list-table.
 *   3. Revision history — full append-only trail so the auditor can
 *      see who edited / amended / voided / reviewed the entry and when.
 *
 * The PrintLayout's audit-entities prop is wired to the FieldRecord and
 * every FieldRecordRevision id, so the shared "Recent Audit History"
 * appendix is populated from audit_logs without us re-rendering it
 * ourselves.
 *
 * Auto-fires window.print() once the record + template + revisions are
 * all loaded. Mirrors the timing dance in CapaPrint / DocumentPrint.
 */

const props = defineProps({
  id: { type: String, default: null },
})

const record = useLiveQueryWithDeps([() => props.id], async (db, [id]) => {
  if (!id) return null
  return db.FieldRecord.findByPk(id)
})

const template = useLiveQueryWithDeps([() => record.value?.logBookId], async (db, [tid]) => {
  if (!tid) return null
  return db.LogBook.findByPk(tid)
})

const currentRevision = useLiveQueryWithDeps(
  [() => record.value?.currentRevisionId],
  async (db, [rid]) => {
    if (!rid) return null
    return db.FieldRecordRevision.findByPk(rid)
  },
)

const revisions = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return []
    const rows = await db.FieldRecordRevision.where('fieldRecordId', id).exec()
    return rows.sort((a, b) => (a.revisionNumber ?? 0) - (b.revisionNumber ?? 0))
  },
  { initial: [] },
)

// Schema snapshot takes priority — frozen at submit time, so even if
// the live template schema changes the print reflects what the user
// actually saw + filled in.
const schemaFields = computed(() => {
  const snap = record.value?.logBookSchemaSnapshot
  if (Array.isArray(snap)) return snap
  if (Array.isArray(template.value?.schema)) return template.value.schema
  return []
})

const payload = computed(() => currentRevision.value?.payload ?? {})

// Resolve submitter + voided-by + revision authors for display.
const userIds = computed(() => {
  const ids = new Set()
  if (record.value?.submittedByUserId) ids.add(record.value.submittedByUserId)
  if (record.value?.voidedByUserId) ids.add(record.value.voidedByUserId)
  for (const rev of revisions.value ?? []) {
    if (rev.authorUserId) ids.add(rev.authorUserId)
  }
  return [...ids]
})

const userMap = useLiveQueryWithDeps(
  [() => userIds.value.join(',')],
  async (db, [idsStr]) => {
    const ids = idsStr ? idsStr.split(',') : []
    if (!ids.length) return {}
    const users = await Promise.all(ids.map((id) => db.User.findByPk(id)))
    const map = {}
    for (const u of users.filter(Boolean)) {
      map[u.id] = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u.id
    }
    return map
  },
  { initial: {} },
)

function userName(id) {
  return id ? (userMap.value[id] ?? id) : '—'
}

function fmtDateTime(d) {
  if (!d) return '—'
  if (d.toFormat) return d.toFormat('LLL d, yyyy HH:mm')
  return new Date(d).toLocaleString()
}

const identifier = computed(() => record.value?.recordNumber ?? record.value?.id ?? '')

const auditEntities = computed(() => {
  const out = []
  if (record.value?.id) out.push({ entityType: 'FieldRecords', entityId: record.value.id })
  for (const rev of revisions.value ?? []) {
    out.push({ entityType: 'FieldRecordRevisions', entityId: rev.id })
  }
  return out
})

function revisionTypeLabel(type) {
  return (
    {
      INITIAL_SUBMIT: 'Submitted',
      USER_EDIT: 'Edited',
      ADMIN_AMENDMENT: 'Amended',
      VOID: 'Voided',
      REVIEW_OUTCOME: 'Reviewed',
    }[type] ?? type
  )
}

// Map the field_record status onto the PrintLayout's coarse buckets so
// the header's prominent status badge picks an appropriate colour.
const printStatus = computed(() => record.value?.statusId ?? null)

// Wait for the template too — otherwise print fires before the log
// book name is in scope and the h1 falls back to the generic "Log
// Entry" label. Auditors need the log book on every printed page.
const ready = computed(() => !!record.value && !!currentRevision.value && !!template.value)

onMounted(() => {
  const tryPrint = (attempts = 0) => {
    if (ready.value) {
      setTimeout(() => window.print(), 200)
      return
    }
    if (attempts < 20) setTimeout(() => tryPrint(attempts + 1), 200)
  }
  tryPrint()
})
</script>

<template>
  <PrintLayout
    :status="printStatus"
    :identifier="identifier"
    :effectiveDate="record?.effectiveAt"
    :auditEntities="auditEntities"
  >
    <template #title>
      <div class="fr-print-num">{{ record?.recordNumber || record?.id }}</div>
      <h1 class="fr-print-title">{{ template?.title || 'Log Entry' }}</h1>
      <table class="fr-print-meta">
        <tbody>
          <tr>
            <th>Log book</th>
            <td colspan="3">
              <strong>{{ template?.title || '—' }}</strong>
              <span v-if="template?.code" class="fr-print-meta-code"> · {{ template.code }} </span>
            </td>
          </tr>
          <tr>
            <th>Entry ID</th>
            <td>{{ record?.recordNumber || record?.id || '—' }}</td>
            <th>Classification</th>
            <td>{{ record?.recordClassification?.replace('_', ' ') || '—' }}</td>
          </tr>
          <tr>
            <th>Status</th>
            <td>{{ fieldRecordStatusLabel(record?.statusId) }}</td>
            <th>Log book code</th>
            <td>{{ template?.code || '—' }}</td>
          </tr>
          <tr>
            <th>Submitted by</th>
            <td>{{ userName(record?.submittedByUserId) }}</td>
            <th>Submitted at</th>
            <td>{{ fmtDateTime(record?.submittedAt) }}</td>
          </tr>
          <tr>
            <th>Effective at</th>
            <td>{{ fmtDateTime(record?.effectiveAt) }}</td>
            <th>Submitted via</th>
            <td>{{ record?.submittedVia || '—' }}</td>
          </tr>
          <tr v-if="record?.lockAt || record?.lockReason">
            <th>Lock at</th>
            <td>{{ fmtDateTime(record?.lockAt) }}</td>
            <th>Lock reason</th>
            <td>{{ record?.lockReason || '—' }}</td>
          </tr>
          <tr v-if="record?.voidedAt">
            <th>Voided by</th>
            <td>{{ userName(record?.voidedByUserId) }}</td>
            <th>Voided at</th>
            <td>{{ fmtDateTime(record?.voidedAt) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="record?.voidReason" class="fr-print-void">
        <span class="fr-print-void-label">Void reason:</span> {{ record.voidReason }}
      </div>
    </template>

    <div v-if="!ready" class="tw:py-10 tw:text-secondary tw:text-center">Loading entry…</div>
    <div v-else class="fr-print-body">
      <!-- Entry content — full readonly schema render so complex
           fields (checklists, signatures, files, repeaters) print the
           same way they show in-app. -->
      <section class="fr-print-section">
        <h2>Entry Content</h2>
        <FormSchemaReadonlyView
          v-if="schemaFields.length > 0"
          :fields="schemaFields"
          :values="payload"
        />
        <pre v-else class="fr-print-rawpayload">{{ JSON.stringify(payload, null, 2) }}</pre>
      </section>

      <!-- Revision history — auditor-grade append-only trail. -->
      <section v-if="revisions.length > 0" class="fr-print-section">
        <h2>Revision History ({{ revisions.length }})</h2>
        <table class="fr-print-revisions">
          <thead>
            <tr>
              <th>#</th>
              <th>Type</th>
              <th>E-signed</th>
              <th>Author</th>
              <th>At</th>
              <th>Reason / comment</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="rev in revisions" :key="rev.id">
              <td>#{{ rev.revisionNumber }}</td>
              <td>{{ revisionTypeLabel(rev.revisionType) }}</td>
              <td>{{ rev.signatureId ? 'Yes' : '—' }}</td>
              <td>{{ userName(rev.authorUserId) }}</td>
              <td>{{ fmtDateTime(rev.authoredAt) }}</td>
              <td>{{ rev.voidReason || rev.comment || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </PrintLayout>
</template>

<style>
.fr-print-num {
  font-size: 11px;
  color: #6b7280;
  font-family: ui-monospace, SFMono-Regular, monospace;
  letter-spacing: 0.5px;
}
.fr-print-title {
  font-size: 22px;
  font-weight: 700;
  margin: 4px 0 14px;
  line-height: 1.25;
  color: var(--print-accent, #111827);
}
.fr-print-meta {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.fr-print-meta th {
  text-align: left;
  background: #f9fafb;
  padding: 6px 10px;
  border: 1px solid #e5e7eb;
  font-weight: 600;
  width: 16%;
}
.fr-print-meta td {
  padding: 6px 10px;
  border: 1px solid #e5e7eb;
  width: 34%;
}
.fr-print-meta-code {
  font-family: ui-monospace, SFMono-Regular, monospace;
  color: #6b7280;
  font-size: 10px;
}
.fr-print-void {
  margin-top: 10px;
  font-size: 11px;
  color: #7c2d12;
  padding: 6px 10px;
  background: #fef2f2;
  border-left: 3px solid #b91c1c;
}
.fr-print-void-label {
  font-weight: 700;
  text-transform: uppercase;
  font-size: 9px;
  letter-spacing: 0.3px;
  color: #991b1b;
  margin-right: 4px;
}
.fr-print-body {
  font-size: 11px;
}
.fr-print-section {
  margin: 18px 0;
  break-inside: avoid-page;
}
.fr-print-section > h2 {
  font-size: 14px;
  font-weight: 700;
  margin: 0 0 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid #e5e7eb;
  color: var(--print-accent, #111827);
}
.fr-print-rawpayload {
  font-size: 10px;
  background: #f9fafb;
  padding: 8px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  overflow-x: auto;
}
.fr-print-revisions {
  width: 100%;
  border-collapse: collapse;
  font-size: 10px;
}
.fr-print-revisions th,
.fr-print-revisions td {
  border: 1px solid #e5e7eb;
  padding: 5px 8px;
  text-align: left;
  vertical-align: top;
}
.fr-print-revisions th {
  background: #f9fafb;
  font-weight: 600;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: #6b7280;
}
</style>
