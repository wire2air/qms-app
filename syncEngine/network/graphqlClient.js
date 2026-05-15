/**
 * Main-thread GraphQL client.
 * Fires requests against /api/graphql using the session cookie (credentials: include).
 */

/**
 * Structured error thrown by graphqlRequest for both HTTP and GraphQL-level failures.
 */
export class GraphQLError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number|null, errors?: object[], code?: string|null, fields?: string[]|null }} [options]
   */
  constructor(message, { status = null, errors = [], code = null, fields = null } = {}) {
    super(message)
    this.name = 'GraphQLError'
    this.status = status
    this.errors = errors
    this.code = code
    this.fields = fields
  }
}

/**
 * Execute a GraphQL operation against /api/graphql.
 *
 * @param {string} query - GraphQL query or mutation string
 * @param {object} [variables]
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<object>} the `data` field from the response
 * @throws {GraphQLError} on network errors, HTTP errors, or GraphQL-level errors
 */
export async function graphqlRequest(query, variables, { signal } = {}) {
  let res
  try {
    res = await fetch('/api/graphql', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal,
    })
  } catch (err) {
    throw new GraphQLError(err?.message ?? 'Network error', { errors: [] })
  }

  if (!res.ok) {
    if (res.status === 401) {
      // Notify the app shell so it can redirect to the login screen
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('qms:auth-unauthorized'))
      }
    }
    throw new GraphQLError(`Request failed with status ${res.status}`, {
      status: res.status,
      errors: [],
    })
  }

  const json = await res.json()

  if (json.errors?.length) {
    const first = json.errors[0]
    const ext = first.extensions ?? {}
    throw new GraphQLError(first.message ?? 'GraphQL error', {
      status: res.status,
      errors: json.errors,
      code: ext.code ?? null,
      fields: ext.fields ?? null,
    })
  }

  return json.data
}
