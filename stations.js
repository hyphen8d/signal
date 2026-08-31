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
  { id: 'distortion-field', band: 'ym', freq: 199.7, callsign: 'DISTORTION FIELD', tagline: "raw nerve, '90s angst",
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
    // CURATION HISTORY, and it lives out here above the array on purpose
    // (2026-08-28). Both notes below used to sit INSIDE tracks: [] as
    // headers introducing the batch beneath them -- which is only true for
    // as long as the order holds.
    //
    // It stopped holding. The dashboard's "sort by title" button reads like
    // a view control and is not one: it reorders the stored array, and a
    // save writes that order to this file. patchStationTracks did exactly
    // what it promises, carrying every comment across with its own anchor
    // track and losing none -- but "the eight below" then introduced
    // whatever happened to sort next, and one of the eight had been deleted
    // in the same edit. The comments survived and their meaning did not.
    //
    // That sort was reverted, so the batches below are contiguous again and
    // these notes could go back inside. They are staying out here. The sort
    // is one click, it looks like a view, and the next person to press it
    // will not be thinking about comment anchors; a note that names its own
    // tracks is true regardless of where they sit, and a note that says "the
    // eight below" is one button away from being a lie. That is the whole
    // argument, and it cost a curation pass to learn.
    //
    // 2026-08-25, +8 and all new artists: Cannonball (The Breeders), Kool
    // Thing (Sonic Youth), Seether (Veruca Salt), Hey Man, Nice Shot
    // (Filter), Unsung (Helmet), Honey Bucket (Melvins), Creep (Radiohead),
    // and Debonair (The Afghan Whigs) -- that last one dropped again on
    // 2026-08-28, which is why the note names it and the array doesn't.
    // The roster had 23 artists across 32 tracks and was leaning on repeats
    // (STP x3, four others x2), so this widened the "ripple effects" half of
    // the desc rather than deepening the Seattle core: the Sub Pop
    // label-mates, the Aberdeen progenitor the scene grew out of, the NYC
    // noise-rock root that made it possible, and the era's radio angst from
    // outside the northwest. Every ID oEmbed-verified on the artist's own
    // channel or VEVO -- no fan uploads in that batch, which the Blind Melon
    // rejection ("not radio version") argues for.
    //
    // 2026-08-26, the pending queue approved wholesale and drained: Far
    // Behind (Candlebox), Hey Jealousy (Gin Blossoms), Lightning Crashes
    // (Live). All 33 proposals across 8 stations landed at once, so these
    // arrived as a batch rather than as a curated pass. Every one was
    // re-verified at approval time (alive, US-available, embeddable, no
    // duplicate ID, no title collision) rather than trusted from its
    // 2026-08-23/24 proposal check.
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
      realTrack('bQtPzo-7AHs', 'Jeremy', 'Pearl Jam'),
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
      realTrack('fxvkI9MTQw4', 'Cannonball', 'The Breeders'),
      realTrack('SDTSUwIZdMk', 'Kool Thing', 'Sonic Youth'),
      realTrack('4YrK1Rq7AKk', 'Seether', 'Veruca Salt'),
      realTrack('o9mJ82x_l-E', 'Hey Man, Nice Shot', 'Filter'),
      realTrack('jBfygUiS50g', 'Unsung', 'Helmet'),
      realTrack('3RMmIJn_4FA', 'Honey Bucket', 'Melvins'),
      realTrack('XFkzRNyygfk', 'Creep', 'Radiohead'),
      realTrack('fTqyUz_jSIo', 'Far Behind', 'Candlebox'),
      realTrack('ah5gAkna3jI', 'Hey Jealousy', 'Gin Blossoms'),
      realTrack('xsJ4O-nSveg', 'Lightning Crashes', 'Live'),
      realTrack('sNh-iw7gsuI', 'Outshined', 'Soundgarden'),
      realTrack('-SRxWz3CDvg', 'This Gift', 'Mudhoney'),
      // 2026-08-29 -- added at the curator's request. RATM is the first
      // artist here from outside the grunge/alt-rock lane proper: 1992 and
      // squarely of-era, guitars and raw vocals and angst, but rap-metal
      // rather than Seattle or its ripple. Noted because this station has
      // already turned a candidate away on lane alone (Third Eye Blind,
      // issue #27) and the next pass should know this one was a deliberate
      // widening rather than a slip. Official Audio, not the Official
      // Video: the set plays audio-only, and a video's own baked-in
      // dialogue has cost a track before.
      realTrack('hVck6DkOi38', 'Bombtrack', 'Rage Against the Machine'),
      // 2026-08-29 -- five to take this station to 50. Two are canonical
      // gaps by artists already here (Nirvana and Pearl Jam each had two of
      // their three obvious ones); three are new artists, so the station
      // gains breadth rather than just depth -- 34 artists to 37.
      // Every one is the album cut on an official channel, checked on
      // DURATION and not just on flags: Alice In Chains' Rooster and the
      // Pumpkins' Today were both dropped from this batch for exactly that
      // reason, their VEVO uploads running 49s and 40s long because the
      // video carries an intro before the song. Seven Mary Three's
      // Cumbersome auditioned clean too and lost the last slot to Shine on
      // the same axis: it is a music video at the single edit, which is the
      // shape Blind Melon's No Rain was already turned away in.
      realTrack('n6P0SitRwy8', 'Heart-Shaped Box', 'Nirvana'),
      realTrack('q90DPCu_-zk', 'Even Flow', 'Pearl Jam'),
      realTrack('GpBFOJ3R0M4', 'Only Happy When It Rains', 'Garbage'),
      realTrack('OGKRr0NmgFM', 'Plowed', 'Sponge'),
      realTrack('iuB1A2VJ3-k', 'Shine', 'Collective Soul'),
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
  // DRIFT MODE (ambient/drone, 321.0) retired 2026-08-30 and replaced in
  // place by NEON STASIS below. Not a rename -- the QUIET HOURS -> DRIFT
  // MODE and MIDNIGHT NEON -> SYNAPSE passes kept their ids because only
  // the name moved; this one changes the lane outright, so it takes a new
  // id the way MOMENTUM -> MIDNIGHT NEON did. Three fields are inherited
  // deliberately rather than redesigned, and the reasons are on the station
  // itself below.
  //
  // The curation record for this lane is NOT repeated here: it lives in
  // tools/station-profiles.json under 'drift-mode', which is kept as a
  // retired entry the way 'momentum' is -- 38 trusted artists, the
  // unresolved neoclassical-boundary question, the full-album-upload hazard
  // and the 1:32 length floor. Read that before rebuilding this lane.
  //
  // The 50 tracks, preserved the way RELIC SIGNAL's were above, so it can
  // be stood back up without archaeology:
  //   Marconi Union, Weightless (UfcAVejslrU); Olafur Arnalds, Near Light
  //   (0kYc55bXJFI); Stars of the Lid, Adamord (YC6pJOH7bF0); Sigur Ros,
  //   Svefn-g-englar (8L64BcCRDAE); Grouper, Heavy Water / I'd Rather Be
  //   Sleeping (wLxbD0CkS30); William Basinski, Disintegration Loop 1.1
  //   (BD3D5mCjt7I); Brian Eno / Orchestra of the Swan, An Ending (Ascent)
  //   [arr. Le Page] (sfBlBs25Ewk); Brian Eno, Music for Airports: 1/1
  //   (QJ-polFpeX0); Brian Eno, Discreet Music (jl_z5JvrKlc); Nils Frahm,
  //   Says (dIwwjy4slI8); Stars of the Lid, Requiem for Dying Mothers, Pt.
  //   1 (-bc37fU36Vk); Hammock, Release (vTaBX_FoGWk); Tim Hecker, In the
  //   Fog I (ShW8YyueC1s); A Winged Victory for the Sullen, Requiem for
  //   the Static King, Pt. 1 (SwmRJQAx8eA); Johann Johannsson, A Song for
  //   Europa (ngUnLL4CAck); Harold Budd / Brian Eno, The Plateaux of
  //   Mirror (mwJTwG5r5Ks); Kali Malone, Cast of Mind (2CN1qXJJODI);
  //   Eluvium, Radio Ballet (nvtV4fvNJpY); Dustin O'Halloran, Opus 23
  //   (ONQt97F9KKI); Julianna Barwick, Keep Up the Good Work
  //   (SDru80vHKxU); Ryuichi Sakamoto, andata (pygwK0sBUdM); Poppy
  //   Ackroyd, Rain (5nCRNIKkKSs); Ludovico Einaudi, Nuvole Bianche
  //   (CQ8zglIXZi8); Slow Meadow, Everything Is a Memory (l81XVNzdZts);
  //   Hiroshi Yoshimura, Green (TvGXQXN5CQ4); Biosphere, Kobresia
  //   (csnryqUpO-g); Aphex Twin, Rhubarb (75O11W5EZAU); Gas, Pop 1
  //   (bWw6hMgRILQ); Loscil, Estuarine (MYtX2zYlfdA); Midori Takada, Mr.
  //   Henri Rousseau's Dream (g7Jgc1bVWbo); Tim Hecker, Virginal II
  //   (25zpPS_OdhQ); Grouper, Vital (Vi3bSG3jL_M); Celer, Oro Oro
  //   (bFNbOvzvvYI); Rafael Anton Irisarri, Reprisal (osA0Wl_-EHU);
  //   Fennesz, Transit (4qrEH65DeCE); Laraaji, The Dance No. 1
  //   (VmqZTrthXbA); Chihei Hatakeyama, Where Is the Map? (OtJQGz9mg0I);
  //   Christina Vantzou, The maitre d' is dead (Wu-7ZpcyKdA); Goldmund,
  //   Finding It There (t1UkSZGoCjs); Goldmund, Abandon (-x3sbeokO3A);
  //   Taylor Deupree, Rhytn (_482aKbIfdc); Susumu Yokota, Tobiume
  //   (eu6rBUu5-SA); Peter Broderick, In a Landscape (khBhiVhPD_Y); Peter
  //   Broderick, Carried (ga0UH5znGmw); Brian Eno, The Big Ship
  //   (2Tqy6be0Juc); Loscil, Enthalpy (IxGj-uXJtMY); Eluvium, Microfauna
  //   (hctJTb01NNI); Eluvium, Sore (00Ipvqnk5is); Rafael Anton Irisarri,
  //   RH Negative (ljypVwBF_e8); Rafael Anton Irisarri, Forever Ago is Now
  //   (nZyYcmK7a0I).
  //
  { id: 'neon-stasis', band: 'ym', freq: 321.0, callsign: 'NEON STASIS', tagline: 'closing time in a mall that never was',
    // 2026-08-30 -- mallsoft, the vaporwave subgenre that scores an empty
    // shopping centre: muzak and lounge sources slowed, drowned in hall
    // reverb and played back as if heard from the far end of a food court.
    // The two records that define the lane are the brief for it -- Cat
    // System Corp's "Palm Mall" and Groceries Store's "Yes We're Open".
    //
    // INHERITED FROM DRIFT MODE ON PURPOSE, not by neglect:
    //   freq 321.0 -- the "3-2-1, counting down to nothing" gag belongs to
    //     the NUMBER, not to the genre, and it reads at least as well over
    //     a mall at closing time as it did over a fade to black.
    //   glyph § -- kept, and it happens to suit the new lane better than
    //     the old one: two stacked loops read as an escalator.
    //   visual 'drift' -- the effect stays paired here, so the station this
    //     effect is named after is gone but the pairing in VISUAL_METHODS
    //     never dangles. Note what that pairing carries with it:
    //     drawVisualizerFrame excludes 'drift' from the downbeat bloom
    //     ("nothing about that station should thump"), which was written
    //     for ambient and is, if anything, more true of mallsoft.
    //   crt/meter/static -- long persistence, soft gun, the two laziest
    //     needles on the dial. A dead mall and a fade to black want the
    //     same tube. Untouched also because two comments elsewhere in this
    //     file quote these numbers by callsign.
    freqNote: '3-2-1, counting down to nothing',
    desc: 'Mallsoft and adjacent vaporwave -- muzak and lounge slowed to a crawl and drowned in reverb, until it sounds like it is playing four storeys away in a mall that closed decades ago, if it ever opened.',
    // The one identity field that is genuinely new. DRIFT MODE's was a
    // drone shape (D U D); this is a department-store PA chime -- an F
    // major triad falling away and then one bright tone left hanging
    // (D D U), the only ident on the dial with that shape. identTempo
    // stays at 1.35, still the slowest announce on the public roster: a
    // chime over a tannoy in an empty building has nowhere to be.
    ident: [523.3, 440.0, 349.2, 523.3],
    identTempo: 1.35,
    glyph: '§',
    static: 700,
    crt: { decay: 0.88, brightness: 1.12, bloomAmt: 1.7, scanMax: 0.6 },
    meter: { spring: 0.16, damping: 0.72, swing: 0.55 },
    visual: 'drift',
    tracks: [
      // The founding 25, 2026-08-30. All checked on the strict probe, not
      // just oEmbed: playabilityStatus, playableInEmbed and licence breadth
      // are clean on every one, and nothing here is age-gated or narrowly
      // licensed.
      //
      // ONE FINDING SHAPED THIS WHOLE BATCH, and it is the profile's first
      // constraint: this genre barely exists on YouTube as single tracks.
      // Searching the three records that DEFINE mallsoft -- Palm Mall,
      // Hologram Plaza, Yes We're Open, two of them the brief for this
      // station -- returned 18 candidates of which 18 were one-file album
      // rips running 30 to 90 minutes. Not one was usable. Track-name
      // searches in the same run came back almost entirely 2-to-5-minute
      // singles. So the mallsoft core here is thinner than the lane
      // deserves: Cat System Corp, Waterfront Dining, 18 Carat Affair and
      // ESPRIT are the real thing, and the rest reaches out to the vapor
      // foundations and adjacent artists that happen to have been
      // distributed as singles. Four more auditioned clean and were cut for
      // being albums rather than for anything wrong with them (luxury
      // elite's tv party 43:30, Infinity Frequencies' Computer Death 38:12,
      // MindSpring Memories 39:35, Windows96's How To See Through Walls
      // 36:47) -- the test is on the FILE, not on the runtime, since the
      // dial announces one title and those hold a dozen works each.
      //
      // EVERY NAME IS ROMANISED and that is not a style choice. ter-u16n.bdf
      // carries no CJK and no fullwidth Latin, and src/term.js falls back to
      // '?' for a missing glyph, so the uploads' own credits -- "猫 シ Corp.",
      // "ESPRIT 空想", "ダン·メイソン" -- would draw on the dial as rows of
      // question marks. Each artist is filed under its own Latin name
      // (catsystemcorp.bandcamp.com is where Cat System Corp comes from).
      // Telepath was dropped over exactly this: its track titles have no
      // honest romanisation, and inventing one is a mis-credit.
      //
      // Provenance is mixed, which is normal here the way it is for CITY
      // LIGHTS -- a Bandcamp-native genre has no official uploads to prefer.
      // Seven are "- Topic" (Home, Windows 96, Skylar Spence), three come
      // off artist or label channels (sunsetcorp is Lopatin's own, NmeshTV,
      // 100% Electronica), and the rest are archive and reupload channels.
      // That last group is the takedown exposure, so check-roster.mjs earns
      // its keep on this station more than on most.
      //
      // Saint Pepsi and Skylar Spence are the same person under two project
      // names, credited here as each upload credits itself rather than
      // collapsed -- the same call the roster makes elsewhere.
      realTrack('xAh-nngGZ6I', 'Sembikiya Restaurant', 'Cat System Corp'),
      realTrack('boofE5_HtkI', 'Roadtrips in Spring', 'Waterfront Dining'),
      realTrack('oVnx6cxbIwQ', 'What\'s Love', 'Waterfront Dining'),
      realTrack('Q-hG1GSVb-8', 'Paradise Vacations', 'Waterfront Dining'),
      realTrack('xe610x1aIjM', 'Death Became Her', '18 Carat Affair'),
      realTrack('pgZCxhhUBMs', 'Summer Night', 'ESPRIT'),
      realTrack('9tBj5zv4S1A', 'Dreaming', 'Dan Mason'),
      realTrack('aQkPcPqTq4M', 'Lisa Frank 420 / Modern Computing', 'Macintosh Plus'),
      realTrack('0T17gsA67og', 'Eccojam A1', 'Chuck Person'),
      realTrack('-RFunvF0mDw', 'Nobody Here', 'Sunset Corp'),
      realTrack('dN0czUMRMU8', 'Angel', 'Sunset Corp'),
      realTrack('l7nsljmRX_s', 'Dream Sequins', 'Nmesh'),
      realTrack('osKY4JMmmt0', 'Salsa Verde', 'Vaperror'),
      realTrack('RQxDM2K-hd0', 'Teen Pregnancy', 'Blank Banshee'),
      realTrack('OrR1TGQY20Y', 'Cherry Pepsi', 'Saint Pepsi'),
      realTrack('_hI0qMtdfng', 'Enjoy Yourself', 'Saint Pepsi'),
      realTrack('tCcamt8KZNQ', 'Fiona Coyne', 'Skylar Spence'),
      realTrack('aBhrEv5Z7uc', 'Resonance', 'Home'),
      realTrack('D__gB1DzHIc', 'Before the Night', 'Home'),
      realTrack('mbMoY1dxbEY', 'We\'re Finally Landing', 'Home'),
      realTrack('yRlBcUJZJHA', 'Half Moon', 'Home'),
      realTrack('X6PnNgYSa5s', 'Venus Aire', 'Windows 96'),
      realTrack('4GhvYoo4088', 'Hypnosis', 'Windows 96'),
      realTrack('7P4fatlUbvg', 'Transient Feeling', 'Windows 96'),
      realTrack('bxCU_P0Y1CE', 'Glass Prism', 'Windows 96'),
      // 2026-08-31 -- five more: three from Disconscious's Hologram Plaza,
      // the record this subgenre is usually dated from and which the founding
      // pass left off the roster entirely, plus two more Cat System Corp.
      //
      // The founding pass's FIRST constraint earned itself again, and at cost.
      // Searching on remembered titles returned nail-salon tutorials and
      // reef-tank reviews, because the titles were not real; and 'Late Night
      // Delight' -- an ALBUM, not a track -- returned four rips between 30 and
      // 37 minutes, which is that constraint's own worked example happening a
      // second time. The titles below were read off the Bandcamp listings
      // first and searched verbatim. That one change is the whole difference
      // between a run of album rips and a run of 3-to-5-minute singles.
      //
      // Two Palm Mall tracks were passed over on the FONT rule rather than on
      // taste, and the third case is the one worth writing down. 'Endless
      // TSUURO' and the fullwidth 'I consume, therefore I am' are undrawable
      // outright. But 'Employees Only' is credited on Palm Mall as '(with
      // GosutoMall)' spelled with an o-macron, which is Latin Extended-A --
      // outside ter-u16n's Latin-1 coverage, so it draws as '?' exactly like
      // the katakana does. The profile warns that fullwidth is the easier trap
      // to paste in by accident; a lone accented vowel in an otherwise ASCII
      // credit is easier still.
      //
      // Channels are spread deliberately across four rather than taking one
      // uploader's copy of the whole album. The profile's note that a
      // sample-based genre on a reupload channel carries real takedown
      // exposure cuts against concentration: one channel going down should not
      // cost the station five tracks at once. 'xtal' is already used here and
      // Electronic Gems is named in the profile as expected for this lane.
      realTrack('M-3esa1G50U', 'Lunar Food Court', 'Disconscious'),
      realTrack('7EuuRDGUMMA', 'Elevator Up', 'Disconscious'),
      realTrack('f0PSLV_b5g0', 'Fountain Plaza', 'Disconscious'),
      realTrack('k6xkSvMIvwk', 'Second Floor', 'Cat System Corp'),
      realTrack('Qg7vgIdDDno', 'Veni, Vidi, Emi', 'Cat System Corp'),
    ] },
  { id: 'cold-wave', band: 'ym', freq: 273.0, callsign: 'COLD WAVE', tagline: 'synthetic hearts, borrowed neon',
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
      realTrack('V83JR2IoI8k', 'She Blinded Me With Science', 'Thomas Dolby'),
      realTrack('xJeWySiuq1I', 'Vienna', 'Ultravox'),
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
      realTrack('IasCZL072fQ', 'Words', 'Missing Persons'),
      // 2026-08-29 -- fourteen to take COLD WAVE to 50. Five are canonical
      // gaps by artists already here; nine are new, taking the station from
      // 32 artists to 41, the widest single jump any station has had. (33 is
      // the acceptedArtists count, not the roster's -- Japan was on that list
      // with no track, see below.) The 80s synthpop lane turns out to be deep
      // rather than narrow:
      // nothing here needed the lane stretched, and the only rejection this
      // station has ever recorded is one song the curator did not like.
      //
      // Japan was on acceptedArtists from the beginning with no track, and
      // the reason is now known: Ghosts has no official or Topic upload at
      // all, only fan channels. Quiet Life does, so the artist arrives on a
      // different song than the one that was presumably wanted -- worth
      // knowing before anyone goes looking for Ghosts again.
      realTrack('zWo8joPm5hY', 'Everything Counts', 'Depeche Mode'),
      realTrack('xxDv_RTdLQo', 'Temptation', 'New Order'),
      realTrack('xik-y0xlpZ0', 'A Forest', 'The Cure'),
      realTrack('u1ZvPSpLxCg', 'Mad World', 'Tears for Fears'),
      realTrack('oJL-lCzEXgI', 'Hungry Like the Wolf', 'Duran Duran'),
      realTrack('OeuCBosUWp8', 'Quiet Life', 'Japan'),
      realTrack('CkfdXrEBzDw', 'Temptation', 'Heaven 17'),
      realTrack('V-xpJRwIA-Q', 'Dance Hall Days', 'Wang Chung'),
      realTrack('JcROTsR-2l4', 'Send Me an Angel', 'Real Life'),
      realTrack('FJZ8NH0HT_o', 'The Metro', 'Berlin'),
      realTrack('3bXEHGUvVrA', 'Whip It', 'Devo'),
      realTrack('Ya1ySdk9Oao', 'Oh Yeah', 'Yello'),
      realTrack('qMpBobAonKs', 'Hold Me Now', 'Thompson Twins'),
      realTrack('rc6vowZjWOs', 'You Spin Me Round (Like a Record)', 'Dead Or Alive'),
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
  // MOVED TO ZM 2026-08-31, from YM 567.8. Not a demotion and not a theme:
  // the second band needed founding residents that were already good, and
  // sending two established stations across is what stops ZM reading as the
  // annexe where new things are put until they prove themselves.
  //
  // 1234.0 keeps the joke the old number carried. 567.8's freqNote was
  // "counting up: 5-6-7-8", which does not exist inside ZM's 1000-1800, so
  // the gag was re-cut rather than dropped -- 1-2-3-4 is the same joke and,
  // if anything, reads faster.
  //
  // The spoken clips still say "five sixty-seven point eight" until the
  // frequency comes out of every clip (see tools/lib/voice-settings.mjs).
  // That is the ONE thing this move breaks, and it breaks for both stations
  // that crossed -- a station ID naming a frequency it no longer sits on is
  // worse than one that names none.
  { id: 'midnight-neon', band: 'zm', freq: 1234.0, callsign: 'SYNAPSE', tagline: 'shifting the plates of the underground',
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
    freqNote: 'counting up: 1-2-3-4',
    desc: 'Tech house from the current club circuit -- rolling basslines, chopped vocal hooks, and drops built for a big room. Ibiza back rooms and the main stage, same dial.',
    // 60th pass -- fresh contour, unused elsewhere on the roster: a slow
    // three-step rise (U U U), read as a guitar bend/turnaround reaching up
    // into a sustained note rather than resolving down. Slower tempo than
    // the rest of the roster to match the "slow burn" brief.
    ident: [293.7, 349.2, 415.3, 466.2],
    identTempo: 0.75,
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
      // ===================================================================
      // SYNAPSE -- roster built 2026-08-28. Tech house, by request, from a
      // 30-title brief; this is the station's first real roster under the
      // new callsign.
      //
      // It ends the TEMPORARY TEST SWAP that ran here from 2026-08-25: the
      // station's 28 blues tracks had been replaced wholesale with a 71-track
      // 60s oldies rotation to see how the machinery behaved under a format
      // it was not tuned for, with the screen deliberately still saying
      // MIDNIGHT NEON / late-night blues. That mismatch was the point of the
      // test. It is over -- callsign, tagline and desc are now SYNAPSE and
      // actually describe what plays.
      //
      // Both previous rosters exist only in git history, nowhere else in the
      // repo: the 28 blues entries, and the 71 oldies entries (sourced from a
      // "K-Earth 101 oldies nostalgia" playlist -- see that pass's own note in
      // the history for its substitutions and known imperfections).
      //
      // All 30 IDs below went through tools/audition.js in one clean run
      // (UNVERIFIED: 0, so the probe really ran -- a throttled run reports
      // nothing and looks identical to a clean one). Every one resolves, is
      // embeddable, is playable, and carries a wide licence: 121-249
      // countries, against the 20-country floor that flags a narrow one.
      //
      // Channel provenance: artist-official or label channels throughout
      // (Defected, Insomniac, Snatch!, Toolroom, CircoLoco, Big Beat,
      // Astralwerks, Experts Only, Dim Mak) plus label-delivered "- Topic"
      // art tracks. Note that audition.js flagged nearly all of them
      // UNKNOWN-CHANNEL, which is correct and not a problem: provenance is
      // scored against the channels the station ALREADY used, and those were
      // the oldies uploads this pass is deleting. The next pass will score
      // against these.
      //
      // Two CHECK-VERSION flags were reviewed and kept: "Where You Are" is
      // the Gorgon City remix because the remix is what was asked for, and
      // CID's "Fancy $hit" moved off a re-upload channel onto CID's own
      // "- Topic" delivery once one was found.
      //
      // Durations run 2:26 to 6:44. The long ones are club mixes and belong
      // here -- this is the one station where a six-minute track is the
      // format rather than an outlier.
      // ===================================================================
      realTrack('rVp454wjqls', 'TESLA', 'Mau P'),
      realTrack('0CKkRtkzw4g', 'Take It Off', 'FISHER & Aatig'),
      realTrack('FhbxFnNm-S8', 'Fancy $hit', 'CID & Taylr Renee'),
      realTrack('OvW5y3lZ7rc', 'Rhyme Dust', 'MK & Dom Dolla'),
      realTrack('JalJnTs3mzk', 'Jealous', 'Mochakk'),
      realTrack('SYTqNepDhl8', 'Murder Mystery', 'Jamie Jones'),
      realTrack('x8mdqMcOAUo', "Beggin'", 'Chris Lake & Aluna'),
      realTrack('gPZ1_4e3qv4', 'Where You Are (Gorgon City Remix)', 'John Summit & Hayla'),
      realTrack('i3eo3ndoCMI', 'LEFT TO RIGHT', 'Odd Mob'),
      realTrack('t-8CYSBBbZE', 'Sun Goes Down', 'Cloonee'),
      realTrack('p9ko0iyt1y8', 'Lipstick', 'Alaia & Gallo'),
      realTrack('hVErLWiBz3M', 'Let Me Take You There', 'Max Styler'),
      realTrack('ux3Ak1h430k', 'Space Pump (Space Jam)', 'Vinter'),
      realTrack('juuIhW8V1Xw', 'Drugs From Amsterdam', 'Mau P'),
      realTrack('4cCi6-16HR4', 'Ferrari', 'James Hype & Miggy Dela Rosa'),
      realTrack('EaHz7lvbFTk', 'Got The Fire', 'Michael Bibi'),
      realTrack('vj_TYIjCMzw', 'The Groovy Cat', 'PAWSA'),
      realTrack('s-ua75beKHk', 'Deceiver', 'Chris Lake & Green Velvet'),
      realTrack('pVMbyAYgxGU', 'Chromatic', 'Anti Up'),
      realTrack('uhvrT1rTRQ0', "It's A Killa", 'FISHER & Shermanology'),
      realTrack('TAKR_6vNJR8', 'On My Mind', 'Diplo & SIDEPIECE'),
      realTrack('oWqvIzXQFkU', 'You Give Me A Feeling', 'Vintage Culture & James Hype'),
      realTrack('zEwo9ib8cVg', 'Be Sharp Say Nowt', 'Patrick Topping'),
      realTrack('GxdWattQE1U', 'Wait A Minute', 'Biscits'),
      realTrack('0tuIVdYVf5o', 'Gimme Some Keys', 'Matroda'),
      realTrack('l3fUEyv9RLg', 'Summer 91 (Looking Back)', 'Noizu'),
      realTrack('ypZvzlpV5N4', 'Soul Sacrifice', 'Dombresky'),
      realTrack('tYD1E9IUOzA', '(It Happens) Sometimes', 'Jack Back'),
      realTrack('tapeYww2VrA', 'Hallelujah', 'Will Clarke'),
      realTrack('p2KlbcmhYuM', 'Back Tomorrow', 'Ferreck Dawn & Jem Cooke'),
      // 2026-08-29 -- five, not a full run to 50. FISHER and Dom Dolla were
      // both on this station only inside collaborations (FISHER & Aatig, MK
      // & Dom Dolla); these are their solo entries, and Losing It is the
      // track that took this genre mainstream.
      //
      // The profile's festival-set trap is real and immediate: searching
      // "FISHER Losing It" returns his Coachella 2019 set at 6:36 right
      // beside the 4:09 studio audio. Every pick here is a studio release
      // off the artist's own channel or a label the profile already lists
      // (Spinnin', Defected, Ultra, Toolroom).
      //
      // Cola is Aug 2017 against a lane stated as "roughly 2018 onward".
      // Taken on the "roughly", and flagged rather than quietly assumed --
      // it is five months early and the first thing to pull if that era
      // line is meant harder than it reads.
      //
      // Durations are deliberately mixed, per the profile: Cola and Feel My
      // Needs are the extended club mixes at ~6:50, the other three are
      // 3-4 min single edits. Both are in format here; what matters is
      // knowing which one was taken, so: checked, and these are correct.
      realTrack('u31thuMehjM', 'Losing It', 'FISHER'),
      realTrack('VFQ87_g41ZA', 'San Frandisco', 'Dom Dolla'),
      realTrack('qke-jOUqSXU', 'Cola', 'CamelPhat & Elderbrook'),
      realTrack('VL-TIXPivpQ', 'XTC', 'Solardo & Eli Brown'),
      realTrack('nUn0PC7098E', 'Feel My Needs', 'Weiss'),
      // 2026-08-30 -- fifteen to take SYNAPSE to 50, the last public station
      // still at its founding size. 34 artists to 47: this station was
      // unusually flat before (34 artists across 35 tracks, only Mau P
      // twice), so the safe half of a pass like this -- second cuts by
      // artists already trusted here -- was almost entirely unused. Six are
      // that; the rest are new names.
      //
      // The profile's two traps were both live again on this pass and both
      // are the same question, "which upload is this really":
      //
      //   - Festival sets outrank releases. Searching Dom Dolla's Miracle
      //     Maker returns a 1:14 Brooklyn Mirage clip beside the 3:09 VEVO
      //     audio; Michael Bibi's Hanging Tree surfaces an Amnesia Milano
      //     closing set. Duration separates them, as it did for FISHER's
      //     Losing It a pass ago.
      //   - Extended mix vs single edit, which the titles routinely do not
      //     say. Both are in lane here and the durations below are the
      //     record of which one was actually taken: nine singles (2:15 to
      //     4:13) and six club versions (6:27 to 8:26).
      //
      // Hot Since 82's Buggin' at 8:26 is now the longest track on the
      // station, past the 6:44 the profile quotes as the old ceiling. Taken
      // anyway, off the artist's own channel, because the profile is
      // explicit that length is not a reason to reject here -- but it is the
      // one to pull first if this station ever wants a real ceiling.
      //
      // PROVENANCE IS THE BEST OF ANY PASS ON THIS STATION and the flags
      // undersell it. Two VEVO, three "- Topic", four on channels this
      // station already uses -- and every one of the six that audition.js
      // marks UNKNOWN-CHANNEL is still an artist or label channel, not a
      // re-upload: No Art Music is ANOTR's, STEREOHYPE is James Hype's own
      // label, Trick is Patrick Topping's, plus Ministry of Sound, Hot Since
      // 82's channel and Sonny Fodera's. Nothing here comes off the
      // re-upload channels the profile names, which were visible in these
      // same searches (blanc and Groove Bassment both carried Wild and Your
      // Mind Is Dirty) and were passed over deliberately.
      //
      // FISHER's Stop It trips CHECK-VERSION on the word "mix". That is the
      // shared audition heuristic being wrong for THIS station specifically:
      // an extended mix is the format here, not a warning sign.
      realTrack('U6Xz8foh7XQ', 'Miracle Maker', 'Dom Dolla & Clementine Douglas'),
      realTrack('fqvuxA5vuv4', 'Human', 'John Summit & Echoes'),
      realTrack('JOXzs2UhkHI', 'Relax My Eyes', 'ANOTR & Abel Balder'),
      realTrack('v8bIYKwUyPM', 'Tell Me Something Good', 'Ewan McVicar'),
      realTrack('Jckql0mdf_c', 'Asking', 'Sonny Fodera & MK'),
      realTrack('E_wxPpRSgho', 'Turn Off The Lights', 'Chris Lake & Alexis Roberts'),
      realTrack('rwBA75RmDkc', 'Stop It', 'FISHER'),
      realTrack('_kFKqY9oCUc', 'Wild', 'James Hype'),
      realTrack('RgyrmIEA-1g', 'Turbo Time', 'Patrick Topping'),
      realTrack('eOlLPCVTLfE', "Buggin'", 'Hot Since 82 & Jem Cooke'),
      realTrack('tG7NLC9dIXY', 'Voodoo', 'Gorgon City'),
      realTrack('fneCWdB8d04', 'Weak', 'Vintage Culture & Maverick Sabre'),
      realTrack('gJYjbDnyx-o', 'Free Your Mind', 'Prospa & Cloonee'),
      realTrack('6dx013HIzCU', 'Temptation', 'SIDEPIECE'),
      realTrack('Fc0tcD9F4GU', 'Wassup', 'Wax Motif'),
    ] },

  // 4 new stations added 2026-08-20, tracklists as given, all
  // oEmbed-verified. Frequencies slotted into the gaps between the original
  // 5 (288.6 between RELIC SIGNAL/QUIET HOURS, 434.5 between QUIET
  // HOURS/COLD WAVE, 650.0 between COLD WAVE/THE STUDY, 878.9 past THE
  // STUDY toward the top of the band) so none of the original 5 moved.
  { id: 'city-lights', band: 'ym', freq: 780.0, callsign: 'CITY LIGHTS', tagline: 'tokyo nights, city pop dreams',
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
      // 2026-08-29 -- nine to take CITY LIGHTS to 50. Five are new artists,
      // which matters more here than elsewhere: this was the thinnest public
      // roster relative to its size, 28 artists across 41 tracks, with three
      // artists carrying three tracks each. It is 33 artists now.
      //
      // Every one confirmed US-available and embeddable by the watch probe,
      // not by oEmbed. That is this station's own constraint and it is not
      // decorative -- Japanese label uploads are routinely geo-fenced and an
      // oEmbed 200 says nothing about it. All nine came back 121-249
      // countries with us=true.
      //
      // The profile's other warning -- verify original-artist credit, a song
      // has been mis-credited here before -- earned itself three times in one
      // pass. A Topic upload of AIRPORT LADY is Ai Furihata covering
      // Kadomatsu, not Kadomatsu. A Topic upload titled Bomber is Hirotaka
      // Mori, not Yamashita. And a search for Nanako Sato returns 'Nanaco',
      // a different artist entirely. All three look right in a result list
      // and are wrong in the roster; the channel name is what catches them.
      //
      // Casiopea's Asayake was wanted and dropped: the only clean uploads are
      // from 'Casiopea 3rd', the later lineup, so they are re-recordings
      // rather than the 1979 original. Same shape as the mis-credits above.
      realTrack('n79SqFZFQcQ', 'Mayonaka no Joke', 'Takako Mamiya'),
      realTrack('HuslecphkVw', 'Untotooku', 'Chiemi Manabe'),
      realTrack('AADQuhYHbf4', 'Candy', 'Naoko Gushima'),
      realTrack('h8uDIS6-g9w', 'Hold Me Tight', 'Rajie'),
      realTrack('9TT_oIzTT74', 'Summer Breeze', 'Piper'),
      realTrack('mCHy6H2QDEY', 'Town', 'Minako Yoshida'),
      realTrack('AeH1xq2PpjQ', 'Tuxedo Connection', 'Hitomi Tohyama'),
      realTrack('SIGr6dc_2Sc', 'Bomber', 'Tatsuro Yamashita'),
      realTrack('pSbzx-0wbs0', 'Two Call', 'Kaoru Akimoto'),
    ] },
  // 22nd pass -- outlaw channel dropped completely, 9 channels being the
  // max for now. OUTLAW (freq 288.6, spaghetti-western/outlaw-country)
  // removed outright rather than just renamed; its station-ID ident had
  // already been flagged as hard to hear, and 9 is the agreed ceiling for
  // now with HACKBACK's addition. If it comes back later, its full track
  // list (Johnny Cash, Ennio Morricone, Marty Robbins, Colter Wall, Nick
  // Cave, Tom Russell, Calexico) is in git history on this commit's parent.
  // MOVED TO ZM 2026-08-31, from YM 488.0. See SYNAPSE's note above for why
  // two established stations crossed rather than only new ones.
  //
  // 1688.0 was picked to keep the freqNote intact WITHOUT rewriting it: the
  // gag is the 88, and every ZM frequency ending in 88 carries it. That is
  // the whole reason this station's number is not a round one -- a station
  // whose dial position is a joke should not lose the joke to a band change.
  { id: 'circuit-crush', band: 'zm', freq: 1688.0, callsign: 'CIRCUIT CRUSH', tagline: 'analog glow, the long drive home',
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
      realTrack('7fDvxlK2FMc', 'Le Perv', 'Carpenter Brut'),
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
      // 2026-08-29 -- seventeen to take CIRCUIT CRUSH to 50. Nine new
      // artists, 27 to 36. Synthwave is unusually well served on YouTube
      // compared with the other lanes -- artist Topic channels plus the
      // scene's own label channels (NewRetroWave, Aphasia, Mad Decent) --
      // so all nineteen candidates auditioned clean and the choice was
      // which to leave out rather than what was usable.
      //
      // Two were dropped for depth rather than quality: The Midnight's Los
      // Angeles and Timecop1983's Static both verified clean and would each
      // have been a THIRD track for an artist already holding two. Carpenter
      // Brut and Perturbator were allowed to go to three instead, because
      // the darker/harder end is what this station is defined as owning
      // against CIPHER -- see the boundary in both profiles.
      //
      // GUNSHIP's Dark All Day was wanted and not found: the only Topic
      // upload is a Power Glove remix and everything else is a fan
      // re-upload. Not a lane call, an availability one.
      //
      // Three wrong-artist near misses while collecting, all of which read
      // correct in a result list: 'Dancing with the Dead' on Powerwolf -
      // Topic is a metal band, not Dance With The Dead; a Robert Parker
      // search returns Robert Knight's Everlasting Love; and a Dance With
      // The Dead result was a metal cover. CITY LIGHTS hit the same shape
      // three times the same day -- a Topic channel looks authoritative and
      // the title matches, so the channel name is the only thing that
      // catches it. This is not a city-pop problem, it is a search problem.
      realTrack('lD69ScxsHCM', 'Fade Away', 'Trevor Something'),
      realTrack('gkjk30imnXI', 'Client', 'Waveshaper'),
      realTrack('YrVFhHHpLJ0', 'Pulse Power', 'Dynatron'),
      realTrack('jyO-MyJ4R1g', 'Chinatown', 'Starcadian'),
      realTrack('cq05Ierbz44', 'Maniac', 'Tokyo Rose'),
      realTrack('Z1kAGzKaLOQ', 'Just Drive', 'W O L F C L U B'),
      realTrack('S0A9dNsLRjc', 'Rabbit in the Headlights', 'Michael Oakley'),
      realTrack('MUAJFyr5qzA', 'Web of Sin', 'Daniel Deluxe'),
      realTrack('ArDVDnWTqvw', 'Source Code', 'Mega Drive'),
      realTrack('qT0iQRjHbW4', 'Odd Look', 'Kavinsky'),
      realTrack('qFfybn_W8Ak', 'Roller Mobster', 'Carpenter Brut'),
      realTrack('Q9tzrYi3Fdk', 'Sentient', 'Perturbator'),
      realTrack('5dNP-a-XXx0', 'Overdrive', 'Lazerhawk'),
      realTrack('JE1jylkS_7w', 'Salvation Code', 'Scandroid'),
      realTrack('hugowO0sSrM', 'Interceptor', 'Mitch Murder'),
      realTrack('dTkGNEl55Ug', 'Brokendate', 'Com Truise'),
      realTrack('LITFNKqEz_U', 'Sleepwalking', 'NINA'),
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
  { id: 'atomic', band: 'ym', freq: 529.0, callsign: 'ATOMIC', tagline: 'atomic swing, radioactive nostalgia', // 19th pass: trimmed
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
      // 2026-08-29 -- swapped off xFg6i2p8YQc, which had gone NOT-US and
      // unplayable. Not a curation change: the roster health check found it
      // while verifying this station's five additions, on a track that had
      // been sitting here working. The78Prof is a channel this station
      // already uses.
      realTrack('260hXID0Yo0', 'Rocket 88', 'Jackie Brenston & His Delta Cats'),
      realTrack('IIQFJGru-xI', "It's Only a Paper Moon", 'Nat King Cole'),
      realTrack('6VGDnqCV53w', 'Butcher Pete (Part 2)', 'Roy Brown'),
      realTrack('ayGkA-vxrMc', 'Into Each Life Some Rain Must Fall', 'The Ink Spots & Ella Fitzgerald'),
      // 2026-08-29 -- five, all five new artists here. This station's
      // constraint is the tightest on the roster: a track must actually
      // play on Fallout 4's Diamond City Radio or Fallout 76's Appalachia
      // Radio, and one has been pulled before for being period-correct but
      // not on those stations. So the tracklist was checked against a
      // published Diamond City Radio listing rather than recalled -- all
      // five appear on it, and the roster turned out to have a dozen more
      // genuine gaps if this station is ever taken to 50.
      //
      // Attribution, per the profile's second rule: "Whole Lotta Shakin'
      // Goin' On" is credited to Big Maybelle, whose 1955 recording is the
      // original and the one the game uses -- not Jerry Lee Lewis, whose
      // 1957 version is the famous one and the wrong answer here. Same
      // shape as the Roy Brown / Wynonie Harris note already in the profile.
      //
      // Provenance is weaker here than anywhere else on the dial and that is
      // unavoidable: 1940s-50s sides have no official uploads, so archive
      // channels carry them. The78Prof is one this station already uses.
      realTrack('8L6dp5zFkDs', 'Grandma Plays the Numbers', 'Wynonie Harris'),
      realTrack('pUgC0Rq3bHM', 'Personality', 'Johnny Mercer'),
      realTrack('I9PtTaclmCk', "Whole Lotta Shakin' Goin' On", 'Big Maybelle'),
      realTrack('Acfhtz020wE', 'Right Behind You Baby', 'Ray Smith'),
      realTrack('ydLHY0qonl4', "It's a Man", 'Betty Hutton'),
      // 2026-08-31 -- five more, taken from the dozen genuine gaps the
      // 2026-08-29 Diamond City Radio check turned up and wrote into the
      // profile. That listing, not recall, is what satisfies this station's
      // Fallout-canon rule; seven of the twelve are still unused.
      //
      // Attribution, per the profile's second rule: "Dear Hearts and Gentle
      // People" is Bob Crosby's, not Bing Crosby's. The search ranks a Bing
      // upload high and it is the wrong answer here for the same reason the
      // Roy Brown / Wynonie Harris note already in this file gives.
      //
      // Provenance runs BETTER than this station's norm for once -- all five
      // are '- Topic' or VEVO, where the existing 35 are almost entirely
      // archive channels, because these particular sides did get official
      // reissue uploads. Billie Holiday's VEVO cut was taken over her
      // '- Topic' one on licence breadth (249 countries against 123). Worth
      // recording because the usual trade runs the other way: the better
      // channel normally holds the NARROWER licence, and it did here too on
      // the track next to it -- a second Roy Brown '- Topic' upload of
      // "Mighty Mighty Man" is licensed in exactly ONE country, so the id
      // below is the other one.
      realTrack('fsLPj_BG3fg', 'Maybe', 'The Ink Spots'),
      realTrack('BsTP6NUZVvQ', "It's All Over but the Crying", 'The Ink Spots'),
      realTrack('a2FeSEiXaR0', 'Easy Living', 'Billie Holiday'),
      realTrack('B2DkxG6-Pko', 'Mighty Mighty Man', 'Roy Brown'),
      realTrack('hOEAGZZoq7w', 'Dear Hearts and Gentle People', 'Bob Crosby and the Bobcats'),
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
  { id: 'hackback', band: 'ym', freq: 808.0, callsign: 'HACKBACK', tagline: 'golden age hip-hop, coast to coast legends',
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
      realTrack('z5rRZdiu1UE', 'Sabotage', 'Beastie Boys'),
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
      // 2026-08-29 -- seven to take HACKBACK to 50, picked against the two
      // things this profile asks for by name rather than against taste.
      //
      // Coast balance, re-measured rather than trusted, as the profile
      // instructs: NY was 24 of 43, 56%, still the heavy side after the
      // 2026-08-25 pass tried to weight away from it. These seven are 2 NY,
      // 1 New Jersey, 3 West and 1 South, which lands NY at 26 of 50, 52%.
      // A real move but a small one -- the next batch, if there is one,
      // should keep pushing and should re-measure again rather than trust
      // this number either.
      //
      // Representation: the profile records that before 2026-08-25 this
      // station had no women across 21 artists, and that Queen Latifah was
      // still the only one. It names the canon that was missing -- MC Lyte,
      // Salt-N-Pepa, Lauryn Hill/Fugees, Roxanne Shante. Three of those four
      // are here now, taking it from one woman to four. Roxanne Shante is
      // the one still outstanding.
      //
      // Mobb Deep's Shook Ones Pt. II is the obvious canonical hole left and
      // it auditioned clean (rTKpYJ80OVQ, Official Audio, 5:28). It lost to
      // Del on coast alone -- a fourth New York track would have cancelled
      // most of the balance move above. First thing to reach for if the next
      // pass widens the station rather than rebalancing it.
      realTrack('4vaN01VLYSQ', 'Shoop', 'Salt-N-Pepa'),
      realTrack('VMttICy5MSg', 'Cha Cha Cha', 'MC Lyte'),
      realTrack('PWOa_eeKzO0', 'Ready or Not', 'Fugees'),
      realTrack('yqxrr6CQyus', 'Tonite', 'DJ Quik'),
      realTrack('0Cjj3YMrkEM', 'The Ghetto', 'Too $hort'),
      realTrack('BQrdjT3GHwE', 'Mistadobalina', 'Del the Funky Homosapien'),
      realTrack('cGwUE0V9Gqw', 'I Seen a Man Die', 'Scarface'),
    ] },
  // 52nd pass -- stations 1, 6, and 9 needed similar short descriptions to
  // fit the format the others have. Was a bare two-word tagline; added
  // a second comma-paired fragment (genre + late-night mood, echoing the
  // desc's own "late-night infiltration runs") to match the "mood, mood"
  // shape 6 of 9 taglines already use.
  { id: 'cipher', band: 'ym', freq: 133.7, callsign: 'CIPHER', tagline: 'digital infiltration, late-night breakbeat',
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
    // Up from 22 to 38. Then 39 (the pending-queue drain), and 45 with the
    // 2026-08-27 issue #19 pass noted at the foot of this array.
    tracks: [
      realTrack('wmin5WkOuPw', 'Firestarter', 'The Prodigy'),
      realTrack('xMVTKOoy1uk', 'Omen', 'The Prodigy'),
      realTrack('iTxOKsyZ0Lw', "Block Rockin' Beats", 'The Chemical Brothers'),
      realTrack('3SwwljI-8JY', 'Halcyon', 'Orbital'),
      realTrack('yJnve05CnNE', 'The Box', 'Orbital'),
      realTrack('u7K72X4eo_s', 'Teardrop', 'Massive Attack'),
      realTrack('XiMrrleH_hI', 'Born Slippy .NUXX', 'Underworld'),
      realTrack('F6Y7lcvubhU', 'Rez', 'Underworld'),
      realTrack('DzNex7Mf1bg', 'Clubbed to Death (Kurayamino Mix)', 'Rob Dougan'),
      realTrack('7xI8mCKLiRM', 'Prime Audio Soup', 'Meat Beat Manifesto'),
      // 2026-08-27 (issue #19): swapped from iCBL33NKvPA to the "Short One"
      // edit, proposed as the cleaner, better-mastered upload. A swap rather
      // than an addition on purpose -- two mixes of one title in the same
      // rotation is the thing a real station wouldn't do.
      realTrack('Agbn4NzOj04', 'Spybreak! (Short One)', 'Propellerheads'),
      realTrack('OjTC88oIRys', 'Busy Child', 'The Crystal Method'),
      realTrack('XAlLaGhfLq4', 'B-Boy Stance', 'Freestylers'),
      realTrack('ub747pprmJ8', 'Right Here, Right Now', 'Fatboy Slim'),
      realTrack('8B-i1vsA6jw', 'Sour Times', 'Portishead'),
      realTrack('svJvT6ruolA', 'No Good (Start the Dance)', 'The Prodigy'),
      // 2026-08-28 (issue #5) -- swapped from IKTJoHbKZO0, and see the note
      // on Keep Hope Alive below for why. Like-for-like: same 4:29 mix, on a
      // 2017 "- Topic" upload that reaches 1080p instead of a 2007 one
      // capped at 480p. Title and credit corrected while it was open: the
      // old string was the YouTube VIDEO's title, "[Official Video]" and
      // all, and the song is a Filter/Crystal Method collaboration off the
      // Spawn soundtrack rather than a Crystal Method solo track.
      realTrack('Q7SedYMP-PA', "(Can't You) Trip Like I Do", 'Filter & The Crystal Method'),
      realTrack('WrDXJp-uDoY', "Bentley's Gonna Sort You Out", 'Bentley Rhythm Ace'),
      realTrack('NxsevNnHfzs', 'The Gift', 'Way Out West'),
      // 2026-08-28 (issue #5) -- swapped from m7CYzc1naaw. A listener
      // reported sub-second audio dropouts, and reported them on all THREE
      // Crystal Method tracks this station carried and on nothing else.
      // What those three had in common was not the artist and not that they
      // were official videos (Galvanize and No Good were both official
      // videos on this station and both fine -- Galvanize was removed later
      // the same day for unrelated reasons, and No Good is still here):
      // they were the only 2007 uploads on CIPHER, the only ones
      // YouTube never re-transcoded to modern renditions -- 480p, 480p and
      // 350p, which is not even a standard height -- and one to two orders
      // of magnitude less requested than the official videos that don't
      // stutter. Their audio ladders are identical to the rest of the
      // station, so it is not the sound files themselves.
      //
      // The mechanism is not provable from outside YouTube, so the swap IS
      // the experiment: this one and Trip Like I Do move to modern uploads,
      // and Busy Child deliberately does NOT -- its only same-version
      // alternative (t6twhXA1Gyw, 2009 VEVO) is another 480p-capped legacy
      // rendition, so leaving it is what keeps a control. If the two swapped
      // ones go quiet and Busy Child keeps stuttering, the theory is right.
      //
      // The cost, stated because it is a real one: this upload is the 6:13
      // album version, where the old one was the 3:29 video edit. A longer
      // track and a different arrangement, accepted as the price of a file
      // that plays.
      realTrack('LZi4qE6Ll6E', 'Keep Hope Alive', 'The Crystal Method'),
      realTrack('PHMzCpy0fXc', 'Atom Bomb', 'Fluke'),
      realTrack('maP6q3D4Hf0', 'Leave You Far Behind', 'Lunatic Calm'),
      realTrack('hbe3CQamF8k', 'Angel', 'Massive Attack'),
      realTrack('d0PCD7YMfeY', "Ain't Talkin' 'bout Dub", 'Apollo 440'),
      realTrack('MwZmPJFNVbw', 'Supermoves', 'Overseer'),
      realTrack('Wuwfe3DRJzE', '6 Underground', 'Sneaker Pimps'),
      realTrack('7qZW9P7W-nc', 'Def Beat', 'Junkie XL'),
      realTrack('Ihr0y7ayGV0', 'Stem / Long Stem', 'DJ Shadow'),
      realTrack('Jd_UCgMaHYQ', 'Dirt', 'Death in Vegas'),
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
      // 2026-08-27 -- issue #19, the first outside curation pass this station
      // has had. Eight proposed with per-track arguments, seven auditioned
      // clean, six landed: Ultrasonic Sound (Hive), Godzilla Dub (ZeroFG),
      // Born In '94 (Unglued), Take California (Propellerheads), Y'all Ready
      // For Dis (Y U QT), and Firestarter (Empirion Mix) (The Prodigy). The
      // seventh was the Spybreak! swap above. Named rather than left as "the
      // six below" -- see DISTORTION FIELD's curation-history block for what
      // a sort does to a comment that describes tracks by position.
      //
      // The proposal arrived apologising for breaking a "one track per
      // artist" rule that CIPHER has never followed -- the suggestion form
      // had generalised it from GREEN ROOM, where it belongs. Fixed in the
      // same pass (see .github/ISSUE_TEMPLATE/track_suggestion.yml); worth
      // remembering that the form talked a contributor out of proposals
      // before it talked them into any.
      //
      // 2026-08-28: the Empirion mix is GONE again, so what follows is the
      // record of an argument that was made and then reversed rather than a
      // description of the array. It was kept alongside the original on the
      // grounds that it is a different song rather than a remix of that one,
      // which was the only reason the same-title objection above did not
      // apply to it too; its length (7:52, alongside Take California's 7:47)
      // was accepted at the time as a known trade against a station built on
      // propulsion. Take California stayed.
      //
      // WHY it came out, from the curator directly: personal taste and
      // preference, and nothing more. Not availability, not licence, not
      // lane mechanics -- it auditioned clean and still would. It went in
      // one pass with Song of Life, Papua New Guinea, Lonely Soul, Black
      // Steel and Galvanize, all seven on the same grounds, all seven now in
      // station-profiles.json with that reason attached so audition.js says
      // so before anyone re-proposes one. Worth writing plainly rather than
      // dressing up: an early draft of this comment guessed at a downtempo
      // tightening, which fits four of the six and not the other two, and a
      // plausible invented rationale in this file is worse than none.
      realTrack('lGqzRmDcC14', 'Ultrasonic Sound', 'Hive'),
      realTrack('mloHngTITZ8', 'Godzilla Dub', 'ZeroFG'),
      realTrack('VHqc2Yqwwu4', "Born In '94", 'Unglued'),
      realTrack('81bG15gsl70', 'Take California', 'Propellerheads'),
      realTrack('OTvB4XMsg1U', "Y'all Ready For Dis", 'Y U QT'),
      // 2026-08-29 -- twelve to take CIPHER to 50, on the curator's read
      // that this lane is wider than it looks. Nine fill gaps by artists
      // already accepted here, three are new (Cirrus, Lo Fidelity
      // Allstars, Paul Oakenfold), taking the station from 28 artists to
      // 31.
      //
      // The rejection log did most of the picking. It is almost entirely
      // taste rather than mechanics, and it is specific: no extended mixes
      // (Chime 12"), nothing bright or poppy (Push Up), nothing mellow
      // (Fallen), audio-only where a video bakes in dialogue (Superstylin',
      // Red Alert, and the Da Funk precedent). So every pick here is a
      // single/album cut, and the Hey Boy Hey Girl EXTENDED version was
      // passed over for the 3:39 single on exactly that record.
      //
      // Two things wanted and not taken. Photek is an accepted artist with
      // no track, and Ni Ten Ichi Ryu has no official or Topic upload at
      // all -- only fan channels, which is not provenance this roster
      // accepts. Juno Reactor's Mona Lisa Overdrive is the Matrix cut this
      // station is built around and it is unusable both ways: the 4:45
      // licensed version is NARROW-LICENCE:18, and the one clean upload is
      // the 10:09 album version, too long to sit in rotation.
      //
      // The Prodigy already anchors this station with four. Poison
      // auditioned clean (ah-JquUf5GA, 123 countries, 6:42 album cut) and
      // was left out anyway -- a sixth would be a fifth of the station from
      // one artist. It is the first thing to reach for if one of these is
      // pulled.
      realTrack('tpKCqp9CALQ', 'Hey Boy Hey Girl', 'The Chemical Brothers'),
      realTrack('0u3qQtvU5SQ', 'Setting Sun', 'The Chemical Brothers'),
      realTrack('Wo7XxlXU3XQ', 'Breathe', 'The Prodigy'),
      realTrack('A12-KN5UijA', 'Name of the Game', 'The Crystal Method'),
      realTrack('qEYeT-f1Fdo', 'Cowgirl', 'Underworld'),
      realTrack('GjlklxY-fWI', 'Inertia Creeps', 'Massive Attack'),
      realTrack('BEqHME6XUi8', 'Six Days', 'DJ Shadow'),
      realTrack('tP8tpAs9qhI', 'Satan', 'Orbital'),
      realTrack('cFffoHmn8XA', 'Zion', 'Fluke'),
      realTrack('Qe9vdnNQAhc', 'Back on a Mission', 'Cirrus'),
      realTrack('B99nd2iKGOw', 'Battleflag', 'Lo Fidelity Allstars'),
      realTrack('MSv3Oez4O-4', 'Ready Steady Go', 'Paul Oakenfold'),
    ] },
  // THE CRYPT (2026-08-31) -- ZM's third resident and the first station
  // founded ON the second band rather than moved to it. From issue #52,
  // which proposed the Cryo Chamber label and its Cryo Crypt side project;
  // the side project is the dungeon-synth/dark-fantasy arm and is what this
  // is named for.
  //
  // 1031.0 is the 31st of October and nothing else. The dial has carried a
  // joke per station since the 8/20 pass and this one picked itself.
  //
  // WHY IT IS NOT COLD WAVE AND NOT NINE INCH NAILS, since all three are
  // cold and none of them are cheerful: the boundary here is FANTASY -- a
  // ruin, a keep, a forest -- rather than synthetic melancholy or industrial
  // dread. A candidate that would sit comfortably on either of those belongs
  // there instead. The profile says the same thing where audition.js will
  // read it back at whoever proposes the next track.
  //
  // `visual: 'dread'` is BORROWED, not chosen, and is the one thing here
  // waiting on a real decision. Every other station on the dial has an
  // effect of its own; dread belongs to NINE INCH NAILS. It fits this
  // station almost too well, and NIN being secret means few people will ever
  // see both -- but "few people will notice" is the argument for a
  // placeholder, not for a design. A bespoke effect is the eventual want.
  //
  // The tracklist is EMPTY on purpose and lint will say so until it is
  // filled. audition.js needs --station to already exist in the roster, so
  // the identity object has to land first; this is the documented order, not
  // an unfinished commit. Nothing is added here that has not been probed.
  { id: 'the-crypt', band: 'zm', freq: 1031.0, callsign: 'THE CRYPT',
    tagline: 'a ruin, a keep, a tape left running',
    freqNote: '10/31 -- All Hallows\' Eve',
    desc: 'Dungeon synth and dark fantasy: lo-fi keyboard music scoring a place that never existed. Modal melodies under tape hiss and cheap reverb, with almost no drums and no hurry at all.',
    ident: [220.0, 207.7, 174.6, 130.8],
    identTempo: 0.8,
    glyph: '†',
    static: 2100,
    crt: { noise: 0.22, bloomAmt: 1.4, flicker: 0.14 },
    meter: { spring: 0.35, damping: 0.6, swing: 0.8 },
    visual: 'dread',
    tracks: [
      realTrack('APZIre8Tm60', 'Whitebark Forest', 'Mountain Realm'),
      realTrack('YKe_zJEGcWQ', 'Dungeon Stairs', 'Mountain Realm'),
      realTrack('JhrsLP5kK4c', 'Horn of the Goblins', 'Mountain Realm'),
      realTrack('yHRtZ5mXnGA', 'The Crystal Palace', 'Mountain Realm'),
      realTrack('j1BFgzDEl9s', 'Troll King', 'Mountain Realm'),
      realTrack('883e7wydHo0', 'A Fallen Warrior Stands Again', 'Mountain Realm'),
      realTrack('D8FOL8mjwJU', 'A Broken Man Stands Tall', 'Mountain Realm'),
      realTrack('XlbCqHSs_xk', 'Village in the Mist', 'Mountain Realm'),
      realTrack('gQtLEuuZNNg', 'Fallen Gods', 'Mountain Realm'),
      realTrack('KAfpsjEbGM8', 'Nordanvinden', 'Trollslottet'),
      realTrack('HTWiLqSA514', 'Vinterväldet', 'Trollslottet'),
      realTrack('1cYGRwKwgS8', 'Häxmästaren', 'Trollslottet'),
      realTrack('vJ_rSbiKGTI', 'Caverns of the Old Gods', 'Swordlender'),
      realTrack('ObrgQaKlldc', 'Spirit of the North', 'Swordlender'),
      realTrack('S-l36AZCOQs', 'Highland Enchantress', 'Swordlender'),
      realTrack('oVtO2dAXunU', 'The Lord of Mountains High', 'Swordlender'),
      realTrack('VijbUkATmLc', 'From the Realm of Dust and Darkness', 'Vikorra Doom'),
      realTrack('kFB9A2WAfpM', 'The Hall of Unhallowed Steel', 'Vikorra Doom'),
      realTrack('WUyXqGpvs4Y', 'Return to the Underworld', 'Vikorra Doom'),
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
// 2026-08-31 -- the preset order is per BAND now, because [1-9] means "the
// nth station on the dial in front of you". STATION_PRESET_ORDER stays as the
// whole-roster list: stations.md and the roster tools want every station in
// dial order regardless of band, and re-deriving that from the bands would be
// the same list assembled twice.
//
// Callers inside the app should ask for a band. A caller that takes the flat
// list is asserting it genuinely means every station everywhere, which is
// true of the generated docs and false of anything the receiver draws.
export const presetOrderFor = (bandKey) => STATION_PRESET_ORDER.filter((ch) => ch.band === bandKey)

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
  id: 'nin', band: 'ym', freq: 613.0, callsign: 'NINE INCH NAILS', tagline: 'industrial rage, mechanical dread',
  // Tight chromatic half-step descent (B3-Bb3-A3-Ab3) -- every other
  // station's ident jumps by a third or more, so this one's the only motif
  // on the roster that grinds down in semitones. Deliberately harsh/
  // mechanical rather than melodic, to match the station.
  ident: [246.9, 233.1, 220.0, 207.7],
  identTempo: 0.7,
  // 90s-2000s alt/industrial rock masters run loud already -- no boost.
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
      // 2026-08-30: the UPLOAD changed here, not the song. The official
      // "- Topic" upload (F-jZHMX-CJ0) is licensed in THREE countries --
      // the US among them, so it played fine from this chair and was dead
      // for nearly everyone else. That is why it survived every check that
      // ever looked at it, and why it took check-roster.mjs's first deep
      // probe to find. No official video was ever made for this track, so
      // unlike The Hand That Feeds and Survivalism there is no wide-licence
      // official upload to move to -- this is a fan re-upload at 249
      // countries, picked by ear against four others. The era-wide rule and
      // the trade it costs are in tools/station-profiles.json.
      realTrack('qpLNRNO72X4', 'Right Where It Belongs', 'Nine Inch Nails'),
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

// GREEN_ROOM_STATION (2026-08-26) -- the second secret station, and the
// first one to actually ship since the machinery below was generalized for
// a second entry back on 2026-08-23. Everything that generalization
// promised is what this station needed and nothing more: the object
// literal here, one line in SECRET_STATIONS, one key case in program.js,
// one MAPPED_KEYS entry, one forced-only tint in config.js. No call site
// needed changing -- SECRET_STATIONS is walked, not indexed, and every
// secret behaviour is keyed on `station.secret` / `station.forcedPhosphor`
// rather than on an id.
//
// Reachable only by Shift+0 -- the exact key GREEN HOUSE was going to use
// before it was pulled (see SECRET_STATIONS' comment below), left unbound
// and documented as reserved ever since. Not a coincidence and not a
// collision: the reserved slot is being spent.
//
// FREQUENCY: 420.0, which is the entire joke and was fixed before anything
// else about the station was. It happens to land in the widest empty
// stretch of the band -- 99.0 KHz clear of DRIFT MODE (321.0) below and
// 68.0 clear of CIRCUIT CRUSH (488.0) above, against a LOCK_THRESHOLD*2
// minimum of 12 -- so no tease bleed, no lock ambiguity, and no reshuffle
// of anything else. The one frequency on the roster picked for a reason
// that has nothing to do with the dial and got away with it.
//
// FORMAT: not a genre station. Every track is *literally, lyrically* about
// cannabis, which puts doom metal, G-funk, roots reggae, outlaw country,
// a Weezer single and Kacey Musgraves on the same rotation. The other
// nine stations are each one coherent sound; this one is one coherent
// SUBJECT and a deliberately incoherent sound. That is the bit. Tracks
// are held to the subject, not to a genre -- see tools/station-profiles.json
// for what that admits and what it rules out.
export const GREEN_ROOM_STATION = {
  id: 'green-room', band: 'ym', freq: 420.0, callsign: 'GREEN ROOM', tagline: 'backstage haze, one subject only',
  freqNote: '420.0 -- it was never going to be anything else',
  desc: "Songs about exactly one thing, spread across fifty years and every genre that ever got around to writing one -- doom metal, G-funk, roots reggae, outlaw country, power pop. The dial found the subject, not the sound.",
  // Whole-tone descent (G4-F4-Eb4-Db4). Every other ident on the roster
  // sits in a key -- this one deliberately doesn't: a whole-tone run has
  // no leading tone and no tonal centre, so it never resolves and just
  // sags. The only unmoored motif on the roster, and the point of picking
  // it over another minor-third drift.
  ident: [392.0, 349.2, 311.1, 277.2],
  // Slowest announce on the roster (NEON STASIS's 1.35 is next, inherited
  // from DRIFT MODE, which held that spot before 2026-08-30).
  // Higher is slower here -- see playIdent's tempo note in audio/sfx.js.
  identTempo: 1.5,
  // The era spread is the problem: 70s rock and reggae masters sit well
  // under the modern hip-hop entries on the same rotation. A modest lift,
  // same as the other mixed-era stations (COLD WAVE, MIDNIGHT NEON).
  secret: true,
  // No glyph -- never drawn on the dial, same as NIN. See its note.
  //
  // The inverse of NIN's profile on purpose. That station is the one you
  // aren't supposed to find and it fights you: high static, hostile
  // idle events, a grind layer. This one is the room you're let into, so
  // it is the softest carrier on the roster instead -- low static, a wide
  // unfocused spot, peaking almost off, heavy bloom and a long persistence
  // tail, so text blooms and smears rather than snapping. Grain is kept
  // LOW deliberately: the haze here should read as glow, not as noise.
  static: 800,
  crt: { beam: 0.95, sharpen: 0.35, bloomAmt: 2.1, decay: 0.88, noise: 0.08, flicker: 0.05 },
  // Sluggish needle, and the smallest swing on the roster. Sits right next
  // to NEON STASIS's 0.16/0.72 -- the two laziest needles on the dial are
  // the mallsoft station and this one -- but damped harder and swung
  // shorter, so it settles late and barely overshoots at all.
  meter: { spring: 0.18, damping: 0.74, swing: 0.7 },
  // Rarer than the roster default (90-210s) rather than more frequent --
  // again the inverse of NIN, and no grind layer at all. Nothing here
  // should feel like an interruption.
  idleEvent: { minS: 150, maxS: 330 },
  // FLOW FIELD, orphaned since MOMENTUM was replaced by MIDNIGHT NEON and
  // kept in the registry against exactly this ("in case a future pass
  // wants it again" -- flowfield.js's own note). A slow drifting angle
  // field rendered as streak glyphs is already smoke; it did not need a
  // new effect built for it, and it keeps its baseline motion with no
  // audio tap, which matters more here than on most stations.
  visual: 'flowfield',
  // Forced-only tint, read generically by applyPhosphor()/applySecretTease().
  // See config.js's PHOSPHORS for why it isn't just 'matrix'.
  forcedPhosphor: 'haze',
  tracks: [
    // Curated 2026-08-26 from a 30-title brief, all of it built on the
    // one rule in tools/station-profiles.json: the song has to be
    // literally about cannabis, not merely smoke-adjacent. 28 shipped.
    //
    // TWO DROPPED, deliberately and not backfilled (same convention as
    // the 50th-pass curation note near the top of this file -- record the
    // rejection so a later session doesn't re-add it as a fresh idea):
    //
    //   Three 6 Mafia, "Gotta Stay High" -- no such recording. Every
    //     search resolves to "Stay Fly" (hook is "I gotta stay FLY," not
    //     about weed, so it fails the station's own membership test) or
    //     to fan re-uploads that mislabel it "Stay High". "Da Summa" was
    //     offered as the real Three 6 weed track and declined; the slot
    //     was dropped rather than filled.
    //   Queens of the Stone Age, "Feel Good Hit of the Summer" -- the
    //     only official upload (QueensStoneAgeVEVO, bAXPUN2z2CE) is
    //     age-gated: LOGIN_REQUIRED, which the IFrame player cannot
    //     satisfy, so it would have been dead air. No Topic upload of the
    //     album track exists -- only the Reprise. Unofficial uploads were
    //     offered and declined. This is the exact failure oEmbed cannot
    //     see and tools/audition.js exists to catch.
    //
    // FOUR SOURCE SWAPS driven by availableCountries, not by provenance
    // -- in each case the first pick was the *better* channel and the
    // narrower licence, which is the trade this roster keeps meeting:
    //   Sweet Leaf   Black Sabbath - Topic   2 countries -> RHINO      249
    //   Mary Jane    Rick James - Topic      1 country   -> Topic      123
    //   How High     Redman - Topic          2 countries -> UPROXX     249
    //   Medicated    Wiz Khalifa - Topic     4 countries -> own channel 249
    // All four originals listed the US, so they would have passed a
    // naive US-only check and silently failed for everyone else.
    //
    // Every ID below: oEmbed 200, playabilityStatus OK, US-available,
    // embeddable, no duplicate on the roster and no title collision.
    realTrack('pZcMp40ZMwc', 'Sweet Leaf', 'Black Sabbath'),
    realTrack('eMK4cfXj5c0', 'Hits from the Bong', 'Cypress Hill'),
    realTrack('6cIePqdz03A', 'Legalize It', 'Peter Tosh'),
    realTrack('xBD6aStamvo', 'Mary Jane', 'Rick James'),
    realTrack('AMUaWc46_0U', "Marijuanaut's Theme", 'Sleep'),
    realTrack('O_BSg1ccGUM', 'Smoke Two Joints', 'Sublime'),
    // 4:20 exactly, which is the reason this one is on the brief at all.
    // The Topic upload is the only source that runs it to length -- the
    // official video edit is 4:50.
    realTrack('zx40kMDZaL0', 'Marijuana', 'Kid Cudi'),
    realTrack('QZXc39hT8t4', 'The Next Episode', 'Dr. Dre ft. Snoop Dogg'),
    // 4:14 -- the album cut. The other Topic entry (agJ6zyTB5ng, 5:09) is
    // a longer version; picked on duration, not on channel, since both
    // carry identical Topic provenance and identical titles.
    realTrack('Dsct-TZ26Pw', 'I Got 5 On It', 'Luniz'),
    realTrack('ewcl9zWUMfk', "You Don't Know How It Feels", 'Tom Petty'),
    realTrack('oDP6i4kUXvE', 'Weed Song', 'Bone Thugs-N-Harmony'),
    realTrack('VcEJyFjBwrs', 'How High', 'Redman & Method Man'),
    realTrack('vbED91NU4vE', 'Kaya', 'Bob Marley & The Wailers'),
    realTrack('3tnb2o-cV_0', 'Sativa', 'Jhené Aiko ft. Swae Lee'),
    realTrack('dV3AziKTBUo', 'The Joker', 'Steve Miller Band'),
    realTrack('OF3EUFnafp8', 'One Toke Over the Line', 'Brewer & Shipley'),
    // The Topic upload's own title misspells it "Doubie Ashtray". Spelled
    // correctly here on purpose -- the title field is what draws on the
    // status row, and verify-roster.js compares IDs, not titles, so this
    // will not read as drift.
    realTrack('XMjO4plTlb4', 'Doobie Ashtray', 'Devin the Dude'),
    // Topic carries this as plain "Good Times"; the parenthetical is the
    // name it is actually known by. Worth one listen against the dev
    // server to confirm it is the album cut and not a radio edit -- the
    // labelled "(Edited)" variants on this Topic channel are album-level
    // entries, so an unlabelled track should be the standard master.
    realTrack('dhVmXaUz5z0', 'Good Times (I Get High)', 'Styles P'),
    realTrack('EsyUa63NM1E', 'Pass the Dutchie', 'Musical Youth'),
    realTrack('Useh3zHVQXo', "Crumblin' Erb", 'OutKast'),
    realTrack('jLPvmwfklp8', 'Medicated', 'Wiz Khalifa'),
    realTrack('_9BGLtqqkVI', 'Hash Pipe', 'Weezer'),
    // The song, not the film -- the 1978 soundtrack's title track, 2:31,
    // off RHINO's official vinyl series. Searching the title alone returns
    // the movie, clips from it, and Yesca's instrumental theme; none of
    // those are what the brief asked for.
    realTrack('9_H1_8-CKls', 'Up in Smoke', 'Cheech & Chong'),
    realTrack('uBvzphvt8RA', 'Roll Another Number (For the Road)', 'Neil Young'),
    realTrack('WXSaCJrPNhU', 'Amerijuanican', 'Bongzilla'),
    realTrack('GY4HueJheFw', 'Illegal Smile', 'John Prine'),
    // 7:14 -- the full version, and the longest track on the roster. Kept
    // over the 4:55 single edit because the edit only exists on unknown
    // channels, and because this station already carries Sleep at 6:40
    // and Bongzilla at 6:46; long is on-brand here in a way it would not
    // be anywhere else on the dial.
    realTrack('49qZ4VLLjC8', 'One Draw', 'Rita Marley'),
    realTrack('ofsvcA-2XmE', 'Follow Your Arrow', 'Kacey Musgraves'),
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
//
// 2026-08-26: that decision was made, and the estimate held exactly --
// GREEN ROOM went in as one object literal and one array entry, with no
// call site touched. GREEN HOUSE itself is still parked; it is a
// different station that happened to want the same key, and the key went
// to GREEN ROOM. If jungle/dub ever comes back it needs a new binding,
// not this one.
export const SECRET_STATIONS = [NIN_STATION, GREEN_ROOM_STATION]
