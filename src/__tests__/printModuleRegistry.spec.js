/**
 * Every `?module=` the app links to must be registered.
 *
 * NonconformancesPageId linked to `?module=Nonconformance` while the registry
 * still said `// Future: Nonconformance`, so the NC Print button opened the
 * shell's "Unknown print module" error instead of a printout — and nothing
 * failed until a user clicked it (reported 2026-08-18).
 *
 * The two halves live in different files with no type between them, so this
 * greps the source for print deep links and checks each one resolves. It is
 * deliberately a source scan rather than a list of known modules: a list would
 * need updating alongside the very thing it is meant to catch.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { resolveModule, listModules } from '../components/print/modules/index.js'

// From cwd, not import.meta.url: under the jsdom environment import.meta.url is
// an http:// URL and fileURLToPath rejects it.
const SRC = join(process.cwd(), 'src')

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(vue|js)$/.test(entry)) out.push(full)
  }
  return out
}

/** `module: 'Capa'` / `module=Capa` / `module=${x}` — the literal forms only. */
const LINK_PATTERNS = [
  /\bmodule:\s*'([A-Za-z]+)'/g,
  /[?&]module=([A-Za-z]+)/g,
]

function collectLinkedModules() {
  const found = new Map() // name → files
  for (const file of walk(SRC)) {
    // The registry and the shell name every module by definition; and this
    // spec quotes the failing name in its own docblock.
    if (file.includes(join('components', 'print'))) continue
    if (file.endsWith('printModuleRegistry.spec.js')) continue
    const text = readFileSync(file, 'utf8')
    for (const re of LINK_PATTERNS) {
      for (const m of text.matchAll(re)) {
        const name = m[1]
        if (!found.has(name)) found.set(name, [])
        found.get(name).push(file.slice(SRC.length + 1))
      }
    }
  }
  return found
}

describe('print module registry', () => {
  it('resolves every module name the app deep-links to', () => {
    const linked = collectLinkedModules()
    // Guard the guard: if the scan finds nothing, the patterns have rotted and
    // this spec would pass vacuously forever.
    expect(linked.size).toBeGreaterThan(0)

    const unresolved = [...linked.entries()]
      .filter(([name]) => !resolveModule(name))
      .map(([name, files]) => `${name} (linked from ${files.join(', ')})`)

    expect(unresolved).toEqual([])
  })

  it('registers the full quality-event chain', () => {
    // These three share recordPrint.css and are meant to print as one document
    // family; losing any of them silently is the exact regression above.
    for (const name of ['QualityEvent', 'Nonconformance', 'Capa']) {
      expect(resolveModule(name), name).toBeTruthy()
    }
  })

  it('resolves case-insensitively but rejects unknown names', () => {
    expect(resolveModule('capa')?.key).toBe('Capa')
    expect(resolveModule('nonexistent')).toBeNull()
    expect(resolveModule(null)).toBeNull()
  })

  it('exposes the module list the error screen prints', () => {
    expect(listModules()).toContain('Nonconformance')
    expect(listModules()).toContain('QualityEvent')
  })
})
