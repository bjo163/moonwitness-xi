import type { ComponentProps } from 'react';

export type SelectFieldProps = ComponentProps<'select'>;

export function SelectField({ className, ...props }: SelectFieldProps) {
  const classes = ['mw-ui-select', className].filter(Boolean).join(' ');
  return <select data-slot="select" className={classes} {...props} />;
}
