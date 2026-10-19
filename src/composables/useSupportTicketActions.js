import { DateTime } from 'luxon'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { isAllowed, isVerbAllowed, currentSession } from '@/utils/currentSession.js'
import { buildComplaintActions } from '@/components/customerComplaints/customerComplaintDetailConfig.js'

export const SNOOZE_PRESETS = [
  { label: '1 hour', pick: () => DateTime.now().plus({ hours: 1 }) },
  {
    label: 'This afternoon (3 pm)',
    pick: () => DateTime.now().set({ hour: 15, minute: 0, second: 0 }),
  },
  {
    label: 'Tomorrow 9 am',
    pick: () => DateTime.now().plus({ days: 1 }).set({ hour: 9, minute: 0, second: 0 }),
  },
  {
    label: 'Next Monday 9 am',
    pick: () =>
      DateTime.now().plus({ weeks: 1 }).set({ weekday: 1, hour: 9, minute: 0, second: 0 }),
  },
]

/**
 * Lifecycle + Support Desk actions for one ticket, shared by the Intercom-style
 * inbox thread (SupportDeskThread) and reusable by the classic ticket page.
 *
 * Owns: the action RPC plumbing (`/customerComplaints/:id/*` lifecycle verbs
 * and `/supportDesk/tickets/:id/*` inbox verbs), the dialog state the verbs
 * need (assign / snooze / spam / close), the permission gates, and the
 * `DetailActionBar`-ready action list built from the shared config — so both
 * surfaces expose exactly the same verbs with the same gating.
 *
 * `SupportTicketDialogs.vue` renders the dialogs from the returned state.
 */
export function useSupportTicketActions(complaint, { onConverted } = {}) {
  const toast = useToast()
  const { confirm } = useConfirm()

  const id = computed(() => complaint.value?.id ?? null)
  const acting = ref(false)
  const error = ref(null)

  // ── Gates ────────────────────────────────────────────────────────────────
  const canUpdate = computed(() => isAllowed(['complaint_management:update']))
  const canConvert = computed(
    () => isAllowed(['complaint_management:update']) && isAllowed(['ncr:create']),
  )
  const canTakeOver = computed(() => isVerbAllowed('complaint_management', 'takeover'))
  const isTerminal = computed(() =>
    ['CLOSED', 'CONVERTED_TO_NC'].includes(complaint.value?.statusId),
  )
  const isEditable = computed(() => !!complaint.value && !isTerminal.value && canUpdate.value)
  const currentUserId = computed(() => currentSession.value?.userId ?? null)
  const heldByOther = computed(
    () => !!complaint.value?.assignedTo && complaint.value.assignedTo !== currentUserId.value,
  )
  const isSnoozed = computed(() => {
    const t = complaint.value?.snoozedUntil
    return !!t && (t.toMillis ? t.toMillis() : new Date(t).getTime()) > Date.now()
  })
  const snoozedUntilLabel = computed(() =>
    isSnoozed.value ? complaint.value.snoozedUntil?.formatDate?.('datetime') : null,
  )
  const isLiveChat = computed(
    () => complaint.value?.channelKind === 'CHAT' && complaint.value?.chatState !== 'ENDED',
  )

  // ── RPC plumbing ─────────────────────────────────────────────────────────
  async function run(base, path, body = {}) {
    if (!id.value) return null
    acting.value = true
    error.value = null
    try {
      return (await post(`${base}/${id.value}/${path}`, body)) ?? {}
    } catch (e) {
      error.value = e.message || 'Action failed'
      toast.error(error.value)
      return null
    } finally {
      acting.value = false
    }
  }
  function lifecycle(path, body) {
    return run('/v1/services/customerComplaints', path, body)
  }
  function desk(path, body) {
    return run('/v1/services/supportDesk/tickets', path, body)
  }

  // ── Dialog state ─────────────────────────────────────────────────────────
  const dialogs = reactive({
    assign: false,
    snooze: false,
    spam: false,
    close: false,
    convert: false,
    audit: false,
  })
  const assignUserId = ref(null)
  const snoozeUntil = ref(null)
  const spamLearn = ref({ email: true, domain: false, allBrands: false })
  const closeComment = ref('')

  // ── Verbs ────────────────────────────────────────────────────────────────
  function openAssign() {
    assignUserId.value = complaint.value?.assignedTo ?? null
    dialogs.assign = true
  }
  async function submitAssign() {
    if (!assignUserId.value) return
    if (await lifecycle('assign', { userId: assignUserId.value })) {
      dialogs.assign = false
      toast.success('Assigned')
    }
  }
  /** Direct reassign from an inline picker (details drawer) — no dialog. */
  async function assignTo(userId) {
    if (!userId || userId === complaint.value?.assignedTo) return
    if (await lifecycle('assign', { userId })) toast.success('Assigned')
  }
  async function accept() {
    if (await lifecycle('accept')) toast.success('You now hold this ticket')
  }
  async function takeOver() {
    const ok = await confirm({
      title: 'Take over this ticket?',
      message: 'The current assignee will be notified and the hand-over is recorded on the thread.',
      okLabel: 'Take over',
    })
    if (!ok) return
    if (await desk('takeOver')) toast.success('You now hold this ticket')
  }
  async function endChat() {
    const ok = await confirm({
      title: 'End this chat?',
      message:
        'The visitor sees the closing message and rating prompt; the ticket is resolved. They can start a new chat any time.',
      okLabel: 'End chat',
    })
    if (!ok) return
    if (await desk('endChat')) toast.success('Chat ended')
  }
  function openSnooze() {
    snoozeUntil.value = null
    dialogs.snooze = true
  }
  async function submitSnooze() {
    const dt = snoozeUntil.value?.toISO
      ? snoozeUntil.value
      : DateTime.fromJSDate(new Date(snoozeUntil.value))
    if (!dt?.isValid || dt <= DateTime.now()) {
      toast.error('Pick a time in the future')
      return
    }
    if (await desk('snooze', { until: dt.toISO() })) {
      dialogs.snooze = false
      toast.success(`Snoozed until ${dt.formatDate('datetime')}`)
    }
  }
  async function unsnooze() {
    if (await desk('snooze', { until: null })) toast.success('Back in the inbox')
  }
  function openSpam() {
    spamLearn.value = { email: !!complaint.value?.customerEmail, domain: false, allBrands: false }
    dialogs.spam = true
  }
  async function submitSpam() {
    const res = await desk('spam', { learn: spamLearn.value })
    if (!res) return
    dialogs.spam = false
    const n = res.learned?.length ?? 0
    toast.success(
      n ? `Marked as spam — ${n} sender rule${n === 1 ? '' : 's'} learned` : 'Marked as spam',
    )
  }
  async function unspam() {
    if (await desk('unspam', { forget: true })) toast.success('Restored — learned rules removed')
  }
  async function resolve() {
    if (await lifecycle('resolve')) toast.success('Resolved')
  }
  async function hold() {
    if (await lifecycle('hold')) toast.success('On hold')
  }
  function openClose() {
    closeComment.value = ''
    dialogs.close = true
  }
  async function submitClose() {
    if (await lifecycle('close', { comment: closeComment.value.trim() || null })) {
      dialogs.close = false
      toast.success('Closed')
    }
  }
  async function reopen() {
    if (await lifecycle('reopen')) toast.success('Reopened')
  }
  function openConvert() {
    dialogs.convert = true
  }
  function converted(ncId) {
    dialogs.convert = false
    onConverted?.(ncId)
  }
  function openAudit() {
    dialogs.audit = true
  }

  const senderDomain = computed(() => {
    const e = complaint.value?.customerEmail || ''
    const at = e.lastIndexOf('@')
    return at >= 0 ? e.slice(at + 1).toLowerCase() : ''
  })

  // ── DetailActionBar list (same config as the classic ticket page) ────────
  const actions = computed(() =>
    buildComplaintActions(
      {
        isEditable: isEditable.value,
        canUpdate: canUpdate.value,
        canConvert: canConvert.value,
        statusId: complaint.value?.statusId,
        acting: acting.value,
        hasAssignee: !!complaint.value?.assignedTo,
        canViewAuditTrail: isAllowed(['audit_trail:read']),
        canTakeOver: canTakeOver.value,
        heldByOther: heldByOther.value,
        isSpam: !!complaint.value?.isSpam,
        isSnoozed: isSnoozed.value,
        isLiveChat: isLiveChat.value,
      },
      {
        endChat,
        takeOver,
        openSnooze,
        unsnooze,
        openSpam,
        unspam,
        accept,
        openAssign,
        resolve,
        hold,
        openClose,
        reopen,
        openConvert,
        openAudit,
      },
    ),
  )

  // `reactive` so consumers (and templates) read `ticket.isSnoozed`, not `.value`,
  // and `v-model="ticket.assignUserId"` writes through to the ref.
  return reactive({
    // state
    acting,
    error,
    dialogs,
    assignUserId,
    snoozeUntil,
    spamLearn,
    closeComment,
    senderDomain,
    // gates
    canUpdate,
    canConvert,
    canTakeOver,
    isEditable,
    isTerminal,
    heldByOther,
    isSnoozed,
    snoozedUntilLabel,
    isLiveChat,
    // verbs
    accept,
    assignTo,
    openAssign,
    submitAssign,
    takeOver,
    endChat,
    openSnooze,
    submitSnooze,
    unsnooze,
    openSpam,
    submitSpam,
    unspam,
    resolve,
    hold,
    openClose,
    submitClose,
    reopen,
    openConvert,
    converted,
    openAudit,
    actions,
  })
}
