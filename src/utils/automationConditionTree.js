/**
 * The condition-tree round trip: stored rule → builder draft → stored rule.
 *
 * ── WHY THIS IS ITS OWN FILE ─────────────────────────────────────────────────
 * It used to be two fragments inside AutomationRuleBuilder.vue, and they did
 * not agree with each other. Hydration read `conditionTree.conditions`; saving
 * rebuilt the tree as `{ logic, conditions }` — with no `groups` key at all.
 *
 * The evaluator supports nested groups and has tests for them
 * (qms/backend/worker/services/automation/evaluateConditionTree.js, `groups[]`),
 * `condition_tree` is free-form JSONB, and rules carrying groups exist. So
 * opening one of those rules to change its name and pressing Save deleted the
 * nested logic, irrecoverably, with no warning and no visible difference in the
 * form — the builder never showed the groups, so nothing appeared to be lost.
 *
 * And the direction of the damage is the bad one. Dropping a group that was
 * ANDed in only ever WIDENS what the rule matches: a rule that fired on
 * "critical AND (supplier-facing OR safety)" starts firing on every critical
 * record. It does not break, it over-fires — which reads as noise rather than
 * as data loss, so nobody traces it back to the save.
 *
 * Pulled out here so the round trip is one thing, in one place, with tests
 * asserting that what goes in comes back out.
 */
import { NO_VALUE_OPERATORS, LIST_OPERATORS } from './automationObjects.js'

/**
 * The stored value for one condition.
 *
 * - operators that take no value (is_empty, is_true …) drop it entirely
 * - list operators (in, not_in, between) accept a comma-separated string from
 *   the text input and store a trimmed array
 *
 * @returns {*} the value to store, or undefined to omit the key
 */
export function normalizeConditionValue(cond) {
  if (NO_VALUE_OPERATORS.has(cond.operator)) return undefined
  if (LIST_OPERATORS.has(cond.operator)) {
    const arr = Array.isArray(cond.value) ? cond.value : String(cond.value ?? '').split(',')
    return arr.map((s) => String(s).trim()).filter(Boolean)
  }
  return cond.value
}

/**
 * Stored tree → the parts the builder's draft holds.
 *
 * `groups` is deep-cloned through JSON rather than structuredClone: the tree
 * arrives off a reactive model instance, so its nested members are Proxies and
 * structuredClone refuses them. The column is JSONB, so a JSON round trip is
 * lossless by definition.
 *
 * @param {object|null} conditionTree
 * @returns {{ logic: string, conditions: object[], groups: object[] }}
 */
export function hydrateConditionTree(conditionTree) {
  return {
    logic: conditionTree?.logic || 'AND',
    conditions: Array.isArray(conditionTree?.conditions)
      ? conditionTree.conditions.map((c) => ({ ...c }))
      : [],
    // Carried, never edited. The builder has no UI for a sub-group; its only
    // obligation is to give them back exactly as it found them.
    groups: Array.isArray(conditionTree?.groups)
      ? JSON.parse(JSON.stringify(conditionTree.groups))
      : [],
  }
}

/**
 * Builder draft → the tree to store.
 *
 * Conditions missing a field or operator are dropped: they are half-filled rows
 * the user added and never completed, and the evaluator treats a malformed
 * condition as MATCHING, so storing one would silently widen the rule.
 *
 * The `groups` key is written only when there are groups, so a rule authored in
 * this builder keeps exactly the shape it has always had and no spurious diff
 * appears on rules that never had nested logic.
 *
 * @param {{ logic: string, conditions: object[], groups?: object[] }} draft
 */
export function buildConditionTree(draft) {
  const tree = {
    logic: draft.logic,
    conditions: (draft.conditions || [])
      .filter((c) => c.field && c.operator)
      .map((c) => {
        const v = normalizeConditionValue(c)
        return v === undefined
          ? { field: c.field, operator: c.operator }
          : { field: c.field, operator: c.operator, value: v }
      }),
  }
  if (draft.groups?.length) tree.groups = draft.groups
  return tree
}
