// Injection key for the BaseForm ↔ BaseField rules registry. BaseForm provides
// `{ register(field), unregister(field) }`; each BaseField registers a
// `{ id, label, error, validate }` entry so the form can collect per-field
// rule errors on submit. See 2026-06-24-form-field-rules-engine-design.md.
export const BaseFormRegistryKey = Symbol('BaseFormRegistry')
