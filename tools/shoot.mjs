// Regenerates screenshots/ by driving a real Chrome headlessly over the
// DevTools Protocol. Written 2026-08-26 after the guide's About page was
// rebuilt and its screenshot went stale -- by hand these are a chore, so they
// rot, so the README ends up showing a UI that no longer exists.
//
//   node tools/shoot.mjs                        # all four
//   node tools/shoot.mjs guide visualizer       # a named subset
//   node tools/shoot.mjs --url=http://localhost:8000   # against the dev server
//
// Needs a Chrome/Chromium binary and ImageMagick (`magick`). No npm deps:
// Node's global WebSocket speaks CDP directly.
//
// Three things about THIS app the capture has to respect. All three were
// found the hard way, and a shot that gets them wrong looks plausible rather
// than obviously broken, which is worse:
//
//   1. The CRT is WebGL2 and headless has no GPU, so ANGLE's software backend
//      is forced below. Without it the context fails and you screenshot a
//      blank page at exactly the right dimensions.
//   2. Phosphor persistence is per-FRAME (crt.js: the beam pass is
//      max(total, prev * decay)), and swiftshader renders far below 60fps.
//      Settling on wall-clock caught the STANDBY wordmark ghosting straight
//      through the guide's control table a full second after the keypress.
//      settleFrames() counts rAF ticks instead.
//   3. The set boots into STANDBY and [G] works from there (gated on
//      !_powerAnimating, so the cold-open flourish has to finish first), which
//      is why the guide shot never powers on and never starts playback.
//
// Playback DOES work headlessly -- verified reaching PLAYING on the real
// IFrame player -- but it needs --autoplay-policy=no-user-gesture-required,
// since nothing here is a real gesture as far as Chrome is concerned.

import { spawn, spawnSync } from 'node:child_process'
import { writeFileSync, mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.join(here, '..', 'screenshots')
const args = process.argv.slice(2)
const flag = (n, d) => { const h = args.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d }
const URL_ = flag('url', 'https://hyphen8d.github.io/signal/')
const W = 1273, H = 952, SCALE = 2   // 2x then downscaled: the aperture mask resolves far better

const CHROME = ['/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chrome']
  .find((p) => spawnSync('test', ['-x', p]).status === 0)
if (!CHROME) { console.error('No Chrome/Chromium binary found.'); process.exit(2) }

// Key codes for everything the shots press. e.key is what program.js switches
// on, but CDP needs the physical code and virtual keycode too or the event
// never reaches the page as a real keydown.
const KEYS = {
  p: ['KeyP', 80], g: ['KeyG', 71], v: ['KeyV', 86], c: ['KeyC', 67], n: ['KeyN', 78], y: ['KeyY', 89],
  2: ['Digit2', 50], 3: ['Digit3', 51],
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function session(fn) {
  const profile = mkdtempSync(path.join(tmpdir(), 'signal-shoot-'))
  const chrome = spawn(CHROME, [
    // Port 0 = let Chrome pick, then read it back out of the profile. A fixed
    // port silently connects the NEXT run to the PREVIOUS Chrome if that one
    // has not fully exited yet -- which reads as "window.screen0 never
    // appeared" against a stale about:blank, and cost a real debugging detour.
    '--headless=new', '--remote-debugging-port=0', `--window-size=${W},${H}`,
    '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--mute-audio', '--autoplay-policy=no-user-gesture-required',
    `--user-data-dir=${profile}`, URL_,
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  chrome.stderr.on('data', () => {})

  const portFile = path.join(profile, 'DevToolsActivePort')
  let port
  for (let i = 0; i < 80 && !port; i++) {
    if (existsSync(portFile)) {
      const n = +readFileSync(portFile, 'utf8').split('\n')[0]
      if (n) port = n
    }
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
  if (!wsUrl) { chrome.kill(); throw new Error('chrome exposed no page target') }

  const ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  let seq = 0
  const pending = new Map()
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id); pending.delete(msg.id)
      msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result)
    }
  }
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params }))
  })

  const api = {
    send,
    ev: async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result?.value,
    async key(k) {
      const [code, vk] = KEYS[k]
      for (const type of ['keyDown', 'keyUp']) {
        await send('Input.dispatchKeyEvent', {
          type, key: String(k), code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk,
          ...(type === 'keyDown' ? { text: String(k) } : {}),
        })
      }
    },
    /** Wait on rAF ticks, not milliseconds -- see note 2 up top. */
    async settleFrames(n = 240) {
      await api.ev('window.__f = 0; (function t(){ window.__f++; requestAnimationFrame(t) })()')
      for (let i = 0; i < 300; i++) { if ((await api.ev('window.__f')) > n) return; await sleep(100) }
    },
    /** Poll a page-side predicate until true. */
    async until(expr, tries = 60, gap = 500) {
      for (let i = 0; i < tries; i++) { if (await api.ev(expr)) return true; await sleep(gap) }
      return false
    },
    async png(file) {
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      writeFileSync(file, Buffer.from(shot.data, 'base64'))
    },
  }

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: SCALE, mobile: false })
  if (!await api.until('!!(window.screen0 && window.screen0.program)', 80, 250)) throw new Error('window.screen0 never appeared')
  await api.until('window.screen0.program._powerAnimating === false', 40, 150)
  await sleep(400)

  try { return await fn(api) } finally {
    ws.close()
    chrome.kill()
    // Chrome does not release the profile dir the instant it is signalled, and
    // an ENOTEMPTY here was masking the real error from the recipe above --
    // cleanup failure is never the interesting failure. Give it a beat, then
    // shrug it off; these live in os.tmpdir().
    await sleep(400)
    try { rmSync(profile, { recursive: true, force: true }) } catch { /* tmp, it can wait for a reboot */ }
  }
}

const magick = (args_) => {
  const r = spawnSync('magick', args_, { stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`magick failed: ${args_.join(' ')}`)
}

/** Power on and lock a preset, then wait for real playback. */
async function tuneTo(api, preset) {
  await api.key('p')
  if (!await api.until('window.screen0.program.poweredOn === true', 40, 250)) throw new Error('never powered on')
  await sleep(1200)
  await api.key(preset)
  if (!await api.until("window.screen0.program.playState === 'playing'", 60, 1000)) {
    throw new Error('playback never reached PLAYING -- headless needs --autoplay-policy=no-user-gesture-required')
  }
  await sleep(2500) // let the lock sequence's sweeps and text resolves finish
}

const RECIPES = {
  // [G] straight from STANDBY: no power-on, no playback. See note 3.
  async guide(api, tmp) {
    await api.key('g')
    if (!await api.ev('window.screen0.program.guideOpen')) throw new Error('guide did not open')
    await api.settleFrames()
    await api.png(path.join(tmp, 'f0.png'))
    return { tiles: ['f0.png'], out: 'guide.jpg' }
  },
  // README: "SIGNAL, locked onto COLD WAVE" -- preset 3 in freq order.
  async hero(api, tmp) {
    await tuneTo(api, 3)
    await api.settleFrames()
    await api.png(path.join(tmp, 'f0.png'))
    return { tiles: ['f0.png'], out: 'hero.jpg' }
  },
  // README: "DISTORTION FIELD's fire effect" -- preset 2, whose visual is FLAME.
  async visualizer(api, tmp) {
    await tuneTo(api, 2)
    await api.key('v')
    // First [V] offers the LINE INPUT card (headless Chromium reports a tab
    // tier). Decline it -- a capture prompt is not what this shot is of --
    // then wait out the '[A] = LINE IN' flash it leaves in the legend, which
    // would otherwise be frozen into the image.
    // Decline it -- a capture prompt is not what this shot is of.
    //
    // KNOWN LIMITATION, measured rather than assumed. A headless capture
    // cannot get a live audio tap: --auto-accept-this-tab-capture was tried
    // and program._au stayed false. So the effect runs on syntheticAudio(),
    // which is smooth by construction, and the flame reads as even horizontal
    // bands rather than the irregular tongues a real, music-driven tap makes.
    // It is honest -- it is exactly what a visitor who declines sees -- but it
    // undersells the effect. Framerate is NOT the cause: swiftshader runs this
    // at ~3fps, and forcing the real GL driver (--use-gl=egl) gets 61fps but
    // no WebGL2 context at all, so the app never mounts. If you want the
    // livelier image, take this one shot by hand in a real browser with [A]
    // patched in; every other shot here is faithful.
    if (await api.ev('window.screen0.program.tapConsentOpen')) await api.key('n')
    if (!await api.until('window.screen0.program.visualizerActive === true', 20, 250)) throw new Error('visualizer did not open')
    await sleep(4000) // outlast the '[A] = LINE IN' flash the decline leaves in the legend
    await api.settleFrames()
    await api.png(path.join(tmp, 'f0.png'))
    return { tiles: ['f0.png'], out: 'visualizer.jpg' }
  },
  // README: "Classic Amber, Cyber Blue, Monochrome, and Bubblegum Pink" -- the
  // four non-default tints, in DISPLAY_MODES order, on the same locked screen.
  // Green is deliberately absent: the hero above already shows it.
  async 'display-modes'(api, tmp) {
    await tuneTo(api, 3)
    const tiles = []
    for (let i = 0; i < 4; i++) {
      await api.key('c')
      await sleep(600)
      await api.settleFrames(90) // setPhosphor clears persistence on a real change, so this is short
      const f = `f${i}.png`
      await api.png(path.join(tmp, f))
      tiles.push(f)
    }
    return { tiles, out: 'display-modes.jpg' }
  },
}

const want = args.filter((a) => !a.startsWith('--'))
const names = want.length ? want : Object.keys(RECIPES)
for (const n of names) if (!RECIPES[n]) { console.error(`Unknown shot "${n}". Known: ${Object.keys(RECIPES).join(', ')}`); process.exit(2) }

for (const name of names) {
  const tmp = mkdtempSync(path.join(tmpdir(), `signal-${name}-`))
  try {
    process.stdout.write(`${name}... `)
    // One retry. Back-to-back sessions occasionally lose a race -- the
    // previous Chrome still shutting down, or the playback wait timing out on
    // a slow fetch -- and having shot 3 of 4 die on that is worse than the
    // twenty seconds a retry costs.
    let result
    for (let attempt = 0; ; attempt++) {
      try { result = await session((api) => RECIPES[name](api, tmp)); break } catch (err) {
        if (attempt >= 1) throw err
        process.stdout.write(`(retry: ${err.message}) `)
      }
    }
    const { tiles, out } = result
    const dest = path.join(SHOTS, out)
    const src = tiles.map((t) => path.join(tmp, t))
    // One tile: straight downscale to the 1273x952 the set has always used.
    // Four: append side by side first, then fit the strip to 1900 wide.
    if (src.length === 1) magick([...src, '-resize', `${W}x${H}`, '-quality', '88', dest])
    else magick([...src, '+append', '-resize', '1900x', '-quality', '88', dest])
    console.log(`-> screenshots/${out}`)
  } finally { rmSync(tmp, { recursive: true, force: true }) }
}
