# Rethinking the score — measurements and prior art

**Status: research, no decision taken.** The rubric shipped in `2.0.0` fixed the baseline-70
model's four faults. This document asks a different question: does the scale it produces
actually carry information?

## What the catalogue actually shows

Measured across all thirteen published reviews (`.scratch/distribution.ts`):

| Criterion | Levels used | Distribution | Ceiling bound |
|---|---|---|---|
| Biblical / Theological | **4 of 11** | 9:5 · 8:2 · 7:5 · 6:1 | 8 of 13 |
| Communal Worship | **2 of 11** | 8:5 · 7:8 | 0 of 13 |
| Clarity | **3 of 11** | 9:1 · 8:3 · 7:9 | 0 of 13 |

Overall scores span **60–88 — 28% of the nominal 0–100 scale** — across 8 distinct values,
with five of thirteen songs at exactly 70.

The cause is upstream of the arithmetic. Across all 39 criterion-judgements, the worst
concern was **MINOR 23 times and MODERATE 15 times. MAJOR and SEVERE were never used.**
The ceiling therefore has two live values (9 and 7), and merit resolves to 7 or 8 for almost
every criterion. An eleven-level scale is reporting what is really a two-state judgement.

**This is the finding that matters: you cannot get resolution downstream of a judgement that
only has two states.** Widening or rescaling the arithmetic cannot add information the
severity grading never captured. Any real fix has to add discrimination at the point of
judgement.

Communal Worship is the sharpest case. It uses two levels, is never ceiling-bound, and
carries 20% of the weight — so it currently moves the overall score almost not at all while
still costing a reviewer the effort of grading it.

## What established practice says

### Scale granularity is capped by human reliability

Assessment research converges on **5–7 response categories**, with reliability, validity and
discriminating power improving up to roughly seven and flattening after. Green and Rao found
information retrieval maximised at six or seven categories; recent work puts the
diminishing-returns breakpoint at seven to eight. Eleven levels was never supported, and the
catalogue confirms it empirically — four used at best.

### The compression is the wine scale's failure, exactly

Parker's 100-point scale intended 70–79 for average wines and 90+ for outstanding ones. In
practice nothing below 85 is published, and the meaningful action happens in a ten-point band
from about 87 to 97. A nominally 100-point instrument became a ten-point one, and readers
learned to interpret it accordingly.

BereanWorship is at the same place with a shorter history: 28% of the scale, one cluster at
70, and a top end that is already crowded (88 / 86 / 86 / 84 / 82).

### The ceiling has a proper name, and a known cost

The rubric is a **non-compensatory** model with a **veto threshold** — vocabulary from
multi-criteria decision analysis, where outranking methods (ELECTRE, PROMETHEE) let
unacceptable performance on one criterion block a favourable overall result regardless of
strengths elsewhere. That is exactly the intended behaviour for doctrine, and it is correct
here.

The known cost is precisely what the catalogue shows: when the veto binds often, it dominates
the output and compresses everything else. Non-compensatory models trade resolution for
protection. Worth keeping — worth knowing the price.

### Humans compare better than they score

Thurstone's law of comparative judgement holds that people are markedly more reliable judging
"is A better than B" than assigning an absolute value to A alone. Adaptive comparative
judgement reports rank-order reliability around 0.95–0.97, and assessors find it less
constraining than rubric marking. The cost is volume: reliable rankings need many pairwise
comparisons.

### What comparable evaluators do

**The Berean Test** — the closest published analogue — scores four criteria on 0–10, weighted
**40 / 20 / 20 / 20**, rounds to the nearest 0.5, and then publishes the result as **three
colour bands** (red 0–5.5, purple 6–7.5, green 8–10). Fine-grained internally, coarse where a
decision is actually being made. Two of its criteria have no equivalent here and are sharper
than what they would replace:

- *How would an outsider interpret this song?* — a concrete test, where "clarity" is abstract.
- *What does this song glorify?* — the anthropocentrism question, which BereanWorship
  currently handles ad hoc inside the theological criterion.

**Bob Kauflin** publishes no scoring system at all, deliberately, and argues for a
**likelihood test**: ask whether a problematic reading is *likely*, not merely *possible*.
That distinction is missing from this rubric and it is load-bearing — it is the exact
judgement that set What a Beautiful Name's grade, made on instinct rather than by rule.

## Options

**A — Publish bands, keep the number internal.** Three to five verdict bands, with the
level table shown as evidence. Honest about resolution; removes the false precision of 88
against 86. Cost: the site's design is built around a large numeral.

**B — Add discrimination where the information is.** Keep the scale, sharpen the inputs. Two
candidate dimensions a reviewer can judge reliably, and which the current schema cannot
express:
- **Extent** — does the problem affect a phrase, a section, or the whole song?
- **Likelihood** — is the bad reading likely, or only possible? (Kauflin's test.)

Either multiplies the live states from two to roughly eight, at the point where the
information actually enters the system.

**C — Comparative judgement as a calibration check.** Rank the catalogue pairwise once, then
compare that ordering against the rubric's and adjust anchors where they disagree. Research
-backed and high-reliability, but it needs a human and many comparisons; suited to occasional
calibration rather than routine review.

**D — Revisit the criteria and weights.** Communal Worship earns 20% of the weight while
using two levels. Either sharpen it — the outsider test is a better question than the current
one — or reweight. Worth considering "what does this song glorify" as a criterion in its own
right.

## Recommendation

**B first, then A.** B attacks the root cause: the scale is not the problem, the two-state
severity judgement feeding it is. A stops the published number from claiming a precision the
method cannot support, which is the wine scale's mistake and is cheaper to avoid now than
after another fifty reviews.

C is worth doing once as a check on whether the rubric's ordering matches considered
judgement. D should wait until B is in, because sharpening the criteria will change the
distribution and it is better to measure that once.
