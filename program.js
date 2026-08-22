// SIGNAL -- a tuning-dial radio, rendered entirely through the text grid.
//
// The YouTube player (#ytDock in index.html) is docked off-screen -- this
// is an audio-focused experience, and the terminal is the only UI. Because
// there's no visible player at all, this program is the ONLY source of
// playback feedback (playing/paused, what's on), so that's treated as a
// real UI requirement here, not cosmetic.
//
// Each station has real, verified tracks (see realTrack() below). Real
// per-station playlists (several hours, no near-term repeat) are still the
// next real step before this goes anywhere near real people.

import { NORMAL, BRIGHT, BOLD, DIM, MUTED, FAINT } from './src/term.js'
// 32nd pass: SCREEN is the CRT engine's nominal param baseline (see
// config.js) -- needed here so the new live CRT hooks (search "32nd pass"
// below) know what "clean picture" and "warmed up" actually mean, rather
// than hardcoding a second copy of those numbers.
// 41st pass: PHOSPHORS too -- the secret-station proximity tease bleeds
// the live tint toward 'red' (see applySecretTease).
// 45th pass: MOBILE_LITE -- decided once in config.js off viewport/pointer
// detection, before this module even runs (it sizes the GRID mount() builds
// the Term/CRT from). Read here to pick which of the two draw paths below
// runs; nothing about the underlying state/audio/gesture logic changes.
import { SCREEN, PHOSPHORS, MOBILE_LITE } from './config.js'

// Version tag (28th pass, Matthew: "add version in upper left after
// SIGNAL") -- shown in the title bar right next to the SIGNAL wordmark,
// e.g. "SIGNAL v0.7". Bump on future releases.
const VERSION_TAG = 'v0.8'

// --- data -------------------------------------------------------------

// A wide, irregular fictional band -- not the real 88-108 FM range, and not
// clean tenths like real station assignments, on purpose (Matthew, 8/20:
// the old range read as too close to an actual FM dial).
const FREQ_MIN = 100.0
const FREQ_MAX = 900.0
// Scaled up ~40x from the old 88-108 tuning feel (20-wide band -> 800-wide).
const LOCK_THRESHOLD = 6
const NEAR_THRESHOLD = 24
// BUG FIXED 2026-08-20: these move distances were left at their old
// 88-108-band values (0.2 / 0.15) after the band widened 40x, so seeking
// and scanning crawled across the new range at the old range's pace --
// this, not the layout, was why arrow keys felt pointless and scanning
// felt broken. Scaled to match the thresholds above.
const SEEK_STEP = 8
const SCAN_STEP = 6
// 36th pass (Matthew: "lock back onto a station and it's a different song
// every time -- a real broadcast would still be on the same song, just
// further along"). Flat-cutoff fix: tryLock() remembers, per station, the
// track and position playing when you last left it. Re-locking onto that
// station within this window resumes the same track (seeked forward by
// however long you were away) instead of drawing a fresh one from the
// shuffle bag; past the window it's treated as a real gap and draws
// normally. Deliberately flat rather than duration-aware -- simpler, and
// "gone a while -> different song" is close enough to real radio without
// simulating each station's timeline continuously in the background.
const RESUME_CUTOFF_MS = 3 * 60 * 1000

// Visualizer (43rd/44th pass, Matthew: "music screensaver... when idle for
// awhile or when toggled" -- renamed from "screensaver" the same pass it
// shipped: "breaks immersion a bit"). 4:20 was Matthew's own pick, not a
// default worth second-guessing. Only ever armed while locked and playing
// -- see frame()'s idle check -- so there's nothing to idle into while
// seeking or scanning.
const VISUALIZER_IDLE_MS = 4 * 60 * 1000 + 20 * 1000

// Display modes (23rd pass, Matthew: "let users cycle display modes") --
// the CRT engine (src/crt.js) already ships a full set of named phosphor
// tints (see PHOSPHORS in config.js) and a setPhosphor(name) hook on both
// CRT and Screen; this is purely an app-layer cycle on top of that, not a
// new rendering feature. Deliberately a curated subset and order, not every
// key in PHOSPHORS.
// 27th pass (Matthew: "add Pink color theme") -- 'bubblegum' (config.js's
// own comment: "not a real phosphor", included here purely for fun) added
// to the end of the cycle rather than slotted between two real ones.
const DISPLAY_MODES = [
  { key: 'matrix', label: 'GREEN PHOSPHOR' },
  { key: 'vt320', label: 'CLASSIC AMBER' },
  { key: 'brutalist', label: 'CYBER BLUE' },
  { key: 'white', label: 'MONOCHROME' },
  { key: 'bubblegum', label: 'BUBBLEGUM PINK' },
]

/** Real, searched-and-verified (YouTube oEmbed) tracks per station, so each
 *  station is at least genuinely different from the others -- the 4 recycled
 *  placeholder IDs (one of them literally the Rick Astley rickroll) were the
 *  same clips on every station, which is what made it impossible to
 *  actually evaluate. Each station now carries 2 real tracks and nothing
 *  else; real per-station playlists (several hours, no near-term repeat)
 *  are the next real step. */
function realTrack(youtubeId, title, artist) {
  return { id: `yt:${youtubeId}:real`, youtubeId, title, artist }
}

// `tagline` replaces the old plain genre label -- Matthew asked to settle on
// short creative descriptions instead of e.g. "flow / focus". These are a
// first draft, easy to swap.
// `ident` is a short WebAudio tone sequence (Hz, played in order) that
// stands in for a station ID jingle -- one per station, so locking onto a
// station sounds distinctive before you've even read the screen (added
// 2026-08-20, 9th pass, Matthew: "let's try station idents"). Standardized
// to exactly 4 tones each (10th pass, Matthew: "station IDS to be 4 tones
// long"): a grungy descending run, an ascending major arpeggio, a soft
// downward drift, a bright synth-pop arpeggio, and a warm lofi descent.
//
// SIGNAL LOCK (steady-carrier ambient station) was removed 2026-08-20
// (10th pass, Matthew: "remove the station signal lock"). Its two tracks
// (Eno's "An Ending (Ascent)", Pärt's "Spiegel im Spiegel") were reassigned
// rather than deleted -- both fit QUIET HOURS' ambient/neoclassical lane
// better than they fit any of the remaining stations, and CHAMBER FREQ
// wasn't a clean home for them either (they're modern minimalist, not the
// "old masters" the tagline promises).
//
// Every remaining station also picked up 4 new real, oEmbed-verified tracks
// this pass (Matthew: "add at least 4 more songs to each remaining
// station"), on top of whatever it already had -- so QUIET HOURS actually
// gained 6 (4 new + the 2 reassigned) and the rest gained 4.
const STATIONS = [
  { id: 'distortion-field', freq: 194.8, callsign: 'DISTORTION FIELD', tagline: "raw nerve, '90s angst",
    // 28th pass (2026-08-21): renamed from STATIC BLOOM per Matthew's
    // station-naming pass -- "DISTORTION FIELD" / "heavy guitars, raw
    // nerve, '90s angst" was the locked-in choice (option 1B). Same
    // grunge/alt-rock lane, same ident, same tracks -- name/tagline only.
    // 32nd pass: guide's per-station detail page (see drawGuidePageStation).
    // v0.8 patch: freq bumped 137.4 -> 194.8 -- when CIPHER moved to 133.7
    // (see CIPHER's own field notes below) the two sat only 3.7 KHZ apart
    // on the dial, way tighter than the roster's normal spacing. This
    // isn't the exact midpoint to DRIFT MODE's 356.2 either (that'd be
    // 244.95) -- deliberately asymmetric so the gap reads as organic
    // placement, not a rule.
    desc: 'Grunge and alternative rock from the early-to-mid 90s Seattle sound and its ripple effects -- distorted guitars, raw vocals, and radio-ready angst.',
    // Matthew 8/20: "I don't hear a station id tone for static bloom." The
    // ident itself was firing fine (confirmed by hooking createOscillator
    // in a live tab) -- it was just pitched a full octave below every other
    // station's ident (130.8-196 vs. 300+ everywhere else), quiet-to-silent
    // on typical laptop/built-in speakers for a 160ms burst. Same 4-note
    // shape, one octave up: still the lowest/moodiest ident of the set,
    // just actually audible.
    ident: [392.0, 349.2, 311.2, 261.6],
    // 25th pass (Matthew: "make sure each 9 station ID tones are as unique
    // from each other as they can be") -- an analysis pass found 8 of the 9
    // idents fell into just two pitch-contour shapes (4 straight descending
    // triads, 4 straight ascending ones), which reads as "two chimes" to the
    // ear no matter how the exact notes differ. Redesigned so all 9 use a
    // distinct up/down contour (one of the 8 possible 3-step shapes, or a
    // repeated-note "flat" step for a 9th), plus a per-station identTempo
    // multiplier on playIdent()'s note gap/envelope so genre-appropriate
    // ones also feel rhythmically distinct, not just melodically. This one
    // (straight descent, dreamy) was already unique and is untouched.
    identTempo: 1.25,
    // 25th pass: modern rock/grunge masters run loud already -- no boost.
    gain: 1.0,
    // 41st pass -- per-station identity (Matthew: "ideas on how we can give
    // the channels more identity?"). Everything a station had until now was
    // INFORMATIONAL -- callsign, tagline, desc, ident motif, dial position --
    // i.e. things you read. These four fields are things you feel without
    // reading, and every one of them rides machinery that already existed:
    //   glyph  -- this station's marker on the dial, in place of the nine
    //             identical '▲'s, so the band becomes a map you learn.
    //             CHOSEN FOR LEGIBILITY, NOT FOR THEME (Matthew: "they do
    //             not need to be thematic at all it needs to be whatever
    //             reads best"). The first set matched each station's
    //             character -- a downward triangle for the heavy station, a
    //             dot for the ambient one -- and that is exactly what made
    //             it uneven: the geometric shapes ('●' '◆' '◊' '¤' '▪')
    //             occupy a fraction of the cell, so at NORMAL weight they
    //             wash out into the dial's own FAINT dots under bloom,
    //             while '▓' '▒' '◘' are so solid they read as a second
    //             cursor. Every glyph here was rendered in the running app,
    //             in a field of dial dots, at NORMAL weight, and picked
    //             from what survived: full cell height, comparable ink
    //             mass, and no two shapes confusable with each other at
    //             8x16 under bloom (which is why '‡' lost to '╬', '¶' lost
    //             to '%', and 'Ø' was dropped for blurring into 'Ω').
    //             Dial-adjacent stations are deliberately given the most
    //             dissimilar shapes. '★' and '▪' are absent from the face
    //             entirely and render as '?'.
    //   static -- centre frequency of the noise bed while you are tuning
    //             near it, so each station's approach SOUNDS different.
    //   crt    -- partial overrides on config.js's SCREEN baseline, applied
    //             while locked (see setCrtCharacter). Deliberately subtle
    //             and never announced: heavy and downward; the grainiest, hottest picture on the roster.
    //   meter  -- VU/EQ ballistics (see stationBallistics). One number set,
    //             large perceptual effect, because the meters are always in
    //             view.
    glyph: 'Æ',
    static: 1900,
    crt: { noise: 0.19, bloomAmt: 1.75, flicker: 0.11 },
    meter: { spring: 0.55, damping: 0.42, swing: 1.1 },
    // 46th pass -- FLAME: a living fire climbing the screen, replacing
    // two prior concepts (FEEDBACK, then HOWL) that never landed. See the
    // field notes above VISUAL_METHODS and drawFlameEffect.
    visual: 'flame',
    // v0.8: 3 tracks swapped out on Matthew's own request ("Lightning
    // Crashes", "Dollar Bill", "No Rain" -- no specific reason given, just
    // wanted variety) for Zombie/Possum Kingdom/Buddy Holly below, all
    // oEmbed-verified same as everything else.
    tracks: [
      realTrack('hTWKbfoikeg', 'Smells Like Teen Spirit', 'Nirvana'),
      realTrack('3mbBbFH9fAg', 'Black Hole Sun', 'Soundgarden'),
      realTrack('Nco_kh8xJDs', 'Would?', 'Alice In Chains'),
      realTrack('qM0zINtulhM', 'Alive', 'Pearl Jam'),
      realTrack('yjJL9DGU7Gg', 'Interstate Love Song', 'Stone Temple Pilots'),
      realTrack('eBG7P-K-r1Y', 'Everlong', 'Foo Fighters'),
      realTrack('PE5f561Y1x4', 'Nearly Lost You', 'Screaming Trees'),
      realTrack('cH_rfGBwamc', 'Violet', 'Hole'),
      realTrack('XKvHgPHLlv4', 'Hunger Strike', 'Temple of the Dog'),
      realTrack('_nGsT_qFMBs', "Touch Me I'm Sick", 'Mudhoney'),
      // 27th pass: 5 more tracks (Matthew, "add 5 more tracks per station"),
      // oEmbed-verified same as everything else.
      realTrack('5WPbqYoz9HA', 'Machinehead', 'Bush'),
      realTrack('6Ejga4kJUts', 'Zombie', 'The Cranberries'),
      realTrack('28kAclQZLTE', "Pretend We're Dead", 'L7'),
      realTrack('q-KE9lvU810', 'Cherub Rock', 'The Smashing Pumpkins'),
      realTrack('PjsMnvqL7eY', 'Tomorrow', 'Silverchair'),
      // 29th pass: brought to 20 tracks per Matthew's roster-wide expansion.
      realTrack('JNZezhUkOSk', 'Jeremy', 'Pearl Jam'),
      realTrack('V5UOC0C0x8Q', 'Plush', 'Stone Temple Pilots'),
      realTrack('TAqZb52sgpU', 'Man in the Box', 'Alice In Chains'),
      realTrack('T0_zzCLLRvE', 'Spoonman', 'Soundgarden'),
      realTrack('4aeETEoNfOg', '1979', 'The Smashing Pumpkins'),
      // 33rd pass: brought to 25 tracks per Matthew's second roster-wide
      // expansion, oEmbed-verified same as everything else.
      realTrack('vabnZ9-ex7o', 'Come As You Are', 'Nirvana'),
      realTrack('EqWRaAF6_WY', 'My Hero', 'Foo Fighters'),
      realTrack('EkwD5rQ-_d4', 'Possum Kingdom', 'Toadies'),
      realTrack('RD9xK9smth4', 'Doll Parts', 'Hole'),
      realTrack('8KHwuOtcALQ', 'Freak', 'Silverchair'),
      realTrack('kemivUKb4f4', 'Buddy Holly', 'Weezer'),
      realTrack('Fm72DPJCX58', 'River of Deceit', 'Mad Season'),
      realTrack('fTqyUz_jSIo', 'Far Behind', 'Candlebox'),
      realTrack('YgSPaXgAdzE', 'Loser', 'Beck'),
      realTrack('MW6E_TNgCsY', 'Santa Monica', 'Everclear'),
    ] },
  // RELIC SIGNAL (classical, 219.8) retired 2026-08-21 (28th pass, per
  // Matthew's station-naming pass) -- its classical lane overlapped with
  // QUIET HOURS' ambient/neoclassical territory (see the 10th-pass comment
  // above), and the freed 219.8 slot went to CIPHER (see below). Track list
  // and ident are preserved here only in this comment in case the classical
  // lane is ever wanted back as its own station:
  //   Beethoven Symphony No. 5 (IvrzJ8uH1PI), Debussy/Lang Lang Suite
  //   bergamasque III (fZrm9h3JRGs), Bach Air on the G String
  //   (XWOC6xImhtg), Chopin Nocturne Op. 9 No. 2 (nO8uUTB2RlA), Vivaldi The
  //   Four Seasons: Spring (3LiztfE1X7E), Satie Gymnopedie No. 1
  //   (Rj6Gk3YFdaQ), Pachelbel Canon in D Major (roC1jDB3IUo), Mozart Eine
  //   kleine Nachtmusik (hcpM0yN7p0c), Grieg In the Hall of the Mountain
  //   King (OqvHWUZZdP0), Holst The Planets: Mars (8UfpgT9FMAk),
  //   Tchaikovsky 1812 Overture (4C-YSq5flow), Handel Water Music
  //   (HfgVsUqmAN8), Rossini William Tell Overture (1yu-WOwvdOo), Ravel
  //   Bolero (5Eqj9G5j1ss), Schubert Ave Maria (_5lHOap57to). Ident was
  //   [523.3, 659.3, 784.0, 1046.5], identTempo 1.15, gain 1.45.
  { id: 'drift-mode', freq: 356.2, callsign: 'DRIFT MODE', tagline: 'fade to black, ambient descent',
    // 28th pass: renamed from QUIET HOURS (option 2B minus "sleep well").
    // Same ambient/drone lane, same ident, same tracks -- name/tagline only.
    // 32nd pass: guide's per-station detail page (see drawGuidePageStation).
    desc: 'Ambient, modern classical, and drone pieces built for stillness -- slow-moving, mostly wordless, meant to fade into the room instead of demanding it.',
    // 25th pass: was a straight descent, same shape as 3 other stations --
    // now a gentle down-up-down undulation (D U D), a shape unique to this
    // station, and the slowest identTempo of the set.
    ident: [392.0, 329.6, 370.0, 293.7],
    identTempo: 1.35,
    // 25th pass: ambient/drone masters are mastered deliberately quiet
    // (they're meant to sit low, not compete for attention) -- second-
    // biggest boost on the roster.
    gain: 1.5,
    // 41st pass -- see the field notes on DISTORTION FIELD above. hollow and soft; long persistence, dimmer gun, slowest meters by far
    glyph: '§',
    static: 700,
    crt: { decay: 0.88, brightness: 1.12, bloomAmt: 1.7, scanMax: 0.6 },
    meter: { spring: 0.16, damping: 0.72, swing: 0.55 },
    // 44th pass -- the Visualizer's DRIFT mode (see VISUAL_METHODS) is
    // explicitly paired with the one station it's named after, not just
    // landing here as everyone's fallback.
    visual: 'drift',
    tracks: [
      realTrack('UfcAVejslrU', 'Weightless', 'Marconi Union'),
      realTrack('TJ6Mzvh3XCc', 'Spiegel im Spiegel', 'Arvo Pärt'),
      realTrack('0kYc55bXJFI', 'Near Light', 'Olafur Arnalds'),
      realTrack('YC6pJOH7bF0', 'Adamord', 'Stars of the Lid'),
      // Swapped out Richter's "On The Nature of Daylight" and Nils Frahm's
      // "Says" 2026-08-20 -- both read as classical/neoclassical, the same
      // lane as RELIC SIGNAL. These 4 are drone/ambient/embient-rock, built
      // to put a room to sleep rather than to be listened to.
      realTrack('8L64BcCRDAE', 'Svefn-g-englar', 'Sigur Rós'),
      realTrack('wLxbD0CkS30', "Heavy Water / I'd Rather Be Sleeping", 'Grouper'),
      realTrack('BD3D5mCjt7I', 'Disintegration Loop 1.1', 'William Basinski'),
      // 40th pass (Matthew: "remove brian eno as one of the examples in the
      // guide and put a different track") -- the Guide's SAMPLE TRACKS list
      // is not a curated field, it's the first 6 DISTINCT primary artists in
      // this array's own order (see sampleTracks/primaryArtist), so what
      // shows up there is decided purely by position. Eno led the list at
      // slot 2 with the Orchestra of the Swan arrangement, and "Music for
      // Airports" sat at slot 6, so pulling only the first one would have
      // promoted the second into the same spot. Both moved down here
      // instead, which drops Eno out of the sampled six without touching
      // the station's rotation -- all three Eno entries (plus the Budd/Eno
      // collaboration further down) still play exactly as often as before.
      // The Guide now shows Grouper as the sixth example.
      realTrack('sfBlBs25Ewk', 'An Ending (Ascent) [arr. David Le Page]', 'Brian Eno / Orchestra of the Swan'),
      realTrack('QJ-polFpeX0', 'Music for Airports: 1/1', 'Brian Eno'),
      realTrack('jl_z5JvrKlc', 'Discreet Music', 'Brian Eno'),
      // 27th pass: 5 more tracks, oEmbed-verified same as everything else.
      // "On the Nature of Daylight" and "Says" were swapped OUT of THE STUDY
      // 2026-08-20 for reading too classical/neoclassical for that station's
      // lofi/winddown lane -- both fit QUIET HOURS's ambient lane instead.
      realTrack('InyT9Gyoz_o', 'On the Nature of Daylight', 'Max Richter'),
      realTrack('dIwwjy4slI8', 'Says', 'Nils Frahm'),
      realTrack('-bc37fU36Vk', 'Requiem for Dying Mothers, Pt. 1', 'Stars of the Lid'),
      realTrack('vTaBX_FoGWk', 'Release', 'Hammock'),
      realTrack('ShW8YyueC1s', 'In the Fog I', 'Tim Hecker'),
      // 29th pass: brought to 20 tracks per Matthew's roster-wide expansion.
      realTrack('SwmRJQAx8eA', 'Requiem for the Static King, Pt. 1', 'A Winged Victory for the Sullen'),
      realTrack('ngUnLL4CAck', 'A Song for Europa', 'Jóhann Jóhannsson'),
      realTrack('mwJTwG5r5Ks', 'The Plateaux of Mirror', 'Harold Budd / Brian Eno'),
      realTrack('2CN1qXJJODI', 'Cast of Mind', 'Kali Malone'),
      realTrack('EFQlQHGuB20', 'Red Tide', 'Loscil'),
      // 33rd pass: brought to 25 tracks per Matthew's second roster-wide
      // expansion, oEmbed-verified same as everything else.
      realTrack('nvtV4fvNJpY', 'Radio Ballet', 'Eluvium'),
      realTrack('ONQt97F9KKI', 'Opus 23', "Dustin O'Halloran"),
      realTrack('SDru80vHKxU', 'Keep Up the Good Work', 'Julianna Barwick'),
      realTrack('aTcYsYZ5ZxA', 'Not At Home', 'Peter Broderick and Nils Frahm'),
      realTrack('pygwK0sBUdM', 'andata', 'Ryuichi Sakamoto'),
      realTrack('k15pVegwe-o', 'Rhubarb', 'Aphex Twin'),
      realTrack('57257U-W9NI', 'The Fall of Constantinople', 'Federico Albanese'),
      realTrack('5nCRNIKkKSs', 'Rain', 'Poppy Ackroyd'),
      realTrack('hnFX0qZbLjI', 'Poa Alpina', 'Biosphere'),
      realTrack('CQ8zglIXZi8', 'Nuvole Bianche', 'Ludovico Einaudi'),
    ] },
  { id: 'cold-wave', freq: 512.9, callsign: 'COLD WAVE', tagline: 'synthetic hearts, borrowed neon',
    // 32nd pass: guide's per-station detail page (see drawGuidePageStation).
    desc: 'Synth-driven new wave and synthpop from the early-to-mid 80s -- drum machines, cold hooks, and neon nostalgia for a decade that never quite ended.',
    // 25th pass: was a straight ascent, same shape as 3 other stations --
    // now reaches up then falls back twice (U D D), a moodier shape that
    // suits "synthetic hearts, borrowed neon" better anyway.
    ident: [440.0, 659.3, 554.4, 440.0],
    identTempo: 1.0,
    // 25th pass: 80s synth-pop masters run a bit quieter than modern
    // loudness-war masters -- small boost.
    gain: 1.1,
    // 41st pass -- see the field notes on DISTORTION FIELD above. blocky 80s; slight glow and fringe lift
    glyph: 'Þ',
    static: 1300,
    crt: { bloomAmt: 1.65, chroma: 0.35, brightness: 1.22 },
    meter: { spring: 0.4, damping: 0.5, swing: 0.9 },
    // 45th pass -- PULSE: a fixed neon lattice pulsing on a synthetic
    // "lub-dub" heart rhythm, the tagline's "synthetic hearts" made literal.
    visual: 'pulse',
    tracks: [
      realTrack('9GMjH1nR0ds', 'Blue Monday \'88', 'New Order'),
      realTrack('1ASpBpT8bRQ', 'Just Like Heaven', 'The Cure'),
      realTrack('aGSKrC7dGcY', 'Enjoy the Silence', 'Depeche Mode'),
      realTrack('aGCdLKXNF3w', 'Everybody Wants to Rule the World', 'Tears for Fears'),
      realTrack('d5XJ2GiR6Bo', 'Enola Gay', 'Orchestral Manoeuvres in the Dark'),
      realTrack('uPudE8nDog0', "Don't You Want Me", 'The Human League'),
      realTrack('M1oqX84UKOE', "Don't You (Forget About Me)", 'Simple Minds'),
      realTrack('6KR52lEWLEM', 'Sweet Dreams (Are Made of This)', 'Eurythmics'),
      // 31st pass (Matthew: "cars track needs replacing, its a music video
      // or something and has extra dialog") -- the old ID was a fan
      // reupload of the 1979 music video, which opens with spoken
      // dialog/interview footage before the song starts. Swapped for a
      // clean HQ-audio-only upload, oEmbed-verified same as everything
      // else here.
      realTrack('sj1ajOdKgKo', 'Cars', 'Gary Numan'),
      realTrack('iIpfWORQWhU', 'I Ran (So Far Away)', 'A Flock of Seagulls'),
      // 27th pass: 5 more tracks, oEmbed-verified same as everything else.
      realTrack('XZVpR3Pk-r8', 'Tainted Love', 'Soft Cell'),
      realTrack('p3j2NYZ8FKs', 'West End Girls', 'Pet Shop Boys'),
      realTrack('nTizYn3-QN0', 'Rio', 'Duran Duran'),
      // 33rd pass: "Vienna" (Ultravox) and "Ghosts" (Japan) pulled per
      // Matthew's request -- replaced/expanded below.
      // 29th pass: brought to 20 tracks per Matthew's roster-wide expansion.
      realTrack('djV11Xbc914', 'Take On Me', 'a-ha'),
      realTrack('tkOr12AQpnU', 'Bizarre Love Triangle', 'New Order'),
      realTrack('6Uxc9eFcZyM', 'Save a Prayer', 'Duran Duran'),
      realTrack('Ye7FKc1JQe4', 'Shout', 'Tears for Fears'),
      realTrack('EPmTGFg06zA', 'If You Leave', 'Orchestral Manoeuvres in the Dark'),
      // 33rd pass: brought to 25 tracks per Matthew's second roster-wide
      // expansion (also covers the 2 slots freed by pulling Vienna/Ghosts),
      // oEmbed-verified same as everything else.
      realTrack('PAqk72wm4As', 'Fade to Grey', 'Visage'),
      realTrack('AsMcT03cSvs', 'Only You', 'Yazoo'),
      realTrack('tl6u2NASUzU', 'Big in Japan', 'Alphaville'),
      realTrack('LGD9i718kBU', 'Love My Way', 'The Psychedelic Furs'),
      realTrack('LWz0JC7afNQ', 'The Killing Moon', 'Echo & the Bunnymen'),
      realTrack('cFH5JgyZK1I', "It's My Life", 'Talk Talk'),
      realTrack('_6FBfAQ-NDE', "Just Can't Get Enough", 'Depeche Mode'),
      realTrack('hKAT3Kp56Yg', 'Vienna', 'Ultravox'),
      realTrack('-OO9LloDSJo', 'Things Can Only Get Better', 'Howard Jones'),
      realTrack('Zi86ZiOlIVo', 'The Safety Dance', 'Men Without Hats'),
      realTrack('wO0A0XcWy88', 'Major Tom (Coming Home)', 'Peter Schilling'),
      realTrack('LuN6gs0AJls', 'I Melt With You', 'Modern English'),
    ] },
  { id: 'momentum', freq: 823.1, callsign: 'MOMENTUM', tagline: 'deep focus, productive drift',
    // 28th pass: renamed from THE STUDY (option e, after more naming
    // options were requested). Same lofi/downtempo focus lane, same ident,
    // same tracks -- name/tagline only.
    // 32nd pass: guide's per-station detail page (see drawGuidePageStation).
    desc: 'Chillhop and instrumental beats built for getting things done -- sampled jazz, lo-fi drums, and just enough melody to hold focus without breaking it.',
    // 25th pass: was a straight descent, same shape as 3 other stations --
    // now descends then flicks up at the end (D D U), a small lo-fi
    // "wobble" tag instead of a flat fade-out.
    ident: [329.6, 293.7, 261.6, 293.7],
    identTempo: 1.1,
    // 25th pass: lofi/downtempo masters run a bit quieter/mellower than
    // typical modern masters -- small boost.
    gain: 1.15,
    // 41st pass -- see the field notes on DISTORTION FIELD above. upward and clean; the least noisy picture, steadiest meters
    glyph: '&',
    static: 1050,
    crt: { noise: 0.1, bloomAmt: 1.3, flicker: 0.05 },
    meter: { spring: 0.3, damping: 0.6, swing: 0.75 },
    // 45th pass -- STACK: calm rising bar columns, deliberately the
    // quietest visual on the roster to match this station's own least-
    // noisy CRT signature.
    visual: 'stack',
    tracks: [
      realTrack('XnFOucmKlXA', 'Aruarian Dance', 'Nujabes'),
      realTrack('InFbBlpDTfQ', 'Midnight In A Perfect World', 'DJ Shadow'),
      realTrack('KMKeBpySf78', 'Kong', 'Bonobo'),
      realTrack('mehLx_Fjv_c', 'A Walk', 'Tycho'),
      // Swapped out Massive Attack's "Teardrop" and Portishead's "Glory Box"
      // 2026-08-20 -- both read as trip-hop/downtempo proper, an adjacent
      // but heavier lane than the lofi-girl/chillhop winddown this station
      // is meant to be (winding down, not sleep -- that's QUIET HOURS).
      realTrack('DEqSQq9Rkuo', 'Lonely', 'Idealism'),
      realTrack('iUcHNED9mV4', 'Fireflies', "Kupla x j'san"),
      realTrack('zK_Fb7XVrBY', 'Flower Dance', 'DJ Okawari'),
      realTrack('pmJC2aO5vq0', 'Time: The Donut of the Heart', 'J Dilla'),
      realTrack('0yDKIyOJaYM', 'Soon It Will Be Cold Enough', 'Emancipator'),
      realTrack('GMbIF2UeLiA', 'Point in Space and Time', 'Flawed Mangoes'),
      // 27th pass: 5 more tracks, oEmbed-verified same as everything else.
      realTrack('hQ5x8pHoIPA', 'Feather', 'Nujabes feat. Cise Starr & Akin (CYNE)'),
      realTrack('WF34N4gJAKE', 'Cirrus', 'Bonobo'),
      realTrack('oUbznuLaBRs', 'Anthem', 'Emancipator'),
      realTrack('VZBrZV3nHAA', 'Awake', 'Tycho'),
      realTrack('nhl3wfXeCzU', 'econto', 'Wun Two'),
      // 29th pass: brought to 20 tracks per Matthew's roster-wide expansion.
      realTrack('mc_xD6aGV5w', 'Luv(sic) Part 3 feat. Shing02', 'Nujabes'),
      realTrack('L-kyRh7N-kE', 'Kiara', 'Bonobo'),
      realTrack('m94Dhu8gUDw', 'Dive', 'Tycho'),
      realTrack('fULXi348-jI', 'Minor Cause', 'Emancipator'),
      realTrack('5nO7IA1DeeI', 'Workinonit', 'J Dilla'),
      // 33rd pass: brought to 25 tracks per Matthew's second roster-wide
      // expansion, oEmbed-verified same as everything else.
      realTrack('_zMcKruOqa8', 'Luv Letter', 'DJ Okawari'),
      realTrack('zRtN7NRFiZU', 'Somewhere (Deep In The Night)', 'Onra'),
      realTrack('N_gGGpKrIZc', 'Fog', 'Nosaj Thing'),
      realTrack('8oQGWJ3CwBM', 'Sheets', 'Mndsgn'),
      realTrack('u8QhbV1Vyfs', 'Sunrise To Sunset', 'Kupla'),
      realTrack('q-KOSq-iA9w', 'Blue Orchard', 'FloFilz'),
      realTrack('wmNyN1XN9-8', 'Cabin in the Woods', 'Philanthrope'),
      realTrack('ymjfXyQJ4ak', 'Be Free', 'Jinsang'),
      realTrack('7ZguAEoNpZw', 'Soulful', "L'Indécis"),
      realTrack('hebk7pJ4xhE', 'Seasons', 'Aso'),
    ] },

  // 4 new stations added 2026-08-20, tracklists as given by Matthew, all
  // oEmbed-verified. Frequencies slotted into the gaps between the original
  // 5 (288.6 between RELIC SIGNAL/QUIET HOURS, 434.5 between QUIET
  // HOURS/COLD WAVE, 650.0 between COLD WAVE/THE STUDY, 878.9 past THE
  // STUDY toward the top of the band) so none of the original 5 moved.
  { id: 'city-lights', freq: 650.0, callsign: 'CITY LIGHTS', tagline: 'tokyo nights, city pop dreams',
    // 28th pass: renamed from HIGH RISE (option 7B). Same city pop lane,
    // same ident, same tracks -- name/tagline only.
    // 32nd pass: guide's per-station detail page (see drawGuidePageStation).
    desc: "Japanese city pop from the genre's late-70s to late-80s peak -- glossy production, funk basslines, and the sound of Tokyo lit up after dark.",
    // 25th pass: was a straight ascent, same shape as 3 other stations --
    // now a bouncy up-down-up (U D U), closer to the syncopated groove the
    // genre itself has.
    ident: [523.3, 784.0, 659.3, 987.8],
    identTempo: 0.85,
    // 25th pass: city pop masters (late 70s/80s Japanese) run a bit
    // quieter than modern masters -- small boost.
    gain: 1.1,
    // 41st pass -- see the field notes on DISTORTION FIELD above. neon; the brightest, bloomiest picture
    glyph: 'Ω',
    static: 1450,
    crt: { bloomAmt: 1.8, brightness: 1.38 },
    meter: { spring: 0.45, damping: 0.48, swing: 0.95 },
    // 45th pass -- RIPPLE: rain rings on a Tokyo night, Matthew's own
    // pitch for this station.
    visual: 'ripple',
    tracks: [
      realTrack('5zTkTlj2h9E', 'Stay With Me', 'Miki Matsubara'),
      realTrack('tWqZASIxlqs', 'Sparkle', 'Tatsuro Yamashita'),
      realTrack('8ageCZxJ-WQ', '4:00AM', 'Taeko Onuki'),
      // Matthew listed this as "Casiio" -- the actual 1981 city-pop
      // original (and every real recording found) is Yasuha's, so it's
      // credited to her rather than to an artist that doesn't have this
      // song.
      realTrack('4X7ZvpwBiKA', 'Flyday Chinatown', 'Yasuha'),
      // Japan-only city pop per Matthew 8/20 -- all additions below are
      // Japanese artists, matching the 4 originals.
      realTrack('k-BrT2SQ7SI', "Cat's Eye", 'Anri'),
      realTrack('vUQjdwRno5g', 'Say Goodbye', 'Hiroshi Sato'),
      realTrack('k7VkzjSe5Ng', 'Moment Of Twilight', 'Minako Yoshida'),
      realTrack('XE45nsroFTE', 'Ride On Time', 'Tatsuro Yamashita'),
      realTrack('T_lC2O1oIew', 'Plastic Love', 'Mariya Takeuchi'),
      realTrack('XJWqHmY-g9U', 'Telephone Number', 'Junko Ohashi'),
      // 27th pass: 5 more tracks, oEmbed-verified same as everything else.
      // Still Japan-only city pop per the 8/20 editorial decision.
      realTrack('B6O09Jx4ONM', 'Love Step', 'Miharu Koshi'),
      realTrack('1KP9dLRaKWg', 'Adventure', 'Momoko Kikuchi'),
      realTrack('4wVN8r14mT0', 'Midnight Girl', 'Toshiki Kadomatsu'),
      realTrack('WCaOX3PuKKo', 'Kimi no Heart wa Marine Blue', 'S. Kiyotaka & Omega Tribe'),
      realTrack('-YSwJh-4j1s', 'Loveland, Island', 'Tatsuro Yamashita'),
      // 29th pass: brought to 20 tracks per Matthew's roster-wide expansion.
      realTrack('MH-P4mXvDPE', 'Rouge no Dengon', 'Yumi Matsutoya'),
      realTrack('ZhmiKjBEtbg', 'Sea Line', 'Toshiki Kadomatsu'),
      realTrack('Z056hRt23Fo', 'Remember Summer Days', 'Anri'),
      realTrack('NxfiM2SzqYo', 'Fantasy', 'Meiko Nakahara'),
      realTrack('C58nGJ6pn8Q', 'Purple Town', 'Junko Yagami'),
      // 33rd pass: brought to 25 tracks per Matthew's second roster-wide
      // expansion, oEmbed-verified same as everything else. Still
      // Japan-only city pop per the 8/20 editorial decision.
      realTrack('QLvQFLtQyf0', 'Mizuiro no Ame', 'Junko Yagami'),
      realTrack('pTV0dOFOtHg', 'September', 'Mariya Takeuchi'),
      realTrack('8O8m36Jr1Uk', 'Tokai (City)', 'Taeko Onuki'),
      realTrack('CyFTrxwviTc', 'Summer Suspicion', 'S. Kiyotaka & Omega Tribe'),
      realTrack('1x57WiR-uVo', 'Koi no Projection', 'Momoko Kikuchi'),
      realTrack('jaS5yjYSAS0', 'Down Town', 'EPO'),
      realTrack('6LBoP3CLzBg', 'First Light', 'Makoto Matsushita'),
      realTrack('MqaEQtunNX0', "Midnight Cruisin'", 'Kingo Hamada'),
      realTrack('8BNRHW8kwbY', 'Sky Restaurant', 'Hi-Fi Set'),
      realTrack('uWqnsVMc8CQ', 'Last Summer Whisper', 'Anri'),
    ] },
  // 22nd pass (Matthew: "drop outlaw channel completely, 9 channels is our
  // max for now") -- OUTLAW (freq 288.6, spaghetti-western/outlaw-country)
  // removed outright rather than just renamed; its station-ID ident had
  // already been flagged as hard to hear, and 9 is the agreed ceiling for
  // now with HACKBACK's addition. If it comes back later, its full track
  // list (Johnny Cash, Ennio Morricone, Marty Robbins, Colter Wall, Nick
  // Cave, Tom Russell, Calexico) is in git history on this commit's parent.
  { id: 'circuit-crush', freq: 434.5, callsign: 'CIRCUIT CRUSH', tagline: 'analog glow, the long drive home',
    // 32nd pass: guide's per-station detail page (see drawGuidePageStation).
    desc: "Synthwave and retrowave for a drive that never quite ends -- arpeggios, gated drums, and every neon-lit highway from a movie that doesn't exist.",
    // 25th pass: was a straight ascent, same shape as 3 other stations --
    // now dips then double-rises (D U U), and the fastest identTempo of
    // the set, for a punchier/more aggressive announce.
    ident: [587.3, 466.2, 698.5, 932.3],
    identTempo: 0.75,
    // 25th pass: modern synthwave masters are already loud/compressed --
    // no boost.
    gain: 1.0,
    // 41st pass -- see the field notes on DISTORTION FIELD above. circuitry; heaviest misconvergence and mask
    glyph: '¥',
    static: 1750,
    crt: { chroma: 0.5, maskAmt: 0.8, bloomAmt: 1.72 },
    meter: { spring: 0.55, damping: 0.42, swing: 1.05 },
    // 44th pass -- OUTRUN: perspective grid + horizon-sliced sun, the
    // genre's own signature image ("the long drive home").
    visual: 'outrun',
    tracks: [
      realTrack('ZVS6Q_lbKQ0', 'Nightcall', 'Kavinsky'),
      realTrack('URma_gu1aNE', 'Sunset', 'The Midnight'),
      realTrack('-nC5TBv3sfU', 'Tech Noir', 'GUNSHIP'),
      realTrack('TvZskcqdYcE', 'Running in the Night', 'FM-84 feat. Ollie Wride'),
      realTrack('RY66fdMt4vc', 'Future Club', 'Perturbator'),
      realTrack('er416Ad3R1g', 'Turbo Killer', 'Carpenter Brut'),
      realTrack('aPjVZgoaAtE', 'A Real Hero', 'Electric Youth ft. College'),
      realTrack('gDpfybAvEag', 'On the Run', 'Timecop1983'),
      realTrack('eEELYwi-ABg', 'Riot', 'Dance With The Dead'),
      realTrack('qKauZYXABrM', 'Night Force', 'Power Glove'),
      // 27th pass: 5 more tracks, oEmbed-verified same as everything else.
      realTrack('-PKV79lug54', 'Redline', 'Lazerhawk'),
      realTrack('7fDvxlK2FMc', 'Le Perv', 'Carpenter Brut'),
      realTrack('Y8DekFFCE5c', 'Humans Are Such Easy Prey', 'Perturbator'),
      realTrack('0x1tidUctv4', 'Body Talk', 'Mitch Murder'),
      realTrack('VUQxsBTqh1s', 'The Wrath of Code', 'Dan Terminus'),
      // 29th pass: brought to 20 tracks per Matthew's roster-wide expansion.
      realTrack('Jv1ZN8c4_Gs', 'Fly For Your Life', 'GUNSHIP'),
      realTrack('Io6TL3RQ5zw', 'Black Rain', 'Miami Nights 1984'),
      realTrack('51qi_aNKHWk', 'Los Angeles (Live)', 'The Midnight'),
      realTrack('2KU9i_sx4zM', 'Tonight (feat. Back In The Future)', 'Timecop1983'),
      realTrack('G02wKufX3nw', 'In The Face Of Evil', 'Magic Sword'),
      // 33rd pass: brought to 25 tracks per Matthew's second roster-wide
      // expansion, oEmbed-verified same as everything else.
      realTrack('ntTRv7XUxM8', 'Cyanide Sisters', 'Com Truise'),
      realTrack('zYfs-bZS5Zw', 'Nightdrive With You', 'Anoraak'),
      realTrack('O0LB9cIobXY', 'Monochrome', 'Scandroid'),
      realTrack('LDjJ4SSPsZk', 'Time Traveler', 'Betamaxx'),
      realTrack('IDd5JgAcLhI', 'Behemoth', 'GosT'),
      realTrack('LxIyc5qJGzQ', 'My Mistake', 'NINA'),
      realTrack('gzRbL_Jwtzw', 'DiscoDeath', 'Robert Parker'),
      realTrack('k4lt3DO2Xt4', 'Turn Back Time', 'Michael Oakley'),
      realTrack('5W8mvLKSq-U', 'Isolated', 'Trevor Something'),
      realTrack('VE3QIvywZnU', 'Living the Modern Life', 'SelloRekt & LA Dreams'),
    ] },
  // 23rd pass: freq nudged 878.9 -> 854.9 (Matthew: "station 8 and 9 are too
  // close to each other") -- freqToCol() rounded 878.9 and HACKBACK's 893.7
  // to adjacent dial columns (73 and 74), so their preset triangles rendered
  // as a single "▲▲" glyph pair instead of two distinct ticks, despite the
  // 20th-pass comment on HACKBACK claiming they were "distinct". Re-split
  // the tail of the band (THE STUDY 823.1 up to FREQ_MAX 900) roughly evenly
  // across ATOMIC/HACKBACK instead.
  { id: 'atomic', freq: 854.9, callsign: 'ATOMIC', tagline: 'swing on while the counter clicks', // 19th pass: trimmed
    // 32nd pass: guide's per-station detail page (see drawGuidePageStation).
    desc: 'An in-universe atomic-age broadcast: swing, jump blues, and doo-wop from the actual 1940s-50s, playing on regardless of what the counter reads.',
    // 25th pass: was up-up-down, which HACKBACK's new ident also needed --
    // reassigned to a repeated-note doo-wop "bum-BUM" bounce (U flat U)
    // instead, since ATOMIC's genre suits a held repeated note better than
    // any of the 8 straight up/down shapes anyway.
    ident: [392.0, 493.9, 493.9, 587.3],
    identTempo: 0.9,
    // 25th pass: 40s/50s masters (limited-range recording, minimal
    // compression) run quieter than modern masters -- large boost.
    gain: 1.3,
    // 19th pass (Matthew: "make sure atomic playlist is from fallout 4,
    // fallout 76 etc games") -- 5 of the original 10 tracks (Jump Jive An'
    // Wail/Louis Prima, Minnie the Moocher/Cab Calloway, Choo Choo
    // Ch'Boogie/Louis Jordan, Boogie Woogie Bugle Boy/Andrews Sisters, and
    // Good Rockin' Tonight credited to Wynonie Harris rather than the Roy
    // Brown original the games actually use) were genuine 40s/50s classics
    // but NOT songs that are actually on Diamond City Radio (Fallout 4) or
    // Appalachia Radio (Fallout 76) -- checked against the Fallout Wiki's
    // Diamond City Radio song list and GameWatcher's Appalachia Radio
    // tracklist. Replaced with 5 that are actually on those stations
    // (oEmbed-verified same as everything else here); the remaining 5 were
    // already correct and are untouched.
    // 41st pass -- see the field notes on DISTORTION FIELD above. an older set: shorter persistence, looser mask, more flicker and grain
    glyph: '£',
    static: 900,
    crt: { noise: 0.17, flicker: 0.1, decay: 0.7, brightness: 1.2, maskAmt: 0.55 },
    meter: { spring: 0.5, damping: 0.45, swing: 0.85 },
    // 45th pass -- originally sparse Geiger clicks/hot-zone bursts (the
    // tagline's own "counter clicks" made literal). Redesigned in the 47th
    // pass into drifting blocky pixel clouds per live QA; dispatch key
    // ('counter'/drawCounterEffect) kept as-is, only the visual changed.
    visual: 'counter',
    // v0.8: "Wheel of Fortune" (Kay Starr) swapped out for "Sixty Minute
    // Man" below -- genuinely Fallout-radio-tied (Diamond City Radio),
    // same concept-tied discipline as the rest of this roster.
    tracks: [
      realTrack('GkHd1d_UVOE', "I Don't Want to Set the World on Fire", 'The Ink Spots'),
      realTrack('Q9bSOaSuScQ', 'Crawl Out Through the Fallout', 'Sheldon Allman'),
      realTrack('8V7AxNJWKYU', 'Butcher Pete (Part 1)', 'Roy Brown'),
      realTrack('daFhT6mBOWo', 'The Wanderer', 'Dion'),
      realTrack('DGLPvnbryGU', 'The End of the World', 'Skeeter Davis'),
      realTrack('9qd_KDK5ChE', 'Atom Bomb Baby', 'The Five Stars'),
      realTrack('farkSCyXidI', 'Uranium Fever', 'Elton Britt'),
      realTrack('VEyDNTLlRgU', 'Civilization (Bongo, Bongo, Bongo)', 'Andrews Sisters & Danny Kaye'),
      realTrack('6pcve7daxNM', "Keep A-Knockin' (But You Can't Come In)", 'Louis Jordan'),
      realTrack('UNxgn8npVLI', "Pistol Packin' Mama", 'Bing Crosby & The Andrews Sisters'),
      // 27th pass: 5 more tracks -- same concept-tied discipline as the 19th
      // pass fix above applies here too: each is confirmed actually on
      // Diamond City Radio (Fallout 4) or Appalachia Radio (Fallout 76), not
      // just a generic-sounding oldie. One candidate ("Take Me Home, Country
      // Roads") was checked and explicitly rejected -- the in-game track is a
      // commissioned cover, not the real John Denver recording, so crediting
      // it to him would repeat the exact mistake this station already fixed
      // once. oEmbed-verified same as everything else.
      realTrack('ad6EL-qTGl8', 'Orange Colored Sky', 'Nat King Cole'),
      realTrack('3IT8NoEe2_Q', 'Good Rocking Tonight', 'Roy Brown'),
      realTrack('WVgCo1L9yaY', 'Mr. Sandman', 'The Chordettes'),
      realTrack('CSW64jVTDF0', 'Sixteen Tons', 'Tennessee Ernie Ford'),
      realTrack('zhSSJRuGw4c', 'Ghost Riders in the Sky', 'Sons of the Pioneers'),
      // 29th pass: brought to 20 tracks per Matthew's roster-wide expansion.
      // Concept-tied station -- these are genuine period recordings
      // (1941-1954), verified via oEmbed off a reputable oldies-archive
      // station, same discipline as the rest of this roster.
      realTrack('P1EG__jgefA', "Choo Choo Ch'Boogie", 'Louis Jordan & His Tympany Five'),
      realTrack('wf4nY0mLrrA', 'Boogie Woogie Bugle Boy', 'The Andrews Sisters'),
      realTrack('MiFSYJjvgwc', 'Shake, Rattle and Roll', 'Big Joe Turner'),
      realTrack('iYhNtOgwUho', 'All She Wants to Do Is Rock', 'Wynonie Harris'),
      realTrack('pJbDHw_qsFs', 'Sixty Minute Man', 'Billy Ward and His Dominoes'),
      // 33rd pass: brought to 25 tracks per Matthew's second roster-wide
      // expansion -- same concept-tied discipline as above: each confirmed
      // as a real, well-attested atomic-age/period recording, oEmbed-
      // verified same as everything else.
      realTrack('eP9nD0TsqEI', "It's a Sin to Tell a Lie", 'The Ink Spots'),
      realTrack('9A7vuGLocRw', 'Nightmare', 'Artie Shaw & His Orchestra'),
      realTrack('V1HiJR4KkaM', 'Crazy He Calls Me', 'Billie Holiday'),
      realTrack('F0qD-SKugUU', 'Way Back Home', 'Bob Crosby and the Bobcats'),
      realTrack('jq2kqNTHejM', 'Uranium Rock', 'Warren Smith'),
      realTrack('JXObqAMwDxA', 'Open the Door, Richard!', 'Jack McVea and His All Stars'),
      realTrack('xfoseSZtllo', 'Sh-Boom', 'The Chords'),
      realTrack('zPJ7N5_o-u8', 'Money Honey', 'Clyde McPhatter & The Drifters'),
      realTrack('wk-c-mHNBi4', 'Old Man Atom (Talking Atomic Blues)', 'Ozie Waters and His Colorado Cowboys'),
      realTrack('xFg6i2p8YQc', 'Rocket 88', 'Jackie Brenston & His Delta Cats'),
    ] },
  // 20th pass (Matthew: "add a new channel for 0 called Hackback with music
  // like tribe called quest, de la soul, slick rick, outkast, wu tang, MF
  // doom, MC solaar") -- golden-age/underground hip-hop station, bound to
  // the new preset key `0`.
  // 23rd pass: freq nudged 893.7 -> 888.7 -- see the freq comment on ATOMIC
  // above. 893.7 rounded to the dial column right next to ATOMIC's, so the
  // two preset triangles overlapped; this leaves a clear 3-column gap to
  // ATOMIC and reads as its own distinct tick near the top of the band.
  // 28th pass: tagline updated to "golden age hip-hop, west coast legends,
  // deep cuts" (option 9A, tagline option b) -- name (HACKBACK) unchanged.
  { id: 'hackback', freq: 888.7, callsign: 'HACKBACK', tagline: 'golden age hip-hop legends',
    // 32nd pass: guide's per-station detail page (see drawGuidePageStation).
    desc: 'Golden-age hip-hop with a west coast backbone -- classic boom-bap, deep cuts, and a few legends who never needed a feature to prove it.',
    // 25th pass: was a straight descent, same shape as 3 other stations --
    // now a rise then a hard drop (U U D), like a boom-bap tag snapping
    // down on the beat, with a tight/punchy identTempo to match.
    ident: [220.0, 293.7, 349.2, 293.7],
    identTempo: 0.8,
    // 25th pass: modern hip-hop masters are already loud/compressed -- no
    // boost.
    gain: 1.0,
    // 41st pass -- see the field notes on DISTORTION FIELD above. thicker scanlines, a touch more grain
    glyph: '%',
    static: 1150,
    crt: { noise: 0.15, bloomAmt: 1.5, scanMax: 0.75 },
    meter: { spring: 0.42, damping: 0.5, swing: 0.95 },
    // 45th pass -- BOOM BAP: a 16-step MPC sequencer under heavy drifting
    // scanline bands, matching this station's own thicker-scanlines CRT
    // trait, name taken straight from this station's own desc field.
    visual: 'boombap',
    // v0.8: "California Love" swapped to the Short Radio Edit upload below
    // -- Matthew flagged the previous ID as the full-length version with
    // the spoken intro; this cut starts straight into the song.
    tracks: [
      realTrack('D-uV8TGjaGU', 'Can I Kick It?', 'A Tribe Called Quest'),
      realTrack('P800UWoE9xs', 'Award Tour', 'A Tribe Called Quest'),
      realTrack('jdtKT5q-CW8', 'Me Myself and I', 'De La Soul'),
      realTrack('WX6G6sODMrQ', 'Buddy', 'De La Soul'),
      realTrack('HjNTu8jdukA', "Children's Story", 'Slick Rick'),
      realTrack('drsQLEU0N1Y', 'Rosa Parks', 'Outkast'),
      realTrack('EUVo8epKwv0', 'Ms. Jackson', 'Outkast'),
      realTrack('4yNQ7_7I5aE', 'C.R.E.A.M.', 'Wu-Tang Clan'),
      realTrack('LMeluRz2wv4', 'Doomsday', 'MF DOOM'),
      realTrack('MNYsmMDZfiA', 'Bouge de là', 'MC Solaar'),
      // 27th pass: 5 more tracks, oEmbed-verified same as everything else.
      realTrack('lZXtabqDY-c', "It Ain't Hard to Tell", 'Nas'),
      realTrack('R0IUR4gkPIE', 'Protect Ya Neck', 'Wu-Tang Clan'),
      realTrack('y9lNbNGbo24', 'Mass Appeal', 'Gang Starr'),
      realTrack('cM4kqL13jGM', 'Rebirth of Slick (Cool Like Dat)', 'Digable Planets'),
      realTrack('s2RhCDAMDBo', 'Respiration', 'Black Star'),
      // 29th pass: brought to 20 tracks per Matthew's roster-wide expansion.
      realTrack('8GliyDgAGQI', 'Nuthin\' But A "G" Thang', 'Dr. Dre'),
      realTrack('h4UqMyldS7Q', 'It Was A Good Day', 'Ice Cube'),
      realTrack('a-mAK3uB2_0', "Passin' Me By", 'The Pharcyde'),
      realTrack('1plPyJdXKIY', 'Regulate', 'Warren G'),
      realTrack('1ut9spXrkDw', 'They Reminisce Over You (T.R.O.Y.)', 'Pete Rock & C.L. Smooth'),
      // 33rd pass: brought to 25 tracks per Matthew's second roster-wide
      // expansion, oEmbed-verified same as everything else.
      realTrack('KKA9rMWbygw', 'Check Yo Self', 'Ice Cube'),
      realTrack('ru2IrTY2UG0', 'Accordion', 'MF DOOM (Madvillain)'),
      realTrack('hI8A14Qcv68', 'N.Y. State of Mind', 'Nas'),
      realTrack('TgelVkHEKdw', 'DWYCK', 'Gang Starr'),
      realTrack('EuJaStSL0xM', 'Definition', 'Black Star'),
      realTrack('fXJc2NYwHjw', "93 'til Infinity", 'Souls of Mischief'),
      realTrack('RijB8wnJCN0', 'Insane in the Brain', 'Cypress Hill'),
      realTrack('5kZFGo5r82o', 'California Love (Short Radio Edit)', '2Pac feat. Dr. Dre & Roger Troutman'),
      realTrack('cKu3_3mp1U8', 'Let Me Ride', 'Dr. Dre'),
      realTrack('OYbakN42pvA', 'Gin and Juice', 'Snoop Doggy Dogg'),
    ] },
  { id: 'cipher', freq: 133.7, callsign: 'CIPHER', tagline: 'digital infiltration',
    // 28th pass (2026-08-21): New cyberpunk station, hacker movies/synthwave
    // aesthetic (locked-in name/tagline per Matthew's naming pass). Placed
    // at 219.8, the frequency freed by RELIC SIGNAL's retirement (see the
    // retirement comment above DRIFT MODE) -- keeps the roster at 9
    // stations total rather than growing to 10.
    // 48th pass (2026-08-22, v0.8): moved 219.8 -> 133.7 -- a "1337" nod
    // that fits CIPHER's own hacker theme -- which drops it under
    // DISTORTION FIELD and swaps their preset order: CIPHER is now key
    // `1`, DISTORTION FIELD key `2` (Matthew: "swapping stations 1 and 2
    // and making station 1 be 133.7"). STATION_PRESET_ORDER is
    // freq-sorted, so this one change was the entire swap. A follow-up
    // patch then moved DISTORTION FIELD's own freq too, 137.4 -> 194.8 --
    // see its field notes -- once the two ended up only 3.7 KHZ apart.
    // 32nd pass: guide's per-station detail page (see drawGuidePageStation).
    desc: 'Big beat and breakbeat electronica for late-night infiltration runs -- Chemical Brothers, Prodigy, and Massive Attack alongside everything that soundtracked a decade of hacker movies.',
    // Ident is a bouncy up-down-up-down (U D U D) breakbeat style.
    ident: [523.3, 349.2, 587.3, 293.7],
    identTempo: 0.9,
    // Breakbeat/electronic genre runs moderately loud, no special boost
    // needed.
    gain: 1.0,
    // 28th pass, CORRECTED 2026-08-21: the original 30 track IDs below were
    // never actually oEmbed-verified before being committed -- every single
    // one 404'd (see the fix commit). Full oEmbed-verify pass re-run from
    // scratch via WebSearch + curl against the oEmbed endpoint, same
    // discipline as every other station. Landed at 25 verified tracks
    // rather than force-padding to 30 with more guesses; 2 tracks that
    // would've duplicated CIRCUIT CRUSH (Perturbator "Future Club",
    // Carpenter Brut "Turbo Killer") were deliberately left out to keep the
    // two stations' rosters distinct. Down to 24 after "Da Funk" was
    // pulled (its official video has audio baked over/under the studio
    // track, not a clean listen for a radio station). Then 21: dropped
    // both Leftfield tracks (Song of Life, Phat Planet) and both Aphex
    // Twin tracks (Windowlicker, Come to Daddy) at Matthew's request, and
    // added The Prodigy's "Omen" (oEmbed-verified, official Prodigy
    // channel upload). Now 22 -- Song of Life (Leftfield) re-added at
    // Matthew's request during the roster-wide "bring every station to
    // ~20" pass. Note: this exact track is the one signal-dev's notes
    // flag as having stalled at IFrame state UNSTARTED during a live
    // verification pass despite a clean oEmbed 200 -- not dead, just
    // worth a second look if it ever seems to hang on lock.
    // 41st pass -- see the field notes on DISTORTION FIELD above. crystalline; more colour fringe and a tighter grille, meters twitch
    glyph: '╬',
    static: 1600,
    crt: { chroma: 0.45, maskAmt: 0.78, bloomAmt: 1.6 },
    meter: { spring: 0.6, damping: 0.4, swing: 1.05 },
    // 44th pass -- BREACH: falling hex noise with fragments that resolve
    // out of the scramble, this station's own glyph seeded into the noise.
    visual: 'breach',
    // v0.8: "Come On My Selector" (Squarepusher) swapped out for
    // "Windowlicker" (Aphex Twin) below, oEmbed-verified off the artist's
    // own YouTube channel.
    tracks: [
      realTrack('wmin5WkOuPw', 'Firestarter', 'The Prodigy'),
      realTrack('xW17jtkjvvg', 'Smack My Bitch Up', 'The Prodigy'),
      realTrack('xMVTKOoy1uk', 'Omen', 'The Prodigy'),
      realTrack('iTxOKsyZ0Lw', "Block Rockin' Beats", 'The Chemical Brothers'),
      realTrack('L0dxByaPWhM', 'Elektrobank', 'The Chemical Brothers'),
      // 35th pass: both Daft Punk tracks pulled per Matthew's request --
      // "One More Time" (French house) and "Derezzed" (2010 Tron: Legacy
      // score) read as off-genre for a station meant to capture 90s-2000s
      // hacker-movie culture specifically. Replaced below with two tracks
      // that are actually of that era/soundtrack lineage.
      // 34th pass: both Fatboy Slim tracks pulled per Matthew's request,
      // replaced below (oEmbed-verified same as everything else). One
      // candidate replacement ("Windowlicker", Aphex Twin) was rejected --
      // that artist was already deliberately removed from this station.
      realTrack('3SwwljI-8JY', 'Halcyon', 'Orbital'),
      realTrack('yJnve05CnNE', 'The Box', 'Orbital'),
      realTrack('u7K72X4eo_s', 'Teardrop', 'Massive Attack'),
      realTrack('Z15c2UineoU', 'Safe from Harm', 'Massive Attack'),
      realTrack('QmKE9zKYx0g', 'Song of Life', 'Leftfield'),
      realTrack('XiMrrleH_hI', 'Born Slippy .NUXX', 'Underworld'),
      realTrack('F6Y7lcvubhU', 'Rez', 'Underworld'),
      realTrack('BkZroY_oERY', 'Roygbiv', 'Boards of Canada'),
      realTrack('A2zKARkpDW4', 'Dayvan Cowboy', 'Boards of Canada'),
      realTrack('JATZS5_Qi80', 'Journeyman', 'Amon Tobin'),
      realTrack('NB3MyO_RfpY', 'Bloodstone', 'Amon Tobin'),
      realTrack('5ZT3gTu4Sjw', 'Windowlicker', 'Aphex Twin'),
      realTrack('ev3vENli7wQ', 'Gantz Graf', 'Autechre'),
      // 35th pass: replacements for the two pulled Daft Punk tracks.
      // "Clubbed to Death" is the lobby-shootout/subway cue from The Matrix
      // (1999) -- no official-channel upload exists on YouTube, so this ID
      // is the best-quality embeddable fan upload, oEmbed-verified same as
      // everything else. "Prime Audio Soup" was used directly in The Matrix
      // itself.
      realTrack('DzNex7Mf1bg', 'Clubbed to Death (Kurayamino Mix)', 'Rob Dougan'),
      realTrack('lCCQdH9dffA', 'Prime Audio Soup', 'Meat Beat Manifesto'),
      // 33rd pass: brought to 25 tracks per Matthew's second roster-wide
      // expansion, oEmbed-verified same as everything else.
      realTrack('iCBL33NKvPA', 'Spybreak!', 'Propellerheads'),
      realTrack('OjTC88oIRys', 'Busy Child', 'The Crystal Method'),
      realTrack('s-1Y2EqThyQ', 'LFO', 'LFO'),
      realTrack('wfWMv8Y1V5E', 'Papua New Guinea', 'The Future Sound of London'),
      realTrack('XAlLaGhfLq4', 'B-Boy Stance', 'Freestylers'),
      realTrack('ub747pprmJ8', 'Right Here, Right Now', 'Fatboy Slim'),
      realTrack('Ld2Qb7l1VSs', 'Ni Ten Ichi Ryu', 'Photek'),
      realTrack('m-uztVX6QFQ', 'At the River', 'Groove Armada'),
      realTrack('8B-i1vsA6jw', 'Sour Times', 'Portishead'),
      realTrack('svJvT6ruolA', 'No Good (Start the Dance)', 'The Prodigy'),
    ] },
]

// Preset-key ordering (17th pass, Matthew: "presets should match the tuning
// band left to right") -- STATIONS above is ordered however stations were
// added over time (original 5, then 4 more slotted into freq gaps), not by
// frequency, so pressing 1-9 in order used to jump around the dial instead
// of walking it left to right (e.g. preset 5, THE STUDY at 823.1, sat to
// the RIGHT of preset 6, HIGH RISE at 650.0). Rather than reshuffle the
// STATIONS array itself -- which would scatter the historical comments
// documenting when/why each station and its frequency were added -- this
// derives a separate lookup sorted by freq ascending, so preset number
// order always matches left-to-right position on the dial regardless of
// STATIONS' own (chronological) order.
const STATION_PRESET_ORDER = [...STATIONS].sort((a, b) => a.freq - b.freq)

// SECRET_STATION (2026-08-22, Matthew: "let's launch a secret NIN station,
// only reachable by pressing 0") -- deliberately NOT part of STATIONS. That
// keeps it out of everything that walks STATIONS or STATION_PRESET_ORDER:
// nearestStation() (so it can never be found by seeking/scanning),
// stations-to-md.js's generated roster doc, and the Guide's station index
// and detail pages (guideTotalPages() is 2 + STATION_PRESET_ORDER.length,
// so it doesn't even get a page). The only way in is the dedicated '0' key
// handler below, which calls presetTune() on this object directly.
// Frequency 777.7 is CIPHER's old slot from before it moved to 219.8 (28th
// pass) -- freed up and never reused since, so this reuses a piece of
// project history instead of picking an arbitrary number.
const SECRET_STATION = {
  id: 'nin', freq: 777.7, callsign: 'NINE INCH NAILS', tagline: 'industrial rage, mechanical dread',
  // Tight chromatic half-step descent (B3-Bb3-A3-Ab3) -- every other
  // station's ident jumps by a third or more, so this one's the only motif
  // on the roster that grinds down in semitones. Deliberately harsh/
  // mechanical rather than melodic, to match the station.
  ident: [246.9, 233.1, 220.0, 207.7],
  identTempo: 0.7,
  // 90s-2000s alt/industrial rock masters run loud already -- no boost.
  gain: 1.0,
  secret: true,
  // 41st pass -- same per-station identity fields as the public roster (see
  // DISTORTION FIELD's field notes). No glyph: this one is never drawn on
  // the dial, which is the whole point of it being secret.
  static: 2000,
  crt: { noise: 0.2, flicker: 0.12, bloomAmt: 1.6, brightness: 1.4 },
  meter: { spring: 0.62, damping: 0.38, swing: 1.15 },
  // 45th pass -- DREAD: a flickering panel grid with full-row tears, the
  // most hostile visual on the roster, fitting for the one station that
  // isn't supposed to be found.
  visual: 'dread',
  tracks: [
    realTrack('nOVW938sr0k', 'Head Like a Hole', 'Nine Inch Nails'),
    realTrack('eQy0MSchVnM', 'Terrible Lie', 'Nine Inch Nails'),
    realTrack('L0WWoJz4cHM', 'Something I Can Never Have', 'Nine Inch Nails'),
    realTrack('yVpw1SwJRBI', 'Gave Up', 'Nine Inch Nails'),
    realTrack('eTYU94s6bbc', 'Wish', 'Nine Inch Nails'),
    realTrack('PTFwQP86BRs', 'Closer', 'Nine Inch Nails'),
    realTrack('-ZJvHXm4cYM', 'March of the Pigs', 'Nine Inch Nails'),
    realTrack('0MNbjF3-VI4', 'Reptile', 'Nine Inch Nails'),
    realTrack('SO4p9DeaCkw', 'Ruiner', 'Nine Inch Nails'),
    realTrack('QWDsyvIfbak', 'The Becoming', 'Nine Inch Nails'),
    realTrack('KR4DjYczINM', 'Hurt', 'Nine Inch Nails'),
    realTrack('XdhKnAw6VZw', 'Burn', 'Nine Inch Nails'),
    realTrack('nUf-XxQed08', 'The Perfect Drug', 'Nine Inch Nails'),
    realTrack('TfKTgx15jag', 'The Day the World Went Away', 'Nine Inch Nails'),
    realTrack('dcIOInVS7jo', 'La Mer', 'Nine Inch Nails'),
    realTrack('O56rh3K0j6I', 'Into the Void', 'Nine Inch Nails'),
    realTrack('P9BfvPjsXXw', "We're in This Together", 'Nine Inch Nails'),
    realTrack('kUZn9mk0g0w', 'Somewhat Damaged', 'Nine Inch Nails'),
    realTrack('2U0flA_Yp64', 'And All That Could Have Been', 'Nine Inch Nails'),
    realTrack('xwhBRJStz7w', 'The Hand That Feeds', 'Nine Inch Nails'),
    realTrack('F-jZHMX-CJ0', 'Right Where It Belongs', 'Nine Inch Nails'),
    realTrack('wwvLlEtxX3o', 'Only', 'Nine Inch Nails'),
    realTrack('FvVDlbzsKR4', 'Survivalism', 'Nine Inch Nails'),
    realTrack('yA281OuU3rk', 'Copy of A', 'Nine Inch Nails'),
    realTrack('gm4tn8znQE0', 'Burning Bright (Field on Fire)', 'Nine Inch Nails'),
  ],
}

// --- layout (80x25 grid) -----------------------------------------------

// Re-spaced 2026-08-20 (4th pass) -- boxed layout. Previous passes fixed
// vertical spacing and moved VOL/SIG below the band, but everything still
// read as loose floating text lines. Matthew asked for elements to have
// more presence: the tuning band, the level meters, and the station info
// are now each their own bordered panel (box-drawing chars, natively
// supported by the grid -- see term.js's join-column handling for the
// U+2500-259F range), and the control legend at the bottom gets the same
// filled-background treatment as the title bar instead of floating dim
// text. Box widths all match (columns 2-77) for a consistent frame.
const DIAL_X0 = 4
const DIAL_X1 = 75
const BOX_X0 = 2
const BOX_X1 = 77

// Row 1 sits blank between the title bar and STATUS_Y. The brand-plate
// nameplate briefly lived here (10th pass) but moved into the title bar
// itself in the 11th pass -- this row is free again.
// 23rd pass: it briefly doubled as a transient home for a "[C] DISPLAY"
// mode toast (flashDisplayMode()). 31st pass: that toast was removed --
// the antenna pane's persistent mode strip (drawModeStrip()) already shows
// the same thing, so the transient one was redundant (Matthew: "thought
// was cool but now not needed"). This row is genuinely free again except
// for the guide overlay (15th pass), which still claims it for its own
// header while open (see key()).
const DISPLAY_MODE_Y = 1
const STATUS_Y = 2
// Fixed interior width for the status word inside setStatus()'s brackets
// (18th pass) -- longest status string in use is "BUBBLEGUM PINK" (14
// chars, one of the display-mode names flashStatus() announces as of the
// 38th pass; "POWERING DOWN" was the 13-char high-water mark before that).
// Padding every status word to this width keeps the whole "● [ STATUS ]"
// readout a constant length so the LED never shifts position between
// transitions. Bump this if a longer status string is ever added.
const STATUS_TEXT_WIDTH = 14
// 38th pass: per-character stagger of the status row's typewriter reveal
// (see setStatus). Short enough that the longest string still lands well
// inside a quarter second -- this is punctuation, not an animation to sit
// through.
const STATUS_REVEAL_MS = 18

const TUNER_TOP_Y = 3
const SCALE_Y = 4
const DIAL_Y = 5
const FREQ_Y = 6
const TUNER_BOT_Y = 7

// ON AIR moved above LEVELS 2026-08-20 (5th pass) -- what's actually
// playing matters more than the volume/signal meters, so it gets the
// higher-priority slot right under the tuner (Matthew: "think about
// priority and user experience").
// 7th pass (same day): split the single ON AIR box into two -- STATION
// (callsign + tagline, identity, doesn't change on a track skip) and NOW
// PLAYING (title/artist + progress bar + play state, changes on every
// track). Matthew: "station info should be broken out from current
// playing song info; this looks like a blob."
// 8th pass (same day): the progress bar and play-state indicator merged
// onto one PLAYBACK_Y row (drawPlayback) -- they're both about playback
// status and there was no reason they needed separate lines. That freed a
// row, spent on a blank divider inside LEVELS between the real VOL/SIG
// meters and the decorative VU row, so VU reads as its own thing instead
// of fusing into one solid block with the meters above it (Matthew: "the
// levels blob").
// 9th pass (same day): Matthew wanted VOL further separated from SIG too,
// so LEVELS gets a second divider. Paid for by dropping the blank spacer
// row between TUNER and STATION -- those two boxes now sit border-to-
// border like NOWPLAYING/METERS already did, which is consistent rather
// than a special case.
const STATION_TOP_Y = 8
const STATION_Y = 9
const TAGLINE_Y = 10
const STATION_BOT_Y = 11

const NOWPLAYING_TOP_Y = 12
const TRACK_Y = 13
const PLAYBACK_Y = 14
const NOWPLAYING_BOT_Y = 15

const METERS_TOP_Y = 16
const VOL_Y = 17
const VOL_SIG_DIVIDER_Y = 18
const SIG_Y = 19
const VU_DIVIDER_Y = 20
const VU_Y = 21
const METERS_BOT_Y = 22

// The four box-bottom rows, and each one's RESTING attribute once whatever
// touched it settles back down. Three of the four are the panel-standard
// MUTED; NOW PLAYING is the "hero" box (see drawChrome's note) and rests one
// notch brighter, at BOLD. Anything that flashes a cell on one of these rows
// and later restores it -- the always-on idle phosphor shimmer, crtIdleEvent's
// tear event -- has to look this up per row rather than hardcoding MUTED, or
// every cell it touches on the NOW PLAYING border gets quietly downgraded to
// MUTED and never brightens back up on its own. (Found live, 42nd pass: the
// NOW PLAYING border was visibly losing brightness cell by cell over a
// session, only recovering on the next power cycle's full chrome redraw --
// exactly that. playBootFlicker() hit this same trap once already, in the
// 30th pass, and fixed it locally for its own uniform boot-flicker settle;
// this generalizes that fix for every other consumer of these four rows.)
const BOX_BOTTOM_ROWS = [TUNER_BOT_Y, STATION_BOT_Y, NOWPLAYING_BOT_Y, METERS_BOT_Y]
const BOX_BOTTOM_REST_ATTR = new Map([
  [TUNER_BOT_Y, MUTED],
  [STATION_BOT_Y, MUTED],
  [NOWPLAYING_BOT_Y, BOLD],
  [METERS_BOT_Y, MUTED],
])
// The idle shimmer's brief pre-restore dip, one brightness notch below each
// row's own rest level (term.js: FAINT 100 < DIM 150 < MUTED 180 < BOLD/
// NORMAL ~205) -- NOT a universal DIM. A flat DIM read as an invisible
// 30-unit dip on the three MUTED rows (150 vs 180) but a much more obvious
// 55-unit dip PLUS a momentary bold-to-normal face change on NOW PLAYING
// (150 vs BOLD's ~205), since that row rests a full notch brighter than the
// others (see BOX_BOTTOM_REST_ATTR). Found live, 42nd pass, right after
// fixing the rest-attribute bug above -- same row, new symptom, same fix
// shape: don't hardcode one attribute for all four rows.
const BOX_BOTTOM_FLASH_ATTR = new Map([
  [TUNER_BOT_Y, DIM],
  [STATION_BOT_Y, DIM],
  [NOWPLAYING_BOT_Y, MUTED],
  [METERS_BOT_Y, DIM],
])

// LEVELS split (18th pass, Matthew: "we have room down in the levels area
// to maybe halve that and have levels on one side and something tbd on the
// other") -- VOL/SIG/VU meters, which never actually needed the box's full
// ~74-column interior (their compact "LABEL [bar] NN" text just used to
// sit centered in a lot of empty space), now live in the left half only.
// The right half holds the animated antenna glyph (see drawAntenna()).
// METERS_DIVIDER_X is the vertical divider's column; interior left range is
// BOX_X0+1..METERS_DIVIDER_X-1, right range is METERS_DIVIDER_X+1..BOX_X1-1.
const METERS_DIVIDER_X = 39

// GIAL nameplate (19th pass) -- retired 23rd pass. Was always a stated
// placeholder ("for now", "not a final wordmark" -- see git history),
// replaced with the PWR/AIR/STEREO/MONO/MUTE indicator panel, then (29th
// pass) with the animated antenna glyph (drawAntenna()) in the same LEVELS
// right half.

const HINT_Y1 = 23
const HINT_Y2 = 24

// --- mobile lite layout (45th pass) -------------------------------------
// A second, much smaller layout, live only when MOBILE_LITE picked the
// narrow GRID in config.js -- see the import comment above. Column/row
// literals here, unlike the desktop block above, since the mobile GRID is a
// fixed 42x22 whenever this path runs at all (config.js decides one grid or
// the other before this module even runs, never both). Just the identity
// essentials: station, now playing, status, a touch-gesture legend instead
// of the keyboard one. No dial, no LEVELS/antenna instrument panel, no
// clock/brand-plate -- all of that reads as noise at this size and none of
// it is interactive on a device with no keyboard and no drag-to-seek.
const MBOX_X0 = 1
const MBOX_X1 = 40
const MSTATUS_Y = 2
const MSTATION_TOP_Y = 4
// Hints are pinned to the bottom of the 22-row grid. Everything between the
// STATION box and the hints -- NOW PLAYING, the widget row -- is computed by
// mobileLayout() below rather than fixed, so a one-line tagline or track
// title actually reclaims its row instead of leaving it blank.
const MHINT_Y1 = 20
const MHINT_Y2 = 21
// 2026-08-22 (Matthew: "the vu and signal are too close to each other...
// make them on the same line, spread out from each other") -- VU sits left
// of this column, SIG sits right of it, on one shared widget row instead of
// two stacked ones. Column left blank as the gap between them rather than
// drawing a divider glyph -- the STATION/NOW PLAYING boxes are the only
// bordered elements on this screen, and a widget row divider would compete
// with them.
const MWIDGET_DIVIDER_X = 21

// 2026-08-22 (Matthew: "the layout of text in the boxes... not using the
// space well... room to put some fun things below now playing") -- row
// positions for everything between the STATION box and the hint footer,
// derived from how many lines the current tagline/track title actually need
// (1 or 2 each -- see wrapLines()). A short tagline or title collapses its
// box by a row instead of leaving a blank line, and that reclaimed space
// becomes room for the VU/SIG widget row. Recomputed by mobileRelayout()
// whenever either line count changes; mobileShowStation/mobileShowTrack read
// the current one off this._mLayout rather than a fixed constant.
function mobileLayout(tagLines, trackLines) {
  const top = MSTATION_TOP_Y
  const stationCall = top + 1
  const stationTag1 = top + 2
  const stationTag2 = tagLines >= 2 ? top + 3 : null
  const stationBot = top + 2 + tagLines
  const npTop = stationBot + 2
  const npTrack1 = npTop + 1
  const npTrack2 = trackLines >= 2 ? npTop + 2 : null
  const npArtist = npTop + 1 + trackLines
  const npBot = npArtist + 1
  // 2026-08-22 (Matthew: "the vu and signal are too close to each other.
  // maybe make them on the same line, spread out from each other?") -- one
  // shared row, VU left / SIG right, rather than two stacked rows.
  const widgetRow = npBot + 2
  return {
    tagLines, trackLines,
    stationTop: top, stationCall, stationTag1, stationTag2, stationBot,
    npTop, npTrack1, npTrack2, npArtist, npBot,
    widgetRow,
    hint1: MHINT_Y1, hint2: MHINT_Y2,
  }
}

/** Centre text, clamped so it never starts off-grid (a too-long string
 *  would otherwise centre to a negative x and get silently clipped/garbled
 *  at both edges -- this is what broke the hint row before). */
function centerX(cols, text) {
  return Math.max(0, Math.floor((cols - text.length) / 2))
}

/** Same idea as centerX, but centered within an arbitrary [x0, x1] column
 *  range instead of the full grid width (18th pass) -- used by the LEVELS
 *  meters now that they're confined to the box's left half rather than its
 *  full interior. */
function centerXRange(x0, x1, text) {
  return x0 + Math.max(0, Math.floor((x1 - x0 + 1 - text.length) / 2))
}

// Date/time module (15th pass, Matthew: "let's add date and time as a
// module"). Fixed-width "MM/DD HH:MM" (always 11 chars) so drawClock() can
// write it in place every tick without needing to blank first.
// 16th pass (Matthew: seconds were distracting, and too dim/wrong spot in
// the title bar) -- dropped :SS. The tick timer still fires every second
// (drawStandbyClock/scan timers elsewhere rely on the same cadence being
// cheap), but the string itself only actually changes once a minute now,
// so nothing visibly flickers.
function formatClock(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Hard-cap a string to maxLen, marking the cut with "..." (not the U+2026
 *  ellipsis glyph -- the bitmap font may not have it, and a missing glyph
 *  silently falls back to "?", which reads worse than three periods).
 *  BUG FIXED 2026-08-20 (9th pass): centerX only clamped the START
 *  position so a string never began off-grid, but never limited the
 *  string's own length -- a long track/artist combo (e.g. "An Ending
 *  (Ascent) [arr. David Le Page] -- Brian Eno / Orchestra of the Swan")
 *  just ran straight through the STATION/NOW PLAYING box's side borders
 *  and off the edge of the 80-column grid. Every track line now goes
 *  through this before being centered. */
function truncate(str, maxLen) {
  if (str.length <= maxLen) return str
  if (maxLen <= 3) return str.slice(0, Math.max(0, maxLen))
  return str.slice(0, maxLen - 3) + '...'
}

// 45th pass -- word-wrap into up to maxLines lines of maxWidth, rather than
// truncate()'s single-line ellipsis. Mobile's narrower columns cut off
// station names and track titles that fit fine on desktop's wider boxes;
// Matthew: "I also don't like not seeing the whole name and title... use
// additional lines as needed." Greedy fill; if there's still leftover text
// after maxLines, the last line gets truncate()'s ellipsis treatment so it's
// at least visibly cut off rather than silently dropped.
function wrapLines(text, maxWidth, maxLines) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines = []
  let cur = ''
  let i = 0
  for (; i < words.length; i++) {
    const word = words[i]
    const candidate = cur ? `${cur} ${word}` : word
    if (candidate.length <= maxWidth) { cur = candidate; continue }
    if (!cur) { lines.push(truncate(word, maxWidth)); continue } // one word wider than the whole box
    lines.push(cur)
    cur = word
    if (lines.length >= maxLines) break
  }
  if (lines.length < maxLines && cur) { lines.push(cur); i = words.length }
  if (i < words.length || lines.length > maxLines) {
    lines.length = Math.min(lines.length, maxLines)
    const last = lines[maxLines - 1] ?? ''
    lines[maxLines - 1] = last.length + 3 <= maxWidth ? `${last}...` : truncate(last, maxWidth)
  }
  return lines
}

/** First n tracks from a station's tracks array, deduped so no artist
 *  repeats -- used by the guide's per-station "SAMPLE TRACKS" list (32nd
 *  pass, Matthew: "don't list the same artist more than once"). Walks the
 *  array in its existing order rather than reshuffling, so the sample
 *  still reflects what's actually first in rotation -- it just skips a
 *  repeat artist's 2nd/3rd song in favor of the next distinct one, rather
 *  than picking artists at random.
 *
 *  35th pass BUG FIX (Matthew: "brian eno as a sample track doesn't work on
 *  drift mode's guide page") -- the original dedup keyed on the exact
 *  `artist` string, so a collaboration credit like "Brian Eno / Orchestra of
 *  the Swan" didn't register as the same artist as a solo "Brian Eno"
 *  credit elsewhere in the same station, and both slipped into the sample
 *  list -- reading as the same artist listed twice. Now dedups on the
 *  primary credited name (text before the first "/", "&", ",", "feat.",
 *  "ft.", " x ", or " and ", with a leading "The " stripped), so
 *  differently-billed credits for the same act collapse to one entry. */
function primaryArtist(artist) {
  const first = artist.split(/\s*(?:\/|,|&|\sfeat\.|\sft\.|\sx\s|\sand\s)\s*/i)[0].trim()
  return first.replace(/^The\s+/i, '').toLowerCase()
}
function sampleTracks(tracks, n) {
  const seen = new Set()
  const out = []
  for (const t of tracks) {
    const key = primaryArtist(t.artist)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
    if (out.length >= n) break
  }
  return out
}

/** Greedy word-wrap: splits text into lines no wider than maxWidth,
 *  breaking only on spaces. 32nd pass, for the guide's per-station
 *  description block -- unlike every other guide line (fixed-format
 *  status/header text that either fits or gets truncate()'d), a
 *  description is free-form prose, so it needs to actually wrap rather
 *  than get cut off with "...". */
function wordWrap(text, maxWidth) {
  const words = text.split(' ')
  const lines = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (next.length > maxWidth && cur) { lines.push(cur); cur = w }
    else cur = next
  }
  if (cur) lines.push(cur)
  return lines
}

/** Box-drawing helpers. Borders are drawn once (in init) and never touched
 *  again -- every row-content function below clears only its own interior
 *  span, not the full canvas width, so the frame stays put across redraws. */
// labelX1 (18th pass, defaults to x1) lets a label be centered over a
// narrower span than the box's full width -- LEVELS uses this to keep its
// title clear of the METERS_DIVIDER_X vertical divider added the same
// pass, without changing how every other (unsplit) box's label centers.
function drawBoxTop(term, y, x0, x1, label, attr, labelX1 = x1) {
  const inner = labelX1 - x0 - 1
  const tag = label ? ` ${label} ` : ''
  const tagX = tag ? x0 + 1 + Math.floor((inner - tag.length) / 2) : -1
  term.put(x0, y, '┌', attr)
  for (let x = x0 + 1; x < x1; x++) {
    if (tag && x >= tagX && x < tagX + tag.length) term.put(x, y, tag[x - tagX], attr)
    else term.put(x, y, '─', attr)
  }
  term.put(x1, y, '┐', attr)
}
function drawBoxBottom(term, y, x0, x1, attr) {
  term.put(x0, y, '└', attr)
  for (let x = x0 + 1; x < x1; x++) term.put(x, y, '─', attr)
  term.put(x1, y, '┘', attr)
}
function drawBoxSide(term, y, x0, x1, attr) {
  term.put(x0, y, '│', attr)
  term.put(x1, y, '│', attr)
}

/** Speaker-grille perforation pattern for the LEVELS box divider rows
 *  (10th pass). Reuses '·', already confirmed present in the bitmap font
 *  (the idle-shimmer dots on the dial use the same glyph). */
function drawGrille(term, y, x0, x1) {
  for (let x = x0 + 1; x < x1; x++) {
    term.put(x, y, (x - x0) % 2 === 1 ? '·' : ' ', FAINT)
  }
}

function freqToCol(f) {
  const pct = (f - FREQ_MIN) / (FREQ_MAX - FREQ_MIN)
  return Math.round(DIAL_X0 + pct * (DIAL_X1 - DIAL_X0))
}
function colToFreq(col) {
  const pct = (col - DIAL_X0) / (DIAL_X1 - DIAL_X0)
  return FREQ_MIN + pct * (FREQ_MAX - FREQ_MIN)
}
function clampFreq(f) { return Math.min(FREQ_MAX, Math.max(FREQ_MIN, f)) }
// 41st pass: dial columns holding a station marker, computed once (station
// frequencies never change at runtime). frame()'s seek shimmer skips these
// so it stops erasing the markers -- see the bug note there. Declared HERE
// rather than up with STATION_PRESET_ORDER because freqToCol() reads
// DIAL_X0/DIAL_X1, which are const declarations further down the file:
// evaluating this any earlier throws a temporal-dead-zone ReferenceError and
// takes the whole module out. The secret station is deliberately absent --
// it has no marker to protect, and reserving its column would carve a
// permanently shimmer-free notch in the dial at 777.7, exactly the kind of
// tell a hidden station should not have.
const STATION_COLS = new Set(STATIONS.map((ch) => freqToCol(ch.freq)))
// 2026-08-22 (Matthew: "let's make it so you can lock into the station
// using the tuner by going to 777.7 even though it is a 'hidden' station")
// -- includes SECRET_STATION alongside STATIONS, so seeking/dragging/
// scanning the dial onto 777.7 can land and lock on it same as any real
// preset. It's still "hidden" in every other sense: not in
// STATION_PRESET_ORDER, so it never appears in the Guide, stations.md, the
// 1-9 preset keys, or the preset-position strip -- this is the one place
// that intentionally makes it reachable by tuning alone, on top of the
// dedicated 0 key.
// 41st pass (Matthew: "I'm not sure I like the NIN station being
// discoverable by just going back and forth seeking... it should only happen
// when you hit 0"). This reverses the 2026-08-22 decision quoted above, but
// only halfway, which is the whole idea: the two questions the old single
// function answered got split apart.
//
//   nearestStation() -- "what can I LOCK onto from here?" Real stations
//     only. Seek, scan, drag and Enter all run through this, so none of
//     them can land on 777.7 any more. '0' still gets in (it calls
//     presetTune -> tryLock with an explicit `forced` station, bypassing
//     this entirely), and leaving means pressing '0' again.
//
//   nearestSignal() -- "what is the receiver PICKING UP from here?"
//     Includes the secret station. The SIG meter, the S/N readout, the
//     static bed and the CRT degrade all run through this, so sweeping past
//     777.7 still makes the meters climb and the hiss clear: you can feel a
//     carrier sitting there that you cannot catch. Combined with
//     applySecretTease()'s red bleed, the set is visibly and audibly
//     insisting something is there while refusing to tune it.
function nearestStation(freq) {
  let best = null, bestDist = Infinity
  for (const ch of STATIONS) {
    const d = Math.abs(ch.freq - freq)
    if (d < bestDist) { bestDist = d; best = ch }
  }
  return { station: best, dist: bestDist }
}
function nearestSignal(freq) {
  let best = null, bestDist = Infinity
  for (const ch of [...STATIONS, SECRET_STATION]) {
    const d = Math.abs(ch.freq - freq)
    if (d < bestDist) { bestDist = d; best = ch }
  }
  return { station: best, dist: bestDist }
}

// --- shuffle bag ---------------------------------------------------------

function shuffledIndices(n) {
  const arr = Array.from({ length: n }, (_, i) => i)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// --- WebAudio: tick + lock tone, no external files ----------------------

let actx = null
function audioCtx() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)()
  // Chrome/Safari can hand back a context that's still 'suspended' even
  // from inside a keydown handler -- the very first oscillator scheduled
  // on it is silent even though nothing throws and nothing looks wrong
  // (Matthew 8/20: "I don't hear a station id tone for static bloom" --
  // it's usually the first station tried after a fresh page load, i.e.
  // the first sound the context ever plays). Nudging resume() on every
  // call is a no-op once running, so this just self-heals the first call
  // instead of only fixing it retroactively on the second one.
  if (actx.state === 'suspended') actx.resume().catch(() => {})
  return actx
}
// Static burst for manual seeking (11th pass, Matthew: "there should be
// static as you seek manually") -- replaces the old per-step playTick(),
// which was a short flat-noise click too subtle to read as static. This is
// longer and band-passed like the scanning static bed (startStaticNoise),
// just fired as a one-shot per arrow-key step instead of held continuously.
// 41st pass: `centreHz` -- see STATIONS[].static. The one-shot seek hiss
// takes its colour from whatever station is nearest, so a step toward ATOMIC
// sounds narrower and older than a step toward CIRCUIT CRUSH.
function playSeekStatic(centreHz = 1400) {
  try {
    const ctx = audioCtx()
    const n = Math.floor(ctx.sampleRate * 0.09)
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = centreHz
    filter.Q.value = 0.5
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.22, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09)
    src.connect(filter).connect(gain).connect(ctx.destination)
    src.start()
  } catch (e) {}
}
function playLockTone() {
  try {
    const ctx = audioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.26)
  } catch (e) {}
}

// Station ident (added 2026-08-20, 9th pass) -- a short per-station tone
// motif (see STATIONS[].ident) played on lock instead of the generic
// playLockTone(), so each station announces itself distinctly before
// you've even read the screen. Falls back to playLockTone() if a station
// somehow has no ident defined.
// 25th pass: added the `tempo` scalar (see STATIONS[].identTempo) so
// stations are distinct by rhythm/pacing as well as by pitch contour -- a
// slow ambient station and a punchy synthwave one shouldn't announce
// themselves at the same clip just because their note shapes differ.
// Scales the note gap and the whole attack/decay envelope together, so a
// slower tempo reads as more spacious rather than just "the same envelope
// with gaps stretched out."
// 38th pass: optional `s` (the screen) -- passing it in bumps the CRT's
// bloom on each note of the motif (see pulseBloom), so a lock is one
// audio-visual event instead of a tone playing while the picture sits
// still. Optional rather than required so nothing breaks if this is ever
// called from somewhere without a screen handle.
function playIdent(freqs, tempo = 1, s = null) {
  if (!freqs || !freqs.length) { playLockTone(); return }
  try {
    const ctx = audioCtx()
    let t = ctx.currentTime
    freqs.forEach((f) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(f, t)
      gain.gain.setValueAtTime(0.001, t)
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02 * tempo)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16 * tempo)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.18 * tempo)
      if (s) setTimeout(() => pulseBloom(s, 0.5, 90 * tempo), Math.max(0, (t - ctx.currentTime) * 1000))
      t += 0.11 * tempo
    })
  } catch (e) {}
}

// Continuous static bed while scanning, in place of a bare tick per step --
// filtered noise, faded in/out rather than started/stopped hard.
let staticSrc = null
let staticGain = null
// 41st pass: the bed's bandpass is now a live handle, because its centre
// frequency tracks whichever station is nearest (STATIONS[].static) and
// ramps between them as you tune -- so crossing the band is a slow change in
// the COLOUR of the hiss, not just its volume.
let staticFilter = null
const STATIC_CENTRE_DEFAULT = 1200
// 21st pass (Matthew, 0.3 wishlist: "static intensity scales with distance
// from a station") -- the noise bed used to sit at one fixed gain the whole
// time you were seeking/scanning, so tuning felt the same whether you were
// miles off frequency or about to land on a station. Now it fades between
// these two based on nearestStation's dist, mirroring the SIG meter's own
// falloff curve (NEAR_THRESHOLD), so the static visibly/audibly clears
// right before a lock, same as a real radio easing out of the noise floor.
const STATIC_MAX_GAIN = 0.1
const STATIC_MIN_GAIN = 0.02
function staticGainForDist(dist) {
  const pct = dist == null ? 1 : Math.min(1, dist / NEAR_THRESHOLD)
  return STATIC_MIN_GAIN + (STATIC_MAX_GAIN - STATIC_MIN_GAIN) * pct
}
function startStaticNoise(dist, centreHz = STATIC_CENTRE_DEFAULT) {
  if (staticSrc) return
  try {
    const ctx = audioCtx()
    const n = ctx.sampleRate * 2
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = centreHz
    filter.Q.value = 0.6
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(staticGainForDist(dist), ctx.currentTime + 0.15)
    src.connect(filter).connect(gain).connect(ctx.destination)
    src.start()
    staticSrc = src
    staticGain = gain
    staticFilter = filter
  } catch (e) {}
}
function setStaticIntensity(dist, centreHz) {
  if (!staticGain) return
  try {
    const ctx = audioCtx()
    staticGain.gain.linearRampToValueAtTime(staticGainForDist(dist), ctx.currentTime + 0.08)
    // Slower ramp than the gain on purpose: loudness should track the dial
    // tightly (it is the "am I close" signal), while timbre drifting over a
    // few hundred ms reads as the receiver settling rather than as the hiss
    // jumping between presets.
    if (staticFilter && centreHz) {
      staticFilter.frequency.linearRampToValueAtTime(centreHz, ctx.currentTime + 0.35)
    }
  } catch (e) {}
}
function stopStaticNoise() {
  if (!staticSrc) return
  const src = staticSrc, gain = staticGain
  staticSrc = null
  staticGain = null
  staticFilter = null
  try {
    const ctx = audioCtx()
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15)
    setTimeout(() => { try { src.stop() } catch (e) {} }, 200)
  } catch (e) {}
}

// Ambient tube hum (42nd pass, Matthew: "I may want to test that in dev
// environment soon" -- parked at the 38th pass, built now) -- a continuous,
// very quiet noise floor while the set is powered on: a ~60Hz fundamental
// plus its second harmonic, with a touch of lowpassed noise underneath so it
// reads as a chassis rather than a test tone. Mirrors startStaticNoise()/
// stopStaticNoise()'s shape deliberately -- module-level handles, idempotent
// start, ramped in/out rather than started/stopped hard -- but is its own
// independent audio graph, not a mode of the static bed, since it needs to
// keep running underneath scanning/seeking/locked alike.
// Deliberately NOT gated on this.muted (Matthew, 2026-08-22): mute is the
// "make the broadcast stop" control, and the hum isn't part of the
// broadcast -- it's the set's own noise floor, on for as long as the set is
// on, same as a real tube amp still hums after you've turned the volume
// down. Only powerUp()/powerDown() start and stop it.
let humNodes = null
// 2026-08-22: doubled from the original 0.012 starting guess, per Matthew's
// request after dev-server QA. Note this now sits slightly ABOVE
// STATIC_MIN_GAIN (0.02) -- the original guess was deliberately kept below
// the static bed's own floor gain so the hum would never out-read it while
// seeking; at 0.024 the hum can now be marginally louder than a distant
// station's static. Worth another listen specifically while seeking far
// from any station, not just at idle/locked.
const HUM_GAIN = 0.024
function startTubeHum() {
  if (humNodes) return
  try {
    const ctx = audioCtx()
    const t = ctx.currentTime
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(HUM_GAIN, t + 0.8) // slow fade-in: the
    // transformer coming up, not a switch being flipped
    const oscs = [[60, 1], [120, 0.35]].map(([f, mul]) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(f, t)
      g.gain.setValueAtTime(mul, t)
      osc.connect(g).connect(gain)
      osc.start(t)
      return osc
    })
    // A touch of lowpassed noise under the tones, or it reads as a test
    // tone rather than a chassis.
    const n = ctx.sampleRate * 2
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 220
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(0.25, t)
    src.connect(lp).connect(ng).connect(gain)
    src.start(t)
    gain.connect(ctx.destination)
    humNodes = { gain, oscs, src }
  } catch (e) {}
}
function stopTubeHum() {
  if (!humNodes) return
  const { gain, oscs, src } = humNodes
  humNodes = null
  try {
    const ctx = audioCtx()
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5)
    setTimeout(() => {
      try { oscs.forEach((o) => o.stop()); src.stop() } catch (e) {}
    }, 600)
  } catch (e) {}
}

// Keypress click (32nd pass, Matthew: "a keypress sound to help sell the
// terminal vibe") -- fires once per key() call, before anything else, so
// it clicks even for a key that ends up doing nothing (a real keyboard
// clicks under your finger regardless of whether the machine is on or the
// key does anything). Deliberately its own function rather than reusing
// playClick() below: playClick is a much louder, longer relay clack meant
// to bookend the power sequence a couple of times a session, while this
// one can fire dozens of times in a row during a fast seek/scan burst --
// at that rate a full relay clack would read as chattering hardware
// rather than typing, so this is shorter, quieter, and brighter (a
// high-passed tick rather than a full-spectrum thump).
//
// 2026-08-22: the actual set of keys this app treats as a command while
// powered on and the guide is closed -- see isMappedKey() near key() for
// how this gates playKeyClick() to real commands only, not every keydown
// the page happens to see.
const MAPPED_KEYS = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter',
  's', 'S', 'n', 'N', 'm', 'M', 'p', 'P', 'b', 'B', 'g', 'G', 'c', 'C', 'v', 'V',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
])
function playKeyClick() {
  try {
    const ctx = audioCtx()
    const t = ctx.currentTime
    const n = Math.floor(ctx.sampleRate * 0.006)
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 2500
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.12, t)
    src.connect(filter).connect(gain).connect(ctx.destination)
    src.start(t)
  } catch (e) {}
}

// --- 38th pass: event-feedback sound effects ---------------------------
//
// (Matthew: "maybe some sounds as the boot happens and each item
// appears?... what gaps am I missing?") SIGNAL already had ambient sound
// (the static bed) and set-piece sound (power on/off), but nearly every
// individual control -- volume, mute, display mode, guide, the band edge
// -- changed state in silence, and the boot POST readout landed all 13 of
// its lines without a sound. The rhythm of a machine reporting in is most
// of why a boot sequence feels good at all, so that was the single
// biggest gap of the set.
//
// All of these are deliberately quieter and shorter than the existing
// set-piece sounds (playClick/playPowerOnSound): those bookend a session
// a couple of times, these can fire in bursts while someone rides the
// volume keys.

/** One line of the boot POST readout landing. `kind` splits the dull
 *  relay tick of a probe line from the brighter confirm blip of an
 *  "[ OK ]" line; `progress` (0..1 through the sequence) creeps the pitch
 *  up so the readout reads as a set coming up to speed rather than 13
 *  identical beeps. */
function playBootTick(kind, progress = 0) {
  try {
    const ctx = audioCtx()
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const base = kind === 'ok' ? 760 : 380
    const rise = kind === 'ok' ? 180 : 90
    osc.type = kind === 'ok' ? 'triangle' : 'square'
    // Slight per-tick detune -- 13 mathematically identical pitches in a
    // row reads as a synthesizer, a few cents of wobble reads as hardware.
    osc.frequency.setValueAtTime(base + rise * progress + (Math.random() * 14 - 7), t)
    const peak = kind === 'ok' ? 0.07 : 0.045
    const len = kind === 'ok' ? 0.05 : 0.03
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.004)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + len)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + len + 0.01)
  } catch (e) {}
}

/** Volume detent -- one notch of a stepped pot. Deliberately duller and
 *  lower than playKeyClick(), which is already firing on the same
 *  keypress: the click is the key under your finger, this is the knob it
 *  is turning. */
function playDetent() {
  try {
    const ctx = audioCtx()
    const t = ctx.currentTime
    const n = Math.floor(ctx.sampleRate * 0.01)
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 900
    filter.Q.value = 1.2
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.16, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03)
    src.connect(filter).connect(gain).connect(ctx.destination)
    src.start(t)
  } catch (e) {}
}

/** Mute rocker -- a relay armature landing (low sine thud) with a
 *  lowpassed contact snap on top, so it reads mechanical rather than as a
 *  bass blip. Engaging sits slightly higher than releasing, the way a
 *  switch's two directions never sound quite identical. */
function playRelayThunk(engaged) {
  try {
    const ctx = audioCtx()
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const og = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(engaged ? 132 : 104, t)
    osc.frequency.exponentialRampToValueAtTime(engaged ? 72 : 58, t + 0.07)
    og.gain.setValueAtTime(0.0001, t)
    og.gain.exponentialRampToValueAtTime(0.2, t + 0.005)
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
    osc.connect(og).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.1)
    const n = Math.floor(ctx.sampleRate * 0.02)
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1600
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(0.13, t)
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.03)
    src.connect(lp).connect(ng).connect(ctx.destination)
    src.start(t)
  } catch (e) {}
}

/** Display-mode change -- a soft transformer thump (fundamental plus its
 *  octave, both decaying fast). The picture changing colour is a supply
 *  event in this fiction, not a menu selection, so it gets a body sound
 *  rather than a beep. */
function playModeThump() {
  try {
    const ctx = audioCtx()
    const t = ctx.currentTime
    const parts = [[70, 0.2], [141, 0.06]]
    for (const [f, peak] of parts) {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(f, t)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(peak, t + 0.012)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
      osc.connect(g).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.18)
    }
  } catch (e) {}
}

/** Guide overlay sliding in/out -- one short pitch sweep, up on open and
 *  the same sweep reversed on close, so the two are obviously the same
 *  panel moving in two directions. */
function playPanelSound(opening) {
  try {
    const ctx = audioCtx()
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(opening ? 300 : 520, t)
    osc.frequency.exponentialRampToValueAtTime(opening ? 520 : 300, t + 0.09)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
    osc.connect(g).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.13)
  } catch (e) {}
}

/** Band edge. NOTE (38th pass): the 21st pass deliberately made arrow
 *  seeking WRAP at FREQ_MIN/FREQ_MAX rather than stop dead (Matthew:
 *  "scrolling with arrows should be able to cycle to the other side of
 *  the tuning band since scan can do it"), so this is not the hard
 *  mechanical stop a real dial has -- it's the dull thud of the carriage
 *  reaching the end of its travel, fired on the wrap itself. Keeps the
 *  physical feedback without taking the wraparound back. */
function playBandBump() {
  try {
    const ctx = audioCtx()
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(150, t)
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.09)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.24, t + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11)
    osc.connect(g).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.12)
    const n = Math.floor(ctx.sampleRate * 0.03)
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 700
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(0.18, t)
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
    src.connect(lp).connect(ng).connect(ctx.destination)
    src.start(t)
  } catch (e) {}
}

// Power down/up sweeps (12th pass, Matthew: "let's build a power on and
// power down sequence"). Same tube-electronics logic as a real set: powering
// down is a fast collapse (voltage drops faster than it rises), powering up
// is a slower warm-up. A short relay "click" bookends each.
function playClick(t0) {
  try {
    const ctx = audioCtx()
    const t = t0 ?? ctx.currentTime
    const n = Math.floor(ctx.sampleRate * 0.012)
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.35, t)
    src.connect(gain).connect(ctx.destination)
    src.start(t)
  } catch (e) {}
}
function playPowerDownSound() {
  try {
    const ctx = audioCtx()
    const t = ctx.currentTime
    playClick(t)
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(660, t + 0.02)
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.55)
    gain.gain.setValueAtTime(0.001, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.24, t + 0.06)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t + 0.02)
    osc.stop(t + 0.62)
  } catch (e) {}
}
function playPowerOnSound() {
  try {
    const ctx = audioCtx()
    const t = ctx.currentTime
    playClick(t)
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(90, t + 0.03)
    osc.frequency.exponentialRampToValueAtTime(720, t + 0.4)
    gain.gain.setValueAtTime(0.001, t + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.2, t + 0.12)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t + 0.03)
    osc.stop(t + 0.47)
  } catch (e) {}
}

// Preset "tune-in" whoosh (14th pass, Matthew: "a fun 'tune-in' whoosh when
// jumping straight to a preset (1-9) versus the plain lock tone"). Plays
// once at the top of presetTune(), under the sweep -- a fast rising
// bandpass-noise sweep, distinct from both the flat seek-static hiss and
// the per-station ident tones that follow once the sweep lands and locks.
function playPresetWhoosh() {
  try {
    const ctx = audioCtx()
    const t = ctx.currentTime
    const n = Math.floor(ctx.sampleRate * 0.35)
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.Q.value = 1.1
    filter.frequency.setValueAtTime(400, t)
    filter.frequency.exponentialRampToValueAtTime(3200, t + 0.32)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.001, t)
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.08)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.34)
    src.connect(filter).connect(gain).connect(ctx.destination)
    src.start(t)
    src.stop(t + 0.36)
  } catch (e) {}
}

// localStorage persistence (14th pass, Matthew: "persistence -- yes").
// Remembers the last-locked station, its track, volume, and mute across a
// reload -- freq is NOT restored on its own (a bare tuned-but-not-locked
// position isn't worth remembering), only ever alongside a station lock.
// 23rd pass: also remembers the chosen display mode (phosphor key), same
// reasoning as volume/mute -- a cosmetic preference the set was left in,
// not something tied to a station lock.
const STORAGE_KEY = 'signal:state:v1'
function saveSignalState(program) {
  try {
    const mode = DISPLAY_MODES[program.displayModeIndex || 0]
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      stationId: program.lockedStation ? program.lockedStation.id : null,
      trackId: program.currentTrack ? program.currentTrack.id : null,
      volume: program.volume,
      muted: program.muted,
      phosphor: mode ? mode.key : undefined,
    }))
  } catch (e) {}
}
function loadSignalState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (e) { return null }
}

// One-shot filtered-noise burst (13th pass, "fun startup/shutdown"). Same
// noise-generation approach as startStaticNoise() but deliberately NOT
// wired into the staticSrc/staticGain globals that the seek-static state
// machine owns -- this is a self-contained, self-cleaning burst for power
// beats, so it can't leave the persistent bed's own start/stop bookkeeping
// out of sync.
function playStaticBurst(duration, peakGain, freq) {
  try {
    const ctx = audioCtx()
    const t = ctx.currentTime
    const n = Math.floor(ctx.sampleRate * duration)
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = freq ?? 1400
    filter.Q.value = 0.7
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(peakGain ?? 0.14, t + duration * 0.3)
    gain.gain.linearRampToValueAtTime(0, t + duration)
    src.connect(filter).connect(gain).connect(ctx.destination)
    src.start(t)
    src.stop(t + duration + 0.02)
  } catch (e) {}
}

// --- CRT visual hooks (32nd pass) -----------------------------------------
//
// The engine (src/crt.js) reads its whole SCREEN param set fresh every
// frame off `crt.params` -- a plain, live-mutable object -- but until this
// pass nothing after page load ever touched it: every visual param
// (chroma, noise, snow, roll, brightness, bg, ...) sat exactly at whatever
// config.js set once at boot for the entire session. setPhosphor() was the
// only engine hook program.js ever called. These three hooks are the first
// things to actually drive the picture live, using signals the app already
// computes for other reasons (tuning distance, the power sequence beats,
// the existing dead-video safety net) rather than adding new state.

/** Same falloff shape as staticGainForDist() (see above), against visual
 *  params instead of a gain value -- so the picture degrades at the same
 *  rate the static hiss does while seeking/scanning, and clears the same
 *  moment a lock does (dist is exactly 0 at a station's own freq,
 *  including right after tryLock() calls retune(s, station.freq), so this
 *  self-resets to a clean picture with no separate "reset" call needed). */
// 41st pass -- per-station CRT character (Matthew: "I'm also for per station
// CRT character"). config.js's SCREEN is still the nominal set; crtBase is
// SCREEN with the locked station's own `crt` overrides merged in, and it is
// what every hook below now treats as "clean picture" instead of SCREEN
// directly. Without this indirection the existing hooks would quietly undo
// each station's character: the distance degrade would restore SCREEN's
// chroma on lock, the ident bloom pulse would settle to SCREEN's bloom, the
// focus snap would land on SCREEN's beam, and the power-on ramp would climb
// to SCREEN's brightness -- each one erasing whatever the station asked for
// a few hundred ms after it was applied.
// 45th pass -- Matthew, live on his phone: "we might need to turn down some
// effects to make it easier to read on mobile." Grain, scanlines, chroma
// fringing and bloom all read fine on a desktop monitor at native size, but
// mobile's characters are already smaller and get photographed/viewed at a
// steeper angle -- the same effects stack into real illegibility rather
// than texture. Applied on top of (and after, so it always wins over) any
// per-station crt override, since legibility matters more on this layout
// than any one station's specific character. First-pass numbers, not
// re-measured against a phone the way the visualizer rounds were -- expect
// to retune these live same as everything else got tuned.
const MOBILE_CRT_OVERRIDE = {
  noise: 0.04,
  noiseStreak: 3,
  snow: 0.001,
  scanMin: 0.2,
  scanMax: 0.35,
  chroma: 0.05,
  bloomAmt: 0.7,
  threshold: 0.6,
  sharpen: 0.4,
  flicker: 0.03,
  maskAmt: 0.35,
  // 2026-08-22 (Matthew: "is there any way to make the black above and below
  // a different color or texture?") -- the tube is hard-locked to 4:3, so a
  // portrait phone letterboxes above/below it in shader-computed black
  // (crt.js's `uPhosphor * uAmbient * exp(-uAmbientFalloff * length(p))`).
  // Rather than a fake CSS overlay, just let the real phosphor glow reach
  // further into that space -- lower falloff, same tint, same physics.
  ambientFalloff: 0.6,
}
let crtBase = { ...SCREEN }
function setCrtCharacter(s, station) {
  crtBase = { ...SCREEN, ...((station && station.crt) || {}), ...(MOBILE_LITE ? MOBILE_CRT_OVERRIDE : {}) }
  if (!s?.crt?.params) return
  Object.assign(s.crt.params, crtBase)
}
function crtDegradeForDist(dist) {
  const pct = dist == null ? 1 : Math.min(1, dist / NEAR_THRESHOLD)
  return {
    chroma: crtBase.chroma + (0.9 - crtBase.chroma) * pct,
    snow: crtBase.snow + (0.035 - crtBase.snow) * pct,
    roll: crtBase.roll + (0.5 - crtBase.roll) * pct,
  }
}
function setCrtDegradation(s, dist) {
  if (!s?.crt?.params) return
  Object.assign(s.crt.params, crtDegradeForDist(dist))
}

/** Linear-ramps a set of crt.params keys from `from` to `to` over
 *  durationMs, in a handful of discrete steps via setTimeout -- there's no
 *  animation-frame hook exposed for this, and a dozen steps reads as
 *  smooth enough for a param like brightness that isn't changing per-pixel.
 *  Used for the power-on "tube warming up" ramp below. */
// `respectPower` defaults true: skip a step if the set has since powered off
// (and isn't mid power-cycle animation) or the guide has opened, so a ramp
// queued by a momentary effect (focus snap, an idle tear) can't keep
// painting into STANDBY or the guide overlay after the fact. The power-cycle
// sequences themselves (powerUp's warm-up ramp, powerDown's afterglow decay)
// pass false -- they ARE the transition, so they must run to completion even
// though `poweredOn` is false (powerDown) or not yet true (powerUp) for their
// entire duration.
function rampCrtParams(s, from, to, durationMs, startDelay = 0, respectPower = true) {
  if (!s?.crt?.params) return
  const STEPS = 12
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS
    setTimeout(() => {
      if (!s?.crt?.params) return
      if (respectPower) {
        const p = s.program
        if (p && !p.poweredOn && !p._powerAnimating) return
        if (p?.guideOpen) return
      }
      for (const key in to) s.crt.params[key] = from[key] + (to[key] - from[key]) * t
    }, startDelay + durationMs * t)
  }
}

/** One-shot ~150ms chroma/roll spike for a genuine playback error (used
 *  from the YT player's onError handler, see tuneToStation() below) -- a
 *  visual "broadcast hiccup" alongside the existing dead-video auto-skip,
 *  so a dead track reads as a glitch in the signal rather than a silent
 *  swap you only notice by ear. Restores to whatever crtDegradeForDist
 *  says the CURRENT tuning distance calls for, not necessarily nominal, so
 *  it can't accidentally clear a real off-station degrade already active
 *  (though in practice onError only fires while locked, i.e. dist 0). */
function flashCrtGlitch(s) {
  if (!s?.crt?.params) return
  const { dist } = nearestSignal(s.program.freq)
  const restore = crtDegradeForDist(dist)
  Object.assign(s.crt.params, { chroma: 2.4, roll: 0.5 })
  setTimeout(() => {
    if (!s?.crt?.params) return
    if (!s.program?.poweredOn || s.program?.guideOpen) return
    Object.assign(s.crt.params, restore)
  }, 150)
}

// 38th pass: bloom bump, used per ident note (see playIdent). bloomAmt is
// not one of the params crtDegradeForDist() drives, so restoring straight
// to SCREEN's nominal here can't fight the tuning-distance degrade the way
// a chroma/snow/roll bump would.
let bloomTimer = null
function pulseBloom(s, amt = 0.5, ms = 90) {
  if (!s?.crt?.params) return
  // Attack-and-decay, not hold-then-drop. FIRST CUT OF THIS WAS WRONG and
  // it's worth recording why: it set bloom high and restored it on a
  // setTimeout, with each new note clearing the previous timer. Verified
  // live, that made the ident read as ONE long bloom held flat across all
  // four notes (sampled: 1.94 for the whole motif, then back to 1.44) --
  // the notes were 110ms apart and the hold was 120ms, so it never got a
  // chance to fall between them. Ramping down from the peak instead, over
  // a window deliberately shorter than the note gap, is what actually
  // makes the glow breathe in time with the motif.
  if (bloomTimer) { clearInterval(bloomTimer); bloomTimer = null }
  const start = Date.now()
  s.crt.params.bloomAmt = crtBase.bloomAmt + amt
  bloomTimer = setInterval(() => {
    const k = (Date.now() - start) / ms
    const offOrClosed = !s.program?.poweredOn || s.program?.guideOpen
    if (!s?.crt?.params || k >= 1 || offOrClosed) {
      clearInterval(bloomTimer)
      bloomTimer = null
      if (s?.crt?.params) s.crt.params.bloomAmt = crtBase.bloomAmt
      return
    }
    s.crt.params.bloomAmt = crtBase.bloomAmt + amt * (1 - k)
  }, 16)
}

/** 38th pass: focus snap, fired on lock. The spot blooms wide and
 *  unpeaked for an instant (a receiver that hasn't caught the carrier
 *  yet), overshoots sharper than nominal, then settles -- the picture
 *  visibly pulling into focus rather than simply being in focus already.
 *  Only touches beam/sharpen, so it composes with crtDegradeForDist()'s
 *  chroma/snow/roll rather than overwriting any of it. */
function flashFocusSnap(s) {
  if (!s?.crt?.params) return
  const soft = { beam: Math.min(2, crtBase.beam * 2), sharpen: crtBase.sharpen * 0.2 }
  const over = { beam: crtBase.beam * 0.78, sharpen: Math.min(2, crtBase.sharpen * 1.6) }
  const home = { beam: crtBase.beam, sharpen: crtBase.sharpen }
  Object.assign(s.crt.params, soft)
  rampCrtParams(s, soft, over, 130)
  rampCrtParams(s, over, home, 180, 140)
}

// Visualizer (43rd/44th pass) -- DRIFT mode. A layered sine-wave density
// field, same "decorative but structured" idiom as the VU meter and antenna
// glyph: no real audio analysis anywhere (WebAudio can't see inside the
// YouTube iframe), just deterministic synthetic motion. Character density
// (this ramp) plus the beam-level tier below give it more apparent gradient
// than the 5 discrete attribute tiers alone would.
//
// Built as the first of what's meant to become a per-station roster (44th
// pass, Matthew: "since we know we can't have it impacted by audio we CAN
// have it be themed to each station... eventually have 10 visuals") --
// VISUAL_METHODS just below is the dispatch table that idea hangs off of.
// DRIFT is wired to the DRIFT MODE station explicitly (see STATIONS'
// `visual` field), not just landing there by default -- the two sharing a
// name is meant to be a real pairing. Every other station falls back to
// DRIFT purely because nothing themed exists for them yet. Matthew's
// floated something hacking/code-based for CIPHER and a synthwave/
// vaporwave treatment for CIRCUIT CRUSH as the next two builds; RIPPLE and
// SCOPE (see the original screensaver mockup artifact) are other candidate
// directions for stations further down the roster.
const DRIFT_RAMP = ' .:-=+*#%@'
// Cheap deterministic 2D hash (47th pass, OUTRUN roadside terrain) -- no
// state, just a pseudo-random 0..1 value from two integers, so ground
// texture can be recomputed every frame from (column, scroll-row) without
// keeping its own buffer.
function hash2(a, b) {
  const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453
  return v - Math.floor(v)
}

/** Maps a 0..1 density value to term.js's discrete beam-intensity tiers. */
function visualizerLevelAttr(v) {
  if (v < 0.2) return FAINT
  if (v < 0.4) return DIM
  if (v < 0.6) return MUTED
  if (v < 0.85) return NORMAL
  return BRIGHT
}

// FLAME (46th pass, DISTORTION FIELD) -- replaces HOWL outright (which had
// itself replaced the original FEEDBACK concept). Live QA: "fire 'flame'
// living thing." Classic bottom-up fire propagation -- a heat value per
// cell (this._fireHeat, sized term.cols x HINT_Y1, seeded in init()),
// reseeded hot and flickering at the floor every frame, cooling and
// drifting sideways at random as it rises. Genuinely alive: no fixed
// cycle, no two frames identical, unlike every prior concept tried here.

// station.visual -> the drawing method it dispatches to. Falls back to
// 'drift' for any station with no visual field, or one that doesn't match
// a built entry here yet.
const VISUAL_METHODS = {
  drift: 'drawDriftEffect',
  flame: 'drawFlameEffect',
  breach: 'drawBreachEffect',
  outrun: 'drawOutrunEffect',
  ripple: 'drawRippleEffect',
  counter: 'drawCounterEffect',
  stack: 'drawStackEffect',
  boombap: 'drawBoomBapEffect',
  dread: 'drawDreadEffect',
  pulse: 'drawPulseEffect',
}
const BREACH_HEX = '0123456789ABCDEF'
// A resolved fragment briefly holds legible mid-column before dissolving
// back to noise -- CIPHER's own glyph mixed in alongside plausible hacker-
// movie debris, not a generic word list.
const BREACH_WORDS = ['0xFF', 'ROOT', '9F3A', 'ADMIN', 'ACK', 'SYN', '404', 'AUTH', '╬╬╬']

// RIPPLE (45th pass, CITY LIGHTS) -- rain rings on a Tokyo night, ring
// bands expanding from fixed drop points, respawning on a stagger once
// each fully fades.
// 45th pass: slots bumped 7 -> 11 (live QA: "don't understand or see much
// on ... 6" -- too few drops meant long stretches with nothing happening).
const RIPPLE_SLOTS = 11
const RIPPLE_MAXAGE = 3.2
const RIPPLE_SPEED = 3.6

// BOOM BAP (45th pass, HACKBACK) -- MPC-style 16-step sequencer at this
// genre's own tempo lane.
const BOOMBAP_STEPS = 16
const BOOMBAP_PATTERN = [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0]
const BOOMBAP_BPM = 92

// PULSE (45th pass, COLD WAVE) -- "synthetic hearts, borrowed neon" made
// literal: a fixed lattice of neon nodes, not a smooth organic field like
// DRIFT or RIPPLE. Square (Chebyshev) rings expand outward from center,
// continuously, and their overall brightness is gated by a synthetic
// two-beat "lub-dub" heart rhythm rather than a steady glow -- cold and
// mechanical instead of ambient, which is what keeps it distinct from
// RIPPLE's organic circular rain.
// 47th pass: cycle shortened 1.9 -> 1.4 and each beat widened 0.16 -> 0.22
// (live QA: "larger pulses ... happen a little quicker").
const PULSE_CYCLE = 1.4
function pulseBeatEnvelope(tc) {
  const lub = Math.max(0, 1 - Math.abs(tc - 0.0) / 0.22)
  const dub = Math.max(0, 1 - Math.abs(tc - 0.24) / 0.22)
  return Math.max(lub, dub * 0.75)
}
// 46th pass -- live QA on PULSE: "closer... but need less unused space,"
// and separately "5 could look better too." The lattice-plus-small-core
// from the 45th pass was still reading thin. This adds a full-width
// scrolling EKG-style trace across the middle band -- an actual
// recognizable heart-monitor waveform (P bump, sharp QRS spike, T bump,
// flat rest) instead of an abstract pulsing block -- the single most
// literal way to draw "synthetic hearts" this roster has. u is phase
// (0..1) through one PULSE_BEAT_COLS-wide beat.
const PULSE_BEAT_COLS = 22
function pulseEkgOffset(u) {
  if (u < 0.08) return 0.05 * Math.sin((u / 0.08) * Math.PI)
  if (u < 0.12) return 0
  if (u < 0.14) return -0.15 * ((u - 0.12) / 0.02)
  if (u < 0.16) return -0.15 + 1.15 * ((u - 0.14) / 0.02)
  if (u < 0.18) return 1.0 - 1.3 * ((u - 0.16) / 0.02)
  if (u < 0.2) return -0.3 + 0.3 * ((u - 0.18) / 0.02)
  if (u < 0.35) return 0.15 * Math.sin(((u - 0.2) / 0.15) * Math.PI)
  return 0
}

// DREAD (45th pass, the secret station) -- a coarse panel grid flickering
// erratically with occasional full-row tears, more hostile than anything
// else on the roster on purpose. Grid dims kept inside 80 cols with margin
// (14 * 5 = 70, +6 left inset = 76).
const DREAD_CELLS_X = 14
const DREAD_CELLS_Y = 5
const DREAD_CELL_W = 5
const DREAD_CELL_H = 4

// --- program ---------------------------------------------------------------

export default {
  // Static chrome -- title bar, brand-plate, panel frames, grille, corner
  // brackets. Drawn once at boot and again after a power-up (12th pass);
  // extracted out of init() so both call sites stay in sync instead of
  // duplicating ~60 lines of box-drawing.
  // Title bar, inverse plane -- SIGNAL wordmark, version tag, clock,
  // brand-plate. Split out of drawChrome() (43rd pass) so the visualizer
  // can put up the exact same row 0 without dragging the panel frames along
  // with it -- and so this._clockTimer's 1s ticker (which just calls
  // drawClock() unconditionally whenever powered on) keeps working
  // unmodified whether the visualizer is up or not.
  drawTitleBar(s) {
    const { term } = s
    for (let x = 0; x < term.cols; x++) term.put(x, 0, ' ', NORMAL, 1)
    term.text(2, 0, 'SIGNAL', BOLD, 1)
    // Version tag (28th pass, revised: Matthew wanted it same font/weight
    // as SIGNAL itself, no codename) -- sits right after the wordmark, one
    // space over, same BOLD as SIGNAL. Verified against the brand-plate's
    // centerX() start (25 at 80 cols) so the two never collide.
    term.text(9, 0, VERSION_TAG, BOLD, 1)
    // Date/time module (15th pass; repositioned 17th pass, Matthew: "remove
    // version number from here put date/time there instead with formating
    // that was used for version") -- the version number used to live at
    // x=72 in this same DIM/inverse style; it's gone now and the clock sits
    // in its place instead. Drawn once here on every chrome (re)draw; the
    // 1s ticker set up in init() keeps it live after that (see
    // drawClock()/this._clockTimer).
    this.drawClock(s)

    // Brand-plate nameplate (10th pass, skeuomorphism idea Matthew picked;
    // moved into the title bar itself in the 11th pass, Matthew: "move
    // model sg-1 etc into header") -- sits in the open space left of the
    // clock, same inverse plane as the rest of the title row instead of
    // floating as its own dim line underneath it. The power/lock LED used
    // to sit here too (10th pass) but moved down onto the status line in
    // the 17th pass (Matthew: it "wasn't obvious" tucked in next to the
    // title text) -- see setStatus().
    const brand = 'MODEL SG-1  -  SIGNAL RECEIVER'
    term.text(centerX(term.cols, brand), 0, brand, FAINT, 1)
  },

  // 45th pass -- mobile's whole frame: wordmark, status line, STATION and
  // NOW PLAYING boxes, a touch-gesture footer instead of the keyboard hint
  // rows. No clock (drawClock hardcodes column 76, well past this grid's 42
  // -- not worth teaching it a second layout for a detail this minor), no
  // brand-plate, no TUNING BAND/LEVELS boxes at all.
  mobileDrawChrome(s) {
    const { term } = s
    for (let x = 0; x < term.cols; x++) term.put(x, 0, ' ', NORMAL, 1)
    const title = `SIGNAL ${VERSION_TAG}`
    term.text(centerX(term.cols, title), 0, title, BOLD, 1)
    if (!this._mLayout) this._mLayout = mobileLayout(2, 2)
    this.mobileDrawFrame(s)
  },

  // Draws the STATION box, NOW PLAYING box, and hint footer at the row
  // positions in this._mLayout. Split out from mobileDrawChrome (which only
  // draws the title bar itself) so mobileRelayout() can redraw just this
  // part whenever a line-count change moves everything below the title.
  mobileDrawFrame(s) {
    const { term } = s
    const L = this._mLayout

    drawBoxTop(term, L.stationTop, MBOX_X0, MBOX_X1, 'STATION', MUTED)
    drawBoxSide(term, L.stationCall, MBOX_X0, MBOX_X1, MUTED)
    drawBoxSide(term, L.stationTag1, MBOX_X0, MBOX_X1, MUTED)
    if (L.stationTag2 != null) drawBoxSide(term, L.stationTag2, MBOX_X0, MBOX_X1, MUTED)
    drawBoxBottom(term, L.stationBot, MBOX_X0, MBOX_X1, MUTED)

    drawBoxTop(term, L.npTop, MBOX_X0, MBOX_X1, 'NOW PLAYING', BOLD)
    drawBoxSide(term, L.npTrack1, MBOX_X0, MBOX_X1, BOLD)
    if (L.npTrack2 != null) drawBoxSide(term, L.npTrack2, MBOX_X0, MBOX_X1, BOLD)
    drawBoxSide(term, L.npArtist, MBOX_X0, MBOX_X1, BOLD)
    drawBoxBottom(term, L.npBot, MBOX_X0, MBOX_X1, BOLD)

    // ASCII only -- the bitmap font doesn't carry every Unicode glyph (a
    // past pass found this the hard way with a couple of star/square glyphs
    // silently rendering as '?'), so this sticks to the same bracket idiom
    // the desktop hint rows use rather than risking arrow glyphs the face
    // may not have.
    // 45th pass: 2-finger tap (display mode/tint) added to the legend
    // alongside the original three.
    const line1 = 'TAP MUTE   2-TAP COLOR'
    const line2 = '[<-/->] STATION   [^/v] TRACK'
    for (let x = 0; x < term.cols; x++) { term.put(x, L.hint1, ' ', NORMAL, 1); term.put(x, L.hint2, ' ', NORMAL, 1) }
    term.text(centerX(term.cols, line1), L.hint1, line1, BOLD, 1)
    term.text(centerX(term.cols, line2), L.hint2, line2, NORMAL, 1)
  },

  // Recomputes this._mLayout when the tagline or track title's line count
  // changes (see mobileLayout()), and if it did, wipes and redraws
  // everything below the status row at the new positions. Returns whether a
  // relayout actually happened, so callers know whether the OTHER box (the
  // one they didn't just draw) needs restoring -- a relayout clears the
  // whole zone, station and now-playing both, regardless of which one's
  // line count triggered it.
  mobileRelayout(s, tagLines, trackLines) {
    if (!this._mLayout) this._mLayout = mobileLayout(2, 2)
    const cur = this._mLayout
    if (cur.tagLines === tagLines && cur.trackLines === trackLines) return false
    const { term } = s
    this._mLayout = mobileLayout(tagLines, trackLines)
    for (let y = 3; y < term.rows; y++) for (let x = 0; x < term.cols; x++) term.put(x, y, ' ')
    this.mobileDrawFrame(s)
    // Widgets live in the zone that just got wiped -- redraw them at their
    // new row immediately rather than waiting for the next VU tick.
    this.drawVU(s)
    this.drawSignal(s)
    return true
  },

  drawChrome(s) {
    if (this.mobile) { this.mobileDrawChrome(s); return }
    const { term } = s

    this.drawTitleBar(s)

    // Panel frames -- drawn once, never redrawn. Every content function
    // below only clears its own interior span, so these stay put.
    drawBoxTop(term, TUNER_TOP_Y, BOX_X0, BOX_X1, 'TUNING BAND', MUTED)
    drawBoxSide(term, SCALE_Y, BOX_X0, BOX_X1, MUTED)
    drawBoxSide(term, DIAL_Y, BOX_X0, BOX_X1, MUTED)
    drawBoxSide(term, FREQ_Y, BOX_X0, BOX_X1, MUTED)
    drawBoxBottom(term, TUNER_BOT_Y, BOX_X0, BOX_X1, MUTED)

    drawBoxTop(term, STATION_TOP_Y, BOX_X0, BOX_X1, 'STATION', MUTED)
    drawBoxSide(term, STATION_Y, BOX_X0, BOX_X1, MUTED)
    drawBoxSide(term, TAGLINE_Y, BOX_X0, BOX_X1, MUTED)
    drawBoxBottom(term, STATION_BOT_Y, BOX_X0, BOX_X1, MUTED)

    // 30th pass (Matthew: "give the boxes more dimension... which box is
    // active") -- NOW PLAYING is the "hero" box (what's actually playing
    // matters most, see the 5th-pass note above), so its frame draws a
    // notch brighter than the other three's static MUTED chrome instead of
    // all four boxes reading as identical weight. 31st pass: this was
    // BRIGHT at first, but the CRT bloom shader turns a full-BRIGHT dashed
    // border into what reads as a blown-out solid bar rather than a crisp
    // line once it's actually rendered (Matthew: "what are these meant to
    // be" re: a screenshot of exactly that). BOLD is the same one-notch-up
    // idea without tripping the bloom. playBootFlicker()'s tail restores
    // this same BOLD after its uniform boot-flicker beat sequence settles
    // everything (including this box) back to MUTED.
    drawBoxTop(term, NOWPLAYING_TOP_Y, BOX_X0, BOX_X1, 'NOW PLAYING', BOLD)
    drawBoxSide(term, TRACK_Y, BOX_X0, BOX_X1, BOLD)
    drawBoxSide(term, PLAYBACK_Y, BOX_X0, BOX_X1, BOLD)
    drawBoxBottom(term, NOWPLAYING_BOT_Y, BOX_X0, BOX_X1, BOLD)

    drawBoxTop(term, METERS_TOP_Y, BOX_X0, BOX_X1, 'LEVELS', MUTED, METERS_DIVIDER_X)
    drawBoxSide(term, VOL_Y, BOX_X0, BOX_X1, MUTED)
    drawBoxSide(term, VOL_SIG_DIVIDER_Y, BOX_X0, BOX_X1, MUTED)
    drawBoxSide(term, SIG_Y, BOX_X0, BOX_X1, MUTED)
    drawBoxSide(term, VU_DIVIDER_Y, BOX_X0, BOX_X1, MUTED)
    drawBoxSide(term, VU_Y, BOX_X0, BOX_X1, MUTED)
    drawBoxBottom(term, METERS_BOT_Y, BOX_X0, BOX_X1, MUTED)

    // Speaker-grille texture (10th pass, skeuomorphism idea Matthew picked)
    // -- the two divider rows inside LEVELS were plain blank interiors
    // (just the box's side borders with nothing between). Filling them with
    // a dotted perforation pattern instead reads as a physical speaker
    // grille sitting between the meters, at zero extra row cost. Confined
    // to the left half only (18th pass, see METERS_DIVIDER_X) -- the right
    // half is reserved/blank until there's content for it.
    drawGrille(term, VOL_SIG_DIVIDER_Y, BOX_X0, METERS_DIVIDER_X)
    drawGrille(term, VU_DIVIDER_Y, BOX_X0, METERS_DIVIDER_X)

    // LEVELS vertical divider (18th pass, Matthew: "halve that and have
    // levels on one side and something tbd on the other") -- splits the
    // single LEVELS box into two halves without changing its outer frame.
    // T-junctions where the divider meets the box's own top/bottom border,
    // a plain vertical bar down the interior rows. Drawn after the grille
    // above so it isn't overwritten by it.
    term.put(METERS_DIVIDER_X, METERS_TOP_Y, '┳', MUTED)
    for (const y of [VOL_Y, VOL_SIG_DIVIDER_Y, SIG_Y, VU_DIVIDER_Y, VU_Y]) {
      term.put(METERS_DIVIDER_X, y, '│', MUTED)
    }
    term.put(METERS_DIVIDER_X, METERS_BOT_Y, '┻', MUTED)

    // The LEVELS right half (GIAL nameplate's old spot, then the PWR/AIR/
    // STEREO/MONO/MUTE indicator panel) is now the animated antenna glyph --
    // see drawAntenna(). Not static, so it isn't drawn here; the two call
    // sites that used to follow drawChrome() with a nameplate-is-already-
    // there assumption (powerUp's reveal beat, closeGuide()) call
    // drawAntenna() explicitly, same as they already do for drawVU().

    // Chassis corner brackets (10th pass, skeuomorphism idea Matthew
    // picked) -- the 4 columns outside the panel stack (x 0-1 and 78-79)
    // were unused; bracketing the stack's outer corners there reads as a
    // physical bezel around the receiver rather than the panels just
    // floating on black.
    term.put(0, TUNER_TOP_Y, '┏', MUTED)
    term.put(term.cols - 1, TUNER_TOP_Y, '┓', MUTED)
    term.put(0, METERS_BOT_Y, '┗', MUTED)
    term.put(term.cols - 1, METERS_BOT_Y, '┛', MUTED)
  },

  // Date/time module, running-screen half (15th pass; repositioned +
  // brightened 16th pass, Matthew: "wrong spot, too dim"; moved again 17th
  // pass onto the version number's old spot, Matthew: "remove version
  // number from here put date/time there instead with formating that was
  // used for version"). Right-aligned to end at column 75 -- exactly where
  // "v0.2" used to end -- same DIM/inverse formatting the version used, so
  // it reads the same way the version did, just with the date/time in its
  // place. Same width every tick, so no blank-first needed.
  drawClock(s) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    const str = formatClock(new Date())
    const x = 76 - str.length
    for (let i = 0; i < str.length; i++) term.put(x + i, 0, str[i], DIM, 1)
  },

  // Date/time module, STANDBY half (15th pass) -- real clock-radios keep
  // their clock lit even powered off, so this shows underneath the
  // STANDBY/"[P] POWER ON" text rather than going dark along with
  // everything else. Driven by the same this._clockTimer as drawClock().
  drawStandbyClock(s) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    const str = formatClock(new Date())
    // 19th pass: true grid center (floor, not round -- round(25/2) was
    // landing one row low) with the STANDBY/hint/clock block distributed
    // symmetrically around it (-2/0/+2) instead of only extending downward,
    // which is what made the whole block read as vertically off-center.
    const midY = Math.floor(term.rows / 2)
    term.text(centerX(term.cols, str), midY + 2, str, FAINT)
  },

  // Display modes (23rd pass). Cycles the CRT's phosphor tint through
  // DISPLAY_MODES via the engine's existing setPhosphor() hook -- see the
  // comment on DISPLAY_MODES for why this is a curated subset, not every
  // key in config.js's PHOSPHORS.
  cycleDisplayMode(s) {
    this.displayModeIndex = (this.displayModeIndex + 1) % DISPLAY_MODES.length
    // 2026-08-22: routed through applyPhosphor() rather than a direct
    // setPhosphor() call -- if you're locked onto the secret NIN station,
    // its forced red tint should keep overriding the visible picture even
    // as you cycle the underlying preference; applyPhosphor() is what
    // enforces that. See its comment just below.
    this.applyPhosphor(s)
    // 31st pass (Matthew: "flashes the name of the color... I thought was
    // cool but now not needed") -- the antenna pane's mode strip (see
    // drawModeStrip()) is a persistent on-screen readout of the same
    // information the old transient toast announced, so flashDisplayMode()
    // was removed as a duplicate.
    // 38th PASS, HEADS UP: the mode name is back in the status row via the
    // general flashStatus() mechanism, which is arguably that same toast
    // returning under a different name. It is here because the 38th pass
    // brief was "every control should acknowledge itself in the status
    // row" and display mode is a control -- but if it still reads as
    // redundant against the mode strip, deleting the flashStatus line
    // below is the whole revert, nothing else depends on it.
    playModeThump()
    this.flashStatus(s, DISPLAY_MODES[this.displayModeIndex].label)
    saveSignalState(this)
  },
  // 2026-08-22 (Matthew: "make it use a red theme when you're on that
  // station") -- the single place that decides what phosphor tint should
  // actually be on screen right now: the secret NIN station's forced 'red'
  // (see config.js's PHOSPHORS -- 'red' is deliberately NOT in DISPLAY_MODES,
  // so it's never reachable via the normal [C] cycle) whenever it's the
  // locked station, otherwise whatever the user's normal DISPLAY_MODES
  // preference is. Called from every place mode/lockedStation can change
  // (tryLock, enterSeeking) plus cycleDisplayMode itself, so the picture is
  // always in sync with current lock state instead of each call site having
  // to remember to special-case the secret station on its own.
  applyPhosphor(s) {
    const secret = this.mode === 'locked' && this.lockedStation && this.lockedStation.secret
    // 41st pass: setPhosphor() no-ops when the requested tint is already the
    // active one BY REFERENCE, and applySecretTease() leaves a freshly built
    // array in there -- so without clearing the flag and forcing the
    // assignment, coming off a tease could leave the blended tint stuck.
    this._teasing = false
    const name = secret ? 'red' : DISPLAY_MODES[this.displayModeIndex].key
    if (s.crt && PHOSPHORS[name]) s.crt.phosphor = PHOSPHORS[name]
    s.setPhosphor(name)
  },

  init(s) {
    const { term } = s

    // 45th pass -- decided once, at boot, off config.js's viewport/pointer
    // check. Every mobile-only draw branch below reads this rather than
    // re-detecting anything itself.
    this.mobile = MOBILE_LITE

    // Leftover from the old 88-108 band -- 93.0 is below the current
    // FREQ_MIN (100.0), so the dial opened already out-of-range. Now starts
    // exactly at FREQ_MIN.
    this.freq = FREQ_MIN
    this.mode = 'seeking' // 'seeking' | 'locked'
    this.lockedStation = null
    this.currentTrack = null
    this.bags = {}
    // 36th pass: { [stationId]: { track, position, at } } -- see
    // RESUME_CUTOFF_MS above. Populated in tryLock() right before it
    // switches lockedStation away from whatever it currently is.
    this.lastPlayback = {}
    this.scanning = false
    this.scanTimer = null
    // 38th pass -- status row state. statusPersistent is what the row
    // falls back to after a transient flash (see flashStatus); _statusText
    // is what is on screen right now, and doubles as the liveness check
    // every deferred status draw makes before painting (if it no longer
    // matches, a newer status has already claimed the row). Every timer
    // handle here is owned by _clearStatusTimers().
    this.statusPersistent = null
    this._statusText = null
    this._statusActive = false
    this._statusRevealTimers = []
    this._statusAnimTimer = null
    this._statusFlashTimer = null
    this._statusBracketX = 0
    this._statusBracketLen = 0
    // Which way the last tuning input was headed, so the SEEKING sweep
    // animation travels the same direction you are tuning.
    this._statusSweepDir = 1
    // 38th pass -- in-flight signal-resolve reveals, keyed by row (see
    // resolveText). Keyed rather than a single handle so callsign, tagline
    // and track can resolve independently and at the same time.
    this._resolveTimers = {}
    // 38th pass -- next rare idle CRT event, in frame()'s `t` seconds.
    this._nextIdleEventAt = 0
    this.ready = false
    this.player = null
    this.volume = 70
    this.muted = false
    // 13th pass (Matthew: "the app should default to a powered off state")
    // -- the set now boots cold. init() no longer draws the ready-state
    // chrome at all; it lands directly on the same STANDBY screen
    // powerDown() ends on, silently (no relay click/hum -- there's no
    // power to click OFF from, this is before first power-on). Pressing P
    // runs powerUp()'s full beat sequence, same as any later power cycle,
    // so "turning it on" always means and looks like the same thing.
    this.poweredOn = false

    // Visualizer (43rd pass) -- see VISUALIZER_IDLE_MS, enterVisualizer().
    // _lastInputAt seeds to "now" so a fresh page load doesn't idle straight
    // into it before anyone's had a chance to touch anything.
    this.visualizerActive = false
    this._lastInputAt = Date.now()
    // Per-effect state for the visualizer roster (44th pass) -- kept here
    // rather than reset on entry, same as vuTrace etc. below: cheap, and
    // there's no reason a column's scroll phase or a glitch beat needs to
    // snap back to a fixed start every time [V] is pressed.
    this._breachCols = Array.from({ length: term.cols }, () => ({
      speed: 6 + Math.random() * 10,
      phase: Math.random() * 100,
      resolveAt: 5 + Math.random() * 12,
      word: null,
      wordRow: 0,
      wordUntil: 0,
    }))
    // OUTRUN's sky-field stars (45th pass) -- fixed positions/phases so the
    // sky doesn't reshuffle every frame, same reasoning as _breachCols above.
    // 45th pass: bumped from 26 to 46 (live QA: "too much white space") --
    // the sky above the sun was still reading as dead space at the lower
    // count.
    this._outrunStars = Array.from({ length: 46 }, () => ({
      x: Math.random() * term.cols,
      y: 1 + Math.random() * 6,
      phase: Math.random() * 10,
      speed: 0.5 + Math.random() * 0.8,
    }))
    // OUTRUN's birds (48th pass) -- live QA: "add some clouds on either
    // side of the sun or something that looks like seagulls/birds." A
    // handful of simple caret-glyph birds gliding across the upper sky,
    // alternating ^/v as a wingbeat, drifting slowly right and wrapping.
    this._outrunBirds = Array.from({ length: 6 }, () => ({
      x: Math.random() * term.cols,
      y: 1 + Math.random() * 4,
      speed: 0.6 + Math.random() * 1.0,
      flapPhase: Math.random() * 10,
      bobPhase: Math.random() * 10,
    }))
    // RIPPLE's rain-ring slots (45th pass, CITY LIGHTS) -- fixed drop
    // points, each respawning on a stagger once it's fully faded.
    this._ripples = Array.from({ length: RIPPLE_SLOTS }, () => ({
      x: Math.random() * term.cols,
      y: 1 + Math.random() * 21,
      startT: -Math.random() * RIPPLE_MAXAGE,
    }))
    // ATOMIC's clouds (47th pass, full redesign of the old COUNTER/Geiger
    // concept -- live QA asked to try clouds drifting along instead, with
    // a reference image of blocky, two-tone pixel clouds: a stepped
    // staircase ribbon, thicker and brighter at one end, trailing off
    // thinner. makeCloudShape() below builds that shape once per cloud;
    // drawCounterEffect() just slides it sideways.
    this._clouds = Array.from({ length: 6 }, () => ({
      shape: this.makeCloudShape(),
      y: 7 + Math.floor(Math.random() * 14),
      baseX: Math.random() * term.cols,
      speed: 1.2 + Math.random() * 1.8,
    }))
    // STACK's building-block bars (45th pass, MOMENTUM; reworked later the
    // same pass -- live QA: "bars need to be across the whole screen and
    // should animate up and down randomly like data ... they didn't
    // move"). 19 columns spanning the full width instead of 9 clustered in
    // the middle, each on a much shorter reroll/rise timer plus its own
    // jitter phase so movement reads as live-analytics noise rather than a
    // slow calm build.
    this._stackBars = Array.from({ length: 19 }, () => ({
      level: Math.random(),
      target: Math.random(),
      speed: 0.15 + Math.random() * 0.15,
      holdUntil: 0,
      jitterPhase: Math.random() * 10,
    }))
    // DREAD's panel grid (45th pass, the secret station).
    this._dreadGrid = Array.from({ length: DREAD_CELLS_X * DREAD_CELLS_Y }, () => Math.random() < 0.5)
    this._dreadTear = { active: false, row: 0, until: 0 }
    // BOOM BAP's speaker/sound-wave state (45th pass redesign, HACKBACK).
    this._boomWaves = []
    this._boomLastStep = -1
    // BOOM BAP's EQ readout bars (47th pass) -- a small VU-style row across
    // the cabinet's top, re-targeted every step so it reads as reacting to
    // the beat. 22 bars to match the wider 47th-pass cabinet interior.
    this._boomEq = Array.from({ length: 22 }, () => ({ level: 0, target: 0 }))
    // FLAME's heat buffer (46th pass, DISTORTION FIELD) -- one float per
    // cell across the visualizer's full row range (0..HINT_Y1-1; row 0 is
    // unused since the effect never draws above row 1).
    this._fireHeat = new Array(term.cols * HINT_Y1).fill(0)
    this._fireLastStep = 0

    // Scrolling-waveform VU state (11th pass -- see drawVU()).
    this.lastProgressDraw = 0
    this.vuSample = 0.03
    this.vuVelocity = 0
    this.vuTrace = new Array(16).fill(0) // 18th pass: trimmed from 24, see drawVU()

    // Field-strength readout + EQ ribbon, antenna pane's right margin (30th
    // pass -- Matthew: "secondary readout makes sense... not opposed to
    // thin horizontal ribbons"). Own spring-damped state, same pattern as
    // vuSample/vuVelocity above, kept separate so they don't just mirror
    // the VU meter's motion 1:1 -- see drawFieldReadout()/drawEqRibbon().
    this.fieldSample = 0.5
    this.fieldVelocity = 0
    this.eqSamples = new Array(6).fill(0.08)
    this.eqVelocities = new Array(6).fill(0)

    this.history = [] // stack of previously-locked stations, for [B] back
    this.nowPlaying = null
    // Set once below if a saved session is restored, so powerUp() knows
    // the player needs an actual loadTrack() call (fresh YT.Player, never
    // loaded anything) rather than just resuming playback on an already-
    // cued video, which is all a same-session power-cycle needs.
    this.needsTrackLoad = false

    // Restore last session (14th pass, Matthew: "persistence -- yes") --
    // reads localStorage before anything else touches freq/volume/mute, so
    // a restored session and a fresh one flow through the exact same code
    // below. Only ever restores a *locked* station (see saveSignalState) --
    // a bare tuned-but-not-locked dial position isn't worth remembering.
    // 23rd pass: same restore-before-anything-touches-it flow as
    // volume/mute above, so displayModeIndex is right by the time the
    // STANDBY chrome below (and the setPhosphor() call after this block)
    // draws with it. Defaults to index 0 ('matrix'/GREEN PHOSPHOR), which
    // matches the phosphor mount() already set on the CRT before init() ran.
    this.displayModeIndex = 0
    const saved = loadSignalState()
    if (saved) {
      if (typeof saved.volume === 'number') this.volume = Math.min(100, Math.max(0, saved.volume))
      if (typeof saved.muted === 'boolean') this.muted = saved.muted
      if (typeof saved.phosphor === 'string') {
        const idx = DISPLAY_MODES.findIndex((m) => m.key === saved.phosphor)
        if (idx !== -1) this.displayModeIndex = idx
      }
      if (saved.stationId) {
        const ch = STATIONS.find((c) => c.id === saved.stationId)
        if (ch) {
          this.mode = 'locked'
          this.lockedStation = ch
          this.freq = ch.freq
          const track = saved.trackId ? ch.tracks.find((tr) => tr.id === saved.trackId) : null
          this.currentTrack = track || ch.tracks[0]
          this.needsTrackLoad = true
        }
      }
    }
    // 28th pass (Matthew: "sometimes it doesn't automatically seek to a
    // station and the user has to figure out to use arrows or hit s") -- a
    // first-ever visit (no saved session, or a save that somehow had no
    // stationId) landed in 'seeking' mode sitting at FREQ_MIN with nothing
    // locked, so the set just sat there silently until someone thought to
    // press an arrow key or S. A real radio doesn't power on to dead air by
    // default -- lands on a random preset instead, same as if that preset
    // had been the one restored from a save (same fields, same
    // needsTrackLoad path through powerUp()).
    if (this.mode !== 'locked') {
      const ch = STATIONS[Math.floor(Math.random() * STATIONS.length)]
      this.mode = 'locked'
      this.lockedStation = ch
      this.freq = ch.freq
      this.currentTrack = this.nextTrack(ch)
      this.needsTrackLoad = true
    }
    // Only actually calls into the CRT when a non-default mode was restored
    // -- otherwise this is a same-value no-op on top of mount()'s own
    // setPhosphor(PHOSPHOR) call, cheap either way.
    s.setPhosphor(DISPLAY_MODES[this.displayModeIndex].key)

    for (let y = 0; y < term.rows; y++)
      for (let x = 0; x < term.cols; x++) term.put(x, y, ' ', NORMAL, 0)
    // 19th pass: see drawStandbyClock() -- floor(rows/2) is the true center
    // row, and the block is now centered around it (-2/0/+2) rather than
    // only extending downward from it.
    const midY = Math.floor(term.rows / 2)
    const label = 'STANDBY'
    term.text(centerX(term.cols, label), midY - 2, label, FAINT)
    // 45th pass -- mobile has no keyboard, so the keyboard hint here is
    // meaningless; same swap the touch tap/swipe layer already makes for
    // the locked-screen hint footer (see mobileDrawChrome).
    const hint = this.mobile ? 'TAP TO POWER ON' : '[P] POWER ON'
    term.text(centerX(term.cols, hint), midY, hint, FAINT)
    this.drawStandbyClock(s)

    // Guide overlay (15th pass, Matthew: "we also need a G for guide").
    this.guideOpen = false

    // Date/time module ticker (15th pass) -- one interval for the whole
    // page lifetime, since the clock needs to keep ticking on the STANDBY
    // screen too (a real clock-radio's display doesn't go dark just
    // because the set itself is off). Skipped entirely while the guide
    // overlay is open, since that's a full-screen takeover with nothing to
    // tick into.
    // 16th pass (Matthew: "remove date/time during cold boot") -- the boot
    // and shutdown beat sequences both flip this.poweredOn to its end state
    // immediately (see powerUp()/powerDown()) and then spend ~3s animating
    // toward the final picture with their own setTimeout beats. Without a
    // guard, this 1s ticker would independently redraw the clock on top of
    // whatever the animation currently has on screen (the boot-text POST
    // readout, the collapsing centerline, etc.) -- it doesn't know an
    // animation is mid-flight, it just sees poweredOn=false and draws the
    // standby clock over it. this._powerAnimating is set for the duration
    // of both sequences so the ticker skips a beat instead of stomping on
    // them.
    this._powerAnimating = false
    this._clockTimer = setInterval(() => {
      if (this.guideOpen || this._powerAnimating) return
      if (this.poweredOn) this.drawClock(s)
      else this.drawStandbyClock(s)
    }, 1000)

    this.initPlayer(s)

    // 22nd pass (Matthew: "semi mobile functionality -- tapping screen can
    // 'power on', swipe left/right for channels") -- touch's own gesture
    // layer, tap/swipe read directly off touchstart/touchend rather than a
    // continuous drag. Mouse-drag-to-seek (the desktop equivalent this used
    // to sit next to) was removed in the 44th pass -- see its old spot's
    // note in drawHint() -- so this is the only pointer input SIGNAL reads
    // now, and only on touch devices.
    this._touchActive = false
    this._touchStartX = 0
    this._touchStartY = 0
    this._touchStartTime = 0
    // 45th pass -- two-finger tap (display mode cycle), tracked separately.
    this._twoFingerActive = false
    this._twoFingerStartTime = 0
    document.addEventListener('touchstart', (e) => this.onTouchStart(s, e), { passive: false })
    document.addEventListener('touchend', (e) => this.onTouchEnd(s, e), { passive: false })
  },

  drawScale(s) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    for (let x = BOX_X0 + 1; x < BOX_X1; x++) term.put(x, SCALE_Y, ' ')
    term.text(DIAL_X0 - 1, SCALE_Y, '100.0', DIM)
    term.text(freqToCol(500) - 2, SCALE_Y, '500.0', DIM)
    term.text(DIAL_X1 - 4, SCALE_Y, '900.0', DIM)
  },

  drawDial(s) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    for (let x = DIAL_X0; x <= DIAL_X1; x++) term.put(x, DIAL_Y, '·', FAINT)
    const { station: near, dist } = nearestStation(this.freq)
    for (const ch of STATIONS) {
      const col = freqToCol(ch.freq)
      const glow = this.mode === 'seeking' && ch === near && dist <= NEAR_THRESHOLD
      const locked = this.mode === 'locked' && this.lockedStation === ch
      // 41st pass: each station's own marker (STATIONS[].glyph) instead of
      // nine identical triangles, so the band reads as a map you learn
      // rather than a row of anonymous ticks. Every glyph is verified
      // present in the Terminus BDF -- an unmapped codepoint renders blank,
      // which would silently delete a station from the dial.
      term.put(col, DIAL_Y, ch.glyph || '▲', locked ? BRIGHT : glow ? BOLD : NORMAL)
    }
    const cursorCol = freqToCol(this.freq)
    term.put(cursorCol, DIAL_Y, '█', BRIGHT)
  },

  drawFreq(s) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    for (let x = BOX_X0 + 1; x < BOX_X1; x++) term.put(x, FREQ_Y, ' ')
    const str = this.freq.toFixed(1)
    term.text(centerX(term.cols, str), FREQ_Y, str, BOLD)
  },

  // 11th pass (Matthew: "add some flair around scanning, locked status...
  // brackets so it's not just floating text") -- wraps every status string
  // in a readout-style bracket instead of leaving it as bare centered text.
  //
  // 23rd pass (Matthew: "the dot led thing next to it can go, it doesn't
  // read as an LED or status" -- removed. It also turns out to have been
  // the cause of the status line reading as off-center: `combined` (what
  // centerX() actually centered) was `ledGlyph + '  ' + bracket`, 3 columns
  // of glyph+gap tacked onto the LEFT side only with nothing to balance it
  // on the right, so the bracket itself landed 1-2 columns right of true
  // center every time. Centering the bracket alone fixes both complaints at
  // once. Lock/seek state is still visible elsewhere (the LED's old jobs:
  // the dial's ▲/█ brightness and the LEVELS SIG meter), so nothing here
  // was the only place that state showed up.
  // 38th pass (Matthew: "when seeking or scanning maybe we flash that in
  // the status area instead of just changing the text"). Everything this
  // row did used to happen in a single tick: blank it, write the new word,
  // done. That is what made a busy screen feel flat -- the ambient layer
  // (VU, EQ ribbon, antenna rings, phosphor shimmer) never stops, so
  // nothing ever punctuated it. The row is now three things instead of one
  // label:
  //   1. a typewriter reveal on any text CHANGE (see the `same` check --
  //      re-setting SEEKING on every arrow tap must not restart it, or
  //      fast seeking turns into a stutter),
  //   2. a per-state animation living in the FAINT flanking rules the 30th
  //      pass added -- a bright cell travelling out from the brackets,
  //      direction matched to the way you are tuning,
  //   3. one-shot punctuation on the two event states: LOCKED flashes the
  //      bracket inverse on the same beat as the ident, NO SIGNAL
  //      double-blinks.
  // opts.transient marks a temporary readout (see flashStatus) that must
  // not become the state the row falls back to.
  setStatus(s, text, active, opts = {}) {
    const same = this._statusText === text
    this._clearStatusTimers()
    if (!opts.transient) {
      this.statusPersistent = { text, active }
      // A real state change cancels a pending flash revert -- otherwise
      // locking mid-volume-flash would get stomped ~900ms later by the
      // flash restoring the status it captured before the lock happened.
      if (this._statusFlashTimer) { clearTimeout(this._statusFlashTimer); this._statusFlashTimer = null }
    }
    this._statusText = text
    this._statusActive = active
    // The power sequences draw their own beats on their own timers and
    // then clear the whole grid out from under this row, so a reveal
    // staggered across a couple hundred ms would paint text back onto an
    // already-collapsed picture. Instant while _powerAnimating.
    const instant = same || this._powerAnimating || text === 'LOCKED' || text === 'NO SIGNAL'
    if (instant) {
      this.drawStatusRow(s, text, active, text.length)
    } else {
      this.drawStatusRow(s, text, active, 0)
      for (let i = 1; i <= text.length; i++) {
        this._statusRevealTimers.push(setTimeout(() => {
          if (this._statusText !== text || this._powerAnimating) return
          this.drawStatusRow(s, text, active, i)
        }, i * STATUS_REVEAL_MS))
      }
    }
    this.startStatusAnim(s, text, active)
  },

  /** Draws the whole status row -- flanking rules plus the bracketed
   *  readout -- with the first `revealed` characters of `text` shown and
   *  the rest blanked. The unrevealed remainder is padded with spaces
   *  rather than shortened, so the bracket is a constant width and the
   *  readout never shifts horizontally mid-reveal. */
  // 45th pass -- plain centered bracket, no flanking rule (BOX_X0/BOX_X1
  // are desktop columns, off the end of the 42-col mobile grid) and no
  // per-character reveal. Every setStatus()/flashStatus() caller across the
  // file funnels through here, so gating this one spot covers all of them
  // -- LOCKED, SEEKING, MUTED/UNMUTED, VOL nn, everything.
  // 2026-08-22: takes inv now too (was silently dropped before, so LOCKED's
  // inverse flash never showed on mobile even though the timer driving it
  // fired correctly).
  mobileDrawStatusRow(s, text, attr, inv = 0) {
    const { term } = s
    const bracket = `[ ${text} ]`
    for (let x = 0; x < term.cols; x++) term.put(x, MSTATUS_Y, ' ', NORMAL, 0)
    term.text(centerX(term.cols, bracket), MSTATUS_Y, bracket, attr, inv)
  },

  drawStatusRow(s, text, active, revealed, opts = {}) {
    if (this.mobile) { this.mobileDrawStatusRow(s, text, opts.attr ?? (active ? BRIGHT : MUTED), opts.inv ? 1 : 0); return }
    const { term } = s
    const padTotal = STATUS_TEXT_WIDTH - text.length
    const padL = Math.max(0, Math.floor(padTotal / 2))
    const padR = Math.max(0, padTotal - padL)
    const shown = text.slice(0, revealed) + ' '.repeat(Math.max(0, text.length - revealed))
    const padded = ' '.repeat(padL) + shown + ' '.repeat(padR)
    const bracket = `[ ${padded} ]`
    const bracketX = centerX(term.cols, bracket)
    this._statusBracketX = bracketX
    this._statusBracketLen = bracket.length
    for (let x = 0; x < term.cols; x++) term.put(x, STATUS_Y, ' ')
    // 30th pass (Matthew: "the 'status' ie LOCKED... shouldn't those be
    // emphasised") -- the bracket was already BRIGHT when active (same
    // tier as the station callsign), so the flat feeling wasn't really a
    // brightness problem: it's that the word sits alone on an otherwise
    // blank row with nothing to anchor it, one row above TUNING BAND's top
    // border. Flanking it with a thin rule spanning the same BOX_X0..
    // BOX_X1 columns as the box directly beneath gives it a "seat" -- the
    // status row and the box below now read as one joined strip instead of
    // centered text floating on dead space.
    const gap = 1
    for (let x = BOX_X0; x < bracketX - gap; x++) term.put(x, STATUS_Y, '─', FAINT)
    for (let x = bracketX + bracket.length + gap; x <= BOX_X1; x++) term.put(x, STATUS_Y, '─', FAINT)
    const attr = opts.attr ?? (active ? BRIGHT : MUTED)
    term.text(bracketX, STATUS_Y, bracket, attr, opts.inv ? 1 : 0)
  },

  /** Per-state status animation. Two one-shots (LOCKED, NO SIGNAL) and two
   *  continuous sweeps (SEEKING, SCANNING/TUNING) -- everything else just
   *  sits still, which is correct: a status that never changes shouldn't
   *  be drawing the eye. */
  startStatusAnim(s, text, active) {
    const { term } = s
    // Any deferred draw below has to re-check that this status is still
    // the current one AND that nothing has taken the screen over since --
    // these run on their own timers, so they inherit no guard from
    // frame() (same rule the 29th pass learned with drawPlayback).
    const alive = () => this.poweredOn && !this.guideOpen && this._statusText === text

    if (text === 'LOCKED') {
      // One-shot inverse flash, landing on the same beat as the ident and
      // the focus snap -- lock is a single event across sound, motion,
      // text and picture rather than four things that happen to coincide.
      this.drawStatusRow(s, text, active, text.length, { inv: 1 })
      this._statusRevealTimers.push(setTimeout(() => {
        if (alive()) this.drawStatusRow(s, text, active, text.length)
      }, 120))
      return
    }
    if (text === 'NO SIGNAL') {
      for (const [ms, attr] of [[90, FAINT], [180, MUTED], [270, FAINT], [360, MUTED]]) {
        this._statusRevealTimers.push(setTimeout(() => {
          if (alive()) this.drawStatusRow(s, text, active, text.length, { attr })
        }, ms))
      }
      return
    }

    const sweeping = text.startsWith('SCANNING') || text.startsWith('TUNING')
    const seeking = text === 'SEEKING'
    if (!sweeping && !seeking) return
    // 2026-08-22 (Matthew: "the tuning 'line' also draws over the status")
    // -- this whole block below is hardcoded to STATUS_Y/BOX_X0/BOX_X1,
    // desktop's row and its 2..77 column span. It was never gated for
    // mobile at all, so every TUNING/SEEKING/SCANNING status kicked this
    // off on the 42-col mobile grid too. This._statusBracketX/Len are only
    // ever written by drawStatusRow's DESKTOP branch (mobile returns before
    // reaching them), so on mobile they sit at their constructor default of
    // 0 forever -- which makes rightCols run from column 1 to BOX_X1 (77),
    // painting a FAINT rule across nearly the whole status row every tick
    // and overwriting the "[ TUNING n ]" text mobileDrawStatusRow just
    // centered there, with the BRIGHT sweep cell itself only visible for
    // the fraction of that 77-column travel that lands inside the 42-column
    // mobile grid before wrapping -- which is exactly the "animates only
    // briefly left to right" Matthew described. Mobile's status row just
    // sits still instead: 40 columns isn't enough room for a travelling
    // dash to read as motion anyway, and the LOCKED flash / NO SIGNAL blink
    // above still land correctly through drawStatusRow's mobile branch.
    if (this.mobile) return
    let i = 0
    this._statusAnimTimer = setInterval(() => {
      if (!alive()) { this._clearStatusTimers(); return }
      const bx = this._statusBracketX
      // Built fresh each tick rather than cached: a flashStatus revert can
      // change the bracket width underneath this between ticks.
      const leftCols = []
      for (let x = bx - 2; x >= BOX_X0; x--) leftCols.push(x)
      const rightCols = []
      for (let x = bx + this._statusBracketLen + 1; x <= BOX_X1; x++) rightCols.push(x)
      for (const x of leftCols) term.put(x, STATUS_Y, '─', FAINT)
      for (const x of rightCols) term.put(x, STATUS_Y, '─', FAINT)
      if (sweeping) {
        // Scanning sweeps the full width, hopping over the bracket -- the
        // same left-to-right pass the tuner itself is making.
        const all = leftCols.slice().reverse().concat(rightCols)
        const pos = i % all.length
        term.put(all[pos], STATUS_Y, '─', BRIGHT)
        if (pos + 1 < all.length) term.put(all[pos + 1], STATUS_Y, '─', DIM)
      } else {
        // Seeking travels outward from the bracket, on the side you are
        // tuning toward, so the row agrees with the dial below it.
        const cols = this._statusSweepDir < 0 ? leftCols : rightCols
        if (cols.length) {
          const pos = i % cols.length
          term.put(cols[pos], STATUS_Y, '─', BRIGHT)
          if (pos > 0) term.put(cols[pos - 1], STATUS_Y, '─', DIM)
        }
      }
      i++
    }, sweeping ? 55 : 80)
  },

  _clearStatusTimers() {
    for (const t of this._statusRevealTimers || []) clearTimeout(t)
    this._statusRevealTimers = []
    if (this._statusAnimTimer) { clearInterval(this._statusAnimTimer); this._statusAnimTimer = null }
  },

  /** 38th pass -- transient status readout that reverts to whatever the
   *  row was actually saying. This closed a real gap rather than adding
   *  polish: volume, mute and display mode all changed state with no
   *  acknowledgement in the status row at all, and preset digits only
   *  showed up as the dial starting to move. */
  flashStatus(s, text, ms = 900) {
    this.setStatus(s, text, true, { transient: true })
    if (this._statusFlashTimer) clearTimeout(this._statusFlashTimer)
    this._statusFlashTimer = setTimeout(() => {
      this._statusFlashTimer = null
      const prev = this.statusPersistent
      if (!prev || !this.poweredOn || this.guideOpen) return
      this.setStatus(s, prev.text, prev.active)
    }, ms)
  },

  // 38th pass -- signal resolve. Station and track text used to snap in
  // whole; each character now lands out of noise on its own staggered
  // beat, which in fiction is exactly what a receiver settling onto a
  // signal looks like. Deliberately short (under ~300ms): the moment it
  // reads as waiting rather than resolving, it is wrong.
  RESOLVE_GLYPHS: '▓▒░#%&*',
  resolveText(s, x, y, text, attr, durationMs = 250) {
    const { term } = s
    this._cancelResolve(y)
    // Per-character settle times, random rather than left-to-right: a
    // sequential wipe reads as a typewriter (which the status row already
    // is), scattered reads as noise clearing.
    const settleAt = []
    for (let i = 0; i < text.length; i++) settleAt.push(durationMs * (0.12 + 0.88 * Math.random()))
    const start = Date.now()
    const tick = () => {
      // Own guard, no inheritance from frame() -- see startStatusAnim.
      if (!this.poweredOn || this.guideOpen) { this._cancelResolve(y); return }
      const elapsed = Date.now() - start
      let done = true
      for (let i = 0; i < text.length; i++) {
        const ch = text[i]
        if (ch === ' ') { term.put(x + i, y, ' '); continue }
        if (elapsed >= settleAt[i]) { term.put(x + i, y, ch, attr); continue }
        done = false
        const g = this.RESOLVE_GLYPHS[Math.floor(Math.random() * this.RESOLVE_GLYPHS.length)]
        term.put(x + i, y, g, Math.random() < 0.4 ? FAINT : DIM)
      }
      if (done) this._cancelResolve(y)
    }
    tick()
    this._resolveTimers[y] = setInterval(tick, 33)
  },
  _cancelResolve(y) {
    const t = this._resolveTimers && this._resolveTimers[y]
    if (t) { clearInterval(t); delete this._resolveTimers[y] }
  },
  _cancelAllResolves() {
    for (const y of Object.keys(this._resolveTimers || {})) this._cancelResolve(y)
  },

  /** 38th pass -- rare idle CRT event. Two kinds: the vertical hold
   *  drifting for about a second, or a tear (snow/chroma spike plus a
   *  scrambled run on one panel border). Locked-only on purpose: while
   *  seeking, crtDegradeForDist() is already driving these same params
   *  off the tuning distance, and a random drift layered on top of that
   *  would read as a bug rather than an event. Exposed as its own method
   *  so it can be fired on demand from the console
   *  (window.screen0.program.crtIdleEvent(window.screen0, 'tear')) --
   *  at its real frequency you cannot reliably catch one to check it. */
  crtIdleEvent(s, kind) {
    if (!s?.crt?.params) return
    const { term } = s
    const { dist } = nearestSignal(this.freq)
    // Restore to what the CURRENT tuning distance calls for, not to
    // nominal -- same reasoning as flashCrtGlitch().
    const restore = crtDegradeForDist(dist)
    kind = kind || (Math.random() < 0.5 ? 'roll' : 'tear')
    if (kind === 'roll') {
      rampCrtParams(s, { roll: restore.roll, rollSpeed: crtBase.rollSpeed }, { roll: 0.45, rollSpeed: 0.9 }, 260)
      rampCrtParams(s, { roll: 0.45, rollSpeed: 0.9 }, { roll: restore.roll, rollSpeed: crtBase.rollSpeed }, 500, 700)
      return
    }
    Object.assign(s.crt.params, { snow: 0.03, chroma: 1.6 })
    setTimeout(() => {
      if (!s?.crt?.params) return
      if (!this.poweredOn || this.guideOpen) return
      Object.assign(s.crt.params, restore)
    }, 90)
    // Same box-BOTTOM rows the idle shimmer restricts itself to: those are
    // plain full-width '─' with no embedded panel label (drawBoxTop has
    // one, drawBoxBottom does not), so a scrambled run here can never
    // clobber something that has to stay readable.
    const y = BOX_BOTTOM_ROWS[Math.floor(Math.random() * BOX_BOTTOM_ROWS.length)]
    const runLen = 8 + Math.floor(Math.random() * 10)
    const x0 = BOX_X0 + 1 + Math.floor(Math.random() * Math.max(1, BOX_X1 - BOX_X0 - runLen - 2))
    const glyphs = '▓▒░─'
    for (let i = 0; i < runLen; i++) {
      term.put(x0 + i, y, glyphs[Math.floor(Math.random() * glyphs.length)], Math.random() < 0.4 ? DIM : FAINT)
    }
    const restAttr = BOX_BOTTOM_REST_ATTR.get(y)
    setTimeout(() => {
      if (!this.poweredOn || this.guideOpen) return
      for (let i = 0; i < runLen; i++) {
        const x = x0 + i
        // METERS_BOT_Y carries a '┻' junction at METERS_DIVIDER_X (see
        // drawChrome) -- the same trap the 18th pass hit with the idle
        // shimmer, which restores a flat '─' over everything it touches.
        // restAttr (not a hardcoded MUTED): NOW PLAYING's border rests at
        // BOLD -- see BOX_BOTTOM_REST_ATTR's definition for the bug this
        // fixes.
        term.put(x, y, y === METERS_BOT_Y && x === METERS_DIVIDER_X ? '┻' : '─', restAttr)
      }
    }, 90)
  },

  // Warm-up flicker (10th pass) -- a short beat sequence that redraws the
  // 4 panel top/bottom borders at varying brightness right after boot,
  // then settles back to the normal resting MUTED attr. One-shot, timer-
  // based (same pattern as the scan/preset timers elsewhere in this file),
  // not part of the per-frame loop.
  playBootFlicker(s) {
    // 45th pass -- every row/label here is a desktop box border; on
    // mobile's shorter grid several of those row numbers land on completely
    // different content (see clearStation's comment on the same collision).
    // Skipping the flicker cosmetic entirely on mobile rather than teaching
    // it a second geometry.
    if (this.mobile) return
    const { term } = s
    const tops = [
      [TUNER_TOP_Y, 'TUNING BAND'], [STATION_TOP_Y, 'STATION'],
      [NOWPLAYING_TOP_Y, 'NOW PLAYING'],
      // labelX1 = METERS_DIVIDER_X here (18th pass) -- without it this
      // would re-center "LEVELS" across the box's full width on every
      // flicker beat, colliding with (and, worse, permanently
      // mis-positioning relative to) the divider once the beats stop.
      [METERS_TOP_Y, 'LEVELS', METERS_DIVIDER_X],
    ]
    const bottoms = BOX_BOTTOM_ROWS
    const redraw = (attr) => {
      // BUG FIXED (caught live, 20th pass): this beat sequence runs for
      // ~500ms after powerUp()'s REVEAL_DELAY fires, via its own raw
      // setTimeouts -- it doesn't know about anything that happens after
      // it was scheduled. If the guide (see openGuide()) is opened during
      // that window (plausible -- it's right when the set finishes
      // powering on and controls first respond), these box-border redraws
      // punch straight through the guide's full-screen text, since they
      // never checked guideOpen. Bail out here instead.
      if (this.guideOpen) return
      for (const [y, label, labelX1] of tops) drawBoxTop(term, y, BOX_X0, BOX_X1, label, attr, labelX1)
      for (const y of bottoms) drawBoxBottom(term, y, BOX_X0, BOX_X1, attr)
      // 18th pass: drawBoxTop/Bottom redraw the LEVELS row as a plain
      // border, which would otherwise erase the LEVELS divider's
      // T-junctions on every power-on (this runs on every powerUp, not
      // just the very first boot). Redrawing them at the same attr keeps
      // them in sync with the rest of the flicker instead of vanishing.
      term.put(METERS_DIVIDER_X, METERS_TOP_Y, '┳', attr)
      term.put(METERS_DIVIDER_X, METERS_BOT_Y, '┻', attr)
    }
    const beats = [[FAINT, 30], [NORMAL, 110], [FAINT, 40], [DIM, 90], [BRIGHT, 70], [MUTED, 160]]
    let t = 0
    for (const [attr, delay] of beats) {
      t += delay
      setTimeout(() => redraw(attr), t)
    }
    // 30th pass: the beats above flicker all 4 boxes uniformly, including a
    // final MUTED settle -- which would leave NOW PLAYING dimmed down to
    // match its neighbors, undoing drawChrome()'s brighter resting frame
    // for it (see the "hero box" note there). Restore it once the beats
    // land, same as it's already drawn everywhere else.
    setTimeout(() => {
      if (this.guideOpen) return
      drawBoxTop(term, NOWPLAYING_TOP_Y, BOX_X0, BOX_X1, 'NOW PLAYING', BOLD)
      drawBoxSide(term, TRACK_Y, BOX_X0, BOX_X1, BOLD)
      drawBoxSide(term, PLAYBACK_Y, BOX_X0, BOX_X1, BOLD)
      drawBoxBottom(term, NOWPLAYING_BOT_Y, BOX_X0, BOX_X1, BOLD)
    }, t + 40)
  },

  // Power down/up (12th pass, Matthew: "let's build a power on and power
  // down sequence"). Neither one resets freq/lockedStation/shuffle
  // bags/volume -- powering off and back on is meant to read as the same
  // set switching states, not a fresh boot. init() still owns the actual
  // fresh-boot path (page load) and calls drawChrome()+playBootFlicker()
  // directly; these two reuse the same building blocks for the same look
  // on every power cycle after that.
  powerDown(s) {
    if (!this.poweredOn) return
    this.poweredOn = false
    this._powerAnimating = true // cleared once the STANDBY beat lands below
    // 43rd pass: cleared silently, not via exitVisualizer() -- the collapse
    // sequence below already clears and redraws the whole grid itself, so
    // there's no normal-view chrome to restore first. Left set, frame()
    // would keep painting the drift effect over STANDBY forever after the
    // next power-up.
    this.visualizerActive = false
    // 38th pass: the status sweep and any in-flight text resolve run on
    // their own timers and would otherwise keep painting into the collapse
    // sequence's own beats.
    this._clearStatusTimers()
    this._cancelAllResolves()
    this.stopScan()
    // stopScan() no longer stops the ambient static bed on its own (12th
    // pass) -- power-down is one of the two places (with tryLock) that
    // still needs to silence it explicitly.
    stopStaticNoise()
    stopTubeHum() // 42nd pass -- the noise floor dies with the set, same as everything else audio
    if (this.ready && this.player) this.player.pauseVideo()
    this.setPlayState(s)
    playPowerDownSound()

    const { term } = s
    const clearAll = () => {
      for (let y = 0; y < term.rows; y++)
        for (let x = 0; x < term.cols; x++) term.put(x, y, ' ', NORMAL, 0)
    }
    // 19th pass: floor, not round -- see drawStandbyClock()
    const midY = Math.floor(term.rows / 2)

    const beats = [
      { delay: 0, fn: () => {
        // Voltage surge on the way out -- borders flash bright once before
        // the collapse starts, same beat playBootFlicker opens on, in
        // reverse intent (dying rather than warming up).
        this.setStatus(s, 'POWERING DOWN', true)
      } },
      { delay: 90, fn: () => {
        // Content goes dark first -- station/track/meters cut before the
        // frame itself does, like the signal chain losing power before the
        // tube does.
        this.clearStation(s)
        this.clearTrack(s)
        for (let x = BOX_X0 + 1; x < BOX_X1; x++) {
          term.put(x, VOL_Y, ' '); term.put(x, SIG_Y, ' '); term.put(x, VU_Y, ' ')
        }
        this.setStatus(s, 'POWERING DOWN', false)
      } },
      { delay: 140, fn: () => {
        // Signal-loss glitch (13th pass, "fun shutdown") -- a scatter of
        // random block/noise glyphs across the dial and tuning rows right
        // before the picture collapses, like the tuner losing lock a beat
        // before the tube itself dies. Paired with a short filtered-noise
        // burst so it reads/sounds like the same event.
        const glitchChars = '▓▒░#%&*'
        for (let x = BOX_X0 + 1; x < BOX_X1; x++) {
          if (Math.random() < 0.55) {
            const ch = glitchChars[Math.floor(Math.random() * glitchChars.length)]
            term.put(x, DIAL_Y, ch, Math.random() < 0.3 ? BRIGHT : FAINT)
          }
        }
        playStaticBurst(0.12, 0.16, 2200)
      } },
      { delay: 170, fn: () => {
        // Whole picture collapses to the horizontal centerline -- a CRT's
        // vertical deflection dying while the beam is still lit reads as
        // exactly this: everything not on the middle scanline disappears.
        // 38th pass: persistence way up for the collapse, so the dying
        // centerline smears and lingers the way a real tube's does instead
        // of the picture cutting crisply off. Restored on the way into
        // STANDBY below, and again defensively on power-up.
        if (s?.crt?.params) s.crt.params.decay = 0.96
        clearAll()
        for (let x = 0; x < term.cols; x++) term.put(x, midY, '─', DIM)
      } },
      { delay: 260, fn: () => {
        // Centerline collapses to a single point -- the classic tube-off
        // dot -- then that point goes dark too.
        clearAll()
        term.put(Math.floor(term.cols / 2), midY, '·', BRIGHT)
      } },
      { delay: 320, fn: () => {
        clearAll()
        const label = 'STANDBY'
        term.text(centerX(term.cols, label), midY - 2, label, FAINT)
        const hint = this.mobile ? 'TAP TO POWER ON' : '[P] POWER ON'
        term.text(centerX(term.cols, hint), midY, hint, FAINT)
        this.drawStandbyClock(s)
        // 38th pass: afterglow bleeding back down to nominal persistence
        // across the first moments of STANDBY, rather than snapping back.
        rampCrtParams(s, { decay: 0.96 }, { decay: crtBase.decay }, 420, 0, false)
        this._powerAnimating = false // sequence landed, ticker can resume
      } },
    ]
    for (const { delay, fn } of beats) setTimeout(fn, delay)
  },

  powerUp(s) {
    if (this.poweredOn) return
    this._powerAnimating = true // cleared once REVEAL_DELAY lands below
    const { term } = s
    const clearAll = () => {
      for (let y = 0; y < term.rows; y++)
        for (let x = 0; x < term.cols; x++) term.put(x, y, ' ', NORMAL, 0)
    }
    // 19th pass: floor, not round -- see drawStandbyClock()
    const midY = Math.floor(term.rows / 2)
    playPowerOnSound()
    // 41st pass: re-establish the baseline for whatever station is being
    // resumed BEFORE the warm-up ramp below reads crtBase.brightness/bg off
    // it -- otherwise a set resuming onto DRIFT MODE warms up to the nominal
    // brightness and only drops to the station's dimmer picture afterwards.
    setCrtCharacter(s, this.mode === 'locked' ? this.lockedStation : null)
    // 38th pass: powerDown() raises `decay` for the afterglow smear on the
    // way out, so a power-cycle has to come back to nominal persistence
    // rather than inheriting a tube that never stops glowing.
    if (s?.crt?.params) s.crt.params.decay = crtBase.decay

    // 26th pass (Matthew: "a longer, better cold boot sequence... maybe like
    // cyberspace.online does") -- looked at cyberspace's actual boot live: a
    // dense retro-BIOS POST (hostname/kernel/hardware probe lines, a RAM
    // map, per-module load bars) before it lands on the app. SIGNAL is a
    // receiver, not an OS, so this borrows that probe-block density and
    // key:value voice but keeps it in-fiction -- tuner/antenna/preset-table
    // diagnostics instead of kernel modules. Values are pulled from the
    // real constants (FREQ_MIN/MAX, STATIONS.length) so this can't drift out
    // of sync with the actual band/roster the way a hardcoded line could.
    const bootLines = [
      'MODEL SG-1  SIGNAL RECEIVER',
      '',
      `BAND        : ${FREQ_MIN.toFixed(1)} - ${FREQ_MAX.toFixed(1)} KHZ`,
      `PRESETS     : ${STATIONS.length} STATIONS LOADED`,
      'OSCILLATOR  : QUARTZ, CALIBRATING...',
      'ANTENNA     : DIPOLE, CONTINUITY OK',
      '',
      '[ OK ] TUBES WARMING',
      '[ OK ] TUNER CALIBRATED',
      '[ OK ] PRESET TABLE LOADED',
      '[ OK ] SQUELCH SET',
      '[ OK ] SIGNAL LOCK ARMED',
      '[ OK ] AUDIO PATH READY',
    ]
    // Pacing (15th pass, Matthew: "even longer cold boot please" -- a
    // second pass after the 14th pass already slowed this down once; 26th
    // pass grew bootLines further on top of that, so the same per-line
    // stagger now runs ~5.5s total rather than ~3s). Still one-shot on every
    // power-on, not just the very first cold one, so it stays worth the wait
    // rather than becoming an annoyance to click through on every session.
    const DOT_MS = 500
    const LINE_STAGGER_MS = 240
    const BOOT_TEXT_DELAY = 1200
    const REVEAL_DELAY = BOOT_TEXT_DELAY + bootLines.length * LINE_STAGGER_MS + 700
    // 32nd pass (Matthew: "the tube should visually warm up, not just the
    // text reveal") -- brightness/bg ramp from a cold-tube floor up to
    // SCREEN's nominal values across the exact same window the boot beats
    // already use, so the picture is visibly gaining brightness right up
    // until REVEAL_DELAY lands the full chrome. Explicit cold values here
    // (not a fraction of whatever crt.params currently holds) so this
    // always starts from the same "just switched on" state regardless of
    // what a previous session left it at.
    rampCrtParams(
      s,
      { brightness: 0.05, bg: 0.02 },
      { brightness: crtBase.brightness, bg: crtBase.bg },
      REVEAL_DELAY,
      0,
      false,
    )
    const beats = [
      { delay: 0, fn: () => {
        // Same tube-off dot the collapse ended on, lighting back up first.
        clearAll()
        term.put(Math.floor(term.cols / 2), midY, '·', DIM)
      } },
      { delay: DOT_MS, fn: () => {
        // Dot expands to the centerline -- deflection coming back before
        // the rest of the picture does, reverse of the power-down collapse.
        clearAll()
        for (let x = 0; x < term.cols; x++) term.put(x, midY, '─', NORMAL)
        // Light static crackle as the tube catches, same texture the
        // power-down glitch beat used, quieter and higher-pitched (coming
        // up clean rather than dying).
        playStaticBurst(0.18, 0.08, 2600)
      } },
      { delay: BOOT_TEXT_DELAY, fn: () => {
        // Boot-text beat (13th pass, "fun startup/shutdown") -- a short
        // typewriter-style POST readout, same [ OK ] idiom used elsewhere
        // in the project's terminal-program voice, landing one line at a
        // time before the full picture snaps in. Cosmetic only, no state.
        clearAll()
        const startY = midY - Math.floor(bootLines.length / 2)
        bootLines.forEach((line, i) => {
          setTimeout(() => {
            term.text(centerX(term.cols, line), startY + i, line, i === 0 ? BOLD : DIM)
            // 38th pass (Matthew: "maybe some sounds as the boot happens
            // and each item appears?") -- all 13 lines used to land in
            // total silence, which is most of why a ~5.5s boot felt like
            // waiting rather than watching a machine come up. A blank
            // spacer line stays silent so the readout keeps its phrasing;
            // an [ OK ] confirm blips brighter than a probe line; pitch
            // creeps up across the sequence (see playBootTick).
            if (line) playBootTick(line.startsWith('[ OK ]') ? 'ok' : 'probe', i / (bootLines.length - 1))
          }, i * LINE_STAGGER_MS)
        })
      } },
      { delay: REVEAL_DELAY, fn: () => {
        // Full picture back -- same chrome init() draws on a fresh boot,
        // just without touching freq/lockedStation/bags/volume/history.
        clearAll()
        this.poweredOn = true
        this._powerAnimating = false // sequence landed, ticker can resume
        startTubeHum() // 42nd pass -- comes up with the picture, not before it
        this.drawChrome(s)
        this.drawScale(s)
        this.setStatus(s, 'SYSTEM READY', false)
        this.drawVolume(s)
        this.drawSignal(s)
        this.drawVU(s)
        this.drawAntenna(s, 0)
        this.drawDial(s)
        this.drawFreq(s)
        this.drawHint(s)
        if (this.mode === 'locked' && this.lockedStation) {
          // Resume exactly where it left off -- same station, same track,
          // same playback position -- rather than re-picking from the
          // shuffle bag, so it reads as the same set coming back on rather
          // than a new tune-in.
          this.showStation(s, this.lockedStation)
          if (this.currentTrack) this.showTrack(s, this.currentTrack)
          if (this.needsTrackLoad && this.currentTrack) {
            // Persistence resume (14th pass) -- this is a fresh page load,
            // not a same-session power-cycle, so the (brand new) YT.Player
            // has never actually loaded this track. A plain playVideo()
            // here would be a no-op. loadTrack(..., {midSong:true}) cues it
            // and picks a random join point, same as tryLock() does.
            this.needsTrackLoad = false
            this.loadTrack(this.currentTrack, { midSong: true })
            this.setPlayState(s, 'buffering')
          } else {
            if (this.ready && this.player) this.player.playVideo()
            this.setPlayState(s)
          }
        } else {
          this.clearStation(s)
          this.clearTrack(s)
          this.setStatus(s, 'SEEKING', false)
        }
        this.playBootFlicker(s)
      } },
    ]
    for (const { delay, fn } of beats) setTimeout(fn, delay)
  },

  drawVolume(s) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    // 18th pass: confined to the LEVELS box's left half (see
    // METERS_DIVIDER_X) -- only clears/centers up to the divider now,
    // leaving the reserved right half alone.
    for (let x = BOX_X0 + 1; x < METERS_DIVIDER_X; x++) term.put(x, VOL_Y, ' ')
    // Segment count trimmed from 24 to 16 in the 18th pass to fit the
    // halved width with clean margins either side of the divider.
    const segs = 16
    const filled = this.muted ? 0 : Math.round((this.volume / 100) * segs)
    let bar = ''
    for (let i = 0; i < segs; i++) bar += i < filled ? '█' : '-'
    const label = this.muted ? `VOL [${bar}] MUTE` : `VOL [${bar}] ${this.volume}`
    term.text(centerXRange(BOX_X0 + 1, METERS_DIVIDER_X - 1, label), VOL_Y, label, DIM)
  },

  // Decorative, but reinforces the tuning fantasy: fills in as you approach
  // a station while seeking, full once locked.
  // 2026-08-22 (Matthew: "room to put some fun things here below now
  // playing... maybe vu + signal") -- the mobile early-return used to sit at
  // the very top, so the SIG bar didn't even exist on mobile before now.
  // Percent computation is shared with desktop; only the render target
  // (row + width) differs, via mobileDrawSignal.
  drawSignal(s) {
    let pct = 0
    if (this.mode === 'locked') pct = 1
    else {
      // 41st pass: nearestSignal, not nearestStation -- the SIG meter is a
      // reception readout, and the secret station is really there.
      const { dist } = nearestSignal(this.freq)
      if (dist <= NEAR_THRESHOLD) pct = 1 - dist / NEAR_THRESHOLD
    }
    if (this.mobile) { this.mobileDrawSignal(s, pct); return }
    const { term } = s
    const segs = 16
    const filled = Math.round(pct * segs)
    let bar = ''
    for (let i = 0; i < segs; i++) bar += i < filled ? '█' : '-'
    for (let x = BOX_X0 + 1; x < METERS_DIVIDER_X; x++) term.put(x, SIG_Y, ' ')
    const label = `SIG [${bar}]`
    term.text(centerXRange(BOX_X0 + 1, METERS_DIVIDER_X - 1, label), SIG_Y, label, filled > 0 ? DIM : FAINT)
  },
  // 2026-08-22 -- shares the widget row with mobileDrawVU (VU left, SIG
  // right of MWIDGET_DIVIDER_X); own shorter segment count sized for the
  // half-width rather than reusing desktop's 16 (label wouldn't fit).
  mobileDrawSignal(s, pct) {
    if (!this._mLayout) return
    const { term } = s
    const y = this._mLayout.widgetRow
    const segs = 10
    const filled = Math.round(pct * segs)
    let bar = ''
    for (let i = 0; i < segs; i++) bar += i < filled ? '█' : '-'
    const label = `SIG[${bar}]`
    for (let x = MWIDGET_DIVIDER_X + 1; x < MBOX_X1; x++) term.put(x, y, ' ')
    term.text(centerXRange(MWIDGET_DIVIDER_X + 1, MBOX_X1 - 1, label), y, label, filled > 0 ? DIM : FAINT)
  },

  // STATION (callsign + tagline) and NOW PLAYING (track) are separate
  // boxes now -- station identity doesn't change on a track skip, so it
  // gets its own clear/draw pair instead of being wiped and redrawn
  // alongside the track every time (Matthew, 8/20: "station info should be
  // broken out from current playing song info").
  clearStation(s) {
    // 45th pass -- desktop's STATION_Y/TAGLINE_Y row numbers land on
    // completely different content on mobile's shorter grid (row 9 is the
    // NOW PLAYING box's top border there, not station text), so this can't
    // just no-op out of range the way a plain column overrun would.
    // 2026-08-22: row positions now come from this._mLayout (see
    // mobileLayout()) rather than fixed constants -- the box height varies
    // with tagline line count.
    if (this.mobile) {
      const { term } = s
      if (!this._mLayout) return
      const L = this._mLayout
      for (const y of [L.stationCall, L.stationTag1, L.stationTag2]) {
        if (y == null) continue
        for (let x = MBOX_X0 + 1; x < MBOX_X1; x++) term.put(x, y, ' ')
      }
      return
    }
    const { term } = s
    // 38th pass: kill any in-flight resolve on these rows first, or its
    // next tick paints characters back onto a row we just cleared.
    this._cancelResolve(STATION_Y)
    this._cancelResolve(TAGLINE_Y)
    for (const y of [STATION_Y, TAGLINE_Y]) {
      for (let x = BOX_X0 + 1; x < BOX_X1; x++) term.put(x, y, ' ')
    }
  },
  // 38th pass: opts.reveal === false draws instantly (no signal-resolve),
  // opts.revealMs shortens/lengthens it. Default is the full reveal --
  // every path that shows a station (lock, guide close, power-on resume)
  // is a moment where a receiver settling onto a signal is the right read.
  // 45th pass -- now resolves out of noise same as desktop (Matthew: "let's
  // think of a better tuner animation" -- mobile's station change had
  // nothing but a status-row text flash, since it has no dial to animate).
  // resolveText() is coordinate-generic (takes x/y as params, not baked-in
  // desktop constants), so this is a straight reuse, not new machinery.
  // 2026-08-22: now runs through mobileRelayout() first -- a tagline that
  // fits on one line collapses the STATION box by a row instead of leaving
  // the second row blank (Matthew: "the layout of text in the boxes is [not]
  // using the space well"), and everything below (NOW PLAYING, the widget
  // row, the hints) shifts up to match.
  mobileShowStation(s, station, opts = {}) {
    const { term } = s
    if (!this._mLayout) this._mLayout = mobileLayout(2, 2)
    const maxWidth = MBOX_X1 - MBOX_X0 - 4
    // wrapped across both tagline rows rather than truncated to one
    // (Matthew: "use additional lines as needed"). Second row omitted
    // entirely (see mobileRelayout) when the tagline fits on one line.
    const [tag1, tag2] = wrapLines(station.tagline, maxWidth, 2)
    const relaid = this.mobileRelayout(s, tag2 ? 2 : 1, this._mLayout.trackLines)
    const L = this._mLayout
    for (const y of [L.stationCall, L.stationTag1, L.stationTag2]) {
      if (y == null) continue
      for (let x = MBOX_X0 + 1; x < MBOX_X1; x++) term.put(x, y, ' ')
    }
    const FLAIR = station.glyph || '●'
    const flairWidth = FLAIR.length * 2 + 2
    const callsign = truncate(station.callsign, maxWidth - flairWidth)
    const flaired = `${FLAIR} ${callsign} ${FLAIR}`
    const callX = centerX(term.cols, flaired)
    const tag1X = centerX(term.cols, tag1)
    if (opts.reveal === false) {
      term.text(callX, L.stationCall, flaired, BRIGHT)
      term.text(tag1X, L.stationTag1, tag1, MUTED)
      if (tag2) term.text(centerX(term.cols, tag2), L.stationTag2, tag2, MUTED)
    } else {
      const ms = opts.revealMs ?? 260
      this.resolveText(s, callX, L.stationCall, flaired, BRIGHT, ms)
      this.resolveText(s, tag1X, L.stationTag1, tag1, MUTED, ms + 90)
      if (tag2) this.resolveText(s, centerX(term.cols, tag2), L.stationTag2, tag2, MUTED, ms + 90)
    }
    // mobileRelayout() wipes the whole dynamic zone including NOW PLAYING,
    // which this call didn't touch -- restore it instantly (no re-resolve)
    // rather than leaving it blank until something else redraws it.
    if (relaid && this.currentTrack) this.mobileShowTrack(s, this.currentTrack, { reveal: false })
  },
  mobileShowTrack(s, track, opts = {}) {
    const { term } = s
    if (!this._mLayout) this._mLayout = mobileLayout(2, 2)
    const maxWidth = MBOX_X1 - MBOX_X0 - 4
    const [t1, t2] = wrapLines(track.title, maxWidth, 2)
    const relaid = this.mobileRelayout(s, this._mLayout.tagLines, t2 ? 2 : 1)
    const L = this._mLayout
    for (const y of [L.npTrack1, L.npTrack2, L.npArtist]) {
      if (y == null) continue
      for (let x = MBOX_X0 + 1; x < MBOX_X1; x++) term.put(x, y, ' ')
    }
    const artist = truncate(track.artist, maxWidth)
    const t1X = centerX(term.cols, t1)
    const artistX = centerX(term.cols, artist)
    if (opts.reveal === false) {
      term.text(t1X, L.npTrack1, t1, BOLD)
      if (t2) term.text(centerX(term.cols, t2), L.npTrack2, t2, BOLD)
      term.text(artistX, L.npArtist, artist, MUTED)
    } else {
      const ms = opts.revealMs ?? 250
      this.resolveText(s, t1X, L.npTrack1, t1, BOLD, ms)
      if (t2) this.resolveText(s, centerX(term.cols, t2), L.npTrack2, t2, BOLD, ms)
      this.resolveText(s, artistX, L.npArtist, artist, MUTED, ms + 90)
    }
    if (relaid && this.lockedStation) this.mobileShowStation(s, this.lockedStation, { reveal: false })
  },

  showStation(s, station, opts = {}) {
    if (this.mobile) { this.mobileShowStation(s, station, opts); return }
    const { term } = s
    this.clearStation(s)
    const maxWidth = BOX_X1 - BOX_X0 - 4
    // 37th pass (Matthew: "some flair on either side of the station name,
    // trying to jazz up the interface") -- flanking on-air lamps. Budgeted
    // out of the same maxWidth truncate() already enforces, so even the
    // longest callsign (DISTORTION FIELD) still can't push the box past its
    // border.
    // 41st pass (Matthew: "extend the station glyphs to either side of the
    // station name replacing the 'on air' circles") -- the flair is now the
    // station's own dial marker, so the shape you hunt for on the band is
    // the same shape that frames the callsign once you land on it. The two
    // places a station identifies itself now agree. Falls back to the
    // original dot for anything without a glyph -- which today means the
    // secret station, and that is correct: it has no marker on the dial to
    // echo, because it has no marker at all.
    const FLAIR = station.glyph || '●'
    const flairWidth = FLAIR.length * 2 + 2 // "● " + " ●"
    const callsign = truncate(station.callsign, maxWidth - flairWidth)
    const flaired = `${FLAIR} ${callsign} ${FLAIR}`
    const tagline = truncate(station.tagline, maxWidth)
    const callX = centerX(term.cols, flaired)
    const tagX = centerX(term.cols, tagline)
    if (opts.reveal === false) {
      term.text(callX, STATION_Y, flaired, BRIGHT)
      term.text(tagX, TAGLINE_Y, tagline, MUTED)
    } else {
      const ms = opts.revealMs ?? 260
      this.resolveText(s, callX, STATION_Y, flaired, BRIGHT, ms)
      // Tagline settles a beat behind the callsign -- identity first, then
      // the description, rather than both landing as one block.
      this.resolveText(s, tagX, TAGLINE_Y, tagline, MUTED, ms + 90)
    }
  },

  clearTrack(s) {
    const { term } = s
    if (this.mobile) {
      if (!this._mLayout) { this.updateTabTitle(); return }
      const L = this._mLayout
      for (const y of [L.npTrack1, L.npTrack2, L.npArtist]) {
        if (y == null) continue
        for (let x = MBOX_X0 + 1; x < MBOX_X1; x++) term.put(x, y, ' ')
      }
      this.updateTabTitle()
      return
    }
    this._cancelResolve(TRACK_Y) // see clearStation
    for (let x = BOX_X0 + 1; x < BOX_X1; x++) term.put(x, TRACK_Y, ' ')
    this.updateTabTitle()
  },
  // 38th pass: same reveal options as showStation(). skip() passes a
  // shorter one -- a track change within a station you are already locked
  // onto is a smaller event than finding the station was.
  showTrack(s, track, opts = {}) {
    if (this.mobile) { this.mobileShowTrack(s, track, opts); return }
    const { term } = s
    this.clearTrack(s)
    const maxWidth = BOX_X1 - BOX_X0 - 4
    let line = `${track.title}  --  ${track.artist}`
    if (line.length > maxWidth) {
      // Truncate the title first and keep the artist whole where possible
      // -- who it's by matters more once space runs out than the last
      // few words of a long title.
      const suffix = `  --  ${track.artist}`
      const titleBudget = maxWidth - suffix.length
      line = titleBudget >= 8
        ? truncate(track.title, titleBudget) + suffix
        : truncate(line, maxWidth)
    }
    // 30th pass (Matthew: "can the current playing song be brighter like
    // the station name is") -- was NORMAL, a full tier under the station
    // callsign's BRIGHT. Bumped to BOLD rather than matching BRIGHT exactly
    // so station (identity) and track (content) stay visually distinct
    // tiers instead of collapsing to the same weight.
    const lineX = centerX(term.cols, line)
    if (opts.reveal === false) term.text(lineX, TRACK_Y, line, BOLD)
    else this.resolveText(s, lineX, TRACK_Y, line, BOLD, opts.revealMs ?? 250)
    this.updateTabTitle(track)
  },
  // 21st pass (Matthew, 0.3 wishlist: "browser tab title shows now-playing")
  // -- the whole point of SIGNAL living in one tab is you leave it running
  // in the background, so the tab itself is the only always-visible surface
  // once you've switched away. clearTrack() (called whenever nothing's
  // loaded -- seeking, scanning, power-off) resets to the bare title;
  // showTrack() sets it to callsign + track. Cheap: just a document.title
  // write, no extra DOM/animation cost.
  updateTabTitle(track) {
    document.title = (this.lockedStation && track)
      ? `${this.lockedStation.callsign} · ${track.title} — SIGNAL`
      : 'SIGNAL'
  },

  // Progress bar + play-state indicator, merged onto one row 2026-08-20
  // (8th pass) -- they used to be two separate lines but both are just
  // "playback status", and combining them paid for the LEVELS divider row
  // below. Only source of playback feedback at all now that the player
  // itself is off-screen: without this there'd be no way to tell playing
  // from paused, how far into a track you are, or that a track ended and
  // skipped. setPlayState() updates this.playState; drawPlayback() is the
  // only thing that actually draws, called from frame() (throttled -- time
  // display doesn't need per-frame precision) and after any state change.
  setPlayState(s, state) {
    this.playState = this.mode === 'locked' ? state : null
    this.drawPlayback(s)
  },
  drawPlayback(s) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    // BUG FIXED (29th pass, found verifying the hint-bar reflow): the YT
    // player's onStateChange fires async, outside frame()'s own guideOpen
    // bail, and used to draw straight through to PLAYBACK_Y (row 14)
    // regardless -- which happens to be the same row the guide's CONTROLS
    // block now uses for its first line, so a state change mid-guide (e.g.
    // BUFFERING -> PLAYING right as you open it) punched "> PLAYING" over
    // "[<-/->] SEEK...". `this.playState` above the guard in setPlayState()
    // still gets updated while the guide is open, so nothing is lost --
    // closeGuide() already calls setPlayState(s, this.playState) as its
    // last step, which redraws this row correctly once the guide closes.
    if (this.guideOpen) return
    const { term } = s
    for (let x = BOX_X0 + 1; x < BOX_X1; x++) term.put(x, PLAYBACK_Y, ' ')
    if (this.mode !== 'locked') return

    let barPart = ''
    if (this.ready && this.player) {
      let cur, dur
      try { cur = this.player.getCurrentTime(); dur = this.player.getDuration() } catch (e) {}
      if (dur && isFinite(dur) && dur > 0) {
        const fmt = (sec) => {
          sec = Math.max(0, Math.floor(sec))
          return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
        }
        const segs = 28
        const filled = Math.round(Math.min(1, cur / dur) * segs)
        let bar = ''
        for (let i = 0; i < segs; i++) bar += i < filled ? '█' : '·'
        barPart = `[${bar}] ${fmt(cur)} / ${fmt(dur)}`
      }
    }

    const labels = { playing: ['> PLAYING', BRIGHT], paused: ['|| PAUSED', MUTED], buffering: ['BUFFERING...', DIM] }
    const entry = labels[this.playState]
    const labelPart = entry ? entry[0] : ''
    const sep = barPart && labelPart ? '   ' : ''
    const full = barPart + sep + labelPart
    if (!full) return
    const startX = centerX(term.cols, full)
    if (barPart) term.text(startX, PLAYBACK_Y, barPart, FAINT)
    if (labelPart) term.text(startX + barPart.length + sep.length, PLAYBACK_Y, labelPart, entry[1])
  },

  // Scrolling waveform squiggle (11th pass -- Matthew wasn't digging the
  // analog needle from the 10th pass; picked this replacement from a set of
  // proposed alternatives). A ring buffer of recent amplitude samples
  // (this.vuTrace) shifts left every draw and a fresh sample lands on the
  // right, so the whole row reads as a live trace scrolling past rather
  // than bars bouncing in place or one marker sliding. The sample itself
  // still comes from spring-damped continuity (this.vuSample/vuVelocity)
  // rather than pure noise, so consecutive samples flow into each other
  // like a real waveform instead of looking like static. Still decorative
  // -- WebAudio has no visibility into the YouTube iframe's actual output.
  // 2026-08-22: mobile early-return used to sit right here, before the
  // spring physics even ran -- this.vuSample/vuVelocity/vuTrace never
  // advanced at all in mobile mode. Now the physics always run (shared with
  // desktop, one clock for the whole receiver) and only the render target
  // branches, via mobileDrawVU.
  drawVU(s) {
    const playing = this.mode === 'locked' && this.playState === 'playing'
    // 23rd pass (Matthew: "more animation, fun to see it change as you do
    // things"): the target was previously a flat 0.15-0.95 swing whenever
    // playing, regardless of volume/mute, and a flat 0.03 the rest of the
    // time -- so muting or turning the volume down didn't do anything to
    // it, and it went dead the instant you weren't locked. Two changes:
    //   1. Volume/mute now actually scale the swing, so a quiet or muted
    //      set reads as a quiet or flat meter, not a full-swing one.
    //   2. 'seeking' mode (this covers both idle-tuned and actively
    //      scanning -- see the mode comment in init()) gets its own low
    //      flutter instead of pinning to the same 0.03 floor as powered-on-
    //      but-paused, so hunting for a signal still reads as "alive".
    const volFactor = this.muted ? 0 : this.volume / 100
    const searching = this.mode === 'seeking'
    // 41st pass -- per-station ballistics (see stationBallistics). Only the
    // PLAYING target is scaled by swing: the seeking flutter and the resting
    // floor belong to the receiver, not to whatever station happens to be
    // loaded, so they stay identical everywhere on the dial.
    const b = this.stationBallistics()
    let target
    if (playing) target = Math.min(1, volFactor * b.swing * (0.15 + Math.random() * 0.8))
    else if (searching) target = 0.04 + Math.random() * 0.10
    else target = 0.03
    const spring = b.spring
    const damping = b.damping
    const accel = (target - this.vuSample) * spring - this.vuVelocity * damping
    this.vuVelocity += accel
    this.vuSample = Math.max(0, Math.min(1, this.vuSample + this.vuVelocity))
    this.vuTrace.shift()
    this.vuTrace.push(this.vuSample)
    // 2026-08-22 (bug report: "no ... VU" while muted) -- chars[0] used to
    // be a literal space, so once volFactor hit 0 (any station, whenever
    // muted -- not specific to the secret station) the spring eventually
    // settles vuSample to exactly 0 and the *entire* row rendered as
    // blank, reading as "the VU meter is gone" rather than the intended
    // "flat line" (see the 23rd-pass comment above: "a quiet or muted set
    // reads as a quiet or flat meter, not a full-swing one" -- flat, not
    // invisible). '▁' is the lowest non-empty block, so the floor is
    // always at least a visible flat trace.
    if (this.mobile) { this.mobileDrawVU(s, playing); return }
    const { term } = s
    const chars = '▁▁▂▃▄▅▆▇█'
    let bar = ''
    for (const v of this.vuTrace) bar += chars[Math.max(0, Math.min(chars.length - 1, Math.round(v * (chars.length - 1))))]
    // 18th pass: confined to the left half, and this.vuTrace shrank from
    // 24 to 16 samples (see init()) to match -- same reasoning as the
    // VOL/SIG segment trim above.
    for (let x = BOX_X0 + 1; x < METERS_DIVIDER_X; x++) term.put(x, VU_Y, ' ')
    const label = `VU  ${bar}`
    term.text(centerXRange(BOX_X0 + 1, METERS_DIVIDER_X - 1, label), VU_Y, label, playing ? DIM : FAINT)
  },
  // 2026-08-22 -- shares the widget row with mobileDrawSignal (VU left of
  // MWIDGET_DIVIDER_X, SIG right). Own shorter trace tail sized for the
  // half-width -- this.vuTrace itself is unchanged (still 16 samples,
  // shared with desktop's physics), this just renders fewer of them.
  mobileDrawVU(s, playing) {
    if (!this._mLayout) return
    const { term } = s
    const chars = '▁▁▂▃▄▅▆▇█'
    const n = 8
    let bar = ''
    for (const v of this.vuTrace.slice(-n)) bar += chars[Math.max(0, Math.min(chars.length - 1, Math.round(v * (chars.length - 1))))]
    const y = this._mLayout.widgetRow
    const label = `VU ${bar}`
    for (let x = MBOX_X0 + 1; x < MWIDGET_DIVIDER_X; x++) term.put(x, y, ' ')
    term.text(centerXRange(MBOX_X0 + 1, MWIDGET_DIVIDER_X - 1, label), y, label, playing ? DIM : FAINT)
  },

  /** 41st pass -- per-station meter ballistics (Matthew: "I'm also for ...
   *  Per-station meter ballistics"). Three numbers per station, feeding both
   *  the VU trace and the EQ ribbon:
   *    spring  -- how hard the meter is pulled toward its target
   *    damping -- how fast that pull is bled off
   *    swing   -- how far the target itself travels while playing
   *  DRIFT MODE drifts (0.16/0.72/0.55, barely moving); CIPHER and the
   *  secret station snap (0.6+/0.4/1.05+). The defaults below are the values
   *  every station used before this pass, so anything without a `meter`
   *  field behaves exactly as it always did -- including "no station at
   *  all", which is what the meters fall back to while seeking. */
  DEFAULT_BALLISTICS: { spring: 0.4, damping: 0.5, swing: 1 },
  stationBallistics() {
    const m = this.mode === 'locked' && this.lockedStation && this.lockedStation.meter
    return m ? { ...this.DEFAULT_BALLISTICS, ...m } : this.DEFAULT_BALLISTICS
  },

  // 23rd pass: a one-shot push into the spring rather than a new state
  // machine -- pulseVU() just shoves vuVelocity, and the existing
  // spring/damping in drawVU() above pulls it back down over the next few
  // draws, so a lock/skip reads as an attack-and-decay hit instead of
  // blending invisibly into the ambient random walk.
  pulseVU(amount) {
    this.vuVelocity += amount
  },

  // Animated antenna glyph (29th pass, replacing the PWR/AIR/STEREO/MONO/
  // MUTE bracketed indicator rows -- Matthew: "an animated 'signal' graphic
  // in the lower right... antenna looking thing... animate depending on
  // status"). Fills the same LEVELS right-half rows those indicators used
  // (VOL_Y..VU_Y), redrawn on the same per-frame cadence as drawVU() (see
  // the frame() call site) so it actually animates rather than only
  // updating on a state-change event.
  //
  // A nested-arc broadcast tower -- mast+base always faintly visible (PWR
  // is implicit: this only ever runs while powered on, same reasoning the
  // old PWR light used), 3 rings of arcs above it that read as the
  // "signal" part:
  //   seeking (not locked)  -- innermost ring blinks slowly on its own, a
  //                            "still listening" pulse rather than silence.
  //   locked + buffering     -- erratic single-ring flicker, unstable read.
  //   locked + playing       -- rings pulse outward in sequence (inner to
  //                            outer, looping), both sides together -- the
  //                            "actively on air" state.
  //   locked + paused        -- steady mid-ring, no animation.
  // 31st pass (Matthew: "shouldn't the antenna and FLD still be active even
  // while muted?") -- mute used to be its own branch here (frozen dim
  // ring), which conflated "the tuner is locked onto a signal" with "the
  // speaker is silenced". Those are different things -- a muted radio is
  // still receiving. Rings/FLD now key off playState only, same as an
  // unmuted set; only the EQ ribbon (an audio-level analog, like the VU
  // meter it sits next to) and the MUTE switch widget still check
  // this.muted directly.
  ANTENNA_TEMPLATE: [
    '(           )',
    ' (         ) ',
    '  (   |   )  ',
    '      |      ',
    '    __|__    ',
  ],
  // [row index into ANTENNA_TEMPLATE/antennaRows, left-char offset, right-char offset]
  ANTENNA_RINGS: [
    { row: 0, left: 0, right: 12 },
    { row: 1, left: 1, right: 11 },
    { row: 2, left: 2, right: 10 },
  ],
  drawAntenna(s, t) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    const rows = [VOL_Y, VOL_SIG_DIVIDER_Y, SIG_Y, VU_DIVIDER_Y, VU_Y]
    for (const y of rows) for (let x = METERS_DIVIDER_X + 1; x < BOX_X1; x++) term.put(x, y, ' ')

    const template = this.ANTENNA_TEMPLATE
    const startX = centerXRange(METERS_DIVIDER_X + 1, BOX_X1 - 1, template[0])

    // Base structure (mast, base, and all 3 rings faintly) -- drawn fresh
    // every frame so the previous frame's brightened ring reverts to faint
    // before this frame picks its own active ring, rather than smearing.
    for (let r = 0; r < template.length; r++) {
      const line = template[r]
      for (let i = 0; i < line.length; i++) {
        if (line[i] !== ' ') term.put(startX + i, rows[r], line[i], FAINT)
      }
    }

    const lightRing = (ringIdx, attr) => {
      const ring = this.ANTENNA_RINGS[ringIdx]
      term.put(startX + ring.left, rows[ring.row], '(', attr)
      term.put(startX + ring.right, rows[ring.row], ')', attr)
    }

    // 30th pass: this used to `return` straight out of each branch --
    // switched to a shared `state` string instead so drawFieldReadout()/
    // drawEqRibbon() below can run once, in every branch, without
    // duplicating the locked/buffering/playing checks. The ring logic
    // itself is unchanged. (31st pass: dropped the separate muted branch
    // -- see the comment above ANTENNA_TEMPLATE.)
    const locked = this.mode === 'locked' && this.lockedStation
    let state
    if (!locked) {
      // Seeking -- slow symmetric blink on the innermost ring only.
      if (Math.floor(t / 0.6) % 2 === 0) lightRing(2, DIM)
      state = 'seeking'
    } else if (this.playState === 'buffering') {
      // Erratic flicker -- a random ring, each side independently on this
      // redraw, unstable read rather than a clean pulse.
      const ring = this.ANTENNA_RINGS[Math.floor(Math.random() * 3)]
      if (Math.random() < 0.7) term.put(startX + ring.left, rows[ring.row], '(', BRIGHT)
      if (Math.random() < 0.7) term.put(startX + ring.right, rows[ring.row], ')', BRIGHT)
      state = 'buffering'
    } else if (this.playState === 'playing') {
      // Outward radiating pulse -- ring cycles inner -> outer -> loop.
      const ringIdx = 2 - (Math.floor(t / 0.25) % 3)
      lightRing(ringIdx, BRIGHT)
      state = 'playing'
    } else {
      // Paused -- steady mid-ring, no animation.
      lightRing(1, BRIGHT)
      state = 'paused'
    }

    this.drawSnrReadout(s, startX, rows, state)
    this.drawFieldReadout(s, startX, rows, state)
    this.drawEqRibbon(s, startX, rows, state)
    // 31st pass (Matthew: "how should and could we fill that space... make
    // them look like switches / buttons") -- the antenna glyph is only 13
    // columns wide inside a ~37-column pane, so there's a matching ~10-
    // column margin on the LEFT that's been sitting empty since the FLD
    // readout/EQ ribbon only claimed the right side. These three mirror
    // live state that's otherwise only readable from the bottom legend's
    // key bindings or (for display mode) the screen's overall tint, with
    // no on-screen readout at all.
    this.drawPresetStrip(s, rows)
    this.drawModeStrip(s, rows)
    this.drawMuteSwitch(s, rows)
  },

  // Preset position (1-9), left margin top row -- the 9 stations map
  // directly to the [1-9] keys in frequency order (STATION_PRESET_ORDER),
  // same mapping the guide's station table and the [B]ack logic already
  // use. Brightness-only (no brackets) to keep it a fixed 9-column strip.
  drawPresetStrip(s, rows) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    const y = rows[0] // VOL_Y
    const x0 = METERS_DIVIDER_X + 2
    const idx = this.lockedStation ? STATION_PRESET_ORDER.indexOf(this.lockedStation) : -1
    for (let i = 0; i < STATION_PRESET_ORDER.length; i++) {
      term.put(x0 + i, y, String(i + 1), i === idx ? BRIGHT : FAINT)
    }
  },

  // Display-mode selector, left margin middle row -- mirrors [C]'s cycle
  // through DISPLAY_MODES. This is the one addition here that closes an
  // actual gap rather than just duplicating something shown elsewhere:
  // right now the only feedback for which phosphor tint is active is the
  // whole screen's own color, with no on-screen label anywhere.
  drawModeStrip(s, rows) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    const y = rows[2] // SIG_Y
    const x0 = METERS_DIVIDER_X + 2
    const letters = ['G', 'A', 'B', 'M', 'P'] // matches DISPLAY_MODES order
    const activeIdx = this.displayModeIndex
    for (let i = 0; i < letters.length; i++) {
      term.put(x0 + i * 2, y, letters[i], i === activeIdx ? BRIGHT : FAINT)
    }
    // Bracket the active letter using its flanking gap columns instead of
    // a separate label row -- keeps the whole strip a fixed 9 columns.
    term.put(x0 + activeIdx * 2 - 1, y, '[', BRIGHT)
    term.put(x0 + activeIdx * 2 + 1, y, ']', BRIGHT)
  },

  // MUTE rocker, left margin bottom row -- a real switch-style readout
  // rather than the antenna's own frozen-ring mute state, which only ever
  // reads as "not animating" (easy to miss). Lit/BRIGHT when mute is
  // actually engaged, same convention as a physical mute button's own LED.
  drawMuteSwitch(s, rows) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    const y = rows[4] // VU_Y
    const x0 = METERS_DIVIDER_X + 2
    const label = this.muted ? 'MUTE [ON ]' : 'MUTE [OFF]'
    term.text(x0, y, label, this.muted ? BRIGHT : FAINT)
  },

  /** 39th pass -- signal-to-noise, in the last free block of the antenna
   *  pane's right margin (the row directly above FLD). The pair is the
   *  point: FLD is how MUCH signal is arriving, S/N is how CLEAN it is, and
   *  real receivers show both because they answer different questions.
   *
   *  Unlike every other readout in this pane, this one is not decorative --
   *  it is derived from the actual tuning distance, on the same
   *  NEAR_THRESHOLD curve the static bed (staticGainForDist) and the CRT
   *  degrade (crtDegradeForDist) already use. So it agrees with what you
   *  are hearing and seeing by construction rather than by coincidence:
   *  hunting between stations reads in the teens, easing onto a carrier
   *  climbs it, locked pins it at the top.
   *
   *  Deliberately NO randomness or spring, which is what separates it from
   *  its neighbours: the rings, the EQ ribbon and FLD are all continuous
   *  and fast, and a fourth jittering number would just add noise to the
   *  busiest corner of the screen. This only changes when the dial does.
   *  Fixed-width output (always "S/N " + 2 digits, same shape as FLD's), so
   *  it can never leave a stray character behind between redraws. */
  SNR_MAX: 56,
  SNR_MIN: 9,
  drawSnrReadout(s, startX, rows, state) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    const y = rows[0] // VOL_Y -- directly above FLD on SIG_Y
    const x0 = startX + this.ANTENNA_TEMPLATE[0].length + 2
    // Locked pins to a clean reading rather than measuring. dist is 0 at a
    // station's own frequency anyway, so this is the same number 99% of the
    // time -- but it also means nothing (a rounding artifact, a redraw
    // landing mid-sweep before tryLock has retuned to the exact frequency)
    // can ever show a degraded S/N on a carrier the set is holding. Locked
    // is locked.
    const pct = state === 'seeking' ? Math.min(1, nearestSignal(this.freq).dist / NEAR_THRESHOLD) : 0
    const snr = Math.round(this.SNR_MAX + (this.SNR_MIN - this.SNR_MAX) * pct)
    // Same attribute convention as drawFieldReadout() below, so the two
    // readouts read as one stacked pair rather than two unrelated labels.
    term.text(x0, y, `S/N ${String(snr).padStart(2, '0')}`, state === 'seeking' ? FAINT : DIM)
  },

  // Secondary readout, upper-right margin of the antenna pane (30th pass,
  // Matthew: "secondary readout makes sense"). Purely atmospheric -- not
  // derived from any real signal math -- but driven by the same state the
  // rings use, so it never contradicts them; it just says the same thing
  // in a second register (text instead of glyph). Fixed-width output only
  // (always "FLD " + 2 chars) so it never leaves a stray trailing
  // character behind between redraws.
  drawFieldReadout(s, startX, rows, state) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    const y = rows[2] // SIG_Y -- vertically centered on the glyph
    const x0 = startX + this.ANTENNA_TEMPLATE[0].length + 2
    if (state === 'seeking') {
      term.text(x0, y, 'FLD --', FAINT)
      return
    }
    if (state === 'buffering') {
      term.text(x0, y, 'FLD ..', DIM)
      return
    }
    // playing/paused -- same spring/damping shape drawVU() uses for
    // vuSample, kept as its own independent value (this.fieldSample) so
    // this doesn't just visually mirror the VU bar's motion.
    const target = state === 'playing' ? 0.55 + Math.random() * 0.4 : 0.5 + Math.random() * 0.06
    const spring = 0.3, damping = 0.55
    const accel = (target - this.fieldSample) * spring - this.fieldVelocity * damping
    this.fieldVelocity += accel
    this.fieldSample = Math.max(0, Math.min(1, this.fieldSample + this.fieldVelocity))
    const val = String(Math.round(30 + this.fieldSample * 65)).padStart(2, '0')
    term.text(x0, y, `FLD ${val}`, state === 'playing' ? DIM : FAINT)
  },

  // Small fake spectrum ribbon, lower-right margin of the antenna pane
  // (30th pass, Matthew: "not opposed to thin horizontal ribbons"). Sits on
  // the same row as the left pane's VU meter for symmetry, but reads as
  // its own thing -- several independent bars with their own spring
  // physics (see this.eqSamples/eqVelocities in init()) rather than one
  // scrolling trace like drawVU()'s bar.
  drawEqRibbon(s, startX, rows, state) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    const y = rows[4] // VU_Y
    const x0 = startX + this.ANTENNA_TEMPLATE[0].length + 2
    const chars = ' ▁▂▃▄▅▆▇█'
    let bar = ''
    const b = this.stationBallistics()
    // 31st pass: unlike the rings/FLD readout above, this ribbon stays an
    // audio-level analog (same role as the VU meter it mirrors) -- so mute
    // still flattens it, checked directly here rather than through `state`.
    for (let i = 0; i < this.eqSamples.length; i++) {
      let target
      if (this.muted) target = 0.05
      else if (state === 'playing') target = Math.min(1, b.swing * (0.15 + Math.random() * 0.8))
      else if (state === 'buffering') target = Math.random() * 0.6
      else if (state === 'seeking') target = 0.03 + Math.random() * 0.08
      else target = 0.05 // paused -- nearly flat
      // 41st pass: same station ballistics as the VU, scaled down slightly
      // -- the ribbon reads as several narrow bands rather than one summed
      // level, and bands that snap exactly as hard as the main meter make
      // the two look like copies of each other instead of two instruments
      // watching the same signal.
      const spring = b.spring * 0.9, damping = b.damping
      const accel = (target - this.eqSamples[i]) * spring - this.eqVelocities[i] * damping
      this.eqVelocities[i] += accel
      this.eqSamples[i] = Math.max(0, Math.min(1, this.eqSamples[i] + this.eqVelocities[i]))
      bar += chars[Math.max(0, Math.min(chars.length - 1, Math.round(this.eqSamples[i] * (chars.length - 1))))]
    }
    term.text(x0, y, bar, !this.muted && state === 'playing' ? DIM : FAINT)
  },

  // BUG/NAMING FIXED 2026-08-20: this used to log an entry on every track
  // skip within the SAME station, so "RECENT" was really a recent-tracks
  // log, not a station log. The session-stats/RECENT footer line was
  // removed entirely 2026-08-20 (7th pass, Matthew: "remove session
  // stats... this looks like a blob") -- this now just tracks what's
  // currently playing for skip()'s benefit, nothing gets drawn from it.
  tuneToStation(s, station, track) {
    this.nowPlaying = { stationId: station.id, freq: station.freq, callsign: station.callsign, title: track.title }
  },

  // Filled-background control panel, same treatment as the title bar
  // (Matthew, 8/20: distinguish the controls from the rest of the screen
  // the same way SIGNAL/v0.2 stand out up top, not as dim floating text).
  drawHint(s) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    // 29th pass (Matthew: "top row = radio-esque, bottom row = things a
    // real radio doesn't have"): line1 is now just tuning/receiver
    // primitives -- seek, lock, scan, presets, back. GUIDE moved down to
    // line2 (a real radio never had a help screen) and PLAY/PAUSE was
    // removed outright (see key() comment) rather than moved, since it's
    // not being kept anywhere.
    const line1 = '[<-/->] SEEK   [ENTER] LOCK   [S] SCAN   [1-9] PRESETS   [B] BACK'
    // 23rd pass: "[C] MODE" rather than the fuller "[C] DISPLAY" -- kept
    // short for the same reason now that GUIDE joined this line too (the
    // fixed hint row has broken before on an over-length string, see
    // centerX()'s own clamping comment).
    // 43rd/44th pass: gaps tightened 3sp->2sp across this whole line to make
    // room for [V] VIZ without breaking 80 cols (centerX() clamps silently
    // on overflow -- see its own comment -- so this was worth getting
    // right). "VIZ" not "SAVER" -- Matthew: calling it a screensaver "breaks
    // immersion a bit"; the feature is the Visualizer.
    const line2 = '[N] SKIP  [UP/DOWN] VOL  [M] MUTE  [P] POWER  [G] GUIDE  [C] MODE  [V] VIZ'
    for (let x = 0; x < term.cols; x++) { term.put(x, HINT_Y1, ' ', NORMAL, 1); term.put(x, HINT_Y2, ' ', NORMAL, 1) }
    term.text(centerX(term.cols, line1), HINT_Y1, line1, BOLD, 1)
    term.text(centerX(term.cols, line2), HINT_Y2, line2, NORMAL, 1)
  },

  // --- bag / playback --------------------------------------------------

  ensureBag(station) {
    if (!this.bags[station.id]) this.bags[station.id] = { order: shuffledIndices(station.tracks.length), pos: 0 }
    return this.bags[station.id]
  },
  nextTrack(station) {
    const bag = this.ensureBag(station)
    if (bag.pos >= bag.order.length) { bag.order = shuffledIndices(station.tracks.length); bag.pos = 0 }
    const track = station.tracks[bag.order[bag.pos]]
    bag.pos += 1
    return track
  },

  initPlayer(s) {
    const self = this
    const create = () => {
      self.player = new YT.Player('ytDock', {
        height: '200',
        width: '260',
        playerVars: { controls: 0, modestbranding: 1, rel: 0, playsinline: 1 },
        events: {
          onReady: () => {
            self.ready = true
            self.applyVolume()
          },
          onStateChange: (e) => {
            // Mid-song join (Matthew, 8/20: "should we start stations mid
            // song?" -- yes). loadTrack(track, {midSong:true}) cues instead
            // of loading, which doesn't autoplay; once CUED fires the
            // duration is finally known, so this is the first point a
            // random start position can be picked at all. Left unseeded on
            // a plain skip() (opts.midSong not set) -- that's a deliberate
            // "give me a different track" action, not "tune in", so it
            // should start at 0 like picking a track normally would.
            if (e.data === YT.PlayerState.CUED && self.pendingMidSongSeek) {
              self.pendingMidSongSeek = false
              const dur = self.player.getDuration()
              // 36th pass: a remembered resumeAt (see tryLock()'s
              // within-cutoff path) seeks to a specific position instead of
              // a random one -- same outro-buffer clamp either way, so a
              // resume can't land seconds from the end any more than a
              // fresh random join can.
              const resumeAt = self.pendingResumeSeek
              self.pendingResumeSeek = null
              if (resumeAt != null && dur && isFinite(dur)) {
                const maxStart = Math.max(0, dur - Math.max(30, dur * 0.15))
                self.player.seekTo(Math.min(resumeAt, maxStart), true)
              } else if (dur && isFinite(dur) && dur > 20) {
                // Leave at least 30s (or the last 15%, whichever is more)
                // of the track remaining, so a join never lands seconds
                // from the end.
                const maxStart = Math.max(0, dur - Math.max(30, dur * 0.15))
                self.player.seekTo(Math.random() * maxStart, true)
              }
              self.player.playVideo()
              return
            }
            if (e.data === YT.PlayerState.ENDED) { self.skip(s); return }
            if (e.data === YT.PlayerState.PLAYING) {
              self.setPlayState(s, 'playing')
              // 2026-08-22 (bug: "nothing plays... I have to mute and
              // unmute" -- see loadTrack()'s comment for the autoplay-block
              // mechanics this works around) -- restore the level the
              // instant real playback actually starts. Unmuting here rather
              // than right after the play call: by the time PLAYING fires
              // it's an already-running video, not a fresh autoplay
              // request, so the browser allows the programmatic unmute.
              if (self._forcedMuteForAutoplay) {
                self._forcedMuteForAutoplay = false
                if (!self.muted) { self.player.unMute(); self.applyVolume() }
              }
            }
            else if (e.data === YT.PlayerState.PAUSED) self.setPlayState(s, 'paused')
            else if (e.data === YT.PlayerState.BUFFERING) self.setPlayState(s, 'buffering')
          },
          // Content-ops safety net (14th pass) -- an embedded video can go
          // private/removed/region-locked after it was verified, and with
          // ~90 hardcoded IDs now public that WILL happen eventually. Rather
          // than silently dying mid-play (dead air with no visible error,
          // since the player itself is docked off-screen), any player error
          // just skips to another track on the same station like a manual
          // [N] would. No retry loop against the same ID, no user-facing
          // error state -- consistent with how ENDED already just skips.
          // 32nd pass: a one-shot chroma/roll glitch flash rides along with
          // the existing dead-video auto-skip -- see flashCrtGlitch().
          onError: () => { if (self.mode === 'locked') { flashCrtGlitch(s); self.skip(s) } },
        },
      })
    }
    // The API may already have fired its ready callback before this runs
    // (font load + module eval takes real time) -- check the flag rather
    // than assuming we got here first.
    if (window.SIGNAL_YT_READY) create()
    else window.SIGNAL_YT_QUEUE.push(create)
  },
  loadTrack(track, opts = {}) {
    if (!this.ready || !this.player) return
    // 2026-08-22 (bug report: "on load after power on, nothing plays...
    // even changing stations doesn't play audio. I have to mute and
    // unmute" -- classic mobile autoplay block. cueVideoById()'s later
    // playVideo() and loadVideoById()'s own implicit autoplay both count as
    // "start playing audio," and mobile browsers only allow that
    // unprompted if either the call is still inside a live user-gesture
    // window, or the video is muted. The gesture window is long closed by
    // the time this runs (a network round trip after the tap/swipe that
    // picked the station), so an unmuted call was getting silently
    // swallowed -- no error, no state change, just permanent BUFFERING.
    // Muting first sidesteps the block entirely; toggling mute/unmute by
    // hand was doing exactly this already, just manually. The PLAYING
    // handler above restores the real level the moment playback actually
    // begins.
    if (!this.muted) { this.player.mute(); this._forcedMuteForAutoplay = true }
    if (opts.midSong) {
      this.pendingMidSongSeek = true
      // 36th pass: opts.resumeAt (seconds) means "seek here instead of a
      // random point" -- set by tryLock()'s within-cutoff resume path. null
      // for a normal fresh lock, which keeps the existing random-join
      // behavior in the CUED handler below.
      this.pendingResumeSeek = opts.resumeAt ?? null
      this.player.cueVideoById(track.youtubeId)
    } else {
      this.pendingMidSongSeek = false
      this.pendingResumeSeek = null
      this.player.loadVideoById(track.youtubeId)
    }
  },
  skip(s) {
    if (this.mode !== 'locked') return
    const track = this.nextTrack(this.lockedStation)
    this.currentTrack = track
    // Same station, just the next track in it -- station identity (its own
    // box now) doesn't need to be touched at all, just the track line.
    // 38th pass: shorter resolve than a lock's, matching the smaller VU
    // pulse a skip already gets below.
    this.showTrack(s, track, { revealMs: 150 })
    if (this.nowPlaying) this.nowPlaying.title = track.title
    // Re-applies volume for the new track's gain -- a skip can land on a
    // track mastered much louder/quieter than the one just playing.
    this.applyVolume()
    this.loadTrack(track)
    // 23rd pass: smaller attack than tryLock's -- a skip is a lesser event
    // than finding a new station.
    this.pulseVU(0.3)
    saveSignalState(this)
  },
  // 25th pass (Matthew: "audio loudness has been a concern as it changes")
  // -- YouTube masters vary hugely in loudness across sources (a 1950s
  // doo-wop recording and a modern loud/compressed synthwave master are
  // nowhere near the same level), so switching stations could mean a real
  // jump in perceived volume even with the slider untouched. This applies
  // an optional multiplier on top of the user's own volume slider:
  // `track.gain` if the current track has one, else `station.gain`, else
  // 1 (no change). Every setVolume() call in the file should go through
  // this rather than calling player.setVolume(this.volume) directly, so
  // gain is never accidentally bypassed on some code path.
  //
  // The station-level gains set below are a first-pass, by-genre/by-era
  // approximation (older and acoustic/orchestral masters run quieter than
  // modern compressed ones -- a well-established mastering convention, not
  // something measured per track here) rather than precisely measured
  // per-track loudness, which nobody's actually done. Treat them as a
  // starting point: bump an individual track's `gain` field if a specific
  // song still stands out once you've heard it.
  applyVolume() {
    if (!this.ready || !this.player) return
    const ch = this.lockedStation
    const gain = (this.currentTrack && this.currentTrack.gain) ?? (ch && ch.gain) ?? 1
    const eff = Math.round(Math.min(100, Math.max(0, this.volume * gain)))
    this.player.setVolume(eff)
  },
  adjustVolume(s, delta) {
    const before = this.volume
    this.volume = Math.min(100, Math.max(0, this.volume + delta))
    if (this.muted) this.muted = false // touching volume un-mutes, like a real set
    if (this.ready && this.player) {
      this.applyVolume()
      if (!this.muted) this.player.unMute()
    }
    this.drawVolume(s)
    // 38th pass: a detent per notch, and the level itself in the status
    // row for a beat. The VOL bar was the only feedback before, and it is
    // in the LEVELS panel at the bottom of the screen -- nowhere near
    // where your eye is while you are tuning.
    if (this.volume !== before) playDetent()
    this.flashStatus(s, `VOL ${this.volume}`)
    saveSignalState(this)
  },
  toggleMute(s) {
    this.muted = !this.muted
    if (this.ready && this.player) {
      if (this.muted) this.player.mute()
      else { this.player.unMute(); this.applyVolume() }
    }
    this.drawVolume(s)
    // 38th pass: mute is a switch, so it gets a relay rather than a beep.
    playRelayThunk(this.muted)
    this.flashStatus(s, this.muted ? 'MUTED' : 'UNMUTED')
    saveSignalState(this)
  },

  // --- tuning ------------------------------------------------------------

  retune(s, f) {
    this.freq = clampFreq(f)
    this.drawFreq(s)
    this.drawDial(s)
    this.drawSignal(s)
    // 21st pass: static bed loudness tracks distance to the nearest
    // station -- no-ops if the noise bed isn't currently running (locked).
    // 41st pass: nearestSignal, not nearestStation -- everything below this
    // line is metering (how loud the hiss is, how degraded the picture is),
    // and the secret station is a real carrier for those purposes even
    // though nothing here can lock onto it.
    const { station: sigStation, dist } = nearestSignal(this.freq)
    setStaticIntensity(dist, sigStation && sigStation.static)
    // 32nd pass: the picture itself degrades the same way the hiss does --
    // see crtDegradeForDist(). dist is 0 exactly at a station's own freq
    // (including right after a lock, since tryLock() calls retune(s,
    // station.freq)), so this naturally settles back to a clean picture on
    // lock without a separate "reset" call.
    setCrtDegradation(s, dist)
    this.applySecretTease(s)
  },

  /** 41st pass (Matthew: "maybe make it also go red a bit?") -- the visual
   *  half of the secret station's tease. nearestSignal() already lets the
   *  meters and the hiss react to a carrier at 777.7 that nearestStation()
   *  refuses to lock; this bleeds the tube's tint toward the same alarming
   *  red that station forces once you are actually on it, in proportion to
   *  how close the dial is. Sweeping past feels like the set is reacting to
   *  something it will not name.
   *
   *  Writes s.crt.phosphor directly rather than going through
   *  setPhosphor(name): that call is name-keyed (so it cannot express an
   *  in-between tint at all) and it clears the persistence buffer on every
   *  change, which is right for a hard channel-change flash and very wrong
   *  for a gradual bleed -- it would strobe black on every tuning step.
   *  Always assigns a NEW array; PHOSPHORS entries are shared config objects
   *  and mutating one in place would corrupt the tint for the whole session. */
  applySecretTease(s) {
    if (!s || !s.crt) return
    // Locked is applyPhosphor()'s business, not this function's.
    if (this.mode === 'locked') return
    const base = PHOSPHORS[DISPLAY_MODES[this.displayModeIndex].key]
    if (!base) return
    const pct = 1 - Math.min(1, Math.abs(SECRET_STATION.freq - this.freq) / NEAR_THRESHOLD)
    if (pct <= 0) {
      // Only restore if this function is what moved it -- otherwise every
      // tuning step anywhere on the band would fight applyPhosphor().
      if (this._teasing) { s.crt.phosphor = base; this._teasing = false }
      return
    }
    const red = PHOSPHORS.red
    // Caps well short of full red: at the threshold edge it should read as a
    // faint warmth you might not consciously notice, and even dead on the
    // frequency it stays a tint rather than the full alarm state that locking
    // the station actually gives you. The reward has to stay bigger than the
    // tease.
    const k = pct * 0.6
    s.crt.phosphor = [
      base[0] + (red[0] - base[0]) * k,
      base[1] + (red[1] - base[1]) * k,
      base[2] + (red[2] - base[2]) * k,
    ]
    this._teasing = true
  },
  enterSeeking(s) {
    this.mode = 'seeking'
    // 41st pass: back to the nominal set the moment we are off a station --
    // station character is a property of being locked onto it, not of having
    // been there. Order matters: this rebuilds crtBase, so the degrade below
    // (via retune/startStaticNoise callers) lands on the right baseline.
    setCrtCharacter(s, null)
    // 2026-08-22: leaving a lock is the other half of applyPhosphor()'s
    // job -- tuning away from the secret NIN station has to drop the forced
    // red tint back to whatever the user's normal display mode is.
    this.applyPhosphor(s)
    this.clearStation(s)
    this.clearTrack(s)
    this.setStatus(s, 'SEEKING', false)
    if (this.ready && this.player) this.player.pauseVideo()
    this.drawDial(s)
    this.setPlayState(s)
    this.drawSignal(s)
    // Continuous static bed while not on a station (12th pass, Matthew
    // 8/20: "when seeking with arrows there should be static between
    // signals") -- reuses the same bed scanning already uses. Idempotent:
    // a no-op if it's already running, so this never restarts/stutters the
    // ramp on repeated calls.
    const sig = nearestSignal(this.freq)
    startStaticNoise(sig.dist, sig.station && sig.station.static)
  },
  seekStep(s, delta) {
    this.stopScan()
    const wasLocked = this.mode === 'locked'
    // 21st pass (Matthew: "scrolling with arrows should be able to cycle to
    // the other side of the tuning band since scan can do it") -- mirror
    // startScan's wraparound instead of clampFreq's dead stop at the edges.
    let f = this.freq + delta
    let wrapped = false
    if (f > FREQ_MAX) { f = FREQ_MIN; wrapped = true }
    else if (f < FREQ_MIN) { f = FREQ_MAX; wrapped = true }
    // 38th pass: which way the dial is moving, for the SEEKING sweep in
    // the status row (see startStatusAnim).
    this._statusSweepDir = delta < 0 ? -1 : 1
    this.retune(s, f)
    // 38th pass: the band edge finally makes a sound -- see playBandBump()
    // for why this fires on the wrap rather than replacing it with a stop.
    if (wrapped) playBandBump()
    // 41st pass: the one-shot seek hiss takes its colour from whatever is
    // nearest, same field the continuous bed uses -- see STATIONS[].static.
    // Offset above the bed's centre so a step still reads as a separate
    // event layered on the bed rather than a momentary swell of it.
    const seekSig = nearestSignal(this.freq).station
    playSeekStatic((seekSig && seekSig.static ? seekSig.static : STATIC_CENTRE_DEFAULT) + 200)
    // Land-on-lock (added 2026-08-20, Matthew: "when you hit one of the
    // stations while seeking with arrows and you land on one, it locks"):
    // if the new position is within lock range of a station, lock onto it
    // immediately instead of requiring a separate Enter press. Skip this
    // when the step started already locked on that same station, so a
    // single arrow tap doesn't just replay the lock you're already on.
    const { station, dist } = nearestStation(this.freq)
    if (dist <= LOCK_THRESHOLD && !(wasLocked && this.lockedStation === station)) {
      this.tryLock(s)
      return
    }
    if (wasLocked) this.enterSeeking(s)
    else this.setStatus(s, 'SEEKING', false)
    // Covers the "already seeking, one more arrow tap" case -- enterSeeking()
    // above only fires on a locked->seeking transition, but the continuous
    // bed needs to be there (or stay there) on every non-locking step, not
    // just the first one. Idempotent, same as above.
    // 41st pass: `dist` here is the LOCKING distance (real stations only --
    // see nearestStation), which is not what the bed should follow: near
    // 777.7 that number is large while the receiver is in fact sitting on a
    // strong carrier. The bed uses the signal distance so the hiss clears
    // over the secret station the same as any other.
    const bedSig = nearestSignal(this.freq)
    startStaticNoise(bedSig.dist, bedSig.station && bedSig.station.static)
  },
  // 2026-08-22: optional `forced` param -- SECRET_STATION is deliberately
  // NOT part of STATIONS (see its own comment for why), so nearestStation()
  // can never find it and the normal seek/scan/Enter lock path correctly
  // never lands on it. presetTune() needs a way to lock onto it directly by
  // reference once its tuning sweep reaches 777.7 -- passing the station
  // through here does that without touching the nearestStation()-driven
  // path every other lock still uses.
  tryLock(s, forced) {
    const { station, dist } = forced ? { station: forced, dist: 0 } : nearestStation(this.freq)
    if (dist > LOCK_THRESHOLD) {
      this.setStatus(s, 'NO SIGNAL', false)
      return
    }
    this.stopScan()
    // Locking is the one transition that actually ends the ambient static
    // bed (stopScan() itself no longer does -- see its comment) -- a signal
    // found means the hiss cuts, same as a real set.
    stopStaticNoise()
    this.retune(s, station.freq)
    // 36th pass: snapshot whatever was actually playing before we move
    // lockedStation off of it -- see RESUME_CUTOFF_MS above. Unconditional
    // on station identity (not just `!== station`) on purpose: re-locking
    // onto the SAME station you're already on (e.g. an arrow-seek that
    // snaps back in place) used to redraw a random new track too, which is
    // the same complaint from a different trigger -- this now resumes it
    // near-instantly instead, since almost no time will have passed.
    if (this.lockedStation && this.currentTrack) {
      let pos = 0
      try { pos = this.player?.getCurrentTime?.() || 0 } catch (e) {}
      this.lastPlayback[this.lockedStation.id] = { track: this.currentTrack, position: pos, at: Date.now() }
    }
    // History (14th pass, Matthew: "discovery/history -- sure") -- push
    // whatever was locked before this one so [B] can step back through
    // recently-played stations. Only real transitions count: landing back
    // on the station you're already on (e.g. an arrow-seek that re-locks
    // in place) doesn't push a duplicate. Capped so it can't grow forever
    // across a long session.
    if (this.lockedStation && this.lockedStation !== station) {
      this.history.push(this.lockedStation)
      if (this.history.length > 8) this.history.shift()
    }
    this.mode = 'locked'
    this.lockedStation = station
    // 41st pass: this station's own picture, before anything below reads the
    // baseline back (the ident bloom pulse, the focus snap, and retune()'s
    // distance degrade all settle to crtBase -- see setCrtCharacter).
    setCrtCharacter(s, station)
    setCrtDegradation(s, 0)
    // 2026-08-22: forces the red tint on for the secret NIN station, and
    // restores the normal preference for everything else -- see
    // applyPhosphor()'s comment.
    this.applyPhosphor(s)
    // Station idents (added 2026-08-20, Matthew: "yes lets try station
    // idents"): each station has its own short tone motif in STATIONS[].ident
    // so locking on COLD WAVE sounds different from locking on QUIET HOURS,
    // instead of every station announcing itself with the same generic chime.
    playIdent(station.ident, station.identTempo || 1, s)
    // 38th pass: the picture pulls into focus on the same beat (see
    // flashFocusSnap) -- with the ident's per-note bloom, the status
    // bracket's inverse flash and the callsign resolving out of noise,
    // lock is now one event across sound, light and text instead of four
    // independent things that happen to land together.
    flashFocusSnap(s)
    // 23rd pass: attack transient on lock, see pulseVU().
    this.pulseVU(0.5)
    this.setStatus(s, 'LOCKED', true)
    this.drawDial(s)
    // 36th pass: resume within the cutoff instead of always drawing fresh.
    const remembered = this.lastPlayback[station.id]
    const resumeGapMs = remembered ? Date.now() - remembered.at : Infinity
    const withinCutoff = remembered && resumeGapMs < RESUME_CUTOFF_MS
    const track = withinCutoff ? remembered.track : this.nextTrack(station)
    this.currentTrack = track
    this.showStation(s, station)
    this.showTrack(s, track)
    this.tuneToStation(s, station, track)
    // Re-applies volume for the new station/track's gain (see
    // applyVolume()) -- a station switch is exactly the moment a loudness
    // jump would otherwise show up.
    this.applyVolume()
    if (withinCutoff) {
      // Resume: seek to roughly where the "broadcast" would be now (the
      // position it was at when you left, advanced by however long you
      // were gone), clamped the same way the random mid-song join is --
      // see the CUED handler in initPlayer().
      this.loadTrack(track, { midSong: true, resumeAt: remembered.position + resumeGapMs / 1000 })
    } else {
      // Mid-song join: cues rather than loads, so actual playback (and the
      // PLAYING state) doesn't start until the onStateChange handler above
      // has picked a random point in the track and seeked to it.
      this.loadTrack(track, { midSong: true })
    }
    this.setPlayState(s, 'buffering')
    saveSignalState(this)
  },
  // [B] back (14th pass) -- pops the most recently locked station off
  // history and tunes to it via the same sweep presetTune() already gives
  // number-key presets, so stepping back reads/sounds the same as jumping
  // to any other preset rather than a silent instant cut.
  goBack(s) {
    if (!this.history.length) return
    const station = this.history.pop()
    this.presetTune(s, station)
  },

  // [G] guide (15th pass, Matthew: "we also need a G for guide... a simple
  // guide on how things work, a blurb about what the app is and that it is
  // made by me, Hyphen8d, inspired by my music tastes but made for the
  // community"). Full-screen takeover, same clearAll-and-redraw approach
  // the power sequences already use. Any keypress closes it (see key()) --
  // there's no separate "close" key to remember, same idea as the STANDBY
  // screen only listening for P.
  openGuide(s) {
    if (this.guideOpen) return
    this.guideOpen = true
    this.guidePage = 1
    playPanelSound(true)
    // 38th pass: the status row's sweep and any in-flight text resolve are
    // both timer-driven and would keep painting into rows the guide is
    // now using underneath it -- same class of bug as the scan timer this
    // method has always stopped, and as the 29th pass's drawPlayback leak.
    this._clearStatusTimers()
    this._cancelAllResolves()
    // A scan/preset-sweep timer left running would keep punching fresh
    // dial/freq redraws into rows the guide is now using underneath it, so
    // it gets stopped outright rather than just visually covered.
    this.stopScan()
    stopStaticNoise()
    this.drawGuidePage(s)
  },
  // 18th pass (Matthew: "add a station reference to the guide") -- the
  // about/credit/contact/controls screen was already using ~18 of 25 rows,
  // and a full 9-station table needs about 10 more, so the guide became 2
  // pages rather than cramming both onto one.
  // 32nd pass (Matthew: "a better stations page -- number, name, a longer
  // description, and 5 sample tracks instead of a 3-artist 'like' line"):
  // that much detail per station doesn't fit in a shared table row, so the
  // station reference became its own page PER station rather than one
  // packed table. Page 1 is About, page 2 is a quick-scan Index (one line
  // per station, same spirit as the old table but without the "like" line
  // that no longer has anywhere to live), and pages 3 through 11 are one
  // detail page per station in STATION_PRESET_ORDER (dial/freq order, same
  // as the [1-9] presets). ArrowLeft/ArrowRight walk sequentially through
  // all of it; from the Index, a digit key jumps straight to that
  // station's detail page instead of arrowing past the ones you don't
  // care about (see key()). Any other key still closes the guide exactly
  // like before.
  guideTotalPages() { return 2 + STATION_PRESET_ORDER.length },
  drawGuidePage(s) {
    const { term } = s
    for (let y = 0; y < term.rows; y++)
      for (let x = 0; x < term.cols; x++) term.put(x, y, ' ', NORMAL, 0)
    if (this.guidePage === 1) this.drawGuidePageAbout(s)
    else if (this.guidePage === 2) this.drawGuidePageIndex(s)
    else this.drawGuidePageStation(s, this.guidePage - 3)
  },
  drawGuidePageAbout(s) {
    const { term } = s
    const put = (y, text, attr) => term.text(centerX(term.cols, text), y, text, attr)
    put(1, 'SIGNAL -- GUIDE', BOLD)
    put(3, 'A tuning-dial internet radio, rendered entirely as text.', NORMAL)
    put(4, 'Power it on, spin the dial, lock onto a station, and let it play.', NORMAL)
    put(6, 'Made by Hyphen8d -- inspired by my own music taste,', MUTED)
    put(7, 'built for anyone who wants a weird little radio to leave on.', MUTED)
    put(9, 'Got an idea, a station request, or found something broken?', NORMAL)
    put(10, 'Reach out -- matt@gial.co', BRIGHT)
    put(12, 'CONTROLS', BOLD)
    // 29th pass: reflowed after PLAY/PAUSE was removed (see key()) --
    // rows 14-16 are tuning/receiver controls, row 17 is the "not a real
    // radio" trio (skip, guide, display mode), matching the same grouping
    // now used in the on-screen hint bar (drawHint()).
    put(14, '[<-/->] SEEK        [ENTER] LOCK        [S] SCAN', DIM)
    put(15, '[1-9] PRESETS       [B] BACK            [UP/DOWN] VOL', DIM)
    put(16, '[M] MUTE            [P] POWER', DIM)
    put(17, '[N] SKIP            [G] GUIDE           [C] DISPLAY MODE', DIM)
    // 20th pass (Matthew: "for people that don't have youtube premium..
    // they hear ads. options?") -- decided against anything that tries to
    // detect/suppress the ad itself (that's ad-blocking circumvention
    // against YouTube's ToS, not something to build around even here) or a
    // bigger re-sourcing effort. This is the cheap, honest middle ground:
    // just tell people up front so an ad reads as expected rather than as
    // SIGNAL being broken.
    put(19, "Playback is real YouTube video -- ads may play without Premium", FAINT)
    // 28th pass: was hardcoded 'SIGNAL v0.5' -- a second, separate version
    // string that had drifted out of sync with the title bar (which was
    // last bumped at some earlier pass without this one following). Now
    // driven off the same VERSION_TAG the title bar uses, so the two can't
    // drift apart again.
    put(20, `SIGNAL ${VERSION_TAG}`, FAINT)
    put(22, '[->] STATIONS        [any other key] CLOSE', FAINT)
  },
  // Quick-scan station index (32nd pass, replaces the old combined
  // header+like table) -- one line per station: preset number (zero-padded
  // to match the detail pages), freq, callsign, tagline. Deliberately
  // leaner than before since the "like" detail now lives on each
  // station's own full page; this is just for scanning/jumping. Ordered by
  // STATION_PRESET_ORDER (freq ascending, same order as the dial
  // left-to-right and the [1-9] preset keys), so the number shown here
  // always matches what actually tunes to that station, and matches the
  // digit-jump handled in key().
  drawGuidePageIndex(s) {
    const { term } = s
    const put = (y, text, attr) => term.text(centerX(term.cols, text), y, text, attr)
    put(1, 'SIGNAL -- STATIONS', BOLD)
    const startY = 3
    STATION_PRESET_ORDER.forEach((ch, i) => {
      const presetNum = String(i + 1).padStart(2, '0')
      const y = startY + i * 2
      // 41st pass: the dial marker leads the line, so the index doubles as
      // the legend for the band -- you can read off which shape to hunt for.
      const line = truncate(`[${presetNum}] ${ch.glyph || ' '}  ${ch.freq.toFixed(1)}   ${ch.callsign} -- ${ch.tagline}`, term.cols - 8)
      term.text(4, y, line, BRIGHT)
    })
    put(22, '[<-] ABOUT   [1-9] JUMP   [->] NEXT   [any other key] CLOSE', FAINT)
  },
  // Per-station detail page (32nd pass, Matthew: "let people know the
  // station number, name, a longer description, and 5 sample tracks
  // instead of a 3-artist 'like' line"). One full page per station rather
  // than a shared table row, so there's actually room for prose and a real
  // tracklist sample. `desc` is free-form (see each station's definition
  // above) and gets word-wrapped rather than truncate()'d, since cutting a
  // sentence off mid-word with "..." would read badly here in a way it
  // doesn't for a single status line. Sample tracks are the first 6
  // entries in the station's own `tracks` array with no repeated artist
  // (see sampleTracks()) -- deliberately not a separately hand-curated
  // "highlights" list, so this can never drift from what's actually in
  // rotation the way the old `like` field could.
  drawGuidePageStation(s, i) {
    const { term } = s
    const ch = STATION_PRESET_ORDER[i]
    const presetNum = String(i + 1).padStart(2, '0')
    const put = (y, text, attr) => term.text(centerX(term.cols, text), y, text, attr)
    put(1, `SIGNAL -- STATIONS   [${presetNum}/${String(STATION_PRESET_ORDER.length).padStart(2, '0')}]`, BOLD)
    const contentWidth = term.cols - 8
    // 41st pass: flanks the callsign the same way the STATION box does once
    // you are locked on. Deliberately NOT also led by the glyph the way the
    // index page's rows are -- the index needs it out front because it is a
    // legend you scan down a column of; here it would just print the same
    // mark three times on one line.
    const mark = ch.glyph || '●'
    term.text(4, 3, `[${presetNum}] ${ch.freq.toFixed(1)}   ${mark} ${ch.callsign} ${mark}`, BRIGHT)
    term.text(4, 4, truncate(ch.tagline, contentWidth), MUTED)
    term.text(4, 6, '-'.repeat(Math.min(72, contentWidth)), FAINT)
    wordWrap(ch.desc, contentWidth).slice(0, 3).forEach((line, li) => term.text(4, 8 + li, line, NORMAL))
    term.text(4, 12, 'SAMPLE TRACKS', BOLD)
    sampleTracks(ch.tracks, 6).forEach((t, ti) => {
      const line = truncate(`${t.title} -- ${t.artist}`, term.cols - 12)
      term.text(8, 14 + ti, line, MUTED)
    })
    put(22, '[<-] PREV        [->] NEXT        [any other key] CLOSE', FAINT)
  },
  closeGuide(s) {
    this.guideOpen = false
    playPanelSound(false)
    // BUG FIXED (15th pass): the guide screen writes into a couple of rows
    // (the "SIGNAL -- GUIDE" header at row 1, in particular) that nothing
    // below ever redraws -- drawChrome only touches row 0, the box frames
    // start at row 3. Without an explicit clear first, that header was
    // left behind permanently after closing, printed right over the
    // status line. Same clearAll() the power sequences already use.
    const { term } = s
    for (let y = 0; y < term.rows; y++)
      for (let x = 0; x < term.cols; x++) term.put(x, y, ' ', NORMAL, 0)
    // Rebuild -- chrome, frames, meters, then resume whatever the actual
    // mode/status was before the guide opened (guide never touched
    // freq/lockedStation/playState, only covered them visually).
    this.drawChrome(s)
    this.drawScale(s)
    this.drawVolume(s)
    this.drawSignal(s)
    this.drawVU(s)
    this.drawAntenna(s, 0)
    this.drawDial(s)
    this.drawFreq(s)
    this.drawHint(s)
    if (this.mode === 'locked' && this.lockedStation) {
      this.showStation(s, this.lockedStation)
      if (this.currentTrack) this.showTrack(s, this.currentTrack)
      this.setStatus(s, 'LOCKED', true)
    } else {
      this.clearStation(s)
      this.clearTrack(s)
      this.setStatus(s, 'SEEKING', false)
    }
    this.setPlayState(s, this.playState)
  },

  stopScan() {
    this.scanning = false
    if (this.scanTimer) { clearInterval(this.scanTimer); this.scanTimer = null }
    // No longer stops the static bed here (12th pass) -- stopping a scan
    // (sweep finished, or 'S' pressed to cancel it) doesn't mean a station
    // was found, so the hiss should keep going into plain seeking rather
    // than cutting out. Only an actual lock (tryLock) or power-down now
    // stops it explicitly.
  },
  startScan(s) {
    // BUG FIXED 2026-08-20: SCAN_STEP (6) and LOCK_THRESHOLD (6) are the
    // same size, so a scan started from an already-locked station would
    // step exactly LOCK_THRESHOLD away on its very first tick and re-lock
    // the SAME station immediately -- scan looked completely broken because
    // it could never actually leave the station you were already on.
    // Fixed by ignoring lock candidates until the sweep has cleared a
    // buffer around wherever it started.
    const startFreq = this.freq
    const clearance = LOCK_THRESHOLD + SCAN_STEP
    if (this.mode === 'locked') this.enterSeeking(s)
    this.scanning = true
    this.setStatus(s, 'SCANNING...', false)
    const sig = nearestSignal(this.freq)
    startStaticNoise(sig.dist, sig.station && sig.station.static)
    this.scanTimer = setInterval(() => {
      let f = this.freq + SCAN_STEP
      if (f > FREQ_MAX) f = FREQ_MIN
      this.retune(s, f)
      if (Math.abs(f - startFreq) < clearance) return
      const { dist } = nearestStation(f)
      if (dist <= LOCK_THRESHOLD) this.tryLock(s)
    }, 90)
  },

  // Added 2026-08-20 -- presets used to jump straight to the target
  // frequency and lock instantly, which read as a hard cut rather than a
  // tuning action (Matthew: a brief scan/static beat instead of an instant
  // change). Sweeps the dial from wherever it is to the preset's frequency
  // over a handful of quick steps with the static bed under it, then locks.
  presetTune(s, station) {
    this.stopScan()
    if (this.mode === 'locked') this.enterSeeking(s)
    const startFreq = this.freq
    const target = station.freq
    const steps = 6
    let i = 0
    this.scanning = true
    // 38th pass: the preset number in the readout. Pressing a digit had no
    // acknowledgement on screen at all beyond the dial starting to move.
    // Falls back to the bare word for anything tuned by reference rather
    // than by preset -- [B] back, and the secret station (deliberately not
    // in STATION_PRESET_ORDER, so indexOf correctly returns -1 for it).
    const presetNum = STATION_PRESET_ORDER.indexOf(station) + 1
    this.setStatus(s, presetNum > 0 ? `TUNING ${presetNum}` : 'TUNING...', false)
    // Tune-in whoosh (14th pass, Matthew: "a fun 'tune-in' whoosh when
    // jumping straight to a preset (1-9)") -- plays once, under the sweep,
    // distinct from both the plain seek-static hiss and the ident tone
    // that plays once the sweep lands and locks a few hundred ms later.
    playPresetWhoosh()
    const sig = nearestSignal(this.freq)
    startStaticNoise(sig.dist, sig.station && sig.station.static)
    this.scanTimer = setInterval(() => {
      i += 1
      const f = i >= steps ? target : startFreq + (target - startFreq) * (i / steps)
      this.retune(s, f)
      if (i >= steps) {
        this.scanning = false
        clearInterval(this.scanTimer)
        this.scanTimer = null
        stopStaticNoise()
        // 2026-08-22: pass `station` through explicitly -- see tryLock()'s
        // `forced` param comment. Needed for SECRET_STATION (not in
        // STATIONS, so nearestStation() alone would never find it at
        // 777.7), and harmless for every normal preset too.
        this.tryLock(s, station)
      }
    }, 55)
  },

  // Mouse-drag-to-seek (drag distance -> frequency delta) was removed here
  // in the 44th pass (Matthew: "remove the mouse ability to scan from the
  // app" -- alongside dropping mouse input as a visualizer-wake source, see
  // key()'s comment, so a mouse can sit idle on top of a running SIGNAL tab
  // without either scanning the dial by accident or knocking the visualizer
  // down). Touch keeps its own separate tap/swipe gesture layer just below
  // -- that was never mouse input and still needs a way in on a device with
  // no keyboard at all.

  // 22nd pass -- mobile has no keyboard, so it had no way to power on, lock
  // a station, or change stations at all before this. Tap (minimal
  // movement, quick) powers on when off, closes the guide if somehow open,
  // otherwise toggles play/pause; a clean horizontal swipe steps to the
  // next/previous station in dial order (same list [1-9] presets use).
  // Deliberately its own gesture layer rather than reusing the mouse-drag
  // seek math above -- a thumb swipe covering the whole screen width isn't
  // the same gesture as a precise mouse drag on the dial.
  // 45th pass -- added a clean vertical swipe to skip the track, giving
  // mobile the same three controls the desktop keyboard has (power, mute,
  // station, track) without adding any on-screen UI. Horizontal/vertical
  // are treated as exclusive per-gesture (whichever axis moved more wins),
  // so a swipe can't accidentally trigger both a station change and a skip.
  onTouchStart(s, e) {
    if (this.poweredOn) this._lastInputAt = Date.now()
    if (this.visualizerActive) { this.exitVisualizer(s); e.preventDefault(); return }
    if (e.target && e.target.closest && e.target.closest('#ytDock')) return
    // 45th pass -- two-finger tap cycles display mode/tint, the touch
    // equivalent of desktop's [C]. Its own tracked gesture rather than
    // folded into the single-finger tap/swipe state below -- a second
    // finger landing mid-swipe cancels whatever single-finger gesture was
    // in flight rather than being read as part of it.
    if (e.touches.length === 2) {
      this._touchActive = false
      this._twoFingerActive = true
      this._twoFingerStartTime = Date.now()
      e.preventDefault()
      return
    }
    if (e.touches.length !== 1) { this._touchActive = false; this._twoFingerActive = false; return } // ignore 3+ fingers
    this._touchActive = true
    const t = e.touches[0]
    this._touchStartX = t.clientX
    this._touchStartY = t.clientY
    this._touchStartTime = Date.now()
    e.preventDefault()
  },
  onTouchEnd(s, e) {
    if (this._twoFingerActive) {
      // BUG FIXED (live on Matthew's phone -- "color change seems iffy"):
      // real fingers never lift in perfect sync, so touchend fires once per
      // finger, not once for the pair. This used to clear _twoFingerActive
      // on the FIRST of those two events (when e.touches.length was still
      // 1, one finger still down), so by the time the second finger's
      // touchend actually arrived with e.touches.length === 0, the flag was
      // already false and the whole branch was skipped -- the gesture could
      // only ever fire on the rare tick where both releases coalesced into
      // one event. Now it only resolves (and only THEN clears the flag)
      // once every finger is confirmed up.
      if (e.touches.length > 0) return
      this._twoFingerActive = false
      if (Date.now() - this._twoFingerStartTime < 500 && this.poweredOn && !this.guideOpen) {
        this.cycleDisplayMode(s)
      }
      return
    }
    if (!this._touchActive) return
    this._touchActive = false
    const t = e.changedTouches[0]
    if (!t) return
    const dx = t.clientX - this._touchStartX
    const dy = t.clientY - this._touchStartY
    const dt = Date.now() - this._touchStartTime
    const TAP_SLOP = 12
    const SWIPE_MIN = 40
    if (Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP && dt < 500) {
      if (!this.poweredOn) { this.powerUp(s); return }
      if (this.guideOpen) { this.closeGuide(s); return }
      // 29th pass: tap used to toggle play/pause, but SIGNAL dropped
      // play/pause entirely (a live broadcast can't be paused, only
      // muted/turned off -- see key() comment on the SPACE removal). Tap
      // now does the radio-authentic equivalent: mute toggle.
      this.toggleMute(s)
      return
    }
    if (!this.poweredOn || this.guideOpen) return
    if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy)) {
      // 45th pass -- flipped (Matthew, live on his phone: "station swipe
      // still seems mirrored"). Now matches the dial itself, which reads
      // left-to-right as low-to-high frequency in the TUNING BAND box:
      // swipe right (finger moves left-to-right, dx positive) tunes up to
      // the next station, swipe left tunes down to the previous one. The
      // old mapping treated it like a carousel (left = forward) instead.
      this.stepStation(s, dx > 0 ? 1 : -1)
    } else if (Math.abs(dy) > SWIPE_MIN && Math.abs(dy) > Math.abs(dx)) {
      // 45th pass -- vertical swipe skips the track, same mechanism as the
      // [N] key. skip() is a no-op unless mode === 'locked', so this is
      // already safe while still tuning -- matches the horizontal-swipe
      // guard above rather than needing its own. Track selection comes out
      // of a shuffle bag, not a fixed sequence, so there's no meaningful
      // "previous" to give the down-swipe -- both directions just skip.
      this.skip(s)
    }
  },
  stepStation(s, dir) {
    const order = STATION_PRESET_ORDER
    let idx = this.lockedStation ? order.indexOf(this.lockedStation) : -1
    if (idx === -1) idx = order.indexOf(nearestStation(this.freq).station)
    if (idx === -1) idx = 0
    const next = order[(idx + dir + order.length) % order.length]
    this.presetTune(s, next)
  },

  // Visualizer (43rd pass). Full-screen takeover of rows 1-22 -- same
  // clearAll-and-redraw approach as the Guide and the power sequences --
  // with row 0 (drawTitleBar) and the HINT_Y1/Y2 footer repurposed for
  // live station/track info rather than duplicated. Only ever entered while
  // locked and playing (see the idle check in frame() and the [V] case in
  // key()), so there's always a station to show on the way in.
  enterVisualizer(s) {
    if (this.visualizerActive) return
    this.visualizerActive = true
    this._vizEnterAt = Date.now()
    this._vizLastInfoDraw = 0
    const { term } = s
    for (let y = 0; y < term.rows; y++)
      for (let x = 0; x < term.cols; x++) term.put(x, y, ' ', NORMAL, 0)
    this.drawTitleBar(s)
    this.drawVisualizerInfo(s)
    playPanelSound(true)
  },
  exitVisualizer(s) {
    if (!this.visualizerActive) return
    this.visualizerActive = false
    this._lastInputAt = Date.now()
    playPanelSound(false)
    // Same rebuild closeGuide() uses: full clear, then chrome/frames/meters,
    // then whatever the actual lock/status state was underneath (the
    // visualizer never touched freq/lockedStation/playState, only covered
    // them visually).
    const { term } = s
    for (let y = 0; y < term.rows; y++)
      for (let x = 0; x < term.cols; x++) term.put(x, y, ' ', NORMAL, 0)
    this.drawChrome(s)
    this.drawScale(s)
    this.drawVolume(s)
    this.drawSignal(s)
    this.drawVU(s)
    this.drawAntenna(s, 0)
    this.drawDial(s)
    this.drawFreq(s)
    this.drawHint(s)
    if (this.mode === 'locked' && this.lockedStation) {
      this.showStation(s, this.lockedStation)
      if (this.currentTrack) this.showTrack(s, this.currentTrack)
      this.setStatus(s, 'LOCKED', true)
    } else {
      this.clearStation(s)
      this.clearTrack(s)
      this.setStatus(s, 'SEEKING', false)
    }
    this.setPlayState(s, this.playState)
  },
  // HINT_Y1/Y2 repurposed as a live station/track readout while the
  // visualizer is up, instead of the control legend that normally lives
  // there -- same inverse two-line treatment, so it still reads as "system
  // chrome" rather than new content bolted onto the effect canvas.
  drawVisualizerInfo(s) {
    const { term } = s
    const station = this.lockedStation
    for (let x = 0; x < term.cols; x++) { term.put(x, HINT_Y1, ' ', NORMAL, 1); term.put(x, HINT_Y2, ' ', NORMAL, 1) }
    if (!station) return
    // 44th pass, Matthew: glyph flanks both sides, matching showStation()'s
    // "GLYPH NAME GLYPH" treatment in the STATION box rather than a single
    // leading marker.
    const flair = station.glyph || '●'
    const line1 = ` ${flair} ${station.callsign} ${flair} · ${station.freq.toFixed(1)} KHZ`
    const exitHint = '[ANY KEY] EXIT '
    term.text(0, HINT_Y1, line1, BOLD, 1)
    term.text(Math.max(line1.length + 2, term.cols - exitHint.length), HINT_Y1, exitHint, NORMAL, 1)

    const track = this.currentTrack
    let line2 = track ? ` ${track.title}  --  ${track.artist}` : ''
    let timePart = ''
    if (this.ready && this.player) {
      let cur, dur
      try { cur = this.player.getCurrentTime(); dur = this.player.getDuration() } catch (e) {}
      if (dur && isFinite(dur) && dur > 0) {
        const fmt = (sec) => { sec = Math.max(0, Math.floor(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` }
        timePart = `${fmt(cur)} / ${fmt(dur)} `
      }
    }
    const maxLine2 = term.cols - timePart.length - 1
    if (line2.length > maxLine2) line2 = truncate(line2, maxLine2)
    term.text(0, HINT_Y2, line2, NORMAL, 1)
    if (timePart) term.text(term.cols - timePart.length, HINT_Y2, timePart, NORMAL, 1)
  },
  // DRIFT effect -- rows 1-22 (between the title bar and the info footer).
  // Four overlapping sine terms (a horizontal drift, a vertical drift, a
  // diagonal drift, and a slow ripple out from a fixed center) rather than
  // one -- a single sine field reads as stripes; layering a few at different
  // angles and speeds is what makes it read as weather instead of wallpaper.
  drawDriftEffect(s, t) {
    const { term } = s
    const cx = term.cols / 2
    const cy = 11.5
    for (let y = 1; y < HINT_Y1; y++) {
      for (let x = 0; x < term.cols; x++) {
        let v = Math.sin(x * 0.16 + t * 0.7)
        v += Math.sin(y * 0.32 - t * 0.5)
        v += Math.sin((x + y) * 0.11 + t * 0.35)
        const dx = x - cx, dy = (y - cy) * 2.1
        v += Math.sin(Math.sqrt(dx * dx + dy * dy) * 0.28 - t * 0.9)
        v = (v + 4) / 8 // normalize the 4-term sum (range -4..4) to ~0..1
        if (v < 0.08) { term.put(x, y, ' '); continue }
        const idx = Math.min(DRIFT_RAMP.length - 1, Math.floor(v * DRIFT_RAMP.length))
        const ch = DRIFT_RAMP[idx]
        term.put(x, y, ch, visualizerLevelAttr(v))
      }
    }
  },
  // FLAME effect (46th pass) -- for DISTORTION FIELD, replacing HOWL
  // outright (which had itself replaced FEEDBACK -- see the field notes
  // above VISUAL_METHODS). Live QA: "fire 'flame' living thing." Classic
  // bottom-up fire propagation: the floor row is reseeded hot (with
  // occasional dark gaps for flicker) every frame, and every row above
  // pulls its heat from a randomly-offset cell one row below, cooling by a
  // random amount as it rises -- the sideways randomness is what makes it
  // drift and lick rather than rise in straight columns, and the random
  // cooling is what gives it a natural tapering silhouette (dense near the
  // floor, sparse embers near the top) with zero fixed cycle -- no two
  // frames are ever the same, unlike anything else on the roster.
  drawFlameEffect(s, t) {
    const { term } = s
    const cols = term.cols
    const floorY = HINT_Y1 - 1
    const heat = this._fireHeat
    // 47th pass: live QA said "too fast, make more organic." At 60fps the
    // whole buffer recomputed fresh every render frame read as a flicker
    // rather than a living flame. Two fixes: step the physics on its own
    // slower clock independent of render rate, and ease the floor's reseed
    // toward its new target instead of snapping to it -- together that
    // turns the jitter into a slow, licking billow.
    // 48th pass: a follow-up "slow down a bit more" also dropped the
    // per-row cooling range (0.02-0.045 -> 0.015-0.035), which was a real
    // bug, not just a tuning choice -- with cooling that low, heat barely
    // decayed over the ~21-row climb from floor to top, so the whole
    // column stayed lit almost every frame instead of tapering. That's
    // what read as "hung" on dev: not frozen, just permanently
    // full-screen and never resolving into a flame shape. Cooling is
    // restored to the 47th-pass range here; only the step clock (now
    // 0.13, slower than 47th pass's 0.07) carries the further slowdown.
    if (t - this._fireLastStep >= 0.13) {
      this._fireLastStep = t
      for (let x = 0; x < cols; x++) {
        const target = Math.random() < 0.12 ? Math.random() * 0.3 : 0.75 + Math.random() * 0.25
        const prev = heat[floorY * cols + x]
        heat[floorY * cols + x] = prev * 0.6 + target * 0.4
      }
      for (let y = floorY - 1; y >= 1; y--) {
        for (let x = 0; x < cols; x++) {
          const drift = Math.floor(Math.random() * 3) - 1
          const srcX = Math.max(0, Math.min(cols - 1, x + drift))
          const below = heat[(y + 1) * cols + srcX]
          const cooling = 0.02 + Math.random() * 0.045
          heat[y * cols + x] = Math.max(0, below - cooling)
        }
      }
    }
    for (let y = 1; y <= floorY; y++) {
      for (let x = 0; x < cols; x++) {
        const v = heat[y * cols + x]
        if (v < 0.06) { term.put(x, y, ' '); continue }
        const idx = Math.min(DRIFT_RAMP.length - 1, Math.floor(v * DRIFT_RAMP.length))
        term.put(x, y, DRIFT_RAMP[idx], visualizerLevelAttr(v))
      }
    }
  },
  // BREACH effect (44th pass) -- for CIPHER. Vertical hex-noise columns
  // scrolling down through the real beam-intensity tiers (bright head,
  // fading tail), CIPHER's own glyph seeded into the noise. What keeps this
  // from being a stock Matrix rain: a short span in a column occasionally
  // RESOLVES -- holds a legible fragment for a beat, then dissolves back to
  // noise -- the same settle-out-of-scrambled-glyphs idea resolveText()
  // already uses for callsigns and track titles, borrowed back for the
  // canvas. Columns run at irregular, independent speeds (CIPHER's own
  // field notes: "meters twitch") rather than one uniform waterfall.
  drawBreachEffect(s, t) {
    const { term } = s
    for (let x = 0; x < term.cols; x++) {
      const col = this._breachCols[x]
      if (t > col.resolveAt && !col.word) {
        col.word = BREACH_WORDS[Math.floor(Math.random() * BREACH_WORDS.length)]
        col.wordRow = 2 + Math.floor(Math.random() * 18)
        col.wordUntil = t + 0.5 + Math.random() * 0.4
        col.resolveAt = t + 3 + Math.random() * 6
      }
      if (col.word && t > col.wordUntil) col.word = null
      const headY = ((t * col.speed + col.phase) % 30) - 4
      for (let y = 1; y < HINT_Y1; y++) {
        const dist = headY - y
        if (dist < 0 || dist > 14) { term.put(x, y, ' '); continue }
        const alpha = Math.max(0, 1 - dist / 14)
        const ch = BREACH_HEX[Math.floor((x * 7 + y * 3 + t * 20) % BREACH_HEX.length)]
        term.put(x, y, ch, visualizerLevelAttr(alpha))
      }
      if (col.word) {
        for (let wi = 0; wi < col.word.length; wi++) {
          const wx = x + wi
          if (wx < term.cols) term.put(wx, col.wordRow, col.word[wi], BRIGHT)
        }
      }
    }
  },
  // OUTRUN effect (44th pass, fidelity pass in the 45th) -- for CIRCUIT
  // CRUSH, which already carries the heaviest bloom on the roster and a
  // tagline that names the shot directly ("the long drive home"). The
  // genre's own signature image: a perspective grid receding to a
  // vanishing point, rungs sliding toward the viewer, a horizon-sliced
  // sun. Slowest, most hypnotic motion of the roster on purpose -- the
  // tagline is about a drive that never quite ends, not a rush.
  //
  // The 44th-pass concept was right but flat: the sun was one uniform
  // character everywhere it was lit, and the grid rungs/rails were a
  // strict on/off with no gradient -- read as a stencil, not a glow. This
  // pass keeps the exact same skeleton and only adds depth: the sun shades
  // radially through the beam tiers instead of one flat '▓', its slice-
  // gaps widen toward the bottom the way the genre's own sunset actually
  // renders, the horizon gets a dim glow row bleeding above the bright
  // line instead of a hard cut, the grid's rungs and rails brighten/
  // thicken with proximity to the viewer instead of one uniform gray, and
  // a scatter of near-static stars (this._outrunStars, seeded in init())
  // fills what was dead space above the horizon.
  drawOutrunEffect(s, t) {
    const { term } = s
    const cx = term.cols / 2
    const horizonY = 8
    // 46th pass: sun radius 6.5 -> 7.5 (live QA: "closer... but I think
    // need less unused space, make elements larger").
    const sunR = 7.5
    // Sky: sparse near-static stars above the sun.
    for (let y = 1; y < horizonY - 1; y++) for (let x = 0; x < term.cols; x++) term.put(x, y, ' ')
    for (const star of this._outrunStars) {
      if (star.y >= horizonY - 1) continue
      const tw = 0.15 + 0.12 * Math.sin(t * star.speed + star.phase)
      term.put(Math.round(star.x), Math.round(star.y), '.', visualizerLevelAttr(Math.max(0.05, tw)))
    }
    // Birds (48th pass) -- gliding silhouettes crossing the sky on either
    // side of the sun, filling what was otherwise dead space up there.
    for (const bird of this._outrunBirds) {
      const bx = ((bird.x + t * bird.speed) % term.cols + term.cols) % term.cols
      const by = Math.round(bird.y + Math.sin(t * 0.6 + bird.bobPhase) * 0.6)
      if (by < 1 || by >= horizonY - 1) continue
      const flap = Math.sin(t * 6 + bird.flapPhase) > 0
      term.put(Math.round(bx), by, flap ? '^' : 'v', MUTED)
    }
    // Sun: radial shading (dense core -> thin rim), slice-gaps widening
    // toward the bottom.
    const pulse = 0.75 + 0.25 * Math.sin(t * 0.5)
    for (let y = Math.ceil(horizonY - sunR); y < horizonY; y++) {
      const dy = horizonY - y
      if (dy > sunR) { for (let x = 0; x < term.cols; x++) term.put(x, y, ' '); continue }
      const halfW = Math.sqrt(Math.max(0, sunR * sunR - dy * dy))
      const fromBottom = sunR - dy
      const gapPeriod = 2 + Math.floor(fromBottom / 1.6)
      const sliceBand = fromBottom < sunR * 0.65 && Math.floor(fromBottom) % gapPeriod === 0
      const lo = Math.round(cx - halfW), hi = Math.round(cx + halfW)
      for (let x = 0; x < term.cols; x++) {
        if (sliceBand || x < lo || x > hi) { term.put(x, y, ' '); continue }
        const edgeFrac = halfW > 0 ? Math.abs(x - cx) / halfW : 0
        const shade = Math.min(1, (1 - edgeFrac * 0.65) * pulse)
        const ch = shade > 0.78 ? '█' : shade > 0.55 ? '▓' : shade > 0.32 ? '▒' : '░'
        term.put(x, y, ch, visualizerLevelAttr(shade))
      }
    }
    // Horizon: two dim glow rows bleeding above a bright line -- 46th
    // pass, thickened for the same "make elements larger" note.
    for (let x = 0; x < term.cols; x++) {
      term.put(x, horizonY - 2, '‾', FAINT)
      term.put(x, horizonY - 1, '‾', DIM)
      term.put(x, horizonY, '=', BRIGHT)
    }
    // Grid: rungs/rails brighten and thicken with proximity to the viewer.
    // Coefficient tuned twice now for "too much white space" -- 0.09
    // originally, 0.2 in the 45th pass, 0.28 here in the 46th so the grid
    // reaches full width well before the bottom row instead of just
    // grazing it, leaving more of the lower screen genuinely filled.
    for (let y = horizonY + 1; y < HINT_Y1; y++) {
      const depth = y - horizonY
      const spread = Math.min(cx - 1, depth * depth * 0.28)
      const lo = Math.round(cx - spread), hi = Math.round(cx + spread)
      const proximity = Math.min(1, depth / 14)
      const rails = new Map()
      for (let r = -3; r <= 3; r++) {
        const railX = Math.round(cx + r * depth * 1.7)
        if (railX >= 0 && railX < term.cols) rails.set(railX, r === 0 ? '|' : (r < 0 ? '\\' : '/'))
      }
      const railAttr = visualizerLevelAttr(Math.max(0.2, 0.35 + proximity * 0.35))
      const rungPos = (depth + t * 0.6 * 8) % 6
      const showRung = rungPos < 1
      const rungAttr = visualizerLevelAttr(Math.max(0.15, 0.5 + proximity * 0.5))
      const rungCh = proximity > 0.6 ? '=' : '-'
      // Roadside terrain -- 47th pass, live QA: "build out the land/grass
      // on either side of the road ... less empty space." Scrolls toward
      // the viewer at the same rate as the rungs so it reads as ground
      // rushing past rather than a static hatch fill; density and
      // brightness both grow with proximity so the nearest ground is the
      // most filled-in, matching the grid itself.
      const scrollRow = Math.floor(y + t * 0.6 * 8 * 0.5)
      const grassDensity = 0.22 + proximity * 0.4
      const grassAttr = visualizerLevelAttr(Math.max(0.15, 0.2 + proximity * 0.45))
      for (let x = 0; x < term.cols; x++) {
        if (showRung && x >= lo && x <= hi) { term.put(x, y, rungCh, rungAttr); continue }
        if (rails.has(x)) { term.put(x, y, rails.get(x), railAttr); continue }
        if (x >= lo && x <= hi) { term.put(x, y, ' '); continue }
        const n = hash2(x, scrollRow)
        if (n > 1 - grassDensity) {
          const ch = n > 1 - grassDensity * 0.15 ? '"' : n > 1 - grassDensity * 0.4 ? "'" : n > 1 - grassDensity * 0.7 ? ',' : '.'
          term.put(x, y, ch, grassAttr)
        } else {
          term.put(x, y, ' ')
        }
      }
    }
  },
  // RIPPLE effect (45th pass) -- for CITY LIGHTS. Raindrops on a Tokyo
  // night: a handful of fixed drop points, each expanding a ring band
  // outward and fading over RIPPLE_MAXAGE seconds before respawning
  // elsewhere on a stagger, over a faint constant neon shimmer so the
  // frame never reads as fully empty between drops.
  drawRippleEffect(s, t) {
    const { term } = s
    for (const r of this._ripples) {
      if (t - r.startT > RIPPLE_MAXAGE) {
        r.x = Math.random() * term.cols
        r.y = 1 + Math.random() * 21
        r.startT = t + Math.random() * 0.6
      }
    }
    for (let y = 1; y < HINT_Y1; y++) {
      for (let x = 0; x < term.cols; x++) {
        let v = 0
        for (const r of this._ripples) {
          const age = t - r.startT
          if (age < 0 || age > RIPPLE_MAXAGE) continue
          const dx = x - r.x, dy = (y - r.y) * 2.0
          const dist = Math.sqrt(dx * dx + dy * dy)
          const radius = age * RIPPLE_SPEED
          const ringDist = Math.abs(dist - radius)
          if (ringDist < 2.2) v = Math.max(v, (1 - ringDist / 2.2) * (1 - age / RIPPLE_MAXAGE))
        }
        // 45th pass: neon floor and ring width both boosted -- live QA
        // found the effect nearly invisible at the old 0.05-0.09 range,
        // which mostly rendered FAINT/DIM and washed out under CITY
        // LIGHTS' own bloomAmt 1.8, the heaviest on the roster.
        const neon = 0.12 + 0.07 * Math.sin(x * 0.5 + t * 0.8 + y * 0.2)
        v = Math.max(v * 0.95, neon)
        if (v < 0.06) { term.put(x, y, ' '); continue }
        const ch = v > 0.75 ? 'O' : v > 0.5 ? 'o' : v > 0.28 ? ':' : v > 0.12 ? '.' : '·'
        term.put(x, y, ch, visualizerLevelAttr(Math.min(1, v)))
      }
    }
  },
  // Builds one blocky, two-tone cloud silhouette for ATOMIC's CLOUDS
  // effect. 47th pass tried a hand-authored staircase ribbon; live QA
  // asked for another pass, suggesting procedural. This 48th-pass version
  // is a real metaball union: 4-7 overlapping circular "puffs" of varying
  // radius baked into a fixed pixel mask, which is what actually produces
  // the rounded, lumpy cumulus silhouette the reference image has (a
  // staircase can only ever look like a ribbon, not a cloud). Shading
  // reads as light on top, darker along the underside and any cell close
  // to an edge, for a little volume. Built once at spawn and reused every
  // frame; only the cloud's x position moves.
  makeCloudShape() {
    const puffCount = 4 + Math.floor(Math.random() * 4)
    const puffs = []
    let cursor = 0
    for (let i = 0; i < puffCount; i++) {
      const r = 1.8 + Math.random() * 2.4
      cursor += r * (0.55 + Math.random() * 0.35)
      puffs.push({ cx: cursor, cy: (Math.random() - 0.5) * 2.2, r })
      cursor += r * 0.5
    }
    const w = Math.ceil(cursor + 4)
    const h = 7
    const cells = []
    for (let ry = 0; ry < h; ry++) {
      const py = ry - h / 2
      for (let rx = 0; rx < w; rx++) {
        let minEdge = Infinity
        for (const p of puffs) {
          const dx = rx - p.cx, dy = (py - p.cy) * 1.7
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < p.r) minEdge = Math.min(minEdge, p.r - dist)
        }
        if (minEdge === Infinity) continue
        const shade = (py > 0.3 || minEdge < 0.9) ? 'dark' : 'light'
        cells.push({ dx: rx, dy: ry - Math.round(h / 2), shade })
      }
    }
    return { cells, w }
  },
  // CLOUDS effect (47th pass, full redesign of ATOMIC's old Geiger-counter
  // concept; regenerated procedurally in the 48th) -- live QA: "let's try
  // clouds? something like this where they kind of just move along." A
  // handful of the metaball pixel-cloud shapes above, each at its own row
  // and drift speed, sliding right and wrapping around once fully
  // offscreen.
  drawCounterEffect(s, t) {
    const { term } = s
    for (let y = 1; y < HINT_Y1; y++) for (let x = 0; x < term.cols; x++) term.put(x, y, ' ')
    for (const c of this._clouds) {
      const span = term.cols + c.shape.w + 10
      const x0 = ((c.baseX + t * c.speed) % span + span) % span - c.shape.w - 5
      for (const cell of c.shape.cells) {
        const px = Math.round(x0 + cell.dx)
        const py = c.y + cell.dy
        if (px < 0 || px >= term.cols || py < 1 || py >= HINT_Y1) continue
        const v = cell.shade === 'light' ? 0.85 : 0.5
        const ch = cell.shade === 'light' ? '█' : '▓'
        term.put(px, py, ch, visualizerLevelAttr(v))
      }
    }
  },
  // STACK effect (45th pass, reworked later the same pass) -- for
  // MOMENTUM. Originally 9 slow bars clustered mid-screen; live QA called
  // for the full width and visible up/down motion ("like data or
  // analytics changing"), so this is now 19 columns spanning edge to edge,
  // each rerolling its target and rising/falling toward it on a much
  // shorter cycle, with a small continuous jitter layered on top so a bar
  // is never perfectly still even mid-transition -- reads as a live
  // ticker rather than a calm progress bar.
  drawStackEffect(s, t) {
    const { term } = s
    for (let y = 1; y < HINT_Y1; y++) for (let x = 0; x < term.cols; x++) term.put(x, y, ' ')
    const left = 2, spacingX = 4, barW = 3, floor = HINT_Y1 - 2, top = 2, height = floor - top
    for (let i = 0; i < this._stackBars.length; i++) {
      const bar = this._stackBars[i]
      if (t > bar.holdUntil) {
        if (Math.abs(bar.level - bar.target) < 0.02) {
          bar.target = 0.1 + Math.random() * 0.85
          bar.holdUntil = t + 0.4 + Math.random() * 0.8
        }
        bar.level += (bar.target - bar.level) * bar.speed
      }
      const jitter = 0.03 * Math.sin(t * 3.2 + bar.jitterPhase)
      const displayLevel = Math.max(0, Math.min(1, bar.level + jitter))
      const filled = Math.round(displayLevel * height)
      const colX = left + i * spacingX
      for (let w = 0; w < barW; w++) {
        const cx = colX + w
        if (cx >= term.cols) continue
        for (let f = 0; f < filled; f++) {
          const yy = floor - f
          term.put(cx, yy, f === filled - 1 ? '▀' : '█', f === filled - 1 ? NORMAL : MUTED)
        }
        term.put(cx, floor + 1, '─', DIM)
      }
    }
  },
  // BOOM BAP effect (45th pass, redesigned twice since) -- for HACKBACK.
  // Started as a 16-step MPC sequencer grid; live QA asked for "more like
  // a speaker/boombox putting out sound waves," which became a woofer icon
  // floating mid-screen with soft expanding blobs. Second round of QA:
  // concept approved, execution didn't look great. This pass gives the
  // speaker an actual body -- a drawn cabinet sitting near the floor, like
  // a boombox on the ground -- and tightens the sound waves from a soft
  // gradient blob into a crisp single-character ring, so each hit reads as
  // a distinct arc rather than a smudge.
  drawBoomBapEffect(s, t) {
    const { term } = s
    for (let y = 1; y < HINT_Y1; y++) for (let x = 0; x < term.cols; x++) term.put(x, y, ' ')
    // Ambient scatter across the whole screen, not just the upper band --
    // 47th pass, live QA: "too much empty space, fill it out."
    for (let g = 0; g < 22; g++) {
      term.put(Math.floor(Math.random() * term.cols), 1 + Math.floor(Math.random() * (HINT_Y1 - 2)), '.', FAINT)
    }
    const cx = term.cols / 2
    // 48th pass: pushed back (HINT_Y1-3 -> HINT_Y1-7) for depth, per live
    // QA -- the sidewalk below now fills what used to be dead foreground.
    const speakerY = HINT_Y1 - 7
    const stepDur = 60 / BOOMBAP_BPM / 4
    const step = Math.floor(t / stepDur) % BOOMBAP_STEPS
    if (step !== this._boomLastStep) {
      this._boomLastStep = step
      if (BOOMBAP_PATTERN[step]) {
        // Every 6th step in this pattern is a kick (the pattern's own 0
        // and 6 index hits land heavier); the rest read as snare-weight.
        this._boomWaves.push({ startT: t, strength: step % 6 === 0 ? 1 : 0.72 })
      }
      // EQ readout bars re-roll toward a new target every step so the
      // cabinet's meter row reacts with the beat instead of sitting still.
      for (const bar of this._boomEq) bar.target = 0.15 + Math.random() * (BOOMBAP_PATTERN[step] ? 0.85 : 0.4)
    }
    for (const bar of this._boomEq) bar.level += (bar.target - bar.level) * 0.35
    for (let i = this._boomWaves.length - 1; i >= 0; i--) {
      if (t - this._boomWaves[i].startT > 1.3) this._boomWaves.splice(i, 1)
    }
    // Crisp expanding rings rising from the speaker -- a tight band (1.1
    // wide, single character) instead of the old 2.5-wide soft gradient,
    // so a hit reads as a distinct arc of sound rather than a blur.
    for (let y = 1; y < speakerY; y++) {
      for (let x = 0; x < term.cols; x++) {
        let v = 0
        for (const w of this._boomWaves) {
          const age = t - w.startT
          const dx = x - cx, dy = (y - speakerY) * 1.6
          const dist = Math.sqrt(dx * dx + dy * dy)
          const radius = age * 26
          const ringDist = Math.abs(dist - radius)
          if (ringDist < 1.1) v = Math.max(v, (1 - ringDist / 1.1) * (1 - age / 1.3) * w.strength)
        }
        if (v < 0.12) continue
        const ch = v > 0.7 ? ')' : v > 0.4 ? ':' : '.'
        term.put(x, y, ch, visualizerLevelAttr(Math.min(1, v)))
      }
    }
    // The cabinet -- bigger (47th pass: 16 wide -> 28, live QA "too much
    // empty space, fill it out"), with a carry handle, twin drivers, and
    // an EQ readout row so it reads as an actual boombox, not just a box
    // with a single cone. 48th pass: trimmed slightly (28 -> 24) now that
    // it sits farther back, so the reduced width reads as distance rather
    // than a shrunk prop.
    const lastHit = this._boomWaves.length ? this._boomWaves[this._boomWaves.length - 1].startT : -99
    const flash = Math.max(0, 1 - (t - lastHit) / 0.15)
    const width = 24
    const left = Math.round(cx) - width / 2
    const top = speakerY - 4, bottom = speakerY + 2
    for (let x = left + 8; x <= left + width - 8; x++) term.put(x, top - 1, '_', DIM)
    term.put(left + 8, top, '|', DIM)
    term.put(left + width - 8, top, '|', DIM)
    for (let x = left; x <= left + width; x++) {
      term.put(x, top, '─', DIM)
      term.put(x, bottom, '─', DIM)
    }
    for (let y = top; y <= bottom; y++) {
      term.put(left, y, '│', DIM)
      term.put(left + width, y, '│', DIM)
    }
    term.put(left, top, '┌', DIM)
    term.put(left + width, top, '┐', DIM)
    term.put(left, bottom, '└', DIM)
    term.put(left + width, bottom, '┘', DIM)
    // EQ readout row across the cabinet's top interior. 48th pass: kept
    // clear of the narrower cabinet's side walls (left+2 .. left+width-2)
    // now that width has shrunk to 24.
    const eqY = top + 1
    const eqLeft = left + 2
    const eqCount = Math.min(this._boomEq.length, width - 4)
    for (let i = 0; i < eqCount; i++) {
      const lvl = this._boomEq[i].level
      const ch = lvl > 0.66 ? '█' : lvl > 0.33 ? '▄' : '_'
      term.put(eqLeft + i, eqY, ch, visualizerLevelAttr(0.4 + lvl * 0.5))
    }
    // Twin drivers (cones), concentric rings flashing together on hits.
    const cyr = speakerY - 1
    for (const dxOff of [-7, 7]) {
      const dxr = Math.round(cx) + dxOff
      term.put(dxr, cyr, flash > 0.5 ? '█' : '▓', visualizerLevelAttr(Math.max(0.5, flash)))
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2
        term.put(Math.round(dxr + Math.cos(ang) * 2), Math.round(cyr + Math.sin(ang) * 1), 'o', visualizerLevelAttr(0.45 + flash * 0.35))
      }
    }
    // Sidewalk in front of the cabinet (48th pass, live QA: "push the
    // boombox back to add some depth and just do a simple floor/sidewalk
    // in front of it") -- converging edge lines toward the cabinet's base
    // and periodic seam dashes, widening toward the viewer the same way
    // OUTRUN's ground does.
    const vanishX = Math.round(cx)
    for (let y = bottom + 1; y < HINT_Y1; y++) {
      const depth = y - bottom
      const halfW = Math.min(vanishX, 3 + depth * 3)
      const lo = vanishX - halfW, hi = vanishX + halfW
      const seam = depth % 3 === 0
      const edgeAttr = visualizerLevelAttr(Math.max(0.15, 0.2 + depth * 0.05))
      for (let x = lo; x <= hi; x++) {
        if (x < 0 || x >= term.cols) continue
        if (x === lo) term.put(x, y, '\\', edgeAttr)
        else if (x === hi) term.put(x, y, '/', edgeAttr)
        else if (seam) term.put(x, y, '-', FAINT)
        else term.put(x, y, '.', FAINT)
      }
    }
  },
  // DREAD effect (45th pass) -- for the secret station. The one visual on
  // the roster meant to read as a little wrong to look at: a coarse panel
  // grid flickering erratically with occasional full-row tears, matching
  // this station's own harshest CRT signature and its forced red phosphor
  // bleed on lock.
  drawDreadEffect(s, t) {
    const { term } = s
    for (let y = 1; y < HINT_Y1; y++) for (let x = 0; x < term.cols; x++) term.put(x, y, ' ')
    const tear = this._dreadTear
    if (!tear.active && Math.random() < 0.012) {
      tear.active = true
      tear.row = 1 + Math.floor(Math.random() * 20)
      tear.until = t + 0.08 + Math.random() * 0.1
    }
    if (tear.active && t > tear.until) tear.active = false
    if (Math.random() < 0.4) {
      const idx = Math.floor(Math.random() * this._dreadGrid.length)
      this._dreadGrid[idx] = !this._dreadGrid[idx]
    }
    const top = 2, left = 6
    for (let gy = 0; gy < DREAD_CELLS_Y; gy++) {
      for (let gx = 0; gx < DREAD_CELLS_X; gx++) {
        const on = this._dreadGrid[gy * DREAD_CELLS_X + gx]
        const flicker = Math.random() < 0.06
        const ch = on ? (flicker ? '▓' : '█') : (flicker ? '░' : ' ')
        if (!on && !flicker) continue
        const attr = on ? (flicker ? MUTED : BRIGHT) : FAINT
        for (let cy = 0; cy < DREAD_CELL_H - 1; cy++) {
          for (let cx = 0; cx < DREAD_CELL_W - 1; cx++) {
            const py = top + gy * DREAD_CELL_H + cy
            if (py < HINT_Y1) term.put(left + gx * DREAD_CELL_W + cx, py, ch, attr)
          }
        }
      }
    }
    if (tear.active) {
      for (let x = 0; x < term.cols; x++) term.put(x, tear.row, Math.random() < 0.5 ? '█' : ' ', BRIGHT)
    }
  },
  // PULSE effect (45th pass) -- for COLD WAVE. See the PULSE_CYCLE/
  // pulseBeatEnvelope field notes above VISUAL_METHODS for why this is a
  // quantized lattice with a synthetic heartbeat rather than an organic
  // field.
  drawPulseEffect(s, t) {
    const { term } = s
    for (let y = 1; y < HINT_Y1; y++) for (let x = 0; x < term.cols; x++) term.put(x, y, ' ')
    const cx = term.cols / 2, cy = 11.5
    const tc = t % PULSE_CYCLE
    const beatV = pulseBeatEnvelope(tc)
    // 45th pass: live QA said "don't understand or see much" -- the
    // lattice was too sparse (5x3 cell gaps) and too faint (idle floor
    // topped out at FAINT) to register at a glance. Denser grid (3x2
    // gaps), a brighter idle floor, and a clear central pulse core fix
    // that -- the core alone should read the beat even if the lattice
    // itself goes unnoticed.
    for (let gy = 2; gy < HINT_Y1; gy += 2) {
      for (let gx = 2; gx < term.cols; gx += 3) {
        const dx = Math.abs(gx - cx), dy = Math.abs(gy - cy) * 1.7
        const dist = Math.max(dx, dy)
        // 48th pass: ring band widened 2.4 -> 3.2 (live QA: "larger
        // pulses") and travel speed bumped 7 -> 10 to match the shorter
        // PULSE_CYCLE above.
        const ringPos = ((dist - t * 10) % 9 + 9) % 9
        const ringDist = Math.min(ringPos, 9 - ringPos)
        const ringV = ringDist > 3.2 ? 0 : (1 - ringDist / 3.2) * beatV
        const idleFlicker = 0.12 + 0.06 * Math.sin(gx * 0.7 + gy * 0.5 + t * 0.4)
        const v = Math.max(ringV, idleFlicker)
        if (v < 0.06) continue
        const ch = v > 0.75 ? '#' : v > 0.5 ? '+' : v > 0.25 ? '.' : '·'
        term.put(gx, gy, ch, visualizerLevelAttr(Math.min(1, v)))
      }
    }
    // Scrolling EKG trace across the middle band -- see the field notes
    // above PULSE_BEAT_COLS/pulseEkgOffset. Replaces the small static
    // pulse-core block from the 45th pass; this reads as an actual
    // heartbeat line instead of a blinking square, and fills what was a
    // dead band down the middle of the screen.
    // 47th pass: bigger swing (amp 4 -> 6) and a two-row-thick trace --
    // live QA, applied broadly this round ("we need larger objects/
    // characters" plus "5 could look better") -- reads as a bold heartbeat
    // line instead of a thin scribble. 48th pass: amp 6 -> 8 and scroll
    // speed 9 -> 13 ("larger pulses ... happen a little quicker").
    const baseRow = Math.round(cy)
    const amp = 8
    let prevY = null
    for (let x = 0; x < term.cols; x++) {
      const u = (((x - t * 13) / PULSE_BEAT_COLS) % 1 + 1) % 1
      const off = pulseEkgOffset(u)
      const y = Math.max(2, Math.min(HINT_Y1 - 2, Math.round(baseRow - off * amp)))
      const spike = Math.abs(off) > 0.5
      term.put(x, y, spike ? '*' : '●', spike ? BRIGHT : NORMAL)
      const shadowY = y + 1
      if (shadowY < HINT_Y1 - 1) term.put(x, shadowY, '·', DIM)
      if (prevY !== null && Math.abs(y - prevY) > 1) {
        const step = y > prevY ? 1 : -1
        for (let yy = prevY + step; yy !== y; yy += step) term.put(x, yy, '|', spike ? NORMAL : DIM)
      }
      prevY = y
    }
  },
  // 44th pass -- dispatches on the locked station's own `visual` field
  // (VISUAL_METHODS) rather than always drawing DRIFT, so a themed station
  // (today just DRIFT MODE) gets its own effect the moment one exists for
  // it, with no change needed here.
  drawVisualizerFrame(s, t) {
    const key = this.lockedStation && VISUAL_METHODS[this.lockedStation.visual] ? this.lockedStation.visual : 'drift'
    this[VISUAL_METHODS[key]](s, (Date.now() - this._vizEnterAt) / 1000)
    // Info footer updates on the same cadence drawPlayback() already uses
    // for the normal progress bar -- plenty for a running clock, and cheap
    // (two 80-wide inverse rows) next to the effect's own per-frame cost.
    if (t - (this._vizLastInfoDraw || 0) > 0.25) {
      this._vizLastInfoDraw = t
      this.drawVisualizerInfo(s)
    }
  },
  // 2026-08-22: mirrors the exact three-way branching key() itself does
  // (powered-off, guide-open, normal) so "does this key do something"
  // matches "does this key click" precisely, without executing any of
  // key()'s actual side effects to find out.
  isMappedKey(e) {
    if (!this.poweredOn) return e.key === 'p' || e.key === 'P'
    // The guide overlay closes on any key at all (see the "[any other
    // key] CLOSE" hint on every guide page) -- so while it's open, every
    // key is a real command, not just the ones in MAPPED_KEYS. Visualizer
    // (43rd pass) is the same deal -- any key wakes it.
    if (this.guideOpen || this.visualizerActive) return true
    return MAPPED_KEYS.has(e.key)
  },
  key(s, e) {
    // 43rd pass -- any key counts as activity for the idle-visualizer
    // clock, whether or not it does anything else below.
    this._lastInputAt = Date.now()
    // Keypress click (32nd pass; scoped to mapped keys only 2026-08-22,
    // Matthew: "hearing sound when I command tab between programs, that
    // should not happen") -- the listener sits on window (see
    // screen.js's addEventListener), so it sees every keydown that
    // reaches the page, not just ones this app cares about -- a browser/
    // OS shortcut like Cmd+Tab can still surface a keydown here before
    // (or instead of) the OS fully taking over. Original intent was "click
    // the same as a real keyboard would even on a key that ends up doing
    // nothing *in the app*" (e.g. Enter with nothing in range) -- not
    // "click for literally any keystroke on the page". isMappedKey() below
    // draws that line: true for anything this build actually treats as a
    // command in the current mode, false for everything else.
    if (this.isMappedKey(e)) playKeyClick()
    // Power toggle (12th pass) -- while off, every key except P is ignored
    // outright so nothing (seek, scan, presets, volume) can act on a set
    // that isn't switched on.
    if (!this.poweredOn) {
      if (e.key === 'p' || e.key === 'P') { e.preventDefault(); this.powerUp(s) }
      return
    }
    // Visualizer (43rd pass) -- standard visualizer manners: ANY key
    // wakes it, and that keypress is consumed by the wake rather than also
    // running its normal action (so waking on an arrow key doesn't also
    // seek, waking on N doesn't also skip a track). Second press does
    // whatever it always did.
    if (this.visualizerActive) { e.preventDefault(); this.exitVisualizer(s); return }
    // Guide overlay (15th pass; paged 18th pass; expanded to per-station
    // pages 32nd pass) -- while open, ANY key closes it (matches the "[any
    // other key] CLOSE" hint on every guide page) except: ArrowRight/
    // ArrowLeft, which step sequentially through all guideTotalPages()
    // pages (About, Index, then one detail page per station) instead of
    // closing; and, while on the Index page specifically, a preset digit
    // (1-9), which jumps straight to that station's detail page rather
    // than making you arrow past every station in between. Intercepted
    // before the switch below so nothing else (seek, lock, presets) can
    // act underneath the overlay.
    if (this.guideOpen) {
      e.preventDefault()
      const totalPages = this.guideTotalPages()
      if (e.key === 'ArrowRight' && this.guidePage < totalPages) { this.guidePage++; this.drawGuidePage(s); return }
      if (e.key === 'ArrowLeft' && this.guidePage > 1) { this.guidePage--; this.drawGuidePage(s); return }
      if (this.guidePage === 2 && /^[1-9]$/.test(e.key)) { this.guidePage = 2 + Number(e.key); this.drawGuidePage(s); return }
      this.closeGuide(s)
      return
    }
    switch (e.key) {
      case 'ArrowLeft': e.preventDefault(); this.seekStep(s, -SEEK_STEP); break
      case 'ArrowRight': e.preventDefault(); this.seekStep(s, SEEK_STEP); break
      case 'Enter': e.preventDefault(); this.tryLock(s); break
      case 's': case 'S': e.preventDefault(); this.scanning ? this.stopScan() : this.startScan(s); break
      // 29th pass (Matthew: "should we even have play/pause or just mute?")
      // -- removed. A real broadcast can't be paused, only muted or turned
      // off; play/pause was the one control that broke that fiction, since
      // every other control (mute, power, tuning) respects that the
      // station keeps running whether you're listening or not. `M` (mute)
      // already does the radio-authentic version of "make it stop": it
      // calls player.mute()/unMute(), which silences output without
      // stopping playback underneath -- unmuting resumes wherever the
      // "broadcast" currently is, exactly like turning a real radio's
      // volume back up. togglePlayPause() removed entirely; SPACE is now
      // unbound.
      // 35th pass: Shift+N hidden station-hopping mode removed (Matthew:
      // "doesn't work as intended") -- N is back to a plain single-purpose
      // key, always skipping the dead/current track within the locked
      // station.
      case 'n': case 'N': e.preventDefault(); this.skip(s); break
      case 'ArrowUp': e.preventDefault(); this.adjustVolume(s, 10); break
      case 'ArrowDown': e.preventDefault(); this.adjustVolume(s, -10); break
      case 'm': case 'M': e.preventDefault(); this.toggleMute(s); break
      case 'p': case 'P': e.preventDefault(); this.powerDown(s); break
      // History back (14th pass, Matthew: "discovery/history -- sure").
      case 'b': case 'B': e.preventDefault(); this.goBack(s); break
      // Guide (15th pass, Matthew: "we also need a G for guide").
      case 'g': case 'G': e.preventDefault(); this.openGuide(s); break
      // Display modes (23rd pass, Matthew: "let users cycle display modes").
      case 'c': case 'C': e.preventDefault(); this.cycleDisplayMode(s); break
      // Visualizer (43rd pass, Matthew: "'V' for saVer" -- the mnemonic
      // still works after the 44th pass rename to "Visualizer") -- manual
      // toggle in, any time you're locked. Silently no-ops otherwise
      // (mirrors [B] BACK with empty history) -- getting in is only
      // meaningful once there's a station/track to show on the info bar.
      case 'v': case 'V':
        e.preventDefault()
        if (this.mode === 'locked' && this.lockedStation) this.enterVisualizer(s)
        break
      // 11th pass (2026-08-20): 4 new stations brought STATIONS back up to
      // 9 -- preset keys match its length again, same pattern as the 10th
      // pass's drop to 5.
      // 22nd pass: back to `1`-`9` only -- HACKBACK's `0` binding (20th
      // pass) only made sense while there were 10 stations; dropping OUTLAW
      // brought the roster back to 9 (Matthew: "9 channels is our max for
      // now"), so `0` is retired and HACKBACK now falls wherever it lands
      // in STATION_PRESET_ORDER like everything else.
      case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8': case '9': {
        e.preventDefault()
        // 17th pass: STATION_PRESET_ORDER (freq-sorted), not STATIONS
        // (chronological add-order) -- see its definition for why -- so
        // preset number always matches left-to-right position on the dial.
        const ch = STATION_PRESET_ORDER[Number(e.key) - 1]
        if (ch) this.presetTune(s, ch)
        break
      }
      // 2026-08-22: '0' bound directly to SECRET_STATION, not derived from
      // STATION_PRESET_ORDER -- see that constant's comment for why it's
      // deliberately not part of STATIONS at all.
      case '0': e.preventDefault(); this.presetTune(s, SECRET_STATION); break
    }
  },

  frame(s, t) {
    // Power toggle (12th pass) -- the collapse/warm-up sequences draw
    // everything themselves on their own timers, so the normal per-frame
    // idle shimmer/progress/VU redraws need to stay out of the way while
    // powered off (they'd otherwise paint stray dial dots and meter bars
    // onto what's supposed to read as a dark screen). Same reasoning for
    // the guide overlay (15th pass) -- it's a full-screen takeover of the
    // same grid, so per-frame redraws would punch holes in it too.
    if (!this.poweredOn || this.guideOpen) return

    // Visualizer (43rd pass) -- idle trigger. Only arms while locked and
    // actually playing; there's nothing worth idling into while seeking,
    // scanning, or between stations. Manual entry is the [V] case in key(),
    // which mobile can never reach anyway (no keyboard) -- but this timer
    // fires on its own regardless of input source, so it needs its own
    // guard: every visualizer effect is drawn for the 80-col desktop grid
    // and would render as garbage squeezed into mobile's 42.
    if (!this.mobile && !this.visualizerActive && this.mode === 'locked' && this.lockedStation &&
        Date.now() - this._lastInputAt > VISUALIZER_IDLE_MS) {
      this.enterVisualizer(s)
    }
    // Early return, same shape as the poweredOn/guideOpen bail above --
    // this is a full-screen takeover of its own, so none of the normal
    // per-frame draws (including the rare idle CRT tear/roll and the
    // always-on border shimmer, both further down) should run underneath
    // it. Matthew: "no idle/shimmer tear ... does not stay active".
    if (this.visualizerActive) { this.drawVisualizerFrame(s, t); return }

    // Idle shimmer on the dial while seeking, so the empty band doesn't feel
    // dead between stations. Cheap: only touch a handful of cells per frame.
    // 45th pass -- mobile has no dial at all, and DIAL_Y collides with the
    // station-name row on its grid, so this is skipped there rather than
    // risking a stray dot landing in displayed text during the brief
    // 'seeking' window a preset sweep passes through.
    if (!this.mobile && this.mode === 'seeking' && Math.random() < 0.15) {
      const x = DIAL_X0 + Math.floor(Math.random() * (DIAL_X1 - DIAL_X0))
      const cursorCol = freqToCol(this.freq)
      // BUG FIXED (41st pass, found while verifying the per-station dial
      // glyphs): this shimmer picks ANY column on the dial and paints a
      // FAINT '·'/':' over it -- including the columns holding station
      // markers. Nothing repaints them until the next retune() call, so
      // sitting still anywhere on the band quietly ate the markers one by
      // one, and the dial you were supposed to be navigating by went blank.
      // It has always done this (the old uniform '▲'s disappeared exactly
      // the same way); giving each station its own glyph is what finally
      // made it obvious, since a dial full of DIFFERENT shapes is something
      // you actually read. The cursor column was already excluded for the
      // same reason -- this just extends that to the markers.
      if (x !== cursorCol && !STATION_COLS.has(x)) {
        const chars = ['·', '·', '·', ':', '.']
        s.term.put(x, DIAL_Y, chars[Math.floor(Math.random() * chars.length)], FAINT)
      }
    }

    // Track progress -- a few times a second is plenty for a time display.
    if (t - this.lastProgressDraw > 0.25) {
      this.lastProgressDraw = t
      this.drawPlayback(s)
    }

    // Fake VU meter -- bounces a bit faster than the progress bar so it
    // reads as "live" rather than a slow crawl. Kept running even when not
    // locked so it eases back down to flat instead of freezing mid-bounce.
    if (t - (this.lastVuDraw || 0) > 0.12) {
      this.lastVuDraw = t
      this.drawVU(s)
      // 29th pass: the antenna glyph shares the VU's redraw cadence --
      // cheap, and it's the same rate its own ring animation needs anyway.
      this.drawAntenna(s, t)
    }

    // 38th pass -- rare idle CRT events (see crtIdleEvent). A set left on
    // one station for a couple of minutes should do SOMETHING once in a
    // while; rare enough (90-210s apart) that it stays a surprise rather
    // than becoming another layer of ambient texture. The first interval
    // is seeded on the first frame after power-on rather than in init(),
    // so the clock starts when the set does.
    if (!this._nextIdleEventAt) {
      this._nextIdleEventAt = t + 90 + Math.random() * 120
    } else if (t > this._nextIdleEventAt) {
      this._nextIdleEventAt = t + 90 + Math.random() * 120
      if (this.mode === 'locked') this.crtIdleEvent(s)
    }

    // Always-on idle phosphor shimmer (14th pass, Matthew: "a subtle
    // always-on scanline or phosphor-flicker shimmer even at idle so the
    // CRT never looks perfectly static"). Independent of mode/lock state --
    // unlike the dial shimmer above, this runs whenever the set is powered,
    // locked or not. Only ever touches a box-BOTTOM border row: those are
    // plain '─' the full width (drawBoxBottom has no embedded label, unlike
    // drawBoxTop), so a random cell can never clobber a panel title. Briefly
    // dips one cell a notch below rest, then a timer fades it back up to
    // that row's own resting attribute (BOX_BOTTOM_REST_ATTR -- NOT a
    // hardcoded MUTED: NOW PLAYING's border rests at BOLD, see its
    // definition, and restoring to MUTED there was a real bug found live in
    // the 42nd pass -- see the same note). The dip itself is likewise
    // BOX_BOTTOM_FLASH_ATTR, one notch below THAT row's rest, not a flat
    // DIM for all four -- a flat DIM read as invisible on the MUTED rows but
    // a much bigger, face-changing dip on NOW PLAYING's brighter BOLD rest
    // (found live right after the rest-attribute fix, same session).
    // 45th pass -- these are desktop row numbers; on mobile's shorter grid
    // one of them (STATION_BOT_Y) lands on the NOW PLAYING box's artist
    // row instead of a border, which would occasionally punch a stray '-'
    // into displayed text. Skipping the shimmer on mobile entirely rather
    // than building it a second row/column set for a cosmetic-only effect.
    if (!this.mobile && Math.random() < 0.05) {
      const y = BOX_BOTTOM_ROWS[Math.floor(Math.random() * BOX_BOTTOM_ROWS.length)]
      let x = BOX_X0 + 1 + Math.floor(Math.random() * (BOX_X1 - BOX_X0 - 1))
      // 18th pass: METERS_BOT_Y now has a '┻' T-junction at
      // METERS_DIVIDER_X (see drawChrome) -- this shimmer assumed every
      // bottom-border cell was a plain '─' and would permanently stomp the
      // junction with a dash if it ever landed there (writes '─' both for
      // the flash and the fade-back). Nudge off that one column instead.
      if (y === METERS_BOT_Y && x === METERS_DIVIDER_X) x += x < BOX_X1 - 1 ? 1 : -1
      const restAttr = BOX_BOTTOM_REST_ATTR.get(y)
      s.term.put(x, y, '─', BOX_BOTTOM_FLASH_ATTR.get(y))
      setTimeout(() => { if (this.poweredOn) s.term.put(x, y, '─', restAttr) }, 90 + Math.random() * 80)
    }
  },
}
