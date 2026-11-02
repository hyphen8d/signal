# Curation pass 2026-11-01: notes

What each curator searched, passed over and why, behind the 122 candidates queued in `tools/pending-tracks.json` on 2026-11-01 (ceiling raised 50 -> 60). Each candidate's own rationale is in the queue entry; this is the record of what did NOT make it, so the next pass does not re-search it.

# Curation pass 2026-11-01 -- DISTORTION FIELD, COLD WAVE, RISE UP, HACKBACK

All proposals probed with `tools/audition.js` (id mode, `--json`): status OK,
embeddable, countries >= 103, no UNVERIFIED rows. Throttled twice (HTTP 429:
once mid-COLD WAVE, once mid-HACKBACK); waited ~18 min each time and
re-probed every affected id by itself before proposing it. Several searches
also failed with "fetch failed" when 6+ ran at once; batches of 5 worked.
Durations are compared to album lengths from memory -- where that is uncertain
the rationale says "listen".

## DISTORTION FIELD (50 -> proposes 8)
Searched: AIC Rooster, Mother Love Bone Stardog Champion, Babes in Toyland
Bruise Violet, Hum Stars, Soul Asylum Somebody to Shove, Bush Comedown, SDRE
Seven, PJ Harvey 50ft Queenie, Failure Stuck on You, Temple of the Dog Say
Hello 2 Heaven, Seven Mary Three Cumbersome.
Passed over:
- AIC Rooster: VEVO uAE6Il6OTcs is 7:04 against the 6:15 album (video intro --
  the Blind Melon "music video, not radio version" rejection applies); only fan
  copies otherwise, no Topic found. AIC already has 2.
- Temple of the Dog Say Hello 2 Heaven: the Topic is the 25th Anniversary MIX,
  the VEVO an alternate version -- neither is the 1991 original.
- Failure Stuck on You (MXvthgkZ2yQ, band's own channel, 3:57, 249 countries,
  clean): fits the lane, cut for count and because I could not pin the album
  length. Good next-batch candidate.
- Bush Comedown VEVO (4:39 video edit), SDRE Seven on Sub Pop (3:44 edit) --
  Topic album cuts proposed instead.
- Hum Stars: VEVO 5:02 proposed; fan tIG2hRt-yec (5:10, album length) noted as
  fallback.

## COLD WAVE (50 -> proposes 7)
Searched: Eurythmics Love Is a Stranger, Propaganda Duel, FGTH Relax,
Kajagoogoo Too Shy, Re-Flex Politics of Dancing, Animotion Obsession, Trans-X
Living on Video, Yazoo Situation, Ultravox Dancing With Tears, Human League
Love Action, Kraftwerk Computer Love.
Avoided OMD Enola Gay (rejected, "don't like song").
Passed over:
- Animotion Obsession: both Topics run 5:35 (an extended/album mix, not the
  ~4:00 single), and B-WGXrAxsTE is NARROW-LICENCE:6. Also leans to the later
  pop-crossover side.
- Yazoo Situation: RHINO ysmVlaw36L0 is 5:47, the US 12" dance mix, not the
  single. Clean (249 countries) if Matt wants that mix.
- Kraftwerk Computer Love: fan uploads only (3:51 single edit, 7:20 album);
  also arguably electronic rather than new wave -- lane call left for Matt.
- Trans-X Living on Video: search returned nothing usable.
- Re-Flex fan upload GLzDFbGdL5M: NARROW-LICENCE:19.
Ran 7 rather than 8: the remaining candidates were all a wrong mix or a fan
upload, and quality beat count.

## RISE UP (34 -> proposes 8)
Searched: Bikini Kill Rebel Girl, Fugazi Merchandise, Dropkick Murphys Which
Side Are You On, Prophets of Rage Unfuck the World, Crass Do They Owe Us a
Living, Green Day American Idiot, NOFX Franco Un-American, MDC John Wayne Was
a Nazi, Subhumans Religious Wars, Agnostic Front United and Strong.
All eight are NEW artists (station was 15 artists, mostly at 2-3 tracks each).
Passed over:
- Prophets of Rage VEVO 6ad4MH7fMLs: LOGIN_REQUIRED (dead air). Band channel
  copy proposed.
- Crass: the "Crass Agenda - Topic" upload (7f1Dmm-tF-k, 1:24) is credited to
  Penny Rimbaud's later project, not Crass -- could be a mis-credit or a
  re-recording, so not trusted. Fan upload Furrw0VDpWM (Punk & Protest, 1:25,
  249 countries, clean) matches the 1978 Feeding of the 5000 cut; a valid
  backup under the widened-provenance rule but wants a listen.
- Agnostic Front United and Strong (clPCJy_uPZg, 1:09, 123 countries, clean):
  a unity anthem more than a protest one; held as a backup. The other Topic,
  UObk-by2O1Y, is 103 countries.
- Green Day official video Ee_uujKuJMI (3:01, video padding); MDC Stains 7"
  take YQMwT7k4Iuo; Bikini Kill second Topic jfCqCKY5nUc (244 countries).
Not searched, on purpose: Sex Pistols (1976-77, before the 1978 lane start),
ska/reggae protest (lane separation), more RATM/SOAD/Clash (already 3 each).

## HACKBACK (50 -> proposes 8)
Searched: Roxanne Shante Have a Nice Day, The Coup Fat Cats Bigga Fish,
Arrested Development Tennessee, Jazzy Jeff & Fresh Prince Summertime, Tha
Alkaholiks Make Room, BDP My Philosophy, Main Source Looking at the Front Door,
8Ball & MJG Space Age Pimpin'.
Avoided Bone Thugs Tha Crossroads (rejected) and Snoop's Gin and Juice.
Coast balance: the 50 were NY 26 (52%). This batch is 3 NY (BDP, Main Source,
Roxanne Shante), 2 West (The Coup/Oakland, Tha Alkaholiks/LA), 2 South
(Arrested Development/Atlanta, 8Ball & MJG/Memphis-Houston), 1 Philadelphia
-> NY 29/58 = 50%. Roxanne Shante closes the last named women's gap.
Passed over: Arrested Development VEVO (3:58 edit), The Coup on UPROXX (4:41
edit), Summertime fan lyric upload bBs60R9qahI (4:35, album length -- noted
as fallback for the VEVO 4:01 edit).


# Curation notes, 2026-11-01 (curate-b): CITY LIGHTS, SYNAPSE, CIRCUIT CRUSH, CIPHER

Every proposal comes from a clean probe (UNVERIFIED: 0 on the run that produced its row). The raw
JSON for every run is beside this file (cl1/cl2, mn1/mn2, cc1-cc3, cp1-cp3 .json). There were two
throttle windows (HTTP 429): one during CITY LIGHTS batch 2 and one during CIPHER batch 2. Each
was waited out for 18 minutes, and the affected ids were probed again cleanly. Nothing was taken
from a throttled row.

## CITY LIGHTS (7)
Searched: Mai Yamane Tasogare, Yumi Matsutoya Chuo Freeway, Junichi Inagaki (Double Image, then
Dramatic Rain), Ginji Ito Baby Blue, Taeko Ohnuki Carnaval, Makoto Matsushita Love Was Really
Gone, Anri Windy Summer, Hiroshi Sato (I Can't Stop the Night / Awakening), Mariya Takeuchi Fly Away.
Took 7. Six are official, Topic or used-here channels; one is from a fan channel (Ginji Ito, dominigel).
Passed over:
- Ginji Ito - Topic "2017年のBABY BLUE": a 2017 re-recording, not the 1982 original.
- Yumi Matsutoya - Topic "Chuo Freeway (2022 Mix)": a remix. Took the plain Topic upload.
- Hiroshi Sato: the Topic upload has "Awakening" (3:42) and "Awakening (Kakusei)" (2:28). I could
  not tell which is the song and which is an interlude without listening, so I left both out.
  "I Can't Stop the Night" did not come up in the search.
- Mariya Takeuchi Fly Away: only fan uploads, plus a 25-minute laserdisc rip, and I could not pin
  the release. She already has 2 tracks.
- Junichi Inagaki "Double Image": the search returned "DOUBLE meaning" (Topic) instead. I did not
  take it because I'm not sure it is the song I was looking for.
- Yamashita (4 tracks), Anri (3, Windy Summer would make 4) and Momoko Kikuchi (3) are already
  heavy. I avoided Yamashita entirely.
I stopped at 7 rather than pad the list with another fan upload. The takedown rule argues for
adding as few fan channels as possible.

## SYNAPSE / midnight-neon (8)
Searched: Mau P Gimme That Bounce, Dom Dolla Saving Up, John Summit La Danza, Chris Lake & NPC
A Drug From God, Eli Brown Believe, FISHER You Little Beauty, Michael Bibi & KinAhau Different
Side, Odd Mob & OMNOM Losing Control, Ben Sterling Mazza, Mochakk & Joni Da Fonk.
Passed over:
- FISHER You Little Beauty (X4xF5ymdQG8, FISHER's channel, 3:27, 249 countries): clean, but it
  would be FISHER's 5th appearance. It is the first spare if one is wanted.
- Ben Sterling Mazza: the search returned junk (Judge Judy, etc.), so I didn't pursue it.
- Rebuke remix of A Drug From God, the Marco Carola and Dub mixes of Da Fonk, and the Selected.,
  Myth of NYX and PROFOUND re-uploads: not taken, per the profile's provenance rule.
Both the "Extended Mix" picks (La Danza, Losing Control) carry CHECK-VERSION. That flag is the
documented false positive on this station.

## CIRCUIT CRUSH (8)
Searched: GUNSHIP Dark All Day, Kavinsky Roadgame, The Midnight Vampires, Daniel Deluxe Star
Eater, Danger 22:39, Lazerhawk So Far Away, Power Glove Blood Dragon Theme, Dance With The Dead
Andromeda, Kalax, Miami Nights 1984 Accelerated.
Passed over:
- Lazerhawk So Far Away: only fan uploads (Ezek, Divine Music, Akuro Soren), with durations of
  4:13, 4:41 and 4:42 that disagree with each other.
- Kalax: the search did not return "Inside Out". The other Kalax hits were a demo and less
  central songs.
- GUNSHIP Dark All Day (Power Glove Remix): a remix. I took the original music video instead,
  with the caveat that it runs about 15 seconds over the album cut. Same risk as ProtoVision.
- The Midnight Los Angeles: the [Live] version was pulled in the 50th pass, so I avoided the song.
- Perturbator and Carpenter Brut already have 3 each, so I picked new or thinner artists instead.

## CIPHER (7)
Searched: Chemical Brothers Leave Home, Underworld Pearl's Girl, Rob Dougan Furious Angels,
Dub Pistols Cyclone, Meat Beat Manifesto Radio Babylon, Stanton Warriors Da Antidote, Crystal
Method Born Too Slow, Plump DJs Big Bug, Junkie XL Zerotonine, Lunatic Calm Roll the Dice.
Deliberately not searched, because each is on the record as removed or rejected:
- Removed: Elektrobank, Smack My Bitch Up, Safe From Harm, Stem/Long Stem, Cirrus Back on a
  Mission.
- Rejected: Praise You, Rockafeller Skank, King of Snake, Push Up, Superstylin', Red Alert,
  Where's Your Head At, At the River, Finished Symphony.
- Leftfield, Aphex Twin and the Prodigy (5 tracks already; Poison is held back as the reserve)
  were left alone for the same reason.
Blocked on availability, not lane:
- Rob Dougan Furious Angels: the Topic upload is NARROW-LICENCE:7. A fan 4K upload is
  NARROW-LICENCE:8. The only wide one is a fan upload (PEX88).
- Dub Pistols Cyclone: the Topic upload is NARROW-LICENCE:2. Everything else is a fan upload.
- Plump DJs: the search returned only "Big Groovy Funker" fan uploads and a full DJ mix, never
  "Big Bug".
- Pearl's Girl album/remaster (9:37): too long given the station's record against extended
  mixes. I took the 4:21 single from Underworld's channel instead.
Length warnings for Matt: Radio Babylon (6:23) and Da Antidote (6:03) are their full release
lengths, and I found no shorter studio edits of either.


# Curation notes -- 2026-11-01 (curate-c)

## THE CRYPT (32 -> proposing 8)

Searched: "Fief dungeon synth", "Old Tower dungeon synth", "Erang dungeon synth",
"Hole Dweller" (all four returned album rips almost exclusively -- The Dungeon
Synth Archives, Out of Season, Erang's own 2-hour compilations), then the
"- Topic" route: "Fief - Topic", "Erang - Topic", "Old Sorcery - Topic",
"Hole Dweller - Topic", "Old Tower - Topic", "Sequestered Keep - Topic",
"Lord Lovidicus - Topic". Also re-probed the profile's two named clean backups
(Old Tower Night's Spell MobljdsjRe0, Fief Upon Her Sword XjAzDmdy4Sc).

Passed over:
- Every album rip: DffQVP6UqVQ / FMCP39f3_wg (Fief II/IV, Dungeon Synth Archives),
  fqlH7di8oI4 / c5dTmBNjP54 / _0RKFegsu-A (Fief on Out of Season, 40 min-2h),
  tOqFr1AgYT4 / gBmz4O41jfc / 66HmBxrTlrQ / 9pxA-tRA9fQ / YfNukMlhVhs / kcMAI4lbL84
  (Old Tower records), xzj-1WE3P9M / Wp9pzKbENQk / 9WY7E9X0yvo / 1h05bOFwdWM /
  bf_cZAKzWrU (Old Sorcery records -- no Topic singles surfaced at all),
  2_uhgSMLGQg / fgr8_ZWUYTA / GI4rvqZWZAk / p99R2G2QowA / 9zO-UIIjnN8 (Erang
  records and mixes), DsstVnF8Tvk / W7HQBN2SOsw / NUzJ_Zc5duM / xfHaGywtLu0
  (Hole Dweller records/discography), 3_WJg_dz-xw / _x7RzyKRC4U (Sequestered Keep).
- Erang - Topic singles (Dystopian Dungeon, Her Digital Castle, Neo-Feudalism,
  I Will Never Apologize for What I Am, Infinita Tristeza): all from Erang's
  cyber/dystopian turn. "Dystopian", "Digital", "Neo-Feudalism" are exactly the
  synthetic-dread side of the NOT-COLD-WAVE boundary; Neo-Feudalism is also
  1:48. Erang's classic fantasy records only surfaced as album rips. Erang stays
  open -- a targeted search for a title off one of the early records
  (Another World Another Time era) is the next step.
- Old Tower "Portrait III" (1:40, too short to carry a dial slot).
- Lord Lovidicus "The Coming Of Days..." (1:54, an intro), "Necromancer of the
  South Wood" (2:36, fine but the two picked are stronger shapes), "All Along The
  Skeletal Crypts..." (6:35, clean backup).
- Fief: Secret Shops / Echoes of the Apse / Medieval Skies / A Good Inn all clean
  (Fief - Topic, 249). Kept Fief to the profile's
  named backup only, to stop one artist growing; Valley of the Bees (tspQMQ4Zng8,
  5:50, 249) is the first backup.
- Hole Dweller: Passenger, Love in the Wind, Hole in One, the Longpipe title
  (3:47; long title truncates on the dial) -- clean backups. The artist's own
  channel single PXpIS-Kpswg (Memories in Wildflower..., 3:08, 249) also clean.

Proposed: Old Tower Night's Spell + Darkling Magic Winds, Fief Upon Her Sword the
Sunlight Shone, Sequestered Keep The Lakes Beneath the Lakes + Wizardwindwanderer,
Lord Lovidicus Castle Garden + The Dire Fortress Awaits Assailment, Hole Dweller
Footpaths. Three new artists (Sequestered Keep, Lord Lovidicus, Hole Dweller), five
channels. Titles came off real Topic/artist-channel listings, not recall.

## NEON STASIS (38 -> proposing 7)

Searched: "Hantasi - Topic", "PowerPCME - Topic", "Disconscious - Topic",
"Waterfront Dining - Topic", "Luxury Elite - Topic", "18 Carat Affair - Topic",
"Hantasi Vacant Places", "Sunset Corp - Topic" (this batch hit HTTP 429 on 7 rows;
nothing from the UNVERIFIED rows was used, waited 18 min), then "Sunset Corp - Topic"
again, "식료품groceries", "Cat System Corp - Topic", "Chuck Person - Topic".

Passed over:
- Hantasi - Topic: Secret Unraveled, Temple Falls, Prison Walls Closing In,
  Delilah's Song, White Light Special (all clean, 249). Could not tell which record
  they come from; Hantasi's catalogue is not all mallsoft, and these are not the
  Vacant Places titles. Worth a listen-pass by someone who can hear them; not proposed blind.
- Hantasi Vacant Places / Vacant Places II / Vacant Palace: album rips (37-43 min).
- PowerPCME "The Rainbow Of Colors All At A Low Kmart Price!" (xgLmnx_UfuY, 2:33, 123)
  -- clean backup; held back so PowerPCME does not reach 5. "I'm not afraid" (2:47)
  and a 1:07 track titled with a youtu.be URL -- passed.
- Luxury Elite Attitude (3:19), Forever (2:56), Strut (1:51) -- clean backups.
- 18 Carat Affair - Topic: every hit 1:04-2:20 (PG / VG, Modus Operandi, Lagerfeld
  '88 Simulator...) -- too slight for a dial slot.
- "Disconscious" on Vapora - Topic (1:22, a different artist with that track name);
  Disconscious "Lunar Angel" on a fan channel titled in fullwidth Latin; "Mattress
  Store" (1:52, Vaporwave Japan).
- Waterfront Dining "forever and a day" (christmdog) and "theme from boardwalk [7/12]"
  (LSTHETIC, labelled as part 7 of 12 -- smells like a split album).
- Groceries Store: only album rips (HOUSEWARES, Yes! We're Open, Ascension, a 42-min
  record) -- the profile's rejected kCTpu9ywCII among them. No new single tracks.
- Cat System Corp Customer Service (z52o7aRLRCQ, Topic, 2:29, 123): clean, but I
  could not confirm whether it is Palm Mall or the News at 11 signalwave record
  the profile already passed for lane. Fills the artist's open slot IF Matt knows it
  is the mall record.
- Chuck Person eccojams (feelings, Too Little Too Late, B7 Extended): chopped
  SUNG pop loops -- not wordless, and on personal channels.
- Sunset Corp - Topic search returned only unrelated "Sunset" tracks.
Shortfall: 7, not 8. The remaining single-track mallsoft on YouTube is mostly on
reupload channels or credited in scripts the font cannot draw; I stopped rather than
pad with uncertain-lane picks.

## SLOW ORBIT (32 -> proposing 8)

Searched: "Tosca Suzuki", "Bonobo Kiara", "Air La Femme d'Argent",
"Boozoo Bajou Night Over Manaus", "Zero 7 Polaris", "Kruder Dorfmeister High Noon",
"Bonobo Kong", "Nightmares on Wax Nights Interlude",
"Thievery Corporation Shaolin Satellite", "Royksopp By Night Melody AM".

Direction note for Matt: the station's existing roster is netlabel/small-label European
chillout. These picks are the genre's well-known canon (Tosca, Bonobo, Air, Zero 7,
K&D, Thievery, NOW). They fit the brief (warm pads, unhurried beat, instrumental)
but would make the station more recognisable and less obscure. Air (1998), High
Noon (1993) and Nights Interlude (1999) predate the profile's 2000s eraLane.

Passed over:
- Boozoo Bajou Night Over Manaus: no Topic copy; Modernsoul and The Itinerant are
  personal channels; the Hotel Costes 2 upload (Pschent, 4:53) is a compilation copy
  that may be an edit. A good fit if an official upload turns up.
- Tosca Suzuki full-album uploads (59 min).
- Bonobo Kiara live video (CHECK-VERSION) and fan reupload; Kong live at the Showbox.
- Air: the "Studio Atlas Version" (a re-recording) and a restored music video copy.
- K&D High Noon "Official Music Video" (4:39, an edit) and a personal-channel copy.
- Nightmares on Wax "Les Nuits" (VEVO, 3:36 -- shorter than I would expect of the album cut,
  not verified, so not proposed).
- Royksopp Melody A.M.: only album rips surfaced.
- Not searched by design: anything from Smooth Genestar / Caslon / FEO catalogues
  (titles need reading off Bandcamp one by one, per the profile).

## DRIFT MODE (50 -> proposing 8)

Searched: "Steve Roach Structures from Silence", "Gigi Masin Clouds",
"Stars of the Lid Dungtitled in A Major", "Hiroshi Yoshimura Water Copy",
"Jon Hopkins Abandon Window", "Satoshi Ashikawa Still Space",
"Sarah Davachi Perfumes III", "Harold Budd The Pearl".

All eight picks are unambiguous ambient/drone/kankyo ongaku, sidestepping the
profile's open neoclassical question; none from Cryo Chamber (also an open
question). Five new artists (Roach, Masin, Ashikawa, Hopkins, Davachi).

Passed over:
- Structures from Silence deluxe-edition copy (rt97c92WjRw, 28:48) in favour of the
  plain remaster; the 58:43 full-album upload.
- Gigi Masin Wind full album (81 min); a "slowed extended intro" edit.
- Stars of the Lid Dungtitled on two personal channels (one 4:49, a different length).
- Yoshimura Water Copy on a personal channel; Wet Land full album.
- Jon Hopkins KCRW live medley; a personal-channel copy.
- Ashikawa Still Way full album (64 min). Light in the Attic copy M_8eRDmn9PI
  (249 countries) is an equally good alternative to the Topic one proposed.
- Sarah Davachi Perfumes I (8:27, Topic, clean) -- backup.
- Budd/Eno The Pearl "stretched" 340-minute upload and Pavilion of Dreams album.
Room for 2 more after these 8 (ceiling 60).

## Throttling
One HTTP 429 run (7 UNVERIFIED rows, NEON STASIS batch 2, after ~70 probes).
Waited 18 minutes; every later batch came back with 0 UNVERIFIED. Nothing proposed
rests on an UNVERIFIED row. Total roughly 170 probes across 11 search runs.


# Curation notes, 2026-11-01 (curate-d: atomic, tradewinds, after-hours, mirrorball)

I hit throttling twice (HTTP 429, about 15 minutes after each of the TRADEWINDS and MIRRORBALL searches). Both times I waited about 17 minutes and re-probed the ids directly. Every proposal comes from a clean, non-UNVERIFIED audition-mode probe (`unverified: 0`).

## ATOMIC (40 to 48)

Source: the Diamond City Radio track table on fallout.wiki, fetched 2026-11-01 (fandom returned 402). The roster already holds every DCR main-list song except these:
A Wonderful Guy, Ac-Cent-Tchu-Ate the Positive, Anything Goes, Happy Times,
He's a Demon..., One More Tomorrow, Rocket 69, Undecided, Worry Worry Worry.

- Proposed 8: all of those except Anything Goes.
- Passed over: **Anything Goes**. The game credits Cole Porter / Vince Giordano and his Nighthawks. Porter's own record is from 1934 and the Giordano one is modern, so neither fits "genuine 1940s-1950s recordings". I didn't probe it.
- Searched and not used: the Fallout-soundtrack rips (Człowiek Drzewo, the "Fallout Wiki" channel, a 1:09 clip), the "singalong" and H2O copies of Ac-Cent-Tchu-Ate, and the 2007 One Media copy of Undecided (RjoBR6p7XV4, a different release).
- Backups, all probed clean: Tex Beneke Topic vY8UUmIeoPQ (122); Hutton Gluttons g6LlW902JRk (249); Frankie Carle Topic 4JZ4dvlP78U (123); FalloutMusicChannel ZBOpCra4kGg (249); Todd Rhodes Topic r10sFM0r2fM (249); Bob Crosby Topic qG4G_pUkd0s (123).
- Owner's calls:
  - Undecided is a 1939 recording, a year before the era lane.
  - Happy Times makes Bob Crosby's third track here.
  - The Ac-Cent-Tchu-Ate Topic copy sits on a 2011 Fanfare budget compilation. Listen to check it's the 1944 Decca side.
- I didn't search Appalachia Radio (Fallout 76) gaps this pass. That's the next source if ATOMIC grows further.

## TRADEWINDS (32 to 39); instrumental station, every pick wordless

Listings read: Ritual of the Savage (Wikipedia), Exotica 1957 mono (Wikipedia), and Taboo HiFi R 806 (45worlds/vinyl listings via search).

- Proposed 7: Les Baxter Sophisticated Savage and Kinkajou; Martin Denny Return to Paradise (Way Gone Music, 2:21 against the 2:19 mono listing); Arthur Lyman Sim Sim; Robert Drasnin Voodoo (rN9HyY0ez3E, the backup the profile already names); Frank Hunter White Goddess; The Waitiki 7 Ouanalao.
- Passed over:
  - Denny's 4PZmXAC1rOg (2:34, probably the stereo re-recording).
  - Chaino (Toomba-Leeru 4plM42gxSYw, Topic 2:25, 123, clean). Chaino records carry chant vocals that would need a listen against the instrumental flag, and the only Topic source is a 2012 "Essential World Masters" budget compilation.
  - The Waitiki 7 Similau (TITLE-ON-STATION, and there's a live copy too).
  - Frank Hunter fan copies.
  - Arthur Lyman China Clipper (the search dropped; I didn't retry).
- Shortfall: 7, not 8. Denny and Lyman each reach 7 tracks if their picks are approved. I'd rather stop than add an eighth to either name. The revival side already has Kava Kon, Ixtahuele and Tikiyaki at 5–7 each.
- I didn't touch Shangri-La q243fPsJIK4, as instructed.

## AFTER HOURS (40 to 48); instrumental station, every pick wordless

Listings read on Wikipedia: Night Lights, Blue & Sentimental, Blue Hour (search summary), Duke Ellington & John Coltrane, Eastern Sounds, Left Alone, Idle Moments, Flight to Denmark.

- Proposed 8. All are new artists except the Ellington/Coltrane co-credit.
- Passed over:
  - Bill Evans Peace Piece (rejected; solo).
  - Oscar Peterson Night Train (held back in the profile).
  - Art Pepper Imagination (I couldn't read the listing off Wikipedia; not searched).
  - Willow Weep for Me / You Don't Know What Love Is on Blue Hour / Left Alone (both songs are already on the roster).
  - Lateef RVG copy BrEZTxPeI48 (31 countries).
  - Mulligan full-album uploads (u5PG7aRYS1k, Uz559yOmCcY).
  - Waldron fan copies and a Billie Holiday vocal clip.
  - The Blue Note 7 Idle Moments (a 2008 cover).
  - The Duke Jordan live-in-Paris take.
- Flags:
  - Idle Moments runs 14:58.
  - Duke Jordan is 5:43 against Wikipedia's 5:34. The description confirms the album, but check Discogs.
  - Left Alone's Topic copy is on a 2020 reissue label.

## MIRRORBALL (40 to 47)

- Proposed 7: the four never-probed titles from the profile's next-pass list (TSOP, Shake Your Groove Thing, Bad Luck, Best of My Love), plus We Are Family (8:17 album), Yarbrough & Peoples Don't Stop the Music (7:52 album), and B.T. Express Do It (5:54 album).
- Re-checks the profile asked for:
  - KC and the Sunshine Band That's the Way (yupPvZF6oBw): still NARROW-LICENCE:3.
  - Lakeside Fantastic Voyage (jop32UA5y8k): still 22 countries.
  - Neither is proposed. Both rejections stand.
- Passed over:
  - The Whispers And the Beat Goes On. Topic qRYnbd2tW78 is 7:34 at only 22 countries; the Solar Records video is 4:29, the video edit. No shippable copy.
  - Change A Lover's Holiday. Topic bulSq7mQzMM is NARROW-LICENCE:3. The 249-country Topic l8CX1j9NQCQ is a "2015 Remastered 12-inch Jim Burgess Mix" (6:24 against the 6:26 12-inch). It might be the 1980 promo mix, but a mixer credit is exactly what the profile excludes without proof, so I left it.
  - Donna Summer Hot Stuff. Only medley and fan copies surfaced; Bad Girls on Topic is NARROW-LICENCE:1.
  - We Are Family RHINO video (3:06, a video edit).
  - Peaches & Herb e-LeujZNV08 (5:32, matches no version).
  - Yarbrough & Peoples fan copy 9tbS73I1N-I.
- Shortfall: 7, not 8. The next good leads all failed on licence or version.
- Owner's call: We Are Family comes off the same album as He's the Greatest Dancer, which breaks the founding one-per-album rule.


