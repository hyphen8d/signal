// tools/ship.mjs -- shipping a branch through a PR (2026-10-20).
//
// Same discipline as admin-writes.test.mjs: a throwaway repo with a local
// bare `origin`, so nothing here can reach GitHub. Unlike that file, this
// one does not copy the real tree -- ship.mjs runs lint and the suite as
// subprocesses, and those are stubbed along with `gh` and the live site
// (an injected run() and fetch()), so each test drives the real git
// against a five-file repo and reads the outcome back off the remote.
//
// Each refusal here is one of the ways the hand-run sequence went wrong
// before the tool existed; see the header of tools/ship.mjs.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { makeCtx, realRun, pr, merge, verify, parsePrUrl, isAppFile } from '../tools/ship.mjs'
import { nextStamp, compareStamps } from '../tools/lib/stamp.mjs'

const sh = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}
const ident = (dir) => { sh(dir, 'config', 'user.email', 't@example.test'); sh(dir, 'config', 'user.name', 't') }
const put = (dir, rel, text) => { mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); writeFileSync(path.join(dir, rel), text) }
const stampOf = (dir, ref) => JSON.parse(sh(dir, 'show', `${ref}:build.json`)).build

/** origin (bare), `work` on a feature branch one commit ahead of main,
 *  `other` -- a second session's clone that can move main -- and `served`,
 *  the main checkout the dashboard serves. main carries two stamp commits,
 *  so "changed since the previous deploy" has something to mean. */
function fixture(t) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'signal-ship-'))
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const remote = path.join(tmp, 'remote.git')
  sh(tmp, 'init', '-q', '--bare', '-b', 'main', remote)
  const seed = path.join(tmp, 'seed')
  sh(tmp, 'init', '-q', '-b', 'main', seed); ident(seed)
  put(seed, 'build.json', JSON.stringify({ build: '2026-10-19.1' }) + '\n')
  put(seed, 'index.html', '<!doctype html>\n')
  put(seed, 'main.js', '// main\n')
  put(seed, 'program.js', '// v1\n')
  put(seed, 'README.md', '# readme\n')
  put(seed, 'tests/x.test.mjs', '\n')
  sh(seed, 'add', '-A'); sh(seed, 'commit', '-qm', 'base')
  put(seed, 'program.js', '// v2\n'); put(seed, 'tools/t.mjs', '//\n')
  sh(seed, 'add', '-A'); sh(seed, 'commit', '-qm', 'change')
  put(seed, 'build.json', JSON.stringify({ build: '2026-10-20.1' }) + '\n')
  sh(seed, 'commit', '-qam', 'Stamp 2026-10-20.1')
  sh(seed, 'remote', 'add', 'origin', remote); sh(seed, 'push', '-q', '-u', 'origin', 'main')
  const clone = (name) => { const d = path.join(tmp, name); sh(tmp, 'clone', '-q', remote, d); ident(d); return d }
  const work = clone('work'), other = clone('other'), served = clone('served')
  sh(work, 'switch', '-q', '-c', 'feature')
  put(work, 'main.js', '// main, changed on the branch\n')
  sh(work, 'commit', '-qam', 'feature work')
  return { tmp, remote, work, other, served }
}

/** Moves origin/main from the other clone: a stamp commit, as a parallel
 *  session's ship would land. */
function otherShips(fx, stamp) {
  sh(fx.other, 'pull', '-q', '--ff-only')
  put(fx.other, 'index.html', `<!doctype html><!-- ${stamp} -->\n`)
  put(fx.other, 'build.json', JSON.stringify({ build: stamp }) + '\n')
  sh(fx.other, 'commit', '-qam', `Stamp ${stamp}`)
  sh(fx.other, 'push', '-q')
}

/** A context whose `gh`, lint and suite are stubs and whose git is real.
 *  `calls` records every stubbed invocation. */
function ctxFor(fx, { gh = {}, node = {}, fetch, today = '2026-10-20', dryRun = false, timeoutMs = 60_000 } = {}) {
  const calls = []
  const logs = []
  let clock = 0
  const run = async (cmd, args, opts = {}) => {
    if (cmd === 'gh') {
      calls.push(['gh', ...args])
      const h = gh[args[1]]
      const r = typeof h === 'function' ? await h(args) : h
      return { code: 0, stdout: '', stderr: '', ...r }
    }
    if (cmd === 'node') {
      calls.push(['node', ...args])
      const key = args[0] === '--test' ? 'suite' : args[0]
      const h = node[key]
      const r = typeof h === 'function' ? await h(args) : h
      return { code: 0, stdout: '', stderr: '', ...r }
    }
    return realRun(cmd, args, { cwd: fx.work, ...opts, inherit: false })
  }
  const ctx = makeCtx({
    cwd: fx.work, run, fetch, dryRun, checkout: fx.served,
    today: () => today, log: (s) => logs.push(s),
    now: () => clock, sleep: async (ms) => { clock += ms },
    timeoutMs, intervalMs: 10_000, site: 'https://site.test/signal/',
  })
  return { ctx, calls, logs, said: () => logs.join('\n') }
}
const PR_URL = 'https://github.com/hyphen8d/signal/pull/4242'
const ghOk = { create: { stdout: `${PR_URL}\n` }, list: { stdout: '[]' } }

// ---------------------------------------------------------------------
// The stamp
// ---------------------------------------------------------------------
test('nextStamp beats the newest of the stamps it is given', () => {
  assert.equal(nextStamp(['2026-10-20.1', '2026-10-20.3'], '2026-10-20'), '2026-10-20.4')
  assert.equal(nextStamp(['2026-10-19.7'], '2026-10-20'), '2026-10-20.1')
  // A clock behind the stamp's writer counts up rather than going back.
  assert.equal(nextStamp(['2026-10-21.2'], '2026-10-20'), '2026-10-21.3')
  assert.equal(nextStamp([''], '2026-10-20'), '2026-10-20.1')
  assert.equal(compareStamps('2026-10-20.10', '2026-10-20.9'), 1, 'N compares as a number')
  assert.equal(compareStamps('1729000000000', '2026-01-01.1'), -1, 'a Date.now() fallback sorts below a real stamp')
})

// ---------------------------------------------------------------------
// pr: refusals
// ---------------------------------------------------------------------
test('pr refuses on main', async (t) => {
  const fx = fixture(t)
  sh(fx.work, 'switch', '-q', 'main')
  const { ctx, calls, said } = ctxFor(fx, { gh: ghOk })
  const r = await pr(ctx, { title: 'x' })
  assert.equal(r.code, 1)
  assert.match(said(), /on main/)
  assert.equal(calls.length, 0, 'nothing ran: no suite, no gh')
})

test('pr refuses a dirty tree, and runs nothing', async (t) => {
  const fx = fixture(t)
  put(fx.work, 'program.js', '// uncommitted\n')
  const { ctx, calls, said } = ctxFor(fx, { gh: ghOk })
  const r = await pr(ctx, { title: 'x' })
  assert.equal(r.code, 1)
  assert.match(said(), /not clean \(program\.js\)/)
  assert.equal(calls.length, 0)
  assert.equal(stampOf(fx.work, 'HEAD'), '2026-10-20.1', 'no stamp commit')
})

test('pr refuses a branch behind origin/main, with the merge advice', async (t) => {
  const fx = fixture(t)
  otherShips(fx, '2026-10-20.2')
  const { ctx, calls, said } = ctxFor(fx, { gh: ghOk })
  const r = await pr(ctx, { title: 'x' })
  assert.equal(r.code, 1)
  assert.match(said(), /missing 1 commit\(s\) from origin\/main/)
  assert.match(said(), /git merge origin\/main/)
  assert.equal(calls.length, 0)
})

test('pr refuses a branch with nothing origin/main lacks', async (t) => {
  const fx = fixture(t)
  sh(fx.work, 'reset', '-q', '--hard', 'origin/main')
  const { ctx, said } = ctxFor(fx, { gh: ghOk })
  assert.equal((await pr(ctx, { title: 'x' })).code, 1)
  assert.match(said(), /nothing to ship/)
})

test('pr stops when the suite fails, with nothing stamped or pushed', async (t) => {
  const fx = fixture(t)
  const { ctx, calls, said } = ctxFor(fx, { gh: ghOk, node: { suite: { code: 1 } } })
  const r = await pr(ctx, { title: 'x' })
  assert.equal(r.code, 1)
  assert.match(said(), /the suite failed -- nothing stamped/)
  assert.equal(sh(fx.work, 'log', '-1', '--format=%s'), 'feature work')
  assert.ok(!calls.some((c) => c[0] === 'gh' && c[2] === 'create'))
})

test('pr refuses when origin/main moves while the suite runs (re-fetch)', async (t) => {
  const fx = fixture(t)
  // A parallel session ships during our ~40s suite.
  const { ctx, said } = ctxFor(fx, { gh: ghOk, node: { suite: () => { otherShips(fx, '2026-10-20.2'); return { code: 0 } } } })
  const r = await pr(ctx, { title: 'x' })
  assert.equal(r.code, 1)
  assert.equal(r.step, 'refetch')
  assert.match(said(), /origin\/main moved while the suite ran/)
  assert.equal(sh(fx.work, 'log', '-1', '--format=%s'), 'feature work', 'not stamped')
})

// ---------------------------------------------------------------------
// pr: the happy path
// ---------------------------------------------------------------------
test('pr stamps newer than origin/main, pushes, and reads the PR number from gh', async (t) => {
  const fx = fixture(t)
  // The colleague case: main is already at .3 today, merged into the
  // branch; the branch's own build.json was at .1 when the branch began.
  otherShips(fx, '2026-10-20.3')
  sh(fx.work, 'fetch', '-q')
  sh(fx.work, 'merge', '-q', '--no-edit', 'origin/main')
  const { ctx, calls, said } = ctxFor(fx, { gh: ghOk })
  const r = await pr(ctx, { title: 'Feature', trailers: ['Co-Authored-By: X <x@example.test>'] })
  assert.equal(r.code, 0, said())
  assert.equal(r.stamp, '2026-10-20.4', 'strictly newer than origin/main')
  assert.equal(r.pr, 4242, 'the number gh printed, not a guess')
  assert.equal(stampOf(fx.remote, 'feature'), '2026-10-20.4', 'the stamp commit was pushed')
  assert.match(sh(fx.remote, 'log', '-1', '--format=%B', 'feature'), /^Stamp 2026-10-20\.4\n\nCo-Authored-By: X/)
  const create = calls.find((c) => c[0] === 'gh' && c[2] === 'create')
  assert.deepEqual(create.slice(3, 9), ['--base', 'main', '--head', 'feature', '--title', 'Feature'])
  assert.ok(calls.some((c) => c[0] === 'node' && c[1] === 'tools/lint-roster.js'), 'lint ran')
  assert.ok(calls.some((c) => c[0] === 'node' && c[1] === '--test'), 'the suite ran')
  // ...and it did not merge.
  assert.ok(!calls.some((c) => c[0] === 'gh' && c[2] === 'merge'), 'pr never merges by default')
  assert.match(said(), /node tools\/ship\.mjs merge 4242/)
  assert.equal(stampOf(fx.remote, 'main'), '2026-10-20.3', 'main untouched')
})

test('a build.json conflict resolved to the OLDER side still stamps above origin/main', async (t) => {
  const fx = fixture(t)
  await pr(ctxFor(fx, { gh: ghOk }).ctx, { title: 'Feature' })   // branch stamped .2
  otherShips(fx, '2026-10-20.5')                                   // main went to .5
  sh(fx.work, 'fetch', '-q')
  spawnSync('git', ['merge', '-q', '--no-edit', 'origin/main'], { cwd: fx.work })  // conflicts on build.json
  sh(fx.work, 'checkout', '--ours', 'build.json')                  // "take either side" -- the older one
  sh(fx.work, 'add', 'build.json'); sh(fx.work, 'commit', '-qm', 'merge main')
  assert.equal(stampOf(fx.work, 'HEAD'), '2026-10-20.2')
  const { ctx, said } = ctxFor(fx, { gh: { list: { stdout: JSON.stringify([{ number: 4242, url: PR_URL }]) } } })
  const r = await pr(ctx, {})
  assert.equal(r.code, 0, said())
  assert.equal(r.stamp, '2026-10-20.6', 'above origin/main, not merely above the branch')
})

test('pr is idempotent: a re-run reuses the stamp commit and the open PR', async (t) => {
  const fx = fixture(t)
  await pr(ctxFor(fx, { gh: ghOk }).ctx, { title: 'Feature' })
  const head = sh(fx.work, 'rev-parse', 'HEAD')
  const again = ctxFor(fx, { gh: { list: { stdout: JSON.stringify([{ number: 4242, url: PR_URL }]) } } })
  const r = await pr(again.ctx, {})
  assert.equal(r.code, 0, again.said())
  assert.equal(r.pr, 4242)
  assert.equal(sh(fx.work, 'rev-parse', 'HEAD'), head, 'no second stamp commit')
  assert.ok(!again.calls.some((c) => c[2] === 'create'), 'no second PR')
})

test('a PR number is parsed from either gh answer', () => {
  assert.deepEqual(parsePrUrl(`${PR_URL}\n`), { url: PR_URL, number: 4242 })
  assert.equal(parsePrUrl(`a pull request for branch "feature" into branch "main" already exists:\n${PR_URL}`).number, 4242)
  assert.equal(parsePrUrl('error: no commits'), null)
})

test('pr --dry-run plans the stamp and changes nothing', async (t) => {
  const fx = fixture(t)
  const { ctx, calls, said } = ctxFor(fx, { gh: ghOk, dryRun: true })
  const r = await pr(ctx, { title: 'x' })
  assert.equal(r.code, 0)
  assert.equal(r.stamp, '2026-10-20.2')
  assert.match(said(), /\[dry-run\] would re-fetch, then stamp 2026-10-20\.2/)
  assert.equal(sh(fx.work, 'log', '-1', '--format=%s'), 'feature work')
  assert.ok(!calls.some((c) => c[0] === 'node' || c[2] === 'create'))
  assert.throws(() => sh(fx.remote, 'rev-parse', 'feature'), 'nothing pushed')
})

// ---------------------------------------------------------------------
// merge
// ---------------------------------------------------------------------
/** A gh whose `pr merge` really merges into the bare remote (via the other
 *  clone), then exits however the test says -- the --delete-branch case
 *  printed a fatal error AFTER a successful merge. */
function ghMerging(fx, { exit = 0, doMerge = true } = {}) {
  return {
    view: () => ({ stdout: JSON.stringify({ number: 4242, url: PR_URL, state: 'OPEN', headRefName: 'feature', headRefOid: sh(fx.remote, 'rev-parse', 'feature'), baseRefName: 'main', isDraft: false }) }),
    merge: () => {
      if (doMerge) {
        sh(fx.other, 'pull', '-q', '--ff-only')
        sh(fx.other, 'fetch', '-q', 'origin', 'feature')
        sh(fx.other, 'merge', '-q', '--no-ff', '--no-edit', 'FETCH_HEAD')
        sh(fx.other, 'push', '-q')
      }
      return exit ? { code: exit, stderr: 'failed to delete local branch feature: fatal: cannot delete branch used by worktree' } : {}
    },
  }
}

test('merge confirms by origin/main, not by gh -- a fatal error after a real merge is a success', async (t) => {
  const fx = fixture(t)
  await pr(ctxFor(fx, { gh: ghOk }).ctx, { title: 'Feature' })
  const { ctx, calls, said } = ctxFor(fx, { gh: ghMerging(fx, { exit: 1 }) })
  const r = await merge(ctx, '4242')
  assert.equal(r.code, 0, said())
  assert.equal(r.merged, true)
  assert.equal(r.stamp, '2026-10-20.2')
  const m = calls.find((c) => c[2] === 'merge')
  assert.deepEqual(m.slice(1), ['pr', 'merge', '4242', '--merge'], 'plain --merge, no --delete-branch')
  // The served checkout was on main and clean: fast-forwarded.
  assert.equal(stampOf(fx.served, 'HEAD'), '2026-10-20.2')
  assert.match(said(), /node tools\/ship\.mjs verify 2026-10-20\.2/)
})

test('merge reports NOT merged when gh says success but origin/main lacks the head', async (t) => {
  const fx = fixture(t)
  await pr(ctxFor(fx, { gh: ghOk }).ctx, { title: 'Feature' })
  const { ctx, said } = ctxFor(fx, { gh: ghMerging(fx, { doMerge: false }) })
  const r = await merge(ctx, '4242')
  assert.equal(r.code, 1)
  assert.match(said(), /NOT merged/)
})

test('merge refuses a PR whose base moved since it was stamped', async (t) => {
  const fx = fixture(t)
  await pr(ctxFor(fx, { gh: ghOk }).ctx, { title: 'Feature' })   // stamps .2
  otherShips(fx, '2026-10-20.2')                                   // so does a colleague
  const { ctx, calls, said } = ctxFor(fx, { gh: ghMerging(fx) })
  const r = await merge(ctx, '4242')
  assert.equal(r.code, 1)
  assert.match(said(), /origin\/main has moved since it was stamped/)
  assert.ok(!calls.some((c) => c[2] === 'merge'), 'gh pr merge never ran')
})

test('the served checkout is left alone, with the command printed, when dirty', async (t) => {
  const fx = fixture(t)
  await pr(ctxFor(fx, { gh: ghOk }).ctx, { title: 'Feature' })
  put(fx.served, 'tools/roster-health.json', '{}\n')
  sh(fx.served, 'add', 'tools/roster-health.json')
  const { ctx, said } = ctxFor(fx, { gh: ghMerging(fx) })
  assert.equal((await merge(ctx, '4242')).code, 0)
  assert.equal(stampOf(fx.served, 'HEAD'), '2026-10-20.1', 'not moved')
  assert.match(said(), /uncommitted changes .* left alone\. When they are dealt with: git -C .* merge --ff-only origin\/main/)
})

// ---------------------------------------------------------------------
// verify
// ---------------------------------------------------------------------
/** A fake Pages site serving `files` (path -> Buffer|string) and a
 *  build.json that reads `stamps[i]` on the i-th poll (last one sticks).
 *  Records the requests so the cache-busting can be asserted. */
function fakeSite(stamps, files) {
  const reqs = []
  let poll = 0
  const fetch = async (url, init = {}) => {
    reqs.push({ url, init })
    const u = new URL(url)
    const rel = decodeURIComponent(u.pathname.replace(/^\/signal\//, ''))
    if (rel === 'build.json') {
      const build = stamps[Math.min(poll++, stamps.length - 1)]
      return { ok: true, status: 200, json: async () => ({ build }) }
    }
    if (!(rel in files)) return { ok: false, status: 404 }
    const b = Buffer.from(files[rel])
    return { ok: true, status: 200, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) }
  }
  return { fetch, reqs }
}

/** The fixture after a ship of the feature branch at 2026-10-20.2. */
async function merged(t) {
  const fx = fixture(t)
  await pr(ctxFor(fx, { gh: ghOk }).ctx, { title: 'Feature' })
  await merge(ctxFor(fx, { gh: ghMerging(fx) }).ctx, '4242')
  return fx
}
const mainFile = (fx, rel) => readFileSync(path.join(fx.served, rel))

test('verify: NOT LIVE when the stamp never appears before the timeout', async (t) => {
  const fx = await merged(t)
  const site = fakeSite(['2026-10-20.1'], {})
  const { ctx, said } = ctxFor(fx, { fetch: site.fetch, timeoutMs: 60_000 })
  const r = await verify(ctx, '2026-10-20.2')
  assert.equal(r.verdict, 'not-live')
  assert.equal(r.code, 2)
  assert.match(said(), /VERDICT: NOT LIVE/)
  const poll = site.reqs.find((q) => q.url.includes('build.json'))
  assert.match(poll.url, /build\.json\?t=\d+/, 'cache-busting query')
  assert.equal(poll.init.headers['Cache-Control'], 'no-cache', 'and a no-cache header')
})

test('verify: STAMP LIVE, CONTENT NOT when a changed file differs', async (t) => {
  const fx = await merged(t)
  const site = fakeSite(['2026-10-20.1', '2026-10-20.2'], { 'main.js': '// the previous main.js\n' })
  const { ctx, said } = ctxFor(fx, { fetch: site.fetch })
  const r = await verify(ctx, '2026-10-20.2')
  assert.equal(r.verdict, 'mismatch', said())
  assert.deepEqual(r.differs.map((d) => d.file), ['main.js'])
  assert.ok(site.reqs.some((q) => q.url.endsWith('main.js?v=2026-10-20.2')), 'fetched at ?v=<stamp>')
})

test('verify: LIVE when the stamp is up and every changed app file matches', async (t) => {
  const fx = await merged(t)
  const site = fakeSite(['2026-10-20.1', '2026-10-20.2'], { 'main.js': mainFile(fx, 'main.js') })
  const { ctx, said } = ctxFor(fx, { fetch: site.fetch })
  const r = await verify(ctx)
  assert.equal(r.verdict, 'live', said())
  assert.equal(r.code, 0)
  assert.deepEqual(r.files, ['main.js'], 'only what changed since the previous deploy; build.json and tools/ excluded')
})

test('isAppFile keeps what a browser fetches and drops repo furniture', () => {
  for (const f of ['main.js', 'visuals/flame.js', 'audio/x.mp3', 'index.html', 'fonts/a.bdf']) assert.ok(isAppFile(f), f)
  for (const f of ['tests/a.test.mjs', 'tools/ship.mjs', 'README.md', '.gitignore', 'package.json', 'build.json', 'screenshots/a.png']) assert.ok(!isAppFile(f), f)
})
