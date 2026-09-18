/**
 * Mirror guard for src/utils/auditConstants.js.
 *
 * The backend's `backend/shared/constants/auditActions.js` is the source of
 * truth — it is what gets written to `audit_logs.action`. This spec reads that
 * file from disk and fails, NAMING the offending codes, when the frontend
 * mirror drifts: a backend code with no label / colour / icon here, a value
 * that disagrees with the backend, a code here the backend never emits, or an
 * icon name that does not exist in the installed @tabler/icons-vue.
 *
 * Notes for anyone extending this file:
 *  - `import.meta.url` is NOT a file: URL under vitest — resolve from
 *    `process.cwd()` (the qms-app repo root) with node:path.
 *  - The backend file is parsed as text rather than imported: it lives in a
 *    sibling repo outside this Vite root, and text-parsing keeps the guard
 *    free of any module-resolution or transform assumptions.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { AUDIT_ACTIONS, ACTION_COLORS, ACTION_ICONS } from './auditConstants.js'

const BACKEND_SUFFIX = path.join('backend', 'shared', 'constants', 'auditActions.js')

// cwd is the qms-app repo root. Cover both checkout layouts: sibling repos
// (qability/qms + qability/qms-app) and the qms monorepo (qms/frontend/app).
const CANDIDATE_PATHS = [
  process.env.QMS_BACKEND_AUDIT_ACTIONS,
  path.resolve(process.cwd(), '..', 'qms', BACKEND_SUFFIX),
  path.resolve(process.cwd(), '..', '..', BACKEND_SUFFIX),
  path.resolve(process.cwd(), '..', BACKEND_SUFFIX),
].filter(Boolean)

const TABLER_EXPORTS = path.resolve(
  process.cwd(),
  'node_modules/@tabler/icons-vue/dist/esm/tabler-icons-vue.mjs',
)

// Fallbacks hard-coded in AuditLogActionBadge.vue — they must resolve too.
const BADGE_FALLBACK_ICON = 'IconHistory'

function resolveBackendFile() {
  const found = CANDIDATE_PATHS.find((p) => existsSync(p))
  if (!found) {
    throw new Error(
      'Cannot find the backend audit-action constants — this guard cannot verify the mirror.\n' +
        `Looked for:\n  ${CANDIDATE_PATHS.join('\n  ')}\n` +
        'Check out the qms backend next to qms-app, or set QMS_BACKEND_AUDIT_ACTIONS to the file.',
    )
  }
  return found
}

/**
 * Parses one `export const NAME = { KEY: 'VALUE', ... }` block of flat string
 * constants out of a plain ESM source file.
 */
function parseConstMap(source, mapName) {
  const declaration = `export const ${mapName} = {`
  const start = source.indexOf(declaration)
  if (start === -1) throw new Error(`No "export const ${mapName}" in the backend constants file`)
  const bodyStart = start + declaration.length
  const bodyEnd = source.indexOf('\n}', bodyStart)
  if (bodyEnd === -1) throw new Error(`Unterminated "${mapName}" block in the backend file`)

  const body = source.slice(bodyStart, bodyEnd)
  const entries = {}
  let entryLines = 0
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) continue
    entryLines += 1
    const match = line.match(/^([A-Z0-9_]+)\s*:\s*'([^']*)'\s*,?$/)
    if (match) entries[match[1]] = match[2]
  }
  // If the backend file ever stops matching the assumed shape, fail loudly here
  // rather than silently reporting an empty map (which would make every
  // assertion below pass vacuously).
  if (Object.keys(entries).length !== entryLines) {
    throw new Error(
      `Failed to parse ${entryLines - Object.keys(entries).length} entr(y|ies) of ${mapName} — ` +
        "the backend constants file no longer matches the expected `KEY: 'VALUE',` shape.",
    )
  }
  return entries
}

function parseTablerIconNames() {
  if (!existsSync(TABLER_EXPORTS)) {
    throw new Error(`@tabler/icons-vue is not installed at ${TABLER_EXPORTS} — run npm install`)
  }
  const source = readFileSync(TABLER_EXPORTS, 'utf8')
  const names = new Set()
  for (const block of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const specifier of block[1].split(',')) {
      const exported = specifier
        .trim()
        .split(/\s+as\s+/)
        .pop()
      if (exported) names.add(exported.trim())
    }
  }
  return names
}

const BACKEND_FILE = resolveBackendFile()
const BACKEND_SOURCE = readFileSync(BACKEND_FILE, 'utf8')
const BACKEND_ACTIONS = parseConstMap(BACKEND_SOURCE, 'AUDIT_ACTIONS')
const BACKEND_COLORS = parseConstMap(BACKEND_SOURCE, 'ACTION_COLORS')
const BACKEND_ICONS = parseConstMap(BACKEND_SOURCE, 'ACTION_ICONS')
const TABLER_ICON_NAMES = parseTablerIconNames()

const backendCodes = Object.keys(BACKEND_ACTIONS)

function missingFrom(map) {
  return backendCodes.filter((code) => !(code in map))
}

function disagreeingWith(backendMap, frontendMap) {
  return Object.keys(backendMap)
    .filter((code) => code in frontendMap && frontendMap[code] !== backendMap[code])
    .map((code) => `${code}: backend '${backendMap[code]}' vs frontend '${frontendMap[code]}'`)
}

describe('auditConstants — backend parse sanity', () => {
  // Guards the guard. If parsing quietly degrades, every mirror assertion below
  // becomes a no-op, which is exactly how this file drifted in the first place.
  it('reads a plausible set of constants out of the backend file', () => {
    expect(backendCodes.length).toBeGreaterThan(50)
    expect(BACKEND_ACTIONS.CREATE).toBe('CREATE')
    expect(BACKEND_ACTIONS.GRANT_OWNERSHIP).toBe('GRANT_OWNERSHIP')
    expect(Object.keys(BACKEND_COLORS).length).toBeGreaterThan(50)
    expect(Object.keys(BACKEND_ICONS).length).toBeGreaterThan(50)
    expect(TABLER_ICON_NAMES.size).toBeGreaterThan(1000)
    expect(TABLER_ICON_NAMES.has(BADGE_FALLBACK_ICON)).toBe(true)
  })
})

describe('auditConstants — every backend action is renderable', () => {
  it('has a label (AUDIT_ACTIONS entry) for every backend action code', () => {
    const missing = missingFrom(AUDIT_ACTIONS)
    expect(
      missing,
      `AUDIT_ACTIONS is missing ${missing.length} backend code(s): ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('has a colour for every backend action code', () => {
    const missing = missingFrom(ACTION_COLORS)
    expect(
      missing,
      `ACTION_COLORS is missing ${missing.length} backend code(s) — each renders as the ` +
        `anonymous grey pill: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('has an icon for every backend action code', () => {
    const missing = missingFrom(ACTION_ICONS)
    expect(
      missing,
      `ACTION_ICONS is missing ${missing.length} backend code(s) — each falls back to ` +
        `${BADGE_FALLBACK_ICON}: ${missing.join(', ')}`,
    ).toEqual([])
  })

  // The authority / destructive actions — the rows a reviewer must not scroll
  // past. Named individually so a regression reads as itself rather than as
  // "one of 61 codes".
  it.each(['GRANT_OWNERSHIP', 'REVOKE_OWNERSHIP', 'UNLOCK', 'DELETE', 'DISPOSE'])(
    'renders %s with its own label, colour and icon',
    (code) => {
      expect(AUDIT_ACTIONS[code]).toBe(code)
      expect(ACTION_COLORS[code]).toBeTruthy()
      expect(ACTION_ICONS[code]).toBeTruthy()
    },
  )

  it('does not paint the authority actions the same as routine ones', () => {
    const routine = ACTION_COLORS.UPDATE
    for (const code of ['DELETE', 'DISPOSE', 'GRANT_OWNERSHIP', 'REVOKE_OWNERSHIP', 'UNLOCK']) {
      expect(ACTION_COLORS[code], `${code} must not share UPDATE's colour`).not.toBe(routine)
    }
  })
})

describe('auditConstants — values agree with the backend', () => {
  it('uses the backend label for every shared action code', () => {
    const disagreements = disagreeingWith(BACKEND_ACTIONS, AUDIT_ACTIONS)
    expect(
      disagreements,
      `AUDIT_ACTIONS disagrees with the backend:\n  ${disagreements.join('\n  ')}`,
    ).toEqual([])
  })

  it('uses the backend colour wherever the backend defines one', () => {
    const disagreements = disagreeingWith(BACKEND_COLORS, ACTION_COLORS)
    expect(
      disagreements,
      `ACTION_COLORS disagrees with the backend:\n  ${disagreements.join('\n  ')}`,
    ).toEqual([])
  })

  it('uses the backend icon wherever the backend defines one', () => {
    const disagreements = disagreeingWith(BACKEND_ICONS, ACTION_ICONS)
    expect(
      disagreements,
      `ACTION_ICONS disagrees with the backend:\n  ${disagreements.join('\n  ')}`,
    ).toEqual([])
  })
})

describe('auditConstants — no dead frontend-only entries', () => {
  // A code the backend never emits is a filter option in AuditLogsFilters that
  // can only ever return zero rows.
  it('declares no action code the backend does not emit', () => {
    const dead = Object.keys(AUDIT_ACTIONS).filter((code) => !(code in BACKEND_ACTIONS))
    expect(
      dead,
      `AUDIT_ACTIONS declares ${dead.length} code(s) the backend never writes: ${dead.join(', ')}`,
    ).toEqual([])
  })

  it('colours and icons only real action codes', () => {
    const strayColors = Object.keys(ACTION_COLORS).filter((code) => !(code in BACKEND_ACTIONS))
    const strayIcons = Object.keys(ACTION_ICONS).filter((code) => !(code in BACKEND_ACTIONS))
    expect(strayColors, `ACTION_COLORS has stray keys: ${strayColors.join(', ')}`).toEqual([])
    expect(strayIcons, `ACTION_ICONS has stray keys: ${strayIcons.join(', ')}`).toEqual([])
  })

  it('keys AUDIT_ACTIONS to its own value', () => {
    const mismatched = Object.entries(AUDIT_ACTIONS)
      .filter(([key, value]) => key !== value)
      .map(([key, value]) => `${key} → '${value}'`)
    expect(
      mismatched,
      `AUDIT_ACTIONS keys must equal their values: ${mismatched.join(', ')}`,
    ).toEqual([])
  })
})

describe('auditConstants — icons and colours are usable', () => {
  it('names only icons that exist in the installed @tabler/icons-vue', () => {
    const unknown = Object.entries(ACTION_ICONS)
      .filter(([, icon]) => !TABLER_ICON_NAMES.has(icon))
      .map(([code, icon]) => `${code} → ${icon}`)
    expect(
      unknown,
      `ACTION_ICONS names ${unknown.length} icon(s) @tabler/icons-vue does not export: ${unknown.join(', ')}`,
    ).toEqual([])
  })

  it('uses tw:-prefixed background + text classes for every colour', () => {
    const malformed = Object.entries(ACTION_COLORS)
      .filter(([, classes]) => !/^tw:bg-[a-z]+-\d{2,3} tw:text-[a-z]+-\d{2,3}$/.test(classes))
      .map(([code, classes]) => `${code} → '${classes}'`)
    expect(malformed, `ACTION_COLORS entries are malformed: ${malformed.join(', ')}`).toEqual([])
  })
})
