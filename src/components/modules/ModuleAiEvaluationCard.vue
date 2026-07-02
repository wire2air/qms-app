<script setup>
/**
 * AI Evaluation card — sidecar surface for a module record. Lists every scored
 * field configured for AI (narrative scoring or document extraction) and mounts
 * an on-demand FormFieldAiButton for each. Results are written back to the
 * payload companion key `"<fieldName>__ai"`, which the scoring engine folds into
 * the weighted total. Renders nothing when no field is AI-enabled.
 *
 * Gate the mount with `canUseAi` at the call site.
 */
import { IconSparkles } from '@tabler/icons-vue'
import { collectScoredFields } from '@/composables/useModuleScoring'

const props = defineProps({
  schema: { type: Array, default: () => [] },
})
const payload = defineModel('payload', { type: Object, default: () => ({}) })

const aiFields = computed(() =>
  collectScoredFields(props.schema).filter(
    (f) => f.scoring?.aiEvaluation || f.scoring?.aiExtract,
  ),
)

function setAiResult(name, value) {
  // Reassign so the parent's deep watcher (autosave) fires.
  payload.value = { ...payload.value, [`${name}__ai`]: value }
}
</script>

<template>
  <BaseCard v-if="aiFields.length" class="tw:flex tw:flex-col tw:gap-3">
    <div class="tw:flex tw:items-center tw:gap-2">
      <IconSparkles :size="16" class="tw:text-primary" />
      <BaseText as="h3" variant="subheading" weight="bold">AI Evaluation</BaseText>
    </div>
    <p class="tw:text-xs tw:text-secondary">
      Run AI scoring on demand. Review and adjust each result — it feeds the record's score.
    </p>
    <FormFieldAiButton
      v-for="f in aiFields"
      :key="f.name"
      :field="f"
      :answer="payload[f.name]"
      :result="payload[`${f.name}__ai`] || null"
      @update:result="setAiResult(f.name, $event)"
    />
  </BaseCard>
</template>
