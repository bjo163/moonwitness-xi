import { cn } from '@/lib/utils';

/** Use the canonical generated lockup or symbol variant from @moonwitness/assets. */
export function Logo({
  className,
  compact = false,
  surface = 'dark',
}: {
  className?: string;
  compact?: boolean;
  surface?: 'light' | 'dark';
}) {
  const kind = compact ? 'symbol' : 'lockup';
  return (
    <img
      src={`/brand/moonwitness-${kind}-${surface}.svg`}
      alt="MoonWitness"
      width={compact ? 64 : 520}
      height={compact ? 64 : 80}
      className={cn(compact ? 'size-8' : 'h-8 w-[12.5rem] object-contain object-left', className)}
    />
  );
}
