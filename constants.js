// SIGNAL -- app-wide constants: the version tag, the display-mode cycle, and
// the key map. Split out of program.js in the 2026-08-25 audit.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

const V = globalThis.SIGNAL_BUILD ?? ''
const { PHOSPHOR } = await import(`./config.js?v=${V}`)

// Version tag (28th pass) -- shown in the title bar right next to the
// SIGNAL wordmark, e.g. "SIGNAL v0.7". Bump on future releases.
export const VERSION_TAG = 'v0.9'

// Display modes (23rd pass) -- lets users cycle display modes. The CRT
// engine (src/crt.js) already ships a full set of named phosphor
// tints (see PHOSPHORS in config.js) and a setPhosphor(name) hook on both
// CRT and Screen; this is purely an app-layer cycle on top of that, not a
// new rendering feature. Deliberately a curated subset and order, not every
// key in PHOSPHORS.
// 27th pass: added a Pink color theme -- 'bubblegum' (config.js's
// own comment: "not a real phosphor", included here purely for fun) added
// to the end of the cycle rather than slotted between two real ones.
export const DISPLAY_MODES = [
  { key: 'matrix', label: 'GREEN PHOSPHOR' },
  { key: 'vt320', label: 'CLASSIC AMBER' },
  { key: 'brutalist', label: 'CYBER BLUE' },
  { key: 'white', label: 'MONOCHROME' },
  { key: 'bubblegum', label: 'BUBBLEGUM PINK' },
]

// 2026-08-22: the actual set of keys this app treats as a command while
// powered on and the guide is closed -- see isMappedKey() near key() for
// how this gates playKeyClick() to real commands only, not every keydown
// the page happens to see.
export const MAPPED_KEYS = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter',
  's', 'S', 'n', 'N', 'm', 'M', 'p', 'P', 'b', 'B', 'g', 'G', 'c', 'C', 'v', 'V',
  // Consent pass (2026-08-25) -- [A] opens the LINE INPUT card. See key().
  'a', 'A',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  // 2026-08-26 (issue #8) -- [F] fullscreen, main screen and visualizer.
  'f', 'F',
  // 2026-08-26 -- Shift+0 (')' on a standard layout), GREEN ROOM's way in.
  // Here for the same reason every other command key is: isMappedKey()
  // gates playKeyClick(), so without this the one keypress that reaches
  // the second secret station would be the only command on the roster
  // that lands silently. See key()'s own case.
  ')',
])
