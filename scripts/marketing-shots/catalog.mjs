#!/usr/bin/env node
// Build the marketing screenshot catalog and coverage reports.
//
//   node scripts/marketing-shots/catalog.mjs        (run from qms-app — needs sharp + esbuild)
//
// Writes into the asset root (ASSETS_DIR, default ../qms-marketing/marketing-assets):
//   catalog.json   one entry per (shot, variant) whose file EXISTS on disk
//   COVERAGE.md    coverage matrix + gap sections
//
// Truth comes from the filesystem. capture-log.json and edit-log.json are read
// only for metadata (status, reason, url, persona, focus); either may be missing
// or partial while capture/editing is still running. A file that a log claims
// but that is not on disk is never catalogued — it is reported as a mismatch.
//
// Output is deterministic for a given set of inputs (no wall-clock timestamps),
// so re-running without input changes rewrites identical bytes.
import './env.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { transformSync } from 'esbuild'
import { SHOTS } from './shots.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const QMS_APP = path.resolve(HERE, '../..')
const WORKSPACE = path.resolve(QMS_APP, '..')
const ROOT = path.resolve(process.env.ASSETS_DIR || path.join(WORKSPACE, process.env.THEME === 'dark' ? 'qms-marketing/marketing-assets-dark' : 'qms-marketing/marketing-assets'))
const MARKETING = path.resolve(process.env.MARKETING_DIR || path.join(WORKSPACE, 'qms-marketing'))
const MEDIA_TS = path.join(MARKETING, 'app/content/media.ts')
const SHIPPED_DIR = path.join(MARKETING, 'app/public/media/screenshots')
const SIDEBAR = path.join(QMS_APP, 'src/components/layout/MainSidebar.vue')
const DOCS_MODULES = path.join(WORKSPACE, 'qms/docs/modules')

const MIN_WIDTH = 1600
const MIN_BYTES = 20 * 1024
// Share of content-area pixels that differ from the page background. Below this
// the screen is almost always an empty state ("No X yet", zero counters).
// Calibrated on the first full capture: true empty states measured 1.0–2.4%,
// populated screens 2.5%+ (median 7.5%). Heuristic — it asks for a look, not a verdict.
const SPARSE_INK_PCT = 2.5
const EXPECTED_ORIGINAL = { width: 2880, height: 1624 } // 1440×812 @2x, see capture.mjs

// variant → where it lives and what the editor does to it
const VARIANTS = {
  original: { dir: 'originals', suffix: 'original', purpose: 'Unedited viewport capture — archival source of truth', ops: [] },
  full: { dir: 'edited', suffix: 'full', purpose: 'Full screen, framed for a page section or gallery', ops: ['scale-down', 'frame', 'shadow', 'background'] },
  marketing: { dir: 'edited', suffix: 'marketing', purpose: 'Marketing crop of the working area for a site slot', ops: ['crop', 'scale-down', 'frame', 'shadow', 'background'] },
  detail: { dir: 'feature-details', suffix: 'detail', purpose: 'Zoomed feature detail (focus card) for a callout', ops: ['crop', 'frame', 'shadow', 'background'] },
  hero: { dir: 'hero', suffix: 'hero', purpose: 'Hero composition for the top of a page', ops: ['crop', 'scale-down', 'frame', 'shadow', 'background'] },
}
const relPath = (shot, v) => path.posix.join('product', shot.module, VARIANTS[v].dir, `${shot.id}-${VARIANTS[v].suffix}.png`)
// The WebP web copy webp.mjs writes beside each variant. The original's copy is the
// site-ready raw 1600×900 screen (screens/<id>-screen.webp).
const webpRel = (shot, v) =>
  v === 'original'
    ? path.posix.join('product', shot.module, 'screens', `${shot.id}-screen.webp`)
    : relPath(shot, v).replace(/\.png$/, '.webp')

// Product modules the library must cover. `match` decides which shots count.
// `docs` names qms/docs/modules folders this row accounts for (for the
// "unmapped docs module" check).
const urlIs = (...prefixes) => (s) => prefixes.some((p) => s.url === p || s.url.startsWith(p + '/') || s.url.startsWith(p + '?'))
const TARGET_MODULES = [
  { key: 'overview', label: 'Overview / dashboard', match: (s) => s.module === 'overview' && s.url.startsWith('/dashboard'), docs: ['dashboard'] },
  { key: 'tasks', label: 'My Tasks inbox', match: urlIs('/task-instances'), docs: ['tasks'] },
  { key: 'document-control', label: 'Document control', match: (s) => s.module === 'document-control', docs: ['documents', 'files'] },
  { key: 'nonconformance', label: 'Nonconformance', match: (s) => s.module === 'nonconformance', docs: ['ncr'] },
  { key: 'capa', label: 'CAPA', match: (s) => s.module === 'capa', docs: ['capa'] },
  { key: 'change-management', label: 'Change management', match: (s) => s.module === 'change-management', docs: ['change-requests'] },
  { key: 'quality-events', label: 'Quality events', match: (s) => s.module === 'quality-events', docs: ['quality-events'] },
  { key: 'complaints-quality', label: 'Complaints — quality (internal)', match: urlIs('/complaints'), docs: ['complaints'] },
  { key: 'complaints-customer', label: 'Complaints — customer', match: urlIs('/customer-complaints'), docs: [] },
  { key: 'audits', label: 'Audits', match: urlIs('/audits'), docs: ['audits'] },
  { key: 'auditee', label: 'Auditee', match: urlIs('/auditee'), docs: ['auditee'] },
  { key: 'training', label: 'Training', match: (s) => s.module === 'training', docs: ['training'] },
  { key: 'qc-inspection', label: 'QC inspection', match: (s) => s.module === 'qc-inspection', docs: ['qc-inspection'] },
  { key: 'inspections-logs', label: 'Inspections & logs', match: (s) => s.module === 'inspections-logs', docs: ['inspections-logs'] },
  { key: 'equipment-calibration', label: 'Equipment / calibration', match: (s) => s.module === 'equipment-calibration', docs: ['equipment'] },
  { key: 'item-master', label: 'Item master', match: (s) => s.module === 'item-master', docs: ['products'] },
  { key: 'suppliers', label: 'Suppliers', match: urlIs('/suppliers'), docs: ['suppliers'] },
  { key: 'supplier-portal', label: 'Supplier portal', match: (s) => s.persona === 'supplier' || urlIs('/supplier')(s), docs: ['supplier-portal'] },
  { key: 'analytics', label: 'Analytics', match: (s) => s.module === 'analytics' && !urlIs('/analytics/metrics')(s), docs: ['analytics'] },
  { key: 'custom-metrics', label: 'Analytics — custom metrics', match: urlIs('/analytics/metrics'), docs: [] },
  { key: 'workflows', label: 'Workflows (templates / builder)', match: urlIs('/workflow-templates'), docs: ['workflows'] },
  { key: 'approval-flows', label: 'Approval flows', match: urlIs('/approval-flows'), docs: [] },
  { key: 'automation', label: 'Automation rules', match: urlIs('/automation-rules'), docs: ['automation-rules'] },
  { key: 'app-builder', label: 'App builder / records', match: (s) => s.module === 'app-builder', docs: ['records', 'forms'] },
  { key: 'audit-trail', label: 'Audit trail', match: (s) => s.module === 'audit-trail', docs: ['audit-logs'] },
  { key: 'roles', label: 'Governance — roles & permissions', match: urlIs('/roles'), docs: ['roles', 'permissions'] },
  { key: 'users', label: 'Administration — users', match: urlIs('/users'), docs: ['users'] },
  { key: 'groups', label: 'Administration — groups', match: urlIs('/groups'), docs: ['groups-teams'] },
  { key: 'sites', label: 'Administration — sites', match: urlIs('/sites'), docs: ['sites'] },
  { key: 'departments', label: 'Administration — departments', match: urlIs('/departments'), docs: ['departments'] },
  { key: 'security', label: 'Administration — security', match: urlIs('/organization-security', '/admin-security'), docs: ['authentication'] },
  { key: 'settings', label: 'Administration — settings', match: urlIs('/settings'), docs: ['settings'] },
  { key: 'service-accounts', label: 'Administration — service accounts', match: urlIs('/service-accounts', '/api-tokens'), docs: ['service-accounts'] },
  { key: 'ai-usage', label: 'Administration — AI usage', match: urlIs('/ai-usage'), docs: [] },
  { key: 'sharing', label: 'Administration — record sharing', match: urlIs('/shared-records'), docs: ['record-sharing'] },
  { key: 'custom-fields', label: 'Custom fields / lookups', match: urlIs('/custom-fields', '/lookups'), docs: ['custom-fields-lookups'] },
  { key: 'form-blocks', label: 'Form blocks', match: urlIs('/form-blocks'), docs: [] },
  { key: 'risk-management', label: 'Risk management', match: urlIs('/risk-assessment-templates', '/risk-assessments'), docs: ['risk-assessment'] },
  { key: 'rca', label: 'Root cause analysis', match: urlIs('/rca-templates'), docs: ['rca'] },
  { key: 'validation', label: 'Validation', match: urlIs('/validation'), docs: [] },
  { key: 'asset-request', label: 'Asset requests', match: urlIs('/asset-requests', '/asset-request'), docs: ['asset-request'] },
  { key: 'ai-sidecar', label: 'AI sidecar', match: (s) => /\bai-sidecar\b|sidecar/.test(s.id), docs: [] },
  { key: 'notifications', label: 'Notifications', match: urlIs('/notifications'), docs: ['notifications'] },
  { key: 'e-signatures', label: 'E-signatures', match: (s) => /e-?sign/i.test(s.id) || /e-?sign/i.test(s.feature), docs: [] },
]

// ── helpers ─────────────────────────────────────────────────────────────────
const readJson = (f) => {
  if (!fs.existsSync(f)) return { data: null, error: null }
  try {
    return { data: JSON.parse(fs.readFileSync(f, 'utf8')), error: null }
  } catch (e) {
    // a log being written mid-run can be truncated; report, don't die
    return { data: null, error: e.message }
  }
}
const statOf = (abs) => {
  try {
    const st = fs.statSync(abs)
    return st.isFile() ? st : null
  } catch {
    return null
  }
}
const kb = (b) => `${Math.round(b / 1024)} KB`
const md = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
const splitPage = (p) => {
  if (!p) return { page: null, section: null }
  const i = p.indexOf(' — ')
  return i < 0 ? { page: p.trim(), section: null } : { page: p.slice(0, i).trim(), section: p.slice(i + 3).trim() }
}

async function loadMediaSlots() {
  const src = fs.readFileSync(MEDIA_TS, 'utf8')
  const { code } = transformSync(src, { loader: 'ts', format: 'esm' })
  const mod = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
  return mod.mediaSlots
}

// Pull every *.png path (relative to ROOT) plus any width/height/operations
// the editor recorded for a shot, without assuming a precise edit-log schema.
function editLogFiles(entry) {
  const out = new Map()
  const visit = (node, key) => {
    if (!node) return
    if (typeof node === 'string') {
      if (node.endsWith('.png')) out.set(norm(node), out.get(norm(node)) ?? {})
      return
    }
    if (Array.isArray(node)) return node.forEach((n) => visit(n, key))
    if (typeof node === 'object') {
      const file = node.file ?? node.path ?? node.out ?? node.output ?? (key && String(key).endsWith('.png') ? key : null)
      if (typeof file === 'string' && file.endsWith('.png')) {
        out.set(norm(file), {
          width: node.width ?? node.size?.width,
          height: node.height ?? node.size?.height,
          operations: node.operations ?? node.ops,
          sourceCrop: node.sourceCrop ?? node.crop,
          scale: node.scale,
        })
      }
      for (const [k, v] of Object.entries(node)) if (v !== file) visit(v, k)
    }
  }
  const norm = (f) => (path.isAbsolute(f) ? path.relative(ROOT, f) : f).split(path.sep).join('/')
  visit(entry)
  return out
}

function walkPngs(dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walkPngs(p))
    else if (/\.(png|jpe?g|webp)$/i.test(e.name)) out.push(p)
  }
  return out.sort()
}

function sidebarRoutes() {
  if (!fs.existsSync(SIDEBAR)) return []
  const src = fs.readFileSync(SIDEBAR, 'utf8')
  const out = []
  // a label and the first `to:` after it, with no other label in between
  const re = /label:\s*'([^']+)'((?:(?!label:)[\s\S]){0,200}?)to:\s*(?:getCompanyPath\()?'([^']+)'/g
  const live = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
  let m
  while ((m = re.exec(live))) out.push({ label: m[1], route: m[3] })
  return out
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(ROOT)) throw new Error(`asset root not found: ${ROOT}`)
  const capLogFile = path.join(ROOT, 'capture-log.json')
  const editLogFile = path.join(ROOT, 'edit-log.json')
  const cap = readJson(capLogFile)
  const edit = readJson(editLogFile)
  const capLog = cap.data ?? {}
  const editLog = edit.data ?? {}

  const slots = await loadMediaSlots()
  const slotById = new Map(slots.map((s) => [s.id, s]))
  const isEmpty = (slot) => !slot.src

  const dataIssues = []
  if (cap.error) dataIssues.push(`capture-log.json is unreadable (${cap.error}) — capture metadata ignored this run`)
  if (edit.error) dataIssues.push(`edit-log.json is unreadable (${edit.error}) — edit metadata ignored this run`)
  if (!cap.data && !cap.error) dataIssues.push('capture-log.json does not exist yet — capture status inferred from files only')
  if (!edit.data && !edit.error) dataIssues.push('edit-log.json does not exist yet — editing status inferred from files only')

  // shot-list sanity
  const seen = new Set()
  for (const s of SHOTS) {
    if (seen.has(s.id)) dataIssues.push(`duplicate shot id in shots.mjs: ${s.id}`)
    seen.add(s.id)
    for (const sl of s.slots ?? []) {
      if (!slotById.has(sl)) dataIssues.push(`shot ${s.id} names slot \`${sl}\`, which is not in media.ts`)
      else if (slotById.get(sl).kind !== 'screenshot') dataIssues.push(`shot ${s.id} names slot \`${sl}\`, which is kind '${slotById.get(sl).kind}', not screenshot`)
    }
  }
  for (const id of Object.keys(capLog)) if (!seen.has(id)) dataIssues.push(`capture-log.json has an entry for \`${id}\`, which is not in shots.mjs`)
  for (const id of Object.keys(editLog)) if (!seen.has(id)) dataIssues.push(`edit-log.json has an entry for \`${id}\`, which is not in shots.mjs`)

  const catalog = []
  const perShot = new Map()
  const knownFiles = new Set()

  for (const shot of SHOTS) {
    const log = capLog[shot.id] ?? null
    const elog = editLog[shot.id] ?? null
    const eFiles = elog ? editLogFiles(elog) : new Map()
    const { page, section } = splitPage(shot.page)
    const files = {}

    for (const v of Object.keys(VARIANTS)) {
      const rel = relPath(shot, v)
      knownFiles.add(rel)
      knownFiles.add(webpRel(shot, v))
      const abs = path.join(ROOT, rel)
      const st = statOf(abs)
      if (!st) {
        if (v !== 'original' && eFiles.has(rel)) dataIssues.push(`edit-log.json lists \`${rel}\` but it is not on disk`)
        continue
      }
      let meta = {}
      let metaError = null
      try {
        meta = await sharp(abs).metadata()
      } catch (e) {
        metaError = e.message
      }
      files[v] = { rel, bytes: st.size, mtimeMs: st.mtimeMs, width: meta.width ?? null, height: meta.height ?? null, metaError, editMeta: eFiles.get(rel) }
    }

    // capture status: the file decides, the log explains
    let captureStatus
    const notes = []
    if (files.original) {
      captureStatus = 'captured'
      if (log?.status === 'blocked') {
        captureStatus = 'captured (log says blocked — file is from an earlier run)'
        notes.push(`capture-log marks this shot blocked (${log.reason}) but an original exists on disk; it may be stale`)
      } else if (!log) notes.push('original exists but capture-log has no entry (capture still running, or file from an earlier run)')
    } else if (log?.status === 'blocked') captureStatus = 'blocked'
    else if (log?.status === 'captured') {
      captureStatus = 'missing (log says captured, no file)'
      dataIssues.push(`capture-log says \`${shot.id}\` was captured (${log.file ?? 'no file recorded'}) but the original is not on disk`)
    } else captureStatus = 'not captured'
    if (log?.file && files.original && log.file.split(path.sep).join('/') !== files.original.rel) {
      dataIssues.push(`capture-log file path for \`${shot.id}\` (${log.file}) differs from the expected ${files.original.rel}`)
    }
    if (log?.focusMissing) notes.push(`focus target not found at capture time: ${log.focusMissing} — detail crop has no anchor`)
    if (files.original?.metaError) notes.push(`original is unreadable: ${files.original.metaError}`)
    if (files.original && files.original.width && (files.original.width !== EXPECTED_ORIGINAL.width || files.original.height !== EXPECTED_ORIGINAL.height)) {
      notes.push(`original is ${files.original.width}×${files.original.height}, expected ${EXPECTED_ORIGINAL.width}×${EXPECTED_ORIGINAL.height}`)
    }
    if (files.original && files.original.bytes < MIN_BYTES) notes.push(`original is only ${kb(files.original.bytes)} — likely a blank or loading screen`)
    if (log?.finalUrl && log.url && !log.finalUrl.startsWith(log.url.split('?')[0])) {
      notes.push(`navigated to ${log.url} but ended on ${log.finalUrl}`)
    }

    // editing status
    const needed = ['full', 'marketing']
    if ((shot.focus || shot.focusSel) && !log?.focusMissing) needed.push('detail')
    if (shot.hero) needed.push('hero')
    const have = needed.filter((v) => files[v])
    const editedAny = ['full', 'marketing', 'detail', 'hero'].some((v) => files[v])
    const editingStatus = !editedAny ? (files.original ? 'pending' : 'n/a — no original') : have.length === needed.length ? 'complete' : `partial (missing ${needed.filter((v) => !files[v]).join(', ')})`
    if (elog && typeof elog === 'object' && (elog.error || elog.status === 'failed')) notes.push(`editor reported: ${elog.error ?? elog.reason ?? elog.status}`)
    if (editedAny && !files.original) notes.push('edited variants exist without an original on disk — provenance cannot be verified')

    const m = files.marketing
    const marketingReady = !!(files.original && m && m.width >= MIN_WIDTH && m.bytes > MIN_BYTES)
    const marketingCheck = !m ? null : [m.width < MIN_WIDTH ? `width ${m.width} < ${MIN_WIDTH}` : null, m.bytes <= MIN_BYTES ? `file ${kb(m.bytes)} ≤ 20 KB` : null].filter(Boolean)

    const recommendedSlots = (shot.slots ?? [])
      .filter((id) => slotById.has(id))
      .map((id) => {
        const sl = slotById.get(id)
        return { id, kind: sl.kind, ratio: sl.ratio, dimensions: sl.dimensions ?? null, empty: isEmpty(sl) }
      })

    for (const v of Object.keys(VARIANTS)) {
      const f = files[v]
      if (!f) continue
      const vNotes = [...notes]
      if (f.metaError) vNotes.push(`unreadable image: ${f.metaError}`)
      if (f.bytes < MIN_BYTES) vNotes.push(`small file (${kb(f.bytes)})`)
      if (v !== 'original' && f.width && f.width < MIN_WIDTH) vNotes.push(`width ${f.width} < ${MIN_WIDTH}`)
      if (f.editMeta?.width && f.width && (f.editMeta.width !== f.width || f.editMeta.height !== f.height)) {
        vNotes.push(`edit-log says ${f.editMeta.width}×${f.editMeta.height}, file is ${f.width}×${f.height}`)
      }
      if (v === 'detail' && log?.focusMissing) vNotes.push('detail exists although capture could not locate the focus card — check the crop')
      const ops = v === 'original' ? [] : opsFor(v, f.editMeta, files.original)
      catalog.push({
        assetId: `${shot.id}--${v}`,
        shotId: shot.id,
        module: shot.module,
        feature: shot.feature,
        variant: v,
        originalPath: files.original?.rel ?? null,
        editedPath: v === 'original' ? null : f.rel,
        webpPath: statOf(path.join(ROOT, webpRel(shot, v))) ? webpRel(shot, v) : null,
        purpose: VARIANTS[v].purpose,
        recommendedPage: page,
        recommendedSection: section,
        recommendedSlots,
        dimensions: { width: f.width, height: f.height },
        bytes: f.bytes,
        captureStatus,
        editingStatus,
        marketingReady: v === 'marketing' ? marketingReady : undefined,
        authenticity: {
          source: 'live application capture',
          tenant: 'Nordic demo tenant',
          url: log?.finalUrl ?? log?.url ?? shot.url,
          persona: log?.persona ?? shot.persona ?? 'owner',
          capturedAt: log?.capturedAt ?? null,
          pixelsAltered: false,
          operations: ops,
          operationsSource: v === 'original' ? 'none (raw capture)' : f.editMeta && (Array.isArray(f.editMeta.operations) || f.editMeta.sourceCrop || f.editMeta.scale != null) ? 'edit-log' : 'default for variant',
        },
        notes: vNotes,
      })
    }

    perShot.set(shot.id, { shot, log, files, captureStatus, editingStatus, marketingReady, marketingCheck, notes })
  }

  // Shots that share a URL differ only by an action (tab/click). If their
  // originals are near-identical, the action most likely did not change the view.
  const thumbs = new Map()
  const thumb = async (rel) => {
    if (!thumbs.has(rel)) {
      thumbs.set(rel, await sharp(path.join(ROOT, rel)).resize(96, 54, { fit: 'fill' }).greyscale().raw().toBuffer().catch(() => null))
    }
    return thumbs.get(rel)
  }
  const byUrl = new Map()
  for (const r of perShot.values()) if (r.files.original) (byUrl.get(r.shot.url) ?? byUrl.set(r.shot.url, []).get(r.shot.url)).push(r)
  for (const group of byUrl.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const [a, b] = [await thumb(group[i].files.original.rel), await thumb(group[j].files.original.rel)]
        if (!a || !b || a.length !== b.length) continue
        let d = 0
        for (let k = 0; k < a.length; k++) d += Math.abs(a[k] - b[k])
        const meanDiff = d / a.length
        if (meanDiff < 1.5) {
          for (const [x, y] of [[group[i], group[j]], [group[j], group[i]]]) {
            x.nearDuplicate = y.shot.id
            if (x.shot.actions?.length) x.notes.push(`original is near-identical to \`${y.shot.id}\` (same URL, mean pixel diff ${meanDiff.toFixed(2)}) — check the action took effect and the view is not an empty state`)
          }
        }
      }
    }
  }
  // content density of each original, measured right of the sidebar and below the top bar
  for (const r of perShot.values()) {
    const o = r.files.original
    if (!o?.width || !o.height) continue
    const scale = o.width / 1440
    const left = Math.min(o.width - 1, Math.round((r.log?.chrome?.sidebarRight ?? 0) * scale))
    const top = Math.min(o.height - 1, Math.round((r.log?.chrome?.headerBottom ?? 0) * scale))
    const buf = await sharp(path.join(ROOT, o.rel)).extract({ left, top, width: o.width - left, height: o.height - top }).resize(240).greyscale().raw().toBuffer().catch(() => null)
    if (!buf) continue
    const hist = new Array(256).fill(0)
    for (const v of buf) hist[v]++
    const bg = hist.indexOf(Math.max(...hist))
    let ink = 0
    for (const v of buf) if (Math.abs(v - bg) > 12) ink++
    r.inkPct = Math.round((ink / buf.length) * 1000) / 10
    if (r.inkPct < SPARSE_INK_PCT) r.notes.push(`sparse content (${r.inkPct}% of the content area) — likely an empty state; check the demo data before using`)
  }

  // notes were pushed after catalog entries were built; resync them
  for (const e of catalog) {
    const r = perShot.get(e.shotId)
    if (e.variant === 'original' && r.inkPct != null) e.contentDensityPct = r.inkPct
    for (const n of r.notes) if (!e.notes.includes(n)) e.notes.push(n)
  }

  // files on disk that no shot accounts for
  const productDir = path.join(ROOT, 'product')
  const orphans = walkPngs(productDir)
    .map((abs) => path.relative(ROOT, abs).split(path.sep).join('/'))
    .filter((rel) => !knownFiles.has(rel))
  for (const o of orphans) dataIssues.push(`file on disk not produced by any shot in shots.mjs: ${o}`)

  const shipped = walkPngs(SHIPPED_DIR).map((abs) => path.relative(MARKETING, abs).split(path.sep).join('/'))

  // ── write catalog.json ─────────────────────────────────────────────────────
  const catalogJson = JSON.stringify(catalog, null, 2) + '\n'
  writeIfChanged(path.join(ROOT, 'catalog.json'), catalogJson)

  // ── COVERAGE.md ────────────────────────────────────────────────────────────
  const rows = [...perShot.values()]
  const L = []
  const newest = Math.max(0, ...rows.flatMap((r) => Object.values(r.files).map((f) => f.mtimeMs)))
  const counts = {
    shots: rows.length,
    captured: rows.filter((r) => r.files.original).length,
    blocked: rows.filter((r) => r.captureStatus === 'blocked').length,
    notCaptured: rows.filter((r) => r.captureStatus === 'not captured').length,
    edited: rows.filter((r) => r.editingStatus === 'complete').length,
    editedPartial: rows.filter((r) => r.editingStatus.startsWith('partial')).length,
    ready: rows.filter((r) => r.marketingReady).length,
    assets: catalog.length,
  }

  L.push('# Marketing screenshot coverage', '')
  L.push('Generated by `qms-app/scripts/marketing-shots/catalog.mjs` from the files on disk, `capture-log.json`, `edit-log.json`, `shots.mjs` and `qms-marketing/app/content/media.ts`. Do not hand-edit — re-run the script.', '')
  L.push(`Newest asset file: ${newest ? new Date(newest).toISOString() : 'none'}. capture-log: ${cap.data ? `${Object.keys(capLog).length} entries` : cap.error ? 'unreadable' : 'absent'}. edit-log: ${edit.data ? `${Object.keys(editLog).length} entries` : edit.error ? 'unreadable' : 'absent'}.`, '')
  L.push(`**${counts.shots} planned shots · ${counts.captured} captured · ${counts.blocked} blocked · ${counts.notCaptured} not yet attempted · ${counts.edited} fully edited (${counts.editedPartial} partial) · ${counts.ready} marketing-ready · ${counts.assets} catalogued files**`, '')
  L.push(`Marketing Ready = original on disk AND \`-marketing.png\` on disk AND width ≥ ${MIN_WIDTH}px AND file > 20 KB.`, '')

  L.push('## Coverage matrix', '')
  L.push('| Module | Feature | Screen Captured | Edited | Marketing Ready |', '|---|---|---|---|---|')
  const yes = '✅'
  const no = '—'
  for (const r of rows) {
    const capCell = r.files.original ? yes : r.captureStatus === 'blocked' ? '❌ blocked' : r.captureStatus.startsWith('missing') ? '⚠️ log only' : no
    const editCell = r.editingStatus === 'complete' ? yes : r.editingStatus.startsWith('partial') ? `◐ ${r.editingStatus.replace(/^partial \(missing /, 'missing ').replace(/\)$/, '')}` : no
    const readyCell = r.marketingReady ? yes : r.marketingCheck?.length ? `❌ ${r.marketingCheck.join('; ')}` : no
    L.push(`| ${md(r.shot.module)} | ${md(r.shot.feature)} \`${r.shot.id}\` | ${capCell} | ${md(editCell)} | ${md(readyCell)} |`)
  }
  L.push('')

  // modules
  L.push('## Modules with no screenshots', '')
  L.push('Against the product module list (qms-app sidebar + `qms/docs/modules`). "Planned" = a shot exists in `shots.mjs`; "captured" = an original is on disk.', '')
  const modStatus = TARGET_MODULES.map((t) => {
    const matched = rows.filter((r) => t.match(r.shot))
    return { t, matched, captured: matched.filter((r) => r.files.original), ready: matched.filter((r) => r.marketingReady) }
  })
  const noPlan = modStatus.filter((m) => !m.matched.length)
  const noCapture = modStatus.filter((m) => m.matched.length && !m.captured.length)
  L.push(`**No shot planned (${noPlan.length}):**`, '')
  for (const m of noPlan) L.push(`- ${m.t.label}`)
  if (!noPlan.length) L.push('- none')
  L.push('', `**Planned but nothing captured yet (${noCapture.length}):**`, '')
  for (const m of noCapture) L.push(`- ${m.t.label} — ${m.matched.map((r) => `\`${r.shot.id}\` (${r.captureStatus})`).join(', ')}`)
  if (!noCapture.length) L.push('- none')
  L.push('', '| Module | Planned | Captured | Marketing ready |', '|---|---|---|---|')
  for (const m of modStatus) L.push(`| ${md(m.t.label)} | ${m.matched.length} | ${m.captured.length} | ${m.ready.length} |`)
  L.push('')

  const sideRoutes = sidebarRoutes()
  const routeHasShot = (route) => {
    const base = route.split('?')[0]
    return SHOTS.some((s) => (route.includes('?') ? s.url === route : s.url === base || s.url.startsWith(base + '/') || s.url.startsWith(base + '?')))
  }
  const OPERATOR_ONLY = ['/platform', '/admin/impersonate', '/docs']
  const sideMissing = sideRoutes.filter((r) => r.route.startsWith('/') && !OPERATOR_ONLY.some((p) => r.route === p || r.route.startsWith(p + '/')) && !r.route.startsWith('/m/') && !routeHasShot(r.route))
  const uniqSideMissing = [...new Map(sideMissing.map((r) => [r.route, r])).values()]
  L.push(`**Sidebar entries with no shot (${uniqSideMissing.length})** — from \`MainSidebar.vue\`, excluding the platform-operator console and \`/m/*\` custom modules:`, '')
  for (const r of uniqSideMissing) L.push(`- ${r.label} — \`${r.route}\``)
  if (!uniqSideMissing.length) L.push('- none')
  L.push('')
  if (fs.existsSync(DOCS_MODULES)) {
    const docDirs = fs.readdirSync(DOCS_MODULES, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
    const mapped = new Set(TARGET_MODULES.flatMap((t) => t.docs))
    const unmapped = docDirs.filter((d) => !mapped.has(d))
    L.push(`**\`qms/docs/modules\` folders not mapped to a marketing module (${unmapped.length}):** ${unmapped.length ? unmapped.map((d) => `\`${d}\``).join(', ') : 'none'}`, '')
  }

  // workflows not covered
  L.push('## Important workflows not covered', '')
  const blocked = rows.filter((r) => r.captureStatus === 'blocked')
  L.push(`**Planned screens that could not be captured (${blocked.length}):**`, '')
  for (const r of blocked) L.push(`- \`${r.shot.id}\` — ${md(r.shot.feature)} (${md(r.shot.page)}): ${md(r.log?.reason)}`)
  if (!blocked.length) L.push('- none')
  const emptyShotSlots = slots.filter((s) => s.kind === 'screenshot' && isEmpty(s))
  const candidatesFor = (slotId) => rows.filter((r) => (r.shot.slots ?? []).includes(slotId))
  const orphanSlots = emptyShotSlots.filter((s) => !candidatesFor(s.id).length)
  L.push('', `**Empty marketing-site screenshot slots with no candidate shot (${orphanSlots.length} of ${emptyShotSlots.length})** — these describe workflows the site promises that no planned shot shows:`, '')
  for (const s of orphanSlots) L.push(`- \`${s.id}\` — ${md(s.alt)}`)
  if (!orphanSlots.length) L.push('- none')
  L.push('')

  // slot coverage
  L.push('## Marketing-site slot coverage', '')
  const shotSlotsAll = slots.filter((s) => s.kind === 'screenshot')
  L.push(`${shotSlotsAll.length} screenshot slots in media.ts, ${emptyShotSlots.length} empty (\`src: null\`). ${shipped.length} files already shipped under \`app/public/media/screenshots/\`${fs.existsSync(SHIPPED_DIR) ? '' : ' (directory does not exist)'}.`, '')
  L.push('| Slot | Ratio | Dimensions | Candidate shot(s) | Candidate state |', '|---|---|---|---|---|')
  const stateOf = (r) => (r.marketingReady ? 'marketing-ready' : r.editingStatus === 'complete' || r.editingStatus.startsWith('partial') ? `edited (${r.editingStatus})` : r.files.original ? 'captured, not edited' : r.captureStatus)
  for (const s of emptyShotSlots) {
    const c = candidatesFor(s.id)
    L.push(`| \`${s.id}\` | ${s.ratio} | ${s.dimensions ?? ''} | ${c.length ? c.map((r) => `\`${r.shot.id}\``).join(', ') : 'no candidate'} | ${c.length ? md(c.map(stateOf).join('; ')) : ''} |`)
  }
  L.push('')

  // recapture
  L.push('## Screenshots needing recapture', '')
  const recap = rows
    .map((r) => {
      const why = []
      if (r.captureStatus === 'blocked') why.push(`blocked: ${r.log?.reason}`)
      if (r.captureStatus.startsWith('captured (log says blocked')) why.push('log says blocked but a (possibly stale) original is on disk')
      if (r.captureStatus.startsWith('missing')) why.push('log says captured but no file on disk')
      if (r.log?.focusMissing) why.push(`focus not found: ${r.log.focusMissing}`)
      if (r.inkPct != null && r.inkPct < SPARSE_INK_PCT) why.push(`sparse content (${r.inkPct}%) — likely an empty state, seed data or pick another record`)
      if (r.nearDuplicate && r.shot.actions?.length) why.push(`near-identical to \`${r.nearDuplicate}\` — check action took effect / view is not an empty state`)
      const o = r.files.original
      if (o && o.bytes < MIN_BYTES) why.push(`original only ${kb(o.bytes)}`)
      if (o?.metaError) why.push('original unreadable')
      if (o?.width && (o.width !== EXPECTED_ORIGINAL.width || o.height !== EXPECTED_ORIGINAL.height)) why.push(`original ${o.width}×${o.height}`)
      if (r.log?.finalUrl && r.log.url && !r.log.finalUrl.startsWith(r.log.url.split('?')[0])) why.push(`ended on ${r.log.finalUrl}`)
      return { r, why }
    })
    .filter((x) => x.why.length)
  if (!recap.length) L.push('- none')
  for (const { r, why } of recap) L.push(`- \`${r.shot.id}\` — ${md(why.join('; '))}`)
  L.push('')

  // access / data limits
  L.push('## Cannot capture due to access/data limits', '')
  if (!blocked.length) L.push('- none recorded (no blocked shots in capture-log)')
  for (const r of blocked) {
    const reason = r.log?.reason ?? ''
    const kind = /login/i.test(reason) ? 'access (login)' : /no-access|403|forbidden|permission/i.test(reason) ? 'access (permission)' : /404|nothing here/i.test(reason) ? 'data/route (404)' : /timeout|locator|waiting for/i.test(reason) ? 'UI element not found (data or selector)' : 'other'
    L.push(`- \`${r.shot.id}\` [${kind}] — ${md(reason)}`)
  }
  L.push('')

  if (dataIssues.length) {
    L.push('## Data issues', '')
    for (const d of [...new Set(dataIssues)]) L.push(`- ${d}`)
    L.push('')
  }

  writeIfChanged(path.join(ROOT, 'COVERAGE.md'), L.join('\n'))

  // ── stdout summary ─────────────────────────────────────────────────────────
  console.info(`catalog → ${path.join(ROOT, 'catalog.json')} (${counts.assets} files)`)
  console.info(`report  → ${path.join(ROOT, 'COVERAGE.md')}`)
  console.info(`shots ${counts.shots} · captured ${counts.captured} · blocked ${counts.blocked} · not attempted ${counts.notCaptured}`)
  console.info(`edited complete ${counts.edited} · partial ${counts.editedPartial} · marketing-ready ${counts.ready}`)
  console.info(`modules: ${noPlan.length} with no shot planned, ${noCapture.length} planned but uncaptured`)
  console.info(`slots: ${emptyShotSlots.length} empty screenshot slots, ${orphanSlots.length} with no candidate shot`)
  console.info(`recapture ${recap.length} · data issues ${new Set(dataIssues).size}`)
}

// Operations actually applied, from the editor's record when it has one:
// crop when the source region is smaller than the original, scale-down when
// scale < 1; frame/shadow/background are always added outside the UI pixels.
function opsFor(variant, meta, original) {
  if (Array.isArray(meta?.operations)) return meta.operations
  if (!meta || (!meta.sourceCrop && meta.scale == null)) return VARIANTS[variant].ops
  const ops = []
  const c = meta.sourceCrop
  if (c && original?.width && (c.left > 0 || c.top > 0 || c.width < original.width || c.height < original.height)) ops.push('crop')
  if (meta.scale != null && meta.scale < 1) ops.push('scale-down')
  ops.push('frame', 'shadow', 'background')
  return ops
}

function writeIfChanged(file, content) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return false
  fs.writeFileSync(file, content)
  return true
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
