/**
 * Applies a hand-researched review from a file.
 *
 *   npx tsx scripts/apply-review.ts reviews/god-the-uncreated-one.json
 *
 * A thin CLI over the same code path the admin "Publish a review" page uses,
 * for when a terminal is more convenient than a browser. All the guarantees
 * live in src/lib/manual-review.ts: same schemas as the pipeline, same
 * deterministic scoring, same versioned persistence, no way to supply a score.
 */

process.loadEnvFile?.();

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma } from '../src/lib/db';
import { applyReview, ReviewPayload } from '../src/lib/manual-review';

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: npx tsx scripts/apply-review.ts <review.json>');
    process.exit(1);
  }

  const parsed = ReviewPayload.safeParse(JSON.parse(readFileSync(resolve(path), 'utf8')));
  if (!parsed.success) {
    console.error('The review file did not validate against the pipeline schemas:\n');
    console.error(JSON.stringify(parsed.error.format(), null, 2));
    process.exit(1);
  }

  const r = await applyReview(parsed.data);

  if (r.kind === 'song') {
    console.log(`\n✓ ${r.title} — ${r.artist}`);
    console.log(`  overall      ${r.overall}/100  (${r.recommendation})`);
    console.log(`  theological  ${r.theological}   communal ${r.communal}   clarity ${r.clarity}`);
    if (r.ceiling !== null) {
      console.log(`  capped at ${r.ceiling} by biblical soundness — the other criteria averaged higher`);
    }
    if (r.unrated.length > 0) console.log(`  unrated  ${r.unrated.join(', ')} — no findings, excluded from the average`);
    console.log(`  findings ${r.findingCount}  ·  sources ${r.sourceCount}  ·  version ${r.reviewVersion}`);
    console.log(
      `  evidence ${r.evidence.grounded}/${r.evidence.total} findings checkable (${Math.round(r.evidence.ratio * 100)}%)` +
        ` · ${r.evidence.quoted} quote the song, ${r.evidence.quotedWords} lyric words total`,
    );
    console.log(
      r.range
        ? `  range    ${r.range.score}/100 ${r.range.label} · ${r.range.lowest}-${r.range.highest} (separate from song validity)`
        : '  range    not measured — no verified chart',
    );
    console.log(`  themes   ${r.themes.join(', ') || '(none)'}`);
    console.log(`  url      /songs/${r.slug}\n`);
  } else {
    console.log(`\n✓ ${r.name}`);
    console.log(`  artist validity ${r.overall}/100  (${r.recommendation})`);
    console.log(`  doctrine ${r.doctrine}  teaching ${r.publicTeaching}  affiliations ${r.affiliations}  context ${r.ministryContext}`);
    console.log(`  findings ${r.findingCount}  ·  sources ${r.sourceCount}  ·  version ${r.reviewVersion}`);
    console.log(`  url      /artists/${r.slug}\n`);
  }
}

main()
  .catch((error) => {
    console.error('apply-review failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
