<script setup>
/**
 * Complaint print module (user request 2026-08-16).
 *
 * Self-contained, like every other entry in the registry: it reads its own id,
 * fetches via SyncEngine, and wraps PrintLayout for the shared chrome.
 *
 * The printed order deliberately mirrors the detail page after the rail
 * restructure — identity, then the complaint itself, then what it is about,
 * then QA's assessment. Someone holding the printout and someone looking at
 * the screen should be reading the same document in the same order.
 *
 * The description is rendered through RichTextAttachments in readonly mode
 * rather than v-html. complaints.description carries the component's own
 * "[qms-attachments]::" encoding (it is NOT in separateAttachments mode, which
 * only document sections use), so raw interpolation would print the marker and
 * its JSON payload as visible text.
 */
import RichTextAttachments from '@/components/shared/RichTextAttachments.vue'

const props = defineProps({
  id: { type: String, default: null },
})

const complaint = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => (id ? db.Complaint.findByPk(id) : null),
  { models: ['Complaint'] },
)

/**
 * Resolve every per-tenant lookup the printout names, in one query.
 *
 * Printed output has no tooltips and no hover — an unresolved id is simply
 * wrong on paper, where a badge component would at least have shown something.
 * So each is looked up and printed as its name, falling back to an em dash.
 */
const lookups = useLiveQueryWithDeps(
  [
    () => complaint.value?.statusId,
    () => complaint.value?.sourceId,
    () => complaint.value?.categoryId,
    () => complaint.value?.subCategoryId,
    () => complaint.value?.typeId,
    () => complaint.value?.severityId,
    () => complaint.value?.riskLevelId,
    () => complaint.value?.customerTypeId,
    () => complaint.value?.regionId,
    () => complaint.value?.countryId,
  ],
  async (db, [status, source, cat, sub, type, sev, risk, custType, region, country]) => {
    const one = async (Model, id) => (id ? ((await Model.findByPk(id))?.name ?? null) : null)
    return {
      status: await one(db.ComplaintStatus, status),
      source: await one(db.ComplaintSourceType, source),
      category: await one(db.ComplaintCategory, cat),
      subCategory: await one(db.ComplaintSubCategory, sub),
      type: await one(db.ComplaintType, type),
      severity: await one(db.ComplaintSeverity, sev),
      risk: await one(db.ComplaintRiskLevel, risk),
      customerType: await one(db.ComplaintCustomerType, custType),
      region: await one(db.Region, region),
      country: await one(db.Country, country),
    }
  },
  {
    models: [
      'ComplaintStatus',
      'ComplaintSourceType',
      'ComplaintCategory',
      'ComplaintSubCategory',
      'ComplaintType',
      'ComplaintSeverity',
      'ComplaintRiskLevel',
      'ComplaintCustomerType',
      'Region',
      'Country',
    ],
    initial: {},
  },
)

const related = useLiveQueryWithDeps(
  [
    () => complaint.value?.productId,
    () => complaint.value?.supplierId,
    () => complaint.value?.siteId,
    () => complaint.value?.ownerId,
  ],
  async (db, [productId, supplierId, siteId, ownerId]) => {
    const product = productId ? await db.Product.findByPk(productId) : null
    const supplier = supplierId ? await db.Supplier.findByPk(supplierId) : null
    const site = siteId ? await db.Site.findByPk(siteId) : null
    const owner = ownerId ? await db.User.findByPk(ownerId) : null
    return {
      product: product?.name ?? null,
      supplier: supplier?.name ?? null,
      site: site?.name ?? null,
      owner: owner
        ? `${owner.firstName ?? ''} ${owner.lastName ?? ''}`.trim() || owner.email
        : null,
    }
  },
  { models: ['Product', 'Supplier', 'Site', 'User'], initial: {} },
)

const dash = (v) => (v === null || v === undefined || v === '' ? '—' : v)
const yesNo = (v) => (v === true ? 'Yes' : v === false ? 'No' : '—')

// Luxon formatted inline, as the other print modules do. `dt` is an app-wide
// helper that is not in scope in the print bundle.
function fmt(d) {
  if (!d) return '—'
  if (typeof d?.toFormat === 'function') return d.toFormat('LLL d, yyyy HH:mm')
  return new Date(d).toLocaleString()
}

const identifier = computed(() => complaint.value?.complaintNumber ?? '')

const auditEntities = computed(() =>
  complaint.value?.id ? [{ entityType: 'Complaints', entityId: complaint.value.id }] : [],
)

// Same guard the other modules use: wait for the record before firing the
// browser dialog, or the user gets a print preview of an empty page.
const ready = computed(() => !!complaint.value)

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
    :status="complaint?.statusId"
    :identifier="identifier"
    :auditEntities="auditEntities"
  >
    <template #title>
      <div class="cx-num">{{ complaint?.complaintNumber || '—' }}</div>
      <h1 class="cx-title">{{ complaint?.subject }}</h1>
      <table class="cx-meta">
        <tbody>
          <tr>
            <th>Complaint number</th>
            <td>{{ dash(complaint?.complaintNumber) }}</td>
            <th>Status</th>
            <td>{{ dash(lookups.status ?? complaint?.statusId) }}</td>
          </tr>
          <tr>
            <th>Intake source</th>
            <td>{{ dash(lookups.source) }}</td>
            <th>Owner</th>
            <td>{{ dash(related.owner) }}</td>
          </tr>
          <tr>
            <th>Raised</th>
            <td>{{ fmt(complaint?.createdAt) }}</td>
            <th>Closed</th>
            <td>{{ fmt(complaint?.closedAt) }}</td>
          </tr>
        </tbody>
      </table>
    </template>

    <section class="cx-section">
      <h2>Complaint</h2>
      <RichTextAttachments :modelValue="complaint?.description || ''" readonly />
    </section>

    <section class="cx-section">
      <h2>Product &amp; origin</h2>
      <table class="cx-meta">
        <tbody>
          <tr>
            <th>Product / Service</th>
            <td>{{ dash(related.product) }}</td>
            <th>Supplier</th>
            <td>{{ dash(related.supplier) }}</td>
          </tr>
          <tr>
            <th>Samples received</th>
            <td>{{ yesNo(complaint?.sampleReceived) }}</td>
            <th>Batch / Lot / Serial</th>
            <td>{{ dash(complaint?.batchLotSerial) }}</td>
          </tr>
          <tr>
            <th>Quantity affected</th>
            <td>{{ dash(complaint?.quantityAffected) }}</td>
            <th>Order / Invoice</th>
            <td>{{ dash(complaint?.orderInvoiceNumber) }}</td>
          </tr>
          <tr>
            <th>Site / Branch</th>
            <td>{{ dash(related.site) }}</td>
            <th>Region / Country</th>
            <td>{{ dash(lookups.region) }} / {{ dash(lookups.country) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="cx-section">
      <h2>Classification</h2>
      <table class="cx-meta">
        <tbody>
          <tr>
            <th>Category</th>
            <td>{{ dash(lookups.category) }}</td>
            <th>Sub-category</th>
            <td>{{ dash(lookups.subCategory) }}</td>
          </tr>
          <tr>
            <th>Type</th>
            <td>{{ dash(lookups.type) }}</td>
            <th>Severity</th>
            <td>{{ dash(lookups.severity) }}</td>
          </tr>
          <tr>
            <th>Risk level</th>
            <td>{{ dash(lookups.risk) }}</td>
            <th>Customer type</th>
            <td>{{ dash(lookups.customerType) }}</td>
          </tr>
          <tr>
            <th>Safety issue</th>
            <td>{{ yesNo(complaint?.safetyIssue) }}</td>
            <th>Regulatory reportable</th>
            <td>{{ yesNo(complaint?.regulatoryReportable) }}</td>
          </tr>
          <tr>
            <th>Potential recall</th>
            <td>{{ yesNo(complaint?.potentialRecall) }}</td>
            <th>Repeat issue</th>
            <td>{{ yesNo(complaint?.repeatIssue) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="cx-section">
      <h2>Customer</h2>
      <table class="cx-meta">
        <tbody>
          <tr>
            <th>Name</th>
            <td>{{ dash(complaint?.customerName) }}</td>
            <th>Company</th>
            <td>{{ dash(complaint?.customerCompany) }}</td>
          </tr>
          <tr>
            <th>Email</th>
            <td>{{ dash(complaint?.customerEmail) }}</td>
            <th>Phone</th>
            <td>{{ dash(complaint?.customerPhone) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="cx-section">
      <h2>QA assessment</h2>
      <table class="cx-meta">
        <tbody>
          <tr>
            <th>Investigation required</th>
            <td>{{ yesNo(complaint?.investigationRequired) }}</td>
            <th>Disposition</th>
            <td>{{ dash(complaint?.disposition) }}</td>
          </tr>
          <tr>
            <th>Reportability</th>
            <td>{{ dash(complaint?.reportabilityStatus) }}</td>
            <th>Report due</th>
            <td>{{ fmt(complaint?.reportDueAt) }}</td>
          </tr>
        </tbody>
      </table>

      <template v-if="complaint?.investigation">
        <h3>Investigation</h3>
        <RichTextAttachments :modelValue="complaint.investigation" readonly />
      </template>

      <template v-if="complaint?.reviewSummary">
        <h3>Review summary</h3>
        <RichTextAttachments :modelValue="complaint.reviewSummary" readonly />
      </template>

      <template v-if="complaint?.reportabilityRationale">
        <h3>Reportability rationale</h3>
        <p class="cx-body">{{ complaint.reportabilityRationale }}</p>
      </template>
    </section>
  </PrintLayout>
</template>

<style scoped>
.cx-num {
  font-size: 11pt;
  font-weight: 600;
  color: #555;
}
.cx-title {
  font-size: 17pt;
  font-weight: 700;
  margin: 0.2em 0 0.6em;
}
.cx-section {
  margin-top: 1.1em;
  break-inside: avoid;
}
.cx-section h2 {
  font-size: 11pt;
  font-weight: 700;
  border-bottom: 1px solid #ccc;
  padding-bottom: 0.2em;
  margin-bottom: 0.4em;
}
.cx-section h3 {
  font-size: 10pt;
  font-weight: 600;
  margin: 0.7em 0 0.25em;
}
.cx-meta {
  width: 100%;
  border-collapse: collapse;
  font-size: 9.5pt;
}
.cx-meta th,
.cx-meta td {
  border: 1px solid #ddd;
  padding: 3px 6px;
  text-align: left;
  vertical-align: top;
}
.cx-meta th {
  width: 18%;
  background: #f6f6f6;
  font-weight: 600;
}
.cx-body {
  font-size: 10pt;
  white-space: pre-wrap;
}
</style>
