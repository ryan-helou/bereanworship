import Link from 'next/link';
import { SearchBar } from '@/components/search-bar';
import { ButtonLink } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="container-page flex min-h-[60vh] items-center justify-center py-16">
      <div className="w-full max-w-lg text-center">
        <div className="eyebrow">404</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">We couldn&apos;t find that page</h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-500">
          The song or artist you&apos;re looking for may not have been reviewed yet, or the link may be out of date.
        </p>

        <div className="mt-8">
          <SearchBar placeholder="Search songs or artists…" />
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/songs" variant="secondary">
            Browse songs
          </ButtonLink>
          <ButtonLink href="/request" variant="brand">
            Request a review
          </ButtonLink>
        </div>

        <p className="mt-8 text-sm text-ink-400">
          <Link href="/" className="underline-offset-4 hover:underline">
            Return home
          </Link>
        </p>
      </div>
    </div>
  );
}
