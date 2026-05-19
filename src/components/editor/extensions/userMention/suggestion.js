import { VueRenderer } from '@tiptap/vue-3'
import { PluginKey } from '@tiptap/pm/state'
import tippy from 'tippy.js'
import { db } from '@models/index'
import MentionList from '../MentionList.vue'

export const UserMentionPluginKey = new PluginKey('userMention')

export const userSuggestion = {
  pluginKey: UserMentionPluginKey,
  char: '@',

  async items({ query }) {
    if (!query) return []
    const q = query.toLowerCase()
    const all = await db.User.where().exec()
    const matched = all.filter((user) => {
      if (user.userStatusId !== 'ACTIVE') return false
      const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.toLowerCase()
      return fullName.includes(q) || user.email?.toLowerCase().includes(q)
    })
    return matched.slice(0, 10).map((user) => ({
      id: user.id,
      label: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email,
    }))
  },

  render: () => {
    let component
    let popup

    return {
      onStart(props) {
        component = new VueRenderer(MentionList, {
          props,
          editor: props.editor,
        })

        if (!props.clientRect) return

        popup = tippy(document.body, {
          getReferenceClientRect: props.clientRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
        })
      },

      onUpdate(props) {
        component.updateProps(props)

        if (!props.clientRect) return

        popup.setProps({
          getReferenceClientRect: props.clientRect,
        })
      },

      onKeyDown(props) {
        if (props.event.key === 'Escape') {
          popup.hide()
          return true
        }

        return component.ref?.onKeyDown(props)
      },

      onExit() {
        if (popup) popup.destroy()
        if (component) component.destroy()
      },
    }
  },
}
