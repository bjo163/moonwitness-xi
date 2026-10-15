'use client';

import * as React from 'react';
import { Dialog as Primitive } from 'radix-ui';
import { Button } from './button.js';
import { cn } from '../lib/cn.js';

export function Dialog(props: React.ComponentProps<typeof Primitive.Root>) {
  return <Primitive.Root data-slot="dialog" {...props} />;
}
export function DialogTrigger(props: React.ComponentProps<typeof Primitive.Trigger>) {
  return <Primitive.Trigger data-slot="dialog-trigger" {...props} />;
}
export function DialogPortal(props: React.ComponentProps<typeof Primitive.Portal>) {
  return <Primitive.Portal data-slot="dialog-portal" {...props} />;
}
export function DialogClose(props: React.ComponentProps<typeof Primitive.Close>) {
  return <Primitive.Close data-slot="dialog-close" {...props} />;
}
export function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Overlay>) {
  return (
    <Primitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'mw-ui-dialog-overlay fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
        className
      )}
      {...props}
    />
  );
}
export function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof Primitive.Content> & { showCloseButton?: boolean }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <Primitive.Content
        data-slot="dialog-content"
        className={cn(
          'mw-ui-dialog-content fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-none border-4 border-ink bg-paper p-6 text-ink shadow-ink-lg duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg',
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <Primitive.Close
            data-slot="dialog-close"
            className="mw-ui-dialog-close absolute top-4 right-4 border-2 border-ink bg-paper p-1 text-ink transition-transform hover:-translate-y-0.5 hover:bg-pink hover:text-on-pink shadow-[2px_2px_0_0_var(--ink)] disabled:pointer-events-none [&_svg]:size-4"
          >
            <span aria-hidden="true">×</span>
            <span className="mw-ui-visually-hidden">Close</span>
          </Primitive.Close>
        )}
      </Primitive.Content>
    </DialogPortal>
  );
}
export function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('mw-ui-dialog-header flex flex-col gap-2 text-center sm:text-left', className)}
      {...props}
    />
  );
}
export function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<'div'> & { showCloseButton?: boolean }) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'mw-ui-dialog-footer flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <Primitive.Close asChild>
          <Button variant="outline">Close</Button>
        </Primitive.Close>
      )}
    </div>
  );
}
export function DialogTitle({ className, ...props }: React.ComponentProps<typeof Primitive.Title>) {
  return (
    <Primitive.Title
      data-slot="dialog-title"
      className={cn('mw-ui-dialog-title text-lg leading-none font-semibold', className)}
      {...props}
    />
  );
}
export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Description>) {
  return (
    <Primitive.Description
      data-slot="dialog-description"
      className={cn('mw-ui-dialog-description text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}
