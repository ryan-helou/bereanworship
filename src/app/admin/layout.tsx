import type { Metadata } from 'next';
import { AdminNav } from './admin-nav';
import { getSession } from '@/lib/auth';

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · BereanWorship Admin' },
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

// The admin area is never cached or statically rendered.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Second line of defence. Middleware already blocked unauthenticated traffic;
  // each page re-checks too, and the nav only renders for a real session.
  const session = await getSession();

  return (
    <div className="min-h-[80vh] bg-bone-50">
      {session && <AdminNav email={session.email} />}
      <div className="container-page py-8">{children}</div>
    </div>
  );
}
