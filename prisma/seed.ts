/**
 * Seed script.
 *
 * Two distinct jobs:
 *
 *   1. REFERENCE DATA (always seeded, including production): the theme
 *      vocabulary. The review pipeline can only tag themes that exist.
 *
 *   2. SAMPLE DATA (only with --sample or SEED_SAMPLE=true): a small
 *      development dataset so the UI has something to render.
 *
 * The sample reviews are written by hand, not produced by the research
 * pipeline, and they are marked as such: every sample record carries the
 * review version "sample-v1.0", which the UI renders as a visible "Sample
 * data" badge. Nothing here should be mistaken for real research.
 *
 * The public-domain hymns below are described accurately, but the *scores*
 * are illustrative — they exist to exercise the interface, not to publish a
 * verdict. The low-scoring entry is explicitly fictional so that the low end
 * of the scale can be demonstrated without levelling an invented accusation
 * at a real artist or ministry.
 */

try {
  process.loadEnvFile();
} catch {
  // Production injects the environment directly.
}

import { PrismaClient, type Centrality, type ScoreComponent, type Severity } from '@prisma/client';
import { normalizeArtist, normalizeTitle, slugify, songSlug } from '../src/lib/normalize';
import { scoreArtist, scoreSong, songFindingImpact, artistFindingImpact } from '../src/lib/scoring';
import { THEME_VOCABULARY } from '../src/lib/ai/schemas';

const prisma = new PrismaClient();

const SAMPLE_VERSION = 'sample-v1.0';
const wantsSample = process.argv.includes('--sample') || process.env.SEED_SAMPLE === 'true';

const THEME_DESCRIPTIONS: Record<string, string> = {
  God: 'The character, nature and works of God.',
  Trinity: 'Father, Son and Holy Spirit as one God in three persons.',
  Christ: 'The person and work of Jesus Christ.',
  Cross: 'The crucifixion and its meaning.',
  Resurrection: 'Christ risen, and the hope that follows from it.',
  Grace: 'Unmerited favour toward sinners.',
  Salvation: 'Rescue from sin and its consequences.',
  Sin: 'Human rebellion and its reality.',
  Repentance: 'Turning from sin toward God.',
  Faith: 'Trust in God and in His promises.',
  Holiness: 'God set apart, and His people set apart.',
  Worship: 'The response of the creature to the Creator.',
  Prayer: 'Address to God in dependence.',
  Suffering: 'Affliction and God’s presence within it.',
  Hope: 'Confident expectation grounded in God’s promises.',
  Heaven: 'The life to come.',
  Mission: 'The sending of the church into the world.',
  Church: 'The gathered people of God.',
  Thanksgiving: 'Gratitude expressed to God.',
  Creation: 'God as maker and sustainer of all things.',
  Scripture: 'The written Word of God.',
  Sovereignty: 'God’s rule over all things.',
  Providence: 'God’s ordering of events toward His purposes.',
  Assurance: 'Confidence in salvation.',
  Lament: 'Honest grief brought before God.',
  Advent: 'The coming of Christ, first and second.',
  Communion: 'The Lord’s Supper.',
  Baptism: 'The sign of union with Christ.',
};

async function seedThemes() {
  console.log('Seeding themes…');
  for (const [index, name] of THEME_VOCABULARY.entries()) {
    await prisma.theme.upsert({
      where: { name },
      create: {
        name,
        slug: slugify(name),
        description: THEME_DESCRIPTIONS[name] ?? null,
        ordering: index,
      },
      update: { description: THEME_DESCRIPTIONS[name] ?? null, ordering: index },
    });
  }
  console.log(`  ${THEME_VOCABULARY.length} themes ready.`);
}

// ---------------------------------------------------------------------------
// Sample data definitions
// ---------------------------------------------------------------------------

interface SampleFinding {
  type: 'STRENGTH' | 'CONCERN';
  component: ScoreComponent;
  severity: Severity;
  centrality?: Centrality;
  recurring?: boolean;
  category: string;
  title: string;
  explanation: string;
  scriptureReference?: string;
  scriptureRationale?: string;
}

interface SampleSong {
  title: string;
  album?: string;
  releaseYear?: number;
  genre: string;
  themes: string[];
  summary: string;
  findings: SampleFinding[];
  scriptures: Array<{ reference: string; relevance: string }>;
}

interface SampleArtist {
  name: string;
  type: 'INDIVIDUAL' | 'GROUP' | 'MINISTRY' | 'CHURCH' | 'COLLECTIVE' | 'UNKNOWN';
  country?: string;
  bio: string;
  summary: string;
  findings: Array<{
    type: 'STRENGTH' | 'CONCERN';
    component: 'DOCTRINE' | 'AFFILIATIONS' | 'PUBLIC_TEACHING' | 'MINISTRY_CONTEXT';
    severity: Severity;
    category: string;
    title: string;
    explanation: string;
    evidenceGrade:
      | 'DIRECT_STATEMENT'
      | 'DOCUMENTED_FACT'
      | 'CREDIBLE_REPORTING'
      | 'ALLEGATION'
      | 'INTERPRETATION'
      | 'THEOLOGICAL_INFERENCE';
    contested?: boolean;
  }>;
  evidenceCaveat?: string;
  songs: SampleSong[];
}

const SAMPLE_ARTISTS: SampleArtist[] = [
  {
    name: 'John Newton',
    type: 'INDIVIDUAL',
    country: 'United Kingdom',
    bio: 'Anglican clergyman and hymnwriter (1725–1807). A former slave-ship captain who later became an abolitionist and curate of Olney, Buckinghamshire, where he collaborated with William Cowper on the Olney Hymns.',
    summary:
      'Newton wrote from within confessional Anglican evangelicalism and left an extensive body of published sermons, letters and hymns. His doctrinal commitments — human depravity, sovereign grace, justification by faith — are stated plainly and repeatedly in his own writing.',
    findings: [
      {
        type: 'STRENGTH',
        component: 'DOCTRINE',
        severity: 'MAJOR',
        category: 'Soteriology',
        title: 'Consistent, explicit doctrine of sovereign grace',
        explanation:
          'Newton’s published letters and hymns state without ambiguity that salvation originates in God’s initiative rather than human merit. His own account of his conversion is framed entirely in those terms.',
        evidenceGrade: 'DIRECT_STATEMENT',
      },
      {
        type: 'STRENGTH',
        component: 'PUBLIC_TEACHING',
        severity: 'MODERATE',
        category: 'Pastoral theology',
        title: 'Published pastoral correspondence of durable value',
        explanation:
          'The Cardiphonia letters remain in print and are widely used in pastoral training. They show sustained, careful application of doctrine to ordinary Christian life.',
        evidenceGrade: 'DOCUMENTED_FACT',
      },
      {
        type: 'STRENGTH',
        component: 'MINISTRY_CONTEXT',
        severity: 'MODERATE',
        category: 'Ministry context',
        title: 'Ordained ministry within a confessional church',
        explanation:
          'Newton served as an ordained Church of England clergyman under the Thirty-Nine Articles, an orthodox confessional standard, and his ministry was subject to that framework.',
        evidenceGrade: 'DOCUMENTED_FACT',
      },
    ],
    songs: [
      {
        title: 'Amazing Grace',
        album: 'Olney Hymns',
        releaseYear: 1779,
        genre: 'Traditional Hymn',
        themes: ['Grace', 'Salvation', 'Sin', 'Assurance', 'Providence'],
        summary:
          'A first-person account of conversion built entirely around unmerited grace, moving from the recognition of sin to assurance grounded in God’s promise rather than the singer’s performance. The individual voice is unusually direct, but the doctrine it carries is corporate and clear, and the melody is within reach of any congregation.',
        findings: [
          {
            type: 'STRENGTH',
            component: 'THEOLOGICAL',
            severity: 'MAJOR',
            category: 'Grace',
            title: 'Grace presented as wholly unmerited',
            explanation:
              'The song grounds salvation entirely in God’s initiative. The singer contributes nothing but the need; every verb of rescue belongs to God. This is the doctrine of grace stated without qualification.',
            scriptureReference: 'Ephesians 2:8-9',
            scriptureRationale:
              'Paul makes the same move: salvation is by grace through faith, not of works, so that no one may boast.',
          },
          {
            type: 'STRENGTH',
            component: 'THEOLOGICAL',
            severity: 'MODERATE',
            category: 'Hamartiology',
            title: 'Honest account of sin without despair',
            explanation:
              'The song names the singer’s lost condition plainly rather than softening it, yet moves through it to assurance. It neither minimises sin nor leaves the singer there.',
            scriptureReference: 'Romans 3:23-24',
            scriptureRationale:
              'The pattern of universal sinfulness answered by justification as a gift is exactly the movement the hymn traces.',
          },
          {
            type: 'STRENGTH',
            component: 'THEOLOGICAL',
            severity: 'MODERATE',
            category: 'Perseverance',
            title: 'Assurance grounded in God’s promise',
            explanation:
              'The later verses locate the singer’s security in God’s word and character rather than in continued personal steadfastness.',
            scriptureReference: 'Philippians 1:6',
            scriptureRationale: 'Confidence rests on God completing what He began, not on the believer sustaining it.',
          },
          {
            type: 'STRENGTH',
            component: 'CLARITY',
            severity: 'MODERATE',
            category: 'Accessibility',
            title: 'Plain language carrying substantial doctrine',
            explanation:
              'The vocabulary is ordinary and the sentences are short, yet the content is doctrinally dense. A congregation understands what it is affirming on first singing.',
          },
          {
            type: 'STRENGTH',
            component: 'COMMUNAL',
            severity: 'MODERATE',
            category: 'Singability',
            title: 'Pentatonic melody within a comfortable range',
            explanation:
              'The tune NEW BRITAIN spans roughly an octave and avoids awkward intervals, which is a large part of why it has remained singable across three centuries of congregations.',
          },
          {
            type: 'CONCERN',
            component: 'COMMUNAL',
            severity: 'MINOR',
            centrality: 'PERIPHERAL',
            category: 'Corporate perspective',
            title: 'Sustained first-person singular',
            explanation:
              'The hymn is written entirely in the singular. This is thoroughly biblical — the Psalms do the same — but a service built only of such songs can leave the corporate dimension of worship underexpressed. Worth noting when planning, not a fault in the hymn.',
            scriptureReference: 'Psalm 51:1-2',
            scriptureRationale: 'Scripture itself gives the congregation deeply personal songs to sing together.',
          },
          {
            type: 'CONCERN',
            component: 'CLARITY',
            severity: 'MINOR',
            centrality: 'PERIPHERAL',
            category: 'Archaic diction',
            title: 'A few archaic words need explanation',
            explanation:
              'Words such as "wretch" and "snares" are no longer in ordinary use and can be misheard or misunderstood by newcomers. The meaning is recoverable, but a brief word of introduction helps.',
          },
        ],
        scriptures: [
          { reference: 'Ephesians 2:8-9', relevance: 'Salvation by grace through faith, not of works.' },
          { reference: 'Romans 3:23-24', relevance: 'Universal sinfulness met by justification as a free gift.' },
          { reference: 'Philippians 1:6', relevance: 'God completes the work He begins in His people.' },
          { reference: '1 Chronicles 17:16-17', relevance: 'Newton preached on this passage the day the hymn was first used.' },
        ],
      },
    ],
  },
  {
    name: 'Reginald Heber',
    type: 'INDIVIDUAL',
    country: 'United Kingdom',
    bio: 'Anglican bishop and hymnwriter (1783–1826), Bishop of Calcutta. Wrote hymns intended to follow the church calendar and be sung by ordinary parish congregations.',
    summary:
      'Heber wrote within confessional Anglicanism and served as a bishop under the Thirty-Nine Articles. His hymns are explicitly Trinitarian and were composed for congregational use rather than performance.',
    findings: [
      {
        type: 'STRENGTH',
        component: 'DOCTRINE',
        severity: 'MAJOR',
        category: 'Trinitarian theology',
        title: 'Explicit and careful Trinitarian confession',
        explanation:
          'Heber’s hymnody states the doctrine of the Trinity directly rather than gesturing at it, and does so in language drawn from the historic creeds.',
        evidenceGrade: 'DIRECT_STATEMENT',
      },
      {
        type: 'STRENGTH',
        component: 'MINISTRY_CONTEXT',
        severity: 'MODERATE',
        category: 'Ministry context',
        title: 'Hymns written for congregational, not performance, use',
        explanation:
          'Heber’s stated intent was to provide hymns ordinary parishes could sing through the church year — a congregational rather than a concert aim.',
        evidenceGrade: 'DOCUMENTED_FACT',
      },
    ],
    songs: [
      {
        title: 'Holy, Holy, Holy! Lord God Almighty',
        releaseYear: 1826,
        genre: 'Traditional Hymn',
        themes: ['God', 'Trinity', 'Worship', 'Holiness', 'Creation'],
        summary:
          'A direct, sustained address to the triune God, structured around the threefold "holy" of Isaiah 6 and Revelation 4. The song is almost entirely about God rather than the singer, and its Trinitarian confession is explicit rather than implied. Its archaic vocabulary is its only real barrier.',
        findings: [
          {
            type: 'STRENGTH',
            component: 'THEOLOGICAL',
            severity: 'MAJOR',
            category: 'Trinity',
            title: 'Explicit Trinitarian confession',
            explanation:
              'The hymn names Father, Son and Spirit as one God in three persons without collapsing the distinctions or dividing the essence. Few congregational songs state the doctrine this precisely.',
            scriptureReference: 'Matthew 28:19',
            scriptureRationale: 'The baptismal formula names the three persons under one divine name.',
          },
          {
            type: 'STRENGTH',
            component: 'THEOLOGICAL',
            severity: 'MAJOR',
            category: 'Doctrine of God',
            title: 'God’s holiness as the governing theme',
            explanation:
              'The hymn takes its shape from the seraphim’s cry in Isaiah 6 and the worship of Revelation 4, placing God’s holiness rather than the worshipper’s experience at the centre.',
            scriptureReference: 'Isaiah 6:3',
            scriptureRationale: 'The threefold "holy" is the direct source of the hymn’s opening line and structure.',
          },
          {
            type: 'STRENGTH',
            component: 'COMMUNAL',
            severity: 'MODERATE',
            category: 'Corporate worship',
            title: 'Written in an unambiguously corporate voice',
            explanation:
              'The hymn is addressed to God by a gathered people joining a worship already in progress in heaven. It makes complete sense sung by a congregation.',
          },
          {
            type: 'CONCERN',
            component: 'CLARITY',
            severity: 'MINOR',
            centrality: 'PERIPHERAL',
            category: 'Archaic diction',
            title: 'Nineteenth-century vocabulary',
            explanation:
              'Phrases such as "casting down their golden crowns" and the older second-person pronouns are comprehensible but require some familiarity. The imagery is biblical and worth teaching rather than replacing.',
          },
          {
            type: 'CONCERN',
            component: 'COMMUNAL',
            severity: 'MINOR',
            centrality: 'PERIPHERAL',
            category: 'Singability',
            title: 'Wide melodic leaps in the opening phrase',
            explanation:
              'NICAEA opens with a rising fourth and covers a moderately wide range. Most congregations manage it, but it is not the easiest tune to introduce cold.',
          },
        ],
        scriptures: [
          { reference: 'Isaiah 6:1-3', relevance: 'The seraphim’s threefold "holy", the hymn’s structural source.' },
          { reference: 'Revelation 4:8-11', relevance: 'Ceaseless heavenly worship and the casting down of crowns.' },
          { reference: 'Matthew 28:19', relevance: 'The Trinitarian name confessed in the hymn’s refrain.' },
        ],
      },
    ],
  },
  {
    name: 'Horatio Spafford',
    type: 'INDIVIDUAL',
    country: 'United States',
    bio: 'American lawyer and hymnwriter (1828–1888). Wrote "It Is Well with My Soul" following the deaths of his four daughters in an 1873 shipwreck.',
    summary:
      'Spafford was a Presbyterian layman at the time of the hymn’s composition. His later life included a move to Jerusalem and involvement in a colony whose theology drew contemporary criticism; the record on that period is mixed and is not treated here as settled.',
    findings: [
      {
        type: 'STRENGTH',
        component: 'DOCTRINE',
        severity: 'MODERATE',
        category: 'Soteriology',
        title: 'Substitutionary atonement stated plainly in his hymnody',
        explanation:
          'The hymn text itself articulates the imputation of sin to Christ and the resulting standing of the believer in terms consistent with historic Protestant teaching.',
        evidenceGrade: 'DIRECT_STATEMENT',
      },
      {
        type: 'CONCERN',
        component: 'MINISTRY_CONTEXT',
        severity: 'MINOR',
        category: 'Later ministry context',
        title: 'Later Jerusalem colony drew contemporary criticism',
        explanation:
          'Spafford’s later involvement in the American Colony in Jerusalem attracted theological criticism from contemporaries. Historical accounts differ substantially on what was actually taught, and the hymn predates this period by several years.',
        evidenceGrade: 'CREDIBLE_REPORTING',
        contested: true,
      },
    ],
    evidenceCaveat:
      'Accounts of Spafford’s later years in Jerusalem differ. Some contemporary sources allege doctrinal irregularity within the American Colony; others record it primarily as a philanthropic community. Because the evidence is inconclusive and the hymn predates the period, no settled conclusion is drawn here.',
    songs: [
      {
        title: 'It Is Well with My Soul',
        releaseYear: 1876,
        genre: 'Traditional Hymn',
        themes: ['Suffering', 'Hope', 'Assurance', 'Cross', 'Salvation'],
        summary:
          'A hymn of settled confidence written out of severe grief, which grounds its peace explicitly in Christ’s substitutionary work rather than in changed circumstances. Its handling of suffering is honest, and its statement of the atonement is one of the clearest in common congregational use.',
        findings: [
          {
            type: 'STRENGTH',
            component: 'THEOLOGICAL',
            severity: 'MAJOR',
            category: 'Atonement',
            title: 'Substitution stated with unusual precision',
            explanation:
              'The third verse locates the singer’s peace in sin being borne by Christ and no longer counted against the believer. This is imputation stated clearly enough to teach from.',
            scriptureReference: '2 Corinthians 5:21',
            scriptureRationale: 'Christ made sin for us, that we might become the righteousness of God in Him.',
          },
          {
            type: 'STRENGTH',
            component: 'THEOLOGICAL',
            severity: 'MODERATE',
            category: 'Suffering and providence',
            title: 'Peace grounded in God rather than in circumstance',
            explanation:
              'The hymn explicitly holds together sorrow and confidence. It does not deny grief or promise its removal, which makes it usable in genuine affliction.',
            scriptureReference: 'Job 1:21',
            scriptureRationale: 'Worship offered in loss, without pretending the loss is not real.',
          },
          {
            type: 'STRENGTH',
            component: 'CLARITY',
            severity: 'MODERATE',
            category: 'Clarity',
            title: 'Concrete imagery with an unambiguous referent',
            explanation:
              'The sea imagery is vivid but never obscures the subject: it is consistently clear who is being addressed and on what basis peace is claimed.',
          },
          {
            type: 'CONCERN',
            component: 'COMMUNAL',
            severity: 'MINOR',
            centrality: 'PERIPHERAL',
            category: 'Pastoral placement',
            title: 'Demands care in placement',
            explanation:
              'The hymn assumes a settled confidence that a congregation in fresh grief may not yet feel. This is not a defect in the text, but it rewards a word of introduction.',
          },
        ],
        scriptures: [
          { reference: '2 Corinthians 5:21', relevance: 'The substitution the third verse depends on.' },
          { reference: 'Job 1:21', relevance: 'Worship offered from within loss.' },
          { reference: 'Romans 8:1', relevance: 'No condemnation for those in Christ — the ground of the hymn’s peace.' },
        ],
      },
    ],
  },
  {
    name: 'Robert Robinson',
    type: 'INDIVIDUAL',
    country: 'United Kingdom',
    bio: 'English Dissenting minister and hymnwriter (1735–1790). Wrote "Come Thou Fount of Every Blessing" at the age of twenty-two.',
    summary:
      'Robinson ministered among Baptists and Independents in eighteenth-century England. His published work is consistent with evangelical Dissenting orthodoxy of the period; accounts of his later theological drift come from secondary sources and are not treated here as established.',
    findings: [
      {
        type: 'STRENGTH',
        component: 'DOCTRINE',
        severity: 'MODERATE',
        category: 'Soteriology',
        title: 'Grace and human weakness held together',
        explanation:
          'Robinson’s hymn text acknowledges the believer’s continuing propensity to wander while resting on God’s keeping — a combination consistent with evangelical Dissenting teaching of his period.',
        evidenceGrade: 'DIRECT_STATEMENT',
      },
      {
        type: 'CONCERN',
        component: 'DOCTRINE',
        severity: 'MINOR',
        category: 'Later theological direction',
        title: 'Reports of later theological drift are not well established',
        explanation:
          'Some later accounts describe a move toward Unitarian views in Robinson’s final years. These reports are secondary, appear well after his death, and are disputed by other biographers. They are recorded here as unresolved rather than as fact.',
        evidenceGrade: 'ALLEGATION',
        contested: true,
      },
    ],
    evidenceCaveat:
      'Biographical accounts disagree about Robinson’s theological position in his final years. Because the reports are secondary and contested, BereanWorship does not treat any later shift as established fact.',
    songs: [
      {
        title: 'Come Thou Fount of Every Blessing',
        releaseYear: 1758,
        genre: 'Traditional Hymn',
        themes: ['Grace', 'Worship', 'Sin', 'Thanksgiving', 'Assurance'],
        summary:
          'A hymn of gratitude that is unusually honest about the believer’s ongoing tendency to wander, and which answers that honesty with God’s keeping rather than with resolve. Its central metaphor, "Ebenezer", is biblical but genuinely opaque to most congregations without explanation.',
        findings: [
          {
            type: 'STRENGTH',
            component: 'THEOLOGICAL',
            severity: 'MAJOR',
            category: 'Grace and perseverance',
            title: 'Honest about indwelling sin, confident in God’s keeping',
            explanation:
              'The final verse admits the singer’s propensity to wander and then asks God to bind the heart to Himself. It neither pretends to a strength the singer lacks nor despairs, which is rare and pastorally valuable.',
            scriptureReference: 'Romans 7:21-25',
            scriptureRationale: 'Paul’s account of the divided will resolved by thanks to God through Christ.',
          },
          {
            type: 'STRENGTH',
            component: 'THEOLOGICAL',
            severity: 'MODERATE',
            category: 'Grace',
            title: 'Grace as the source of the will to worship',
            explanation:
              'The opening request treats even the desire to praise as something God must supply, rather than as the singer’s contribution.',
            scriptureReference: 'Philippians 2:13',
            scriptureRationale: 'God works in His people both to will and to work for His good pleasure.',
          },
          {
            type: 'CONCERN',
            component: 'CLARITY',
            severity: 'MODERATE',
            centrality: 'PERIPHERAL',
            category: 'Obscure allusion',
            title: '"Ebenezer" is opaque without explanation',
            explanation:
              'The reference is to 1 Samuel 7:12, where Samuel raises a stone named Ebenezer — "the LORD has helped us". Sung without that context, the line is essentially meaningless to most congregations, and it is a memorial of God’s help worth recovering rather than editing out.',
            scriptureReference: '1 Samuel 7:12',
            scriptureRationale: 'The stone Samuel set up is the direct source of the image.',
          },
          {
            type: 'CONCERN',
            component: 'CLARITY',
            severity: 'MINOR',
            centrality: 'PERIPHERAL',
            category: 'Archaic diction',
            title: 'Several eighteenth-century constructions',
            explanation:
              'Phrases such as "fetter" and "prone to wander" are followable but archaic, and the syntax inverts in places.',
          },
          {
            type: 'STRENGTH',
            component: 'COMMUNAL',
            severity: 'MODERATE',
            category: 'Singability',
            title: 'NETTLETON is well within congregational reach',
            explanation:
              'The tune is stepwise, repetitive in the best sense, and quickly learned. It carries a congregation without rehearsal.',
          },
        ],
        scriptures: [
          { reference: '1 Samuel 7:12', relevance: 'The Ebenezer stone — the hymn’s most-misunderstood image.' },
          { reference: 'Romans 7:21-25', relevance: 'The divided will the final verse confesses.' },
          { reference: 'Philippians 2:13', relevance: 'God supplying both the will and the work.' },
        ],
      },
    ],
  },
  {
    name: 'Fictional Example Ministries',
    type: 'MINISTRY',
    bio: 'NOT A REAL ARTIST. A fabricated entry used only to demonstrate how BereanWorship presents lower scores. Any resemblance to an actual ministry is unintended.',
    summary:
      'This entry is fictional and exists solely to exercise the lower end of the scoring interface during development. No real ministry is described, evaluated, or implied. It should never appear in a production database.',
    findings: [
      {
        type: 'CONCERN',
        component: 'DOCTRINE',
        severity: 'MAJOR',
        category: 'Prosperity teaching',
        title: 'Illustrative: teaching that ties material outcomes to faith',
        explanation:
          'A fabricated finding, included to show how a MAJOR doctrinal concern is rendered — the penalty applied, the evidence grade shown, and the effect on the component score.',
        evidenceGrade: 'DIRECT_STATEMENT',
      },
      {
        type: 'CONCERN',
        component: 'PUBLIC_TEACHING',
        severity: 'MODERATE',
        category: 'Gospel clarity',
        title: 'Illustrative: gospel presentation reduced to felt need',
        explanation: 'A fabricated finding demonstrating a MODERATE concern in the public-teaching component.',
        evidenceGrade: 'INTERPRETATION',
        contested: true,
      },
      {
        type: 'STRENGTH',
        component: 'DOCTRINE',
        severity: 'MINOR',
        category: 'Statement of faith',
        title: 'Illustrative: orthodox statement on the person of Christ',
        explanation:
          'A fabricated finding, included so the sample shows that strengths and concerns are reported together even when the overall score is low.',
        evidenceGrade: 'DIRECT_STATEMENT',
      },
    ],
    songs: [
      {
        title: 'Sample Song (Illustrative Low Score)',
        releaseYear: 2024,
        genre: 'Modern Worship',
        themes: ['Faith', 'Hope'],
        summary:
          'This is fabricated sample data, not a review of any real song. It exists to demonstrate how the interface renders a low-scoring result: a severe theological concern applying its ceiling, strengths still reported alongside concerns, and the recommendation shifting to "Not recommended".',
        findings: [
          {
            type: 'CONCERN',
            component: 'THEOLOGICAL',
            severity: 'MAJOR',
            centrality: 'CORE',
            recurring: true,
            category: 'Soteriology',
            title: 'Illustrative: human effort presented as contributing to justification',
            explanation:
              'A fabricated finding demonstrating a MAJOR, CORE, recurring concern — the combination that produces the largest theological penalty and triggers the overall ceiling.',
            scriptureReference: 'Romans 3:28',
            scriptureRationale:
              'Paul locates justification in faith apart from works of the law; wording that shifts any part of the basis onto human action contradicts it.',
          },
          {
            type: 'CONCERN',
            component: 'THEOLOGICAL',
            severity: 'MODERATE',
            centrality: 'IMPORTANT',
            category: 'Anthropocentrism',
            title: 'Illustrative: the singer, rather than God, as the real subject',
            explanation: 'A fabricated finding demonstrating a MODERATE theological concern.',
          },
          {
            type: 'CONCERN',
            component: 'CLARITY',
            severity: 'MODERATE',
            centrality: 'IMPORTANT',
            category: 'Ambiguous referent',
            title: 'Illustrative: pronouns drift between God and another person',
            explanation: 'A fabricated finding demonstrating a clarity concern.',
          },
          {
            type: 'CONCERN',
            component: 'COMMUNAL',
            severity: 'MODERATE',
            centrality: 'PERIPHERAL',
            category: 'Performance orientation',
            title: 'Illustrative: range and arrangement built for a soloist',
            explanation: 'A fabricated finding demonstrating a communal-suitability concern.',
          },
          {
            type: 'STRENGTH',
            component: 'THEOLOGICAL',
            severity: 'MINOR',
            category: 'Doctrine of God',
            title: 'Illustrative: God’s faithfulness affirmed',
            explanation: 'A fabricated strength, present so the sample shows both sides being reported.',
          },
        ],
        scriptures: [
          { reference: 'Romans 3:28', relevance: 'Justification by faith apart from works of the law.' },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Sample data insertion
// ---------------------------------------------------------------------------

async function seedSample() {
  console.log('\nSeeding SAMPLE data (development only)…');
  console.log('  These reviews are hand-written illustrations, not pipeline research.');

  const themes = await prisma.theme.findMany({ select: { id: true, name: true } });
  const themeByName = new Map(themes.map((t) => [t.name, t.id]));
  const now = new Date();

  for (const sample of SAMPLE_ARTISTS) {
    const artistFindings = sample.findings.map((f) => ({
      ...f,
      scoreImpact: artistFindingImpact({
        type: f.type,
        component: f.component,
        severity: f.severity,
        cappedBySourceQuality: f.contested,
      }),
    }));

    const artistScores = scoreArtist(
      artistFindings.map((f) => ({
        type: f.type,
        component: f.component,
        severity: f.severity,
        cappedBySourceQuality: f.contested,
      })),
    );

    const artist = await prisma.artist.upsert({
      where: { normalizedName: normalizeArtist(sample.name) },
      create: {
        displayName: sample.name,
        canonicalName: sample.name,
        normalizedName: normalizeArtist(sample.name),
        slug: slugify(sample.name),
        type: sample.type,
        country: sample.country ?? null,
        bio: sample.bio,
        overallScore: artistScores.overallScore,
        doctrineScore: artistScores.doctrineScore,
        affiliationScore: artistScores.affiliationScore,
        publicTeachingScore: artistScores.publicTeachingScore,
        ministryContextScore: artistScores.ministryContextScore,
        recommendation: artistScores.recommendation,
        summary: sample.summary,
        evidenceCaveat: sample.evidenceCaveat ?? null,
        reviewStatus: 'COMPLETED',
        reviewVersion: SAMPLE_VERSION,
        scoringVersion: SAMPLE_VERSION,
        methodologyVersion: SAMPLE_VERSION,
        reviewedAt: now,
        lastReviewedAt: now,
      },
      update: {
        overallScore: artistScores.overallScore,
        doctrineScore: artistScores.doctrineScore,
        affiliationScore: artistScores.affiliationScore,
        publicTeachingScore: artistScores.publicTeachingScore,
        ministryContextScore: artistScores.ministryContextScore,
        recommendation: artistScores.recommendation,
        summary: sample.summary,
        evidenceCaveat: sample.evidenceCaveat ?? null,
        reviewStatus: 'COMPLETED',
        reviewVersion: SAMPLE_VERSION,
        reviewedAt: now,
      },
    });

    await prisma.artistFinding.deleteMany({ where: { artistId: artist.id } });
    for (const f of artistFindings) {
      await prisma.artistFinding.create({
        data: {
          artistId: artist.id,
          type: f.type,
          component: f.component,
          severity: f.severity,
          category: f.category,
          title: f.title,
          explanation: f.explanation,
          evidenceGrade: f.evidenceGrade,
          contested: Boolean(f.contested),
          scoreImpact: f.scoreImpact,
        },
      });
    }

    for (const songSample of sample.songs) {
      const findings = songSample.findings.map((f) => ({
        ...f,
        centrality: f.centrality ?? 'IMPORTANT',
        recurring: Boolean(f.recurring),
        scoreImpact: songFindingImpact({
          type: f.type,
          component: f.component,
          severity: f.severity,
          centrality: f.centrality ?? 'IMPORTANT',
          recurring: Boolean(f.recurring),
        }),
      }));

      const scores = scoreSong(
        findings.map((f) => ({
          type: f.type,
          component: f.component,
          severity: f.severity,
          centrality: f.centrality,
          recurring: f.recurring,
        })),
      );

      const song = await prisma.song.upsert({
        where: {
          song_identity: { artistId: artist.id, normalizedTitle: normalizeTitle(songSample.title) },
        },
        create: {
          displayTitle: songSample.title,
          canonicalTitle: songSample.title,
          normalizedTitle: normalizeTitle(songSample.title),
          slug: songSlug(songSample.title, sample.name),
          artistId: artist.id,
          album: songSample.album ?? null,
          releaseYear: songSample.releaseYear ?? null,
          genre: songSample.genre,
          overallScore: scores.overallScore,
          theologicalScore: scores.theologicalScore,
          communalScore: scores.communalScore,
          clarityScore: scores.clarityScore,
          recommendation: scores.recommendation,
          summary: songSample.summary,
          reviewStatus: 'COMPLETED',
          reviewVersion: SAMPLE_VERSION,
          scoringVersion: SAMPLE_VERSION,
          methodologyVersion: SAMPLE_VERSION,
          reviewedAt: now,
          lastReviewedAt: now,
        },
        update: {
          overallScore: scores.overallScore,
          theologicalScore: scores.theologicalScore,
          communalScore: scores.communalScore,
          clarityScore: scores.clarityScore,
          recommendation: scores.recommendation,
          summary: songSample.summary,
          reviewStatus: 'COMPLETED',
          reviewVersion: SAMPLE_VERSION,
          reviewedAt: now,
        },
      });

      await prisma.songFinding.deleteMany({ where: { songId: song.id } });
      await prisma.songScripture.deleteMany({ where: { songId: song.id } });
      await prisma.songTheme.deleteMany({ where: { songId: song.id } });

      for (const f of findings) {
        await prisma.songFinding.create({
          data: {
            songId: song.id,
            type: f.type,
            component: f.component,
            severity: f.severity,
            centrality: f.centrality,
            recurring: f.recurring,
            category: f.category,
            title: f.title,
            explanation: f.explanation,
            scriptureReference: f.scriptureReference ?? null,
            scriptureRationale: f.scriptureRationale ?? null,
            scoreImpact: f.scoreImpact,
          },
        });
      }

      await prisma.songScripture.createMany({
        data: songSample.scriptures.map((s, i) => ({
          songId: song.id,
          reference: s.reference,
          relevance: s.relevance,
          ordering: i,
        })),
        skipDuplicates: true,
      });

      const themeIds = songSample.themes.map((t) => themeByName.get(t)).filter((id): id is string => Boolean(id));
      await prisma.songTheme.createMany({
        data: themeIds.map((themeId) => ({ songId: song.id, themeId })),
        skipDuplicates: true,
      });

      console.log(`  ✓ ${songSample.title} — ${scores.overallScore}/100 (${scores.recommendation})`);
    }

    console.log(`  ✓ ${sample.name} — artist validity ${artistScores.overallScore}/100`);
  }

  // A couple of pending requests so the admin queue is not empty in development.
  await prisma.songRequest.upsert({
    where: { request_identity: { normalizedTitle: normalizeTitle('In Christ Alone'), normalizedArtist: normalizeArtist('Keith Getty') } },
    create: {
      rawTitle: 'In Christ Alone',
      rawArtist: 'Keith Getty',
      normalizedTitle: normalizeTitle('In Christ Alone'),
      normalizedArtist: normalizeArtist('Keith Getty'),
      notes: 'Sample development request.',
      status: 'PENDING',
    },
    update: {},
  });

  console.log('\nSample data seeded. Every sample record is tagged review version "sample-v1.0"');
  console.log('and renders a visible "Sample data" badge in the interface.');
}

async function main() {
  await seedThemes();

  if (wantsSample) {
    await seedSample();
  } else {
    console.log('\nSkipping sample data. Run with --sample (or SEED_SAMPLE=true) to include it.');
  }
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
