# The research pipeline

Implemented in `src/lib/ai/` — `prompts.ts` (editorial standard), `schemas.ts` (contracts), `pipeline.ts` (orchestration), `client.ts` (provider boundary).

## Why it is staged

A single prompt saying "rate this worship song" produces a plausible number and no way to check it. Seven narrow stages, each returning validated structured findings, produce something auditable: every score traces to a finding, every finding names its evidence, and the arithmetic happens in code.

| # | Stage | Job | Web search |
|---|---|---|---|
| 1 | `identify` | Establish exactly which song and artist is meant | Yes |
| 2 | `extract_claims` | Neutral inventory of what the song asserts | Yes |
| 3 | `theological` | Biblical soundness — **artist withheld** | No |
| 4 | `communal` | Singability and corporate fit | No |
| 5 | `clarity` | Whether meaning survives being sung | No |
| 6 | `synthesis` | Summary, themes, Scripture | No |
| 7 | `score` | Deterministic, in code | — |

Artist research runs as its own job type on its own schedule, and is reused across every song by that artist.

## Structured output

Each stage forces the model through a tool call whose `input_schema` is generated from the same Zod schema used to parse the result. There is no free-text parsing anywhere, and a schema violation fails the job loudly rather than saving something half-formed.

The client also allows Anthropic's hosted web-search tool for the research stages, collecting the URLs actually consulted as citations. If that tool is unavailable on the account, the client degrades to analysis-without-search rather than failing the review, and records that sources could not be gathered.

## Bias controls

These are stated in the prompts as hard requirements, not suggestions.

**Popularity is irrelevant.** That a song is sung in thousands of churches, or is a beloved classic, says nothing about whether it is sound. No softening a finding because a song is loved; no inventing a finding to look discerning about a famous one.

**The artist is irrelevant to the song.** Stage 3 — the stage that produces the theological score, 60% of the total — is never told who the artist is. The prompt says so explicitly: *"If you catch yourself reasoning 'this comes from X, so…', stop: that reasoning is disallowed."* An integration test asserts the artist's name does not appear in that stage's prompt.

**Tradition is not merit.** An old hymn is not sound because it is old; a modern song is not shallow because it is modern.

**Uncertainty is reportable.** If the model does not reliably know a song's lyrics it must say so, and the pipeline then refuses to produce a review at all. An analysis of guessed lyrics would be worse than no analysis.

## What counts as error

The prompts distinguish five kinds of claim and weight them differently — biblical essentials, strong biblical conclusions, historic Christian doctrine, Reformed distinctives, and secondary disagreements. Only the first three can produce a serious concern.

Explicitly **not** error: being charismatic or continuationist, Arminian, non-denominational, a large church, commercially successful, using contemporary music, or having critics. Treating any of those as theological error would make the evaluation worthless, and the artist prompt says so in as many words.

Also not penalised: poetic and figurative language (Scripture is saturated with it), first-person singular (so are the Psalms), emotional intensity (biblical worship is deeply emotional), and incompleteness — a song about God's holiness need not also present the *ordo salutis*.

### Repetition and emotion

Both are judged rather than reflexively penalised.

Psalm 136 repeats one line twenty-six times; Revelation 4 records ceaseless repetition in heaven. Meaningful repetition drives a truth home and lets a congregation sing without a page. Only *excessive* repetition (well past the point of contributing anything) and *empty* repetition (language so thin that repeating it is all there is) are concerns.

Emotion is flagged only where a song appears engineered to produce feeling in place of truth — escalating intensity carrying no content, or a structure built for an emotional climax rather than for congregational singing.

## Artist research

The question is narrow: how theologically sound is this artist or ministry, on their publicly documented beliefs, teaching, affiliations and ministry context?

### Source hierarchy

1. **Tier 1 — primary.** Statements of faith, official sites, direct interviews, published sermons and books.
2. **Tier 2 — highly reputable secondary.** Established theological organisations, academic work.
3. **Tier 3 — general journalism.**
4. **Tier 4 — blogs, forums, social media.** May corroborate or provide leads. **Never** the sole basis for a serious accusation.

### Evidence grading

Every finding carries a visible grade: *direct statement* · *documented fact* · *credible reporting* · *allegation* · *interpretation* · *theological inference*. Readers see how well established a claim is without having to guess.

### Hard prohibitions

- Never present an allegation as established fact.
- Never present rumour or "many people say" as evidence.
- Never infer someone's theology from a single ambiguous social-media post.
- Never make an accusation of personal misconduct. This site evaluates theology, not private lives. Financial or governance controversy is in scope only where publicly documented **and** theologically relevant, and is graded accordingly.
- Never assume every member of a group shares the leadership's theology. For a collective or label, the ministry producing the music is what is evaluated, and the page says so.
- If the evidence is thin, say so — `researchPossible: false` produces no score at all rather than a fabricated one.

### Conflicting evidence

Where credible sources genuinely disagree, the disagreement is recorded in `evidenceCaveat` and rendered prominently on the artist page. The contested claim is not treated as established. Conservative conclusions are required where evidence is inconclusive: the cost of an unfair verdict is higher than the cost of an incomplete one.

### The scoring consequence

A concern resting only on tier-4 evidence, or graded merely as an allegation or interpretation, is capped: scored as moderate, barred from imposing a ceiling, and published flagged as contested. See [SCORING.md](SCORING.md#the-source-quality-cap).

## House style — learned from the first review

The first published review was written, then rewritten twice. Both corrections
are now enforced rather than remembered.

### Quote the song

If a finding is about something the song says, it carries the words. Not a
paraphrase — the words, in `lyricExcerpt`, within the ten-word cap.

This is not presentation. In the first draft of the *God the Uncreated One*
review, a Christology concern criticised the phrase **"put on mortal flesh"**
for clothing imagery that might imply Christ's humanity was worn rather than
assumed. The song does not contain that phrase. It says **"Mighty God in
mortal flesh"** — no clothing metaphor at all. The line had come from a
secondary summary of the lyric, not the lyric, and it produced a criticism of
words the songwriters never wrote. Removing it moved the score from 91 to 92.

The rule that prevents a repeat: **if you cannot quote it, you may not assert
it.** Where you are working from someone's description of a lyric rather than
the lyric, either verify the wording or drop the finding.

Only three kinds of finding may omit a quote, because nothing exists to quote:

| Kind | Example |
|---|---|
| Absence | a doctrine the song never addresses |
| Structure | verse count, form, how a refrain repeats |
| Music | melody, range, arrangement, tempo |

`evidenceCoverage()` reports the ratio, the CLI and the admin publish screen
both display it, and anything below 60% logs `review.thin_evidence`. The
reference review sits at 16/18 (89%) — the two exceptions being the absent
Spirit and the four-verse length.

### Be brief

One claim, one sentence, roughly 25 words. A finding that will not fit is
usually two findings. The schema enforces it: 320 characters for an
explanation, 420 for a summary, 520 for a stage assessment. Over-long text
fails validation the same way an over-long lyric excerpt does.

### Verify the identity before analysing

The same first review had the singing perspective wrong — recorded as
third-person throughout when the fourth verse turns to direct address
("We crown You…"). Read the whole text before characterising it.

## Copyright

Enforced at the schema boundary, not left to the prompt:

- **Lyric excerpts are hard-capped at ten words** by a Zod transform that truncates rather than rejects — the analysis stays valid, only the quotation is trimmed. Complete lyrics are never stored or displayed.
- Scripture excerpts are capped at 45 words. References and reasoning carry the weight; the ESV is used where text is quoted.
- The prompts require paraphrase first, quotation only where the exact wording is the issue.

There is a test asserting a fifteen-word excerpt is stored as ten.

## Research ethics

Only publicly accessible information and lawful data sources. No bypassing paywalls, authentication, robots directives or security controls.

## Failure modes, and what happens

| Situation | Behaviour |
|---|---|
| Song cannot be identified | Non-retryable → `NEEDS_REVIEW`. Retrying spends tokens to reach the same answer. |
| Lyrics cannot be established | Non-retryable. **No review is produced.** |
| Artist record too thin | Non-retryable. No score is published. |
| Model output fails schema validation | Job fails with the validation detail; nothing partial is saved. |
| `ANTHROPIC_API_KEY` missing | Non-retryable, with a message naming the variable. The site stays fully browsable. |
| Provider timeout or transient error | Retryable, quadratic backoff, up to `WORKER_MAX_ATTEMPTS`. |

## Testing the pipeline without spending anything

`getAiProvider()` is injectable. `tests/integration/fake-ai.ts` supplies a deterministic provider whose responses are still parsed by the **real** Zod schemas, so the fake cannot drift from the contract while the tests exercise the entire pipeline — identification through scoring and persistence — with no network calls and no tokens.

Individual stages can be overridden per test, which is how the "refuses to review when lyrics cannot be established", "clamps an over-long excerpt" and "caps a weakly-evidenced severe accusation" cases are covered.
