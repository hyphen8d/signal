# The session-summary collector

A Cloudflare Worker that accepts one anonymous summary per visit and folds it
into daily totals. It is the other half of `metrics.js`; read
[`PRIVACY.md`](../../PRIVACY.md) for what is actually in a summary.

**Nothing here runs until you deploy it and set `METRICS_ENDPOINT`.** The site
ships with that constant empty, which means no listener is attached and no
request is ever made. Deploying this Worker on its own changes nothing either
— both ends have to be pointed at each other on purpose.

## Deploy

```bash
cd tools/collector
npx wrangler kv namespace create SIGNAL_STATS   # paste the id into wrangler.toml
npx wrangler secret put READ_TOKEN              # any long random string
npx wrangler deploy
```

Then wire the two ends:

```bash
# 1. the site sends here
#    config.js: export const METRICS_ENDPOINT = 'https://<worker>/collect'

# 2. the dashboard reads from here
systemctl --user edit signal-admin        # or the shell that starts it
#    Environment=SIGNAL_STATS_URL=https://<worker>/stats
#    Environment=SIGNAL_STATS_TOKEN=<the READ_TOKEN>
systemctl --user restart signal-admin

# 3. metrics.js is an app module, so the build stamp has to move
node tools/stamp.js
```

## What it stores

Daily counters, and nothing else:

```json
{ "sessions": 41, "minutes": 1305, "failures": 2,
  "stations": { "cold-wave": 420, "cipher": 260 },
  "features": { "scan": 22, "visualizer": 9, "game": 1 },
  "modes": { "desktop": 33, "mobile": 8 },
  "consent": { "tap": { "yes": 3, "no": 18 } } }
```

There is no per-visit record. Each summary is added into the day's totals and
dropped, so there is no table of visits to leak or to join against anything —
which is the property that makes the client side's promises true rather than
merely intended.

## Why `/collect` has no auth

Anyone can post to it, and the entire exposure is that someone could skew a
day's counters. There is no data to steal and nothing to escalate into,
because the only thing stored is a set of integers.

The alternative would be a shared secret in the client bundle, which is not a
secret — it is a string in a public JavaScript file. It would buy nothing and
imply a guarantee that does not exist. The per-IP rate limit makes skewing
tedious instead; the IP is hashed with a daily salt, used to bucket the limit,
and never stored.

`/stats` **is** authenticated, because it is the only route that returns
anything.

## Known limits, on purpose

- **Concurrent beacons can drop a record.** Read-modify-write on a KV key
  races. Fixing it properly means a Durable Object, which is a lot of
  machinery for a hobby project's daily counters, and losing the occasional
  session does not change a decision anyone would make from a share.
- **Days are UTC**, so a session is filed by the day it ended in UTC, not by
  the listener's local day. Fine for trends, wrong for "what happened on
  Saturday night" — worth knowing before reading too much into one row.
- **Counters only go up.** There is no delete path. Setting `RETAIN_DAYS`
  expires a day's entry after roughly 13 months.
