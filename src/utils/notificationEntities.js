/**
 * Frontend registry for the notification defaults UI. Mirrors the canonical
 * entity types the backend notification engine supports
 * (backend/worker/services/notificationEngine/entityRegistry.js).
 */
export const NOTIFICATION_ENTITIES = [
  { value: 'Nonconformance', label: 'Nonconformances' },
  { value: 'Capa', label: 'CAPAs' },
  { value: 'ChangeRequest', label: 'Change Requests' },
]

export function entityLabel(value) {
  return NOTIFICATION_ENTITIES.find((e) => e.value === value)?.label ?? value
}
