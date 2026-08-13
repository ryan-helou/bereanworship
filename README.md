# BereanWorship

**Test what you sing.**

A research database that examines worship songs against Scripture — for biblical soundness, congregational suitability, and clarity — and publishes the evidence and reasoning behind every score.

> “Now these Jews were more noble than those in Thessalonica; they received the word with all eagerness, examining the Scriptures daily to see if these things were so.”
> — Acts 17:11

The Bereans are commended not for scepticism but for care: they received Paul's teaching eagerly, and checked it against Scripture anyway. BereanWorship applies that principle to worship music, because congregational songs teach. A church that sings a line every Sunday for a year has taught its people that line more thoroughly than most sermons will.

---

## The two questions

The product answers two questions, and keeps them strictly separate.

| | Question | Score |
|---|---|---|
| **Song validity** | Can a biblically sound church confidently sing this song together in corporate worship? | 0–100 |
| **Artist validity** | How theologically sound is this artist or ministry, on their publicly documented beliefs and teaching? | 0–100 |

**An artist's score never affects a song's score.** No points are deducted from a song because its artist scores poorly, and none are added because its artist scores well. The pipeline stage that produces a song's theological score is not even told who the artist is. A theologically troubled ministry can write a doctrinally excellent song, and a sound ministry can write a careless one — collapsing the two questions into one number would answer neither.

## How a score is produced

```
evidence  →  analysis  →  scoring
```

No model is ever asked to "rate this song". A seven-stage pipeline produces *findings* — each naming the claim, the evidence, a severity and how central the affected doctrine is — and a deterministic function in `src/lib/scoring.ts` turns those findings into numbers. The same findings always produce the same score, and every number on the site can be traced to the finding that produced it.

**Song validity** = 60% biblical/theological + 20% congregational suitability + 20% clarity.

Each component starts at 70, strengths add credit (capped at +30), concerns subtract penalties scaled by severity, how central the doctrine is, and whether the problem recurs in the chorus. Severe and major theological errors also impose hard ceilings, because a weighted average alone is too forgiving: a song can be 95% excellent, teach one thing that is false, and still average out to an 88.

Full detail: [docs/SCORING.md](docs/SCORING.md) and the site's own `/methodology` page, which is generated from the same constants the scoring engine uses and therefore cannot drift from it.

## Documentation

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, data model, search, the job queue, and the traps worth knowing about |
| [docs/SCORING.md](docs/SCORING.md) | The complete scoring methodology, with worked examples |
| [docs/RESEARCH.md](docs/RESEARCH.md) | The review pipeline, prompts, evidence standards and bias controls |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Railway setup, environment variables, migrations, operating the worker |

## Quick start

Requires Node 20.11+ and PostgreSQL 14+.

```bash
npm install
createdb bereanworship
cp .env.example .env
```

Fill in `.env` — at minimum `DATABASE_URL`, then generate the admin credentials:

```bash
openssl rand -base64 48
```

```bash
node scripts/hash-password.mjs 'your-admin-password'
```

Then set up the database and start:

```bash
npx prisma migrate deploy && node scripts/ensure-search-indexes.mjs && npm run db:seed -- --sample
```

```bash
npm run dev
```

The site is at http://localhost:3000, the admin at `/admin/login`.

`--sample` seeds a small development dataset. Those reviews are **hand-written illustrations, not pipeline research**, and the interface says so: every seeded record carries the review version `sample-v1.0` and renders a visible "Sample data" notice. Omit the flag to seed only the theme vocabulary.

### Producing reviews

There are two ways to produce a review, and they end up identical in the
database.

**By hand.** A researcher does the reading and writes the findings; the site
publishes them at **Admin → Publish a review**, or via
`npx tsx scripts/apply-review.ts reviews/some-song.json`. This needs no API
key. It is not a shortcut around the methodology: the payload is validated by
the same Zod schemas the pipeline stages use (so the ten-word lyric cap still
applies), scored by the same deterministic engine, and saved through the same
versioned path. **You cannot supply a score — the payload has no field for
one.**

**By the worker.** Set an Anthropic API key and run the worker; it drains the
queue automatically.

```bash
# .env
ANTHROPIC_API_KEY="sk-ant-..."
```

```bash
npm run worker
```

Without a key the site is fully browsable and imports still queue — queued jobs
simply fail fast with a clear "AI provider not configured" message rather than
a mystery.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run worker` | Review worker (long-running) |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Unit + integration tests |
| `npm run test:unit` | Unit tests only (fast, no database) |
| `npm run test:e2e` | Playwright, against a production build |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:deploy` | Apply pending migrations |
| `npm run db:seed -- --sample` | Seed themes and the sample dataset |
| `npm run db:ensure-indexes` | Recreate the raw-SQL search indexes and triggers |
| `npm run admin:hash -- 'password'` | Generate an `ADMIN_PASSWORD_HASH` |
| `node scripts/apply-review.ts <file>` | Publish a hand-researched review |
| `node scripts/purge-data.mjs --all` | Clear the catalogue (themes are kept) |
| `npm run release` | Deploy step: migrate, ensure indexes, seed themes |

## Tests

209 tests across three suites, none of which call a paid API — the pipeline is exercised end to end with a deterministic fake provider.

```bash
npm test          # 81 unit + 60 integration
npm run test:e2e  # 68 end-to-end, desktop + WebKit mobile
```

Unit tests cover the scoring engine exhaustively (weighting, severity penalties, centrality and recurrence multipliers, ceilings, recommendation thresholds, band coverage), title and artist normalisation, import parsing, the copyright word-limit, and password hashing. Integration tests run against a real Postgres instance, because the search layer is raw SQL with `tsvector` and `pg_trgm` and a mocked database would test nothing that matters. End-to-end tests run against a production build and cover the public site, the admin area, access control, and the mobile layout on WebKit.

## Design

Full-bleed indigo and bone bands rather than cards on white; electric blue as
the affirming accent, warm red for concern; oversized tightly-tracked sans
headlines against serif reading text; hard edges throughout — the radius scale
is flattened to zero at the token level, so nothing rounds. A score is not a
figure in the corner: it fills a block of colour, and the colour carries the
verdict before a word is read.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL · Prisma · Anthropic API · Vitest · Playwright · Railway

## Limitations

BereanWorship is an analytical resource. Its ratings are not infallible, and the site says so on every relevant page. Scripture is the ultimate authority; these ratings represent one documented methodology and theological framework, applied by a research pipeline that can be wrong. They are a starting point for discernment, not a substitute for it. See the Limitations section of `/methodology`.

## Licence

Not yet licensed. All rights reserved.
