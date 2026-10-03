import { cn } from '@/lib/utils';
import { Doodle } from './effects';

/** Inked crescent + wordmark with a crown doodle, echoing the reference artwork. */
export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn('relative inline-flex items-center gap-2', className)}>
      <svg aria-hidden viewBox="0 0 32 32" className="size-7 shrink-0">
        <path
          d="M20.5 4.5A12 12 0 1 0 27.5 22 9.5 9.5 0 1 1 20.5 4.5Z"
          fill="var(--lime)"
          stroke="var(--ink)"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
      </svg>
      {!compact && (
        <span className="ink-title text-2xl">
          Moon<span className="text-ink-soft">witness</span>
        </span>
      )}
      <Doodle kind="crown" className="absolute -right-4 -top-3 size-5 rotate-12" />
    </div>
  );
}
