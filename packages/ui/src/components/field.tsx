import { cloneElement, type ComponentProps, type ReactElement, type ReactNode } from 'react';

type DescribedControlProps = {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-required'?: boolean | 'true' | 'false';
};

export type FieldProps = Omit<ComponentProps<'div'>, 'children'> & {
  label: ReactNode;
  htmlFor: string;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactElement<DescribedControlProps>;
};

export function Field({
  label,
  htmlFor,
  description,
  error,
  required = false,
  children,
  className,
  ...props
}: FieldProps) {
  const descriptionId = description ? `${htmlFor}-description` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined;
  const control = cloneElement(children, {
    id: htmlFor,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : undefined,
    'aria-required': required ? true : undefined,
  });

  return (
    <div className={['mw-ui-field', className].filter(Boolean).join(' ')} {...props}>
      <label className="mw-ui-field-label" htmlFor={htmlFor}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {control}
      {description ? (
        <div className="mw-ui-field-description" id={descriptionId}>
          {description}
        </div>
      ) : null}
      {error ? (
        <div className="mw-ui-field-error" id={errorId} role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
