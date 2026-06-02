// ─────────────────────────────────────────────────────────────────────────────
// sync-engine — TypeScript definitions
// ─────────────────────────────────────────────────────────────────────────────

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type LoadStrategy = 'instant' | 'lazy' | 'partial' | 'explicitlyRequested' | 'local'

export type OperationType = 'create' | 'update' | 'delete'

export const OPERATION: {
  readonly CREATE: 'create'
  readonly UPDATE: 'update'
  readonly DELETE: 'delete'
}

export interface Serializer<T = unknown> {
  toStore(value: T): unknown
  fromStore(raw: unknown): T
}

export interface PropertyMeta {
  name: string
  type: 'property' | 'reference' | 'referenceModel'
  options: Record<string, unknown>
}

export interface SchemaEntry {
  schemaHash: string
  loadStrategy: LoadStrategy
  properties: PropertyMeta[]
  primaryKey: string
  syncField?: string
  tableName: string
}

// ---------------------------------------------------------------------------
// ModelRegistry
// ---------------------------------------------------------------------------

export declare const ModelRegistry: {
  modelLookup: Record<string, new (...args: unknown[]) => unknown>
  schemas: Record<string, SchemaEntry>

  register(
    name: string,
    constructor: new (...args: unknown[]) => unknown,
    properties: PropertyMeta[],
    loadStrategy?: LoadStrategy,
    schemaVersion?: number,
    indexes?: Array<{ type: string; field?: string; fields?: string[] }>,
    primaryKey?: string,
    syncField?: string,
    tableName?: string,
  ): void

  getSchema(name: string): SchemaEntry | null
  getConstructor(name: string): (new (...args: unknown[]) => unknown) | null
}

// ---------------------------------------------------------------------------
// ObjectPool
// ---------------------------------------------------------------------------

export declare const ObjectPool: {
  /** Register an instance so getters can resolve it. */
  register(modelName: string, id: unknown, instance: object): void

  /** Remove a previously registered instance. */
  unregister(modelName: string, id: unknown): void

  /** Resolve an instance by modelName + id. Returns null if not found. */
  get(modelName: string, id: unknown): object | null

  /** Clear the pool, optionally scoped to one model. */
  clear(modelName?: string): void
}

// ---------------------------------------------------------------------------
// QueryBuilder
// ---------------------------------------------------------------------------

export declare class QueryBuilder<M extends BaseModel = BaseModel> {
  constructor(
    modelName: string,
    indexField?: string,
    indexValue?: unknown,
    paranoid?: boolean | string,
  )

  /**
   * Add an in-memory filter condition.
   * @param field — field name to match
   * @param value — equality value, array of values (IN-style), or predicate function
   *
   * @example
   * Issue.where('status', 'open').where('priority', v => v > 3).exec()
   * Issue.where('status', ['open', 'in_progress']).exec()  // IN-style
   */
  where(field: string, value: unknown | unknown[] | ((v: unknown) => boolean)): this
  orderBy(field: string, direction?: 'asc' | 'desc' | ((a: unknown, b: unknown) => number)): this
  sortBy(field: string, direction?: 'asc' | 'desc' | ((a: unknown, b: unknown) => number)): this
  limit(n: number): this
  offset(n: number): this

  exec(): Promise<M[]>
  first(): Promise<M | null>
  last(): Promise<M | null>
}

// ---------------------------------------------------------------------------
// BaseModel
// ---------------------------------------------------------------------------

export declare class BaseModel {
  /** Returns the current action for this instance. */
  get action(): OperationType

  /**
   * Validate properties and persist the instance through the installed save
   * strategy. For UPDATE actions, the strategy diffs the in-memory instance
   * against the latest persisted IDB row and skips the network request when
   * nothing has changed.
   */
  save(): Promise<void>

  /**
   * Mark this instance for deletion. Sets action to 'delete' so save() will
   * queue a delete operation.
   */
  delete(): Promise<void>

  /** Restore a soft-deleted instance by clearing the paranoid field. */
  restore(): Promise<void>

  /** Permanently delete this instance, bypassing paranoid soft-delete. */
  hardDelete(): Promise<void>

  /** Validate all @Property fields against their declared type and required constraint. */
  _validateProperties(): void

  /**
   * Create a new instance of this model class.
   * Sets action to 'create' so save() will queue a create operation.
   *
   * @param object - Initial property values (partial of the model instance)
   * @returns The created instance, registered in ObjectPool
   *
   * @example
   * const user = User.create({ name: 'John', age: 30 });
   */
  static create<T extends typeof BaseModel>(
    this: T,
    object: Partial<InstanceType<T>>,
  ): InstanceType<T>

  /**
   * Find a model instance by primary key.
   * @param id - The primary key value
   * @returns Promise resolving to the model instance or null
   */
  static findByPk<T extends typeof BaseModel>(
    this: T,
    id: unknown,
    options?: { force?: boolean },
  ): Promise<InstanceType<T> | null>

  /**
   * Create a QueryBuilder for filtering instances.
   * @param indexField — optional indexed field name (or compound bracket syntax)
   * @param indexValue — value to look up via the index
   * @returns QueryBuilder typed to the calling class
   *
   * @example
   * Issue.where('status', 'open').exec()                     // indexed lookup
   * Issue.where('[status+priority]', ['open', 1]).exec()      // compound index
   * Issue.where('[status+priority]', [['open', 1], ['open', 2]]).exec()      // multiple compound index
   * Issue.where().where('name', 'foo').exec()                 // full scan + filter
   */
  static where<T extends typeof BaseModel>(
    this: T,
    indexField?: string,
    indexValue?: unknown,
    options?: { force?: boolean },
  ): QueryBuilder<InstanceType<T>>
}

/**
 * Error thrown when @Property validation fails during validateProperties().
 */
export declare class ValidationError extends Error {
  errors: Array<{ field: string; message: string }>
  constructor(errors: Array<{ field: string; message: string }>)
}

// ---------------------------------------------------------------------------
// @ClientModel
// ---------------------------------------------------------------------------

export interface ClientModelOptions {
  loadStrategy?: LoadStrategy
  schemaVersion?: number
  primaryKey?: string
  syncField?: string
  customIndex?: string
}

/**
 * Class decorator. Registers the class in ModelRegistry once all field/method
 * decorators have collected their metadata.
 *
 * @example
 * @ClientModel("users")
 * class User extends BaseModel { ... }
 *
 * @ClientModel("users", { loadStrategy: "lazy" })
 * class User extends BaseModel { ... }
 */
export declare function ClientModel(tableName: string, options?: ClientModelOptions): ClassDecorator

// ---------------------------------------------------------------------------
// @Property
// ---------------------------------------------------------------------------

export interface PropertyOptions {
  /** Built-in type constructor (String, Number, Boolean, Date) or custom class constructor. Required. */
  type: new (...args: unknown[]) => unknown
  /** When true, field value cannot be null/undefined/empty string. Default: false */
  required?: boolean
  timestamp?: boolean
  autoUpdate?: boolean
  serializer?: Serializer
  uuid?: boolean
  excludeFromGraphQL?: Array<string>
}

/**
 * Field decorator for plain owned/scalar fields.
 * Wraps the field in a MobX observable box and tracks mutations for save().
 *
 * @example
 * @Property({ type: String })
 * title = '';
 *
 * @Property({ type: Number })
 * priority = 0;
 *
 * @Property({ type: Date, required: true })
 * createdAt: Date | null = null;
 */
export declare function Property(
  options?: PropertyOptions,
): (target: undefined, context: ClassFieldDecoratorContext) => void

// ---------------------------------------------------------------------------
// @Computed
// ---------------------------------------------------------------------------

/**
 * Getter decorator. Memoises the accessor using a per-instance MobX computed.
 * The value is never stored in IndexedDB and never generates transactions.
 *
 * @example
 * @Computed
 * get parents(): Issue[] { ... }
 */
export declare function Computed(
  target: Function,
  context: ClassGetterDecoratorContext,
): () => unknown

// ---------------------------------------------------------------------------
// Persistence layer
// ---------------------------------------------------------------------------

export interface TransactionQueueEntry {
  id: string
  modelName: string
  modelId: unknown
  changes: Record<string, unknown>
  newValues: Record<string, unknown>
  action: OperationType
  status: 'pending' | 'synced'
  createdAt: number
}

export declare const TransactionQueue: {
  append(
    modelName: string,
    modelId: unknown,
    changes: Record<string, unknown>,
    newValues: Record<string, unknown>,
    action?: OperationType,
  ): Promise<string>
  getPending(): Promise<unknown[]>
  markSynced(id: string): Promise<void>
  getById(id: string): Promise<TransactionQueueEntry | null>
}

export declare const IndexedDB: {
  _db: IDBDatabase | null
  init(dbName?: string): Promise<IDBDatabase>
  put(modelName: string, record: Record<string, unknown>): Promise<Record<string, unknown>>
  bulkPut(modelName: string, records: Record<string, unknown>[]): Promise<Record<string, unknown>[]>
  get(modelName: string, id: unknown): Promise<Record<string, unknown> | null>
  getAll(modelName: string): Promise<Record<string, unknown>[]>
  delete(modelName: string, id: unknown): Promise<void>
  getByIndex(
    modelName: string,
    indexName: string,
    value: unknown,
  ): Promise<Record<string, unknown>[]>
  getByIndexMulti(
    modelName: string,
    indexName: string,
    values: unknown[],
  ): Promise<Record<string, unknown>[]>
}

/**
 * Hydrate a single model instance from IndexedDB.
 * @param modelName - The registered model name
 * @param id - The model instance id
 * @param [overrides] - Partial field values to apply after hydration
 */
export declare function hydrate(
  modelName: string,
  id: unknown,
  overrides?: Record<string, unknown>,
): Promise<BaseModel | null>

/**
 * Hydrate all instances of a model from IndexedDB.
 * @param modelName - The registered model name
 */
export declare function hydrateAll(modelName: string): Promise<BaseModel[]>

/**
 * Initialize the persistence layer.
 * Call once at app startup, after all @ClientModel classes are defined.
 * @param options
 * @param options.dbName - IndexedDB database name (default: 'syncEngineDB')
 * @param options.socketUrl - Socket.IO server URL for real-time sync
 * @param options.graphqlUrl - GraphQL server URL for outgoing sync
 * @param options.graphQLWorkerIntervalMs - GraphQL worker poll interval (default: 5000)
 * @param options.graphqlClientOptions - Options passed to createGraphQLClient
 * @returns Promise resolving to the IDBDatabase
 */
export declare function install(options?: {
  dbName?: string
  socketUrl?: string
  graphqlUrl?: string
  graphQLWorkerIntervalMs?: number
  graphqlClientOptions?: Record<string, unknown>
}): Promise<IDBDatabase>

/**
 * Get the Socket.IO socket instance.
 */
export declare function getSocket(): unknown

/**
 * Disconnect the Socket.IO connection.
 */
export declare function disconnectSocket(): void

// ---------------------------------------------------------------------------
// GraphQL Network Layer
// ---------------------------------------------------------------------------

export interface GraphQLClient {
  client: unknown
  request(document: unknown, variables?: Record<string, unknown>): Promise<unknown>
}

export interface GraphQLClientOptions {
  headers?: Record<string, string>
  onError?: (error: Error) => void
}

export declare function createGraphQLClient(
  url: string,
  options?: GraphQLClientOptions,
): GraphQLClient

export declare class GraphQLWorker {
  constructor(
    client: GraphQLClient,
    options?: {
      intervalMs?: number
      onError?: (error: Error) => void
      onFlush?: (entry: unknown) => void
    },
  )
  start(): void
  stop(): void
}

export declare const GraphQLSchemaGenerator: {
  generateUpsertMutation(modelName: string): { mutation: string; variableName: string }
  generateFetchQuery(modelName: string): { query: string; variableName: string }
  generateFetchAllQuery(modelName: string): { query: string }
}

/**
 * Get the Graffle GraphQL client instance.
 */
export declare function getGraphQLClient(): GraphQLClient | null

/**
 * Get the GraphQL worker instance.
 */
export declare function getGraphQLWorker(): GraphQLWorker | null
