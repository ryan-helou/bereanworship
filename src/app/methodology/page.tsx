import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ARTIST_WEIGHTS,
  BASELINE,
  LEVEL_CEILING,
  LEVEL_MERIT,
  MERIT_WITHOUT_STRENGTHS,
  METHODOLOGY_VERSION,
  RUBRIC_MAX_LEVEL,
  SCORE_BANDS,
  SCORING_VERSION,
  SONG_WEIGHTS,
  RANGE_BANDS,
  CONGREGATIONAL_LOW,
  CONGREGATIONAL_HIGH,
  COMFORTABLE_SPAN,
  midiToNote,
} from '@/lib/scoring';

export const metadata: Metadata = {
  title: 'Methodology',
  description:
    'How BereanWorship evaluates worship songs and artists: the biblical foundation, the 60/20/20 scoring formula, severity penalties, source standards, and the limits of the method.',
  alternates: { canonical: '/methodology' },
};

/**
 * The methodology page.
 *
 * Everything here is generated from the same constants the scoring engine
 * uses, so this page cannot drift out of step with the numbers on the site.
 * If the formula changes, this page changes with it.
 */

export default function MethodologyPage() {
  return (
    <>
      <header className="band-dark border-b-4 border-volt-500">
        <div className="container-page py-14 lg:py-20">
          <div className="container-prose">
            <div className="eyebrow">Methodology · v{METHODOLOGY_VERSION}</div>
            <h1 className="text-display mt-5 text-bone-100">How songs are evaluated</h1>
            <p className="mt-7 font-serif text-xl leading-relaxed text-indigo-200">
              Every score on this site is calculated from published findings by a fixed formula. This page documents
              that formula completely, so any number here can be checked.
            </p>
          </div>
        </div>
      </header>

      <div className="band-bone">
        <div className="container-page py-4">
          <div className="container-prose">

        <Section id="foundation" title="The biblical foundation">
          <blockquote className="scripture my-8 text-xl">
            “Now these Jews were more noble than those in Thessalonica; they received the word with all eagerness,
            examining the Scriptures daily to see if these things were so.”
            <span className="mt-2 block not-italic text-sm text-ink-400">Acts 17:11, ESV</span>
          </blockquote>

          <p>
            The Bereans are commended not for scepticism but for care. They received Paul’s teaching eagerly — and
            checked it against Scripture anyway. Eagerness and examination belonged together.
          </p>
          <p>
            BereanWorship applies that principle to worship music. Congregational songs teach. A church that sings a
            line every Sunday for a year has taught its people that line more thoroughly than most sermons will. So the
            words we sing deserve the same examination we would give a sermon — not because worship music is suspect,
            but because it is formative.
          </p>
          <p>
            The question this site exists to answer is a practical one:{' '}
            <strong className="font-semibold text-ink-900">
              can a biblically sound church confidently sing this song together in corporate worship?
            </strong>
          </p>
        </Section>

        <Section id="framework" title="Theological framework">
          <p>
            Reviews are written from a conservative Protestant, broadly Reformed position — the theological world of
            confessional Reformed Baptist and Presbyterian churches. That commitment is stated openly rather than
            presented as neutrality.
          </p>
          <p>
            But a framework is not a licence to treat every difference as error. Claims are weighted by what kind of
            claim they are:
          </p>

          <dl className="my-6 space-y-4">
            {[
              {
                term: 'Biblical essentials',
                detail:
                  'Clearly taught doctrines central to Christianity — the Trinity, the deity and humanity of Christ, His bodily resurrection, salvation by grace through faith, the authority of Scripture. Denial here is treated as severe.',
              },
              {
                term: 'Strong biblical conclusions',
                detail:
                  'Doctrines strongly and plainly supported by Scripture: justification by faith alone, substitutionary atonement, the necessity of repentance. Error here is major.',
              },
              {
                term: 'Historic Christian doctrine',
                detail:
                  'Broadly affirmed across orthodox Christianity — the ascension, the second coming, final judgement. Confusion here is typically moderate.',
              },
              {
                term: 'Reformed distinctives',
                detail:
                  'Important positions within the Reformed tradition — particular redemption, covenant theology, cessationism. A song that does not affirm these is not thereby in error, and is not penalised for it.',
              },
              {
                term: 'Secondary disagreements',
                detail:
                  'Matters on which faithful Christians reasonably differ: eschatological detail, baptism mode, worship style, spiritual gifts, church polity. These are not treated as concerns at all.',
              },
            ].map((item) => (
              <div key={item.term} className="border-l-2 border-line pl-4">
                <dt className="text-[0.9375rem] font-semibold text-ink-900">{item.term}</dt>
                <dd className="mt-1 text-[0.9375rem] leading-relaxed text-ink-600">{item.detail}</dd>
              </div>
            ))}
          </dl>

          <p>
            The aim is to be strict about genuine theological error without declaring every denominational difference
            heretical. A song written by Arminians, Pentecostals, Anglicans or Lutherans is not defective for being so.
          </p>
        </Section>

        <Section id="scoring" title="The 60 / 20 / 20 formula">
          <p>Every song receives three component scores, combined into one:</p>

          <div className="my-8 overflow-x-auto border-2 border-ink-900">
            <table className="w-full text-sm">
              <thead className="bg-indigo-900 text-bone-100">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-bold uppercase tracking-wider">
                    Component
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-bold uppercase tracking-wider">
                    Weight
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                <tr>
                  <td className="px-4 py-3">
                    <span className="font-medium text-ink-900">Biblical / Theological soundness</span>
                    <span className="mt-0.5 block text-ink-500">Doctrine measured against Scripture.</span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tnum">{SONG_WEIGHTS.THEOLOGICAL * 100}%</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">
                    <span className="font-medium text-ink-900">Communal worship suitability</span>
                    <span className="mt-0.5 block text-ink-500">Whether a congregation can actually sing it.</span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tnum">{SONG_WEIGHTS.COMMUNAL * 100}%</td>
                </tr>
                <tr>
                  <td className="px-4 py-3">
                    <span className="font-medium text-ink-900">Clarity</span>
                    <span className="mt-0.5 block text-ink-500">
                      Whether people understand what they are affirming.
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tnum">{SONG_WEIGHTS.CLARITY * 100}%</td>
                </tr>
              </tbody>
            </table>
          </div>

          <pre className="my-8 overflow-x-auto border-2 border-ink-900 bg-indigo-950 p-6 font-mono text-[0.8125rem] leading-relaxed text-surface-100">
            {`Overall = (Theological × ${SONG_WEIGHTS.THEOLOGICAL})
        + (Communal    × ${SONG_WEIGHTS.COMMUNAL})
        + (Clarity     × ${SONG_WEIGHTS.CLARITY})`}
          </pre>

          <p>Rounded to the nearest whole number.</p>
        </Section>

        <Section id="components" title="How a criterion is scored">
          <p>
            Each criterion is placed on a rubric from 0 to{' '}
            <strong className="font-semibold text-ink-900">{RUBRIC_MAX_LEVEL}</strong>. A level is{' '}
            <em>selected</em> by matching the song against a written description, not accumulated from points — so there
            is no starting number to justify and no arithmetic that can run past the ends of the scale.
          </p>

          <pre className="my-8 overflow-x-auto border-2 border-ink-900 bg-indigo-950 p-6 font-mono text-[0.8125rem] leading-relaxed text-surface-100">
            {`level = min(ceiling, merit)

ceiling = what the flaws allow   — set by the single worst concern
merit   = what the substance earns — set by the single best strength`}
          </pre>

          <p>
            Six levels carry written anchors; the odd levels between them are used for a song that sits clearly between
            two descriptions. Eleven genuinely distinguishable descriptions cannot be written, and an anchored scale is
            the honest way to offer that resolution rather than pretending otherwise.
          </p>

          <h3 className="mt-8 text-lg font-semibold text-ink-900">The ceiling — what the worst concern allows</h3>
          <p>
            Severity is treated as ordinal, not additive. Ten minor imprecisions do not add up to a major error, and one
            major error is not cancelled by everything else being fine — so the ceiling is set by the most serious
            concern alone, and further concerns do not lower it.
          </p>
          <ScaleTable
            rows={[
              { label: 'No concerns', value: `${RUBRIC_MAX_LEVEL}`, note: 'Nothing found to hold the criterion down.' },
              { label: 'Minor', value: `${LEVEL_CEILING.MINOR}`, note: 'Imprecision, avoidable vagueness, an imperfect metaphor.' },
              { label: 'Moderate', value: `${LEVEL_CEILING.MODERATE}`, note: 'Misleading wording or repeated ambiguity about something important.' },
              { label: 'Major', value: `${LEVEL_CEILING.MAJOR}`, note: 'Significant error about salvation, grace, sin, Christ or God.' },
              { label: 'Severe', value: `${LEVEL_CEILING.SEVERE}`, note: 'Denial or fundamental distortion of a central Christian doctrine.' },
            ]}
          />
          <p>
            Two adjustments, each of one level: the ceiling drops when the worst concern is both about a{' '}
            <strong className="font-semibold text-ink-900">core</strong> doctrine and{' '}
            <strong className="font-semibold text-ink-900">recurring</strong> — a central error sung every chorus is
            worse than the same error sung once — and rises when it is{' '}
            <strong className="font-semibold text-ink-900">peripheral</strong>, because a matter of imagery should not
            hold a song down like a doctrinal fault.
          </p>

          <h3 className="mt-8 text-lg font-semibold text-ink-900">Merit — what the substance earns</h3>
          <ScaleTable
            rows={[
              { label: 'No strengths', value: `${MERIT_WITHOUT_STRENGTHS}`, note: 'Nothing wrong, but nothing taught either.' },
              { label: 'Notable', value: `${LEVEL_MERIT.MINOR}`, note: 'A genuine but modest positive.' },
              { label: 'Strong', value: `${LEVEL_MERIT.MODERATE}`, note: 'A substantial doctrinal strength.' },
              { label: 'Exceptional', value: `${LEVEL_MERIT.MAJOR}`, note: 'An outstanding strength on something central.' },
            ]}
          />
          <p>
            Merit rises by one level for a criterion carrying three or more strengths, and by one more for five or more
            including two exceptional ones. Breadth counts, but with diminishing returns rather than a cliff.
          </p>
        </Section>

        <Section id="ceilings" title="Why one serious error is decisive">
          <p>
            Because the level is the lower of ceiling and merit, no accumulation of praise can lift a song past its
            worst problem. Where the ceiling binds, further strengths change nothing — and the song page says so
            explicitly rather than leaving a reader to wonder why the praise stopped counting.
          </p>
          <p>
            The same rule governs the total: <strong className="font-semibold text-ink-900">biblical soundness caps
            the overall score</strong>. A singable, clear song cannot average its way past what it teaches.
          </p>
        </Section>

        <Section id="unrated" title="When there is nothing to judge">
          <p>
            A criterion with no findings recorded against it is{' '}
            <strong className="font-semibold text-ink-900">unrated</strong>, not scored. It is excluded from the
            weighted average and the remaining weights are renormalised; a song with nothing recorded in any criterion
            is not published at all.
          </p>
          <p>
            This matters more than it sounds. Absence of evidence and evidence of adequacy are different states, and a
            method that gives them the same number will hand a passing grade to a song nobody has examined.
          </p>
        </Section>

        <Section id="communal" title="Congregational suitability">
          <p>
            This component asks a practical question: on a Sunday morning, in an ordinary church with ordinary voices,
            can the gathered people actually sing this?
          </p>
          <p>
            It weighs vocal range, melodic difficulty, tempo, rhythmic complexity, structural clarity, and whether the
            song makes sense sung by a body of people rather than performed at them. A song written for a professional
            vocalist — wide range, sustained belted notes, elaborate melisma — scores lower here even when its theology
            is excellent. That is a fact about the arrangement, and it is kept out of the theological reckoning.
          </p>

          <h3 className="mt-8 text-lg font-semibold text-ink-900">Repetition is not a fault</h3>
          <p>
            Psalm 136 repeats one line twenty-six times. Revelation 4 records ceaseless repetition in heaven. Repetition
            drives truth home and lets a congregation sing without staring at a page. Only two kinds are penalised:
            repetition well past the point of contributing anything, and repetition of language so thin that repeating
            it is all there is.
          </p>

          <h3 className="mt-8 text-lg font-semibold text-ink-900">Emotion is not a fault</h3>
          <p>
            Scripture commands joy, sorrow, awe and longing. Biblical worship is deeply emotional. Emotion is flagged
            only when a song appears engineered to produce feeling in place of truth — escalating intensity carrying no
            content, or a structure built for an emotional climax rather than for congregational singing.
          </p>
        </Section>

        <Section id="clarity" title="Clarity">
          <p>
            Clarity asks whether people know what they are affirming. It examines theological and linguistic clarity,
            ambiguity that admits both a sound and an unsound reading, drifting pronouns, and language that sounds
            devotional while asserting nothing.
          </p>
          <p>
            <strong className="font-semibold text-ink-900">Poetry is not penalised.</strong> Scripture is saturated with
            metaphor, and a striking image often communicates better than plain statement. A vivid metaphor that lands
            is recorded as a strength. Nor is mystery treated as vagueness: a song may rightly describe the incarnation
            rather than explain it.
          </p>
        </Section>


        <Section id="range" title="Congregational range">
          <p>
            Every reviewed song can also carry a <strong className="font-semibold text-ink-900">range score</strong> —
            how hard it is for an ordinary congregation to sing, judged on the melody’s actual pitches.
            Higher is easier, matching every other number here, and the difficulty label is always shown
            beside it.
          </p>

          <div className="my-8 border-2 border-ink-900 bg-volt-500 p-7 text-white [&_h3]:text-white [&_p]:text-white">
            <h3 className="text-base font-bold">It is not part of song validity</h3>
            <p className="mt-2 text-[0.9375rem] leading-relaxed">
              Range is a property of the key an arrangement is published in, not of the song. Transpose down a
              tone and the same song becomes singable. Folding that into a permanent verdict would be a category
              error — and would mean a doctrinally excellent hymn scored badly for a decision a worship leader
              can simply make differently. So it sits alongside the score, never inside it.
            </p>
          </div>

          <p>
            The score starts at 100 and deducts from the measured pitches. The comfortable congregational band is
            taken as <strong className="font-semibold text-ink-900">{midiToNote(CONGREGATIONAL_LOW)} to{' '}
            {midiToNote(CONGREGATIONAL_HIGH)}</strong>, with a span of about {COMFORTABLE_SPAN} semitones — an
            octave — costing nothing.
          </p>

          <ul className="my-5 space-y-2.5 pl-5">
            <li className="list-disc text-[0.9375rem] leading-relaxed text-ink-700">
              Each semitone wider than an octave: <strong className="font-semibold">−3</strong>.
            </li>
            <li className="list-disc text-[0.9375rem] leading-relaxed text-ink-700">
              Each semitone above {midiToNote(CONGREGATIONAL_HIGH)}: <strong className="font-semibold">−6</strong>{' '}
              — the heaviest penalty, because this is where a congregation stops singing rather than strains.
            </li>
            <li className="list-disc text-[0.9375rem] leading-relaxed text-ink-700">
              Each semitone below {midiToNote(CONGREGATIONAL_LOW)}: <strong className="font-semibold">−4</strong>{' '}
              — less costly, since people drop quiet rather than silent.
            </li>
            <li className="list-disc text-[0.9375rem] leading-relaxed text-ink-700">
              Each semitone the melody <em>sits</em> above C5: <strong className="font-semibold">−4</strong> —
              sustained height is harder than touching a high note once.
            </li>
          </ul>

          <div className="my-8 overflow-x-auto border-2 border-ink-900">
            <table className="w-full text-sm">
              <thead className="bg-indigo-900 text-bone-100">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left font-bold uppercase tracking-wider">Range</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-bold uppercase tracking-wider">Difficulty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {RANGE_BANDS.map((band) => (
                  <tr key={band.label}>
                    <td className="px-4 py-2.5 tnum text-ink-600">
                      {band.min}–{band.max}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-ink-900">{band.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="mt-8 text-lg font-semibold text-ink-900">Measured, never estimated</h3>
          <p>
            A range is only published when the pitches have been read off a chart, lead sheet or score. There is
            no fallback estimate from a recording or a key signature, because a worship leader would act on the
            number — and a guessed range is worse than an honest blank. Songs without verified notation show
            “Not measured” and say why.
          </p>
        </Section>

        <Section id="artist" title="Artist evaluation — and why it is separate">
          <p>
            Artists, groups and ministries receive their own rating, on their own scale, from their own research. It is
            calculated with four components:
          </p>

          <div className="my-8 overflow-x-auto border-2 border-ink-900">
            <table className="w-full text-sm">
              <thead className="bg-indigo-900 text-bone-100">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-bold uppercase tracking-wider">
                    Component
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-bold uppercase tracking-wider">
                    Weight
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                <tr>
                  <td className="px-4 py-3 font-medium text-ink-900">Doctrinal soundness</td>
                  <td className="px-4 py-3 text-right font-semibold tnum">{ARTIST_WEIGHTS.DOCTRINE * 100}%</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-ink-900">Public teaching</td>
                  <td className="px-4 py-3 text-right font-semibold tnum">{ARTIST_WEIGHTS.PUBLIC_TEACHING * 100}%</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-ink-900">Affiliations</td>
                  <td className="px-4 py-3 text-right font-semibold tnum">{ARTIST_WEIGHTS.AFFILIATIONS * 100}%</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-ink-900">Ministry context</td>
                  <td className="px-4 py-3 text-right font-semibold tnum">{ARTIST_WEIGHTS.MINISTRY_CONTEXT * 100}%</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="my-8 border-2 border-ink-900 bg-volt-500 p-7 text-white [&_h3]:text-white [&_p]:text-white">
            <h3 className="text-base font-semibold text-volt-900">The two scores never touch</h3>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-volt-900">
              An artist’s score contributes nothing — positively or negatively — to any song’s score. No points are
              deducted from a song because its artist scores poorly, and none are added because its artist scores well.
              The analysis stages that produce a song’s theological score are not even told who the artist is.
            </p>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-volt-900">
              This is deliberate. A theologically troubled ministry can write a doctrinally excellent song, and a sound
              ministry can write a careless one. Collapsing the two questions into one number would answer neither.
            </p>
          </div>

          <p>
            <strong className="font-semibold text-ink-900">Artist scores are still built the older way</strong>: each
            component starts at a baseline of {BASELINE} and moves up on credit and down on penalties, with hard
            ceilings imposed by severity. Song scoring moved to the rubric above because that model gave a passing
            number to anything it had no evidence about; artist research has the same weakness and has not yet been
            rewritten. Read an artist score as the rougher instrument of the two until it has been.
          </p>

          <h3 className="mt-8 text-lg font-semibold text-ink-900">What counts, and what does not</h3>
          <p>
            Concerns are genuine doctrinal error: a distorted gospel, prosperity teaching, denial of essentials,
            seriously problematic Christology, teaching that undermines the sufficiency of Scripture or of Christ’s
            work — along with formal affiliation with movements that teach these things.
          </p>
          <p>
            The following are <strong className="font-semibold text-ink-900">not</strong> treated as error: being
            charismatic or continuationist, being Arminian, being non-denominational, being a large church, using
            contemporary music, being commercially successful, or having critics. Treating any of those as theological
            error would make the evaluation worthless.
          </p>
          <p>
            Personal misconduct is out of scope entirely. This site evaluates theology, not private lives.
          </p>
        </Section>

        <Section id="sources" title="Sources and evidence standards">
          <p>Every meaningful research claim is tied to a source, and sources are ranked:</p>

          <ol className="my-5 space-y-3 pl-5">
            <li className="list-decimal text-[0.9375rem] leading-relaxed text-ink-600">
              <strong className="font-semibold text-ink-900">Tier 1 — Primary.</strong> Official statements of faith,
              official sites, direct interviews, published sermons and books.
            </li>
            <li className="list-decimal text-[0.9375rem] leading-relaxed text-ink-600">
              <strong className="font-semibold text-ink-900">Tier 2 — Highly reputable secondary.</strong> Established
              theological organisations, academic work, respected publications.
            </li>
            <li className="list-decimal text-[0.9375rem] leading-relaxed text-ink-600">
              <strong className="font-semibold text-ink-900">Tier 3 — General journalism.</strong>
            </li>
            <li className="list-decimal text-[0.9375rem] leading-relaxed text-ink-600">
              <strong className="font-semibold text-ink-900">Tier 4 — Blogs, forums, social media.</strong> These may
              corroborate or provide leads. They can never independently establish a serious accusation: a finding
              resting only on tier-4 evidence is capped at a moderate penalty and published as contested.
            </li>
          </ol>

          <h3 className="mt-8 text-lg font-semibold text-ink-900">Claims are graded</h3>
          <p>Each artist finding carries a visible evidence grade, so readers can see how well established it is:</p>
          <p className="mt-3">
            <em>Direct statement</em> (they said it themselves) · <em>Documented fact</em> · <em>Credible reporting</em>{' '}
            · <em>Allegation</em> (claimed, not established) · <em>Interpretation</em> (a reading of ambiguous material)
            · <em>Theological inference</em> (an implication drawn from their position).
          </p>

          <h3 className="mt-8 text-lg font-semibold text-ink-900">When sources disagree</h3>
          <p>
            Where credible sources genuinely conflict, the disagreement is recorded rather than resolved by picking a
            side. The contested claim is not treated as established fact, and the artist page says so plainly.
            Conservative conclusions are required where evidence is inconclusive — an unfair verdict costs more than an
            incomplete one.
          </p>
        </Section>

        <Section id="bands" title="Score bands">
          <p>These labels are descriptive shorthand, not authoritative verdicts.</p>

          <div className="my-8 overflow-x-auto border-2 border-ink-900">
            <table className="w-full text-sm">
              <thead className="bg-indigo-900 text-bone-100">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left font-bold uppercase tracking-wider">
                    Range
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-left font-bold uppercase tracking-wider">
                    Label
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {SCORE_BANDS.map((band) => (
                  <tr key={band.label}>
                    <td className="px-4 py-2.5 tnum text-ink-600">
                      {band.min}–{band.max}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-ink-900">{band.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="mt-8 text-lg font-semibold text-ink-900">Recommendations</h3>
          <ul className="my-4 space-y-2.5 pl-5">
            <li className="list-disc text-[0.9375rem] leading-relaxed text-ink-600">
              <strong className="font-semibold text-ink-900">Recommended</strong> — generally suitable for corporate
              worship.
            </li>
            <li className="list-disc text-[0.9375rem] leading-relaxed text-ink-600">
              <strong className="font-semibold text-ink-900">Recommended with caution</strong> — meaningful concerns
              exist and should be considered. Applied when the overall or theological score falls below 80, or any major
              concern is present.
            </li>
            <li className="list-disc text-[0.9375rem] leading-relaxed text-ink-600">
              <strong className="font-semibold text-ink-900">Not recommended</strong> — significant theological or
              congregational concerns. Applied when the overall or theological score falls below 60, or any severe
              concern is present.
            </li>
          </ul>
        </Section>

        <Section id="process" title="How a review is produced">
          <p>
            Reviews run through a multi-stage pipeline rather than a single request. Each stage has one job and returns
            structured, validated findings:
          </p>
          <ol className="my-5 space-y-2 pl-5">
            {[
              'Identification — establish exactly which song and artist is meant.',
              'Claim extraction — inventory, neutrally, what the song actually asserts.',
              'Theological analysis — assess biblical soundness. The artist is withheld at this stage.',
              'Congregational analysis — assess singability and corporate fit.',
              'Clarity analysis — assess whether meaning survives being sung.',
              'Synthesis — write the summary, tag themes, gather Scripture.',
              'Scoring — apply the published formula to the findings.',
            ].map((step) => (
              <li key={step} className="list-decimal text-[0.9375rem] leading-relaxed text-ink-600">
                {step}
              </li>
            ))}
          </ol>
          <p>
            Crucially, <strong className="font-semibold text-ink-900">no stage produces a score.</strong> Scores are
            computed in code from the findings, by the formula above. That is what makes them reproducible: the same
            findings always produce the same number.
          </p>
          <p>
            If a song’s lyrics cannot be established reliably, no review is produced at all. An analysis of guessed
            lyrics would be worse than no analysis.
          </p>

          <h3 className="mt-8 text-lg font-semibold text-ink-900">Copyright</h3>
          <p>
            Complete lyrics are never stored or displayed. Any single quotation is limited to ten words, and a whole
            review may quote in no more than eight findings totalling sixty words of lyric — a limit on the review, not
            just on each quote, because many short quotations still add up to a copy of the song. Quotation is reserved
            for findings where the exact wording is the point at issue; every other finding names the verse or chorus it
            comes from instead, so it can still be checked against your own copy. Scripture quotations are kept brief
            and are from the ESV.
          </p>

          <h3 className="mt-8 text-lg font-semibold text-ink-900">Versioning</h3>
          <p>
            Reviews carry a version (currently scoring v{SCORING_VERSION}, methodology v{METHODOLOGY_VERSION}) and are
            never silently overwritten. A re-review archives the previous version, which stays visible on the song’s
            page.
          </p>
        </Section>

        <Section id="limitations" title="Limitations">
          <div className="border-l-8 border-volt-500 bg-volt-50 p-7">
            <p className="text-[0.9375rem] font-semibold text-ink-900">
              BereanWorship is an analytical resource. Its ratings are not infallible.
            </p>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-600">
              Scripture is the ultimate authority. These ratings represent the methodology and theological framework
              described on this page, applied by a research pipeline that can be wrong. They are a starting point for
              discernment, not a substitute for it.
            </p>
          </div>

          <ul className="mt-6 space-y-3 pl-5">
            <li className="list-disc text-[0.9375rem] leading-relaxed text-ink-600">
              <strong className="font-semibold text-ink-900">A framework is not neutrality.</strong> A conservative
              Reformed reading is stated openly. Readers from other traditions should weigh the reasoning, not just the
              number.
            </li>
            <li className="list-disc text-[0.9375rem] leading-relaxed text-ink-600">
              <strong className="font-semibold text-ink-900">Numbers compress.</strong> An 82 and an 84 are not
              meaningfully different. The findings carry more information than the score does — read them.
            </li>
            <li className="list-disc text-[0.9375rem] leading-relaxed text-ink-600">
              <strong className="font-semibold text-ink-900">Context is not captured.</strong> A song’s suitability
              depends on a congregation, an arrangement and a moment in a service. No database knows your church.
            </li>
            <li className="list-disc text-[0.9375rem] leading-relaxed text-ink-600">
              <strong className="font-semibold text-ink-900">Research has a horizon.</strong> Artist findings reflect
              what was publicly documented when the research ran. Ministries change; research goes stale.
            </li>
            <li className="list-disc text-[0.9375rem] leading-relaxed text-ink-600">
              <strong className="font-semibold text-ink-900">Musical judgement is limited.</strong> Assessments of range
              and singability are based on known recordings and are less certain than textual analysis.
            </li>
          </ul>

          <p className="mt-6">
            Test what you sing — including what you read here.{' '}
            <Link href="/songs" className="font-bold text-volt-600 underline underline-offset-4">
              Browse the database
            </Link>{' '}
            and check the reasoning for yourself.
          </p>
        </Section>
          </div>
        </div>
      </div>
    </>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-16 scroll-mt-28 border-t-4 border-ink-900 pt-10">
      <h2 className="text-display-sm">{title}</h2>
      <div className="mt-6 space-y-5 font-serif text-[1.0625rem] leading-relaxed text-ink-700 [&>p]:leading-[1.7]">
        {children}
      </div>
    </section>
  );
}

function ScaleTable({ rows }: { rows: Array<{ label: string; value: string; note: string }> }) {
  return (
    <div className="my-5 overflow-x-auto border-2 border-ink-900">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="w-28 px-4 py-3 font-medium text-ink-900">{row.label}</td>
              <td className="w-16 px-4 py-3 text-right font-semibold tnum text-ink-700">{row.value}</td>
              <td className="px-4 py-3 text-ink-600">{row.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
