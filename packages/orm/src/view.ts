import type { BaseModel } from './base.model.js';
import { columnName, type Field, type FieldMap } from './model-definition.js';
import type { Domain } from './types.js';

/** Type names a generic UI renders; stable public contract of the metadata API. */
export type FieldType =
  | 'integer'
  | 'string'
  | 'boolean'
  | 'selection'
  | 'many2one'
  | 'one2many'
  | 'password'
  | 'datetime';

export interface FieldMeta {
  /** Column name used in API payloads (e.g. `partner_id` for a relation). */
  name: string;
  type: FieldType;
  label: string;
  help?: string;
  required: boolean;
  readonly: boolean;
  unique: boolean;
  /** Accepted on write but never returned by the API. */
  writeOnly?: boolean;
  default?: string | number | boolean;
  selection?: { value: string; label: string }[];
  /** Target model for `many2one` and `one2many`. */
  relation?: string;
  /** Foreign key on target model for `one2many`. */
  foreignKey?: string;
  invisible?: Domain | boolean;
  readonlyIf?: Domain;
  requiredIf?: Domain;
}

export interface ListView {
  columns: string[];
  order?: string;
}

export interface FormSection {
  title?: string;
  fields: string[];
}

export interface FormView {
  sections: FormSection[];
}

export interface SearchFilter {
  label: string;
  domain: Domain;
}

export interface SearchView {
  /** Fields matched with `ilike` by the free-text search box. */
  fields: string[];
  filters: SearchFilter[];
}

export interface ViewSpec {
  title?: string;
  list?: Partial<ListView>;
  form?: Partial<FormView>;
  search?: Partial<SearchView>;
}

export interface ViewDefinition {
  readonly model: string;
  readonly spec: ViewSpec;
}

export interface ResolvedViews {
  model: string;
  title: string;
  fields: FieldMeta[];
  list: ListView;
  form: FormView;
  search: SearchView;
  actions?: string[];
}

const AUDIT_FIELDS: FieldMeta[] = [
  { name: 'id', type: 'integer', label: 'ID', required: false, readonly: true, unique: true },
  {
    name: 'active',
    type: 'boolean',
    label: 'Active',
    required: false,
    readonly: false,
    unique: false,
    default: true,
  },
  {
    name: 'create_date',
    type: 'datetime',
    label: 'Created On',
    required: false,
    readonly: true,
    unique: false,
  },
  {
    name: 'write_date',
    type: 'datetime',
    label: 'Last Updated On',
    required: false,
    readonly: true,
    unique: false,
  },
];
const AUDIT_NAMES = new Set(AUDIT_FIELDS.map((field) => field.name));

export function humanize(name: string): string {
  const words = name.replace(/_id$/, '').replaceAll(/[_.]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function hasFields(model: typeof BaseModel): model is typeof BaseModel & { fields: FieldMap } {
  return typeof (model as { fields?: unknown }).fields === 'object';
}

function describeField(key: string, field: Field): FieldMeta {
  const type: FieldType =
    field.kind === 'belongsTo'
      ? 'many2one'
      : field.kind === 'hasMany'
        ? 'one2many'
        : field.kind === 'enum'
          ? 'selection'
          : field.kind === 'text'
            ? 'string'
            : field.kind;
  return {
    name: columnName(key, field),
    type,
    label: field.label ?? humanize(key),
    ...(field.help ? { help: field.help } : {}),
    required: Boolean(field.required) && field.default === undefined,
    readonly: false,
    unique: Boolean(field.unique),
    ...(field.kind === 'password' ? { writeOnly: true } : {}),
    ...(field.default !== undefined ? { default: field.default } : {}),
    ...(field.values
      ? { selection: field.values.map((value) => ({ value, label: humanize(value) })) }
      : {}),
    ...(() => {
      if (!field.target) return {};
      const target =
        typeof field.target === 'function' && !('tableName' in field.target)
          ? (field.target as () => typeof BaseModel)()
          : (field.target as typeof BaseModel);
      return target?.modelName ? { relation: target.modelName } : {};
    })(),
    ...(field.foreignKey ? { foreignKey: field.foreignKey } : {}),
    ...(field.invisible !== undefined ? { invisible: field.invisible } : {}),
    ...(field.readonlyIf !== undefined ? { readonlyIf: field.readonlyIf } : {}),
    ...(field.requiredIf !== undefined ? { requiredIf: field.requiredIf } : {}),
  };
}

/** Fallback for hand-written models without `fields`: derive from the JSON schema. */
function describeFromSchema(model: typeof BaseModel): FieldMeta[] {
  const properties = (model.jsonSchema?.properties ?? {}) as Record<string, { type?: unknown }>;
  const required = new Set((model.jsonSchema?.required as string[] | undefined) ?? []);
  return Object.entries(properties)
    .filter(([name]) => !AUDIT_NAMES.has(name) && !model.hiddenFields.includes(name))
    .map(([name, schema]) => {
      const raw = Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') : schema.type;
      const type: FieldType = raw === 'integer' || raw === 'boolean' ? raw : 'string';
      return {
        name,
        type,
        label: humanize(name),
        required: required.has(name),
        readonly: false,
        unique: false,
      };
    });
}

/** Field metadata for a model: business fields first, then audit fields. */
export function describeFields(model: typeof BaseModel): FieldMeta[] {
  const business = hasFields(model)
    ? Object.entries(model.fields).map(([key, field]) => describeField(key, field))
    : describeFromSchema(model);
  return [...business, ...AUDIT_FIELDS.map((field) => ({ ...field }))];
}

/** Registry of explicit views, filled by installAddons; models without one get defaults. */
const views = new Map<string, ViewSpec>();

/** Declare list/form/search views for a model using field keys from `defineModel`. */
export function defineView(
  model: typeof BaseModel & { fields: FieldMap },
  spec: ViewSpec
): ViewDefinition {
  const toColumn = (key: string) => {
    if (AUDIT_NAMES.has(key)) return key;
    const field = model.fields[key];
    if (!field) throw new Error(`Unknown field in view for ${model.modelName}: ${key}`);
    if (field.kind === 'password' && spec.list?.columns?.includes(key)) {
      throw new Error(`Write-only field cannot be a list column: ${model.modelName}.${key}`);
    }
    return columnName(key, field);
  };
  const resolved: ViewSpec = {
    ...spec,
    ...(spec.list ? { list: { ...spec.list, columns: spec.list.columns?.map(toColumn) } } : {}),
    ...(spec.form
      ? {
          form: {
            sections: spec.form.sections?.map((s) => ({ ...s, fields: s.fields.map(toColumn) })),
          },
        }
      : {}),
    ...(spec.search
      ? { search: { ...spec.search, fields: spec.search.fields?.map(toColumn) } }
      : {}),
  };
  return Object.freeze({ model: model.modelName, spec: resolved });
}

export function registerView(view: ViewDefinition): void {
  views.set(view.model, view.spec);
}

/** Merge an explicit view (if any) with sensible defaults derived from field metadata. */
export function resolveViews(model: typeof BaseModel): ResolvedViews {
  const fields = describeFields(model);
  const spec = views.get(model.modelName) ?? {};
  const business = fields.filter((field) => !AUDIT_NAMES.has(field.name));
  const visible = business.filter((field) => !field.writeOnly);
  const editable = business;
  return {
    model: model.modelName,
    title: spec.title ?? humanize(model.modelName.split('.').pop() ?? model.modelName),
    fields,
    list: {
      columns: spec.list?.columns ?? visible.slice(0, 6).map((field) => field.name),
      order: spec.list?.order ?? model.defaultOrder,
    },
    form: {
      sections: spec.form?.sections ?? [{ fields: editable.map((field) => field.name) }],
    },
    search: {
      fields:
        spec.search?.fields ??
        visible.filter((field) => field.type === 'string').map((field) => field.name),
      filters: spec.search?.filters ?? [],
    },
    actions: [...(model.exposedActions ?? [])],
  };
}
