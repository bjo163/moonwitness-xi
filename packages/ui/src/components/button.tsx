import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';

export type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
export type ButtonSize =
  'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg';

export type ButtonProps = ComponentProps<'button'> & {
  asChild?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
};

export function Button({
  asChild = false,
  className,
  size = 'default',
  variant = 'default',
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot.Root : 'button';
  const classes = ['mw-ui-button', className].filter(Boolean).join(' ');

  return (
    <Component
      data-slot="button"
      data-size={size}
      data-variant={variant}
      className={classes}
      {...props}
    />
  );
}
