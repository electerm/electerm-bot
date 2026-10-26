import { config } from '../config.js'
import { isSeen, lastSourceAt } from '../state.js'

// New electerm releases via GitHub API (not marked seen here — the poster does that after actually sending).
// Only returns releases published AFTER the last one we posted, so the bot
// never back-fills a backlog of old versions one per day.
// Returns [{ id, kind: 'release', version, title, body, url, publishedAt }]

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

export async function fetchNewReleases (limit = 1, { ignoreFloor = false } = {}) {
  const releases = await gh(`/repos/${config.releasesRepo}/releases?per_page=20`)
  const min = new Date(config.minReleaseDate).getTime()
  const floor = ignoreFloor ? 0 : lastSourceAt()
  return releases
    .filter(r => !r.draft && !r.prerelease)
    .filter(r => new Date(r.published_at).getTime() >= min)
    .filter(r => new Date(r.published_at).getTime() > floor)
    .filter(r => !isSeen(`release:${r.tag_name}`))
    .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
    .slice(0, limit)
    .map(r => ({
      id: `release:${r.tag_name}`,
      kind: 'release',
      version: r.tag_name,
      title: r.name || r.tag_name,
      body: (r.body || '').slice(0, 2000),
      url: r.html_url,
      publishedAt: r.published_at
    }))
}
