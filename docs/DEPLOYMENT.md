# Deployment

The live deployment runs on Railway as two services against one Postgres instance.

| | |
|---|---|
| Project | `bereanworship` |
| URL | https://web-production-02fdd.up.railway.app |
| Services | `web` (Next.js) · `worker` (review pipeline) · `Postgres` |
| Repository | https://github.com/ryan-helou/bereanworship |

Both services deploy from the same build. `scripts/start.mjs` picks the role from `SERVICE_ROLE`, falling back to the platform's service name — so there is no second Dockerfile and no duplicated pipeline.

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | On Railway: `${{Postgres.DATABASE_URL}}` |
| `ADMIN_AUTH_SECRET` | yes | ≥32 chars. `openssl rand -base64 48`. Must match between `web` and `worker` |
| `ADMIN_EMAIL` | yes (web) | The single admin account |
| `ADMIN_PASSWORD_HASH` | yes (web) | `npm run admin:hash -- 'password'` |
| `ANTHROPIC_API_KEY` | for reviews | Without it the site is fully browsable; review jobs fail with a clear message |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-opus-5` |
| `NEXT_PUBLIC_SITE_URL` | recommended | Canonical URLs, sitemap, OG tags. Falls back to `RAILWAY_PUBLIC_DOMAIN` |
| `PORT` | see below | Pin it to match the domain's target port |
| `SERVICE_ROLE` | worker only | Set to `worker` |
| `WORKER_CONCURRENCY` | no | Default 2 |
| `WORKER_POLL_INTERVAL_MS` | no | Default 4000 |
| `WORKER_MAX_ATTEMPTS` | no | Default 3 |

`ADMIN_AUTH_SECRET` is shared with the worker because it keys the HMAC used for rate-limit client fingerprints, not because the worker authenticates anyone.

### Two variable traps worth knowing

**`ADMIN_PASSWORD_HASH` must not contain `$`.** `scripts/hash-password.mjs` emits a `:`-separated base64url hash for this reason. dotenv runs *variable expansion* over `.env` values, so a conventional `scrypt$32768$8$1$…` hash has `$32768`, `$8` and `$1` silently replaced with empty strings — and every login then fails with "credentials not recognised" and no indication why. `verifyPassword` still accepts the legacy `$` form and now reports *why* it rejected a hash.

**Pin `PORT`.** Railway injects `PORT=8080` by default, while a generated domain may target 3000. The mismatch produces a 502 with a perfectly healthy application in the logs. Either set `PORT` to match the domain's target port, or set the domain's target port to match. This deployment pins `PORT=3000`.

## Setting up from scratch

```bash
railway init --name bereanworship
railway add --database postgres
railway add --service web
```

```bash
railway service web
railway variables --service web \
  --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}' \
  --set "ADMIN_AUTH_SECRET=$(openssl rand -base64 48)" \
  --set 'ADMIN_EMAIL=you@example.com' \
  --set 'PORT=3000' \
  --set 'NODE_ENV=production' \
  --skip-deploys
```

```bash
npm run admin:hash -- 'a-long-admin-password'
```

Set the printed value as `ADMIN_PASSWORD_HASH`, then create a domain and deploy:

```bash
railway domain --service web --port 3000
railway up --service web --ci
```

Finally set `NEXT_PUBLIC_SITE_URL` to the generated domain and redeploy.

### The worker

```bash
railway add --service worker
railway variables --service worker \
  --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}' \
  --set 'ADMIN_AUTH_SECRET=<same value as web>' \
  --set 'SERVICE_ROLE=worker' \
  --set 'WORKER_CONCURRENCY=2' \
  --skip-deploys
railway up --service worker --ci
```

The worker serves a liveness endpoint on `PORT` reporting whether the loop is running, in-flight job count and live queue depth — so the platform can tell "quietly working" from "crashed and hung".

Scaling throughput is a matter of running more worker replicas. Job claiming uses `FOR UPDATE SKIP LOCKED`, so concurrent workers never collide.

## Migrations

`railway.json` sets a pre-deploy command that runs before the new version takes traffic:

```
npm run release   →   prisma migrate deploy
                  →   node scripts/ensure-search-indexes.mjs
                  →   node scripts/seed-themes.mjs
```

All three are idempotent. `ensure-search-indexes` recreates the `pg_trgm` indexes and `tsvector` triggers if anything has removed them — see the standing hazard in [ARCHITECTURE.md](ARCHITECTURE.md#raw-sql-indexes--a-standing-hazard). `seed-themes` seeds the theme vocabulary, which is reference data the pipeline depends on; it does **not** seed the sample dataset.

### The build does not need the database

`generateStaticParams` and the homepage's rails tolerate an unreachable or unmigrated database and fall back to on-demand rendering. This matters because the pre-deploy step runs *after* the build — on a first deploy the schema does not exist yet, and requiring it would make the very first deploy impossible. Verified by building against a deliberately unreachable `DATABASE_URL`.

## Importing the first 200 songs

1. Sign in at `/admin/login`.
2. Go to **Bulk import**.
3. Paste the list, one song per line. Accepted formats:

   ```
   Amazing Grace — John Newton
   Amazing Grace - John Newton
   Amazing Grace | John Newton
   Amazing Grace by John Newton
   "Amazing Grace","John Newton"
   Amazing Grace
   ```

   Blank lines and `#` comments are ignored; a CSV header row is skipped. Up to 1000 lines per submission.

4. **Parse and queue.** The report shows every line's outcome — queued, already reviewed, duplicate in paste, already queued, or unreadable — and links each queued song to its page.
5. **Track this batch** opens the queue filtered to that import.

Nothing is reviewed twice. Songs with a completed review are skipped, duplicates within the paste are collapsed, and each new artist is queued for research exactly once no matter how many of their songs are in the list.

Supplying the artist is worth doing: the pipeline can then skip the identification stage entirely. Lines without one are still accepted and the artist is identified during review.

### Triggering and watching reviews

Queued work is picked up automatically by the worker; there is no separate "start" action. Progress is visible at **Queue**, which shows pending / active / completed / failed / needs-review counts and each job's current stage.

A 200-song import queues 200 song reviews plus one research job per distinct artist. With `WORKER_CONCURRENCY=2` that is a long-running job — raise concurrency or add worker replicas to go faster, bearing in mind the API rate limits and cost.

Failed jobs can be retried individually or in bulk from the queue. Retries never produce a duplicate review: a job whose song is already reviewed exits cleanly.

## Operating notes

**Health.** `GET /api/health` reports database connectivity, whether the AI pipeline is configured, and whether admin auth is configured. It returns 200 while the site can serve traffic — a missing API key degrades the pipeline, not the site, so it is reported without failing the check.

**Logs.** Structured JSON, with secrets redacted before serialisation. Greppable events: `review_job.claimed`, `review_job.completed`, `review_job.failed`, `research.started`, `artist_research.completed`, `import.duplicate_detected`, `admin.login_failed`, `security.rate_limited`.

**Rotating the admin password.** Generate a new hash, update `ADMIN_PASSWORD_HASH`, redeploy. Existing sessions survive; to invalidate them, rotate `ADMIN_AUTH_SECRET` too (and update the worker to match).

**Backups.** Railway's Postgres backups cover the database. Review history is immutable and append-only, so a restore never loses superseded reviews.

## Post-deployment checklist

- [ ] `ADMIN_PASSWORD_HASH` regenerated — **the deployed default must be changed**
- [ ] `ANTHROPIC_API_KEY` set on the **worker** (the web service does not need it)
- [ ] `NEXT_PUBLIC_SITE_URL` matches the real domain
- [ ] `/api/health` returns `"status":"ok"` on both services
- [ ] A custom domain attached, if wanted (`railway domain --service web`)
- [ ] Repository visibility reviewed — it is currently **private**

## Current state

The deployment is live and verified end to end: public pages, search, the request form, admin authentication, bulk import with duplicate detection, and the queue.

`ANTHROPIC_API_KEY` is **not** set, so no reviews have been produced. The production database contains the theme vocabulary and the songs queued by a smoke test; those jobs sit in `NEEDS_REVIEW` with the message *"AI provider not configured. Set ANTHROPIC_API_KEY to run reviews."* Setting the key on the worker and retrying them from the queue is all that is needed to begin producing reviews.
