import { config } from '../config.js'

// Telegram via plain REST (no SDK needed).

async function call (method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${config.telegram.token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`telegram ${method}: ${data.description}`)
  return data.result
}

async function getMe () {
  return call('getMe', {})
}

export async function post (text) {
  // return the sent Message so callers can log/edit/delete it later
  return call('sendMessage', {
    chat_id: config.telegram.channelId,
    text,
    disable_web_page_preview: false
  })
}

// Scan recent updates for messages that mention the bot or reply to the bot, answer once each.
export async function handleReplies (composeReply, canReply, countReply, isReplied) {
  const me = await getMe()
  const { result: updates } = await call('getUpdates', { timeout: 0, allowed_updates: ['message'] })
  let handled = 0
  for (const u of updates) {
    const m = u.message
    if (!m || !m.text) continue
    const chatId = m.chat.id
    const isReplyToBot = m.reply_to_message?.from?.username === me.username
    const mentionsBot = m.text.includes(`@${me.username}`)
    if (!isReplyToBot && !mentionsBot) continue
    if (isReplied('telegram', m.message_id)) continue
    if (!canReply()) break
    const reply = await composeReply('telegram', m.text, m.from?.username || m.from?.first_name || 'user')
    if (!reply) continue
    console.log(`[telegram] would reply to ${m.from?.username}: ${reply}`)
    if (!config.dryRun) {
      await call('sendMessage', {
        chat_id: chatId,
        text: reply,
        reply_to_message_id: m.message_id
      })
    }
    countReply('telegram', m.message_id)
    handled++
  }
  return handled
}
