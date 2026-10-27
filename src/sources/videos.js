import { config } from '../config.js'
import { isSeen } from '../state.js'

// Videos from the electerm.org Bilibili season (bin/videos.json in the site repo).
// No watermark here: any video we have never posted is fair game, newest first.
// Returns [{ id, kind: 'video', slug, title, body, url, publishedAt }]

async function gh (path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'electerm-bot',
      ...(config.githubToken ? { authorization: `Bearer ${config.githubToken}` } : {})
    }
  })
  if (!res.ok) throw new Error(`github api ${res.status}: ${path}`)
  return res.json()
}

export async function fetchNewVideos (limit = 1) {
  const f = await gh(`/repos/${config.blogsRepo}/contents/bin/videos.json`)
  const data = JSON.parse(Buffer.from(f.content, 'base64').toString('utf8'))
  const videos = Array.isArray(data.videos) ? data.videos : []
  return videos
    .filter(v => v.videoSlug && !isSeen(`video:${v.videoSlug}`))
    .sort((a, b) => String(b.publishDate || '').localeCompare(String(a.publishDate || '')))
    .slice(0, limit)
    .map(v => ({
      id: `video:${v.videoSlug}`,
      kind: 'video',
      slug: v.videoSlug,
      title: v.titleEn || v.title || v.videoSlug,
      titleAlt: v.title || '',
      body: v.description || '',
      url: `${config.site}/videos/${v.videoSlug}/`,
      publishedAt: v.publishDate || ''
    }))
}
