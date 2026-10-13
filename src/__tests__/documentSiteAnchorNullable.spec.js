// A company-wide document may have NO owning site, and the client model has to
// permit that — otherwise the create form accepts the combination and the save
// throws.
//
// Reported: ticking "All sites (company-wide)" passed validation, then saving
// failed with "siteId is required".
//
// The three layers disagreed. `documents.site_id` is NULLABLE in Postgres, and
// DocumentsCreate's deriveAnchorSiteId() returns null on purpose when a
// company-wide document is created by a user who has no site of their own
// (`mySite || formData.siteIds?.[0] || null` — and ticking the box HIDES the
// site picker, so siteIds is empty). The Sites field's own rule accepts
// `appliesAllSites` with no sites, so the form said yes. Only the client model
// still carried `required: true`, left over from before document_sites landed,
// and BaseModel validates on save. So the failure surfaced at the very end, on
// a form that had already told the author they were done.
//
// A source scan, not an import: models/*.js use legacy decorators that need
// vite-plugin-babel, which the light vitest config deliberately does not load
// (same constraint as workflowClientModelsParanoid.spec.js).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MODELS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../models')
const source = readFileSync(path.join(MODELS_DIR, 'document.js'), 'utf8')

/** The single @Property line declaring `field`, decorator options included. */
function propertyLine(field) {
  const match = source.match(new RegExp(`^\\s*@Property\\(([^)]*)\\)\\s*${field}\\s*=.*$`, 'm'))
  return match ? { options: match[1], line: match[0].trim() } : null
}

describe('Document client model — the company-wide anchor', () => {
  it('does not mark siteId required', () => {
    const prop = propertyLine('siteId')
    expect(prop, 'siteId @Property not found in models/document.js').not.toBeNull()
    expect(
      /required:\s*true/.test(prop.options),
      `siteId must stay optional — a company-wide document created by a site-less ` +
        `user has no anchor to derive, and site_id is nullable in Postgres. Got: ${prop.line}`,
    ).toBe(false)
  })

  it('defaults siteId to null, not the empty string', () => {
    // GraphQL rejects '' for a nullable UUID input ("Invalid UUID, expected 32
    // hexadecimal characters"), so an unset FK has to be null — the same rule
    // the relatedStandardId / lastReviewedAt comments in this model call out.
    const prop = propertyLine('siteId')
    expect(prop.line).not.toMatch(/siteId\s*=\s*['"]{2}/)
  })

  it('still declares appliesAllSites, which is what carries company-wide visibility', () => {
    // If this ever goes away, a null siteId stops being safe: read access for a
    // company-wide document comes from the applies_all_sites arm of
    // documents_sel, NOT from site_id.
    expect(propertyLine('appliesAllSites')).not.toBeNull()
  })
})
