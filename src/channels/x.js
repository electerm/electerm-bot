import { TwitterApi } from 'twitter-api-v2'
import { config } from '../config.js'

let client = null
function getClient () {
  if (!client) {
    client = new TwitterApi({
      appKey: config.x.appKey,
      appSecret: config.x.appSecret,
      accessToken: config.x.accessToken,
      accessSecret: config.x.accessSecret
    })
  }
  return client
}

export async function post (text) {
  await getClient().v2.tweet(text)
}

export async function handleReplies (composeReply, canReply, countReply, isReplied) {
  const client = getClient()
  const me = await client.v2.me()
  const mentions = await client.v2.userMentionTimeline(me.data.id, {
    max_results: 25,
    'tweet.fields': ['author_id', 'text']
  })
  let handled = 0
  const authors = mentions.includes?.users || []
  for (const tweet of mentions.tweets || []) {
    if (tweet.author_id === me.data.id) continue
    if (isReplied('x', tweet.id)) continue
    if (!canReply()) break
    const author = authors.find(a => a.id === tweet.author_id)?.username || 'user'
    const reply = await composeReply('x', tweet.text, author)
    if (!reply) continue
    console.log(`[x] would reply to @${author}: ${reply}`)
    if (!config.dryRun) {
      await client.v2.reply(reply, tweet.id)
    }
    countReply('x', tweet.id)
    handled++
  }
  return handled
}
