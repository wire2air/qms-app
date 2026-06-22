import {
  IconLock, IconArchive, IconHourglass, IconClock, IconAlertTriangle, IconPencil,
} from '@tabler/icons-vue'

/** Common QMS record-state banners (SP-1 spec §3). Pure descriptor factories. */
export function readOnlyBanner(o = {}) {
  return {
    id: 'read-only',
    tone: 'neutral',
    icon: IconLock,
    title: o.title || 'Read-only',
    message: o.message ?? 'You don\'t have permission to edit this record.',
    dismissible: false,
  }
}

export function archivedBanner(o = {}) {
  return {
    id: 'archived',
    tone: 'warning',
    icon: IconArchive,
    title: o.title || 'Archived',
    message: o.message ?? 'This record is archived and read-only.',
    dismissible: false,
  }
}

export function approvalPendingBanner(o = {}) {
  return {
    id: 'approval-pending',
    tone: 'info',
    icon: IconHourglass,
    title: o.title || 'Approval pending',
    message: o.message ?? 'This record is awaiting approval.',
    dismissible: false,
  }
}

export function lockedBanner(o = {}) {
  return {
    id: 'locked',
    tone: 'warning',
    icon: IconLock,
    title: o.title || 'Locked',
    message: o.message ?? 'This record is locked while a workflow runs.',
    dismissible: false,
  }
}

export function workflowWaitingBanner(o = {}) {
  return {
    id: 'workflow-waiting',
    tone: 'info',
    icon: IconClock,
    title: o.title || 'Workflow waiting',
    message: o.message ?? 'A workflow step is waiting on an assignee.',
    dismissible: false,
  }
}

export function unsavedChangesBanner(o = {}) {
  return {
    id: 'unsaved-changes',
    tone: 'warning',
    icon: IconPencil,
    title: o.title || 'Unsaved changes',
    message: o.message ?? 'You have unsaved changes.',
    dismissible: false,
  }
}

export function validationIssuesBanner(count, o = {}) {
  return {
    id: 'validation-issues',
    tone: 'danger',
    icon: IconAlertTriangle,
    title: o.title || 'Validation issues',
    message: o.message ?? `${count} field${count === 1 ? '' : 's'} need attention.`,
    dismissible: false,
  }
}
