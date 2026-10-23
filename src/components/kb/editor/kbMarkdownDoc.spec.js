import { describe, it, expect } from 'vitest'
import { getSchema } from '@tiptap/core'
import { DOMParser } from '@tiptap/pm/model'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { KbCallout, KbDetails, KbVideo, KbButton, KbFile, KbDc, KbImage } from './kbExtensions.js'
import {
  mdToEditorHtml,
  docToMarkdown,
  docHeadings,
  kbVideoEmbedUrl,
  parseKbArticleHref,
} from './kbMarkdownDoc.js'

const schema = getSchema([
  StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: false, underline: false }),
  Link.configure({
    protocols: ['mailto', 'tel', 'kb-article'],
    isAllowedUri: (url) => /^(https?:\/\/|mailto:|tel:|#|kb-article:)/i.test(url || ''),
  }),
  Table,
  TableRow,
  TableHeader,
  TableCell,
  KbImage,
  KbCallout,
  KbDetails,
  KbVideo,
  KbButton,
  KbFile,
  KbDc,
])

/** Markdown → what the editor holds → Markdown. */
function roundTrip(md) {
  const el = document.createElement('div')
  el.innerHTML = mdToEditorHtml(md)
  const doc = DOMParser.fromSchema(schema).parse(el).toJSON()
  return { md: docToMarkdown(doc), doc }
}
function stable(md) {
  const once = roundTrip(md).md
  expect(roundTrip(once).md).toBe(once)
  return once
}

const A = '11111111-2222-4333-8444-555555555555'
const B = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

describe('kb markdown ⇄ editor', () => {
  it('keeps ordinary Markdown as written', () => {
    const md = [
      '## Before you start',
      '',
      'You need **admin** rights, _a browser_ and `npm`.',
      '',
      '- One',
      '- Two',
      '  - Nested',
      '',
      '1. First',
      '2. Second',
      '',
      '> A quote',
      '',
      '```bash',
      'npm install',
      '```',
      '',
      '---',
      '',
      '| Plan | Price |',
      '| --- | --- |',
      '| Basic | $10 |',
      '',
    ].join('\n')
    expect(roundTrip(md).md).toBe(md)
  })

  it('keeps every knowledge base block', () => {
    const md = [
      ':::tip Good to know',
      'The link lasts **one hour**.',
      ':::',
      '',
      ':::details How do I reset it?',
      'Open settings.',
      ':::',
      '',
      '::video{src="https://www.youtube.com/watch?v=dQw4w9WgXcQ"}',
      '',
      '::button[Contact support]{href="mailto:help@example.com"}',
      '',
      `::file[Price list.pdf]{asset="${A}"}`,
      '',
      `![Settings page](kb-asset:${A})`,
      '',
      `See [Billing](kb-article:${B}#refunds) or call {{dc.support_phone}}.`,
      '',
    ].join('\n')
    expect(roundTrip(md).md).toBe(md)
  })

  it('nests a callout in a section with more colons on the outside', () => {
    const md = [
      '::::details Advanced',
      'Intro.',
      '',
      ':::warning',
      'Careful.',
      ':::',
      '::::',
      '',
    ].join('\n')
    const { md: out, doc } = roundTrip(md)
    expect(out).toBe(md)
    expect(doc.content[0].type).toBe('kbDetails')
    expect(doc.content[0].content[1].type).toBe('kbCallout')
  })

  it('writes the outer fence longer when a container is nested in the editor', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'kbCallout',
          attrs: { kind: 'note', title: '' },
          content: [
            {
              type: 'kbDetails',
              attrs: { title: 'Inner' },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }],
            },
          ],
        },
      ],
    }
    expect(docToMarkdown(doc)).toBe('::::note\n:::details Inner\nx\n:::\n::::\n')
  })

  it('escapes text that would otherwise become Markdown', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '# not a heading, 2 * 3 = 6, [x] and {{dc.no}}' }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: ':::tip not a callout' }] },
      ],
    }
    const md = docToMarkdown(doc)
    const back = roundTrip(md).doc
    expect(back.content.map((n) => n.type)).toEqual(['paragraph', 'paragraph'])
    expect(back.content[0].content[0].text).toBe('# not a heading, 2 * 3 = 6, [x] and {{dc.no}}')
    expect(back.content[1].content[0].text).toBe(':::tip not a callout')
  })

  it('merges marks and keeps spaces outside them', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'a ' },
            { type: 'text', text: 'bold ', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'both', marks: [{ type: 'bold' }, { type: 'italic' }] },
            { type: 'text', text: ' end' },
          ],
        },
      ],
    }
    expect(docToMarkdown(doc)).toBe('a **bold _both_** end\n')
  })

  it('table cells keep line breaks and pipes', () => {
    const md = '| A | B |\n| --- | --- |\n| x \\| y | one<br>two |\n'
    expect(stable(md)).toBe(md)
  })

  it('round-trips are stable for mixed content', () => {
    stable('Text with a [link](https://example.com).\n\n![](https://x.test/a.png)\n')
    stable('- [Article](kb-article:' + B + ')\n- **Bold** item\n')
  })

  it('lists headings with the server ids', () => {
    const { doc } = roundTrip('## Set up\n\n## Set up\n\n### A & B\n')
    expect(docHeadings(doc).map((h) => h.id)).toEqual(['set-up', 'set-up-2', 'a-b'])
  })

  it('embeds only YouTube, Vimeo and Loom', () => {
    expect(kbVideoEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    )
    expect(kbVideoEmbedUrl('https://vimeo.com/123456789')).toBe(
      'https://player.vimeo.com/video/123456789',
    )
    expect(kbVideoEmbedUrl('https://www.loom.com/share/0123456789abcdef0123456789abcdef')).toBe(
      'https://www.loom.com/embed/0123456789abcdef0123456789abcdef',
    )
    expect(kbVideoEmbedUrl('https://evil.example/watch?v=x')).toBeNull()
    expect(kbVideoEmbedUrl('javascript:alert(1)')).toBeNull()
  })

  it('reads article links', () => {
    expect(parseKbArticleHref(`kb-article:${B}#x`)).toEqual({ articleId: B, anchor: 'x' })
    expect(parseKbArticleHref('https://x')).toBeNull()
  })
})
