// Dump headings / buttons / tabs of each URL so shots can be planned from the real UI.
import fs from 'node:fs'
import { chromium } from '@playwright/test'
import { loginToStateFile } from '../../e2e/fixtures/authSession.js'

const BASE = 'http://nordic.localhost:5173'
const STATE = 'screenshots/.nordic-owner.json'
const urls = fs.readFileSync(0, 'utf8').split('\n').filter(Boolean)
await loginToStateFile(BASE, { email: 'astrid.lindqvist@qability.net' }, STATE, '12345678', 'owner')
const browser = await chromium.launch()
const ctx = await browser.newContext({ baseURL: BASE, storageState: STATE, viewport: { width: 1440, height: 812 } })
const page = await ctx.newPage()
await page.goto('/dashboard'); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(6000)
const out = {}
for (const u of urls) {
  await page.goto(u, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1500)
  out[u] = await page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest('aside') && !e.closest('header') }
    const txt = (e) => (e.getAttribute('aria-label') || e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40)
    const uniq = (a) => [...new Set(a.filter(Boolean))]
    return {
      h: uniq([...document.querySelectorAll('main h1, main h2, main h3, h1, h2, h3')].filter(vis).map(txt)).slice(0, 25),
      tabs: uniq([...document.querySelectorAll('[role=tab]')].filter(vis).map(txt)),
      btn: uniq([...document.querySelectorAll('button, [role=button]')].filter(vis).map(txt)).slice(0, 45),
    }
  })
  process.stderr.write('.')
}
fs.writeFileSync('screenshots/inventory.json', JSON.stringify(out, null, 1))
await browser.close()
