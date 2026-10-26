import { config } from './config.js'
import { dailyPost, replyScan, previewPost } from './poster.js'

// One-shot mode for cron/systemd timers: `node src/run.js preview|post|reply`

const action = process.argv[2]

if (action === 'preview') {
  await previewPost()
} else if (action === 'post') {
  const text = await dailyPost({ force: config.dryRun })
  if (config.dryRun && text) console.log('[run] DRY_RUN: use `npm start` or set DRY_RUN=false to actually post')
} else if (action === 'reply') {
  await replyScan()
} else {
  console.error('usage: node src/run.js preview|post|reply')
  process.exit(1)
}
