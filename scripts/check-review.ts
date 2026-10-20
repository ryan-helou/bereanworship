/**
 * Validates review files without touching a database.
 *
 *   npx tsx scripts/check-review.ts reviews/a.json reviews/b.json
 *
 * Reports every problem at once, with the field path and the limit that was
 * broken, so a review can be fixed in one pass instead of one error at a time.
 * Exits 1 if any file fails.
 */

import { readFileSync } from 'node:fs';
import { ReviewPayload } from '../src/lib/manual-review';

let failed = false;

for (const path of process.argv.slice(2)) {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    console.log(`✗ ${path}: not valid JSON (${error instanceof Error ? error.message : 'unreadable'})`);
    failed = true;
    continue;
  }

  const parsed = ReviewPayload.safeParse(json);
  if (parsed.success) {
    console.log(`✓ ${path}`);
    continue;
  }

  failed = true;
  console.log(`✗ ${path}: ${parsed.error.issues.length} problem(s)`);
  for (const issue of parsed.error.issues) {
    const where = issue.path.join('.') || '(root)';
    const max = 'maximum' in issue ? ` — limit ${issue.maximum}` : '';
    console.log(`    ${where}: ${issue.message}${max}`);
  }
}

process.exit(failed ? 1 : 0);
