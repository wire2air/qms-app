<script setup>
/**
 * "Raised from Audit" panel — shown on the Capa / Nonconformance /
 * ChangeRequest detail pages. Scoped to the assignee's slice: the audit
 * header + ONLY the findings that spawned THIS record + each finding's failed
 * requirement + evidence. Backed by GET /v1/services/auditOrigin/:type/:id,
 * which authorizes off the record's own visibility — so an assignee sees
 * their findings without audits:read, and never the rest of the audit.
 *
 * Self-hides when the record has no audit origin (origin === null).
 */
import {
  IconClipboardCheck,
  IconAlertTriangle,
  IconChevronDown,
  IconChevronRight,
  IconPaperclip,
  IconLink,
} from '@tabler/icons-vue'
import { get } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.

const props = defineProps({
  // 'Capa' | 'Nonconformance' | 'ChangeRequest'
  entityType: { type: String, required: true },
  entityId: { type: String, required: true },
})

const origin = ref(undefined) // undefined = loading, null = none, object = loaded
const error = ref(null)
// Collapsed by default — the findings + evidence list can be large.
const expanded = ref(false)

// finding-type + requirement-result chip styling (self-contained — these are
// fixed enums, not entity badges).
const TYPE_SCHEME = {
  MAJOR_NC: 'tw:bg-red-100 tw:text-red-700',
  MINOR_NC: 'tw:bg-amber-100 tw:text-amber-700',
  OBSERVATION: 'tw:bg-blue-100 tw:text-blue-700',
  OFI: 'tw:bg-gray-100 tw:text-gray-600',
}
const RESULT_LABEL = {
  MAJOR_NC: 'Major NC',
  MINOR_NC: 'Minor NC',
  OBSERVATION: 'Observation',
  OFI: 'OFI',
  CONFORMING: 'Conforming',
  NA: 'N/A',
}
function typeClass(id) {
  return TYPE_SCHEME[id] || 'tw:bg-gray-100 tw:text-gray-600'
}

async function load() {
  error.value = null
  try {
    const data = await get(`/v1/services/auditOrigin/${props.entityType}/${props.entityId}`, {
      showError: false,
    })
    origin.value = data?.origin ?? null
  } catch (e) {
    error.value = e?.message || 'Failed to load audit origin'
    origin.value = null
  }
}

watch(() => [props.entityType, props.entityId], load, { immediate: true })
</script>

<template>
  <div
    v-if="origin"
    class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5 tw:flex tw:flex-col tw:gap-4"
  >
    <!-- Audit header — click to collapse/expand (collapsed by default). -->
    <button
      type="button"
      class="tw:flex tw:items-start tw:gap-2 tw:text-left tw:bg-transparent tw:border-0 tw:cursor-pointer tw:w-full"
      @click="expanded = !expanded"
    >
      <IconClipboardCheck :size="18" class="tw:text-primary tw:mt-0.5 tw:shrink-0" />
      <div class="tw:flex tw:flex-col tw:flex-1 tw:min-w-0">
        <div class="tw:text-sm tw:font-semibold tw:text-primary">
          Raised from Audit
          <span class="tw:font-normal tw:text-secondary">· {{ origin.findings.length }} finding{{ origin.findings.length === 1 ? '' : 's' }}</span>
        </div>
        <div class="tw:text-sm tw:text-secondary">
          <span class="tw:font-mono tw:font-medium tw:text-primary">{{ origin.audit.auditNumber || 'Audit' }}</span>
          <template v-if="origin.audit.standardName"> · {{ origin.audit.standardName }}</template>
          <template v-if="origin.audit.standardVersion"> (v{{ origin.audit.standardVersion }})</template>
        </div>
        <div v-if="origin.audit.scope" class="tw:text-xs tw:text-secondary tw:mt-0.5">
          Scope: {{ origin.audit.scope }}
        </div>
      </div>
      <IconChevronDown v-if="expanded" :size="18" class="tw:text-secondary tw:shrink-0" />
      <IconChevronRight v-else :size="18" class="tw:text-secondary tw:shrink-0" />
    </button>

    <!-- Linked findings + their failed requirements (this CAPA's slice only) -->
    <div v-show="expanded" class="tw:flex tw:flex-col tw:gap-3">
      <BaseText variant="overline" class="tw:block">
        Findings this CAPA addresses ({{ origin.findings.length }})
      </BaseText>
      <div
        v-for="f in origin.findings"
        :key="f.id"
        class="tw:border tw:border-divider tw:rounded-md tw:p-3 tw:flex tw:flex-col tw:gap-2"
      >
        <div class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
          <IconAlertTriangle :size="15" class="tw:text-amber-600 tw:shrink-0" />
          <span v-if="f.findingNumber" class="tw:text-xs tw:font-mono tw:font-medium tw:text-primary">
            {{ f.findingNumber }}
          </span>
          <span
            class="tw:text-[10px] tw:font-medium tw:rounded tw:px-1.5 tw:py-0.5"
            :class="typeClass(f.findingTypeId)"
          >
            {{ RESULT_LABEL[f.findingTypeId] || f.findingTypeId }}
          </span>
          <span class="tw:text-[10px] tw:rounded tw:px-1.5 tw:py-0.5 tw:bg-gray-100 tw:text-secondary">
            {{ f.statusId }}
          </span>
        </div>

        <p class="tw:text-sm tw:text-primary">{{ f.description }}</p>

        <!-- The failed requirement behind this finding -->
        <div v-if="f.requirement" class="tw:bg-main tw:rounded tw:p-2 tw:flex tw:flex-col tw:gap-0.5">
          <div class="tw:flex tw:items-center tw:gap-2">
            <span v-if="f.requirement.clauseNumber" class="tw:text-xs tw:font-mono tw:font-semibold tw:text-secondary">
              {{ f.requirement.clauseNumber }}
            </span>
            <span
              class="tw:text-[10px] tw:font-medium tw:rounded tw:px-1.5 tw:py-0.5"
              :class="typeClass(f.requirement.resultId)"
            >
              {{ RESULT_LABEL[f.requirement.resultId] || f.requirement.resultId }}
            </span>
          </div>
          <div v-if="f.requirement.title" class="tw:text-xs tw:text-secondary">
            {{ f.requirement.title }}{{ f.requirement.question ? `: ${f.requirement.question}` : '' }}
          </div>
          <div v-if="f.requirement.comments" class="tw:text-xs tw:text-secondary tw:italic">
            “{{ f.requirement.comments }}”
          </div>
        </div>

        <!-- Evidence captured against this finding (files + linked records). -->
        <div v-if="f.evidence && f.evidence.length" class="tw:flex tw:flex-col tw:gap-1">
          <div class="tw:text-[10px] tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary">
            Evidence ({{ f.evidence.length }})
          </div>
          <div class="tw:flex tw:flex-col tw:gap-1">
            <div v-for="(ev, i) in f.evidence" :key="i">
              <a
                v-if="ev.kind === 'file'"
                :href="ev.url"
                target="_blank"
                rel="noopener"
                class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:text-primary tw:hover:underline"
              >
                <IconPaperclip :size="12" class="tw:shrink-0" />
                {{ ev.caption || ev.filename }}
              </a>
              <span
                v-else
                class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:text-secondary"
              >
                <IconLink :size="12" class="tw:shrink-0" />
                {{ ev.caption || `${ev.entityType} linked` }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
