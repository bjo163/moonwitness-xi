import type { QueryKey } from '@tanstack/react-query';
import { client } from '@/lib/client';

const scopeMarker = 'board-scope';

export function scopedQueryKey<TKey extends QueryKey>(queryKey: TKey) {
  return [
    ...queryKey,
    scopeMarker,
    client.currentUser?.id ?? null,
    client.getCompanyId() ?? null,
  ] as const;
}

export function isCurrentScopeQueryKey(queryKey: QueryKey): boolean {
  const scopeIndex = queryKey.length - 3;
  return (
    queryKey[scopeIndex] === scopeMarker &&
    queryKey[scopeIndex + 1] === (client.currentUser?.id ?? null) &&
    queryKey[scopeIndex + 2] === (client.getCompanyId() ?? null)
  );
}
