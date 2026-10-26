import { AtpAgent } from '@atproto/api'
import { config } from '../config.js'

const agent = new AtpAgent({ service: 'https://bsky.social' })

let logged = false
async function ensureLogin () {
  if (logged) return
  await agent.login({
    identifier: config.bluesky.identifier,
    password: config.bluesky.appPassword
  })
  logged = true
}

export async function post (text) {
  await ensureLogin()
  await agent.post({ text })
}

export async function handleReplies (composeReply, canReply, countReply, isReplied) {
  await ensureLogin()
  const { data } = await agent.app.bsky.notification.listNotifications({ limit: 25 })
  let handled = 0
  for (const n of data.notifications) {
    if (n.reason !== 'mention' && n.reason !== 'reply') continue
    if (isReplied('bluesky', n.uri)) continue
    if (!canReply()) break
    const reply = await composeReply('bluesky', n.record.text, n.author.handle)
    if (!reply) continue
    console.log(`[bluesky] would reply to ${n.author.handle}: ${reply}`)
    if (!config.dryRun) {
      await agent.post({
        text: reply,
        reply: { root: n.record.reply?.root || { uri: n.uri, cid: n.cid }, parent: { uri: n.uri, cid: n.cid } }
      })
    }
    countReply('bluesky', n.uri)
    handled++
  }
  return handled
}
