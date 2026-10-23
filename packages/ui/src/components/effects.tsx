import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export function EditorialTexture({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('mw-ui-editorial-texture', className)} {...props} />;
}

export function AccentMarker({ children, className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn('mw-ui-accent-marker', className)} {...props}>
      {children}
    </span>
  );
}

export function SignalOrbit({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) {
  return (
    <div className={cn('mw-ui-signal-orbit', className)} {...props}>
      <span aria-hidden="true" />
      {children}
    </div>
  );
}

export function LoadingProgress({
  label = 'Loading',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn('mw-ui-loading-progress', className)} role="status" aria-label={label}>
      <span aria-hidden="true" />
      <span className="mw-ui-sr-only">{label}</span>
    </div>
  );
}
