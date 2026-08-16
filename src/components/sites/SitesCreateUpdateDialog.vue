<script setup>
import { IconCheck, IconX as IconXCross, IconMapPin } from '@tabler/icons-vue'
import { required, maxLen } from '@shared/components/form/validators.js'
import {
  DEFAULT_TIMEZONE,
  SITE_CODE_MAX_LENGTH,
  isSiteCodeAvailable,
  isSiteNameAvailable,
  isValidTimezone,
  siteSaveErrorMessage,
  suggestSiteCode,
  timezoneRule,
} from '@/utils/siteValidation.js'

const props = defineProps({
  id: {
    type: [String, Number],
    default: null,
  },
})

const emit = defineEmits(['created', 'updated'])

const open = defineModel({
  type: Boolean,
  default: false,
})

const formRef = ref(null)
const isSubmitting = ref(false)
const saveError = ref('')

// `timezone` starts at DEFAULT_TIMEZONE, not null. Both models declare a 'UTC'
// default and the REST controller coalesces to 'UTC'; a null-initialised form
// bypassed all three and wrote an empty timezone into a column every date
// rendering downstream trusts.
function blankForm() {
  return {
    name: '',
    code: '',
    address: '',
    timezone: DEFAULT_TIMEZONE,
    // Defaults true: a newly created site is one you intend to use.
    isActive: true,
  }
}

const form = ref(blankForm())

const isEdit = computed(() => !!props.id)

// Load existing site if editing
const site = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return null
    return db.Site.findByPk(id)
  },
  { models: ['Site'] },
)

// ONE live query feeding every uniqueness answer.
//
// The code check and the name check each used to run their own
// `db.Site.where().exec()` full scan, keyed on the field's value — so every
// keystroke in either box triggered a fresh IndexedDB scan. They are answers
// about the same list, so the list is fetched once (re-running only when a
// Site actually syncs) and both checks are pure computeds over it.
const allSites = useLiveQuery((db) => db.Site.where().exec(), { models: ['Site'], initial: [] })

// Case-insensitive: the server compares `code.trim().toUpperCase()`, so a
// lowercase `ny-hq` typed against an existing `NY-HQ` used to pass the live
// check and then be rejected on save.
const codeAvailable = computed(() => isSiteCodeAvailable(allSites.value, form.value.code, props.id))

// Live "in use" message for the Code field. Applies while editing too: the
// code is no longer frozen after create (user request 2026-08-15), and
// isSiteCodeAvailable already excludes the row being edited, so the check is
// correct in both modes — it was only ever suppressed because the field was
// disabled.
const codeInUseError = computed(() =>
  form.value.code && !codeAvailable.value ? 'Code already in use' : '',
)

// Submit-time rule mirroring the live check so a taken code blocks submit.
function codeUnique() {
  return codeAvailable.value || 'Code already in use'
}

// Name uniqueness (case-insensitive, whitespace-trimmed) — mirrors the DB
// partial index `sites_company_name_unique` on `lower(btrim(name))`. Excludes
// the current row in edit mode.
const nameAvailable = computed(() => isSiteNameAvailable(allSites.value, form.value.name, props.id))
const nameInUseError = computed(() =>
  form.value.name && !nameAvailable.value ? 'A site with this name already exists' : '',
)
function nameUnique() {
  return nameAvailable.value || 'A site with this name already exists'
}

// `timezone` had no validation at any layer — not the Zod schema, not the
// model, not the form. Anything the dropdown didn't produce could be persisted.
const timezoneValid = timezoneRule()

// Populate form when site loads in edit mode
watch(
  site,
  (s) => {
    if (s) {
      form.value = {
        name: s.name,
        code: s.code,
        address: s.address,
        // Rows created before the form defaulted the field carry a null
        // timezone; show the model default rather than an empty dropdown that
        // silently writes null back on the next save.
        timezone: s.timezone || DEFAULT_TIMEZONE,
        // Older rows predate the column; treat a missing value as active
        // rather than silently presenting an existing site as deactivated.
        isActive: s.isActive !== false,
      }
    }
  },
  { immediate: true },
)

// Auto-suggest code when name changes (create mode only). Derivation and
// de-duplication both live in suggestSiteCode, which also keeps every
// candidate inside the STRING(10) column — the old loop appended `-1`, `-2`
// AFTER truncating, so a long name could suggest an 11-character code.
function onNameBlur() {
  if (!form.value.name || form.value.code || isEdit.value) return
  form.value.code = suggestSiteCode(form.value.name, allSites.value)
}

const createSite = useLiveMutation(async (db, newSite) => {
  const created = db.Site.create(newSite)
  try {
    await created.save()
  } catch (err) {
    // The pre-checks above read IndexedDB, which can lag another user's create.
    // When it does, the DB's unique index fires and the raw message names a
    // constraint, not a field. Say which box to change instead.
    //
    // Set inline AND re-throw: useLiveMutation swallows the error (returning
    // undefined) after toasting, so onSubmit never sees it — without this
    // assignment the dialog would reopen to an empty error line.
    const message = siteSaveErrorMessage(err, newSite)
    saveError.value = message
    throw new Error(message)
  }
  return created
})

async function onSubmit() {
  if (isSubmitting.value) return

  // Guard the one field the dropdown isn't the only way to set.
  if (!isValidTimezone(form.value.timezone)) {
    saveError.value = 'Pick a valid timezone.'
    return
  }

  isSubmitting.value = true
  saveError.value = ''
  try {
    if (!isEdit.value) {
      const newSite = await createSite({
        name: form.value.name,
        code: form.value.code,
        address: form.value.address,
        timezone: form.value.timezone,
        isActive: form.value.isActive,
      })
      // createSite returns undefined when the save failed (useLiveMutation has
      // already surfaced a toast). Keep the dialog open so the user can retry.
      if (!newSite) return
      emit('created', newSite)
    } else {
      site.value.name = form.value.name
      site.value.address = form.value.address
      site.value.timezone = form.value.timezone
      site.value.isActive = form.value.isActive
      await site.value.save()
      emit('updated', site.value)
    }
    open.value = false
  } catch (err) {
    saveError.value = siteSaveErrorMessage(err, form.value)
  } finally {
    isSubmitting.value = false
  }
}

// Reset form when dialog closes
watch(open, (val) => {
  if (!val) {
    form.value = blankForm()
    saveError.value = ''
  }
})
</script>

<template>
  <BaseDialog v-model="open" maxWidth="md">
    <template #title>
      <div class="tw:flex tw:items-center tw:gap-3">
        <div
          class="tw:w-9 tw:h-9 tw:bg-primary/10 tw:text-primary tw:rounded-xl tw:flex tw:items-center tw:justify-center"
        >
          <IconMapPin class="tw:size-5 tw:text-primary" />
        </div>
        <span>{{ isEdit ? 'Edit Site' : 'Create New Site' }}</span>
      </div>
    </template>

    <BaseForm ref="formRef" hideFooter @submit="onSubmit">
      <BaseField
        label="Site Name"
        required
        :value="form.name"
        :rules="[required(), nameUnique]"
        :error="nameInUseError"
      >
        <template #default="field">
          <BaseTextInput
            v-bind="field"
            v-model="form.name"
            placeholder="e.g. New York Headquarters"
            @blur="onNameBlur"
          />
        </template>
      </BaseField>

      <!-- maxLen mirrors the STRING(10) column: without it an 11th character
           is a server-side failure the user cannot read. -->
      <BaseField
        label="Code"
        required
        :value="form.code"
        :rules="[required(), maxLen(SITE_CODE_MAX_LENGTH), codeUnique]"
        :error="codeInUseError"
        :hint="
          isEdit
            ? 'Used by document prefixes containing {SITE_CODE}. Numbers already issued keep the old code — only documents numbered from now on use the new one.'
            : undefined
        "
      >
        <template #default="field">
          <div class="tw:relative">
            <BaseTextInput v-bind="field" v-model="form.code" placeholder="e.g. NY-HQ" />
            <template v-if="form.code">
              <IconCheck
                v-if="codeAvailable"
                class="tw:absolute tw:right-3 tw:top-1/2 tw:-translate-y-1/2 tw:size-4 tw:text-green"
              />
              <IconXCross
                v-else
                class="tw:absolute tw:right-3 tw:top-1/2 tw:-translate-y-1/2 tw:size-4 tw:text-red"
              />
            </template>
          </div>
        </template>
      </BaseField>

      <BaseTextarea
        v-model="form.address"
        label="Address"
        placeholder="e.g. 123 Main St, New York, NY"
        :rows="2"
      />

      <TimezoneDropdown v-model="form.timezone" :rules="[required(), timezoneValid]" />

      <!--
        `is_active` shipped as a column with no way to set it, which made the
        rule it governs unreachable AND undiagnosable: sites quietly stopped
        appearing in the user-assignment pickers with nothing in the UI to
        explain why, and no way to undo it short of a direct DB write.

        Deliberately NOT a delete. Deactivating retains every existing
        assignment — a site being wound down must not silently revoke the
        regional manager still closing it out — it only blocks NEW ones. That
        distinction is the whole point of the flag, so the helper text states it.
      -->
      <div class="tw:flex tw:items-start tw:justify-between tw:gap-4">
        <div class="tw:min-w-0">
          <BaseLabel dataKey="site.isActive" label="Accepting new user assignments" />
          <p class="tw:text-xs tw:text-secondary tw:mt-0.5">
            Turn this off while a site is winding down. People already assigned keep their access;
            the site just stops being offered for new assignments.
          </p>
        </div>
        <BaseSwitch v-model="form.isActive" label="Accepting new user assignments" />
      </div>
    </BaseForm>

    <template #footer>
      <BaseDialogFooter
        :submitLabel="isEdit ? 'Update Site' : 'Create Site'"
        :loading="isSubmitting"
        :error="saveError"
        @cancel="open = false"
        @submit="formRef?.submit()"
      />
    </template>
  </BaseDialog>
</template>
