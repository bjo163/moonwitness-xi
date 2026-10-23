import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './global.css';
import { AppProviders } from '../providers';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:5173';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'MoonWitness — Real people. Unfiltered worlds.', template: '%s · MoonWitness' },
  description:
    'A thoughtful workspace for organizing people, stories, knowledge, and the signals that connect them.',
  applicationName: 'MoonWitness',
  openGraph: {
    type: 'website',
    siteName: 'MoonWitness',
    title: 'MoonWitness — Real people. Unfiltered worlds.',
    description: 'A thoughtful workspace for stories, people, and connected knowledge.',
  },
  robots: { index: true, follow: true },
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = { themeColor: '#0d0d0d', colorScheme: 'light dark' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
