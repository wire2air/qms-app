<script setup>
/**
 * FormSection — the single definition of a titled form section. Composes
 * BaseCard (surface) + BaseSectionHeader (heading/icon/actions) so the
 * `tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5` chrome that was
 * copy-pasted on every form (7× in NonconformancesCreate alone) lives in ONE
 * place — and inherits BaseCard's theme-aware `bg-card` (the hand-rolled
 * `bg-white` cards broke dark mode).
 *
 *   <FormSection title="Classification" :icon="IconCategory" id="classification">
 *     <BaseFieldRow :columns="2">
 *       <BaseField label="Site" required>…</BaseField>
 *       <BaseField label="Department" required>…</BaseField>
 *     </BaseFieldRow>
 *   </FormSection>
 *
 *   <!-- optional + collapsible: replaces the "(optional)" typed into headers
 *        and gives long forms progressive disclosure (collapsed content stays
 *        mounted, so field state survives toggling) -->
 *   <FormSection title="Product & material" optional collapsible :defaultOpen="false">
 *     …
 *   </FormSection>
 *
 * The `id` is the anchor target for FormProgressNav. Icons are NOT
 * auto-imported — pass the imported @tabler/icons-vue component.
 */
import { IconChevronDown } from '@tabler/icons-vue'

const props = defineProps({
  title: { type: String, default: '' },
  // Subtitle under the title (the "SectionDescription" role).
  description: { type: String, default: '' },
  // A @tabler/icons-vue component, imported by the consumer.
  icon: { type: [Object, Function], default: null },
  iconColor: { type: String, default: 'primary' },
  iconVariant: { type: String, default: 'plain' },
  // Semantic heading level for the document outline.
  level: { type: [Number, String], default: 3 },
  // Renders a muted "Optional" marker beside the title (declarative — replaces
  // typing "(optional)" into the title string).
  optional: { type: Boolean, default: false },
  // Show a chevron toggle; collapses the body (kept mounted via v-show).
  collapsible: { type: Boolean, default: false },
  defaultOpen: { type: Boolean, default: true },
  // Forwarded to BaseCard: none | sm | md | lg.
  padding: { type: String, default: 'md' },
  // Anchor id (FormProgressNav target) + base for the body's aria-controls id.
  id: { type: String, default: undefined },
})

const autoId = useId()
const sectionId = computed(() => props.id || autoId)
const bodyId = computed(() => `${sectionId.value}-body`)

const open = ref(props.defaultOpen)
function toggle() {
  open.value = !open.value
}
</script>

<template>
  <BaseCard :id="sectionId" as="section" :padding="padding">
    <div
      class="tw:flex tw:items-start tw:gap-2 tw:border-b tw:border-divider tw:pb-3"
      :class="open ? 'tw:mb-4' : ''"
    >
      <button
        v-if="collapsible"
        type="button"
        class="tw:mt-0.5 tw:flex tw:size-6 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-md tw:text-secondary tw:transition-colors tw:hover:bg-sidebar-hover tw:hover:text-on-sidebar tw:focus-visible:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-primary/40"
        :aria-expanded="open"
        :aria-controls="bodyId"
        :aria-label="`${open ? 'Collapse' : 'Expand'} ${title || 'section'}`"
        @click="toggle"
      >
        <IconChevronDown
          :size="18"
          class="tw:transition-transform tw:duration-150"
          :class="open ? '' : 'tw:-rotate-90'"
          aria-hidden="true"
        />
      </button>

      <BaseSectionHeader
        class="tw:flex-1 tw:min-w-0"
        :icon="icon"
        :iconColor="iconColor"
        :iconVariant="iconVariant"
        :level="level"
        :subtitle="description"
      >
        <template #title>
          <span>{{ title }}</span>
          <span
            v-if="optional"
            class="tw:ml-2 tw:align-middle tw:rounded tw:bg-sidebar tw:px-1.5 tw:py-0.5 tw:text-xs tw:font-medium tw:normal-case tw:text-secondary"
          >
            Optional
          </span>
        </template>
        <template v-if="$slots.actions" #actions>
          <slot name="actions" />
        </template>
      </BaseSectionHeader>
    </div>

    <div v-show="open" :id="bodyId">
      <slot />
    </div>
  </BaseCard>
</template>
