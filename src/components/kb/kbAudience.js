/**
 * Who an article (or folder) is for (docs/plans/knowledge-base-phase2-5.md §1):
 *   PUBLIC     anyone: the public help center, and product apps
 *   CUSTOMERS  signed-in users of a product (QAbility, TextImpact…), read by
 *              that product through an API token; never the public help center
 *   AGENTS     support agents, in the desk only
 */
export const KB_AUDIENCES = ['PUBLIC', 'CUSTOMERS', 'AGENTS']

export const AUDIENCE_OPTIONS = [
  { value: 'PUBLIC', label: 'Public' },
  { value: 'CUSTOMERS', label: 'Signed-in customers' },
  { value: 'AGENTS', label: 'Agents only' },
]
export const AUDIENCE_SHORT = { PUBLIC: 'Public', CUSTOMERS: 'Customers', AGENTS: 'Agents only' }
export const AUDIENCE_LABEL = {
  PUBLIC: 'Public',
  CUSTOMERS: 'Signed-in customers',
  AGENTS: 'Agents only',
}
export const AUDIENCE_HELP = {
  PUBLIC: 'On the public help center, once published, and in product apps.',
  CUSTOMERS:
    'For signed-in users of your product (e.g. the QAbility dashboard), read through an API token. Never on the public help center.',
  AGENTS: 'Internal: only agents, in the desk. Never on the help center or in products.',
}
export const AUDIENCE_TYPE = {
  PUBLIC: 'Public article',
  CUSTOMERS: 'Customer article',
  AGENTS: 'Internal article',
}
