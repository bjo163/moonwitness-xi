import type { ComponentProps } from 'react';

export type CheckboxProps = Omit<ComponentProps<'input'>, 'type'>;

export function Checkbox({ className, ...props }: CheckboxProps) {
  const classes = ['mw-ui-checkbox', className].filter(Boolean).join(' ');
  return <input type="checkbox" data-slot="checkbox" className={classes} {...props} />;
}
