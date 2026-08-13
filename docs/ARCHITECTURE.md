# Architecture

## Shape of the system

Three processes, one database.

```
┌─────────────────┐        ┌──────────────────┐        ┌─────────────────┐
│   Web (Next)    │        │    PostgreSQL    │        │  Worker (Node)  │
│                 │        │                  │        │                 │
│ public pages    │──────▶│  songs           │◀──────│ claims jobs      │
│ admin pages     │        │  artists         │        │ runs pipeline   │
│ server actions  │        │  findings        │        │ writes reviews  │
│ enqueues jobs   │        │  review_jobs     │        │                 │
└─────────────────┘        └──────────────────┘        └────────┬────────┘
                                                                │
                                                       ┌────────▼────────┐
                                                       │  Anthropic API  │
                                                       └─────────────────┘
```

The web process never runs a review. A single review takes minutes and hundreds of thousands of tokens, which has no business happening inside an HTTP request. The web process only ever *enqueues*; the worker does the work. That separation is why a 200-song import returns in under a second.

The queue lives in Postgres rather than Redis. It is one fewer service to operate, and the queue stays transactionally consistent with the data it produces.

## Data model

`prisma/schema.prisma` is the source of truth. The parts that matter:

### Identity

A song is identified by **(artist, normalized title)**, enforced by a database unique constraint:

```prisma
@@unique([artistId, normalizedTitle], name: "song_identity")
```

Normalisation is aggressive on formatting and conservative on meaning. `"How Great Thou Art"`, `"HOW GREAT THOU ART"` and `"  how great thou art  "` collapse to one key. `"Great Are You Lord"` by two different artists stays two songs. Recording-variant suffixes are stripped (`(Live)`, `[Radio Edit]`, `- Acoustic`) but meaningful parentheticals are not — `Amazing Grace (My Chains Are Gone)` is a genuinely different song from `Amazing Grace`, and treating it as a duplicate would be a data-loss bug. See `src/lib/normalize.ts` and its tests.

Artists carry a `normalizedName` unique key plus an `aliases` array, so `The Porter's Gate` and `Porters Gate Worship Project` resolve to one row. This is what makes artist research reusable: thirty songs by one artist produce one artist row and one piece of research, not thirty.

### Findings are the unit of truth

Scores are never stored as an opinion. `SongFinding` and `ArtistFinding` rows each record the claim, its evidence, a severity, and the exact signed `scoreImpact` it contributed. Recomputing the score from the findings must reproduce the stored number — that is the property that makes the site auditable, and it is asserted in the tests.

### Versioning

Reviews are never silently overwritten. Before a re-review replaces anything, the outgoing review is snapshotted into `ReviewHistory` as JSON. Version numbers bump minor (`v1.0` → `v1.1`) for a re-review under the same methodology, and major (`→ v2.0`) when `SCORING_VERSION` or `METHODOLOGY_VERSION` has moved, because scores from a different methodology are not comparable with the old ones.

### Evidence grading

Every `ArtistFinding` carries an `evidenceGrade` (direct statement · documented fact · credible reporting · allegation · interpretation · theological inference) and a `contested` flag, both rendered on the page. A serious accusation resting only on tier-4 sources is published — but marked contested, capped at a moderate penalty, and barred from imposing a score ceiling.

## Search

Three mechanisms, because human queries need all three.

| Mechanism | Handles | Implementation |
|---|---|---|
| Full-text (`tsvector` + GIN) | Whole words, stemming | Maintained by triggers, weighted A–D |
| Substring (`ILIKE`) | Partial words — "amazing" → *Amazing Grace*, "tomlin" → *Chris Tomlin* | Backed by trigram indexes |
| Trigram similarity | Typos — "tomlim" still finds him | `similarity()` and `word_similarity()` |

Matching spans the song *and* its artist, which is why `src/lib/search.ts` uses a raw query: the ranking expression crosses the join and cannot be expressed in the Prisma query builder. Every interpolation is a bound parameter — Prisma's tagged templates never concatenate values into SQL.

`word_similarity()` matters more than it looks. Plain `similarity('nwton', 'john newton')` is 0.29 — below any usable threshold — because the leading "john" dilutes it. `word_similarity` compares against the best-matching extent instead and returns 0.5, so a typo in a surname still finds the artist.

### Raw SQL indexes — a standing hazard

The `tsvector` triggers and `gin_trgm_ops` indexes are created by hand-written SQL in the `search` migration, because Prisma's schema language cannot express operator classes or trigger functions.

**Consequence: `prisma migrate dev` sees them as drift and will propose `DROP INDEX` statements in any future migration.** This already happened once during development and was caught in review.

Two defences:

1. Read every generated migration before applying it, and delete any `DROP INDEX` touching a `*_trgm_idx` or `*_searchVector_idx`.
2. `scripts/ensure-search-indexes.mjs` runs on every deploy and recreates anything missing. It is fully idempotent and never fails a deploy.

## The job queue

`src/lib/queue.ts`. Jobs are claimed with the standard Postgres work-queue pattern:

```sql
UPDATE review_jobs SET status = 'RESEARCHING', ...
 WHERE id = (
   SELECT id FROM review_jobs
    WHERE status = 'PENDING' AND "runAfter" <= (NOW() AT TIME ZONE 'UTC')
    ORDER BY priority DESC, "createdAt" ASC
      FOR UPDATE SKIP LOCKED LIMIT 1
 )
RETURNING *;
```

`FOR UPDATE SKIP LOCKED` means several workers can poll concurrently and each takes a different row without blocking. Running more worker processes is the intended way to scale throughput.

### `NOW() AT TIME ZONE 'UTC'` is load-bearing

Prisma maps `DateTime` to `timestamp without time zone` and writes UTC instants into it. Bare `NOW()` returns `timestamptz`. Comparing the two makes Postgres reinterpret the stored value in the **session** time zone — so on any database whose session is not UTC, `runAfter <= NOW()` is false for jobs that are genuinely due, and **the queue silently claims nothing at all**.

This was a real bug, found by an integration test running against a `America/Toronto` session. There is now a regression test that sets a non-UTC session time zone and asserts a due job is still claimable.

### Failure handling

Failures are separated by kind, because retrying the wrong thing burns tokens to reach the same answer:

- **Retryable** (provider timeout, transient error) → back to `PENDING` with quadratic backoff, up to `maxAttempts`.
- **Non-retryable** (song cannot be identified, lyrics cannot be established, API key missing) → straight to `NEEDS_REVIEW` for a human.

Idempotency is enforced at both ends: `enqueueSongReview` returns an existing unfinished job rather than creating a second one, and the worker exits cleanly if it finds the song already reviewed. A retry can never produce a duplicate review.

Workers that die mid-job leave a lock behind; `reclaimStaleJobs()` returns anything locked for more than 20 minutes to the pending pool.

## Review pipeline

Seven stages, each with one job, its own prompt, and its own Zod schema. Structured output is obtained by forcing the model through a tool call whose input schema is generated from the same Zod schema used to parse the result — there is no free-text parsing anywhere.

1. **Identify** — resolve the song and the artist the church world associates with it (web search).
2. **Extract claims** — a neutral inventory of what the song asserts. Returns `lyricsAvailable: false` rather than inventing lyrics.
3. **Theological** — biblical soundness. *The artist is deliberately withheld from this stage.*
4. **Communal** — singability and corporate fit.
5. **Clarity** — whether meaning survives being sung.
6. **Synthesis** — summary, themes, Scripture.
7. **Score** — deterministic, in code.

Details and the full text of the bias controls are in [RESEARCH.md](RESEARCH.md).

## Two ways to produce a review

The worker is one producer of findings; a researcher is another. Both converge
on `src/lib/manual-review.ts` → `saveSongReview`, so the database cannot tell
them apart — and should not, since the methodology applied is identical:

| | Worker | Researcher |
|---|---|---|
| Validation | Pipeline Zod schemas | **Same schemas** |
| Scoring | `scoring.ts` | **Same engine** |
| Persistence | `saveSongReview` | **Same function** |
| Versioning / history | Yes | Yes |
| Can supply a score | No | No — no field exists |

The manual path exists because it is genuinely useful (and because it makes
production writes possible without handing anyone database credentials), not
as a way around the rules.

## Security

| Concern | Approach |
|---|---|
| Admin auth | scrypt password hash, HS256 JWT in an httpOnly `SameSite=Strict` cookie, 8-hour expiry |
| Authorization | Edge middleware **plus** an independent server-side check in every admin page and handler. A hidden URL is never the control. |
| CSRF | Server actions are origin-checked by Next; a double-submit token is available for route handlers |
| Rate limiting | Database-backed fixed windows — in-memory counters stop limiting the moment you run two instances |
| Account enumeration | Wrong address and wrong password return the identical message |
| Secrets in logs | `src/lib/logger.ts` redacts any key matching `key|secret|password|token|auth|cookie|session|hash` before serialising |
| Injection | Prisma parameterises everything, including the raw search queries |
| Abuse | Honeypot field and per-client rate limits on the public request form |

### The `ADMIN_PASSWORD_HASH` encoding

The hash uses `:` separators and base64url, not the conventional `scrypt$N$r$p$…`. This is not cosmetic.

Environment variables get read out of `.env` files by dotenv, which Next.js runs **with variable expansion enabled**. dotenv-expand reads `$32768`, `$8` and `$1` inside the value as variable references, finds nothing, and substitutes empty strings. `scrypt$32768$8$1$SALT$HASH` silently becomes `scryptSALTHASH`, and every login fails with "credentials not recognised" and no indication that the stored hash was destroyed in transit.

This was a real bug. `verifyPassword` now reports *why* a hash is rejected instead of swallowing it, still accepts the legacy `$` form, and there is a regression test asserting the emitted hash survives dotenv expansion untouched.

## Performance

- Public pages use ISR (`revalidate = 3600`); the reviewed catalogue is pre-rendered via `generateStaticParams`.
- Search paginates in SQL and hydrates only the current page's rows.
- ~103 kB of shared JS. Most pages are server components; the client bundle is the search combobox, the filter bar, the two forms and the mobile menu.
- The admin area is `force-dynamic` and never cached, by config and by response header.
- Prisma's client is cached on `globalThis` in development so hot reload does not exhaust the connection pool.

## Layout note

Every responsive grid declares an explicit base column (`grid grid-cols-1 sm:grid-cols-2 …`). Without it, CSS creates a single implicit `auto` track sized by *content*, and a card containing a `truncate` heading pushes the track — and the page — wider than the viewport. This produced horizontal scrolling on iPhone-width WebKit while Chromium looked fine, and is now covered by mobile tests that assert `scrollWidth <= clientWidth` on every major page.
