import type { ComponentProps, ReactNode } from 'react';

export type PaginationProps = Omit<ComponentProps<'nav'>, 'children'> & {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  label?: string;
  formatPage?: (page: number, pageCount: number) => ReactNode;
};

export function Pagination({
  page,
  pageCount,
  onPageChange,
  label = 'Pagination',
  formatPage = (current, total) => `Page ${current} of ${total}`,
  className,
  ...props
}: PaginationProps) {
  const safePageCount = Math.max(1, Math.floor(pageCount));
  const currentPage = Math.min(safePageCount, Math.max(1, Math.floor(page)));
  return (
    <nav
      aria-label={label}
      className={['mw-ui-pagination', className].filter(Boolean).join(' ')}
      {...props}
    >
      <button
        type="button"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
      >
        Previous
      </button>
      <span aria-live="polite">{formatPage(currentPage, safePageCount)}</span>
      <button
        type="button"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= safePageCount}
      >
        Next
      </button>
    </nav>
  );
}
