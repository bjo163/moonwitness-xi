'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@moonwitness/ui/components/tooltip';
import { SoundProvider } from '@moonwitness/ui/components/audio';
import { AuthProvider } from '@/hooks/use-auth';

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
      })
  );
  return (
    <QueryClientProvider client={queryClient}>
      <SoundProvider>
        <TooltipProvider>
          <AuthProvider>{children}</AuthProvider>
        </TooltipProvider>
      </SoundProvider>
    </QueryClientProvider>
  );
}
