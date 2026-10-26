import { config } from './config.js'

// Minimal OpenAI-compatible chat client (no SDK needed).
// Returns plain text; returns '' on any error so callers can fall back to templates.

export function llmEnabled () {
  return Boolean(config.llm.baseUrl && config.llm.apiKey)
}

export async function chat (messages, { maxTokens = 300, temperature = 0.7 } = {}) {
  if (!llmEnabled()) return ''
  const body = {
    model: config.llm.model,
    messages,
    max_tokens: maxTokens,
    temperature
  }
  if (config.llm.thinking !== null) body.enable_thinking = config.llm.thinking
  try {
    const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.llm.apiKey}`
      },
      body: JSON.stringify(body)
    })
    if (!res.ok) {
      console.error('[llm] http', res.status, (await res.text()).slice(0, 300))
      return ''
    }
    const data = await res.json()
    const text = data?.choices?.[0]?.message?.content
    return (text || '').trim()
  } catch (e) {
    console.error('[llm] error:', e.message)
    return ''
  }
}
