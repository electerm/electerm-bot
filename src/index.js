import { config } from './config.js'
import { dailyPost, replyScan } from './poster.js'

// Long-running mode: daily scheduled post + periodic reply scanning.

const [h, m] = config.dailyPostTime.split(':').map(Number)
const cron = await import('node-cron')

console.log(`[bot] starting, dry_run=${config.dryRun}, daily post at ${config.dailyPostTime}, reply scan every ${config.replyScanMinutes}min`)

// on startup: post if not yet posted today, then scan replies once
dailyPost().catch(e => console.error('[bot] startup post failed:', e.message))
replyScan().catch(e => console.error('[bot] startup reply scan failed:', e.message))

cron.schedule(`${m} ${h} * * *`, () => {
  dailyPost().catch(e => console.error('[bot] daily post failed:', e.message))
})

setInterval(() => {
  replyScan().catch(e => console.error('[bot] reply scan failed:', e.message))
}, config.replyScanMinutes * 60 * 1000)
