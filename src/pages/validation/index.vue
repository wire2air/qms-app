<script setup>
import {
  IconCertificate,
  IconChevronRight,
  IconClipboardCheck,
  IconFileDescription,
  IconShieldCheck,
} from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { useValidationContent } from '@/composables/useValidationContent.js'

/**
 * The Validation Package index — the one page a customer's validation lead is
 * pointed at, and the entry point to every protocol.
 *
 * Deliberately says up front that Qability supplies protocols and the customer
 * executes them. That is not a disclaimer for its own sake: computerised-system
 * validation is the regulated user's activity under 21 CFR Part 11 / EU Annex
 * 11 / ISO 13485 §4.1.6, and a package that implied the vendor had already
 * validated the customer's installation would fail on the first audit that
 * asked who executed it.
 *
 * Layout mirrors the Help Center index so the two feel like one system.
 */
const pageInfo = usePageInfo()
pageInfo.value = { showHeader: true }

const { grouped } = useValidationContent()
const groups = grouped()

// The framework part is the "read first" half; OQ protocols are the working
// half. Iconography follows that split rather than being per-category.
const ICONS = {
  framework: IconShieldCheck,
  oq: IconClipboardCheck,
}
function iconFor(dir) {
  return ICONS[dir] ?? IconFileDescription
}

const startHere = computed(() =>
  groups.flatMap((g) => g.articles).find((a) => a.slug === 'framework/how-to-use-this-package'),
)
</script>

<template>
  <div class="tw:max-w-5xl tw:mx-auto tw:px-6 tw:py-8">
    <div class="tw:mb-8">
      <div class="tw:flex tw:items-center tw:gap-2 tw:mb-1">
        <IconCertificate :size="22" class="tw:text-primary" />
        <h1 class="tw:text-2xl tw:font-semibold tw:tracking-tight tw:text-on-main">
          Validation Package
        </h1>
      </div>
      <p class="tw:text-secondary tw:max-w-3xl">
        Qualification protocols for validating Qability QMS in a regulated environment — a
        Validation Master Plan, a 21 CFR Part 11 / EU Annex 11 assessment, Installation
        Qualification, per-module Operational Qualification test scripts, Performance Qualification
        templates, and a requirements traceability matrix.
      </p>
    </div>

    <!-- Said once, prominently, rather than buried in every document. -->
    <div
      class="tw:mb-8 tw:rounded-xl tw:border tw:border-amber-300 tw:bg-amber-50 tw:p-4 tw:dark:border-amber-800/60 tw:dark:bg-amber-950/30"
    >
      <BaseText variant="body" weight="medium" class="tw:mb-1 tw:block">
        These are protocols for you to execute — not a completed validation.
      </BaseText>
      <p class="tw:text-sm tw:text-secondary">
        Validation of a computerised system is the regulated user's responsibility. Qability
        supplies the protocols, the specifications they test against, and the supporting evidence;
        your organisation reviews them, approves them, executes them against your own configured
        tenant, and retains the signed records. Every protocol is a template — expect to tailor it
        to your intended use and risk assessment before approval.
      </p>
      <RouterLink
        v-if="startHere"
        :to="getCompanyPath(`/validation/${startHere.slug}`)"
        class="tw:mt-2 tw:inline-flex tw:items-center tw:gap-1 tw:text-sm tw:font-medium tw:text-primary tw:hover:underline"
      >
        Start here: {{ startHere.title }} <IconChevronRight :size="14" />
      </RouterLink>
    </div>

    <div class="tw:flex tw:flex-col tw:gap-5">
      <div
        v-for="group in groups"
        :key="group.dir"
        class="tw:bg-card tw:rounded-xl tw:border tw:border-divider tw:p-5"
      >
        <div class="tw:flex tw:items-center tw:gap-2 tw:mb-3">
          <component :is="iconFor(group.dir)" :size="18" class="tw:text-primary" />
          <BaseText variant="overline">{{ group.label }}</BaseText>
          <span class="tw:text-xs tw:text-secondary">{{ group.articles.length }}</span>
        </div>
        <ul class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-x-6 tw:gap-y-1">
          <li v-for="a in group.articles" :key="a.slug">
            <RouterLink
              :to="getCompanyPath(`/validation/${a.slug}`)"
              class="tw:group tw:flex tw:items-center tw:justify-between tw:gap-2 tw:rounded-md tw:px-2 tw:py-1.5 tw:hover:bg-main-hover"
            >
              <span class="tw:text-sm tw:text-on-main tw:truncate">{{ a.title }}</span>
              <IconChevronRight
                :size="15"
                class="tw:text-secondary tw:opacity-0 tw:group-hover:opacity-100 tw:shrink-0"
              />
            </RouterLink>
          </li>
        </ul>
      </div>
    </div>

    <p v-if="!groups.length" class="tw:text-sm tw:text-secondary tw:py-10 tw:text-center">
      No validation documents are bundled with this build.
    </p>
  </div>
</template>
