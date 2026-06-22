// detailLayout.fixtures.js — mock data for BaseDetailLayout Storybook stories.
// No syncEngine dependency — plain objects only.

import {
  IconCheck,
  IconArchive,
  IconDownload,
  IconTrash,
  IconBuildingFactory2,
  IconShieldCheck,
  IconClipboardCheck,
  IconX,
} from '@tabler/icons-vue'

// ── Supplier fixtures ──────────────────────────────────────────────────────────

export const supplierActions = [
  { id: 'evaluate', label: 'Evaluate', icon: IconCheck, variant: 'primary', priority: 100, onSelect: () => {} },
  { id: 'archive', label: 'Archive', icon: IconArchive, priority: 60, onSelect: () => {} },
  { id: 'export', label: 'Export', icon: IconDownload, priority: 40, onSelect: () => {} },
  { id: 'delete', label: 'Delete', icon: IconTrash, variant: 'danger', priority: 10, onSelect: () => {} },
]

export const supplierTabs = [
  { value: 'overview', label: 'Overview' },
  { value: 'profile', label: 'Company Profile' },
  { value: 'locations', label: 'Locations', count: 4 },
  { value: 'documents', label: 'Documents', count: 12 },
  { value: 'evaluations', label: 'Evaluations', count: 3 },
  { value: 'activity', label: 'Activity' },
]

export const supplierRailCards = [
  {
    id: 'props',
    title: 'Properties',
    items: [
      { label: 'Owner', value: 'Jane Doe' },
      { label: 'Status', value: 'Active' },
      { label: 'Type', value: 'Manufacturer' },
    ],
  },
  {
    id: 'dates',
    title: 'Dates',
    items: [
      { label: 'Created', value: '12 Jun 2026' },
      { label: 'Updated', value: '2d ago' },
      { label: 'Next review', value: '12 Dec 2026' },
    ],
  },
  {
    id: 'related',
    title: 'Related',
    items: [
      { label: 'CAPAs', value: '2' },
      { label: 'Non-conformances', value: '1' },
      { label: 'Documents', value: '12' },
    ],
  },
]

export const supplierIcon = IconBuildingFactory2

// ── CAPA fixtures ──────────────────────────────────────────────────────────────

export const capaActions = [
  { id: 'approve', label: 'Approve', icon: IconShieldCheck, variant: 'primary', priority: 100, onSelect: () => {} },
  { id: 'reject', label: 'Reject', icon: IconX, variant: 'danger', priority: 90, onSelect: () => {} },
  { id: 'verify', label: 'Verify effectiveness', icon: IconClipboardCheck, priority: 50, onSelect: () => {} },
]

export const capaTabs = [
  { value: 'overview', label: 'Overview' },
  { value: 'rootcause', label: 'Root cause' },
  { value: 'actions', label: 'Actions', count: 5 },
  { value: 'verification', label: 'Verification', visible: () => true },
  { value: 'approvals', label: 'Approvals' },
  { value: 'activity', label: 'Activity' },
]

export const capaRailCards = [
  {
    id: 'props',
    title: 'Properties',
    items: [
      { label: 'Owner', value: 'Sam Lee' },
      { label: 'Priority', value: 'High' },
      { label: 'Stage', value: 'Verification' },
    ],
  },
  {
    id: 'approval',
    title: 'Approval',
    items: [
      { label: 'Approver', value: 'QA Manager' },
      { label: 'Status', value: 'Pending' },
    ],
  },
  {
    id: 'dates',
    title: 'Dates',
    items: [
      { label: 'Opened', value: '01 Jun 2026' },
      { label: 'Due', value: '30 Jun 2026' },
    ],
  },
]
