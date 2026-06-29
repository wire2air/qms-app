import { ref } from 'vue'
import { IconUser, IconBuilding, IconFlag } from '@tabler/icons-vue'
import BaseSelect from './BaseSelect.vue'

/**
 * BaseSelect — the generic, QSelect-style select primitive (custom teleported
 * popup + virtual scroll + search; no Quasar). Configure data mapping with
 * `option-label` / `option-value` / `emit-value`. Entity pickers should still
 * go through an XSelectMenu triad (see CLAUDE.md); use this directly for
 * non-entity or richly-rendered lists.
 */
const priorities = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent', disabled: true },
]

const people = [
  { id: 'u1', name: 'Ada Lovelace', team: 'Engineering', title: 'Principal Engineer' },
  { id: 'u2', name: 'Alan Turing', team: 'Engineering', title: 'Staff Engineer' },
  { id: 'u3', name: 'Grace Hopper', team: 'Quality', title: 'QA Lead' },
  { id: 'u4', name: 'Katherine Johnson', team: 'Quality', title: 'Auditor' },
  { id: 'u5', name: 'Marie Curie', team: 'Research', title: 'Researcher' },
]

const manyOptions = Array.from({ length: 5000 }, (_, i) => ({
  value: i,
  label: `Option #${i + 1}`,
}))

export default {
  title: 'Forms/BaseSelect',
  component: BaseSelect,
  tags: ['autodocs'],
}

export const Basic = {
  render: () => ({
    components: { BaseSelect },
    setup: () => ({ priorities, model: ref(null) }),
    template: `
      <div class="tw:max-w-xs">
        <BaseSelect
          v-model="model"
          :options="priorities"
          label="Priority"
          placeholder="Select priority"
          clearable
        />
        <p class="tw:mt-2 tw:text-12 tw:text-secondary">Value: {{ JSON.stringify(model) }}</p>
      </div>`,
  }),
}

export const Multiple = {
  render: () => ({
    components: { BaseSelect },
    setup: () => ({ priorities, model: ref(['LOW', 'HIGH']) }),
    template: `
      <div class="tw:max-w-sm">
        <BaseSelect
          v-model="model"
          :options="priorities"
          label="Priorities"
          multiple
          use-chips
          counter
          show-select-all
          clearable
        />
        <p class="tw:mt-2 tw:text-12 tw:text-secondary">Value: {{ JSON.stringify(model) }}</p>
      </div>`,
  }),
}

export const RichOptions = {
  render: () => ({
    components: { BaseSelect },
    setup: () => ({ people, model: ref('u3') }),
    template: `
      <div class="tw:max-w-sm">
        <BaseSelect
          v-model="model"
          :options="people"
          label="Owner"
          option-label="name"
          option-value="id"
          option-description="title"
        />
      </div>`,
  }),
}

export const Grouped = {
  render: () => ({
    components: { BaseSelect },
    setup: () => ({ people, model: ref(null) }),
    template: `
      <div class="tw:max-w-sm">
        <BaseSelect
          v-model="model"
          :options="people"
          label="Assignee"
          option-label="name"
          option-value="id"
          option-group="team"
          option-description="title"
          placeholder="Select assignee"
        />
      </div>`,
  }),
}

export const CustomOptionSlot = {
  render: () => ({
    components: { BaseSelect },
    setup: () => ({ people, model: ref(null), icons: { IconUser, IconBuilding, IconFlag } }),
    template: `
      <div class="tw:max-w-sm">
        <BaseSelect v-model="model" :options="people" option-label="name" option-value="id" label="Custom rows">
          <template #option="{ opt, selected }">
            <span class="tw:flex tw:min-w-0 tw:flex-1 tw:items-center tw:gap-2">
              <span class="tw:flex tw:size-7 tw:items-center tw:justify-center tw:rounded-full tw:bg-primary/10 tw:text-12 tw:font-semibold tw:text-primary">
                {{ opt.label.split(' ').map(p => p[0]).join('') }}
              </span>
              <span class="tw:min-w-0">
                <span class="tw:block tw:truncate tw:font-medium">{{ opt.label }}</span>
                <span class="tw:block tw:truncate tw:text-12 tw:text-secondary">{{ opt.raw.team }}</span>
              </span>
              <span v-if="selected" class="tw:ml-auto tw:text-primary">✓</span>
            </span>
          </template>
        </BaseSelect>
      </div>`,
  }),
}

export const AsyncRemoteSearch = {
  render: () => ({
    components: { BaseSelect },
    setup() {
      const model = ref(null)
      const options = ref([])
      const loading = ref(false)
      let token = 0
      function onFilter(query) {
        const mine = ++token
        loading.value = true
        // Simulate a server round-trip.
        setTimeout(() => {
          if (mine !== token) return
          options.value = !query
            ? people.slice(0, 3)
            : people.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
          loading.value = false
        }, 600)
      }
      return { model, options, loading, onFilter }
    },
    template: `
      <div class="tw:max-w-sm">
        <BaseSelect
          v-model="model"
          :options="options"
          :loading="loading"
          option-label="name"
          option-value="id"
          option-description="title"
          label="Search people (remote)"
          placeholder="Type to search"
          @filter="onFilter"
        />
      </div>`,
  }),
}

export const Validation = {
  render: () => ({
    components: { BaseSelect },
    setup: () => ({ priorities, model: ref(null), select: ref(null) }),
    template: `
      <div class="tw:max-w-xs tw:flex tw:flex-col tw:gap-3">
        <BaseSelect
          ref="select"
          v-model="model"
          :options="priorities"
          label="Priority"
          required
          :rules="[v => v === 'URGENT' ? 'Urgent is not allowed' : true]"
          hint="Pick anything except Urgent."
        />
        <button class="tw:btn-primary tw:w-fit" @click="$refs.select.validate()">Validate</button>
      </div>`,
  }),
}

export const VirtualScroll5000 = {
  render: () => ({
    components: { BaseSelect },
    setup: () => ({ manyOptions, model: ref(null) }),
    template: `
      <div class="tw:max-w-xs">
        <BaseSelect
          v-model="model"
          :options="manyOptions"
          label="5,000 options (virtualized)"
          placeholder="Scroll me"
        />
      </div>`,
  }),
}
