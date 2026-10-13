// Load qms-app/.env (if present) so the SHOTS_* / THEME / WORKERS settings in it
// apply. Variables already set in the shell win — `THEME=dark node …` still works.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

try {
  process.loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env'))
} catch {
  // no .env — defaults apply
}
