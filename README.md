# Digly

Dig deep.

A daily knowledge game in three levels. Each level has its own secret category, revealed the moment its clock starts, and each one is deeper than the last. Answers everyone thinks of are worth almost nothing; rare answers win. Each valid answer has a hidden rarity from 1 to 100. Your three rarest answers per level count, multiplied x1, x2 and x3 by depth, and the dig total is ranked against everyone else who dug today.

This repo is **Phase 1: the playable prototype**. It runs entirely on local seed data with no credentials.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # 30 unit tests
npm run typecheck
npm run build:static # static export to ./out with relative asset paths
```

## What's in Phase 1

- **Three-level daily dig.** Level 1 Topsoil: 60 s, your top 5 answers count, x1. Level 2 Bedrock: 40 s, top 3, x2. Level 3 Crystal caves: 20 s, top 1, x8 (all in `src/game/rules/levels.ts`). Each level draws from its own category pool with a different stride, so the trio changes daily. A 3-2-1 countdown shows the level and multiplier; the category and clock appear on DIG. After each level its three rocks crack, the base score counts up and the multiplier is stamped on. "Dig deeper" drops the miner down the shaft to the next level. After level 3, a summary shows the total, the comparison, and a level-by-level breakdown.
- **Categories by level.** Level 1: dog breeds, fruits, US states, birds. Level 2: African countries, European countries, musical instruments, cheeses, dances. Level 3: chemical elements, bones of the body, languages, Greek mythology. Geography, biology, culture, science and food are all covered.
- **Pixel art look.** The Pixi scene renders at low resolution and is scaled up with nearest-neighbor, so everything shares one chunky grid. UI uses notched pixel boxes with hard shadows.
- **Digly the miner.** A 22x28 pixel miner: yellow helmet with headlamp, orange shirt, blue overalls, a determined face, and a separate pickaxe sprite. He swings while digging, swings harder on a correct answer, winces on a miss, leans on the pick when time is up, and cheers at the end. The headlamp blinks red in the last 10 seconds.
- **Depth you can see.** Rock color is tied to real depth: browns in level 1, reds and magentas in level 2, violets and blues with crystals in level 3. A ruler runs down the left edge (ticks every 5 m, labels every 25 m), level boundaries are marked across the rock, the world darkens the deeper you go (the miner stays lit), and a depth gauge on the HUD shows the three level bands and your current depth.
- **Calibrated rarity and treasure ranks.** Curated estimates are turned into scores on a steep curve by rank, so most answers score low and the rare ones climb fast. Each category has exactly one Platinum answer (100). Four ranks, each with its own shape: Copper nugget (common), Gold bar (top 25%), Diamond (top 5%), Platinum star (the single rarest answer).
- **Answer correction.** On top of aliases and plurals: filler words are dropped ("beagle dog"), word order is fixed ("retriever labrador"), typos are forgiven by length, sound-alikes are matched ("chiwawa", "dashund"), and a distinctive first word works ("rhodesian"). Anything ambiguous is rejected rather than guessed.
- **Easter eggs in the rock.** Bones, an old boot, pottery, treasure chests and abandoned mineshafts near the top; dinosaur skulls and ribs, trilobites and more mineshafts in the middle; geodes, gem deposits, lava pockets and an old robot deep down.
- **Rewards.** Chimes that climb with combos, ore flying into the cart, milestone banners every 5 finds, gem chords on reveal, multiplier stamp, comparison stamp, ribbons for first dig, new best and streaks.
- **Sound and music.** Synthesized with Web Audio. Calm loop on menus. Level 1: bouncy A minor. Level 2: driving D minor with snare. Level 3: fast and tense with kick, snare and sixteenth-note arpeggios. Tempo rises in the last seconds of each level. Each level also has its own atmosphere: drifting dust, rising embers, or twinkling crystal sparkles, with an edge vignette that deepens per level and pulses red when time is low. Music and sound effects toggle separately.
- **Type.** Pixelify Sans for reading, Jersey 10 (a tall pixel display face) for numbers, buttons and titles. The DIGLY wordmark is unchanged.
- **Screens.** Home (Daily Dig card), pre-game, play, level reveal, summary with rarest answers per level and share, Board, Vault (past digs as unranked practice), Stats, Options.

## Typography

- **Pixelify Sans** (OFL) for body text and the wordmark.
- **Jersey 10** (OFL) for scores, buttons and titles.

## Architecture

```
src/
  game/
    rules/        normalize, answer index, scoring + tiers, timer, leaderboard, schedule
    engine/       DigEngine (all game rules) + Store interface, MemoryStore, BrowserStore
    service/      ChallengeService contract, RemoteService (fetch), LocalService (offline preview)
    data/         seed challenges (server only on the live site)
    progress.ts   device cache for streaks and stats
  server/         Supabase store, guest cookie, rate limits, route helper (server only)
  app/api/        dig, attempts, attempts/[id]/submit, attempts/[id]/finish, board, me
  scene/ audio/ ui/
supabase/migrations/0001_digly_core.sql
tests/
```

The UI only talks to `ChallengeService`. On the live site that is `RemoteService`, which calls the API routes. The routes run `DigEngine` against Supabase. The offline preview build runs the same engine in the browser against localStorage.

## Backend rules (Phase 2)

- The server owns the clock. A level starts when `POST /api/attempts` returns, and submissions are accepted until 1.5 s past expiry to cover network lag.
- Categories are only sent when a level's clock starts. `GET /api/dig` returns level shapes, never titles or prompts.
- Rarity only comes back from `finish`. Scores are computed and stored on the server.
- One ranked attempt per guest, day and level. This is enforced by a unique index in Postgres, not just in code.
- Levels go in order. Closing the tab mid-level and coming back resumes the same attempt with the clock still running. An attempt whose time ran out is closed off automatically.
- Practice works on any past dig, and on today's dig after the ranked run.
- Guests are a random id in an httpOnly cookie. The board never returns ids.
- Rate limits: 600 requests/min per IP, 40 submits per 5 s and 30 starts/min per guest, 400 submissions per attempt.
- Answer lists never reach the browser on the live site. The build is checked for this by grepping `.next/static` for answers.

## Answer matching rules

1. Normalize: lowercase, strip accents and punctuation, `&` to "and", `st` to "saint", drop a leading "the".
2. Compare with spaces removed, so "shih tzu" equals "shihtzu".
3. Exact canonical or alias match.
4. Simple plural fallback ("pugs", "cherries", "peaches").
5. One-edit typo tolerance only for inputs of 7+ characters, and only if exactly one answer is within reach. Ambiguous typos are rejected.

The index throws on alias collisions and duplicate answers, and a test builds every seed to catch data mistakes.

## Real rarity

Rarity for a day is built from ranked play on earlier days only, so it never changes while that day is being played and every digger is scored the same way.

1. Each answer starts with an estimated find rate. It comes from the hand-set value in `data/answers/*.txt`, or from English word frequency if there isn't one.
2. The real rate is (players who found it + 50 x estimate) / (players + 50). The estimate counts as 50 imaginary players, so a handful of games can't swing it.
3. Answers are ranked by that rate and placed on the same curve as before: most answers score low, about 5% are Diamond, and exactly one is Platinum. Real data changes the order, not the gem mix.
4. Once a category has 30+ ranked plays, results show the real "% found it". Before that they show a "~" estimate.

Code: `src/game/rules/rarity.ts`, `DigEngine.rarity()`, SQL `digly_answer_stats`.

## Answer data

29 categories, 5,400+ answers. Level 1 has 9 categories, level 2 has 11 and level 3 has 9.

- `data/answers/<slug>.txt` holds the hand-curated answers: `Name | alias, alias = rarity`. The rarity is optional.
- `scripts/build_answers.py` merges those with public lists from github.com/dariusk/corpora (dogs, dinosaurs, horses, gems, knots and more). It fills missing rarity from word frequency, drops anything that clashes with an existing name or alias, and writes `src/game/data/answers.generated.ts`.
- `src/game/data/rotation.ts` sets which category is dug on which day. A rotation never changes once its days have started; to add categories, append a new rotation starting on a future day. The new 29-category rotation starts with #030.

To grow a list: open `/api/admin/rejects?slug=dog-breeds&key=YOUR_ADMIN_KEY` to see the most common inputs that didn't match. Add the real ones to the .txt file, then rebuild:

```bash
pip install -r scripts/requirements.txt
git clone --depth 1 https://github.com/dariusk/corpora /tmp/corpora
npm run answers -- /tmp/corpora
```

## Accounts

- Anyone can play as a guest. A guest's score shows on their own board as "Guest · not posted" and is never posted.
- "Post to the board" (results screen, board, Options) creates an account with a username and password. Email is optional. The device's guest becomes the account, so today's runs come along and appear on the board under the username.
- Passwords are hashed with scrypt. Logins use a random session token in an httpOnly cookie; only its SHA-256 is stored. Once a guest has become an account, the old guest cookie alone no longer works.
- Rate limits: 5 sign-ups per hour per IP, 20 logins per 15 min per IP and 10 per username. Some usernames are reserved ("you", "guest", "admin" and similar).
- Payments (Vault and Plus) will hang off the account.

## Error and usage tracking

- Sentry: browser and server errors, plus API failures. Off until `NEXT_PUBLIC_SENTRY_DSN` is set.
- PostHog: page views and these events: dig_started, level_finished, dig_finished, start_failed, account_created, logged_in, logged_out, post_prompt_shown, board_viewed, vault_opened, answers_viewed, share_clicked. Off until `NEXT_PUBLIC_POSTHOG_KEY` is set.
- Events carry numbers and modes only. Answer text is never sent. Autocapture and session recording are off, and Do Not Track is respected.
- Neither runs in the offline preview build.

## Tested

- 57 unit tests: rules, matching, the generated data (category counts, 18 real-world inputs like "c++", "t rex", "cowboys", "aubergine"), rotation (old days unchanged, every category once per cycle, no back-to-back repeats), live rarity (estimates with no data, reordering while keeping the gem mix, small samples barely move it, frozen during the day), the engine, accounts in the store, and both migrations in embedded Postgres.
- API with curl: guest board row, reserved, short and taken usernames, a short password, sign-up claiming today's runs, an old guest cookie alone not working, logout, a wrong password, logging back in resuming at level 2, and the admin key check.
- Headless Chrome on desktop (1280x800) and mobile (390x844): a guest plays all three levels, taps "Post to the board", signs up, then sees their name on the board and in Options. No page errors.
- The browser bundle contains no answers (checked for four rare ones). The offline preview build still runs.
- Not tested against your live Supabase, Sentry or PostHog (needs your keys).

## Known limits

- Rate limits are per server instance. A shared limiter can come later if abuse shows up.
- A guest can clear cookies for another ranked try before making an account. Once logged in, the account gets one try per level.
- No password reset yet. Email is collected (optional) so it can be added.
- New categories start on word-frequency estimates until players arrive.
- The Vault is open for testing. Payments are Phase 4.

## Supabase setup

1. Create a project at supabase.com (free tier is fine).
2. SQL Editor > New query, paste `supabase/migrations/0001_digly_core.sql`, Run.
3. Project Settings > API: copy the Project URL and the `service_role` key.
4. Vercel > Project > Settings > Environment Variables: add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for Production and Preview. Redeploy.
5. Check `https://<your-site>/api/dig`. It should say `"backend":"supabase"`.
6. Run each new file in `supabase/migrations/` in order. 0002 adds accounts and rarity stats.

For local dev put the same two lines in `.env.local`.

## Next

Phase 3: accounts that claim a guest's history, friend boards, answer reports. Then Vault purchase, Plus and production polish per the master plan.

## Playable preview build

The hosted preview is the static export with `_next/` renamed to `nxt/` (the host reserves underscore-prefixed paths):

```bash
npm run build:static
mkdir -p preview/nxt && cp out/index.html preview/ && cp -r out/_next/static preview/nxt/
grep -rl "_next/" preview | xargs sed -i 's#\([^_a-zA-Z]\)_next/#\1nxt/#g'
```
