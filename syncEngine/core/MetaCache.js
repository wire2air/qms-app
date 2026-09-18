/**
 * MetaCache — in-memory store for per-model GraphQL strings and metadata.
 *
 * Replaces TableMeta/TableMetaService (which stored these in IDB for the SW).
 * Built once at syncEngine.install() after all @ClientModel classes are imported.
 */

import pluralize from 'pluralize-esm'
import ModelRegistry from './ModelRegistry.js'
import { GraphQLSchemaGenerator } from '../network/GraphQLSchemaGenerator.js'
import { LOAD_STRATEGY } from '../shared/constants.js'

/** @type {Map<string, object>} modelName → meta */
const cache = new Map()

/** @type {Map<string, object>} tableName (camelCase IDB key) → meta */
const cacheByTable = new Map()

export const MetaCache = {
  /**
   * Populate the cache from all registered model schemas.
   * Call after all @ClientModel classes are imported and before bootstrap.
   */
  build() {
    cache.clear()
    cacheByTable.clear()

    for (const [modelName, schema] of Object.entries(ModelRegistry.schemas)) {
      if (schema.loadStrategy === LOAD_STRATEGY.LOCAL) continue

      const { singularName, pk } = GraphQLSchemaGenerator._resolveSchema(modelName)
      const mutations = GraphQLSchemaGenerator.generateMutationStrings(modelName)
      const queries = GraphQLSchemaGenerator.generateQueryStrings(modelName)

      const meta = {
        modelName,
        tableName: schema.tableName,
        singularName,
        pk,
        syncField: schema.syncField ?? null,
        create: mutations.create,
        update: mutations.update,
        delete: mutations.delete,
        fetch: queries.fetch.query,
        fetchVariableName: queries.fetch.variableName,
        fetchAll: queries.fetchAll.query,
        fetchAllOrderBy: queries.fetchAll.syncFieldOrderByDesc ?? null,
      }

      cache.set(modelName, meta)
      cacheByTable.set(schema.tableName, meta)

      // Postgres uses the singular form for uncountable-noun tables (e.g. the
      // real table is `equipment`), while the model/GraphQL layer uses the
      // forced plural (`equipments`, needed so PostGraphile's `equipments`
      // collection resolves). The socket 'sync' event carries the RAW postgres
      // table name, so socketSubscriber.getByTable('equipment') would miss the
      // 'equipments'-keyed entry and silently drop every equipment update.
      // Also index by the singular so those events resolve. Guard so a model
      // whose real table IS the singular still wins the primary key.
      const singularTable = pluralize.singular(schema.tableName)
      if (singularTable !== schema.tableName && !cacheByTable.has(singularTable)) {
        cacheByTable.set(singularTable, meta)
      }
    }
  },

  /**
   * @param {string} modelName
   * @returns {object|null}
   */
  get(modelName) {
    return cache.get(modelName) ?? null
  },

  /**
   * Look up by the camelCase IDB/table name (as used in IndexedDB store names).
   * @param {string} tableName
   * @returns {object|null}
   */
  getByTable(tableName) {
    return cacheByTable.get(tableName) ?? null
  },

  /** @returns {object[]} all metas for INSTANT/LAZY models */
  all() {
    return [...cache.values()]
  },
}
