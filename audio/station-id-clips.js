// SIGNAL -- station id -> spoken-clip name, where the two differ.
//
// Pure data, no imports, in its own file so BOTH the player and the render
// tool can read it. audio/voice.js cannot be loaded from Node (it
// top-level-awaits sfx.js, which wants an AudioContext), so a CLI that
// derived clip names for itself was the only option -- and it got them
// wrong on the first real use, writing SYNAPSE's re-render over
// station-id-midnight-neon.mp3, a retired file nothing reads, while the
// clip the app actually loads sat untouched.
//
// Why the map exists at all: a station's CALLSIGN can change while its id
// cannot. The id is load-bearing for saved sessions (state.js persists
// stationId), for per-station visualizer picks, and as the key into
// tools/station-profiles.json. So when MIDNIGHT NEON became SYNAPSE on
// 2026-08-28 the id stayed 'midnight-neon' and only the clip moved.
export const STATION_CLIP_NAMES = {
  'midnight-neon': 'synapse',
}

/** The name a station's clips are filed under, which is its id unless the
 *  callsign has moved. ONE resolver for both clip types on purpose: station
 *  IDs and liner drops used to derive their filenames by different rules,
 *  and having two rules is how a re-render silently wrote to a retired file
 *  on 2026-08-29 while the live one went untouched. */
export const stationClipName = (stationId) => STATION_CLIP_NAMES[stationId] ?? stationId
export const stationIdClipPath = (stationId) => `audio/station-id-${stationClipName(stationId)}.mp3`
export const linerClipPath = (stationId, n) =>
  `audio/liner-${stationClipName(stationId)}-${String(n).padStart(2, '0')}.mp3`

// The old name, kept because tools/network.html's VOICE panel reads it to
// show which clip a station actually loads.
export const STATION_ID_CLIPS = STATION_CLIP_NAMES
