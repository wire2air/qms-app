import { useLiveQuery } from './useLiveQuery'

/**
 * AI chat — live-queried list of the current user's chat threads, newest
 * first. Updates automatically when chat.turn writes a new thread or bumps
 * last_message_at on an existing one (audit → sync → IDB → live query).
 *
 * The query implicitly filters to the current user via RLS on the backend,
 * which gates what the syncEngine ever wrote to IDB in the first place.
 *
 * `kind` filters by the thread context's kind — kind-scoped surfaces (the
 * form builder's docked assistant) list only their own conversations.
 * Omitted → all threads (the global panel).
 */
export function useChatThreads({ kind = null } = {}) {
  return useLiveQuery(
    async (db) => {
      const rows = await db.AiChatThread.where().exec()
      return rows
        .filter((t) => !t.deletedAt)
        .filter((t) => (kind ? t.context?.kind === kind : true))
        .sort((a, b) => {
          const aT = (a.lastMessageAt ?? a.createdAt)?.toMillis?.() ?? 0
          const bT = (b.lastMessageAt ?? b.createdAt)?.toMillis?.() ?? 0
          return bT - aT
        })
    },
    { models: 'AiChatThread', initial: [] },
  )
}
