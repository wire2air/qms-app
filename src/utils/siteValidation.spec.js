import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TIMEZONE,
  SITE_CODE_MAX_LENGTH,
  isSiteCodeAvailable,
  isSiteNameAvailable,
  isValidTimezone,
  normalizeSiteCode,
  normalizeSiteName,
  siteSaveErrorMessage,
  suggestSiteCode,
  timezoneRule,
} from './siteValidation.js'

const NY = { id: 'a', name: 'New York Headquarters', code: 'NY-HQ' }
const LDN = { id: 'b', name: 'London', code: 'LDN' }
const SITES = [NY, LDN]

describe('normalizeSiteName', () => {
  // The DB index is `lower(btrim(name))`. Any other normalization means the
  // client says "available" and Postgres answers 23505.
  it('lowercases and trims, matching lower(btrim(name))', () => {
    expect(normalizeSiteName('  London ')).toBe('london')
    expect(normalizeSiteName('LONDON')).toBe('london')
  })

  it('is safe with null/undefined', () => {
    expect(normalizeSiteName(null)).toBe('')
    expect(normalizeSiteName(undefined)).toBe('')
  })
})

describe('normalizeSiteCode', () => {
  it('uppercases and trims, matching the server’s code.trim().toUpperCase()', () => {
    expect(normalizeSiteCode(' ny-hq ')).toBe('NY-HQ')
  })
})

describe('isSiteNameAvailable', () => {
  it('accepts a genuinely new name', () => {
    expect(isSiteNameAvailable(SITES, 'Berlin')).toBe(true)
  })

  it('rejects an exact duplicate', () => {
    expect(isSiteNameAvailable(SITES, 'London')).toBe(false)
  })

  // The finding: "a case-variant name surfaces as a raw 23505".
  it('rejects a case variant and a whitespace variant', () => {
    expect(isSiteNameAvailable(SITES, 'london')).toBe(false)
    expect(isSiteNameAvailable(SITES, '  LoNdOn  ')).toBe(false)
  })

  it('excludes the row being edited, so re-saving a site is not a duplicate', () => {
    expect(isSiteNameAvailable(SITES, 'London', 'b')).toBe(true)
    expect(isSiteNameAvailable(SITES, 'London', 'a')).toBe(false)
  })

  it('treats an empty name as not-yet-answerable rather than taken', () => {
    expect(isSiteNameAvailable(SITES, '')).toBe(true)
    expect(isSiteNameAvailable(SITES, '   ')).toBe(true)
  })

  it('is safe with a non-array list', () => {
    expect(isSiteNameAvailable(undefined, 'London')).toBe(true)
    expect(isSiteNameAvailable(null, 'London')).toBe(true)
  })
})

describe('isSiteCodeAvailable', () => {
  it('accepts a genuinely new code', () => {
    expect(isSiteCodeAvailable(SITES, 'BER')).toBe(true)
  })

  it('rejects an exact duplicate', () => {
    expect(isSiteCodeAvailable(SITES, 'NY-HQ')).toBe(false)
  })

  // The old check was `s.code === code` — a lowercase entry sailed past it and
  // was then rejected by the server, which compares uppercased.
  it('rejects a case variant, because the server uppercases before comparing', () => {
    expect(isSiteCodeAvailable(SITES, 'ny-hq')).toBe(false)
    expect(isSiteCodeAvailable(SITES, ' Ny-Hq ')).toBe(false)
  })

  it('excludes the row being edited', () => {
    expect(isSiteCodeAvailable(SITES, 'NY-HQ', 'a')).toBe(true)
  })

  it('stays quiet for a 0- or 1-character code still being typed', () => {
    expect(isSiteCodeAvailable([{ id: 'x', code: 'N' }], 'N')).toBe(true)
    expect(isSiteCodeAvailable(SITES, '')).toBe(true)
  })
})

describe('suggestSiteCode', () => {
  it('derives an uppercase, hyphen-separated code from the name', () => {
    expect(suggestSiteCode('New York', [])).toBe('NEW-YORK')
  })

  it('collapses runs of non-alphanumerics and never ends on a dangling hyphen', () => {
    expect(suggestSiteCode('São  Paulo!!', [])).toBe('S-O-PAULO')
    expect(suggestSiteCode('-- Depot --', [])).toBe('DEPOT')
  })

  it(`never exceeds the STRING(${SITE_CODE_MAX_LENGTH}) column`, () => {
    const code = suggestSiteCode('New York Headquarters', [])
    expect(code.length).toBeLessThanOrEqual(SITE_CODE_MAX_LENGTH)
  })

  it('de-duplicates against codes already in use', () => {
    expect(suggestSiteCode('London', [LDN])).toBe('LONDON')
    expect(suggestSiteCode('London', [{ id: 'x', code: 'LONDON' }])).toBe('LONDON-1')
  })

  // The old loop appended the suffix AFTER truncating to 10, so a long name
  // could suggest an 11-character code the column cannot hold.
  it('keeps a de-duplicated suggestion inside the column width', () => {
    const taken = [{ id: 'x', code: 'NEW-YORK-H' }]
    const code = suggestSiteCode('New York Headquarters', taken)
    expect(code.length).toBeLessThanOrEqual(SITE_CODE_MAX_LENGTH)
    expect(code).not.toBe('NEW-YORK-H')
  })

  it('de-duplicates case-insensitively', () => {
    expect(suggestSiteCode('London', [{ id: 'x', code: 'london' }])).toBe('LONDON-1')
  })

  it('returns an empty string for a name with nothing usable in it', () => {
    expect(suggestSiteCode('   ', [])).toBe('')
    expect(suggestSiteCode(null, [])).toBe('')
  })
})

describe('isValidTimezone', () => {
  it('accepts the default and real IANA zones', () => {
    expect(isValidTimezone(DEFAULT_TIMEZONE)).toBe(true)
    expect(isValidTimezone('America/New_York')).toBe(true)
    expect(isValidTimezone('Asia/Kolkata')).toBe(true)
  })

  it('rejects a made-up zone', () => {
    expect(isValidTimezone('Mars/Olympus_Mons')).toBe(false)
    expect(isValidTimezone('Not A Zone')).toBe(false)
  })

  it('rejects empty / null, which is what the form used to submit', () => {
    expect(isValidTimezone('')).toBe(false)
    expect(isValidTimezone('   ')).toBe(false)
    expect(isValidTimezone(null)).toBe(false)
    expect(isValidTimezone(undefined)).toBe(false)
  })
})

describe('timezoneRule', () => {
  it('passes on a valid zone', () => {
    expect(timezoneRule()('UTC')).toBe(true)
  })

  it('fails on an invalid zone with a usable message', () => {
    expect(timezoneRule()('Mars/Olympus_Mons')).toBe('Pick a valid timezone.')
  })

  it('defers emptiness to required(), the way every other rule does', () => {
    expect(timezoneRule()('')).toBe(true)
    expect(timezoneRule()(null)).toBe(true)
  })
})

describe('siteSaveErrorMessage', () => {
  it('names the NAME field when the name unique index fires', () => {
    const err = new Error(
      'duplicate key value violates unique constraint "sites_company_name_unique"',
    )
    const msg = siteSaveErrorMessage(err, { name: 'London', code: 'LDN' })
    expect(msg).toMatch(/name/i)
    expect(msg).toContain('London')
    expect(msg).not.toMatch(/constraint|duplicate key/i)
  })

  it('names the CODE field when the server rejects the code', () => {
    const err = new Error('Site code already exists for this company')
    const msg = siteSaveErrorMessage(err, { name: 'London', code: 'LDN' })
    expect(msg).toMatch(/code/i)
    expect(msg).toContain('LDN')
  })

  /**
   * Load-bearing coupling: useLiveQuery.js's friendlyMutationError rewrites any
   * message matching this regex back to the generic "That already exists.
   * Please use a different value." — which is exactly the unhelpful string this
   * function exists to replace. If someone rephrases these messages using the
   * word "exists", the toast silently reverts to generic and nobody notices.
   */
  const FRIENDLY_MUTATION_ERROR_REGEX = /duplicate key|unique constraint|already exists/i

  it('phrases duplicates so friendlyMutationError does not flatten them back to generic', () => {
    const cases = [
      new Error('duplicate key value violates unique constraint "sites_company_name_unique"'),
      new Error('Site code already exists for this company'),
    ]
    for (const err of cases) {
      const msg = siteSaveErrorMessage(err, { name: 'London', code: 'LDN' })
      expect(msg).not.toMatch(FRIENDLY_MUTATION_ERROR_REGEX)
    }
  })

  it('replaces PostGraphile’s masked production error with something readable', () => {
    expect(siteSaveErrorMessage(new Error('An error occurred (logged with hash: abc123)'))).toBe(
      'Could not save the site. Please try again.',
    )
    expect(siteSaveErrorMessage(null)).toBe('Could not save the site. Please try again.')
    expect(siteSaveErrorMessage(new Error(''))).toBe('Could not save the site. Please try again.')
  })

  it('passes an unrelated, already-readable error through unchanged', () => {
    expect(siteSaveErrorMessage(new Error('Network request failed'))).toBe('Network request failed')
  })

  it('works without a form argument', () => {
    const msg = siteSaveErrorMessage(
      new Error('duplicate key value violates unique constraint "sites_company_name_unique"'),
    )
    expect(msg).toMatch(/name/i)
  })
})
