/**
 * MutationRunner — builds and fires GraphQL mutations/queries for model operations.
 * Called directly from directSaveStrategy (main thread, no queue).
 */

import { MetaCache } from '../core/MetaCache.js'
import { graphqlRequest } from './graphqlClient.js'
import { serializeModel } from '../persistence/hydration.js'
import { OPERATION, LOAD_STRATEGY } from '../shared/constants.js'
import ModelRegistry from '../core/ModelRegistry.js'

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Build { query, variables } for the given action.
 * @param {object} meta - MetaCache entry
 * @param {import('../core/BaseModel.js').BaseModel} instance
 * @param {string} action - OPERATION.*
 * @param {object} [patch] - precomputed UPDATE patch (required for UPDATE)
 * @returns {{ query: string, variables: object }}
 */
/**
 * Build the key portion of an UPDATE / DELETE mutation input.
 *
 * Most models key on their single primary key. A model whose DB table has a
 * COMPOSITE primary key (e.g. RecordCounter → (companyId, templateId)) declares
 * a `static keyFields = [...]`; PostGraphile's update/delete input for such a
 * table requires EVERY key column, so we must send them all — sending only the
 * `primaryKey` field left the other key column missing ("Field 'companyId' of
 * required type 'UUID!' was not provided"). Defaults to the single primary key,
 * which is byte-identical to the previous `{ [meta.pk]: id }` behaviour.
 */
export function buildKeyInput(meta, instance) {
  const keyFields =
    Array.isArray(instance.constructor?.keyFields) && instance.constructor.keyFields.length
      ? instance.constructor.keyFields
      : [meta.pk]
  const input = {}
  for (const field of keyFields) input[field] = instance[field]
  return input
}

function buildQueryAndVariables(meta, instance, action, patch) {
  switch (action) {
    case OPERATION.CREATE: {
      const serialized = serializeModel(instance.constructor.name, instance, 'create')
      return {
        query: meta.create,
        variables: { input: { [meta.singularName]: serialized } },
      }
    }
    case OPERATION.UPDATE: {
      if (!patch) {
        throw new Error('[MutationRunner] UPDATE requires a precomputed patch')
      }
      return {
        query: meta.update,
        variables: { input: { ...buildKeyInput(meta, instance), patch } },
      }
    }
    case OPERATION.DELETE:
      return {
        query: meta.delete,
        variables: { input: buildKeyInput(meta, instance) },
      }
    default:
      throw new Error(`[MutationRunner] Unknown action: ${action}`)
  }
}

/**
 * Extract the server-returned record from a create/update GraphQL response.
 * Returns null for DELETE (no record in response body).
 * @param {object} data - raw GraphQL data object
 * @param {object} meta
 * @param {string} action
 * @returns {object|null}
 */
function extractServerRecord(data, meta, action) {
  if (action === OPERATION.DELETE) return null
  const opName =
    action === OPERATION.CREATE
      ? `create${capitalize(meta.singularName)}`
      : `update${capitalize(meta.singularName)}`
  return data?.[opName]?.[meta.singularName] ?? null
}

export const MutationRunner = {
  /**
   * Run a create/update/delete mutation for a model instance.
   *
   * @param {import('../core/BaseModel.js').BaseModel} instance
   * @param {string} action - OPERATION.CREATE | UPDATE | DELETE
   * @param {{ patch?: object }} [options] - UPDATE patch (required for UPDATE)
   * @returns {Promise<object|null>} server-returned record (null for DELETE or LOCAL models)
   * @throws {GraphQLError} if the request fails
   */
  async run(instance, action, { patch } = {}) {
    const modelName = instance.constructor.name
    const schema = ModelRegistry.getSchema(modelName)
    if (!schema) throw new Error(`[MutationRunner] Unknown model: ${modelName}`)

    // LOCAL strategy: no network
    if (schema.loadStrategy === LOAD_STRATEGY.LOCAL) return null

    const meta = MetaCache.get(modelName)
    if (!meta) throw new Error(`[MutationRunner] No meta for model: ${modelName}`)

    const { query, variables } = buildQueryAndVariables(meta, instance, action, patch)
    const data = await graphqlRequest(query, variables)
    return extractServerRecord(data, meta, action)
  },

  /**
   * Fetch a single record from the server by primary key.
   * Used by socketSubscriber to materialise a server-pushed change.
   *
   * @param {object} meta - MetaCache entry
   * @param {string|number} pkValue
   * @param {{ signal?: AbortSignal }} [options]
   * @returns {Promise<object|null>}
   */
  async fetchOne(meta, pkValue, { signal } = {}) {
    const data = await graphqlRequest(meta.fetch, { [meta.fetchVariableName]: pkValue }, { signal })
    return data?.[meta.singularName] ?? null
  },
}
