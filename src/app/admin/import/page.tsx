import { requireSession } from '@/lib/auth';
import { env } from '@/lib/env';
import { MAX_IMPORT_LINES, RECOMMENDED_BATCH_SIZE } from '@/lib/import';
import { ImportForm } from './import-form';

export const metadata = { title: 'Bulk import' };

export default async function AdminImportPage() {
  await requireSession('/admin/import');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Bulk import</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-500">
          Paste a song list or upload a CSV. Entries are normalised, de-duplicated against each other and against the
          database, and only genuinely new songs are queued — nothing is reviewed twice.
        </p>
      </header>

      {!env.aiConfigured && (
        <div className="rounded-xl border border-ochre-200 bg-ochre-50 p-4 text-sm leading-relaxed text-ochre-900">
          <span className="font-semibold">Note:</span> <code className="font-mono text-xs">ANTHROPIC_API_KEY</code> is
          not set. Importing will queue jobs successfully, but they will fail until the key is configured and a worker
          is running.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <ImportForm />

        <aside className="space-y-4">
          <div className="rounded-xl border border-line bg-bone-50 p-5">
            <h2 className="text-sm font-semibold text-ink-900">Accepted formats</h2>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-bone-200 p-3 font-mono text-xs leading-relaxed text-ink-700">
              {`Amazing Grace — John Newton
Amazing Grace - John Newton
Amazing Grace | John Newton
Amazing Grace by John Newton
"Amazing Grace","John Newton"
Amazing Grace`}
            </pre>
            <p className="mt-3 text-xs leading-relaxed text-ink-500">
              Blank lines and lines starting with <code className="font-mono">#</code> are ignored. A CSV header row is
              skipped automatically.
            </p>
          </div>

          <div className="rounded-xl border border-line bg-bone-50 p-5">
            <h2 className="text-sm font-semibold text-ink-900">What happens</h2>
            <ol className="mt-3 space-y-2 text-xs leading-relaxed text-ink-500">
              <li>1. Each line is parsed and normalised.</li>
              <li>2. Duplicates within the paste are collapsed.</li>
              <li>3. Songs already reviewed are skipped.</li>
              <li>4. New songs are created and queued.</li>
              <li>5. Each new artist is queued for research exactly once.</li>
            </ol>
          </div>

          <div className="rounded-xl border border-line bg-bone-50 p-5">
            <h2 className="text-sm font-semibold text-ink-900">Limits</h2>
            <p className="mt-2 text-xs leading-relaxed text-ink-500">
              Up to {MAX_IMPORT_LINES.toLocaleString()} lines per submission. Batches of around{' '}
              {RECOMMENDED_BATCH_SIZE} are the comfortable working size.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
