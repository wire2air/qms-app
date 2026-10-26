import { upload } from '@/api'

/**
 * Upload a file to the SUPPORT DESK's own storage (backend
 * services/supportStorage.js), never the QMS buckets of /v1/files/upload.
 * Everything a support screen stores goes through here: ticket attachments
 * picked before a ticket exists, and images embedded in replies, signatures
 * and outbound messages. The returned asset's `url` is the desk's file route
 * (/api/v1/services/supportDesk/files/<id>), served with the agent's permission.
 *
 * @param {File} file
 * @returns {Promise<{success: boolean, asset?: object, error?: string}>}
 */
export async function uploadSupportFile(file) {
  if (!file) return { success: false, error: 'No file provided' }
  const formData = new FormData()
  formData.append('file', file)
  const data = await upload('/v1/services/supportDesk/files', formData)
  return { success: true, asset: data.asset }
}

/**
 * The rich-text editor's image uploader for support screens
 * (BaseRichTextEditor `uploadImage` prop): the editor's { url, id, width, height } contract.
 */
export async function uploadSupportEditorImage(file) {
  const result = await uploadSupportFile(file)
  if (!result.success || !result.asset?.url) throw new Error(result.error || 'Upload failed')
  return { url: result.asset.url, id: result.asset.id ?? null, width: null, height: null }
}
