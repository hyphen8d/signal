// Entry point.

import { mount } from './src/screen.js'
import program from './program.js'

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
