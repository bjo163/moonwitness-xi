import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { cn } from '@/lib/utils';

/** Brutalist buttons: thick ink border, hard shadow that "presses" on click (see .press). */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-sm border-2 border-ink text-sm font-bold uppercase tracking-wide whitespace-nowrap outline-none select-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-pink [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'press bg-lime text-on-accent',
        destructive: 'press bg-pink text-white',
        outline: 'press bg-paper-raised text-ink hover:bg-lime hover:text-on-accent',
        secondary: 'press bg-ink text-paper',
        ghost: 'border-transparent hover:border-ink hover:bg-paper-raised',
        link: 'border-transparent normal-case tracking-normal underline decoration-2 underline-offset-4 decoration-lime hover:decoration-pink',
      },
      size: {
        default: 'h-9 px-4 has-[>svg]:px-3',
        xs: "h-6 gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-8 gap-1.5 px-3 text-xs has-[>svg]:px-2.5',
        lg: 'h-11 px-6 text-base has-[>svg]:px-4',
        icon: 'size-9',
        'icon-xs': "size-6 [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
