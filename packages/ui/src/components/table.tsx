import type { ComponentProps } from 'react';

export type TableProps = ComponentProps<'table'>;
export type TableCaptionProps = ComponentProps<'caption'>;
export type TableHeadProps = ComponentProps<'thead'>;
export type TableBodyProps = ComponentProps<'tbody'>;
export type TableRowProps = ComponentProps<'tr'>;
export type TableHeaderProps = ComponentProps<'th'>;
export type TableCellProps = ComponentProps<'td'>;

export function Table({ className, ...props }: TableProps) {
  return (
    <div className="mw-ui-table-wrap" data-slot="table-wrap">
      <table className={['mw-ui-table', className].filter(Boolean).join(' ')} {...props} />
    </div>
  );
}

export function TableCaption({ className, ...props }: TableCaptionProps) {
  return (
    <caption className={['mw-ui-table-caption', className].filter(Boolean).join(' ')} {...props} />
  );
}

export function TableHead({ className, ...props }: TableHeadProps) {
  return <thead className={['mw-ui-table-head', className].filter(Boolean).join(' ')} {...props} />;
}

export function TableBody({ className, ...props }: TableBodyProps) {
  return <tbody className={['mw-ui-table-body', className].filter(Boolean).join(' ')} {...props} />;
}

export function TableRow({ className, ...props }: TableRowProps) {
  return <tr className={['mw-ui-table-row', className].filter(Boolean).join(' ')} {...props} />;
}

export function TableHeader({ className, ...props }: TableHeaderProps) {
  return <th className={['mw-ui-table-header', className].filter(Boolean).join(' ')} {...props} />;
}

export function TableCell({ className, ...props }: TableCellProps) {
  return <td className={['mw-ui-table-cell', className].filter(Boolean).join(' ')} {...props} />;
}
