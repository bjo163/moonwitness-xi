import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import type { FieldMeta } from '@moonwitness/client';
import { client } from '@/lib/client';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Row = Record<string, unknown>;

/** Relation key Objection uses for a many2one column: `partner_id` → `partner`. */
export const relationKey = (field: FieldMeta) => field.name.replace(/_id$/, '');

/** Best human label for a related record. */
export function displayName(record: Row | null | undefined): string {
  if (!record) return '';
  for (const key of ['name', 'display_name', 'login', 'code', 'email']) {
    if (typeof record[key] === 'string' && record[key]) return record[key] as string;
  }
  return `#${String(record.id)}`;
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/* ─────────────────────────────── Read-only cell ─────────────────────────────── */

export function FieldCell({ field, row }: { field: FieldMeta; row: Row }) {
  const value = row[field.name];
  if (value === null || value === undefined || value === '') {
    return <span className="text-ink-faint">—</span>;
  }
  switch (field.type) {
    case 'boolean':
      if (field.name === 'active') {
        return value ? (
          <span className="inline-block -rotate-2 border-2 border-ink bg-lime px-2 text-xs font-bold uppercase text-on-accent">
            Active
          </span>
        ) : (
          <span className="crosshatch inline-block rotate-1 border-2 border-ink px-2 text-xs font-bold uppercase text-ink-soft">
            Archived
          </span>
        );
      }
      return value ? (
        <Check className="size-4" strokeWidth={3} />
      ) : (
        <X className="size-4 text-ink-faint" />
      );
    case 'selection': {
      const label =
        field.selection?.find((option) => option.value === value)?.label ?? String(value);
      return (
        <span className="border-2 border-ink px-1.5 font-mono text-xs uppercase">{label}</span>
      );
    }
    case 'many2one': {
      const related = row[relationKey(field)] as Row | undefined;
      return related ? (
        <span className="font-medium">{displayName(related)}</span>
      ) : (
        <span className="font-mono text-xs text-ink-faint">#{String(value)}</span>
      );
    }
    case 'datetime':
      return (
        <span className="font-mono text-xs">{dateFormat.format(new Date(String(value)))}</span>
      );
    case 'integer':
      return <span className="font-mono tabular-nums">{String(value)}</span>;
    case 'password':
      return <span className="font-mono text-ink-faint">••••••</span>;
    default:
      return <span className="truncate">{String(value)}</span>;
  }
}

/* ─────────────────────────────── Editable widget ─────────────────────────────── */

interface WidgetProps {
  field: FieldMeta;
  value: unknown;
  onChange(value: unknown): void;
  /** Loaded relation object for many2one labels. */
  related?: Row | null;
  invalid?: boolean;
  id: string;
}

export function FieldWidget({ field, value, onChange, related, invalid, id }: WidgetProps) {
  const common = { id, 'aria-invalid': invalid || undefined, disabled: field.readonly };
  switch (field.type) {
    case 'boolean':
      return (
        <Switch
          {...common}
          checked={Boolean(value)}
          onCheckedChange={(checked) => onChange(checked)}
        />
      );
    case 'integer':
      return (
        <Input
          {...common}
          type="number"
          step={1}
          value={value === null || value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="font-mono"
        />
      );
    case 'selection':
      return (
        <Select
          value={value ? String(value) : undefined}
          onValueChange={onChange}
          disabled={field.readonly}
        >
          <SelectTrigger {...common} className="w-full">
            <SelectValue placeholder="Pick one…" />
          </SelectTrigger>
          <SelectContent>
            {field.selection?.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'many2one':
      return (
        <Many2oneWidget
          {...common}
          field={field}
          value={value as number | null}
          onChange={onChange}
          related={related}
        />
      );
    case 'password':
      return (
        <Input
          {...common}
          type="password"
          autoComplete="new-password"
          placeholder={field.help ?? 'Leave empty to keep the current one'}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'datetime':
      return (
        <Input
          {...common}
          disabled
          value={value ? dateFormat.format(new Date(String(value))) : ''}
          readOnly
        />
      );
    default:
      return (
        <Input
          {...common}
          value={typeof value === 'string' ? value : value == null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

/** Searchable relation picker: queries the target model with `ilike` as you type. */
function Many2oneWidget({
  field,
  value,
  onChange,
  related,
  id,
  disabled,
  ...aria
}: {
  field: FieldMeta;
  value: number | null;
  onChange(value: unknown): void;
  related?: Row | null;
  id: string;
  disabled?: boolean;
  'aria-invalid'?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [picked, setPicked] = useState<Row | null>(null);
  const target = field.relation!;

  const { data, isFetching, error } = useQuery({
    queryKey: ['m2o', target, term],
    queryFn: () =>
      client.model<Row>(target).searchRead({
        domain: term ? [['name', 'ilike', `%${term}%`]] : [],
        limit: 20,
      }),
    enabled: open,
    staleTime: 30_000,
  });

  const label = value ? displayName(picked?.id === value ? picked : related) || `#${value}` : '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-invalid={aria['aria-invalid']}
          className={cn(
            'flex h-10 w-full items-center gap-2 rounded-sm border-2 border-ink bg-paper-raised px-3 text-left text-sm disabled:opacity-50 aria-invalid:border-pink',
            !value && 'text-ink-faint'
          )}
        >
          <span className="truncate">{label || `Pick a ${field.label.toLowerCase()}…`}</span>
          {value && !disabled && (
            <X
              className="ml-auto size-4 shrink-0 hover:text-pink"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
            />
          )}
          <ChevronsUpDown className={cn('size-4 shrink-0', !value && 'ml-auto')} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={`Search ${field.label.toLowerCase()}…`}
            value={term}
            onValueChange={setTerm}
          />
          <CommandList>
            <CommandEmpty>
              {error ? 'You cannot browse this model.' : isFetching ? 'Searching…' : 'No match.'}
            </CommandEmpty>
            <CommandGroup>
              {data?.records.map((record) => (
                <CommandItem
                  key={String(record.id)}
                  value={String(record.id)}
                  onSelect={() => {
                    setPicked(record);
                    onChange(record.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn('size-4', record.id === value ? 'opacity-100' : 'opacity-0')}
                  />
                  {displayName(record)}
                  <span className="ml-auto font-mono text-xs text-ink-faint">
                    #{String(record.id)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
