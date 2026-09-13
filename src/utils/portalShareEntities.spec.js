/**
 * Mirror guard for src/utils/portalShareEntities.js.
 *
 * The backend's `backend/shared/sharing/sharedWithUserEntities.js` is canonical: it
 * is the file the DB CHECK and `share_entity_permission()` are asserted against
 * (qms `backend/api/tests/services/sharedWithUserEntities.test.js`). This spec reads
 * it from disk and fails, NAMING the offending types, when the frontend mirror
 * drifts — a backend entity type with no bucket here, a `clientModel` that
 * disagrees, or a type here the backend does not recognise.
 *
 * Why this guard is not optional: the failure mode it catches is silent. A
 * portal grant that this file does not know about is still written, still
 * authorised by RLS, and still delivered into the supplier's IndexedDB. It just
 * renders in no list. The granter sees a share; the supplier sees an empty
 * dashboard; nothing logs an error. That is PORTAL-F15, and it survived two
 * entity types being added at the DB and RLS layers.
 *
 * Follows the conventions established by auditConstants.spec.js:
 *  - `import.meta.url` is NOT a file: URL under vitest — resolve from
 *    `process.cwd()` (the qms-app repo root) with node:path.
 *  - The backend file is parsed as text rather than imported: it lives in a
 *    sibling repo outside this Vite root, and text-parsing keeps the guard
 *    free of any module-resolution or transform assumptions.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  PORTAL_SHARE_ENTITIES,
  BUILTIN_PORTAL_SHARE_TYPES,
  PORTAL_SHARE_MODULE_KEY_PATTERN,
  isModuleKeyPortalShareType,
} from './portalShareEntities.js'

const BACKEND_SUFFIX = path.join('backend', 'shared', 'sharing', 'sharedWithUserEntities.js')

// cwd is the qms-app repo root. Cover both checkout layouts: sibling repos
// (qability/qms + qability/qms-app) and the qms monorepo (qms/frontend/app).
const CANDIDATE_PATHS = [
  process.env.QMS_BACKEND_SHARED_WITH_USER_ENTITIES,
  path.resolve(process.cwd(), '..', 'qms', BACKEND_SUFFIX),
  path.resolve(process.cwd(), '..', '..', BACKEND_SUFFIX),
  path.resolve(process.cwd(), '..', BACKEND_SUFFIX),
].filter(Boolean)

function resolveBackendFile() {
  const found = CANDIDATE_PATHS.find((p) => existsSync(p))
  if (!found) {
    throw new Error(
      'Cannot find the backend shareable-entity map — this guard cannot verify the mirror.\n' +
        `Looked for:\n  ${CANDIDATE_PATHS.join('\n  ')}\n` +
        'Check out the qms backend next to qms-app, or set QMS_BACKEND_SHARED_WITH_USER_ENTITIES to the file.',
    )
  }
  return found
}

/** Strip line and block comments — the backend file's header names entity types in prose. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

/**
 * Parse the `SHARED_WITH_USER_ENTITIES` block into { entityType: clientModel }.
 * Shape assumed:
 *     Document: Object.freeze({ module: '…', table: '…', clientModel: 'Document', … }),
 */
function parseBackendMap() {
  const source = stripComments(readFileSync(resolveBackendFile(), 'utf8'))
  const declaration = 'export const SHARED_WITH_USER_ENTITIES = Object.freeze({'
  const start = source.indexOf(declaration)
  if (start === -1) throw new Error('No "export const SHARED_WITH_USER_ENTITIES" in the backend map')
  const body = source.slice(start + declaration.length, source.indexOf('\n})', start))

  const entries = {}
  const blocks = [...body.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):\s*Object\.freeze\(\{/gm)]
  for (const block of blocks) {
    const tail = body.slice(block.index)
    const clientModel = tail.match(/clientModel:\s*'([^']+)'/)
    if (!clientModel) throw new Error(`Backend entry ${block[1]} has no clientModel`)
    entries[block[1]] = clientModel[1]
  }
  // Fail loudly rather than comparing against a vacuously empty map.
  if (Object.keys(entries).length === 0) {
    throw new Error(
      'Parsed zero entries out of SHARED_WITH_USER_ENTITIES — the backend map no longer matches the expected shape.',
    )
  }
  return entries
}

describe('portalShareEntities mirrors the backend map', () => {
  const backend = parseBackendMap()

  it('covers every backend entity type', () => {
    const missing = Object.keys(backend).filter((t) => !BUILTIN_PORTAL_SHARE_TYPES.has(t))
    expect(
      missing,
      `backend entity types with no bucket on the supplier dashboard: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('invents no entity type the backend does not have', () => {
    const extra = Object.keys(PORTAL_SHARE_ENTITIES).filter((t) => !(t in backend))
    expect(extra, `entity types the backend does not recognise: ${extra.join(', ')}`).toEqual([])
  })

  it('agrees on every clientModel', () => {
    const mirrored = Object.fromEntries(
      Object.entries(PORTAL_SHARE_ENTITIES).map(([t, def]) => [t, def.clientModel]),
    )
    expect(mirrored).toEqual(backend)
  })

  it('uses the backend module-key pattern verbatim', () => {
    const source = stripComments(readFileSync(resolveBackendFile(), 'utf8'))
    const pattern = source.match(/export const MODULE_KEY_PATTERN\s*=\s*\/(.+?)\/\s*$/m)
    expect(pattern, 'cannot find MODULE_KEY_PATTERN in the backend map').not.toBeNull()
    expect(PORTAL_SHARE_MODULE_KEY_PATTERN.source).toBe(pattern[1])
  })

  it('never classifies a builtin as a module key', () => {
    // The dashboard's two buckets must stay disjoint, or a built-in grant lands
    // in the module-record list and looks for a `records` row that cannot exist.
    for (const type of BUILTIN_PORTAL_SHARE_TYPES) {
      expect(isModuleKeyPortalShareType(type), `${type} matched the module-key test`).toBe(false)
    }
    expect(isModuleKeyPortalShareType('supplier_eval')).toBe(true)
  })
})
