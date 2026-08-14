# Proposed scoring — a criterion-referenced rubric

**Status: proposal.** Nothing here is live. `src/lib/scoring.ts` still implements the
baseline-70 model; this document specifies what would replace it, and
`.scratch/rubric-score.ts` scores the existing reviews against it so the two can be
compared before anything changes.

## Why replace the current model

The baseline-70 model has four faults, each confirmed by running it rather than reading it:

| Probe | Result |
|---|---|
| A song with no findings at all | 70 / 70 / 70 → overall **70, "Recommended with caution"** |
| 3 major strengths vs 8 major strengths | **both 100** (raw credit 30 vs 80) |
| 20 severe concerns | floors at **0** — 1,375 points of penalty discarded |
| 2 moderate concerns (52) vs 1 major concern (49) | a major doctrinal error ≈ two moderate imprecisions |

The root fault is that **70 answers two different questions**: "this song is unremarkable but
fine" and "we have no evidence". Because they collapse, a song with two documented moderate
concerns (52) scores *worse than a song nobody has looked at* (70). Careful review is
penalised relative to no review.

The two ceiling tables (`SEVERITY_CEILING`, `OVERALL_CEILING_ON_*`) are the corroborating
evidence: they exist to override the arithmetic when it gives the wrong answer about serious
error. A model that needs its own output overridden is the wrong model.

## The method

A **criterion-referenced rubric**: fixed levels with written descriptors, selected rather
than computed. The standard instrument for structured qualitative judgement — academic
assessment, grant peer review, accreditation, judged competition.

Each of the three criteria is scored **0–10**. Six levels carry written anchors; the odd
levels between them are used when a song sits clearly between two descriptions. This is an
anchored rating scale, and it is the honest way to offer eleven levels: writing eleven
genuinely distinguishable descriptors is not possible, and pretending otherwise is how
rubrics lose their reliability.

```
Overall = (Biblical × 0.60) + (Communal × 0.20) + (Clarity × 0.20)   × 10
          capped at the Biblical level × 10
```

The cap replaces `OVERALL_CEILING_ON_SEVERE` and `OVERALL_CEILING_ON_MAJOR` with the same
conviction stated once: a singable, clear song cannot average its way past bad doctrine.

---

## Criterion 1 — Biblical / Theological (60%)

| Level | Anchor |
|---|---|
| **10** | Teaches a central doctrine with precision and depth. A congregation singing this repeatedly would be catechised by it. Nothing to correct. |
| **8** | Doctrinally substantial and accurate across several claims. Says something real about God, and says it rightly. |
| **6** | Sound, with genuine content, but either thin or carrying a reservation worth naming. Nothing false. |
| **4** | Misleading wording, or a real error about an important doctrine. Singable only with teaching alongside it. |
| **2** | A significant error about something central — the gospel, Christ, God, salvation. Would form a congregation wrongly. |
| **0** | Denies or fundamentally distorts a central Christian doctrine. A false gospel, a false Christ, a false God. |

## Criterion 2 — Communal Worship (20%)

| Level | Anchor |
|---|---|
| **10** | A congregation owns it on first hearing and can carry it unaccompanied. Corporate voice, singable range, form that teaches itself. |
| **8** | Clearly built for a gathered church. Learned quickly, survives without the band, nothing in it fights an ordinary room. |
| **6** | Workable congregationally with a reservation — a demanding key, a sustained first person singular, a form that needs a lead. |
| **4** | A performance piece a congregation can attempt. Built around a climax or an arrangement the room cannot supply. |
| **2** | Effectively unsingable together: range, rhythm or structure defeats an ordinary congregation. |
| **0** | Not a congregational song in any meaningful sense. |

## Criterion 3 — Clarity (20%)

| Level | Anchor |
|---|---|
| **10** | Every line means one thing, and that thing is plain to a newcomer. No image needs unpacking, no term is left to the hearer to fill in. |
| **8** | Clear throughout, with diction that carries weight without obscurity. A hearer knows what they have affirmed. |
| **6** | Mostly clear, with a word or image doing more work than it can bear, or a term left undefined. |
| **4** | A load-bearing ambiguity: something central can be reasonably heard more than one way, and the song does not resolve it. |
| **2** | Persistently unclear. A hearer cannot reliably say what they have just affirmed. |
| **0** | Meaningless or self-contradictory as sung. |

---

## How findings determine the level

Levels are derived from the findings, so the number is reproducible and every step is
auditable. Two quantities are computed and the lower wins:

```
level = min(ceiling, merit)
```

### Ceiling — what the flaws allow

Set by the **single most serious concern**, not by their sum. This is what makes severity
ordinal rather than additive, and it is why no separate ceiling table is needed.

| Worst concern | Ceiling |
|---|---|
| none | 10 |
| Minor | 9 |
| Moderate | 7 |
| Major | 4 |
| Severe | 1 |

Two documented modifiers, applied to that ceiling and clamped to 0–10:

- **−1** when the worst concern is both `CORE` and `recurring` — a central error sung every
  chorus is worse than the same error sung once.
- **+1** when the worst concern is `PERIPHERAL` — a matter of imagery or emphasis should not
  hold a song down like a doctrinal fault.

### Merit — what the substance earns

Set by the **best strength**, then raised for breadth:

| Best strength | Merit |
|---|---|
| none | 5 |
| Notable | 6 |
| Strong | 7 |
| Exceptional | 8 |

- **+1** when there are 3 or more strengths.
- **+1** further when there are 5 or more strengths and at least two are Exceptional.

Merit is capped at 10, so the eleventh strength cannot manufacture a score — but unlike the
current `+30` cap it does not discard information, because merit was never a running total.

### No evidence is not a score

A criterion with **no findings** is **unrated**, and says so. It is excluded from the
weighted average, and the remaining weights are renormalised. A song with no findings in any
criterion is not published.

This is the fix for the reductio: a song with no words scores nothing, because there is
nothing to judge. Under the current model it scores 70 and is "recommended with caution".

---

## Results against the six published reviews

Run with `npx tsx .scratch/rubric-score.ts`. Findings unchanged — only the arithmetic over
them.

| Song | Now | Rubric | Biblical | Communal | Clarity |
|---|---|---|---|---|---|
| God the Uncreated One | 92 | **88** | 9 | 8 | 9 |
| I Stand in Awe | 87 | **84** | 9 | 7 | 8 |
| The Goodness of Jesus | 86 | **82** | 9 | 7 | 7 |
| As the Deer | 79 | **76** | 8 | 7 | 7 |
| Good and Gracious King | 79 | **70** | 7 | 7 | 7 |
| Above All | 65 | **60** | 6 | 7 | 7 |

**The ordering is identical.** That is the main result: the rubric is not producing a
different opinion, it is producing the same opinion on a defensible scale.

**It breaks the 79–79 tie**, and in the right direction. As the Deer's worst theological
concern is Minor, so its ceiling is 9. Good and Gracious King's is Moderate *and* Core — the
missing ground of acceptance — so its ceiling is 7, and no amount of merit lifts it past
that. The old model let four strengths carry it to the same score as a song with no
comparable fault.

**The whole range compresses** (88–60 rather than 92–65), because the top of the scale now
has to be earned by a descriptor rather than reached by accumulation.

### The failing probes, re-run

| Probe | Current model | Rubric |
|---|---|---|
| Song with no findings | 70, "recommended with caution" | **Unrated** |
| 3 vs 8 exceptional strengths | 100 / 100 | **9 / 10** |
| 2 moderate vs 1 major concern | 52 / 49 (wrong order) | **5 / 4** |
| 1 vs 20 severe concerns | 0 / 0 | 0 / 0 |

The last row is unchanged and deliberately so: level 0 means "denies a central Christian
doctrine", and there is no useful distinction between a song that does that and one that
does it repeatedly. Saturation at the bottom is a property of the judgement, not a defect in
the arithmetic — unlike saturation at the top, which was discarding real information.

## What this deliberately gives up

- **Resolution.** Eleven levels per criterion produce far fewer distinct overall scores than
  101. The current 92-vs-87 implies a precision no method here can support; the rubric makes
  that visible rather than hiding it behind arithmetic.
- **Sensitivity to accumulation.** Ten minor imprecisions no longer sum to a major fault.
  That is the intended correction, but it means a song with many small blemishes scores
  closer to a clean one than it does today.
- **Strengths on flawed songs.** Where the ceiling binds, further strengths change nothing.
  This is deliberate — merit cannot buy off doctrine — and should be stated on the page so a
  reader is not left wondering why praise stopped counting.
