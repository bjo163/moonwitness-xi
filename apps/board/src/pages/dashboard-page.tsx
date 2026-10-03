import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  Calendar,
  CheckCircle2,
  ExternalLink,
  Plus,
  Sparkles,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react';
import { client } from '@/lib/client';
import { useAuth } from '@/hooks/use-auth';
import { useModels } from '@/hooks/use-model';
import { modelIcon, modelLabel } from '@/lib/models';
import { Doodle, SpeedLines } from '@/components/manga/effects';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function DashboardPage() {
  const { user } = useAuth();
  const { data: models, isLoading: modelsLoading } = useModels();
  const isAdmin = user?.role === 'superadmin' || user?.role === 'system';

  // Live KPI Queries
  const { data: partnerStats, isLoading: partnerLoading } = useQuery({
    queryKey: ['kpi', 'base.partner'],
    queryFn: () => client.model('base.partner').searchRead({ count: true, limit: 1 }),
  });

  const { data: userStats, isLoading: userLoading } = useQuery({
    queryKey: ['kpi', 'base.user'],
    queryFn: () =>
      client.model('base.user').searchRead({
        domain: [['active', '=', true]],
        count: true,
        limit: 1,
      }),
  });

  const { data: companyStats, isLoading: companyLoading } = useQuery({
    queryKey: ['kpi', 'base.company'],
    queryFn: () => client.model('base.company').searchRead({ count: true, limit: 1 }),
  });

  const { data: activityStats, isLoading: activityLoading } = useQuery({
    queryKey: ['kpi', 'base.activity'],
    queryFn: () =>
      client.model('base.activity').searchRead({
        domain: [['state', '=', 'planned']],
        count: true,
        limit: 1,
      }),
  });

  // Live Recent Audit Events (Admins)
  const { data: recentAudits, isLoading: auditsLoading } = useQuery({
    queryKey: ['kpi', 'recent_audits'],
    queryFn: () =>
      client
        .model<{
          id: number;
          model: string;
          record_id: number;
          operation: string;
          actor_id?: number;
          changes?: string;
          create_date?: string;
        }>('base.audit_log')
        .searchRead({
          limit: 6,
          order: 'id desc',
        }),
    enabled: isAdmin,
  });

  // Recent Planned Activities (Fallback for non-admins)
  const { data: recentActivities, isLoading: activitiesLoading } = useQuery({
    queryKey: ['kpi', 'recent_activities'],
    queryFn: () =>
      client
        .model<{
          id: number;
          summary: string;
          activity_type: string;
          deadline?: string;
          resource_model: string;
          resource_id: number;
        }>('base.activity')
        .searchRead({
          domain: [['state', '=', 'planned']],
          limit: 6,
          order: 'deadline asc',
        }),
    enabled: !isAdmin,
  });

  return (
    <div className="space-y-8">
      {/* Hero Welcome Banner with Speedlines */}
      <div className="relative overflow-hidden border-4 border-ink bg-paper p-8 lg:p-12 shadow-ink-lg">
        <SpeedLines className="opacity-20" origin={[0.85, 0.4]} inner={0.15} count={60} />
        <div className="relative max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-2 border-2 border-ink bg-lime px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider text-on-accent">
            <Sparkles className="size-3.5" /> MoonWitness Mission Control
          </div>
          <h1 className="ink-title text-4xl sm:text-6xl">
            Welcome, <span className="marker">{user?.login}</span>!
          </h1>
          <p className="text-base sm:text-lg text-ink-soft">
            Role: <span className="font-mono font-bold uppercase text-ink">{user?.role}</span>.
            Real-time multi-tenant telemetry, data-driven administrative modules, and live event
            streams.
          </p>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button asChild size="sm" className="gap-1.5 shadow-ink">
              <Link to="/m/base.partner?create=1">
                <Plus className="size-4" /> New Partner
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="gap-1.5 shadow-ink">
              <Link to="/m/base.company?create=1">
                <Building2 className="size-4" /> New Company
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="gap-1.5 shadow-ink">
              <Link to="/m/base.activity?create=1">
                <Calendar className="size-4" /> Schedule Task
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Counters Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Partner Count */}
        <Link
          to="/m/base.partner"
          className="ink-panel group relative block p-5 transition-transform hover:-translate-y-1 hover:shadow-ink-lg"
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-ink-faint">
              Partners & Contacts
            </span>
            <div className="size-8 border-2 border-ink bg-lime/20 flex items-center justify-center group-hover:bg-lime group-hover:text-on-accent transition-colors">
              <Users className="size-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="font-display text-4xl uppercase tracking-tight">
              {partnerLoading ? '—' : (partnerStats?.total ?? 0)}
            </div>
            <p className="text-xs text-ink-faint mt-1 flex items-center gap-1 font-mono">
              <span>View Directory</span>
              <ExternalLink className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </p>
          </div>
        </Link>

        {/* Active Users */}
        <Link
          to="/m/base.user"
          className="ink-panel group relative block p-5 transition-transform hover:-translate-y-1 hover:shadow-ink-lg"
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-ink-faint">
              Active Users
            </span>
            <div className="size-8 border-2 border-ink bg-paper flex items-center justify-center group-hover:bg-lime group-hover:text-on-accent transition-colors">
              <UserPlus className="size-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="font-display text-4xl uppercase tracking-tight">
              {userLoading ? '—' : (userStats?.total ?? 0)}
            </div>
            <p className="text-xs text-ink-faint mt-1 flex items-center gap-1 font-mono">
              <span>System Accounts</span>
              <ExternalLink className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </p>
          </div>
        </Link>

        {/* Companies / Multi-Tenant */}
        <Link
          to="/m/base.company"
          className="ink-panel group relative block p-5 transition-transform hover:-translate-y-1 hover:shadow-ink-lg"
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-ink-faint">
              Tenants & Companies
            </span>
            <div className="size-8 border-2 border-ink bg-paper flex items-center justify-center group-hover:bg-lime group-hover:text-on-accent transition-colors">
              <Building2 className="size-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="font-display text-4xl uppercase tracking-tight">
              {companyLoading ? '—' : (companyStats?.total ?? 0)}
            </div>
            <p className="text-xs text-ink-faint mt-1 flex items-center gap-1 font-mono">
              <span>Tenant Scopes</span>
              <ExternalLink className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </p>
          </div>
        </Link>

        {/* Pending Activities */}
        <Link
          to="/m/base.activity"
          className="ink-panel group relative block p-5 transition-transform hover:-translate-y-1 hover:shadow-ink-lg"
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-ink-faint">
              Pending Tasks
            </span>
            <div className="size-8 border-2 border-ink bg-pink/20 flex items-center justify-center group-hover:bg-pink group-hover:text-white transition-colors">
              <CheckCircle2 className="size-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="font-display text-4xl uppercase tracking-tight">
              {activityLoading ? '—' : (activityStats?.total ?? 0)}
            </div>
            <p className="text-xs text-ink-faint mt-1 flex items-center gap-1 font-mono">
              <span>Active Reminders</span>
              <ExternalLink className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </p>
          </div>
        </Link>
      </div>

      {/* Live System Activity / Audit Pulse Feed */}
      <div className="border-4 border-ink bg-paper p-6 shadow-ink space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink pb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 border-2 border-ink bg-lime px-2.5 py-0.5 font-mono text-xs font-bold uppercase tracking-wider text-on-accent">
              <Zap className="size-3.5" /> Live Pulse
            </div>
            <h2 className="font-display text-xl uppercase tracking-wider">
              {isAdmin ? 'System Audit Ledger Events' : 'Upcoming Planned Activities'}
            </h2>
          </div>
          <span className="font-mono text-xs text-ink-faint">
            {isAdmin ? 'Showing latest mutation diffs' : 'Your scheduled milestones'}
          </span>
        </div>

        {isAdmin ? (
          auditsLoading ? (
            <div className="space-y-2">
              <div className="h-12 border-2 border-ink/20 bg-card animate-pulse" />
              <div className="h-12 border-2 border-ink/20 bg-card animate-pulse" />
            </div>
          ) : !recentAudits?.records || recentAudits.records.length === 0 ? (
            <p className="font-mono text-xs text-ink-faint py-4 text-center">
              No recent audit records available.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recentAudits.records.map((audit) => {
                let parsedChanges: Record<string, unknown> | null = null;
                if (audit.changes) {
                  try {
                    parsedChanges = JSON.parse(audit.changes);
                  } catch {
                    // Fallback
                  }
                }
                const changedFields = parsedChanges ? Object.keys(parsedChanges).join(', ') : '';

                return (
                  <Link
                    key={audit.id}
                    to={`/m/${audit.model}/${audit.record_id}`}
                    className="group border-2 border-ink bg-card p-3 font-mono text-xs transition-transform hover:-translate-y-0.5 hover:shadow-ink flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          'border px-1.5 py-0.5 text-[10px] font-bold uppercase',
                          audit.operation === 'create'
                            ? 'border-lime bg-lime text-on-accent'
                            : audit.operation === 'write'
                              ? 'border-ink bg-ink text-paper'
                              : 'border-pink bg-pink text-white'
                        )}
                      >
                        {audit.operation}
                      </span>
                      <span className="text-[10px] text-ink-faint">
                        {audit.create_date
                          ? new Date(audit.create_date).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : `#${audit.id}`}
                      </span>
                    </div>

                    <div className="my-2">
                      <p className="font-bold text-ink truncate group-hover:text-lime-600 transition-colors">
                        {audit.model} #{audit.record_id}
                      </p>
                      <p className="text-[11px] text-ink-faint truncate">
                        {changedFields ? `Modified: ${changedFields}` : 'System operation'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-ink-faint border-t border-ink/10 pt-1.5">
                      <span>Actor #{audit.actor_id ?? 'system'}</span>
                      <span className="flex items-center gap-0.5 group-hover:underline">
                        Inspect <ExternalLink className="size-2.5" />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )
        ) : activitiesLoading ? (
          <div className="h-12 border-2 border-ink/20 bg-card animate-pulse" />
        ) : !recentActivities?.records || recentActivities.records.length === 0 ? (
          <p className="font-mono text-xs text-ink-faint py-4 text-center">
            No planned activities at this time.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recentActivities.records.map((act) => (
              <Link
                key={act.id}
                to={`/m/${act.resource_model}/${act.resource_id}`}
                className="group border-2 border-ink bg-card p-3 font-mono text-xs transition-transform hover:-translate-y-0.5 hover:shadow-ink"
              >
                <div className="flex items-center justify-between">
                  <span className="border border-lime bg-lime/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-lime-800 dark:text-lime-300">
                    {act.activity_type}
                  </span>
                  {act.deadline && (
                    <span className="text-[10px] text-ink-faint">Due: {act.deadline}</span>
                  )}
                </div>
                <p className="font-bold text-sm text-ink truncate mt-2 group-hover:text-lime-600">
                  {act.summary}
                </p>
                <p className="text-[11px] text-ink-faint mt-1">
                  On {act.resource_model} #{act.resource_id}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Available Models Grid */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-2xl uppercase tracking-wider">Available Modules</h2>
          <Doodle kind="crown" className="size-6 text-lime rotate-12" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modelsLoading ? (
            Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-32 border-2 border-ink/20 bg-card p-6 animate-pulse" />
            ))
          ) : models?.length === 0 ? (
            <p className="text-ink-faint">No accessible models found for your role.</p>
          ) : (
            models?.map((m) => {
              const Icon = modelIcon(m.model);
              return (
                <Link
                  key={m.model}
                  to={`/m/${m.model}`}
                  className="ink-panel group relative block p-6 transition-transform hover:-translate-y-1 hover:shadow-ink-lg"
                >
                  <div className="flex items-start justify-between">
                    <div className="size-12 border-2 border-ink bg-paper flex items-center justify-center group-hover:bg-lime group-hover:text-on-accent transition-colors">
                      <Icon className="size-6" strokeWidth={2.4} />
                    </div>
                    <span className="font-mono text-xs text-ink-faint uppercase">
                      Table: {m.table}
                    </span>
                  </div>

                  <div className="mt-4">
                    <h3 className="font-display text-xl uppercase tracking-wide group-hover:text-lime-600 transition-colors">
                      {modelLabel(m.model)}
                    </h3>
                    <p className="font-mono text-xs text-ink-faint mt-0.5">{m.model}</p>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
