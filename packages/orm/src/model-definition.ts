import type { JSONSchema, RelationMappings, QueryContext, ModelOptions } from 'objection';
import { BaseModel } from './base.model.js';
import { hashPassword } from './password.js';
import type { Domain } from './types.js';

type Scalar = string | number | boolean;
export interface FieldOptions<T extends Scalar = Scalar> {
  required?: boolean;
  unique?: boolean;
  default?: T;
  /** Human-readable label for generated UIs; defaults to the humanized field name. */
  label?: string;
  /** Tooltip / helper text for generated UIs. */
  help?: string;
  /** Optional regular expression used by generated JSON Schema validation. */
  pattern?: string;
  /** Conditional visibility based on domain */
  invisible?: Domain | boolean;
  /** Conditional readonly based on domain */
  readonlyIf?: Domain;
  /** Conditional required based on domain */
  requiredIf?: Domain;
}

export interface HasManyOptions {
  label?: string;
  help?: string;
  foreignKey?: string;
  invisible?: Domain | boolean;
}

export interface Field<T extends Scalar = Scalar> extends FieldOptions<T> {
  kind: 'string' | 'text' | 'integer' | 'boolean' | 'enum' | 'belongsTo' | 'hasMany' | 'password';
  values?: readonly string[];
  target?: typeof BaseModel | (() => typeof BaseModel);
  foreignKey?: string;
  /** Type-only marker used to infer the model's record shape. */
  readonly valueType?: T;
}

export const fields = {
  password(options: Pick<FieldOptions<string>, 'label' | 'help'> = {}) {
    return { kind: 'password' as const, ...options } as Field<string> & { kind: 'password' };
  },
  string<const O extends FieldOptions<string>>(options: O = {} as O) {
    return { kind: 'string' as const, ...options } as Field<string> & O;
  },
  text<const O extends FieldOptions<string>>(options: O = {} as O) {
    return { kind: 'text' as const, ...options } as Field<string> & O;
  },
  integer<const O extends FieldOptions<number>>(options: O = {} as O) {
    return { kind: 'integer' as const, ...options } as Field<number> & O;
  },
  boolean<const O extends FieldOptions<boolean>>(options: O = {} as O) {
    return { kind: 'boolean' as const, ...options } as Field<boolean> & O;
  },
  enum<const V extends readonly [string, ...string[]], const O extends FieldOptions<V[number]>>(
    values: V,
    options: O = {} as O
  ) {
    return { kind: 'enum' as const, values, ...options } as Field<V[number]> & O;
  },
  belongsTo<M extends typeof BaseModel, const O extends FieldOptions<number>>(
    target: M | (() => M),
    options: O = {} as O
  ) {
    return { ...options, kind: 'belongsTo' as const, target };
  },
  hasMany<M extends typeof BaseModel>(target: M | (() => M), options: HasManyOptions = {}) {
    return { ...options, kind: 'hasMany' as const, target };
  },
};

export type FieldMap = Readonly<Record<string, Field>>;
type FieldValue<F> = F extends { kind: 'belongsTo' }
  ? number
  : F extends Field<infer V>
    ? V
    : never;
type ColumnName<K, F> = K extends string
  ? F extends { kind: 'belongsTo' }
    ? `${K}_id`
    : K
  : never;
type RequiredField<F> = F extends { required: true } | { default: Scalar } ? true : false;
export type ModelValues<F extends FieldMap> = {
  -readonly [
    K in keyof F as RequiredField<F[K]> extends true ? ColumnName<K, F[K]> : never
  ]: FieldValue<F[K]>;
} & {
  -readonly [
    K in keyof F as RequiredField<F[K]> extends true ? never : ColumnName<K, F[K]>
  ]?: FieldValue<F[K]> | null;
} & {
  -readonly [K in keyof F as F[K] extends { kind: 'belongsTo' } ? K : never]?: F[K] extends {
    target: infer M;
  }
    ? M extends () => infer T
      ? T extends typeof BaseModel
        ? InstanceType<T>
        : BaseModel
      : M extends typeof BaseModel
        ? InstanceType<M>
        : BaseModel
    : never;
};

export type DefinedModel<F extends FieldMap = FieldMap> = typeof BaseModel & {
  new (): BaseModel & ModelValues<F>;
  readonly fields: F;
  readonly uniqueConstraints: readonly (readonly string[])[];
};

export const standardProperties: Record<string, JSONSchema> = {
  id: { type: 'integer' },
  active: { type: 'boolean', default: true },
  create_date: { type: ['string', 'null'] },
  write_date: { type: ['string', 'null'] },
  create_uid: { type: ['integer', 'null'] },
  write_uid: { type: ['integer', 'null'] },
};

export function columnName(name: string, field: Field): string {
  return field.kind === 'belongsTo' ? `${name}_id` : name;
}

function fieldSchema(field: Field): JSONSchema {
  const type =
    field.kind === 'belongsTo'
      ? 'integer'
      : field.kind === 'enum' || field.kind === 'password' || field.kind === 'text'
        ? 'string'
        : field.kind;
  const nonNullable = field.required || field.default !== undefined;
  return {
    type: nonNullable ? type : [type, 'null'],
    ...(field.values ? { enum: nonNullable ? [...field.values] : [...field.values, null] } : {}),
    ...(field.default !== undefined ? { default: field.default } : {}),
    ...(field.pattern !== undefined ? { pattern: field.pattern } : {}),
    ...(type === 'string' && field.kind !== 'text'
      ? {
          maxLength: field.kind === 'password' ? 1024 : 255,
          ...(field.required || field.kind === 'password' ? { minLength: 1 } : {}),
        }
      : {}),
  };
}

/** Define business fields once; validation, relations, storage and TS types follow. */
export function defineModel<const F extends FieldMap>(
  name: string,
  definition: {
    fields: F;
    table?: string;
    order?: string;
    unique?: readonly (readonly (keyof F & string)[])[];
  }
): DefinedModel<F> {
  const tableName = definition.table ?? name.replaceAll('.', '_');
  if (!/^[a-z][a-z0-9_]*$/.test(tableName)) throw new Error(`Invalid table name: ${tableName}`);
  const properties = { ...standardProperties };
  const required: string[] = [];
  const relations: RelationMappings = {};
  for (const [key, field] of Object.entries(definition.fields)) {
    const column = columnName(key, field);
    if (!/^[a-z][a-z0-9_]*$/.test(key) || column in properties) {
      throw new Error(`Invalid or duplicate field: ${name}.${key}`);
    }
    if (field.kind === 'hasMany') {
      continue;
    }
    if (
      field.default !== undefined &&
      field.values &&
      !field.values.includes(String(field.default))
    ) {
      throw new Error(`Invalid default for ${name}.${key}`);
    }
    properties[column] = fieldSchema(field);
    if (field.required && field.default === undefined) required.push(column);
  }

  class DeclaredModel extends BaseModel {
    static override hiddenFields = Object.entries(definition.fields)
      .filter(([, field]) => field.kind === 'password')
      .map(([key]) => key);

    private async hashPasswords() {
      const values = this as unknown as Record<string, unknown>;
      for (const key of DeclaredModel.hiddenFields) {
        if (typeof values[key] === 'string') values[key] = await hashPassword(values[key]);
      }
    }

    override async $beforeInsert(context: QueryContext) {
      await super.$beforeInsert(context);
      await this.hashPasswords();
    }

    override async $beforeUpdate(options: ModelOptions, context: QueryContext) {
      await super.$beforeUpdate(options, context);
      await this.hashPasswords();
    }

    override $formatJson(json: Record<string, unknown>): Record<string, unknown> {
      const result: Record<string, unknown> = super.$formatJson(json);
      for (const key of DeclaredModel.hiddenFields) delete result[key];
      return result;
    }
    static override modelName = name;
    static override tableName = tableName;
    static override defaultOrder = definition.order ?? 'id asc';
    static fields = definition.fields;
    static override uniqueConstraints = (definition.unique ?? []).map((fields) => [...fields]);
    static override jsonSchema: JSONSchema = {
      type: 'object',
      additionalProperties: false,
      properties,
      required,
    };

    private static _customRelationMappings?: RelationMappings;

    static override get relationMappings(): RelationMappings {
      const rels: RelationMappings = {};
      const resolveTarget = (t: unknown): typeof BaseModel | undefined => {
        if (!t) return undefined;
        if (typeof t === 'function' && !('tableName' in t)) {
          return (t as () => typeof BaseModel)();
        }
        return t as typeof BaseModel;
      };

      for (const [key, field] of Object.entries(definition.fields)) {
        const column = columnName(key, field);
        if (field.kind === 'hasMany') {
          const target = resolveTarget(field.target);
          if (target) {
            const foreignKey = field.foreignKey ?? `${name.split('.').pop()}_id`;
            rels[key] = {
              relation: BaseModel.HasManyRelation,
              modelClass: target,
              join: { from: `${tableName}.id`, to: `${target.tableName}.${foreignKey}` },
            };
          }
        } else if (field.kind === 'belongsTo') {
          const target = resolveTarget(field.target);
          if (target) {
            rels[key] = {
              relation: BaseModel.BelongsToOneRelation,
              modelClass: target,
              join: { from: `${tableName}.${column}`, to: `${target.tableName}.id` },
            };
          }
        }
      }
      return { ...rels, ...this._customRelationMappings };
    }

    static override set relationMappings(value: RelationMappings) {
      this._customRelationMappings = { ...value };
    }
  }
  return DeclaredModel as DefinedModel<F>;
}
