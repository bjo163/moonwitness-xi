import { useMemo, useState } from 'react';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Filter,
  LayoutGrid,
  Loader2,
  Plus,
  Search,
  Table,
  X,
} from 'lucide-react';
import type { Domain, ResolvedViews } from '@moonwitness/client';
import { useRecordMutations, useRecords } from '@/hooks/use-model';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Doodle, SpeedLines } from '@/components/manga/effects';
import { cn } from '@/lib/utils';
import { FieldCell, relationKey } from './fields';

interface CustomFilter {
  id: string;
  field: string;
  fieldLabel: string;
  operator: '=' | '!=' | 'ilike' | '>' | '<';
  value: string;
}

interface ListViewProps {
  model: string;
  views: ResolvedViews;
  onOpenRecord: (id: number) => void;
  onCreateRecord: () => void;
}

export function ListView({ model, views, onOpenRecord, onCreateRecord }: ListViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilterIndex, setActiveFilterIndex] = useState<number | null>(0); // Default to first filter if available
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Custom visual filter builder state
  const [customFilters, setCustomFilters] = useState<CustomFilter[]>([]);
  const [filterBuilderOpen, setFilterBuilderOpen] = useState(false);
  const [builderField, setBuilderField] = useState(views.fields[0]?.name ?? '');
  const [builderOp, setBuilderOp] = useState<'=' | '!=' | 'ilike' | '>' | '<'>('ilike');
  const [builderVal, setBuilderVal] = useState('');

  // Sorting state: initialized from views.list.order if present
  const [sortState, setSortState] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(() => {
    if (views.list.order) {
      const parts = views.list.order.trim().split(/\s+/);
      if (parts[0]) {
        return { col: parts[0], dir: (parts[1]?.toLowerCase() as 'asc' | 'desc') || 'asc' };
      }
    }
    return null;
  });

  const handleSort = (colName: string) => {
    setSortState((prev) => {
      if (prev?.col === colName) {
        if (prev.dir === 'asc') return { col: colName, dir: 'desc' };
        return null; // Return to default
      }
      return { col: colName, dir: 'asc' };
    });
    setPage(1);
  };

  // Build filters: views.search.filters + custom ones like Active/Archived
  const filters = useMemo(() => {
    const list = [...(views.search?.filters ?? [])];
    const hasActiveField = views.fields.some((f) => f.name === 'active');
    if (hasActiveField && !list.some((f) => f.label.toLowerCase() === 'active')) {
      list.unshift(
        { label: 'Active', domain: [['active', '=', true]] },
        { label: 'Archived', domain: [['active', '=', false]] }
      );
    }
    return list;
  }, [views]);

  // Build combined domain
  const domain = useMemo<Domain>(() => {
    const terms: Domain = [];
    if (activeFilterIndex !== null && filters[activeFilterIndex]) {
      terms.push(...filters[activeFilterIndex].domain);
    }
    // Apply custom visual filters
    for (const cf of customFilters) {
      if (cf.operator === 'ilike') {
        terms.push([cf.field, 'ilike', `%${cf.value}%`]);
      } else if (cf.operator === '=' || cf.operator === '!=') {
        let val: unknown = cf.value;
        if (cf.value === 'true') val = true;
        else if (cf.value === 'false') val = false;
        else if (cf.value === 'null') val = null;
        else if (/^\d+$/.test(cf.value)) val = Number(cf.value);
        terms.push([cf.field, cf.operator, val]);
      } else {
        const numVal = Number(cf.value);
        terms.push([cf.field, cf.operator, isNaN(numVal) ? cf.value : numVal]);
      }
    }
    if (searchTerm.trim()) {
      const searchFields = views.search?.fields?.length
        ? views.search.fields
        : views.fields
            .filter((f) => f.type === 'string')
            .map((f) => f.name)
            .slice(0, 3);

      if (searchFields.length > 0) {
        // Build OR domain for matching searchFields: ['|', [f1, 'ilike', term], [f2, ...]]
        const orClauses = searchFields.map(
          (f) => [f, 'ilike', `%${searchTerm.trim()}%`] as [string, string, unknown]
        );
        if (orClauses.length === 1) {
          terms.push(orClauses[0]);
        } else {
          // Polish notation prefix '|'
          for (let i = 0; i < orClauses.length - 1; i++) {
            terms.push('|');
          }
          terms.push(...orClauses);
        }
      }
    }
    return terms;
  }, [activeFilterIndex, filters, searchTerm, views]);

  // Eager load belongsTo relations present in columns
  const withRelations = useMemo(() => {
    const many2oneFields = views.fields.filter(
      (f) => f.type === 'many2one' && views.list.columns.includes(f.name)
    );
    if (!many2oneFields.length) return undefined;
    return many2oneFields.map(relationKey).join(',');
  }, [views]);

  const currentOrder = sortState ? `${sortState.col} ${sortState.dir}` : views.list.order;

  const offset = (page - 1) * pageSize;
  const { data, isLoading, isPlaceholderData } = useRecords(model, {
    domain,
    offset,
    limit: pageSize,
    order: currentOrder,
    with: withRelations,
  });

  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const columns = useMemo(() => {
    return views.list.columns
      .map((colName) => views.fields.find((f) => f.name === colName))
      .filter((f): f is NonNullable<typeof f> => Boolean(f));
  }, [views]);

  const mutations = useRecordMutations(model);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isBulkArchiving, setIsBulkArchiving] = useState(false);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleSelectAllCurrentPage = (checked: boolean) => {
    if (!data?.records) return;
    const pageIds = data.records.map((r) => r.id as number);
    if (checked) {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    } else {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    }
  };

  const areAllOnPageSelected = useMemo(() => {
    if (!data?.records.length) return false;
    return data.records.every((r) => selectedIds.includes(r.id as number));
  }, [data, selectedIds]);

  const areSomeOnPageSelected = useMemo(() => {
    if (!data?.records.length) return false;
    return data.records.some((r) => selectedIds.includes(r.id as number)) && !areAllOnPageSelected;
  }, [data, selectedIds, areAllOnPageSelected]);

  const handleBulkArchive = async () => {
    if (!selectedIds.length) return;
    if (
      !window.confirm(`Are you sure you want to archive ${selectedIds.length} selected record(s)?`)
    ) {
      return;
    }

    setIsBulkArchiving(true);
    try {
      await Promise.all(
        selectedIds.map((id) => mutations.archive.mutateAsync({ id, hard: false }))
      );
      setSelectedIds([]);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to archive selected records');
    } finally {
      setIsBulkArchiving(false);
    }
  };

  const handleExportCsv = () => {
    if (!data?.records.length) return;
    const recordsToExport =
      selectedIds.length > 0
        ? data.records.filter((r) => selectedIds.includes(r.id as number))
        : data.records;

    const headers = ['ID', ...columns.map((c) => c.label)];
    const rows = recordsToExport.map((row) => [
      String(row.id),
      ...columns.map((c) => {
        const val = row[c.name];
        if (val === null || val === undefined) return '';
        if (typeof val === 'object') {
          return (val as { name?: string }).name ?? JSON.stringify(val);
        }
        return String(val);
      }),
    ]);

    const escapeCsv = (val: string) => {
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const csvContent = [
      headers.map(escapeCsv).join(','),
      ...rows.map((r) => r.map(escapeCsv).join(',')),
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${model.replace(/\./g, '_')}_export_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Title & Speed lines header */}
      <div className="relative flex flex-col justify-between gap-4 border-b-2 border-ink pb-6 sm:flex-row sm:items-end">
        <SpeedLines className="opacity-15" count={45} origin={[0.08, 0.4]} inner={0.2} />
        <div>
          <div className="flex items-center gap-3">
            <h1 className="ink-title text-4xl sm:text-5xl">
              <span className="marker">{views.title}</span>
            </h1>
            <Doodle kind="star" className="size-6 text-pink" />
          </div>
          <p className="mt-1 font-mono text-xs uppercase tracking-widest text-ink-faint">
            {total} total records · Model: {model}
          </p>
        </div>

        {views.permissions.create && (
          <Button
            id="btn-create-record"
            onClick={onCreateRecord}
            size="lg"
            className="press gap-2 shadow-ink"
          >
            <Plus className="size-5" strokeWidth={3} />
            <span className="font-display tracking-wider">New {views.title.replace(/s$/, '')}</span>
          </Button>
        )}
      </div>

      {/* Control bar: Search, Sticker Filters, Dual View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative w-full max-w-sm sm:w-80">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            id="search-input"
            placeholder={`Search ${views.title.toLowerCase()}...`}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            className="pl-9 pr-4"
          />
        </div>

        {/* Filters & View Switcher */}
        <div className="flex flex-wrap items-center gap-3">
          {filters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 font-mono text-xs uppercase text-ink-faint mr-1">
                <Filter className="size-3.5" /> Filters:
              </div>
              {filters.map((filter, idx) => {
                const active = activeFilterIndex === idx;
                return (
                  <button
                    key={filter.label}
                    type="button"
                    data-active={active}
                    onClick={() => {
                      setActiveFilterIndex(active ? null : idx);
                      setPage(1);
                    }}
                    className="sticker text-xs"
                    style={{ '--tilt': `${(idx % 3) - 1.2}deg` } as React.CSSProperties}
                  >
                    {filter.label}
                  </button>
                );
              })}

              {/* Active Custom Filter Stickers */}
              {customFilters.map((cf) => (
                <span
                  key={cf.id}
                  className="sticker text-xs border-2 border-ink bg-lime text-on-accent font-bold"
                >
                  <span>
                    {cf.fieldLabel} {cf.operator} &quot;{cf.value}&quot;
                  </span>
                  <button
                    type="button"
                    onClick={() => setCustomFilters((prev) => prev.filter((f) => f.id !== cf.id))}
                    className="ml-1 hover:text-pink transition-colors"
                    title="Remove filter"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}

              {/* Add Custom Filter Popover */}
              <Popover open={filterBuilderOpen} onOpenChange={setFilterBuilderOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 border-2 border-dashed border-ink/40 bg-card px-2 py-0.5 font-mono text-xs font-semibold text-ink-faint hover:border-ink hover:text-ink hover:bg-paper-raised transition-colors"
                  >
                    <Plus className="size-3" /> Filter
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-64 p-3 space-y-3 font-sans">
                  <div className="font-display text-xs uppercase tracking-wider text-ink border-b border-ink/20 pb-1.5 flex items-center justify-between">
                    <span>Add Custom Filter</span>
                    <Filter className="size-3 text-lime" />
                  </div>

                  <div className="space-y-2 font-mono text-xs">
                    <div>
                      <span className="block text-[10px] uppercase text-ink-faint mb-1">Field</span>
                      <select
                        value={builderField}
                        onChange={(e) => setBuilderField(e.target.value)}
                        className="w-full h-8 border-2 border-ink bg-paper px-2 text-xs text-ink outline-none"
                      >
                        {views.fields
                          .filter((f) => f.type !== 'one2many')
                          .map((f) => (
                            <option key={f.name} value={f.name}>
                              {f.label} ({f.name})
                            </option>
                          ))}
                      </select>
                    </div>

                    <div>
                      <span className="block text-[10px] uppercase text-ink-faint mb-1">
                        Condition
                      </span>
                      <select
                        value={builderOp}
                        onChange={(e) =>
                          setBuilderOp(e.target.value as '=' | '!=' | 'ilike' | '>' | '<')
                        }
                        className="w-full h-8 border-2 border-ink bg-paper px-2 text-xs text-ink outline-none"
                      >
                        <option value="ilike">contains</option>
                        <option value="=">equals</option>
                        <option value="!=">not equal</option>
                        <option value=">">greater than</option>
                        <option value="<">less than</option>
                      </select>
                    </div>

                    <div>
                      <span className="block text-[10px] uppercase text-ink-faint mb-1">Value</span>
                      <Input
                        placeholder="Search value..."
                        value={builderVal}
                        onChange={(e) => setBuilderVal(e.target.value)}
                        className="h-8 text-xs border-2 border-ink"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      size="xs"
                      disabled={!builderVal.trim()}
                      onClick={() => {
                        const targetMeta = views.fields.find((f) => f.name === builderField);
                        setCustomFilters((prev) => [
                          ...prev,
                          {
                            id: `cf_${Date.now()}`,
                            field: builderField,
                            fieldLabel: targetMeta?.label ?? builderField,
                            operator: builderOp,
                            value: builderVal.trim(),
                          },
                        ]);
                        setBuilderVal('');
                        setFilterBuilderOpen(false);
                        setPage(1);
                      }}
                    >
                      Apply Filter
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>

              {customFilters.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCustomFilters([])}
                  className="font-mono text-[10px] uppercase text-ink-faint hover:text-pink underline"
                >
                  Clear all
                </button>
              )}
            </div>
          )}

          {/* Dual View Toggle */}
          <div className="flex items-center border-2 border-ink bg-card p-0.5 shadow-ink-sm">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold uppercase transition-all',
                viewMode === 'table'
                  ? 'border border-ink bg-lime text-on-accent shadow-[1.5px_1.5px_0_0_var(--ink)]'
                  : 'text-ink-soft hover:text-ink'
              )}
              title="Table View"
            >
              <Table className="size-3.5" />
              <span className="hidden sm:inline">Table</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold uppercase transition-all',
                viewMode === 'kanban'
                  ? 'border border-ink bg-lime text-on-accent shadow-[1.5px_1.5px_0_0_var(--ink)]'
                  : 'text-ink-soft hover:text-ink'
              )}
              title="Kanban Cards View"
            >
              <LayoutGrid className="size-3.5" />
              <span className="hidden sm:inline">Cards</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content: Table or Kanban Cards */}
      {viewMode === 'table' ? (
        /* Manga Ink Table */
        <div className="ink-panel overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b-2 border-ink bg-paper font-display uppercase tracking-wider text-ink">
                  <th className="w-10 px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      aria-label="Select all records on current page"
                      checked={areAllOnPageSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = areSomeOnPageSelected;
                      }}
                      onChange={(e) => handleSelectAllCurrentPage(e.target.checked)}
                      className="size-4 cursor-pointer accent-lime border-2 border-ink rounded-none bg-paper"
                    />
                  </th>
                  {columns.map((col) => {
                    const isSorted = sortState?.col === col.name;
                    return (
                      <th
                        key={col.name}
                        onClick={() => handleSort(col.name)}
                        className="cursor-pointer select-none px-4 py-3 text-xs transition-colors hover:bg-lime/25"
                        title={`Click to sort by ${col.label}`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>{col.label}</span>
                          {isSorted ? (
                            sortState.dir === 'asc' ? (
                              <ArrowUp
                                className="size-3.5 text-lime-600 dark:text-lime"
                                strokeWidth={3}
                              />
                            ) : (
                              <ArrowDown
                                className="size-3.5 text-lime-600 dark:text-lime"
                                strokeWidth={3}
                              />
                            )
                          ) : (
                            <ArrowUpDown className="size-3 text-ink-faint opacity-30 hover:opacity-100" />
                          )}
                        </div>
                      </th>
                    );
                  })}
                  <th className="px-4 py-3 text-right text-xs">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-ink/10 font-sans">
                {isLoading ? (
                  Array.from({ length: 5 }, (_, i) => (
                    <tr key={i}>
                      <td className="w-10 px-4 py-3.5 text-center">
                        <Skeleton className="mx-auto size-4 bg-ink/10" />
                      </td>
                      {columns.map((col) => (
                        <td key={col.name} className="px-4 py-3.5">
                          <Skeleton className="h-5 w-24 bg-ink/10" />
                        </td>
                      ))}
                      <td className="px-4 py-3.5 text-right">
                        <Skeleton className="ml-auto h-5 w-12 bg-ink/10" />
                      </td>
                    </tr>
                  ))
                ) : data?.records.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 2} className="py-16 text-center">
                      <div className="mx-auto max-w-sm space-y-3">
                        <Doodle kind="sparkle" className="mx-auto size-8 text-lime" />
                        <p className="font-display text-xl uppercase">No records found</p>
                        <p className="text-sm text-ink-soft">
                          {searchTerm
                            ? 'Try adjusting your search or active filter stickers.'
                            : 'Be the first to create one!'}
                        </p>
                        {views.permissions.create && (
                          <Button
                            onClick={onCreateRecord}
                            variant="outline"
                            size="sm"
                            className="mt-2"
                          >
                            <Plus className="size-4" /> Create Record
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  data?.records.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => onOpenRecord(row.id)}
                      className="cursor-pointer transition-colors hover:bg-lime/25"
                    >
                      <td
                        className="w-10 px-4 py-3.5 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Select record #${row.id}`}
                          checked={selectedIds.includes(row.id as number)}
                          onChange={() => toggleSelect(row.id as number)}
                          className="size-4 cursor-pointer accent-lime border-2 border-ink rounded-none bg-paper"
                        />
                      </td>
                      {columns.map((col) => (
                        <td key={col.name} className="px-4 py-3.5 text-ink">
                          <FieldCell field={col} row={row} />
                        </td>
                      ))}
                      <td className="px-4 py-3.5 text-right">
                        <Button
                          variant="ghost"
                          size="xs"
                          className="font-mono text-xs hover:bg-ink hover:text-paper"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenRecord(row.id);
                          }}
                        >
                          Open →
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Manga Ink Kanban Cards View */
        <div className="space-y-4">
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="h-44 border-2 border-ink/20 bg-card p-4 animate-pulse" />
              ))}
            </div>
          ) : data?.records.length === 0 ? (
            <div className="ink-panel border-2 border-dashed bg-card/40 p-16 text-center">
              <Doodle kind="sparkle" className="mx-auto size-8 text-lime" />
              <p className="font-display text-xl uppercase mt-2">No records found</p>
              <p className="text-sm text-ink-soft">
                {searchTerm
                  ? 'Try adjusting your search or active filter stickers.'
                  : 'Be the first to create one!'}
              </p>
              {views.permissions.create && (
                <Button onClick={onCreateRecord} variant="outline" size="sm" className="mt-3">
                  <Plus className="size-4" /> Create Record
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {data?.records.map((row) => {
                const isSelected = selectedIds.includes(row.id as number);
                const titleField = columns.find(
                  (c) =>
                    c.name === 'name' ||
                    c.name === 'login' ||
                    c.name === 'summary' ||
                    c.name === 'code' ||
                    c.type === 'string'
                );
                const titleValue = titleField ? String(row[titleField.name] ?? '') : `#${row.id}`;
                const detailCols = columns
                  .filter((c) => c.name !== titleField?.name && c.name !== 'active')
                  .slice(0, 4);

                return (
                  <div
                    key={row.id}
                    onClick={() => onOpenRecord(row.id)}
                    className={cn(
                      'ink-panel group relative border-2 border-ink p-4 transition-all hover:-translate-y-1 hover:shadow-ink-lg flex flex-col justify-between cursor-pointer',
                      isSelected ? 'border-lime bg-lime/10' : 'bg-card'
                    )}
                  >
                    <div>
                      {/* Top bar: Checkbox, ID badge, Active Status */}
                      <div className="flex items-center justify-between gap-2 border-b border-ink/15 pb-2.5">
                        <div
                          className="flex items-center gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            aria-label={`Select record #${row.id}`}
                            checked={isSelected}
                            onChange={() => toggleSelect(row.id as number)}
                            className="size-4 cursor-pointer accent-lime border-2 border-ink rounded-none bg-paper"
                          />
                          <span className="font-mono text-xs font-bold text-ink-soft">
                            #{row.id}
                          </span>
                        </div>
                        {row.active !== undefined && (
                          <span
                            className={cn(
                              'border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase',
                              row.active !== false
                                ? 'border-lime bg-lime/20 text-lime-800 dark:text-lime-300'
                                : 'border-ink/30 bg-card text-ink-faint'
                            )}
                          >
                            {row.active !== false ? 'Active' : 'Archived'}
                          </span>
                        )}
                      </div>

                      {/* Card Title */}
                      <div className="py-3">
                        <h3 className="font-display text-lg uppercase tracking-wide text-ink group-hover:text-lime-600 transition-colors line-clamp-2">
                          {titleValue || `#${row.id}`}
                        </h3>
                        {titleField && titleField.name !== 'name' && (
                          <span className="font-mono text-[10px] text-ink-faint uppercase">
                            {titleField.label}
                          </span>
                        )}
                      </div>

                      {/* Detail Fields */}
                      <div className="space-y-1.5 border-t border-dashed border-ink/15 pt-2 font-mono text-xs">
                        {detailCols.map((col) => (
                          <div
                            key={col.name}
                            className="flex items-center justify-between gap-2 text-ink-soft"
                          >
                            <span className="text-[11px] text-ink-faint uppercase truncate max-w-[45%]">
                              {col.label}:
                            </span>
                            <div className="truncate text-right">
                              <FieldCell field={col} row={row} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="mt-4 flex items-center justify-between border-t border-ink/15 pt-2.5">
                      <span className="font-mono text-[10px] text-ink-faint">
                        {row.write_date
                          ? new Date(String(row.write_date)).toLocaleDateString()
                          : '—'}
                      </span>
                      <Button
                        variant="ghost"
                        size="xs"
                        className="font-mono text-xs group-hover:bg-lime group-hover:text-on-accent"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenRecord(row.id);
                        }}
                      >
                        Inspect →
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Shared Pagination Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-2 border-ink bg-paper px-4 py-3 font-mono text-xs shadow-ink">
        <div className="text-ink-soft">
          Showing <span className="font-bold text-ink">{total === 0 ? 0 : offset + 1}</span> to{' '}
          <span className="font-bold text-ink">{Math.min(offset + pageSize, total)}</span> of{' '}
          <span className="font-bold text-ink">{total}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page <= 1 || isPlaceholderData}
            onClick={() => setPage(1)}
            title="First Page"
          >
            <ChevronsLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page <= 1 || isPlaceholderData}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            title="Previous Page"
          >
            <ChevronLeft className="size-4" />
          </Button>

          <span className="border-2 border-ink bg-paper-raised px-3 py-1 font-bold">
            {page} / {totalPages}
          </span>

          <Button
            variant="outline"
            size="icon-sm"
            disabled={page >= totalPages || isPlaceholderData}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            title="Next Page"
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page >= totalPages || isPlaceholderData}
            onClick={() => setPage(totalPages)}
            title="Last Page"
          >
            <ChevronsRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Floating Batch Action Toolbar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 border-2 border-ink bg-paper px-4 py-2.5 shadow-[4px_4px_0_0_var(--ink)] animate-in fade-in slide-in-from-bottom-5">
          <span className="border-2 border-ink bg-lime px-2.5 py-1 font-mono text-xs font-bold text-on-accent">
            {selectedIds.length} SELECTED
          </span>

          {views.permissions.unlink && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkArchive}
              disabled={isBulkArchiving}
              className="gap-1.5 hover:bg-pink hover:text-white"
            >
              {isBulkArchiving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Archive className="size-3.5" />
              )}
              Bulk Archive
            </Button>
          )}

          <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-1.5">
            <Download className="size-3.5" />
            Export CSV
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds([])}
            className="font-mono text-xs hover:bg-ink hover:text-paper"
          >
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}
