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
  { id: 'static-bloom', freq: 137.4, callsign: 'STATIC BLOOM', tagline: 'flannel and feedback, transmitting', // 19th pass: trimmed to <=35 chars
    like: 'Nirvana, Soundgarden, Alice In Chains', // 18th pass: guide station reference
    // Matthew 8/20: "I don't hear a station id tone for static bloom." The
    // ident itself was firing fine (confirmed by hooking createOscillator
    // in a live tab) -- it was just pitched a full octave below every other
    // channel's ident (130.8-196 vs. 300+ everywhere else), quiet-to-silent
    // on typical laptop/built-in speakers for a 160ms burst. Same 4-note
    // shape, one octave up: still the lowest/moodiest ident of the set,
    // just actually audible.
    ident: [392.0, 349.2, 311.2, 261.6],
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
    ] },
  { id: 'relic-signal', freq: 219.8, callsign: 'RELIC SIGNAL', tagline: 'the old masters, undying carrier',
    like: 'Beethoven, Chopin, Vivaldi',
    ident: [523.3, 659.3, 784.0, 1046.5],
    tracks: [
      realTrack('IvrzJ8uH1PI', 'Symphony No. 5', 'Beethoven'),
      realTrack('fZrm9h3JRGs', 'Suite bergamasque: III. Clair de lune', 'Debussy / Lang Lang'),
      realTrack('XWOC6xImhtg', 'Air on the G String', 'Bach'),
      realTrack('nO8uUTB2RlA', 'Nocturne Op. 9 No. 2', 'Chopin'),
      realTrack('3LiztfE1X7E', 'The Four Seasons: Spring', 'Vivaldi'),
      realTrack('Rj6Gk3YFdaQ', 'Gymnopedie No. 1', 'Erik Satie'),
      realTrack('roC1jDB3IUo', 'Canon in D Major', 'Pachelbel'),
      realTrack('hcpM0yN7p0c', 'Eine kleine Nachtmusik', 'Mozart'),
      realTrack('OqvHWUZZdP0', 'In the Hall of the Mountain King', 'Grieg'),
      realTrack('8UfpgT9FMAk', 'The Planets: Mars, the Bringer of War', 'Holst'),
    ] },
  { id: 'quiet-hours', freq: 356.2, callsign: 'QUIET HOURS', tagline: 'low power, long wave, lights out',
    like: 'Brian Eno, Sigur Rós, Grouper',
    ident: [392.0, 369.9, 329.6, 293.7],
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
    ] },
  { id: 'cold-wave', freq: 512.9, callsign: 'COLD WAVE', tagline: 'synthetic hearts, borrowed neon',
    like: 'New Order, The Cure, Depeche Mode',
    ident: [440.0, 554.4, 659.3, 880.0],
    tracks: [
      realTrack('9GMjH1nR0ds', 'Blue Monday \'88', 'New Order'),
      realTrack('1ASpBpT8bRQ', 'Just Like Heaven', 'The Cure'),
      realTrack('aGSKrC7dGcY', 'Enjoy the Silence', 'Depeche Mode'),
      realTrack('aGCdLKXNF3w', 'Everybody Wants to Rule the World', 'Tears for Fears'),
      realTrack('d5XJ2GiR6Bo', 'Enola Gay', 'Orchestral Manoeuvres in the Dark'),
      realTrack('uPudE8nDog0', "Don't You Want Me", 'The Human League'),
      realTrack('M1oqX84UKOE', "Don't You (Forget About Me)", 'Simple Minds'),
      realTrack('6KR52lEWLEM', 'Sweet Dreams (Are Made of This)', 'Eurythmics'),
      realTrack('0VhzcPnGHXQ', 'Cars', 'Gary Numan'),
      realTrack('iIpfWORQWhU', 'I Ran (So Far Away)', 'A Flock of Seagulls'),
    ] },
  { id: 'the-study', freq: 823.1, callsign: 'THE STUDY', tagline: 'lamp light, one more chapter', // 19th pass: trimmed
    like: 'Nujabes, Bonobo, Tycho',
    ident: [329.6, 293.7, 261.6, 220.0],
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
    ] },

  // 4 new stations added 2026-08-20, tracklists as given by Matthew, all
  // oEmbed-verified. Frequencies slotted into the gaps between the original
  // 5 (288.6 between RELIC SIGNAL/QUIET HOURS, 434.5 between QUIET
  // HOURS/COLD WAVE, 650.0 between COLD WAVE/THE STUDY, 878.9 past THE
  // STUDY toward the top of the band) so none of the original 5 moved.
  { id: 'high-rise', freq: 650.0, callsign: 'HIGH RISE', tagline: 'chrome towers, all-night funk',
    like: 'Tatsuro Yamashita, Anri, Mariya Takeuchi',
    ident: [523.3, 659.3, 830.6, 987.8],
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
    ] },
  { id: 'outlaw-frequency', freq: 288.6, callsign: 'OUTLAW', tagline: 'dust on the trail, a debt unpaid', // 21st pass: shortened from
    // "OUTLAW FREQUENCY" (Matthew: its station-ID ident was hard to hear/
    // pick out -- renaming for now rather than redesigning the ident tone)
    like: 'Johnny Cash, Ennio Morricone, Marty Robbins',
    ident: [220.0, 196.0, 174.6, 146.8],
    tracks: [
      realTrack('eJlN9jdQFSc', "God's Gonna Cut You Down", 'Johnny Cash'),
      realTrack('tpUdq8MLZ5k', 'Sleeping on the Blacktop', 'Colter Wall'),
      // Re-pointed from gothic Americana to spaghetti-western per Matthew
      // 8/20 ("more red dead redemption style") -- Chelsea Wolfe and Timber
      // Timbre dropped (doom-folk, not this lane), 8 tracks added spanning
      // the actual Morricone/outlaw-ballad/border-noir range.
      realTrack('Hac9A_f_nb4', 'The Good, the Bad and the Ugly (Main Theme)', 'Ennio Morricone'),
      realTrack('PYI09PMNazw', 'The Ecstasy of Gold', 'Ennio Morricone'),
      realTrack('zWm5WErkffQ', 'El Paso', 'Marty Robbins'),
      realTrack('M2d8dj4R80E', 'Ghost Riders In The Sky', 'Johnny Cash'),
      realTrack('B7E8n7I6IHw', 'Kate McCannon', 'Colter Wall'),
      realTrack('wrjmcyaBYoY', 'The Ballad of Robert Moore and Betty Coltrane', 'Nick Cave & The Bad Seeds'),
      realTrack('P3so4gpDRpQ', 'Gallo Del Cielo', 'Tom Russell'),
      realTrack('rIQTRvKq7Z0', 'Not Even Stevie Nicks', 'Calexico'),
    ] },
  { id: 'circuit-crush', freq: 434.5, callsign: 'CIRCUIT CRUSH', tagline: 'analog glow, the long drive home',
    like: 'Kavinsky, GUNSHIP, Perturbator',
    ident: [466.2, 587.3, 698.5, 932.3],
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
    ] },
  { id: 'atomic', freq: 878.9, callsign: 'ATOMIC', tagline: 'swing on while the counter clicks', // 19th pass: trimmed
    like: 'The Ink Spots, Roy Brown, The Five Stars',
    ident: [392.0, 493.9, 587.3, 493.9],
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
    ] },
  // 20th pass (Matthew: "add a new channel for 0 called Hackback with music
  // like tribe called quest, de la soul, slick rick, outkast, wu tang, MF
  // doom, MC solaar") -- golden-age/underground hip-hop station, bound to
  // the new preset key `0`. freq 893.7 sits one dial column short of the
  // absolute right edge, distinct from ATOMIC at 878.9.
  { id: 'hackback', freq: 893.7, callsign: 'HACKBACK', tagline: 'boom bap broadcast, deep cuts only',
    like: 'A Tribe Called Quest, De La Soul, Wu-Tang Clan',
    ident: [349.2, 293.7, 246.9, 220.0],
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
// The right half is a reserved, currently-blank column -- content TBD, not
// yet built. METERS_DIVIDER_X is the vertical divider's column; interior
// left range is BOX_X0+1..METERS_DIVIDER_X-1, right range is
// METERS_DIVIDER_X+1..BOX_X1-1.
const METERS_DIVIDER_X = 39

// GIAL nameplate (19th pass, Matthew: "add a stylized 'GIAL' nameplate for
// now in the empty spot in lower right", referencing a wireframe/italic
// display-font mockup he shared) -- fills the LEVELS right half reserved
// above. Generated with figlet's "slant" font (closest built-in match to
// that italic, slanted-outline look) rather than hand-drawn -- guarantees
// every row is genuinely monospace-aligned instead of eyeballed. All 5
// rows are exactly 23 chars wide (figlet pads them), which is what makes
// using one shared start column below safe. "For now" per Matthew -- this
// is a placeholder, not a final wordmark.
const NAMEPLATE_LINES = [
  '   _____________    __ ',
  '  / ____/  _/   |  / / ',
  ' / / __ / // /| | / /  ',
  '/ /_/ // // ___ |/ /___',
  '\\____/___/_/  |_/_____/',
]

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
function playIdent(freqs) {
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
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.18)
      t += 0.11
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
const STORAGE_KEY = 'signal:state:v1'
function saveSignalState(program) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      channelId: program.lockedChannel ? program.lockedChannel.id : null,
      trackId: program.currentTrack ? program.currentTrack.id : null,
      volume: program.volume,
      muted: program.muted,
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

    drawBoxTop(term, NOWPLAYING_TOP_Y, BOX_X0, BOX_X1, 'NOW PLAYING', MUTED)
    drawBoxSide(term, TRACK_Y, BOX_X0, BOX_X1, MUTED)
    drawBoxSide(term, PLAYBACK_Y, BOX_X0, BOX_X1, MUTED)
    drawBoxBottom(term, NOWPLAYING_BOT_Y, BOX_X0, BOX_X1, MUTED)

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

    // GIAL nameplate (19th pass) -- fills the LEVELS right half reserved
    // in the 18th pass. Static, drawn once here like the rest of the
    // chassis chrome (LED/brand-plate/grille/corner brackets above) rather
    // than redrawn per-frame, since it never changes. All 5 NAMEPLATE_LINES
    // rows share one start column (they're all exactly 23 chars, see that
    // const) so the glyph doesn't drift row to row.
    {
      const nameplateX = centerXRange(METERS_DIVIDER_X + 1, BOX_X1 - 1, NAMEPLATE_LINES[0])
      const nameplateRows = [VOL_Y, VOL_SIG_DIVIDER_Y, SIG_Y, VU_DIVIDER_Y, VU_Y]
      NAMEPLATE_LINES.forEach((line, i) => term.text(nameplateX, nameplateRows[i], line, DIM))
    }

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
    const midY = Math.round(term.rows / 2)
    term.text(centerX(term.cols, str), midY + 4, str, FAINT)
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

    // Scrolling-waveform VU state (11th pass -- see drawVU()).
    this.lastProgressDraw = 0
    this.vuSample = 0.03
    this.vuVelocity = 0
    this.vuTrace = new Array(16).fill(0) // 18th pass: trimmed from 24, see drawVU()

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
    const saved = loadSignalState()
    if (saved) {
      if (typeof saved.volume === 'number') this.volume = Math.min(100, Math.max(0, saved.volume))
      if (typeof saved.muted === 'boolean') this.muted = saved.muted
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

    for (let y = 0; y < term.rows; y++)
      for (let x = 0; x < term.cols; x++) term.put(x, y, ' ', NORMAL, 0)
    const midY = Math.round(term.rows / 2)
    const label = 'STANDBY'
    term.text(centerX(term.cols, label), midY, label, FAINT)
    const hint = '[P] POWER ON'
    term.text(centerX(term.cols, hint), midY + 2, hint, FAINT)
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
  // Power/lock LED (10th pass, skeuomorphism idea Matthew picked; moved
  // here 17th pass -- it used to sit in the title bar next to "SIGNAL", one
  // cell on the inverse plane, but Matthew found it "wasn't obvious" tucked
  // in next to the title text with nothing tying it to what it meant.
  // Living right in front of the bracketed status text instead makes the
  // connection explicit: it's the light for THIS status. Glyph+attr baked
  // into the same centered string as the bracket so the whole "● [ TEXT ]"
  // unit centers as one line rather than the LED floating off to one side).
  // 17th/18th pass (Matthew: the LED "seems less like something decorative
  // or a component because it changes position" -- true: the bracket text
  // varies in length per status ("SEEKING" vs "POWERING DOWN"), so the
  // whole centered "LED + bracket" unit's width changed every transition
  // and the LED visibly hopped left/right instead of staying put. Fixed by
  // padding the status word to STATUS_TEXT_WIDTH (13, the longest word
  // used -- "POWERING DOWN") before wrapping it in brackets, so `bracket`
  // and therefore `combined` are a fixed length on every call. The LED now
  // sits at the same column always; only the word inside the brackets
  // changes, which is the "status window/widget that doesn't change shape"
  // Matthew asked for.
  setStatus(s, text, active) {
    const { term } = s
    const locked = this.mode === 'locked'
    const seeking = this.mode === 'seeking' || this.scanning
    const ledGlyph = locked ? '●' : '○'
    const ledAttr = locked ? BRIGHT : seeking ? DIM : FAINT
    const padTotal = STATUS_TEXT_WIDTH - text.length
    const padL = Math.max(0, Math.floor(padTotal / 2))
    const padR = Math.max(0, padTotal - padL)
    const padded = ' '.repeat(padL) + text + ' '.repeat(padR)
    const bracket = `[ ${padded} ]`
    const combined = `${ledGlyph}  ${bracket}`
    for (let x = 0; x < term.cols; x++) term.put(x, STATUS_Y, ' ')
    const startX = centerX(term.cols, combined)
    term.put(startX, STATUS_Y, ledGlyph, ledAttr)
    term.text(startX + 3, STATUS_Y, bracket, active ? BRIGHT : MUTED)
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
    const midY = Math.round(term.rows / 2)

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
        term.text(centerX(term.cols, label), midY, label, FAINT)
        const hint = '[P] POWER ON'
        term.text(centerX(term.cols, hint), midY + 2, hint, FAINT)
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
    const midY = Math.round(term.rows / 2)
    playPowerOnSound()

    const bootLines = [
      'MODEL SG-1  SIGNAL RECEIVER',
      '[ OK ] TUBES WARMING',
      '[ OK ] TUNER CALIBRATED',
      '[ OK ] SIGNAL LOCK ARMED',
      '[ OK ] AUDIO PATH READY',
    ]
    // Pacing (15th pass, Matthew: "even longer cold boot please" -- a
    // second pass after the 14th pass already slowed this down once). Full
    // sequence now runs a little over 3s. Still one-shot on every power-on,
    // not just the very first cold one, so it stays worth the wait rather
    // than becoming an annoyance to click through on every session.
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
    term.text(centerX(term.cols, line), TRACK_Y, line, NORMAL)
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
    const target = playing ? 0.15 + Math.random() * 0.8 : 0.03
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
    const line1 = '[<-/->] SEEK   [ENTER] LOCK   [S] SCAN   [0-9] PRESETS   [B] BACK   [G] GUIDE'
    const line2 = '[SPACE] PLAY/PAUSE   [N] SKIP   [UP/DOWN] VOL   [M] MUTE   [P] POWER'
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
            self.player.setVolume(self.volume)
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
    this.loadTrack(track)
    saveSignalState(this)
  },
  adjustVolume(s, delta) {
    this.volume = Math.min(100, Math.max(0, this.volume + delta))
    if (this.muted) this.muted = false // touching volume un-mutes, like a real set
    if (this.ready && this.player) {
      this.player.setVolume(this.volume)
      if (!this.muted) this.player.unMute()
    }
    this.drawVolume(s)
    saveSignalState(this)
  },
  toggleMute(s) {
    this.muted = !this.muted
    if (this.ready && this.player) {
      if (this.muted) this.player.mute()
      else this.player.unMute()
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
    playIdent(channel.ident)
    this.setStatus(s, 'LOCKED', true)
    this.drawDial(s)
    const track = this.nextTrack(channel)
    this.currentTrack = track
    this.showStation(s, channel)
    this.showTrack(s, track)
    this.tuneToChannel(s, channel, track)
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
    put(15, '[0-9] PRESETS       [B] BACK            [SPACE] PLAY/PAUSE', DIM)
    put(16, '[N] SKIP            [UP/DOWN] VOL        [M] MUTE', DIM)
    put(17, '[P] POWER           [G] GUIDE', DIM)
    // 20th pass (Matthew: "for people that don't have youtube premium..
    // they hear ads. options?") -- decided against anything that tries to
    // detect/suppress the ad itself (that's ad-blocking circumvention
    // against YouTube's ToS, not something to build around even here) or a
    // bigger re-sourcing effort. This is the cheap, honest middle ground:
    // just tell people up front so an ad reads as expected rather than as
    // SIGNAL being broken.
    put(19, "Playback is real YouTube video -- ads may play without Premium", FAINT)
    put(20, 'SIGNAL v0.3', FAINT)
    put(22, '[->] STATIONS        [any other key] CLOSE', FAINT)
  },
  // Station reference table -- freq/name/tagline/artists-like, one entry
  // per 2 rows (header line, then an indented "like" line), 10 stations x 2
  // rows = 20 rows, rows 3-22 exactly (20th pass: grew from 9 to 10 with
  // HACKBACK, footer nudged down to row 24 to keep clear of it). Ordered by
  // CHANNEL_PRESET_ORDER (freq ascending, same order as the dial
  // left-to-right and the [0-9] preset keys after the 17th/20th passes)
  // rather than CHANNELS' chronological order, so the preset number shown
  // here matches what actually tunes to that station. HACKBACK is last in
  // freq order and bound to `0`, so its displayed preset number is 0, not
  // 10.
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
      const presetNum = i + 1 === 10 ? 0 : i + 1
      const y = startY + i * 2
      const header = truncate(`[${presetNum}] ${ch.freq.toFixed(1)}   ${ch.callsign} -- ${ch.tagline}`, term.cols - 4)
      term.text(4, y, header, BRIGHT)
      const detail = truncate(`like: ${ch.like}`, term.cols - 8)
      term.text(8, y + 1, detail, MUTED)
    })
    put(24, '[<-] ABOUT        [any other key] CLOSE', FAINT)
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
      case 'n': case 'N': e.preventDefault(); this.skip(s); break
      case 'ArrowUp': e.preventDefault(); this.adjustVolume(s, 10); break
      case 'ArrowDown': e.preventDefault(); this.adjustVolume(s, -10); break
      case 'm': case 'M': e.preventDefault(); this.toggleMute(s); break
      case 'p': case 'P': e.preventDefault(); this.powerDown(s); break
      // History back (14th pass, Matthew: "discovery/history -- sure").
      case 'b': case 'B': e.preventDefault(); this.goBack(s); break
      // Guide (15th pass, Matthew: "we also need a G for guide").
      case 'g': case 'G': e.preventDefault(); this.openGuide(s); break
      // 11th pass (2026-08-20): 4 new stations brought CHANNELS back up to
      // 9 -- preset keys match its length again, same pattern as the 10th
      // pass's drop to 5.
      // 20th pass: HACKBACK is the 10th station, bound to `0` since there's
      // no digit key past 9 -- treated as preset slot 10 (last, rightmost
      // on the dial) rather than slot 0.
      case '0': case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8': case '9': {
        e.preventDefault()
        // 17th pass: CHANNEL_PRESET_ORDER (freq-sorted), not CHANNELS
        // (chronological add-order) -- see its definition for why -- so
        // preset number always matches left-to-right position on the dial.
        const slot = e.key === '0' ? 10 : Number(e.key)
        const ch = CHANNEL_PRESET_ORDER[slot - 1]
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
