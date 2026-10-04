import type { ComponentProps, ReactNode } from 'react';

export type PanelProps = Omit<ComponentProps<'section'>, 'children' | 'title'> & {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
};

export function Panel({ title, description, actions, children, className, ...props }: PanelProps) {
  return (
    <section className={['mw-ui-panel', className].filter(Boolean).join(' ')} {...props}>
      {title || description || actions ? (
        <header className="mw-ui-panel-header">
          <div>
            {title ? <h2 className="mw-ui-panel-title">{title}</h2> : null}
            {description ? <p className="mw-ui-panel-description">{description}</p> : null}
          </div>
          {actions ? <div className="mw-ui-panel-actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="mw-ui-panel-content">{children}</div>
    </section>
  );
}
