import type { ComponentProps } from 'react';

export type AvatarProps = Omit<ComponentProps<'img'>, 'alt'> & {
  name: string;
};

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase())
    .join('');
}

export function Avatar({ className, name, src, ...props }: AvatarProps) {
  const classes = ['mw-ui-avatar', className].filter(Boolean).join(' ');
  return (
    <span data-slot="avatar" className={classes} role="img" aria-label={name}>
      {src ? <img src={src} alt="" {...props} /> : initials(name)}
    </span>
  );
}
