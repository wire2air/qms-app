<script setup>
/**
 * Create or edit a delivery schedule for one saved report.
 *
 * ── WHAT IS BEING EDITED ────────────────────────────────────────────────────
 * WHEN (a five-field cron plus an IANA timezone), WHO (references, never
 * addresses), WHAT FORMAT, and whether it is LIVE. Nothing about the report's
 * content is editable here — that is the report definition, and it is edited on
 * the report itself.
 *
 * ── THE ACTIVE SWITCH IS AN EXPORT DECISION ─────────────────────────────────
 * `analytics_report_schedules_{insert,update}_rls` both carry
 * `(is_active = false OR authz.has_permission('reports_dashboards','export'))`,
 * tested on the RESULTING ROW rather than on the operation. Two consequences,
 * both wanted and both visible in this dialog:
 *
 *   • Anyone who may write the row may save a DRAFT (off). Drawing the form for
 *     them is correct — the database will take it.
 *   • Anyone who may write the row may always turn one OFF. Turning something
 *     off is the operation an administrator reaches for when it is going wrong;
 *     it must never be the thing they lack a permission for. So the switch is
 *     disabled only in the direction that needs `:export`.
 *
 * The sharp edge, stated because it will otherwise look like a bug: a viewer
 * WITHOUT `:export` cannot save ANY change to a schedule that is currently on —
 * not even a rename — because WITH CHECK is evaluated against the new row and
 * the new row is still active. The honest answer is to say that in the form
 * rather than let the save 403, which is what `validateSchedule` does.
 *
 * `manage` is the wrong permission and picking it would open a hole rather than
 * merely be untidy: a manage-holder without export could name themselves the
 * sole recipient of a weekly send and receive by email precisely the file
 * `request_report_export` refuses to hand them. See canActivateSchedule().
 *
 * ── CRON IS VALIDATED THREE TIMES, AND ONLY ONE OF THEM IS HERE ─────────────
 * A CHECK constraint proves the SHAPE (five fields from the cron alphabet — the
 * gate that stops "every monday" and stops a six-field seconds-first expression
 * that a parser would accept while meaning something else). A BEFORE trigger
 * proves the TIMEZONE against pg_timezone_names. The backend Zod schema proves
 * it PARSES. This dialog mirrors the first two and previews the result, because
 * the failure being designed against is a silent one: the audit-program schema
 * checks only that a cron expression is PRESENT, so "every monday" stores
 * perfectly, generates nothing ever, and raises nothing anywhere.
 *
 * The preview is the part no validator can replace. "0 8 1 * *" is a perfectly
 * valid expression that is not what somebody who wanted every Monday meant, and
 * three timestamps in their own timezone is the only thing that shows them that
 * before it runs unattended for a year.
 *
 * ── next_run_at IS THE WORKER'S, WITH ONE EXCEPTION ─────────────────────────
 * The client never computes it: `run_report_schedules` treats NULL as "never
 * armed", computes the next occurrence and STOPS without firing, then advances
 * it after every tick. The exception is an EDIT to the cron or the timezone —
 * a stale `next_run_at` would fire once at the OLD time, so it is cleared and
 * the worker re-arms from the new expression. Skipping one occurrence is
 * strictly better than sending at a time nobody asked for.
 */
import { IconClock } from '@tabler/icons-vue'
import {
  FORMAT_OPTIONS,
  canActivateSchedule,
  checkCron,
  localTimezone,
  nextRunTimes,
  normaliseRecipients,
  timezoneOptions,
  validateSchedule,
} from '@/utils/analyticsReportSchedules.js'

const props = defineProps({
  // The report this schedule delivers. Required for a create.
  reportId: { type: String, required: true },
  // An existing schedule to edit; null to create.
  schedule: { type: Object, default: null },
  // Mirrors the RLS export branch. Passed in rather than read here so the tab
  // and the dialog cannot disagree about it.
  canExport: { type: Boolean, default: false },
})

const emit = defineEmits(['saved'])
const open = defineModel('open', { type: Boolean, default: false })

const toast = useToast()
const saving = ref(false)

/**
 * A new schedule is born OFF and unnamed. `is_active` defaults to false in the
 * database for the same reason: a row appearing in a table must never be the
 * event that starts mailing people.
 */
function blank() {
  return {
    name: '',
    description: '',
    cronExpression: '0 8 * * MON',
    // The author's own zone rather than the column default of UTC. Somebody
    // asking for "08:00" almost never means 08:00 UTC, and a schedule that
    // silently means that is wrong every day without ever failing.
    timezone: localTimezone(),
    format: 'pdf',
    recipients: [],
    isActive: false,
  }
}

const form = ref(blank())

// Re-seed on every open so reopening after a cancel does not resurrect an
// abandoned draft.
watch(
  () => [open.value, props.schedule?.id],
  () => {
    if (!open.value) return
    form.value = props.schedule
      ? {
          name: props.schedule.name ?? '',
          description: props.schedule.description ?? '',
          cronExpression: props.schedule.cronExpression ?? '0 8 * * MON',
          timezone: props.schedule.timezone ?? 'UTC',
          format: props.schedule.format ?? 'pdf',
          // normaliseRecipients rebuilds every element key by key, so this is
          // already a deep copy of plain objects — editing the live SyncEngine
          // instance in place would mutate what the list is rendering, and a
          // cancelled edit would still show its changes until the next sync.
          recipients: normaliseRecipients(props.schedule.recipients),
          isActive: !!props.schedule.isActive,
        }
      : blank()
  },
  { immediate: true },
)

const timezones = timezoneOptions()

const cronCheck = computed(function checkExpression() {
  return checkCron(form.value.cronExpression, form.value.timezone)
})

const preview = computed(function nextThree() {
  if (!cronCheck.value.previewable) return []
  return nextRunTimes(form.value.cronExpression, form.value.timezone, 3)
})

const errors = computed(function currentErrors() {
  return validateSchedule(form.value, { canExport: props.canExport })
})

const canSave = computed(function saveable() {
  return Object.keys(errors.value).length === 0 && !saving.value
})

/**
 * The switch is disabled only in the direction that needs the permission. An
 * already-on schedule stays switchable so anybody with write access can stop it.
 */
const activateDisabled = computed(function switchLocked() {
  if (form.value.isActive) return false
  return !canActivateSchedule({ canExport: props.canExport })
})

/** Did the author change WHEN it fires? Then the armed time is stale. */
const timingChanged = computed(function retimed() {
  if (!props.schedule) return false
  return (
    props.schedule.cronExpression !== form.value.cronExpression ||
    props.schedule.timezone !== form.value.timezone
  )
})

const saveSchedule = useLiveMutation(async (db, payload) => {
  if (payload.id) {
    const existing = await db.AnalyticsReportSchedule.findByPk(payload.id)
    if (!existing) throw new Error('That schedule no longer exists.')
    Object.assign(existing, payload.attrs)
    await existing.save()
    return existing
  }
  const created = db.AnalyticsReportSchedule.create(payload.attrs)
  await created.save()
  return created
})

async function save() {
  if (!canSave.value) return
  saving.value = true
  try {
    const attrs = {
      reportId: props.reportId,
      name: form.value.name.trim(),
      // NULL rather than '', so the list falls back cleanly instead of drawing
      // an empty line where a description would be.
      description: form.value.description.trim() ? form.value.description.trim() : null,
      cronExpression: form.value.cronExpression.trim(),
      timezone: form.value.timezone.trim(),
      format: form.value.format,
      // Rebuilt key by key at the boundary — the CHECK whitelists exactly
      // { type, id } and a stray field would be a raw constraint violation.
      recipients: normaliseRecipients(form.value.recipients),
      isActive: form.value.isActive,
    }
    // See the header: a retimed schedule must be re-armed by the worker rather
    // than fire once at the time it used to.
    if (timingChanged.value) attrs.nextRunAt = null

    const saved = await saveSchedule({ id: props.schedule?.id ?? null, attrs })
    toast.success(props.schedule ? 'Schedule updated' : 'Schedule created')
    emit('saved', saved)
    open.value = false
  } catch (err) {
    // The database raises a distinct message per refusal — a bad cron shape, an
    // unknown timezone, an activation without :export, an unreadable report.
    // Show what the server said; a generic failure message throws away the only
    // thing that says which one happened. Never close on failure: that would
    // silently discard the draft.
    toast.error(err?.message || 'Could not save the schedule')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog
    v-model="open"
    :title="schedule ? 'Edit schedule' : 'New schedule'"
    subtitle="Send this report on a repeating schedule. Each recipient gets their own copy, resolved under their own access."
    size="lg"
    persistent
    showClose
  >
    <div class="tw:flex tw:flex-col tw:gap-4">
      <div class="tw:grid tw:gap-3 tw:sm:grid-cols-2">
        <BaseField label="Schedule name" required :error="errors.name">
          <template #default="field">
            <BaseTextInput
              v-bind="field"
              v-model="form.name"
              placeholder="e.g. Monday morning quality pack"
            />
          </template>
        </BaseField>

        <BaseField label="Format" :error="errors.format">
          <template #default="field">
            <BaseSelect v-bind="field" v-model="form.format" :options="FORMAT_OPTIONS" />
          </template>
        </BaseField>
      </div>

      <BaseField label="Description">
        <template #default="field">
          <BaseTextarea
            v-bind="field"
            v-model="form.description"
            :rows="2"
            placeholder="Who this goes to and why, for whoever inherits it."
          />
        </template>
      </BaseField>

      <BaseCard class="tw:flex tw:flex-col tw:gap-3">
        <!-- The existing picker, reused rather than rebuilt: it already emits a
             five-field expression and already knows the presets. -->
        <CronPicker v-model="form.cronExpression" :timezone="form.timezone" />

        <BaseField
          label="Timezone"
          :error="errors.timezone"
          hint="An IANA zone, because the whole point of storing one is daylight saving — an abbreviation like GMT carries no DST rule."
        >
          <template #default="field">
            <BaseSelect
              v-bind="field"
              v-model="form.timezone"
              :options="timezones"
              searchable
              placeholder="Choose a timezone"
            />
          </template>
        </BaseField>

        <BaseErrorText v-if="errors.cronExpression">{{ errors.cronExpression }}</BaseErrorText>

        <!-- The part no validator replaces: what the author actually asked for,
             in their own timezone, before it runs unattended for a year. -->
        <div class="tw:flex tw:flex-col tw:gap-1">
          <div class="tw:flex tw:items-center tw:gap-1.5">
            <IconClock :size="14" aria-hidden="true" class="tw:text-secondary" />
            <BaseText variant="caption" color="secondary">Next runs ({{ form.timezone }})</BaseText>
          </div>
          <BaseText v-if="preview.length === 0" variant="caption" color="secondary">
            {{
              cronCheck.previewable
                ? 'This expression never comes round — check the day and month together (there is no 30 February).'
                : (cronCheck.reason ?? 'Fix the expression above to see when it would run.')
            }}
          </BaseText>
          <BaseText v-for="run in preview" :key="run.toMillis()" variant="caption">
            {{ run.formatDate('datetime') }}
          </BaseText>
        </div>
      </BaseCard>

      <ReportRecipientPicker v-model="form.recipients" />
      <BaseErrorText v-if="errors.recipients">{{ errors.recipients }}</BaseErrorText>

      <div class="tw:flex tw:flex-col tw:gap-1 tw:border-t tw:border-divider tw:pt-4">
        <div class="tw:flex tw:items-center tw:gap-3">
          <BaseSwitch
            v-model="form.isActive"
            label="Schedule is active"
            :disabled="activateDisabled"
          />
          <BaseText weight="medium">Active — send on this schedule</BaseText>
        </div>
        <BaseErrorText v-if="errors.isActive">{{ errors.isActive }}</BaseErrorText>
        <BaseText v-else-if="activateDisabled" variant="caption" color="secondary">
          Turning a schedule on needs the Reports &amp; Dashboards export permission: a live
          schedule mails figures out of the system on a timer, so activating one is an export
          decision. You can still save this as a draft, and anyone with access can always switch
          a running schedule off.
        </BaseText>
        <BaseText v-else variant="caption" color="secondary">
          Every recipient is re-checked for export access at each send. Anyone who has lost it is
          skipped and counted in the run history rather than quietly dropped.
        </BaseText>
      </div>
    </div>

    <template #footer="{ close }">
      <BaseDialogFooter
        :loading="saving"
        :disabled="!canSave"
        :submitLabel="schedule ? 'Save changes' : 'Create schedule'"
        @cancel="close"
        @submit="save"
      />
    </template>
  </BaseDialog>
</template>
