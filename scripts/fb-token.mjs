#!/usr/bin/env node
// Facebook Page Access Token 获取与体检工具（一次性/运维用，不参与 bot 运行）
//
// 用法：
//   node scripts/fb-token.mjs                 交互式：短命 user token -> 长期 page token
//   node scripts/fb-token.mjs --write         同上，成功后把结果写回 .env
//   node scripts/fb-token.mjs --check         体检 .env 里现有的 page token
//
// 也可全走参数（脚本化）：
//   node scripts/fb-token.mjs --app-id 123 --app-secret abc --token EAAG... --page 456
//
// 详细背景见 docs/facebook-setup.md

import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

const API = 'https://graph.facebook.com/v26.0'
const ENV_PATH = path.resolve(process.cwd(), '.env')

function parseArgs (argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) {
      out[key] = next
      i++
    } else {
      out[key] = true
    }
  }
  return out
}

function readEnv () {
  if (!fs.existsSync(ENV_PATH)) return {}
  const map = {}
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/)
    if (!m) continue
    map[m[1]] = m[2].replace(/\s+#.*$/, '').trim()
  }
  return map
}

function writeEnv (kv) {
  let text = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : ''
  for (const [k, v] of Object.entries(kv)) {
    const re = new RegExp(`^${k}=.*$`, 'm')
    if (re.test(text)) {
      text = text.replace(re, `${k}=${v}`)
    } else {
      if (text && !text.endsWith('\n')) text += '\n'
      text += `${k}=${v}\n`
    }
  }
  fs.writeFileSync(ENV_PATH, text)
}

async function graph (pathname, params = {}) {
  const url = new URL(`${API}/${pathname}`)
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    url.searchParams.set(k, v)
  }
  let res
  try {
    res = await fetch(url)
  } catch (err) {
    throw new Error(`请求 graph.facebook.com 失败（网络问题？）: ${err.message}`)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.error) {
    const e = data.error || {}
    const bits = [e.type, e.code ? `#${e.code}` : '', e.message].filter(Boolean)
    throw new Error(bits.join(' ') || `HTTP ${res.status}`)
  }
  return data
}

// appToken 缺省时只查主页信息（debug_token 必须有 app token，不能拿 page token 顶替）
async function inspect (pageId, pageToken, appToken) {
  const page = await graph(pageId, {
    fields: 'id,name,fan_count',
    access_token: pageToken
  })
  const info = {
    pageId: page.id,
    name: page.name,
    fans: page.fan_count,
    type: null,
    expires: null,
    scopes: null,
    appId: null
  }
  if (!appToken) return info

  const dbg = await graph('debug_token', {
    input_token: pageToken,
    access_token: appToken
  })
  const d = dbg.data || {}
  info.type = d.type
  info.expires = d.expires_at === 0
    ? 'never'
    : new Date(d.expires_at * 1000).toISOString()
  info.scopes = d.scopes || []
  info.appId = d.app_id
  return info
}

function report (info) {
  const NEED = ['pages_manage_posts', 'pages_read_engagement', 'pages_manage_engagement']
  const known = info.type !== null

  console.log('')
  console.log(`  主页        ${info.name} (${info.pageId})`)
  console.log(`  粉丝数      ${info.fans ?? '—'}`)
  console.log(`  token 类型  ${info.type ?? '未知（未提供 App Secret）'}`)
  console.log(`  有效期      ${info.expires ?? '未知（未提供 App Secret）'}`)
  console.log(`  所属应用    ${info.appId ?? '—'}`)
  console.log(`  权限        ${info.scopes ? info.scopes.join(', ') || '—' : '未知'}`)
  console.log('')

  const problems = []
  if (known && info.type !== 'PAGE') {
    problems.push('这不是 Page token —— 多半直接用了 user token，或 /me/accounts 那步没走')
  }
  if (known && info.expires !== 'never') {
    problems.push('token 有过期时间 —— 用的是短命链路，需要先用长命 user token 换一次')
  }
  const missing = info.scopes ? NEED.filter(s => !info.scopes.includes(s)) : []
  if (missing.length) {
    problems.push(`缺少权限：${missing.join(', ')}（回 use case 里加上后重新授权）`)
  }

  problems.forEach(p => console.log(`  ✗ ${p}`))
  if (!problems.length) {
    console.log(known
      ? '  ✓ 可以发帖和回复评论了。'
      : '  ✓ 主页可访问。想看有效期和权限，在 .env 里补上 FACEBOOK_APP_ID / FACEBOOK_APP_SECRET 再跑一次。')
  }
  console.log('')
  return problems.length === 0
}

async function check () {
  const env = readEnv()
  const pageId = env.FACEBOOK_PAGE_ID
  const token = env.FACEBOOK_PAGE_TOKEN
  if (!pageId || !token) {
    console.error('.env 里没有 FACEBOOK_PAGE_ID / FACEBOOK_PAGE_TOKEN，先跑一次不带 --check 的流程。')
    process.exit(1)
  }
  const appToken = env.FACEBOOK_APP_ID && env.FACEBOOK_APP_SECRET
    ? `${env.FACEBOOK_APP_ID}|${env.FACEBOOK_APP_SECRET}`
    : ''
  try {
    const info = await inspect(pageId, token, appToken)
    process.exit(report(info) ? 0 : 1)
  } catch (err) {
    console.error(`\n  ✗ 校验失败：${err.message}\n`)
    process.exit(1)
  }
}

async function ask (rl, question) {
  return (await rl.question(question)).trim()
}

async function main () {
  const args = parseArgs(process.argv.slice(2))
  if (args.check) return check()

  const rl = readline.createInterface({ input: stdin, output: stdout })
  try {
    console.log('\nFacebook Page Token 获取 — 需要三样输入：\n' +
      '  1) App ID / App Secret  → developers.facebook.com → 你的应用 → App settings → Basic\n' +
      '  2) 短命 user token      → developers.facebook.com/tools/explorer → Generate Access Token\n' +
      '     勾选主页后复制，1-2 小时内有效\n')

    const appId = args['app-id'] || await ask(rl, 'App ID: ')
    const appSecret = args['app-secret'] || await ask(rl, 'App Secret: ')
    const shortToken = args.token || await ask(rl, '短命 user token: ')

    if (!appId || !appSecret || !shortToken) {
      throw new Error('App ID / App Secret / token 都不能为空')
    }

    console.log('\n→ 换成 60 天长命 user token...')
    const long = await graph('oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortToken
    })
    if (!long.access_token) throw new Error('没拿到长命 token，检查 App ID / Secret / 短 token 是否匹配')
    const days = long.expires_in ? Math.round(long.expires_in / 86400) : null
    console.log(`  ok${days ? `（约 ${days} 天）` : ''}`)

    console.log('→ 列出这个账号管理的主页...')
    const me = await graph('me', { fields: 'id,name', access_token: long.access_token })
    const acc = await graph(`${me.id}/accounts`, {
      fields: 'id,name,access_token,tasks',
      limit: 100,
      access_token: long.access_token
    })
    const pages = acc.data || []
    if (!pages.length) {
      throw new Error('这个账号名下没有可用的主页。先建一个公共主页，或确认你是它的管理员。')
    }

    let page
    if (args.page) {
      page = pages.find(p => p.id === String(args.page))
      if (!page) {
        throw new Error(`账号下找不到 page id ${args.page}。可用：${pages.map(p => `${p.id}(${p.name})`).join(', ')}`)
      }
    } else if (pages.length === 1) {
      page = pages[0]
    } else {
      console.log('\n  可选主页：')
      pages.forEach((p, i) => console.log(`    [${i + 1}] ${p.name}  (${p.id})`))
      const pick = await ask(rl, `\n选哪个（1-${pages.length}）: `)
      const idx = Number(pick) - 1
      if (!Number.isInteger(idx) || !pages[idx]) throw new Error('选择无效')
      page = pages[idx]
    }

    const tasks = page.tasks || []
    const lacksContent = !tasks.includes('CREATE_CONTENT')
    const lacksModerate = !tasks.includes('MODERATE')
    if (lacksContent) console.log('  ! 你在该主页没有 CREATE_CONTENT 任务，发帖会失败')
    if (lacksModerate) console.log('  ! 你在该主页没有 MODERATE 任务，回复评论会失败')

    const info = await inspect(page.id, page.access_token, `${appId}|${appSecret}`)
    const good = report(info)

    console.log('  .env 里填这两行：\n')
    console.log(`FACEBOOK_PAGE_ID=${page.id}`)
    console.log(`FACEBOOK_PAGE_TOKEN=${page.access_token}\n`)

    if (args.write) {
      writeEnv({
        FACEBOOK_PAGE_ID: page.id,
        FACEBOOK_PAGE_TOKEN: page.access_token
      })
      console.log(`  已写入 ${path.relative(process.cwd(), ENV_PATH)}`)
      console.log('  下一步：npm run preview → npm run dry → 再把 DRY_RUN 改成 false\n')
    } else {
      console.log('  加 --write 可以直接写进 .env（已有同名行会被覆盖）\n')
    }

    process.exitCode = good ? 0 : 1
  } finally {
    rl.close()
  }
}

main().catch(err => {
  console.error(`\n  ✗ ${err.message}\n`)
  process.exit(1)
})
