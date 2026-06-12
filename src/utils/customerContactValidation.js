/**
 * Shared client-side validation for customer contact fields on complaints.
 * Email is optional — validated for format only when a value is present.
 * Mirrors the backend Zod rule in backend/api/schemas/customerComplaints.js.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateCustomerEmail(value) {
  const email = (value || '').trim()
  if (email && !EMAIL_RE.test(email)) return 'Enter a valid email address'
  return ''
}
