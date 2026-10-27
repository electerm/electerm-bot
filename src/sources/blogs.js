import { config } from '../config.js'
import { isSeen } from '../state.js'

// Blog posts from the electerm.org repo (src/blogs/<slug>/en.md), newest first
// by last-commit date. Not marked seen here — the poster does that after sending.
// No watermark: every post we have never published is a candidate (blog backlog
// is meant to be shared), and `seen` alone keeps us from repeating one.
// Returns [{ id, kind: 'blog', slug, title, body, url, publishedAt }]

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

function pickTitle (md) {
  const m = md.match(/^#\s+(.+)$/m)
  return m ? m[1].trim() : ''
}

function pickExcerpt (md, len = 400) {
  const body = md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*`|\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return body.slice(0, len)
}

async function blogDate (slug) {
  try {
    const commits = await gh(`/repos/${config.blogsRepo}/commits?path=src/blogs/${slug}&per_page=1`)
    return commits[0]?.commit?.committer?.date || ''
  } catch {
    return ''
  }
}

async function blogContent (slug) {
  const f = await gh(`/repos/${config.blogsRepo}/contents/src/blogs/${slug}/en.md`)
  return Buffer.from(f.content, 'base64').toString('utf8')
}

export async function fetchNewBlogs (limit = 1) {
  const dirs = await gh('/repos/' + config.blogsRepo + '/contents/src/blogs')
  const slugs = dirs.filter(d => d.type === 'dir').map(d => d.name)
  const unseen = slugs.filter(s => !isSeen(`blog:${s}`))
  const dated = await Promise.all(unseen.map(async s => ({ slug: s, date: await blogDate(s) })))
  dated.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
  const out = []
  for (const { slug, date } of dated.slice(0, limit)) {
    const md = await blogContent(slug)
    out.push({
      id: `blog:${slug}`,
      kind: 'blog',
      slug,
      title: pickTitle(md) || slug,
      body: pickExcerpt(md),
      url: `${config.site}/blogs/${slug}/`,
      publishedAt: date
    })
  }
  return out
}
