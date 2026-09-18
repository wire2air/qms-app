// Sites — condition 9 / 12 regression probes (qms/docs/modules/sites/19-production-readiness.md).
//
// Every item below is a defect that shipped and was removed. They are pinned at
// source level on purpose, and for the same reason the Workflows F-20 probe is:
// each one lives inside an SFC whose setup pulls in the syncEngine, a dialog
// host and half a dozen live queries, so mounting it to read one string would
// test the harness rather than the property. The behavioural halves of these
// changes are covered by their own unit specs — siteValidation.spec.js,
// siteDependencies.spec.js and SiteBadgeById.spec.js.
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO_DIR = path.resolve(SRC_DIR, '..')

/**
 * Read a source file with its comments removed.
 *
 * Every probe below asserts the ABSENCE of something, and the code that
 * replaced each defect explains what it replaced — so an un-stripped read
 * matches the very comment describing the fix. Stripping keeps the probes
 * about the code and leaves the explanations free to name the old behaviour.
 */
function read(p) {
  return readFileSync(p, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '') // HTML/template comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/(^|[^:])\/\/.*$/gm, '$1') // line comments (not '://' in a URL)
}

const DIALOG = path.join(SRC_DIR, 'components/sites/SitesCreateUpdateDialog.vue')
const INDEX = path.join(SRC_DIR, 'components/sites/SitesIndex.vue')
const HOME = path.join(SRC_DIR, 'components/sites/SitesHome.vue')
const DEPT_MENU = path.join(SRC_DIR, 'components/menus/DepartmentSelectMenu.vue')
const SITE_MODEL = path.join(REPO_DIR, 'models/site.js')

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (statSync(full).isFile()) out.push(full)
  }
  return out
}

// Specs are excluded: this file names the removed symbols in order to assert
// they are gone, and would otherwise flag itself.
const SOURCE_FILES = walk(SRC_DIR).filter(
  (f) => /\.(js|vue)$/.test(f) && !/\.spec\.js$/.test(f) && !f.includes(`${path.sep}__tests__`),
)

describe('FINDING 10 — the module’s legacy REST layer is gone', () => {
  // A 137-line orphan holding the whole pre-syncEngine REST layer for Sites:
  // fetch/create/update/delete/checkCodeAvailability plus a provide/inject
  // store, with zero importers. Frontend CLAUDE.md rule #4 forbids exactly this
  // shape for entity CRUD.
  it('useSites.js no longer exists', () => {
    expect(existsSync(path.join(SRC_DIR, 'composables/useSites.js'))).toBe(false)
  })

  it('nothing imports useSites / provideSites', () => {
    const offenders = SOURCE_FILES.filter((f) => /\b(useSites|provideSites)\b/.test(read(f)))
    expect(offenders).toEqual([])
  })
})

describe('FINDING 10 — displayOrder, a dead field costing a full scan per create', () => {
  // `getDisplayOrder()` ran `db.Site.where().orderBy('displayOrder','desc')` on
  // every create and passed the result into `db.Site.create()`. The Site model
  // declares no such property, so the value was always 1000 and serialization
  // dropped the key: a whole table scan for a field that did not exist.
  it('the Site client model declares no displayOrder property', () => {
    expect(read(SITE_MODEL)).not.toMatch(/displayOrder/)
  })

  it('the create dialog neither reads nor sends displayOrder', () => {
    expect(read(DIALOG)).not.toMatch(/displayOrder/)
  })
})

describe('FINDING 10 — the dead RouterView branch', () => {
  // `src/pages/sites.vue` renders <SitesIndex /> with no props and no child
  // route is registered, so `id` could never populate and the v-else branch was
  // unreachable.
  it('SitesIndex has no RouterView branch and no id prop', () => {
    const src = read(INDEX)
    expect(src).not.toMatch(/RouterView/)
    expect(src).not.toMatch(/defineProps/)
  })

  it('the page still renders the register', () => {
    expect(read(INDEX)).toMatch(/<SitesHome\s*\/>/)
  })
})

describe('FINDING 10 — the uniqueness checks no longer scan twice per keystroke', () => {
  // Both checks used to run their own `db.Site.where().exec()` keyed on the
  // field's value, so typing in either box triggered a fresh IndexedDB full
  // scan. They are answers about the same list; one cached live query now
  // serves both.
  it('the dialog holds exactly one Site full scan', () => {
    const scans = read(DIALOG).match(/db\.Site\.where\(\)/g) || []
    expect(scans).toHaveLength(1)
  })

  it('the uniqueness predicates are the shared, unit-tested helpers', () => {
    const src = read(DIALOG)
    expect(src).toMatch(/isSiteCodeAvailable/)
    expect(src).toMatch(/isSiteNameAvailable/)
  })
})

describe('condition 12 — validation reaches the DB’s real bounds', () => {
  it('the code field is bounded by the STRING(10) column', () => {
    expect(read(DIALOG)).toMatch(/maxLen\(SITE_CODE_MAX_LENGTH\)/)
  })

  it('the timezone field is checked for IANA validity', () => {
    const src = read(DIALOG)
    expect(src).toMatch(/timezoneValid/)
    expect(src).toMatch(/isValidTimezone/)
  })

  // Three inconsistent defaults — model 'UTC', bootstrap null, form null — and
  // the form's null won, bypassing the other two.
  it('the form initialises timezone to the model default, not null', () => {
    const src = read(DIALOG)
    expect(src).toMatch(/timezone: DEFAULT_TIMEZONE/)
    expect(src).not.toMatch(/timezone: null/)
  })
})

describe('condition 9 — the delete confirm is honest and checks dependants', () => {
  const src = () => read(HOME)

  // It said "This cannot be undone" about a SOFT delete...
  it('no longer claims the delete cannot be undone', () => {
    expect(src()).not.toMatch(/cannot be undone/i)
  })

  // ...and queried no dependent model before firing.
  it('counts dependants before asking', () => {
    expect(src()).toMatch(/countSiteDependencies/)
    expect(src()).toMatch(/buildDeleteSiteMessage/)
  })
})

describe('FINDING 10 — the leftover console.debug', () => {
  it('the sites module and the department picker log nothing at debug level', () => {
    const files = [DIALOG, INDEX, HOME, DEPT_MENU]
    for (const f of files) expect(read(f)).not.toMatch(/console\.debug/)
  })
})
