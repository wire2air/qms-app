#!/usr/bin/env node
// Capture every shot in shots.mjs from the running app (Nordic demo tenant).
//
//   node scripts/marketing-shots/capture.mjs [idFilter ...]
//
// Writes <OUT>/product/<module>/originals/<id>-original.png at 1440×812 @2x
// (2880×1624 — the marketing site's existing screenshot size) and records, per
// shot, the geometry the editor needs: where the sidebar ends, where the top bar
// ends, and the bounding box of the focus card. Results go to
// <OUT>/capture-log.json (merged, so a filtered re-run keeps the others).
import './env.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { chromium } from '@playwright/test'
import { loginToStateFile } from '../../e2e/fixtures/authSession.js'
import { SHOTS } from './shots.mjs'
import { createProgress, pool } from './progress.mjs'

const BASE = process.env.NORDIC_URL || 'http://nordic.localhost:5173'
const OUT = path.resolve(process.env.ASSETS_DIR || (process.env.THEME === 'dark' ? '../qms-marketing/marketing-assets-dark' : '../qms-marketing/marketing-assets'))
const PERSONAS = {
  owner: {
    email: process.env.SHOTS_OWNER_EMAIL || 'astrid.lindqvist@qability.net',
    password: process.env.SHOTS_OWNER_PASSWORD || '12345678',
  },
  supplier: {
    email: process.env.SHOTS_SUPPLIER_EMAIL || 'mette.kristensen@qability.net',
    password: process.env.SHOTS_SUPPLIER_PASSWORD || '12345678',
  },
}
const VIEWPORT = { width: 1440, height: 812 }
// THEME=dark captures the app's night mode into marketing-assets-dark/.
const THEME = process.env.THEME === 'dark' ? 'dark' : 'light'
// `sql` shots resolve their route from live data (read-only SELECT, first
// column of the first row). Defaults match the local docker Postgres.
const PG_CONTAINER = process.env.PG_CONTAINER || 'qms-postgres-1'
const PG_DB = process.env.PG_DB || 'app-db'

function resolveSql(sql) {
  if (!/^\s*(select|with)\b/i.test(sql)) throw new Error('shot sql must be a SELECT')
  const out = execFileSync(
    'docker',
    ['exec', '-i', PG_CONTAINER, 'psql', '-U', 'postgres', '-d', PG_DB, '-v', 'ON_ERROR_STOP=1', '-Atc', `BEGIN READ ONLY; ${sql}; COMMIT;`],
    { encoding: 'utf8' },
  )
  return out.split('\n').map((l) => l.trim()).filter((l) => l && !/^(BEGIN|COMMIT)$/.test(l))[0] ?? null
}
const DPR = 2
const WORKERS = Number(process.env.WORKERS || 4)

// The theme follows the user's saved preference (users.settings.theme), which
// ThemeToggle re-adopts on every page load. Flip it through the app's own theme
// manager (utils/theme.js via the vite dev server — same module instance), so
// the logo, icons and charts render their real dark variants. localStorage
// only; the user's saved setting is never written.
async function pinTheme(page) {
  if (THEME !== 'dark') return
  const flipped = await page
    .evaluate(async () => {
      const m = await import('/src/utils/theme.js')
      if (m.isDark.value) return false
      m.setThemeMode('dark')
      return true
    })
    .catch(() => false)
  if (flipped) await page.waitForTimeout(400)
}

async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
  await page
    .locator('.tw\\:animate-spin, .tw\\:animate-pulse, [aria-busy="true"]')
    .first()
    .waitFor({ state: 'detached', timeout: 10_000 })
    .catch(() => {})
  await page.waitForTimeout(1_500)
  await pinTheme(page)
}

async function runAction(page, a) {
  if (a.tab) {
    await page.getByRole('tab', { name: a.tab }).first().click({ timeout: 10_000 })
  } else if (a.clickText) {
    await page
      .locator('main button, main a, main [role="tab"]')
      .filter({ hasText: a.clickText })
      .first()
      .click({ timeout: 10_000 })
  } else if (a.click) {
    const loc = page.locator(a.click).first()
    await loc.scrollIntoViewIfNeeded({ timeout: 10_000 }).catch(() => {})
    await loc.click({ timeout: 10_000 })
  } else if (a.fill) {
    // Type into a search/filter box (UI-only — never a form that gets saved).
    await page.locator(a.fill).first().fill(a.value ?? '', { timeout: 10_000 })
  } else if (a.wait) {
    await page.waitForTimeout(a.wait)
  } else if (a.press) {
    await page.keyboard.press(a.press)
  } else if (a.scrollTo) {
    await page.locator(a.scrollTo).first().scrollIntoViewIfNeeded({ timeout: 10_000 })
  }
  await page.waitForTimeout(1_200)
}

// The card that holds a piece of text: climb from the text to the nearest
// bordered/rounded container that is big enough to be a card. Returns CSS px.
// Text matches prefer headings / card titles and skip tabs and nav links (a
// "Disposition" tab must not win over the "Disposition" card). If the card
// sits below the fold it is scrolled to the middle of the viewport first, so
// the box and the screenshot agree. The box is inset by 2px so it never takes
// a sliver of the neighbouring card.
async function focusBox(page, shot) {
  return page.evaluate(({ text, sel }) => {
    const visible = (e) => {
      const r = e.getBoundingClientRect()
      // Skip the app's left navigation sidebar only; a detail page's right
      // rail is also an <aside> and holds cards worth focusing.
      const nav = e.closest('aside')
      return r.width > 0 && r.height > 0 && !(nav && nav.getBoundingClientRect().x < 5)
    }
    const isCard = (e) => {
      const cls = typeof e.className === 'string' ? e.className : ''
      const r = e.getBoundingClientRect()
      return /rounded/.test(cls) && /(border|shadow|bg-)/.test(cls) && r.width >= 320 && r.height >= 120
    }
    let el = null
    if (sel) {
      el = [...document.querySelectorAll(sel)].find(visible) ?? null
    } else if (text) {
      const want = text.toLowerCase()
      const ownText = (e) =>
        [...e.childNodes]
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent)
          .join('')
          .trim()
          .toLowerCase()
      const notNav = (e) => !e.closest('[role="tab"], [role="tablist"], nav')
      const all = [...document.querySelectorAll('main *, [role="dialog"] *')].filter(visible)
      const byText = all.filter(
        (e) =>
          notNav(e) &&
          (ownText(e) === want ||
            (e.children.length === 0 && (e.textContent || '').trim().toLowerCase() === want)),
      )
      const cardOf = (e) => {
        for (let cur = e; cur && cur !== document.body; cur = cur.parentElement) if (isCard(cur)) return cur
        return null
      }
      const labelled = all.find((e) => (e.getAttribute('aria-label') || '').trim() === text)
      const ranked = [
        ...byText.filter((e) => /^H[1-4]$/.test(e.tagName)),
        ...byText.filter((e) => !/^H[1-4]$/.test(e.tagName)),
      ]
      for (const e of ranked) {
        const card = cardOf(e)
        if (card) {
          el = card
          break
        }
      }
      if (!el && labelled) el = cardOf(labelled) ?? labelled
    }
    if (!el) return null
    let r = el.getBoundingClientRect()
    if (r.y < 0 || r.y > window.innerHeight * 0.6) {
      el.scrollIntoView({ block: r.height > window.innerHeight * 0.8 ? 'start' : 'center' })
      window.scrollBy(0, r.height > window.innerHeight * 0.8 ? -80 : 0)
      r = el.getBoundingClientRect()
    }
    const inset = 2
    const y = Math.max(r.y, 0) + inset
    return {
      x: r.x + inset,
      y,
      width: r.width - inset * 2,
      height: Math.min(r.bottom, window.innerHeight) - y - inset,
    }
  }, { text: shot.focus ?? null, sel: shot.focusSel ?? null })
}

async function chrome(page) {
  return page.evaluate(() => {
    const aside = document.querySelector('aside')
    const header = document.querySelector('header')
    const a = aside?.getBoundingClientRect()
    const h = header?.getBoundingClientRect()
    return {
      sidebarRight: a && a.width > 0 && a.x < 5 ? Math.round(a.right) : 0,
      headerBottom: h && h.height > 0 && h.y < 5 ? Math.round(h.bottom) : 0,
    }
  })
}

async function main() {
  const only = process.argv.slice(2)
  const shots = SHOTS.filter((s) => !only.length || only.some((o) => s.id.includes(o)))
  const logFile = path.join(OUT, 'capture-log.json')
  const log = fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, 'utf8')) : {}

  const prog = createProgress(shots.length, 'Capturing screenshots')
  const browser = await chromium.launch()
  const byPersona = {}
  for (const s of shots) (byPersona[s.persona || 'owner'] ??= []).push(s)

  for (const [persona, list] of Object.entries(byPersona)) {
    const cred = PERSONAS[persona]
    const state = path.join(OUT, `.state-${persona}.json`)
    prog.note(`logging in as ${persona} (${cred.email}) — ${list.length} shot(s)`)
    try {
      await loginToStateFile(BASE, { email: cred.email }, state, cred.password, persona)
    } catch (e) {
      for (const s of list) {
        log[s.id] = { status: 'blocked', reason: `login failed for ${persona}: ${e.message}` }
        prog.tick(false, s.id, `login failed for ${persona}`)
      }
      continue
    }
    const ctx = await browser.newContext({
      baseURL: BASE,
      storageState: state,
      viewport: VIEWPORT,
      deviceScaleFactor: DPR,
      colorScheme: THEME,
      locale: 'en-GB',
    })
    // Pages share the context's IndexedDB, so the sync bootstraps once on the
    // first page; the others then open with warm data. WORKERS pages capture
    // side by side (default 4) — each keeps its own write guard.
    const page = await ctx.newPage()
    const guard = async (page) => {
      page.blockedWrites = []
      // Read-only guard. Several detail pages autosave on open (a DRAFT quality
      // event fires UpdateQualityEvent just by loading; the document Training tab
      // materialises a default training_config), and some buttons submit when a
      // step does not require an e-signature. Capturing must never write, so
      // every GraphQL mutation and every non-GET REST call (bar the auth
      // session endpoints) is aborted and counted on the shot's log entry.
      await page.route('**/*', (route) => {
        const r = route.request()
        if (r.method() === 'GET' || r.method() === 'HEAD' || r.method() === 'OPTIONS') return route.continue()
        const url = r.url()
        if (/\/graphql(\?|$)/.test(url)) {
          let q = ''
          try {
            const body = JSON.parse(r.postData() || '{}')
            q = (Array.isArray(body) ? body.map((b) => b.query).join(' ') : body.query) || ''
          } catch {
            q = r.postData() || ''
          }
          if (/(^|[\s}])mutation\b/.test(q.trim()) || q.trim().startsWith('mutation')) {
            page.blockedWrites.push(`graphql ${(q.match(/mutation\s+(\w+)/) || [])[1] || 'mutation'}`)
            return route.abort()
          }
          return route.continue()
        }
        if (/\/v1\/auth\/(session|handoff|refresh)/.test(url)) return route.continue()
        page.blockedWrites.push(`${r.method()} ${url.replace(BASE, '')}`)
        return route.abort()
      })
    }
    await guard(page)
    await page.goto(persona === 'supplier' ? '/' : '/dashboard', { waitUntil: 'domcontentloaded' })
    prog.note('warming up the sync (first load bootstraps IndexedDB)…')
    await page.waitForLoadState('networkidle', { timeout: 90_000 }).catch(() => {})
    await page.waitForTimeout(8_000)

    const pages = [page]
    for (let i = 1; i < Math.min(WORKERS, list.length); i++) {
      const p = await ctx.newPage()
      await guard(p)
      pages.push(p)
    }

    await pool(list, pages.length, async (s, w) => {
      const page = pages[w]
      const file = path.join(OUT, 'product', s.module, 'originals', `${s.id}-original.png`)
      const entry = { status: 'captured', url: s.url, persona, capturedAt: new Date().toISOString() }
      // A `sql` shot captures as soon as the data exists; until then (no row)
      // it is logged as blocked with its `blocked` reason. A `blocked` shot
      // without `sql` is never opened.
      let url = s.url
      if (s.sql) {
        try {
          url = resolveSql(s.sql)
        } catch (e) {
          url = null
          entry.sqlError = e.message.split('\n')[0]
        }
      }
      if ((s.sql && !url) || (!s.sql && s.blocked)) {
        const reason = s.blocked || (entry.sqlError ? `sql failed: ${entry.sqlError}` : 'sql returned no row')
        log[s.id] = { status: 'blocked', reason, url: url ?? s.url ?? null, persona }
        prog.tick(null, s.id, `blocked: ${reason}`)
        return
      }
      entry.url = url
      page.blockedWrites = []
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
        await settle(page)
        for (const a of s.actions ?? []) await runAction(page, a)
        await settle(page)
        if (await page.getByText('Oops. Nothing here...').count()) throw new Error('route renders the 404 page')
        if (/\/no-access/.test(page.url())) throw new Error(`redirected to ${page.url()}`)
        entry.finalUrl = page.url().replace(BASE, '')
        if (s.focus || s.focusSel) {
          entry.focus = await focusBox(page, s)
          if (!entry.focus) entry.focusMissing = s.focus ?? s.focusSel
          await page.waitForTimeout(400)
        }
        await pinTheme(page)
        entry.chrome = await chrome(page)
        entry.theme = THEME
        fs.mkdirSync(path.dirname(file), { recursive: true })
        await page.screenshot({ path: file })
        entry.file = path.relative(OUT, file)
        entry.size = { width: VIEWPORT.width * DPR, height: VIEWPORT.height * DPR }
        prog.tick(true, s.id, entry.focusMissing ? `(focus not found: ${entry.focusMissing})` : '')
      } catch (e) {
        entry.status = 'blocked'
        entry.reason = e.message.split('\n')[0]
        prog.tick(false, s.id, entry.reason)
      }
      if (page.blockedWrites.length) entry.blockedWrites = [...new Set(page.blockedWrites)]
      log[s.id] = entry
    })
    await ctx.close()
  }
  await browser.close()
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(logFile, JSON.stringify(log, null, 2))
  const vals = shots.map((s) => log[s.id])
  prog.finish(`${vals.filter((v) => v?.status === 'captured').length}/${shots.length} captured → ${OUT}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
