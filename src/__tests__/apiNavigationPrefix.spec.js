// A browser NAVIGATION to an API route must carry the `/api` prefix.
//
// `/api` is not part of any backend route — it is the api client's baseURL and
// the only path Vite proxies to the backend (vite.config.js: `'/api/'` →
// VITE_PROXY_API_TARGET, with `/api` rewritten off again). Calls made through
// `@/api` get it for free from `baseURL`. A hand-written
// `window.location.href = '/v1/...'` does NOT: it resolves against the SPA's own
// origin, which serves no such route, so the browser gets a 404 from Vite and
// never reaches the API.
//
// Reported as a 404 on
// `http://qability.localhost:5174/v1/auth/dev-impersonate?...` — port 5174 being
// Vite rather than the API on 4000. The sibling platform-admin link in
// ImpersonateStartDialog had it right, which is what makes this worth pinning:
// the two are written the same way and only one of them worked.
//
// A source scan because the failure is a runtime 404 in a full page load —
// nothing a component test would catch, and the correct form is a one-token
// difference from the broken one.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SCAN_DIRS = ['src', 'resource'].map((d) => path.join(ROOT, d))

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(vue|js)$/.test(entry)) out.push(full)
  }
  return out
}

// `location.href = "/v1/…"`, `location.assign('/v1/…')`, `location.replace(…)`,
// in either quote style or a template literal.
const BAD = /location\s*\.\s*(?:href|assign|replace)\s*(?:=|\()\s*[`'"]\/v1\//g

describe('API navigations carry the /api prefix', () => {
  it('no window.location navigation targets a bare /v1 path', () => {
    const offenders = []
    for (const dir of SCAN_DIRS) {
      for (const file of walk(dir)) {
        const src = readFileSync(file, 'utf8')
        // Skip this spec's own examples.
        if (file.endsWith('apiNavigationPrefix.spec.js')) continue
        for (const m of src.matchAll(BAD)) {
          const line = src.slice(0, m.index).split('\n').length
          offenders.push(`${path.relative(ROOT, file)}:${line}`)
        }
      }
    }
    expect(
      offenders,
      `These navigate to the SPA origin, not the API — prefix them with /api:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('the regex it relies on actually matches the broken form', () => {
    // Guard the guard: a scan that silently matches nothing passes forever.
    const broken = [
      `window.location.href = '/v1/auth/dev-impersonate?id=1'`,
      'window.location.href = `/v1/auth/impersonate?${q}`',
      `location.assign("/v1/auth/x")`,
      `window.location.replace('/v1/auth/x')`,
    ]
    for (const s of broken) expect(s.match(new RegExp(BAD.source))).not.toBeNull()

    const fine = [
      `window.location.href = '/api/v1/auth/dev-impersonate?id=1'`,
      'window.location.href = `/api/v1/auth/impersonate?${q}`',
      `window.location.href = '/documents'`,
    ]
    for (const s of fine) expect(s.match(new RegExp(BAD.source))).toBeNull()
  })
})
