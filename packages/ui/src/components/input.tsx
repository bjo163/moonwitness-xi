import type { ComponentProps } from 'react';

export type InputProps = ComponentProps<'input'>;

export function Input({ className, ...props }: InputProps) {
  const classes = ['mw-ui-input', className].filter(Boolean).join(' ');
  return <input data-slot="input" className={classes} {...props} />;
}
