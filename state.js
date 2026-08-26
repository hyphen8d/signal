// SIGNAL -- localStorage persistence: what survives a reload (station,
// track, volume, mute, colour, per-station visual picks, the LINE INPUT
// answer). Split out in the 2026-08-25 audit.
//
// Imports below are the stamped-dynamic kind (`?v=<build>`) so a deploy can
// never mix this module with a stale copy of another -- see main.js.

const V = globalThis.SIGNAL_BUILD ?? ''
const { DISPLAY_MODES } = await import(`./constants.js?v=${V}`)

// localStorage persistence (14th pass -- persistence approved).
// Remembers the last-locked station, its track, volume, and mute across a
// reload -- freq is NOT restored on its own (a bare tuned-but-not-locked
// position isn't worth remembering), only ever alongside a station lock.
// 23rd pass: also remembers the chosen display mode (phosphor key), same
// reasoning as volume/mute -- a cosmetic preference the set was left in,
// not something tied to a station lock.
export const STORAGE_KEY = 'signal:state:v1'
export function saveSignalState(program) {
  try {
    const mode = DISPLAY_MODES[program.displayModeIndex || 0]
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      stationId: program.lockedStation ? program.lockedStation.id : null,
      trackId: program.currentTrack ? program.currentTrack.id : null,
      volume: program.volume,
      muted: program.muted,
      phosphor: mode ? mode.key : undefined,
      // 65th pass -- per-station [Shift+C] visualizer picks, same
      // treatment as the phosphor/volume/mute preferences above.
      visualOverrides: program.visualOverrides || {},
      // Consent pass (2026-08-25) -- 'yes' | 'no' | null. Persisted so the
      // LINE INPUT card is put to a visitor once, not once per session; the
      // capture grant itself is NOT ours to remember (the browser owns
      // that), this only remembers whether we've asked and what they said.
      tapConsent: program.tapConsent || undefined,
    }))
  } catch (e) {}
}
export function loadSignalState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (e) { return null }
}

