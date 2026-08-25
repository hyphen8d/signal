// Entry point.

import { mount } from './src/screen.js'
// Dynamic import with a cache-busting query (28th pass -- a released color
// theme wasn't showing up on the live site) -- GitHub Pages serves program.js with
// `Cache-Control: max-age=600`, so a browser that had loaded the page any
// time in the last ~10 minutes silently keeps running the pre-deploy
// version instead of fetching the update. A static `import program from
// './program.js'` can't take a per-load cache-buster (import specifiers
// must be a literal string), so this switches to a dynamic import with the
// load time in the query string -- every page load always gets the actual
// current deploy, no stale-script window to wait out or explain.
const { default: program } = await import(`./program.js?t=${Date.now()}`)

const canvas = document.getElementById('tube')

try {
  window.screen0 = await mount(canvas, program)
} catch (err) {
  const fault = document.getElementById('fault')
  fault.style.display = 'block'
  fault.textContent = 'THE TUBE DID NOT COME UP\n\n'
    + String(err?.stack ?? err)
    + '\n\nServe the directory over http rather than opening the file directly:'
    + '\n\n    python3 -m http.server 8000\n'
  canvas.style.display = 'none'
}
