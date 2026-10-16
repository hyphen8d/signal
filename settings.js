// SIGNAL -- the REAR PANEL's settings: what they are, what each position
// means, and how a saved payload is read back. Pure data, no imports, no
// DOM -- the same split weather.js / ui/weather.js makes, so the rules can
// be tested in Node without drawing anything. ui/rear-panel.js is the card.
//
// 2026-10-15. WHY A REAR PANEL AND NOT A SETTINGS SCREEN: the governing
// test here is "would a real radio have this?", and a preferences menu
// fails it. What a real set DOES have is the same handful of adjustments in
// another form -- the trim pots and switches on the back of the chassis,
// set once and then left alone. So these are the things a person might
// reasonably want to set and forget, reached on [R] and framed as the back
// of the set, not a menu of everything the app could be told.
//
// Every setting here only ever turns something DOWN from the set as
// designed. NORMAL / ON / FULL is the radio as built; the other positions
// exist for people who find one layer of it fatiguing (the hum, the
// between-stations hiss), would rather not hear the presenters, or need a
// picture that does not flicker or roll. None of them adds anything.

/** The rows, in the order the card draws them. `options` is low-to-high
 *  left-to-right, which is how [<-]/[->] read. `def` is the set as built. */
export const PANEL_ROWS = [
  { key: 'hum', label: 'HUM', options: ['off', 'low', 'normal'], def: 'normal' },
  { key: 'static', label: 'STATIC', options: ['off', 'low', 'normal'], def: 'normal' },
  { key: 'voice', label: 'VOICE', options: ['off', 'on'], def: 'on' },
  { key: 'screen', label: 'SCREEN', options: ['calm', 'full'], def: 'full' },
]

/** What each position draws as on the card. One table rather than an
 *  upper-casing of the value, so a value can be renamed in the payload
 *  without the label moving, and the other way round. */
export const OPTION_LABELS = {
  off: 'OFF', low: 'LOW', normal: 'NORMAL', on: 'ON', calm: 'CALM', full: 'FULL',
}

/** One line under the card per row, saying what that row actually reaches.
 *  Each is the honest scope of the control -- VOICE is not "announcer
 *  volume", it is on or off for three specific kinds of clip, and saying so
 *  stops someone wondering why the idents still play. Width is asserted
 *  against the card in tests/rear-panel.test.mjs. */
export const ROW_NOTES = {
  hum: 'THE CHASSIS HUM. PLAYS EVEN WHEN MUTED.',
  static: 'THE HISS BETWEEN STATIONS, AND WHILE SEEKING.',
  voice: 'STATION IDS, LINERS AND THE SIGN-ON LINE.',
  screen: 'CALM: NO FLICKER, ROLL OR GLITCHES.',
}

/** Gain multipliers. LOW is a first guess by number, not by ear -- the same
 *  way HUM_GAIN itself started (see audio/sfx.js); expect to retune it
 *  live. 0.4 is roughly -8dB: clearly quieter, still there. */
export const LEVEL_TRIM = { off: 0, low: 0.4, normal: 1 }

export function defaultPanel({ reducedMotion = false } = {}) {
  const out = {}
  for (const row of PANEL_ROWS) out[row.key] = row.def
  // The one default that is not the set as built. A visitor whose system
  // says "reduce motion" has already answered the SCREEN question, once,
  // for every site -- making them find [R] to answer it again here would be
  // asking them to sit through the flicker first. Only a DEFAULT: a saved
  // choice either way wins (see normalizePanel), so someone with the OS
  // setting on who wants the full tube can have it and keep it.
  if (reducedMotion) out.screen = 'calm'
  return out
}

/** A saved payload, read back. Each key is validated on its own against
 *  that row's options, so one bad or retired value costs that row its
 *  saved position and nothing else -- the same per-field treatment the
 *  rest of state.js's restore gives band, phosphor and consent. */
export function normalizePanel(raw, opts = {}) {
  const out = defaultPanel(opts)
  if (!raw || typeof raw !== 'object') return out
  for (const row of PANEL_ROWS) {
    if (row.options.includes(raw[row.key])) out[row.key] = raw[row.key]
  }
  return out
}

/** One [<-]/[->] press. Clamps at the ends rather than wrapping: these are
 *  pots and switches with stops, and a wrap would make [->] on NORMAL turn
 *  the hum OFF -- the opposite of what the arrow says. Returns the value
 *  unchanged at a stop, which the caller reads as "nothing moved". */
export function stepOption(row, value, dir) {
  const i = row.options.indexOf(value)
  const j = Math.min(row.options.length - 1, Math.max(0, (i < 0 ? row.options.indexOf(row.def) : i) + dir))
  return row.options[j]
}

/** Whether the visitor's system asks for reduced motion. Its own function,
 *  with the try, because matchMedia is absent in Node and may throw in an
 *  odd embedding; either way the answer is "no preference". */
export function prefersReducedMotion() {
  try {
    return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  } catch (e) { return false }
}
