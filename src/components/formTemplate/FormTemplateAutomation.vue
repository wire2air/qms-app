<script setup>
// The form template's "Automation" view (its own tab/mode, not the rail) — lists
// all automation rules for the module and lets the user create new ones, with a
// link to the in-app Automation help article.
const props = defineProps({
  templateId: { type: String, required: true },
})

const template = useLiveQueryWithDeps(
  [() => props.templateId],
  async (db, [id]) => (id ? db.FormTemplate.findByPk(id) : null),
  { models: ['FormTemplate'] },
)
const isModule = computed(() => !!template.value?.isModule)
</script>

<template>
  <div class="tw:grow tw:flex tw:flex-col tw:p-8 tw:overflow-y-auto tw:h-full">
    <div class="tw:max-w-3xl tw:mx-auto tw:flex tw:flex-col tw:w-full tw:gap-6">
      <div
        class="tw:flex tw:items-start tw:justify-between tw:gap-4 tw:border-b tw:border-divider tw:pb-4"
      >
        <div>
          <BaseText as="h3" variant="subheading" weight="bold">Automation</BaseText>
          <p class="tw:text-sm tw:text-secondary">
            Notify people or create tasks automatically when this module's records meet conditions
            you set.
          </p>
        </div>
        <HelpButton slug="KB/automation/automation-rules" label="Help" />
      </div>

      <FormTemplateAutomationRules v-if="isModule" :templateId="templateId" />

      <BaseCard v-else class="tw:text-sm tw:text-secondary">
        Promote this template to a Module to add automation rules.
      </BaseCard>
    </div>
  </div>
</template>
