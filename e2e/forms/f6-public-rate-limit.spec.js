// FORMS-F6 — `publicFormLimiter` is mounted, on both public endpoints, sharing
// one bucket, in this environment.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT IS BEING PINNED, AND WHAT IS DELIBERATELY NOT
//
// The public surface is the only unauthenticated write in the product. Before
// 2026-09-01 it had no limiter at all: an anonymous caller could enumerate
// template UUIDs as fast as the socket allowed, and each miss was a query. The
// hardening pass added `publicFormLimiter` — 60 requests / 15 minutes per IP,
// in EVERY environment, mounted BEFORE `express.json()` so an oversized body
// from a limited IP is refused without being parsed.
//
// This file asserts that the limiter is THERE and that it COUNTS. It does not
// assert that request 61 is refused, and the omission is deliberate:
//
//   • The bucket is in-memory, per-IP, and 15 minutes wide. Exhausting it would
//     429 every other journey in this project — and every journey in whatever
//     other suite is running against the same stack — for a quarter of an hour.
//     A test that breaks four other test files to prove a counter works is a bad
//     trade, and the counter is observable without doing it.
//   • Both public endpoints share ONE limiter instance. Spending the budget here
//     spends f1's, f2's and f3's too.
//
// What IS observable, because `standardHeaders: true`, is the counter itself:
// `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Policy` on every
// response. Reading `Remaining` before and after one request proves the request
// was counted — which is the whole mechanism — for the price of two requests.
//
// ─────────────────────────────────────────────────────────────────────────────
// MEASURED (:4000, 2026-09-01)
//
//   RateLimit-Policy: 60;w=900
//   RateLimit-Limit: 60
//   RateLimit-Remaining: 59, 58, 57, … decrementing across BOTH endpoints
//
// The `w=900` is the 15-minute window; the default `max` is
// `Number(process.env.PUBLIC_FORM_RATE_LIMIT_MAX) || 60`. The assertions below
// read the limit off the response rather than hard-coding 60, so raising the env
// var to run a big suite does not fail this test — only REMOVING the limiter
// does, which is the regression worth catching.
//
// ⚠ This file spends 3 requests.
import { test, expect } from '@playwright/test'
import {
  FORMS,
  anonymousApi,
  ensureFormsFixtures,
  liveToken,
  nonexistentToken,
  publicGet,
  publicPost,
} from '../fixtures/forms.js'

function limiterHeaders(res) {
  const h = res.headers()
  return {
    policy: h['ratelimit-policy'] ?? null,
    limit: h['ratelimit-limit'] ?? null,
    remaining: h['ratelimit-remaining'] ?? null,
    reset: h['ratelimit-reset'] ?? null,
  }
}

test.beforeAll(() => ensureFormsFixtures())

test.describe('FORMS-F6 — the unauthenticated surface is rate-limited', () => {
  test('both public endpoints are counted, and they share one bucket', async () => {
    const ctx = await anonymousApi()

    // Leg 1 — the READ. A refused token is used on purpose: the limiter runs
    // BEFORE the handler, so a request that will 404 must still be counted, and
    // "only successful requests are limited" would be a hole an enumerator could
    // drive through.
    const read = await publicGet(ctx, nonexistentToken('b'))
    expect(read.status(), 'the probe is a refusal, and that is the point').toBe(404)
    const afterRead = limiterHeaders(read)

    expect(afterRead.policy, 'the limiter announces its window').toMatch(/^\d+;w=\d+$/)
    expect(Number(afterRead.limit), 'and a finite budget').toBeGreaterThan(0)
    expect(afterRead.remaining, 'and what is left of it').not.toBeNull()
    expect(Number(afterRead.reset), 'and when it refills').toBeGreaterThan(0)

    const windowSeconds = Number(/w=(\d+)/.exec(afterRead.policy)[1])
    expect(windowSeconds, 'a 15-minute window (900s), per middleware/rateLimiter.js').toBe(900)

    // Leg 2 — the WRITE, through the OTHER endpoint. `publicFormLimiter` is a
    // single `rateLimit()` instance imported by both routes, so one bucket
    // governs the read and the write together. If they had been given separate
    // instances the counter would restart here — and an attacker could spend a
    // full budget on each.
    const write = await publicPost(ctx, { token: nonexistentToken('b'), payload: {} })
    expect(write.status(), 'the write refuses the same token').toBe(404)
    const afterWrite = limiterHeaders(write)

    expect(afterWrite.limit, 'the same budget governs both endpoints').toBe(afterRead.limit)
    expect(
      Number(afterWrite.remaining),
      'and the write consumed from the SAME counter the read did',
    ).toBe(Number(afterRead.remaining) - 1)

    await ctx.dispose()
  })

  test('a successful read is counted too', async () => {
    // The pair. The leg above used two refusals, and "refusals are counted" is
    // also what a limiter that counted ONLY refusals would produce — which would
    // be a limiter an attacker could evade by only ever asking for forms that
    // exist. One 200, and its `Remaining` has to be lower than the previous
    // response's, in the same window, on the same IP.
    const token = liveToken(FORMS.published.id)
    expect(token, 'the published fixture is live').toMatch(/^[0-9a-f]{64}$/)

    const ctx = await anonymousApi()
    const res = await publicGet(ctx, token)
    expect(res.status(), 'a genuinely published form is served').toBe(200)

    const h = limiterHeaders(res)
    expect(h.remaining, 'a 200 carries the counter as well').not.toBeNull()
    expect(
      Number(h.remaining),
      'and it is strictly below the budget — this request was charged for',
    ).toBeLessThan(Number(h.limit))

    await ctx.dispose()
  })
})
