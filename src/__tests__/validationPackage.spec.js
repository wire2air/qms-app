/**
 * Integrity of the shipped Validation Package.
 *
 * These documents go to customers' auditors, so the failure modes that matter
 * are the quiet ones: a cross-reference that renders and clicks but leads
 * nowhere, a protocol with no signature block, a test-step table whose
 * execution columns aren't actually blank. None of those throw — they just
 * produce a document that fails review after someone has already printed it.
 *
 * The link check also pins the fix for a real bug: rewriteTarget stripped the
 * leading slash off an already-final target and re-applied the prefix, turning
 * `/validation/oq/capa` into `/validation/validation/oq/capa`. Every one of the
 * 64 internal links was dead on first build.
 */
import { describe, it, expect } from 'vitest'
import { marked } from 'marked'
import validation from '../content/validation.generated.json'
import help from '../content/help.generated.json'

const EXTERNAL = /^(https?:|mailto:|tel:|#)/i

/** Internal markdown link targets in a body, minus anchors and external URLs. */
function internalLinks(body) {
  return [...body.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)]
    .map((m) => m[1])
    .filter((t) => !EXTERNAL.test(t))
}

describe('validation bundle', () => {
  const slugs = new Set(validation.articles.map((a) => a.slug))

  it('ships the framework documents and one protocol per module', () => {
    expect(validation.articles).toHaveLength(22)
    // 6 framework + 16 OQ. The OQ count is the customer-facing promise.
    expect(validation.articles.filter((a) => a.category === 'oq')).toHaveLength(16)
    expect(validation.articles.filter((a) => a.category === 'framework')).toHaveLength(6)
  })

  it('numbers the OQ protocols 01–16 with no gaps or duplicates', () => {
    const numbers = validation.articles
      .filter((a) => a.category === 'oq')
      .map((a) => a.title.match(/^OQ-(\d{2})/)?.[1])
    expect(numbers.every(Boolean)).toBe(true)
    expect([...new Set(numbers)].sort()).toEqual(numbers.slice().sort())
    expect(numbers.slice().sort()).toEqual(
      Array.from({ length: 16 }, (_, i) => String(i + 1).padStart(2, '0')),
    )
  })

  it('resolves every internal cross-reference', () => {
    const broken = []
    for (const a of validation.articles) {
      for (const target of internalLinks(a.body)) {
        const slug = target.split('#')[0].replace(/^\/validation\//, '')
        if (!slugs.has(slug)) broken.push(`${a.slug} -> ${target}`)
      }
    }
    expect(broken).toEqual([])
  })

  it('rewrites an already-final link target exactly once', () => {
    // The regression, pinned against a specific known cross-reference rather
    // than a substring scan: `/validation/validation/...` is only *usually*
    // wrong, and the equivalent scan on the help bundle false-positives because
    // content/help/help/ is a real directory.
    const guide = validation.articles.find((a) => a.slug === 'framework/how-to-use-this-package')
    expect(guide.body).toContain('](/validation/framework/traceability-matrix)')
    expect(guide.body).not.toContain('](/validation/validation/')
  })

  it('keeps the whole package out of the public marketing sync', () => {
    // publish-public-docs.mjs syndicates `access: public`. A qualification
    // protocol on the marketing site would be read as a compliance claim.
    expect(validation.articles.filter((a) => a.access === 'public')).toEqual([])
  })

  it('gives every executable protocol a signature block and a deviation log', () => {
    const executable = validation.articles.filter(
      // The how-to guide is guidance, not a protocol — it is signed by nobody.
      (a) => a.slug !== 'framework/how-to-use-this-package',
    )
    for (const a of executable) {
      expect(a.body, `${a.slug} signature block`).toMatch(/\|\s*Signature\s*\|/)
    }
    for (const a of executable.filter((x) => x.category === 'oq')) {
      expect(a.body, `${a.slug} deviation log`).toMatch(/## .*Deviation log/i)
      expect(a.body, `${a.slug} execution summary`).toMatch(/## .*Execution summary/i)
    }
  })

  it('renders blank execution columns a tester can actually write in', () => {
    for (const a of validation.articles.filter((x) => x.category === 'oq')) {
      const html = marked.parse(a.body, { gfm: true })
      // Each protocol is mostly step tables; empty <td> are the Actual Result /
      // Pass-Fail / Initials cells. A protocol with none isn't executable.
      expect((html.match(/<table>/g) ?? []).length, `${a.slug} tables`).toBeGreaterThan(2)
      expect((html.match(/<td><\/td>/g) ?? []).length, `${a.slug} blank cells`).toBeGreaterThan(20)
    }
  })

  it('states the customer-executes position on the entry document', () => {
    const guide = validation.articles.find((a) => a.slug === 'framework/how-to-use-this-package')
    expect(guide).toBeTruthy()
    expect(guide.body).toMatch(/not a completed validation/i)
  })
})

describe('help bundle — unaffected by the second content root', () => {
  const slugs = new Set(help.articles.map((a) => a.slug))

  it('still resolves every internal cross-reference', () => {
    const broken = []
    for (const a of help.articles) {
      for (const target of internalLinks(a.body)) {
        const slug = target.split('#')[0].replace(/^\/help\//, '')
        if (!slugs.has(slug)) broken.push(`${a.slug} -> ${target}`)
      }
    }
    expect(broken).toEqual([])
  })

  it('keeps its own articles addressable, including the help/ subsection', () => {
    // `content/help/help/` is a real category, so `/help/help/faq` is correct —
    // which is exactly why the double-prefix guard above is written against a
    // known target instead of scanning for a repeated segment.
    expect(slugs.has('help/faq')).toBe(true)
  })
})
