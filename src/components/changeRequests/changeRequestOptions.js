// Fixed (non-tenant) option sets for the Change Request intake attributes shown
// on the create form and the detail right rail. Stored on change_requests as
// STRING enums (see backend model changerequest.js). Kept here so the create
// form and the rail render identical labels.

export const CHANGE_NATURES = [
  { id: 'PLANNED', name: 'Planned' },
  { id: 'EMERGENCY', name: 'Emergency' },
]

export const CHANGE_DURATIONS = [
  { id: 'TEMPORARY', name: 'Temporary' },
  { id: 'PERMANENT', name: 'Permanent' },
]

// Yes/No flags (regulatory impact, customer notification). String-valued so they
// share the classification-style BaseSelect pattern.
export const YES_NO_OPTIONS = [
  { id: 'YES', name: 'Yes' },
  { id: 'NO', name: 'No' },
]

/** Resolve an option's display label, or null when unset/unknown. */
export function crOptionLabel(options, value) {
  return options.find((o) => o.id === value)?.name || null
}
