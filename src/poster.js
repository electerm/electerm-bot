import { config, enabledChannels } from './config.js'
import { postedToday, update, today } from './state.js'
import { fetchNewReleases } from './sources/releases.js'
import { fetchNewBlogs } from './sources/blogs.js'
import { fetchNewVideos } from './sources/videos.js'
import { composePost } from './composer.js'
import * as telegram from './channels/telegram.js'
import * as bluesky from './channels/bluesky.js'
import * as mastodon from './channels/mastodon.js'
import * as x from './channels/x.js'
import * as facebook from './channels/facebook.js'
import * as weibo from './channels/weibo.js'

const channels = { telegram, bluesky, mastodon, x, facebook, weibo }

// Candidate order: a *fresh* release wins (watermarked by state, so old versions
// are ignored), then any blog post we never published, then any video we never
// published. Blogs and videos are already-shared material, so they carry no
// watermark — `seen` alone prevents repeats.
async function pickNext (opts = {}) {
  const sources = [
    ['release', () => fetchNewReleases(1, opts)],
    ['blog', () => fetchNewBlogs(1)],
    ['video', () => fetchNewVideos(1)]
  ]
  for (const [name, fn] of sources) {
    try {
      const item = (await fn())[0]
      if (item) return item
      console.log(`[pick] no unseen ${name}`)
    } catch (e) {
      console.error(`[pick] ${name} source failed:`, e.message)
    }
  }
  return null
}

// Compose today's post without sending or consuming state — for previewing.
export async function previewPost ({ force = false } = {}) {
  const item = await pickNext({ ignoreFloor: force })
  if (!item) {
    console.log('[preview] nothing new to post')
    return null
  }
  const text = await composePost(item)
  console.log(`[preview] source: ${item.id}`)
  console.log(`[preview] text:\n---\n${text}\n---`)
  return text
}

// Pick the next pending content and post it once to all channels.
export async function dailyPost ({ force = false } = {}) {
  if (!force && postedToday()) {
    console.log('[post] already posted today, skip')
    return null
  }
  const item = await pickNext({ ignoreFloor: force })
  if (!item) {
    console.log('[post] nothing new to post')
    return null
  }
  const text = await composePost(item)
  const active = enabledChannels()
  if (!active.length) {
    console.log('[post] no channel configured, nothing sent')
    return null
  }
  console.log(`[post] source: ${item.id}`)
  console.log(`[post] text:\n---\n${text}\n---`)
  let sent = 0
  for (const name of active) {
    try {
      if (config.dryRun) {
        console.log(`[post] DRY_RUN skip posting to ${name}`)
      } else {
        await channels[name].post(text)
        sent++
        console.log(`[post] posted to ${name}`)
      }
    } catch (e) {
      console.error(`[post] ${name} failed:`, e.message)
    }
  }
  if (!config.dryRun && sent === 0) {
    // every channel failed -> do not consume the item, retry next run
    console.error('[post] all channels failed, item kept for retry')
    return text
  }
  if (!config.dryRun) {
    update(s => ({
      ...s,
      lastPostDate: today(),
      lastPost: {
        id: item.id,
        kind: item.kind,
        text,
        at: new Date().toISOString(),
        // publication time of the source item — the floor for "is this release new?"
        sourceAt: item.publishedAt || ''
      },
      seen: { ...s.seen, [item.id]: new Date().toISOString() }
    }))
  }
  return text
}

// Scan mentions on all channels and reply (rate-limited, LLM-drafted).
export async function replyScan () {
  const { canReply, countReply, isReplied } = await import('./state.js')
  const { composeReply } = await import('./composer.js')
  const active = enabledChannels()
  for (const name of active) {
    try {
      const n = await channels[name].handleReplies(composeReply, canReply, countReply, isReplied)
      if (n) console.log(`[reply] ${name}: ${n} handled`)
    } catch (e) {
      console.error(`[reply] ${name} failed:`, e.message)
    }
  }
}
