/**
 * Preset delay windows for DELAY workflow steps — shared by the builder's
 * delay config (WorkflowStepEditor) and the extend-delay dialogs so every
 * surface offers the same windows as the CAPA effectiveness-check scheduler.
 */
export const DELAY_PRESETS = [
  { label: '30 days', days: 30 },
  { label: '60 days', days: 60 },
  { label: '90 days', days: 90 },
  { label: '180 days', days: 180 },
  { label: '365 days', days: 365 },
]
