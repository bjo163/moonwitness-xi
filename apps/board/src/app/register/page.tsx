import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthPage } from '../../board-pages/auth-page';

export const metadata: Metadata = {
  title: 'Create account',
  robots: { index: false, follow: false },
};
export default function RegisterPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <AuthPage mode="register" />
    </Suspense>
  );
}
