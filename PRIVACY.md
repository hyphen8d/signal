# What SIGNAL knows about you

Short version: nothing that identifies you, and by default nothing at all
leaves your browser except what is needed to play the music.

This file is the published version of what `metrics.js` collects. Publishing
it is the point — the argument for not putting a consent banner on a radio is
that you can read exactly what it does instead, so if the payload changes and
this file does not, the argument is gone.

## What is stored in your browser

One `localStorage` entry, `signal:state:v1`, holding the station you were last
locked to, its track, your volume, whether you were muted, your colour choice,
your per-station visualizer picks, your answers to the two consent cards, and
your VECTOR SCAN high score. It never leaves your machine and nothing reads it
back to anyone. Clearing site data removes it.

## What third parties see

**YouTube.** Playback is the YouTube IFrame player, so `www.youtube.com` is
contacted on every visit — the API script loads before you press anything, and
each track is an embed. Google sees your IP and, if you are signed in to
Google in that browser, can associate the visit with you. This is inherent to
playing YouTube videos and is not something SIGNAL can opt out of on your
behalf.

**LRCLIB**, only when you open the lyrics view, and only ever a song title.

**Open-Meteo**, only if you agree to the weather card, and then only
coordinates rounded by your own browser's geolocation.

There are no ads, no ad networks, no analytics cookies, no fingerprinting, and
no third-party scripts other than YouTube's player.

## The session summary

**Off by default.** `METRICS_ENDPOINT` in `config.js` ships empty, and while it
is empty no listener is attached and no request is made. On the deployed site
you can confirm this by reading the file, or by watching the network tab.

When it is enabled, one message is sent per visit, when you close or leave the
tab. It looks exactly like this and contains nothing else:

```json
{
  "s": 1,
  "v": "2026-08-31.2",
  "mode": "desktop",
  "mins": 45,
  "stations": { "cold-wave": 30, "cipher": 12 },
  "used": ["scan", "visualizer"],
  "consent": { "tap": "no" },
  "failures": 1
}
```

- `v` — which build you were on, so a bug can be tied to a release
- `mode` — desktop or the mobile layout
- `mins` — how long the set was open, rounded to the nearest five minutes
- `stations` — listening minutes per station, rounded to the nearest minute
- `used` — which features were reached, as a sorted set with no counts and no
  ordering
- `consent` — your answers to the audio-tap and weather cards, if you gave any
- `failures` — how many tracks failed to play

### What is deliberately absent

- **No identifier of any kind.** No session id, no visitor id, no cookie,
  nothing derived from your browser. Two visits from the same machine cannot
  be linked together, by us or by anyone who obtained the data.
- **No timestamps.** Durations only. What time of day you listen is a
  location hint and a routine; how long you listened is neither.
- **No track history.** Station level only. Which songs you played is a far
  more sensitive object than which station you left on, and it is not
  collected.
- **No IP is stored.** The collector reads one to rate-limit, hashed with a
  salt that rotates daily and is never written down, and stores nothing.
- **No raw records.** Each summary is added into a day's totals and dropped.
  There is no table of visits, so there is nothing to leak or to join against
  anything else.

### If the visit was short

Under a minute, nothing is sent at all.

### Opting out

SIGNAL honours **Global Privacy Control**. If your browser or extension sets
it, no summary is sent. `navigator.doNotTrack` is honoured too. Blocking the
endpoint, or blocking scripts, also works and breaks nothing — the send has no
retry and its failure is invisible to the radio.

## Where this lives in the code

- `metrics.js` — what is counted, how it is rounded, and the opt-out check
- `program.js` — `initMetrics` / `sendMetrics`, the only network call
- `tools/collector/` — the receiving end, and what it stores

If you think any of the above is wrong, that is a bug worth reporting:
<https://github.com/hyphen8d/signal/issues>
