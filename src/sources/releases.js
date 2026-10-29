import { config } from '../config.js'
import { isSeen, releaseFloor } from '../state.js'

// New electerm releases via GitHub API (not marked seen here — the poster does that after actually sending).
// Only returns releases published AFTER the newest one we have announced, so
// the bot never back-fills old versions and never re-announces one — even when
// the last post was a blog/video (those have their own, older dates).
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

// Publication time of the newest release we have already announced, taken from
// the release list itself. Self-healing: even if `releaseFloor` is missing or
// the state file was lost, anything already in `seen` still fences the rest.
export function announcedFloor (releases, seen = isSeen) {
  return releases.reduce((max, r) => {
    if (!seen(`release:${r.tag_name}`)) return max
    const t = new Date(r.published_at).getTime()
    return Number.isFinite(t) && t > max ? t : max
  }, 0)
}

export async function fetchNewReleases (limit = 1, { ignoreFloor = false } = {}) {
  const releases = (await gh(`/repos/${config.releasesRepo}/releases?per_page=30`))
    .filter(r => !r.draft && !r.prerelease)
  const min = new Date(config.minReleaseDate).getTime()
  const floor = ignoreFloor ? 0 : Math.max(releaseFloor(), announcedFloor(releases))
  return releases
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
