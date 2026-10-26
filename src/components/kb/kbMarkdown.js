/**
 * Knowledge Base articles reference their images and files as
 * `kb-asset:<assetId>` (backend services/kbMarkdown.js), so content never
 * embeds a host. In the desk they are served to agents by the API's
 * authenticated route.
 */

/** The desk address of a knowledge base image or file. */
export function kbAssetUrl(assetId) {
  return `/api/v1/services/kb/assets/${assetId}`
}
