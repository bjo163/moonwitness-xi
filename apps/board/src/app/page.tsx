import Link from 'next/link';
import type { Metadata } from 'next';
import { SoundToggle } from '@moonwitness/ui/components/audio';

// Next.js route metadata must be exported from the route file alongside its component.
// oxlint-disable-next-line react/only-export-components
export const metadata: Metadata = {
  title: 'Real people. Unfiltered worlds.',
  description: 'A shared workspace for people, stories, knowledge, and the signals between them.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'MoonWitness',
    title: 'Real people. Unfiltered worlds.',
    description: 'A shared workspace for people, stories, knowledge, and the signals between them.',
    images: [
      {
        url: '/brand/social-card.png',
        width: 1200,
        height: 630,
        alt: 'MoonWitness — real people and connected stories',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Real people. Unfiltered worlds.',
    description: 'A shared workspace for people, stories, knowledge, and the signals between them.',
    images: ['/brand/social-card.png'],
  },
};

export default function HomePage() {
  return (
    <main className="home-page">
      <header className="home-header">
        <Link href="/" className="home-mark" aria-label="MoonWitness home">
          <img
            src="/brand/moonwitness-lockup-dark.svg"
            alt=""
            className="home-lockup"
            width="500"
            height="80"
          />
        </Link>
        <nav className="home-nav" aria-label="Main navigation">
          <a href="#stories">Stories</a>
          <a href="#people">People</a>
          <a href="#signals">Signals</a>
          <a href="#about">About</a>
        </nav>
        <div className="flex items-center gap-3">
          <SoundToggle />
          <Link href="/login" className="home-cta">
            Enter the board <span aria-hidden>→</span>
          </Link>
        </div>
      </header>
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero-copy">
          <span className="home-kicker">A workspace for connected stories</span>
          <h1 id="home-title" className="home-title">
            Moon<span>Witness</span>
          </h1>
          <p className="home-lede">
            Different people. Shared context. A clear view of the records, knowledge, and stories
            that connect your work.
          </p>
          <div className="home-actions">
            <Link className="home-cta primary" href="/login">
              Open your workspace <span aria-hidden>→</span>
            </Link>
            <a className="home-cta" href="#about">
              Discover MoonWitness <span aria-hidden>↓</span>
            </a>
          </div>
        </div>
        <div
          className="home-art"
          role="img"
          aria-label="Illustrated night city beneath a bright moon"
        >
          <span className="home-art-skyline" />
        </div>
      </section>
      <div className="home-band">
        Real people. <strong>Connected knowledge.</strong> A wider perspective.
      </div>
      <section className="home-sections" id="stories" aria-label="What MoonWitness brings together">
        <article className="home-section" id="people">
          <small>01 / PEOPLE</small>
          <h2>See the connections</h2>
          <p>
            Keep people, organizations, and their shared records in one workspace, with access
            shaped by your role.
          </p>
        </article>
        <article className="home-section" id="signals">
          <small>02 / KNOWLEDGE</small>
          <h2>Follow the signal</h2>
          <p>
            Bring research and knowledge into view alongside the records and context your team
            already uses.
          </p>
        </article>
        <article className="home-section" id="about">
          <small>03 / STORIES</small>
          <h2>Make work legible</h2>
          <p>
            Use the story workbench to organize narrative work while keeping the underlying
            information connected.
          </p>
        </article>
      </section>
      <footer className="home-footer">
        <span>MOONWITNESS · DIFFERENT PEOPLE, SHARED CONTEXT</span>
        <span>
          <Link href="/login">Sign in</Link> · <Link href="/register">Create an account</Link>
        </span>
      </footer>
    </main>
  );
}
