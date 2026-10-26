import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'

const bool = (v, d = false) => v === undefined || v === '' ? d : String(v).toLowerCase() === 'true'

const DATA_DIR = process.env.DATA_DIR || './data'

export const config = {
  dryRun: bool(process.env.DRY_RUN, true),
  llm: {
    baseUrl: (process.env.OPENAI_BASE_URL || '').replace(/\/+$/, ''),
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    // null = don't send enable_thinking at all (non-reasoning models / gateways
    // that reject unknown params). true/false = send it explicitly.
    thinking: process.env.LLM_THINKING === undefined || process.env.LLM_THINKING === ''
      ? null
      : bool(process.env.LLM_THINKING)
  },
  postMaxChars: Number(process.env.POST_MAX_CHARS || 280),
  repliesPerDay: Number(process.env.REPLIES_PER_DAY || 3),
  dailyPostTime: process.env.DAILY_POST_TIME || '09:30',
  replyScanMinutes: Number(process.env.REPLY_SCAN_MINUTES || 60),
  site: (process.env.SITE || 'https://electerm.org').replace(/\/+$/, ''),
  releasesRepo: process.env.RELEASES_REPO || 'electerm/electerm',
  blogsRepo: process.env.BLOGS_REPO || 'electerm/electerm.org',
  minReleaseDate: process.env.MIN_RELEASE_DATE || '2026-01-01T00:00:00Z',
  githubToken: process.env.GITHUB_TOKEN || '',
  dataDir: path.resolve(DATA_DIR),
  stateFile: path.join(path.resolve(DATA_DIR), 'state.json'),
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    channelId: process.env.TELEGRAM_CHANNEL_ID || ''
  },
  bluesky: {
    identifier: process.env.BLUESKY_IDENTIFIER || '',
    appPassword: process.env.BLUESKY_APP_PASSWORD || ''
  },
  mastodon: {
    apiUrl: (process.env.MASTODON_API_URL || '').replace(/\/+$/, ''),
    accessToken: process.env.MASTODON_ACCESS_TOKEN || ''
  },
  x: {
    appKey: process.env.X_APP_KEY || '',
    appSecret: process.env.X_APP_SECRET || '',
    accessToken: process.env.X_ACCESS_TOKEN || '',
    accessSecret: process.env.X_ACCESS_SECRET || ''
  },
  facebook: {
    pageId: process.env.FACEBOOK_PAGE_ID || '',
    pageToken: process.env.FACEBOOK_PAGE_TOKEN || ''
  },
  weibo: {
    accessToken: process.env.WEIBO_ACCESS_TOKEN || ''
  }
}

fs.mkdirSync(config.dataDir, { recursive: true })

export function enabledChannels () {
  const list = []
  const c = config
  if (c.telegram.token && c.telegram.channelId) list.push('telegram')
  if (c.bluesky.identifier && c.bluesky.appPassword) list.push('bluesky')
  if (c.mastodon.apiUrl && c.mastodon.accessToken) list.push('mastodon')
  if (c.x.appKey && c.x.appSecret && c.x.accessToken && c.x.accessSecret) list.push('x')
  if (c.facebook.pageId && c.facebook.pageToken) list.push('facebook')
  if (c.weibo.accessToken) list.push('weibo')
  return list
}
