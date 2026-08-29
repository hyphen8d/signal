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
export const STATION_ID_CLIPS = {
  'midnight-neon': 'synapse',
}

/** The file the set will actually fetch for a station. One definition, so a
 *  tool writing a clip and the player reading it cannot disagree. */
export const stationIdClipName = (stationId) => STATION_ID_CLIPS[stationId] ?? stationId
export const stationIdClipPath = (stationId) => `audio/station-id-${stationIdClipName(stationId)}.mp3`
