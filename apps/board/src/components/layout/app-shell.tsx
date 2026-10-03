import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import {
  Building2,
  Check,
  Globe,
  Keyboard,
  LogOut,
  Moon,
  Search,
  Sun,
  User,
  Users,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { client } from '@/lib/client';
import { useAuth } from '@/hooks/use-auth';
import { useModels } from '@/hooks/use-model';
import { useTheme } from '@/hooks/use-theme';
import { DashboardIcon, modelAddon, modelIcon, modelLabel } from '@/lib/models';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Logo } from '@/components/manga/logo';
import { Doodle } from '@/components/manga/effects';
import { ShortcutsDialog } from '@/components/manga/shortcuts-dialog';

function NavItem({
  to,
  label,
  icon: Icon,
  tilt,
}: {
  to: string;
  label: string;
  icon: typeof DashboardIcon;
  tilt: number;
}) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 px-3 py-2 font-display text-lg uppercase tracking-wide text-ink/70 transition-colors hover:text-ink',
          isActive && 'text-on-accent hover:text-on-accent'
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="nav-active"
              className="absolute inset-0 -z-0 border-2 border-ink bg-lime shadow-[3px_3px_0_0_var(--ink)]"
              style={{ rotate: tilt }}
              transition={{ type: 'spring', stiffness: 500, damping: 34 }}
            />
          )}
          <Icon className="relative size-5" strokeWidth={2.4} />
          <span className="relative truncate">{label}</span>
        </>
      )}
    </NavLink>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { data: models, isLoading } = useModels();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [activeCompanyId, setActiveCompanyId] = useState<number | undefined>(() =>
    client.getCompanyId()
  );

  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Query accessible companies for the tenant switcher
  const { data: companiesData } = useQuery({
    queryKey: ['companies_selector'],
    queryFn: () =>
      client.model<{ id: number; name: string }>('base.company').searchRead({
        limit: 50,
        order: 'name asc',
      }),
  });

  const companies = companiesData?.records ?? [];
  const currentCompany = companies.find((c) => c.id === activeCompanyId);

  const handleSelectCompany = (companyId: number | undefined) => {
    client.setCompanyId(companyId);
    setActiveCompanyId(companyId);
    // Invalidate all records queries to apply new tenant scope immediately
    queryClient.invalidateQueries();
  };

  // Omnisearch cross-model query
  const { data: searchResults } = useQuery({
    queryKey: ['omnisearch', paletteQuery],
    queryFn: async () => {
      const q = paletteQuery.trim();
      if (!q) return [];
      const [partners, users, comps] = await Promise.all([
        client
          .model<{ id: number; name: string }>('base.partner')
          .searchRead({
            domain: [['name', 'ilike', `%${q}%`]],
            limit: 5,
          })
          .catch(() => ({ records: [] })),
        client
          .model<{ id: number; login: string }>('base.user')
          .searchRead({
            domain: [['login', 'ilike', `%${q}%`]],
            limit: 5,
          })
          .catch(() => ({ records: [] })),
        client
          .model<{ id: number; name: string }>('base.company')
          .searchRead({
            domain: [['name', 'ilike', `%${q}%`]],
            limit: 5,
          })
          .catch(() => ({ records: [] })),
      ]);

      const items: Array<{
        id: number;
        model: string;
        title: string;
        type: 'partner' | 'user' | 'company';
      }> = [];

      for (const p of partners.records) {
        items.push({ id: p.id, model: 'base.partner', title: p.name, type: 'partner' });
      }
      for (const u of users.records) {
        items.push({ id: u.id, model: 'base.user', title: u.login, type: 'user' });
      }
      for (const c of comps.records) {
        items.push({ id: c.id, model: 'base.company', title: c.name, type: 'company' });
      }
      return items;
    },
    enabled: paletteOpen && paletteQuery.trim().length >= 2,
  });

  const groups = useMemo(() => {
    const byAddon = new Map<string, string[]>();
    for (const { model } of models ?? []) {
      const addon = modelAddon(model);
      byAddon.set(addon, [...(byAddon.get(addon) ?? []), model]);
    }
    return [...byAddon.entries()];
  }, [models]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (event.key === '/' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setShortcutsOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="grid min-h-dvh grid-cols-[16rem_1fr]">
      {/* Sidebar: scoped .dark tokens keep it ink-black with light ink in BOTH themes. */}
      <aside className="dark sticky top-0 flex h-dvh flex-col border-r-4 border-[#0d0d0d] bg-[#0d0d0d] text-ink">
        <div className="relative border-b-2 border-dashed border-ink/20 px-5 py-5">
          <Logo />
        </div>
        <nav aria-label="Models" className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          <NavItem to="/" label="Dashboard" icon={DashboardIcon} tilt={-1.5} />
          {isLoading &&
            Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-8 bg-ink/10" />)}
          {groups.map(([addon, names]) => (
            <div key={addon} className="space-y-1">
              <p className="px-3 pb-1 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-faint">
                {addon}
              </p>
              {names.map((model, i) => (
                <NavItem
                  key={model}
                  to={`/m/${model}`}
                  label={modelLabel(model)}
                  icon={modelIcon(model)}
                  tilt={i % 2 ? 1.2 : -1.5}
                />
              ))}
            </div>
          ))}
        </nav>
        <div className="flex items-center gap-2 border-t-2 border-dashed border-ink/20 px-5 py-4 font-mono text-[11px] uppercase tracking-widest text-ink-faint">
          <Doodle kind="bolt" className="size-4" /> +1 every day
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b-2 border-ink bg-paper/90 px-6 py-3 backdrop-blur">
          {/* Omnisearch trigger button */}
          <button
            id="open-command-palette"
            onClick={() => setPaletteOpen(true)}
            className="press flex h-10 w-full max-w-md items-center gap-2 rounded-sm border-2 border-ink bg-paper-raised px-3 text-left text-sm text-ink-faint shadow-ink-sm"
          >
            <Search className="size-4 text-ink" strokeWidth={2.6} />
            Search records, models, commands…
            <kbd className="ml-auto border border-ink px-1.5 font-mono text-[11px] text-ink">
              Ctrl K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-2">
            {/* Tenant / Company Switcher */}
            {companies.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 border-2 border-ink font-mono text-xs shadow-ink-sm"
                  >
                    <Building2 className="size-3.5 text-lime-600 dark:text-lime" />
                    <span className="hidden sm:inline">Tenant:</span>
                    <span className="font-bold truncate max-w-[120px]">
                      {currentCompany ? currentCompany.name : 'Global Scope'}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 font-sans">
                  <DropdownMenuLabel className="font-display uppercase tracking-wider text-xs">
                    Multi-Tenant Scope
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => handleSelectCompany(undefined)}
                    className="flex items-center justify-between text-xs cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Globe className="size-3.5 text-ink-faint" />
                      Global (All Companies)
                    </span>
                    {!activeCompanyId && <Check className="size-3.5 text-lime" />}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {companies.map((c) => (
                    <DropdownMenuItem
                      key={c.id}
                      onClick={() => handleSelectCompany(c.id)}
                      className="flex items-center justify-between text-xs cursor-pointer"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <Building2 className="size-3.5 text-ink-faint" />
                        {c.name}
                      </span>
                      {activeCompanyId === c.id && <Check className="size-3.5 text-lime" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Keyboard Shortcuts Trigger */}
            <Button
              id="shortcuts-btn"
              variant="outline"
              size="icon"
              onClick={() => setShortcutsOpen(true)}
              aria-label="Keyboard Shortcuts"
              title="Keyboard Shortcuts (Ctrl + /)"
            >
              <Keyboard className="size-4" />
            </Button>

            {/* Theme Toggle */}
            <Button
              id="toggle-theme"
              variant="outline"
              size="icon"
              onClick={toggle}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun /> : <Moon />}
            </Button>

            {/* User Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button id="user-menu" variant="outline" className="gap-2 normal-case">
                  <span className="grid size-6 place-items-center border-2 border-ink bg-lime font-display text-xs text-on-accent">
                    {user?.login.slice(0, 1).toUpperCase()}
                  </span>
                  {user?.login}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>
                  Signed in as <span className="font-bold">{user?.login}</span>
                  <span className="mt-1 block font-mono text-[11px] uppercase text-ink-faint">
                    {user?.role}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem id="logout" onSelect={() => void logout()}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 px-6 py-8 lg:px-10">
          <Outlet />
        </main>
      </div>

      {/* Global Omnisearch Dialog */}
      <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <CommandInput
          placeholder="Search models or records (e.g. Acme, Alice, base.partner)…"
          value={paletteQuery}
          onValueChange={setPaletteQuery}
        />
        <CommandList>
          <CommandEmpty>No matching models or records found.</CommandEmpty>

          {/* Direct Matching Records Section */}
          {searchResults && searchResults.length > 0 && (
            <CommandGroup heading="Direct Records">
              {searchResults.map((item) => {
                const ItemIcon =
                  item.type === 'partner' ? Users : item.type === 'user' ? User : Building2;

                return (
                  <CommandItem
                    key={`${item.model}-${item.id}`}
                    value={`${item.title} ${item.model} ${paletteQuery}`}
                    onSelect={() => {
                      setPaletteOpen(false);
                      setPaletteQuery('');
                      navigate(`/m/${item.model}/${item.id}`);
                    }}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <ItemIcon className="size-4 text-lime-600 dark:text-lime" />
                    <span className="font-bold">{item.title}</span>
                    <span className="ml-auto inline-flex items-center border border-ink/20 bg-card px-1.5 py-0.5 font-mono text-[10px] uppercase text-ink-faint">
                      {item.type} #{item.id}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}

          {/* System Modules Section */}
          {groups.map(([addon, names]) => (
            <CommandGroup key={addon} heading={addon}>
              {names.map((model) => {
                const Icon = modelIcon(model);
                return (
                  <CommandItem
                    key={model}
                    value={`${modelLabel(model)} ${model}`}
                    onSelect={() => {
                      setPaletteOpen(false);
                      setPaletteQuery('');
                      navigate(`/m/${model}`);
                    }}
                  >
                    <Icon /> {modelLabel(model)}
                    <span className="ml-auto font-mono text-xs text-ink-faint">{model}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>

      {/* Keyboard Shortcuts Cheatsheet Modal */}
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
