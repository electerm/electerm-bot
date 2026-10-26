import { createRestAPIClient } from 'masto'
import { config } from '../config.js'

let masto = null
function getClient () {
  if (!masto) {
    masto = createRestAPIClient({
      url: config.mastodon.apiUrl,
      accessToken: config.mastodon.accessToken
    })
  }
  return masto
}

export async function post (text) {
  await getClient().v1.statuses.create({ status: text, visibility: 'public' })
}

export async function handleReplies (composeReply, canReply, countReply, isReplied) {
  const masto = getClient()
  const notes = await masto.v1.notifications.list({ types: ['mention'], limit: 25 })
  let handled = 0
  for (const n of notes) {
    const status = n.status
    if (!status) continue
    if (isReplied('mastodon', status.id)) continue
    if (!canReply()) break
    const text = (status.content || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const reply = await composeReply('mastodon', text, status.account.acct)
    if (!reply) continue
    console.log(`[mastodon] would reply to ${status.account.acct}: ${reply}`)
    if (!config.dryRun) {
      await masto.v1.statuses.create({
        status: `@${status.account.acct} ${reply}`,
        inReplyToId: status.id,
        visibility: status.visibility === 'public' ? 'public' : 'unlisted'
      })
    }
    countReply('mastodon', status.id)
    handled++
  }
  return handled
}
