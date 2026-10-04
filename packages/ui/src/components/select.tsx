'use client';

import * as React from 'react';
import { Select as Primitive } from 'radix-ui';
import { cn } from '../lib/cn.js';

const check = <span aria-hidden="true">✓</span>;
const down = <span aria-hidden="true">⌄</span>;
const up = <span aria-hidden="true">⌃</span>;

export function Select(props: React.ComponentProps<typeof Primitive.Root>) {
  return <Primitive.Root data-slot="select" {...props} />;
}
export function SelectGroup(props: React.ComponentProps<typeof Primitive.Group>) {
  return <Primitive.Group data-slot="select-group" {...props} />;
}
export function SelectValue(props: React.ComponentProps<typeof Primitive.Value>) {
  return <Primitive.Value data-slot="select-value" {...props} />;
}
export function SelectTrigger({
  className,
  size = 'default',
  children,
  ...props
}: React.ComponentProps<typeof Primitive.Trigger> & { size?: 'sm' | 'default' }) {
  return (
    <Primitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        'mw-ui-select-trigger flex w-fit items-center justify-between gap-2 rounded-none border-2 border-ink bg-paper-raised px-3 py-2 text-sm whitespace-nowrap shadow-ink-sm transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-pink data-[placeholder]:text-ink-faint data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 text-ink [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4 [&_svg:not([class*=text-])]:text-ink',
        className
      )}
      {...props}
    >
      {children}
      <Primitive.Icon asChild>{down}</Primitive.Icon>
    </Primitive.Trigger>
  );
}
export function SelectContent({
  className,
  children,
  position = 'item-aligned',
  align = 'center',
  ...props
}: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        data-slot="select-content"
        className={cn(
          'mw-ui-select-content relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-none border-2 border-ink bg-card text-ink shadow-[4px_4px_0_0_var(--ink)] data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          position === 'popper' &&
            'mw-ui-select-popper data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
          className
        )}
        position={position}
        align={align}
        {...props}
      >
        <SelectScrollUpButton />
        <Primitive.Viewport
          className={cn(
            'mw-ui-select-viewport p-1',
            position === 'popper' &&
              'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1'
          )}
        >
          {children}
        </Primitive.Viewport>
        <SelectScrollDownButton />
      </Primitive.Content>
    </Primitive.Portal>
  );
}
export function SelectLabel({ className, ...props }: React.ComponentProps<typeof Primitive.Label>) {
  return (
    <Primitive.Label
      data-slot="select-label"
      className={cn('mw-ui-select-label px-2 py-1.5 text-xs text-muted-foreground', className)}
      {...props}
    />
  );
}
export function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Primitive.Item>) {
  return (
    <Primitive.Item
      data-slot="select-item"
      className={cn(
        'mw-ui-select-item relative flex w-full cursor-default items-center gap-2 rounded-none py-1.5 pr-8 pl-2.5 text-sm outline-hidden select-none focus:bg-lime focus:text-on-accent focus:font-bold data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4 [&_svg:not([class*=text-])]:text-ink-soft *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2',
        className
      )}
      {...props}
    >
      <span
        data-slot="select-item-indicator"
        className="mw-ui-select-indicator absolute right-2 flex size-3.5 items-center justify-center"
      >
        <Primitive.ItemIndicator>{check}</Primitive.ItemIndicator>
      </span>
      <Primitive.ItemText>{children}</Primitive.ItemText>
    </Primitive.Item>
  );
}
export function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Separator>) {
  return (
    <Primitive.Separator
      data-slot="select-separator"
      className={cn(
        'mw-ui-select-separator pointer-events-none -mx-1 my-1 h-px bg-border',
        className
      )}
      {...props}
    />
  );
}
export function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.ScrollUpButton>) {
  return (
    <Primitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn(
        'mw-ui-select-scroll flex cursor-default items-center justify-center py-1',
        className
      )}
      {...props}
    >
      {up}
    </Primitive.ScrollUpButton>
  );
}
export function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.ScrollDownButton>) {
  return (
    <Primitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn(
        'mw-ui-select-scroll flex cursor-default items-center justify-center py-1',
        className
      )}
      {...props}
    >
      {down}
    </Primitive.ScrollDownButton>
  );
}
