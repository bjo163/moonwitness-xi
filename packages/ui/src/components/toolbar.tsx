import type { ComponentProps, ReactNode } from 'react';

export type ToolbarProps = ComponentProps<'div'> & {
  filters?: ReactNode;
  actions?: ReactNode;
};

export function Toolbar({ filters, actions, className, ...props }: ToolbarProps) {
  return (
    <div
      className={['mw-ui-toolbar', className].filter(Boolean).join(' ')}
      role="toolbar"
      {...props}
    >
      {filters ? <div className="mw-ui-toolbar-filters">{filters}</div> : null}
      {actions ? <div className="mw-ui-toolbar-actions">{actions}</div> : null}
    </div>
  );
}
