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
  // 2026-08-29 -- [W] weather card. Here for the reason every command key
  // is: isMappedKey() gates playKeyClick(), so a key that acts and does
  // not click is the exact drift the dead-feedback sweep exists to catch.
  'w', 'W',
  // 2026-08-26 -- Shift+0 (')' on a standard layout), GREEN ROOM's way in.
  // Here for the same reason every other command key is: isMappedKey()
  // gates playKeyClick(), so without this the one keypress that reaches
  // the second secret station would be the only command on the roster
  // that lands silently. See key()'s own case.
  ')',
  // 2026-08-27 -- [T] sleep timer. See SLEEP_STEPS below and key()'s case.
  't', 'T',
])

// Sleep timer (2026-08-27) -- the minute steps [T] cycles through, then off.
// Descending, the way a clock radio's SLEEP button has always worked: the
// first press asks for the longest one, and you step it down toward the
// answer you actually want rather than up toward it.
export const SLEEP_STEPS = [60, 30, 15]
// The last stretch fades out instead of cutting off. A hard cut at 0:00 is
// the one thing a sleep timer must not do -- the whole feature exists for
// someone on their way to sleep, and silence arriving as an EVENT is what
// wakes them. Long enough to be a drift rather than a duck; the VOL bar
// follows it down (see drawVolume) so the screen never claims a level the
// speaker isn't at.
export const SLEEP_FADE_MS = 30_000

// STATION BREAK (2026-08-27, 22nd pass) -- how often the question is asked,
// and how long the set waits for a track to actually start before it stops
// claiming that track is playing.
//
// The detector this replaces asked "is an advert running?" and could not be
// answered: a live capture proved the IFrame API reports the requested
// video's own id and the requested video's own duration all the way through
// a preroll, which is consistent with YouTube withholding ad state from
// embedders on purpose. Both signals were blind. So the question changed to
// one the player does answer honestly -- "has the content we asked for
// actually started?" -- which needs no ad detection at all.
//
// HOLD_MS is the grace before silence becomes a STATION BREAK. In the
// capture, a healthy load reached PLAYING one second after the cue; an
// advert sat there for its whole length and never reached it. 4s clears a
// normal load with room to spare while still catching a 15-second preroll
// early enough to be worth showing. Erring long is the safe direction: the
// cost of waiting is a beat of stale title, the cost of firing early is a
// break over a track that was merely slow to load.
export const BREAK_POLL_MS = 250
export const BREAK_HOLD_MS = 4000

// NOW PLAYING reveal (2026-08-28, 23rd pass) -- the stuck-reveal ceiling,
// and NOT a design timing: nothing should ever be seen landing on it.
//
// The reveal holds its resolve in noise until the player reports PLAYING
// (see revealHeld), so the title settles as the sound arrives instead of a
// timer's worth of time before it. Two things can release that hold -- the
// event, or the break taking the slot at BREAK_HOLD_MS -- and both of them
// stop working in the same conditions: an occluded tab pinned at 0fps
// starves checkForBreak (frame-driven on purpose, see there) while the
// effects queue's fallback ticker keeps the resolve itself ticking. That is
// the one state where a held reveal has nothing left to land it, so it
// lands itself.
//
// Deliberately well above BREAK_HOLD_MS. Anything close to it would race
// the break over exactly the case the break exists for -- an advert -- and
// the visible cost of losing that race is the title flashing up a beat
// before STATION BREAK wipes it, which is worse than either outcome alone.
export const REVEAL_CEILING_MS = 12_000

// 2026-08-27 (dead-feedback audit) -- the visualizer's own command set, the
// counterpart to MAPPED_KEYS above. isMappedKey() returned true for EVERY key
// while the visualizer was up, which was right when any key woke and exited it
// (43rd pass) and wrong from the 64th pass on, once every unnamed key became a
// deliberate no-op in there: the visualizer clicked like a command for presets,
// [P], [G], [S], [B], Enter -- and for keys this app doesn't own at all, which
// is the exact thing MAPPED_KEYS was introduced to stop on the main screen.
// This is the list the switch in key() actually answers: the footer legend's
// own [N] [L] [M] [C] [V] [E], plus volume, the two settings-shaped keys, and
// Escape. [L] and [A] are deliberately NOT here -- both are conditional, so
// isMappedKey() asks their own availability check instead.
export const VISUALIZER_KEYS = new Set([
  'ArrowUp', 'ArrowDown',
  'c', 'C', 'n', 'N', 'm', 'M', 'v', 'V', 'f', 'F', 't', 'T', 'e', 'E', 'Escape',
])
