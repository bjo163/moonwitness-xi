import { useMemo, useState } from 'react';
import { ExternalLink, Loader2, Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router';
import type { Domain, FieldMeta } from '@moonwitness/client';
import { useRecordMutations, useRecords, useViews } from '@/hooks/use-model';
import { Button } from '@moonwitness/ui/components/button';
import { Skeleton } from '@moonwitness/ui/components/skeleton';
import { FieldCell } from './fields';

interface One2ManyWidgetProps {
  field: FieldMeta;
  parentId?: number;
  isCreate: boolean;
}

export function One2ManyWidget({ field, parentId, isCreate }: One2ManyWidgetProps) {
  const targetModel = field.relation;
  const foreignKey = field.foreignKey ?? 'partner_id';

  const { data: targetViews, isLoading: viewsLoading } = useViews(targetModel ?? '');
  const mutations = useRecordMutations(targetModel ?? '');

  const domain = useMemo<Domain>(() => {
    if (!parentId) return [];
    return [[foreignKey, '=', parentId]];
  }, [foreignKey, parentId]);

  const { data: recordsData, isLoading: recordsLoading } = useRecords(
    targetModel ?? '',
    {
      domain,
      limit: 50,
    },
    Boolean(targetModel && parentId && !isCreate)
  );

  const [deletingId, setDeletingId] = useState<number | null>(null);

  const columns = useMemo(() => {
    if (!targetViews?.list?.columns || !targetViews?.fields) return [];
    return targetViews.list.columns
      .slice(0, 4)
      .map((colName) => targetViews.fields.find((f) => f.name === colName))
      .filter((f): f is FieldMeta => f !== undefined && f.name !== foreignKey);
  }, [targetViews, foreignKey]);

  if (!targetModel) {
    return <div className="text-xs text-ink-faint">Target model not specified.</div>;
  }

  if (isCreate) {
    return (
      <div className="ink-panel border-dashed p-4 text-center text-xs font-mono text-ink-muted">
        Save this record first to link and view {field.label.toLowerCase()}.
      </div>
    );
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to remove this item?')) return;
    setDeletingId(id);
    try {
      await mutations.archive.mutateAsync({ id, hard: false });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-display text-sm uppercase tracking-wider text-ink">
            {field.label}
          </span>
          <span className="border-2 border-ink bg-paper-raised px-2 py-0.5 font-mono text-xs font-bold text-ink shadow-[2px_2px_0_0_var(--ink)]">
            {recordsData?.total ?? recordsData?.records.length ?? 0}
          </span>
        </div>

        <Button
          asChild
          variant="outline"
          size="xs"
          className="gap-1 font-mono text-xs hover:bg-lime hover:text-on-accent"
        >
          <Link to={`/m/${targetModel}/new`}>
            <Plus className="size-3.5" /> Add New
          </Link>
        </Button>
      </div>

      <div className="ink-panel overflow-hidden bg-card">
        {viewsLoading || recordsLoading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-6 w-full bg-ink/10" />
            <Skeleton className="h-6 w-full bg-ink/10" />
          </div>
        ) : !recordsData?.records.length ? (
          <div className="p-6 text-center text-xs font-mono text-ink-faint">No items found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs font-sans">
              <thead>
                <tr className="border-b-2 border-ink bg-paper font-display uppercase tracking-wider text-ink">
                  {columns.map((col) => (
                    <th key={col.name} className="px-3 py-2 text-ink">
                      {col.label}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-ink/10">
                {recordsData.records.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-lime/20">
                    {columns.map((col) => (
                      <td key={col.name} className="px-3 py-2 text-ink">
                        <FieldCell field={col} row={row} />
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          asChild
                          variant="ghost"
                          size="xs"
                          className="h-6 px-1.5 font-mono text-[11px] hover:bg-ink hover:text-paper"
                          title="Open record in full view"
                        >
                          <Link to={`/m/${targetModel}/${row.id}`}>
                            <ExternalLink className="size-3" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          className="h-6 px-1.5 text-pink hover:bg-pink hover:text-on-pink"
                          onClick={() => handleDelete(row.id as number)}
                          disabled={deletingId === row.id}
                          title="Archive item"
                        >
                          {deletingId === row.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Trash2 className="size-3" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
