<script setup>
/**
 * Chat — the document discussion thread, now a rail card (was a right-edge
 * slide-over "Discussion" drawer). Persistent alongside the other rail cards so
 * the conversation stays visible while working on the document. Backed by the
 * generic Comment model scoped to ['Document', documentId].
 */
import { currentSession } from '@/utils/currentSession.js'
import {
  IconMessages,
  IconMessageCircle,
  IconTrash,
  IconSend,
  IconLoader2,
} from '@tabler/icons-vue'
import UserAvatarById from '../avatars/UserAvatarById.vue'

const props = defineProps({
  documentId: { type: String, required: true },
})

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
    const comment = db.Comment.create({
      body,
      objectType: 'Document',
      objectId: props.documentId,
    })
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
  <BaseRailCard title="Chat" :icon="IconMessages">
    <div class="tw:flex tw:flex-col tw:gap-3">
      <!-- Messages -->
      <div
        ref="messagesContainer"
        class="tw:max-h-80 tw:overflow-y-auto tw:space-y-3 tw:pr-1"
      >
        <div v-if="loading" class="tw:flex tw:justify-center tw:py-6">
          <IconLoader2 :size="24" class="tw:animate-spin tw:text-primary" />
        </div>

        <div
          v-else-if="messages.length === 0"
          class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:py-8 tw:text-secondary"
        >
          <IconMessageCircle :size="36" class="tw:mb-2 tw:opacity-40" />
          <p class="tw:text-sm">No messages yet</p>
          <p class="tw:text-xs tw:mt-0.5">Start the conversation</p>
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

      <!-- Composer -->
      <div class="tw:flex tw:items-end tw:gap-2 tw:border-t tw:border-divider tw:pt-3">
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
