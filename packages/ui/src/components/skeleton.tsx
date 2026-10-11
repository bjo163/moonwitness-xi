import type { ComponentProps } from 'react';

export type SkeletonProps = ComponentProps<'div'> & {
  label?: string;
};

export function Skeleton({ className, label, ...props }: SkeletonProps) {
  return (
    <div
      aria-busy="true"
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={['mw-ui-skeleton', className].filter(Boolean).join(' ')}
      data-slot="skeleton"
      role={label ? 'status' : undefined}
      {...props}
    />
  );
}
