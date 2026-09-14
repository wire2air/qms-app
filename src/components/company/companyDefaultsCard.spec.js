import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'

/**
 * The Defaults card — above all its "Overdue Task Reminders" section, the only
 * UI in front of the nightly overdue ladder (send_task_overdue_notification).
 *
 * Three properties are pinned:
 *   1. An unconfigured tenant sees DEFAULT_OVERDUE_CONFIG — the ladder that
 *      actually runs when the key is absent — not a blank form. Compared
 *      against the WORKER'S OWN SOURCE when the backend repo sits next to this
 *      one, so the two cannot drift silently.
 *   2. The reminder-days field applies the worker's normalisation on commit
 *      (split, drop non-positive / non-integer, de-duplicate, sort), so it
 *      redisplays exactly what will fire.
 *   3. A failed autosave is surfaced in the card header.
 */

// Decorator-based models need the babel plugin this lighter vitest config does
// not load (same avoidance as DashboardHome.spec.js).
vi.mock('@models/index', () => ({ db: {} }))

const h = vi.hoisted(() => ({ company: null }))
vi.mock('@/composables/useLiveQuery.js', async () => {
  const { ref } = await import('vue')
  h.company = ref(undefined)
  return {
    useLiveQueryWithDeps: () => h.company,
    useLiveQuery: () => ref([]),
    useLiveMutation: (fn) => fn,
  }
})
vi.mock('@/utils/currentCompany.js', async () => {
  const { ref } = await import('vue')
  return { currentCompany: ref({ id: 'c1' }) }
})

const CompanyDefaultsCard = (await import('./companyDefaultsCard.vue')).default

function makeCompany(settings = {}, save = vi.fn(async () => {})) {
  return reactive({ id: 'c1', settings, save })
}

/**
 * Mount, THEN land the company — the order the live query produces in the app.
 * The card's watcher skips its first trigger on the assumption that the first
 * change is the load; landing the row before mount would make the first USER
 * edit the skipped one.
 */
// Every mount shares the one mocked live-query ref, so a card left mounted by an
// earlier test would see the next test's company land and autosave into it.
const mounted = []

async function mountWith(company) {
  const w = mount(CompanyDefaultsCard, { attachTo: document.body })
  mounted.push(w)
  h.company.value = company
  await nextTick()
  await flushPromises()
  return w
}

function inputByLabel(w, text) {
  const label = w.findAll('label').find((l) => l.text().trim().startsWith(text))
  if (!label) throw new Error(`no <label> starting "${text}"`)
  return w.find(`[id="${label.attributes('for')}"]`)
}

function switchByName(w, name) {
  const sw = w.findAll('[role="switch"]').find((s) => s.text().includes(name))
  if (!sw) throw new Error(`no switch named "${name}"`)
  return sw
}

/** The worker's DEFAULT_OVERDUE_CONFIG, read from its source — or null if the backend repo is absent. */
function workerDefaults() {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const file = path.resolve(here, '../../../../qms/backend/worker/tasks/send_task_overdue_notification.js')
  if (!fs.existsSync(file)) return null
  const src = fs.readFileSync(file, 'utf8')
  const block = src.match(/DEFAULT_OVERDUE_CONFIG\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\)/)?.[1]
  if (!block) return null
  return {
    enabled: /enabled:\s*true/.test(block),
    reminderDays: JSON.parse(block.match(/reminderDays:\s*(\[[^\]]*\])/)[1]),
    escalationDay: Number(block.match(/escalationDay:\s*(\d+)/)[1]),
  }
}

beforeEach(() => {
  h.company.value = undefined
})
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('companyDefaultsCard — overdue reminders', () => {
  it('shows DEFAULT_OVERDUE_CONFIG when the key has never been written', async () => {
    const w = await mountWith(makeCompany({}))
    expect(switchByName(w, 'Chase overdue tasks').attributes('aria-checked')).toBe('true')
    expect(inputByLabel(w, 'Reminder days past due').element.value).toBe('3, 6, 9')
    expect(inputByLabel(w, 'Escalation day').element.value).toBe('12')
  })

  it('mirrors the worker’s DEFAULT_OVERDUE_CONFIG exactly (skipped when the backend repo is absent)', async (ctx) => {
    const worker = workerDefaults()
    if (!worker) ctx.skip()
    expect(worker).toEqual({ enabled: true, reminderDays: [3, 6, 9], escalationDay: 12 })
    const w = await mountWith(makeCompany({}))
    expect(inputByLabel(w, 'Reminder days past due').element.value).toBe(worker.reminderDays.join(', '))
    expect(inputByLabel(w, 'Escalation day').element.value).toBe(String(worker.escalationDay))
  })

  it('normalises on Enter: "9, 3, 3, 6" → [3, 6, 9], and redisplays it', async () => {
    const company = makeCompany({})
    const w = await mountWith(company)
    const days = inputByLabel(w, 'Reminder days past due')
    await days.setValue('9, 3, 3, 6')
    await days.trigger('keyup', { key: 'Enter' })
    await nextTick()
    expect(company.settings.overdueReminders.reminderDays).toEqual([3, 6, 9])
    expect(days.element.value).toBe('3, 6, 9')
  })

  it('does not reorder while typing — the draft is only parsed on commit', async () => {
    const company = makeCompany({})
    const w = await mountWith(company)
    const days = inputByLabel(w, 'Reminder days past due')
    await days.setValue('9, 3')
    expect(days.element.value).toBe('9, 3')
    expect(company.settings.overdueReminders).toBeUndefined()
  })

  it('drops what the worker drops on blur: "0, -1, 2.5, x, 4" → [4] (no truncation of 2.5 to 2)', async () => {
    const company = makeCompany({})
    const w = await mountWith(company)
    const days = inputByLabel(w, 'Reminder days past due')
    await days.setValue('0, -1, 2.5, x, 4')
    await days.trigger('blur')
    expect(company.settings.overdueReminders.reminderDays).toEqual([4])
  })

  it('falls back to [3, 6, 9] when nothing valid is left', async () => {
    const company = makeCompany({})
    const w = await mountWith(company)
    const days = inputByLabel(w, 'Reminder days past due')
    await days.setValue(' , 0; -2 ')
    await days.trigger('blur')
    expect(company.settings.overdueReminders.reminderDays).toEqual([3, 6, 9])
  })

  it('a non-positive escalation day falls back to 12', async () => {
    const company = makeCompany({})
    const w = await mountWith(company)
    await inputByLabel(w, 'Escalation day').setValue('-3')
    expect(company.settings.overdueReminders.escalationDay).toBe(12)
  })

  it('switching the chase off writes enabled:false and keeps the configured rungs', async () => {
    const company = makeCompany({ overdueReminders: { reminderDays: [2, 5], escalationDay: 8 } })
    const w = await mountWith(company)
    await switchByName(w, 'Chase overdue tasks').trigger('click')
    await nextTick()
    expect(company.settings.overdueReminders).toEqual({ reminderDays: [2, 5], escalationDay: 8, enabled: false })
    expect(w.findAll('label').some((l) => l.text().startsWith('Reminder days past due'))).toBe(false)
  })

  it('every switch in the card has an accessible name', async () => {
    const w = await mountWith(makeCompany({}))
    const switches = w.findAll('[role="switch"]')
    expect(switches.length).toBe(6)
    for (const s of switches) expect(s.text().trim().length).toBeGreaterThan(0)
  })
})

describe('companyDefaultsCard — autosave', () => {
  it('saves once, after the debounce, when a field changes', async () => {
    vi.useFakeTimers()
    const company = makeCompany({})
    const w = await mountWith(company)
    await inputByLabel(w, 'Default SLA (days)').setValue('7')
    expect(company.save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(600)
    expect(company.save).toHaveBeenCalledTimes(1)
    expect(company.settings.defaultSla).toBe(7)
  })

  it('surfaces a failed save in the card header, with the reason', async () => {
    vi.useFakeTimers()
    const company = makeCompany({}, vi.fn(async () => Promise.reject(new Error('Network request failed'))))
    const w = await mountWith(company)
    await inputByLabel(w, 'Default SLA (days)').setValue('9')
    await vi.advanceTimersByTimeAsync(600)
    await flushPromises()
    expect(w.text()).toContain('Save failed')
    expect(w.text()).toContain('Network request failed')
  })
})
