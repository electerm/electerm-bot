import fs from 'node:fs'
import { config } from './config.js'

function load () {
  try {
    return JSON.parse(fs.readFileSync(config.stateFile, 'utf8'))
  } catch {
    return {}
  }
}

let state = load()

export function getState () {
  return state
}

export function saveState () {
  fs.writeFileSync(config.stateFile, JSON.stringify(state, null, 2))
}

export function update (fn) {
  state = fn(state) || state
  saveState()
  return state
}

export function today () {
  return new Date().toISOString().slice(0, 10)
}

// has the daily post been made today (across all channels)?
export function postedToday () {
  return state.lastPostDate === today()
}

export function repliesToday () {
  const t = today()
  const r = state.replies || {}
  return (r.date === t) ? (r.count || 0) : 0
}

export function canReply () {
  return repliesToday() < config.repliesPerDay
}

export function countReply (channel, id) {
  const t = today()
  const r = (state.replies && state.replies.date === t)
    ? state.replies
    : { date: t, count: 0 }
  update(s => ({
    ...s,
    replies: { ...r, count: r.count + 1 },
    replied: { ...s.replied, [`${channel}:${id}`]: new Date().toISOString() }
  }))
}

export function isReplied (channel, id) {
  return Boolean(state.replied && state.replied[`${channel}:${id}`])
}

export function isSeen (key) {
  return Boolean(state.seen && state.seen[key])
}

export function markSeen (key) {
  update(s => ({ ...s, seen: { ...s.seen, [key]: new Date().toISOString() } }))
}

// High-water mark: the source publication time of the last item we actually
// posted. Anything published at or before this is old news — never post it.
// Falls back to the post time for states written before `sourceAt` existed.
export function lastSourceAt () {
  const raw = state.lastPost?.sourceAt || state.lastPost?.at || ''
  const t = raw ? new Date(raw).getTime() : 0
  return Number.isFinite(t) ? t : 0
}
