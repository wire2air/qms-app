import BaseMarkdown from './BaseMarkdown.vue'

/** BaseMarkdown — sanitized, prose-styled markdown rendering (marked + DOMPurify). */
export default {
  title: 'Media/BaseMarkdown',
  component: BaseMarkdown,
  tags: ['autodocs'],
  argTypes: { breaks: { control: 'boolean' }, allowImages: { control: 'boolean' } },
  args: { breaks: false, allowImages: false },
}

const SAMPLE = `# Heading

Some **bold** text, _italic_, and a [link](https://example.com).

- bullet one
- bullet two

\`\`\`
code block
\`\`\`
`

export const Default = {
  render: (args) => ({
    components: { BaseMarkdown },
    setup: () => ({ args, content: SAMPLE }),
    template: `<div class="tw:max-w-xl tw:bg-card tw:rounded-xl tw:border tw:border-divider tw:p-4"><BaseMarkdown v-bind="args" :content="content" /></div>`,
  }),
}
