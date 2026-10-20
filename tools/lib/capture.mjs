// The headless-Chrome plumbing shared by tools/shoot.mjs, tools/viz-sheet.mjs
// and tools/record-demo.mjs: one capture at a time, a Chrome that is always
// killed, a profile that is always removed, and a reaper for whatever an
// earlier run left behind anyway.
//
// Written 2026-10-20, after the 2026-10-18 visualizer redo, when four agents
// each ran these tools in parallel on this 2-core/4-thread box:
//
//   - Four swiftshader Chromes at once ran at 0.2-0.8fps with the load at
//     27-178. Software GL is CPU-bound; two of them do not each get half the
//     box, they each get much less, and a tool that waits on rendered frames
//     waits longer for every capture another one is taking. Hence the LOCK:
//     one Chrome capture at a time across every process and worktree. It
//     lives outside any repo (~/.cache/signal/) so a worktree cannot hold a
//     private copy of it, and a waiter says who it is waiting on.
//   - Headless Chromes from two days earlier were still burning ~120% CPU
//     each. chrome.kill() signalled the main process only; when the node
//     side died first (an agent killed mid-run, a thrown error before the
//     finally) nothing signalled anything, and the orphan was reparented to
//     init and ran on. Hence: Chrome in its OWN process group, killed as a
//     group from try/finally, from SIGINT/SIGTERM/SIGHUP handlers and from
//     process 'exit'; plus a sweep for any process still naming our profile
//     dir, and its crashpad handler (which setsid()s out of the group).
//   - ~146 leaked /tmp/signal-shoot-* profiles filled the shared /tmp tmpfs
//     (EDQUOT), which killed a dev server and failed tests. Hence profiles
//     live under ~/.cache/signal/runs/, never /tmp, inside a run dir whose
//     name carries the owning pid and its start time, and the REAPER removes
//     any run dir whose owner is dead -- after killing any Chrome still
//     using it. Pid plus /proc start time, because a bare pid is reused.
//
// The reaper only ever touches processes whose command line names one of
// these tools' profile dirs (`--user-data-dir=<run dir>/profile`, or the
// legacy /tmp/signal-shoot-XXXXXX / signal-rec-XXXXXX shape), and the
// crashpad handlers those exact processes name. The user's own Chrome has
// neither, so it is never a candidate.
//
// Everything that decides (lock, staleness, which processes and dirs to
// reap) takes its inputs as parameters so tests/capture-lib.test.mjs can
// drive it without a Chrome, a /proc, or the real cache dir.

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const CACHE = process.env.SIGNAL_CAPTURE_HOME || path.join(os.homedir(), '.cache', 'signal')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// --- process identity --------------------------------------------------------

/** /proc start time (field 22, clock ticks since boot) of `pid`, or null. With
 *  the pid it names one process for its whole life; a pid alone can be reused. */
export function procStart(pid) {
  try {
    const s = fs.readFileSync(`/proc/${pid}/stat`, 'utf8')
    return s.slice(s.lastIndexOf(')') + 2).split(' ')[19] ?? null
  } catch { return null }
}

/** Is the process that wrote {pid, start} still running? EPERM means it exists
 *  under someone else, which still counts as alive. A start time that no longer
 *  matches means the pid was reused: the owner is dead. */
export function isAlive(pid, start) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try { process.kill(pid, 0) } catch (e) { if (e.code !== 'EPERM') return false }
  if (start != null) {
    const now = procStart(pid)
    if (now != null && now !== String(start)) return false
  }
  return true
}

export const me = () => ({ pid: process.pid, start: procStart(process.pid) })

/** Chrome rewrites its own argv into ONE space-joined string (setproctitle),
 *  so /proc/<pid>/cmdline of every Chrome process is a single "arg". Split it
 *  back before each `--flag`, which keeps a flag value with spaces in it
 *  (crashpad's "--database=.../Crash Reports") whole. Found the first time
 *  the reaper ran for real and matched nothing. */
export function normArgs(args) {
  return args.length === 1 && /\s--/.test(args[0]) ? args[0].split(/\s+(?=--)/) : args
}

/** Every process on the box as {pid, ppid, args}. Linux only (/proc). */
export function listProcs() {
  const out = []
  let ents = []
  try { ents = fs.readdirSync('/proc') } catch { return out }
  for (const e of ents) {
    if (!/^\d+$/.test(e)) continue
    try {
      const args = normArgs(fs.readFileSync(`/proc/${e}/cmdline`, 'utf8').split('\0').filter(Boolean))
      const stat = fs.readFileSync(`/proc/${e}/stat`, 'utf8')
      const ppid = +stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]
      out.push({ pid: +e, ppid, args })
    } catch { /* exited while we looked */ }
  }
  return out
}

// --- exit cleanup ------------------------------------------------------------
// Synchronous on purpose: 'exit' handlers cannot await, and a signal handler
// that awaits can be interrupted by the second Ctrl-C. Everything registered
// here must be safe to run twice (it is: kill and rm of things already gone).

const cleanups = new Set()
let handlersInstalled = false
function runCleanups() { for (const f of [...cleanups]) { try { f() } catch { /* exiting anyway */ } } cleanups.clear() }
export function onExit(fn) {
  if (!handlersInstalled) {
    handlersInstalled = true
    process.on('exit', runCleanups)
    for (const [sig, n] of [['SIGINT', 2], ['SIGTERM', 15], ['SIGHUP', 1]]) {
      process.on(sig, () => { runCleanups(); process.exit(128 + n) })
    }
  }
  cleanups.add(fn)
  return () => cleanups.delete(fn)
}

// --- the capture lock --------------------------------------------------------

export const LOCK_FILE = path.join(CACHE, 'capture.lock')
let held = 0            // re-entrant within one process: shoot.mjs takes it per session
let heldRelease = null

const describe = (h) => `pid ${h.pid}${h.tool ? ` (${h.tool}` : ''}${h.cwd ? ` in ${h.cwd}` : ''}${h.tool ? ')' : ''}${h.at ? `, since ${new Date(h.at).toLocaleTimeString()}` : ''}`

/**
 * Take the one-capture-at-a-time lock, waiting for whoever holds it. Returns a
 * release function. A holder whose pid is dead (or reused) is stale and is
 * broken; a waiter prints, once and then every minute, whom it is waiting on.
 */
export async function acquireLock({
  file = LOCK_FILE, tool = path.basename(process.argv[1] || 'node'), poll = 1000,
  log = (m) => console.error(m), alive = isAlive, self = me(), timeoutMs = Infinity, reentrant = true,
} = {}) {
  if (reentrant && held > 0 && file === LOCK_FILE) { held++; return releaseShared }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const body = JSON.stringify({ pid: self.pid, start: self.start, tool, cwd: process.cwd(), at: Date.now() }) + '\n'
  const t0 = Date.now()
  let lastSaid = 0, saidFor = null
  for (;;) {
    try {
      fs.writeFileSync(file, body, { flag: 'wx' })
      const release = () => {
        try { if (JSON.parse(fs.readFileSync(file, 'utf8')).pid === self.pid) fs.unlinkSync(file) } catch { /* gone */ }
      }
      const unhook = onExit(release)
      const done = () => { unhook(); release() }
      if (reentrant && file === LOCK_FILE) { held = 1; heldRelease = done; return releaseShared }
      return done
    } catch (e) { if (e.code !== 'EEXIST') throw e }
    let holder = null
    try { holder = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { /* mid-write or just removed */ }
    if (Date.now() - t0 > timeoutMs) throw new Error(`capture lock still held by ${holder ? describe(holder) : 'an unreadable lock file'} after ${Math.round(timeoutMs / 1000)}s`)
    if (holder && !alive(holder.pid, holder.start)) {
      log(`capture lock: holder ${describe(holder)} is dead -- breaking the stale lock`)
      breakStale(file, holder)
      // Yield before retrying: if the break could not happen (a lock dir we
      // cannot write), a bare `continue` spins the event loop and hangs.
      await sleep(10)
      continue
    }
    if (!holder) {
      // Unparseable: either being written this instant, or truncated by a
      // crash. Only the second survives a few seconds.
      try { if (Date.now() - fs.statSync(file).mtimeMs > 5000) breakStale(file, null) } catch { /* gone */ }
      await sleep(Math.min(poll, 200)); continue
    }
    const key = `${holder.pid}:${holder.start}`
    if (saidFor !== key || Date.now() - lastSaid > 60_000) {
      const waited = Math.round((Date.now() - t0) / 1000)
      log(`capture lock: waiting for ${describe(holder)}${waited ? ` -- ${waited}s so far` : ''}. One headless Chrome at a time; see tools/lib/capture.mjs.`)
      saidFor = key; lastSaid = Date.now()
    }
    await sleep(poll)
  }
}
function releaseShared() {
  if (held <= 0) return
  if (--held === 0) { const r = heldRelease; heldRelease = null; r && r() }
}

// Break a stale lock without stealing a fresh one: two waiters can both see
// the same dead holder, and the slower one's unlink would delete the lock the
// faster one has just taken. Rename is atomic, so move it aside, look at what
// was actually moved, and put it back if it was not the dead holder's.
function breakStale(file, holder) {
  const aside = `${file}.stale-${process.pid}-${Date.now()}`
  try { fs.renameSync(file, aside) } catch { return }
  let moved = null
  try { moved = JSON.parse(fs.readFileSync(aside, 'utf8')) } catch { /* unparseable: stale by definition */ }
  if (moved && holder && (moved.pid !== holder.pid || moved.start !== holder.start)) {
    try { fs.linkSync(aside, file) } catch { /* someone else holds it now; theirs wins */ }
  }
  try { fs.unlinkSync(aside) } catch { /* fine */ }
}

// --- run dirs (profile + scratch), and the reaper -----------------------------

export const RUNS = path.join(CACHE, 'runs')

/** A per-run dir under ~/.cache/signal/runs/, removed on exit. `profile` is the
 *  Chrome profile inside it; `work` is scratch for tiles and frames. */
export function makeRunDir(kind, { root = RUNS, self = me() } = {}) {
  fs.mkdirSync(root, { recursive: true })
  const dir = fs.mkdtempSync(path.join(root, `${kind}-${self.pid}-${self.start ?? 'x'}-`))
  fs.writeFileSync(path.join(dir, 'owner.json'), JSON.stringify({ pid: self.pid, start: self.start, kind, cwd: process.cwd(), argv: process.argv.slice(1), at: Date.now() }) + '\n')
  fs.mkdirSync(path.join(dir, 'work'))
  const remove = () => { try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* the reaper gets it */ } }
  const unhook = onExit(remove)
  return { dir, profile: path.join(dir, 'profile'), work: path.join(dir, 'work'), remove: () => { unhook(); remove() } }
}

/** The owner a run dir names: owner.json, else the name (kind-pid-start-xxxxxx). */
export function runOwner(dir) {
  try { const o = JSON.parse(fs.readFileSync(path.join(dir, 'owner.json'), 'utf8')); if (o.pid) return o } catch { /* fall through */ }
  const m = /-(\d+)-(\d+|x)-[^-]+$/.exec(path.basename(dir))
  return m ? { pid: +m[1], start: m[2] === 'x' ? null : m[2] } : null
}

const LEGACY_PROFILE = /^signal-(shoot|rec)-[A-Za-z0-9]{6}$/
const LEGACY_SCRATCH = /^signal-(shoot|rec|viz|guide|hero|visualizer|display-modes)-[A-Za-z0-9]{6}$/
// Cut at whitespace: a flag split back out of a joined title can carry the
// next positional (the URL) on its end. Profile paths here never hold spaces.
const userDataDir = (args) => args.find((a) => a.startsWith('--user-data-dir='))?.slice(16).split(/\s/)[0] ?? null
const isNode = (p) => !!p && /(^|\/)node(js)?$/.test(p.args[0] || '')

/** Every pid that belongs to a Chrome using a profile under `dirMatch`, plus the
 *  crashpad handlers those processes name (crashpad leaves the process group,
 *  so a group kill misses it -- and it is the one with the user's Crash Reports
 *  path on its command line, so it can only be found through its parent). */
export function chromePidsFor(procs, dirMatch) {
  const own = procs.filter((p) => { const d = userDataDir(p.args); return d != null && dirMatch(d) })
  const pids = new Set(own.map((p) => p.pid))
  for (const p of own) {
    const c = p.args.find((a) => a.startsWith('--crashpad-handler-pid='))
    if (c) { const n = +c.slice(23); if (n > 0) pids.add(n) }
  }
  return [...pids]
}

/**
 * Decide what to reap. Pure: returns { kill: [pid], remove: [dir], notes: [] }.
 *  1. A run dir under `runs` whose owner is dead: kill any process still using
 *     its profile, remove the dir.
 *  2. Legacy (pre-2026-10-20) Chromes on /tmp-style signal-shoot-/signal-rec-
 *     profiles whose main process is ORPHANED -- its parent is not a node
 *     process. A tool from an older checkout still running has a live node
 *     parent and is left alone.
 *  3. Legacy scratch/profile dirs in `legacyRoots`, older than `minAgeMs` and
 *     not named by any process that survives step 2.
 */
export function planReap({ runs = RUNS, legacyRoots = [], procs = [], alive = isAlive, now = Date.now(), minAgeMs = 3600_000, readdir = safeReaddir, stat = safeStat } = {}) {
  const kill = new Set(), remove = [], notes = []
  for (const name of readdir(runs)) {
    const dir = path.join(runs, name)
    const owner = runOwner(dir)
    if (owner && alive(owner.pid, owner.start)) continue
    const st = stat(dir)
    // An ownerless dir younger than a minute may be one mkdtemp'd this instant.
    if (!owner && st && now - st.mtimeMs < 60_000) continue
    for (const pid of chromePidsFor(procs, (d) => d === dir || d.startsWith(dir + path.sep))) kill.add(pid)
    remove.push(dir)
    notes.push(`stale run ${name} (owner pid ${owner?.pid ?? '?'} is gone)`)
  }
  const byPid = new Map(procs.map((p) => [p.pid, p]))
  const legacyMains = procs.filter((p) => {
    const d = userDataDir(p.args)
    return d && LEGACY_PROFILE.test(path.basename(d)) && !p.args.some((a) => a.startsWith('--type='))
  })
  for (const p of legacyMains) {
    if (isNode(byPid.get(p.ppid))) continue
    const d = userDataDir(p.args)
    for (const pid of chromePidsFor(procs, (x) => x === d)) kill.add(pid)
    notes.push(`orphaned headless Chrome ${p.pid} on ${d}`)
    // Its profile goes with it, wherever it was (agents ran with TMPDIR set
    // to their own scratch dirs). Its mtime is recent -- Chrome was writing
    // to it -- so the age rule below would otherwise keep it another hour.
    if (!remove.includes(d)) remove.push(d)
  }
  const inUse = new Set(procs.filter((p) => !kill.has(p.pid)).map((p) => userDataDir(p.args)).filter(Boolean))
  for (const root of legacyRoots) {
    for (const name of readdir(root)) {
      if (!LEGACY_SCRATCH.test(name)) continue
      const dir = path.join(root, name)
      if (inUse.has(dir) || remove.includes(dir)) continue
      const st = stat(dir)
      // A profile-shaped dir no process names is garbage after a moment (the
      // gap between an old tool's mkdtemp and its Chrome starting). A scratch
      // dir of tiles is named by no process even while in use, so it waits
      // out `minAgeMs` instead.
      const age = LEGACY_PROFILE.test(name) ? 120_000 : minAgeMs
      if (!st || !st.isDirectory() || now - st.mtimeMs < age) continue
      remove.push(dir)
    }
  }
  return { kill: [...kill], remove, notes }
}
function safeReaddir(d) { try { return fs.readdirSync(d) } catch { return [] } }
function safeStat(p) { try { return fs.statSync(p) } catch { return null } }

/** Plan and carry out a reap. Quiet unless it found something. */
export function reapStale({ log = (m) => console.error(m), ...opts } = {}) {
  const legacyRoots = [...new Set([os.tmpdir(), '/tmp'])]
  const plan = planReap({ legacyRoots, procs: listProcs(), ...opts })
  for (const pid of plan.kill) { try { process.kill(pid, 'SIGKILL') } catch { /* gone */ } }
  for (const dir of plan.remove) { try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* next time */ } }
  if (plan.kill.length || plan.remove.length) {
    log(`capture reaper: killed ${plan.kill.length} leftover Chrome process(es), removed ${plan.remove.length} stale dir(s)`)
    for (const n of plan.notes.slice(0, 8)) log(`  ${n}`)
  }
  return plan
}

// --- Chrome ------------------------------------------------------------------

// The inner google-chrome script first: /usr/bin/google-chrome-stable on this
// box splices ~/.config/chrome-flags.conf into the command line, which loaded
// the user's extensions (yt-dlp, h264ify...) into every capture Chrome.
export const CHROME = ['/opt/google/chrome/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/chrome']
  .find((p) => spawnSync('test', ['-x', p]).status === 0)

export const SWIFTSHADER_ARGS = [
  '--headless=new', '--remote-debugging-port=0', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-breakpad', '--disable-crash-reporter',
]

/**
 * Take the lock, reap, launch a headless swiftshader Chrome on `url` in its
 * own process group with a profile under ~/.cache/signal/runs/, and return
 * { wsUrl, port, run, close }. close() is idempotent and also runs on exit.
 * Port 0 = let Chrome pick, then read it back out of the profile: a fixed
 * port silently connected the NEXT run to the PREVIOUS Chrome once.
 */
export async function launchChrome({ kind = 'capture', url = 'about:blank', width = 1273, height = 952, args = [], lock = true } = {}) {
  if (!CHROME) throw new Error('No Chrome/Chromium binary found (see CHROME in tools/lib/capture.mjs).')
  const release = lock ? await acquireLock() : () => {}
  try { reapStale() } catch (e) { console.error(`capture reaper failed (continuing): ${e.message}`) }
  const run = makeRunDir(kind)
  const child = spawn(CHROME, [...SWIFTSHADER_ARGS, `--window-size=${width},${height}`, ...args,
    `--user-data-dir=${run.profile}`, url], { stdio: ['ignore', 'ignore', 'pipe'], detached: true })
  child.stderr.on('data', () => {})
  child.on('error', () => {})
  const killNow = () => {
    try { process.kill(-child.pid, 'SIGKILL') } catch { /* group gone */ }
    for (const pid of chromePidsFor(listProcs(), (d) => d === run.profile)) { try { process.kill(pid, 'SIGKILL') } catch { /* gone */ } }
  }
  const unhook = onExit(() => { killNow(); run.remove() })
  let closed = false
  const close = async () => {
    if (closed) return
    closed = true
    try { process.kill(-child.pid, 'SIGTERM') } catch { /* gone */ }
    await new Promise((r) => { if (child.exitCode !== null || child.signalCode) r(); else { child.once('exit', r); setTimeout(r, 3000) } })
    killNow()      // stragglers, and crashpad, which is not in the group
    await sleep(150) // let the kernel finish tearing them down before rm races their writes
    run.remove()
    unhook()
    release()
  }
  try {
    const portFile = path.join(run.profile, 'DevToolsActivePort')
    let port
    for (let i = 0; i < 120 && !port; i++) {
      if (fs.existsSync(portFile)) { const n = +fs.readFileSync(portFile, 'utf8').split('\n')[0]; if (n) port = n }
      if (!port) await sleep(250)
    }
    let wsUrl
    for (let i = 0; i < 80 && port && !wsUrl; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
        wsUrl = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl
      } catch { /* not up yet */ }
      if (!wsUrl) await sleep(250)
    }
    if (!wsUrl) throw new Error('chrome exposed no page target')
    return { wsUrl, port, run, close }
  } catch (err) { await close(); throw err }
}

/** A minimal CDP client over Node's global WebSocket: send(), on(event, fn), close(). */
export async function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  let seq = 0
  const pending = new Map(), handlers = new Map()
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id); pending.delete(msg.id)
      msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result)
    } else if (msg.method && handlers.has(msg.method)) handlers.get(msg.method)(msg.params)
  }
  ws.onclose = () => { for (const { rej } of pending.values()) rej(new Error('CDP connection closed')); pending.clear() }
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params }))
  })
  return { send, on: (method, fn) => handlers.set(method, fn), close: () => { try { ws.close() } catch { /* closed */ } } }
}

// --- the slowed page clock ---------------------------------------------------
// record-demo.mjs's trick (2026-09-22), shared: installed with
// Page.addScriptToEvaluateOnNewDocument before any page script runs, it slows
// Date.now, performance.now, the rAF timestamp and every timer delay by
// `slow`. The app believes it runs normally while the wall clock takes `slow`
// times as long, so each app-second is covered by `slow` x realFps rendered
// frames.
//
// 2026-10-20 -- the factor can CHANGE mid-run: assigning
// window.__signalClock = n rebases the clock so app time stays continuous
// and runs 1/n as fast from then on. viz-sheet settles each effect at full
// speed (warm-up is measured in app seconds, and at 1fps a slowed warm-up
// would take minutes) and slows only for the frames it captures. A timer
// already pending keeps the factor it was scheduled under.
export function slowClockScript(slow) {
  return `(() => {
  let rate = ${Number(slow) || 1}
  const realNow = Date.now.bind(Date)
  const realPerf = performance.now.bind(performance)
  const d0 = realNow() - realPerf()
  let baseReal = realPerf(), baseApp = baseReal
  const appPerf = () => baseApp + (realPerf() - baseReal) / rate
  Object.defineProperty(window, '__signalClock', {
    configurable: true,
    get: () => rate,
    set: (n) => { n = Number(n) > 0 ? Number(n) : 1; baseApp = appPerf(); baseReal = realPerf(); rate = n },
  })
  Date.now = () => Math.floor(d0 + appPerf())
  performance.now = appPerf
  const rAF = requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (cb) => rAF(() => cb(appPerf()))
  const sT = setTimeout.bind(window), sI = setInterval.bind(window)
  window.setTimeout = (fn, d, ...a) => sT(fn, (d || 0) * rate, ...a)
  window.setInterval = (fn, d, ...a) => sI(fn, (d || 0) * rate, ...a)
})()`
}
