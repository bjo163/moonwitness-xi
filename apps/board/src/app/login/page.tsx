import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthPage } from '../../board-pages/auth-page';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false, follow: false } };
export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <AuthPage mode="login" />
    </Suspense>
  );
}
