'use client';

import * as React from 'react';
import { Tooltip as Primitive } from 'radix-ui';
import { cn } from '../lib/cn.js';

export function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof Primitive.Provider>) {
  return (
    <Primitive.Provider data-slot="tooltip-provider" delayDuration={delayDuration} {...props} />
  );
}
export function Tooltip(props: React.ComponentProps<typeof Primitive.Root>) {
  return <Primitive.Root data-slot="tooltip" {...props} />;
}
export function TooltipTrigger(props: React.ComponentProps<typeof Primitive.Trigger>) {
  return <Primitive.Trigger data-slot="tooltip-trigger" {...props} />;
}
export function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'mw-ui-tooltip-content z-50 w-fit origin-(--radix-tooltip-content-transform-origin) animate-in rounded-none border-2 border-ink bg-ink px-3 py-1.5 font-mono text-xs text-balance text-paper shadow-ink-sm fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          className
        )}
        {...props}
      >
        {children}
        <Primitive.Arrow className="mw-ui-tooltip-arrow" />
      </Primitive.Content>
    </Primitive.Portal>
  );
}
