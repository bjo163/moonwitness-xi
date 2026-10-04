'use client';

import { Toaster as SonnerToaster, toast } from 'sonner';
import { createPortal } from 'react-dom';
import { useEffect, useState, type ComponentProps } from 'react';

export { toast };

export type ToastHostProps = ComponentProps<typeof SonnerToaster>;

/** Mount once near the application root so package toast calls are visible. */
export function ToastHost({ position = 'bottom-right', ...props }: ToastHostProps) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  if (!portalTarget) return null;
  return createPortal(<SonnerToaster position={position} {...props} />, portalTarget);
}
