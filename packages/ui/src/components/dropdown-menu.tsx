'use client';

import * as React from 'react';
import { DropdownMenu as Primitive } from 'radix-ui';
import { cn } from '../lib/cn.js';

const panel =
  'mw-ui-menu-content z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-none border-2 border-ink bg-card p-1 text-ink shadow-[4px_4px_0_0_var(--ink)] data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95';
const item =
  'mw-ui-menu-item relative flex cursor-default items-center gap-2 rounded-none px-2.5 py-1.5 text-sm outline-hidden select-none focus:bg-lime focus:text-on-accent focus:font-bold data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 data-[variant=destructive]:text-pink data-[variant=destructive]:focus:bg-pink data-[variant=destructive]:focus:text-on-pink [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4 [&_svg:not([class*=text-])]:text-ink-soft data-[variant=destructive]:*:[svg]:text-pink data-[variant=destructive]:focus:*:[svg]:text-on-pink';

export function DropdownMenu(props: React.ComponentProps<typeof Primitive.Root>) {
  return <Primitive.Root data-slot="dropdown-menu" {...props} />;
}
export function DropdownMenuPortal(props: React.ComponentProps<typeof Primitive.Portal>) {
  return <Primitive.Portal data-slot="dropdown-menu-portal" {...props} />;
}
export function DropdownMenuTrigger(props: React.ComponentProps<typeof Primitive.Trigger>) {
  return <Primitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}
export function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(panel, className)}
        {...props}
      />
    </Primitive.Portal>
  );
}
export function DropdownMenuGroup(props: React.ComponentProps<typeof Primitive.Group>) {
  return <Primitive.Group data-slot="dropdown-menu-group" {...props} />;
}
export function DropdownMenuItem({
  className,
  inset,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof Primitive.Item> & {
  inset?: boolean;
  variant?: 'default' | 'destructive';
}) {
  return (
    <Primitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(item, className)}
      {...props}
    />
  );
}
export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Primitive.CheckboxItem>) {
  return (
    <Primitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      className={cn(item, 'mw-ui-menu-indented relative py-1.5 pr-2 pl-8', className)}
      {...props}
    >
      <span className="mw-ui-menu-indicator" aria-hidden="true">
        <Primitive.ItemIndicator>✓</Primitive.ItemIndicator>
      </span>
      {children}
    </Primitive.CheckboxItem>
  );
}
export function DropdownMenuRadioGroup(props: React.ComponentProps<typeof Primitive.RadioGroup>) {
  return <Primitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />;
}
export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Primitive.RadioItem>) {
  return (
    <Primitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(item, 'mw-ui-menu-indented relative py-1.5 pr-2 pl-8', className)}
      {...props}
    >
      <span className="mw-ui-menu-indicator" aria-hidden="true">
        <Primitive.ItemIndicator>●</Primitive.ItemIndicator>
      </span>
      {children}
    </Primitive.RadioItem>
  );
}
export function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof Primitive.Label> & { inset?: boolean }) {
  return (
    <Primitive.Label
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        'mw-ui-menu-label px-2 py-1.5 text-sm font-medium data-[inset]:pl-8',
        className
      )}
      {...props}
    />
  );
}
export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Separator>) {
  return (
    <Primitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn('mw-ui-menu-separator -mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
}
export function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        'mw-ui-menu-shortcut ml-auto text-xs tracking-widest text-muted-foreground',
        className
      )}
      {...props}
    />
  );
}
export function DropdownMenuSub(props: React.ComponentProps<typeof Primitive.Sub>) {
  return <Primitive.Sub data-slot="dropdown-menu-sub" {...props} />;
}
export function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof Primitive.SubTrigger> & { inset?: boolean }) {
  return (
    <Primitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        item,
        'flex px-2 py-1.5 data-[inset]:pl-8 data-[state=open]:bg-lime data-[state=open]:text-on-accent [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4 [&_svg:not([class*=text-])]:text-ink-soft',
        className
      )}
      {...props}
    >
      {children}
      <span className="mw-ui-menu-chevron" aria-hidden="true">
        ›
      </span>
    </Primitive.SubTrigger>
  );
}
export function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.SubContent>) {
  return (
    <Primitive.SubContent
      data-slot="dropdown-menu-sub-content"
      className={cn(panel, className)}
      {...props}
    />
  );
}
