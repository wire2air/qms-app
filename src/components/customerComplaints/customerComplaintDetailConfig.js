import { IconClipboardList, IconTransform } from '@tabler/icons-vue'

/** Contextual banners for a Customer Complaint. Pure — caller resolves complaint + gate flags. */
export function buildComplaintBanners(complaint, { isEditable } = {}) {
  if (!complaint) return []
  const banners = []
  if (!isEditable && ['CLOSED', 'CONVERTED_TO_NC'].includes(complaint.statusId)) {
    banners.push({
      id: 'read-only',
      tone: 'neutral',
      title: 'Read-only',
      message: `This complaint is ${complaint.statusId === 'CONVERTED_TO_NC' ? 'converted to NC' : complaint.statusId.toLowerCase()} and read-only.`,
    })
  }
  return banners
}

/** Anchor-nav sections for the Complaint body. */
export function buildComplaintSections(_complaint) {
  return [{ id: 'details', label: 'Details' }]
}

/** Header action descriptors. gates = resolved booleans/strings; handlers = callbacks. */
export function buildComplaintActions(gates = {}, handlers = {}) {
  const { isEditable, canUpdate, canConvert, statusId, acting, hasAssignee } = gates
  return [
    {
      id: 'accept',
      label: 'Accept',
      variant: 'primary',
      priority: 100,
      visible: !!isEditable && !hasAssignee,
      disabled: !!acting,
      loading: !!acting,
      onSelect: handlers.accept,
    },
    {
      id: 'assign',
      label: hasAssignee ? 'Reassign' : 'Assign',
      variant: 'outline',
      priority: 90,
      visible: !!isEditable,
      disabled: !!acting,
      onSelect: handlers.openAssign,
    },
    {
      id: 'resolve',
      label: 'Resolve',
      variant: 'outline',
      priority: 80,
      visible: !!isEditable && statusId !== 'RESOLVED',
      disabled: !!acting,
      onSelect: handlers.resolve,
    },
    {
      id: 'hold',
      label: 'Hold',
      variant: 'outline',
      priority: 70,
      visible: !!isEditable && statusId !== 'ON_HOLD',
      disabled: !!acting,
      onSelect: handlers.hold,
    },
    {
      id: 'close',
      label: 'Close',
      variant: 'outline',
      priority: 60,
      visible: !!isEditable,
      disabled: !!acting,
      onSelect: handlers.openClose,
    },
    {
      id: 'reopen',
      label: 'Reopen',
      variant: 'outline',
      priority: 55,
      visible: !!canUpdate && ['CLOSED', 'RESOLVED'].includes(statusId),
      disabled: !!acting,
      onSelect: handlers.reopen,
    },
    {
      id: 'convertToNc',
      label: 'Convert to NC',
      icon: IconTransform,
      variant: 'primary',
      priority: 50,
      visible: !!canConvert && !!statusId && statusId !== 'CONVERTED_TO_NC',
      disabled: !!acting,
      onSelect: handlers.openConvert,
    },
    {
      id: 'audit',
      label: 'Audit Log',
      icon: IconClipboardList,
      variant: 'secondary',
      priority: 15,
      visible: true,
      onSelect: handlers.openAudit,
    },
  ]
}
