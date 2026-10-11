import type { ComponentProps, ReactNode } from 'react';

export type PageHeaderProps = Omit<ComponentProps<'header'>, 'children' | 'title'> & {
  title: ReactNode;
  description?: ReactNode;
  breadcrumbs?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <header className={['mw-ui-page-header', className].filter(Boolean).join(' ')} {...props}>
      {breadcrumbs ? <nav aria-label="Breadcrumb">{breadcrumbs}</nav> : null}
      <div className="mw-ui-page-header-main">
        <div className="mw-ui-page-header-copy">
          <h1 className="mw-ui-page-header-title">{title}</h1>
          {description ? <p className="mw-ui-page-header-description">{description}</p> : null}
        </div>
        {actions ? <div className="mw-ui-page-header-actions">{actions}</div> : null}
      </div>
    </header>
  );
}
