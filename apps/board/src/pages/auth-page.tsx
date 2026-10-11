import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { ApiError } from '@moonwitness/client';
import { useAuth } from '@/hooks/use-auth-context';
import { Button } from '@moonwitness/ui/components/button';
import { Input } from '@moonwitness/ui/components/input';
import { Label } from '@moonwitness/ui/components/label';
import { Doodle, InkUnderline, SpeechBubble, SpeedLines } from '@/components/manga/effects';
import { Logo } from '@/components/manga/logo';

type Mode = 'login' | 'register';

function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/';
  try {
    const target = new URL(value, window.location.origin);
    if (target.origin !== window.location.origin) return '/';
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return '/';
  }
}

export function AuthPage({ mode }: { mode: Mode }) {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const from = safeReturnPath((location.state as { from?: unknown } | null)?.from);

  if (user) return <Navigate to={from} replace />;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? '').trim() || undefined;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') {
        await login({ login: value('login')!, password: String(form.get('password')) });
      } else {
        await register({
          login: value('login')!,
          password: String(form.get('password')),
          name: value('name'),
          email: value('email'),
        });
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Cannot reach the server. Is the API running?'
      );
    } finally {
      setBusy(false);
    }
  }

  const isLogin = mode === 'login';
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.15fr_1fr]">
      {/* Left: comic splash panel */}
      <section className="dark relative hidden overflow-hidden border-r-4 border-[#0d0d0d] bg-paper text-ink lg:block">
        <SpeedLines className="opacity-25" origin={[0.5, 0.55]} inner={0.12} count={90} />
        <div className="halftone absolute inset-0 opacity-40" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Logo />
          <div>
            <motion.h2
              initial={{ y: 40, opacity: 0, rotate: -3 }}
              animate={{ y: 0, opacity: 1, rotate: -2 }}
              transition={{ type: 'spring', stiffness: 160, damping: 16 }}
              className="ink-title text-[clamp(4rem,9vw,8.5rem)]"
            >
              Run the
              <br />
              <span className="bg-lime px-3 text-on-accent">whole</span> show.
            </motion.h2>
            <p className="mt-6 max-w-md text-lg text-ink-soft">
              Every model, every record, one board. Views are generated from your data — no screen
              to hand-build.
            </p>
          </div>
          <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-widest text-ink-faint">
            <Doodle kind="bolt" className="size-5" /> Today &gt; yesterday · +1 every deploy
          </div>
        </div>
      </section>

      {/* Right: form */}
      <section className="relative flex items-center justify-center p-6 sm:p-12">
        <Doodle kind="star" className="absolute right-10 top-10 size-8 rotate-12" />
        <Doodle kind="sparkle" className="absolute bottom-16 left-10 size-7 text-pink" />
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="w-full max-w-md"
        >
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <SpeechBubble className="mb-5">
            {isLogin ? 'Welcome back!' : 'New here? Nice.'}
          </SpeechBubble>
          <h1 className="ink-title text-6xl">
            <span className="marker">{isLogin ? 'Sign in' : 'Join'}</span>
          </h1>
          <InkUnderline className="mt-1 w-40" />

          <form onSubmit={onSubmit} className="ink-panel mt-8 space-y-5 p-6" noValidate={false}>
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" name="name" autoComplete="name" maxLength={255} />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="login">Login</Label>
              <Input
                id="login"
                name="login"
                autoComplete="username"
                required
                minLength={isLogin ? 1 : 3}
                maxLength={255}
                autoFocus
              />
            </div>
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" autoComplete="email" maxLength={255} />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                required
                minLength={isLogin ? 1 : 6}
              />
            </div>

            {error && (
              <motion.p
                role="alert"
                initial={{ x: -8 }}
                animate={{ x: [8, -6, 4, 0] }}
                className="border-2 border-ink bg-pink px-3 py-2 text-sm font-bold text-on-pink"
              >
                {error}
              </motion.p>
            )}

            <Button id="auth-submit" type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <ArrowRight />}
              {isLogin ? 'Enter the board' : 'Create account'}
            </Button>
          </form>

          <p className="mt-6 text-sm text-ink-soft">
            {isLogin ? 'No account yet? ' : 'Already have one? '}
            <Button asChild variant="link" className="h-auto p-0 text-sm text-ink">
              <a
                id="auth-switch"
                href={isLogin ? '/register' : '/login'}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(isLogin ? '/register' : '/login', { state: location.state });
                }}
              >
                {isLogin ? 'Register' : 'Sign in'}
              </a>
            </Button>
          </p>
        </motion.div>
      </section>
    </main>
  );
}
