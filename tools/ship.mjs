#!/usr/bin/env node
// Ship a BRANCH through a pull request (2026-10-20).
//
//   node tools/ship.mjs pr --title="..." [--body-file=F] [--skip-tests] [--merge]
//   node tools/ship.mjs merge <pr>
//   node tools/ship.mjs verify [<stamp>]
//   (every subcommand takes --dry-run; npm run ship -- <subcommand> ...)
//
// Why this exists beside the dashboard's SHIP. SHIP (tools/admin-server.mjs)
// commits the whole working tree ON main and pushes it, which is right for
// the operator at the dashboard and wrong for everyone else: sessions --
// Claude's, and Matt's from a terminal -- work on branches in worktrees and
// ship through a PR. That was a hand-run sequence, the same every time, and
// each of its steps has failed once:
//
//   - origin/main moves under you. Other sessions ship in parallel, and once
//     a colleague stamped the exact value about to be used -- which makes
//     the second deploy's stamp a no-op, so returning visitors keep the
//     cached build (main.js imports everything as ?v=<stamp>). So `pr`
//     re-fetches AFTER the suite and stamps strictly newer than origin/main
//     (tools/lib/stamp.mjs), and `merge` refuses a PR whose base has moved.
//   - the PR number was assumed rather than read. It is parsed from what
//     `gh pr create` prints, and nothing downstream guesses it.
//   - `gh pr merge --delete-branch` printed a fatal error AFTER the merge had
//     succeeded (its local cleanup tripped on a worktree). So: plain
//     `--merge`, and success is decided by `git fetch` + "is the PR head in
//     origin/main", never by gh's exit code or output.
//   - merging needs a human go-ahead. An automated classifier has refused
//     `gh pr merge` before, and the rule is never to route around a refusal.
//     So `pr` STOPS after the PR and prints the merge command; merging is its
//     own subcommand (or `pr --merge`), never a default.
//   - "deployed" was judged from the repo. `verify` asks the LIVE site:
//     build.json with a cache-busting query AND no-cache headers (Pages' CDN
//     says max-age=600) until the stamp appears, then every app file changed
//     since the previous deploy at ?v=<stamp>, byte-compared with origin/main.
//     A fresh stamp alone does not prove the content shipped.
//   - ~/Work/signal (what the admin dashboard serves) went stale after
//     merges. It is fast-forwarded only when it is on main and clean;
//     otherwise this prints what to run. Nothing here forces anything.
//
// Every subcommand is safe to re-run: `pr` reuses a stamp commit that is
// still newer than origin/main and an open PR for the branch; `merge` on a
// merged PR just confirms it; `verify` only reads.
//
// The functions take an injectable context (run, fetch, sleep, now, today,
// log) so tests/ship.test.mjs drives them against a throwaway repo with a
// local bare remote, a stubbed `gh` and a fake site.

import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePorcelain, inProgressBlockers } from './lib/git-checks.mjs'
import { compareStamps, nextStamp } from './lib/stamp.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(here, '..')
export const SITE = 'https://hyphen8d.github.io/signal/'

// ---------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------
/** Real process runner. `inherit` streams to the terminal (lint, the
 *  suite); otherwise output is collected, stdout also as raw bytes for
 *  `git show` of binary files. */
export function realRun(cmd, args, { cwd, inherit = false, timeoutMs = 0 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: inherit ? ['ignore', 'inherit', 'inherit'] : ['ignore', 'pipe', 'pipe'], timeout: timeoutMs || undefined })
    const out = [], err = []
    child.stdout?.on('data', (d) => out.push(d))
    child.stderr?.on('data', (d) => err.push(d))
    child.on('error', (e) => resolve({ code: 127, stdout: '', stderr: String(e.message), buf: Buffer.alloc(0) }))
    child.on('close', (code) => {
      const buf = Buffer.concat(out)
      resolve({ code: code ?? 1, stdout: buf.toString('utf8'), stderr: Buffer.concat(err).toString('utf8'), buf })
    })
  })
}

export function makeCtx(o = {}) {
  const cwd = o.cwd || REPO_ROOT
  return {
    cwd,
    dryRun: !!o.dryRun,
    site: (o.site || SITE).replace(/\/?$/, '/'),
    checkout: o.checkout ?? null,          // null = derive from git-common-dir
    run: o.run || ((cmd, args, opts = {}) => realRun(cmd, args, { cwd, ...opts })),
    fetch: o.fetch || globalThis.fetch,
    sleep: o.sleep || ((ms) => new Promise((r) => setTimeout(r, ms))),
    now: o.now || (() => Date.now()),
    today: o.today || (() => new Date().toISOString().slice(0, 10)),
    log: o.log || ((s) => console.log(s)),
    timeoutMs: o.timeoutMs ?? 15 * 60_000,
    intervalMs: o.intervalMs ?? 15_000,
  }
}

const say = (ctx, s) => ctx.log(`ship: ${s}`)
const git = (ctx, args, opts) => ctx.run('git', args, opts)
const out = (r) => r.stdout.trim()

async function stampAt(ctx, ref) {
  const r = await git(ctx, ['show', `${ref}:build.json`])
  if (r.code !== 0) return ''
  try { return String(JSON.parse(r.stdout).build || '') } catch (e) { return '' }
}
const isAncestor = async (ctx, a, b) => (await git(ctx, ['merge-base', '--is-ancestor', a, b])).code === 0

const behindAdvice = (branch) =>
  `bring it in on ${branch} with \`git merge origin/main\` (or \`git rebase origin/main\` if the branch was never pushed), ` +
  `then re-run ship pr. A build.json conflict is expected: take either side -- ship re-stamps above origin/main anyway.`

// ---------------------------------------------------------------------
// pr
// ---------------------------------------------------------------------
/** Everything that has to be true before a branch is worth testing and
 *  stamping. Shares the in-progress/unmerged checks with the dashboard's
 *  shipBlockers() (tools/lib/git-checks.mjs); the rest is the inverse of
 *  SHIP's: a branch rather than main, a CLEAN tree (a PR ships commits, so
 *  an uncommitted edit would be tested here and then left behind), and
 *  commits that origin/main does not have. */
export async function prBlockers(ctx) {
  const blockers = []
  const branch = out(await git(ctx, ['rev-parse', '--abbrev-ref', 'HEAD']))
  if (!branch || branch === 'HEAD') blockers.push('HEAD is detached -- check out the branch you mean to ship')
  else if (branch === 'main') blockers.push('on main -- ship.mjs ships a branch through a PR; create a branch (or use the dashboard\'s SHIP, which ships main)')
  const status = await git(ctx, ['status', '--porcelain'])
  const dirty = parsePorcelain(status.stdout)
  const gitDir = out(await git(ctx, ['rev-parse', '--git-dir'])) || '.git'
  blockers.push(...inProgressBlockers(ctx.cwd, gitDir, dirty))
  if (dirty.length && !blockers.some((b) => b.startsWith('unmerged'))) {
    blockers.push(`the working tree is not clean (${dirty.slice(0, 6).map((d) => d.file).join(', ')}${dirty.length > 6 ? ', ...' : ''}) -- commit it or set it aside; a PR ships commits, not the tree`)
  }
  if (blockers.length) return { branch, blockers }
  const f = await git(ctx, ['fetch', '--quiet', 'origin'])
  if (f.code !== 0) return { branch, blockers: [`could not fetch from origin: ${f.stderr.trim() || 'git fetch failed'}`] }
  if ((await git(ctx, ['rev-parse', '--verify', '--quiet', 'origin/main'])).code !== 0) {
    return { branch, blockers: ['origin/main does not exist here'] }
  }
  if (!(await isAncestor(ctx, 'origin/main', 'HEAD'))) {
    const n = out(await git(ctx, ['rev-list', '--count', 'HEAD..origin/main']))
    blockers.push(`${branch} is missing ${n} commit(s) from origin/main -- ${behindAdvice(branch)}`)
  } else if (out(await git(ctx, ['rev-list', '--count', 'origin/main..HEAD'])) === '0') {
    blockers.push(`nothing to ship -- ${branch} has no commits that origin/main does not`)
  }
  return { branch, blockers }
}

/** The open PR for this branch, if one exists (re-runs reuse it). */
async function openPrFor(ctx, branch) {
  const r = await ctx.run('gh', ['pr', 'list', '--head', branch, '--base', 'main', '--state', 'open', '--json', 'number,url'])
  if (r.code !== 0) return null
  try { const [pr] = JSON.parse(r.stdout || '[]'); return pr ? { number: pr.number, url: pr.url } : null } catch (e) { return null }
}

/** What `gh pr create` printed -> { number, url }. On success it prints the
 *  URL; when a PR already exists it fails and names that one's URL. */
export function parsePrUrl(text) {
  const m = /(https:\/\/\S+?\/pull\/(\d+))\b/.exec(String(text || ''))
  return m ? { url: m[1], number: Number(m[2]) } : null
}

/** The current stamp commit at HEAD, if HEAD is one and it still beats
 *  origin/main -- the re-run case, which must not stamp twice. */
async function reusableStamp(ctx, mainStamp) {
  const subject = out(await git(ctx, ['log', '-1', '--format=%s']))
  const m = /^Stamp (\S+)$/.exec(subject)
  if (!m) return null
  const local = await stampAt(ctx, 'HEAD')
  return local === m[1] && compareStamps(local, mainStamp) > 0 ? local : null
}

export async function pr(ctx, opts = {}) {
  const { title, bodyFile, skipTests = false, trailers = [] } = opts
  const pre = await prBlockers(ctx)
  const { branch } = pre
  say(ctx, `branch ${branch} -> PR into main`)
  if (pre.blockers.length) {
    for (const b of pre.blockers) say(ctx, `cannot ship: ${b}`)
    return { code: 1, step: 'preflight', blockers: pre.blockers }
  }
  const existing = await openPrFor(ctx, branch)
  if (existing) say(ctx, `PR #${existing.number} is already open for ${branch} (${existing.url}) -- it will be updated, not duplicated`)
  if (!existing && !title) {
    say(ctx, 'cannot ship: --title="..." is required to open a PR')
    return { code: 1, step: 'preflight', blockers: ['no title'] }
  }
  if (bodyFile && !existsSync(path.resolve(ctx.cwd, bodyFile))) {
    say(ctx, `cannot ship: --body-file ${bodyFile} does not exist`)
    return { code: 1, step: 'preflight', blockers: ['no body file'] }
  }

  const mainStampBefore = await stampAt(ctx, 'origin/main')
  if (ctx.dryRun) {
    const reuse = await reusableStamp(ctx, mainStampBefore)
    const planned = reuse || nextStamp([await stampAt(ctx, 'HEAD'), mainStampBefore], ctx.today())
    say(ctx, `[dry-run] would check stations.md, then ${skipTests ? 'SKIP lint and the suite' : 'run lint and the full suite'}`)
    say(ctx, `[dry-run] would re-fetch, then ${reuse ? `reuse the stamp commit for ${reuse}` : `stamp ${planned} (origin/main is at ${mainStampBefore || '(none)'}) and commit "Stamp ${planned}"`}`)
    say(ctx, `[dry-run] would push ${branch} and ${existing ? `update PR #${existing.number}` : 'open a PR with gh pr create'}`)
    return { code: 0, dryRun: true, stamp: planned, existing }
  }

  // stations.md is generated, and SHIP regenerates it on every deploy. A
  // branch that edited stations.js and forgot it would ship a stale doc.
  const md = await ctx.run('node', ['tools/stations-to-md.js'])
  if (md.code !== 0) { say(ctx, `stations.md generator failed:\n${md.stderr}`); return { code: 1, step: 'stations' } }
  if (out(await git(ctx, ['status', '--porcelain', '--', 'stations.md']))) {
    say(ctx, 'cannot ship: stations.md was out of date and has been regenerated -- review and commit it, then re-run')
    return { code: 1, step: 'stations' }
  }

  if (skipTests) {
    say(ctx, '!!!! --skip-tests: lint and the suite were NOT run. Say so in the PR. !!!!')
  } else {
    const tests = readdirSync(path.join(ctx.cwd, 'tests')).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => `tests/${f}`)
    for (const [label, cmd, args] of [
      ['lint', 'node', ['tools/lint-roster.js']],
      ['the suite', 'node', ['--test', ...tests]],
    ]) {
      say(ctx, `running ${label}`)
      const r = await ctx.run(cmd, args, { inherit: true })
      if (r.code !== 0) { say(ctx, `${label} failed -- nothing stamped, nothing pushed`); return { code: 1, step: label } }
    }
  }

  // Re-fetch AFTER the suite: it takes long enough for another session to
  // ship, and the stamp has to beat what origin/main is NOW.
  const f = await git(ctx, ['fetch', '--quiet', 'origin'])
  if (f.code !== 0) { say(ctx, `could not re-fetch: ${f.stderr.trim()}`); return { code: 1, step: 'fetch' } }
  if (!(await isAncestor(ctx, 'origin/main', 'HEAD'))) {
    say(ctx, `cannot ship: origin/main moved while the suite ran -- ${behindAdvice(branch)}`)
    return { code: 1, step: 'refetch' }
  }
  const mainStamp = await stampAt(ctx, 'origin/main')
  let stamp = await reusableStamp(ctx, mainStamp)
  if (stamp) say(ctx, `HEAD is already "Stamp ${stamp}", newer than origin/main's ${mainStamp} -- reusing it`)
  else {
    const local = await stampAt(ctx, 'HEAD')
    stamp = nextStamp([local, mainStamp], ctx.today())
    writeFileSync(path.join(ctx.cwd, 'build.json'), JSON.stringify({ build: stamp }) + '\n')
    say(ctx, `build.json: ${local || '(none)'} -> ${stamp} (origin/main is at ${mainStamp || '(none)'})`)
    const msg = [`Stamp ${stamp}`, ...(trailers.length ? ['', ...trailers] : [])].join('\n')
    for (const args of [['add', 'build.json'], ['commit', '-q', '-m', msg]]) {
      const r = await git(ctx, args)
      if (r.code !== 0) { say(ctx, `git ${args[0]} failed: ${r.stderr.trim()}`); return { code: 1, step: 'stamp' } }
    }
  }

  // Never forced. A rejected push means the remote branch has commits this
  // one does not; that is a person's call, not this tool's.
  const push = await git(ctx, ['push', '-u', 'origin', branch])
  if (push.code !== 0) {
    say(ctx, `push failed -- the stamp commit is local only:\n${push.stderr.trim()}`)
    say(ctx, `if origin/${branch} has commits you do not, pull them (git pull --no-rebase origin ${branch}) and re-run; ship never force-pushes`)
    return { code: 1, step: 'push', stamp }
  }

  let made = existing
  if (!made) {
    const args = ['pr', 'create', '--base', 'main', '--head', branch, '--title', title]
    if (bodyFile) args.push('--body-file', bodyFile)
    else args.push('--body', `Build stamp ${stamp}.`)
    const r = await ctx.run('gh', args)
    made = parsePrUrl(r.stdout) || parsePrUrl(r.stderr)
    if (!made) {
      say(ctx, `gh pr create failed and named no PR:\n${(r.stderr || r.stdout).trim()}`)
      return { code: 1, step: 'pr', stamp }
    }
    if (r.code !== 0) say(ctx, `gh pr create says one already exists -- using it`)
  }
  say(ctx, `PR #${made.number}: ${made.url}  (stamp ${stamp})`)
  say(ctx, 'NOT merged. Merging needs a human go-ahead; when you have it:')
  say(ctx, `    node tools/ship.mjs merge ${made.number}`)
  say(ctx, `then: node tools/ship.mjs verify ${stamp}`)
  const result = { code: 0, pr: made.number, url: made.url, stamp }
  if (opts.merge) return { ...result, merge: await merge(ctx, made.number) }
  return result
}

// ---------------------------------------------------------------------
// merge
// ---------------------------------------------------------------------
export async function merge(ctx, number) {
  if (!/^\d+$/.test(String(number || ''))) {
    say(ctx, 'usage: node tools/ship.mjs merge <pr-number>')
    return { code: 1, step: 'usage' }
  }
  const view = await ctx.run('gh', ['pr', 'view', String(number), '--json', 'number,url,state,headRefName,headRefOid,baseRefName,isDraft'])
  let info
  try { info = JSON.parse(view.stdout) } catch (e) {
    say(ctx, `could not read PR #${number}: ${(view.stderr || view.stdout).trim()}`)
    return { code: 1, step: 'view' }
  }
  const f = await git(ctx, ['fetch', '--quiet', 'origin'])
  if (f.code !== 0) { say(ctx, `could not fetch: ${f.stderr.trim()}`); return { code: 1, step: 'fetch' } }
  const head = info.headRefOid
  // The head commit may only exist on the remote branch.
  if ((await git(ctx, ['cat-file', '-e', `${head}^{commit}`])).code !== 0) {
    await git(ctx, ['fetch', '--quiet', 'origin', info.headRefName])
  }

  if (info.state === 'MERGED') {
    say(ctx, `PR #${number} is already merged -- confirming against origin/main`)
    return confirmMerged(ctx, info)
  }
  const refuse = (why) => { say(ctx, `will not merge PR #${number}: ${why}`); return { code: 1, step: 'refused', reason: why } }
  if (info.state !== 'OPEN') return refuse(`it is ${info.state}`)
  if (info.baseRefName !== 'main') return refuse(`its base is ${info.baseRefName}, not main`)
  if (info.isDraft) return refuse('it is a draft')
  // Both of these are "main moved since this PR was stamped". Merging it
  // anyway either conflicts on build.json or, worse, lands a stamp that is
  // not newer than the live one -- a deploy returning visitors never load.
  if (!(await isAncestor(ctx, 'origin/main', head))) {
    return refuse(`origin/main has moved since it was stamped -- on ${info.headRefName}: git merge origin/main && node tools/ship.mjs pr (re-stamps above main)`)
  }
  const [headStamp, mainStamp] = [await stampAt(ctx, head), await stampAt(ctx, 'origin/main')]
  if (compareStamps(headStamp, mainStamp) <= 0) {
    return refuse(`its stamp ${headStamp || '(none)'} is not newer than origin/main's ${mainStamp || '(none)'} -- run node tools/ship.mjs pr on ${info.headRefName} to re-stamp`)
  }
  if (ctx.dryRun) {
    say(ctx, `[dry-run] would run: gh pr merge ${number} --merge   (stamp ${headStamp} over ${mainStamp})`)
    return { code: 0, dryRun: true, stamp: headStamp }
  }
  // Plain --merge: --delete-branch's local cleanup has failed on a worktree
  // AFTER a successful merge, so its exit code is not evidence either way.
  say(ctx, `merging PR #${number} (stamp ${headStamp})`)
  const r = await ctx.run('gh', ['pr', 'merge', String(number), '--merge'])
  const said = (r.stdout + r.stderr).trim()
  if (said) say(ctx, `gh said (exit ${r.code}; not trusted either way): ${said}`)
  return confirmMerged(ctx, { ...info, stamp: headStamp })
}

async function confirmMerged(ctx, info) {
  const f = await git(ctx, ['fetch', '--quiet', 'origin'])
  if (f.code !== 0) { say(ctx, `could not fetch to confirm: ${f.stderr.trim()}`); return { code: 1, step: 'confirm' } }
  if (!(await isAncestor(ctx, info.headRefOid, 'origin/main'))) {
    say(ctx, `NOT merged: origin/main does not contain ${String(info.headRefOid).slice(0, 9)} (PR #${info.number})`)
    return { code: 1, step: 'confirm', merged: false }
  }
  const stamp = await stampAt(ctx, 'origin/main')
  say(ctx, `merged: origin/main is ${out(await git(ctx, ['rev-parse', '--short', 'origin/main']))} and contains PR #${info.number}'s head; build ${stamp}`)
  const ff = await fastForwardCheckout(ctx)
  say(ctx, `next: node tools/ship.mjs verify ${stamp}`)
  return { code: 0, merged: true, stamp, ff }
}

// ---------------------------------------------------------------------
// The served checkout (~/Work/signal)
// ---------------------------------------------------------------------
/** The admin dashboard serves the MAIN checkout, not this worktree, so a
 *  merge leaves it behind. Fast-forward it only when that is all it can
 *  mean: on main, clean, and a pure fast-forward. Anything else is printed
 *  as a command for a person -- the tree there is often dirtied by the
 *  health timer (roster-health.json), and that is not ours to resolve. */
export async function fastForwardCheckout(ctx) {
  let dir = ctx.checkout
  if (!dir) {
    const common = out(await git(ctx, ['rev-parse', '--path-format=absolute', '--git-common-dir']))
    dir = common ? path.dirname(common) : null
  }
  if (!dir || !existsSync(dir)) { say(ctx, 'no main checkout found to fast-forward'); return { action: 'none' } }
  const g = (args) => ctx.run('git', ['-C', dir, ...args])
  const cmd = `git -C ${dir} merge --ff-only origin/main`
  await g(['fetch', '--quiet', 'origin'])
  const branch = out(await g(['rev-parse', '--abbrev-ref', 'HEAD']))
  if ((await g(['merge-base', '--is-ancestor', 'origin/main', 'HEAD'])).code === 0 && branch === 'main') {
    say(ctx, `${dir} is already at origin/main`)
    return { action: 'current', dir }
  }
  if (branch !== 'main') {
    say(ctx, `${dir} is on "${branch}", not main -- left alone. To update it: git -C ${dir} switch main && ${cmd}`)
    return { action: 'advice', dir, reason: 'branch' }
  }
  const dirty = parsePorcelain((await g(['status', '--porcelain'])).stdout)
  if (dirty.length) {
    say(ctx, `${dir} has uncommitted changes (${dirty.map((d) => d.file).join(', ')}) -- left alone. When they are dealt with: ${cmd}`)
    return { action: 'advice', dir, reason: 'dirty' }
  }
  if (ctx.dryRun) { say(ctx, `[dry-run] would run: ${cmd}`); return { action: 'dry-run', dir } }
  const before = out(await g(['rev-parse', 'HEAD']))
  const r = await g(['merge', '--ff-only', '--quiet', 'origin/main'])
  if (r.code !== 0) {
    say(ctx, `fast-forward of ${dir} failed (it has commits origin/main does not?) -- left alone:\n${r.stderr.trim()}`)
    return { action: 'advice', dir, reason: 'diverged' }
  }
  say(ctx, `fast-forwarded ${dir} to origin/main`)
  const changed = out(await g(['diff', '--name-only', before, 'HEAD'])).split('\n')
  // network.html is re-read per request; route CODE needs a restart.
  if (changed.includes('tools/admin-server.mjs')) say(ctx, 'tools/admin-server.mjs changed -- run: systemctl --user restart signal-admin')
  return { action: 'ff', dir }
}

// ---------------------------------------------------------------------
// verify
// ---------------------------------------------------------------------
/** Files a visitor's browser fetches. Not tests, tooling, docs or repo
 *  furniture: Pages serves those too, but no deploy is judged by them. */
export function isAppFile(rel) {
  if (/^(tests|tools|screenshots|dist|\.github|\.claude)\//.test(rel)) return false
  const base = path.posix.basename(rel)
  if (base.startsWith('.') || base.startsWith('_')) return false
  if (/\.md$/i.test(base) || ['package.json', 'LICENSE', 'NOTICE', 'build.json'].includes(rel)) return false
  return true
}

/** App files changed on origin/main since the previous deploy, which is
 *  the commit before the last one that touched build.json. */
export async function changedAppFiles(ctx) {
  const stamps = out(await git(ctx, ['log', '--format=%H', '-n', '2', 'origin/main', '--', 'build.json'])).split('\n').filter(Boolean)
  const range = stamps.length === 2 ? [stamps[1], 'origin/main'] : null
  const list = range
    ? out(await git(ctx, ['diff', '--name-only', '--diff-filter=d', range[0], range[1]]))
    : out(await git(ctx, ['ls-tree', '-r', '--name-only', 'origin/main']))
  return list.split('\n').filter(Boolean).filter(isAppFile)
}

const NO_CACHE = { 'Cache-Control': 'no-cache', Pragma: 'no-cache' }

async function liveStamp(ctx) {
  try {
    const res = await ctx.fetch(`${ctx.site}build.json?t=${ctx.now()}`, { headers: NO_CACHE, cache: 'no-store' })
    if (!res.ok) return { error: `HTTP ${res.status}` }
    return { stamp: String((await res.json()).build || '') }
  } catch (e) { return { error: String(e?.message || e) } }
}

export async function verify(ctx, wanted) {
  const f = await git(ctx, ['fetch', '--quiet', 'origin'])
  if (f.code !== 0) { say(ctx, `could not fetch: ${f.stderr.trim()}`); return { code: 1, verdict: 'error' } }
  const mainStamp = await stampAt(ctx, 'origin/main')
  const target = wanted || mainStamp
  if (wanted && compareStamps(mainStamp, wanted) < 0) {
    say(ctx, `origin/main is at ${mainStamp}, older than ${wanted} -- is the PR merged? (node tools/ship.mjs merge <pr>)`)
    return { code: 1, verdict: 'not-merged' }
  }
  const files = await changedAppFiles(ctx)
  say(ctx, `expecting ${target} live at ${ctx.site} (origin/main is ${mainStamp}); ${files.length} app file(s) changed since the previous deploy`)
  if (ctx.dryRun) {
    say(ctx, `[dry-run] would poll ${ctx.site}build.json?t=<now> (no-cache) every ${ctx.intervalMs / 1000}s for up to ${ctx.timeoutMs / 1000}s`)
    for (const file of files) say(ctx, `[dry-run] would compare ${file}?v=<stamp> with origin/main`)
    await fastForwardCheckout(ctx)
    return { code: 0, dryRun: true, files }
  }

  const deadline = ctx.now() + ctx.timeoutMs
  let live = null, last = null, compared = null
  for (;;) {
    const r = await liveStamp(ctx)
    if (r.stamp !== last) { say(ctx, `live build.json: ${r.stamp ?? `(${r.error})`}`); last = r.stamp }
    if (r.stamp && compareStamps(r.stamp, target) >= 0) {
      live = r.stamp
      // The site is judged against the commit that carries the live stamp.
      // If someone shipped after us, origin/main may need a re-fetch.
      if (live !== mainStamp) await git(ctx, ['fetch', '--quiet', 'origin'])
      if (live === (await stampAt(ctx, 'origin/main'))) {
        compared = await compareFiles(ctx, live, files)
        if (!compared.length) break
      }
    }
    if (ctx.now() >= deadline) break
    await ctx.sleep(ctx.intervalMs)
  }

  let result
  if (!live) {
    say(ctx, `VERDICT: NOT LIVE -- ${target} never appeared in ${ctx.timeoutMs / 1000}s (last seen ${last || 'nothing'}). Pages may still be building; re-run verify.`)
    result = { code: 2, verdict: 'not-live', live: last }
  } else if (compared === null) {
    say(ctx, `VERDICT: UNKNOWN -- the site is at ${live}, which is not origin/main's stamp; nothing to compare it with`)
    result = { code: 1, verdict: 'unknown', live }
  } else if (compared.length) {
    for (const d of compared) say(ctx, `  differs: ${d.file} (${d.why})`)
    say(ctx, `VERDICT: STAMP LIVE, CONTENT NOT -- ${live} is served but ${compared.length} file(s) differ from origin/main`)
    result = { code: 1, verdict: 'mismatch', live, differs: compared }
  } else {
    say(ctx, `VERDICT: LIVE -- ${live} is served and all ${files.length} changed app file(s) match origin/main byte for byte`)
    result = { code: 0, verdict: 'live', live, files }
  }
  await fastForwardCheckout(ctx)
  return result
}

async function compareFiles(ctx, stamp, files) {
  const differs = []
  for (const file of files) {
    const want = await git(ctx, ['show', `origin/main:${file}`])
    let got
    try {
      const res = await ctx.fetch(`${ctx.site}${file.split('/').map(encodeURIComponent).join('/')}?v=${stamp}`, { headers: NO_CACHE, cache: 'no-store' })
      if (!res.ok) { differs.push({ file, why: `HTTP ${res.status}` }); continue }
      got = Buffer.from(await res.arrayBuffer())
    } catch (e) { differs.push({ file, why: String(e?.message || e) }); continue }
    const wantBuf = want.buf || Buffer.from(want.stdout)
    if (!got.equals(wantBuf)) differs.push({ file, why: `${got.length} bytes live, ${wantBuf.length} in origin/main` })
  }
  return differs
}

// ---------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------
export function parseArgs(argv) {
  const flags = {}, pos = [], trailers = []
  for (const a of argv) {
    if (!a.startsWith('--')) { pos.push(a); continue }
    const [k, ...v] = a.slice(2).split('=')
    if (k === 'trailer') trailers.push(v.join('='))
    else flags[k] = v.length ? v.join('=') : true
  }
  return { cmd: pos[0], pos: pos.slice(1), flags, trailers }
}

const USAGE = `usage:
  node tools/ship.mjs pr --title="..." [--body-file=F] [--skip-tests] [--trailer="Co-Authored-By: ..."] [--merge]
  node tools/ship.mjs merge <pr>          (only with a human go-ahead)
  node tools/ship.mjs verify [<stamp>] [--timeout=<s>] [--interval=<s>]
  every subcommand: --dry-run; --checkout=<dir> overrides the main checkout to fast-forward`

export async function main(argv, ctxOpts = {}) {
  const { cmd, pos, flags, trailers } = parseArgs(argv)
  const ctx = makeCtx({
    dryRun: !!flags['dry-run'],
    checkout: typeof flags.checkout === 'string' ? flags.checkout : null,
    site: typeof flags.site === 'string' ? flags.site : undefined,
    timeoutMs: flags.timeout ? Number(flags.timeout) * 1000 : undefined,
    intervalMs: flags.interval ? Number(flags.interval) * 1000 : undefined,
    ...ctxOpts,
  })
  if (cmd === 'pr') {
    return pr(ctx, { title: typeof flags.title === 'string' ? flags.title : null, bodyFile: typeof flags['body-file'] === 'string' ? flags['body-file'] : null, skipTests: !!flags['skip-tests'], merge: !!flags.merge, trailers })
  }
  if (cmd === 'merge') return merge(ctx, pos[0])
  if (cmd === 'verify') return verify(ctx, pos[0] || null)
  ctx.log(USAGE)
  return { code: cmd ? 1 : 0 }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((r) => { process.exitCode = r.code }, (e) => { console.error(e); process.exitCode = 1 })
}
