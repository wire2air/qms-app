/**
 * Opening a saved rule must not empty it.
 *
 * AutomationRuleBuilder.vue holds two watchers whose interaction is the whole
 * subject of this file:
 *
 *   1. watch(open, …)                      → hydrateDraft() REPLACES draft.value
 *   2. watch(() => draft.value.objectType) → clears conditions for a retarget
 *
 * `draft` starts as blankDraft(), objectType 'QualityEvent'. Hydration replaces
 * the whole object, so opening a rule that targets anything else CHANGES the
 * second watcher's getter — and watcher 2 is registered after watcher 1, so it
 * runs later in the same pre-flush queue, one step after the rule's conditions
 * were loaded, and empties them.
 *
 * The user sees a rule with no conditions. Pressing Save stores
 * `conditions: []`, and the evaluator reads an empty tree as "no conditions =
 * always" — so a rule that fired on critical supplier NCs starts firing on
 * every NC. Nothing errors, nothing warns, and the rule stays Active.
 *
 * ── WHY THIS IS A MODEL AND NOT A MOUNT ──────────────────────────────────────
 * The component imports `@models/index`, whose decorator syntax the vitest
 * config cannot transform (no vite-plugin-babel), so it cannot be imported in a
 * test at all — which is why nothing in this repo mounts it, and why the defect
 * survived. What IS testable is the mechanism: two watchers, in that creation
 * order, over the same replaced ref. The structure below mirrors the component
 * line for line; the first test proves the mechanism is real, the second proves
 * the guard the component now carries neutralises it.
 */
import { describe, it, expect } from 'vitest'
import { ref, watch, nextTick } from 'vue'

const SAVED_RULE = {
  objectType: 'Capa',
  trigger: 'SCHEDULED',
  conditions: [{ field: 'status_id', operator: 'is', value: 'OPEN' }],
  groups: [],
}

/**
 * @param guarded  whether the reset watcher carries the hydration guard the
 *                 component now has.
 */
function builder({ guarded }) {
  const draft = ref({ objectType: 'QualityEvent', trigger: 'CREATED', conditions: [], groups: [] })
  const open = ref(false)
  const hydratedObjectType = ref(null)
  const resets = ref(0)

  // Watcher 1 — registered first, exactly as in the component.
  watch(open, (v) => {
    if (!v) {
      hydratedObjectType.value = null
      return
    }
    draft.value = { ...SAVED_RULE, conditions: SAVED_RULE.conditions.map((c) => ({ ...c })) }
    hydratedObjectType.value = SAVED_RULE.objectType
  })

  // Watcher 2 — registered second, exactly as in the component.
  watch(
    () => draft.value.objectType,
    (next) => {
      if (guarded && next === hydratedObjectType.value) return
      resets.value += 1
      draft.value.conditions = []
      draft.value.groups = []
    },
  )

  return { draft, open, resets }
}

describe('the reset watcher must not fire on hydration', () => {
  it('UNGUARDED: opening a saved rule empties its conditions — the defect', async () => {
    // Proves the mechanism is real rather than theorised. If Vue ever stopped
    // firing a getter watch on ref replacement, this test would fail and the
    // guard below would be revealed as unnecessary.
    const { open, draft, resets } = builder({ guarded: false })
    open.value = true
    await nextTick()
    await nextTick()

    expect(resets.value).toBe(1)
    expect(draft.value.conditions).toEqual([])
  })

  it('GUARDED: the same open preserves every condition', async () => {
    const { open, draft, resets } = builder({ guarded: true })
    open.value = true
    await nextTick()
    await nextTick()

    expect(resets.value, 'the reset watcher fired on a load, not a user pick').toBe(0)
    expect(draft.value.conditions).toEqual(SAVED_RULE.conditions)
  })

  it('GUARDED: a real object change still resets', async () => {
    // The guard must not disable the watcher. Retargeting a rule at a different
    // object leaves conditions naming columns that object does not have, and
    // the evaluator treats a condition it cannot interpret as MATCHING — so
    // keeping them would widen the retargeted rule to everything.
    const { open, draft, resets } = builder({ guarded: true })
    open.value = true
    await nextTick()
    await nextTick()

    draft.value.objectType = 'Nonconformance'
    await nextTick()

    expect(resets.value).toBe(1)
    expect(draft.value.conditions).toEqual([])
  })

  it('GUARDED: a saved rule keeps the trigger it was saved with', async () => {
    // Stranded SCHEDULED rules on built-in objects exist and cannot fire. The
    // picker no longer OFFERS SCHEDULED for those objects, but opening such a
    // rule must not silently rewrite its trigger to CREATED — that would turn
    // an inert rule into a live one behind the operator's back, at the exact
    // moment they opened it to look at it.
    const { open, draft } = builder({ guarded: true })
    open.value = true
    await nextTick()
    await nextTick()

    expect(draft.value.trigger).toBe('SCHEDULED')
  })
})
