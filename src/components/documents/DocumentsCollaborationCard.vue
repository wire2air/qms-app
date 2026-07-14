<script setup>
/**
 * Collaborators + Chat, combined into one rail section.
 *
 * - Collaborator management (add/remove) is shown to editors.
 * - The chat only appears once there is at least one collaborator — with no
 *   collaborators there's no one to talk to, so the composer/thread stays
 *   hidden.
 *
 * Collaborator candidates exclude the current user and the document owner /
 * author (none of whom are "collaborators"). Adding a collaborator raises a
 * REVIEW task + notification (backend side-effect); each chat message notifies
 * every collaborator + owner + author (minus the sender).
 */
import { currentSession } from '@/utils/currentSession.js'
import {
  IconUsersGroup,
  IconPlus,
  IconMessageCircle,
  IconTrash,
  IconSend,
  IconLoader2,
  IconInfoCircle,
} from '@tabler/icons-vue'
import UserAvatarById from '../avatars/UserAvatarById.vue'

const props = defineProps({
  documentId: { type: String, required: true },
  canEdit: { type: Boolean, default: false },
})

// ── Collaborators ──────────────────────────────────────────────────────────
const isUpdating = ref(false)

const document = useLiveQueryWithDeps(
  [() => props.documentId],
  async (db, [id]) => (id ? db.Document.findByPk(id) : null),
  { models: ['Document'], initial: null },
)

const allUsers = useLiveQueryWithDeps(
  [() => document.value?.userId, () => document.value?.authorId],
  async (db, [ownerId, authorId]) => {
    const excluded = new Set([currentSession.value?.userId, ownerId, authorId].filter(Boolean))
    return (await db.User.where().exec()).filter(
      (u) => u.userStatusId === 'ACTIVE' && !excluded.has(u.id),
    )
  },
  { models: ['User'], initial: [] },
)

const collaboratorRecords = useLiveQueryWithDeps(
  [() => props.documentId],
  async (db, [documentId]) => {
    const records = await db.UserOnDocument.where().exec()
    return records.filter((r) => r.documentId === documentId && !r.deletedAt)
  },
  { models: ['UserOnDocument'], initial: [] },
)

const collaboratorUserIds = computed(() => collaboratorRecords.value.map((r) => r.userId))
const usersById = computed(() => {
  const map = {}
  for (const u of allUsers.value) map[u.id] = u
  return map
})
const collaborators = computed(() =>
  collaboratorRecords.value.map((r) => ({ ...r, user: usersById.value[r.userId] })),
)
const hasCollaborators = computed(() => collaborators.value.length > 0)

const addCollaborator = useLiveMutation(async (db, userId) => {
  const record = db.UserOnDocument.create({ documentId: props.documentId, userId })
  await record.save()
  return record
})

async function toggleCollaborator(userId) {
  if (isUpdating.value) return
  isUpdating.value = true
  try {
    if (collaboratorUserIds.value.includes(userId)) {
      const record = collaboratorRecords.value.find((r) => r.userId === userId)
      if (record) await record.delete()
    } else {
      await addCollaborator(userId)
    }
  } finally {
    isUpdating.value = false
  }
}

// ── Chat ────────────────────────────────────────────────────────────────────
const messages = useLiveQueryWithDeps(
  [() => props.documentId],
  async (db, [id]) =>
    db.Comment.where('[objectType+objectId]', ['Document', id])
      .orderBy('createdAt', (a, b) => new Date(a) - new Date(b))
      .exec(),
  { models: ['Comment'], initial: [] },
)

const loading = computed(() => messages.value === undefined)
const newMessage = ref('')
const messagesContainer = ref(null)
const currentUserId = computed(() => currentSession.value?.userId)

function scrollToBottom() {
  nextTick(() => {
    const el = messagesContainer.value
    if (el) el.scrollTop = el.scrollHeight
  })
}
watch(() => messages.value?.length, () => scrollToBottom())

async function handleSend() {
  const body = newMessage.value.trim()
  if (!body) return
  newMessage.value = ''
  const send = useLiveMutation(async (db) => {
    const comment = db.Comment.create({ body, objectType: 'Document', objectId: props.documentId })
    await comment.save()
  })
  await send()
  scrollToBottom()
}

async function handleDelete(msg) {
  await msg.delete()
}
</script>

<template>
  <BaseRailCard v-if="canEdit || hasCollaborators" title="Collaboration" :icon="IconUsersGroup">
    <!-- Collaborator management -->
    <div class="tw:flex tw:items-center tw:gap-2">
      <BaseTooltip
        content="Invite co-authors to contribute to this draft. Each collaborator gets a task and email notification, and you can discuss changes in the chat below before submitting for review."
        placement="bottom"
      >
        <IconInfoCircle :size="15" class="tw:text-secondary tw:cursor-help tw:shrink-0" />
      </BaseTooltip>
      <div v-if="hasCollaborators" class="tw:flex tw:-space-x-2">
        <UserAvatar
          v-for="collab in collaborators"
          :key="collab.userId"
          :user="collab.user"
          class="tw:size-8"
        />
      </div>
      <span v-else class="tw:text-xs tw:text-secondary">No collaborators yet</span>

      <BasePopover v-if="canEdit" placement="bottom-end" :arrow="false" class="tw:ml-auto">
        <template #button>
          <button
            type="button"
            aria-label="Add collaborator"
            class="tw:flex tw:items-center tw:gap-1 tw:px-2 tw:h-7 tw:rounded-md tw:hover:bg-sidebar-hover tw:text-secondary tw:text-xs tw:font-medium tw:transition-colors"
          >
            <IconPlus :size="14" /> Add
          </button>
        </template>
        <template #content>
          <div
            class="tw:w-72 tw:max-w-[90vw] tw:bg-card tw:rounded-xl tw:border tw:border-divider tw:shadow-floating tw:max-h-56 tw:overflow-y-auto tw:p-1"
          >
            <button
              v-for="user in allUsers"
              :key="user.id"
              class="tw:w-full tw:flex tw:items-center tw:gap-3 tw:px-3 tw:py-2 tw:rounded-lg tw:transition-colors tw:text-left"
              :class="
                collaboratorUserIds.includes(user.id) ? 'tw:bg-primary/10' : 'tw:hover:bg-sidebar-hover'
              "
              @click.stop="toggleCollaborator(user.id)"
            >
              <UserAvatar :user="user" class="tw:size-7 tw:shrink-0" />
              <div class="tw:flex-1 tw:min-w-0">
                <p class="tw:text-sm tw:font-medium tw:text-on-sidebar tw:truncate">
                  {{ user.firstName }} {{ user.lastName }}
                </p>
                <p class="tw:text-xs tw:text-secondary tw:truncate">{{ user.email }}</p>
              </div>
              <div
                v-if="collaboratorUserIds.includes(user.id)"
                class="tw:w-1.5 tw:h-1.5 tw:rounded-full tw:bg-primary tw:shrink-0"
              />
            </button>
            <div
              v-if="allUsers.length === 0"
              class="tw:px-4 tw:py-6 tw:text-center tw:text-secondary tw:text-sm"
            >
              No users found
            </div>
          </div>
        </template>
      </BasePopover>
    </div>

    <!-- Chat — only once there's someone to talk to -->
    <p v-if="!hasCollaborators" class="tw:text-xs tw:text-secondary">
      Add a collaborator to start a conversation.
    </p>
    <div v-else class="tw:flex tw:flex-col tw:gap-3 tw:border-t tw:border-divider tw:pt-3">
      <div ref="messagesContainer" class="tw:max-h-80 tw:overflow-y-auto tw:space-y-3 tw:pr-1">
        <div v-if="loading" class="tw:flex tw:justify-center tw:py-6">
          <IconLoader2 :size="24" class="tw:animate-spin tw:text-primary" />
        </div>
        <div
          v-else-if="messages.length === 0"
          class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:py-6 tw:text-secondary"
        >
          <IconMessageCircle :size="32" class="tw:mb-2 tw:opacity-40" />
          <p class="tw:text-sm">No messages yet</p>
        </div>
        <template v-else>
          <div
            v-for="msg in messages"
            :key="msg.id"
            class="tw:group tw:flex tw:gap-2"
            :class="msg.userId === currentUserId ? 'tw:flex-row-reverse' : 'tw:flex-row'"
          >
            <UserAvatarById
              v-if="msg.userId !== currentUserId"
              :userId="msg.userId"
              class="tw:size-7 tw:shrink-0 tw:mt-1"
            />
            <div
              class="tw:max-w-[80%] tw:rounded-xl tw:px-3 tw:py-2"
              :class="
                msg.userId === currentUserId
                  ? 'tw:bg-primary tw:text-white tw:rounded-tr-sm'
                  : 'tw:bg-gray-100 tw:text-on-main tw:rounded-tl-sm'
              "
            >
              <div
                v-if="msg.userId !== currentUserId && msg.user"
                class="tw:text-xs tw:font-semibold tw:mb-0.5 tw:text-primary"
              >
                {{ msg.user.firstName }} {{ msg.user.lastName }}
              </div>
              <p class="tw:text-sm tw:whitespace-pre-wrap tw:wrap-break-word tw:m-0">
                {{ msg.body }}
              </p>
              <div
                class="tw:text-micro tw:mt-1 tw:text-right"
                :class="msg.userId === currentUserId ? 'tw:text-white/60' : 'tw:text-secondary'"
              >
                {{ msg.createdAt?.formatDate?.('datetime') || '' }}
              </div>
            </div>
            <button
              v-if="msg.userId === currentUserId"
              type="button"
              class="tw:self-center tw:p-1 tw:rounded-lg tw:hover:bg-main-hover tw:transition-colors tw:opacity-0 tw:group-hover:opacity-100"
              @click="handleDelete(msg)"
            >
              <IconTrash :size="14" class="tw:text-secondary" />
            </button>
          </div>
        </template>
      </div>

      <div class="tw:flex tw:items-end tw:gap-2">
        <textarea
          v-model="newMessage"
          maxlength="2000"
          placeholder="Type a message..."
          rows="2"
          class="tw:flex-1 tw:px-3 tw:py-2 tw:border tw:border-divider tw:rounded-lg tw:bg-input tw:text-on-main tw:text-sm tw:placeholder-secondary tw:resize-none tw:focus:outline-none tw:focus:border-primary tw:transition-colors"
          style="max-height: 120px"
          @keydown.enter.exact.prevent="handleSend"
        />
        <BaseButton variant="primary" :disabled="!newMessage.trim()" class="tw:p-2" @click="handleSend">
          <IconSend :size="18" />
        </BaseButton>
      </div>
    </div>
  </BaseRailCard>
</template>
