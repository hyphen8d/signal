// Entry point.

import { mount } from './src/screen.js'

// Build-stamped imports (2026-08-25 audit; replaces the 28th pass's
// `?t=${Date.now()}`). GitHub Pages serves program.js with `Cache-Control:
// max-age=600`, so a plain import could keep a returning visitor on a
// 10-minute-stale copy after a deploy -- the per-load timestamp fixed that,
// at the cost of making program.js (176KB gzipped) uncacheable on EVERY
// visit. Now the only always-fresh fetch is build.json (~30 bytes, still
// per-load `?t=` so neither the browser nor the CDN can serve it stale), and
// program.js/config.js/stations.js are imported as `?v=<stamp>`: a URL that
// caches normally and changes exactly when `node tools/stamp.js` bumps it
// for a deploy. Falls back to a timestamp if build.json can't be read (a
// checkout served without it), which is just the old behavior.
//
// The stamp is also published as globalThis.SIGNAL_BUILD so program.js can
// import config.js/stations.js under the SAME `?v=` URL -- a module is
// instanced per full URL, so matching the query string exactly is what
// guarantees one shared config instance rather than three (the pre-audit
// build had three: screen.js and crt.js each imported `config.js?t=<their
// own Date.now()>`, program.js imported it bare, and CRT.setPhosphor()'s
// identity check against PHOSPHORS quietly never matched).
async function buildStamp() {
  try {
    const res = await fetch(`./build.json?t=${Date.now()}`, { cache: 'no-store' })
    if (res.ok) {
      const { build } = await res.json()
      if (build) return String(build)
    }
  } catch (e) {}
  return String(Date.now())
}
const stamp = await buildStamp()
globalThis.SIGNAL_BUILD = stamp

const config = await import(`./config.js?v=${stamp}`)
const { default: program } = await import(`./program.js?v=${stamp}`)

const canvas = document.getElementById('tube')

try {
  window.screen0 = await mount(canvas, program, config)
} catch (err) {
  const fault = document.getElementById('fault')
  fault.style.display = 'block'
  fault.textContent = 'THE TUBE DID NOT COME UP\n\n'
    + String(err?.stack ?? err)
    + '\n\nServe the directory over http rather than opening the file directly:'
    + '\n\n    python3 tools/dev-server.py 8000\n'
  canvas.style.display = 'none'
}
