import type { ComponentProps } from 'react';

export type BadgeProps = ComponentProps<'span'> & {
  variant?: 'default' | 'primary' | 'destructive';
};

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const classes = ['mw-ui-badge', className].filter(Boolean).join(' ');
  return <span data-slot="badge" data-variant={variant} className={classes} {...props} />;
}
