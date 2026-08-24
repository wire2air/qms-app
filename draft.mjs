import { chromium } from 'playwright'
import fs from 'node:fs'
const env = Object.fromEntries(
  fs.readFileSync('/Users/sgulyani/Development/QMS/qms/.env','utf8')
    .split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#'))
    .map(l=>[l.slice(0,l.indexOf('=')).trim(), l.slice(l.indexOf('=')+1).trim()]))
const SCR='/private/tmp/claude-501/-Users-sgulyani-Development-QMS/9b752622-f824-44b8-89dc-bbf21d61e468/scratchpad'
const B='http://superadmin.localhost:5174'
const browser=await chromium.launch(); const page=await browser.newPage({viewport:{width:1500,height:1000}})
const errs=[]; page.on('pageerror',e=>errs.push(String(e).slice(0,110)))
page.on('response', async (r) => {
  if (r.url().includes('/nonconformances') && r.request().method()==='POST' && r.status()>=400) {
    try { errs.push(`HTTP ${r.status()} ${r.url().split('/api')[1]}: ` + JSON.stringify(await r.json()).slice(0,180)) } catch {}
  }
})
await page.goto(`${B}/signin`,{waitUntil:'networkidle'})
await page.getByPlaceholder('Email').fill(env.ADMIN_EMAIL)
await page.getByPlaceholder('Password').fill(env.ADMIN_PASSWORD)
await page.getByRole('button',{name:'Sign in',exact:true}).click()
await page.waitForURL(u=>!u.pathname.includes('signin'),{timeout:30000})
await page.goto(`${B}/nonconformances/create`,{waitUntil:'networkidle'}); await page.waitForTimeout(1800)
const p1=page.locator('text=Default NC Workflow').first(); if(await p1.count()){await p1.click();await page.waitForTimeout(400)}
const c1=page.getByRole('button',{name:/continue/i}).first(); if(await c1.count()){await c1.click();await page.waitForTimeout(2500)}

// TITLE ONLY
await page.getByPlaceholder(/Describe the nonconformance/i).fill('Partial draft — title only')
const draftBtn = page.getByRole('button',{name:/save as draft/i})
console.log('draft button enabled:', await draftBtn.isEnabled())
await draftBtn.click(); await page.waitForTimeout(5000)
console.log('landed on:', page.url().includes('/nonconformances/') && !page.url().includes('create') ? 'detail page' : page.url())

// try to OPEN the incomplete draft
const openBtn = page.getByRole('button',{name:/^open nc/i}).first()
if (await openBtn.count()) {
  await openBtn.click(); await page.waitForTimeout(1200)
  const confirm = page.getByRole('button',{name:/open nc/i}).last()
  await confirm.click().catch(()=>{})
  await page.waitForTimeout(2500)
}
const body = await page.locator('body').innerText()
const m = body.match(/cannot be opened yet[^.]*\./)
console.log('open guard message:', JSON.stringify(m?.[0] ?? '(none seen)'))
await page.screenshot({path:`${SCR}/draft-check.png`, fullPage:false})
console.log('errors:', errs.slice(0,3))
await browser.close()
