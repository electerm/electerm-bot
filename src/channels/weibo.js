import { config } from '../config.js'

// Weibo via open platform REST API (plain fetch).
// Requires: app registered & approved at open.weibo.com, OAuth2 access_token with
// statuses/update + comments permissions. Note: tokens expire (~90 days) unless
// the app is approved for long-term tokens — re-auth periodically.

const API = 'https://api.weibo.com/2'

async function call (path, params = {}, method = 'GET') {
  const url = new URL(`${API}/${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  url.searchParams.set('access_token', config.weibo.accessToken)
  const res = await fetch(url, { method })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`weibo ${path}: non-json response (${text.slice(0, 120)})`)
  }
  if (data.error_code) throw new Error(`weibo ${path}: ${data.error} (#${data.error_code})`)
  return data
}

export async function post (text) {
  // weibo strip URLs; keep it single status
  await call('statuses/update.json', { status: text }, 'POST')
}

// Scan @mentions and reply by commenting on the mentioned post (rate-limited).
export async function handleReplies (composeReply, canReply, countReply, isReplied) {
  const { statuses = [] } = await call('statuses/mentions.json', { count: 20 })
  let handled = 0
  for (const s of statuses) {
    if (isReplied('weibo', String(s.id))) continue
    if (!canReply()) return handled
    const plain = (s.text || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const reply = await composeReply('weibo', plain, s.user?.screen_name || 'user')
    if (!reply) continue
    console.log(`[weibo] would reply to @${s.user?.screen_name}: ${reply}`)
    if (!config.dryRun) {
      await call('comments/create.json', { id: s.id, comment: reply }, 'POST')
    }
    countReply('weibo', String(s.id))
    handled++
  }
  return handled
}
