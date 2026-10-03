import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SearchReadOptions } from '@moonwitness/client';
import { client } from '@/lib/client';

export type RecordData = Record<string, unknown> & { id: number };

const keys = {
  models: ['models'] as const,
  views: (model: string) => ['views', model] as const,
  list: (model: string, options: SearchReadOptions) => ['records', model, 'list', options] as const,
  record: (model: string, id: number) => ['records', model, 'one', id] as const,
  all: (model: string) => ['records', model] as const,
};

export function useModels() {
  return useQuery({
    queryKey: keys.models,
    queryFn: () => client.getModels(),
    staleTime: 5 * 60_000,
  });
}

/** View metadata changes only on deploy; cache it for the session. */
export function useViews(model: string) {
  return useQuery({
    queryKey: keys.views(model),
    queryFn: () => client.model(model).getViews(),
    staleTime: Infinity,
  });
}

export function useRecords(model: string, options: SearchReadOptions, enabled = true) {
  return useQuery({
    queryKey: keys.list(model, options),
    queryFn: () => client.model<RecordData>(model).searchRead({ ...options, count: true }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useRecord(model: string, id: number | undefined) {
  return useQuery({
    queryKey: keys.record(model, id ?? 0),
    queryFn: () => client.model<RecordData>(model).read(id!),
    enabled: id !== undefined,
  });
}

/** Create/update/archive with list invalidation so tables refresh after a save. */
export function useRecordMutations(model: string) {
  const queryClient = useQueryClient();
  const repo = client.model<RecordData>(model);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.all(model) });
  return {
    save: useMutation({
      mutationFn: ({ id, values }: { id?: number; values: Partial<RecordData> }) =>
        id ? repo.write(id, values) : repo.create(values),
      onSuccess: invalidate,
    }),
    archive: useMutation({
      mutationFn: ({ id, hard }: { id: number; hard?: boolean }) => repo.unlink(id, { hard }),
      onSuccess: invalidate,
    }),
    action: useMutation({
      mutationFn: ({ id, method }: { id: number; method: string }) =>
        repo.executeAction(id, method),
      onSuccess: () => {
        invalidate();
      },
    }),
  };
}
