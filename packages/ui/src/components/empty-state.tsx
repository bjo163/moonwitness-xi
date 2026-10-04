import type { ComponentProps, ReactNode } from 'react';

export type EmptyStateProps = Omit<ComponentProps<'section'>, 'children' | 'title'> & {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <section className={['mw-ui-empty-state', className].filter(Boolean).join(' ')} {...props}>
      {icon ? (
        <div className="mw-ui-empty-state-icon" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <h2 className="mw-ui-empty-state-title">{title}</h2>
      {description ? <p className="mw-ui-empty-state-description">{description}</p> : null}
      {action ? <div className="mw-ui-empty-state-action">{action}</div> : null}
    </section>
  );
}
