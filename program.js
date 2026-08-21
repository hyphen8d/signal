// SIGNAL -- a tuning-dial radio, rendered entirely through the text grid.
//
// The YouTube player (#ytDock in index.html) is docked off-screen -- this
// is an audio-focused experience, and the terminal is the only UI. Because
// there's no visible player at all, this program is the ONLY source of
// playback feedback (playing/paused, what's on), so that's treated as a
// real UI requirement here, not cosmetic.
//
// Each channel has real, verified tracks (see realTrack() below). Real
// per-channel playlists (several hours, no near-term repeat) are still the
// next real step before this goes anywhere near real people.

import { NORMAL, BRIGHT, BOLD, DIM, MUTED, FAINT, BG } from './src/term.js'

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

/** Real, searched-and-verified (YouTube oEmbed) tracks per channel, so each
 *  station is at least genuinely different from the others -- the 4 recycled
 *  placeholder IDs (one of them literally the Rick Astley rickroll) were the
 *  same clips on every channel, which is what made it impossible to
 *  actually evaluate. Each channel now carries 2 real tracks and nothing
 *  else; real per-channel playlists (several hours, no near-term repeat)
 *  are the next real step. */
function realTrack(youtubeId, title, artist) {
  return { id: `yt:${youtubeId}:real`, youtubeId, title, artist }
}

// `tagline` replaces the old plain genre label -- Matthew asked to settle on
// short creative descriptions instead of e.g. "flow / focus". These are a
// first draft, easy to swap.
// `ident` is a short WebAudio tone sequence (Hz, played in order) that
// stands in for a station ID jingle -- one per channel, so locking onto a
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
const CHANNELS = [
  { id: 'distortion-field', freq: 137.4, callsign: 'DISTORTION FIELD', tagline: "heavy guitars, raw nerve, '90s angst",
    // 28th pass (2026-08-21): renamed from STATIC BLOOM per Matthew's
    // station-naming pass -- "DISTORTION FIELD" / "heavy guitars, raw
    // nerve, '90s angst" was the locked-in choice (option 1B). Same
    // grunge/alt-rock lane, same ident, same tracks -- name/tagline only.
    like: 'Nirvana, Soundgarden, Alice In Chains', // 18th pass: guide station reference
    // Matthew 8/20: "I don't hear a station id tone for static bloom." The
    // ident itself was firing fine (confirmed by hooking createOscillator
    // in a live tab) -- it was just pitched a full octave below every other
    // channel's ident (130.8-196 vs. 300+ everywhere else), quiet-to-silent
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
      realTrack('xsJ4O-nSveg', 'Lightning Crashes', 'Live'),
      realTrack('28kAclQZLTE', "Pretend We're Dead", 'L7'),
      realTrack('q-KE9lvU810', 'Cherub Rock', 'The Smashing Pumpkins'),
      realTrack('PjsMnvqL7eY', 'Tomorrow', 'Silverchair'),
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
    like: 'Brian Eno, Sigur Rós, Grouper',
    // 25th pass: was a straight descent, same shape as 3 other stations --
    // now a gentle down-up-down undulation (D U D), a shape unique to this
    // channel, and the slowest identTempo of the set.
    ident: [392.0, 329.6, 370.0, 293.7],
    identTempo: 1.35,
    // 25th pass: ambient/drone masters are mastered deliberately quiet
    // (they're meant to sit low, not compete for attention) -- second-
    // biggest boost on the roster.
    gain: 1.5,
    tracks: [
      realTrack('UfcAVejslrU', 'Weightless', 'Marconi Union'),
      // Reassigned from the retired SIGNAL LOCK station -- see comment above.
      realTrack('sfBlBs25Ewk', 'An Ending (Ascent) [arr. David Le Page]', 'Brian Eno / Orchestra of the Swan'),
      realTrack('TJ6Mzvh3XCc', 'Spiegel im Spiegel', 'Arvo Pärt'),
      realTrack('0kYc55bXJFI', 'Near Light', 'Olafur Arnalds'),
      realTrack('YC6pJOH7bF0', 'Adamord', 'Stars of the Lid'),
      realTrack('QJ-polFpeX0', 'Music for Airports: 1/1', 'Brian Eno'),
      // Swapped out Richter's "On The Nature of Daylight" and Nils Frahm's
      // "Says" 2026-08-20 -- both read as classical/neoclassical, the same
      // lane as RELIC SIGNAL. These 4 are drone/ambient/embient-rock, built
      // to put a room to sleep rather than to be listened to.
      realTrack('8L64BcCRDAE', 'Svefn-g-englar', 'Sigur Rós'),
      realTrack('wLxbD0CkS30', "Heavy Water / I'd Rather Be Sleeping", 'Grouper'),
      realTrack('BD3D5mCjt7I', 'Disintegration Loop 1.1', 'William Basinski'),
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
    ] },
  { id: 'cold-wave', freq: 512.9, callsign: 'COLD WAVE', tagline: 'synthetic hearts, borrowed neon',
    like: 'New Order, The Cure, Depeche Mode',
    // 25th pass: was a straight ascent, same shape as 3 other stations --
    // now reaches up then falls back twice (U D D), a moodier shape that
    // suits "synthetic hearts, borrowed neon" better anyway.
    ident: [440.0, 659.3, 554.4, 440.0],
    identTempo: 1.0,
    // 25th pass: 80s synth-pop masters run a bit quieter than modern
    // loudness-war masters -- small boost.
    gain: 1.1,
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
      realTrack('hKAT3Kp56Yg', 'Vienna', 'Ultravox'),
      realTrack('nTizYn3-QN0', 'Rio', 'Duran Duran'),
      realTrack('JJOFQ3OtJIY', 'Ghosts', 'Japan'),
    ] },
  { id: 'momentum', freq: 823.1, callsign: 'MOMENTUM', tagline: 'building blocks, deep focus, productive drift',
    // 28th pass: renamed from THE STUDY (option e, after more naming
    // options were requested). Same lofi/downtempo focus lane, same ident,
    // same tracks -- name/tagline only.
    like: 'Nujabes, Bonobo, Tycho',
    // 25th pass: was a straight descent, same shape as 3 other stations --
    // now descends then flicks up at the end (D D U), a small lo-fi
    // "wobble" tag instead of a flat fade-out.
    ident: [329.6, 293.7, 261.6, 293.7],
    identTempo: 1.1,
    // 25th pass: lofi/downtempo masters run a bit quieter/mellower than
    // typical modern masters -- small boost.
    gain: 1.15,
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
    ] },

  // 4 new stations added 2026-08-20, tracklists as given by Matthew, all
  // oEmbed-verified. Frequencies slotted into the gaps between the original
  // 5 (288.6 between RELIC SIGNAL/QUIET HOURS, 434.5 between QUIET
  // HOURS/COLD WAVE, 650.0 between COLD WAVE/THE STUDY, 878.9 past THE
  // STUDY toward the top of the band) so none of the original 5 moved.
  { id: 'city-lights', freq: 650.0, callsign: 'CITY LIGHTS', tagline: 'tokyo nights, neon groove, city pop dreams',
    // 28th pass: renamed from HIGH RISE (option 7B). Same city pop lane,
    // same ident, same tracks -- name/tagline only.
    like: 'Tatsuro Yamashita, Anri, Mariya Takeuchi',
    // 25th pass: was a straight ascent, same shape as 3 other stations --
    // now a bouncy up-down-up (U D U), closer to the syncopated groove the
    // genre itself has.
    ident: [523.3, 784.0, 659.3, 987.8],
    identTempo: 0.85,
    // 25th pass: city pop masters (late 70s/80s Japanese) run a bit
    // quieter than modern masters -- small boost.
    gain: 1.1,
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
    ] },
  // 22nd pass (Matthew: "drop outlaw channel completely, 9 channels is our
  // max for now") -- OUTLAW (freq 288.6, spaghetti-western/outlaw-country)
  // removed outright rather than just renamed; its station-ID ident had
  // already been flagged as hard to hear, and 9 is the agreed ceiling for
  // now with HACKBACK's addition. If it comes back later, its full track
  // list (Johnny Cash, Ennio Morricone, Marty Robbins, Colter Wall, Nick
  // Cave, Tom Russell, Calexico) is in git history on this commit's parent.
  { id: 'circuit-crush', freq: 434.5, callsign: 'CIRCUIT CRUSH', tagline: 'analog glow, the long drive home',
    like: 'Kavinsky, GUNSHIP, Perturbator',
    // 25th pass: was a straight ascent, same shape as 3 other stations --
    // now dips then double-rises (D U U), and the fastest identTempo of
    // the set, for a punchier/more aggressive announce.
    ident: [587.3, 466.2, 698.5, 932.3],
    identTempo: 0.75,
    // 25th pass: modern synthwave masters are already loud/compressed --
    // no boost.
    gain: 1.0,
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
    ] },
  // 23rd pass: freq nudged 878.9 -> 854.9 (Matthew: "station 8 and 9 are too
  // close to each other") -- freqToCol() rounded 878.9 and HACKBACK's 893.7
  // to adjacent dial columns (73 and 74), so their preset triangles rendered
  // as a single "▲▲" glyph pair instead of two distinct ticks, despite the
  // 20th-pass comment on HACKBACK claiming they were "distinct". Re-split
  // the tail of the band (THE STUDY 823.1 up to FREQ_MAX 900) roughly evenly
  // across ATOMIC/HACKBACK instead.
  { id: 'atomic', freq: 854.9, callsign: 'ATOMIC', tagline: 'swing on while the counter clicks', // 19th pass: trimmed
    like: 'The Ink Spots, Roy Brown, The Five Stars',
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
  { id: 'hackback', freq: 888.7, callsign: 'HACKBACK', tagline: 'golden age hip-hop, west coast legends, deep cuts',
    like: 'A Tribe Called Quest, De La Soul, Wu-Tang Clan',
    // 25th pass: was a straight descent, same shape as 3 other stations --
    // now a rise then a hard drop (U U D), like a boom-bap tag snapping
    // down on the beat, with a tight/punchy identTempo to match.
    ident: [220.0, 293.7, 349.2, 293.7],
    identTempo: 0.8,
    // 25th pass: modern hip-hop masters are already loud/compressed -- no
    // boost.
    gain: 1.0,
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
    ] },
  { id: 'cipher', freq: 219.8, callsign: 'CIPHER', tagline: 'ghost protocol, digital infiltration, breakbeat noir',
    // 28th pass (2026-08-21): New cyberpunk station, hacker movies/synthwave
    // aesthetic (locked-in name/tagline per Matthew's naming pass). Placed
    // at 219.8, the frequency freed by RELIC SIGNAL's retirement (see the
    // retirement comment above DRIFT MODE) -- keeps the roster at 9
    // stations total rather than growing to 10.
    like: 'The Prodigy, Chemical Brothers, Daft Punk',
    // Ident is a bouncy up-down-up-down (U D U D) breakbeat style.
    ident: [523.3, 349.2, 587.3, 293.7],
    identTempo: 0.9,
    // Breakbeat/electronic genre runs moderately loud, no special boost
    // needed.
    gain: 1.0,
    tracks: [
      realTrack('jNgzy5jFAxo', 'Firestarter', 'The Prodigy'),
      realTrack('yVrLJItL8dI', 'Smack My Bitch Up', 'The Prodigy'),
      realTrack('e-IWRSqNeFY', 'Block Rockin\' Beats', 'Chemical Brothers'),
      realTrack('N0y_nQfYrpw', 'Elektrobank', 'Chemical Brothers'),
      realTrack('a80DRVJzazg', 'One More Time', 'Daft Punk'),
      realTrack('bNMj2l72e_c', 'Da Funk', 'Daft Punk'),
      realTrack('K_3vXFU5sBo', 'Praise You', 'Fatboy Slim'),
      realTrack('0Fyp-q17lzM', 'Weapon of Choice', 'Fatboy Slim'),
      realTrack('Z0RfLgbU0bA', 'Halcyon On and On', 'Orbital'),
      realTrack('bV-hSgL1R34', 'The Box Part II', 'Orbital'),
      realTrack('lAifppvx9I4', 'Teardrop', 'Massive Attack'),
      realTrack('eFLhc6aGhWo', 'Safe from Harm', 'Massive Attack'),
      realTrack('1VT-4MnCNI4', 'Song of Life', 'Leftfield'),
      realTrack('IUDTlvagjulW', 'Peder Mannerfelt - Modern Talking', 'Leftfield'),
      realTrack('t2F-aVGx7pI', 'Born Slippy', 'Underworld'),
      realTrack('CQGb6J9vQ0I', 'Rez', 'Underworld'),
      realTrack('XhEdd0dqr-c', 'Everything Hertz', 'Boards of Canada'),
      realTrack('m0aJ-yf_5_A', 'Music Has the Right to Children', 'Boards of Canada'),
      realTrack('BiXxQ1n-sXo', 'Windowlicker', 'Aphex Twin'),
      realTrack('41eEwMdw5lI', 'Alberto Balsalm', 'Aphex Twin'),
      realTrack('Th1KvEf4iYU', 'Eternal', 'Amon Tobin'),
      realTrack('qTQQP6x0Vx4', 'Journeyman', 'Amon Tobin'),
      realTrack('7jrnBcGI0sw', 'Come to Dust', 'Squarepusher'),
      realTrack('h0h79QWLmfE', 'Steinbolt', 'Squarepusher'),
      realTrack('fdrJZKEGYt4', 'Clipper', 'Autechre'),
      realTrack('AyKJ5pNB44g', 'Pen Expers', 'Autechre'),
      realTrack('RW_JgiqKvaM', 'Theme', 'Tron: Legacy'),
      realTrack('zyMgrFfGLIg', 'Derezzed', 'Tron: Legacy'),
      realTrack('J6gU0YT8pCw', 'A World Away', 'Halo Soundtrack'),
      realTrack('gxNaS3cgNPE', 'Hijack', 'Johnny Mnemonic OST'),
    ] },
]

// Preset-key ordering (17th pass, Matthew: "presets should match the tuning
// band left to right") -- CHANNELS above is ordered however stations were
// added over time (original 5, then 4 more slotted into freq gaps), not by
// frequency, so pressing 1-9 in order used to jump around the dial instead
// of walking it left to right (e.g. preset 5, THE STUDY at 823.1, sat to
// the RIGHT of preset 6, HIGH RISE at 650.0). Rather than reshuffle the
// CHANNELS array itself -- which would scatter the historical comments
// documenting when/why each station and its frequency were added -- this
// derives a separate lookup sorted by freq ascending, so preset number
// order always matches left-to-right position on the dial regardless of
// CHANNELS' own (chronological) order.
const CHANNEL_PRESET_ORDER = [...CHANNELS].sort((a, b) => a.freq - b.freq)

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
// (18th pass) -- longest status string in use is "POWERING DOWN" (13
// chars). Padding every status word to this width keeps the whole
// "● [ STATUS ]" readout a constant length so the LED never shifts
// position between transitions. Bump this if a longer status string is
// ever added.
const STATUS_TEXT_WIDTH = 13

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
function nearestChannel(freq) {
  let best = null, bestDist = Infinity
  for (const ch of CHANNELS) {
    const d = Math.abs(ch.freq - freq)
    if (d < bestDist) { bestDist = d; best = ch }
  }
  return { channel: best, dist: bestDist }
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
  // it's usually the first channel tried after a fresh page load, i.e.
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
function playSeekStatic() {
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
    filter.frequency.value = 1400
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

// Station ident (added 2026-08-20, 9th pass) -- a short per-channel tone
// motif (see CHANNELS[].ident) played on lock instead of the generic
// playLockTone(), so each station announces itself distinctly before
// you've even read the screen. Falls back to playLockTone() if a channel
// somehow has no ident defined.
// 25th pass: added the `tempo` scalar (see CHANNELS[].identTempo) so
// stations are distinct by rhythm/pacing as well as by pitch contour -- a
// slow ambient station and a punchy synthwave one shouldn't announce
// themselves at the same clip just because their note shapes differ.
// Scales the note gap and the whole attack/decay envelope together, so a
// slower tempo reads as more spacious rather than just "the same envelope
// with gaps stretched out."
function playIdent(freqs, tempo = 1) {
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
      t += 0.11 * tempo
    })
  } catch (e) {}
}

// Continuous static bed while scanning, in place of a bare tick per step --
// filtered noise, faded in/out rather than started/stopped hard.
let staticSrc = null
let staticGain = null
// 21st pass (Matthew, 0.3 wishlist: "static intensity scales with distance
// from a station") -- the noise bed used to sit at one fixed gain the whole
// time you were seeking/scanning, so tuning felt the same whether you were
// miles off frequency or about to land on a station. Now it fades between
// these two based on nearestChannel's dist, mirroring the SIG meter's own
// falloff curve (NEAR_THRESHOLD), so the static visibly/audibly clears
// right before a lock, same as a real radio easing out of the noise floor.
const STATIC_MAX_GAIN = 0.1
const STATIC_MIN_GAIN = 0.02
function staticGainForDist(dist) {
  const pct = dist == null ? 1 : Math.min(1, dist / NEAR_THRESHOLD)
  return STATIC_MIN_GAIN + (STATIC_MAX_GAIN - STATIC_MIN_GAIN) * pct
}
function startStaticNoise(dist) {
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
    filter.frequency.value = 1200
    filter.Q.value = 0.6
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(staticGainForDist(dist), ctx.currentTime + 0.15)
    src.connect(filter).connect(gain).connect(ctx.destination)
    src.start()
    staticSrc = src
    staticGain = gain
  } catch (e) {}
}
function setStaticIntensity(dist) {
  if (!staticGain) return
  try {
    const ctx = audioCtx()
    staticGain.gain.linearRampToValueAtTime(staticGainForDist(dist), ctx.currentTime + 0.08)
  } catch (e) {}
}
function stopStaticNoise() {
  if (!staticSrc) return
  const src = staticSrc, gain = staticGain
  staticSrc = null
  staticGain = null
  try {
    const ctx = audioCtx()
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15)
    setTimeout(() => { try { src.stop() } catch (e) {} }, 200)
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
// the per-channel ident tones that follow once the sweep lands and locks.
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
// position isn't worth remembering), only ever alongside a channel lock.
// 23rd pass: also remembers the chosen display mode (phosphor key), same
// reasoning as volume/mute -- a cosmetic preference the set was left in,
// not something tied to a station lock.
const STORAGE_KEY = 'signal:state:v1'
function saveSignalState(program) {
  try {
    const mode = DISPLAY_MODES[program.displayModeIndex || 0]
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      channelId: program.lockedChannel ? program.lockedChannel.id : null,
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

// --- program ---------------------------------------------------------------

export default {
  // Static chrome -- title bar, brand-plate, panel frames, grille, corner
  // brackets. Drawn once at boot and again after a power-up (12th pass);
  // extracted out of init() so both call sites stay in sync instead of
  // duplicating ~60 lines of box-drawing.
  drawChrome(s) {
    const { term } = s

    // Title bar, inverse plane.
    for (let x = 0; x < term.cols; x++) term.put(x, 0, ' ', NORMAL, 1)
    term.text(2, 0, 'SIGNAL', BOLD, 1)
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
    const mode = DISPLAY_MODES[this.displayModeIndex]
    s.setPhosphor(mode.key)
    // 31st pass (Matthew: "flashes the name of the color... I thought was
    // cool but now not needed") -- the antenna pane's mode strip (see
    // drawModeStrip()) is a persistent on-screen readout of the same
    // information this transient toast used to announce, so the toast
    // (flashDisplayMode(), removed) was just duplicating it a second time.
    saveSignalState(this)
  },

  init(s) {
    const { term } = s

    // Leftover from the old 88-108 band -- 93.0 is below the current
    // FREQ_MIN (100.0), so the dial opened already out-of-range. Now starts
    // exactly at FREQ_MIN.
    this.freq = FREQ_MIN
    this.mode = 'seeking' // 'seeking' | 'locked'
    this.lockedChannel = null
    this.currentTrack = null
    this.bags = {}
    this.scanning = false
    this.scanTimer = null
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

    // 28th pass: Hidden station-hopping mode (Shift+N toggles; see key()).
    this.stationHopping = false

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

    this.history = [] // stack of previously-locked channels, for [B] back
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
      if (saved.channelId) {
        const ch = CHANNELS.find((c) => c.id === saved.channelId)
        if (ch) {
          this.mode = 'locked'
          this.lockedChannel = ch
          this.freq = ch.freq
          const track = saved.trackId ? ch.tracks.find((tr) => tr.id === saved.trackId) : null
          this.currentTrack = track || ch.tracks[0]
          this.needsTrackLoad = true
        }
      }
    }
    // 28th pass (Matthew: "sometimes it doesn't automatically seek to a
    // channel and the user has to figure out to use arrows or hit s") -- a
    // first-ever visit (no saved session, or a save that somehow had no
    // channelId) landed in 'seeking' mode sitting at FREQ_MIN with nothing
    // locked, so the set just sat there silently until someone thought to
    // press an arrow key or S. A real radio doesn't power on to dead air by
    // default -- lands on a random preset instead, same as if that preset
    // had been the one restored from a save (same fields, same
    // needsTrackLoad path through powerUp()).
    if (this.mode !== 'locked') {
      const ch = CHANNELS[Math.floor(Math.random() * CHANNELS.length)]
      this.mode = 'locked'
      this.lockedChannel = ch
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
    const hint = '[P] POWER ON'
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

    this.dragging = false
    this.dragLastX = 0
    document.addEventListener('pointerdown', (e) => this.onPointerDown(s, e))
    document.addEventListener('pointermove', (e) => this.onPointerMove(s, e))
    document.addEventListener('pointerup', () => { this.dragging = false })
    // 22nd pass (Matthew: "semi mobile functionality -- tapping screen can
    // 'power on', swipe left/right for channels") -- separate gesture layer
    // from the pointer-drag seeking above (onPointerDown ignores
    // pointerType 'touch' now, see there) rather than trying to derive
    // tap/swipe from the continuous drag math, which is tuned for a mouse
    // dragging the dial, not a thumb flicking the whole screen.
    this._touchActive = false
    this._touchStartX = 0
    this._touchStartY = 0
    this._touchStartTime = 0
    document.addEventListener('touchstart', (e) => this.onTouchStart(s, e), { passive: false })
    document.addEventListener('touchend', (e) => this.onTouchEnd(s, e), { passive: false })
  },

  drawScale(s) {
    const { term } = s
    for (let x = BOX_X0 + 1; x < BOX_X1; x++) term.put(x, SCALE_Y, ' ')
    term.text(DIAL_X0 - 1, SCALE_Y, '100.0', DIM)
    term.text(freqToCol(500) - 2, SCALE_Y, '500.0', DIM)
    term.text(DIAL_X1 - 4, SCALE_Y, '900.0', DIM)
  },

  drawDial(s) {
    const { term } = s
    for (let x = DIAL_X0; x <= DIAL_X1; x++) term.put(x, DIAL_Y, '·', FAINT)
    const { channel: near, dist } = nearestChannel(this.freq)
    for (const ch of CHANNELS) {
      const col = freqToCol(ch.freq)
      const glow = this.mode === 'seeking' && ch === near && dist <= NEAR_THRESHOLD
      const locked = this.mode === 'locked' && this.lockedChannel === ch
      term.put(col, DIAL_Y, '▲', locked ? BRIGHT : glow ? BOLD : NORMAL)
    }
    const cursorCol = freqToCol(this.freq)
    term.put(cursorCol, DIAL_Y, '█', BRIGHT)
  },

  drawFreq(s) {
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
  setStatus(s, text, active) {
    const { term } = s
    const padTotal = STATUS_TEXT_WIDTH - text.length
    const padL = Math.max(0, Math.floor(padTotal / 2))
    const padR = Math.max(0, padTotal - padL)
    const padded = ' '.repeat(padL) + text + ' '.repeat(padR)
    const bracket = `[ ${padded} ]`
    const bracketX = centerX(term.cols, bracket)
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
    term.text(bracketX, STATUS_Y, bracket, active ? BRIGHT : MUTED)
  },

  // Warm-up flicker (10th pass) -- a short beat sequence that redraws the
  // 4 panel top/bottom borders at varying brightness right after boot,
  // then settles back to the normal resting MUTED attr. One-shot, timer-
  // based (same pattern as the scan/preset timers elsewhere in this file),
  // not part of the per-frame loop.
  playBootFlicker(s) {
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
    const bottoms = [TUNER_BOT_Y, STATION_BOT_Y, NOWPLAYING_BOT_Y, METERS_BOT_Y]
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
  // down sequence"). Neither one resets freq/lockedChannel/shuffle
  // bags/volume -- powering off and back on is meant to read as the same
  // set switching states, not a fresh boot. init() still owns the actual
  // fresh-boot path (page load) and calls drawChrome()+playBootFlicker()
  // directly; these two reuse the same building blocks for the same look
  // on every power cycle after that.
  powerDown(s) {
    if (!this.poweredOn) return
    this.poweredOn = false
    this._powerAnimating = true // cleared once the STANDBY beat lands below
    this.stopScan()
    // stopScan() no longer stops the ambient static bed on its own (12th
    // pass) -- power-down is one of the two places (with tryLock) that
    // still needs to silence it explicitly.
    stopStaticNoise()
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
        const hint = '[P] POWER ON'
        term.text(centerX(term.cols, hint), midY, hint, FAINT)
        this.drawStandbyClock(s)
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

    // 26th pass (Matthew: "a longer, better cold boot sequence... maybe like
    // cyberspace.online does") -- looked at cyberspace's actual boot live: a
    // dense retro-BIOS POST (hostname/kernel/hardware probe lines, a RAM
    // map, per-module load bars) before it lands on the app. SIGNAL is a
    // receiver, not an OS, so this borrows that probe-block density and
    // key:value voice but keeps it in-fiction -- tuner/antenna/preset-table
    // diagnostics instead of kernel modules. Values are pulled from the
    // real constants (FREQ_MIN/MAX, CHANNELS.length) so this can't drift out
    // of sync with the actual band/roster the way a hardcoded line could.
    const bootLines = [
      'MODEL SG-1  SIGNAL RECEIVER',
      '',
      `BAND        : ${FREQ_MIN.toFixed(1)} - ${FREQ_MAX.toFixed(1)} KHZ`,
      `PRESETS     : ${CHANNELS.length} STATIONS LOADED`,
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
          }, i * LINE_STAGGER_MS)
        })
      } },
      { delay: REVEAL_DELAY, fn: () => {
        // Full picture back -- same chrome init() draws on a fresh boot,
        // just without touching freq/lockedChannel/bags/volume/history.
        clearAll()
        this.poweredOn = true
        this._powerAnimating = false // sequence landed, ticker can resume
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
        if (this.mode === 'locked' && this.lockedChannel) {
          // Resume exactly where it left off -- same channel, same track,
          // same playback position -- rather than re-picking from the
          // shuffle bag, so it reads as the same set coming back on rather
          // than a new tune-in.
          this.showStation(s, this.lockedChannel)
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
  // a channel while seeking, full once locked.
  drawSignal(s) {
    const { term } = s
    for (let x = BOX_X0 + 1; x < METERS_DIVIDER_X; x++) term.put(x, SIG_Y, ' ')
    const segs = 16
    let pct = 0
    if (this.mode === 'locked') pct = 1
    else {
      const { dist } = nearestChannel(this.freq)
      if (dist <= NEAR_THRESHOLD) pct = 1 - dist / NEAR_THRESHOLD
    }
    const filled = Math.round(pct * segs)
    let bar = ''
    for (let i = 0; i < segs; i++) bar += i < filled ? '█' : '-'
    const label = `SIG [${bar}]`
    term.text(centerXRange(BOX_X0 + 1, METERS_DIVIDER_X - 1, label), SIG_Y, label, filled > 0 ? DIM : FAINT)
  },

  // STATION (callsign + tagline) and NOW PLAYING (track) are separate
  // boxes now -- station identity doesn't change on a track skip, so it
  // gets its own clear/draw pair instead of being wiped and redrawn
  // alongside the track every time (Matthew, 8/20: "station info should be
  // broken out from current playing song info").
  clearStation(s) {
    const { term } = s
    for (const y of [STATION_Y, TAGLINE_Y]) {
      for (let x = BOX_X0 + 1; x < BOX_X1; x++) term.put(x, y, ' ')
    }
  },
  showStation(s, channel) {
    const { term } = s
    this.clearStation(s)
    const maxWidth = BOX_X1 - BOX_X0 - 4
    const callsign = truncate(channel.callsign, maxWidth)
    const tagline = truncate(channel.tagline, maxWidth)
    term.text(centerX(term.cols, callsign), STATION_Y, callsign, BRIGHT)
    term.text(centerX(term.cols, tagline), TAGLINE_Y, tagline, MUTED)
  },

  clearTrack(s) {
    const { term } = s
    for (let x = BOX_X0 + 1; x < BOX_X1; x++) term.put(x, TRACK_Y, ' ')
    this.updateTabTitle()
  },
  showTrack(s, track) {
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
    term.text(centerX(term.cols, line), TRACK_Y, line, BOLD)
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
    document.title = (this.lockedChannel && track)
      ? `${this.lockedChannel.callsign} · ${track.title} — SIGNAL`
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
  drawVU(s) {
    const { term } = s
    // 18th pass: confined to the left half, and this.vuTrace shrank from
    // 24 to 16 samples (see init()) to match -- same reasoning as the
    // VOL/SIG segment trim above.
    for (let x = BOX_X0 + 1; x < METERS_DIVIDER_X; x++) term.put(x, VU_Y, ' ')
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
    let target
    if (playing) target = volFactor * (0.15 + Math.random() * 0.8)
    else if (searching) target = 0.04 + Math.random() * 0.10
    else target = 0.03
    const spring = 0.4
    const damping = 0.5
    const accel = (target - this.vuSample) * spring - this.vuVelocity * damping
    this.vuVelocity += accel
    this.vuSample = Math.max(0, Math.min(1, this.vuSample + this.vuVelocity))
    this.vuTrace.shift()
    this.vuTrace.push(this.vuSample)
    const chars = ' ▁▂▃▄▅▆▇█'
    let bar = ''
    for (const v of this.vuTrace) bar += chars[Math.max(0, Math.min(chars.length - 1, Math.round(v * (chars.length - 1))))]
    const label = `VU  ${bar}`
    term.text(centerXRange(BOX_X0 + 1, METERS_DIVIDER_X - 1, label), VU_Y, label, playing ? DIM : FAINT)
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
    const locked = this.mode === 'locked' && this.lockedChannel
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
  // directly to the [1-9] keys in frequency order (CHANNEL_PRESET_ORDER),
  // same mapping the guide's station table and the [B]ack logic already
  // use. Brightness-only (no brackets) to keep it a fixed 9-column strip.
  drawPresetStrip(s, rows) {
    const { term } = s
    const y = rows[0] // VOL_Y
    const x0 = METERS_DIVIDER_X + 2
    const idx = this.lockedChannel ? CHANNEL_PRESET_ORDER.indexOf(this.lockedChannel) : -1
    for (let i = 0; i < CHANNEL_PRESET_ORDER.length; i++) {
      term.put(x0 + i, y, String(i + 1), i === idx ? BRIGHT : FAINT)
    }
  },

  // Display-mode selector, left margin middle row -- mirrors [C]'s cycle
  // through DISPLAY_MODES. This is the one addition here that closes an
  // actual gap rather than just duplicating something shown elsewhere:
  // right now the only feedback for which phosphor tint is active is the
  // whole screen's own color, with no on-screen label anywhere.
  drawModeStrip(s, rows) {
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
    const { term } = s
    const y = rows[4] // VU_Y
    const x0 = METERS_DIVIDER_X + 2
    const label = this.muted ? 'MUTE [ON ]' : 'MUTE [OFF]'
    term.text(x0, y, label, this.muted ? BRIGHT : FAINT)
  },

  // Secondary readout, upper-right margin of the antenna pane (30th pass,
  // Matthew: "secondary readout makes sense"). Purely atmospheric -- not
  // derived from any real signal math -- but driven by the same state the
  // rings use, so it never contradicts them; it just says the same thing
  // in a second register (text instead of glyph). Fixed-width output only
  // (always "FLD " + 2 chars) so it never leaves a stray trailing
  // character behind between redraws.
  drawFieldReadout(s, startX, rows, state) {
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
    const { term } = s
    const y = rows[4] // VU_Y
    const x0 = startX + this.ANTENNA_TEMPLATE[0].length + 2
    const chars = ' ▁▂▃▄▅▆▇█'
    let bar = ''
    // 31st pass: unlike the rings/FLD readout above, this ribbon stays an
    // audio-level analog (same role as the VU meter it mirrors) -- so mute
    // still flattens it, checked directly here rather than through `state`.
    for (let i = 0; i < this.eqSamples.length; i++) {
      let target
      if (this.muted) target = 0.05
      else if (state === 'playing') target = 0.15 + Math.random() * 0.8
      else if (state === 'buffering') target = Math.random() * 0.6
      else if (state === 'seeking') target = 0.03 + Math.random() * 0.08
      else target = 0.05 // paused -- nearly flat
      const spring = 0.35, damping = 0.5
      const accel = (target - this.eqSamples[i]) * spring - this.eqVelocities[i] * damping
      this.eqVelocities[i] += accel
      this.eqSamples[i] = Math.max(0, Math.min(1, this.eqSamples[i] + this.eqVelocities[i]))
      bar += chars[Math.max(0, Math.min(chars.length - 1, Math.round(this.eqSamples[i] * (chars.length - 1))))]
    }
    term.text(x0, y, bar, !this.muted && state === 'playing' ? DIM : FAINT)
  },

  // BUG/NAMING FIXED 2026-08-20: this used to log an entry on every track
  // skip within the SAME channel, so "RECENT" was really a recent-tracks
  // log, not a channel log. The session-stats/RECENT footer line was
  // removed entirely 2026-08-20 (7th pass, Matthew: "remove session
  // stats... this looks like a blob") -- this now just tracks what's
  // currently playing for skip()'s benefit, nothing gets drawn from it.
  tuneToChannel(s, channel, track) {
    this.nowPlaying = { channelId: channel.id, freq: channel.freq, callsign: channel.callsign, title: track.title }
  },

  // Filled-background control panel, same treatment as the title bar
  // (Matthew, 8/20: distinguish the controls from the rest of the screen
  // the same way SIGNAL/v0.2 stand out up top, not as dim floating text).
  // "drag to sweep" deliberately left off -- it's a hidden/discoverable
  // control, not one of the primary listed ones.
  drawHint(s) {
    const { term } = s
    const line1 = '[<-/->] SEEK   [ENTER] LOCK   [S] SCAN   [1-9] PRESETS   [B] BACK   [G] GUIDE'
    // 23rd pass: "[C] MODE" rather than the fuller "[C] DISPLAY" -- line2
    // was already 68/80 cols and DISPLAY doesn't fit even at 2-space
    // spacing (the fixed hint row has broken before on an over-length
    // string, see centerX()'s own clamping comment).
    const line2 = '[SPACE] PLAY/PAUSE   [N] SKIP   [UP/DOWN] VOL   [M] MUTE   [P] POWER  [C] MODE'
    for (let x = 0; x < term.cols; x++) { term.put(x, HINT_Y1, ' ', NORMAL, 1); term.put(x, HINT_Y2, ' ', NORMAL, 1) }
    term.text(centerX(term.cols, line1), HINT_Y1, line1, BOLD, 1)
    term.text(centerX(term.cols, line2), HINT_Y2, line2, NORMAL, 1)
  },

  // --- bag / playback --------------------------------------------------

  ensureBag(channel) {
    if (!this.bags[channel.id]) this.bags[channel.id] = { order: shuffledIndices(channel.tracks.length), pos: 0 }
    return this.bags[channel.id]
  },
  nextTrack(channel) {
    const bag = this.ensureBag(channel)
    if (bag.pos >= bag.order.length) { bag.order = shuffledIndices(channel.tracks.length); bag.pos = 0 }
    const track = channel.tracks[bag.order[bag.pos]]
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
              if (dur && isFinite(dur) && dur > 20) {
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
            if (e.data === YT.PlayerState.PLAYING) self.setPlayState(s, 'playing')
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
          onError: () => { if (self.mode === 'locked') self.skip(s) },
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
    if (opts.midSong) {
      this.pendingMidSongSeek = true
      this.player.cueVideoById(track.youtubeId)
    } else {
      this.pendingMidSongSeek = false
      this.player.loadVideoById(track.youtubeId)
    }
  },
  togglePlayPause(s) {
    if (this.mode !== 'locked' || !this.ready || !this.player) return
    const st = this.player.getPlayerState()
    if (st === YT.PlayerState.PLAYING) this.player.pauseVideo()
    else this.player.playVideo()
    // onStateChange will correct this shortly regardless; setting it here
    // too so the indicator doesn't lag a beat behind the keypress.
    this.setPlayState(s, st === YT.PlayerState.PLAYING ? 'paused' : 'playing')
  },
  skip(s) {
    if (this.mode !== 'locked') return
    const track = this.nextTrack(this.lockedChannel)
    this.currentTrack = track
    // Same channel, just the next track in it -- station identity (its own
    // box now) doesn't need to be touched at all, just the track line.
    this.showTrack(s, track)
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
  // `track.gain` if the current track has one, else `channel.gain`, else
  // 1 (no change). Every setVolume() call in the file should go through
  // this rather than calling player.setVolume(this.volume) directly, so
  // gain is never accidentally bypassed on some code path.
  //
  // The channel-level gains set below are a first-pass, by-genre/by-era
  // approximation (older and acoustic/orchestral masters run quieter than
  // modern compressed ones -- a well-established mastering convention, not
  // something measured per track here) rather than precisely measured
  // per-track loudness, which nobody's actually done. Treat them as a
  // starting point: bump an individual track's `gain` field if a specific
  // song still stands out once you've heard it.
  applyVolume() {
    if (!this.ready || !this.player) return
    const ch = this.lockedChannel
    const gain = (this.currentTrack && this.currentTrack.gain) ?? (ch && ch.gain) ?? 1
    const eff = Math.round(Math.min(100, Math.max(0, this.volume * gain)))
    this.player.setVolume(eff)
  },
  adjustVolume(s, delta) {
    this.volume = Math.min(100, Math.max(0, this.volume + delta))
    if (this.muted) this.muted = false // touching volume un-mutes, like a real set
    if (this.ready && this.player) {
      this.applyVolume()
      if (!this.muted) this.player.unMute()
    }
    this.drawVolume(s)
    saveSignalState(this)
  },
  toggleMute(s) {
    this.muted = !this.muted
    if (this.ready && this.player) {
      if (this.muted) this.player.mute()
      else { this.player.unMute(); this.applyVolume() }
    }
    this.drawVolume(s)
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
    const { dist } = nearestChannel(this.freq)
    setStaticIntensity(dist)
  },
  enterSeeking(s) {
    this.mode = 'seeking'
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
    startStaticNoise(nearestChannel(this.freq).dist)
  },
  seekStep(s, delta) {
    this.stopScan()
    const wasLocked = this.mode === 'locked'
    // 21st pass (Matthew: "scrolling with arrows should be able to cycle to
    // the other side of the tuning band since scan can do it") -- mirror
    // startScan's wraparound instead of clampFreq's dead stop at the edges.
    let f = this.freq + delta
    if (f > FREQ_MAX) f = FREQ_MIN
    else if (f < FREQ_MIN) f = FREQ_MAX
    this.retune(s, f)
    playSeekStatic()
    // Land-on-lock (added 2026-08-20, Matthew: "when you hit one of the
    // stations while seeking with arrows and you land on one, it locks"):
    // if the new position is within lock range of a station, lock onto it
    // immediately instead of requiring a separate Enter press. Skip this
    // when the step started already locked on that same station, so a
    // single arrow tap doesn't just replay the lock you're already on.
    const { channel, dist } = nearestChannel(this.freq)
    if (dist <= LOCK_THRESHOLD && !(wasLocked && this.lockedChannel === channel)) {
      this.tryLock(s)
      return
    }
    if (wasLocked) this.enterSeeking(s)
    else this.setStatus(s, 'SEEKING', false)
    // Covers the "already seeking, one more arrow tap" case -- enterSeeking()
    // above only fires on a locked->seeking transition, but the continuous
    // bed needs to be there (or stay there) on every non-locking step, not
    // just the first one. Idempotent, same as above.
    startStaticNoise(dist)
  },
  tryLock(s) {
    const { channel, dist } = nearestChannel(this.freq)
    if (dist > LOCK_THRESHOLD) {
      this.setStatus(s, 'NO SIGNAL', false)
      return
    }
    this.stopScan()
    // Locking is the one transition that actually ends the ambient static
    // bed (stopScan() itself no longer does -- see its comment) -- a signal
    // found means the hiss cuts, same as a real set.
    stopStaticNoise()
    this.retune(s, channel.freq)
    // History (14th pass, Matthew: "discovery/history -- sure") -- push
    // whatever was locked before this one so [B] can step back through
    // recently-played stations. Only real transitions count: landing back
    // on the station you're already on (e.g. an arrow-seek that re-locks
    // in place) doesn't push a duplicate. Capped so it can't grow forever
    // across a long session.
    if (this.lockedChannel && this.lockedChannel !== channel) {
      this.history.push(this.lockedChannel)
      if (this.history.length > 8) this.history.shift()
    }
    this.mode = 'locked'
    this.lockedChannel = channel
    // Station idents (added 2026-08-20, Matthew: "yes lets try station
    // idents"): each channel has its own short tone motif in CHANNELS[].ident
    // so locking on COLD WAVE sounds different from locking on QUIET HOURS,
    // instead of every station announcing itself with the same generic chime.
    playIdent(channel.ident, channel.identTempo || 1)
    // 23rd pass: attack transient on lock, see pulseVU().
    this.pulseVU(0.5)
    this.setStatus(s, 'LOCKED', true)
    this.drawDial(s)
    const track = this.nextTrack(channel)
    this.currentTrack = track
    this.showStation(s, channel)
    this.showTrack(s, track)
    this.tuneToChannel(s, channel, track)
    // Re-applies volume for the new channel/track's gain (see
    // applyVolume()) -- a station switch is exactly the moment a loudness
    // jump would otherwise show up.
    this.applyVolume()
    // Mid-song join: cues rather than loads, so actual playback (and the
    // PLAYING state) doesn't start until the onStateChange handler above
    // has picked a random point in the track and seeked to it.
    this.loadTrack(track, { midSong: true })
    this.setPlayState(s, 'buffering')
    saveSignalState(this)
  },
  // [B] back (14th pass) -- pops the most recently locked station off
  // history and tunes to it via the same sweep presetTune() already gives
  // number-key presets, so stepping back reads/sounds the same as jumping
  // to any other preset rather than a silent instant cut.
  goBack(s) {
    if (!this.history.length) return
    const channel = this.history.pop()
    this.presetTune(s, channel)
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
  // pages rather than cramming both onto one. ArrowLeft/ArrowRight flip
  // between them (see key()); any other key still closes the guide exactly
  // like before.
  drawGuidePage(s) {
    const { term } = s
    for (let y = 0; y < term.rows; y++)
      for (let x = 0; x < term.cols; x++) term.put(x, y, ' ', NORMAL, 0)
    if (this.guidePage === 1) this.drawGuidePageAbout(s)
    else this.drawGuidePageStations(s)
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
    put(14, '[<-/->] SEEK        [ENTER] LOCK        [S] SCAN', DIM)
    put(15, '[1-9] PRESETS       [B] BACK            [SPACE] PLAY/PAUSE', DIM)
    put(16, '[N] SKIP            [UP/DOWN] VOL        [M] MUTE', DIM)
    put(17, '[P] POWER           [G] GUIDE            [C] DISPLAY MODE', DIM)
    // 20th pass (Matthew: "for people that don't have youtube premium..
    // they hear ads. options?") -- decided against anything that tries to
    // detect/suppress the ad itself (that's ad-blocking circumvention
    // against YouTube's ToS, not something to build around even here) or a
    // bigger re-sourcing effort. This is the cheap, honest middle ground:
    // just tell people up front so an ad reads as expected rather than as
    // SIGNAL being broken.
    put(19, "Playback is real YouTube video -- ads may play without Premium", FAINT)
    put(20, 'SIGNAL v0.5', FAINT)
    put(22, '[->] STATIONS        [any other key] CLOSE', FAINT)
  },
  // Station reference table -- freq/name/tagline/artists-like, one entry
  // per 2 rows (header line, then an indented "like" line), 9 stations x 2
  // rows = 18 rows, rows 3-20 exactly (22nd pass: back to 9 after OUTLAW was
  // dropped and HACKBACK's `0` binding retired -- footer back at row 22).
  // Ordered by CHANNEL_PRESET_ORDER (freq ascending, same order as the dial
  // left-to-right and the [1-9] preset keys) rather than CHANNELS'
  // chronological order, so the preset number shown here matches what
  // actually tunes to that station.
  // 21st pass (Matthew: "we need a better way of showing 'artists like:' --
  // we should be able to see 3 examples"): the tagline used to share the
  // detail row with the like-list, so anything past ~2 artists got cut off
  // with "..." -- confirmed happening on ATOMIC and HACKBACK. Tagline now
  // lives on the header row (there's plenty of width there, taglines are
  // capped at 35 chars and callsigns are short), leaving the whole detail
  // row just for "like: A, B, C" -- every station's 3 examples now fit with
  // room to spare (longest is 52 chars against a ~72-char row).
  drawGuidePageStations(s) {
    const { term } = s
    const put = (y, text, attr) => term.text(centerX(term.cols, text), y, text, attr)
    put(1, 'SIGNAL -- STATIONS', BOLD)
    const startY = 3
    CHANNEL_PRESET_ORDER.forEach((ch, i) => {
      const presetNum = i + 1
      const y = startY + i * 2
      const header = truncate(`[${presetNum}] ${ch.freq.toFixed(1)}   ${ch.callsign} -- ${ch.tagline}`, term.cols - 4)
      term.text(4, y, header, BRIGHT)
      const detail = truncate(`like: ${ch.like}`, term.cols - 8)
      term.text(8, y + 1, detail, MUTED)
    })
    put(22, '[<-] ABOUT        [any other key] CLOSE', FAINT)
  },
  closeGuide(s) {
    this.guideOpen = false
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
    // freq/lockedChannel/playState, only covered them visually).
    this.drawChrome(s)
    this.drawScale(s)
    this.drawVolume(s)
    this.drawSignal(s)
    this.drawVU(s)
    this.drawAntenna(s, 0)
    this.drawDial(s)
    this.drawFreq(s)
    this.drawHint(s)
    if (this.mode === 'locked' && this.lockedChannel) {
      this.showStation(s, this.lockedChannel)
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
    startStaticNoise(nearestChannel(this.freq).dist)
    this.scanTimer = setInterval(() => {
      let f = this.freq + SCAN_STEP
      if (f > FREQ_MAX) f = FREQ_MIN
      this.retune(s, f)
      if (Math.abs(f - startFreq) < clearance) return
      const { dist } = nearestChannel(f)
      if (dist <= LOCK_THRESHOLD) this.tryLock(s)
    }, 90)
  },

  // Added 2026-08-20 -- presets used to jump straight to the target
  // frequency and lock instantly, which read as a hard cut rather than a
  // tuning action (Matthew: a brief scan/static beat instead of an instant
  // change). Sweeps the dial from wherever it is to the preset's frequency
  // over a handful of quick steps with the static bed under it, then locks.
  presetTune(s, channel) {
    this.stopScan()
    if (this.mode === 'locked') this.enterSeeking(s)
    const startFreq = this.freq
    const target = channel.freq
    const steps = 6
    let i = 0
    this.scanning = true
    this.setStatus(s, 'TUNING...', false)
    // Tune-in whoosh (14th pass, Matthew: "a fun 'tune-in' whoosh when
    // jumping straight to a preset (1-9)") -- plays once, under the sweep,
    // distinct from both the plain seek-static hiss and the ident tone
    // that plays once the sweep lands and locks a few hundred ms later.
    playPresetWhoosh()
    startStaticNoise(nearestChannel(this.freq).dist)
    this.scanTimer = setInterval(() => {
      i += 1
      const f = i >= steps ? target : startFreq + (target - startFreq) * (i / steps)
      this.retune(s, f)
      if (i >= steps) {
        this.scanning = false
        clearInterval(this.scanTimer)
        this.scanTimer = null
        stopStaticNoise()
        this.tryLock(s)
      }
    }, 55)
  },

  // Absolute click-to-position would need to invert the tube's fill/curve
  // geometry to be accurate, so instead the dial behaves like a real tuning
  // knob: drag distance maps to a frequency delta, not a screen position.
  onPointerDown(s, e) {
    // 22nd pass: touch now has its own dedicated tap/swipe gesture layer
    // (onTouchStart/onTouchEnd below) instead of being derived from this
    // continuous drag math, which is tuned for a mouse dragging the dial a
    // few pixels at a time -- ignoring touch here keeps this path
    // desktop-mouse-only, same as it's always been.
    if (e.pointerType === 'touch') return
    if (e.target && e.target.closest('#ytDock')) return
    this.dragging = true
    this.dragLastX = e.clientX
  },
  onPointerMove(s, e) {
    if (!this.dragging) return
    if (!this.poweredOn) return
    if (this.guideOpen) return
    const rect = s.canvas.getBoundingClientRect()
    const dx = e.clientX - this.dragLastX
    this.dragLastX = e.clientX
    const dFreq = (dx / rect.width) * (FREQ_MAX - FREQ_MIN)
    this.stopScan()
    if (this.mode === 'locked') this.enterSeeking(s)
    this.retune(s, this.freq + dFreq)
    this.setStatus(s, 'SEEKING', false)
    // Same continuous bed as arrow-seeking (12th pass) -- idempotent.
    startStaticNoise(nearestChannel(this.freq).dist)
  },

  // 22nd pass -- mobile has no keyboard, so it had no way to power on, lock
  // a station, or change channels at all before this. Tap (minimal
  // movement, quick) powers on when off, closes the guide if somehow open,
  // otherwise toggles play/pause; a clean horizontal swipe steps to the
  // next/previous station in dial order (same list [1-9] presets use).
  // Deliberately its own gesture layer rather than reusing the mouse-drag
  // seek math above -- a thumb swipe covering the whole screen width isn't
  // the same gesture as a precise mouse drag on the dial.
  onTouchStart(s, e) {
    if (e.target && e.target.closest && e.target.closest('#ytDock')) return
    if (e.touches.length !== 1) { this._touchActive = false; return } // ignore pinch/multi-touch
    this._touchActive = true
    const t = e.touches[0]
    this._touchStartX = t.clientX
    this._touchStartY = t.clientY
    this._touchStartTime = Date.now()
    e.preventDefault()
  },
  onTouchEnd(s, e) {
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
      this.togglePlayPause(s)
      return
    }
    if (!this.poweredOn || this.guideOpen) return
    if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy)) {
      // Swipe left (finger moves right-to-left, dx negative) advances to
      // the next station up the dial, mirroring how a left swipe reads as
      // "forward" in a carousel; swipe right goes back one.
      this.stepChannel(s, dx < 0 ? 1 : -1)
    }
  },
  stepChannel(s, dir) {
    const order = CHANNEL_PRESET_ORDER
    let idx = this.lockedChannel ? order.indexOf(this.lockedChannel) : -1
    if (idx === -1) idx = order.indexOf(nearestChannel(this.freq).channel)
    if (idx === -1) idx = 0
    const next = order[(idx + dir + order.length) % order.length]
    this.presetTune(s, next)
  },

  key(s, e) {
    // Power toggle (12th pass) -- while off, every key except P is ignored
    // outright so nothing (seek, scan, presets, volume) can act on a set
    // that isn't switched on.
    if (!this.poweredOn) {
      if (e.key === 'p' || e.key === 'P') { e.preventDefault(); this.powerUp(s) }
      return
    }
    // Guide overlay (15th pass; paged 18th pass) -- while open, ANY key
    // closes it (matches the "[any other key] CLOSE" hint on both guide
    // pages) except ArrowRight on page 1 / ArrowLeft on page 2, which flip
    // to the other page instead. Intercepted before the switch below so
    // nothing else (seek, lock, presets) can act underneath the overlay.
    if (this.guideOpen) {
      e.preventDefault()
      if (this.guidePage === 1 && e.key === 'ArrowRight') { this.guidePage = 2; this.drawGuidePage(s); return }
      if (this.guidePage === 2 && e.key === 'ArrowLeft') { this.guidePage = 1; this.drawGuidePage(s); return }
      this.closeGuide(s)
      return
    }
    switch (e.key) {
      case 'ArrowLeft': e.preventDefault(); this.seekStep(s, -SEEK_STEP); break
      case 'ArrowRight': e.preventDefault(); this.seekStep(s, SEEK_STEP); break
      case 'Enter': e.preventDefault(); this.tryLock(s); break
      case 's': case 'S': e.preventDefault(); this.scanning ? this.stopScan() : this.startScan(s); break
      case ' ': e.preventDefault(); this.togglePlayPause(s); break
      case 'n': case 'N': {
        e.preventDefault()
        // 28th pass: Shift+N enters hidden station-hopping mode (secret
        // feature). In this mode, N cycles to the next station's first track
        // instead of just skipping within the current station. Shift+N again
        // exits hopping mode and returns to normal.
        if (e.shiftKey) {
          this.stationHopping = !this.stationHopping
          this.setStatus(s, this.stationHopping ? 'HOP MODE' : 'NORMAL')
          return
        }
        // Normal skip (within-station or station-hop next, depending on mode)
        if (this.stationHopping && this.locked) {
          const chIdx = CHANNELS.findIndex(ch => ch.id === this.lockedChannel.id)
          const nextIdx = (chIdx + 1) % CHANNELS.length
          this.presetTune(s, CHANNELS[nextIdx])
        } else {
          this.skip(s)
        }
        break
      }
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
      // 11th pass (2026-08-20): 4 new stations brought CHANNELS back up to
      // 9 -- preset keys match its length again, same pattern as the 10th
      // pass's drop to 5.
      // 22nd pass: back to `1`-`9` only -- HACKBACK's `0` binding (20th
      // pass) only made sense while there were 10 stations; dropping OUTLAW
      // brought the roster back to 9 (Matthew: "9 channels is our max for
      // now"), so `0` is retired and HACKBACK now falls wherever it lands
      // in CHANNEL_PRESET_ORDER like everything else.
      case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8': case '9': {
        e.preventDefault()
        // 17th pass: CHANNEL_PRESET_ORDER (freq-sorted), not CHANNELS
        // (chronological add-order) -- see its definition for why -- so
        // preset number always matches left-to-right position on the dial.
        const ch = CHANNEL_PRESET_ORDER[Number(e.key) - 1]
        if (ch) this.presetTune(s, ch)
        break
      }
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

    // Idle shimmer on the dial while seeking, so the empty band doesn't feel
    // dead between channels. Cheap: only touch a handful of cells per frame.
    if (this.mode === 'seeking' && Math.random() < 0.15) {
      const x = DIAL_X0 + Math.floor(Math.random() * (DIAL_X1 - DIAL_X0))
      const cursorCol = freqToCol(this.freq)
      if (x !== cursorCol) {
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

    // Always-on idle phosphor shimmer (14th pass, Matthew: "a subtle
    // always-on scanline or phosphor-flicker shimmer even at idle so the
    // CRT never looks perfectly static"). Independent of mode/lock state --
    // unlike the dial shimmer above, this runs whenever the set is powered,
    // locked or not. Only ever touches a box-BOTTOM border row: those are
    // plain '─' the full width (drawBoxBottom has no embedded label, unlike
    // drawBoxTop), so a random cell can never clobber a panel title. Briefly
    // brightens one cell, then a timer fades it back to the resting MUTED.
    if (Math.random() < 0.05) {
      const rows = [TUNER_BOT_Y, STATION_BOT_Y, NOWPLAYING_BOT_Y, METERS_BOT_Y]
      const y = rows[Math.floor(Math.random() * rows.length)]
      let x = BOX_X0 + 1 + Math.floor(Math.random() * (BOX_X1 - BOX_X0 - 1))
      // 18th pass: METERS_BOT_Y now has a '┻' T-junction at
      // METERS_DIVIDER_X (see drawChrome) -- this shimmer assumed every
      // bottom-border cell was a plain '─' and would permanently stomp the
      // junction with a dash if it ever landed there (writes '─' both for
      // the flash and the fade-back). Nudge off that one column instead.
      if (y === METERS_BOT_Y && x === METERS_DIVIDER_X) x += x < BOX_X1 - 1 ? 1 : -1
      s.term.put(x, y, '─', DIM)
      setTimeout(() => { if (this.poweredOn) s.term.put(x, y, '─', MUTED) }, 90 + Math.random() * 80)
    }
  },
}
