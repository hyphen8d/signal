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




## Approved 2026-11-02 -- all 122, on Matt's "make all candidates live"

Each entry's rationale as it stood in the queue; the queue empties on approval, so this is where the reasoning for every addition lives now.

### distortion-field

- **Babes in Toyland -- Bruise Violet** (`XON5kVxHBYA`). 1992 Minneapolis noise-grunge (Fontanelle, produced by Lee Ranaldo) -- the raw-vocal, guitar-wall end of the lane, and a second loud women-fronted band beside Hole and L7. Babes In Toyland - Topic, 2:52 against the album's ~2:53, 123 countries, embeddable, no flags. Kat Bjelland screams; it is meant to.

- **Hum -- Stars** (`gMEB4HNNZ2I`). 1995 Champaign alt-rock single, the slow-crushing-riff ripple of the Seattle sound that MTV's 120 Minutes ran beside Helmet and Failure. HUMVEVO (VEVO, matches station provenance), 249 countries, no flags. It runs 5:02 against the album's ~5:09, so it is probably the video/radio edit rather than the LP cut -- listen for a clipped fade; the 5:10 fan upload tIG2hRt-yec (LISTENING PARTY, 249 countries) is the album-length fallback.

- **Soul Asylum -- Somebody to Shove** (`OrrE5bCA5lg`). 1992 Minneapolis, Grave Dancers Union's loud opening single -- deliberately not 'Runaway Train', which is the pop-crossover side the constraint excludes. SoulAsylumVEVO, 3:14 against the album's 3:15, 249 countries, no flags.

- **Bush -- Comedown** (`cPlgoNY2xqw`). 1994 Sixteen Stone single, the band's biggest US radio hit and squarely of-era; Bush has one track here. Bush - Topic '(Remastered 2014)', 5:27 against the album's 5:26 -- chosen over BushVEVO's 4:39 video edit (the Blind Melon rejection says Matt wants the album cut, not the video). 120 countries, no flags.

- **Sunny Day Real Estate -- Seven** (`GS3dDQpSeAQ`). 1994 Seattle, Sub Pop -- Diary's opener, the Seattle sound bending toward emo, a true local ripple. Sunny Day Real Estate - Topic '(Remastered)', 4:46 matching the album; Sub Pop's own video (gAotWVmVRS4, a channel this station already uses) was passed over because it is a 3:44 edit. 249 countries, no flags.

- **PJ Harvey -- 50ft Queenie** (`jKLiU7Hq93w`). 1993, Rid of Me (Steve Albini) -- raw, guitar-loud, the alt-rock end of the lane, adds an artist not on the station. PJHarveyVEVO, 2:24 against the album's 2:23, 249 countries, no flags.

- **Mother Love Bone -- Stardog Champion** (`prij-gGXITk`). 1990 Seattle, Apple -- the band Andrew Wood fronted before Stone Gossard and Jeff Ament founded Pearl Jam; Temple of the Dog (already here) was written for him. Root-of-the-lane rather than ripple. On PearljamVEVO, 5:05, 244 countries, no flags; the album cut is ~4:57, so the extra ~8s is probably video head/tail -- listen for anything non-musical at either end.

- **Seven Mary Three -- Cumbersome** (`NjNn4bbbgSw`). 1995 single, the first-wave post-grunge ripple while it was still of-era (the constraint allows post-grunge only when genuinely of-era; this is 1995, not 2000s). Atlantic Records' official upload (UNKNOWN-CHANNEL only because the station has not used that channel), 3:59 against the album's ~3:56, 249 countries. Judge it on the lane: it is the most radio-rock pick here, and the one to drop if the line is drawn at Seattle-and-noise.

### neon-stasis

- **PowerPCME -- Just A Little More Shopping** (`8GMI47qipEM`). From Kmart 1989-1992, which the profile names as the easiest core mallsoft to find as single tracks; PowerPCME - Topic, 3:12, status OK, 123 countries, embeddable, no flags. Same channel as Rubbermaid and Attention shoppers! already on the station. Built from Kmart in-store tapes: listen for spoken PA announcements -- speech, not singing, so it stays wordless for [L]'s purposes.

- **PowerPCME -- Bluelight specials going on now!** (`6e0dJkZ7Wig`). Second Kmart 1989-1992 track, PowerPCME - Topic, 2:08 (the same length as Attention shoppers!, already the station's shortest), status OK, 123 countries, no flags. The title is the store's own PA line, as on-lane as mallsoft gets. Would take PowerPCME from 2 to 4 tracks -- drop this one first if that is too many. Expect spoken announcements in it.

- **Luxury Elite -- Up Next** (`Z2u_Ok9irCk`). Luxury Elite - Topic (already the station's channel for Parkway/Upscale/Crystal), 2:51, status OK, 175 countries, embeddable, no flags. Slow, smooth late-night lounge in Luxury Elite's usual manner. Luxury Elite sometimes loops R&B samples, so listen for a sung hook; if there is one it would need adding to vocalTracks, or should be dropped.

- **Luxury Elite -- S.W.A.K.** (`puaPTW0DjqA`). Luxury Elite - Topic, 3:54, status OK, 123 countries, embeddable, no flags. Takes Luxury Elite to 5 if both are approved -- take one. Same caveat as Up Next: the source sample may be sung, so listen before treating it as wordless.

- **Waterfront Dining -- Okinawa** (`fh5TXDKnAro`). Waterfront Dining is a core mallsoft act (3 on the station). This upload is on the same reupload channel ('Sound Station') as Paradise Vacations, already on the roster: 4:02, status OK, 249 countries, embeddable, no flags. No Topic copy of Waterfront Dining exists in search. Listen for whether the sampled source carries a vocal. Two tracks on one reupload channel is the takedown exposure the profile warns about.

- **Waterfront Dining -- Miami Wicked** (`vqKP2wqsAj0`). Waterfront Dining on a second reupload channel (VPRWAV), which spreads the exposure: 3:40, status OK, 248 countries, embeddable; flag UNKNOWN-CHANNEL only. Searched by track title, per the profile; it is a single track, not a rip. Listen for a sampled vocal and for future-funk bounce -- if it pumps rather than drifts, pass it.

- **Disconscious -- Enter Through The Lobby** (`9m7M6wpjuUU`). Disconscious is the founding Hologram Plaza act (3 on the station); this title belongs to the same lobby-and-atrium vocabulary. On a fan reupload channel: 4:49, status OK, 249 countries, embeddable, UNKNOWN-CHANNEL only. No Topic copy surfaced (the 'Disconscious' Topic hits were 1:22 tracks by someone else). Wordless as far as the genre goes; listen to confirm it is the original and not a slowed/edited reupload.

### cold-wave

- **Eurythmics -- Love Is a Stranger** (`9cFzKPdImjo`). 1982, the Sweet Dreams album's first single -- sequencer pulse and Lennox's cold delivery, exactly the drum-machine-and-cold-hook brief. Eurythmics - Topic '(2018 Remastered)', 3:44 against the album's 3:43, 123 countries, no flags; preferred over EurythmicsVEVO's 3:50 video. Eurythmics goes to two tracks.

- **Propaganda -- Duel** (`GwvO97FbmW0`). 1985 ZTT, A Secret Wish -- Düsseldorf synthpop produced in the Trevor Horn stable, about as 'cold wave' as the lane gets; new artist for the station. Propaganda - Topic, 4:42 against the album's ~4:44, 123 countries, no flags.

- **Frankie Goes to Hollywood -- Relax** (`AKBbMlp0nEA`). 1983 ZTT, Trevor Horn's Fairlight-and-sequencer production -- synth-driven to its core and an era-defining single not yet on the station. Frankie Goes To Hollywood - Topic, 3:58, consistent with the 7-inch single, 122 countries, no flags. Over FGTHVEVO's 4:10 video. Listen once that it is the familiar single mix -- this title exists in many mixes.

- **Kajagoogoo -- Too Shy** (`2azCuCWf63Q`). 1983, White Feathers -- Nick Rhodes co-produced, synth-bass-and-drum-machine new wave, a new artist here. Kajagoogoo - Topic '(2004 Remaster)', 3:46 matching the album cut, 123 countries, no flags. RHINO's 3:41 video (a channel the station already uses) is the single-edit alternative.

- **Re-Flex -- The Politics of Dancing** (`AN40EWNZK8A`). 1983 single, synth-driven UK new wave and a one-hit gem the station lacks. Re-Flex - Topic, 3:57 (the single version), 123 countries, no flags. A fan upload GLzDFbGdL5M was passed over as NARROW-LICENCE:19.

- **Ultravox -- Dancing with Tears in My Eyes** (`SzGJ13_KVOo`). 1984, Lament -- a nuclear-dread synth anthem, the coldest of Ultravox's hits; Ultravox goes to two tracks beside Vienna. Topic upload (channel credited 'Ultravox!'), 4:04 = the single version (album cut is ~4:40), 123 countries, no flags. The band's own 4:28 video (249 countries) has video intro padding and was passed over.

- **The Human League -- Love Action (I Believe in Love)** (`7SfuxmpLpO8`). 1981, the Dare-era single that preceded Don't You Want Me -- pure drum machine and Linn/Martin Rushent production; Human League goes to two. The Human League - Topic '(Edit / Remastered 2021)', 3:52, the 7-inch edit rather than Dare's ~5:00 cut, 121 countries, no flags. Passed over TheHumanLeagueVEVO's 3:27 TV-performance upload ('Multi Coloured Swap Shop').

### midnight-neon

- **Mau P -- Gimme That Bounce** (`Y-iVeTyn7n0`). Mau P's 2023 follow-up to Drugs From Amsterdam -- current-rotation tech house with a chopped vocal hook, exactly the station's festival end. From Mau P's own channel (used here), 3:38 single length, 249 countries, no flags. It is the Official Video upload; listen for any non-music intro.

- **Dom Dolla -- Saving Up** (`5sgc8RJezrE`). Dom Dolla's 2023 single, a big-room tech-house vocal record in the same lineage as Rhyme Dust and Miracle Maker. DomDollaVEVO 'Official Audio', 3:28 (the single edit), 227 countries, no flags -- chosen over his own channel's 'Last Night in Vegas Visual' cut and the Selected. re-upload.

- **John Summit -- La Danza** (`DrO5TTpxO24`). John Summit's 2022 Defected release -- Latin-vocal-chopped tech house, rawer than Where You Are/Human and a good counterweight to them. Defected Records (a label this station already uses), 5:39 Extended Mix; the club version is the format here per the profile, and the CHECK-VERSION flag on 'mix' is the documented false positive. 249 countries. A 2:38 Defected edit and a 4:36 artist-channel cut also exist if Matt prefers short.

- **Chris Lake & NPC -- A Drug From God** (`nsmvBR37xps`). Chris Lake & NPC's 2023 'A Drug From God' (Black Book), one of the most-played tech-house records of its year and a darker, sparser groove than Beggin'/Deceiver. Chris Lake's own channel (used here), 3:12, 249 countries, no flags. The same channel carries a Rebuke Remix (3:08) -- not taken.

- **Eli Brown -- Believe** (`EsR0RaLXnY0`). Eli Brown's 'Believe' (2020/21) is a peak-time tech-house anthem built on the classic vocal sample; Eli Brown already appears via Solardo & Eli Brown's XTC, this is his own. Eli Brown - Topic, 6:49 original mix (matches the two re-uploads' 6:49/6:51 'Original Mix'), 123 countries, no flags. Long, but six-minute club mixes are normal here.

- **Michael Bibi & KinAhau -- Different Side** (`NB95LaBYdsA`). Michael Bibi & KinAhau feat. Audio Bullys (2023), Solid Grooves-era underground tech house -- keeps the Ibiza end weighted against the main-stage picks. From Michael Bibi's own channel, 5:32 (the extended/club length; Solid Grooves Records and KinAhau carry a 3:14 edit), 249 countries. UNKNOWN-CHANNEL because the existing Got The Fire is on a different upload; artist-official provenance.

- **Odd Mob & OMNOM -- Losing Control** (`Mg1QHSrkRx0`). Odd Mob & OMNOM's 2023 'Losing Control' -- the pair later became HYPERBEAM; bouncy vocal-chop tech house in the LEFT TO RIGHT vein. Experts Only (John Summit's label, named in the profile's preferred list), 4:25 Extended Mix, 249 countries; the CHECK-VERSION flag is the station's documented 'mix' false positive, and UNKNOWN-CHANNEL only means the label is new to this roster. Chosen over the Selected./Myth of NYX re-uploads.

- **Mochakk -- Da Fonk** (`6gq-MlQGkOY`). Mochakk's 2024 'Da Fonk' (feat. Joni) was one of the biggest underground tech-house records of that summer, and gives Mochakk a second track beside Jealous. Mochakk - Topic, 6:06, 121 countries, no flags. Listen to confirm this is the original mix: the same Topic carries a Marco Carola Bass Mix at an identical 6:06 and a Dub at 5:51, and title is the only thing separating them.

### city-lights

- **Mai Yamane -- Tasogare** (`PiYXAnB9J2U`). Mai Yamane's 1980 title track is the dusky, slow-burning end of city pop -- a new artist for the station and squarely in the late-'70s/'80s lane. Label-delivered Mai Yamane - Topic upload, 6:13 (consistent with the album cut), 123 countries, embeddable, no flags. Off a fan channel entirely, per the takedown constraint.

- **Yumi Matsutoya -- Chuo Freeway** (`Wr66ohyVebs`). The 1976 'Chuo Freeway' (released under her maiden name Yumi Arai) is one of the founding city-pop drives and gives Matsutoya a second track beside Rouge no Dengon. Yumi Matsutoya - Topic, 3:39 (the original; the same Topic also carries a '2022 Mix' at 3:41, deliberately not taken), 123 countries, no flags. Listen to confirm it is the 1976 mix and not the 2022 one.

- **Taeko Onuki -- Carnaval** (`AbNHFFHt0xU`). Taeko Onuki's 1980 'Carnaval' (from Romantique) is the synth-edged, Euro-tinged side of city pop and sits naturally beside 4:00AM and Tokai. Taeko Ohnuki - Topic, 4:47, 122 countries, no flags. Third Onuki track on the station; artist credit spelled 'Taeko Onuki' to match the existing entries.

- **Makoto Matsushita -- Love Was Really Gone** (`aef1j0PM3Sg`). The other side of First Light -- the 1982 album's most-loved cut and a staple of the city-pop revival. Makoto Matsushita - Topic, 5:47 (labelled '2018 Remaster' -- a remaster of the original recording, not a remix), 118 countries, no flags. A second Matsushita track from a label source rather than a fan channel.

- **Junichi Inagaki -- Dramatic Rain** (`q0IgLS10W34`). Junichi Inagaki's 1982 'Dramatic Rain' (Dramatic Rain / ドラマティック・レイン) is a defining rainy-night city-pop single and a new artist for the station. From Inagaki's own official channel (稲垣潤一 Official), 3:56, 249 countries, embeddable; UNKNOWN-CHANNEL only because the channel is new to this station. It is an official music video upload, so listen for any intro/outro beyond the ~3:50 single.

- **Anri -- Windy Summer** (`-8WTumwpvmg`). From Anri's 1983 Timely!! -- the album Cat's Eye and Remember Summer Days already represent -- 'Windy Summer' is its breezy upbeat single. On ANRI 杏里 Official, a channel this station already uses (used-here), 3:11, 249 countries, no flags. Would be Anri's fourth track; it is an [Official Video] upload, so confirm the audio is the clean album take.

- **Ginji Ito -- Baby Blue** (`tcq2QmpxmSs`). Ginji Ito's 'Baby Blue' (Sugar Boy Blues, 1982) is the classic Sugar Babe alumnus's signature city-pop song; new artist. The only usable upload is a FAN channel (dominigel), 4:19, 249 countries, embeddable -- Ginji Ito - Topic carries only '2017年のBABY BLUE', a 2017 re-recording, which was passed over. Fan-channel risk per the takedown constraint, but dominigel is not used elsewhere on the station so it stacks nothing; listen to confirm it is the 1982 original.

### circuit-crush

- **GUNSHIP -- Dark All Day** (`60ruvzfXQoE`). Closes the one known gap in the profile: 'Dark All Day' (2018, feat. Tim Cappello and Indiana) now has an upload on GUNSHIP's own channel (used here), 5:42, 249 countries, no flags. Caveat: it is the official music video and runs ~15s over the ~5:27 album cut, so listen for a video intro/outro -- ProtoVision was rejected for exactly that.

- **Kavinsky -- Roadgame** (`diMo5wx5ZZ4`). Roadgame (OutRun, 2013) is Kavinsky's driving instrumental and the most station-apt cut after Nightcall/Odd Look. Record Makers (Kavinsky's label) 'Official Audio - HD', 3:47, 249 countries, no flags beyond UNKNOWN-CHANNEL (label new to this roster). A 3:41 'Official Audio' on the same channel exists; I took the 3:47 as the closer match to the album length -- worth a listen either way.

- **The Midnight -- Vampires** (`WklkvT1Hs-g`). 'Vampires' is one of The Midnight's darkest, most driving songs and gives the band a third track beside Sunset and Days of Thunder. The Midnight - Topic, 5:17 (matches the official video and NewRetroWave uploads), 249 countries, no flags. Studio cut, unlike the 'Los Angeles [Live]' pulled in the 50th pass.

- **Daniel Deluxe -- Star Eater** (`13rZdTurLNo`). Daniel Deluxe's 'Star Eater' (2016) is a heavy, menacing darksynth staple -- the harder end this station owns. Daniel Deluxe - Topic, 4:33, 244 countries, no flags; a second track beside Web of Sin. NewRetroWave carries a 4:40 version too.

- **Danger -- 22:39** (`cznpPMomJXw`). DANGER's '22h39' (late-2000s EP era) is the French darksynth-adjacent instrumental that predates and shaped the Perturbator/Carpenter Brut lane; new artist. From Ekler'o'shock (Ekler), the label that released the original EPs, 4:35, 249 countries, UNKNOWN-CHANNEL only because the label is new here. Labelled '(Official)'; the Danger - Topic search hit only a 1:21 intro.

- **Power Glove -- Blood Dragon Theme** (`MEtdyn2QEzA`). Power Glove's theme from Far Cry 3: Blood Dragon (2013) -- the scene's best-known score cue, a second Power Glove track beside Night Force. From Ubisoft Music, the official publisher channel, 3:06, 249 countries, no flags beyond UNKNOWN-CHANNEL. Credit as Power Glove (composer); the YouTube title calls it 'Far Cry 3: Blood Dragon OST - Blood Dragon Theme (Track 02)'.

- **Dance With The Dead -- Andromeda** (`q3lpoGABH6A`). Dance With The Dead's 'Andromeda' (2017) is the guitar-and-synth driving end of the lane, a second track beside Riot. From the band's own channel (dancewiththedead), 5:00, 249 countries, UNKNOWN-CHANNEL only because Riot is on a different upload. A 3:46 A38 live cut also exists and was passed over.

- **Miami Nights 1984 -- Accelerated** (`-pfsRJ2n9WQ`). 'Accelerated' (2011) is the early-scene outrun anthem -- a second Miami Nights 1984 track beside Black Rain. Miami Nights 1984 - Topic, 3:56 (matches NewRetroWave's 3:55), 249 countries, no flags.

### rise-up

- **Bikini Kill -- Rebel Girl** (`L0oeqAQ1qE8`). 1993 riot grrrl, the movement's anthem -- feminist protest as the subject and a chorus built for a room to shout back, and the station's first women-fronted band. Bikini Kill - Topic, 2:37, 249 countries, no flags. Two Topic uploads exist at 2:37 (the other, jfCqCKY5nUc, is 244 countries); listen that this is the Joan Jett-produced single version most people know rather than the Pussy Whipped LP take.

- **Fugazi -- Merchandise** (`RQ8muwMQNbg`). 1990, Repeater -- DC post-hardcore against consumerism ('you are not what you own'), squarely the US hardcore spine's political wing, and a new artist. Fugazi - Topic (Dischord), 2:59 against the album's ~3:00, 123 countries, no flags.

- **Dropkick Murphys -- Which Side Are You On?** (`WVMZUwFFJCc`). Florence Reece's 1931 union song as a 2001 gang-vocal punk singalong -- the collective-voice tiebreaker made literal. Epitaph Records (already used here), 2:29 matching the album, 249 countries. Its CHECK-VERSION flag is the known Epitaph '(Full Album Stream)' false positive the profile records. Lane note: Celtic punk, guitar-loud -- judge the bagpipe colour against the 'no ska, no reggae' separation.

- **Prophets of Rage -- Unfuck the World** (`TDrHkGQgHvI`). 2017 rap-metal protest from Tom Morello, Tim Commerford and Brad Wilk with Chuck D and B-Real -- the rap-metal branch the eraLane names, and a different artist credit from RATM. Band's own channel (UNKNOWN-CHANNEL only by station history), 4:10 matching the album, 249 countries; the VEVO video 6ad4MH7fMLs is LOGIN_REQUIRED (dead air) and was the decoy. Counts against the RATM overlap only in personnel; Matt may still read it as 'more RATM'.

- **Green Day -- American Idiot** (`kqkGY9jsBOw`). 2004 anti-Bush-era title track, the most-shouted protest chorus of its decade -- the tiebreaker decides it. Green Day's own channel 'Official Audio', 2:55 against the album's 2:54 (the official video Ee_uujKuJMI runs 3:01, the music-video-padding trap the profile warns about), 247 countries. The pick most open to 'too mainstream' -- that is the question for Matt, not a mechanical one.

- **NOFX -- Franco Un-American** (`1k57HJ0SBEg`). 2003, The War on Errorism -- NOFX's explicitly political turn (Fat Mike's punkvoter.com year), melodic hardcore of the Bad Religion/Pennywise family already here. NOFX - Topic, 2:27 matching the album, 249 countries, no flags; over the Fat Wreck video (2:26) for Topic provenance.

- **MDC -- John Wayne Was a Nazi** (`SoyusTUFdl0`). 1982, Millions of Dead Cops -- Austin/SF hardcore at its most confrontational, the US-hardcore spine's political core and a new artist. MDC - Topic, 2:01 = the LP cut; the other Topic upload YQMwT7k4Iuo (1:58) is the earlier Stains 7-inch take and was passed over. 123 countries, no flags.

- **Subhumans -- Religious Wars** (`2rozOOvrs4w`). 1982 UK anarcho-punk single against sectarian war -- sits beside the Exploited and Stiff Little Fingers on the station's UK side. Subhumans - Topic, 2:26 matching fan and Cleopatra copies, 244 countries, no flags.

### atomic

- **Tex Beneke -- A Wonderful Guy** (`L0OH5I62tgo`). On Diamond City Radio's tracklist (fallout.wiki, read 2026-11-01) as Tex Beneke with Claire Chatwin, and one of the gaps the profile already names. Tex Beneke - Topic, 1:56, 249 countries, embeddable; a second Topic copy (vY8UUmIeoPQ) is the same length at 122. Credit kept to Tex Beneke as Topic has it; Claire Chatwin sings, if you want her named.

- **Bing Crosby & The Andrews Sisters -- Ac-Cent-Tchu-Ate the Positive** (`el_dGzqvIgw`). On Diamond City Radio (fallout.wiki lists it under Bing Crosby); the 1944 Decca side is Crosby with the Andrews Sisters, credited here the way Pistol Packin' Mama already is. The Andrews Sisters - Topic, 2:45, 249 countries -- but the Topic release is a 2011 Fanfare budget compilation, so listen that it is the 1944 Decca recording and not a re-recording.

- **Bob Crosby and the Bobcats -- Happy Times** (`xwQPsihhngM`). On Diamond City Radio's tracklist and named in the profile's gap list. Bob Crosby & His Bob Cats - Topic, 2:46, 249 countries (a second Topic copy, qG4G_pUkd0s, is the same take at 123, labelled as the 1949 'Inspector General' song). Note this is Bob Crosby's third track here after Way Back Home and Dear Hearts and Gentle People.

- **Betty Hutton -- He's a Demon, He's a Devil, He's a Doll** (`IYM7y7QY0l0`). On Diamond City Radio's tracklist and in the profile's gap list. Betty Hutton - Topic, 3:17, 122 countries, embeddable. Taken over the Hutton Gluttons fan-site copy (g6LlW902JRk, 3:14, 249), which is a clean backup, so the station's two Hutton tracks are not on one fan channel.

- **Frankie Carle -- One More Tomorrow** (`52-nTVaG2gA`). On Diamond City Radio's tracklist (Frankie Carle and His Orchestra, Marjorie Hughes vocal) and in the profile's gap list. The78Prof (a channel ATOMIC already uses), 3:19, 249 countries, titled as the 1946 record with Marjorie Hughes -- exactly the in-game credit. Frankie Carle - Topic (4JZ4dvlP78U) is the same length at 123 and is the backup.

- **The Three Suns -- Worry Worry Worry** (`pUDv3h09VBc`). On Diamond City Radio's tracklist and in the profile's gap list. lrh1966, 2:35, 249 countries, a transfer of the 1947 RCA Victor 78 -- which pins the recording. FalloutMusicChannel (ZBOpCra4kGg, 2:36, 249, already used here) is the backup; Matt may prefer that channel for provenance spread.

- **Ella Fitzgerald & Chick Webb -- Undecided** (`FtaGfixdATM`). On Diamond City Radio's tracklist (Ella Fitzgerald with Chick Webb and His Orchestra). Ella Fitzgerald - Topic, 3:19, 123 countries; description confirms the 1939 Decca side (UMG, 'The Early Years - Part 2'), not the 2007 One Media copy (RjoBR6p7XV4). Owner's call: recorded 1939, a year before the profile's 1940s-50s era lane -- canon says yes, the era rule says borderline.

- **Todd Rhodes & Connee Allen -- Rocket 69** (`SiAk2Q4a0lA`). On Diamond City Radio's tracklist and in the profile's gap list (spelled 'Connee' per the profile; fallout.wiki spells it Connie). Todd Rhodes - Topic, 2:43, 249 countries (r10sFM0r2fM is a second Topic copy at 2:44, also 249). Credit shape is a judgment call -- the 1952 King single is Todd Rhodes' orchestra with Allen singing.

### hackback

- **Roxanne Shanté -- Have a Nice Day** (`5QkEHUMmpyM`). 1987 Cold Chillin', Marley Marl production -- the Juice Crew's battle-rap teenager and the one woman the profile's gap note still names as missing. No official or Topic upload surfaced; this is a fan upload (classicrapbattles), 4:57, 247 countries, embeddable, consistent with the 12-inch single -- acceptable on the Del the Funky Homosapien fan-channel precedent, but it is the one HACKBACK pick that needs a listen to confirm the recording. NY.

- **The Coup -- Fat Cats, Bigga Fish** (`j8U6jdEgJeE`). 1994 Oakland, Genocide & Juice -- Boots Riley's narrative class-war cut over a funk loop, a deep golden-age West Coast pick. The Coup - Topic, 5:54 matching the album (UPROXX's 4:41 is an edit and was passed over), 249 countries, no flags.

- **Arrested Development -- Tennessee** (`EepXpfn2bj4`). 1992 Atlanta, 3 Years, 5 Months and 2 Days in the Life Of... -- the Southern conscious-rap counterweight to the station's NY tilt. Arrested Development - Topic '(Remastered 2001)', 4:33 = the album cut (the VEVO video is a 3:58 edit), 123 countries, no flags.

- **DJ Jazzy Jeff & The Fresh Prince -- Summertime** (`Kr0tTbTbmVA`). 1991 Philadelphia, Homebase -- Kool & the Gang's 'Summer Madness' loop, a golden-age canon hit (the roster already argues canon hits are welcome). DJJazzyJeffVEVO, 4:01, 249 countries, no flags; that is the single/video edit against the album's ~4:35. If Matt wants the LP cut, the only full-length copy found is a lyric-video fan upload (bBs60R9qahI, Rap City, 4:35, 249 countries) -- listen to the VEVO's head and tail for video-only audio.

- **Tha Alkaholiks -- Make Room** (`obD-4HRfk4I`). 1993 Los Angeles, 21 & Over, E-Swift production with a young Lootpack/Xzibit orbit -- underground West Coast boom-bap, exactly the station's deep-cut lane. ThaAlkaholiksVEVO, 4:09, 249 countries, no flags; it is the official video, a few seconds over what I believe the album cut runs, so listen for a video intro.

- **Boogie Down Productions -- My Philosophy** (`h1vKOchATXs`). 1988 Bronx, By All Means Necessary -- KRS-One's thesis statement and a cornerstone the station lacks. BoogieDwnProdVEVO 'Official HD Video', 5:00, 249 countries, no flags; video copy, so listen for any non-musical intro. NY, but the batch keeps NY at about half (see notes).

- **Main Source -- Looking at the Front Door** (`ecsuf_MYrBY`). 1990/91 Breaking Atoms -- Large Professor's production, a crate-digger's golden-age classic (Queens/Toronto group). Main Source - Topic, 4:11 matching the album, 249 countries, no flags.

- **8Ball & MJG -- Space Age Pimpin'** (`ib9biVUc5EU`). 1995 Memphis-via-Houston (Suave House), On Top of the World -- smooth Southern golden-age that widens the South beyond OutKast/UGK/Geto Boys/Goodie Mob/Scarface. 8Ball & MJG - Topic, 5:10 matching the album, 123 countries, no flags (re-probed clean after a 429 in search). Explicit pimp-persona content, same register as Too $hort already here.

### cipher

- **The Chemical Brothers -- Leave Home** (`4QKi8DorEpM`). The opening track of Exit Planet Dust (1995) -- the record that defined big beat, propulsive and wordless apart from its looped chant. The Chemical Brothers - Topic, 5:33 (the album cut), 123 countries, no flags. Not on any rejection list (Elektrobank and Galvanize were the Chemicals cuts pulled); audio-only, so no baked-in video dialogue.

- **Underworld -- Pearl's Girl** (`iullHn3Smzc`). Underworld's 1996 breakbeat single -- harder and faster than Born Slippy, firmly in the propulsive lane. From Underworld's own channel (used here), 4:21: the single edit, deliberately NOT the 9:37 album/remaster on the Topic channel, given the record against extended mixes (Chime 12"). 249 countries, no flags. King of Snake was a taste rejection; this is a different track. It is a video upload, so listen for anything non-musical.

- **Meat Beat Manifesto -- Radio Babylon** (`TEe5mpmKxW8`). The 1990 breakbeat record that half of big beat sampled; Meat Beat Manifesto is already accepted via Prime Audio Soup. Meat Beat Manifesto - Topic, 6:23 (matches the 6:24 re-upload, i.e. the original release length -- there is no shorter studio cut), 123 countries, no flags. Flag for Matt: at 6:23 it is long for a station with a stated dislike of extended mixes.

- **Stanton Warriors -- Da Antidote** (`p8QEMNgiwfY`). Stanton Warriors' 'Da Antidote' (2001) is a UK nu-skool breaks touchstone -- the 2000s half of the eraLane, and a new artist. Stanton Warriors - Topic, 6:03, 249 countries, no flags (a second Topic copy at 6:03 has only 123 countries, so the wider one was taken). Listen for length: 6:03 is the full mix; I found no shorter official edit.

- **The Crystal Method -- Born Too Slow** (`H6BEkPzstJQ`). 'Born Too Slow' (Legion of Boom, 2004) is the Crystal Method's hardest-driving breakbeat-rock cut and a Need For Speed Underground soundtrack staple -- hacker-movie energy exactly. Official Crystal Method channel, 3:46, 249 countries, no flags. Caveats: it would be their fifth track here (counting the Filter collaboration), and it is an [Official Video] upload, so check for non-music audio; and it is a modern upload, so it should not share the 2007-legacy stutter noted on Busy Child.

- **Junkie XL -- Zerotonine** (`8dPe_RrD_Ro`). Junkie XL's 'Zerotonine' (Big Sounds of the Drags, 1999/2000) is propulsive big beat with a rock edge, used across late-'90s games and trailers -- a second Junkie XL track beside Def Beat. Junkie XL - Topic, 4:03, 118 countries, no flags. Upgrades this artist's provenance: Def Beat is on a non-official reupload channel.

- **Lunatic Calm -- Roll the Dice** (`62i8aS7Zy_0`). Lunatic Calm's 'Roll the Dice' (Metropol, 1997), the same record that gave this station Leave You Far Behind -- straight-ahead big beat. Lunatic Calm - Topic, 3:21, 123 countries, no flags. The official 1997 video on Simon Shackleton's Elite Force channel (Q2oUIdzp_AY, 3:22, 249 countries) is the wider-licence alternative if Matt prefers it; I took the Topic as the audio-only source given the station's dialogue-in-video record.

### the-crypt

- **Old Tower -- Night's Spell** (`MobljdsjRe0`). The profile's own named clean backup, now probed: Old Tower - Topic, 5:46, status OK, 123 countries, embeddable, no flags. Old Tower is on the station with one track (Thorngrove), so this evens it toward the others. Wordless old-school dungeon synth. YouTube titles it with a curly apostrophe the font cannot draw -- the title here uses a straight one, per the profile note.

- **Fief -- Upon Her Sword the Sunlight Shone** (`XjAzDmdy4Sc`). The studio cut the profile recorded as a clean backup when it rejected the Bollthorn live recording (0-8tyl8ZN8Y). Re-probed today: Fief - Topic, 5:31, status OK, embeddable, no flags (249 countries when first probed). Wordless medieval keyboard piece; brings Fief from 2 to 3.

- **Old Tower -- Darkling Magic Winds** (`54GY9rVr6eo`). A second Old Tower track from the artist's Topic channel: 16:22, status OK, 122 countries, embeddable, no flags. Long, but it is one Topic track entry, not an album rip (the album rips of this artist ran 29-87 minutes on The Dungeon Synth Archives and were all passed) -- the profile says a long TRACK is fine. Wordless. Worth a listen to confirm it is one continuous piece rather than a suite, and that it sits in fantasy rather than pure darkness.

- **Sequestered Keep -- The Lakes Beneath the Lakes** (`QxHY04WtEFM`). New artist for the station: Sequestered Keep is a US dungeon-synth project in the fantasy-cavern vein (records titled The Vale of Ruined Towers, Cavernmagics), squarely ruin-and-keep rather than cold or industrial. Sequestered Keep - Topic, 4:20, status OK, 249 countries, embeddable, no flags. Wordless; a new channel, which helps the SPREAD THE CHANNELS rule.

- **Sequestered Keep -- Wizardwindwanderer** (`Bdcgz-aACuw`). Second Sequestered Keep pick, same Topic channel: 3:54, status OK, 249 countries, embeddable, no flags. Wordless lo-fi keyboard fantasy. If Matt only wants one track from a new artist, take The Lakes Beneath the Lakes and drop this.

- **Lord Lovidicus -- Castle Garden (Of Fire and Frost)** (`wC9ZJWCiSFk`). New artist: Lord Lovidicus is one of the 2010s revival's founding names, exactly the station's eraLane. Uploaded on the artist's own 'Lord Lovidicus' channel (single track, 3:46, status OK, 249 countries, embeddable); the only flag is UNKNOWN-CHANNEL, i.e. a channel this station does not use yet -- no Topic copy surfaced in the search. Wordless. Listen for whether this is the album master and not a re-recording.

- **Lord Lovidicus -- The Dire Fortress Awaits Assailment** (`bAbv8Q-iTaI`). Second Lord Lovidicus track from the same artist channel: 9:32 single track, status OK, 249 countries, embeddable, UNKNOWN-CHANNEL only. A keep-under-siege title that is the station's brief to the letter; wordless. Both Lord Lovidicus picks share one personal channel, so a strike there costs two tracks -- take one if that concentration matters.

- **Hole Dweller -- Footpaths** (`FkTmPzBKO4o`). New artist from the gentle end of the lineage ('comfy synth' / hobbit synth): forest paths rather than crypts, but still the fantasy side of the NOT-COLD-WAVE boundary the profile draws. Hole Dweller - Topic, 4:16, status OK, 249 countries, embeddable, no flags. Wordless. Matt's call whether the cosy end of dungeon synth belongs on a station named THE CRYPT -- it would broaden the mood.

### slow-orbit

- **Tosca -- Suzuki** (`9J_7QwB5Syk`). Tosca (Kruder's Vienna partner Richard Dorfmeister) is European downtempo at its centre: warm pads over a slow, unhurried beat, the title track of the 2000 album -- squarely the station's era and lane. Tosca - Topic, 6:04, status OK, 249 countries, embeddable, no flags. Wordless. A better-known name than the station's netlabel roster; Matt's call whether that shifts the station's character.

- **Bonobo -- Kiara** (`L-kyRh7N-kE`). Bonobo's Black Sands (2010) opener: strings and pads over a slow broken beat, the downtempo template. On Ninja Tune's own label channel: 3:51 (album length), status OK, 249 countries, embeddable; UNKNOWN-CHANNEL only. Uses a chopped wordless vocal texture, no lyric. This exact id was on the retired MOMENTUM station (listed in its stations.js obituary comment); it is not on any live station.

- **Bonobo -- Kong** (`pkACVyU4PmA`). Also from Black Sands: a groove that is still a groove and never hurries. Bonobo - Topic, 3:58, status OK, 249 countries, embeddable, no flags. Instrumental. A different upload of Kong (KMKeBpySf78) was on the retired MOMENTUM station; nothing live carries it. Two Bonobo picks -- take one if a new artist should arrive with a single track.

- **Air -- La Femme d'Argent** (`YUX8fUrKRNU`). The chillout canon's slow-groove instrumental: bass, Rhodes and a beat that never speeds up. On AIR's official channel (album audio from Moon Safari): 7:07, status OK, 249 countries, embeddable; UNKNOWN-CHANNEL only. Wordless. Era flag: 1998, just before the profile's 2000s-present lane. French, so it fits the European lean.

- **Zero 7 -- Polaris** (`IeZwLOoXW78`). The instrumental from Zero 7's Simple Things (2001): warm pads and a lazy beat, none of the album's guest vocals. Zero 7 - Topic, 4:48, status OK, 123 countries (the 122-123 Topic norm the station's notes already record), embeddable, no flags. Wordless.

- **Kruder & Dorfmeister -- High Noon** (`ba0BUnBtRsk`). The Vienna downtempo founding track: dubby, slow and spacious. Topic upload, 6:26, status OK, 122 countries, embeddable, no flags. Two flags: the Topic channel credits 'Peter Kruder' alone (displayed here as the duo, the act's own credit), and the track is 1993 (G-Stoned), well before the 2000s lane. Instrumental, with at most a sampled spoken fragment.

- **Thievery Corporation -- Shaolin Satellite** (`imMzpILg6Lk`). From The Mirror Conspiracy (2000): sitar and dub bass over a slow beat. Unlike most of Thievery's catalogue it has no lead vocal. On the band's official channel (Official Audio): 6:25, status OK, 249 countries, embeddable; UNKNOWN-CHANNEL only. A Topic copy (3Abr1k56fdU) is clean too, at 123 countries. Listen for any sampled vocal phrase. Washington DC rather than European, but the lane is chillout first.

- **Nightmares on Wax -- Nights Interlude** (`Uwz7QTk2hyk`). Smoked-out downtempo from Carboot Soul (1999): slow beat, warm Rhodes. Nightmares On Wax - Topic, 3:25, status OK, 122 countries, embeddable, no flags. LISTEN FIRST: it is built on a short sampled sung hook, so it is not strictly wordless. It is unlikely to match on LRCLIB, but if Matt hears it as sung it needs a vocalTracks/opt-out decision -- or skip it. Also 1999, at the edge of the era lane.

### tradewinds

- **Les Baxter -- Sophisticated Savage** (`tBDmq8Imdw0`). From Ritual of the Savage (1951), the record exotica descends from; Wikipedia lists it at 2:15. Les Baxter - Topic, 2:16, 249 countries (a 123-country Topic twin is 7Hu8_oOEQoY). Instrumental. Les Baxter has one track here (Jungle River Boat) -- his own recordings are underweight next to the Denny/Lyman covers of his tunes.

- **Les Baxter -- Kinkajou** (`K_XMo9aWHGA`). Also Ritual of the Savage (1951), listed 1:53; Les Baxter - Topic, 1:53, 249 countries (YDsIQSUD7gA is a 123-country twin). Instrumental. Short -- listen whether 1:53 sits right between longer tracks.

- **Martin Denny -- Return to Paradise** (`RXFPcbjSr-A`). Track 2 of the 1957 mono Exotica (listed 2:19). Way Gone Music -- the channel the profile says carries the mono originals, already used here -- 2:21, 249 countries. 4PZmXAC1rOg (same channel, 2:34) and the Topic 'Original Mono' copy OlEdIi_hF_0 (2:22, 123) are the alternatives; the 2:34 is likely the stereo re-recording. Instrumental; Denny's seventh track here.

- **Arthur Lyman -- Sim Sim** (`0Xf9ijfz27Y`). From Taboo (HiFi R 806, 1958), side two per 45worlds/vinyl listings. Arthur Lyman - Topic, 2:30, 123 countries (ZJKbyZE6Nac is an identical Topic copy). Instrumental. Lyman's seventh track here -- drop it first if artist balance matters more than the Taboo album.

- **Robert Drasnin -- Voodoo** (`rN9HyY0ez3E`). The single-track Voodoo the profile already names as a clean backup (the full-album uploads were rejected): Robert Drasnin - Topic, 2:56, 123 countries, re-probed clean today. A new artist for the station, from the 1959 Tops LP Voodoo!. Instrumental.

- **Frank Hunter and His Orchestra -- White Goddess** (`_OKwtVOcFCU`). Title track of Frank Hunter's 1959 Kapp exotica LP White Goddess; new artist and a new channel. Frank Hunter and His Orchestra - Topic, 2:51, 123 countries, description gives 1959 release (Kontor reissue, 'Remastered'). Listen for a wordless choir -- not lyrics, so the instrumental flag still holds, but confirm.

- **The Waitiki 7 -- Ouanalao** (`6ynrPbpx09M`). Revival side: from WAITIKI in Hi-Fi (2024, Pass Out Records, featuring Augie Colon Jr. on bird calls). The WAITIKI 7 - Topic, 4:33, 249 countries (azFtaW6vn28 is a 123-country twin). Instrumental. Waitiki 7's third track here.

### drift-mode

- **Steve Roach -- Structures from Silence** (`jPMuZ5qhOJM`). The title piece of the 1984 ambient landmark: a single 28-minute continuous synth drift, built for stillness, no beat. Steve Roach - Topic (30th anniversary remaster), 28:33, status OK, 249 countries, embeddable, no flags. One file, one piece. The full-album upload (58:43) and the deluxe-edition copy were passed. Wordless; new artist.

- **Gigi Masin -- Clouds** (`i-VOfzpXFDk`). From Wind (1986), the Italian ambient-piano record: slow, fading into the room. Gigi Masin - Topic, 5:03, status OK, 249 countries, embeddable, no flags. Wordless, and ambient-with-piano rather than neoclassical proper (sustained, washed-out, no development). New artist.

- **Stars of the Lid -- Dungtitled (In A Major)** (`A9KldnpPkQI`). From And Their Refinement of the Decline (2007). Stars of the Lid is the station's core drone act (2 tracks); this is one of their shorter, most-cited pieces. Stars of the Lid - Topic, 5:54, status OK, 123 countries, embeddable, no flags. Wordless.

- **Hiroshi Yoshimura -- Water Copy** (`N-NDBd5rN3c`). From Music for Nine Postcards (1982), the record that defines Japanese kankyo ongaku: sparse Rhodes notes in space. Hiroshi Yoshimura - Topic, 6:12, status OK, 249 countries, embeddable, no flags. Wordless; second Yoshimura beside Green.

- **Satoshi Ashikawa -- Still Space** (`asCnBKb7vHI`). From Still Way (Wave Notation 2, 1982), the companion to Yoshimura's kankyo ongaku: flute and piano at the edge of silence. Satoshi Ashikawa - Topic, 3:59, status OK, 242 countries, embeddable, no flags; the Light in the Attic upload of the same 3:59 cut (M_8eRDmn9PI, 249) is an alternative. Wordless. New artist.

- **Jon Hopkins -- Abandon Window** (`mqU0XsELBCA`). The beatless piano-and-tape piece from Immunity (2013), which is otherwise a techno record -- this is the one track there built for stillness. Jon Hopkins - Topic, 4:57 (2023 remaster), status OK, 247 countries, embeddable, no flags. Wordless. Piano-led, but ambient texture rather than neoclassical composition.

- **Sarah Davachi -- Perfumes III** (`aGTX3eDLow4`). Sustained organ/drone from a contemporary drone composer in the Kali Malone lineage -- unambiguous drone, which is the profile's safe side of the open neoclassical question. Sarah Davachi - Topic, 6:04, status OK, 123 countries, embeddable, no flags. Wordless; new artist.

- **Harold Budd / Brian Eno -- The Pearl** (`qySCf2ovWJc`). Title track of the 1984 Budd/Eno collaboration, the sequel to The Plateaux of Mirror already on the station: treated piano dissolving into reverb. Harold Budd - Topic (2005 digital remaster), 3:14, status OK, 123 countries, embeddable, no flags. Wordless. The 340-minute 'stretched' upload and full-album copies were passed.

### after-hours

- **Gerry Mulligan -- Night Lights** (`Wf02V8AtMag`). The profile's own 'next pass starts here' pick: title track of Night Lights (Philips, 1963; listed 4:53), a sextet ballad with Mulligan on piano. Gerry Mulligan - Topic, 4:58, 123 countries; description is the UMG 1963 master, producer Hal Mooney. New artist. Instrumental.

- **Ike Quebec -- Blue and Sentimental** (`LXdOapA_lEo`). Title track of Blue & Sentimental (Blue Note 4098, 1962; listed 7:28) -- a tenor ballad with Grant Green, Paul Chambers and Philly Joe Jones, about as 2am as Blue Note gets. Ike Quebec - Topic (RVG edition), 7:29, 123 countries; Wwf9NnOQ03k is the same master at 121. New artist. Instrumental.

- **Stanley Turrentine & The Three Sounds -- Since I Fell for You** (`pPfP66z16Tk`). From Blue Hour (Blue Note, 1960; listed 8:46), a slow blues ballad. Stanley Turrentine - Topic, 8:47, 123 countries. The album's Willow Weep for Me was skipped because Red Garland's version is already here. New artist. Instrumental.

- **Duke Ellington & John Coltrane -- In a Sentimental Mood** (`5AhdgAcV0KM`). Opening ballad of Duke Ellington & John Coltrane (Impulse!, 1963; listed 4:14). Duke Ellington - Topic, 4:15, 122 countries; description gives Bob Thiele as producer, i.e. the Impulse! master, though the Topic release is a 'Gold' compilation. A co-credit, so it counts as a third Coltrane appearance next to his two -- at the profile's 3-per-artist ceiling.

- **Yusef Lateef -- Love Theme from Spartacus** (`4C_hhw49fdQ`). From Eastern Sounds (Moodsville, 1961; listed 4:15) -- Lateef on oboe over Barry Harris, a hushed piece. Yusef Lateef - Topic (2023 remaster), 4:15, 121 countries; the RVG 2006 remaster copy BrEZTxPeI48 is only 31 countries, so take this id specifically. New artist. Instrumental.

- **Mal Waldron -- Left Alone** (`WQeN1bTDQLs`). Title track of Left Alone (Bethlehem, 1959; listed 6:06), Waldron's elegy for Billie Holiday with Jackie McLean on alto -- the instrumental, not her vocal. Mal Waldron - Topic, 6:06, 249 countries; the Topic release is a 2020 'From The Valley' reissue label, worth a listen to confirm the master. New artist.

- **Grant Green -- Idle Moments** (`vRgvGOmEDSU`). Title track of Idle Moments (Blue Note, 1965; listed 14:56) -- the canonical slow late-night Blue Note side, with Joe Henderson, Duke Pearson and Bobby Hutcherson. Grant Green - Topic, 14:58, 123 countries (aq0m0hbCjFQ is the RVG copy, 14:56). New artist. Owner's call on length: at 15 minutes it is the longest track on the dial.

- **Duke Jordan -- Everything Happens to Me** (`qpbVRdPDYCM`). Trio ballad from Flight to Denmark (SteepleChase, 1974), recorded in Copenhagen with Mads Vinding and Ed Thigpen -- a later player in the 1950s language, which the era lane explicitly allows. Duke Jordan - Topic, 5:43, 123 countries; the description confirms the Flight to Denmark album. FLAG: Wikipedia lists the track at 5:34, 9s shorter, and the CD has alternate takes of other titles (not this one), so check the length against a Discogs listing before approving. New artist.

### mirrorball

- **MFSB featuring The Three Degrees -- TSOP (The Sound of Philadelphia)** (`LS2PQs_IRNk`). First item on the profile's 'next pass starts here' list: the 1974 Philadelphia International record that opened the disco era, near-instrumental with the Three Degrees' chant. MFSBVEVO '(Audio)', 3:45 against the 3:43 album version, 249 countries -- the Sony/Legacy VEVO pattern the profile describes. The label's own 12-inch (z0VxVJIsxfA, 5:48, 249) is the swap if a longer cut is wanted.

- **Peaches & Herb -- Shake Your Groove Thing** (`w3e8SXWjNg4`). On the profile's next-pass list (5:45 album / 3:25 7-inch / 6:35 12-inch). Peaches & Herb - Topic, 5:46 -- the album version from 2 Hot! (1978) -- at 123 countries. A second Topic copy, e-LeujZNV08, runs 5:32 and matches no listed version, so take this id specifically. New artist.

- **Harold Melvin & The Blue Notes -- Bad Luck** (`mykhgDJvp6g`). On the profile's next-pass list (6:29 full / 3:10 single): Philly disco with Teddy Pendergrass at full stretch. HaroldMelvinVEVO '(Audio)', 6:31, 249 countries; the Topic copy 1nEqdJQUCvk is 6:28 at 123. New artist. The long build means it opens mid-groove rather than with a hook; listen that the first bars carry on the dial.

- **The Emotions -- Best of My Love** (`Pbg66_KdJ5Q`). On the profile's next-pass list (3:40). The Emotions - Topic, 3:41, 123 countries. The Emotions already sing on Boogie Wonderland (credited to EWF with The Emotions); this is their own record, Maurice White-produced, 1977. New credited artist.

- **Sister Sledge -- We Are Family** (`7LJBmXkB9o8`). The 8:19 album/12-inch version from We Are Family (Cotillion, 1979), per Wikipedia. Sister Sledge - Topic (2018 remaster), 8:17, 118 countries. Sister Sledge's second track (He's the Greatest Dancer is the first, off the same album) -- that breaks the founding pass's one-per-album rule, so Matt's call; the RHINO video (uyGY2NfYpeE, 3:06) is a video edit and was passed over.

- **Yarbrough & Peoples -- Don't Stop the Music** (`aK2-L2y25Bg`). 1980 boogie, Mercury, from The Two of Us; Wikipedia lists the album version at 7:49 and the 7-inch at 4:08. Yarbrough & Peoples - Topic, 7:52 (album), 123 countries; 41Qdu_KfJS0 is the 7-inch on Topic (4:10, 123) if a shorter cut is wanted. The pitched-down vocal intro is part of the record, not a remix. New artist.

- **B.T. Express -- Do It ('Til You're Satisfied)** (`yvIQX_eDmN0`). 1974 Scepter, the funk-into-disco crossover the era lane starts on; Wikipedia lists the album version at 5:52 and single edit 3:09. B.T. Express - Topic, 5:54, 123 countries. New artist.
