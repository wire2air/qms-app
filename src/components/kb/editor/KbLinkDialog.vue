<script setup>
import {
  IconWorld,
  IconFileText,
  IconHash,
  IconMail,
  IconPhone,
  IconSearch,
} from '@tabler/icons-vue'
import { kbArticleHref, parseKbArticleHref } from './kbMarkdownDoc.js'

const props = defineProps({
  initialHref: { type: String, default: '' },
  initialText: { type: String, default: '' },
  /** Whether there is selected text (then "Text" is not asked). */
  hasSelection: { type: Boolean, default: false },
  articles: { type: Array, default: () => [] },
  headings: { type: Array, default: () => [] },
})
const emit = defineEmits(['submit', 'remove'])
/**
 * Insert or edit a link, as in Zendesk's editor: a web address, another
 * article of this knowledge base (optionally a heading in it), a heading of
 * this article, an email address or a phone number.
 *
 * Article links are saved as kb-article:<id>, so they keep working when the
 * other article is renamed or moved. Web links open in a new tab on the help
 * center; links inside the help center stay in the tab.
 */
const open = defineModel({ type: Boolean, default: false })
const tab = ref('url')
const text = ref('')
const url = ref('')
const email = ref('')
const phone = ref('')
const articleId = ref('')
const articleAnchor = ref('')
const heading = ref('')
const search = ref('')
const error = ref('')

watch(open, (v) => {
  if (!v) return
  error.value = ''
  search.value = ''
  text.value = props.initialText
  url.value = email.value = phone.value = articleId.value = articleAnchor.value = heading.value = ''
  const h = props.initialHref
  const art = parseKbArticleHref(h)
  if (art) {
    tab.value = 'article'
    articleId.value = art.articleId
    articleAnchor.value = art.anchor
  } else if (/^mailto:/i.test(h)) {
    tab.value = 'email'
    email.value = h.slice(7)
  } else if (/^tel:/i.test(h)) {
    tab.value = 'phone'
    phone.value = h.slice(4)
  } else if (h.startsWith('#')) {
    tab.value = 'heading'
    heading.value = h.slice(1)
  } else {
    tab.value = 'url'
    url.value = h
  }
})

const TABS = [
  { value: 'url', label: 'Web address', icon: IconWorld },
  { value: 'article', label: 'Article', icon: IconFileText },
  { value: 'heading', label: 'Heading', icon: IconHash },
  { value: 'email', label: 'Email', icon: IconMail },
  { value: 'phone', label: 'Phone', icon: IconPhone },
]
const filteredArticles = computed(() => {
  const q = search.value.trim().toLowerCase()
  return props.articles
    .filter((a) => !q || a.title.toLowerCase().includes(q))
    .sort((a, b) => a.title.localeCompare(b.title))
    .slice(0, 50)
})
const headingOptions = computed(() =>
  props.headings.map((h) => ({ value: h.id, label: `${'— '.repeat(h.level - 2)}${h.text}` })),
)

function hrefNow() {
  if (tab.value === 'url') {
    let u = url.value.trim()
    if (u && !/^[a-z][a-z0-9+.-]*:/i.test(u) && !u.startsWith('/')) u = `https://${u}`
    if (!/^https?:\/\/[^\s]+$/i.test(u)) return { error: 'Enter a web address (https://…).' }
    return { href: u }
  }
  if (tab.value === 'article') {
    if (!articleId.value) return { error: 'Pick an article.' }
    const a = articleAnchor.value.trim().replace(/^#/, '')
    return { href: kbArticleHref(articleId.value, a), title: articleTitle(articleId.value) }
  }
  if (tab.value === 'heading') {
    if (!heading.value) return { error: 'Pick a heading.' }
    return {
      href: `#${heading.value}`,
      title: props.headings.find((h) => h.id === heading.value)?.text,
    }
  }
  if (tab.value === 'email') {
    const e = email.value.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { error: 'Enter an email address.' }
    return { href: `mailto:${e}`, title: e }
  }
  const p = phone.value.trim().replace(/[^\d+]/g, '')
  if (p.replace(/\D/g, '').length < 5) return { error: 'Enter a phone number.' }
  return { href: `tel:${p}`, title: phone.value.trim() }
}
function articleTitle(id) {
  return props.articles.find((a) => a.id === id)?.title || ''
}
function submit() {
  const r = hrefNow()
  if (r.error) {
    error.value = r.error
    return
  }
  const shown = text.value.trim() || (props.hasSelection ? '' : r.title || r.href)
  emit('submit', { href: r.href, text: shown })
  open.value = false
}
</script>

<template>
  <BaseDialog v-model="open" :title="initialHref ? 'Edit link' : 'Insert link'" size="lg">
    <div class="tw:flex tw:flex-col tw:gap-4">
      <BaseTabs v-model="tab" :tabs="TABS" variant="underline" ariaLabel="Link to" />

      <BaseTextInput
        v-if="!hasSelection || initialHref"
        v-model="text"
        label="Text to show"
        placeholder="Leave empty to use the title or address"
      />

      <template v-if="tab === 'url'">
        <BaseTextInput
          v-model="url"
          label="Web address"
          placeholder="https://example.com/page"
          @keyup.enter="submit"
        />
        <p class="tw:text-xs tw:text-secondary">Opens in a new tab on the help center.</p>
      </template>

      <template v-else-if="tab === 'article'">
        <div class="tw:relative">
          <IconSearch
            :size="16"
            class="tw:pointer-events-none tw:absolute tw:left-2.5 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary"
          />
          <input
            v-model="search"
            type="search"
            placeholder="Search articles"
            aria-label="Search articles"
            class="tw:h-9 tw:w-full tw:rounded-md tw:border tw:border-divider tw:bg-main tw:pl-8 tw:pr-2 tw:text-sm"
          />
        </div>
        <ul
          class="tw:max-h-64 tw:overflow-y-auto tw:rounded-md tw:border tw:border-divider"
          role="listbox"
          aria-label="Articles"
        >
          <li v-for="a in filteredArticles" :key="a.id">
            <button
              type="button"
              role="option"
              :aria-selected="articleId === a.id"
              :class="[
                'tw:flex tw:w-full tw:items-center tw:gap-2 tw:px-3 tw:py-2 tw:text-left tw:text-sm',
                articleId === a.id ? 'tw:bg-primary/10 tw:font-medium' : 'tw:hover:bg-main-hover',
              ]"
              @click="articleId = a.id"
            >
              <IconFileText :size="15" class="tw:shrink-0 tw:text-secondary" />
              <span class="tw:flex-1 tw:truncate">{{ a.title }}</span>
              <KbAudienceBadge v-if="a.audience === 'AGENTS'" audience="AGENTS" />
              <span v-if="a.status !== 'PUBLISHED'" class="tw:text-xs tw:text-secondary">{{
                a.status === 'DRAFT' ? 'Draft' : 'Archived'
              }}</span>
            </button>
          </li>
          <li v-if="!filteredArticles.length" class="tw:px-3 tw:py-2 tw:text-sm tw:text-secondary">
            No article matches.
          </li>
        </ul>
        <BaseTextInput
          v-model="articleAnchor"
          label="Heading in that article (optional)"
          placeholder="e.g. before-you-start"
        />
        <p class="tw:text-xs tw:text-secondary">
          The link follows the article if its title or address changes. A link to an agents-only
          article shows as plain text on the help center.
        </p>
      </template>

      <template v-else-if="tab === 'heading'">
        <BaseSelect
          v-if="headingOptions.length"
          v-model="heading"
          :options="headingOptions"
          nullLabel="Pick a heading of this article"
          aria-label="Heading"
        />
        <p v-else class="tw:text-sm tw:text-secondary">
          This article has no headings yet. Add one with the paragraph style menu.
        </p>
      </template>

      <BaseEmailInput
        v-else-if="tab === 'email'"
        v-model="email"
        label="Email address"
        placeholder="support@example.com"
      />

      <BaseTextInput
        v-else
        v-model="phone"
        label="Phone number"
        placeholder="+1 555 010 0000"
        @keyup.enter="submit"
      />

      <p v-if="error" class="tw:text-sm tw:text-red-600" role="alert">{{ error }}</p>
    </div>
    <template #footer>
      <div class="tw:flex tw:w-full tw:items-center tw:gap-2">
        <BaseButton v-if="initialHref" variant="outline" @click="(emit('remove'), (open = false))"
          >Remove link</BaseButton
        >
        <div class="tw:flex-1" />
        <BaseButton variant="outline" @click="open = false">Cancel</BaseButton>
        <BaseButton @click="submit">{{ initialHref ? 'Save link' : 'Insert link' }}</BaseButton>
      </div>
    </template>
  </BaseDialog>
</template>
