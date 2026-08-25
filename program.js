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

// Version tag (28th pass) -- shown in the title bar right next to the
// SIGNAL wordmark, e.g. "SIGNAL v0.7". Bump on future releases.
const VERSION_TAG = 'v0.9'

// --- data -------------------------------------------------------------

// A wide, irregular fictional band -- not the real 88-108 FM range, and not
// clean tenths like real station assignments, on purpose (8/20: the old
// range read as too close to an actual FM dial).
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
// 36th pass: re-locking onto a station previously resumed a different song
// every time, when a real broadcast would still be on the same song, just
// further along. Flat-cutoff fix: tryLock() remembers, per station, the
// track and position playing when you last left it. Re-locking onto that
// station within this window resumes the same track (seeked forward by
// however long you were away) instead of drawing a fresh one from the
// shuffle bag; past the window it's treated as a real gap and draws
// normally. Deliberately flat rather than duration-aware -- simpler, and
// "gone a while -> different song" is close enough to real radio without
// simulating each station's timeline continuously in the background.
const RESUME_CUTOFF_MS = 3 * 60 * 1000

// 54th pass -- how long the warm-up drift wobbles the displayed freq/dial
// cursor after power-on before settling flat. See powerUp()'s REVEAL_DELAY
// beat (sets this._warmupUntil) and frame() (reads/decays it).
const WARMUP_MS = 2200

// Visualizer (43rd/44th pass) -- a music screensaver shown when idle for
// awhile or when toggled; renamed from "screensaver" the same pass it
// shipped, since that name broke immersion a bit. 4:20 is a fixed pick, not
// a default worth second-guessing. Only ever armed while locked and playing
// -- see frame()'s idle check -- so there's nothing to idle into while
// seeking or scanning.
const VISUALIZER_IDLE_MS = 4 * 60 * 1000 + 20 * 1000

// Display modes (23rd pass) -- lets users cycle display modes. The CRT
// engine (src/crt.js) already ships a full set of named phosphor
// tints (see PHOSPHORS in config.js) and a setPhosphor(name) hook on both
// CRT and Screen; this is purely an app-layer cycle on top of that, not a
// new rendering feature. Deliberately a curated subset and order, not every
// key in PHOSPHORS.
// 27th pass: added a Pink color theme -- 'bubblegum' (config.js's
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

// `tagline` replaces the old plain genre label -- settled on short creative
// descriptions instead of e.g. "flow / focus". These are a
// first draft, easy to swap.
// `ident` is a short WebAudio tone sequence (Hz, played in order) that
// stands in for a station ID jingle -- one per station, so locking onto a
// station sounds distinctive before you've even read the screen (added
// 2026-08-20, 9th pass: station idents introduced). Standardized
// to exactly 4 tones each (10th pass: station IDs set to 4 tones
// long): a grungy descending run, an ascending major arpeggio, a soft
// downward drift, a bright synth-pop arpeggio, and a warm lofi descent.
//
// SIGNAL LOCK (steady-carrier ambient station) was removed 2026-08-20
// (10th pass: station signal lock removed). Its two tracks
// (Eno's "An Ending (Ascent)", Pärt's "Spiegel im Spiegel") were reassigned
// rather than deleted -- both fit QUIET HOURS' ambient/neoclassical lane
// better than they fit any of the remaining stations, and CHAMBER FREQ
// wasn't a clean home for them either (they're modern minimalist, not the
// "old masters" the tagline promises).
//
// Every remaining station also picked up 4 new real, oEmbed-verified tracks
// this pass, on top of whatever it already had -- so QUIET HOURS actually
// gained 6 (4 new + the 2 reassigned) and the rest gained 4.
// 50th pass, curation pass (2026-08-23) -- 20 tracks REMOVED and
// deliberately NOT replaced: removed tracks are not backfilled, since this is
// part of curation and helps tune a vibe; tracks can be added later, and this
// step is to weed out rejected ones. Recorded here so a future session doesn't re-add any of
// them as a fresh idea -- they were listened to and rejected, not missed:
//   CIPHER            Ni Ten Ichi Ryu (Photek), Elektrobank (Chemical Bros),
//                     Journeyman + Bloodstone (Amon Tobin), Smack My Bitch Up
//                     (Prodigy), Papua New Guinea (FSOL), Safe from Harm
//                     (Massive Attack), Gantz Graf (Autechre)
//   DISTORTION FIELD  Everlong (Foo Fighters), Far Behind (Candlebox)
//   COLD WAVE         Enola Gay (OMD), Vienna (Ultravox)
//   MOMENTUM          Sheets (Mndsgn)
//   CIRCUIT CRUSH     Los Angeles [Live] (The Midnight), Le Perv (Carpenter Brut)
//   ATOMIC            Old Man Atom, Open the Door Richard!
//   HACKBACK          Bouge de la (MC Solaar), Respiration (Black Star),
//                     Children's Story (Slick Rick)
// Same pass swapped 8 IDs from music-video/edit uploads to clean album audio,
// since those were not radio versions but music video or other
// versions -- Prime Audio Soup, Alive, It Was A Good Day, Nuthin' But A "G"
// Thang, T.R.O.Y., Mass Appeal, Rosa Parks, California Love. Mostly YouTube
// auto-generated "- Topic" art tracks, which are the cleanest album audio
// available; Rosa Parks is OutkastVEVO's own "Official Audio" upload. All
// oEmbed-verified before being written here, same discipline as always --
// but note oEmbed 200 does NOT prove a track is embeddable (see the stall
// path in onStateChange), and art tracks are a category that can be
// region/embed-restricted, so these deserve a listen-through.
// Station counts are intentionally uneven now (CIPHER 22, HACKBACK 27,
// DISTORTION FIELD/COLD WAVE/CIRCUIT CRUSH/ATOMIC 28, MOMENTUM 29,
// DRIFT MODE/CITY LIGHTS 30) -- curation over symmetry.
const STATIONS = [
  { id: 'distortion-field', freq: 199.7, callsign: 'DISTORTION FIELD', tagline: "raw nerve, '90s angst",
    // 28th pass (2026-08-21): renamed from STATIC BLOOM per the
    // station-naming pass -- "DISTORTION FIELD" / "heavy guitars, raw
    // nerve, '90s angst" was the locked-in choice (option 1B). Same
    // grunge/alt-rock lane, same ident, same tracks -- name/tagline only.
    // 32nd pass: guide's per-station detail page (see drawGuidePageStation).
    // v0.8 patch: freq bumped 137.4 -> 194.8 -- when CIPHER moved to 133.7
    // (see CIPHER's own field notes below) the two sat only 3.7 KHZ apart
    // on the dial, way tighter than the roster's normal spacing.
    // round 10, 2026-08-23 (easter-egg pass -- CIPHER's 133.7 is
    // leet speak, this is the same idea): 194.8 -> 199.7, a fixed
    // pick for a '90s-grunge-station gag frequency. Still well clear of
    // CIPHER (133.7) on one side and DRIFT MODE (see below) on the other.
    // 49th pass (meaning confirmed): reads as 1997, a late-90s
    // year sitting right in the station's own grunge/alt-rock window.
    freqNote: '1997, a late-90s year',
    desc: 'Grunge and alternative rock from the early-to-mid 90s Seattle sound and its ripple effects -- distorted guitars, raw vocals, and radio-ready angst.',
    // 8/20: station id tone for static bloom was reported inaudible. The
    // ident itself was firing fine (confirmed by hooking createOscillator
    // in a live tab) -- it was just pitched a full octave below every other
    // station's ident (130.8-196 vs. 300+ everywhere else), quiet-to-silent
    // on typical laptop/built-in speakers for a 160ms burst. Same 4-note
    // shape, one octave up: still the lowest/moodiest ident of the set,
    // just actually audible.
    ident: [392.0, 349.2, 311.2, 261.6],
    // 25th pass -- each of the 9 station ID tones needed to be as unique
    // from each other as possible. An analysis pass found 8 of the 9
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
    // 41st pass -- per-station identity: gives each channel more distinct
    // identity. Everything a station had until now was
    // INFORMATIONAL -- callsign, tagline, desc, ident motif, dial position --
    // i.e. things you read. These four fields are things you feel without
    // reading, and every one of them rides machinery that already existed:
    //   glyph  -- this station's marker on the dial, in place of the nine
    //             identical '▲'s, so the band becomes a map you learn.
    //             CHOSEN FOR LEGIBILITY, NOT FOR THEME -- glyphs do
    //             not need to be thematic at all, they need to be whatever
    //             reads best. The first set matched each station's
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
    // v0.8: 3 tracks swapped for variety ("Lightning
    // Crashes", "Dollar Bill", "No Rain" out) for Zombie/Possum Kingdom/Buddy
    // Holly below, all oEmbed-verified same as everything else.
    tracks: [
      realTrack('hTWKbfoikeg', 'Smells Like Teen Spirit', 'Nirvana'),
      realTrack('3mbBbFH9fAg', 'Black Hole Sun', 'Soundgarden'),
      realTrack('Nco_kh8xJDs', 'Would?', 'Alice In Chains'),
      realTrack('IBU2uq20tVU', 'Alive', 'Pearl Jam'),
      realTrack('yjJL9DGU7Gg', 'Interstate Love Song', 'Stone Temple Pilots'),
      realTrack('PE5f561Y1x4', 'Nearly Lost You', 'Screaming Trees'),
      realTrack('cH_rfGBwamc', 'Violet', 'Hole'),
      realTrack('XKvHgPHLlv4', 'Hunger Strike', 'Temple of the Dog'),
      realTrack('_nGsT_qFMBs', "Touch Me I'm Sick", 'Mudhoney'),
      realTrack('5WPbqYoz9HA', 'Machinehead', 'Bush'),
      realTrack('6Ejga4kJUts', 'Zombie', 'The Cranberries'),
      realTrack('28kAclQZLTE', "Pretend We're Dead", 'L7'),
      realTrack('q-KE9lvU810', 'Cherub Rock', 'The Smashing Pumpkins'),
      realTrack('PjsMnvqL7eY', 'Tomorrow', 'Silverchair'),
      realTrack('JNZezhUkOSk', 'Jeremy', 'Pearl Jam'),
      realTrack('V5UOC0C0x8Q', 'Plush', 'Stone Temple Pilots'),
      realTrack('TAqZb52sgpU', 'Man in the Box', 'Alice In Chains'),
      realTrack('T0_zzCLLRvE', 'Spoonman', 'Soundgarden'),
      realTrack('4aeETEoNfOg', '1979', 'The Smashing Pumpkins'),
      realTrack('vabnZ9-ex7o', 'Come As You Are', 'Nirvana'),
      realTrack('EqWRaAF6_WY', 'My Hero', 'Foo Fighters'),
      realTrack('EkwD5rQ-_d4', 'Possum Kingdom', 'Toadies'),
      realTrack('RD9xK9smth4', 'Doll Parts', 'Hole'),
      realTrack('8KHwuOtcALQ', 'Freak', 'Silverchair'),
      realTrack('kemivUKb4f4', 'Buddy Holly', 'Weezer'),
      realTrack('Fm72DPJCX58', 'River of Deceit', 'Mad Season'),
      realTrack('YgSPaXgAdzE', 'Loser', 'Beck'),
      realTrack('MW6E_TNgCsY', 'Santa Monica', 'Everclear'),
      realTrack('MxvZCCR7QuU', 'Bound for the Floor', 'Local H'),
      realTrack('JXkN3nJyWEA', 'Feel the Pain', 'Dinosaur Jr'),
      realTrack('oFD88EyZ80E', 'Backwater', 'Meat Puppets'),
      realTrack('ht672-wYelc', 'Vasoline', 'Stone Temple Pilots'),
    ] },
  // RELIC SIGNAL (classical, 219.8) retired 2026-08-21 (28th pass, per
  // the station-naming pass) -- its classical lane overlapped with
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
  { id: 'drift-mode', freq: 321.0, callsign: 'DRIFT MODE', tagline: 'fade to black, ambient descent',
    // 28th pass: renamed from QUIET HOURS (option 2B minus "sleep well").
    // Same ambient/drone lane, same ident, same tracks -- name/tagline only.
    // 32nd pass: guide's per-station detail page (see drawGuidePageStation).
    // round 10, 2026-08-23 (easter-egg pass): 356.2 -> 321.0 --
    // "3-2-1" counting down to nothing, matching a station about winding
    // down/fading to black. Same gag as CIPHER's 133.7 and DISTORTION
    // FIELD's 199.7 above.
    freqNote: '3-2-1, counting down to nothing',
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
      realTrack('0kYc55bXJFI', 'Near Light', 'Olafur Arnalds'),
      realTrack('YC6pJOH7bF0', 'Adamord', 'Stars of the Lid'),
      realTrack('8L64BcCRDAE', 'Svefn-g-englar', 'Sigur Rós'),
      realTrack('wLxbD0CkS30', "Heavy Water / I'd Rather Be Sleeping", 'Grouper'),
      realTrack('BD3D5mCjt7I', 'Disintegration Loop 1.1', 'William Basinski'),
      realTrack('sfBlBs25Ewk', 'An Ending (Ascent) [arr. David Le Page]', 'Brian Eno / Orchestra of the Swan'),
      realTrack('QJ-polFpeX0', 'Music for Airports: 1/1', 'Brian Eno'),
      realTrack('jl_z5JvrKlc', 'Discreet Music', 'Brian Eno'),
      realTrack('dIwwjy4slI8', 'Says', 'Nils Frahm'),
      realTrack('-bc37fU36Vk', 'Requiem for Dying Mothers, Pt. 1', 'Stars of the Lid'),
      realTrack('vTaBX_FoGWk', 'Release', 'Hammock'),
      realTrack('ShW8YyueC1s', 'In the Fog I', 'Tim Hecker'),
      realTrack('SwmRJQAx8eA', 'Requiem for the Static King, Pt. 1', 'A Winged Victory for the Sullen'),
      realTrack('ngUnLL4CAck', 'A Song for Europa', 'Jóhann Jóhannsson'),
      realTrack('mwJTwG5r5Ks', 'The Plateaux of Mirror', 'Harold Budd / Brian Eno'),
      realTrack('2CN1qXJJODI', 'Cast of Mind', 'Kali Malone'),
      realTrack('nvtV4fvNJpY', 'Radio Ballet', 'Eluvium'),
      realTrack('ONQt97F9KKI', 'Opus 23', "Dustin O'Halloran"),
      realTrack('SDru80vHKxU', 'Keep Up the Good Work', 'Julianna Barwick'),
      realTrack('pygwK0sBUdM', 'andata', 'Ryuichi Sakamoto'),
      realTrack('5nCRNIKkKSs', 'Rain', 'Poppy Ackroyd'),
      realTrack('CQ8zglIXZi8', 'Nuvole Bianche', 'Ludovico Einaudi'),
      realTrack('l81XVNzdZts', 'Everything Is a Memory', 'Slow Meadow'),
    ] },
  { id: 'cold-wave', freq: 273.0, callsign: 'COLD WAVE', tagline: 'synthetic hearts, borrowed neon',
    // 32nd pass: guide's per-station detail page (see drawGuidePageStation).
    // round 10, 2026-08-23 (easter-egg pass): 512.9 -> 273.0 --
    // absolute zero is -273 C, about as "cold" as a frequency can get.
    // Moves it below DRIFT MODE instead of above CIRCUIT CRUSH, which
    // bumps DRIFT MODE and CIRCUIT CRUSH each up one preset key (now `4`
    // and `5`) -- CITY LIGHTS/MOMENTUM/ATOMIC/HACKBACK were left alone
    // this pass and keep their existing keys (`6`-`9`)
    // untouched since none of them sit between COLD WAVE's old and new
    // positions.
    freqNote: '-273°C, absolute zero',
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
    visual: 'frost',
    tracks: [
      realTrack('9GMjH1nR0ds', "Blue Monday '88", 'New Order'),
      realTrack('1ASpBpT8bRQ', 'Just Like Heaven', 'The Cure'),
      realTrack('aGSKrC7dGcY', 'Enjoy the Silence', 'Depeche Mode'),
      realTrack('aGCdLKXNF3w', 'Everybody Wants to Rule the World', 'Tears for Fears'),
      realTrack('uPudE8nDog0', "Don't You Want Me", 'The Human League'),
      realTrack('M1oqX84UKOE', "Don't You (Forget About Me)", 'Simple Minds'),
      realTrack('6KR52lEWLEM', 'Sweet Dreams (Are Made of This)', 'Eurythmics'),
      realTrack('sj1ajOdKgKo', 'Cars', 'Gary Numan'),
      realTrack('iIpfWORQWhU', 'I Ran (So Far Away)', 'A Flock of Seagulls'),
      realTrack('XZVpR3Pk-r8', 'Tainted Love', 'Soft Cell'),
      realTrack('p3j2NYZ8FKs', 'West End Girls', 'Pet Shop Boys'),
      realTrack('nTizYn3-QN0', 'Rio', 'Duran Duran'),
      realTrack('djV11Xbc914', 'Take On Me', 'a-ha'),
      realTrack('tkOr12AQpnU', 'Bizarre Love Triangle', 'New Order'),
      realTrack('6Uxc9eFcZyM', 'Save a Prayer', 'Duran Duran'),
      realTrack('Ye7FKc1JQe4', 'Shout', 'Tears for Fears'),
      realTrack('EPmTGFg06zA', 'If You Leave', 'Orchestral Manoeuvres in the Dark'),
      realTrack('PAqk72wm4As', 'Fade to Grey', 'Visage'),
      realTrack('tl6u2NASUzU', 'Big in Japan', 'Alphaville'),
      realTrack('LGD9i718kBU', 'Love My Way', 'The Psychedelic Furs'),
      realTrack('LWz0JC7afNQ', 'The Killing Moon', 'Echo & the Bunnymen'),
      realTrack('cFH5JgyZK1I', "It's My Life", 'Talk Talk'),
      realTrack('_6FBfAQ-NDE', "Just Can't Get Enough", 'Depeche Mode'),
      realTrack('-OO9LloDSJo', 'Things Can Only Get Better', 'Howard Jones'),
      realTrack('Zi86ZiOlIVo', 'The Safety Dance', 'Men Without Hats'),
      realTrack('wO0A0XcWy88', 'Major Tom (Coming Home)', 'Peter Schilling'),
      realTrack('LuN6gs0AJls', 'I Melt With You', 'Modern English'),
      realTrack('V83JR2IoI8k', 'She Blinded Me With Science (Official Video - HD Remaster)', 'Thomas Dolby'),
      realTrack('xJeWySiuq1I', 'Vienna (Official Music Video)', 'Ultravox'),
      realTrack('lVrELhxOFnM', 'Always Something There to Remind Me', 'Naked Eyes'),
    ] },
  // MOMENTUM (chillhop/downtempo focus, 567.8) retired 2026-08-24, replaced
  // with MIDNIGHT NEON -- late-night
  // blues persona, same slot/glyph reused below -- per the RELIC SIGNAL
  // precedent above, its identity is preserved here only in this comment in
  // case the focus/lofi lane is ever wanted back as its own station:
  //   Aruarian Dance - Nujabes (XnFOucmKlXA), Midnight In A Perfect World -
  //   DJ Shadow (InFbBlpDTfQ), Kong - Bonobo (KMKeBpySf78), A Walk - Tycho
  //   (mehLx_Fjv_c), Lonely - Idealism (DEqSQq9Rkuo), Fireflies - Kupla x
  //   j'san (iUcHNED9mV4), Time: The Donut of the Heart - J Dilla
  //   (pmJC2aO5vq0), Soon It Will Be Cold Enough - Emancipator
  //   (0yDKIyOJaYM), Point in Space and Time - Flawed Mangoes
  //   (GMbIF2UeLiA), Feather - Nujabes feat. Cise Starr & Akin (CYNE)
  //   (hQ5x8pHoIPA), Cirrus - Bonobo (WF34N4gJAKE), Anthem - Emancipator
  //   (oUbznuLaBRs), Awake - Tycho (VZBrZV3nHAA), econto - Wun Two
  //   (nhl3wfXeCzU), Kiara - Bonobo (L-kyRh7N-kE), Dive - Tycho
  //   (m94Dhu8gUDw), Minor Cause - Emancipator (fULXi348-jI), Workinonit -
  //   J Dilla (5nO7IA1DeeI), Luv Letter - DJ Okawari (_zMcKruOqa8), Fog -
  //   Nosaj Thing (N_gGGpKrIZc), Sunrise To Sunset - Kupla (u8QhbV1Vyfs),
  //   Blue Orchard - FloFilz (q-KOSq-iA9w), Be Free - Jinsang
  //   (ymjfXyQJ4ak), Soulful - L'Indécis (7ZguAEoNpZw), Seasons - Aso
  //   (hebk7pJ4xhE), Building Steam With A Grain Of Salt - DJ Shadow
  //   (HORLJvUMs08), Division - Tycho (w7_k6IwazXk), Still - Philanthrope x
  //   idealism (ry5_86xOkhk), morning - jinsang (TW7tKY6lQGo), a light of
  //   mine - kudasai (kAMml_RST1g). Ident was [329.6, 293.7, 261.6, 293.7],
  //   identTempo 1.1, gain 1.15, glyph '≡', visual 'skyline'.
  { id: 'midnight-neon', freq: 567.8, callsign: 'MIDNIGHT NEON', tagline: 'late-night blues, neon glow',
    // 60th pass (2026-08-24): MOMENTUM replaced with MIDNIGHT NEON, from a
    // 40-track blues playlist and persona
    // brief -- late-night minor-key slow burns, lush brass sections, and
    // soaring, reverberant guitar solos, dark highways and low-lit
    // lounges. Started with 20 tracks for now, keeping the same
    // spot and glyph. Freq/glyph inherited unchanged from
    // MOMENTUM (see the retirement comment above) -- same dial slot, new
    // format. 20 of the 40 pasted tracks picked for the first cut (spread
    // across the pasted "4 hours," favoring the most iconic/likely-official
    // sources), all independently oEmbed-verified.
    freqNote: 'counting up: 5-6-7-8',
    desc: 'Late-night electric blues -- minor-key slow burns, lush horns, and reverberant guitar solos built for dark highways and low-lit lounges after hours.',
    // 60th pass -- fresh contour, unused elsewhere on the roster: a slow
    // three-step rise (U U U), read as a guitar bend/turnaround reaching up
    // into a sustained note rather than resolving down. Slower tempo than
    // the rest of the roster to match the "slow burn" brief.
    ident: [293.7, 349.2, 415.3, 466.2],
    identTempo: 0.75,
    gain: 1.1,
    // 60th pass -- glyph reused from MOMENTUM by instruction to keep the
    // same spot and glyph, not reassigned for theme.
    glyph: '≡',
    static: 640,
    // 60th pass -- more bloom/flicker than MOMENTUM's calm signature: a
    // neon sign's glow and buzz, not a steady focus-lamp glow. Noise kept
    // low so it still reads as smooth/lounge rather than gritty.
    crt: { noise: 0.08, bloomAmt: 1.7, flicker: 0.09 },
    // 60th pass -- slower spring, heavier damping, lazier swing than
    // MOMENTUM: meters that lean and settle rather than tick.
    meter: { spring: 0.22, damping: 0.7, swing: 0.85 },
    // 60th pass -- NEON SIGN: the word BLUES in a hand-authored pixel font,
    // segments guttering on ambient flicker and a bass-onset buzz cascade,
    // with a soft glow halo. Replaces SKYLINE, which is kept below,
    // unassigned, per the usual convention (see VISUAL_METHODS).
    // 61st pass (live QA: too centered on screen, reads flat as just
    // "blues") -- NEON SIGN unassigned in turn,
    // replaced by BUBBLE TUBES: nine full-height glowing tubes across the
    // width, one per real spectrum band, filled VU-style with bubbles
    // rising through the glass. See VISUAL_METHODS' note near bubbletubes.
    visual: 'bubbletubes',
    tracks: [
      realTrack('CzUgX-HB9tA', 'The Thrill Is Gone', 'B.B. King'),
      realTrack('gy5-EQ7Ae_0', 'Midnight in Harlem', 'Tedeschi Trucks Band'),
      realTrack('790ggx1NM5Q', 'Born Under a Bad Sign', 'Albert King'),
      realTrack('WIZx30d17nI', 'Angel from Montgomery', 'Susan Tedeschi'),
      realTrack('ynEXb7zczrg', 'Skin Deep', 'Buddy Guy'),
      realTrack('QUKC-RHuJhQ', "Damn Right, I've Got the Blues", 'Buddy Guy'),
      realTrack('mLbzFvFyDjs', "I Can't Quit You Baby", 'Otis Rush'),
      realTrack('0M9CZH2Py3A', 'Blak and Blu', 'Gary Clark Jr.'),
      realTrack('__yipt201F8', 'Tin Pan Alley', 'Stevie Ray Vaughan'),
      realTrack('5t-FY-Q_nas', "I'd Rather Go Blind", 'Etta James'),
      realTrack('38OOUDTsqM0', 'Ain’t No Love in the Heart of the City', 'Bobby "Blue" Bland'),
      realTrack('SmGig_b2QLI', "I Can't Stand the Rain", 'Ann Peebles'),
      realTrack('2gQEDwjhaDE', 'Smoking Gun', 'Robert Cray'),
      realTrack('VMUt8KdDtTY', "Smokestack Lightnin'", 'Howlin’ Wolf'),
      realTrack('W4sXl8z2b0I', "Ain't No Sunshine", 'Freddie King'),
      realTrack('QpIvSX6nprg', 'Walk Across the Water', 'The Black Keys'),
      realTrack('7sa4AGq3wvU', 'Bright Lights, Big City', 'Jimmy Reed'),
      realTrack('ZzANjy5tGPM', 'Long Distance Call', 'Muddy Waters'),
      realTrack('L7Ls8ceHxhc', 'Riding with the King', "B.B. King & Eric Clapton"),
      realTrack('4yB1Pj2r5s4', 'Lenny', 'Stevie Ray Vaughan'),
    ] },

  // 4 new stations added 2026-08-20, tracklists as given, all
  // oEmbed-verified. Frequencies slotted into the gaps between the original
  // 5 (288.6 between RELIC SIGNAL/QUIET HOURS, 434.5 between QUIET
  // HOURS/COLD WAVE, 650.0 between COLD WAVE/THE STUDY, 878.9 past THE
  // STUDY toward the top of the band) so none of the original 5 moved.
  { id: 'city-lights', freq: 780.0, callsign: 'CITY LIGHTS', tagline: 'tokyo nights, city pop dreams',
    // 28th pass: renamed from HIGH RISE (option 7B). Same city pop lane,
    // same ident, same tracks -- name/tagline only.
    // 32nd pass: guide's per-station detail page (see drawGuidePageStation).
    // 49th pass, same-day follow-up: 650.0 -> 780.0 -- a nod to
    // Bay FM 78.0, a real Chiba/Tokyo-area station known for AOR and
    // city-pop rotation. Held back in round 10 with no gag found at the
    // time; this one only landed once MOMENTUM's move opened up room.
    freqNote: 'a nod to Bay FM 78.0, Tokyo\'s city-pop AOR station',
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
    // 50th pass -- glyphs reassigned to associate them with the vibe of
    // each station (e.g. yen symbol for city lights). This does NOT relax
    // the 41st pass's legibility-first rule, it just uses theme as the
    // tiebreak among glyphs that already pass it: every glyph below was
    // rendered live in a field of dial dots at NORMAL weight and checked
    // against the tuner's vertical bar before being assigned. 'Ω' -> '¥': yen, for a Japanese city-pop
    // station, the suggestion that started this pass.
    // 'Ω' moved to CIRCUIT CRUSH, which has a better claim on it.
    glyph: '¥',
    static: 1450,
    crt: { bloomAmt: 1.8, brightness: 1.38 },
    meter: { spring: 0.45, damping: 0.48, swing: 0.95 },
    // 45th pass -- RIPPLE: rain rings on a Tokyo night, the original
    // pitch for this station's visual.
    visual: 'ripple',
    tracks: [
      realTrack('5zTkTlj2h9E', 'Stay With Me', 'Miki Matsubara'),
      realTrack('tWqZASIxlqs', 'Sparkle', 'Tatsuro Yamashita'),
      realTrack('8ageCZxJ-WQ', '4:00AM', 'Taeko Onuki'),
      realTrack('4X7ZvpwBiKA', 'Flyday Chinatown', 'Yasuha'),
      realTrack('k-BrT2SQ7SI', "Cat's Eye", 'Anri'),
      realTrack('vUQjdwRno5g', 'Say Goodbye', 'Hiroshi Sato'),
      realTrack('k7VkzjSe5Ng', 'Moment Of Twilight', 'Minako Yoshida'),
      realTrack('XE45nsroFTE', 'Ride On Time', 'Tatsuro Yamashita'),
      realTrack('T_lC2O1oIew', 'Plastic Love', 'Mariya Takeuchi'),
      realTrack('XJWqHmY-g9U', 'Telephone Number', 'Junko Ohashi'),
      realTrack('B6O09Jx4ONM', 'Love Step', 'Miharu Koshi'),
      realTrack('1KP9dLRaKWg', 'Adventure', 'Momoko Kikuchi'),
      realTrack('4wVN8r14mT0', 'Midnight Girl', 'Toshiki Kadomatsu'),
      realTrack('WCaOX3PuKKo', 'Kimi no Heart wa Marine Blue', 'S. Kiyotaka & Omega Tribe'),
      realTrack('-YSwJh-4j1s', 'Loveland, Island', 'Tatsuro Yamashita'),
      realTrack('MH-P4mXvDPE', 'Rouge no Dengon', 'Yumi Matsutoya'),
      realTrack('ZhmiKjBEtbg', 'Sea Line', 'Toshiki Kadomatsu'),
      realTrack('Z056hRt23Fo', 'Remember Summer Days', 'Anri'),
      realTrack('NxfiM2SzqYo', 'Fantasy', 'Meiko Nakahara'),
      realTrack('C58nGJ6pn8Q', 'Purple Town', 'Junko Yagami'),
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
      realTrack('5a8BD7qNMZM', 'Silhouette Romance', 'Junko Ohashi'),
      realTrack('htXinB1eZYA', 'Manatsu no Sequence', 'Momoko Kikuchi'),
    ] },
  // 22nd pass -- outlaw channel dropped completely, 9 channels being the
  // max for now. OUTLAW (freq 288.6, spaghetti-western/outlaw-country)
  // removed outright rather than just renamed; its station-ID ident had
  // already been flagged as hard to hear, and 9 is the agreed ceiling for
  // now with HACKBACK's addition. If it comes back later, its full track
  // list (Johnny Cash, Ennio Morricone, Marty Robbins, Colter Wall, Nick
  // Cave, Tom Russell, Calexico) is in git history on this commit's parent.
  { id: 'circuit-crush', freq: 488.0, callsign: 'CIRCUIT CRUSH', tagline: 'analog glow, the long drive home',
    // 32nd pass: guide's per-station detail page (see drawGuidePageStation).
    // round 10, 2026-08-23 (easter-egg pass): 434.5 -> 438.8, an
    // "88 mph" nod (DeLorean time-travel) for a station about a drive that
    // never ends. Small enough that it doesn't reorder anything -- still
    // sits between DRIFT MODE and COLD WAVE with roughly the same gaps as
    // before (COLD WAVE moved too this pass, see its own field notes).
    // 49th pass, same-day follow-up: the 438.8 "88" gag read too
    // weak -- an 8 in the tens place and another after the decimal isn't
    // the same as the number actually reading "88"): 438.8 -> 488.0, a
    // clean 88. Same neighborhood, no reorder.
    freqNote: '88 mph, the DeLorean\'s time-travel speed',
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
    // 50th pass -- glyphs reassigned to associate them with the vibe of
    // each station. This does NOT relax
    // the 41st pass's legibility-first rule, it just uses theme as the
    // tiebreak among glyphs that already pass it: every glyph below was
    // rendered live in a field of dial dots at NORMAL weight and checked
    // against the tuner's vertical bar before being assigned. '¥' -> 'Ω': ohms. The most literal
    // "circuit" symbol available, and it was sitting on CITY LIGHTS where it
    // meant nothing -- a straight two-way swap with the yen.
    glyph: 'Ω',
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
      realTrack('-PKV79lug54', 'Redline', 'Lazerhawk'),
      realTrack('Y8DekFFCE5c', 'Humans Are Such Easy Prey', 'Perturbator'),
      realTrack('0x1tidUctv4', 'Body Talk', 'Mitch Murder'),
      realTrack('VUQxsBTqh1s', 'The Wrath of Code', 'Dan Terminus'),
      realTrack('Jv1ZN8c4_Gs', 'Fly For Your Life', 'GUNSHIP'),
      realTrack('Io6TL3RQ5zw', 'Black Rain', 'Miami Nights 1984'),
      realTrack('2KU9i_sx4zM', 'Tonight (feat. Back In The Future)', 'Timecop1983'),
      realTrack('G02wKufX3nw', 'In The Face Of Evil', 'Magic Sword'),
      realTrack('ntTRv7XUxM8', 'Cyanide Sisters', 'Com Truise'),
      realTrack('zYfs-bZS5Zw', 'Nightdrive With You', 'Anoraak'),
      realTrack('O0LB9cIobXY', 'Monochrome', 'Scandroid'),
      realTrack('IDd5JgAcLhI', 'Behemoth', 'GosT'),
      realTrack('LxIyc5qJGzQ', 'My Mistake', 'NINA'),
      realTrack('gzRbL_Jwtzw', 'DiscoDeath', 'Robert Parker'),
      realTrack('VE3QIvywZnU', 'Living the Modern Life', 'SelloRekt & LA Dreams'),
      realTrack('7fDvxlK2FMc', 'Le Perv (official video)', 'Carpenter Brut'),
      realTrack('UiSB2Fbw9gs', 'Days of Thunder', 'The Midnight'),
      realTrack('ssdA6IiP3r4', 'Arcade Summer', 'FM-84'),
      realTrack('hd9xGlXGNh0', 'Prelude to War', 'Volkor X'),
    ] },
  // 23rd pass: freq nudged 878.9 -> 854.9 -- stations 8 and 9 were too
  // close to each other. freqToCol() rounded 878.9 and HACKBACK's 893.7
  // to adjacent dial columns (73 and 74), so their preset triangles rendered
  // as a single "▲▲" glyph pair instead of two distinct ticks, despite the
  // 20th-pass comment on HACKBACK claiming they were "distinct". Re-split
  // the tail of the band (THE STUDY 823.1 up to FREQ_MAX 900) roughly evenly
  // across ATOMIC/HACKBACK instead.
  // 52nd pass -- stations 1, 6, and 9 needed similar short descriptions to
  // fit the format the others have: 6 of 9 taglines are a comma-paired
  // "mood, mood" fragment like DISTORTION FIELD's "raw nerve, '90s angst";
  // this one was a single unbroken clause. Reworded to the same shape
  // while keeping the "counter" gag the tagline was built around.
  { id: 'atomic', freq: 529.0, callsign: 'ATOMIC', tagline: 'atomic swing, radioactive nostalgia', // 19th pass: trimmed
    // 32nd pass: guide's per-station detail page (see drawGuidePageStation).
    // 49th pass, same-day follow-up: 854.9 -> 529.0, held back in
    // round 10 but revisited once MOMENTUM's freq move
    // freed up room -- 5:29 AM, the exact detonation time of the Trinity
    // test (July 16, 1945). Plays directly off "the counter clicks" --
    // a Geiger-counter gag for an atomic-age station. Lands clear of
    // CIRCUIT CRUSH (488.0) and MOMENTUM (567.8) on either side.
    freqNote: '5:29 AM, Trinity\'s detonation, July 16 1945',
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
    // 19th pass -- atomic playlist needed to be sourced from Fallout 4,
    // Fallout 76, etc. games. 5 of the original 10 tracks (Jump Jive An'
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
    // 50th pass -- glyphs reassigned to associate them with the vibe of
    // each station. This does NOT relax
    // the 41st pass's legibility-first rule, it just uses theme as the
    // tiebreak among glyphs that already pass it: every glyph below was
    // rendered live in a field of dial dots at NORMAL weight and checked
    // against the tuner's vertical bar before being assigned. '£' -> 'Ø': a nucleus with an orbital
    // slash. Doubles as the empty-set/void read, which suits an atomic-age
    // broadcast playing on after the fact. 'Θ' tested equally legible if
    // this ever reads too much like a zero.
    glyph: 'Ø',
    static: 900,
    crt: { noise: 0.17, flicker: 0.1, decay: 0.7, brightness: 1.2, maskAmt: 0.55 },
    meter: { spring: 0.5, damping: 0.45, swing: 0.85 },
    // 45th pass -- originally sparse Geiger clicks/hot-zone bursts (the
    // tagline's own "counter clicks" made literal). Redesigned in the 47th
    // pass into drifting blocky pixel clouds per live QA; dispatch key
    // ('counter'/drawCounterEffect) kept as-is, only the visual changed.
    // Replaced by GEIGER (50th pass), which is in turn replaced here
    // (52nd pass -- atomic needed an isotope map, picked from the
    // 4-concept atomic-concepts.html prototype). See VISUAL_METHODS' note
    // near ISOTOPE for why. 57th pass, 2nd rewrite: "Geiger
    // Click" picked instead off the visualizer-lab mock -- swapped to GEIGER
    // (drawGeigerEffect, rebuilt audio-reactive this pass). ISOTOPE stays
    // defined but unassigned, same as GEIGER sat unassigned before this.
    // 59th pass -- GEIGER replaced in turn by BLAST FIELD: not
    // reacting obviously enough to the music, needed something more
    // impressive and shifting, rebuilt from the ground up. GEIGER was a real
    // instrument (needle + arc + click) but a small one pinned to screen
    // center; BLAST FIELD fills the whole visualizer field with detonation
    // events keyed to real bass onsets. See VISUAL_METHODS' note near
    // blastfield for why, and the BLAST_* constants for tuning.
    visual: 'blastfield',
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
      realTrack('ad6EL-qTGl8', 'Orange Colored Sky', 'Nat King Cole'),
      realTrack('3IT8NoEe2_Q', 'Good Rocking Tonight', 'Roy Brown'),
      realTrack('WVgCo1L9yaY', 'Mr. Sandman', 'The Chordettes'),
      realTrack('CSW64jVTDF0', 'Sixteen Tons', 'Tennessee Ernie Ford'),
      realTrack('zhSSJRuGw4c', 'Ghost Riders in the Sky', 'Sons of the Pioneers'),
      realTrack('P1EG__jgefA', "Choo Choo Ch'Boogie", 'Louis Jordan & His Tympany Five'),
      realTrack('wf4nY0mLrrA', 'Boogie Woogie Bugle Boy', 'The Andrews Sisters'),
      realTrack('MiFSYJjvgwc', 'Shake, Rattle and Roll', 'Big Joe Turner'),
      realTrack('pJbDHw_qsFs', 'Sixty Minute Man', 'Billy Ward and His Dominoes'),
      realTrack('eP9nD0TsqEI', "It's a Sin to Tell a Lie", 'The Ink Spots'),
      realTrack('9A7vuGLocRw', 'Nightmare', 'Artie Shaw & His Orchestra'),
      realTrack('V1HiJR4KkaM', 'Crazy He Calls Me', 'Billie Holiday'),
      realTrack('F0qD-SKugUU', 'Way Back Home', 'Bob Crosby and the Bobcats'),
      realTrack('jq2kqNTHejM', 'Uranium Rock', 'Warren Smith'),
      realTrack('xfoseSZtllo', 'Sh-Boom', 'The Chords'),
      realTrack('zPJ7N5_o-u8', 'Money Honey', 'Clyde McPhatter & The Drifters'),
      realTrack('xFg6i2p8YQc', 'Rocket 88', 'Jackie Brenston & His Delta Cats'),
      realTrack('IIQFJGru-xI', "It's Only a Paper Moon", 'Nat King Cole'),
      realTrack('6VGDnqCV53w', 'Butcher Pete (Part 2)', 'Roy Brown'),
      realTrack('ayGkA-vxrMc', 'Into Each Life Some Rain Must Fall', 'The Ink Spots & Ella Fitzgerald'),
    ] },
  // 20th pass -- new channel added for 0 called Hackback, built around
  // artists like Tribe Called Quest, De La Soul, Slick Rick, Outkast, Wu
  // Tang, MF DOOM, MC Solaar -- golden-age/underground hip-hop station, bound to
  // the new preset key `0`.
  // 23rd pass: freq nudged 893.7 -> 888.7 -- see the freq comment on ATOMIC
  // above. 893.7 rounded to the dial column right next to ATOMIC's, so the
  // two preset triangles overlapped; this leaves a clear 3-column gap to
  // ATOMIC and reads as its own distinct tick near the top of the band.
  // 28th pass: tagline updated to "golden age hip-hop, west coast legends,
  // deep cuts" (option 9A, tagline option b) -- name (HACKBACK) unchanged.
  // Comment above is stale against what actually shipped -- the live
  // tagline had been condensed to one unbroken clause somewhere along the
  // way, dropping the comma pairing 6 of 9 taglines use (DISTORTION
  // FIELD's "raw nerve, '90s angst" etc). 52nd pass -- stations 1, 6, and 9
  // needed similar short descriptions to fit the format the others have,
  // restoring the original 28th-pass comma shape, trimmed to two
  // fragments like the others rather than three.
  // Same pass, follow-up: is hackback truly all west coast
  // legends, when there are east coast rappers on there too -- correct:
  // the 25-track roster below is A Tribe Called Quest/De La Soul/
  // Wu-Tang/Nas/Gang Starr/Pete Rock & C.L. Smooth/Digable Planets/MF DOOM/
  // Black Star (all NY) alongside Dre/Ice Cube/Warren G/2Pac/Snoop/Cypress
  // Hill (West Coast) and Outkast (Atlanta) -- genuinely coast-to-coast,
  // if anything NY-heavy. "West coast backbone" was wrong in both the
  // tagline and the desc field below (same error, inherited from an old
  // 28th-pass framing neither of us checked against the actual tracklist).
  { id: 'hackback', freq: 808.0, callsign: 'HACKBACK', tagline: 'golden age hip-hop, coast to coast legends',
    // 32nd pass: guide's per-station detail page (see drawGuidePageStation).
    // round 10, 2026-08-23 (easter-egg pass): 888.7 -> 808.0 --
    // the Roland TR-808, the single most influential drum machine in
    // hip-hop production. Was the top of the dial (preset `9`); now sits
    // between CITY LIGHTS and MOMENTUM instead, which bumps MOMENTUM
    // `7` -> `8` and ATOMIC `8` -> `9` even though neither of their own
    // frequencies moved -- presets changing is fine as
    // long as all of those changes ripple across documentation and
    // interface (STATION_PRESET_ORDER is freq-sorted, so the Guide index/
    // detail pages, the preset strip, and the dial all pick this up
    // automatically -- see stations.md, regenerated this same pass, for
    // the written record).
    freqNote: 'the Roland TR-808, hip-hop\'s drum machine',
    desc: 'Golden-age hip-hop coast to coast -- classic boom-bap, deep cuts, and a few legends who never needed a feature to prove it.',
    // 25th pass: was a straight descent, same shape as 3 other stations --
    // now a rise then a hard drop (U U D), like a boom-bap tag snapping
    // down on the beat, with a tight/punchy identTempo to match.
    ident: [220.0, 293.7, 349.2, 293.7],
    identTempo: 0.8,
    // 25th pass: modern hip-hop masters are already loud/compressed -- no
    // boost.
    gain: 1.0,
    // 41st pass -- see the field notes on DISTORTION FIELD above. thicker scanlines, a touch more grain
    // 50th pass -- glyphs reassigned to associate them with the vibe of
    // each station. This does NOT relax
    // the 41st pass's legibility-first rule, it just uses theme as the
    // tiebreak among glyphs that already pass it: every glyph below was
    // rendered live in a field of dial dots at NORMAL weight and checked
    // against the tuner's vertical bar before being assigned. '%' -> '¶': a pilcrow, i.e. a verse
    // mark -- bars and verses, for a golden-age hip-hop station.
    glyph: '¶',
    static: 1150,
    crt: { noise: 0.15, bloomAmt: 1.5, scanMax: 0.75 },
    meter: { spring: 0.42, damping: 0.5, swing: 0.95 },
    // 45th pass -- BOOM BAP: a 16-step MPC sequencer under heavy drifting
    // scanline bands, matching this station's own thicker-scanlines CRT
    // trait, name taken straight from this station's own desc field.
    visual: 'boombap',
    // v0.8: "California Love" swapped to the Short Radio Edit upload below
    // -- the previous ID was the full-length version with
    // the spoken intro; this cut starts straight into the song.
    tracks: [
      realTrack('D-uV8TGjaGU', 'Can I Kick It?', 'A Tribe Called Quest'),
      realTrack('P800UWoE9xs', 'Award Tour', 'A Tribe Called Quest'),
      realTrack('jdtKT5q-CW8', 'Me Myself and I', 'De La Soul'),
      realTrack('WX6G6sODMrQ', 'Buddy', 'De La Soul'),
      realTrack('qrOKZeCdaRM', 'Rosa Parks', 'Outkast'),
      realTrack('EUVo8epKwv0', 'Ms. Jackson', 'Outkast'),
      realTrack('4yNQ7_7I5aE', 'C.R.E.A.M.', 'Wu-Tang Clan'),
      realTrack('LMeluRz2wv4', 'Doomsday', 'MF DOOM'),
      realTrack('lZXtabqDY-c', "It Ain't Hard to Tell", 'Nas'),
      realTrack('R0IUR4gkPIE', 'Protect Ya Neck', 'Wu-Tang Clan'),
      realTrack('mEgTtsHUnrQ', 'Mass Appeal', 'Gang Starr'),
      realTrack('cM4kqL13jGM', 'Rebirth of Slick (Cool Like Dat)', 'Digable Planets'),
      realTrack('i4B5VcoaS9s', "Nuthin' But A \"G\" Thang", 'Dr. Dre'),
      realTrack('LcF2KUJVdLE', 'It Was A Good Day', 'Ice Cube'),
      realTrack('a-mAK3uB2_0', "Passin' Me By", 'The Pharcyde'),
      realTrack('1plPyJdXKIY', 'Regulate', 'Warren G'),
      realTrack('0xZHe8Q8Mlk', 'They Reminisce Over You (T.R.O.Y.)', 'Pete Rock & C.L. Smooth'),
      realTrack('KKA9rMWbygw', 'Check Yo Self', 'Ice Cube'),
      realTrack('ru2IrTY2UG0', 'Accordion', 'MF DOOM (Madvillain)'),
      realTrack('hI8A14Qcv68', 'N.Y. State of Mind', 'Nas'),
      realTrack('TgelVkHEKdw', 'DWYCK', 'Gang Starr'),
      realTrack('EuJaStSL0xM', 'Definition', 'Black Star'),
      realTrack('fXJc2NYwHjw', "93 'til Infinity", 'Souls of Mischief'),
      realTrack('RijB8wnJCN0', 'Insane in the Brain', 'Cypress Hill'),
      realTrack('J7_bMdYfSws', 'California Love', '2Pac feat. Dr. Dre & Roger Troutman'),
      realTrack('cKu3_3mp1U8', 'Let Me Ride', 'Dr. Dre'),
      realTrack('z5rRZdiu1UE', 'Sabotage (Official Music Video)', 'Beastie Boys'),
      realTrack('E7t8eoA_1jQ', 'Paid In Full', 'Eric B. & Rakim'),
      realTrack('O0uoB45_Uns', 'Stray Bullet', 'Organized Konfusion'),
    ] },
  // 52nd pass -- stations 1, 6, and 9 needed similar short descriptions to
  // fit the format the others have. Was a bare two-word tagline; added
  // a second comma-paired fragment (genre + late-night mood, echoing the
  // desc's own "late-night infiltration runs") to match the "mood, mood"
  // shape 6 of 9 taglines already use.
  { id: 'cipher', freq: 133.7, callsign: 'CIPHER', tagline: 'digital infiltration, late-night breakbeat',
    // 28th pass (2026-08-21): New cyberpunk station, hacker movies/synthwave
    // aesthetic (locked-in name/tagline per the naming pass). Placed
    // at 219.8, the frequency freed by RELIC SIGNAL's retirement (see the
    // retirement comment above DRIFT MODE) -- keeps the roster at 9
    // stations total rather than growing to 10.
    // 48th pass (2026-08-22, v0.8): moved 219.8 -> 133.7 -- a "1337" nod
    // that fits CIPHER's own hacker theme -- which drops it under
    // DISTORTION FIELD and swaps their preset order: CIPHER is now key
    // `1`, DISTORTION FIELD key `2` (stations 1 and 2 swapped, station 1
    // set to 133.7). STATION_PRESET_ORDER is
    // freq-sorted, so this one change was the entire swap. A follow-up
    // patch then moved DISTORTION FIELD's own freq too, 137.4 -> 194.8 --
    // see its field notes -- once the two ended up only 3.7 KHZ apart.
    // 32nd pass: guide's per-station detail page (see drawGuidePageStation).
    freqNote: '"1337," leet speak for the hacker theme',
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
    // Twin tracks (Windowlicker, Come to Daddy), and
    // added The Prodigy's "Omen" (oEmbed-verified, official Prodigy
    // channel upload). Now 22 -- Song of Life (Leftfield) re-added
    // during the roster-wide "bring every station to
    // ~20" pass. Note: this exact track is the one signal-dev's notes
    // flag as having stalled at IFrame state UNSTARTED during a live
    // verification pass despite a clean oEmbed 200 -- not dead, just
    // worth a second look if it ever seems to hang on lock.
    // 41st pass -- see the field notes on DISTORTION FIELD above. crystalline; more colour fringe and a tighter grille, meters twitch
    // 2026-08-24: pulled 4 unwanted tracks from the station --
    // "Hey Boy Hey Girl" (Chemical Brothers, has dialogue mid-video), "Where's
    // Your Head At" (Basement Jaxx, construction-noise SFX in the video), "At
    // the River" (Groove Armada, too slow for the channel), and "Finished
    // Symphony" (Hybrid, disliked for its length). Down from 26 to 22.
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
    // 2026-08-24: +16 tracks from a hand-picked list, all
    // oEmbed-verified (200) before landing. "Finished Symphony"
    // (Hybrid) and "Windowlicker" (Aphex Twin) were offered back in from the
    // same list -- both had been deliberately removed already, so neither
    // is here. 12 of the 16 are official/VEVO/label uploads; 4
    // (Def Beat, Stem/Long Stem, Ni-Ten-Ichi-Ryu, Genius) are the only
    // uploads found and come from non-official reupload channels -- real
    // and embeddable now, flagged and approved for inclusion anyway.
    // Up from 22 to 38.
    tracks: [
      realTrack('wmin5WkOuPw', 'Firestarter', 'The Prodigy'),
      realTrack('xMVTKOoy1uk', 'Omen', 'The Prodigy'),
      realTrack('iTxOKsyZ0Lw', "Block Rockin' Beats", 'The Chemical Brothers'),
      realTrack('3SwwljI-8JY', 'Halcyon', 'Orbital'),
      realTrack('yJnve05CnNE', 'The Box', 'Orbital'),
      realTrack('u7K72X4eo_s', 'Teardrop', 'Massive Attack'),
      realTrack('QmKE9zKYx0g', 'Song of Life', 'Leftfield'),
      realTrack('XiMrrleH_hI', 'Born Slippy .NUXX', 'Underworld'),
      realTrack('F6Y7lcvubhU', 'Rez', 'Underworld'),
      realTrack('DzNex7Mf1bg', 'Clubbed to Death (Kurayamino Mix)', 'Rob Dougan'),
      realTrack('7xI8mCKLiRM', 'Prime Audio Soup', 'Meat Beat Manifesto'),
      realTrack('iCBL33NKvPA', 'Spybreak!', 'Propellerheads'),
      realTrack('OjTC88oIRys', 'Busy Child', 'The Crystal Method'),
      realTrack('XAlLaGhfLq4', 'B-Boy Stance', 'Freestylers'),
      realTrack('ub747pprmJ8', 'Right Here, Right Now', 'Fatboy Slim'),
      realTrack('8B-i1vsA6jw', 'Sour Times', 'Portishead'),
      realTrack('svJvT6ruolA', 'No Good (Start the Dance)', 'The Prodigy'),
      realTrack('Xu3FTEmN-eg', 'Galvanize featuring Q-Tip (Official Music Video)', 'The Chemical Brothers'),
      realTrack('IKTJoHbKZO0', "\"Can't You Trip Like I Do\" [Official Video]", 'The Crystal Method'),
      realTrack('WrDXJp-uDoY', "Bentley's Gonna Sort You Out", 'Bentley Rhythm Ace'),
      realTrack('NxsevNnHfzs', 'The Gift', 'Way Out West'),
      realTrack('m7CYzc1naaw', 'Keep Hope Alive', 'The Crystal Method'),
      realTrack('PHMzCpy0fXc', 'Atom Bomb', 'Fluke'),
      realTrack('maP6q3D4Hf0', 'Leave You Far Behind', 'Lunatic Calm'),
      realTrack('hbe3CQamF8k', 'Angel', 'Massive Attack'),
      realTrack('d0PCD7YMfeY', "Ain't Talkin' 'bout Dub", 'Apollo 440'),
      realTrack('6QCXpHdW9ak', 'Papua New Guinea', 'Future Sound of London'),
      realTrack('MwZmPJFNVbw', 'Supermoves', 'Overseer'),
      realTrack('Wuwfe3DRJzE', '6 Underground', 'Sneaker Pimps'),
      realTrack('7qZW9P7W-nc', 'Def Beat', 'Junkie XL'),
      realTrack('Ihr0y7ayGV0', 'Stem / Long Stem', 'DJ Shadow'),
      realTrack('7lVH1Pym9Ik', 'Ni-Ten-Ichi-Ryu', 'Photek'),
      realTrack('Jd_UCgMaHYQ', 'Dirt', 'Death in Vegas'),
      realTrack('XrFECnl3vno', 'Lonely Soul', 'UNKLE'),
      realTrack('9ZJTM03UByU', 'Black Steel', 'Tricky'),
      realTrack('sGcdcVblZ-8', 'Genius', 'Pitchshifter'),
      realTrack('YV78vobCyIo', 'Voodoo People', 'The Prodigy'),
      realTrack('DAQISes7iXU', 'Absurd', 'Fluke'),
    ] },
]

// Preset-key ordering (17th pass -- presets needed to match the tuning
// band left to right) -- STATIONS above is ordered however stations were
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

// SECRET_STATIONS (2026-08-22 -- launched a secret NIN station,
// only reachable by pressing 0") -- an array even though NIN is currently
// the only entry (a second, GREEN HOUSE, was built and pulled before
// shipping 2026-08-24 -- see the comment right above SECRET_STATIONS'
// definition), because every call site below was already generalized to
// walk this array rather than a single hardcoded station. Deliberately NOT
// part of STATIONS: that keeps every entry out of everything that walks
// STATIONS or STATION_PRESET_ORDER -- nearestStation() (so none can ever
// be found by seeking/scanning), stations-to-md.js's generated roster doc,
// and the Guide's station index and detail pages (guideTotalPages() is
// 2 + STATION_PRESET_ORDER.length, so none even gets a page). The only way
// in for each is its own dedicated key handler below, which calls
// presetTune() on the object directly. Every place that used to read a
// single hardcoded SECRET_STATION now either walks SECRET_STATIONS
// (nearestLockable/nearestSignal, so every entry's carrier shows up on the
// meters while sweeping past) or checks station.secret generically
// (announce/phosphor logic) instead of comparing against one hardcoded id
// -- see each call site's own comment.
//
// NIN_STATION: frequency was 777.7 (CIPHER's old slot from before it moved
// to 219.8, 28th pass) through the 48th pass.
// 49th pass, same-day follow-up: too close to an existing
// station, having been picked at random originally -- 777.7 -> 613.0 -- CITY LIGHTS'
// round-10 move to 780.0 landed only 2.3 KHz away, close enough that
// applySecretTease's tint bleed would start creeping in on anyone just
// tuning past CITY LIGHTS normally. 613.0 is a real NIN reference instead
// of an arbitrary pick: the runtime of "Hurt" (The Downward Spiral,
// 1994), the band's most widely recognized song. Sits in the open gap
// between MOMENTUM (567.8) and CITY LIGHTS (780.0) -- ~45 KHz clear of
// MOMENTUM, ~167 clear of CITY LIGHTS, further from every neighbor than
// any public station is from its own. (Most other NIN numeric references
// -- album years 1989/1994/1999 -- collide with DISTORTION FIELD's own
// 199.7 "1997" gag, same decade by design; runtime dodges that entirely.)
const NIN_STATION = {
  id: 'nin', freq: 613.0, callsign: 'NINE INCH NAILS', tagline: 'industrial rage, mechanical dread',
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
  // 50th pass -- the station itself needed to cause more glitches and
  // effects overall while tuned. The roll/tear idle events run at
  // 12-30s here instead of the roster default 90-210s, and the grind layer
  // (crtGrind: small chroma/roll stabs, every 4-9s) runs on top. Both
  // starting values, expected to be tuned live against the dev server.
  idleEvent: { minS: 12, maxS: 30 },
  grind: { minS: 4, maxS: 9 },
  // 45th pass -- DREAD: a flickering panel grid with full-row tears, the
  // most hostile visual on the roster, fitting for the one station that
  // isn't supposed to be found.
  visual: 'dread',
  // 2026-08-23 -- explicit forced tint, read generically by
  // applyPhosphor()/applySecretTease() rather than a hardcoded 'red', so
  // any future SECRET_STATIONS entry can carry its own forced color too
  // (built for GREEN HOUSE's purple, which was pulled before shipping --
  // see SECRET_STATIONS' own comment).
  forcedPhosphor: 'red',
  tracks: [
      realTrack('nOVW938sr0k', 'Head Like a Hole', 'Nine Inch Nails'),
      realTrack('eQy0MSchVnM', 'Terrible Lie', 'Nine Inch Nails'),
      realTrack('L0WWoJz4cHM', 'Something I Can Never Have', 'Nine Inch Nails'),
      realTrack('eTYU94s6bbc', 'Wish', 'Nine Inch Nails'),
      realTrack('PTFwQP86BRs', 'Closer', 'Nine Inch Nails'),
      realTrack('-ZJvHXm4cYM', 'March of the Pigs', 'Nine Inch Nails'),
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
      realTrack('pDXSTAqVwo8', 'Piggy (VEVO Presents)', 'Nine Inch Nails'),
      realTrack('QrrEo3hZABU', 'Down In It', 'Nine Inch Nails'),
    ],
}

// 2026-08-24: GREEN HOUSE dropped, passed on for now, pending further
// consideration -- a second secret station (GREEN HOUSE, UK jungle/
// dub, reachable by Shift+0) was built and QA'd here but pulled before
// shipping. Left as a single-entry array rather than reverting back to a
// bare SECRET_STATION constant: the generalization (this array,
// nearestLockable/nearestSignal spreading it, station.secret checks
// instead of an id comparison, applyPhosphor/applySecretTease reading
// forcedPhosphor generically) is unrelated to whether GREEN HOUSE itself
// ships, already tested working for NIN alone, and is what tools/
// network.html's own parser now expects -- reverting the array shape
// would just mean redoing this same refactor if a second station comes
// back later. Adding one back is a single object literal plus one line
// here, whenever that decision is made.
const SECRET_STATIONS = [NIN_STATION]

// --- layout (80x25 grid) -----------------------------------------------

// Re-spaced 2026-08-20 (4th pass) -- boxed layout. Previous passes fixed
// vertical spacing and moved VOL/SIG below the band, but everything still
// read as loose floating text lines. Elements needed
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
// the same thing, so the transient one was redundant -- a cool idea but
// no longer needed. This row is genuinely free again except
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
// higher-priority slot right under the tuner, for better priority and user
// experience.
// 7th pass (same day): split the single ON AIR box into two -- STATION
// (callsign + tagline, identity, doesn't change on a track skip) and NOW
// PLAYING (title/artist + progress bar + play state, changes on every
// track). Station info needed to be broken out from current
// playing song info, since combined it read as one blob.
// 8th pass (same day): the progress bar and play-state indicator merged
// onto one PLAYBACK_Y row (drawPlayback) -- they're both about playback
// status and there was no reason they needed separate lines. That freed a
// row, spent on a blank divider inside LEVELS between the real VOL/SIG
// meters and the decorative VU row, so VU reads as its own thing instead
// of fusing into one solid block with the meters above it (previously
// read as one levels blob).
// 9th pass (same day): VOL needed further separation from SIG too,
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

// LEVELS split (18th pass -- room down in the levels area could be halved,
// with levels on one side and something else on the
// other) -- VOL/SIG/VU meters, which never actually needed the box's full
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
// 50th pass -- the visualizer's effect canvas used to run rows 1..HINT_Y1-1
// (i.e. through 22) with a two-row footer under it. The track position bar
// (live QA: an inline bar on the track row bumps into the title
// on longer song/artist pairs, which it does -- 44 cols for a title is not
// enough often enough) got its own row, so every effect stops one row
// earlier and the footer is three rows instead of two. Effects bound their
// loops with VIZ_BOT rather than HINT_Y1 for exactly that reason; anything
// that still says HINT_Y1 inside an effect is a bug that will get painted
// over by the footer every quarter second.
//
// The bar sat on TOP of the footer at first, drawn non-inverse so its fill
// read lit-on-dark like the NOW PLAYING bar does. Live QA flagged it as
// feeling out of place on the top row, better suited to the
// bottom row, inverted -- right on both counts. On top it read as a
// stray element floating between the effect and the chrome; on the bottom,
// inverse like the two rows above it, the whole footer reads as one solid
// block with the bar as its base. The polarity flips as a consequence and
// that turns out to be the better look anyway: on an inverse row '█'
// rasterises DARK and the trough stays lit (see term.js's `inv ? !on :
// on`), so progress reads as a dark bar eating into a lit strip.
//
// The visualizer no longer reuses HINT_Y1/HINT_Y2 for its own two text
// rows either -- those are the MAIN screen's hint rows (23/24) and the
// footer now starts a row above them.
const VIZ_BOT = 22
const VIZ_INFO_Y1 = VIZ_BOT
const VIZ_INFO_Y2 = VIZ_BOT + 1
const VIZ_BAR_Y = VIZ_BOT + 2

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
// 2026-08-22, round 3 -- status was bumped up too close to
// the header, moved from row 2 to row 3, trading away the blank row
// that used to sit between status and the STATION box.
// 2026-08-22, round 4 -- reverted back to row 2. The real problem wasn't
// this row's position, it was that mobileDrawChrome() painted an inverse
// (highlighted) blank across row 1 too, so the header read as a two-row
// bar with status crowded right under it regardless of which row status
// was on. With that fixed (see mobileDrawChrome), row 1 is real blank
// space again and this can go back to where it was -- which also restores
// the gap between status and the STATION box that round 3's move had
// traded away -- round 4 needed that gap restored.
const MSTATUS_Y = 2
const MSTATION_TOP_Y = 4
// Hints are pinned to the bottom of the 22-row grid. Everything between the
// STATION box and the hints -- NOW PLAYING, the widget row -- is computed by
// mobileLayout() below rather than fixed, so a one-line tagline or track
// title actually reclaims its row instead of leaving it blank.
const MHINT_Y1 = 20
const MHINT_Y2 = 21
// 2026-08-22 -- VU and signal were too close to each other, so they were
// put on the same line, spread out from each other. VU sits left
// of this column, SIG sits right of it, on one shared widget row instead of
// two stacked ones. Column left blank as the gap between them rather than
// drawing a divider glyph -- the STATION/NOW PLAYING boxes are the only
// bordered elements on this screen, and a widget row divider would compete
// with them.
const MWIDGET_DIVIDER_X = 21

// 2026-08-22 -- the layout of text in the boxes wasn't using the
// space well, and there was room to put some fun things below now playing. Row
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
  // 2026-08-22, round 3 -- needed another space under now playing and
  // the widgets. That gap has to come from somewhere in a fixed 22-row
  // grid, so this donates the blank row that used to sit between the
  // STATION box and the NOW PLAYING box (npTop was stationBot+2): the two
  // boxes now sit flush against each other, and the reclaimed row moves
  // down to separate npBot from widgetRow instead, which is the gap that
  // was actually asked for this round.
  const npTop = stationBot + 1
  const npTrack1 = npTop + 1
  const npTrack2 = trackLines >= 2 ? npTop + 2 : null
  const npArtist = npTop + 1 + trackLines
  // 2026-08-22 -- needed a now playing bar with playback bar etc like
  // the full version. One more row inside the box for the
  // progress bar, same place desktop's PLAYBACK_Y sits relative to TRACK_Y.
  const npProgress = npArtist + 1
  const npBot = npProgress + 1
  // 2026-08-22 -- VU and signal were too close to each other, spread out
  // onto the same line, then the fld changing number widget and a more
  // obvious mute off/on were added --
  // two widget rows: VU|SIG, then FLD|MUTE directly below.
  // 2026-08-22, round 2 -- needed some space vertically between the
  // first row of widgets and the second. One full blank row before
  // widgetRow2.
  // 2026-08-22, round 3 -- widgetRow itself moved back off npBot (was +1,
  // i.e. no gap at all) to +2, using the row donated by npTop above, so
  // there's now a blank row between the NOW PLAYING box and the widgets too.
  // Worst case (2-line tagline + 2-line title) still lands widgetRow2 one
  // row before MHINT_Y1 with no overlap -- verified in mobileLayout(2,2).
  const widgetRow = npBot + 2
  const widgetRow2 = widgetRow + 2
  return {
    tagLines, trackLines,
    stationTop: top, stationCall, stationTag1, stationTag2, stationBot,
    npTop, npTrack1, npTrack2, npArtist, npProgress, npBot,
    widgetRow, widgetRow2,
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

// Date/time module (15th pass -- added date and time as a
// module). Fixed-width "MM/DD HH:MM" (always 11 chars) so drawClock() can
// write it in place every tick without needing to blank first.
// 16th pass -- seconds were distracting, and too dim/wrong spot in
// the title bar -- dropped :SS. The tick timer still fires every second
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
// the whole name and title needed to stay visible, using
// additional lines as needed. Greedy fill; if there's still leftover text
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
 *  pass -- the same artist should not be listed more than once). Walks the
 *  array in its existing order rather than reshuffling, so the sample
 *  still reflects what's actually first in rotation -- it just skips a
 *  repeat artist's 2nd/3rd song in favor of the next distinct one, rather
 *  than picking artists at random.
 *
 *  35th pass BUG FIX -- Brian Eno as a sample track didn't work on
 *  drift mode's guide page: the original dedup keyed on the exact
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
// 2026-08-22 -- made it possible to lock into the station
// using the tuner by going to 777.7 even though it is a "hidden" station
// -- includes SECRET_STATIONS alongside STATIONS, so seeking/dragging/
// scanning the dial onto 777.7 can land and lock on it same as any real
// preset. It's still "hidden" in every other sense: not in
// STATION_PRESET_ORDER, so it never appears in the Guide, stations.md, the
// 1-9 preset keys, or the preset-position strip -- this is the one place
// that intentionally makes it reachable by tuning alone, on top of the
// dedicated 0 key.
// 41st pass -- the NIN station being
// discoverable by just going back and forth seeking felt wrong; it should only happen
// when you hit 0. This reverses the 2026-08-22 decision described above, but
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
//
// 50th pass (third revision of this policy -- each one a real
// decision, not churn: 0-only -> fully tunable -> 0-only -> now this):
// the NIN channel needed to be something you can seek with tuning arrows and then
// have to hit enter to lock on. The 41st-pass split above already carries
// most of it; what changes is a THIRD question, split out of tryLock():
//
//   nearestLockable() -- "what can ENTER lock onto from here?" Real
//     stations AND the secret station. Only tryLock()'s un-forced path
//     (the Enter key) uses it. seekStep()'s land-on-lock and scan stay on
//     nearestStation(), so sweeping/scanning past 613.0 still refuses to
//     auto-lock -- the meters climb, the hiss clears, the red bleeds in,
//     and the set waits for a deliberate Enter. Discovery now works like a
//     real DX catch: notice the carrier, stop, and commit.
//   '0' still works too (presetTune -> tryLock forced, bypasses all of
//     this). Persistence still never restores the secret station across
//     reloads (the restore path looks stations up in STATIONS only) --
//     deliberate: the catch resets every visit.
function nearestLockable(freq) {
  let best = null, bestDist = Infinity
  for (const ch of [...STATIONS, ...SECRET_STATIONS]) {
    const d = Math.abs(ch.freq - freq)
    if (d < bestDist) { bestDist = d; best = ch }
  }
  return { station: best, dist: bestDist }
}
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
  for (const ch of [...STATIONS, ...SECRET_STATIONS]) {
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
  // (8/20: station id tone for static bloom reported inaudible --
  // it's usually the first station tried after a fresh page load, i.e.
  // the first sound the context ever plays). Nudging resume() on every
  // call is a no-op once running, so this just self-heals the first call
  // instead of only fixing it retroactively on the second one.
  if (actx.state === 'suspended') actx.resume().catch(() => {})
  return actx
}
// 50th pass -- mute needed to mute everything including static and
// other sounds, as if the speaker of the device was hard muted, without
// muting the ambient hum since that would break immersion. A single master
// speaker bus every ELECTRONIC sound routes through, so [M] can kill the
// whole speaker path in one place instead of 15 per-function mute checks.
// Deliberate bypasses, connected straight to ctx.destination as before:
//   startTubeHum()      -- the chassis itself, not the speaker (an
//                          explicit carve-out; consistent with the 42nd
//                          pass's "mute does not duck the hum" decision).
//   playRelayThunk()    -- the mute switch's own mechanical clunk. A real
//                          hard-mute switch still clunks, and without it
//                          un-muting would give no feedback at all.
//   playPowerOn/DownSound() -- the power switch mechanism, same logic.
// Everything else (static bed, seek hiss, idents, lock tone, key clicks,
// detents, boot ticks, band bump, panel sweep, mode thump, preset whoosh,
// static bursts) is speaker audio and dies with the speaker.
// Lazy like actx itself; speakerMuted is tracked module-level so a bus
// created AFTER a persisted muted state was restored still comes up muted.
let speakerBusNode = null
let speakerMuted = false
function speakerOut(ctx) {
  if (!speakerBusNode) {
    speakerBusNode = ctx.createGain()
    speakerBusNode.gain.value = speakerMuted ? 0 : 1
    speakerBusNode.connect(ctx.destination)
  }
  return speakerBusNode
}
function setSpeakerMuted(muted) {
  speakerMuted = muted
  if (!speakerBusNode || !actx) return
  try {
    const t = actx.currentTime
    // linearRamp, not exponential -- exponential can never actually reach
    // 0. Short enough to feel instant, long enough not to click.
    speakerBusNode.gain.cancelScheduledValues(t)
    speakerBusNode.gain.setValueAtTime(speakerBusNode.gain.value, t)
    speakerBusNode.gain.linearRampToValueAtTime(muted ? 0 : 1, t + 0.015)
  } catch (e) {}
}
// Static burst for manual seeking (11th pass -- static was needed
// as you seek manually) -- replaces the old per-step playTick(),
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
    src.connect(filter).connect(gain).connect(speakerOut(ctx))
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
    osc.connect(gain).connect(speakerOut(ctx))
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
      osc.connect(gain).connect(speakerOut(ctx))
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
// 21st pass (0.3 wishlist: static intensity scales with distance
// from a station) -- the noise bed used to sit at one fixed gain the whole
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
    src.connect(filter).connect(gain).connect(speakerOut(ctx))
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

// Ambient tube hum (42nd pass -- parked at the 38th pass, built now for
// dev-environment testing) -- a continuous,
// very quiet noise floor while the set is powered on: a ~60Hz fundamental
// plus its second harmonic, with a touch of lowpassed noise underneath so it
// reads as a chassis rather than a test tone. Mirrors startStaticNoise()/
// stopStaticNoise()'s shape deliberately -- module-level handles, idempotent
// start, ramped in/out rather than started/stopped hard -- but is its own
// independent audio graph, not a mode of the static bed, since it needs to
// keep running underneath scanning/seeking/locked alike.
// Deliberately NOT gated on this.muted (2026-08-22): mute is the
// "make the broadcast stop" control, and the hum isn't part of the
// broadcast -- it's the set's own noise floor, on for as long as the set is
// on, same as a real tube amp still hums after you've turned the volume
// down. Only powerUp()/powerDown() start and stop it.
let humNodes = null
// 2026-08-22: doubled from the original 0.012 starting guess, following
// dev-server QA. Note this now sits slightly ABOVE
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

// Keypress click (32nd pass -- a keypress sound to help sell the
// terminal vibe) -- fires once per key() call, before anything else, so
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
    src.connect(filter).connect(gain).connect(speakerOut(ctx))
    src.start(t)
  } catch (e) {}
}

// --- 38th pass: event-feedback sound effects ---------------------------
//
// Sounds were needed as the boot happens and each item
// appears, to cover the remaining gaps. SIGNAL already had ambient sound
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
    osc.connect(gain).connect(speakerOut(ctx))
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
    src.connect(filter).connect(gain).connect(speakerOut(ctx))
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
      osc.connect(g).connect(speakerOut(ctx))
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
    osc.connect(g).connect(speakerOut(ctx))
    osc.start(t)
    osc.stop(t + 0.13)
  } catch (e) {}
}

/** Band edge. NOTE (38th pass): the 21st pass deliberately made arrow
 *  seeking WRAP at FREQ_MIN/FREQ_MAX rather than stop dead -- arrow
 *  scrolling needed to be able to cycle to the other side of
 *  the tuning band since scan can do it -- so this is not the hard
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
    osc.connect(g).connect(speakerOut(ctx))
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
    src.connect(lp).connect(ng).connect(speakerOut(ctx))
    src.start(t)
  } catch (e) {}
}

// Power down/up sweeps (12th pass -- a power on and
// power down sequence). Same tube-electronics logic as a real set: powering
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
    src.connect(gain).connect(speakerOut(ctx))
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

// Preset "tune-in" whoosh (14th pass -- a fun tune-in whoosh when
// jumping straight to a preset (1-9), versus the plain lock tone). Plays
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
    src.connect(filter).connect(gain).connect(speakerOut(ctx))
    src.start(t)
    src.stop(t + 0.36)
  } catch (e) {}
}

// 54th pass -- small mechanical touches: a preset-button click,
// distinct from the generic key tap. playKeyClick() already fires for
// every mapped key including 1-9/0/[B] -- that is the abstract "a key was
// pressed" feedback. This is the physical preset button itself: lower and
// firmer, same relationship playDetent() has to playKeyClick() on the
// volume keys. Lives in presetTune() rather than the key() case blocks so
// it fires uniformly for every path that reuses the same sweep -- [B] back
// and mobile's stepStation() swipe included, same reasoning playPresetWhoosh()
// already uses.
function playPresetClick() {
  try {
    const ctx = audioCtx()
    const t = ctx.currentTime
    const n = Math.floor(ctx.sampleRate * 0.02)
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 420
    filter.Q.value = 1.4
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.22, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045)
    src.connect(filter).connect(gain).connect(speakerOut(ctx))
    src.start(t)
  } catch (e) {}
}

// localStorage persistence (14th pass -- persistence approved).
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
      // 65th pass -- per-station [Shift+C] visualizer picks, same
      // treatment as the phosphor/volume/mute preferences above.
      visualOverrides: program.visualOverrides || {},
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
    src.connect(filter).connect(gain).connect(speakerOut(ctx))
    src.start(t)
    src.stop(t + duration + 0.02)
  } catch (e) {}
}

// 53rd pass -- network sign-on ID: verbal station IDs, an ElevenLabs-rendered
// line ("Rachel M -- Pro British Radio
// Presenter"): "you're now listening to the SIGNAL radio network". This is
// the engine's first real audio ASSET -- everything else above is
// synthesized procedurally; this one loads audio/network-id.mp3 and runs it
// through a WebAudio chain live at playback time (band-limit, mid-forward
// EQ, a grit shaper, a slow pitch wobble, a hiss bed under it) rather than
// baking any processing into the file, same "everything's live and
// tunable" philosophy as crt.params. Piloted first as an offline ffmpeg
// render to preview the direction before this got built; both
// pilot takes ("dry" and "with hiss bed") came back approved, so this is
// that same shape ported to real nodes.
//
// Plays once per power-on, fired from the REVEAL_DELAY beat in powerUp() --
// the network signing the set on right as the picture lands, same moment
// the locked station's own audio comes up, before it takes over. Routed
// through speakerOut() like every other speaker sound, so [M]'s hard-mute
// silences it same as everything but the tube hum/relay clunk.
// 55th pass -- welcome line. Briefly rotated between three ElevenLabs takes
// (network-id.mp3 plus two more recorded); the shortest main intro was
// preferred over rotating between different ones -- so this is back to a
// single fixed line, just pointed at the shortest of the three
// (welcome-tuned-in.mp3, ~1.9s vs ~3.1-3.4s for the other two) rather than
// the original network-id.mp3. Same lazy/cached fetch pattern as the rest
// of this file.
const WELCOME_LINE_FILE = 'audio/welcome-tuned-in.mp3'
let welcomeLineBufferPromise = null
function loadWelcomeLineBuffer() {
  if (!welcomeLineBufferPromise) {
    welcomeLineBufferPromise = fetch(WELCOME_LINE_FILE)
      .then((r) => r.arrayBuffer())
      .then((buf) => audioCtx().decodeAudioData(buf))
      .catch(() => null)
  }
  return welcomeLineBufferPromise
}
// Soft-saturation curve for WaveShaperNode (MDN's standard "distortion
// curve" shape), tuned low here for grit/grain rather than real overdrive --
// standing in for true bit-reduction, which would need an AudioWorklet.
function gritCurve(amount = 18) {
  const n = 44100
  const curve = new Float32Array(n)
  const deg = Math.PI / 180
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x))
  }
  return curve
}
// 55th pass -- pulled out of playNetworkId so station IDs can share the
// exact same "through the radio" chain (highpass/lowpass/peaking EQ, grit
// waveshaper, wow/flutter delay, hiss bed) instead of duplicating it.
// Lowered by another 15% -- on top of the earlier halving
// (1.6 -> 0.8 / 0.0125 hiss), so the peaks below are 0.8 * 0.85 and
// 0.0125 * 0.85, i.e. ~0.32x and ~0.11x the original ElevenLabs level.
const VOICE_CLIP_PEAK_GAIN = 0.8 * 0.85 // ~0.68
const VOICE_CLIP_HISS_GAIN = 0.0125 * 0.85 // ~0.0106
// `gainMult` (56th pass -- liner drops needed their volume lowered a
// little) scales both the voice and hiss-bed peaks together, on top of the
// defaults above -- an optional per-call trim so one clip type (liner
// drops) can sit quieter than station IDs/the welcome line without
// touching their own tuned levels.
function playProcessedVoiceClip(buffer, ctx, t, gainMult = 1) {
  const dur = buffer.duration
  const peakGain = VOICE_CLIP_PEAK_GAIN * gainMult
  const hissGain = VOICE_CLIP_HISS_GAIN * gainMult

  const src = ctx.createBufferSource()
  src.buffer = buffer

  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 280
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 3400
  const mid = ctx.createBiquadFilter()
  mid.type = 'peaking'
  mid.frequency.value = 1800
  mid.Q.value = 1.2
  mid.gain.value = 5

  const shaper = ctx.createWaveShaper()
  shaper.curve = gritCurve(18)
  shaper.oversample = '2x'

  // Slow pitch wobble (wow/flutter) -- an LFO driving delayTime around a
  // small base offset reads as pitch drift, not an echo, as long as the
  // depth stays well under ~5ms.
  const delay = ctx.createDelay(0.05)
  delay.delayTime.value = 0.006
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 1.1
  const lfoDepth = ctx.createGain()
  lfoDepth.gain.value = 0.0015
  lfo.connect(lfoDepth).connect(delay.delayTime)

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(peakGain, t + 0.08)
  // Too sharply cut off -- widened from 0.25s to 0.4s. Root
  // cause was actually the source asset's OWN fade overlapping the tail
  // end of real speech (fixed by re-trimming from ElevenLabs' silence
  // gap, not by touching this), but this window was compounding it, so
  // it gets more room too rather than fighting the source clip's taper.
  // Station-ID clips also now carry ~0.2s of padded trailing silence
  // (see audio/ prep) so this fade always lands after real speech ends.
  gain.gain.setValueAtTime(peakGain, t + Math.max(0, dur - 0.4))
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)

  src.connect(hp).connect(lp).connect(mid).connect(shaper).connect(delay)
  delay.connect(gain).connect(speakerOut(ctx))

  // Faint hiss bed under just this clip -- the persistent static bed only
  // runs while tuning/unlocked, so without this the clip would land in
  // total silence instead of sitting in the set's own noise floor. Same
  // one-shot noise-buffer technique as playStaticBurst.
  const n = Math.floor(ctx.sampleRate * dur)
  const noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate)
  const d = noiseBuf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
  const noiseSrc = ctx.createBufferSource()
  noiseSrc.buffer = noiseBuf
  const noiseFilter = ctx.createBiquadFilter()
  noiseFilter.type = 'bandpass'
  noiseFilter.frequency.value = 2200
  noiseFilter.Q.value = 0.4
  const noiseGain = ctx.createGain()
  noiseGain.gain.setValueAtTime(0, t)
  noiseGain.gain.linearRampToValueAtTime(hissGain, t + 0.2)
  noiseGain.gain.setValueAtTime(hissGain, t + Math.max(0, dur - 0.3))
  noiseGain.gain.linearRampToValueAtTime(0, t + dur)
  noiseSrc.connect(noiseFilter).connect(noiseGain).connect(speakerOut(ctx))

  lfo.start(t)
  src.start(t)
  noiseSrc.start(t)
  const stopAt = t + dur + 0.05
  src.stop(stopAt)
  noiseSrc.stop(stopAt)
  lfo.stop(stopAt)
}
// Kicked off early (see init()) so the fetch/decode is almost always done
// well before REVEAL_DELAY's ~5.5s mark on a fresh boot; if it isn't, this
// just waits for it -- audioCtx() was already resumed synchronously inside
// this same powerUp() call (playPowerOnSound() fires at its very top), so a
// sound scheduled from this promise's callback several seconds later is no
// different from startTubeHum() firing off the same REVEAL_DELAY beat.
function playNetworkId(program) {
  if (program.muted) return
  loadWelcomeLineBuffer().then((buffer) => {
    // Re-check state on the far side of the async gap (gotcha: anything
    // that draws/plays outside a synchronous call needs its own guards) --
    // a fast power-off or a mute toggle in the ~5.5s window shouldn't play
    // this out from under a screen that's already gone dark or muted.
    if (!buffer || !program.poweredOn || program.muted) return
    try {
      const ctx = audioCtx()
      playProcessedVoiceClip(buffer, ctx, ctx.currentTime)
    } catch (e) {}
  })
}

// 55th pass -- per-station verbal IDs, recorded and dropped into
// audio/ as station-id-<id>.mp3 (one per public station; the secret NIN
// station deliberately has none). Same lazy/cached fetch as the network ID,
// keyed per station so switching stations doesn't refetch.
const stationIdBufferPromises = {}
function loadStationIdBuffer(stationId) {
  if (!stationIdBufferPromises[stationId]) {
    stationIdBufferPromises[stationId] = fetch(`audio/station-id-${stationId}.mp3`)
      .then((r) => r.arrayBuffer())
      .then((buf) => audioCtx().decodeAudioData(buf))
      .catch(() => null) // no clip for this station (e.g. the secret one) -- silently skip
  }
  return stationIdBufferPromises[stationId]
}
// Fired from tryLock() on first lock or any preset-driven lock -- see the
// call site there for the "first lock or preset change" logic itself.
function playStationId(program, station) {
  if (program.muted || !station) return
  loadStationIdBuffer(station.id).then((buffer) => {
    if (!buffer || !program.poweredOn || program.muted) return
    if (program.lockedStation !== station) return // re-tuned away during the async gap
    try {
      const ctx = audioCtx()
      playProcessedVoiceClip(buffer, ctx, ctx.currentTime)
    } catch (e) {}
  })
}

// 2026-08-24 -- synced lyrics for the visualizer's [L] display. Lookup is
// against LRCLIB (https://lrclib.net, keyless, CORS-open -- verified
// directly rather than assumed), fired from loadTrack() on every track
// change and cached by youtubeId so a resume/reload of the same track
// (loadTrack's own midSong resume paths) never refetches. Deliberately
// binary: only a result with time-tagged `syncedLyrics` counts as
// 'available' -- a plain-text-only match or no match at all both render
// as 'unavailable', since a static wall of text can't do the one thing
// this feature is for (following the line that's playing right now). Plain
// object rather than the Promise-map loadStationIdBuffer() uses just
// above: the footer needs a synchronous "what's the state right now" read
// every draw, not a one-shot .then() at play time.
const lyricsCache = {} // youtubeId -> { state: 'pending'|'available'|'unavailable', lines? }
function parseLRC(lrcText) {
  const lines = []
  const re = /^\[(\d{2}):(\d{2}(?:\.\d{1,2})?)\](.*)$/
  for (const raw of lrcText.split('\n')) {
    const m = re.exec(raw.trim())
    if (!m) continue
    const words = m[3].trim()
    if (!words) continue // skip blank/instrumental-gap lines -- nothing to show
    lines.push({ time: Number(m[1]) * 60 + Number(m[2]), text: words })
  }
  lines.sort((a, b) => a.time - b.time)
  return lines
}
function ensureLyricsFetched(track) {
  if (!track || !track.youtubeId || lyricsCache[track.youtubeId]) return
  lyricsCache[track.youtubeId] = { state: 'pending' }
  const params = new URLSearchParams({ track_name: track.title, artist_name: track.artist })
  fetch(`https://lrclib.net/api/get?${params}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      lyricsCache[track.youtubeId] = (data && data.syncedLyrics)
        ? { state: 'available', lines: parseLRC(data.syncedLyrics) }
        : { state: 'unavailable' }
    })
    .catch(() => { lyricsCache[track.youtubeId] = { state: 'unavailable' } })
}
function lyricsStateFor(track) {
  if (!track || !track.youtubeId) return 'unavailable'
  const entry = lyricsCache[track.youtubeId]
  return entry ? entry.state : 'unavailable'
}

// 56th pass -- liner drops (one in 4 chance approved; tested with cipher
// first). Real liners fire between songs, not mid-song, so this hooks skip()
// -- the single funnel for "new track, same station" (a natural track-end
// via ENDED, the dead-video onError auto-skip, the skip key, and the mobile
// swipe all route through it) -- rather than a standalone timer that would
// need its own start/stop bookkeeping across every mute/station-change/
// power-off transition. The very first track after a lock goes through
// tryLock()/loadTrack() directly, never skip(), so a liner drop never
// competes with that lock's own station ID.
//
// Per-station pool of liner clips, `audio/liner-<id>-<n>.mp3` naming -- an
// empty/missing entry just means that station never rolls one. All 9
// public stations now have their pilot clip; NIN deliberately has none
// (see maybePlayLinerDrop's comment -- it gets a different, one-time
// "discovery" treatment instead, not yet built).
const LINER_DROP_CHANCE = 0.25
// 57th pass -- general-purpose one-liners (3 one-liners plus a
// thank-you clip general enough to double as a 4th), not written for any
// one station's genre. Folded into every station's pool below rather than
// given a separate trigger, so they ride the same 1-in-4 roll and
// repeat-avoidance logic in maybePlayLinerDrop as the per-station pilots
// instead of duplicating that machinery.
const GENERAL_LINER_FILES = [
  'audio/oneliner01.mp3',
  'audio/oneliner2.mp3',
  'audio/oneliner3.mp3',
  'audio/thanks01.mp3',
]
const STATION_LINER_FILES = {
  cipher: ['audio/liner-cipher-01.mp3'],
  'distortion-field': ['audio/liner-distortion-field-01.mp3'],
  'cold-wave': ['audio/liner-cold-wave-01.mp3'],
  'drift-mode': ['audio/liner-drift-mode-01.mp3'],
  'circuit-crush': ['audio/liner-circuit-crush-01.mp3'],
  atomic: ['audio/liner-atomic-01.mp3'],
  // 60th pass -- MOMENTUM retired (see the retirement comment above
  // MIDNIGHT NEON in STATIONS). Its liner clip (audio/liner-momentum-01.mp3,
  // voiced as "MOMENTUM") is left on disk but dropped from this map rather
  // than remapped to 'midnight-neon' -- the clip's own spoken content would
  // be wrong for the new callsign. maybePlayLinerDrop() already no-ops
  // cleanly for any station with no entry here (same path secret stations
  // take), so MIDNIGHT NEON simply has no liner drop until a real one is
  // recorded for it. Its station ID clip is real, though -- see
  // audio/station-id-midnight-neon.mp3 and loadStationIdBuffer().
  'city-lights': ['audio/liner-city-lights-01.mp3'],
  hackback: ['audio/liner-hackback-01.mp3'],
}
const LINER_FILES = {}
for (const stId in STATION_LINER_FILES) {
  LINER_FILES[stId] = [...STATION_LINER_FILES[stId], ...GENERAL_LINER_FILES]
}
const linerBufferPromises = {}
function loadLinerBuffer(path) {
  if (!linerBufferPromises[path]) {
    linerBufferPromises[path] = fetch(path)
      .then((r) => r.arrayBuffer())
      .then((buf) => audioCtx().decodeAudioData(buf))
      .catch(() => null)
  }
  return linerBufferPromises[path]
}
// Fires a couple seconds after the new track's audio actually starts --
// loadTrack() cues/loads asynchronously (buffering, then YouTube's own
// autoplay), so there's no single synchronous moment "the track is now
// audible." This fixed delay is a stand-in for that rather than wiring up
// the player's PLAYING state, matching how every other beat in this file
// (REVEAL_DELAY, the power-down sequence) is a plain scheduled offset, not
// an event-driven one.
const LINER_DROP_DELAY_MS = 2500
// Liner volume lowered a little -- liners sit under an already-
// playing track rather than a clear boot/lock moment, so they get their
// own trim on top of the shared voice-clip defaults instead of raising
// those defaults for station IDs/the welcome line too.
const LINER_DROP_GAIN_MULT = 0.75
function maybePlayLinerDrop(program, station, track) {
  const files = LINER_FILES[station.id]
  if (!files || !files.length || program.muted) return
  if (Math.random() >= LINER_DROP_CHANCE) return
  // Avoid repeating the same clip twice in a row once a station has more
  // than one -- irrelevant with CIPHER's single pilot clip today.
  const pool = files.length > 1 && program._lastLiner
    ? files.filter((f) => f !== program._lastLiner)
    : files
  const path = pool[Math.floor(Math.random() * pool.length)]
  setTimeout(() => {
    // Re-check on the far side of the delay (same gotcha as every other
    // async-scheduled sound here) -- a station change, track skip, mute, or
    // power-off in this window shouldn't drop a liner over whatever the set
    // is actually doing by the time it lands.
    if (program.muted || !program.poweredOn) return
    if (program.lockedStation !== station || program.currentTrack !== track) return
    loadLinerBuffer(path).then((buffer) => {
      if (!buffer || program.muted || !program.poweredOn) return
      if (program.lockedStation !== station || program.currentTrack !== track) return
      program._lastLiner = path
      try {
        const ctx = audioCtx()
        playProcessedVoiceClip(buffer, ctx, ctx.currentTime, LINER_DROP_GAIN_MULT)
      } catch (e) {}
    })
  }, LINER_DROP_DELAY_MS)
}

// --- live audio tap (2026-08-23) -----------------------------------------
//
// (David: the visualizers "aren't real. [They] are just animations that
// repeat. I want ... them to actually react to the music being played live
// for all of them.") Every meter-shaped thing in this app -- the VU trace,
// the EQ ribbon, the FLD readout, every full-screen visualizer -- has been
// synthetic since day one, because playback is a cross-origin YouTube
// iframe and WebAudio cannot see inside it. This section is the workaround:
// capture the audio OUTSIDE the iframe and analyse that.
//
// Capture ladder, tried on every power-on while nothing is live:
//   1. getDisplayMedia tab-audio capture -- the wired signal. Desktop
//      Chromium only (Firefox has ignored the audio constraint since 2019,
//      bugzilla 1541425; Safari's getDisplayMedia has no audio at all).
//      The user picks "This tab" + "Also share tab audio" in the picker.
//   2. getUserMedia microphone -- everyone else, including mobile: the mic
//      hears the music acoustically via the speakers. Real analysis, just
//      air-coupled. Mic permission persists per-origin, so later sessions
//      auto-start this tier with no prompt at all.
//   3. Nothing -- every meter/effect keeps its synthetic behavior, exactly
//      as before this section existed. Hard requirement: with no capture
//      the app must be visually indistinguishable from the pre-tap build,
//      and with capture-but-silence (mute, ads, headphones on the mic
//      tier) nothing may ever look broken -- see the noise gate below.
// Server-side audio extraction from YouTube was considered and rejected on
// the same ToS grounds as ad suppression (see the Guide's ads note).
//
// Privacy posture, stated once: analysis only. The stream connects to an
// AnalyserNode and NOTHING else -- never to the destination (no echo, no
// feedback), nothing is recorded, nothing leaves the page.

// navigator.userAgentData only exists in Chromium -- it IS the Chromium
// check, and covers Chrome/Edge/Brave/Arc/Opera alike. Tier 1 additionally
// requires getDisplayMedia to exist; MOBILE_LITE (program.mobile) excludes
// tier 1 regardless, since no mobile browser does tab audio.
const IS_CHROMIUM_DESKTOP = !!(navigator.userAgentData && !navigator.userAgentData.mobile)

// Tunables, first-guess values in this file's own tradition -- expect to
// retune live against the dev server, same as everything else got tuned.
// Band edges: the 90 Hz floor deliberately dodges the tube hum's 60 Hz
// fundamental (startTubeHum); its 120 Hz harmonic lands in band 0 but is
// CONSTANT, so the adaptive floor below subtracts it to zero. The static
// bed (600-2400 Hz) intentionally shows up in mid/treble -- meters
// twitching to the static you can actually hear is fiction-positive -- but
// can never fire onsets (the onset band is bass-side only).
// 58th pass -- widened 6 bands to 9, for
// drawEqRibbonLeft()'s ribbon. The first three edges (90/180/400/900) are
// UNCHANGED from the original 6-band scheme on purpose: onsetHi below and
// the bass/mid/treble split in sampleAudioTap() both key off exact band
// indices, and keeping those first 3 bands' Hz ranges identical means
// onset detection, BPM, and VU/tri-band's bass-mid-treble all stay
// byte-identical to before this pass -- only the ribbon (and CIPHER's
// per-column band mapping) actually gained resolution. The remaining
// 900-10000 Hz span (previously 3 bands) is now 6 log-spaced sub-bands.
const TAP_BAND_EDGES_HZ = [90, 180, 400, 900, 1350, 2000, 3000, 4500, 6750, 10000]
const TAP_BANDS = TAP_BAND_EDGES_HZ.length - 1 // 9
const TAP_FLOOR_RISE = 18       // bytes/s the noise floor creeps up
const TAP_CEIL_TAU = 6          // s, rolling-max decay -- re-fills the range
                                // within ~6s when a quiet master follows a hot one
const TAP_MIN_SPAN_TAB = 22     // bytes; the span floor is what stops
const TAP_MIN_SPAN_MIC = 30     // near-silence being amplified into fake signal
const TAP_GATE_SPAN = 12        // bytes of wideband span below which...
const TAP_GATE_HOLD_S = 1.2     // ...for this long => gated (headphones case)
const TAP_ONSET_REFRACTORY_MS = 220
const TAP_ONSET_MIN_DELTA_TAB = 6
const TAP_ONSET_MIN_DELTA_MIC = 9  // mic runs lower SNR through a room
const TAP_PULSE_TAU = 0.12      // s, onset impulse decay

let tapStream = null
let tapSource = null
let tapAnalyser = null
let tapFreqData = null          // Uint8Array, preallocated at wire time
let tapBandBins = null          // [ [loBin, hiBin] x9 ]
let tapState = 'idle'           // 'idle' | 'pending' | 'live'
let tapBlockedTab = false       // session-permanent tier-1 hard failure
let tapBlockedMic = false       // session-permanent tier-2 hard failure
let micPermState = 'unknown'    // 'granted' | 'denied' | 'prompt' | 'unknown'
let micGestureRetry = false     // gesture-gating browser refused an out-of-
                                // gesture mic call -- retry on next key/touch
let tapUI = null                // { program, s } for async status flashes
// Per-band AGC trackers (TAP_BANDS bands + wideband at [TAP_BANDS]) and
// onset state.
const tapRaw = new Float32Array(TAP_BANDS)
const tapFloor = new Float32Array(TAP_BANDS + 1)
const tapCeil = new Float32Array(TAP_BANDS + 1)
const tapSm = new Float32Array(TAP_BANDS)
let tapQuietSince = 0
let tapOnsetMean = 0
let tapOnsetDev = 0
let tapOnsetPrevE = 0
let tapIOI = []
let tapLastSampleMs = 0

// The signal bus -- one object, refilled in place once per rAF by
// sampleAudioTap(), zero per-frame allocation. `onset` is true for exactly
// one sampled frame; `pulse` is the 1->0 decay after it, for consumers on
// slower cadences that would miss the single frame.
const AUDIO_BUS = {
  active: false,
  source: null,                 // 'tab' | 'mic' | null
  gated: false,                 // running but hearing nothing usable
  level: 0,
  bass: 0, mid: 0, treble: 0,
  bands9: new Float32Array(TAP_BANDS),
  onset: false,
  onsetAt: 0,
  pulse: 0,
  bpm: 0,                       // 0 while unknown, else 60..180
  bpmConf: 0,
  beatPhase: 0,
}
// THE check every consumer makes -- never AUDIO_BUS.active directly. The
// gate is what turns the headphones-on-mic case into an honest "capture
// running, nothing playing" instead of amplified room hiss.
function audioSignalLive() { return AUDIO_BUS.active && !AUDIO_BUS.gated }

/** The ladder's entry point. Idempotent; called from powerUp() inside the
 *  power-on gesture (getDisplayMedia requires-and-consumes transient
 *  activation; getUserMedia does NOT on Chromium/Firefox, which is what
 *  makes chaining the mic tier inside the tab tier's .catch legal -- the
 *  only browsers that gesture-gate getUserMedia never run tier 1 at all,
 *  so their mic call happens synchronously in the gesture here). */
function startAudioTap(program, s) {
  if (tapState !== 'idle') return
  if (!navigator.mediaDevices) return
  tapUI = { program, s }
  tapState = 'pending'
  if (!program.mobile && IS_CHROMIUM_DESKTOP &&
      navigator.mediaDevices.getDisplayMedia && !tapBlockedTab) startTabCapture(false)
  else startMicCapture()
}

function startTabCapture(minimal) {
  try {
    const opts = minimal
      ? { video: true, audio: true }
      : {
          preferCurrentTab: true,          // picker fronts THIS tab (Chrome 103+)
          selfBrowserSurface: 'include',
          surfaceSwitching: 'include',     // user can re-point via Chrome's bar
          systemAudio: 'include',
          monitorTypeSurfaces: 'include',
          video: true,                     // audio alone throws TypeError in Chrome
          audio: {
            suppressLocalAudioPlayback: false,  // the tab keeps playing out loud
            // The browser's speech-call processing would fight music metering:
            // AEC subtracts the speaker signal (which IS the signal), NS eats
            // sustained music energy, AGC flattens the very loud/quiet contrast
            // onset detection measures.
            echoCancellation: false, noiseSuppression: false, autoGainControl: false,
          },
        }
    if (!minimal && window.CaptureController) {
      try {
        opts.controller = new CaptureController()
        opts.controller.setFocusBehavior('no-focus-change')
      } catch (e) {}
    }
    navigator.mediaDevices.getDisplayMedia(opts).then((stream) => {
      // Video track dropped immediately -- established audio-only-tab-capture
      // pattern; the audio track and Chrome's sharing pill both survive it.
      stream.getVideoTracks().forEach((tr) => { try { tr.stop() } catch (e) {} })
      if (!stream.getAudioTracks().length) {
        // Picked a window, or unticked "Also share tab audio" -- no audio
        // exists on this surface, so treat as declined and fall to the mic.
        stream.getTracks().forEach((tr) => { try { tr.stop() } catch (e) {} })
        startMicCapture()
        return
      }
      wireTapAnalyser(stream, 'tab')
      notifyTap('TAP: LINE')
    }).catch((err) => {
      // A TypeError on the full option set can mean an older Chromium that
      // rejects one of the newer display-surface options -- retry once bare
      // before writing the tier off for the session.
      if (!minimal && err && err.name === 'TypeError') { startTabCapture(true); return }
      if (err && err.name !== 'NotAllowedError') tapBlockedTab = true
      startMicCapture()
    })
  } catch (e) { tapBlockedTab = true; startMicCapture() }
}

function startMicCapture() {
  try {
    if (tapBlockedMic || micPermState === 'denied' ||
        !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (micPermState === 'denied') tapBlockedMic = true
      tapState = 'idle'
      return
    }
    navigator.mediaDevices.getUserMedia({
      video: false,
      // Same three processing stages off as the tab tier, same reasons --
      // and doubly so here, where AEC's entire job is removing the speaker
      // audio the mic tier exists to measure. Mono suffices for metering.
      audio: {
        echoCancellation: false, noiseSuppression: false, autoGainControl: false,
        channelCount: { ideal: 1 },
      },
    }).then((stream) => {
      if (!stream.getAudioTracks().length) {
        stream.getTracks().forEach((tr) => { try { tr.stop() } catch (e) {} })
        tapState = 'idle'
        return
      }
      wireTapAnalyser(stream, 'mic')
      notifyTap('TAP: MIC')
    }).catch((err) => {
      tapState = 'idle'
      const name = err && err.name
      if (name === 'NotAllowedError') {
        // Chromium persists a hard deny and auto-rejects instantly forever
        // after -- re-prompting is impossible, so stop trying this session.
        if (micPermState === 'denied') tapBlockedMic = true
      } else if (name === 'NotFoundError') {
        tapBlockedMic = true               // no mic hardware at all
      } else if (name === 'SecurityError' || name === 'InvalidStateError') {
        micGestureRetry = true             // gesture-gated browser; retry in one
      }
    })
  } catch (e) { tapState = 'idle' }
}

/** Async, prompts nothing -- called once from init(). Mic grants persist
 *  per-origin, so 'granted' here is what lets later sessions auto-start the
 *  mic tier silently, and 'denied' short-circuits a doomed call. */
function queryMicPermission() {
  try {
    if (!navigator.permissions || !navigator.permissions.query) return
    navigator.permissions.query({ name: 'microphone' }).then((st) => {
      micPermState = st.state
      st.onchange = () => { micPermState = st.state }
    }).catch(() => {})
  } catch (e) {}
}

/** Belt-and-braces for browsers that gesture-gate getUserMedia (Safari
 *  lineage): flushed from the two existing gesture entry points (key(),
 *  onTouchStart) -- the same pattern _pendingUnmute already uses. */
function maybeRetryAudioTapInGesture(program, s) {
  if (!micGestureRetry || tapState !== 'idle') return
  micGestureRetry = false
  tapUI = { program, s }
  tapState = 'pending'
  startMicCapture()
}

function wireTapAnalyser(stream, sourceName) {
  try {
    const ctx = audioCtx()
    tapStream = stream
    tapSource = ctx.createMediaStreamSource(stream)
    tapAnalyser = ctx.createAnalyser()
    tapAnalyser.fftSize = 2048             // 23.4 Hz/bin @48k -- enough bass
                                           // resolution at half the cost of 4096
    // Well below the 0.8 default: the meters' own springs (stationBallistics)
    // are the ballistics layer; heavy analyser smoothing would smear the
    // transients onset detection needs. This only knocks the FFT shimmer off.
    tapAnalyser.smoothingTimeConstant = 0.5
    // The default -100/-30 window wastes half the byte range on inaudible
    // floor and clips hot masters; AGC below makes exact values non-critical.
    tapAnalyser.minDecibels = -85
    tapAnalyser.maxDecibels = -12
    tapSource.connect(tapAnalyser)         // and NOTHING else -- analysis only
    tapFreqData = new Uint8Array(tapAnalyser.frequencyBinCount)
    // Bin ranges from the REAL sample rate -- the context may be 44.1k or 48k.
    const binHz = ctx.sampleRate / tapAnalyser.fftSize
    tapBandBins = []
    for (let i = 0; i < TAP_BANDS; i++) {
      const lo = Math.max(1, Math.round(TAP_BAND_EDGES_HZ[i] / binHz))
      const hi = Math.min(tapAnalyser.frequencyBinCount - 1,
        Math.max(lo, Math.round(TAP_BAND_EDGES_HZ[i + 1] / binHz) - 1))
      tapBandBins.push([lo, hi])
    }
    tapFloor.fill(255)
    tapCeil.fill(0)
    tapSm.fill(0)
    tapQuietSince = 0
    tapOnsetMean = 0; tapOnsetDev = 0; tapOnsetPrevE = 0
    tapIOI = []
    tapLastSampleMs = 0
    AUDIO_BUS.active = true
    AUDIO_BUS.source = sourceName
    // Born gated: nothing measured yet, and if this is a headphones-on-mic
    // session the gate simply never lifts -- first real energy ungates
    // instantly (see sampleAudioTap).
    AUDIO_BUS.gated = true
    tapState = 'live'
    const at = stream.getAudioTracks()[0]
    if (at) at.onended = () => onTapEnded(sourceName)
  } catch (e) { stopAudioTap('wire-failed') }
}

function stopAudioTap(reason) {
  try { if (tapStream) tapStream.getTracks().forEach((tr) => { try { tr.stop() } catch (e) {} }) } catch (e) {}
  try { if (tapSource) tapSource.disconnect() } catch (e) {}
  tapStream = null; tapSource = null; tapAnalyser = null
  tapFreqData = null; tapBandBins = null
  tapState = 'idle'
  AUDIO_BUS.active = false
  AUDIO_BUS.source = null
  AUDIO_BUS.gated = false
  AUDIO_BUS.level = 0; AUDIO_BUS.bass = 0; AUDIO_BUS.mid = 0; AUDIO_BUS.treble = 0
  AUDIO_BUS.bands9.fill(0)
  AUDIO_BUS.onset = false; AUDIO_BUS.pulse = 0
  AUDIO_BUS.bpm = 0; AUDIO_BUS.bpmConf = 0; AUDIO_BUS.beatPhase = 0
}

/** Mid-session loss: Chrome's "Stop sharing" bar, a revoked mic, a device
 *  unplug. Falls to the mic ONLY when that needs no prompt (already
 *  granted) -- prompting outside a gesture is exactly what we never do.
 *  Otherwise idle until the next power-on re-runs the ladder. */
function onTapEnded(sourceName) {
  stopAudioTap('ended')
  notifyTap('TAP LOST')
  if (sourceName === 'tab') {
    if (micPermState === 'granted' && !tapBlockedMic) { tapState = 'pending'; startMicCapture() }
  } else {
    // One silent retry after 1s covers a default-device switch.
    setTimeout(() => {
      if (tapState === 'idle' && micPermState === 'granted' && !tapBlockedMic) {
        tapState = 'pending'
        startMicCapture()
      }
    }, 1000)
  }
}

/** Status-row acknowledgment for async tier changes. Silent during the boot
 *  animation (the boot POST line covers that window -- see powerUp), the
 *  guide, and the visualizer (which has its own footer and repaints the
 *  status row's grid anyway). */
function notifyTap(text) {
  const u = tapUI
  if (!u || !u.program) return
  const p = u.program
  if (!p.poweredOn || p._powerAnimating || p.guideOpen || p.visualizerActive) return
  try { p.flashStatus(u.s, text) } catch (e) {}
}

/** Boot POST readout for the current tap state -- substituted over the
 *  static 'AUDIO PATH READY' line at land time (see powerUp). The fallback
 *  IS that line: a declined/unsupported tap stays silent by design. */
function audioTapBootLine() {
  if (tapState === 'live') {
    return AUDIO_BUS.source === 'tab' ? '[ OK ] AUDIO TAP: LINE' : '[ OK ] AUDIO TAP: MIC'
  }
  return '[ OK ] AUDIO PATH READY'
}

/** Per-frame DSP: one getByteFrequencyData + one pass over ~430 bins, no
 *  allocation. Called from the top of frame(); when the tab is backgrounded
 *  rAF stops, so sampling stops with it -- the >1.5s-gap reset below is the
 *  only resume handling needed (AGC floors stay, they're still valid). */
function sampleAudioTap() {
  if (tapState !== 'live' || !tapAnalyser || !tapBandBins) return
  try {
    const now = performance.now()
    const gapS = tapLastSampleMs ? (now - tapLastSampleMs) / 1000 : 1 / 60
    tapLastSampleMs = now
    const dt = Math.min(0.1, Math.max(0.001, gapS))
    if (gapS > 1.5) {
      tapOnsetMean = 0; tapOnsetDev = 0; tapOnsetPrevE = 0
      tapIOI = []
      AUDIO_BUS.pulse = 0
    }
    AUDIO_BUS.onset = false
    tapAnalyser.getByteFrequencyData(tapFreqData)

    const mic = AUDIO_BUS.source === 'mic'
    const minSpan = mic ? TAP_MIN_SPAN_MIC : TAP_MIN_SPAN_TAB
    let wideRaw = 0
    for (let i = 0; i < TAP_BANDS; i++) {
      const lo = tapBandBins[i][0], hi = tapBandBins[i][1]
      let sum = 0
      for (let b = lo; b <= hi; b++) sum += tapFreqData[b]
      const raw = sum / (hi - lo + 1)
      tapRaw[i] = raw
      wideRaw += raw
      // Adaptive floor: instant-down, slow creep-up. This single mechanism
      // erases the constant 120 Hz hum harmonic, the mic's room tone, AND is
      // what makes mute flatten naturally -- the moment the player + speaker
      // bus go silent, raw collapses, the floor follows, and normalized
      // output hits 0 with the meters' own springs riding it down.
      tapFloor[i] = Math.min(raw, tapFloor[i] + TAP_FLOOR_RISE * dt)
      // Rolling ceiling: instant-up, ~6s decay toward the floor -- a quiet
      // 1950s master re-fills the meter range moments after a hot synthwave
      // one. Never allowed within MIN_SPAN of the floor (anti-noise-zoom).
      const rest = tapFloor[i] + minSpan
      tapCeil[i] = Math.max(raw, rest,
        tapCeil[i] - (tapCeil[i] - rest) * (1 - Math.exp(-dt / TAP_CEIL_TAU)))
      const norm = Math.max(0, Math.min(1,
        (raw - tapFloor[i]) / Math.max(tapCeil[i] - tapFloor[i], minSpan)))
      // Asymmetric attack/decay on top (fast up, slow down), dt-corrected:
      // the meters read this bus on a 0.12s cadence and would otherwise
      // alias single-frame spikes.
      const a = norm > tapSm[i] ? 0.5 : 0.15
      tapSm[i] += (norm - tapSm[i]) * (1 - Math.pow(1 - a, dt * 60))
    }
    wideRaw /= TAP_BANDS
    tapFloor[TAP_BANDS] = Math.min(wideRaw, tapFloor[TAP_BANDS] + TAP_FLOOR_RISE * dt)
    const wideSpan = wideRaw - tapFloor[TAP_BANDS]

    // Noise gate -- the headphones case. Engages after sustained silence,
    // lifts instantly on real energy.
    if (wideSpan > TAP_GATE_SPAN + 6) {
      AUDIO_BUS.gated = false
      tapQuietSince = 0
    } else if (wideSpan < TAP_GATE_SPAN) {
      if (!tapQuietSince) tapQuietSince = now
      if (now - tapQuietSince > TAP_GATE_HOLD_S * 1000) AUDIO_BUS.gated = true
    } else {
      tapQuietSince = 0
    }
    if (AUDIO_BUS.gated) {
      AUDIO_BUS.level = 0; AUDIO_BUS.bass = 0; AUDIO_BUS.mid = 0; AUDIO_BUS.treble = 0
      AUDIO_BUS.bands9.fill(0)
      AUDIO_BUS.pulse = 0
      tapSm.fill(0)
      return
    }

    for (let i = 0; i < TAP_BANDS; i++) AUDIO_BUS.bands9[i] = tapSm[i]
    // bass/mid/treble Hz ranges are UNCHANGED from the 6-band scheme (see
    // the TAP_BAND_EDGES_HZ comment) -- bands 0-1 are still exactly 90-400
    // Hz, just now averaged as 2 of 9 instead of 2 of 6. Bands 2-4 cover
    // 400-2000 Hz (mid), bands 5-8 cover 2000-10000 Hz (treble) -- same
    // conceptual ranges as before, finer sampling within each.
    const bass = (tapSm[0] + tapSm[1]) / 2
    const mid = (tapSm[2] + tapSm[3] + tapSm[4]) / 3
    const treble = (tapSm[5] + tapSm[6] + tapSm[7] + tapSm[8]) / 4
    AUDIO_BUS.bass = bass
    AUDIO_BUS.mid = mid
    AUDIO_BUS.treble = treble
    AUDIO_BUS.level = Math.min(1, 0.45 * bass + 0.4 * mid + 0.15 * treble)

    // Onset: bass-band energy flux against an adaptive threshold, measured
    // floor-subtracted but PRE-ceiling/PRE-smoothing -- normalization must
    // not damp the very transients being detected. The mic band widens one
    // band (laptop speakers roll off hard below ~200 Hz, so small-speaker
    // kick/snare body lives higher).
    const onsetHi = mic ? 2 : 1
    let e = 0
    for (let i = 0; i <= onsetHi; i++) e += Math.max(0, tapRaw[i] - tapFloor[i])
    e /= onsetHi + 1
    const minDelta = mic ? TAP_ONSET_MIN_DELTA_MIC : TAP_ONSET_MIN_DELTA_TAB
    const thresh = tapOnsetMean + Math.max(minDelta, 2.0 * tapOnsetDev)
    if (e > thresh && e > tapOnsetPrevE &&
        now - AUDIO_BUS.onsetAt > TAP_ONSET_REFRACTORY_MS) {
      const ioi = (now - AUDIO_BUS.onsetAt) / 1000
      AUDIO_BUS.onset = true
      AUDIO_BUS.onsetAt = now
      AUDIO_BUS.pulse = 1
      // Rolling BPM: median of the last 8 plausible inter-onset intervals,
      // octave-folded into 60..180. Confidence = agreement within +/-12%.
      if (ioi >= 0.28 && ioi <= 1.5) {
        tapIOI.push(ioi)
        if (tapIOI.length > 8) tapIOI.shift()
        if (tapIOI.length >= 4) {
          const sorted = tapIOI.slice().sort((x, y) => x - y)
          const med = sorted[Math.floor(sorted.length / 2)]
          let bpm = 60 / med
          while (bpm < 60) bpm *= 2
          while (bpm > 180) bpm /= 2
          AUDIO_BUS.bpm = bpm
          AUDIO_BUS.bpmConf =
            tapIOI.filter((v) => Math.abs(v - med) / med < 0.12).length / tapIOI.length
        }
      }
      // Soft-resync the beat clock on confident tempo, hard-reset otherwise.
      if (AUDIO_BUS.bpm) {
        AUDIO_BUS.beatPhase = AUDIO_BUS.bpmConf >= 0.5 ? AUDIO_BUS.beatPhase * 0.25 : 0
      }
    }
    tapOnsetDev += (Math.abs(e - tapOnsetMean) - tapOnsetDev) * (1 - Math.exp(-dt / 0.5))
    tapOnsetMean += (e - tapOnsetMean) * (1 - Math.exp(-dt / 0.25))
    tapOnsetPrevE = e
    AUDIO_BUS.pulse *= Math.exp(-dt / TAP_PULSE_TAU)
    if (AUDIO_BUS.pulse < 0.001) AUDIO_BUS.pulse = 0
    if (AUDIO_BUS.bpm) AUDIO_BUS.beatPhase = (AUDIO_BUS.beatPhase + dt * AUDIO_BUS.bpm / 60) % 1
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
// 41st pass -- per-station CRT character. config.js's SCREEN is still the nominal set; crtBase is
// SCREEN with the locked station's own `crt` overrides merged in, and it is
// what every hook below now treats as "clean picture" instead of SCREEN
// directly. Without this indirection the existing hooks would quietly undo
// each station's character: the distance degrade would restore SCREEN's
// chroma on lock, the ident bloom pulse would settle to SCREEN's bloom, the
// focus snap would land on SCREEN's beam, and the power-on ramp would climb
// to SCREEN's brightness -- each one erasing whatever the station asked for
// a few hundred ms after it was applied.
// 45th pass -- live phone QA found some effects needed to turn down
// to make it easier to read on mobile. Grain, scanlines, chroma
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
  // 2026-08-22 -- the black above and below the tube needed a
  // different color or texture. The tube is hard-locked to 4:3, so a
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
// YouTube iframe), just deterministic synthetic motion.
// 2026-08-23: that constraint is now WORKED AROUND, not gone -- the live
// audio tap (see its section above) captures the tab/mic audio outside the
// iframe, and every effect below modulates off its signal bus when it's
// live. The synthetic motion described here remains the exact fallback
// whenever no capture is running. Character density
// (this ramp) plus the beam-level tier below give it more apparent gradient
// than the 5 discrete attribute tiers alone would.
//
// Built as the first of what's meant to become a per-station roster (44th
// pass -- since it can't be impacted by audio, it can instead
// be themed to each station, with a goal of eventually having 10 visuals) --
// VISUAL_METHODS just below is the dispatch table that idea hangs off of.
// DRIFT is wired to the DRIFT MODE station explicitly (see STATIONS'
// `visual` field), not just landing there by default -- the two sharing a
// name is meant to be a real pairing. Every other station falls back to
// DRIFT purely because nothing themed exists for them yet. Something
// hacking/code-based was floated for CIPHER and a synthwave/
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

/** 2026-08-23 (live audio tap) -- audio-or-neutral multiplier, THE idiom
 *  every effect's continuous modulation uses. With no vetted tap frame
 *  (A === null) this returns exactly 1, so every multiplication it feeds
 *  is a no-op and the no-audio build renders byte-identical to today.
 *  With a frame, maps a 0..1 band value onto lo..hi -- ranges are always
 *  chosen so v = 0.5 lands on 1.0: today's look is the CENTER of the
 *  modulation range, silence is a calm floor (lo >= 0.5, so nothing ever
 *  scales to frozen/black), peaks overshoot. Discrete events use plain
 *  `if (A && ...)` gates instead, which vanish the same way. */
function auMul(A, v, lo, hi) {
  return A ? lo + (hi - lo) * Math.min(1, Math.max(0, v)) : 1
}

// 62nd pass -- fallback signal for stations whose effect gates hard on A's
// presence (FLAME, FROST, BREACH, BUBBLE TUBES all used to render a
// separate "dead air" picture -- an ember bed, an unlit grid, a static hex
// field, an idle-floor tube bank -- when there was no tap). Live QA
// flagged a real gap between a declined/unsupported tap and a working
// one, and confirmed a seamless fallback was the right fix over rigid
// rules. Those stations' own idle states read as
// broken rather than atmospheric when a real tap just isn't available,
// which is a real, non-rare case (declined permission, unsupported
// browser, headphones-only capture never granted), not an edge case worth
// a worse picture over.
//
// syntheticAudio(t) fabricates a same-shaped signal purely from time --
// independent-phase sine layers per field (so bands drift out of sync with
// each other rather than breathing in lockstep) plus a small per-frame
// chance of a fake onset and a short decaying pulse envelope after one
// fires. It is NOT trying to imitate a real track's rhythm or dynamics --
// just enough motion that every effect's EXISTING reactive code (already
// tuned against real A.bass/A.mid/A.treble/A.bands9/A.onset/A.pulse) has
// something plausible to read, instead of each effect needing its own
// hand-authored idle animation. Call sites do `this._au || syntheticAudio(t)`
// so a real tap frame always wins the instant one arrives.
function syntheticAudio(t) {
  const clamp01 = (v) => Math.max(0, Math.min(1, v))
  const level = 0.35 + 0.15 * Math.sin(t * 0.17) + 0.1 * Math.sin(t * 0.41 + 1.3)
  const bass = 0.32 + 0.24 * Math.sin(t * 0.23 + 0.5) + 0.1 * Math.sin(t * 0.07)
  const mid = 0.32 + 0.2 * Math.sin(t * 0.31 + 2.1)
  const treble = 0.32 + 0.2 * Math.sin(t * 0.53 + 4.2)
  const bands9 = Array.from({ length: 9 }, (_, i) =>
    clamp01(0.32 + 0.24 * Math.sin(t * (0.15 + i * 0.07) + i * 1.7)))
  const pulsePhase = (t % 0.9) / 0.9
  return {
    level: clamp01(level), bass: clamp01(bass), mid: clamp01(mid), treble: clamp01(treble),
    bands9,
    onset: Math.random() < 0.012,
    pulse: clamp01(Math.exp(-pulsePhase * 5)),
  }
}

// 64th pass -- true silence for the four syntheticAudio(t) fallback effects
// (FROST, BUBBLE TUBES, FLAME, BREACH) while muted. Muting used to leave
// these dancing to the fake signal exactly as if a track were still
// playing -- the tab-capture tap genuinely goes quiet on mute, which used
// to trip the "no real signal" gate and hand off to syntheticAudio(t),
// so the effect kept moving on fake data with no sound behind it at all.
// A same-shaped all-zero object (not null -- these call sites dereference
// A.treble/A.bands9 etc directly, which would throw on null) settles each
// effect at its own real-audio "quiet passage" floor via auMul's lo bound,
// the same calm-idle look already shipped for an actual silent moment in a
// real track, rather than adding a separate dead-state branch per effect.
const SILENT_AUDIO = {
  level: 0, bass: 0, mid: 0, treble: 0,
  bands9: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  onset: false,
  pulse: 0,
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
  stack: 'drawStackEffect',
  skyline: 'drawSkylineEffect',   // unassigned (was MOMENTUM) -- see 60th pass note near neonsign
  // 59th pass -- REBUILT. The 51st pass's towers were deliberately dropped
  // for Flow Field in the 57th (a fresh, off-theme direction -- see
  // drawFlowFieldEffect's header below), but init()'s tower-array
  // construction and this comment block were never cleaned up after that
  // swap, so _momentumTowers sat built every visualizer entry and never
  // read -- harmless orphaned state, same class of loose end as g.strip on
  // GEIGER, just cleaned up along the way here.
  // 59th pass: MOMENTUM (and ATOMIC) rebuilt again from the ground up for a
  // more obviously reactive, impressive, shifting look. This brought the
  // towers back on purpose, wired differently this time: real
  // bass onsets visibly add a floor to a tower, rather than either the old
  // towers' timer-driven climb or Flow Field's continuous drift.
  // 60th pass -- MOMENTUM itself retired in favor of MIDNIGHT NEON (see the
  // retirement comment above that station), so SKYLINE is unassigned again
  // after one pass of use -- kept below exactly as built, same treatment
  // every other superseded effect gets, in case a future station wants a
  // "climbing towers" picture. Flow Field's code is kept below too, as
  // drawFlowFieldEffect, unassigned since the 59th pass already.
  flowfield: 'drawFlowFieldEffect',   // unassigned (was MOMENTUM, until the 59th pass)
  // 60th pass -- NEON SIGN, built for MIDNIGHT NEON. A single centered word
  // read as a static logo card rather than a scene, especially next to
  // something full-field like FLAME, so it didn't hold up on review.
  // Unassigned in turn, one pass after landing -- see the 61st pass note
  // near bubbletubes below for what replaced it. Kept exactly as built.
  neonsign: 'drawNeonSignEffect',
  // 61st pass -- BUBBLE TUBES, MIDNIGHT NEON's second visualizer. Chosen
  // over a smoke-and-spotlight direction (also discussed) from a
  // "jukebox bubble tubes / VU bars" pitch. Nine glowing tubes span the
  // full width, one per real spectrum band (A.bands9, the same 9-band tap
  // CIPHER's drawBreachEffect already reads) -- an honest spectrum readout
  // rather than decoration, filled from the base up like a VU bar with
  // bubbles drifting upward through the glass. Always lit at a low idle
  // floor even with no tap (same "lit hardware" contract NEON SIGN's
  // ambient flicker used) rather than going dark, and a real bass onset
  // kicks every tube brighter at once with a burst of fresh bubbles -- the
  // whole machine responding to the beat, not just one column. See JUKE_*
  // constants and drawBubbleTubesEffect below drawNeonSignEffect.
  bubbletubes: 'drawBubbleTubesEffect',
  boombap: 'drawBoomBapEffect',
  dread: 'drawDreadEffect',
  // 50th pass: FROST replaces PULSE on COLD WAVE and GEIGER replaces
  // COUNTER on ATOMIC -- COLD WAVE's visualizer wasn't landing and neither
  // replacement direction was obvious at the time. Both old
  // methods are kept below but are now UNASSIGNED -- same treatment RELIC
  // SIGNAL's tracklist got, so a future session can see what was tried
  // rather than re-inventing it. Why they were replaced, since neither was
  // a tuning problem:
  //   PULSE   -- three competing images at once (lattice + expanding rings
  //              + EKG trace), tuned across the 45th/47th/48th passes and
  //              still unsatisfying. Every effect that landed is ONE
  //              watchable process; this was three, and an EKG is medical
  //              rather than '80s synthpop anyway.
  //   COUNTER -- did not do what its own name said. The station's tagline
  //              promises "swing on while the counter clicks" and the
  //              effect was drifting mushroom clouds: nothing ticked,
  //              nothing registered, nothing clicked.
  frost: 'drawFrostEffect',
  geiger: 'drawGeigerEffect',   // unassigned (was ATOMIC) -- see 59th pass note below
  pulse: 'drawPulseEffect',   // unassigned (was COLD WAVE)
  counter: 'drawCounterEffect2',
  // 52nd pass: ISOTOPE MAP replaced GEIGER on ATOMIC, selected from a
  // 4-concept prototype round; GEIGER was concept 3 of that same round and
  // had already replaced COUNTER.
  // 57th pass, 2nd rewrite: "Geiger Click" selected off the newer
  // visualizer-lab mock, so GEIGER is back assigned to ATOMIC -- rebuilt
  // audio-reactive this pass (discrete click events off the tap, near-
  // silent with no signal) rather than its original unconditional random
  // wander. ISOTOPE MAP's code is kept below, now unassigned in turn, same
  // treatment PULSE/COUNTER got.
  isotope: 'drawIsotopeEffect',   // unassigned (was ATOMIC)
  // 59th pass -- ATOMIC and MOMENTUM's effects didn't obviously react to
  // the music, so both were rebuilt from the ground up. GEIGER
  // was a real instrument-style widget (needle + arc + click sparks) but
  // small and center-pinned rather than filling the field the way
  // FLAME/RIPPLE do -- unassigned in turn, same treatment ISOTOPE MAP got
  // from it. BLAST FIELD replaces it: a full-field detonation effect, bass
  // onsets spawn a bright core flash + fast shockwave ring + trailing
  // fallout dust at a random point, silent field with no tap. See the
  // BLAST_* tuning constants and drawBlastFieldEffect below drawGeigerEffect.
  blastfield: 'drawBlastFieldEffect',
}
// 65th pass -- lets [Shift+C] cycle any station's visualizer through every
// built effect, not just the one it ships with (including the ones
// unassigned above, e.g. GEIGER, SKYLINE, ISOTOPE MAP -- "any effect,
// anywhere" rather than a curated per-station shortlist). Object.keys()
// preserves insertion order for string keys, so this walks VISUAL_METHODS
// in the same order it's declared above; DREAD (the secret station's own
// effect) is included, same "any effect, anywhere" scope, not carved out.
const VISUAL_KEYS = Object.keys(VISUAL_METHODS)
const VISUAL_LABELS = {
  drift: 'DRIFT', flame: 'FLAME', breach: 'BREACH', outrun: 'OUTRUN',
  ripple: 'RIPPLE', stack: 'STACK', skyline: 'SKYLINE', flowfield: 'FLOW FIELD',
  neonsign: 'NEON SIGN', bubbletubes: 'BUBBLE TUBES', boombap: 'BOOM BAP',
  dread: 'DREAD', frost: 'FROST', geiger: 'GEIGER', pulse: 'PULSE',
  counter: 'COUNTER', isotope: 'ISOTOPE MAP', blastfield: 'BLAST FIELD',
}
const BREACH_HEX = '0123456789ABCDEF'
// A resolved fragment briefly holds legible mid-column before dissolving
// back to noise -- CIPHER's own glyph mixed in alongside plausible hacker-
// movie debris, not a generic word list.
const BREACH_WORDS = ['0xFF', 'ROOT', '9F3A', 'ADMIN', 'ACK', 'SYN', '404', 'AUTH', '╬╬╬']

// OUTRUN flair -- palm trees and city skyline -- palm
// rails sit just outside the outermost road rail (r=3 in the grid loop
// below, at 3*depth*1.7) so trees read as roadside planting, not
// obstacles standing in a lane.
const OUTRUN_PALM_RAILS = [-4.4, -3.7, 3.7, 4.4]

// ISOTOPE MAP (52nd pass, ATOMIC), extended same pass to fill the screen
// better with 4 more scattered around -- 5 hot
// sources total, each on its own lissajous path (own frequency pair +
// phase offset so none of them move in lockstep or trace the same loop
// twice). fx/fy are the drift frequencies, ph offsets where each one
// starts along its own loop, and amp scales that source's roam radius
// relative to the shared ampX/ampY in drawIsotopeEffect -- kept close to
// 1 so every source stays a similar size, with enough spread that they
// don't all reach full amplitude at once.
const ISOTOPE_SOURCES = [
  { fx: 0.13, fy: 0.09, ph: 0.0, amp: 1.0 },
  { fx: 0.10, fy: 0.15, ph: 1.7, amp: 0.85 },
  { fx: 0.17, fy: 0.07, ph: 3.4, amp: 0.9 },
  { fx: 0.08, fy: 0.12, ph: 5.0, amp: 0.95 },
  { fx: 0.15, fy: 0.11, ph: 2.5, amp: 0.8 },
]

// 57th pass -- Half-Life Ring tuning (ATOMIC). Life is the ring's full
// travel window; HALF_LIFE is how long its brightness takes to drop by
// half, decaying continuously rather than fading linearly, so it dims fast
// early (like a real isotope) and lingers faint near the end.
const ISOTOPE_RING_MAX = 3
const ISOTOPE_RING_LIFE = 1.6
const ISOTOPE_RING_HALF_LIFE = 0.4
const ISOTOPE_RING_SPEED = 7.5

// 59th pass -- BLAST FIELD tuning (ATOMIC, replaces GEIGER). A bass onset
// spawns a detonation at a random point on the field: a bright core flash
// for its first instant, a fast shockwave ring expanding outward, and a
// wider, dimmer "fallout" band trailing just inside the ring so debris
// reads as settling rather than the blast just vanishing. BLAST_MAX caps
// concurrent blasts so a busy passage doesn't wash the field to solid
// white; BLAST_SPEED is deliberately far faster than ISOTOPE_RING_SPEED
// above (22 vs 7.5) -- a detonation should read as sudden, not a slow
// isotope ripple.
const BLAST_MAX = 6
const BLAST_LIFE = 1.3
const BLAST_HALFLIFE = 0.35
const BLAST_SPEED = 22
const BLAST_RING_BAND = 1.6
const BLAST_DUST_BAND = 6.0

// 59th pass -- SKYLINE towers (MOMENTUM). Pulled out into its own function
// because it's now called from two places: init() (first boot) and
// enterVisualizer() (every re-entry rebuilds fresh, same "process begins,
// doesn't resume" contract GEIGER's needle-at-rest already uses -- see
// enterVisualizer's note). 13 towers spanning the full width; each climbs
// toward its own capH one or more floors at a time, only on a real bass
// onset -- see drawSkylineEffect.
function makeSkylineTowers(cols) {
  const n = 13
  const spacing = cols / n
  return Array.from({ length: n }, (_, i) => ({
    x: Math.round(spacing * i + spacing / 2 - 1),
    w: 2 + (i % 2),
    h: 1 + Math.floor(Math.random() * 3),
    capH: 6 + Math.floor(Math.random() * 14),
    flashUntil: 0,
    topFlashUntil: 0,
  }))
}

// 60th pass -- NEON SIGN (MIDNIGHT NEON). The word BLUES in a hand-authored
// 5x7 pixel font, one entry per letter this station's word actually needs
// (not a full alphabet -- nothing else on the roster spells anything out).
// '#' is a lit segment, '.' is dark. Same 5x7 block-letter convention as
// classic dot-matrix signage.
const NEON_FONT = {
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
}
const NEON_WORD = 'BLUES'
const NEON_LETTER_W = 5
const NEON_LETTER_H = 7
const NEON_GAP = 1
// Ambient flicker -- always running, independent of audio: a neon sign
// hums and gutters a little even with the room quiet, a deliberate
// departure from FLAME's fully-dead-on-silence contract (see VISUAL_METHODS'
// note above neonsign) because this reads as lit hardware, not a flame.
// Probability is per segment per frame, so total flicker rate scales with
// how many segments the word actually has.
const NEON_FLICKER_PROB = 0.0015
const NEON_FLICKER_MIN = 0.08
const NEON_FLICKER_MAX = 0.3
// Bass-onset buzz cascade -- a bigger, audio-driven burst of segments
// knocked dark together, sized by how hard the onset hit (A.bass).
const NEON_BUZZ_BASE = 3
const NEON_BUZZ_SCALE = 10
const NEON_BUZZ_MIN_DUR = 0.15
const NEON_BUZZ_MAX_DUR = 0.5

// 60th pass -- builds the segment list once per (station entry, column
// count) rather than every frame: a fixed word doesn't need per-frame
// layout math, only per-frame on/off state (see drawNeonSignEffect). Also
// returns glowCells -- every empty cell orthogonally adjacent to a lit
// segment, each carrying the indices of the lit segments that light it, so
// the glow halo pass can check "is any neighbour currently on" in O(1)
// rather than rescanning the word every frame.
function buildNeonSegments(cols) {
  const letters = NEON_WORD.split('')
  const totalWidth = letters.length * NEON_LETTER_W + (letters.length - 1) * NEON_GAP
  const startX = Math.max(0, Math.floor((cols - totalWidth) / 2))
  const startY = 1 + Math.floor((VIZ_BOT - 1 - NEON_LETTER_H) / 2)
  const segments = []
  const indexByKey = new Map()
  let lx = startX
  for (const ch of letters) {
    const glyph = NEON_FONT[ch]
    for (let row = 0; row < NEON_LETTER_H; row++) {
      for (let col = 0; col < NEON_LETTER_W; col++) {
        if (glyph[row][col] === '#') {
          const x = lx + col, y = startY + row
          indexByKey.set(x + ',' + y, segments.length)
          segments.push({ x, y })
        }
      }
    }
    lx += NEON_LETTER_W + NEON_GAP
  }
  const glowCells = []
  const glowSeen = new Set()
  for (const seg of segments) {
    const nbrs = [[seg.x - 1, seg.y], [seg.x + 1, seg.y], [seg.x, seg.y - 1], [seg.x, seg.y + 1]]
    for (const [nx, ny] of nbrs) {
      const key = nx + ',' + ny
      if (indexByKey.has(key) || glowSeen.has(key)) continue
      glowSeen.add(key)
      const litIdxs = []
      for (const [gx, gy] of [[nx - 1, ny], [nx + 1, ny], [nx, ny - 1], [nx, ny + 1]]) {
        const gk = gx + ',' + gy
        if (indexByKey.has(gk)) litIdxs.push(indexByKey.get(gk))
      }
      glowCells.push({ x: nx, y: ny, litIdxs })
    }
  }
  return { segments, glowCells }
}

// 63rd pass -- STANDBY splash wordmark, built for a better standby screen:
// SIGNAL wordmark, then version number, then standby state, then power-on
// hint. Same hand-authored 5x7 block-letter convention as NEON_FONT
// above -- a separate font rather than extending NEON_FONT, since this one
// belongs to the app chrome, not a station effect, even though S and L are
// drawn the same way in both. Static and always fully lit, clean, over an
// ambient flicker -- reads as a stable logo, not a scene.
// No per-letter colour: the CRT is single-tint beam intensity (see
// term.js), so the depth/impact of the reference image comes from an offset
// shadow duplicate (drawn one cell down-right, FAINT) behind the bright
// glyph instead of a colour gradient -- see drawStandbyLogo().
const STANDBY_LOGO_FONT = {
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.####'],
  N: ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
}
const STANDBY_LOGO_WORD = 'SIGNAL'
const STANDBY_LOGO_LETTER_W = 5
const STANDBY_LOGO_LETTER_H = 7
const STANDBY_LOGO_GAP = 1
// Rows used top-to-bottom below the logo's own STANDBY_LOGO_LETTER_H: a
// blank line (the logo's bottom row casts its shadow one cell down, into
// this row -- without it the shadow collides with VERSION_TAG), then
// VERSION_TAG, another blank, STANDBY, the power-on hint, another blank,
// then the clock -- 7 in total. drawStandbyClock() computes its row from
// this same function on every independent per-second tick (it doesn't
// redraw the rest of the screen), so the two can never drift apart.
const STANDBY_BLOCK_TAIL_ROWS = 7
// 63rd-pass live QA fix: naively centering left the logo's bright rows
// straddling STATION_Y on desktop, and powerDown()'s phosphor burn-in
// ghost (54th pass) draws the last-locked callsign directly onto that
// row on its way into STANDBY -- sliced right through the middle of the
// wordmark, turning it into an illegible double-exposure. That ghost's
// whole point is to land somewhere the STANDBY layout doesn't reach (its
// own comment says so), so the fix belongs here, not there: if the
// naturally-centered logo would straddle STATION_Y, nudge the block up
// just far enough that the logo's bright rows end a row above it.
// Mobile never draws that ghost (see powerDown()'s `!this.mobile` guard),
// so it stays purely centered.
function standbyLayout(term, mobile) {
  let top = Math.floor((term.rows - (STANDBY_LOGO_LETTER_H + STANDBY_BLOCK_TAIL_ROWS)) / 2)
  if (!mobile) {
    const bottom = top + STANDBY_LOGO_LETTER_H - 1
    if (top <= STATION_Y && STATION_Y <= bottom) top = STATION_Y - STANDBY_LOGO_LETTER_H
  }
  return {
    logoTop: top,
    versionY: top + STANDBY_LOGO_LETTER_H + 1,
    standbyY: top + STANDBY_LOGO_LETTER_H + 3,
    hintY: top + STANDBY_LOGO_LETTER_H + 4,
    clockY: top + STANDBY_LOGO_LETTER_H + 6,
  }
}

// 61st pass -- BUBBLE TUBES tuning (MIDNIGHT NEON, replaces NEON SIGN).
// JUKE_TUBES matches A.bands9's length on purpose -- one tube per real
// spectrum band, not an arbitrary count. JUKE_IDLE_FILL is the "hardware
// stays on" floor: even a fully quiet band still shows some lit tube,
// same idea as NEON SIGN's ambient flicker.
// 62nd pass -- the bubble pool (JUKE_BUBBLE_*) is gone along with the
// bubbles themselves: the "0" bubble shapes didn't read well, kept as
// the thicker bars instead.
const JUKE_TUBES = 9
const JUKE_IDLE_FILL = 0.16

// 57th pass, 2nd rewrite -- Neon Grid Decay grid resolution (COLD WAVE).
// Fixed regardless of terminal width; drawFrostEffect maps it onto
// cols/COLD_GRID_COLS spacing every frame.
const COLD_GRID_COLS = 16
const COLD_GRID_ROWS = 9

// 57th pass, 3rd rewrite -- Flow Field glyph set (MOMENTUM). Picked by the
// local direction angle to suggest which way the current runs at that cell.
const FLOW_GLYPHS = ['-', '\\', '|', '/']

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
    // Version tag (28th pass, revised: same font/weight as SIGNAL itself,
    // no codename) -- sits right after the wordmark, one
    // space over, same BOLD as SIGNAL. Verified against the brand-plate's
    // centerX() start (25 at 80 cols) so the two never collide.
    term.text(9, 0, VERSION_TAG, BOLD, 1)
    // Date/time module (15th pass; repositioned 17th pass -- version number
    // removed from here and date/time put in its place, using the same
    // formatting the version number used) -- the version number used to live at
    // x=72 in this same DIM/inverse style; it's gone now and the clock sits
    // in its place instead. Drawn once here on every chrome (re)draw; the
    // 1s ticker set up in init() keeps it live after that (see
    // drawClock()/this._clockTimer).
    this.drawClock(s)

    // Brand-plate nameplate (10th pass, a skeuomorphism idea; moved into
    // the title bar itself in the 11th pass, folding "MODEL SG-1" etc into
    // the header) -- sits in the open space left of the
    // clock, same inverse plane as the rest of the title row instead of
    // floating as its own dim line underneath it. The power/lock LED used
    // to sit here too (10th pass) but moved down onto the status line in
    // the 17th pass, since it wasn't obvious tucked in next to the
    // title text -- see setStatus().
    const brand = 'MODEL SG-1  -  SIGNAL RECEIVER'
    term.text(centerX(term.cols, brand), 0, brand, FAINT, 1)
  },

  // 45th pass -- mobile's whole frame: wordmark, status line, STATION and
  // NOW PLAYING boxes, a touch-gesture footer instead of the keyboard hint
  // rows. No TUNING BAND/LEVELS boxes at all -- no tuner strip to drive them.
  // 2026-08-22 -- the top header mirrors what desktop has (date, time,
  // SG-1, etc) -- wordmark+clock share row 0 same as
  // desktop's title bar (left/right split instead of centered, so there's
  // room for both); the brand-plate took row 1, which used to just be blank
  // spacing between the title and the status row.
  // 2026-08-22, round 2 -- collapsed to one line, with SG-1 in the
  // middle instead of the full plate text: the two-row mirror read as too
  // heavy on a 42-col phone screen. Back to one row: wordmark left, a short
  // "SG-1" centered (not the full "MODEL SG-1 - SIGNAL RECEIVER" plate),
  // clock right. Row 1 goes back to being blank spacer, same as before the
  // two-row version existed.
  // 2026-08-22, round 4 -- header needed to be one row, not two: the
  // row-1 clear below was STILL painting an inverse (highlighted) blank
  // across the whole row, a leftover from when row 1 carried the brand-plate
  // text. Visually that reads as a solid two-row header bar even with no
  // text on the second row -- inv=1 is what makes a cell part of the "bar"
  // look, not just having text on it. Row 1 now clears to a plain (inv=0)
  // blank, so the header is genuinely one inverse row with real blank space
  // under it, not a header-colored band bleeding into what should be gap.
  mobileDrawChrome(s) {
    const { term } = s
    for (let x = 0; x < term.cols; x++) { term.put(x, 0, ' ', NORMAL, 1); term.put(x, 1, ' ', NORMAL, 0) }
    // 2026-08-22, round 6 -- a lowercase "m" added, so SIGNAL v0.8m --
    // mobile-only suffix on the version tag, distinguishing the
    // mobile build's own title from desktop's plain "SIGNAL v0.8" without
    // touching VERSION_TAG itself (which the Guide's about page and the
    // desktop title bar both also read off of).
    const title = `SIGNAL ${VERSION_TAG}m`
    term.text(2, 0, title, BOLD, 1)
    this.drawClock(s)
    // 2026-08-22, round 5 -- SG-1 was hard to read on mobile; FAINT dims the
    // foreground, and under inv=1 that foreground IS what's drawn against
    // the bright inverse fill -- so a dim foreground on a bright ground is
    // low-contrast, the opposite of what FAINT reads as on a normal (non-
    // inverse) background. DIM instead, matching the clock just above,
    // which uses the same inverse row and wasn't flagged as hard to read.
    const brand = 'SG-1'
    term.text(centerX(term.cols, brand), 0, brand, DIM, 1)
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
    drawBoxSide(term, L.npProgress, MBOX_X0, MBOX_X1, BOLD)
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
    // Widgets and the playback bar all live in the zone that just got
    // wiped -- redraw them at their new rows immediately rather than
    // waiting for the next VU/antenna tick (up to ~120ms away).
    this.drawVU(s)
    this.drawSignal(s)
    this.drawAntenna(s, 0)
    this.drawPlayback(s)
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

    // 30th pass -- boxes needed more dimension to show which one is
    // active. NOW PLAYING is the "hero" box (what's actually playing
    // matters most, see the 5th-pass note above), so its frame draws a
    // notch brighter than the other three's static MUTED chrome instead of
    // all four boxes reading as identical weight. 31st pass: this was
    // BRIGHT at first, but the CRT bloom shader turns a full-BRIGHT dashed
    // border into what reads as a blown-out solid bar rather than a crisp
    // line once it's actually rendered, confirmed against a screenshot of
    // exactly that failure. BOLD is the same one-notch-up
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

    // Speaker-grille texture (10th pass, a skeuomorphism idea)
    // -- the divider row below VOL was a plain blank interior (just the
    // box's side borders with nothing between). Filling it with a dotted
    // perforation pattern instead reads as a physical speaker grille, at
    // zero extra row cost. Confined to the left half only (18th pass, see
    // METERS_DIVIDER_X) -- the right half is reserved/blank until there's
    // content for it.
    // 58th pass -- VU_DIVIDER_Y's own grille call removed: only the
    // dotted row below volume stays, the rest of the space is for eq bars,
    // no second dotted row or gap treating them as separate rows.
    // That row is drawEqRibbonLeft()'s own content now (the middle third
    // of its 3-row-tall bars), overwritten fully every frame, so no static
    // texture should show through it any more.
    drawGrille(term, VOL_SIG_DIVIDER_Y, BOX_X0, METERS_DIVIDER_X)

    // LEVELS vertical divider (18th pass -- LEVELS halved, with levels on
    // one side and something tbd on the other) -- splits the
    // single LEVELS box into two halves without changing its outer frame.
    // T-junctions where the divider meets the box's own top/bottom border,
    // a plain vertical bar down the interior rows. Drawn after the grille
    // above so it isn't overwritten by it.
    term.put(METERS_DIVIDER_X, METERS_TOP_Y, '┳', MUTED)
    for (const y of [VOL_Y, VOL_SIG_DIVIDER_Y, SIG_Y, VU_DIVIDER_Y, VU_Y]) {
      term.put(METERS_DIVIDER_X, y, '│', MUTED)
    }
    term.put(METERS_DIVIDER_X, METERS_BOT_Y, '┻', MUTED)

    // Right half's own label (58th pass -- the space on the right was the
    // only panel not labeled; STATUS fits the antenna/S-N/
    // TRI/PLS/preset-mode-mute mix better than a more literal name would,
    // since none of those are one single measurement). Embedded directly
    // into the same top-border row rather than a second drawBoxTop() call,
    // so the '┳' T-junction and the box's own '┐' corner (both already
    // placed above) aren't clobbered -- same tag-centering math
    // drawBoxTop() uses internally, just applied to the right half's own
    // METERS_DIVIDER_X..BOX_X1 span instead of the whole box width.
    {
      const tag = ' STATUS '
      const inner = BOX_X1 - METERS_DIVIDER_X - 1
      const tagX = METERS_DIVIDER_X + 1 + Math.floor((inner - tag.length) / 2)
      for (let k = 0; k < tag.length; k++) term.put(tagX + k, METERS_TOP_Y, tag[k], MUTED)
    }

    // The LEVELS right half (GIAL nameplate's old spot, then the PWR/AIR/
    // STEREO/MONO/MUTE indicator panel) is now the animated antenna glyph --
    // see drawAntenna(). Not static, so it isn't drawn here; the two call
    // sites that used to follow drawChrome() with a nameplate-is-already-
    // there assumption (powerUp's reveal beat, closeGuide()) call
    // drawAntenna() explicitly, same as they already do for drawVU().

    // Chassis corner brackets (10th pass, a skeuomorphism idea)
    // -- the 4 columns outside the panel stack (x 0-1 and 78-79)
    // were unused; bracketing the stack's outer corners there reads as a
    // physical bezel around the receiver rather than the panels just
    // floating on black.
    term.put(0, TUNER_TOP_Y, '┏', MUTED)
    term.put(term.cols - 1, TUNER_TOP_Y, '┓', MUTED)
    term.put(0, METERS_BOT_Y, '┗', MUTED)
    term.put(term.cols - 1, METERS_BOT_Y, '┛', MUTED)
  },

  // Date/time module, running-screen half (15th pass; repositioned +
  // brightened 16th pass, having been in the wrong spot and too dim; moved
  // again 17th pass onto the version number's old spot, with the version
  // number removed from here and date/time put in its place, using the
  // formatting that was used for version). Right-aligned to end at column 75 -- exactly where
  // "v0.2" used to end -- same DIM/inverse formatting the version used, so
  // it reads the same way the version did, just with the date/time in its
  // place. Same width every tick, so no blank-first needed.
  drawClock(s) {
    const { term } = s
    const str = formatClock(new Date())
    // 2026-08-22: mobile gets its own right-aligned position on the same
    // row (2 cols in from the edge) rather than desktop's fixed column 76,
    // which is well past this grid's 42 columns.
    const x = this.mobile ? term.cols - 2 - str.length : 76 - str.length
    // 2026-08-22, round 6 -- for balance, the date/time gets the same
    // treatment as SIGNAL v0.8 -- mobile's clock
    // used to be DIM against the header's inverse fill, visibly weaker
    // than the BOLD title sharing the same row; matching its weight reads
    // as one consistent header instead of two different ones stitched
    // together. Desktop's clock (a lighter touch by design, off to the
    // side of the same-weight title/brand-plate the row already carries)
    // is untouched.
    const attr = this.mobile ? BOLD : DIM
    for (let i = 0; i < str.length; i++) term.put(x + i, 0, str[i], attr, 1)
  },

  // Date/time module, STANDBY half (15th pass) -- real clock-radios keep
  // their clock lit even powered off, so this shows underneath the
  // STANDBY/"[P] POWER ON" text rather than going dark along with
  // everything else. Driven by the same this._clockTimer as drawClock().
  drawStandbyClock(s) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    const str = formatClock(new Date())
    term.text(centerX(term.cols, str), standbyLayout(term, this.mobile).clockY, str, FAINT)
  },

  // 63rd pass -- STANDBY wordmark. Draws the SIGNAL block letters (see
  // STANDBY_LOGO_FONT) at the given top row. A FAINT copy one cell down-
  // right is drawn first as a stand-in for the reference image's layered
  // colour depth -- the CRT only has one beam-intensity channel (see
  // term.js), so an offset shadow is what "impact" translates to here --
  // then the BRIGHT glyph on top of it.
  drawStandbyLogo(s, top) {
    const { term } = s
    const letters = STANDBY_LOGO_WORD.split('')
    const totalWidth = letters.length * STANDBY_LOGO_LETTER_W + (letters.length - 1) * STANDBY_LOGO_GAP
    const startX = Math.max(0, Math.floor((term.cols - totalWidth) / 2))
    const segments = []
    let lx = startX
    for (const ch of letters) {
      const glyph = STANDBY_LOGO_FONT[ch]
      for (let row = 0; row < STANDBY_LOGO_LETTER_H; row++) {
        for (let col = 0; col < STANDBY_LOGO_LETTER_W; col++) {
          if (glyph[row][col] === '#') segments.push({ x: lx + col, y: top + row })
        }
      }
      lx += STANDBY_LOGO_LETTER_W + STANDBY_LOGO_GAP
    }
    for (const seg of segments) {
      const sx = seg.x + 1, sy = seg.y + 1
      if (sx < term.cols && sy < term.rows) term.put(sx, sy, '█', FAINT)
    }
    for (const seg of segments) term.put(seg.x, seg.y, '█', BRIGHT)
  },

  // 63rd pass -- the whole STANDBY splash: logo, version, STANDBY, the
  // power-on hint, then the clock. Both places that used to draw the
  // STANDBY/hint text inline (init()'s first paint and powerDown()'s
  // landing beat) now just call this, so the layout only exists once.
  drawStandbyScreen(s) {
    const { term } = s
    const L = standbyLayout(term, this.mobile)
    this.drawStandbyLogo(s, L.logoTop)
    term.text(centerX(term.cols, VERSION_TAG), L.versionY, VERSION_TAG, DIM)
    const label = 'STANDBY'
    term.text(centerX(term.cols, label), L.standbyY, label, FAINT)
    const hint = this.mobile ? 'TAP TO POWER ON' : '[P] POWER ON'
    term.text(centerX(term.cols, hint), L.hintY, hint, FAINT)
    this.drawStandbyClock(s)
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
    // 31st pass -- the color-name flash toast was dropped: the antenna
    // pane's mode strip (see drawModeStrip()) is a persistent on-screen
    // readout of the same information the old transient toast announced,
    // so flashDisplayMode() was removed as a duplicate.
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
  // 2026-08-22 -- a red theme kicks in when locked onto that station --
  // the single place that decides what phosphor tint should
  // actually be on screen right now: a locked secret station's own
  // forcedPhosphor (see config.js's PHOSPHORS -- forced tints like 'red'
  // and 'purple' are deliberately NOT in DISPLAY_MODES, so neither is ever
  // reachable via the normal [C] cycle) whenever one is the locked station,
  // otherwise whatever the user's normal DISPLAY_MODES preference is.
  // Called from every place mode/lockedStation can change (tryLock,
  // enterSeeking) plus cycleDisplayMode itself, so the picture is always in
  // sync with current lock state instead of each call site having to
  // remember to special-case secret stations on its own.
  // 2026-08-23: reads lockedStation.forcedPhosphor (falling back to 'red'
  // for compatibility) instead of a hardcoded 'red', now that GREEN HOUSE
  // needs its own 'purple' here too.
  applyPhosphor(s) {
    const secretStation = this.mode === 'locked' && this.lockedStation && this.lockedStation.secret
      ? this.lockedStation : null
    // 41st pass: setPhosphor() no-ops when the requested tint is already the
    // active one BY REFERENCE, and applySecretTease() leaves a freshly built
    // array in there -- so without clearing the flag and forcing the
    // assignment, coming off a tease could leave the blended tint stuck.
    this._teasing = false
    const name = secretStation ? (secretStation.forcedPhosphor || 'red') : DISPLAY_MODES[this.displayModeIndex].key
    if (s.crt && PHOSPHORS[name]) s.crt.phosphor = PHOSPHORS[name]
    s.setPhosphor(name)
  },

  init(s) {
    const { term } = s

    // 53rd pass -- kicked off here, not lazily on first powerUp(), so the
    // fetch/decode has the whole time-to-first-power-on to finish. Harmless
    // if it's still in flight when needed (playNetworkId awaits the same
    // promise) and harmless if it never resolves (an asset missing on a
    // fresh checkout, say) -- the ID just silently doesn't play.
    // 55th pass -- also prefetches every public station's verbal ID (for
    // first-lock/preset-change), not just the welcome line.
    loadWelcomeLineBuffer()
    STATIONS.forEach((st) => loadStationIdBuffer(st.id))
    // 56th pass -- liner drop clips (see maybePlayLinerDrop) -- just
    // CIPHER's pilot clip for now.
    Object.values(LINER_FILES).flat().forEach(loadLinerBuffer)

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
    // 2026-08-24 -- true while the visualizer's [L] lyrics view has taken
    // over the effect canvas in place of the station's normal visual (see
    // drawVisualizerFrame). Only ever true while visualizerActive is also
    // true; exitVisualizer()/powerDown() don't need to reset it explicitly
    // since entering the visualizer fresh always starts with it false.
    this.lyricsViewOpen = false
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
    // 13th pass -- the app should default to a powered off state
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
    // 65th pass -- per-station visualizer effect override, keyed by
    // station.id. Empty until [Shift+C] cycles a station off its default;
    // restored from saved.visualOverrides in the session-restore block
    // below and read by drawVisualizerFrame() ahead of station.visual.
    this.visualOverrides = {}
    // 54th pass -- warm-up drift (see frame()/powerUp()). Both explicit
    // here even though powerUp() always sets _warmupUntil before frame()
    // could ever read it -- matches how every other per-instance field in
    // this block is spelled out rather than left to fall through as undefined.
    this._warmupUntil = null
    this._freqJitter = 0
    // 55th pass -- which stations have already played their organic-lock
    // verbal ID this session (see tryLock()'s announce logic). Preset-driven
    // locks ignore this and always announce; it only gates the "first time
    // you land here by ear" case. Session-lifetime, not persisted.
    this._announcedStations = new Set()
    // 56th pass -- last liner clip path played (see maybePlayLinerDrop),
    // so a station with more than one clip doesn't repeat itself back to
    // back. Irrelevant with CIPHER's single pilot clip today.
    this._lastLiner = null
    // 2026-08-23 (live audio tap) -- the vetted per-frame bus view (set in
    // drawVisualizerFrame; null = render synthetic) and the uniform bloom
    // layer's throttle clock.
    this._au = null
    this._auBloomAt = 0
    // Per-effect state for the visualizer roster (44th pass) -- kept here
    // rather than reset on entry, same as vuTrace etc. below: cheap, and
    // there's no reason a column's scroll phase or a glitch beat needs to
    // snap back to a fixed start every time [V] is pressed.
    this._breachCols = Array.from({ length: term.cols }, () => ({
      speed: 6 + Math.random() * 10,
      head: Math.random() * 30,
      resolveAt: -1,
      word: null,
      wordRow: 0,
      wordUntil: 0,
    }))
    // 2026-08-23 (live audio tap) -- BREACH's rain-speed accumulator clock,
    // same reasoning as _outrunPhaseT: speed reacts via per-column phase
    // advance, never by scaling the `t * col.speed` term itself.
    this._breachLastT = 0
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
    // 2026-08-23 (live audio tap) -- OUTRUN's road-speed phase accumulator.
    // The rungs/grass/palms used to scroll on raw `t * 0.6`; with the tap
    // live the RATE of that scroll follows the track's level, which can't be
    // done by scaling `t` per frame (the geometry would teleport on every
    // level change), so the phase integrates instead. Neutral rate is
    // exactly 0.6/s -- with no tap the road drives precisely as it always
    // did. Reset on every visualizer entry alongside the effect clock.
    this._outrunPhase = 0
    this._outrunPhaseT = 0
    // 57th pass -- Tachometer Sync, off the visualizer-lab mock's
    // "tachometer" concept for CIRCUIT CRUSH. A small dash gauge tucked in the
    // sky's dead space, top-left, driven by A.bass; redlines and holds
    // briefly on a real onset. 0 when there's no tap.
    this._outrunRedline = 0
    // RIPPLE's rain-ring slots (45th pass, CITY LIGHTS) -- fixed drop
    // points, each respawning on a stagger once it's fully faded.
    this._ripples = Array.from({ length: RIPPLE_SLOTS }, () => ({
      x: Math.random() * term.cols,
      y: 1 + Math.random() * 21,
      startT: -Math.random() * RIPPLE_MAXAGE,
    }))
    // 57th pass -- Half-Life Ring, off the visualizer-lab mock's
    // "half-life ring" concept for ATOMIC. A strong bass onset spawns a ring at
    // one of the isotope sources' current position; it expands and its
    // brightness decays on an actual half-life curve (see drawIsotopeEffect's
    // tail end). Capped at ISOTOPE_RING_MAX concurrent so a busy passage
    // doesn't clutter the field.
    this._isotopeRings = []
    // 57th pass -- Scratch Flash, off the visualizer-lab mock's
    // "DJ/turntable related" concept for HACKBACK. Short-lived zigzag bursts near
    // a driver, spawned on a strong treble onset, layered on top of the
    // existing boombox look.
    this._scratchFlashes = []
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
    // SKYLINE's towers ("momentum a" -- rising skyline instead of
    // a bar-chart ticker). unassigned STACK's old bars stay above, kept
    // for the same reason PULSE/COUNTER were kept -- see VISUAL_METHODS.
    // 13 towers spanning the full width, each climbing toward its own
    // target floor by floor; on reaching it, most add another few floors
    // (the build keeps going), some reset short (a new build breaks
    // ground) -- reads as a skyline under constant, uneven construction
    // rather than a synchronized bounce.
    // 59th pass -- towers are back (see VISUAL_METHODS' note on
    // 'skyline'/'flowfield' for the full history). Pulled the actual array
    // construction into makeSkylineTowers() since enterVisualizer() now
    // also calls it (towers rebuild fresh on every visualizer entry).
    this._momentumTowers = makeSkylineTowers(term.cols)
    this._momentumNextTower = 0
    // 59th pass -- BLAST FIELD's live detonations (ATOMIC). See BLAST_*
    // tuning constants and drawBlastFieldEffect.
    this._blasts = []
    // 60th pass -- NEON SIGN's segment layout/flicker state (MIDNIGHT
    // NEON). See buildNeonSegments and drawNeonSignEffect.
    this._neon = null
    this._neonOff = new Map()
    // DREAD's panel grid (45th pass, the secret station).
    this._dreadGrid = Array.from({ length: DREAD_CELLS_X * DREAD_CELLS_Y }, () => Math.random() < 0.5)
    this._dreadTear = { active: false, row: 0, until: 0 }
    // 57th pass, 4th rewrite -- BOOM BAP rebuilt around "boombox with sound
    // waves, pulsing lights, and meters," dropping the MPC
    // pad-sequencer concept entirely -- see drawBoomBapEffect. Speaker/
    // sound-wave rings stay (`_boomWaves`); the old step-sequencer state
    // (_boomLastStep, _boomPadFlashAt, _boomLivePat, _boomBeatCount,
    // _boomPrevPhase) is gone, along with the pad grid it drove. The EQ
    // bars are repurposed as a continuous VU-style meter bank -- springs
    // toward the live band value every frame instead of jumping once per
    // sequencer step -- and a new LED strip pulses with the beat.
    this._boomWaves = []
    this._boomEq = Array.from({ length: 22 }, () => ({ level: 0, target: 0 }))
    // FLAME's heat buffer (46th pass, DISTORTION FIELD) -- one float per
    // cell across the visualizer's full row range (0..VIZ_BOT-1; row 0 is
    // unused since the effect never draws above row 1). Still sized off
    // HINT_Y1 rather than VIZ_BOT: harmlessly one row over-allocated since
    // the 50th pass shrank the canvas, and re-sizing it buys nothing.
    this._fireHeat = new Array(term.cols * HINT_Y1).fill(0)
    this._fireLastStep = 0
    // 57th pass, 2nd rewrite -- Neon Grid Decay is now COLD WAVE's actual
    // core visual, rather than a small corner overlay on the old FROST
    // automaton, which this replaces outright. A full-screen wireframe grid, node
    // brightness 0..1 per intersection, ignited by the tap and decaying
    // back out on its own -- "neon signage losing power," not ice growing.
    // Grid resolution is independent of term.cols (positions are
    // recomputed from cols/COLD_GRID_COLS every frame), so this array is a
    // fixed size regardless of terminal width.
    this._coldGridCells = new Float32Array(COLD_GRID_COLS * COLD_GRID_ROWS)
    // GEIGER's needle + strip-chart state (50th pass, ATOMIC). `v` is the
    // needle position 0..1 with `vel` its velocity -- a spring-damper, the
    // same ballistics model drawVU()/STATIONS[].meter already use, because
    // a real moving-coil needle overshoots and settles rather than
    // snapping. `strip` is the rolling chart-recorder trace, one count per
    // column, scrolled left one column per step.
    this._geiger = null

    // Scrolling-waveform VU state (11th pass -- see drawVU()).
    this.lastProgressDraw = 0
    this.vuSample = 0.03
    this.vuVelocity = 0
    this.vuTrace = new Array(16).fill(0) // 18th pass: trimmed from 24, see drawVU()

    // Field-strength readout + EQ ribbon, antenna pane's right margin (30th
    // pass -- a secondary readout made sense alongside thin horizontal
    // ribbons). Own spring-damped state, same pattern as
    // vuSample/vuVelocity above, kept separate so they don't just mirror
    // the VU meter's motion 1:1 -- see drawFieldReadout()/drawEqRibbon().
    this.fieldSample = 0.5
    this.fieldVelocity = 0
    this.eqSamples = new Array(TAP_BANDS).fill(0.08)   // 58th pass: 6 -> 9 bands
    this.eqVelocities = new Array(TAP_BANDS).fill(0)

    // Tri-band meter, LEVELS box left half (58th pass -- the levels area was
    // redone now that realtime indicators are possible, replacing the VU
    // trace and freeing up that side of the box, with signal droppable if
    // needed). Replaces the old VU trace and SIG reception bar on
    // desktop with a real bass/mid/treble readout -- own spring-damped
    // state per band, same pattern as eqSamples/eqVelocities above. See
    // drawTriBand().
    this.bandSamples = [0.05, 0.05, 0.05]   // [bass, mid, treble]
    this.bandVelocities = [0, 0, 0]

    // Pulse readout, antenna pane (58th pass -- see drawPulseReadout()).
    // Peak-hold on top of AUDIO_BUS.pulse's own fast decay, own state.
    this._pulseDisplay = 0

    this.history = [] // stack of previously-locked stations, for [B] back
    this.nowPlaying = null
    // Set once below if a saved session is restored, so powerUp() knows
    // the player needs an actual loadTrack() call (fresh YT.Player, never
    // loaded anything) rather than just resuming playback on an already-
    // cued video, which is all a same-session power-cycle needs.
    this.needsTrackLoad = false
    // 2026-08-22, round 4 -- true for the duration of onTouchStart/
    // onTouchEnd/key()'s own synchronous body (set at entry, cleared right
    // before each returns). loadTrack() reads it to decide whether it's
    // safe to unmute immediately (see there) instead of deferring.
    this._inUserGesture = false

    // Restore last session (14th pass -- session persistence) --
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
    // 2026-08-22, round 9 -- audio has to start decoding synchronously
    // inside the power-on tap for the browser to allow it -- see loadTrack()'s
    // round-4/7 comments -- so on mobile there's no way to also hold it
    // silent through the boot animation without breaking that; a round-8
    // attempt to fake the silence with player.setVolume(0) didn't hold up on
    // a real device. Mobile starting muted is acceptable as long as it's
    // obvious to the user -- a genuinely first-ever mobile visit (no saved
    // session at all -- `saved` is null only the very first time, before any
    // preference exists to respect) now defaults muted, so nothing plays out
    // loud before anyone's touched anything. A returning visitor's own saved
    // mute/unmute choice below always wins over this default.
    if (!saved && this.mobile) this.muted = true
    if (saved) {
      if (typeof saved.volume === 'number') this.volume = Math.min(100, Math.max(0, saved.volume))
      if (typeof saved.muted === 'boolean') this.muted = saved.muted
      if (typeof saved.phosphor === 'string') {
        const idx = DISPLAY_MODES.findIndex((m) => m.key === saved.phosphor)
        if (idx !== -1) this.displayModeIndex = idx
      }
      if (saved.visualOverrides && typeof saved.visualOverrides === 'object') {
        this.visualOverrides = saved.visualOverrides
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
    // 50th pass: hard mute -- seed the speaker bus with whatever mute state
    // survived the restore above (or mobile's fresh-visit default), so the
    // very first WebAudio sound of a muted session is already silent. The
    // bus doesn't exist yet this early (it's lazy, see speakerOut()), which
    // is exactly why setSpeakerMuted tracks the flag module-level: the bus
    // is born muted when some later sound first creates it.
    setSpeakerMuted(this.muted)
    // 28th pass -- sometimes it didn't automatically seek to a
    // station and the user had to figure out to use arrows or hit S -- a
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
    // 63rd pass -- see drawStandbyScreen(): logo, version, STANDBY, the
    // power-on hint, and the clock, laid out and centered together by
    // standbyLayout().
    this.drawStandbyScreen(s)

    // Guide overlay (15th pass -- a G key for guide, added).
    this.guideOpen = false

    // Date/time module ticker (15th pass) -- one interval for the whole
    // page lifetime, since the clock needs to keep ticking on the STANDBY
    // screen too (a real clock-radio's display doesn't go dark just
    // because the set itself is off). Skipped entirely while the guide
    // overlay is open, since that's a full-screen takeover with nothing to
    // tick into.
    // 16th pass -- date/time removed during cold boot -- the boot
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

    // 2026-08-23 (live audio tap) -- read the persisted mic-permission state
    // before the first power-on needs it. Async and prompt-free; see
    // queryMicPermission() for why this is what makes the mic tier silent on
    // return visits.
    queryMicPermission()

    // 22nd pass -- semi mobile functionality: tapping the screen can
    // power on, swipe left/right cycles channels -- touch's own gesture
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
    // 54th pass: _freqJitter is a purely cosmetic offset (see frame()'s
    // warm-up drift block) -- nearestStation()/the glow computation above
    // stay on the real this.freq, only the drawn cursor position wobbles.
    const cursorCol = freqToCol(this.freq + (this._freqJitter || 0))
    term.put(cursorCol, DIAL_Y, '█', BRIGHT)
  },

  drawFreq(s) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    for (let x = BOX_X0 + 1; x < BOX_X1; x++) term.put(x, FREQ_Y, ' ')
    // 54th pass: see drawDial()'s _freqJitter comment -- same cosmetic-only offset.
    const str = (this.freq + (this._freqJitter || 0)).toFixed(1)
    term.text(centerX(term.cols, str), FREQ_Y, str, BOLD)
  },

  // 11th pass -- flair added around scanning/locked status: readout-style
  // brackets instead of leaving it as bare centered text.
  //
  // 23rd pass -- the dot LED indicator next to it didn't read as an LED or
  // status, so it was removed. It also turns out to have been
  // the cause of the status line reading as off-center: `combined` (what
  // centerX() actually centered) was `ledGlyph + '  ' + bracket`, 3 columns
  // of glyph+gap tacked onto the LEFT side only with nothing to balance it
  // on the right, so the bracket itself landed 1-2 columns right of true
  // center every time. Centering the bracket alone fixes both complaints at
  // once. Lock/seek state is still visible elsewhere (the LED's old jobs:
  // the dial's ▲/█ brightness and the LEVELS SIG meter), so nothing here
  // was the only place that state showed up.
  // 38th pass -- when seeking or scanning, that flashes in
  // the status area instead of just changing the text. Everything this
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
    const instant = same || this._powerAnimating || text === 'LOCKED' || text === 'MUTED' || text === 'NO SIGNAL'
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
    // 30th pass -- statuses like LOCKED needed more emphasis -- the bracket
    // was already BRIGHT when active (same
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
    // 2026-08-22 -- the tuning "line" was also drawing over the status
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
    // briefly left to right" behavior observed. Mobile's status row just
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
      const x = x0 + i
      // Same '┻' junction the idle shimmer nudges off of (18th pass) -- the
      // scramble write loop didn't skip it, only its own restore did, so a
      // tear event could stomp the junction with scramble glyphs for the
      // ~90ms flash window. Leave that one cell alone.
      if (y === METERS_BOT_Y && x === METERS_DIVIDER_X) continue
      term.put(x, y, glyphs[Math.floor(Math.random() * glyphs.length)], Math.random() < 0.4 ? DIM : FAINT)
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

  // 50th pass -- the grind micro-glitch (see frame()'s scheduler and
  // STATIONS[].grind). crtIdleEvent's little sibling: fires every few
  // seconds instead of every few minutes, so it has to stay SMALL -- a
  // stab, not an event. Three weighted shapes, CRT params only (no
  // text-grid writes at all, see the scheduler's comment):
  //   ~50%  chroma stab   -- misconvergence spikes and settles back
  //   ~30%  roll stutter  -- the picture slips a beat, catches itself
  //   ~20%  full flashCrtGlitch() -- the existing 150ms chroma+roll hit
  // Restores via crtDegradeForDist(dist) same as flashCrtGlitch/
  // crtIdleEvent -- what the CURRENT tuning distance calls for, never raw
  // crtBase/SCREEN, so it composes with the degrade instead of erasing it.
  crtGrind(s) {
    if (!s?.crt?.params) return
    if (!this.poweredOn || this.guideOpen) return
    const roll = Math.random()
    if (roll < 0.2) { flashCrtGlitch(s); return }
    const { dist } = nearestSignal(this.freq)
    const restore = crtDegradeForDist(dist)
    if (roll < 0.7) {
      rampCrtParams(s, { chroma: 1.4 + Math.random() * 0.8 }, { chroma: restore.chroma }, 220)
    } else {
      rampCrtParams(s, { roll: 0.35 + Math.random() * 0.2, rollSpeed: 1.1 }, { roll: restore.roll, rollSpeed: crtBase.rollSpeed }, 340)
    }
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
      // 58th pass -- same reasoning as the T-junctions just above: the
      // full-width drawBoxTop() call for METERS_TOP_Y just wiped the right
      // half's own STATUS tag (see drawChrome()), so it needs redrawing
      // here too or it would vanish on every power-on.
      {
        const tag = ' STATUS '
        const inner = BOX_X1 - METERS_DIVIDER_X - 1
        const tagX = METERS_DIVIDER_X + 1 + Math.floor((inner - tag.length) / 2)
        for (let k = 0; k < tag.length; k++) term.put(tagX + k, METERS_TOP_Y, tag[k], attr)
      }
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

  // Power down/up (12th pass -- power on and power
  // down sequences built). Neither one resets freq/lockedStation/shuffle
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
        // 63rd pass -- see drawStandbyScreen(): same logo/version/STANDBY/
        // hint/clock layout the first-ever paint in init() draws.
        this.drawStandbyScreen(s)
        // 38th pass: afterglow bleeding back down to nominal persistence
        // across the first moments of STANDBY, rather than snapping back.
        rampCrtParams(s, { decay: 0.96 }, { decay: crtBase.decay }, 420, 0, false)
        this._powerAnimating = false // sequence landed, ticker can resume
        // 54th pass -- small mechanical touches, including a phosphor
        // burn-in ghost -- a real tube briefly holds a faint afterimage of
        // whatever was last on screen. Drawn at STATION_Y, the callsign's
        // real on-air row, not anywhere in the STANDBY layout above -- reads
        // as a genuine leftover rather than new STANDBY-screen content.
        // Desktop only (mobile's station row is a dynamic _mLayout position,
        // not this fixed constant, and doesn't have a STANDBY-vs-content
        // gap to bleed into the same way). Nothing to ghost if the set was
        // never locked to begin with.
        if (!this.mobile && this.lockedStation) {
          const st = this.lockedStation
          const FLAIR = st.glyph || '●'
          const maxWidth = term.cols - 8
          const flaired = `${FLAIR} ${truncate(st.callsign, maxWidth - FLAIR.length * 2 - 2)} ${FLAIR}`
          term.text(centerX(term.cols, flaired), STATION_Y, flaired, FAINT)
        }
      } },
      { delay: 900, fn: () => {
        // Fades out on its own before the set would plausibly be turned
        // back on for anything but an instant re-power -- guarded on
        // _powerAnimating so a fast power-up's own boot beats (which
        // clearAll() this row anyway) never race this stray erase.
        if (this.mobile || this._powerAnimating) return
        for (let x = 0; x < term.cols; x++) term.put(x, STATION_Y, ' ', NORMAL, 0)
      } },
    ]
    for (const { delay, fn } of beats) setTimeout(fn, delay)
  },

  powerUp(s) {
    // 50th pass -- `|| this._powerAnimating`, not just poweredOn. poweredOn
    // doesn't go true until the REVEAL_DELAY beat ~5s in, and key() lets P
    // through while the set is off, so pressing P a second time during the
    // boot animation (an impatient double-tap -- easy to do, since nothing
    // on screen says the first press registered) started a SECOND full boot
    // sequence on top of the first: two overlapping sets of timers, two
    // clearAll beats fighting, two REVEAL beats, and a second loadTrack()
    // over the top of the first. Confirmed live before fixing -- the reveal
    // beat ran twice for one double-press.
    // This also closes the only reachable route to a nastier version of the
    // same thing: powerUp's beats are the one timer family in this file
    // that doesn't check guideOpen (they can't just bail -- the REVEAL beat
    // owns real state, not only drawing), so anything that got the guide
    // open while they were in flight would have the whole main screen
    // repainted straight through the overlay. Instrumented and measured at
    // ~4.6k writes punching through an open guide in that window. The
    // keyboard can't normally get there (key() ignores G while !poweredOn),
    // but a double-boot could put beats in flight AFTER poweredOn went
    // true, which is exactly when G starts working.
    if (this.poweredOn || this._powerAnimating) return
    this._powerAnimating = true // cleared once REVEAL_DELAY lands below
    // 2026-08-22, round 4 (bug held up through every repro tried --
    // power on, then every station swipe after, always silent until an
    // extra tap): init() already marks mode:'locked' with
    // needsTrackLoad:true on EVERY page load, fresh or resumed (see there),
    // so the session's very first loadTrack() call has always happened
    // ~5.5s from here, deep inside the REVEAL_DELAY beat below -- a
    // setTimeout callback, not this tap's synchronous call stack, no
    // matter how directly it was scheduled from it. loadTrack()'s
    // immediate-unmute path (see there) needs to run IN a real gesture, so
    // this fires it right here instead, while onTouchEnd/key() still have
    // this._inUserGesture set. The visual reveal (station/track text, the
    // status line) still waits for REVEAL_DELAY below -- only the
    // underlying player load moves earlier, so audio is already
    // decoding/correctly-unmuted by the time the picture catches up.
    // 2026-08-22, round 5 -- tracks whether the branch just above actually
    // fired, since the REVEAL_DELAY beat below used to use needsTrackLoad
    // itself to tell "fresh player, needs an actual load" apart from "same-
    // session resume, just needs playVideo() again" -- now that this clears
    // needsTrackLoad early, that beat needs its own way to know the load
    // already happened here and not repeat/stomp on it (see there).
    this._bootAudioPrimed = false
    if (this.mode === 'locked' && this.lockedStation && this.needsTrackLoad &&
        this.currentTrack && this.ready && this.player) {
      this.needsTrackLoad = false
      // 49th pass (desktop QA: no station audio should start
      // until the boot sequence completes) -- suppressAutoplayUnmute on
      // desktop only. Mobile still needs its unmute to land synchronously
      // in this exact tap (round 4's hard constraint); desktop doesn't, so
      // it stays muted here and the REVEAL_DELAY beat below unmutes for
      // real once the picture actually lands.
      this.loadTrack(this.currentTrack, { midSong: true, suppressAutoplayUnmute: !this.mobile })
      this._bootAudioPrimed = true
      // 2026-08-22, round 8 -- music was starting while the boot sequence
      // was happening, not waiting for it to end the way it does on
      // desktop -- tried holding it silent with player.setVolume(0) here,
      // restored via applyVolume() at REVEAL_DELAY below. Verified working
      // against the mocked player, but didn't hold up live -- the track was
      // still audible over the boot animation on a real phone, so
      // setVolume() apparently isn't as instant/reliable as mute()/unMute()
      // on the real YouTube player, at least on mobile Chrome. Reverted:
      // there's no way to hide the sound without breaking the one thing
      // that took rounds 2-4 to get right (unMute() has to run synchronously
      // in this exact tap, or it never gets a second chance -- see the
      // round-4 comment above). See round 9 below for where this landed
      // instead: default a fresh mobile session to muted, obviously so.
    }
    const { term } = s
    const clearAll = () => {
      for (let y = 0; y < term.rows; y++)
        for (let x = 0; x < term.cols; x++) term.put(x, y, ' ', NORMAL, 0)
    }
    // 19th pass: floor, not round -- see drawStandbyClock()
    const midY = Math.floor(term.rows / 2)
    playPowerOnSound()
    // 2026-08-23 (live audio tap) -- the capture attempt rides the power-on
    // gesture, HERE and not later: getDisplayMedia requires-and-consumes
    // transient activation, which expires (~5s) before the REVEAL beat lands
    // at ~5.6s, so the share picker necessarily overlaps the boot animation.
    // Deliberately after the YT priming block above so nothing here can
    // disturb the round-4 mobile unmute invariants. Idempotent -- a later
    // power cycle with a live tap is a no-op; a declined one retries.
    startAudioTap(this, s)
    // 41st pass: re-establish the baseline for whatever station is being
    // resumed BEFORE the warm-up ramp below reads crtBase.brightness/bg off
    // it -- otherwise a set resuming onto DRIFT MODE warms up to the nominal
    // brightness and only drops to the station's dimmer picture afterwards.
    setCrtCharacter(s, this.mode === 'locked' ? this.lockedStation : null)
    // 38th pass: powerDown() raises `decay` for the afterglow smear on the
    // way out, so a power-cycle has to come back to nominal persistence
    // rather than inheriting a tube that never stops glowing.
    if (s?.crt?.params) s.crt.params.decay = crtBase.decay

    // 26th pass -- a longer, better cold boot sequence, along the lines of
    // cyberspace.online's -- looked at cyberspace's actual boot live: a
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
      // 52nd pass -- the squelch line was removed, replaced with
      // something related to what actually exists: the full-screen
      // per-station visualizers, [V], not the phosphor/color cycle, [C].
      // SQUELCH SET
      // never meant anything in-app (no squelch feature exists); swapped
      // for a count of the distinct visualizer effects actually assigned
      // across the roster, via a Set over STATIONS[].visual rather than a
      // hardcoded number, so this can't drift out of sync the way a
      // literal "10" would the next time a station's effect changes.
      `[ OK ] ${new Set(STATIONS.map((st) => st.visual)).size} VISUALIZER MODES READY`,
      '[ OK ] SIGNAL LOCK ARMED',
      '[ OK ] AUDIO PATH READY',
    ]
    // Pacing (15th pass -- an even longer cold boot -- a
    // second pass after the 14th pass already slowed this down once; 26th
    // pass grew bootLines further on top of that, so the same per-line
    // stagger now runs ~5.5s total rather than ~3s). Still one-shot on every
    // power-on, not just the very first cold one, so it stays worth the wait
    // rather than becoming an annoyance to click through on every session.
    const DOT_MS = 500
    const LINE_STAGGER_MS = 240
    const BOOT_TEXT_DELAY = 1200
    const REVEAL_DELAY = BOOT_TEXT_DELAY + bootLines.length * LINE_STAGGER_MS + 700
    // 32nd pass -- the tube should visually warm up, not just the
    // text reveal -- brightness/bg ramp from a cold-tube floor up to
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
            // 2026-08-23 (live audio tap) -- the last line reports the tap's
            // real state at the moment it lands (~4.1s in, by which time the
            // picker has usually been answered): AUDIO TAP: LINE (tab),
            // AUDIO TAP: MIC, or the original AUDIO PATH READY when there is
            // nothing to report. Substituted at land time, not built into
            // bootLines, because the state isn't known when the array is.
            const shown = i === bootLines.length - 1 ? audioTapBootLine() : line
            term.text(centerX(term.cols, shown), startY + i, shown, i === 0 ? BOLD : DIM)
            // 38th pass -- sounds added as the boot happens and each item
            // appears -- all 13 lines used to land in
            // total silence, which is most of why a ~5.5s boot felt like
            // waiting rather than watching a machine come up. A blank
            // spacer line stays silent so the readout keeps its phrasing;
            // an [ OK ] confirm blips brighter than a probe line; pitch
            // creeps up across the sequence (see playBootTick).
            if (shown) playBootTick(shown.startsWith('[ OK ]') ? 'ok' : 'probe', i / (bootLines.length - 1))
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
        playNetworkId(this) // 53rd pass -- network sign-on, same beat the picture lands on
        // 54th pass -- small mechanical touches, including a warm-up drift
        // -- the oscillator hasn't quite settled the instant the picture
        // reveals; frame()'s warm-up block reads this and wobbles the
        // displayed freq/dial cursor (never the real this.freq -- see
        // drawFreq()/drawDial()) for a couple of seconds, decaying to
        // nothing. Set on every power-on, fresh or resumed -- "just switched
        // on" is true either way.
        this._warmupUntil = Date.now() + WARMUP_MS
        this.drawChrome(s)
        this.drawScale(s)
        this.setStatus(s, 'SYSTEM READY', false)
        this.drawVolume(s)
        this.drawSignal(s)
        this.drawVU(s)
        this.drawEqRibbonLeft(s)
        this.drawAntenna(s, 0)
        this.drawDial(s)
        this.drawFreq(s)
        this.drawHint(s)
        if (this.mode === 'locked' && this.lockedStation) {
          // Resume exactly where it left off -- same station, same track,
          // same playback position -- rather than re-picking from the
          // shuffle bag, so it reads as the same set coming back on rather
          // than a new tune-in.
          // 2026-08-22, round 3 (bug: "just 'system ready' instead of
          // locked on a station and playing") -- the status line above was
          // set to SYSTEM READY unconditionally, and nothing in this resume
          // path ever updated it once a station/track WAS restored. Every
          // other way of reaching a locked station (tryLock, presetTune,
          // etc.) calls setStatus(..., 'LOCKED', ...) itself; this is the
          // one path that resumes straight into 'locked' state without ever
          // having called it, so the status text just never caught up with
          // reality -- station/track/playback were all correct, only the
          // status readout was stale.
          // 2026-08-22, round 9 -- "LOCKED" replaced with MUTED when
    // applicable, not flashing but staying persistent so it's obvious you
    // need to unmute to begin the experience -- a locked-but-muted set shows MUTED here
    // instead of LOCKED, staying that way (no flash, no revert -- see
    // setStatus's 'MUTED' handling) until toggleMute() flips it back.
    this.setStatus(s, this.muted ? 'MUTED' : 'LOCKED', true)
          this.showStation(s, this.lockedStation)
          if (this.currentTrack) this.showTrack(s, this.currentTrack)
          // 2026-08-22, round 5 -- this._bootAudioPrimed (set at the very
          // top of powerUp(), synchronously in the tap) means the fresh-
          // load case already ran, several seconds ago, and is likely
          // already genuinely playing by now -- onStateChange's PLAYING
          // handler will already have called setPlayState(s, 'playing').
          // Calling player.playVideo() again here is a harmless no-op, but
          // this.setPlayState(s) (no state arg) is NOT harmless: mode is
          // 'locked' so it unconditionally overwrites the already-correct
          // this.playState with undefined, blanking the playback bar/icon
          // this same instant the rest of the interface reveals -- exactly
          // the "VU is off, playback looks wrong right after boot" shape
          // of bug. Skip both entirely when priming already handled it;
          // the onStateChange handler owns playState from here on.
          if (this.needsTrackLoad && this.currentTrack) {
            // Persistence resume (14th pass) -- fallback path, only reached
            // if the player wasn't ready yet at tap time (rare). Same as
            // before this round: loads muted, next tap/key flushes it.
            this.needsTrackLoad = false
            this.loadTrack(this.currentTrack, { midSong: true })
            this.setPlayState(s, 'buffering')
          } else if (!this._bootAudioPrimed) {
            if (this.ready && this.player) this.player.playVideo()
            this.setPlayState(s, this.playState)
          }
          // 49th pass -- no station audio should start until the
          // boot sequence completes -- the priming call above suppressed
          // its own auto-unmute on desktop (opts.suppressAutoplayUnmute),
          // so the track has been decoding/buffering silently this whole
          // ~5.5s boot. This is where it actually becomes audible, exactly
          // as the picture reveals. Mobile is untouched -- it already
          // unmuted (or didn't, per the muted-fresh-visit default) back in
          // the tap itself, and re-unmuting here would be redundant at
          // best.
          if (this._bootAudioPrimed && !this.mobile && !this.muted && this.ready && this.player) {
            this.player.unMute()
            this.applyVolume()
            this._forcedMuteForAutoplay = false
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
  // 2026-08-22 -- room opened up below now playing for some fun things,
  // like VU + signal -- the mobile early-return used to sit at
  // the very top, so the SIG bar didn't even exist on mobile before now.
  // Percent computation is shared with desktop; only the render target
  // (row + width) differs, via mobileDrawSignal.
  // 58th pass -- desktop's own SIG_Y bar removed, since signal can be
  // dropped if needed, freeing the row for drawTriBand()'s
  // BASS/MID/TREBLE meter). pct is now mobile-only; mobile keeps its SIG
  // widget untouched, same reception-distance fiction it always had.
  drawSignal(s) {
    let pct = 0
    if (this.mode === 'locked') pct = 1
    else {
      // 41st pass: nearestSignal, not nearestStation -- the SIG meter is a
      // reception readout, and the secret station is really there.
      const { dist } = nearestSignal(this.freq)
      if (dist <= NEAR_THRESHOLD) pct = 1 - dist / NEAR_THRESHOLD
    }
    if (this.mobile) this.mobileDrawSignal(s, pct)
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
  // alongside the track every time -- station info broken out from current
  // playing song info (8/20).
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
  // 45th pass -- now resolves out of noise same as desktop, for a better
  // tuner animation -- mobile's station change had
  // nothing but a status-row text flash, since it has no dial to animate.
  // resolveText() is coordinate-generic (takes x/y as params, not baked-in
  // desktop constants), so this is a straight reuse, not new machinery.
  // 2026-08-22: now runs through mobileRelayout() first -- a tagline that
  // fits on one line collapses the STATION box by a row instead of leaving
  // the second row blank, using the box space better, and everything below (NOW PLAYING, the widget
  // row, the hints) shifts up to match.
  mobileShowStation(s, station, opts = {}) {
    const { term } = s
    if (!this._mLayout) this._mLayout = mobileLayout(2, 2)
    const maxWidth = MBOX_X1 - MBOX_X0 - 4
    // wrapped across both tagline rows rather than truncated to one,
    // using additional lines as needed. Second row omitted
    // entirely (see mobileRelayout) when the tagline fits on one line.
    const [tag1, tag2] = wrapLines(station.tagline, maxWidth, 2)
    const relaid = this.mobileRelayout(s, tag2 ? 2 : 1, this._mLayout.trackLines)
    const L = this._mLayout
    for (const y of [L.stationCall, L.stationTag1, L.stationTag2]) {
      if (y == null) continue
      for (let x = MBOX_X0 + 1; x < MBOX_X1; x++) term.put(x, y, ' ')
    }
    const FLAIR = station.glyph || '●'
    // 2026-08-22 -- the station freq added to the now playing line
    // after its name -- mirrors the "GLYPH CALLSIGN GLYPH · FREQ KHZ"
    // convention drawVisualizerInfo() already uses on desktop, rather than
    // inventing a new format. Reserved out of the callsign's truncation
    // budget so a long callsign still leaves room for it instead of pushing
    // the line past the box width.
    const freqPart = ` · ${station.freq.toFixed(1)} KHZ`
    const flairWidth = FLAIR.length * 2 + 2
    const callsign = truncate(station.callsign, maxWidth - flairWidth - freqPart.length)
    const flaired = `${FLAIR} ${callsign} ${FLAIR}${freqPart}`
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
    // 37th pass -- some flair added on either side of the station name,
    // to jazz up the interface -- flanking on-air lamps. Budgeted
    // out of the same maxWidth truncate() already enforces, so even the
    // longest callsign (DISTORTION FIELD) still can't push the box past its
    // border.
    // 41st pass -- the station glyphs extended to either side of the
    // station name, replacing the "on air" circles -- the flair is now the
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
      for (const y of [L.npTrack1, L.npTrack2, L.npArtist, L.npProgress]) {
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
    // 30th pass -- the current playing song needed to be brighter, like
    // the station name is -- was NORMAL, a full tier under the station
    // callsign's BRIGHT. Bumped to BOLD rather than matching BRIGHT exactly
    // so station (identity) and track (content) stay visually distinct
    // tiers instead of collapsing to the same weight.
    const lineX = centerX(term.cols, line)
    if (opts.reveal === false) term.text(lineX, TRACK_Y, line, BOLD)
    else this.resolveText(s, lineX, TRACK_Y, line, BOLD, opts.revealMs ?? 250)
    this.updateTabTitle(track)
  },
  // 21st pass (0.3 wishlist: browser tab title shows now-playing)
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
  // 2026-08-22 -- a now playing bar with playback bar etc, like the full
  // version, now working without a tuner strip on mobile view -- was
  // flatly disabled on mobile before; now
  // routes to mobileDrawPlayback for a condensed version inside the NOW
  // PLAYING box's own extra row instead of desktop's fixed PLAYBACK_Y.
  drawPlayback(s) {
    if (this.guideOpen) return
    if (this.mobile) { this.mobileDrawPlayback(s); return }
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
  // 2026-08-22 -- condensed single-row version for the NOW PLAYING box's
  // npProgress row: a leading state icon (desktop spells PLAYING/PAUSED/
  // BUFFERING out in full, which doesn't fit here) then a shorter bar and
  // "m:ss/m:ss" with no spaces around the slash. State reads through the
  // icon and the row's attr (BRIGHT/MUTED/DIM) rather than a text label.
  mobileDrawPlayback(s) {
    if (!this._mLayout) return
    const { term } = s
    const y = this._mLayout.npProgress
    for (let x = MBOX_X0 + 1; x < MBOX_X1; x++) term.put(x, y, ' ')
    if (this.mode !== 'locked') return
    if (!this.ready || !this.player) return
    let cur, dur
    try { cur = this.player.getCurrentTime(); dur = this.player.getDuration() } catch (e) {}
    if (!(dur && isFinite(dur) && dur > 0)) return
    const fmt = (sec) => {
      sec = Math.max(0, Math.floor(sec))
      return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
    }
    // 16 segments, not desktop's 28 -- with the icon, brackets and a
    // worst-case "12:34/45:67"-shaped time pair, this still needs to fit
    // inside ~38 usable columns.
    const segs = 16
    const filled = Math.round(Math.min(1, cur / dur) * segs)
    let bar = ''
    for (let i = 0; i < segs; i++) bar += i < filled ? '█' : '·'
    const icons = { playing: '>', paused: '=', buffering: '.' }
    const attrs = { playing: BRIGHT, paused: MUTED, buffering: DIM }
    const icon = icons[this.playState] || ' '
    const attr = attrs[this.playState] || FAINT
    // 2026-08-22 -- the progress bar was too bright; matched the weight
    // between desktop and mobile -- this used to paint icon+bar+time as one BRIGHT/MUTED/DIM
    // string, so the bar itself flared BRIGHT whenever playing. Desktop's
    // drawPlayback never does that: the bar+time (barPart) is always FAINT,
    // and only the state label (labelPart) carries BRIGHT/MUTED/DIM. Same
    // split here -- the icon is the "label", bar+time stays FAINT.
    const iconPart = icon
    const barPart = ` [${bar}] ${fmt(cur)}/${fmt(dur)}`
    const full = iconPart + barPart
    const startX = centerX(term.cols, full)
    term.text(startX, y, iconPart, attr)
    term.text(startX + iconPart.length, y, barPart, FAINT)
  },

  // Scrolling waveform squiggle (11th pass -- the analog needle from the
  // 10th pass wasn't landing; this replacement was picked from a set of
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
    // 23rd pass -- more animation, so it's fun to see it change as you do
    // things: the target was previously a flat 0.15-0.95 swing whenever
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
    // 2026-08-23 (live audio tap) -- with a live signal the VU stops rolling
    // dice and tracks the track's actual loudness. Only the TARGET changes:
    // the spring/damping below (and so each station's meter character) is
    // untouched, and volFactor stays multiplied in deliberately -- the AGC
    // in the tap normalizes per-track loudness, so without volFactor a
    // turned-down set would re-inflate to full swing within seconds,
    // undoing the 23rd pass's volume/mute behavior. Seeking flutter and the
    // resting floor stay synthetic: they belong to the receiver, not the
    // program material (same reasoning as the 41st-pass swing note above).
    if (playing && audioSignalLive()) target = Math.min(1, volFactor * b.swing * (0.08 + 0.92 * AUDIO_BUS.level))
    else if (playing) target = Math.min(1, volFactor * b.swing * (0.15 + Math.random() * 0.8))
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
    // 58th pass -- desktop's own VU_Y trace removed, replaced with the
    // bass/mid/treble bars, see drawTriBand(). The physics
    // above still runs on every platform: mobile's own VU widget and
    // pulseVU()'s lock/skip kick both depend on vuSample/vuVelocity/
    // vuTrace staying alive, they just don't render on desktop any more.
    if (this.mobile) this.mobileDrawVU(s, playing)
  },
  // ORPHANED as of the 58th pass's final round -- gave the bars more
  // headroom, dropping the horizontal bass/treble/mid layout. No longer called anywhere;
  // drawEqRibbonLeft() now owns both SIG_Y and VU_Y for its own doubled-
  // height bars instead. Left in place rather than deleted, same treatment
  // this file already gives other retired widgets/effects (e.g.
  // drawIsotopeEffect) -- history below kept for context.
  //
  // Tri-band meter -- BASS/MID/TREBLE, replacing the old VU trace and SIG
  // reception bar in the LEVELS box's left half (58th pass, see the state
  // comment in init() for the full request chain). Desktop only: mobile
  // keeps its existing VU/SIG widgets, which weren't part of this ask.
  // Same spring/damping/target shape as drawEqRibbonLeft()'s bands, just
  // collapsed to the 3 wideband channels AUDIO_BUS already carries (bass/
  // mid/treble), and rendered as 3 wide horizontal bars instead of a thin
  // ribbon. Originally doubled onto both SIG_Y and VU_Y for a thick 2-row
  // meter; VU_Y went to drawEqRibbonLeft() instead, replacing one
  // of the doubled rows of bars with the eq ribbon, so this drew
  // only SIG_Y right up until this whole widget was dropped.
  drawTriBand(s) {
    if (this.mobile) return
    const { term } = s
    const locked = this.mode === 'locked' && this.lockedStation
    const state = !locked ? 'seeking'
      : this.playState === 'buffering' ? 'buffering'
      : this.playState === 'playing' ? 'playing'
      : 'paused'
    const b = this.stationBallistics()
    const bandVals = [AUDIO_BUS.bass, AUDIO_BUS.mid, AUDIO_BUS.treble]
    const labels = ['BAS', 'MID', 'TRE']
    // Interior width (BOX_X0+1..METERS_DIVIDER_X-1) is 36 cols -- divides
    // into exactly 3 equal 12-col segments, so the 3 fixed-width labels
    // below tile it with no gaps and no manual clear pass needed.
    const segW = Math.floor((METERS_DIVIDER_X - 1 - BOX_X0) / 3)
    const barW = segW - 5 // room for "BAS[" + "]"
    for (let i = 0; i < 3; i++) {
      let target
      if (this.muted) target = 0.05
      // Same reasoning as drawEqRibbon()'s bands: a real per-band level
      // once the tap is live, atmospheric filler otherwise, muted always
      // flattens regardless of tap state.
      else if (state === 'playing' && audioSignalLive()) target = Math.min(1, b.swing * (0.05 + 0.95 * bandVals[i]))
      else if (state === 'playing') target = Math.min(1, b.swing * (0.15 + Math.random() * 0.8))
      else if (state === 'buffering') target = Math.random() * 0.6
      else if (state === 'seeking') target = 0.03 + Math.random() * 0.08
      else target = 0.05 // paused -- nearly flat
      const spring = b.spring * 0.9, damping = b.damping
      const accel = (target - this.bandSamples[i]) * spring - this.bandVelocities[i] * damping
      this.bandVelocities[i] += accel
      this.bandSamples[i] = Math.max(0, Math.min(1, this.bandSamples[i] + this.bandVelocities[i]))
      const filled = Math.round(this.bandSamples[i] * barW)
      let bar = ''
      for (let k = 0; k < barW; k++) bar += k < filled ? '█' : '-'
      const label = `${labels[i]}[${bar}]`
      const attr = state === 'playing' && audioSignalLive()
        ? visualizerLevelAttr(0.3 + this.bandSamples[i] * 0.6)
        : (filled > 0 ? DIM : FAINT)
      const x0 = BOX_X0 + 1 + i * segW
      term.text(x0, SIG_Y, label, attr)
    }
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

  /** 41st pass -- per-station meter ballistics. Three numbers per station, feeding both
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
  // MUTE bracketed indicator rows -- an animated "signal" graphic
  // in the lower right, antenna-looking, animating depending on
  // status). Fills the same LEVELS right-half rows those indicators used
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
  // 31st pass -- the antenna and FLD should still be active even
  // while muted -- mute used to be its own branch here (frozen dim
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
  // 2026-08-22 -- the FLD changing-number widget added, along with a more
  // obvious mute off/on -- mobile has no antenna glyph/rings (there's no
  // tuner strip to drive them, same reason there's no TUNING BAND box), but
  // FLD still wants the locked/buffering/playing/paused state this function
  // already derives, so mobile branches off with that same state string
  // rather than recomputing it separately.
  drawAntenna(s, t) {
    if (this.mobile) {
      const locked = this.mode === 'locked' && this.lockedStation
      const state = !locked ? 'seeking'
        : this.playState === 'buffering' ? 'buffering'
        : this.playState === 'playing' ? 'playing'
        : 'paused'
      this.mobileDrawFieldReadout(s, state)
      this.mobileDrawMuteSwitch(s)
      return
    }
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
    // switched to a shared `state` string instead so drawFieldReadout()
    // below can run once, in every branch, without duplicating the locked/
    // buffering/playing checks. The ring logic itself is unchanged. (31st
    // pass: dropped the separate muted branch -- see the comment above
    // ANTENNA_TEMPLATE. 58th pass: drawEqRibbon() moved out of this pane
    // entirely, see drawEqRibbonLeft().)
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
      // Inbound pulse -- rings cycle outer -> inner, then the pulse
      // continues straight down the mast to the base, so the whole chain
      // reads as a signal arriving from the air and travelling all the way
      // to the ground rather than stopping once it reaches the pole
      // -- the signal "goes down" the mast too. MAST_COL is
      // the '|' column shared by template rows 2-4 (rings' row 2, the bare
      // rod row 3, and the '__|__' base row 4), so the flash tracks the
      // same vertical line the rings already converge on.
      const MAST_COL = 6
      const step = Math.floor(t / 0.25) % 5
      if (step < 3) {
        lightRing(step, BRIGHT)
      } else if (step === 3) {
        term.put(startX + MAST_COL, rows[3], '|', BRIGHT)
      } else {
        for (let dx = -2; dx <= 2; dx++) {
          term.put(startX + MAST_COL + dx, rows[4], dx === 0 ? '|' : '_', BRIGHT)
        }
      }
      state = 'playing'
    } else {
      // Paused -- steady mid-ring, no animation.
      lightRing(1, BRIGHT)
      state = 'paused'
    }

    this.drawSnrReadout(s, startX, rows, state)
    this.drawFieldReadout(s, startX, rows, state)
    this.drawPulseReadout(s, startX, rows, state)
    // 31st pass -- filled that empty space, making
    // them look like switches / buttons -- the antenna glyph is only 13
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
  // 2026-08-22 -- mobile's second widget row: TRI (was FLD, then briefly
  // BPM -- see drawFieldReadout's header comment; renamed to "TRI,
  // for 'totally real indicator'" since the underlying number is still the
  // detected-tempo/filler blend, just not always a confident lock) left of
  // MWIDGET_DIVIDER_X, MUTE right of it, same split as VU/SIG on the row
  // above. Physics/fallback are a direct port of drawFieldReadout's (own
  // this.fieldSample/fieldVelocity, shared with desktop -- there's only
  // one receiver) since there's no shared antenna-pane geometry to hang a
  // common helper off of here.
  mobileDrawFieldReadout(s, state) {
    if (!this._mLayout) return
    const { term } = s
    const y = this._mLayout.widgetRow2
    for (let x = MBOX_X0 + 1; x < MWIDGET_DIVIDER_X; x++) term.put(x, y, ' ')
    let label, attr
    if (state === 'seeking') { label = 'TRI ---'; attr = FAINT }
    else if (state === 'buffering') { label = 'TRI ...'; attr = DIM }
    else if (state === 'playing' && audioSignalLive() && AUDIO_BUS.bpm && AUDIO_BUS.bpmConf >= 0.5) {
      // 2026-08-23 -- real detected tempo, fed by the MIC tier on mobile
      // (tab capture never runs there), same rolling-median estimate the
      // desktop readout and HACKBACK already share.
      const val = String(Math.round(AUDIO_BUS.bpm)).padStart(3, '0')
      label = `TRI ${val}`
      attr = DIM
    } else {
      // No confident lock yet -- same atmospheric filler as desktop,
      // rescaled 70-160 instead of FLD's old 30-95 range.
      const target = state === 'playing'
        ? (audioSignalLive() ? 0.30 + 0.65 * AUDIO_BUS.mid : 0.55 + Math.random() * 0.4)
        : 0.5 + Math.random() * 0.06
      const spring = 0.3, damping = 0.55
      const accel = (target - this.fieldSample) * spring - this.fieldVelocity * damping
      this.fieldVelocity += accel
      this.fieldSample = Math.max(0, Math.min(1, this.fieldSample + this.fieldVelocity))
      const val = String(Math.round(70 + this.fieldSample * 90)).padStart(3, '0')
      label = `TRI ${val}`
      attr = state === 'playing' ? DIM : FAINT
    }
    term.text(centerXRange(MBOX_X0 + 1, MWIDGET_DIVIDER_X - 1, label), y, label, attr)
  },
  // "more obvious mute off/on" -- direct port of drawMuteSwitch,
  // just repositioned to the widget row's right half.
  mobileDrawMuteSwitch(s) {
    if (!this._mLayout) return
    const { term } = s
    const y = this._mLayout.widgetRow2
    for (let x = MWIDGET_DIVIDER_X + 1; x < MBOX_X1; x++) term.put(x, y, ' ')
    const label = this.muted ? 'MUTE [ON ]' : 'MUTE [OFF]'
    term.text(centerXRange(MWIDGET_DIVIDER_X + 1, MBOX_X1 - 1, label), y, label, this.muted ? BRIGHT : FAINT)
  },

  /** 39th pass -- signal-to-noise, in the last free block of the antenna
   *  pane's right margin (the row directly above TRI, formerly FLD then
   *  briefly BPM). The pair is the point: TRI is how MUCH signal is
   *  arriving (or, since the 57th pass, the tempo riding on it), S/N is
   *  how CLEAN it is, and real receivers show both because they answer
   *  different questions.
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
   *  its neighbours: the rings, the EQ ribbon and TRI are all continuous
   *  and fast, and a fourth jittering number would just add noise to the
   *  busiest corner of the screen. This only changes when the dial does.
   *  Fixed-width output (always "S/N " + 2 digits), so it can never leave a
   *  stray character behind between redraws. */
  SNR_MAX: 56,
  SNR_MIN: 9,
  drawSnrReadout(s, startX, rows, state) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    const y = rows[0] // VOL_Y -- directly above TRI (formerly FLD) on SIG_Y
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

  // Secondary readout, upper-right margin of the antenna pane (30th pass --
  // a secondary readout made sense; switched from FLD to BPM in a
  // follow-up to show bpm; renamed
  // again from BPM to TRI -- "totally real indicator" -- in a further
  // follow-up, keeping the exact same value underneath). Shows the real
  // detected tempo (AUDIO_BUS.bpm/bpmConf, the same rolling-median estimate
  // HACKBACK's meters and beatPhase already key off) once it's confident;
  // until then it falls back to the same spring/damping filler FLD always
  // used, just rescaled into a plausible tempo band instead of FLD's 30-95
  // range, so the readout never sits dead waiting on a lock -- which is
  // exactly why "totally real" is a wink, not a promise: it's honest tempo
  // when confident, atmospheric filler otherwise, same as it's always been.
  // Fixed-width output only (always "TRI " + 3 chars) so it never leaves a
  // stray trailing character behind between redraws.
  drawFieldReadout(s, startX, rows, state) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    const y = rows[2] // SIG_Y -- vertically centered on the glyph
    const x0 = startX + this.ANTENNA_TEMPLATE[0].length + 2
    if (state === 'seeking') {
      term.text(x0, y, 'TRI ---', FAINT)
      return
    }
    if (state === 'buffering') {
      term.text(x0, y, 'TRI ...', DIM)
      return
    }
    // playing/paused -- same spring/damping shape drawVU() uses for
    // vuSample, kept as its own independent value (this.fieldSample) so
    // this doesn't just visually mirror the VU bar's motion.
    if (state === 'playing' && audioSignalLive() && AUDIO_BUS.bpm && AUDIO_BUS.bpmConf >= 0.5) {
      const val = String(Math.round(AUDIO_BUS.bpm)).padStart(3, '0')
      term.text(x0, y, `TRI ${val}`, DIM)
      return
    }
    // No confident lock yet (or muted/no tap/paused) -- same atmospheric
    // filler FLD always fell back to, rescaled 70-160 (a plausible tempo
    // band) instead of FLD's old 30-95 signal-strength range. 31st pass's
    // ignore-mute rule survives by construction: muting silences the tab,
    // the tap gates, audioSignalLive() goes false, and this drops back to
    // the same synthetic flicker it always had while muted.
    const target = state === 'playing'
      ? (audioSignalLive() ? 0.30 + 0.65 * AUDIO_BUS.mid : 0.55 + Math.random() * 0.4)
      : 0.5 + Math.random() * 0.06
    const spring = 0.3, damping = 0.55
    const accel = (target - this.fieldSample) * spring - this.fieldVelocity * damping
    this.fieldVelocity += accel
    this.fieldSample = Math.max(0, Math.min(1, this.fieldSample + this.fieldVelocity))
    const val = String(Math.round(70 + this.fieldSample * 90)).padStart(3, '0')
    term.text(x0, y, `TRI ${val}`, state === 'playing' ? DIM : FAINT)
  },

  // Pulse readout, antenna pane's bottom-right (58th pass -- fills the slot
  // the EQ ribbon vacated when it moved to the LEVELS box's left half, see
  // drawEqRibbonLeft(); replaces what used to be on the
  // right with something for onset/pulse, PLS, showing an
  // interesting/changing numeric value. Real signal: AUDIO_BUS.pulse is
  // the 1->0 decay that fires after every detected onset (TAP_PULSE_TAU =
  // 0.12s -- see sampleAudioTap()), which decays faster than this readout's
  // own ~0.12s redraw cadence, so displaying it raw would mostly flash
  // between near-99 and 0 rather than reading as a number. this._pulseDisplay
  // is a slower peak-hold on top of it (own 0.85-per-redraw decay, own
  // state, own init) purely for legibility -- every spike is still a real
  // onset, it just bleeds out over a readable ~1s instead of one frame.
  drawPulseReadout(s, startX, rows, state) {
    if (this.mobile) return
    const { term } = s
    const y = rows[4] // VU_Y -- vertically centered on the glyph's base
    const x0 = startX + this.ANTENNA_TEMPLATE[0].length + 2
    if (state === 'seeking') {
      term.text(x0, y, 'PLS --', FAINT)
      this._pulseDisplay = 0
      return
    }
    if (state === 'buffering') {
      term.text(x0, y, 'PLS ..', DIM)
      return
    }
    if (state === 'playing' && audioSignalLive() && !this.muted) {
      this._pulseDisplay = Math.max(this._pulseDisplay * 0.85, AUDIO_BUS.pulse)
    } else if (state === 'playing') {
      // No live tap (or muted) -- same "still alive" filler idiom as every
      // other readout in this pane: occasional random spikes riding the
      // same decay curve, so it never just sits flat while powered on.
      if (Math.random() < 0.06) this._pulseDisplay = 0.5 + Math.random() * 0.5
      else this._pulseDisplay *= 0.85
    } else {
      this._pulseDisplay *= 0.85 // paused -- let it bleed out, no new spikes
    }
    const val = String(Math.round(Math.max(0, Math.min(1, this._pulseDisplay)) * 99)).padStart(2, '0')
    term.text(x0, y, `PLS ${val}`, state === 'playing' && audioSignalLive() && !this.muted ? DIM : FAINT)
  },

  // Spectrum ribbon (30th pass -- thin horizontal
  // ribbons fit the space) -- moved 58th pass from a single-char-per-band strip in the
  // antenna pane's cramped right-half margin to its own full-width row in
  // the LEVELS box's left half, replacing one of the doubled rows
  // of bars with the eq ribbon: this replaces the right-
  // half ribbon outright rather than living alongside it. Widened 6 -> 9
  // bands same pass (bumped up to 9 bands -- see TAP_BAND_EDGES_HZ/
  // TAP_BANDS), then given the tri-band meter's row too, for more
  // headroom, dropping the horizontal bass/treble/mid layout -- drawTriBand() is
  // no longer called anywhere, left in place as orphaned code per this
  // file's own convention for retired widgets/effects). First cut split
  // each band across just SIG_Y/VU_Y with the VU_DIVIDER_Y grille still
  // dotted through the middle -- a follow-up review (no second dotted
  // row and no gap, don't treat them as separate rows) called that out as
  // still reading like two stacked widgets, not one meter. Final shape:
  // the VU_DIVIDER_Y grille call is gone entirely (see drawChrome()) and
  // this now spans all 3 rows -- SIG_Y, VU_DIVIDER_Y, VU_Y -- as one
  // continuous column per band, 24 discrete levels (8 eighths x 3 rows),
  // fully overwritten every frame so nothing shows through the middle row.
  // Own spring-damped state (this.eqSamples/eqVelocities) rather than one
  // scrolling trace like drawVU()'s bar. Computes its own `state` the same
  // way drawTriBand() used to, since it's not called from inside
  // drawAntenna() and can't share that function's local variable.
  drawEqRibbonLeft(s) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    const locked = this.mode === 'locked' && this.lockedStation
    const state = !locked ? 'seeking'
      : this.playState === 'buffering' ? 'buffering'
      : this.playState === 'playing' ? 'playing'
      : 'paused'
    const b = this.stationBallistics()
    const chars = ' ▁▂▃▄▅▆▇█' // 9 glyphs = 8 eighth-block steps per row
    // 9 bands across the 36-col interior -- 3 cols of solid fill + 1 col
    // gap per band tiles it exactly (9*4=36) and still reads as 9 distinct
    // bars rather than one continuous ribbon, though thinner than the
    // original 6-band version's 5-wide bars.
    const barW = 3, step = 4
    for (let i = 0; i < this.eqSamples.length; i++) {
      let target
      if (this.muted) target = 0.05
      // 2026-08-23 (live audio tap) -- the ribbon becomes a real 9-band
      // spectrum, low on the left to high on the right, when the tap is
      // live. Muted stays first and stays flat (31st-pass rule), doubly
      // guaranteed: muted tab audio goes silent, so the tap's gate would
      // zero these bands anyway. Springs below untouched, same as the VU.
      else if (state === 'playing' && audioSignalLive()) target = Math.min(1, b.swing * (0.05 + 0.95 * AUDIO_BUS.bands9[i]))
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
      // Split one 0..1 sample across all 3 rows for real vertical headroom
      // instead of one row's 9-level glyph ramp: VU_Y (bottom) carries the
      // first third of the range, VU_DIVIDER_Y (middle) only lights once
      // the bottom is already full, and SIG_Y (top) only lights once the
      // middle is full too -- a 3-row LED ladder, so a band that's merely
      // loud fills the bottom while only a genuinely hot one reaches the
      // top. clamp8() keeps each row's slice of the 0..24 range in the
      // chars array's own 0..8 bounds.
      const clamp8 = (v) => Math.max(0, Math.min(8, Math.round(v)))
      const twentyFourths = this.eqSamples[i] * 24
      const botCh = chars[clamp8(Math.min(8, twentyFourths))]
      const midCh = chars[clamp8(Math.min(8, Math.max(0, twentyFourths - 8)))]
      const topCh = chars[clamp8(Math.max(0, twentyFourths - 16))]
      // 58th pass -- flat DIM/FAINT, not visualizerLevelAttr's per-value
      // brightness ramp (which reaches all the way to BRIGHT). A darker
      // color was needed -- they looked too similar to the other
      // bars right above -- the tri-band meter that used to sit above
      // this used that same level-scaled brightness, so the two widgets
      // were popping the same way; this keeps the ribbon on the flat
      // two-tone attr it always had (back when it lived in the antenna
      // pane's right half) so it still reads as a dimmer, secondary
      // readout even now that it owns all 3 rows.
      const attr = !this.muted && state === 'playing' ? DIM : FAINT
      const x0 = BOX_X0 + 1 + i * step
      for (let k = 0; k < barW; k++) {
        term.put(x0 + k, VU_Y, botCh, attr)
        term.put(x0 + k, VU_DIVIDER_Y, midCh, attr)
        term.put(x0 + k, SIG_Y, topCh, attr)
      }
      term.put(x0 + barW, VU_Y, ' ')
      term.put(x0 + barW, VU_DIVIDER_Y, ' ')
      term.put(x0 + barW, SIG_Y, ' ')
    }
  },

  // BUG/NAMING FIXED 2026-08-20: this used to log an entry on every track
  // skip within the SAME station, so "RECENT" was really a recent-tracks
  // log, not a station log. The session-stats/RECENT footer line was
  // removed entirely 2026-08-20 (7th pass -- session
  // stats removed, looked like a blob) -- this now just tracks what's
  // currently playing for skip()'s benefit, nothing gets drawn from it.
  tuneToStation(s, station, track) {
    this.nowPlaying = { stationId: station.id, freq: station.freq, callsign: station.callsign, title: track.title }
  },

  // Filled-background control panel, same treatment as the title bar
  // (8/20: distinguishes the controls from the rest of the screen
  // the same way SIGNAL/v0.2 stand out up top, not as dim floating text).
  drawHint(s) {
    if (this.mobile) return // 45th pass -- mobile has its own chrome, see mobileDrawChrome()
    const { term } = s
    // 29th pass -- top row = radio-esque, bottom row = things a
    // real radio doesn't have: line1 is now just tuning/receiver
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
    // right). "VIZ" not "SAVER" -- calling it a screensaver breaks
    // immersion a bit; the feature is the Visualizer.
    // 50th pass -- standardized on COLOR -- was '[C] MODE'. The
    // same control was called MODE here, DISPLAY MODE in the Guide and
    // COLOR in the visualizer; three names for one key. COLOR wins: it's
    // what the control actually does (every mode is a phosphor color),
    // it's plainer to a first-time user than 'mode', and it's the only
    // one that keeps the visualizer legend's '[C]OLOR' bracket-fold
    // working. Row goes 74 -> 75 cols, still inside 80. NOTE the code
    // vocabulary stays 'mode' (DISPLAY_MODES, cycleDisplayMode,
    // drawModeStrip) -- deliberate, renaming those buys nothing and this
    // is a label decision, not a model one.
    const line2 = '[N] NEXT  [UP/DOWN] VOL  [M] MUTE  [P] POWER  [G] GUIDE  [C] COLOR  [V] VIZ'
    // 52nd pass -- the lower bar footer in main view mode was too
    // bright and hard to read, dialed down. First cut dropped the row
    // fill to DIM but kept the text calls at NORMAL -- in inverse mode the
    // attr paints each cell's BACKGROUND swatch, not just the ink, so
    // every cell a letter sits in got repainted at the text's (brighter)
    // attr while the blank cells around it stayed at the fill's DIM,
    // leaving a patchwork of little bright rectangles across a dim bar,
    // with the command text background different from the
    // footer. Fixed by matching text and fill so the bar reads as one
    // flat shade. Line1 then went back to BOLD to mark
    // SEEK/LOCK/SCAN/PRESETS/BACK as the primary row -- checked this
    // doesn't reintroduce the same patchwork (pixel-sampled the rendered
    // bar column by column) and it doesn't: BOLD's own background reads
    // as one flat brighter shade across the whole row, same as line2's
    // flat DIM, so the two rows are each internally uniform and only
    // differ from each other, which is what "define the main commands"
    // actually wants.
    for (let x = 0; x < term.cols; x++) { term.put(x, HINT_Y1, ' ', DIM, 1); term.put(x, HINT_Y2, ' ', DIM, 1) }
    term.text(centerX(term.cols, line1), HINT_Y1, line1, BOLD, 1)
    term.text(centerX(term.cols, line2), HINT_Y2, line2, DIM, 1)
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
            // Mid-song join (8/20: stations start mid
            // song). loadTrack(track, {midSong:true}) cues instead
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
              // 2026-08-22, round 4 -- loadTrack() now resolves the
              // mute-for-autoplay/unmute decision itself, synchronously, at
              // call time (see there) rather than waiting for this async
              // PLAYING event, which never carried a real gesture no matter
              // how soon it fired. Nothing left to do here.
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
    // 2026-08-24 -- fire the lyrics lookup unconditionally on every load,
    // including the resume/reload paths above that pass this.currentTrack
    // back in unchanged: ensureLyricsFetched() is itself the guard (a
    // cache hit is a same-tick no-op), so this doesn't cost a duplicate
    // request, and it means a lock-in-progress-before-Guide-was-open or a
    // background/foreground resume still ends up with lyrics ready.
    ensureLyricsFetched(track)
    // 2026-08-22 (bug report: "on load after power on, nothing plays...
    // even changing stations doesn't play audio. I have to mute and
    // unmute" -- classic mobile autoplay block. cueVideoById()'s later
    // playVideo() and loadVideoById()'s own implicit autoplay both count as
    // "start playing audio," and mobile browsers only allow that
    // unprompted if either the call is still inside a live user-gesture
    // window, or the video is muted. Muting first sidesteps the block
    // entirely -- toggling mute/unmute by hand was doing exactly this
    // already, just manually.
    // 2026-08-22, round 5 (bug: "mute says it is 'on'" right after boot,
    // yet audio was audibly playing) -- this used to only call
    // player.mute() when !this.muted, on the assumption a real mute
    // intent needed no further action. But nothing else ever applies a
    // persisted this.muted:true to a freshly created YT.Player -- it
    // defaults to unmuted, so a session that was left muted last time
    // would autoplay audibly on the next visit despite the UI (correctly)
    // showing MUTE ON the whole time. Muting unconditionally here, before
    // every load, both sidesteps the autoplay block AND actually applies
    // a real muted intent to the fresh player; only the unmute-restore
    // below is conditional on the real intent being unmuted.
    // 2026-08-22, round 6 (bug: "when a song ends, it does change tracks
    // but there is no audio, you tap and it starts") -- skip() from the
    // natural ENDED event is the one loadTrack() caller that never runs in
    // a gesture, so it always fell back to the deferred _pendingUnmute
    // flush, needing an extra tap every single time a track finished on
    // its own. But a natural track-end is a different kind of load than a
    // cold start: audio was ALREADY playing, unmuted, the instant before
    // this call -- a continuation of an already-engaged session, not a
    // fresh autoplay request, and browsers don't re-apply the no-gesture
    // block to that. Skip the whole mute-first dance for a "warm"
    // continuation (this.playState was already 'playing' and the real
    // intent is unmuted) and just load directly; a genuinely cold load
    // (nothing was already audibly playing -- power-on, or a muted
    // session) still gets the full dance.
    const wasWarm = this.playState === 'playing' && !this.muted
    const needsAutoplayMute = !wasWarm
    if (needsAutoplayMute) { this.player.mute(); this._forcedMuteForAutoplay = true }
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
    // 2026-08-22, round 4 (repro held up on every path -- power on, and
    // every station switch, all silent until an extra tap): rounds 2-3
    // deferred the actual unMute() to the PLAYING event or the next
    // touch/key, on the theory that unmuting is itself gesture-gated and
    // the PLAYING callback (an async postMessage handler) doesn't carry
    // one. True, but that missed a bigger point -- EVERY call to loadTrack()
    // in this file already happens synchronously inside a real touch/key
    // handler (a station switch, a skip, or -- since this round -- the
    // power-on tap itself, see powerUp()) except two: a track ending on
    // its own (ENDED) and a dead-video auto-skip (onError), neither of
    // which is a gesture. this._inUserGesture (set for the duration of
    // onTouchStart/onTouchEnd/key's synchronous body -- see there) tells
    // the two apart. When it's true, unmuting RIGHT HERE, still inside
    // that same call stack, is exactly as valid a gesture as a manual tap
    // -- no need to wait for anything async. When it's false, fall back to
    // the round-2/3 mechanism: flag intent and let the next real
    // touch/key flush it.
    // 2026-08-22, round 7 (bug: "state shows mute but track plays... at
    // the end of a track I hear nothing because mute is still on" -- the
    // display was right the whole time) -- THIS was the actual bug behind
    // every "shows muted, plays anyway" report since round 5: this block
    // never checked this.muted before calling unMute(). needsAutoplayMute
    // is true whenever this.muted is true too (wasWarm requires
    // !this.muted), so a genuinely muted session got muted correctly by
    // player.mute() above and then immediately unmuted again right here on
    // every gesture-driven load (power-on, station switch) -- audible
    // despite this.muted staying true and the display staying (correctly)
    // MUTE ON the whole time. The one load with no gesture (a natural
    // track end) skipped this branch and stayed muted, which is why THAT
    // specifically went silent -- both symptoms were the same bug. Restore
    // is now conditional on the real intent actually being unmuted.
    // 49th pass (desktop QA: scan's auto-lock -- and, by the same
    // mechanism, a natural track-end and the dead-track auto-skip -- shows
    // PLAYING/unmuted but no audio, until literally any key/tap flushes
    // it): this._inUserGesture-gating was built for MOBILE's stricter,
    // per-call gesture-synchronous unmute requirement, but loadTrack() is
    // shared code with no !this.mobile check -- desktop inherited the same
    // restriction even though desktop browsers don't need it. Chrome's
    // desktop autoplay policy is page-level, not per-call: once the user
    // has interacted with the page at all (which powering on already
    // does), a later async unMute() -- scan's setInterval lock, an ENDED
    // event, onError's auto-skip -- doesn't get blocked the way mobile's
    // does. Unmute immediately on desktop regardless of _inUserGesture;
    // mobile's existing two-branch behavior (unmute now if in a live
    // gesture, else defer to the next real touch/key) is untouched.
    // opts.suppressAutoplayUnmute (49th pass -- no station audio
    // should start until the boot sequence completes) -- powerUp()'s
    // priming call sets this on desktop only, so this whole block is
    // skipped there: stays forced-muted (already applied above) rather
    // than unmuting right here, and powerUp()'s REVEAL_DELAY beat does the
    // actual unmute once the picture lands. Mobile never sets this opt --
    // its unmute still has to happen synchronously in the tap (this
    // block), it can't wait for an async REVEAL_DELAY timeout the way
    // desktop now can.
    if (needsAutoplayMute && !this.muted && !opts.suppressAutoplayUnmute) {
      if (!this.mobile || this._inUserGesture) {
        this.player.unMute()
        this.applyVolume()
        this._forcedMuteForAutoplay = false
        this._pendingUnmute = false
      } else {
        this._pendingUnmute = true
      }
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
    // 56th pass -- liner drops (see maybePlayLinerDrop): a 1-in-4 roll per
    // new track, same station. Every "next track" path (skip key, mobile
    // swipe, natural track-end, dead-video auto-skip) funnels through here.
    maybePlayLinerDrop(this, this.lockedStation, track)
  },
  // 25th pass -- addresses audio loudness varying as stations change.
  // YouTube masters vary hugely in loudness across sources (a 1950s
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
    const wasMuted = this.muted
    this.volume = Math.min(100, Math.max(0, this.volume + delta))
    if (this.muted) this.muted = false // touching volume un-mutes, like a real set
    // 50th pass: hard mute -- volume-touch un-mute has to reopen the
    // speaker path too, same as toggleMute() does. Unconditional (it's a
    // no-op when already unmuted) so the bus can never be left closed with
    // this.muted false.
    setSpeakerMuted(this.muted)
    if (this.ready && this.player) {
      this.applyVolume()
      if (!this.muted) this.player.unMute()
    }
    // Round 9 -- same as toggleMute(): if this just un-muted a locked set,
    // the persistent status this row rests on needs to drop back to LOCKED
    // too, not just this VOL flash.
    if (wasMuted && !this.muted && this.mode === 'locked') this.statusPersistent = { text: 'LOCKED', active: true }
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
    // 50th pass: hard mute -- the whole WebAudio speaker path dies with
    // the switch (static bed, idents, clicks, all of it), not just the
    // YouTube player. See speakerOut()'s comment for what deliberately
    // survives: the tube hum (chassis) and the relay thunk below (the
    // switch's own mechanism, which is also why it still plays here while
    // muted -- and must, or un-muting would be a silent action).
    setSpeakerMuted(this.muted)
    this.drawVolume(s)
    // 38th pass: mute is a switch, so it gets a relay rather than a beep.
    playRelayThunk(this.muted)
    // 2026-08-22, round 9 -- flashStatus's transient "MUTED"/"UNMUTED" beat
    // reverts to whatever this.statusPersistent was after ~900ms (see
    // there); while locked, that resting status needs to be the new mute
    // state too (MUTED vs LOCKED -- see setStatus's other 'MUTED' call
    // sites), or the revert would land back on a stale "LOCKED" a beat
    // after you'd just muted.
    if (this.mode === 'locked') this.statusPersistent = { text: this.muted ? 'MUTED' : 'LOCKED', active: true }
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

  /** 41st pass -- the visual
   *  half of a secret station's tease. nearestSignal() already lets the
   *  meters and the hiss react to a carrier that nearestStation() refuses
   *  to lock; this bleeds the tube's tint toward the same forced color that
   *  station gives you once you are actually on it, in proportion to how
   *  close the dial is. Sweeping past feels like the set is reacting to
   *  something it will not name.
   *
   *  2026-08-23 -- generalized for SECRET_STATIONS (was a single hardcoded
   *  SECRET_STATION/red bleed): finds whichever secret station the dial is
   *  nearest to right now and bleeds toward THAT station's own
   *  forcedPhosphor, so GREEN HOUSE teases purple the same way NIN teases
   *  red, and being near one doesn't fight a tease from the other.
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
    let nearest = null, nearestDist = Infinity
    for (const st of SECRET_STATIONS) {
      const d = Math.abs(st.freq - this.freq)
      if (d < nearestDist) { nearestDist = d; nearest = st }
    }
    if (!nearest) return
    const pct = 1 - Math.min(1, nearestDist / NEAR_THRESHOLD)
    if (pct <= 0) {
      // Only restore if this function is what moved it -- otherwise every
      // tuning step anywhere on the band would fight applyPhosphor().
      if (this._teasing) { s.crt.phosphor = base; this._teasing = false }
      return
    }
    const target = PHOSPHORS[nearest.forcedPhosphor || 'red']
    // Caps well short of the full forced tint: at the threshold edge it
    // should read as a faint shift you might not consciously notice, and
    // even dead on the frequency it stays a tint rather than the full
    // alarm/haze state that locking the station actually gives you. The
    // reward has to stay bigger than the tease.
    const k = pct * 0.6
    s.crt.phosphor = [
      base[0] + (target[0] - base[0]) * k,
      base[1] + (target[1] - base[1]) * k,
      base[2] + (target[2] - base[2]) * k,
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
    // Continuous static bed while not on a station (12th pass, 2026-08-20)
    // -- static now plays between signals while seeking with arrows,
    // reusing the same bed scanning already uses. Idempotent:
    // a no-op if it's already running, so this never restarts/stutters the
    // ramp on repeated calls.
    const sig = nearestSignal(this.freq)
    startStaticNoise(sig.dist, sig.station && sig.station.static)
  },
  seekStep(s, delta) {
    this.stopScan()
    const wasLocked = this.mode === 'locked'
    // 21st pass -- seeking with arrows now wraps to the other side of the
    // tuning band, the same as scan already can -- mirror
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
    // Land-on-lock (added 2026-08-20): landing on a station while seeking
    // with arrows locks onto it automatically --
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
  // 2026-08-22: optional `forced` param -- SECRET_STATIONS entries are
  // deliberately NOT part of STATIONS (see their own comment for why), so
  // nearestStation() can never find them and the normal seek/scan/Enter
  // lock path correctly never lands on either. presetTune() needs a way to
  // lock onto one directly by reference once its own dedicated key is
  // pressed -- passing the station through here does that without touching
  // the nearestStation()-driven path every other lock still uses.
  tryLock(s, forced) {
    // 50th pass: nearestLockable, not nearestStation -- Enter can now lock
    // the secret station when parked within LOCK_THRESHOLD of 613.0. The
    // auto-lock paths (seekStep's land-on-lock, scan) still use
    // nearestStation and can't reach it -- see nearestLockable's comment.
    const { station, dist } = forced ? { station: forced, dist: 0 } : nearestLockable(this.freq)
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
    // History (14th pass) -- push
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
    // Station idents (added 2026-08-20): each station has its own short
    // tone motif in STATIONS[].ident
    // so locking on COLD WAVE sounds different from locking on QUIET HOURS,
    // instead of every station announcing itself with the same generic chime.
    playIdent(station.ident, station.identTempo || 1, s)
    // 55th pass -- verbal station IDs announce on first lock or preset
    // change. A preset-driven lock (digit key, [B]
    // back, mobile swipe -- forced is truthy) always announces, since
    // that's a deliberate "tune to this station" action every time. An
    // organic lock (Enter, seek-landing auto-lock) only announces the
    // first time this session actually lands on that station, tracked in
    // _announcedStations, so repeatedly re-locking the same station by ear
    // doesn't repeat the ID every time. Held back ~500ms behind the ident
    // tone above so the sting finishes before the voice comes in, rather
    // than the two stacking on the same beat.
    // 2026-08-23: checks station.secret generically instead of comparing
    // against one hardcoded id, now that there are two secret stations --
    // neither has a station-id-<id>.mp3 clip (see loadStationIdBuffer's own
    // comment), so this still just silently skips both.
    if (!station.secret && (forced || !this._announcedStations.has(station.id))) {
      this._announcedStations.add(station.id)
      const announceStation = station
      setTimeout(() => {
        if (this.lockedStation === announceStation) playStationId(this, announceStation)
      }, 500)
    }
    // 38th pass: the picture pulls into focus on the same beat (see
    // flashFocusSnap) -- with the ident's per-note bloom, the status
    // bracket's inverse flash and the callsign resolving out of noise,
    // lock is now one event across sound, light and text instead of four
    // independent things that happen to land together.
    flashFocusSnap(s)
    // 23rd pass: attack transient on lock, see pulseVU().
    this.pulseVU(0.5)
    // 2026-08-22, round 9 -- LOCKED is replaced with a persistent MUTED
    // state (not a flash) while muted, so it stays obvious that unmuting
    // is required to begin the experience -- a locked-but-muted set shows
    // MUTED here instead of LOCKED, staying that way (no flash, no revert
    // -- see setStatus's 'MUTED' handling) until toggleMute() flips it back.
    this.setStatus(s, this.muted ? 'MUTED' : 'LOCKED', true)
    this.drawDial(s)
    // 36th pass: resume within the cutoff instead of always drawing fresh.
    // 2026-08-22, round 4 -- when presetTune() already primed this exact
    // station's audio (see _primeStationAudio()), reuse that track/load
    // decision instead of recomputing and re-loading it. Priming exists
    // specifically so loadTrack() gets called synchronously inside the
    // original tap/swipe/key, before presetTune()'s ~330ms dial sweep
    // (a setInterval callback -- not a live gesture, same class of problem
    // round 2 already found with the async PLAYING event) has a chance to
    // break that chain. tryLock() reached directly (arrow-seek landing on
    // lock, Enter) has no sweep in between, so it's already synchronous
    // with its own gesture and doesn't need this.
    const primed = this._primedTrack
    const primedFresh = primed && primed.station === station && Date.now() - primed.at < 2000
    let remembered, resumeGapMs, withinCutoff, track
    if (primedFresh) {
      ;({ remembered, resumeGapMs, withinCutoff, track } = primed)
    } else {
      remembered = this.lastPlayback[station.id]
      resumeGapMs = remembered ? Date.now() - remembered.at : Infinity
      withinCutoff = remembered && resumeGapMs < RESUME_CUTOFF_MS
      track = withinCutoff ? remembered.track : this.nextTrack(station)
    }
    this._primedTrack = null
    this.currentTrack = track
    this.showStation(s, station)
    this.showTrack(s, track)
    this.tuneToStation(s, station, track)
    // Re-applies volume for the new station/track's gain (see
    // applyVolume()) -- a station switch is exactly the moment a loudness
    // jump would otherwise show up.
    this.applyVolume()
    if (!primedFresh) {
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

  // [G] guide (15th pass) -- a simple
  // guide on how things work, a blurb about what the app is and that it is
  // made by Hyphen8d, inspired by his own music tastes but made for the
  // community. Full-screen takeover, same clearAll-and-redraw approach
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
  // 18th pass -- added a station reference to the guide. The
  // about/credit/contact/controls screen was already using ~18 of 25 rows,
  // and a full 9-station table needs about 10 more, so the guide became 2
  // pages rather than cramming both onto one.
  // 32nd pass -- reworked the stations page to show number, name, a longer
  // description, and 5 sample tracks instead of a 3-artist 'like' line:
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
  // 50th pass -- the commands at the bottom of guide pages now stand out
  // (the keys specifically), applied to the About page's CONTROLS block
  // too -- the guide's key lines were
  // flat, which made the keys you're supposed to press as quiet as the
  // words describing them. Used for both the footer nav rows (base FAINT)
  // and the About page's controls list (base DIM), so the two keep their
  // existing relative weight while both gain the key lift. Draws the line at `base`, then
  // redraws just the bracketed spans a notch up. Deliberately two passes
  // over the SAME string rather than splitting it into segments: the
  // centering math stays exactly what it was, and the labels keep their
  // hand-tuned spacing. Guide pages are non-inverse (unlike the visualizer
  // footer), so here BOLD buys both a heavier face and a brighter level --
  // FAINT is 100, BOLD lands at 205 -- which is the whole point.
  // Every bracketed span lifts, "[any other key]" included: the brackets
  // are this app's marker for "this is a control", and singling that one
  // out as an exception would read as an inconsistency, not a nuance.
  drawGuideKeyLine(s, y, text, base = FAINT, keyAttr = BOLD) {
    const { term } = s
    const x0 = centerX(term.cols, text)
    term.text(x0, y, text, base)
    const re = /\[[^\]]*\]/g
    let m
    while ((m = re.exec(text))) term.text(x0 + m.index, y, m[0], keyAttr)
  },
  drawGuidePageAbout(s) {
    const { term } = s
    const put = (y, text, attr) => term.text(centerX(term.cols, text), y, text, attr)
    put(1, 'SIGNAL -- GUIDE', BOLD)
    put(3, 'A tuning-dial internet radio, rendered entirely as text.', NORMAL)
    put(4, 'Power it on, spin the dial, lock onto a station, and let it play.', NORMAL)
    put(6, 'Made by Hyphen8d -- inspired by my own music taste,', MUTED)
    put(7, 'built for anyone who wants a weird little radio to leave on.', MUTED)
    // 2026-08-23 (live audio tap) -- credit for the visualizer audio-sync
    // work, same MUTED register as the "Made by" lines above.
    put(8, 'Live audio sync by End Dream.', MUTED)
    put(9, 'Got an idea, a station request, or found something broken?', NORMAL)
    put(10, 'Reach out -- matt@gial.co', BRIGHT)
    put(12, 'CONTROLS', BOLD)
    // 29th pass: reflowed after PLAY/PAUSE was removed (see key()) --
    // rows 14-16 are tuning/receiver controls, row 17 is the "not a real
    // radio" trio (skip, guide, display mode), matching the same grouping
    // now used in the on-screen hint bar (drawHint()).
    this.drawGuideKeyLine(s, 14, '[<-/->] SEEK        [ENTER] LOCK        [S] SCAN', DIM)
    this.drawGuideKeyLine(s, 15, '[1-9] PRESETS       [B] BACK            [UP/DOWN] VOL', DIM)
    this.drawGuideKeyLine(s, 16, '[M] MUTE            [P] POWER', DIM)
    // 49th pass: the Guide's own controls reference was missing [V] VIZ --
    // the on-screen hint bar (drawHint()) picked it up back in the
    // 43rd/44th pass but this page never did. Caught in the 0.9 QA pass.
    this.drawGuideKeyLine(s, 17, '[N] NEXT       [G] GUIDE       [C] COLOR       [V] VISUALIZER', DIM)
    // 2026-08-23 (live audio tap) -- same honest-caveat register as the
    // ads line below: the power-on share/mic prompt is unexpected enough
    // to deserve one plain sentence saying what it's for and that saying
    // no costs nothing (the meters just stay synthetic).
    put(18, 'The audio-share prompt at power-on feeds the live meters -- optional', FAINT)
    // 20th pass -- addresses viewers without YouTube Premium hearing ads.
    // Decided against anything that tries to
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
    this.drawGuideKeyLine(s, 22, '[->] STATIONS        [any other key] CLOSE')
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
    this.drawGuideKeyLine(s, 22, '[<-] ABOUT   [1-9] JUMP   [->] NEXT   [any other key] CLOSE')
  },
  // Per-station detail page (32nd pass) -- shows the
  // station number, name, a longer description, and 5 sample tracks
  // instead of a 3-artist 'like' line. One full page per station rather
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
    // 49th pass -- notes what each station's gag frequency is an
    // homage to, kept off the main STATION box/index -- a Guide-
    // only aside for anyone curious enough to dig in. Optional field --
    // stations with no gag (or none found yet) just render nothing here.
    // Row 5, right under the tagline (the "short description") -- was
    // under the full desc block, then the page footer, before landing
    // here after later follow-up passes. Bare text only, no "freq --" prefix:
    // the freq is already shown in the header line above. Row 5 sits
    // between the tagline and the rule with nothing else using it, so no
    // reflow needed either time this moved.
    if (ch.freqNote) term.text(4, 5, truncate(ch.freqNote, contentWidth), FAINT)
    term.text(4, 6, '-'.repeat(Math.min(72, contentWidth)), FAINT)
    wordWrap(ch.desc, contentWidth).slice(0, 3).forEach((line, li) => term.text(4, 8 + li, line, NORMAL))
    term.text(4, 12, 'SAMPLE TRACKS', BOLD)
    sampleTracks(ch.tracks, 6).forEach((t, ti) => {
      const line = truncate(`${t.title} -- ${t.artist}`, term.cols - 12)
      term.text(8, 14 + ti, line, MUTED)
    })
    this.drawGuideKeyLine(s, 22, '[<-] PREV        [->] NEXT        [any other key] CLOSE')
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
    this.drawEqRibbonLeft(s)
    this.drawAntenna(s, 0)
    this.drawDial(s)
    this.drawFreq(s)
    this.drawHint(s)
    if (this.mode === 'locked' && this.lockedStation) {
      this.showStation(s, this.lockedStation)
      if (this.currentTrack) this.showTrack(s, this.currentTrack)
      // 2026-08-22, round 9 -- LOCKED is replaced with a persistent MUTED
    // state (not a flash) while muted, so it stays obvious that unmuting
    // is required to begin the experience -- a locked-but-muted set shows
    // MUTED here instead of LOCKED, staying that way (no flash, no revert
    // -- see setStatus's 'MUTED' handling) until toggleMute() flips it back.
    this.setStatus(s, this.muted ? 'MUTED' : 'LOCKED', true)
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

  // 2026-08-22, round 4 -- see presetTune()'s comment on why this needs to
  // exist separately from tryLock()'s own track-selection logic, which it
  // otherwise duplicates: same resume-within-cutoff-vs-fresh-track choice,
  // just made synchronously in the gesture rather than at the end of the
  // dial sweep. `at` timestamps the pick so tryLock() can tell a genuinely
  // fresh primed track from a stale one (e.g. presetTune() called again for
  // a different station before the first sweep finished).
  _primeStationAudio(s, station) {
    if (!this.ready || !this.player) { this._primedTrack = null; return }
    const remembered = this.lastPlayback[station.id]
    const resumeGapMs = remembered ? Date.now() - remembered.at : Infinity
    const withinCutoff = remembered && resumeGapMs < RESUME_CUTOFF_MS
    const track = withinCutoff ? remembered.track : this.nextTrack(station)
    this._primedTrack = { station, track, remembered, resumeGapMs, withinCutoff, at: Date.now() }
    if (withinCutoff) {
      this.loadTrack(track, { midSong: true, resumeAt: remembered.position + resumeGapMs / 1000 })
    } else {
      this.loadTrack(track, { midSong: true })
    }
  },

  // Added 2026-08-20 -- presets used to jump straight to the target
  // frequency and lock instantly, which read as a hard cut rather than a
  // tuning action -- a brief scan/static beat instead of an instant
  // change. Sweeps the dial from wherever it is to the preset's frequency
  // over a handful of quick steps with the static bed under it, then locks.
  //
  // 53rd pass -- fixes hitting a preset twice in a row playing a new song
  // instead of continuing the current song at the current
  // location. This was the one remaining non-radio-ish thing left in
  // the app. Root cause: _primeStationAudio() below picks a track by
  // checking this.lastPlayback[station.id], which is only ever written
  // when you LEAVE a station (see tryLock()'s snapshot). Pressing the
  // preset for the station you're already locked to and currently
  // listening to never wrote that entry, so it read as "gap too long" and
  // picked a fresh random track via nextTrack() every time -- the exact
  // complaint. A real receiver's preset button does nothing at all when
  // you press the button you're already tuned to, so this bails out
  // before any of that track-selection logic runs: no sweep, no reload,
  // current track keeps playing exactly where it is. Still flashes the
  // preset number so the press visibly registers as a tiny
  // acknowledgment -- same flashStatus() mechanism VOL/MUTE use.
  presetTune(s, station) {
    if (this.mode === 'locked' && this.lockedStation === station) {
      const presetNum = STATION_PRESET_ORDER.indexOf(station) + 1
      this.flashStatus(s, presetNum > 0 ? `PRESET ${presetNum}` : 'LOCKED')
      return
    }
    this.stopScan()
    // 2026-08-22, round 4 -- fixes switching stations leaving mute off,
    // meters showing activity, but no audio until a manual tap. The actual
    // loadTrack() for this station used to fire only
    // once the ~330ms sweep below finished, inside its setInterval
    // callback. That's an async timer, not this tap/swipe/key's own call
    // stack, so any unmute attempt made there is in exactly the same boat
    // as round 2's async PLAYING-callback attempt: no live gesture, so it
    // silently doesn't stick. Priming here starts the actual audio load
    // (and its unmute) synchronously, in the real gesture, while the sweep
    // is still free to animate visually at its own pace -- tryLock() at
    // the sweep's end reuses this instead of loading a second time.
    this._primeStationAudio(s, station)
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
    // 54th pass -- the physical button push, right before the tuning motor
    // (the whoosh below) engages.
    playPresetClick()
    // Tune-in whoosh (14th pass) -- a fun "tune-in" whoosh when
    // jumping straight to a preset (1-9). Plays once, under the sweep,
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
        // `forced` param comment. Needed for a SECRET_STATIONS entry (not
        // in STATIONS, so nearestStation() alone would never find it),
        // and harmless for every normal preset too.
        this.tryLock(s, station)
      }
    }, 55)
  },

  // Mouse-drag-to-seek (drag distance -> frequency delta) was removed here
  // in the 44th pass, removing the mouse's ability to scan the dial --
  // alongside dropping mouse input as a visualizer-wake source, see
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
    // 2026-08-22, round 4 -- true for the rest of this function's
    // synchronous body (including anything it calls directly, like
    // powerUp()/tryLock()/loadTrack() further down the stack), so
    // loadTrack() can tell a real tap/swipe apart from an async callback
    // (track ended, a player error) and only unmute immediately for the
    // former. try/finally guarantees this clears even on an early return.
    this._inUserGesture = true
    try {
    if (this.poweredOn) this._lastInputAt = Date.now()
    // 2026-08-22 (bug report, round 2 -- repro: power on,
    // silent; swipe to a new station, still silent; tap mute (shows MUTED,
    // still silent); tap it again to unmute -- THEN it plays. The
    // loadTrack()/PLAYING-handler mute-then-unmute from the previous round
    // gets the mute half right (muted autoplay is unconditionally allowed,
    // which is why playback actually starts and the UI shows real
    // progress/track info) but the auto-unmute half doesn't reliably work
    // -- unmuting a video by script is ALSO gated behind a live user
    // gesture on the stricter mobile browsers, and the PLAYING event that
    // triggers it fires from an async postMessage callback, not from
    // inside a touch handler. So it plays, but stays muted forever, until
    // a mute-tap-then-unmute-tap supplies the real gesture the
    // unMute() call needed all along -- the second tap is what actually
    // works, same as manually doing it before this fix existed.
    // Fix: stop trying to unmute from the async callback. Leave
    // _pendingUnmute set there instead, and flush it here, at the top of
    // the touch handler that already runs on every tap AND every swipe --
    // this IS a live gesture, so the very next touch after playback starts
    // (which on a phone is usually within a second or two) unmutes for
    // real, with no dedicated "tap mute twice" dance required.
    // 2026-08-22, round 3 (bug: "when I tap, it mutes after a tiny fraction
    // of time hearing audio") -- this flush worked, but the SAME tap then
    // fell through to onTouchEnd's plain single-tap gesture, which reads a
    // quick, minimal-movement tap as an explicit "toggle mute" request (see
    // the TAP MUTE hint) -- so the tap that had just un-muted the player
    // immediately re-muted it a beat later, with no other tap in between.
    // Flagging this touch as a flush-only touch tells onTouchEnd not to
    // also treat it as a manual mute toggle.
    this._suppressTapMuteToggle = false
    if (this._pendingUnmute && !this.muted && this.ready && this.player) {
      this._pendingUnmute = false
      this.player.unMute()
      this.applyVolume()
      this._suppressTapMuteToggle = true
    }
    // 2026-08-23 (live audio tap) -- see key()'s twin call: deferred mic
    // retry for gesture-gating browsers, flushed on any real touch.
    maybeRetryAudioTapInGesture(this, s)
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
    } finally { this._inUserGesture = false }
  },
  onTouchEnd(s, e) {
    this._inUserGesture = true
    try {
    if (this._twoFingerActive) {
      // BUG FIXED (found during live mobile QA -- color change seemed
      // iffy): real fingers never lift in perfect sync, so touchend fires once per
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
      // 2026-08-22, round 3 -- this same tap may have just been consumed by
      // onTouchStart to flush a deferred autoplay-unmute (see
      // _suppressTapMuteToggle there). That already restored the sound the
      // user's own mute setting calls for; toggling again here would mute
      // it right back, one gesture after it started playing.
      if (this._suppressTapMuteToggle) { this._suppressTapMuteToggle = false; return }
      this.toggleMute(s)
      return
    }
    if (!this.poweredOn || this.guideOpen) return
    if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy)) {
      // 45th pass -- flipped after live mobile QA found the station swipe
      // still read as mirrored. Now matches the dial itself, which reads
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
    } finally { this._inUserGesture = false }
  },
  stepStation(s, dir) {
    const order = STATION_PRESET_ORDER
    let idx = this.lockedStation ? order.indexOf(this.lockedStation) : -1
    if (idx === -1) idx = order.indexOf(nearestStation(this.freq).station)
    if (idx === -1) idx = 0
    const next = order[(idx + dir + order.length) % order.length]
    this.presetTune(s, next)
  },

  // Visualizer (43rd pass). Full-screen takeover -- same clearAll-and-
  // redraw approach as the Guide and the power sequences -- with row 0
  // (drawTitleBar) kept and a footer of its own for live station/track
  // info rather than duplicating the main screen's. 50th pass: the effect
  // canvas is rows 1..VIZ_BOT-1 and the footer is the three rows below it
  // (VIZ_INFO_Y1/VIZ_INFO_Y2/VIZ_BAR_Y), which no longer line up with the
  // main screen's HINT_Y1/HINT_Y2. Only ever entered while
  // locked and playing (see the idle check in frame() and the [V] case in
  // key()), so there's always a station to show on the way in.
  enterVisualizer(s) {
    if (this.visualizerActive) return
    this.visualizerActive = true
    this._vizEnterAt = Date.now()
    this._vizLastInfoDraw = 0
    // 50th pass: a stale flash from a previous visit would otherwise sit
    // in the legend's slot for up to 1.4s on re-entry.
    this._vizFlash = null
    // 2026-08-24: always re-enter on the station's own visual, not
    // whatever the lyrics view happened to be left on last time.
    this.lyricsViewOpen = false
    // 50th pass -- fixes DISTORTION FIELD's visualizer working when
    // activated from station, but showing just a frozen frame after
    // switching to another station and back and trying visualizer. The effect
    // clock is NOT wall time: drawVisualizerFrame() passes each effect
    // (Date.now() - this._vizEnterAt) / 1000, which restarts at 0 on every
    // entry because _vizEnterAt is reset three lines up. Any effect that
    // stores an absolute `t` and compares against it later therefore has a
    // timestamp from the FUTURE waiting for it on the next entry.
    // FLAME is the only effect that does that (`t - this._fireLastStep >=
    // 0.13`), and it's the only one that froze: leave the visualizer after
    // 40s and _fireLastStep is 40, so on re-entry the gate reads 0 - 40 =
    // -40 and the heat simulation never steps again -- while the draw loop
    // keeps happily rendering the last heat buffer. A frozen picture, not a
    // crash, and it would have "healed" only after sitting there for the
    // length of the previous visit. Reset on entry, alongside the clock
    // itself, so effect state and effect time always start together.
    // BOOM BAP's _boomWaves get the same treatment -- its step gate uses a
    // discrete index and self-heals, but stale waves carry startT values
    // that `t - startT > 1.3` can't expire until t climbs back past them.
    this._fireLastStep = 0
    this._boomWaves = []
    // GEIGER (50th pass) is a stepped simulation with the same exposure to
    // the restarting clock, so it gets re-armed here for the same reason
    // FLAME does -- and deliberately starts from scratch (needle at rest)
    // so opening the visualizer always shows the process beginning rather
    // than resuming. 59th pass: GEIGER is unassigned now (replaced by BLAST
    // FIELD, see VISUAL_METHODS) but this reset is left in place -- the
    // object is still referenced by the kept-but-unassigned drawGeigerEffect.
    this._geiger = null
    // 59th pass -- BLAST FIELD (ATOMIC) and the rebuilt SKYLINE (MOMENTUM)
    // carry the same clock-restart exposure the note above describes:
    // absolute spawnT/flashUntil timestamps compared against a clock that
    // restarts at 0 on every entry. Towers rebuild from scratch (same
    // "process begins, doesn't resume" contract as GEIGER's needle) rather
    // than carrying a partially-built skyline across visits; blasts just
    // clear.
    this._momentumTowers = makeSkylineTowers(s.term.cols)
    this._momentumNextTower = 0
    this._blasts = []
    // 57th pass, 2nd rewrite -- COLD WAVE's neon grid starts fully dark on
    // every visualizer entry, same reasoning as GEIGER's needle above.
    this._coldGridCells.fill(0)
    // 2026-08-23 (live audio tap) -- the audio-reactive additions carry
    // their own bare-t / learned state, reset here for the same reasons as
    // everything above: accumulator clocks restart with the effect clock.
    this._outrunPhase = 0
    this._outrunPhaseT = 0
    this._outrunRedline = 0
    this._isotopeRings = []
    this._breachLastT = 0
    // 60th pass -- NEON SIGN (MIDNIGHT NEON) carries the same clock-restart
    // exposure as BLAST FIELD/SKYLINE above: this._neonOff stores absolute
    // offUntil timestamps against the effect clock. Segment layout
    // (this._neon) is cheap to rebuild and rebuilt anyway if cols changed,
    // but the flicker/buzz state always starts fresh -- sign fully lit on
    // entry, same "process begins, doesn't resume" contract as everything
    // else this pass.
    this._neon = null
    this._neonOff = new Map()
    const { term } = s
    for (let y = 0; y < term.rows; y++)
      for (let x = 0; x < term.cols; x++) term.put(x, y, ' ', NORMAL, 0)
    this.drawTitleBar(s)
    this.drawVisualizerInfo(s)
    playPanelSound(true)
  },
  // 65th pass -- shared with drawVisualizerFrame() so the flash label
  // Shift+C shows and the effect actually drawn can never disagree: an
  // override in this.visualOverrides (see cycleVisualEffect below) wins
  // over the locked station's own station.visual default.
  activeVisualKey() {
    const override = this.lockedStation && this.visualOverrides[this.lockedStation.id]
    if (override && VISUAL_METHODS[override]) return override
    if (this.lockedStation && VISUAL_METHODS[this.lockedStation.visual]) return this.lockedStation.visual
    return 'drift'
  },
  // 65th pass -- [Shift+C] in the visualizer. Advances the locked
  // station's effect one step through VISUAL_KEYS (every built effect,
  // including the ones no station ships with by default -- "any effect,
  // anywhere" per the design call), wrapping past the end. Stored per
  // station.id in this.visualOverrides and persisted immediately, same as
  // volume/mute/phosphor -- the pick sticks until cycled again, it does
  // not reset the next time this station's visualizer opens.
  cycleVisualEffect(s) {
    if (!this.lockedStation) return
    const current = this.activeVisualKey()
    const idx = VISUAL_KEYS.indexOf(current)
    const next = VISUAL_KEYS[(idx + 1) % VISUAL_KEYS.length]
    this.visualOverrides[this.lockedStation.id] = next
    saveSignalState(this)
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
    this.drawEqRibbonLeft(s)
    this.drawAntenna(s, 0)
    this.drawDial(s)
    this.drawFreq(s)
    this.drawHint(s)
    if (this.mode === 'locked' && this.lockedStation) {
      this.showStation(s, this.lockedStation)
      if (this.currentTrack) this.showTrack(s, this.currentTrack)
      // 2026-08-22, round 9 -- LOCKED is replaced with a persistent MUTED
    // state (not a flash) while muted, so it stays obvious that unmuting
    // is required to begin the experience -- a locked-but-muted set shows
    // MUTED here instead of LOCKED, staying that way (no flash, no revert
    // -- see setStatus's 'MUTED' handling) until toggleMute() flips it back.
    this.setStatus(s, this.muted ? 'MUTED' : 'LOCKED', true)
    } else {
      this.clearStation(s)
      this.clearTrack(s)
      this.setStatus(s, 'SEEKING', false)
    }
    this.setPlayState(s, this.playState)
  },
  // The visualizer's own footer: a live station/track readout plus the
  // control legend and the position bar, in place of the main screen's
  // hint rows. Same inverse treatment across all three rows, so it reads
  // as "system chrome" rather than new content bolted onto the effect
  // canvas.
  drawVisualizerInfo(s) {
    const { term } = s
    const station = this.lockedStation
    // 50th pass -- found during live QA that the footer read too bright and
    // some text was hard to see, so the whole footer drops from NORMAL to DIM.
    // On an INVERSE row the attr sets how bright the background is (the
    // glyph pixels are always unlit -- see term.js's `inv ? !on : on`), so
    // this is a direct brightness dial: 205 -> 150. Three full-width
    // inverse rows at NORMAL was a lot of lit area for the bloom shader to
    // chew on, and blooming a bright background over dark glyphs is exactly
    // what was eating the text. Dimmer background = less bleed = MORE
    // legible, not less. One attr across all three rows on purpose: any
    // per-row variation reads as a gradient artifact rather than hierarchy,
    // since brightness here belongs to the background, not the text.
    const foot = DIM
    for (let x = 0; x < term.cols; x++) {
      term.put(x, VIZ_INFO_Y1, ' ', foot, 1)
      term.put(x, VIZ_INFO_Y2, ' ', foot, 1)
      term.put(x, VIZ_BAR_Y, ' ', foot, 1)
    }
    if (!station) return
    // 44th pass -- glyph flanks both sides, matching showStation()'s
    // "GLYPH NAME GLYPH" treatment in the STATION box rather than a single
    // leading marker.
    const flair = station.glyph || '●'
    const line1 = ` ${flair} ${station.callsign} ${flair} · ${station.freq.toFixed(1)} KHZ`
    // `foot | BOLD`, not plain BOLD -- bolds the station name in viz
    // mode. CORRECTION to an earlier note in this function that claimed
    // BOLD costs brightness -- it doesn't. BOLD (bit 2) and BRIGHT (bit 1)
    // are separate flags, and term.js picks the level as FAINT ?? DIM ??
    // MUTED ?? LEVELS[attr & BRIGHT], so DIM wins the level regardless of
    // BOLD while BOLD still selects the bold face. On an inverse row that
    // means MORE unlit pixels per glyph, i.e. genuinely heavier text on an
    // unchanged background -- bold here is free, and it's the one emphasis
    // that works on inverse rows (you can't brighten glyphs that are
    // defined by being unlit).
    term.text(0, VIZ_INFO_Y1, line1, foot | BOLD, 1)
    // 50th pass -- replaces the plain "any key to exit" with
    // real controls. The visualizer grew a real control set ([C] color,
    // [N] skip, [M] mute, up/down volume; see key()), so this corner is now
    // a legend for them rather than the single "[ANY KEY] EXIT" it used to
    // be. Two widths because the legend has to share the row with a station
    // callsign that ranges from CIPHER (6) to DISTORTION FIELD (16) -- the
    // full legend fits comfortably next to a short one and overruns 80 cols
    // next to a long one, so measure rather than guess. Falls through to
    // drawing nothing at all if even the compact form can't fit, which no
    // current callsign triggers but a future longer one might.
    // While a control flash is live (see _vizFlash) it takes this slot
    // instead: the normal status-row feedback those controls produce
    // (flashStatus at STATUS_Y, the VOL bar in LEVELS) is underneath the
    // effect canvas and invisible here, so without this, [M] and the volume
    // keys would be completely silent acknowledgement-wise.
    // 50th pass, revised same session: '[C] COLOR' style ran 55 cols and
    // only fit next to a short callsign, so the labels fold the bracket
    // into the word ('[C]OLOR') -- 12 cols cheaper and, if anything, reads
    // faster. Also [N] is NEXT rather than SKIP now, renamed everywhere it
    // appears (drawHint, the Guide's controls page, the README) rather than
    // just here: "skip" reads as discarding something, "next" is what the
    // key actually does. And the exit hint names a real key. [E] genuinely
    // exits -- but so does every other non-control key, exactly as before;
    // it isn't special-cased anywhere, it just falls through the switch in
    // key() like everything else. Naming one key is friendlier than the old
    // '[ANY] EXIT', without narrowing what actually works.
    // 50th pass -- bolds the command key of each command. Each
    // entry is [key, label] so the bracketed key can be drawn bold and its
    // label at normal weight, which is why this is a list of pairs rather
    // than one string. Same total width as the flat string it replaces.
    const flash = this._vizFlash && Date.now() < this._vizFlash.until ? this._vizFlash.text : null
    // 50th pass, ordering pass -- reordered for logical use, emphasis, and
    // readability. Was COLOR, NEXT, MUTE, VOL,
    // EXIT. Two things wrong with that. COLOR led the line despite being
    // the one purely cosmetic control here, so the first thing your eye hit
    // was the least likely thing you wanted. And the shared controls sat in
    // a DIFFERENT relative order than drawHint()'s row 2 on the main screen
    // (NEXT, VOL, MUTE, ... MODE), which quietly fights the muscle memory
    // the main screen just finished building. Now: playback, audio pair,
    // cosmetic, exit -- same relative order as the main footer, with EXIT
    // last where it already was. Identical width (44), so the fit against
    // the longest callsign is unchanged.
    // 2026-08-24 -- the volume hint is swapped for lyrics. [UP/DN] VOL
    // drops from the legend text; the keys themselves keep working
    // silently, same as [E]XIT already only names one of the many keys
    // that actually exit. [L] takes the freed slot -- it's dimmer/plain
    // when unavailable and bold when it isn't, so the legend loop below
    // special-cases its attr rather than using the flat foot|BOLD every
    // other bracket gets.
    // 2026-08-25 -- spelled out as [L]yrics rather than bare [L], to match
    // every other full-legend entry's own
    // bracket-fold convention ("[C]OLOR", "[M]UTE"); legendCompact stays
    // bracket-only for all five entries on purpose, that's what makes it
    // compact.
    const legendFull = [['[N]', 'EXT'], ['[L]', 'YRICS'], ['[M]', 'UTE'], ['[C]', 'OLOR'], ['[E]', 'XIT']]
    const legendCompact = [['[N]', ''], ['[L]', ''], ['[M]', ''], ['[C]', ''], ['[E]', '']]
    // Width of a rendered legend, including one trailing space of margin.
    const legendW = (items, sep) =>
      items.reduce((n, [k, l]) => n + k.length + l.length, 0) + sep.length * (items.length - 1) + 1
    if (flash) {
      // A live flash takes the legend's slot, one notch brighter than the
      // rest of the footer plus bold, so it registers as a change.
      const text = `${flash} `
      const fx = Math.max(line1.length + 2, term.cols - text.length)
      if (fx + text.length <= term.cols) term.text(fx, VIZ_INFO_Y1, text, MUTED | BOLD, 1)
    } else {
      let items = legendFull, sep = '  '
      if (line1.length + 2 + legendW(items, sep) > term.cols) { items = legendCompact; sep = ' ' }
      const w = legendW(items, sep)
      let cx = Math.max(line1.length + 2, term.cols - w)
      if (cx + w <= term.cols) {
        for (const [k, l] of items) {
          // 2026-08-24 -- [L] is the one entry whose brightness carries
          // real information (does this track have lyrics right now)
          // rather than being flat legend chrome, so it reads its own
          // state instead of always taking foot|BOLD. FAINT rather than
          // plain `foot` for "not available" so it visibly recedes next to
          // the rest of the row, same idiom drawVU/drawMuteButton already
          // use elsewhere for an inactive control.
          const keyAttr = k === '[L]'
            ? (lyricsStateFor(this.currentTrack) === 'available' ? (foot | BOLD) : FAINT)
            : (foot | BOLD)
          term.text(cx, VIZ_INFO_Y1, k, keyAttr, 1)
          cx += k.length
          if (l) { term.text(cx, VIZ_INFO_Y1, l, foot, 1); cx += l.length }
          cx += sep.length
        }
      }
    }

    // Track line -- the whole width now. The clock moved down to the bar
    // row, putting the elapsed time on the same row as the bar, which
    // is where it belongs anyway: the numbers and the bar are the same
    // reading, and splitting them across two rows made you look twice.
    const track = this.currentTrack
    let timePart = ''
    let progress = null
    if (this.ready && this.player) {
      let cur, dur
      try { cur = this.player.getCurrentTime(); dur = this.player.getDuration() } catch (e) {}
      if (dur && isFinite(dur) && dur > 0) {
        const fmt = (sec) => { sec = Math.max(0, Math.floor(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` }
        timePart = `${fmt(cur)} / ${fmt(dur)} `
        progress = Math.min(1, Math.max(0, cur / dur))
      }
    }
    // Centred -- centers track info of song and artist, unlike the
    // left-anchored station row above it -- the two rows reading differently
    // is the point, same way the main screen's two hint rows differ. No
    // leading space here for that reason: centerX() places it.
    let line2 = track ? `${track.title}  --  ${track.artist}` : ''
    if (line2.length > term.cols - 2) line2 = truncate(line2, term.cols - 2)
    if (line2) term.text(centerX(term.cols, line2), VIZ_INFO_Y2, line2, foot, 1)

    // Position bar -- the footer's bottom row, drawn INVERSE like the two
    // text rows above it so all three read as one chrome block (see
    // VIZ_BAR_Y's comment), with the clock riding on its right end.
    //
    // The fill is '▒', not the '█' drawPlayback() uses in the NOW PLAYING
    // box. On an inverse row a '█' has every pixel unlit, i.e. pure black
    // -- and on the very bottom row of the screen that black ran straight
    // into the unlit area under the tube -- the black bled into the bottom
    // of the terminal. '▒' is a 50% pattern,
    // so the elapsed portion reads as a distinctly darker mid-tone against
    // the trough instead of a hole punched in the chrome, and the bar keeps
    // a visible bottom edge. '▓' was the other candidate at 25% -- closer
    // to the old look but close enough to black to bleed again.
    // Trough stays '·' (near-fully lit, a faint speck per cell) so the
    // bar's full extent is still legible, and everything sits at the same
    // `foot` attr as the rest of the footer: on an inverse row the attr is
    // the BACKGROUND level, so varying it per-segment would band the row
    // rather than shade the bar.
    if (progress != null) {
      const x0 = 1
      // Leave room for the clock plus a gap, rather than running the bar
      // the full width and overprinting it.
      const x1 = term.cols - timePart.length - 3
      const segs = x1 - x0 - 1
      if (segs > 0) {
        term.put(x0, VIZ_BAR_Y, '[', foot, 1)
        term.put(x1, VIZ_BAR_Y, ']', foot, 1)
        const filled = Math.round(progress * segs)
        for (let i = 0; i < segs; i++) {
          term.put(x0 + 1 + i, VIZ_BAR_Y, i < filled ? '▒' : '·', foot, 1)
        }
      }
      if (timePart) term.text(term.cols - timePart.length, VIZ_BAR_Y, timePart, foot, 1)
    }
  },
  // 57th pass, 2nd rewrite -- Neon Grid Decay, COLD WAVE's core visual now,
  // rebuilt from scratch. This replaces the old FROST dendrite automaton
  // outright rather than layering the grid on top of it. A wireframe grid
  // spans the whole screen; the connecting lines are static geometry (the
  // glass), and each intersection is a neon node that a real treble hit or
  // onset ignites to full brightness, decaying back out on its own -- "the
  // sign losing power," which is the whole "decay" in the name.
  // 62nd pass -- was a dim, motionless wire with
  // unlit nodes and no ignitions without a tap; found during live QA to
  // read as broken rather than atmospheric when a real tap isn't available,
  // so hard silence rules were relaxed in favor of a seamless fallback.
  // Falls back to syntheticAudio(t) now (see its own note near auMul) --
  // the ignition logic below is unchanged, it just always has a signal to
  // read.
  drawFrostEffect(s, t) {
    const { term } = s
    const cols = term.cols
    for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < cols; x++) term.put(x, y, ' ')
    const gCols = COLD_GRID_COLS, gRows = COLD_GRID_ROWS
    const cellW = cols / gCols, cellH = (VIZ_BOT - 2) / gRows
    const A = this.muted ? SILENT_AUDIO : (this._au || syntheticAudio(t))
    {
      // Treble drives the ambient ignition rate; a real onset always lands
      // a small burst of ignitions even on a quiet passage, so the grid
      // never goes fully dead mid-track.
      // 65th pass -- widened 0.02-0.28 -> 0.015-0.5 and the onset burst
      // from 1 cell to 3: a loud treble passage barely moved the needle at
      // the old ceiling, and a single onset cell was easy to miss against
      // a 144-cell field.
      const flashRate = auMul(A, A.treble, 0.015, 0.5)
      for (let i = 0; i < this._coldGridCells.length; i++) {
        if (this._coldGridCells[i] > 0) this._coldGridCells[i] = Math.max(0, this._coldGridCells[i] - 0.05)
        else if (Math.random() < flashRate) this._coldGridCells[i] = 1
      }
      if (A.onset) {
        for (let k = 0; k < 3; k++) this._coldGridCells[Math.floor(Math.random() * this._coldGridCells.length)] = 1
      }
    }
    // Wireframe: dotted lines connecting every intersection. A live tap
    // nudges the line brightness with overall level.
    // 65th pass -- was a single DIM/FAINT threshold at 0.55, which meant
    // most of a real track's dynamic range only ever showed FAINT; three
    // tiers instead so a loud passage visibly lights the whole wireframe.
    const lineAttr = !A ? FAINT : A.level > 0.7 ? NORMAL : A.level > 0.35 ? DIM : FAINT
    for (let gy = 0; gy <= gRows; gy++) {
      const y = Math.round(1 + gy * cellH)
      if (y < 1 || y >= VIZ_BOT) continue
      for (let x = 0; x < cols; x += 2) term.put(x, y, '·', lineAttr)
    }
    for (let gx = 0; gx <= gCols; gx++) {
      const x = Math.round(gx * cellW)
      if (x < 0 || x >= cols) continue
      for (let y = 1; y < VIZ_BOT; y += 2) term.put(x, y, '·', lineAttr)
    }
    // Nodes on top -- always visible (dim unlit, bright when ignited), so
    // the grid reads as a structure of lit points rather than a hatch.
    for (let gy = 0; gy <= gRows; gy++) {
      const y = Math.round(1 + gy * cellH)
      if (y < 1 || y >= VIZ_BOT) continue
      for (let gx = 0; gx <= gCols; gx++) {
        const x = Math.round(gx * cellW)
        if (x < 0 || x >= cols) continue
        const idx = (gy % gRows) * gCols + (gx % gCols)
        const bright = this._coldGridCells[idx]
        if (bright > 0.05) term.put(x, y, bright > 0.55 ? '◆' : '+', bright > 0.55 ? BRIGHT : NORMAL)
        else term.put(x, y, '+', MUTED)
      }
    }
  },
  // GEIGER (50th pass, ATOMIC) -- replaces COUNTER; see VISUAL_METHODS.
  // The station's tagline has always promised "swing on while the counter
  // clicks", so this is that counter: an analogue rate meter with a real
  // moving needle, a scale it sweeps, and a chart-recorder strip scrolling
  // underneath it. Fits the skeuomorphic-receiver direction the rest of
  // the app commits to, and nothing else on the roster is an instrument.
  // 57th pass, 2nd rewrite -- Geiger Click, picked off the newer
  // visualizer-lab mock, replacing ISOTOPE MAP on ATOMIC, rebuilt from
  // scratch. This also fixes a latent bug in the old
  // code: `g.v` (the needle's actual position) was read every frame but
  // never written anywhere -- only `g.target` moved, so with no caller
  // ever wired up to advance one toward the other, the needle was frozen
  // at its 0.06 rest value forever. Rebuilt as discrete click events
  // instead of a scripted random wander: real "clicks" (an onset, or a
  // per-frame probability that scales with overall level) each KICK the
  // needle -- sharp attack -- which decays back toward rest on its own,
  // the actual response shape of a moving-coil meter driven by counts.
  // No tap, no clicks, ever, and the needle settles to dead rest and stays
  // there -- "no activity if there's no audio."
  drawGeigerEffect(s, t) {
    const { term } = s
    const cols = term.cols
    for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < cols; x++) term.put(x, y, ' ')
    if (!this._geiger) {
      this._geiger = { v: 0, last: t, strip: new Array(cols).fill(0), stripLast: 0, lastClickAt: -1, count: 0 }
    }
    const g = this._geiger
    if (t < g.last) g.last = t                    // rewound-clock guard
    const dt = Math.min(0.1, Math.max(0, t - g.last))
    g.last = t
    const A = this._au

    // --- scale arc (fixed geometry, drawn every frame either way) ------
    const cx = cols / 2, py = 14, rx = 33, ry = 11
    const TICKS = 49
    const seen = new Set()
    for (let k = 0; k < TICKS; k++) {
      const frac = k / (TICKS - 1)
      const a = Math.PI - frac * Math.PI
      const x = Math.round(cx + Math.cos(a) * rx)
      const y = Math.round(py - Math.sin(a) * ry)
      if (x < 0 || x >= cols || y < 1 || y >= VIZ_BOT) continue
      const key = x + ',' + y
      if (seen.has(key)) continue          // rounding collapses neighbours near the flanks
      seen.add(key)
      const major = k % 12 === 0
      // The top of the scale is hot: ticks past ~75% sit brighter, so the
      // danger end of the dial is legible before the needle ever gets there.
      const hot = frac > 0.75
      term.put(x, y, major ? '┼' : hot ? '+' : '·',
        major ? (hot ? BRIGHT : NORMAL) : (hot ? NORMAL : DIM))
    }

    // 57th pass, 3rd pass -- a real Geiger counter never reads zero; it
    // always ticks a little off background radiation. Same "always there,
    // different metered level" language as the tach: with no tap this
    // becomes a slow, tiny background click rate instead of dead silence,
    // and with a tap the count rate scales up with the music on top of it.
    const clickProb = A ? auMul(A, A.level, 0.015, 0.55) : 0.006
    if ((A && A.onset) || Math.random() < clickProb) {
      const kick = A ? 0.22 + A.bass * 0.55 + (A.onset ? 0.25 : 0) : 0.12
      g.v = Math.min(1, g.v + kick)
      g.lastClickAt = t
      g.count++
    }
    g.v = Math.max(0, g.v - dt * 0.7)   // always decaying back toward rest

    // --- needle ----------------------------------------------------------
    // Line glyph chosen from the needle's own angle rather than a solid
    // block per cell. A staircase of '█' reads as a wedge or a bar; '/',
    // '\\', '|' and '─' read as a drawn pointer, which is what a needle
    // is. Slope is measured in CELLS, not geometry -- cells are about
    // twice as tall as they are wide, so the visual angle is not the
    // maths angle and picking the glyph off the raw angle looks wrong.
    const na = Math.PI - g.v * Math.PI
    const dxc = Math.cos(na) * rx, dyc = -Math.sin(na) * ry
    const slope = Math.abs(dxc) < 0.001 ? 99 : dyc / dxc
    const needleCh = Math.abs(slope) > 1.6 ? '|' : Math.abs(slope) < 0.35 ? '─' : (slope < 0 ? '/' : '\\')
    const steps = 26
    for (let k = 3; k <= steps; k++) {
      const r = k / steps
      const x = Math.round(cx + Math.cos(na) * rx * r * 0.92)
      const y = Math.round(py - Math.sin(na) * ry * r * 0.92)
      if (x < 0 || x >= cols || y < 1 || y >= VIZ_BOT) continue
      term.put(x, y, k === steps ? '●' : needleCh, k === steps ? BRIGHT : visualizerLevelAttr(0.4 + r * 0.55))
    }
    term.put(Math.round(cx), py, '█', BRIGHT)              // pivot
    for (let x = Math.round(cx) - 4; x <= Math.round(cx) + 4; x++) {
      if (x >= 0 && x < cols) term.put(x, py + 1, '─', MUTED)   // meter body
    }
    // A click's spark: a brief bright burst around the pivot, gone in
    // ~0.1s -- the "click" itself, distinct from the needle's own motion.
    // Fires for background clicks too, not just live ones.
    if (t - g.lastClickAt < 0.1) {
      term.put(Math.round(cx) - 1, py, '*', BRIGHT)
      term.put(Math.round(cx) + 1, py, '*', BRIGHT)
      term.put(Math.round(cx), py - 1, '*', BRIGHT)
    }
    // Digital count readout -- the explicit "counter" the station's own
    // tagline promises, separate from the needle's analogue read.
    const countText = 'CT ' + String(g.count % 100000).padStart(5, '0')
    term.text(Math.round(cx) - Math.floor(countText.length / 2), py + 3, countText, MUTED)

    // 57th pass, 4th rewrite -- chart-recorder strip removed entirely,
    // eliminating a horizontal moving artifact in ATOMIC. g.strip/g.stripLast are left as harmless dead state on the
    // _geiger object rather than torn out of its init shape.
    // 59th pass -- unassigned (was ATOMIC), replaced by BLAST FIELD below.
    // See VISUAL_METHODS' note near blastfield for why.
  },
  // BLAST FIELD (59th pass, ATOMIC) -- replaces GEIGER, which along with
  // MOMENTUM's flow field wasn't obviously reacting to the music; rebuilt
  // from the ground up to be impressive and shifting.
  // GEIGER above was a real, working instrument -- but a small one pinned
  // to screen center, the opposite scale of FLAME/RIPPLE, which are the
  // two effects that were called out as working. This fills the whole field
  // instead: a real bass onset detonates at a random point -- a bright
  // core flash for its first instant, a fast shockwave ring (BLAST_SPEED
  // is 3x ISOTOPE_RING_SPEED -- a detonation should read as sudden, not a
  // slow isotope ripple), then a wider, dimmer "fallout" band trailing
  // just inside the ring so debris reads as settling rather than the
  // blast just vanishing. A sparse, audio-independent background-radiation
  // twinkle keeps the field from reading as literally dead at rest, but
  // its threshold also loosens gently with overall level, and with no tap
  // at all it drops back to its quietest, sparsest setting -- no blasts,
  // ever, same "no activity without audio" contract as FLAME.
  drawBlastFieldEffect(s, t) {
    const { term } = s
    const cols = term.cols
    const A = this._au

    if (A && A.onset && A.bass > 0.3) {
      const bx = Math.random() * cols
      const by = 1 + Math.random() * (VIZ_BOT - 2)
      this._blasts.push({ x: bx, y: by, spawnT: t, strength: 0.6 + Math.min(1, A.bass) * 0.4 })
      if (this._blasts.length > BLAST_MAX) this._blasts.shift()
    }
    this._blasts = this._blasts.filter((b) => t - b.spawnT < BLAST_LIFE)

    // Background radiation: rare single-cell twinkles, independent of
    // audio in kind but not in rate -- the threshold loosens slightly with
    // overall level so a loud passage feels a touch more alive even
    // between hits, same blend FLAME uses (continuous fuel + discrete
    // flare) rather than picking one or the other.
    const bgThresh = A ? 0.94 - 0.08 * Math.min(1, A.level) : 0.94

    for (let y = 1; y < VIZ_BOT; y++) {
      for (let x = 0; x < cols; x++) {
        const bgPhase = hash2(x, y) * Math.PI * 2
        const bgFreq = 0.5 + hash2(y, x) * 1.5
        const bg = 0.5 + 0.5 * Math.sin(t * bgFreq + bgPhase)
        let v = bg > bgThresh ? 0.14 : 0

        for (const b of this._blasts) {
          const age = t - b.spawnT
          const radius = age * BLAST_SPEED
          const dx = x - b.x, dy = (y - b.y) * 2.1
          const dist = Math.sqrt(dx * dx + dy * dy)
          const decay = Math.pow(0.5, age / BLAST_HALFLIFE)
          // Core flash -- everything inside a small radius during the
          // blast's first instant reads as a detonation, not a thin ring.
          if (age < 0.06) {
            const core = Math.max(0, 1 - dist / 3)
            v = Math.max(v, core * b.strength)
          }
          // Shockwave ring.
          const ringDist = Math.abs(dist - radius)
          if (ringDist < BLAST_RING_BAND) {
            v = Math.max(v, (1 - ringDist / BLAST_RING_BAND) * decay * b.strength)
          }
          // Fallout dust -- a wide, dim band trailing just inside the ring.
          if (dist < radius && radius - dist < BLAST_DUST_BAND) {
            const dust = (1 - (radius - dist) / BLAST_DUST_BAND) * decay * 0.35 * b.strength
            v = Math.max(v, dust)
          }
        }

        if (v < 0.08) { term.put(x, y, ' '); continue }
        const ch = v > 0.85 ? '@' : v > 0.6 ? '▓' : v > 0.4 ? '▒' : v > 0.2 ? '+' : '·'
        term.put(x, y, ch, visualizerLevelAttr(v))
      }
    }
  },
  // NEON SIGN (60th pass, MIDNIGHT NEON) -- built for the station that
  // replaced MOMENTUM; see VISUAL_METHODS' note above neonsign for the
  // full brief. The word BLUES, centered, rendered from the NEON_FONT
  // segment list buildNeonSegments() lays out once per entry. Two things
  // make it read as a sign and not just static text: segments gutter
  // independently (ambient flicker, always running, silence included --
  // the one deliberate exception to FLAME's no-audio-no-activity rule,
  // because hardware left on hums even in a quiet room) and a real bass
  // onset knocks a whole burst dark at once (the buzz cascade), which self-
  // heals within NEON_BUZZ_MAX_DUR the same way FLAME's embers cool back
  // rather than needing an explicit "relight" step. A soft one-cell glow
  // halo bleeds into the dark cells touching a currently-lit segment.
  drawNeonSignEffect(s, t) {
    const { term } = s
    const cols = term.cols
    for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < cols; x++) term.put(x, y, ' ')
    if (!this._neon || this._neon.cols !== cols) {
      this._neon = Object.assign({ cols }, buildNeonSegments(cols))
    }
    const { segments, glowCells } = this._neon
    if (!this._neonOff) this._neonOff = new Map()
    const A = this._au

    if (Math.random() < NEON_FLICKER_PROB * segments.length) {
      const i = Math.floor(Math.random() * segments.length)
      this._neonOff.set(i, t + NEON_FLICKER_MIN + Math.random() * (NEON_FLICKER_MAX - NEON_FLICKER_MIN))
    }
    if (A && A.onset && A.bass > 0.3) {
      const n = Math.min(segments.length, NEON_BUZZ_BASE + Math.floor(A.bass * NEON_BUZZ_SCALE))
      for (let k = 0; k < n; k++) {
        const i = Math.floor(Math.random() * segments.length)
        this._neonOff.set(i, t + NEON_BUZZ_MIN_DUR + Math.random() * (NEON_BUZZ_MAX_DUR - NEON_BUZZ_MIN_DUR))
      }
    }

    const isOn = (i) => {
      const off = this._neonOff.get(i)
      return off === undefined || t >= off
    }

    // Glow halo first -- lit segments are drawn on top of it below, so a
    // cell that's both a glow neighbour and (via a different letter's
    // overhang) something else always ends up showing the brighter one.
    for (const g of glowCells) {
      let hot = false
      for (const idx of g.litIdxs) if (isOn(idx)) { hot = true; break }
      if (hot) term.put(g.x, g.y, '·', DIM)
    }
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      if (!isOn(i)) continue
      const bright = A && A.level > 0.55
      term.put(seg.x, seg.y, '█', bright ? BRIGHT : NORMAL)
    }
  },
  // BUBBLE TUBES (61st pass, MIDNIGHT NEON) -- replaces NEON SIGN; see
  // VISUAL_METHODS' note above bubbletubes for the full brief. Nine tubes
  // span the full width, one per real spectrum band off A.bands9 (the same
  // 9-band tap CIPHER's drawBreachEffect reads), each filled from the base
  // up like a VU bar -- an honest readout, not a texture. A low idle floor
  // (JUKE_IDLE_FILL) keeps every tube visibly lit even with no signal, same
  // "hardware stays on" contract NEON SIGN's ambient flicker used.
  // 62nd pass -- dropped the bubble pool entirely, keeping just the
  // thicker bars; the tubes
  // are the whole picture now. Also falls back to syntheticAudio(t) when
  // there's no real tap (see its own note near auMul), so a station with
  // no signal still shows tubes breathing and occasionally kicking instead
  // of sitting dead at the idle floor.
  drawBubbleTubesEffect(s, t) {
    const { term } = s
    const cols = term.cols
    for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < cols; x++) term.put(x, y, ' ')
    const A = this.muted ? SILENT_AUDIO : (this._au || syntheticAudio(t))

    const fieldTop = 1, fieldBot = VIZ_BOT - 1
    const fieldH = fieldBot - fieldTop + 1
    const n = JUKE_TUBES
    const spacing = cols / n
    for (let i = 0; i < n; i++) {
      const cx = spacing * i + spacing / 2
      const w = Math.max(2, Math.round(spacing * 0.5))
      const x0 = Math.round(cx - w / 2)
      const x1 = Math.min(cols - 1, x0 + w - 1)
      const level = Math.max(0, Math.min(1, A.bands9[i]))
      const fill = JUKE_IDLE_FILL + level * (1 - JUKE_IDLE_FILL)
      const litRows = Math.max(1, Math.round(fill * fieldH))
      for (let r = 0; r < fieldH; r++) {
        const y = fieldBot - r
        if (r >= litRows) {
          if (w >= 3) { term.put(x0, y, '|', FAINT); term.put(x1, y, '|', FAINT) }
          continue
        }
        // 61st pass, live QA fix: the original 3-tier fade (0.3 + heat*0.7
        // through visualizerLevelAttr) put most of a tall column's upper
        // rows into FAINT/DIM, which the CRT's bloom/threshold curve
        // renders as functionally invisible -- a loud band's tube looked
        // just as short as a quiet one on screen even though the character
        // buffer was correct (confirmed by reading term.chars directly).
        // Two-tier instead: bright near the base, normal above -- both
        // tiers stay clearly visible, so tube HEIGHT is what reads as
        // loudness, not a gradient that fades out of visibility.
        const heat = 1 - r / litRows
        const ch = heat > 0.5 ? '█' : '▓'
        const attr = heat > 0.5 ? BRIGHT : NORMAL
        for (let x = x0; x <= x1; x++) term.put(x, y, ch, attr)
      }
    }
  },
  // ISOTOPE MAP (52nd pass, ATOMIC) -- replaces GEIGER; see VISUAL_METHODS'
  // note above and the "2. ISOTOPE MAP" panel in atomic-concepts.html,
  // which this ports faithfully: every cell on the grid flickers on its
  // own independent sine cycle (its own phase and frequency), and hotter
  // regions drift across the field in lissajous paths, brightening
  // whatever they currently sit over. No needle, no gauge, no scripted
  // event -- "a field of sources" rather than a single detector, which
  // suits an atomic-age station better than one instrument does. Started
  // as a single source; same pass, expanded to fill the
  // screen -- now ISOTOPE_SOURCES.length independent ones (see that
  // constant), each cell taking the max heat across all of them so
  // overlapping sources don't blow out to solid white noise.
  // Fully stateless like OUTRUN's roadside texture: each cell's phase/freq
  // come from hash2(x,y) recomputed every frame rather than a stored
  // per-cell buffer, so there's no persistent state to reset on re-entry
  // and nothing here can hit the FLAME-class re-entry-freeze bug (see
  // Design Notes) -- the whole effect is a pure function of (x, y, t).
  drawIsotopeEffect(s, t) {
    const { term } = s
    const cols = term.cols
    const cy = (1 + VIZ_BOT) / 2
    // Each source roams a slow lissajous loop, kept clear of the edges by
    // a margin so its glow never clips against the frame. dy is weighted
    // 2.1x the same way DRIFT's radial term is, since a character cell
    // reads roughly twice as tall as it is wide -- without that weighting
    // the "hot region" would look like a flattened horizontal smear
    // instead of a roughly round glow.
    const ampX = Math.max(6, cols / 2 - 12)
    const ampY = Math.max(3, (VIZ_BOT - 1) / 2 - 5)
    // 2026-08-23 (live audio tap) -- the sources run hotter with the band
    // (glow radius follows level) and a transient blinks the whole
    // background flicker field up ~a tier for the pulse window: a click
    // registering across the field. Note this stays exactly as re-entry-
    // safe as before: nothing is stored -- the effect is now a pure
    // function of (x, y, t, this-frame's bus reading), which preserves the
    // property the statelessness note above actually cares about.
    const A = this._au
    const rMul = auMul(A, A ? A.level : 0, 0.7, 1.3)
    const click = A ? A.pulse * 0.1 : 0
    const sources = ISOTOPE_SOURCES.map((src) => ({
      hx: cols / 2 + Math.sin(t * src.fx + src.ph) * ampX * src.amp,
      hy: cy + Math.cos(t * src.fy + src.ph) * ampY * src.amp,
    }))
    // 57th pass -- Half-Life Ring. A strong bass onset spawns a ring at a
    // random source's current position (reads as that source "going
    // critical"); the ring then just carries its own fixed spawn position
    // and time, independent of the sources' ongoing roam.
    if (A && A.onset && A.bass > 0.45) {
      const src = sources[Math.floor(Math.random() * sources.length)]
      this._isotopeRings.push({ x: src.hx, y: src.hy, spawnT: t })
      if (this._isotopeRings.length > ISOTOPE_RING_MAX) this._isotopeRings.shift()
    }
    this._isotopeRings = this._isotopeRings.filter((r) => t - r.spawnT < ISOTOPE_RING_LIFE)
    for (let y = 1; y < VIZ_BOT; y++) {
      for (let x = 0; x < cols; x++) {
        let heat = 0
        for (const src of sources) {
          const dx = x - src.hx, dy = (y - src.hy) * 2.1
          const d = Math.sqrt(dx * dx + dy * dy)
          const sh = Math.max(0, 1 - d / (9 * rMul))
          if (sh > heat) heat = sh
        }
        let ring = 0
        for (const r of this._isotopeRings) {
          const age = t - r.spawnT
          const radius = age * ISOTOPE_RING_SPEED
          const dx = x - r.x, dy = (y - r.y) * 2.1
          const dist = Math.sqrt(dx * dx + dy * dy)
          const band = Math.max(0, 1 - Math.abs(dist - radius) / 1.4)
          const decay = Math.pow(0.5, age / ISOTOPE_RING_HALF_LIFE)
          if (band * decay > ring) ring = band * decay
        }
        const phase = hash2(x, y) * Math.PI * 2
        const freq = 0.6 + hash2(y, x) * 2.2   // args swapped from phase's hash to decorrelate
        const base = 0.5 + 0.5 * Math.sin(t * freq + phase)
        const v = Math.max(base * (0.12 + click + heat * 0.88), ring * 0.9)
        if (v < 0.1) { term.put(x, y, ' '); continue }
        const ch = ring > 0.5 ? 'O' : v > 0.85 ? '▓' : v > 0.6 ? '▒' : v > 0.4 ? '+' : v > 0.22 ? ':' : '·'
        term.put(x, y, ch, visualizerLevelAttr(v))
      }
    }
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
    // 2026-08-23 (live audio tap) -- originally the ONE deliberately subtle
    // mapping on the roster: only the radial ripple's AMPLITUDE bred with
    // overall loudness. 57th pass -- keeps this exact effect but makes it
    // react more/actually to the audio, widening that to all four terms,
    // each tied to its own band so the field genuinely tracks the mix
    // rather than swelling as one blob -- but every mapping still only
    // touches AMPLITUDE, never a `t *` frequency (which would teleport the
    // whole field), and there's still no onset hook or bloom pulse: this
    // station stays ambient, nothing about it thumps.
    const A = this._au
    const hSwell = auMul(A, A ? A.bass : 0, 0.75, 1.3)
    const vSwell = auMul(A, A ? A.mid : 0, 0.75, 1.3)
    const dSwell = auMul(A, A ? A.treble : 0, 0.7, 1.4)
    const swell = auMul(A, A ? A.level : 0, 0.7, 1.3)
    for (let y = 1; y < VIZ_BOT; y++) {
      for (let x = 0; x < term.cols; x++) {
        let v = Math.sin(x * 0.16 + t * 0.7) * hSwell
        v += Math.sin(y * 0.32 - t * 0.5) * vSwell
        v += Math.sin((x + y) * 0.11 + t * 0.35) * dSwell
        const dx = x - cx, dy = (y - cy) * 2.1
        v += Math.sin(Math.sqrt(dx * dx + dy * dy) * 0.28 - t * 0.9) * swell
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
  // 57th pass, 2nd rewrite -- no activity if there
  // is no audio, flames should react more, and the treble
  // overlay is unneeded. Dropped the Feedback Stack overlay entirely -- back to just
  // the flame. With no live tap the physics step no longer runs at all
  // (previously `fuel` defaulted to a neutral 1 and the fire kept burning
  // on its own regardless of audio); now no tap means no simulation step,
  // rendered as a cold, motionless ember bed. With a tap, fuel's range and
  // the pulse/onset kick are both widened well past the old "modulate a
  // baseline" numbers so the flame visibly flares and dies down with the
  // track instead of just breathing a little.
  drawFlameEffect(s, t) {
    const { term } = s
    const cols = term.cols
    const floorY = VIZ_BOT - 1
    const heat = this._fireHeat
    // 62nd pass -- was a low, unmoving ember bed along the floor,
    // no step, no randomness with no tap. Found during live QA to read as
    // broken rather than atmospheric when a real tap isn't available,
    // so hard silence rules were relaxed in favor of a seamless fallback.
    // Falls back to syntheticAudio(t) now (see its own note near
    // auMul) -- the physics step below is unchanged, it just always has a
    // signal to read, so the fire never goes fully cold.
    const A = this.muted ? SILENT_AUDIO : (this._au || syntheticAudio(t))
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
    // 50th pass: the effect clock rewinds to 0 on every visualizer entry
    // (see enterVisualizer's note), so a step time left over from a previous
    // visit sits in the future and gates this simulation off entirely.
    // enterVisualizer resets it, but this effect shouldn't depend on a
    // caller remembering to -- a clock that went backwards means "new
    // session", so re-arm rather than wait it out.
    if (t < this._fireLastStep) this._fireLastStep = 0
    if (t - this._fireLastStep >= 0.13) {
      this._fireLastStep = t
      // 57th pass -- fuel's range widened (0.55..1.45 -> 0.4..2.3) and the
      // pulse kick raised (0.35 -> 0.55) so quiet stretches genuinely bank
      // the fire down and loud ones blow it out taller, not just flicker
      // brighter. A real onset also slams the floor toward full heat for
      // one step -- a visible flare on the hit, not just a warmer glow.
      const fuel = auMul(A, A.bass, 0.4, 2.3)
      for (let x = 0; x < cols; x++) {
        const target = Math.min(1, (Math.random() < 0.12 ? Math.random() * 0.3 : 0.75 + Math.random() * 0.25) * fuel)
        const prev = heat[floorY * cols + x]
        let seed = prev * 0.6 + target * 0.4
        seed = Math.min(1, seed + A.pulse * 0.55 + (A.onset ? 0.4 : 0))
        heat[floorY * cols + x] = seed
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
  // 57th pass, 2nd rewrite -- Decrypt Sweep, rebuilt from scratch so
  // there is no activity if there is no audio. The old version
  // scrolled the rain on raw `t * col.speed` regardless of the tap -- audio
  // only ever nudged an already-running animation, which read as "always
  // on" rather than reactive. This version has NO idle motion at all: with
  // no live tap, the whole column state is frozen and the screen renders a
  // dim, motionless hex texture -- CIPHER waiting for a signal, not looping
  // a canned decrypt. Only a live tap advances anything: each column's
  // `head` (rows scrolled) only increments while A exists, driven by its own
  // band's energy (`A.bands9[x % 9]`, widened from 6 bands the same 58th
  // pass that widened the EQ ribbon), so quiet bands crawl and loud ones
  // race. Word-resolves and the ambient schedule are likewise gated on A --
  // no tap, no resolves, ever.
  // 62nd pass -- was a faint, unmoving hex
  // texture with no resolves without a tap. Found during live QA to read
  // as broken rather than atmospheric when a real tap isn't available, so
  // hard silence rules were relaxed in favor of a seamless fallback. Falls back
  // to syntheticAudio(t) now (see its own note near auMul) -- the scroll/
  // resolve logic below is unchanged, it just always has a signal to read.
  drawBreachEffect(s, t) {
    const { term } = s
    const A = this.muted ? SILENT_AUDIO : (this._au || syntheticAudio(t))
    if (t < this._breachLastT) this._breachLastT = t
    const bdt = Math.min(0.1, Math.max(0, t - this._breachLastT))
    this._breachLastT = t
    // 65th pass -- CIPHER needed to feel more reactive: surge (the
    // whole-screen brightness pulse) widened 0.6 -> 1.1, scroll-speed's
    // band range widened 0.7-2.6 -> 0.5-3.2 so quiet vs loud bands read
    // as clearly different speeds, a per-column brightness term now leans
    // on that same column's band value (a hot band reads hot, not just
    // fast), and the glitch-word trigger chance on a peak doubled so peaks
    // visibly do something more often.
    const surge = 1 + A.pulse * 1.1
    for (let x = 0; x < term.cols; x++) {
      const col = this._breachCols[x]
      const band = A.bands9[x % 9]
      const bandMul = auMul(A, band, 0.5, 3.2)
      col.head = (col.head + bdt * col.speed * bandMul) % 30
      if (col.resolveAt < 0) col.resolveAt = t + 2 + Math.random() * 5
      if (A.pulse > 0.6 && !col.word && Math.random() < 0.06) col.resolveAt = t
      if (t > col.resolveAt && !col.word) {
        col.word = BREACH_WORDS[Math.floor(Math.random() * BREACH_WORDS.length)]
        col.wordRow = 2 + Math.floor(Math.random() * 18)
        col.wordUntil = t + 0.5 + Math.random() * 0.4
        col.resolveAt = t + 2 + Math.random() * 5
      }
      if (col.word && t > col.wordUntil) col.word = null
      const headY = col.head - 4
      const bandGlow = auMul(A, band, 0.6, 1.4)
      for (let y = 1; y < VIZ_BOT; y++) {
        const dist = headY - y
        if (dist < 0 || dist > 14) { term.put(x, y, ' '); continue }
        const alpha = Math.max(0, 1 - dist / 14)
        const ch = BREACH_HEX[Math.floor((x * 7 + y * 3 + t * 20) % BREACH_HEX.length)]
        term.put(x, y, ch, visualizerLevelAttr(Math.min(1, alpha * surge * bandGlow)))
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
    // 2026-08-23 (live audio tap) -- the car drives at the music's
    // intensity. The rungs/grass/palms all used to scroll on a shared
    // `t * 0.6`; that becomes this._outrunPhase, integrated per frame at a
    // level-scaled rate (neutral rate exactly 0.6/s, so with no tap the
    // drive is byte-identical). An accumulator rather than scaling `t`
    // directly, or every loudness change would teleport the whole road.
    // Deliberately NO onset hook anywhere here -- the 44th-pass note below
    // calls this the slowest, most hypnotic effect on purpose, and a
    // per-beat flash would strobe it; tempo shows as road speed instead,
    // plus the sun's glow leaning on the bass.
    // 65th pass -- CIRCUIT CRUSH needed to feel more reactive without
    // losing the hypnotic pacing: road-speed range widened 0.5-1.5 ->
    // 0.3-2.2 (quiet passages coast noticeably slower, loud ones surge
    // rather than just nudging the needle), and the sun's bass lean
    // widened below. Still no onset hook anywhere in this effect -- a
    // per-beat flash would strobe it, tempo stays expressed as road speed
    // and sun glow only.
    const A = this._au
    if (t < this._outrunPhaseT) this._outrunPhaseT = t
    this._outrunPhase += Math.min(0.1, t - this._outrunPhaseT) * 0.6 * auMul(A, A ? A.level : 0, 0.3, 2.2)
    this._outrunPhaseT = t
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
    // (tap) heavy bass leans the sun's core toward '█', quiet cools it --
    // centered on mid-bass so the neutral pulse is exactly what it was.
    const pulse = Math.min(1, 0.75 + 0.25 * Math.sin(t * 0.5) + (A ? (A.bass - 0.5) * 0.4 : 0))
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
    // 57th pass, 2nd rewrite -- Tachometer Sync moved off the sky (see the
    // end of this function) down onto the dash itself, and made always-on
    // -- always present, just at a different metered level.
    // Horizon: two dim glow rows bleeding above a bright line -- 46th
    // pass, thickened for the same "make elements larger" note.
    for (let x = 0; x < term.cols; x++) {
      term.put(x, horizonY - 2, '‾', FAINT)
      term.put(x, horizonY - 1, '‾', DIM)
      term.put(x, horizonY, '=', BRIGHT)
    }
    // City skyline -- adds a city skyline alongside the palm trees below,
    // a dim,
    // deterministic silhouette sitting right against the horizon glow rows
    // just drawn above, giving the birds/stars something to fly in front
    // of and the drive an actual destination.
    //
    // First cut rolled a height independently per COLUMN, which reads as
    // static, not buildings -- with no correlation between neighbours,
    // every column is its own coin flip, so adjacent columns disagree
    // constantly and the silhouette comes out as solid noise rather than
    // shapes. It also covered close to half the row, which under the CRT's
    // bloom pass reads as a single glowing band rather than individual
    // dim buildings. Walking in strides (2-4 cols of gap, then a 1-2-col
    // building) fixes both: neighbouring columns now agree because they
    // belong to the same building, and the strides guarantee real gaps of
    // bare horizon between them. Heights capped at 2 -- this is a distant
    // hint of a skyline, not competing with the sun or the birds crossing
    // in front of it. Skipped across the sun's own width throughout.
    for (let x = 0; x < term.cols; ) {
      const stride = 2 + Math.floor(hash2(x, 511) * 3)
      const build = hash2(x, 512) > 0.4
      if (!build) { x += stride + 1; continue }
      const w = 1 + Math.floor(hash2(x, 513) * 2)
      const h = 1 + Math.floor(hash2(x, 514) * 2)
      let litWx = -1, litWy = -1
      for (let dx = 0; dx < w; dx++) {
        const bx = x + dx
        if (bx >= term.cols || Math.abs(bx - cx) < sunR + 1) continue
        for (let k = 0; k < h; k++) {
          const by = horizonY - 2 - k
          if (by < 1) break
          term.put(bx, by, '█', FAINT)
        }
        if (litWx < 0 && hash2(bx, 515) > 0.5) { litWx = bx; litWy = horizonY - 2 - Math.floor(hash2(bx, 516) * h) }
      }
      // One slow-flickering lit window per lucky building.
      if (litWx >= 0 && litWy >= 1 && hash2(x, Math.floor(t * 0.4)) > 0.5) term.put(litWx, litWy, '.', NORMAL)
      x += w + stride
    }
    // Grid: rungs/rails brighten and thicken with proximity to the viewer.
    // Coefficient tuned twice now for "too much white space" -- 0.09
    // originally, 0.2 in the 45th pass, 0.28 here in the 46th so the grid
    // reaches full width well before the bottom row instead of just
    // grazing it, leaving more of the lower screen genuinely filled.
    for (let y = horizonY + 1; y < VIZ_BOT; y++) {
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
      const rungPos = (depth + this._outrunPhase * 8) % 6
      const showRung = rungPos < 1
      const rungAttr = visualizerLevelAttr(Math.max(0.15, 0.5 + proximity * 0.5))
      const rungCh = proximity > 0.6 ? '=' : '-'
      // Roadside terrain -- 47th pass, live QA: "build out the land/grass
      // on either side of the road ... less empty space." Scrolls toward
      // the viewer at the same rate as the rungs so it reads as ground
      // rushing past rather than a static hatch fill; density and
      // brightness both grow with proximity so the nearest ground is the
      // most filled-in, matching the grid itself.
      const scrollRow = Math.floor(y + this._outrunPhase * 8 * 0.5)
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
    // Palm trees -- adds palm trees alongside the city skyline above. Four fixed
    // roadside slots (OUTRUN_PALM_RAILS), each looping a tree from just past
    // the horizon to the bottom row and back, using the exact same
    // depth->screen-position math as the rails above (cx + rail*depth*1.7)
    // so a tree's position always tracks the road it's supposedly planted
    // beside instead of drifting independently of the perspective. No
    // persistent state needed -- position is a pure function of t, same
    // approach as the sun's pulse and the grid's scroll.
    for (let i = 0; i < OUTRUN_PALM_RAILS.length; i++) {
      const rail = OUTRUN_PALM_RAILS[i]
      const cycle = 3.4
      const phase = (this._outrunPhase + i * 0.85) % cycle
      const depth = 1 + (phase / cycle) * 13
      const x = Math.round(cx + rail * depth * 1.7)
      if (x < 0 || x >= term.cols) continue
      const baseY = Math.round(horizonY + depth)
      if (baseY <= horizonY || baseY >= VIZ_BOT) continue
      const scale = Math.max(1, Math.round(1 + depth / 3.5))
      const bright = Math.min(1, 0.25 + (depth / 13) * 0.75)
      const attr = visualizerLevelAttr(bright)
      for (let k = 0; k < scale; k++) {
        const py = baseY - k
        if (py > horizonY && py < VIZ_BOT) term.put(x, py, '|', attr)
      }
      const topY = Math.max(horizonY + 1, baseY - scale)
      if (x - 1 >= 0) term.put(x - 1, topY, '\\', attr)
      if (x + 1 < term.cols) term.put(x + 1, topY, '/', attr)
      term.put(x, topY, '*', attr)
    }
    // 57th pass, 4th rewrite -- Tachometer Sync removed entirely, dropping
    // the RPM gauge from CIRCUIT CRUSH. this._outrunRedline is left
    // as harmless dead state (still initialized in init/reset) rather than
    // torn out, matching the codebase's convention for orphaned fields.
  },
  // RIPPLE effect (45th pass) -- for CITY LIGHTS. Raindrops on a Tokyo
  // night: a handful of fixed drop points, each expanding a ring band
  // outward and fading over RIPPLE_MAXAGE seconds before respawning
  // elsewhere on a stagger, over a faint constant neon shimmer so the
  // frame never reads as fully empty between drops.
  drawRippleEffect(s, t) {
    const { term } = s
    const A = this._au
    for (const r of this._ripples) {
      if (t - r.startT > RIPPLE_MAXAGE) {
        r.x = Math.random() * term.cols
        r.y = 1 + Math.random() * 21
        r.startT = t + Math.random() * 0.6
        r.amp = 1
      }
    }
    // 2026-08-23 (live audio tap) -- rain falls with the groove: a real
    // beat drops a raindrop NOW, sized by the bass under it (heavy rain in
    // the chorus, drizzle in the verse). Only a ring already past half its
    // life is eligible to be conscripted, which is the throttle: busy
    // passages naturally deplete the pool, so density self-limits, and the
    // ambient staggered respawns above continue exactly as today.
    if (A && A.onset) {
      let oldest = null
      for (const r of this._ripples) {
        if (t - r.startT > RIPPLE_MAXAGE * 0.45 && (!oldest || r.startT < oldest.startT)) oldest = r
      }
      if (oldest) {
        oldest.x = Math.random() * term.cols
        oldest.y = 1 + Math.random() * 21
        oldest.startT = t
        oldest.amp = 1 + 0.4 * A.bass   // was 0.75 base -- could read DIMMER than an ambient ring
      }
    }
    // 57th pass, 3rd rewrite -- safety net added because puddles/ripples
    // didn't always seem to show. With 11 staggered slots there's no hard
    // guarantee at least one is currently young/bright -- bad luck in the
    // stagger could leave every ring past its fresh half at once, which
    // reads as "nothing happening" even though the system is technically
    // still running. Force a fresh ripple whenever that happens so the
    // screen is never more than half a ring's life away from a visible one.
    {
      let youngestAge = Infinity
      for (const r of this._ripples) {
        const age = t - r.startT
        if (age >= 0 && age < youngestAge) youngestAge = age
      }
      if (youngestAge > RIPPLE_MAXAGE * 0.5) {
        const r = this._ripples[Math.floor(Math.random() * this._ripples.length)]
        r.x = Math.random() * term.cols
        r.y = 1 + Math.random() * 21
        r.startT = t
        r.amp = 1
      }
    }
    // Neon floor glitters with the highs -- treble only, gentle range.
    const glitter = auMul(A, A ? A.treble : 0, 0.75, 1.25)
    for (let y = 1; y < VIZ_BOT; y++) {
      for (let x = 0; x < term.cols; x++) {
        let v = 0
        for (const r of this._ripples) {
          const age = t - r.startT
          if (age < 0 || age > RIPPLE_MAXAGE) continue
          const dx = x - r.x, dy = (y - r.y) * 2.0
          const dist = Math.sqrt(dx * dx + dy * dy)
          const radius = age * RIPPLE_SPEED
          const ringDist = Math.abs(dist - radius)
          // (tap) beat-conscripted rings carry their own amplitude; rings
          // from before the field existed read as 1 via the fallback.
          // Band widened 2.2 -> 2.8 because puddles/ripples didn't always
          // seem to show -- a thin ring is easy to miss between frames
          // on the terminal grid; a chunkier one reads unmistakably.
          if (ringDist < 2.8) v = Math.max(v, (1 - ringDist / 2.8) * (1 - age / RIPPLE_MAXAGE) * (r.amp || 1))
        }
        // 45th pass: neon floor and ring width both boosted -- live QA
        // found the effect nearly invisible at the old 0.05-0.09 range,
        // which mostly rendered FAINT/DIM and washed out under CITY
        // LIGHTS' own bloomAmt 1.8, the heaviest on the roster.
        const neon = (0.12 + 0.07 * Math.sin(x * 0.5 + t * 0.8 + y * 0.2)) * glitter
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
  // unassigned (was ATOMIC) -- see VISUAL_METHODS' note.
  drawCounterEffect2(s, t) {
    const { term } = s
    for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < term.cols; x++) term.put(x, y, ' ')
    for (const c of this._clouds) {
      const span = term.cols + c.shape.w + 10
      const x0 = ((c.baseX + t * c.speed) % span + span) % span - c.shape.w - 5
      for (const cell of c.shape.cells) {
        const px = Math.round(x0 + cell.dx)
        const py = c.y + cell.dy
        if (px < 0 || px >= term.cols || py < 1 || py >= VIZ_BOT) continue
        const v = cell.shade === 'light' ? 0.85 : 0.5
        const ch = cell.shade === 'light' ? '█' : '▓'
        term.put(px, py, ch, visualizerLevelAttr(v))
      }
    }
  },
  // 57th pass, 3rd rewrite -- Flow Field, MOMENTUM's visual rebuilt from
  // scratch, chasing a scene that reacts to the music -- just a fun
  // visual, doesn't
  // have to be on theme"). Drops the crane-skyline concept and its Focus
  // Pulse HUD entirely -- this is a wind/current map instead: every cell
  // carries a direction (a slowly drifting angle field) and a magnitude (a
  // traveling wave riding that direction), rendered as a short streak
  // glyph so the whole screen reads as flowing current lines rather than a
  // static texture. Fully stateless, same reasoning as ISOTOPE/OUTRUN's
  // roadside texture -- a pure function of (x, y, t, this frame's bus
  // reading), nothing to reset on re-entry. No tap: the field still flows
  // (this one keeps its baseline motion, deliberately -- a wind map
  // standing dead still doesn't read as "idle," it reads as broken), just
  // slow and calm; a live tap speeds it up, roughens it, and clumps it
  // into streaks that thin out to nothing between hits.
  // 59th pass -- unassigned (was MOMENTUM). See VISUAL_METHODS' note on
  // 'skyline'/'flowfield' -- towers are back on MOMENTUM, kept here as the
  // steady flowing-field alternative in case a future pass wants it again.
  drawFlowFieldEffect(s, t) {
    const { term } = s
    const cols = term.cols
    const A = this._au
    const speed = auMul(A, A ? A.level : 0, 0.5, 1.9)
    const chaos = auMul(A, A ? A.treble : 0, 0.6, 2.4)
    const swirl = auMul(A, A ? A.mid : 0, 0.7, 1.6)
    const pulse = A ? A.pulse : 0
    for (let y = 1; y < VIZ_BOT; y++) {
      for (let x = 0; x < cols; x++) {
        const nx = x * 0.09, ny = y * 0.17
        // The direction field: where the current points at this cell,
        // itself drifting slowly over time.
        const angle = Math.sin(nx * 1.3 + t * 0.12 * speed) * 1.7
          + Math.cos(ny * swirl - t * 0.09 * speed) * 1.4
        // A wave traveling along that direction is what actually reads as
        // FLOWING rather than a fixed direction map.
        const wave = Math.sin(nx * 2.2 * chaos + ny * 1.6 + angle * 1.3 - t * 1.1 * speed)
        let mag = (wave + 1) / 2
        mag = Math.max(0, mag - 0.42) / 0.58   // threshold -> streaks over black, not wallpaper
        mag = Math.min(1, mag + pulse * 0.3)
        if (mag < 0.05) { term.put(x, y, ' '); continue }
        const dir = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
        const gi = Math.floor((dir / (Math.PI * 2)) * FLOW_GLYPHS.length) % FLOW_GLYPHS.length
        term.put(x, y, FLOW_GLYPHS[gi], visualizerLevelAttr(mag))
      }
    }
  },
  // 59th pass -- SKYLINE, REBUILT because MOMENTUM wasn't obviously
  // reacting to the music. Rebuilt from the ground up to be impressive,
  // shifting" like FLAME/RIPPLE). Full history in VISUAL_METHODS' note on
  // 'skyline'/'flowfield' above drawFlowFieldEffect. This is the towers
  // concept, done for real this time: 13 towers (makeSkylineTowers()) span
  // the width, and a real bass onset visibly adds one or two floors to a
  // tower -- a discrete, legible event, not a continuous parameter warp.
  // The newest floor and the tower's own top-out celebration both get a
  // bright flash; a quiet construction spark rides just above a tower
  // while its flash is live. No tap: no growth, ever (same "no activity
  // without audio" contract as FLAME) -- but a slow, audio-independent
  // window-twinkle keeps the skyline visibly alive rather than a dead
  // silhouette, since a real skyline doesn't go dark just because the
  // radio's off. On reaching its own capH, a tower has a 70% chance to
  // raise the ceiling and keep building, 30% to reset short and break
  // ground on a fresh, shorter build -- the "most keep building, some
  // reset short" texture from the original 51st-pass concept.
  drawSkylineEffect(s, t) {
    const { term } = s
    const cols = term.cols
    const floorY = VIZ_BOT - 1
    const top = 1
    const maxH = floorY - top + 1
    const A = this._au
    for (let y = top; y <= floorY; y++) for (let x = 0; x < cols; x++) term.put(x, y, ' ')
    const towers = this._momentumTowers

    // A real bass onset adds a floor to one or two towers below their own
    // cap -- round-robin start point so growth doesn't always favor the
    // same tower when several fire back to back.
    if (A && A.onset) {
      const growCount = 1 + (A.bass > 0.65 ? 1 : 0)
      for (let g = 0; g < growCount; g++) {
        let idx = -1
        for (let k = 0; k < towers.length; k++) {
          const cand = (this._momentumNextTower + k) % towers.length
          if (towers[cand].h < towers[cand].capH) { idx = cand; break }
        }
        this._momentumNextTower = (this._momentumNextTower + 1) % towers.length
        if (idx === -1) continue
        const tw = towers[idx]
        tw.h = Math.min(tw.capH, tw.h + 1 + (A.bass > 0.6 ? 1 : 0))
        tw.flashUntil = t + 0.35
        if (tw.h >= tw.capH) tw.topFlashUntil = t + 0.5
      }
    }

    // A tower whose top-out celebration just finished either keeps
    // building (raise the ceiling) or breaks ground on a fresh, shorter
    // build -- see the header comment for the split.
    for (const tw of towers) {
      if (tw.topFlashUntil && t > tw.topFlashUntil) {
        tw.topFlashUntil = 0
        if (Math.random() < 0.3) {
          tw.h = 1 + Math.floor(Math.random() * 3)
          tw.capH = 6 + Math.floor(Math.random() * 14)
        } else {
          tw.capH = Math.min(maxH, tw.capH + 4 + Math.floor(Math.random() * 6))
        }
      }
    }

    for (const tw of towers) {
      const flashing = t < tw.flashUntil
      const topping = t < tw.topFlashUntil
      for (let f = 0; f < tw.h; f++) {
        const y = floorY - f
        if (y < top) break
        const isTopFloor = f === tw.h - 1
        for (let dx = 0; dx < tw.w; dx++) {
          const x = tw.x + dx
          if (x < 0 || x >= cols) continue
          // Window texture: a slow twinkle independent of audio, so the
          // skyline reads as alive even at dead silence.
          const lit = hash2(x, f) > 0.62
          const twinkle = lit && Math.sin(t * 0.6 + hash2(f, x) * 6.28) > 0.2
          let attr = lit ? (twinkle ? NORMAL : DIM) : MUTED
          if (topping) attr = BRIGHT
          else if (isTopFloor && flashing) attr = BRIGHT
          term.put(x, y, '█', attr)
        }
      }
      // Construction spark riding just above the newest floor while it's
      // still flashing -- a welding-spark beat that reads as "still
      // building" distinct from the tower body itself.
      if (flashing && tw.h < maxH) {
        const sparkY = floorY - tw.h
        if (sparkY >= top) term.put(tw.x + Math.floor(tw.w / 2), sparkY, '+', BRIGHT)
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
  // unassigned (was MOMENTUM) -- see VISUAL_METHODS' note on SKYLINE above.
  drawStackEffect(s, t) {
    const { term } = s
    for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < term.cols; x++) term.put(x, y, ' ')
    const left = 2, spacingX = 4, barW = 3, floor = VIZ_BOT - 2, top = 2, height = floor - top
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
  // 57th pass, 4th rewrite -- BOOM BAP rebuilt from scratch around exactly
  // the design brief: a boom box with sound waves coming out of it
  // and pulsing lights and meters to the music. Dropped the MPC
  // pad-sequencer entirely (it was the extra idea nobody asked for, and
  // likely a chunk of what read as cluttered/"broken" -- a background
  // step-learning system floating above the box that most viewers never
  // parse as anything). Also dropped the busy ambient dust scatter that
  // used to fill dead space -- the box itself is now the whole picture.
  // Three reactive layers, all continuous (spring-toward-target every
  // frame, no per-step jumps): sound-wave rings off the speaker, a pulsing
  // LED strip, and a VU-style meter bank. No tap: everything settles to a
  // low idle read (slow heartbeat ring, single chasing LED, quiet meters)
  // rather than either "dead" or "running the old canned pattern" -- same
  // "always there, different metered level" language as CIRCUIT CRUSH/
  // ATOMIC this pass.
  drawBoomBapEffect(s, t) {
    const { term } = s
    for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < term.cols; x++) term.put(x, y, ' ')
    const cx = term.cols / 2
    const speakerY = VIZ_BOT - 7
    const A = this._au

    // --- sound waves --------------------------------------------------
    // Live: a real onset fires a ring sized by the bass under it. Idle: a
    // slow ~1.6s heartbeat ring at low strength so the box is never fully
    // still, just quiet.
    {
      const lastW = this._boomWaves.length ? this._boomWaves[this._boomWaves.length - 1].startT : -99
      if (A) {
        if (A.onset && t - lastW > 0.1) {
          this._boomWaves.push({ startT: t, strength: 0.55 + 0.45 * Math.min(1, A.bass * 1.4) })
          if (this._boomWaves.length > 8) this._boomWaves.shift()
        }
      } else if (t - lastW > 1.6) {
        this._boomWaves.push({ startT: t, strength: 0.4 })
      }
    }
    for (let i = this._boomWaves.length - 1; i >= 0; i--) {
      if (t - this._boomWaves[i].startT > 1.3) this._boomWaves.splice(i, 1)
    }
    // Crisp expanding rings -- a tight band (1.1 wide, single character)
    // rather than a soft gradient, so a hit reads as a distinct arc.
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

    // --- the cabinet -----------------------------------------------------
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

    // --- meters: VU-style bar bank, top interior row ---------------------
    // Springs toward the live band value every frame -- bass/mid/treble
    // zones left-to-right -- instead of jumping once per sequencer step.
    // Idle: a slow, quiet breathing level per bar so the deck reads as
    // "on, listening" rather than off.
    const eqY = top + 1
    const eqLeft = left + 2
    const eqCount = Math.min(this._boomEq.length, width - 4)
    for (let bi = 0; bi < eqCount; bi++) {
      const bar = this._boomEq[bi]
      if (A) {
        const fr = bi / (eqCount - 1)
        bar.target = Math.min(1, 0.08 + 0.92 * (fr < 0.33 ? A.bass : fr < 0.67 ? A.mid : A.treble))
      } else {
        bar.target = 0.08 + 0.05 * Math.sin(t * 0.7 + bi * 0.4)
      }
      bar.level += (bar.target - bar.level) * 0.25
      const lvl = bar.level
      const ch = lvl > 0.66 ? '█' : lvl > 0.33 ? '▄' : '_'
      term.put(eqLeft + bi, eqY, ch, visualizerLevelAttr(0.4 + lvl * 0.5))
    }

    // --- pulsing LED strip, second interior row ---------------------------
    // Spaced round lights, not a solid bar -- a classic level ladder: more
    // lights fill in as A.level rises, the hot end (last quarter) reads
    // brighter baseline, and a real hit flashes every lit LED BRIGHT for
    // an instant (reusing `flash`, the same decay the drivers use below,
    // so the whole box visibly pulses together on a hit). Idle: one light
    // slowly chasing back and forth, like a standby indicator.
    const ledY = top + 2
    const ledSpan = width - 4
    const ledCount = Math.floor(ledSpan / 2) + 1
    for (let i = 0; i < ledCount; i++) {
      const x = eqLeft + i * 2
      if (x > left + width - 2) break
      const frac = ledCount > 1 ? i / (ledCount - 1) : 0
      let lit, hot
      if (A) {
        lit = A.level > frac * 0.92
        hot = frac > 0.75
      } else {
        const pos = ((Math.sin(t * 0.5) + 1) / 2) * (ledCount - 1)
        lit = Math.abs(i - pos) < 0.7
        hot = false
      }
      const ch = lit ? '●' : '○'
      const attr = !lit ? FAINT : (flash > 0.5 ? BOLD : hot ? BRIGHT : NORMAL)
      term.put(x, ledY, ch, attr)
    }

    // --- twin drivers, concentric rings flashing together on hits --------
    const cyr = speakerY - 1
    for (const dxOff of [-7, 7]) {
      const dxr = Math.round(cx) + dxOff
      term.put(dxr, cyr, flash > 0.5 ? '█' : '▓', visualizerLevelAttr(Math.max(0.5, flash)))
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2
        term.put(Math.round(dxr + Math.cos(ang) * 2), Math.round(cyr + Math.sin(ang) * 1), 'o', visualizerLevelAttr(0.45 + flash * 0.35))
      }
    }

    // --- sidewalk in front of the cabinet, for depth ----------------------
    const vanishX = Math.round(cx)
    for (let y = bottom + 1; y < VIZ_BOT; y++) {
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
    for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < term.cols; x++) term.put(x, y, ' ')
    const tear = this._dreadTear
    // 2026-08-23 (live audio tap) -- industrial: the picture rips on the
    // kick. A hard bass onset forces a full-row tear IN ADDITION TO the
    // ambient random roll below (kept on purpose -- the wrongness must not
    // become metronomic), the panel grid churns with the level, and treble
    // hiss makes the cells fizz. The single-tear state is its own throttle
    // for back-to-back hits. (flashCrtGlitch on extreme hits was considered
    // and left OUT by default -- a whole-screen chroma/roll spike is a
    // taste call left for live QA, and that glyph of meaning currently
    // belongs to real playback errors alone.)
    const A = this._au
    const churn = auMul(A, A ? A.level : 0, 0.55, 1.45)
    const fizz = auMul(A, A ? A.treble : 0, 0.7, 1.5)
    if (!tear.active && A && A.pulse > 0.75 && A.bass > 0.5) {
      tear.active = true
      tear.row = 1 + Math.floor(Math.random() * 20)
      tear.until = t + 0.08 + A.pulse * 0.1
    }
    if (!tear.active && Math.random() < 0.012) {
      tear.active = true
      tear.row = 1 + Math.floor(Math.random() * 20)
      tear.until = t + 0.08 + Math.random() * 0.1
    }
    if (tear.active && t > tear.until) tear.active = false
    if (Math.random() < 0.4 * churn) {
      const idx = Math.floor(Math.random() * this._dreadGrid.length)
      this._dreadGrid[idx] = !this._dreadGrid[idx]
    }
    const top = 2, left = 6
    for (let gy = 0; gy < DREAD_CELLS_Y; gy++) {
      for (let gx = 0; gx < DREAD_CELLS_X; gx++) {
        const on = this._dreadGrid[gy * DREAD_CELLS_X + gx]
        const flicker = Math.random() < 0.06 * fizz
        const ch = on ? (flicker ? '▓' : '█') : (flicker ? '░' : ' ')
        if (!on && !flicker) continue
        const attr = on ? (flicker ? MUTED : BRIGHT) : FAINT
        for (let cy = 0; cy < DREAD_CELL_H - 1; cy++) {
          for (let cx = 0; cx < DREAD_CELL_W - 1; cx++) {
            const py = top + gy * DREAD_CELL_H + cy
            if (py < VIZ_BOT) term.put(left + gx * DREAD_CELL_W + cx, py, ch, attr)
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
    for (let y = 1; y < VIZ_BOT; y++) for (let x = 0; x < term.cols; x++) term.put(x, y, ' ')
    const cx = term.cols / 2, cy = 11.5
    const tc = t % PULSE_CYCLE
    const beatV = pulseBeatEnvelope(tc)
    // 45th pass: live QA said "don't understand or see much" -- the
    // lattice was too sparse (5x3 cell gaps) and too faint (idle floor
    // topped out at FAINT) to register at a glance. Denser grid (3x2
    // gaps), a brighter idle floor, and a clear central pulse core fix
    // that -- the core alone should read the beat even if the lattice
    // itself goes unnoticed.
    for (let gy = 2; gy < VIZ_BOT; gy += 2) {
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
      const y = Math.max(2, Math.min(VIZ_BOT - 2, Math.round(baseRow - off * amp)))
      const spike = Math.abs(off) > 0.5
      term.put(x, y, spike ? '*' : '●', spike ? BRIGHT : NORMAL)
      const shadowY = y + 1
      if (shadowY < VIZ_BOT - 1) term.put(x, shadowY, '·', DIM)
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
    // 65th pass -- activeVisualKey() folds in any [Shift+C] override (see
    // cycleVisualEffect) ahead of the station's own station.visual default;
    // shared with the flash label so what's drawn and what's announced can
    // never disagree.
    const key = this.activeVisualKey()
    // 2026-08-23 (live audio tap) -- the vetted per-frame view every effect
    // reads instead of the raw bus: null unless capture is live AND ungated.
    // Mute, ads, dead air and the headphones-on-mic case all trip the tap's
    // ~1.2s noise gate, flip this to null, and every effect falls back
    // wholesale to its synthetic behavior -- the "never looks broken during
    // silence" requirement, enforced in one place.
    this._au = audioSignalLive() ? AUDIO_BUS : null
    // Uniform downbeat layer: one small bloom breath on strong bass onsets,
    // at most every 1.2s -- a third of the ident's 0.5 pulse, so it reads
    // as the picture breathing with the music, not a strobe. pulseBloom
    // self-clears its shared timer and settles back to the station's own
    // crtBase.bloomAmt, and idents can't contend (a lock always exits the
    // visualizer first). DRIFT MODE is excluded: nothing about that station
    // should thump.
    if (this._au && key !== 'drift' && this._au.onset && this._au.bass > 0.55 &&
        Date.now() - this._auBloomAt > 1200) {
      this._auBloomAt = Date.now()
      pulseBloom(s, 0.16, 110)
    }
    // 2026-08-24 -- checked every frame, not just once at the moment of a
    // skip: right after N, the new track's lookup is still 'pending' (it
    // was just fired by loadTrack()), so a one-shot check at skip time
    // almost always sees 'pending' and never closes. Re-checking here each
    // tick means the instant the lookup actually resolves 'unavailable',
    // this same frame falls back to the effect instead of sitting on a
    // dead-end screen for however long the fetch takes. (QA caught this on
    // the first real skip test -- the original design assumed the skip-time
    // check alone was enough; it wasn't.)
    if (this.lyricsViewOpen && lyricsStateFor(this.currentTrack) === 'unavailable') {
      this.lyricsViewOpen = false
    }
    // [L] takes over the whole effect canvas rather than drawing on top of
    // it: every VISUAL_METHODS entry repaints rows 1..VIZ_BOT-1 in full
    // each tick (that's what makes the footer's writes into those rows
    // safe, see its own comment), so skipping the effect call entirely
    // here is the same contract, not a special case.
    if (this.lyricsViewOpen) this.drawLyricsView(s)
    else this[VISUAL_METHODS[key]](s, (Date.now() - this._vizEnterAt) / 1000)
    // Info footer updates on the same cadence drawPlayback() already uses
    // for the normal progress bar -- plenty for a running clock, and cheap
    // (two 80-wide inverse rows) next to the effect's own per-frame cost.
    if (t - (this._vizLastInfoDraw || 0) > 0.25) {
      this._vizLastInfoDraw = t
      this.drawVisualizerInfo(s)
    }
  },
  // 2026-08-24 -- the [L] lyrics view. Centered teletext-style crawl: the
  // active line bold/bright at the canvas's vertical middle, one line
  // before it dimmed just above, two lines after it faint below. Reads off
  // player.getCurrentTime() directly rather than keeping its own clock --
  // same source drawVisualizerInfo()'s footer timer already trusts.
  drawLyricsView(s) {
    const { term } = s
    for (let y = 1; y < VIZ_BOT; y++) {
      for (let x = 0; x < term.cols; x++) term.put(x, y, ' ')
    }
    const midY = Math.floor((1 + VIZ_BOT) / 2)
    const track = this.currentTrack
    const entry = track ? lyricsCache[track.youtubeId] : null
    if (!entry || entry.state === 'pending') {
      const label = 'TUNING IN LYRICS...'
      term.text(centerX(term.cols, label), midY, label, FAINT)
      return
    }
    if (entry.state !== 'available' || !entry.lines.length) {
      const label = 'NO LYRICS AVAILABLE'
      term.text(centerX(term.cols, label), midY, label, FAINT)
      return
    }
    let cur = 0
    if (this.ready && this.player) { try { cur = this.player.getCurrentTime() } catch (e) {} }
    const lines = entry.lines
    let idx = -1
    for (let i = 0; i < lines.length; i++) { if (lines[i].time <= cur) idx = i; else break }
    const draw = (i, y, attr) => {
      if (i < 0 || i >= lines.length) return
      let text = lines[i].text
      if (text.length > term.cols - 4) text = truncate(text, term.cols - 4)
      term.text(centerX(term.cols, text), y, text, attr)
    }
    draw(idx - 1, midY - 1, FAINT)
    draw(idx, midY, BRIGHT | BOLD)
    draw(idx + 1, midY + 1, DIM)
    draw(idx + 2, midY + 2, FAINT)
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
    // 2026-08-22, round 4 -- same reasoning as onTouchStart's: true for
    // this function's synchronous body (and whatever it calls directly),
    // so loadTrack() knows a fresh mute-for-autoplay it triggers can be
    // unmuted immediately instead of deferred. try/finally clears it on
    // every return path.
    this._inUserGesture = true
    try {
    // 43rd pass -- any key counts as activity for the idle-visualizer
    // clock, whether or not it does anything else below.
    this._lastInputAt = Date.now()
    // 2026-08-22 -- same fix as onTouchStart's: unmuting from the async
    // PLAYING callback isn't a live gesture on the stricter browsers, so
    // flush it here too, on the desktop keyboard path.
    if (this._pendingUnmute && !this.muted && this.ready && this.player) {
      this._pendingUnmute = false
      this.player.unMute()
      this.applyVolume()
    }
    // 2026-08-23 (live audio tap) -- same flush-in-a-real-gesture pattern as
    // _pendingUnmute just above: a browser that gesture-gates getUserMedia
    // gets its deferred mic attempt retried here. No-op everywhere else.
    maybeRetryAudioTapInGesture(this, s)
    // Keypress click (32nd pass; scoped to mapped keys only 2026-08-22,
    // fixing a keypress click firing when command-tabbing between programs,
    // which should not happen) -- the listener sits on window (see
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
    // 50th pass -- added some controls, with one carve-out
    // list. These five keys act IN the visualizer instead of dismissing it,
    // so you can change the tint, skip a track, mute, or ride the volume
    // without dropping back to the main screen and re-entering. The
    // carve-outs are deliberately the controls that don't move you off the
    // station (no seek, no presets, no scan -- those all imply "I want the
    // dial back" and reading them as anything but an exit would be wrong).
    // 64th pass -- only [V], [E], and Escape exit now; every other
    // unmapped key is a no-op instead of closing the visualizer. The
    // footer legend already only ever named [E]XIT, so the visible
    // control surface is unchanged, this just makes the input match it.
    // These call the same methods the main screen does, which also draw
    // their normal chrome (the VOL bar in LEVELS, flashStatus at STATUS_Y)
    // into rows the visualizer is covering. That's safe rather than the
    // classic draw-outside-frame() bug: every effect repaints its whole
    // canvas (rows 1..VIZ_BOT-1) each frame, so those writes are gone on
    // the next tick and never visible. It IS why the flash below exists --
    // that feedback being invisible is exactly the problem it solves.
    if (this.visualizerActive) {
      e.preventDefault()
      const vizFlash = (text) => {
        this._vizFlash = { text, until: Date.now() + 1400 }
        this.drawVisualizerInfo(s)
      }
      switch (e.key) {
        case 'c': case 'C':
          // 65th pass -- Shift+C cycles the effect itself (any built
          // effect, on any station -- see cycleVisualEffect), plain C
          // keeps its original job cycling the CRT tint. Checked on
          // e.shiftKey rather than the key case: e.key is 'C' for both
          // Shift+c and Caps-Lock+c, and a Caps-Lock user's plain [C]
          // press needs to keep doing exactly what it always did.
          if (e.shiftKey) {
            this.cycleVisualEffect(s)
            vizFlash(VISUAL_LABELS[this.activeVisualKey()])
            return
          }
          this.cycleDisplayMode(s)
          vizFlash(DISPLAY_MODES[this.displayModeIndex].label)
          return
        case 'n': case 'N':
          // No flash: the track title and the position bar in the footer
          // both visibly change on their own, which is better feedback
          // than a word would be.
          this.skip(s)
          // 2026-08-24 -- if this skip lands on a track with no lyrics,
          // drawVisualizerFrame's own per-tick check (not this one -- see
          // its comment) is what actually closes the lyrics view once the
          // new track's lookup resolves; nothing extra needed here.
          this.drawVisualizerInfo(s)
          return
        case 'm': case 'M':
          this.toggleMute(s)
          vizFlash(this.muted ? 'MUTED' : 'UNMUTED')
          return
        case 'ArrowUp':
          this.adjustVolume(s, 10)
          vizFlash(`VOL ${this.volume}`)
          return
        case 'ArrowDown':
          this.adjustVolume(s, -10)
          vizFlash(`VOL ${this.volume}`)
          return
        case 'l': case 'L':
          // 2026-08-24 -- silently does nothing (no flash) when lyrics
          // aren't available for the current track, same restraint as [N]
          // above: a key that can't act shouldn't feel like it broke.
          if (lyricsStateFor(this.currentTrack) !== 'available') return
          this.lyricsViewOpen = !this.lyricsViewOpen
          this.drawVisualizerInfo(s)
          return
        case 'v': case 'V':
        case 'e': case 'E':
        case 'Escape':
          this.exitVisualizer(s)
          return
      }
      return
    }
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
      // 29th pass -- play/pause vs. mute-only was reconsidered and
      // play/pause removed. A real broadcast can't be paused, only muted or turned
      // off; play/pause was the one control that broke that fiction, since
      // every other control (mute, power, tuning) respects that the
      // station keeps running whether you're listening or not. `M` (mute)
      // already does the radio-authentic version of "make it stop": it
      // calls player.mute()/unMute(), which silences output without
      // stopping playback underneath -- unmuting resumes wherever the
      // "broadcast" currently is, exactly like turning a real radio's
      // volume back up. togglePlayPause() removed entirely; SPACE is now
      // unbound.
      // 35th pass: Shift+N hidden station-hopping mode removed, since it
      // didn't work as intended -- N is back to a plain single-purpose
      // key, always skipping the dead/current track within the locked
      // station.
      case 'n': case 'N': e.preventDefault(); this.skip(s); break
      case 'ArrowUp': e.preventDefault(); this.adjustVolume(s, 10); break
      case 'ArrowDown': e.preventDefault(); this.adjustVolume(s, -10); break
      case 'm': case 'M': e.preventDefault(); this.toggleMute(s); break
      case 'p': case 'P': e.preventDefault(); this.powerDown(s); break
      // History back (14th pass) -- discovery/history navigation.
      case 'b': case 'B': e.preventDefault(); this.goBack(s); break
      // Guide (15th pass) -- adds a G key for the guide.
      case 'g': case 'G': e.preventDefault(); this.openGuide(s); break
      // Display modes (23rd pass) -- lets users cycle display modes.
      case 'c': case 'C': e.preventDefault(); this.cycleDisplayMode(s); break
      // Visualizer (43rd pass) -- "V" for saVer, the mnemonic
      // still works after the 44th pass rename to "Visualizer" -- manual
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
      // brought the roster back to 9 -- 9 channels is the current max, so
      // `0` is retired and HACKBACK now falls wherever it lands
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
      // 2026-08-22: '0' bound directly to NIN_STATION, not derived from
      // STATION_PRESET_ORDER -- see SECRET_STATIONS' comment for why it's
      // deliberately not part of STATIONS at all.
      case '0': e.preventDefault(); this.presetTune(s, NIN_STATION); break
      // 2026-08-24: Shift+0 (')' e.key on a standard layout) was bound the
      // same way to a second secret station, GREEN HOUSE -- pulled before
      // shipping for now, so this key is
      // unbound again. See SECRET_STATIONS' own comment for the station
      // itself; re-adding this case is the only other step if it returns.
    }
    } finally { this._inUserGesture = false }
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

    // 2026-08-23 (live audio tap) -- refill the signal bus once per rAF,
    // before anything below reads it. After the bail above on purpose: in
    // STANDBY/guide nothing consumes the bus, so nothing samples either
    // (this is also why the capture surviving power cycles costs nothing).
    sampleAudioTap()

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
    // it: the idle/shimmer tear does not stay active during the visualizer.
    if (this.visualizerActive) { this.drawVisualizerFrame(s, t); return }

    // 54th pass -- warm-up drift. this._warmupUntil is set once, on every
    // power-on (see powerUp()'s REVEAL_DELAY beat). Cosmetic only --
    // this._freqJitter is added to the DRAWN freq/dial cursor by
    // drawFreq()/drawDial(), this.freq itself never moves, so real tuning
    // logic (nearestStation, lock matching, the SIG meter) is untouched
    // even if someone starts seeking during the window. No dial on mobile,
    // nothing to wobble there.
    if (!this.mobile && this._warmupUntil) {
      const remain = this._warmupUntil - Date.now()
      if (remain > 0) {
        // Amplitude decays linearly to 0 across the window -- an oscillator
        // finding its lock, not a steady shimmer. Redrawn at the same cadence
        // as the VU/antenna just below rather than every frame; cheap, and a
        // wobble faster than that reads as glitchy rather than "settling."
        const amp = 0.15 * (remain / WARMUP_MS)
        this._freqJitter = Math.sin(Date.now() / 90) * amp
        if (t - (this._lastWarmupDraw || 0) > 0.08) {
          this._lastWarmupDraw = t
          this.drawFreq(s)
          this.drawDial(s)
        }
      } else {
        this._warmupUntil = null
        this._freqJitter = 0
        this.drawFreq(s)
        this.drawDial(s)
      }
    }

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
      // 58th pass -- the tri-band BASS/MID/TREBLE meter shares the VU's
      // redraw cadence too, same reasoning as the antenna glyph below: it
      // needs to track the live audio tap continuously, not just on
      // discrete redraw events.
      this.drawEqRibbonLeft(s)
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
    // 50th pass: the interval is now per-station -- STATIONS[].idleEvent
    // ({minS, maxS}, optional) overrides the roster default of 90-210s.
    // Built for the secret NIN station ("make the station itself cause
    // more glitches and effects overall while tuned"), which runs at
    // 12-30s; any future station can opt into its own cadence the same
    // way. Read off lockedStation at scheduling time, so locking/leaving
    // a glitchy station picks its rate up on the next cycle.
    const idleEv = (this.mode === 'locked' && this.lockedStation && this.lockedStation.idleEvent) || { minS: 90, maxS: 210 }
    // Pull a pending schedule in when it's further out than the active
    // station's own ceiling -- otherwise locking a fast-cadence station
    // mid-cycle would sit through the remainder of a 90-210s roster-default
    // wait before its 12-30s rate ever took effect.
    if (this._nextIdleEventAt && this._nextIdleEventAt > t + idleEv.maxS) {
      this._nextIdleEventAt = t + idleEv.minS + Math.random() * (idleEv.maxS - idleEv.minS)
    }
    if (!this._nextIdleEventAt) {
      this._nextIdleEventAt = t + idleEv.minS + Math.random() * (idleEv.maxS - idleEv.minS)
    } else if (t > this._nextIdleEventAt) {
      this._nextIdleEventAt = t + idleEv.minS + Math.random() * (idleEv.maxS - idleEv.minS)
      // 49th pass (0.9 QA pass): crtIdleEvent's roll/tear scramble writes
      // to BOX_BOTTOM_ROWS, which are desktop row numbers -- the same trap
      // the idle shimmer below already guards against with its own
      // `!this.mobile` check (see that comment: one of these rows lands on
      // NOW PLAYING's artist text on mobile's shorter grid). The shimmer
      // got the guard, this sibling effect never did. Gate it the same way
      // rather than let a "rare surprise" occasionally scribble into
      // mobile's compact chrome.
      if (this.mode === 'locked' && !this.mobile) this.crtIdleEvent(s)
    }

    // 50th pass -- the "grind" layer (see STATIONS[].grind: {minS, maxS},
    // optional; only the secret NIN station sets it). Smaller and far more
    // frequent than crtIdleEvent's roll/tear: quick chroma/roll/snow
    // stabs and the occasional full flashCrtGlitch(), so a station that
    // sets this never sits still -- the signal reads as actively fighting
    // the receiver. CRT params only, deliberately: no text-grid writes, so
    // there is nothing here that can stomp drawn cells (the shimmer/tear
    // class of bug) and nothing that needs a mobile row-budget port --
    // still gated !this.mobile anyway, since mobile never renders the
    // desktop CRT-heavy experience this is tuned against.
    if (this.mode === 'locked' && !this.mobile && this.lockedStation && this.lockedStation.grind) {
      const g = this.lockedStation.grind
      if (!this._nextGrindAt) {
        this._nextGrindAt = t + g.minS + Math.random() * (g.maxS - g.minS)
      } else if (t > this._nextGrindAt) {
        this._nextGrindAt = t + g.minS + Math.random() * (g.maxS - g.minS)
        this.crtGrind(s)
      }
    } else {
      this._nextGrindAt = 0
    }

    // Always-on idle phosphor shimmer (14th pass) -- a subtle
    // always-on scanline or phosphor-flicker shimmer even at idle so the
    // CRT never looks perfectly static. Independent of mode/lock state --
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
      // 49th pass: this fade-back timer only checked poweredOn, not
      // guideOpen -- the one async box-bottom restore in the file missing
      // that second guard (crtIdleEvent's own restore checks both). The
      // guide overlay is a full-screen clearAll() redraw, so if it opens
      // inside this ~90-170ms window the timer punches a stray '─' through
      // it. Matches the guard shape used everywhere else in this file.
      setTimeout(() => { if (this.poweredOn && !this.guideOpen) s.term.put(x, y, '─', restAttr) }, 90 + Math.random() * 80)
    }
  },
}
