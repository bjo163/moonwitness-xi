import { useId, type SVGProps } from 'react';

export type CompanyIconProps = Omit<SVGProps<SVGSVGElement>, 'children' | 'title'> & {
  title?: string;
  size?: number | string;
};

export function CompanyIcon({ size = 24, title, ...props }: CompanyIconProps) {
  const titleId = useId();
  return (
    <svg
      aria-hidden={title ? undefined : true}
      aria-labelledby={title ? titleId : undefined}
      fill="none"
      height={size}
      role={title ? 'img' : undefined}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      {title ? <title id={titleId}>{title}</title> : null}
      <path d="M3.5 20V8.5l6.5-3V20m0-9 10.5-4V20H3.5Zm0 0h17" />
      <path d="M6.5 10.5v1m0 3v1m6-2v1m0 3v1m4.5-8v1m0 3v1m0 3v1" />
    </svg>
  );
}
