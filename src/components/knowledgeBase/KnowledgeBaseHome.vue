<script setup>
import {
  IconBook,
  IconPlus,
  IconEdit,
  IconTrash,
  IconEye,
  IconEyeOff,
  IconGripVertical,
} from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { post, patch, del } from '@/api'

const toast = useToast()

const canWrite = computed(() => isAllowed(['knowledgeBase:write']))

const articles = useLiveQuery((db) =>
  db.KnowledgeBaseArticle.where()
    .orderBy('displayOrder', 'asc')
    .exec(),
  { initial: [] },
)

const categoryOptions = computed(() => {
  const cats = new Set(articles.value.map((a) => a.category).filter(Boolean))
  return [...cats].sort()
})

const filterCategory = ref(null)
const filterPublished = ref(null)

const filtered = computed(() => {
  let list = articles.value
  if (filterCategory.value) list = list.filter((a) => a.category === filterCategory.value)
  if (filterPublished.value === 'published') list = list.filter((a) => a.isPublished)
  if (filterPublished.value === 'draft') list = list.filter((a) => !a.isPublished)
  return list
})

const showDialog = ref(false)
const editingArticle = ref(null)

const form = ref({ title: '', body: '', category: '', isPublished: false, displayOrder: 0 })
const saving = ref(false)

function openCreate() {
  editingArticle.value = null
  form.value = { title: '', body: '', category: '', isPublished: false, displayOrder: articles.value.length * 10 }
  showDialog.value = true
}

function openEdit(article) {
  editingArticle.value = article
  form.value = {
    title: article.title,
    body: article.body,
    category: article.category || '',
    isPublished: article.isPublished,
    displayOrder: article.displayOrder,
  }
  showDialog.value = true
}

async function saveArticle() {
  if (!form.value.title.trim()) {
    toast.notify({ type: 'negative', message: 'Title is required' })
    return
  }
  saving.value = true
  try {
    const payload = {
      title: form.value.title.trim(),
      body: form.value.body,
      category: form.value.category.trim() || null,
      isPublished: form.value.isPublished,
      displayOrder: form.value.displayOrder,
    }

    if (editingArticle.value) {
      // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
      await patch(`/v1/services/knowledgeBase/articles/${editingArticle.value.id}`, payload)
      toast.notify({ type: 'positive', message: 'Article updated' })
    } else {
      // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
      await post('/v1/services/knowledgeBase/articles', payload)
      toast.notify({ type: 'positive', message: 'Article created' })
    }

    showDialog.value = false
  } catch (err) {
    toast.notify({ type: 'negative', message: err?.message || 'Failed to save' })
  } finally {
    saving.value = false
  }
}

async function togglePublished(article) {
  try {
    // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
    await patch(`/v1/services/knowledgeBase/articles/${article.id}`, {
      isPublished: !article.isPublished,
    })
    toast.notify({
      type: 'positive',
      message: article.isPublished ? 'Article unpublished' : 'Article published',
    })
  } catch (err) {
    toast.notify({ type: 'negative', message: err?.message || 'Failed to update' })
  }
}

const showDeleteDialog = ref(false)
const deletingArticle = ref(null)
const deleting = ref(false)

function confirmDelete(article) {
  deletingArticle.value = article
  showDeleteDialog.value = true
}

async function handleDelete() {
  if (!deletingArticle.value) return
  deleting.value = true
  try {
    // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
    await del(`/v1/services/knowledgeBase/articles/${deletingArticle.value.id}`)
    toast.notify({ type: 'positive', message: 'Article deleted' })
    showDeleteDialog.value = false
    deletingArticle.value = null
  } catch (err) {
    toast.notify({ type: 'negative', message: err?.message || 'Failed to delete' })
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3 tw:h-full tw:p-5">
    <SafeTeleport to="#main-header-title">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
        <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-nowrap">Knowledge Base</h2>
      </div>
    </SafeTeleport>

    <SafeTeleport to="#main-header-actions">
      <BaseButton v-if="canWrite" variant="primary" @click="openCreate">
        <template #icon><IconPlus :size="16" /></template>
        New article
      </BaseButton>
    </SafeTeleport>

    <div class="tw:flex tw:flex-col tw:gap-1">
      <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Knowledge Base</div>
      <div class="tw:text-sm tw:text-secondary">
        Articles shown to customers in the chat widget and public support portal. Published articles
        are visible; drafts are only visible to agents.
      </div>
    </div>

    <!-- Stats -->
    <div class="tw:grid tw:grid-cols-2 tw:md:grid-cols-3 tw:gap-3">
      <div class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:items-center tw:gap-4">
        <div class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-blue-50 tw:text-blue-600 tw:flex tw:items-center tw:justify-center tw:shrink-0">
          <IconBook :size="20" />
        </div>
        <div>
          <div class="tw:text-xs tw:uppercase tw:tracking-tight tw:font-bold tw:text-secondary">Total articles</div>
          <div class="tw:text-2xl tw:font-black tw:text-on-sidebar">{{ articles.length }}</div>
        </div>
      </div>
      <div class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:items-center tw:gap-4">
        <div class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-green-50 tw:text-green-600 tw:flex tw:items-center tw:justify-center tw:shrink-0">
          <IconEye :size="20" />
        </div>
        <div>
          <div class="tw:text-xs tw:uppercase tw:tracking-tight tw:font-bold tw:text-secondary">Published</div>
          <div class="tw:text-2xl tw:font-black tw:text-on-sidebar">{{ articles.filter(a => a.isPublished).length }}</div>
        </div>
      </div>
      <div class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:items-center tw:gap-4">
        <div class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-amber-50 tw:text-amber-600 tw:flex tw:items-center tw:justify-center tw:shrink-0">
          <IconEyeOff :size="20" />
        </div>
        <div>
          <div class="tw:text-xs tw:uppercase tw:tracking-tight tw:font-bold tw:text-secondary">Drafts</div>
          <div class="tw:text-2xl tw:font-black tw:text-on-sidebar">{{ articles.filter(a => !a.isPublished).length }}</div>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
      <BaseSelectMenu
        v-model="filterPublished"
        :items="[{ id: null, name: 'All' }, { id: 'published', name: 'Published' }, { id: 'draft', name: 'Drafts' }]"
        :required="false"
        class="tw:w-36"
      >
        <template #button>
          <span class="tw:text-sm tw:font-medium tw:text-on-main">
            {{ filterPublished ? (filterPublished === 'published' ? 'Published' : 'Drafts') : 'All statuses' }}
          </span>
        </template>
      </BaseSelectMenu>
      <BaseSelectMenu
        v-if="categoryOptions.length"
        v-model="filterCategory"
        :items="[{ id: null, name: 'All categories' }, ...categoryOptions.map(c => ({ id: c, name: c }))]"
        :required="false"
        class="tw:w-44"
      >
        <template #button>
          <span class="tw:text-sm tw:font-medium tw:text-on-main">
            {{ filterCategory || 'All categories' }}
          </span>
        </template>
      </BaseSelectMenu>
    </div>

    <!-- Article list -->
    <div v-if="!filtered.length" class="tw:text-sm tw:text-secondary tw:italic tw:py-12 tw:text-center">
      No articles yet. Create your first to help customers self-serve.
    </div>

    <div v-else class="tw:flex tw:flex-col tw:gap-2">
      <div
        v-for="article in filtered"
        :key="article.id"
        class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4 tw:flex tw:items-start tw:gap-3"
      >
        <IconGripVertical :size="18" class="tw:text-secondary tw:mt-0.5 tw:shrink-0 tw:cursor-grab" />

        <div class="tw:flex-1 tw:min-w-0">
          <div class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
            <span class="tw:font-semibold tw:text-on-sidebar tw:text-sm">{{ article.title }}</span>
            <span
              v-if="article.isPublished"
              class="tw:text-xs tw:bg-green-100 tw:text-green-700 tw:rounded-full tw:px-2 tw:py-0.5 tw:font-medium"
            >
              Published
            </span>
            <span
              v-else
              class="tw:text-xs tw:bg-amber-100 tw:text-amber-700 tw:rounded-full tw:px-2 tw:py-0.5 tw:font-medium"
            >
              Draft
            </span>
            <span
              v-if="article.category"
              class="tw:text-xs tw:bg-gray-100 tw:text-gray-600 tw:rounded-full tw:px-2 tw:py-0.5"
            >
              {{ article.category }}
            </span>
          </div>
          <p class="tw:text-sm tw:text-secondary tw:mt-1 tw:line-clamp-2 tw:whitespace-pre-wrap">
            {{ article.body || '(no content)' }}
          </p>
        </div>

        <div v-if="canWrite" class="tw:flex tw:items-center tw:gap-1 tw:shrink-0">
          <button
            class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:text-primary tw:hover:bg-main-hover tw:transition-colors tw:border-0 tw:bg-transparent tw:cursor-pointer"
            :title="article.isPublished ? 'Unpublish' : 'Publish'"
            @click="togglePublished(article)"
          >
            <IconEye v-if="!article.isPublished" :size="16" />
            <IconEyeOff v-else :size="16" />
          </button>
          <button
            class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:text-primary tw:hover:bg-main-hover tw:transition-colors tw:border-0 tw:bg-transparent tw:cursor-pointer"
            title="Edit"
            @click="openEdit(article)"
          >
            <IconEdit :size="16" />
          </button>
          <button
            class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:text-red-600 tw:hover:bg-red-50 tw:transition-colors tw:border-0 tw:bg-transparent tw:cursor-pointer"
            title="Delete"
            @click="confirmDelete(article)"
          >
            <IconTrash :size="16" />
          </button>
        </div>
      </div>
    </div>

    <!-- Create / Edit dialog -->
    <BaseDialog
      v-model="showDialog"
      :title="editingArticle ? 'Edit article' : 'New article'"
    >
      <div class="tw:flex tw:flex-col tw:gap-4">
        <div class="tw:flex tw:flex-col tw:gap-1">
          <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider">Title *</label>
          <BaseTextInput v-model="form.title" placeholder="e.g. How do I return a product?" />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-1">
          <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider">Category</label>
          <BaseTextInput v-model="form.category" placeholder="e.g. Returns, Shipping, Technical" />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-1">
          <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider">Content</label>
          <BaseTextarea v-model="form.body" rows="8" placeholder="Write the article content here…" />
        </div>
        <div class="tw:flex tw:items-center tw:gap-2">
          <input
            id="is-published"
            v-model="form.isPublished"
            type="checkbox"
            class="tw:w-4 tw:h-4 tw:accent-primary"
          />
          <label for="is-published" class="tw:text-sm tw:text-on-main tw:cursor-pointer">
            Publish immediately (visible in chat widget and public portal)
          </label>
        </div>
      </div>

      <template #footer>
        <BaseButton variant="outline" :disabled="saving" @click="showDialog = false">Cancel</BaseButton>
        <BaseButton variant="primary" :loading="saving" @click="saveArticle">
          {{ editingArticle ? 'Save changes' : 'Create article' }}
        </BaseButton>
      </template>
    </BaseDialog>

    <!-- Delete confirmation dialog -->
    <BaseDialog v-model="showDeleteDialog" title="Delete article?">
      <div class="tw:text-sm tw:text-on-main">
        "<strong>{{ deletingArticle?.title }}</strong>" will be permanently removed.
      </div>
      <template #footer>
        <BaseButton variant="outline" :disabled="deleting" @click="showDeleteDialog = false">Cancel</BaseButton>
        <BaseButton variant="danger" :loading="deleting" @click="handleDelete">Delete</BaseButton>
      </template>
    </BaseDialog>
  </div>
</template>
