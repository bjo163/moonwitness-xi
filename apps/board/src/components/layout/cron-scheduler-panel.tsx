import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Clock,
  Play,
  Pause,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Server,
  Calendar,
} from 'lucide-react';
import { client } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Doodle } from '@/components/manga/effects';
import { cn } from '@/lib/utils';

export interface CronItem {
  id: number;
  code: string;
  name: string;
  handler: string;
  company_id?: number | null;
  cron_expression: string;
  timezone: string;
  enabled: boolean;
  next_run_at: string;
  misfire_policy: 'skip' | 'coalesce' | 'catch_up';
  concurrency_policy: 'allow' | 'forbid' | 'replace';
}

export interface JobItem {
  id: number;
  handler: string;
  status: 'queued' | 'running' | 'succeeded' | 'dead' | 'cancelled';
  priority: number;
  attempts: number;
  max_attempts: number;
  lease_owner: string | null;
  create_date: string;
}

interface CronSchedulerPanelProps {
  onOpenFailureTriage?: () => void;
}

export function CronSchedulerPanel({ onOpenFailureTriage }: CronSchedulerPanelProps) {
  const queryClient = useQueryClient();
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [newCronOpen, setNewCronOpen] = useState(false);

  // New Cron Form State
  const [cronName, setCronName] = useState('');
  const [cronCode, setCronCode] = useState('');
  const [cronHandler, setCronHandler] = useState('');
  const [cronExpr, setCronExpr] = useState('*/15 * * * *');
  const [cronTz, setCronTz] = useState('UTC');
  const [cronEnabled, setCronEnabled] = useState(true);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // 1. Fetch Crons
  const {
    data: cronsData,
    isLoading: cronsLoading,
    refetch: refetchCrons,
  } = useQuery({
    queryKey: ['admin', 'crons'],
    queryFn: () => client.request<{ success: boolean; data: CronItem[] }>('/admin/crons'),
    refetchInterval: 15_000,
  });

  // 2. Fetch Recent Jobs
  const {
    data: jobsData,
    isLoading: jobsLoading,
    refetch: refetchJobs,
  } = useQuery({
    queryKey: ['admin', 'jobs', 'recent'],
    queryFn: () => client.request<{ success: boolean; data: JobItem[] }>('/admin/jobs?limit=15'),
    refetchInterval: 10_000,
  });

  const crons = cronsData?.data ?? [];
  const jobs = jobsData?.data ?? [];

  // Trigger Cron manually
  const handleTriggerCron = async (cron: CronItem) => {
    try {
      setActionInProgress(`trigger-${cron.id}`);
      await client.request(`/admin/crons/${cron.id}/trigger`, { method: 'POST' });
      setSuccessToast(`Triggered job for '${cron.name}' immediately!`);
      setTimeout(() => setSuccessToast(null), 3500);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'jobs'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'jobs', 'health'] }),
      ]);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to trigger cron');
    } finally {
      setActionInProgress(null);
    }
  };

  // Toggle Cron Enable / Pause
  const handleToggleCron = async (cron: CronItem) => {
    try {
      setActionInProgress(`toggle-${cron.id}`);
      await client.request(`/admin/crons/${cron.id}`, {
        method: 'PATCH',
        body: { enabled: !cron.enabled },
      });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'crons'] });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to toggle cron');
    } finally {
      setActionInProgress(null);
    }
  };

  // Submit New Cron
  const handleCreateCron = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      await client.request('/admin/crons', {
        method: 'POST',
        body: {
          name: cronName.trim(),
          code: cronCode.trim(),
          handler: cronHandler.trim(),
          cron_expression: cronExpr.trim(),
          timezone: cronTz.trim(),
          enabled: cronEnabled,
        },
      });
      setNewCronOpen(false);
      setCronName('');
      setCronCode('');
      setCronHandler('');
      setCronExpr('*/15 * * * *');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'crons'] });
      setSuccessToast('New cron schedule created successfully!');
      setTimeout(() => setSuccessToast(null), 3500);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create cron');
    } finally {
      setCreateSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 font-sans">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 border-2 border-ink bg-lime px-4 py-2 font-mono text-xs font-bold text-on-accent shadow-ink-lg animate-in slide-in-from-top-2">
          <CheckCircle2 className="size-4" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-ink pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="size-6 text-lime" />
            <h2 className="font-display text-2xl uppercase tracking-wider text-ink">
              Cron Scheduler & Background Workers
            </h2>
            <Doodle kind="sparkle" className="size-5 text-pink" />
          </div>
          <p className="font-mono text-xs text-ink-faint mt-1">
            Automated task schedules, durable queue dispatching, and worker concurrency controls.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchCrons();
              refetchJobs();
            }}
            className="gap-1.5 shadow-ink-sm"
          >
            <RefreshCw className="size-3.5" /> Refresh
          </Button>

          <Button size="sm" onClick={() => setNewCronOpen(true)} className="gap-1.5 shadow-ink">
            <Plus className="size-4" /> New Cron Schedule
          </Button>
        </div>
      </div>

      {/* 1. Cron Schedules Table */}
      <div className="border-4 border-ink bg-paper shadow-ink-lg">
        <div className="flex items-center justify-between border-b-2 border-ink bg-paper-raised p-4">
          <div className="flex items-center gap-2">
            <span className="font-display text-lg uppercase tracking-wider text-ink">
              Registered Cron Schedules
            </span>
            <span className="border border-ink bg-lime px-2 py-0.5 font-mono text-xs font-bold text-on-accent">
              {crons.length} Configured
            </span>
          </div>
        </div>

        {cronsLoading ? (
          <div className="p-8 text-center font-mono text-xs text-ink-faint">
            Loading cron schedules...
          </div>
        ) : crons.length === 0 ? (
          <div className="p-8 text-center font-mono text-xs text-ink-faint space-y-2">
            <Clock className="mx-auto size-8 text-ink-faint" />
            <p>No cron tasks currently registered in the database.</p>
            <Button size="xs" onClick={() => setNewCronOpen(true)} className="mt-2">
              Create First Cron
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-xs text-left">
              <thead className="border-b-2 border-ink bg-card text-ink font-bold uppercase">
                <tr>
                  <th className="p-3 border-r border-ink/20">Name & Code</th>
                  <th className="p-3 border-r border-ink/20">Target Handler</th>
                  <th className="p-3 border-r border-ink/20">Schedule</th>
                  <th className="p-3 border-r border-ink/20">Timezone</th>
                  <th className="p-3 border-r border-ink/20">Next Run</th>
                  <th className="p-3 border-r border-ink/20">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-ink/10 bg-paper">
                {crons.map((cron) => (
                  <tr key={cron.id} className="hover:bg-paper-raised/60">
                    <td className="p-3 border-r border-ink/20 font-bold text-ink">
                      <div>{cron.name}</div>
                      <span className="text-[10px] text-ink-faint">{cron.code}</span>
                    </td>
                    <td className="p-3 border-r border-ink/20 text-ink-soft">
                      <span className="border border-ink/40 bg-card px-1.5 py-0.5">
                        {cron.handler}
                      </span>
                    </td>
                    <td className="p-3 border-r border-ink/20">
                      <code className="bg-lime/20 border border-ink/30 px-1.5 py-0.5 font-bold">
                        {cron.cron_expression}
                      </code>
                    </td>
                    <td className="p-3 border-r border-ink/20 text-ink-faint">{cron.timezone}</td>
                    <td className="p-3 border-r border-ink/20 text-ink">
                      {cron.next_run_at ? new Date(cron.next_run_at).toLocaleString() : '—'}
                    </td>
                    <td className="p-3 border-r border-ink/20">
                      {cron.enabled ? (
                        <span className="border-2 border-ink bg-lime text-on-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-[1px_1px_0_0_var(--ink)]">
                          Active
                        </span>
                      ) : (
                        <span className="border border-ink/40 bg-ink/10 text-ink-faint px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                          Paused
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => handleTriggerCron(cron)}
                          disabled={actionInProgress === `trigger-${cron.id}`}
                          className="gap-1 shadow-ink-sm"
                          title="Enqueue job immediately"
                        >
                          <Play className="size-3 text-lime" />
                          <span>Run Now</span>
                        </Button>

                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleToggleCron(cron)}
                          disabled={actionInProgress === `toggle-${cron.id}`}
                          className="gap-1 hover:bg-paper-raised"
                          title={cron.enabled ? 'Pause schedule' : 'Enable schedule'}
                        >
                          {cron.enabled ? (
                            <>
                              <Pause className="size-3 text-pink" /> Pause
                            </>
                          ) : (
                            <>
                              <Play className="size-3 text-lime" /> Enable
                            </>
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 2. Worker Queue & Recent Jobs Monitor */}
      <div className="border-4 border-ink bg-paper shadow-ink-lg">
        <div className="flex flex-wrap items-center justify-between border-b-2 border-ink bg-paper-raised p-4 gap-2">
          <div className="flex items-center gap-2">
            <Server className="size-5 text-lime" />
            <span className="font-display text-lg uppercase tracking-wider text-ink">
              Recent Job Dispatches & Worker Leases
            </span>
          </div>

          {onOpenFailureTriage && (
            <Button
              variant="outline"
              size="xs"
              onClick={onOpenFailureTriage}
              className="gap-1 text-pink border-pink hover:bg-pink hover:text-white"
            >
              <AlertTriangle className="size-3.5" />
              <span>Dead Job Triage</span>
            </Button>
          )}
        </div>

        {jobsLoading ? (
          <div className="p-8 text-center font-mono text-xs text-ink-faint">
            Loading worker queue...
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-8 text-center font-mono text-xs text-ink-faint">
            No job executions recorded recently.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-xs text-left">
              <thead className="border-b-2 border-ink bg-card text-ink font-bold uppercase">
                <tr>
                  <th className="p-3 border-r border-ink/20">Job ID</th>
                  <th className="p-3 border-r border-ink/20">Handler</th>
                  <th className="p-3 border-r border-ink/20">Status</th>
                  <th className="p-3 border-r border-ink/20">Attempts</th>
                  <th className="p-3 border-r border-ink/20">Lease Owner</th>
                  <th className="p-3 text-right">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-ink/10 bg-paper">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-paper-raised/60">
                    <td className="p-3 border-r border-ink/20 font-bold text-ink">#{job.id}</td>
                    <td className="p-3 border-r border-ink/20 text-ink">{job.handler}</td>
                    <td className="p-3 border-r border-ink/20">
                      <span
                        className={cn(
                          'border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                          job.status === 'succeeded'
                            ? 'border-lime bg-lime text-on-accent'
                            : job.status === 'running'
                              ? 'border-ink bg-lime text-on-accent animate-pulse'
                              : job.status === 'dead'
                                ? 'border-pink bg-pink text-white'
                                : 'border-ink/40 bg-card text-ink-soft'
                        )}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="p-3 border-r border-ink/20 text-ink-soft">
                      {job.attempts} / {job.max_attempts}
                    </td>
                    <td className="p-3 border-r border-ink/20 text-ink-faint">
                      {job.lease_owner || '—'}
                    </td>
                    <td className="p-3 text-right text-ink-faint">
                      {job.create_date ? new Date(job.create_date).toLocaleTimeString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Create New Cron */}
      <Dialog open={newCronOpen} onOpenChange={setNewCronOpen}>
        <DialogContent className="max-w-lg border-4 border-ink bg-paper p-6 shadow-ink-lg rounded-none">
          <DialogHeader className="border-b-2 border-ink pb-3">
            <div className="flex items-center gap-2">
              <Calendar className="size-5 text-lime" />
              <DialogTitle className="font-display text-xl uppercase tracking-wider text-ink">
                Create New Cron Schedule
              </DialogTitle>
            </div>
            <DialogDescription className="font-mono text-xs text-ink-faint">
              Register a recurring background task execution in MoonWitness.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateCron} className="space-y-4 py-2 font-mono text-xs">
            {createError && (
              <div className="border border-pink bg-pink/10 p-2 text-pink font-bold">
                {createError}
              </div>
            )}

            <div>
              <label className="block uppercase text-[10px] text-ink-faint mb-1">Cron Name *</label>
              <Input
                required
                placeholder="e.g. Daily Data Backup"
                value={cronName}
                onChange={(e) => setCronName(e.target.value)}
                className="h-9 border-2 border-ink"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block uppercase text-[10px] text-ink-faint mb-1">Code *</label>
                <Input
                  required
                  placeholder="cron.daily_backup"
                  value={cronCode}
                  onChange={(e) => setCronCode(e.target.value)}
                  className="h-9 border-2 border-ink"
                />
              </div>

              <div>
                <label className="block uppercase text-[10px] text-ink-faint mb-1">Handler *</label>
                <Input
                  required
                  placeholder="system.backup"
                  value={cronHandler}
                  onChange={(e) => setCronHandler(e.target.value)}
                  className="h-9 border-2 border-ink"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block uppercase text-[10px] text-ink-faint mb-1">
                  Cron Expression *
                </label>
                <Input
                  required
                  placeholder="*/15 * * * *"
                  value={cronExpr}
                  onChange={(e) => setCronExpr(e.target.value)}
                  className="h-9 border-2 border-ink font-bold text-lime-deep"
                />
              </div>

              <div>
                <label className="block uppercase text-[10px] text-ink-faint mb-1">Timezone</label>
                <Input
                  placeholder="UTC"
                  value={cronTz}
                  onChange={(e) => setCronTz(e.target.value)}
                  className="h-9 border-2 border-ink"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="cron-enabled-check"
                checked={cronEnabled}
                onChange={(e) => setCronEnabled(e.target.checked)}
                className="size-4 accent-lime border-2 border-ink rounded-none"
              />
              <label htmlFor="cron-enabled-check" className="font-bold text-ink cursor-pointer">
                Enable immediately upon creation
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t-2 border-ink">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setNewCronOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={createSubmitting} className="gap-1.5">
                <CheckCircle2 className="size-3.5" />
                <span>Save Schedule</span>
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
