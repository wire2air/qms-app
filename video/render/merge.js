/**
 * Optional per-module reel (requirement 17): a module card followed by every
 * test video for that project, concatenated.
 *
 * Stream-copy only. Every input was produced by pipeline.js with the same
 * ENCODE_ARGS, so no re-encode is needed — which keeps a 20-test module reel to
 * a couple of seconds of work rather than a full transcode.
 */
import fs from 'node:fs'
import path from 'node:path'
import { run } from '../ffmpeg-bin.js'
import { DIRS, VIDEO, slugify, moduleDirs } from '../config.js'
import { renderModuleCard } from './cards.js'

/** Reuse the still→clip settings from pipeline.js via the same flags. */
async function cardClip(png, seconds, out) {
  await run(
    [
      '-loop', '1', '-i', png, '-t', String(seconds),
      '-vf', `scale=${VIDEO.width}:${VIDEO.height},format=yuv420p`,
      '-c:v', 'libx264', '-preset', VIDEO.preset, '-crf', String(VIDEO.crf),
      '-pix_fmt', 'yuv420p', '-r', String(VIDEO.fps), '-movflags', '+faststart', '-an',
      out,
    ],
    { label: 'module card' },
  )
  return out
}

export async function buildModuleReel(moduleName, tests, videosById) {
  const parts = tests.map((t) => videosById.get(t.id)?.finalPath).filter((p) => p && fs.existsSync(p))
  if (parts.length < 1) return null

  const workDir = path.join(DIRS.work, `module-${slugify(moduleName)}`)
  fs.mkdirSync(workDir, { recursive: true })

  const cardPng = await renderModuleCard(moduleName, tests, path.join(workDir, 'card.png'))
  const card = await cardClip(cardPng, 3, path.join(workDir, 'card.mp4'))

  const list = path.join(workDir, 'list.txt')
  fs.writeFileSync(
    list,
    [card, ...parts].map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'),
    'utf8',
  )

  const finalDir = moduleDirs(moduleName).final
  fs.mkdirSync(finalDir, { recursive: true })
  const out = path.join(finalDir, `_module-${slugify(moduleName)}.mp4`)
  await run(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out], {
    label: `module reel ${moduleName}`,
  })

  fs.rmSync(workDir, { recursive: true, force: true })
  return out
}
