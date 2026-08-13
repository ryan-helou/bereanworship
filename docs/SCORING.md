# Scoring methodology

Version: scoring `1.0.0`, methodology `1.0.0`.

Implemented in `src/lib/scoring.ts`. The public `/methodology` page is generated from the same constants, so the site's published explanation cannot drift from the code that produces its numbers.

## The principle

No model ever emits a score. The pipeline produces **findings** — each with a claim, its evidence, a severity, and how central the affected doctrine is — and this module turns findings into numbers deterministically. The same findings always produce the same score.

That separation is the whole design. It is what lets any number on the site be traced to the finding that produced it, and what makes a published review reproducible rather than an opinion with a number attached.

## Song validity

```
Overall = (Theological × 0.60) + (Communal × 0.20) + (Clarity × 0.20)
```

Rounded to the nearest whole number.

### Building a component

```
component = 70 + strength credit − penalties        (clamped 0–100)
```

**70 is the baseline**: "nothing wrong, nothing remarkable". A doctrinally inoffensive but thin song lands in the low 70s, which is the right answer. Substance is earned upward; error drags downward hard.

**Strength credit is capped at +30.** A component reaches 100 only through genuinely outstanding content, and no amount of accumulated praise can bury a serious problem.

| Strength magnitude | Credit | Meaning |
|---|---|---|
| Notable | +3 | A genuine but modest positive |
| Strong | +6 | A substantial doctrinal strength |
| Exceptional | +10 | An outstanding strength on something central |

| Concern severity | Base penalty | Meaning |
|---|---|---|
| Minor | −4 | Imprecision, avoidable vagueness, an imperfect metaphor |
| Moderate | −12 | Misleading wording, repeated ambiguity, persistent anthropocentrism |
| Major | −28 | Significant error about salvation, grace, sin, Christ or God |
| Severe | −55 | Denial or fundamental distortion of a central Christian doctrine |

### Two multipliers on concerns

**Centrality** — how central the affected doctrine is:

| | Multiplier |
|---|---|
| Core (gospel, God, Christ, salvation) | ×1.0 |
| Important | ×0.75 |
| Peripheral (imagery, application, emphasis) | ×0.5 |

**Recurrence** — ×1.25 when the problem sits in the chorus or refrain. A congregation sings a chorus many times; an error there lands harder than the same error in a single verse.

```
penalty = base × centrality × (recurring ? 1.25 : 1)
```

### Ceilings: why one serious error is decisive

A weighted average is too forgiving on its own. A song can be 95% excellent, teach one thing that is plainly false, and still average out to an 88 — a failure of the method, not a fair result.

So severity also imposes hard ceilings:

| Worst concern | Component ceiling | Overall ceiling (if theological) |
|---|---|---|
| Severe | 25 | 35 |
| Major | 60 | 70 |

A beautiful melody and a comfortable range cannot rescue false teaching. That is the intended behaviour, not a side effect.

Note the asymmetry: only *theological* severity constrains the overall score. A song can be nearly unsingable without that being a doctrinal verdict.

### Recommendation

| Result | Condition |
|---|---|
| **Not recommended** | Any severe concern, or overall < 60, or theological < 60 |
| **Recommended with caution** | Any major concern, or overall < 80, or theological < 80 |
| **Recommended** | Everything else |

## Artist validity

Computed on its own scale, from its own research. **It contributes nothing to any song score.**

```
Overall = (Doctrine × 0.45) + (Public teaching × 0.25) + (Affiliations × 0.20) + (Ministry context × 0.10)
```

Same baseline, same credit and penalty tables, same ceilings — with one addition.

### The source-quality cap

§20 of the brief: low-quality sources must not independently establish serious accusations. A concern is capped when it rests only on tier-4 evidence, has no source at all, or is graded merely as an *allegation* or an *interpretation*:

- its penalty is computed as **moderate** regardless of the stated severity;
- it **cannot impose a score ceiling**;
- it is still published at its stated severity, flagged `contested`, with a visible note explaining why its weight was reduced.

Both halves matter. An early version capped the penalty but left the ceiling keyed on the stated severity, so an uncorroborated blog allegation still slammed the doctrine component to 25 and the overall score to 35 — defeating the entire point. There is a regression test for exactly this.

## Score bands

Descriptive shorthand, not authoritative verdicts.

| Range | Label |
|---|---|
| 90–100 | Excellent |
| 80–89 | Strong |
| 70–79 | Generally Sound |
| 60–69 | Mixed / Caution |
| 40–59 | Significant Concerns |
| 20–39 | Poor |
| 0–19 | Severely Unsound |

## Worked examples

### A strong hymn

Four exceptional theological strengths, one minor peripheral concern; one moderate communal strength; two moderate clarity strengths, one moderate peripheral clarity concern.

```
Theological : 70 + 30 (capped from 40) − (4 × 0.5)          = 98
Communal    : 70 + 6                                        = 76
Clarity     : 70 + 12 − (12 × 0.5)                          = 76
Overall     : 98×0.60 + 76×0.20 + 76×0.20                   = 89  → Strong, Recommended
```

### Excellent everywhere, one severe error

Twelve exceptional strengths spread across all three components, plus one severe core theological concern.

```
Theological : 70 + 30 − 55 = 45,  then ceiling 25            = 25
Communal    : 70 + 30                                        = 100
Clarity     : 70 + 30                                        = 100
Weighted    : 25×0.60 + 100×0.20 + 100×0.20                  = 55
Overall     : min(55, 35)                                    = 35  → Not recommended
```

Without the ceilings the same song would score 79 and read as "generally sound". That gap is the methodology doing its job.

### A contested accusation

One severe doctrinal concern, evidenced only by an anonymous blog (tier 4, graded *allegation*).

```
Penalty     : moderate, not severe                           = −12
Ceiling     : not applied (capped findings cannot impose one)
Doctrine    : 70 − 12                                        = 58
Overall     : 58×0.45 + 70×0.25 + 70×0.20 + 70×0.10          = 65
```

Published as a severe concern, visibly marked contested, and scored as though it were moderate.

## Limits of the numbers

- **An 82 and an 84 are not meaningfully different.** The findings carry far more information than the score does.
- **A framework is not neutrality.** A conservative Reformed reading is stated openly on `/methodology`; readers from other traditions should weigh the reasoning, not just the number.
- **Context is not captured.** Suitability depends on a congregation, an arrangement and a moment in a service. No database knows your church.
- **Musical judgement is the weakest component.** Assessments of range and singability rest on known recordings and are less certain than textual analysis.
