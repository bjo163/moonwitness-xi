'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { useAuth } from '@/hooks/use-auth-context';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const safePathname = pathname ?? '/board';
  const query = search?.toString();
  const from = `${safePathname}${query ? `?${query}` : ''}`;
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (mounted && !user) router.replace(`/login?returnTo=${encodeURIComponent(from)}`);
  }, [from, mounted, router, user]);
  if (!mounted || !user) {
    return (
      <main className="min-h-dvh p-8" aria-busy="true">
        <div className="mw-skeleton h-12 w-48" />
      </main>
    );
  }
  return <AppShell>{children}</AppShell>;
}
