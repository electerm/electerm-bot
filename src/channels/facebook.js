import { config } from '../config.js'

// Facebook Page posts via Graph API (plain fetch, no SDK).
// Requires: a Facebook Page + app with pages_manage_posts & pages_read_engagement,
// and a long-lived Page Access Token.

const API = 'https://graph.facebook.com/v21.0'

async function call (path, params = {}, method = 'GET') {
  const url = new URL(`${API}/${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url, { method })
  const data = await res.json()
  if (data.error) throw new Error(`facebook ${path}: ${data.error.message}`)
  return data
}

export async function post (text) {
  await call(`${config.facebook.pageId}/feed`, {
    message: text,
    access_token: config.facebook.pageToken
  }, 'POST')
}

// Scan comments on recent page posts and reply once each (rate-limited).
export async function handleReplies (composeReply, canReply, countReply, isReplied) {
  const posts = await call(`${config.facebook.pageId}/posts`, {
    fields: 'id,message,comments{message,from{name}}',
    limit: 5,
    access_token: config.facebook.pageToken
  })
  let handled = 0
  for (const p of posts.data || []) {
    for (const c of p.comments?.data || []) {
      if (isReplied('facebook', c.id)) continue
      if (!canReply()) return handled
      const reply = await composeReply('facebook', c.message || '', c.from?.name || 'user')
      if (!reply) continue
      console.log(`[facebook] would reply to ${c.from?.name}: ${reply}`)
      if (!config.dryRun) {
        await call(`${c.id}/comments`, {
          message: reply,
          access_token: config.facebook.pageToken
        }, 'POST')
      }
      countReply('facebook', c.id)
      handled++
    }
  }
  return handled
}
