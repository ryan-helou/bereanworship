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

Also not penalised: poetic and figurative language (Scripture is saturated with it, down to
the concessive wonder of Philippians 2 — though he was rich, yet he became poor), emotional
intensity (biblical worship is deeply emotional), and incompleteness — a song about God's
holiness need not also present the *ordo salutis*. First-person singular is not an error either;
so are the Psalms. It costs one content point on the corporate-voice test, because a gathered
church singing "we" is doing something a room of private prayers is not, and it costs nothing
else.

### A concern has to be real

A concern costs a song nothing until it passes a test, written in September 2026 after a review
docked *As the Deer* for marvelling that the King is also friend and brother — which is
Philippians 2's own note, and which Hebrews 2:11 states concessively itself.

A concern stays when the song affirmatively says something false or misleading, read the way an
ordinary congregation hears it, or when it has a real practical problem that is not already
charged elsewhere. It goes when it:

1. reads poetic or figurative language woodenly;
2. depends on a misreading nobody would actually take;
3. is an absence, which belongs in the substance checklist;
4. charges a fault already paid for in the same review — singular voice, a song about the singer,
   claims left ungrounded, no act of God stated, performance orientation, repetition;
5. is style or taste — idiom, a seam between verses by different writers, intensity, genre;
6. treats a position faithful Christians hold as an error;
7. objects to a word Scripture itself uses;
8. is about key or height — a high bridge, a climbing chorus, a demanding key. That belongs to the
   arrangement: transpose and it is gone. It is reported in the song's range note and, when a chart
   has been read, in the range score beside validity, never inside it.

A real concern graded too hard is lightened rather than dropped: a misreading an ordinary singer
would not take is only *possible*, a matter of imagery is *peripheral*, and a line sung once does
not *recur*. None of this softens real error. A song that says something wrong about God still
pays for it in full.

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

### Show your work — locate always, quote sparingly

A reader must be able to check a finding. There are two ways to let them, and
every finding owes one.

**Locate — required.** Every finding names where in the song it comes from:
`songLocation` (`CHORUS`, `VERSE_2`, `WHOLE_SONG` for an absence, `NOT_LYRICAL`
for melody or structure), plus `locationDetail` when the spot needs naming.
A reader with the lyrics open goes there and judges for themselves. This costs
nothing, so nothing is exempt.

**Quote — rationed.** Reserved for findings where the exact wording *is* the
finding: an ambiguous phrase, a doctrinal statement made unusually well,
anything a paraphrase would slant.

Why this matters is a correction to an earlier correction. In the first draft
of the *God the Uncreated One* review, a Christology concern criticised the
phrase **"put on mortal flesh"** for clothing imagery implying Christ's
humanity was worn rather than assumed. The song does not contain that phrase.
It says **"Mighty God in mortal flesh"** — no clothing metaphor at all. The
line had come from a secondary summary of the lyric, and it produced a
criticism of words the songwriters never wrote.

The fix at the time was *"if you cannot quote it, you may not assert it"* —
which worked, and then overcorrected. Requiring a quote per finding produced a
review carrying thirty-nine excerpts totalling 198 words: individually legal,
collectively a reproduction of the hymn. A per-excerpt cap cannot see that
happening, because no field ever sees its siblings.

Locating serves the honesty rule just as well and costs no lyric. The part that
still binds without exception: **you may not assert what a song says from
memory, from a summary, or from anyone's description of it.** Locating is not a
licence to guess — a located guess is still a guess. If you have not seen the
words, drop the finding.

`evidenceCoverage()` reports both halves — `grounded` (checkable at all) and
`quoted` (words actually spent). The CLI and the admin publish screen display
them, and grounding below 90% logs `review.thin_evidence`. Note which number is
the target: a review that locates everything and quotes little scores full
marks. Maximising quotes is the failure this design exists to prevent.

### Be brief

One claim, one sentence, roughly 25 words. A finding that will not fit is
usually two findings. The schema enforces it: 320 characters for an
explanation, 420 for a summary, 520 for a stage assessment. Over-long text
fails validation the same way an over-long lyric excerpt does.

### Verify the identity before analysing

The same first review had the singing perspective wrong — recorded as
third-person throughout when the fourth verse turns to direct address
("We crown You…"). Read the whole text before characterising it.

## Researching a song without touching its lyrics

Reviews need facts about a song's contents — how many verses, whether the cross is
named, where a phrase sits. Getting those without pulling the lyric into context is a
method, and it has one hard rule that has now been learned twice the expensive way.

**Never put a quoted lyric phrase in a search query or a fetch prompt.** Searching for a
line in quotation marks is a request to find and reproduce that line, and it trips the
same copyright guardrail as extracting the text wholesale — even when the intent is
merely to identify the song. Two sessions have been blocked mid-task this way: once
extracting lyrics from score PDFs, and once from a single quoted opening line dropped
into an otherwise ordinary identification search.

**Identify by metadata.** Title, artist, writers, year, album, publisher, CCLI number.
Every identification search in the catalogue that used those succeeded; the one that
added a quoted first line was refused.

**Ask structural questions instead.** A fetch prompt that asks *how many verses are
there, is the cross named and in which section, is the voice "I" or "we"* returns what a
review needs and no lyric text. Prompts that work are phrased "answer in your own words,
quoting at most five words, and do not reproduce the lyrics".

**The page you open counts as much as the words you type.** A careful prompt does not
save a fetch whose target is a lyric sheet: what returns is the song, and the guardrail
reads what came back, not what was asked for. This was learned a third time on a hymn
page fetched with a properly-worded structural prompt. So choose sources that are
*about* the song rather than sources that *are* it:

| Fetch these — writing about the song | Never fetch these — the song itself |
|---|---|
| Wikipedia song articles | `hymnary.org/text/…`, `hymnal.net`, any hymnal text page |
| hymnologyarchive.com | Lyrics databases and lyric-video pages |
| Publisher and writer story pages (worshiptogether, CityAlight, Bethel) | Chord/lyric sheets, lead sheets, PraiseCharts song PDFs |
| Song histories (umcdiscipleship, premierchristianity) | Anything whose page title is the song's opening line |

A review needs how many verses there are, whether the cross is named, and where — all
of which the left column answers. None of it requires the text.

**When a song cannot be identified from metadata, ask rather than guess.** "Yahweh
(Psalm 91)" was left out of the catalogue for exactly this reason — no well-known song
by that title sets that psalm, and reviewing the wrong song is worse than a delay.

## Song sources — what a review may rest on

Song reviews used to record their sources as bare URLs, and the consequence was measured
in September 2026: all 101 stored sources sat at the tier-3 default, 33 of 99 citations
were the seller's own pages, the most-cited evaluative voice was a single-author blog, and
19 of 36 reviews rested on no independent scholarship at all. The methodology page
promised that every claim was tied to a ranked source; for songs that was not true.

Since scoring 3.2.0 every song source states what it is (`SongSourceSchema`), and the
engine counts only the independent ones.

### Tiers for song research

| Tier | What it is | Examples | Good for |
|---|---|---|---|
| 1 | Peer-reviewed scholarship, standard hymnological reference, denominational reports that give reasons, the writer's own account | *Journal of Congregational Song*; *Yale Journal of Music & Religion*; Canterbury Dictionary of Hymnology; hymnary.org record pages; Routledge Congregational Music Studies; OPC Committee on Song in Worship reports (1946–47); LCMS *Text, Music, Context* | Facts, criteria, published objections |
| 2 | Edited or institutional secondary work; practitioners with real standing | Hymnology Archive; *First Things*; Desiring God; Calvin Institute resources; Bob Kauflin; Zac Hicks | Context and informed judgement |
| 3 | Journalism and tertiary reference | Wikipedia; news coverage | Identification and dates |
| 4 | Self-published reviewers, church pages, radio promotion | Single-author review blogs | An opinion held, attributed and dated — never evidence |

Publisher, label, licensing and artist pages are recorded as `OFFICIAL_WEBSITE`. They are
primary for a copyright line, a key or a release date, and never evidence about soundness:
they exist to sell the song. They do not count as independent at any tier.

### What counts in the score

`independentSourceCount()` counts tier-1 and tier-2 sources that are not
`OFFICIAL_WEBSITE` and that examined what the song teaches (`assessesContent`). An
author's record on hymnary.org is tier 1 for who wrote a hymn and when, and says nothing
about whether it is sound, so it does not count. A song with no theological concern reaches full soundness only when
that count is at least one. Otherwise it is held one level below
(`UNVERIFIED_CLEAN_LEVEL`), because "nobody found anything" is not "nothing is wrong".

### Refused at the boundary

The review payload rejects a lyrics site, any `/lyrics/` path, and hymnary.org `/text/`
and `/hymn/` pages. hymnary.org is otherwise a tier-1 bibliographic source: its
`/person/`, `/tune/` and `/hymnal/` records carry dates, meter and publication history
without the text (checked 2026-09-07). On a tune page take only the metadata fields; its
list of associated texts can show opening lines. A lead sheet, chord chart or score PDF
reproduces the song as surely as a lyrics site does, and is not cited either.

### Other reviewers

A self-published reviewer's rating is one person's opinion. Cite it, attributed and dated,
where the review engages it. Never let it be the basis of a concern or a clearance, and
never adopt its score: citing another site's number while producing your own makes the
result partly circular.

### A standing bias control: the era gap

"Old hymns are rich, new songs are shallow" is the prior a reviewer most often brings, and
the evidence for it is weaker than it feels. Lester Ruth (Duke Divinity, 2012 lecture, not
peer-reviewed) compared the 70 most-republished evangelical hymns of 1737–1860 with the 98
most-used CCLI songs of 1989–2012:

| Measure | CCLI songs | Classic hymns |
|---|---|---|
| All three Persons named | 4% | 4% |
| First Person referenced | 14% | 23% |
| Third Person referenced | 8% | 14% |
| Focused on the Second Person | 49% | 74% |

Hymns are somewhat stronger on most measures, both bodies are weak on the Trinity, and in
Ruth's words the difference is one of degree rather than opposition. In September 2026 this
catalogue scored pre-1900 hymns 14 points above post-1990 songs, with three times fewer
concerns per song — a wider gap than the published comparison supports. Check any era gap
against this before trusting it.

### Writing without reproducing

The copyright guardrail reads what a reviewer writes as well as what it fetches. Three
responses were blocked in September 2026 with no fetch in them: drafts carrying short
excerpts, and claims that paraphrased a chorus too closely. Since 3.2.0 every
`lyricExcerpt` in the catalogue is null; findings describe what a section teaches, never
how it is worded; and review files are edited programmatically by path, so existing text is
never retyped. Nothing is lost in the score — a located finding is fully checkable — but a
finding that turns on exact wording now has to make its case at the level of doctrine.

## Copyright

Enforced at the schema boundary, not left to the prompt:

Three limits, and the last two matter as much as the first — a review that quotes ten words forty times has reproduced the song however carefully each quote was trimmed:

- **Any single excerpt is hard-capped at ten words** by a Zod transform that truncates rather than rejects — the analysis stays valid, only the quotation is trimmed.
- **A review may quote in at most 8 findings, totalling at most 60 lyric words.** `applyQuotationBudget()` spends that budget on the most serious findings first (severity, then centrality, then whether the congregation repeats it), strips the rest, and de-duplicates: one line quoted by two findings is charged and printed once. The findings themselves survive untouched — they keep their location, so a finding that loses its quote is still checkable.
- **The claim-extraction pool is budgeted the same way** (10 quotes / 70 words) at the schema boundary, so an over-quoting extraction cannot smuggle a reconstruction downstream.
- Scripture excerpts are capped at 45 words. References and reasoning carry the weight; the ESV is used where text is quoted.

Complete lyrics are never stored or displayed. Every constant lives in `src/lib/ai/schemas.ts` and is interpolated into the prompts, so the instruction cannot drift from the enforcement.

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
