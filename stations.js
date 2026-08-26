// SIGNAL -- the station roster. Pure data: STATIONS, the secret stations,
// and the realTrack() helper every entry is built from. No imports, no DOM,
// so Node can `import()` this file directly -- which is what lets
// tools/stations-to-md.js and tools/verify-roster.js read the roster as
// real JavaScript instead of brace-matching it out of source text and
// eval'ing it (2026-08-25 audit; carved out of program.js, where it had
// lived as lines ~93-1071, comments and all).
//
// program.js imports this under the same `?v=<build stamp>` URL main.js
// uses -- see main.js for why the query string matters. tools/network.html
// reads and patches THIS file's `tracks: [...]` blocks now, not program.js.
//
// Content-ops rules (see README "Content ops"): verify every YouTube ID
// against oEmbed before adding it; taglines 35 chars or under; 9 public
// stations is the ceiling (they map onto the 1-9 preset keys); re-run
// `node tools/stations-to-md.js` after editing so stations.md stays in sync.

/** Real, searched-and-verified (YouTube oEmbed) tracks per station, so each
 *  station is at least genuinely different from the others -- the 4 recycled
 *  placeholder IDs (one of them literally the Rick Astley rickroll) were the
 *  same clips on every station, which is what made it impossible to
 *  actually evaluate. Each station now carries 2 real tracks and nothing
 *  else; real per-station playlists (several hours, no near-term repeat)
 *  are the next real step. */
export function realTrack(youtubeId, title, artist) {
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
export const STATIONS = [
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
      // 2026-08-25: +8, all new artists (the roster had 23 artists across 32
      // tracks and was leaning on repeats -- STP x3, four others x2). Picked
      // to widen the "ripple effects" half of the desc rather than deepen the
      // Seattle core: the Sub Pop label-mates (Afghan Whigs), the Aberdeen
      // progenitor the scene grew out of (Melvins), the NYC noise-rock root
      // that made it possible (Sonic Youth), and the era's radio angst from
      // outside the northwest. Every ID oEmbed-verified on the artist's own
      // channel or VEVO -- no fan uploads in this batch, which the Blind
      // Melon rejection ("not radio version") argues for.
      realTrack('fxvkI9MTQw4', 'Cannonball', 'The Breeders'),
      realTrack('SDTSUwIZdMk', 'Kool Thing', 'Sonic Youth'),
      realTrack('jC9AUR-iTo0', 'Seether', 'Veruca Salt'),
      realTrack('o9mJ82x_l-E', 'Hey Man, Nice Shot', 'Filter'),
      realTrack('jBfygUiS50g', 'Unsung', 'Helmet'),
      realTrack('oJwWmz8Mp3U', 'Debonair', 'The Afghan Whigs'),
      realTrack('3RMmIJn_4FA', 'Honey Bucket', 'Melvins'),
      realTrack('XFkzRNyygfk', 'Creep', 'Radiohead'),
      // 2026-08-26: pending queue approved wholesale and drained -- all 33
      // proposals across 8 stations landed at once, so these arrived as a
      // batch rather than a curated pass. Every one was re-verified at
      // approval time (alive, US-available, embeddable, no duplicate ID and
      // no title collision) rather than trusted from its 2026-08-23/24
      // proposal check.
      realTrack('fTqyUz_jSIo', 'Far Behind', 'Candlebox'),
      realTrack('ah5gAkna3jI', 'Hey Jealousy', 'Gin Blossoms'),
      realTrack('xsJ4O-nSveg', 'Lightning Crashes', 'Live'),
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
      // 2026-08-26: 24 -> 30, all 6 new artists. The last public station left
      // at its original size. Unlike the four widened before it, this one was
      // never repeat-heavy (24 tracks / 22 artists), so these are additions to
      // a healthy roster rather than a correction to a skewed one.
      //
      // All six sit unambiguously in ambient/drone, deliberately nowhere near
      // the neoclassical boundary this station has drawn twice (Max Richter's
      // "On the Nature of Daylight" and Nils Frahm's "Says" were both rejected
      // as too straightforwardly classical). Worth flagging that the boundary
      // is not actually settled: "Says" is still on the roster above, and
      // Einaudi's "Nuvole Bianche" sits beside it while the profile blesses
      // Einaudi by name. Nothing here depends on resolving that -- these are
      // drone, environmental ambient and minimal techno-ambient, not piano.
      //
      // Widens the geography too, which the roster was thin on: Japanese
      // environmental ambient (Yoshimura, Takada), Norwegian arctic ambient
      // (Biosphere), German minimal (Gas) and Canadian (Loscil).
      //
      // All six are "- Topic", i.e. label-delivered. Skipped the four already
      // queued in pending-tracks.json for this station (Tim Hecker, Grouper,
      // Celer, Rafael Anton Irisarri) so this batch can't collide with that
      // review. Aphex Twin's is catalogued "#3" -- Selected Ambient Works
      // Volume II is formally untitled -- but every listener knows it as
      // "Rhubarb", so that is what the dial says.
      realTrack('TvGXQXN5CQ4', 'Green', 'Hiroshi Yoshimura'),
      realTrack('csnryqUpO-g', 'Kobresia', 'Biosphere'),
      realTrack('75O11W5EZAU', 'Rhubarb', 'Aphex Twin'),
      realTrack('bWw6hMgRILQ', 'Pop 1', 'Gas'),
      realTrack('MYtX2zYlfdA', 'Estuarine', 'Loscil'),
      realTrack('g7Jgc1bVWbo', "Mr. Henri Rousseau's Dream", 'Midori Takada'),
      // 2026-08-26: pending queue approved wholesale and drained -- all 33
      // proposals across 8 stations landed at once, so these arrived as a
      // batch rather than a curated pass. Every one was re-verified at
      // approval time (alive, US-available, embeddable, no duplicate ID and
      // no title collision) rather than trusted from its 2026-08-23/24
      // proposal check.
      realTrack('25zpPS_OdhQ', 'Virginal II', 'Tim Hecker'),
      realTrack('Vi3bSG3jL_M', 'Vital', 'Grouper'),
      realTrack('bFNbOvzvvYI', 'Oro Oro', 'Celer'),
      realTrack('osA0Wl_-EHU', 'Reprisal', 'Rafael Anton Irisarri'),
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
      // 2026-08-26: pending queue approved wholesale and drained -- all 33
      // proposals across 8 stations landed at once, so these arrived as a
      // batch rather than a curated pass. Every one was re-verified at
      // approval time (alive, US-available, embeddable, no duplicate ID and
      // no title collision) rather than trusted from its 2026-08-23/24
      // proposal check.
      realTrack('80TfG7C9azA', 'Kids in America', 'Kim Wilde'),
      realTrack('9wyzRycjNH4', 'Don\'t Go', 'Yazoo'),
      realTrack('mScWSckEzew', 'Christian', 'China Crisis'),
      realTrack('8o2XHjvaEWE', 'Smalltown Boy', 'Bronski Beat'),
      realTrack('QW_m8lhZbQQ', 'Living on the Ceiling', 'Blancmange'),
      realTrack('7zzLU1ato2w', 'Ghosts', 'Japan'),
      realTrack('IasCZL072fQ', 'Words', 'Missing Persons'),
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
      // 2026-08-25: 20 -> 28. The 60th pass took 20 of a pasted 40-track
      // playlist and that source list is gone (it lived in session context,
      // never in the repo), so this second cut is picked against the brief in
      // the field notes above rather than the original 40 -- expect no overlap
      // with whatever the deferred 20 were.
      //
      // Chosen to fill what the first cut under-served: the "lush horns" and
      // "low-lit lounge" half of the desc (T-Bone Walker's 1947 archetype,
      // Charles Brown's after-hours piano, Z.Z. Hill's Malaco soul-blues),
      // and the reverberant-solo half (Albert Collins, Roy Buchanan, Gary
      // Moore). Big Mama Thornton is the fourth woman on a station that had
      // three. All 8 are new artists; era spread runs 1947 -> 1990.
      //
      // Sourced as Topic (label-delivered) uploads, which is this station's
      // norm -- 11 of the first 20 are Topic, because pre-1970 blues catalog
      // has no official video to point at. Every one of these songs has
      // several near-identical Topic uploads across compilations, so picks
      // were made on duration to avoid a live take, an edit or a rework
      // (John Lee Hooker was dropped from this batch for exactly that
      // ambiguity, and Koko Taylor's "I'd Rather Go Blind" for colliding
      // with the Etta James cut already above).
      realTrack('UhzAmBG96ZU', 'Call It Stormy Monday', 'T-Bone Walker'),
      realTrack('-iwKH86SwdM', 'Black Night', 'Charles Brown'),
      realTrack('U-T394Ak2HU', 'The Sky Is Crying', 'Elmore James'),
      realTrack('dzZyt6m2v64', 'Ball and Chain', 'Big Mama Thornton'),
      realTrack('pSTZxtvMKDQ', 'If Trouble Was Money', 'Albert Collins'),
      realTrack('MVrV-Bk8mvg', 'The Messiah Will Come Again', 'Roy Buchanan'),
      realTrack('n0_RGIcIfZ4', 'Down Home Blues', 'Z.Z. Hill'),
      realTrack('0dWDM0k3OE8', 'Still Got the Blues', 'Gary Moore'),
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
      // 2026-08-25: 32 -> 40, all 8 new artists. This station was the most
      // repeat-heavy on the roster -- 32 tracks across only 20 artists, with
      // nine of them carrying 2-3 each -- so depth was the wrong axis and
      // every pick here is a name the station didn't already have.
      //
      // Sourcing is the inverse of the guitar stations: only ~9 of the first
      // 32 are artist/label/Topic, the rest fan and archive channels, because
      // most of this catalogue was never officially uploaded. These 8 land
      // better than that average -- 5 Topic, Victor and Sony Music (Japan)
      // direct, and MUSIC Liverary, already trusted here for EPO's "Down
      // Town". That matters for the profile's mis-credit rule (a "Casiio"
      // cover once turned out to be Yasuha's original): label-delivered
      // uploads carry reliable artist credit, fan re-uploads don't.
      //
      // Checked for region-locking as well as oEmbed, which this station
      // needs and the others don't -- Japanese label uploads are commonly
      // geo-fenced, and a 200 from oEmbed says nothing about it. All 8 are
      // US-available, embeddable and status OK. Dodged in the process: a
      // Night Tempo "Showa Groove Mix" (modern remix), a Terao live cut, a
      // bossa-nova cover, and an Ohtaki "Original Basic Track" that is a
      // backing-track outtake rather than the song.
      realTrack('WQ-fuYZnVCE', 'Midnight Pretenders', 'Tomoko Aran'),
      realTrack('E3HBwtJNplQ', 'Blue Lagoon', 'Masayoshi Takanaka'),
      realTrack('_-TMxqEZE5s', 'Dress Down', 'Kaoru Akimoto'),
      realTrack('gIAHxr8RwVA', 'Exotic Yokogao', 'Hitomi Tohyama'),
      realTrack('L-hyY-1luHs', 'Kimi wa Tennen Shoku', 'Eiichi Ohtaki'),
      realTrack('ZYeVfKtIH4c', 'Ruby no Yubiwa', 'Akira Terao'),
      realTrack('2tiLgAG02QM', 'L.A. Night', 'Yasuko Agawa'),
      realTrack('AD3sEAGRGv4', 'Just a Joke', 'Yurie Kokubu'),
      // 2026-08-26: pending queue approved wholesale and drained -- all 33
      // proposals across 8 stations landed at once, so these arrived as a
      // batch rather than a curated pass. Every one was re-verified at
      // approval time (alive, US-available, embeddable, no duplicate ID and
      // no title collision) rather than trusted from its 2026-08-23/24
      // proposal check.
      realTrack('r63lZvPsj5U', 'Neat na Gogo San-ji', 'Miki Matsubara'),
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
      // 2026-08-26: pending queue approved wholesale and drained -- all 33
      // proposals across 8 stations landed at once, so these arrived as a
      // batch rather than a curated pass. Every one was re-verified at
      // approval time (alive, US-available, embeddable, no duplicate ID and
      // no title collision) rather than trusted from its 2026-08-23/24
      // proposal check.
      realTrack('X3wVDrc8000', 'Launcher', 'Highway Superstar'),
      realTrack('jsE7RFs7bHk', 'Never Sleep Again', 'Betamaxx'),
      realTrack('9EJJlr7Dopk', 'Ignition', 'Meteor'),
      realTrack('HJti6_oiR1A', 'Feral', 'Dan Terminus'),
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
    // tagline's own "counter clicks" made literal). Went through CLOUDS
    // (47th), GEIGER (50th), and BLAST FIELD (59th) as ATOMIC's assigned
    // effect over several passes. 65th pass -- ISOTOPE MAP (the pulsing-
    // blobs lissajous effect, originally shelved unassigned back in the
    // 52nd pass) is promoted to ATOMIC's default here, with a reactivity
    // pass to match. CLOUDS, GEIGER, and BLAST FIELD (67th pass, the last
    // of the three -- see the removal note above drawVisualizerFrame) are
    // all gone for good now.
    visual: 'isotope',
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
      // 2026-08-25: 29 -> 37, all 8 new artists. This station had become the
      // repeat-heaviest on the roster after CITY LIGHTS was widened -- 29
      // tracks across 21 artists, eight of them doubled up -- so breadth, not
      // depth.
      //
      // Weighted deliberately away from New York. The coast-balance note above
      // says not to skew without checking first, and the check says the roster
      // was already NY-heavy (roughly half of it), so only three of these are
      // NY: Public Enemy, Biggie, Big Daddy Kane. The rest spread the map the
      // desc claims -- New Jersey (Queen Latifah), Houston (Geto Boys),
      // Chicago (Common), Oakland (Digital Underground) and Philadelphia
      // (The Roots).
      //
      // Queen Latifah is the first woman on the station, which had none across
      // 21 artists -- a real hole in any golden-age roster, not a quota.
      //
      // Deliberately skipped: the six artists already sitting in
      // pending-tracks.json for this station (Big L, EPMD, Jeru the Damaja,
      // N.W.A, UGK, Goodie Mob), so this batch can't collide with that review.
      // Vetted with tools/audition.js, which caught a 2020 Fight The Power
      // remix and several live cuts before they got as far as the page.
      realTrack('mmo3HFa2vjg', 'Fight the Power', 'Public Enemy'),
      realTrack('7Y8VPQcPHhY', 'Juicy', 'The Notorious B.I.G.'),
      realTrack('nqPlF5Mn32M', "Ain't No Half-Steppin'", 'Big Daddy Kane'),
      realTrack('f8cHxydDb7o', 'U.N.I.T.Y.', 'Queen Latifah'),
      realTrack('7vHA5lqrMMI', 'Mind Playing Tricks on Me', 'Geto Boys'),
      realTrack('TrUERC2Zk64', 'I Used to Love H.E.R.', 'Common'),
      realTrack('PBsjggc5jHM', 'The Humpty Dance', 'Digital Underground'),
      realTrack('_qzacv8dtb4', 'What They Do', 'The Roots'),
      // 2026-08-26: pending queue approved wholesale and drained -- all 33
      // proposals across 8 stations landed at once, so these arrived as a
      // batch rather than a curated pass. Every one was re-verified at
      // approval time (alive, US-available, embeddable, no duplicate ID and
      // no title collision) rather than trusted from its 2026-08-23/24
      // proposal check.
      realTrack('gNoDgHnB1Hk', 'Ebonics', 'Big L'),
      realTrack('5aCYQ1fRQc8', 'Strictly Business', 'EPMD'),
      realTrack('Yid-UtHPpeI', 'Come Clean', 'Jeru the Damaja'),
      realTrack('TMZi25Pq3T8', 'Straight Outta Compton', 'N.W.A'),
      realTrack('MnP1XmxyqxA', 'Pocket Full of Stones', 'UGK'),
      realTrack('OGy4bmG5SJw', 'Cell Therapy', 'Goodie Mob'),
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
      // 2026-08-26: pending queue approved wholesale and drained -- all 33
      // proposals across 8 stations landed at once, so these arrived as a
      // batch rather than a curated pass. Every one was re-verified at
      // approval time (alive, US-available, embeddable, no duplicate ID and
      // no title collision) rather than trusted from its 2026-08-23/24
      // proposal check.
      realTrack('kQ_sSs8pr1g', 'Ruffneck', 'Freestylers'),
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
export const STATION_PRESET_ORDER = [...STATIONS].sort((a, b) => a.freq - b.freq)

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
export const NIN_STATION = {
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
      // 2026-08-26: pending queue approved wholesale and drained -- all 33
      // proposals across 8 stations landed at once, so these arrived as a
      // batch rather than a curated pass. Every one was re-verified at
      // approval time (alive, US-available, embeddable, no duplicate ID and
      // no title collision) rather than trusted from its 2026-08-23/24
      // proposal check.
      realTrack('wOoWkXEz-5E', 'Sin', 'Nine Inch Nails'),
      realTrack('GJ-w0TAE-mQ', 'Reptile (Woodstock 94)', 'Nine Inch Nails'),
      realTrack('FvVDlbzsKR4', 'Survivalism', 'Nine Inch Nails'),
      realTrack('yA281OuU3rk', 'Copy of A (VEVO Presents)', 'Nine Inch Nails'),
      realTrack('1RN6pT3zL44', 'Came Back Haunted', 'Nine Inch Nails'),
      realTrack('gDV-dOvqKzQ', 'Less Than', 'Nine Inch Nails'),
      realTrack('yzQrdX-E2iY', 'God Break Down the Door', 'Nine Inch Nails'),
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
export const SECRET_STATIONS = [NIN_STATION]
