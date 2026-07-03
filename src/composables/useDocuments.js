import { post } from '@/api'

export function useDocuments() {
  async function setEffective(documentId, versionId) {
    const data = await post(
      `/v1/services/documents/${documentId}/versions/${versionId}/setEffective`,
      {},
    )
    return { version: data.version }
  }

  // `reviewers` is a `{ [stepId]: [userId, ...] }` map from the submit
  // dialog. The backend uses those picks verbatim per step (overriding
  // role expansion); ALL/ANY policy still applies at runtime. Omit /
  // pass null for automated callers — the backend falls back to
  // expanding step roles, the legacy behaviour.
  async function submitForReview(documentId, versionId, reviewers = null) {
    const body = reviewers ? { reviewers } : {}
    const data = await post(
      `/v1/services/documents/${documentId}/versions/${versionId}/submitForReview`,
      body,
    )
    return { version: data.version }
  }

  async function cancelReview(documentId, versionId) {
    const data = await post(
      `/v1/services/documents/${documentId}/versions/${versionId}/cancelReview`,
      {},
    )
    return { version: data.version }
  }

  // Hard-delete a DRAFT/REJECTED version. Requires an e-sign PIN
  // ({ method:'PIN', token }) and a free-text reason, both recorded in the
  // audit log. When it's the document's only version, the whole (draft)
  // document is deleted — `deletedDocument` says which happened.
  async function deleteDraftVersion(documentId, versionId, { method, token, reason }) {
    const data = await post(
      `/v1/services/documents/${documentId}/versions/${versionId}/delete`,
      { method, token, reason },
    )
    return { deletedDocument: !!data.deletedDocument }
  }

  return { setEffective, submitForReview, cancelReview, deleteDraftVersion }
}
