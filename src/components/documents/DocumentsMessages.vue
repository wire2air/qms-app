<script setup>
import { currentSession } from '@/utils/currentSession.js'
import {
  IconMessages,
  IconX,
  IconMessageCircle,
  IconTrash,
  IconSend,
  IconLoader2,
} from '@tabler/icons-vue'
import UserAvatarById from '../avatars/UserAvatarById.vue'

const props = defineProps({
  documentId: { type: String, required: true },
})

const model = defineModel({ type: Boolean, default: false })

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

watch(
  () => messages.value?.length,
  () => scrollToBottom(),
)

watch(model, (open) => {
  if (open) scrollToBottom()
})

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
  <!-- Backdrop -->
  <Transition name="fade">
    <div v-if="model" class="tw:fixed tw:inset-0 tw:bg-black/30 tw:z-overlay" @click="model = false" />
  </Transition>

  <!-- Sidebar Panel -->
  <Transition name="slide-right">
    <aside
      v-if="model"
      class="tw:fixed tw:top-0 tw:right-0 tw:h-full tw:w-100 tw:max-w-full tw:z-modal tw:flex! tw:flex-col tw:bg-sidebar tw:shadow-xl"
    >
      <!-- Header -->
      <div
        class="tw:flex tw:items-center tw:justify-between tw:px-4 tw:py-3 tw:border-b tw:border-divider"
      >
        <div class="tw:flex tw:items-center tw:gap-2">
          <IconMessages :size="22" class="tw:text-primary" />
          <span class="tw:text-base tw:font-semibold tw:text-on-main">Discussion</span>
        </div>
        <button
          type="button"
          class="tw:p-1.5 tw:rounded-lg tw:hover:bg-main-hover tw:transition-colors tw:text-on-main"
          @click="model = false"
        >
          <IconX :size="20" />
        </button>
      </div>

      <!-- Messages List -->
      <div
        ref="messagesContainer"
        class="tw:flex-1 tw:overflow-y-auto tw:px-4 tw:py-3 tw:space-y-4"
        :class="{ 'tw:flex tw:items-center tw:justify-center': messages.length === 0 }"
      >
        <!-- Loading -->
        <div v-if="loading" class="tw:flex tw:justify-center tw:py-8">
          <IconLoader2 :size="30" class="tw:animate-spin tw:text-primary" />
        </div>

        <!-- Empty State -->
        <div
          v-else-if="messages.length === 0"
          class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:py-12 tw:text-secondary"
        >
          <IconMessageCircle :size="48" class="tw:mb-2 tw:opacity-40" />
          <p class="tw:text-sm">No messages yet</p>
          <p class="tw:text-xs tw:mt-1">Start the conversation</p>
        </div>

        <!-- Message Bubbles -->
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
              class="tw:size-8 tw:shrink-0 tw:mt-1"
            />

            <div
              class="tw:max-w-[75%] tw:rounded-xl tw:px-3 tw:py-2"
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

            <!-- Delete own message -->
            <button
              v-if="msg.userId === currentUserId"
              type="button"
              class="tw:self-center tw:p-1 tw:rounded-lg tw:hover:bg-main-hover tw:transition-colors tw:opacity-0 tw:group-hover:opacity-100"
              @click="handleDelete(msg)"
            >
              <IconTrash :size="16" class="tw:text-secondary" />
            </button>
          </div>
        </template>
      </div>

      <!-- Input Area -->
      <div class="tw:border-t tw:border-divider tw:px-4 tw:py-3">
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
          <BaseButton
            variant="primary"
            :disabled="!newMessage.trim()"
            class="tw:p-2"
            @click="handleSend"
          >
            <IconSend :size="18" />
          </BaseButton>
        </div>
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.25s ease;
}
.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
}
</style>
