import * as React from 'react';
import { cn } from '@/lib/utils';

/** Ink-bordered input; focus lifts it with a lime-backed hard shadow. */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-10 w-full min-w-0 rounded-sm border-2 border-ink bg-paper-raised px-3 py-1 text-base text-ink outline-none transition-[box-shadow,transform] placeholder:text-ink-faint disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:-translate-x-px focus-visible:-translate-y-px focus-visible:shadow-[3px_3px_0_0_var(--lime),5px_5px_0_0_var(--ink)]',
        'aria-invalid:border-pink aria-invalid:shadow-[3px_3px_0_0_var(--pink)]',
        className
      )}
      {...props}
    />
  );
}

export { Input };
