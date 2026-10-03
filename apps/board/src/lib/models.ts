import {
  Box,
  Building2,
  Contact,
  Globe2,
  KeyRound,
  LayoutDashboard,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  'base.partner': Contact,
  'base.company': Building2,
  'base.user': Users,
  'base.country': Globe2,
  'auth.refresh_token': KeyRound,
};

export const DashboardIcon = LayoutDashboard;

export function modelIcon(model: string): LucideIcon {
  return ICONS[model] ?? (model.startsWith('auth.') ? ShieldCheck : Box);
}

/** `base.partner` → `Partner`; used until the model's view title has loaded. */
export function modelLabel(model: string): string {
  const name = model.split('.').pop() ?? model;
  return name.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());
}

/** `base.partner` → `base`; groups models by addon in the sidebar. */
export function modelAddon(model: string): string {
  return model.includes('.') ? model.split('.')[0]! : 'other';
}
