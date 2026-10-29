import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'

const LOCK_FILE = path.join(config.dataDir, '.post.lock')
const LOCK_STALE_MS = 30 * 60 * 1000

// Disk is the source of truth. A long-running process (pm2) must never mutate a
// stale in-memory snapshot and overwrite what another run just wrote — that is
// how `seen` entries get lost and the same item gets posted twice.
let cache = { at: -1, value: {} }

function read () {
  let mtime = 0
  try {
    mtime = fs.statSync(config.stateFile).mtimeMs
  } catch {
    return {}
  }
  if (mtime === cache.at) return cache.value
  const raw = fs.readFileSync(config.stateFile, 'utf8')
  try {
    cache = { at: mtime, value: JSON.parse(raw) }
  } catch {
    // Memory lost. Never silently pretend "nothing was ever posted": park the
    // broken file and fence the release watermark at `now`, so only releases
    // published from here on can be announced.
    const bad = `${config.stateFile}.corrupt-${Date.now()}`
    try {
      fs.renameSync(config.stateFile, bad)
    } catch {}
    console.error(`[state] unreadable state.json, moved to ${bad}; release watermark fenced at now`)
    cache = {
      at: -1,
      value: {
        releaseFloor: new Date().toISOString(),
        recoveredAt: new Date().toISOString()
      }
    }
    save(cache.value)
  }
  return cache.value
}

function save (value) {
  const tmp = `${config.stateFile}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2))
  fs.renameSync(tmp, config.stateFile)
  try {
    cache = { at: fs.statSync(config.stateFile).mtimeMs, value }
  } catch {
    cache = { at: -1, value }
  }
}

export function getState () {
  return read()
}

export function saveState () {
  save(read())
}

export function update (fn) {
  const fresh = read()
  save(fn(fresh) || fresh)
  return read()
}

// Local calendar date (process TZ, pm2 sets TZ=Asia/Shanghai). Using the UTC
// date made the "posted today?" check disagree with the cron schedule.
export function today (d = new Date()) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Single-writer guard: a pm2 reload can briefly run two processes, and a manual
// `node src/run.js post` can overlap the daemon. Both would pick the same item.
export async function withLock (fn) {
  let fd
  try {
    try {
      const st = fs.statSync(LOCK_FILE)
      if (Date.now() - st.mtimeMs > LOCK_STALE_MS) fs.unlinkSync(LOCK_FILE)
    } catch {}
    fd = fs.openSync(LOCK_FILE, 'wx')
    fs.writeSync(fd, String(process.pid))
  } catch (e) {
    if (e.code === 'EEXIST') {
      console.log('[post] another run is already posting (lock held), skip')
      return null
    }
    throw e
  }
  try {
    return await fn()
  } finally {
    try {
      fs.closeSync(fd)
    } catch {}
    try {
      fs.unlinkSync(LOCK_FILE)
    } catch {}
  }
}

// has the daily post been made today (across all channels)?
export function postedToday () {
  return read().lastPostDate === today()
}

export function repliesToday () {
  const t = today()
  const r = read().replies || {}
  return (r.date === t) ? (r.count || 0) : 0
}

export function canReply () {
  return repliesToday() < config.repliesPerDay
}

export function countReply (channel, id) {
  const t = today()
  update(s => {
    const r = (s.replies && s.replies.date === t)
      ? s.replies
      : { date: t, count: 0 }
    return {
      ...s,
      replies: { ...r, count: r.count + 1 },
      replied: { ...s.replied, [`${channel}:${id}`]: new Date().toISOString() }
    }
  })
}

export function isReplied (channel, id) {
  const s = read()
  return Boolean(s.replied && s.replied[`${channel}:${id}`])
}

export function isSeen (key) {
  const s = read()
  return Boolean(s.seen && s.seen[key])
}

export function markSeen (key) {
  update(s => ({ ...s, seen: { ...s.seen, [key]: new Date().toISOString() } }))
}

export function unmarkSeen (key) {
  update(s => {
    const seen = { ...s.seen }
    delete seen[key]
    return { ...s, seen }
  })
}

function ms (iso) {
  const t = iso ? new Date(iso).getTime() : 0
  return Number.isFinite(t) ? t : 0
}

// Release watermark: the publication time of the newest release we announced.
// ONLY a release post may move this. Blog/video posts carry their own (often
// older) dates — letting them move the watermark used to drag it backwards and
// make an already-old release look "new" again, i.e. post it a second time.
export function releaseFloor () {
  return ms(read().releaseFloor)
}

// Claim an item *before* sending: written to disk first so a crash, a pm2 kill
// or a second process mid-send can never send the same item twice.
export function claimItem (item) {
  update(s => {
    const next = { ...s, seen: { ...s.seen, [item.id]: new Date().toISOString() } }
    const t = ms(item.publishedAt)
    if (item.kind === 'release' && t > ms(s.releaseFloor)) {
      next.releaseFloor = new Date(t).toISOString()
    }
    return next
  })
}
