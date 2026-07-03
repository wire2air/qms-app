/**
 * Core entities that support admin-defined custom fields (v1).
 *
 * The `value` (entityType) is shared verbatim with the backend
 * (backend/api/services/customFields/entityRegistry.js) and stored on
 * entity_field_sets.entity_type / entity_field_values.entity_type. It is also
 * the `entityType` prop passed to <CustomFieldsCard> on each detail page.
 *
 * Keep this list in sync with the backend registry + the bootstrap seed
 * (CUSTOM_FIELD_SET_ENTITIES in bootstrapCompanyDefaults.js).
 */
export const CUSTOM_FIELD_ENTITIES = [
  { value: 'Nonconformance', label: 'Nonconformance' },
  { value: 'Capa', label: 'CAPA' },
  { value: 'ChangeRequest', label: 'Change Request' },
  { value: 'AuditInstance', label: 'Audit' },
  { value: 'Document', label: 'Document' },
  { value: 'Training', label: 'Training' },
  { value: 'CustomerComplaint', label: 'Customer Complaint' },
]

export function customFieldEntityLabel(entityType) {
  return CUSTOM_FIELD_ENTITIES.find((e) => e.value === entityType)?.label ?? entityType
}
