/**
 * Knowledge Base articles reference their images as `kb-asset:<assetId>`
 * (backend services/kbMarkdown.js), so content never embeds a host. In the
 * desk those images are served to agents by the API's authenticated route.
 */
const KB_ASSET_RE = /kb-asset:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi

/** The desk address of a knowledge base image. */
export function kbAssetUrl(assetId) {
  return `/api/v1/services/kb/assets/${assetId}`
}

/** Markdown with every `kb-asset:<id>` pointed at the desk's image route, for the editor's preview. */
export function kbPreviewMarkdown(md) {
  return String(md || '').replace(KB_ASSET_RE, (_, id) => kbAssetUrl(id.toLowerCase()))
}

/** 'Reset your password!' → 'reset-your-password' (as the server makes article addresses). */
export function kbSlugify(text) {
  return (
    String(text || '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 150)
      .replace(/-+$/g, '') || 'article'
  )
}
