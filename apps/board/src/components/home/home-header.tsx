'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@moonwitness/ui/components/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@moonwitness/ui/components/sheet';
import { SoundToggle } from '@moonwitness/ui/components/audio';
import { ArrowRightIcon, MenuIcon } from '@moonwitness/ui/icons';

const homeLinks = [
  { label: 'People', href: '#people' },
  { label: 'Knowledge', href: '#knowledge' },
  { label: 'Stories', href: '#stories' },
  { label: 'About', href: '#about' },
] as const;

export function HomeHeader() {
  return (
    <header className="home-header">
      <Link href="/" className="home-mark" aria-label="MoonWitness home">
        <Image
          src="/brand/moonwitness-lockup-dark.svg"
          alt="MoonWitness"
          className="home-lockup"
          width={500}
          height={80}
          loading="eager"
        />
      </Link>
      <nav className="home-nav" aria-label="Main navigation">
        {homeLinks.map((item) => (
          <a href={item.href} key={item.href}>
            {item.label}
          </a>
        ))}
      </nav>
      <div className="home-header-actions">
        <div className="home-desktop-sound">
          <SoundToggle />
        </div>
        <Button asChild treatment="brush" size="sm">
          <Link href="/login">
            <span className="home-header-cta-desktop">Enter the board</span>
            <span className="home-header-cta-mobile">Sign in</span>
            <ArrowRightIcon aria-hidden="true" />
          </Link>
        </Button>
        <Sheet>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="home-mobile-trigger"
              aria-label="Open site navigation"
            >
              <MenuIcon aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="home-mobile-sheet" aria-label="Site navigation">
            <SheetHeader className="home-mobile-sheet-header">
              <SheetTitle className="home-mobile-sheet-title">Explore MoonWitness</SheetTitle>
              <SheetDescription>People, knowledge, stories, and the workspace.</SheetDescription>
            </SheetHeader>
            <nav className="home-mobile-nav" aria-label="Mobile navigation">
              {homeLinks.map((item) => (
                <SheetClose asChild key={item.href}>
                  <a href={item.href}>{item.label}</a>
                </SheetClose>
              ))}
            </nav>
            <div className="home-mobile-sheet-actions">
              <SoundToggle />
              <Button asChild treatment="brush" size="lg">
                <SheetClose asChild>
                  <Link href="/login">
                    Enter the board <ArrowRightIcon aria-hidden="true" />
                  </Link>
                </SheetClose>
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
