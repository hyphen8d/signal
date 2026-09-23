// Records the demo video: screenshots/demo.mp4 and screenshots/demo.gif.
//
//   node tools/record-demo.mjs                      # against the dev server
//   node tools/record-demo.mjs --url=https://hyphen8d.github.io/signal/
//   node tools/record-demo.mjs --slow=8 --width=1120 --height=700
//   node tools/record-demo.mjs --keep                # leave the frames behind
//
// Needs a Chrome/Chromium and ffmpeg. Companion to tools/shoot.mjs, which
// takes the stills; this takes the moving picture, and the app is worth more
// in motion than in any still -- the dial sweeping, the lock, the phosphor
// trailing, an effect breathing.
//
// THE PROBLEM, measured rather than assumed: headless renders this app at
// 5-8fps (software GL; there is no GPU path -- --use-gl=egl gets a fast
// context with no WebGL2 at all, see shoot.mjs). Recording in real time gives
// a 6fps film of a 60fps toy.
//
// THE FIX: the page's own clock is slowed by `--slow` before any page script
// runs -- Date.now, performance.now, the rAF timestamp and every timer delay.
// The app believes it is running normally while the wall clock takes `slow`
// times as long, so each second of app time is covered by `slow` x realFps
// rendered frames. At ~6fps real and slow=6 that is ~35 frames per app-second,
// assembled at 35fps into correctly paced motion. Frames arrive over
// Page.startScreencast, not captureScreenshot in a loop: that managed 4.4
// frames per app-second, which is a slideshow however slow the clock is.
//
// EVERY STEP WAITS ON THE APP'S OWN STATE. The first cut used fixed sleeps
// and recorded 25 seconds of a set that never locked -- the dial wandered off
// station, [V] was refused because it needs a lock, and the tape was
// unusable. Sleeps guess; `until()` knows.
//
// WHAT IT CANNOT CAPTURE, and why a recording from a real desktop is still
// the better artefact if one is ever wanted: the audio (headless is muted),
// the live audio tap (so the visualizer runs on syntheticAudio, smoother than
// the real thing -- the same caveat shoot.mjs carries), and the track
// progress bar, which reads the YouTube player's own real-time clock and so
// runs `slow` times fast against everything else on screen.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const flag = (n, d) => { const h = args.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d }
const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(here, '..')
const SLOW = +flag('slow', 6)
const W = +flag('width', 960), H = +flag('height', 600)
const FPS = +flag('fps', 35)            // frames per app-second; see the header
const URL_ = flag('url', 'http://127.0.0.1:8000/?station=rise-up')
const SHOTS = path.join(ROOT, 'screenshots')
const OUT = path.join(tmpdir(), 'signal-demo-frames')
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const CHROME = ['/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chrome']
  .find((p) => spawnSync('test', ['-x', p]).status === 0)
const profile = mkdtempSync(path.join(tmpdir(), 'signal-rec-'))
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=0', `--window-size=${W},${H}`,
  '--no-first-run', '--no-default-browser-check', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
  '--hide-scrollbars', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] })
chrome.stderr.on('data', () => {})
const portFile = path.join(profile, 'DevToolsActivePort')
let port
for (let i = 0; i < 80 && !port; i++) {
  if (existsSync(portFile)) { const n = +readFileSync(portFile, 'utf8').split('\n')[0]; if (n) port = n }
  if (!port) await sleep(250)
}
let wsUrl
for (let i = 0; i < 80 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    wsUrl = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl
  } catch {}
  if (!wsUrl) await sleep(250)
}
const ws = new WebSocket(wsUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let seq = 0
const pending = new Map()
const onEvent = new Map()
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id); pending.delete(msg.id)
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result)
  } else if (msg.method && onEvent.has(msg.method)) {
    onEvent.get(msg.method)(msg.params)
  }
}
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params }))
})
const ev = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })
  return r.exceptionDetails ? 'THREW: ' + (r.exceptionDetails.exception?.description || '').slice(0, 140) : r.result?.value
}
const CODES = { p: 'KeyP', v: 'KeyV', g: 'KeyG', c: 'KeyC', n: 'KeyN', s: 'KeyS', b: 'KeyB', l: 'KeyL', e: 'KeyE', w: 'KeyW', Escape: 'Escape', ArrowRight: 'ArrowRight', ArrowLeft: 'ArrowLeft' }
const VK = { Escape: 27, ArrowRight: 39, ArrowLeft: 37 }
const key = async (k) => {
  const code = CODES[k] ?? ('Key' + k.toUpperCase())
  const vk = VK[k] ?? k.toUpperCase().charCodeAt(0)
  for (const type of ['keyDown', 'keyUp']) {
    await send('Input.dispatchKeyEvent', {
      type, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk,
      ...(type === 'keyDown' && k.length === 1 ? { text: k } : {}),
    })
  }
}

// --- the slowed clock, installed before any page script runs ---------------
const CLOCK = `(() => {
  const SLOW = ${SLOW}
  const realNow = Date.now.bind(Date)
  const realPerf = performance.now.bind(performance)
  const t0 = realNow(), p0 = realPerf()
  Date.now = () => t0 + (realNow() - t0) / SLOW
  performance.now = () => (realPerf() - p0) / SLOW
  const rAF = requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (cb) => rAF(() => cb(performance.now()))
  const sT = setTimeout.bind(window), sI = setInterval.bind(window)
  window.setTimeout = (fn, d, ...a) => sT(fn, (d || 0) * SLOW, ...a)
  window.setInterval = (fn, d, ...a) => sI(fn, (d || 0) * SLOW, ...a)
})()`

// Page.startScreencast pushes a frame whenever the page paints, with no
// round-trip per frame -- captureScreenshot in a loop managed 4.4 frames per
// app-second, which is a slideshow however slow the clock is.
let frame = 0
onEvent.set('Page.screencastFrame', (p) => {
  writeFileSync(path.join(OUT, String(frame++).padStart(5, '0') + '.jpg'), Buffer.from(p.data, 'base64'))
  send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {})
})
/** Let `appMs` of the app's own time pass, collecting whatever it paints. */
const roll = async (appMs, label) => {
  const before = frame
  await sleep(appMs * SLOW)
  console.log(`  ${label.padEnd(26)} ${frame - before} frames`)
}

try {
  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: CLOCK })
  await send('Page.navigate', { url: URL_ })
  for (let i = 0; i < 200; i++) { if (await ev('!!(window.screen0 && window.screen0.program)')) break; await sleep(250) }
  await sleep(4000)
  await send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: W, maxHeight: H, everyNthFrame: 1 })
  console.log('recording:')
  // Every step waits on the app's own state rather than a guessed sleep. The
  // first cut used fixed sleeps and recorded 25 seconds of a set that never
  // locked: the dial wandered, [V] was refused (it needs a locked station),
  // and the tape was unusable.
  const until = async (expr, label, tries = 400) => {
    for (let i = 0; i < tries; i++) {
      if (await ev(expr)) return true
      await sleep(250)
    }
    console.log(`  !! never became true: ${label}`)
    return false
  }
  await roll(1400, 'standby')
  await key('p')
  await until('window.screen0.program.mode === "locked"', 'locked')
  await until('window.screen0.program.playState === "playing"', 'playing')
  await roll(3500, 'boot, lock, first track')
  // A preset jump: the sweep and the lock, which is the set at its best.
  await key('5')
  await roll(4000, 'preset 5: sweep and lock')
  await key('g'); await roll(3000, 'guide')
  await key('Escape'); await roll(1200, 'back to the dial')
  await key('v')
  await sleep(1200 * SLOW)
  if (await ev('window.screen0.program.tapConsentOpen')) { await key('n'); await sleep(600 * SLOW) }
  await until('window.screen0.program.visualizerActive === true', 'visualizer open')
  await roll(5000, 'visualizer')
  await key('c'); await roll(2200, 'phosphor: amber')
  await key('c'); await roll(2200, 'phosphor: blue')
  await key('c'); await roll(1600, 'phosphor: mono')
  await key('e'); await roll(1800, 'back out to the dial')
  await send('Page.stopScreencast').catch(() => {})
  console.log(`\n${frame} frames`)
} finally { ws.close(); chrome.kill() }

// --- assemble ---------------------------------------------------------------
// The mp4 is the shareable one; the gif is for the README, cut from the
// window that carries the most motion (the locked dial into the visualizer
// and the phosphor cycle). GIF is the worst possible codec for CRT grain --
// every pixel changes every frame -- so it is short, small, few colours and
// undithered on purpose. 13MB at 600px/12fps/64 colours, 2.5MB like this.
const run = (args_, label) => {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args_], { stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${label}`)
}
const mp4 = path.join(SHOTS, 'demo.mp4')
const gif = path.join(SHOTS, 'demo.gif')
const pal = path.join(OUT, 'palette.png')
run(['-framerate', String(FPS), '-pattern_type', 'glob', '-i', path.join(OUT, '*.jpg'),
  '-c:v', 'libx264', '-crf', '28', '-preset', 'slow', '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', mp4], 'mp4')
const GIF_FROM = flag('gif-from', '13'), GIF_LEN = flag('gif-len', '8')
run(['-ss', GIF_FROM, '-t', GIF_LEN, '-i', mp4, '-vf',
  'fps=10,scale=480:-1:flags=lanczos,palettegen=max_colors=32', pal], 'palette')
run(['-ss', GIF_FROM, '-t', GIF_LEN, '-i', mp4, '-i', pal, '-lavfi',
  'fps=10,scale=480:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=none', gif], 'gif')
if (!args.includes('--keep')) rmSync(OUT, { recursive: true, force: true })
for (const f of [mp4, gif]) {
  console.log(`${path.relative(ROOT, f).padEnd(20)} ${(statSync(f).size / 1e6).toFixed(1)} MB`)
}
