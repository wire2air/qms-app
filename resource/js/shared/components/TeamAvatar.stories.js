import TeamAvatar from './TeamAvatar.vue'

/**
 * Team avatar: shows initials over the team color (or IconUsersGroup fallback).
 * Box size is driven by a `tw:size-N` class on the component.
 */
export default {
  title: 'Primitives/TeamAvatar',
  component: TeamAvatar,
  tags: ['autodocs'],
  argTypes: {
    showBadge: { control: 'boolean' },
  },
  args: {
    team: { name: 'Quality Assurance', color: '#6366f1' },
    showBadge: false,
  },
}

const render = (args) => ({
  components: { TeamAvatar },
  setup: () => ({ args }),
  template: `<TeamAvatar v-bind="args" class="tw:size-16" />`,
})

export const Default = { render }

export const Sizes = {
  render: () => ({
    components: { TeamAvatar },
    setup: () => ({ team: { name: 'Design Ops', color: '#16a34a' } }),
    template: `<div class="tw:flex tw:items-end tw:gap-4">
      <TeamAvatar :team="team" class="tw:size-8" />
      <TeamAvatar :team="team" class="tw:size-12" />
      <TeamAvatar :team="team" class="tw:size-16" />
      <TeamAvatar :team="team" class="tw:size-24" />
    </div>`,
  }),
}

export const WithBadge = {
  render: () => ({
    components: { TeamAvatar },
    setup: () => ({ team: { name: 'Leadership', color: '#2563eb', isLeadership: true } }),
    template: `<TeamAvatar :team="team" :showBadge="true" class="tw:size-16" />`,
  }),
}

export const Fallback = {
  render: () => ({
    components: { TeamAvatar },
    template: `<TeamAvatar :team="{}" class="tw:size-16" />`,
  }),
}
