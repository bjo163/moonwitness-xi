'use client';

import * as React from 'react';
import { Tabs as Primitive } from 'radix-ui';
import { cn } from '../lib/cn.js';

export function Tabs(props: React.ComponentProps<typeof Primitive.Root>) {
  return <Primitive.Root data-slot="tabs" {...props} />;
}
export function TabsList({ className, ...props }: React.ComponentProps<typeof Primitive.List>) {
  return (
    <Primitive.List data-slot="tabs-list" className={cn('mw-ui-tabs-list', className)} {...props} />
  );
}
export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Trigger>) {
  return (
    <Primitive.Trigger
      data-slot="tabs-trigger"
      className={cn('mw-ui-tabs-trigger', className)}
      {...props}
    />
  );
}
export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Content
      data-slot="tabs-content"
      className={cn('mw-ui-tabs-content', className)}
      {...props}
    />
  );
}
