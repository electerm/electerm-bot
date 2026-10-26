import { config } from './config.js'
import { chat, llmEnabled } from './llm.js'

// Turn a source item into a short social post.
// LLM-drafted when available, template fallback otherwise.

function template (item) {
  if (item.kind === 'release') {
    return `electerm ${item.version} released 🎉\n\n${item.url}\n\n#electerm #terminal #opensource`
  }
  return `New blog: ${item.title}\n\n${item.url}\n\n#electerm #terminal #ssh`
}

function clip (text, max = config.postMaxChars) {
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  // prefer to stop on a finished sentence instead of a dangling half-clause
  const sentence = cut.match(/[\s\S]*[.!?。！？](?=\s|$)/)
  if (sentence && sentence[0].length >= max * 0.55) return sentence[0].trim()
  return cut.replace(/\s+\S*$/, '') + '…'
}

// Guarantee the link survives: the model writes the body, we append the real
// URL ourselves, so it can never be clipped or invented.
function withLink (body, url, max = config.postMaxChars) {
  const tail = `\n\n${url}`
  if (!url) return clip(body, max)
  const room = max - tail.length
  if (room < 40) return url // pathological config: just the link
  return clip(body.trim(), room) + tail
}

export async function composePost (item) {
  if (llmEnabled()) {
    const text = await chat([
      {
        role: 'system',
        content: [
          'You write social media posts for electerm, an open-source terminal/ssh/sftp/RDP/VNC client (https://electerm.org).',
          'Rules:',
          `- Max ${config.postMaxChars - (item.url ? item.url.length + 2 : 0)} characters.`,
          '- Restrained, informative, friendly. No hype, no emojis spam (at most 1-2), no clickbait.',
          '- 2-3 relevant hashtags max (e.g. #electerm #ssh #opensource).',
          '- Do NOT write any URL — the link is appended automatically.',
          '- Output ONLY the post text.'
        ].join('\n')
      },
      {
        role: 'user',
        content: item.kind === 'release'
          ? `Write a post announcing electerm ${item.version}.\n\nRelease notes:\n${item.body}`
          : `Write a post sharing this blog article.\n\nTitle: ${item.title}\nExcerpt:\n${item.body}`
      }
    ], { maxTokens: 200 })
    if (text) return withLink(text, item.url)
  }
  return clip(template(item))
}

// Draft a reply to a mention/question. Returns '' when unsure — then we don't reply.
export async function composeReply (channel, message, author) {
  if (llmEnabled()) {
    const text = await chat([
      {
        role: 'system',
        content: [
          'You reply on behalf of electerm (open-source terminal/ssh/sftp/RDP/VNC client, https://electerm.org, GitHub: electerm/electerm).',
          'Rules:',
          `- Max ${Math.min(200, config.postMaxChars)} characters.`,
          '- Be helpful, concise and warm. Point to docs/site/GitHub issues when relevant.',
          '- If the message is spam, troll, or needs no answer, output exactly: SKIP',
          '- Never argue, never promise dates/features. Output ONLY the reply text.'
        ].join('\n')
      },
      {
        role: 'user',
        content: `Channel: ${channel}\nAuthor: ${author}\nMessage: ${message}`
      }
    ], { maxTokens: 150 })
    if (!text || /^SKIP$/i.test(text)) return ''
    return text.slice(0, Math.min(200, config.postMaxChars))
  }
  // No LLM: only send a safe canned answer for messages that look like real questions
  if (/\?\s*$/.test(message) && /electerm|ssh|sftp|terminal|vnc|rdp/i.test(message)) {
    return `Hi! Thanks for reaching out. For questions about electerm, please check https://electerm.org or open an issue at https://github.com/electerm/electerm/issues 💬`
  }
  return ''
}
