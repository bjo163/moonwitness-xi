import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './global.css';
import { SoundProvider } from '@moonwitness/ui/components/audio';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:5173';

// Next.js route metadata must be exported from the route file alongside its component.
// oxlint-disable-next-line react/only-export-components
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

// Next.js viewport metadata is also required to be exported from the root layout.
// oxlint-disable-next-line react/only-export-components
export const viewport: Viewport = { themeColor: '#0d0d0d', colorScheme: 'light dark' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          // Restored from the pre-Next entry document: apply the saved theme
          // before first paint so a reload never flashes the light palette.
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('mw-theme');var d=t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}`,
          }}
        />
      </head>
      <body>
        <SoundProvider>{children}</SoundProvider>
      </body>
    </html>
  );
}
