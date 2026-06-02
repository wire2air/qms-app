/**
 * Turn a 5-field cron expression (minute hour day-of-month month
 * day-of-week) into a human-friendly phrase for display in lists.
 *
 * Covers the shapes the CronPicker produces (daily / weekly / monthly /
 * specific-months) and falls back to the raw expression for anything it
 * can't confidently describe — better a correct cron string than a wrong
 * sentence.
 *
 * Examples:
 *   '5 17 * * *'        → 'Daily at 5:05 PM'
 *   '0 8 * * MON'       → 'Weekly on Mon at 8:00 AM'
 *   '0 8 * * 1,3,5'     → 'Weekly on Mon, Wed, Fri at 8:00 AM'
 *   '0 9 1 * *'         → 'Monthly on the 1st at 9:00 AM'
 *   '0 9 1 1,4,7,10 *'  → 'On the 1st of Jan, Apr, Jul, Oct at 9:00 AM'
 */

const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DOW_ALIASES = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 }
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function timeLabel(minute, hour) {
  const m = Number(minute)
  const h = Number(hour)
  if (!Number.isInteger(m) || !Number.isInteger(h) || h < 0 || h > 23 || m < 0 || m > 59)
    return null
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function parseDowList(field) {
  // Accept numbers (0-7, where 0 and 7 = Sunday) and MON..SUN aliases.
  return field.split(',').map((part) => {
    const upper = part.toUpperCase()
    if (upper in DOW_ALIASES) return DOW_ALIASES[upper]
    const n = Number(part)
    if (!Number.isInteger(n)) return null
    return n === 7 ? 0 : n
  })
}

export function humanizeCron(cron) {
  if (typeof cron !== 'string' || !cron.trim()) return '—'
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return cron
  const [minute, hour, dom, month, dow] = parts

  const time = timeLabel(minute, hour)
  // Only describe fixed single times; ranges/steps in minute or hour
  // fall back to the raw cron.
  if (!time || minute.includes('/') || hour.includes('/') || minute.includes('-')) return cron
  const at = `at ${time}`

  const domAny = dom === '*'
  const monAny = month === '*'
  const dowAny = dow === '*' || dow === '?'

  // Daily
  if (domAny && monAny && dowAny) return `Daily ${at}`

  // Weekly (day-of-week set, day-of-month any)
  if (domAny && monAny && !dowAny) {
    const days = parseDowList(dow)
    if (days.some((d) => d === null || d < 0 || d > 6)) return cron
    const label = days.map((d) => DOW_NAMES[d]).join(', ')
    return `Weekly on ${label} ${at}`
  }

  // Monthly / specific-months (day-of-month set)
  if (!domAny && dowAny) {
    const day = Number(dom)
    if (!Number.isInteger(day)) return cron
    if (monAny) return `Monthly on the ${ordinal(day)} ${at}`
    const months = month.split(',').map((m) => Number(m))
    if (months.some((m) => !Number.isInteger(m) || m < 1 || m > 12)) return cron
    const monthLabel = months.map((m) => MONTH_NAMES[m - 1]).join(', ')
    return `On the ${ordinal(day)} of ${monthLabel} ${at}`
  }

  return cron
}
