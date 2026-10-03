import {
  Model,
  type QueryBuilder,
  type Transaction,
  type ModelOptions,
  type QueryContext,
} from 'objection';
import { applyDomain } from './domain.js';
import { Environment } from './environment.js';
import type { Domain, ModelContext, SearchOptions, SearchReadOptions } from './types.js';

export class BaseModel extends Model {
  /**
   * Model identifier in dot-notation (e.g. 'base.user', 'base.item').
   * Must be overridden by subclasses.
   */
  static modelName: string;

  /**
   * Default ordering for queries (e.g. 'id desc', 'name asc').
   */
  static defaultOrder: string = 'id desc';
  static exposedActions: readonly string[] = ['action_archive', 'action_unarchive'];
  static hiddenFields: readonly string[] = [];
  static uniqueConstraints: readonly (readonly string[])[] = [];

  /**
   * The Environment associated with this model class execution.
   */
  private static _env?: Environment;

  static get env(): Environment {
    if (!this._env) {
      this._env = new Environment();
    }
    return this._env;
  }

  static set env(value: Environment) {
    this._env = value;
  }

  // --- Standard Audit & Status Fields ---
  id!: number;
  active?: boolean;
  create_date?: string;
  write_date?: string;
  create_uid?: number | null;
  write_uid?: number | null;

  /**
   * Lifecycle hook: executed before inserting into the database.
   */
  override async $beforeInsert(context: QueryContext) {
    await super.$beforeInsert(context);

    const now = new Date().toISOString();
    if (this.active === undefined) {
      this.active = true;
    }
    if (!this.create_date) {
      this.create_date = now;
    }
    if (!this.write_date) {
      this.write_date = now;
    }

    const currentUserId = (this.$modelClass as unknown as typeof BaseModel).env?.context?.userId;
    if (currentUserId !== undefined && this.create_uid === undefined) {
      this.create_uid = currentUserId;
    }
    if (currentUserId !== undefined && this.write_uid === undefined) {
      this.write_uid = currentUserId;
    }
  }

  /**
   * Lifecycle hook: executed when parsing database rows into Model instances.
   * Ensures booleans (like active or is_company) are always boolean types across PostgreSQL and SQLite.
   */
  override $parseDatabaseJson(json: Record<string, unknown>) {
    json = super.$parseDatabaseJson(json);

    if (json.active !== undefined && typeof json.active === 'number') {
      json.active = json.active === 1;
    }

    const schema = (this.constructor as typeof Model).jsonSchema;
    if (schema?.properties) {
      for (const [key, prop] of Object.entries(schema.properties)) {
        if (
          typeof prop === 'object' &&
          prop !== null &&
          'type' in prop &&
          prop.type === 'boolean' &&
          typeof json[key] === 'number'
        ) {
          json[key] = json[key] === 1;
        }
      }
    }

    return json;
  }

  /**
   * Lifecycle hook: executed before updating a record.
   */
  override async $beforeUpdate(opt: ModelOptions, context: QueryContext) {
    await super.$beforeUpdate(opt, context);

    this.write_date = new Date().toISOString();
    const currentUserId = (this.$modelClass as unknown as typeof BaseModel).env?.context?.userId;
    if (currentUserId !== undefined) {
      this.write_uid = currentUserId;
    }
  }

  /**
   * Display name / string representation.
   */
  get display_name(): string {
    return (
      ('name' in this && typeof this.name === 'string' ? this.name : undefined) || `[${this.id}]`
    );
  }

  /**
   * Resolves the active transaction from options or current environment.
   */
  protected static resolveTrx(optionsTrx?: Transaction): Transaction | undefined {
    return optionsTrx || this.env?.trx;
  }

  /**
   * Resolves context merged from environment and options.
   */
  protected static resolveContext(optionsContext?: ModelContext): ModelContext {
    return {
      ...(this.env?.context || {}),
      ...(optionsContext || {}),
    };
  }

  /**
   * Create single record or multiple records.
   *
   * @example
   * ```ts
   * const record = await MyModel.create({ name: 'Item 1' });
   * const records = await MyModel.create([{ name: 'A' }, { name: 'B' }]);
   * ```
   */
  static async create<M extends BaseModel>(
    this: { new (): M } & typeof BaseModel,
    vals: Partial<M> | Partial<M>[] | Record<string, unknown> | Record<string, unknown>[],
    options: { context?: ModelContext; transaction?: Transaction } = {}
  ): Promise<M | M[]> {
    const trx = this.resolveTrx(options.transaction as Transaction | undefined);

    if (Array.isArray(vals)) {
      if (vals.length === 0) return [];
      const created = await this.query(trx).insertAndFetch(vals as Record<string, unknown>[]);
      return created as unknown as M[];
    } else {
      const created = await this.query(trx).insertAndFetch(vals as Record<string, unknown>);
      return created as unknown as M;
    }
  }

  /**
   * Instance method to update this record.
   *
   * @example
   * ```ts
   * await record.write({ name: 'Updated' });
   * ```
   */
  async write(
    vals: Partial<this> | Record<string, unknown>,
    options: { context?: ModelContext; transaction?: Transaction } = {}
  ): Promise<this> {
    const ModelClass = this.$modelClass as unknown as typeof BaseModel;
    const trx = ModelClass.resolveTrx(options.transaction);

    const updated = await this.$query(trx).patchAndFetch(vals as Record<string, unknown>);
    Object.assign(this, updated);
    return this;
  }

  /**
   * Static method to update multiple records by IDs.
   *
   * @example
   * ```ts
   * await MyModel.write([1, 2], { active: false });
   * ```
   */
  static async write<M extends BaseModel>(
    this: { new (): M } & typeof BaseModel,
    ids: number | number[],
    vals: Partial<M> | Record<string, unknown>,
    options: { context?: ModelContext; transaction?: Transaction } = {}
  ): Promise<number> {
    const trx = this.resolveTrx(options.transaction as Transaction | undefined);
    const idList = Array.isArray(ids) ? ids : [ids];
    if (idList.length === 0) return 0;

    const patchedCount = await this.query(trx)
      .whereIn('id', idList)
      .patch({
        ...(vals as Record<string, unknown>),
        write_date: new Date().toISOString(),
        ...(this.env?.context?.userId !== undefined ? { write_uid: this.env.context.userId } : {}),
      });

    return patchedCount;
  }

  /**
   * Instance method to delete (soft-delete / archive by default).
   * If hardDelete is true, permanently deletes the record from DB.
   */
  async unlink(hardDelete = false, options: { transaction?: Transaction } = {}): Promise<boolean> {
    const ModelClass = this.$modelClass as unknown as typeof BaseModel;
    const trx = ModelClass.resolveTrx(options.transaction);

    if (hardDelete) {
      const rows = await this.$query(trx).delete();
      return rows > 0;
    } else {
      await this.write({ active: false }, options);
      return true;
    }
  }

  /**
   * Static method to delete or archive multiple records by ID.
   */
  static async unlink<M extends BaseModel>(
    this: { new (): M } & typeof BaseModel,
    ids: number | number[],
    hardDelete = false,
    options: { transaction?: Transaction } = {}
  ): Promise<number> {
    const trx = this.resolveTrx(options.transaction as Transaction | undefined);
    const idList = Array.isArray(ids) ? ids : [ids];
    if (idList.length === 0) return 0;

    if (hardDelete) {
      return await this.query(trx).whereIn('id', idList).delete();
    } else {
      return await this.write(idList, { active: false }, options);
    }
  }

  /**
   * Search records matching a filter domain.
   *
   * @example
   * ```ts
   * const records = await MyModel.search([
   *   ['active', '=', true],
   *   ['name', 'ilike', 'test']
   * ], { limit: 10, order: 'name asc' });
   * ```
   */
  static async search<M extends BaseModel>(
    this: { new (): M } & typeof BaseModel,
    domain: Domain = [],
    options: SearchOptions = {}
  ): Promise<M[]> {
    const qb = this.buildSearchQuery(domain, options);
    const results = await qb;
    return results as unknown as M[];
  }

  /**
   * Search records and returns serializable plain objects with selected fields.
   *
   * @example
   * ```ts
   * const data = await MyModel.search_read(
   *   [['active', '=', true]],
   *   { fields: ['id', 'name'], limit: 5 }
   * );
   * ```
   */
  static async search_read<M extends BaseModel>(
    this: { new (): M } & typeof BaseModel,
    domain: Domain = [],
    options: SearchReadOptions = {}
  ): Promise<Record<string, unknown>[]> {
    const qb = this.buildSearchQuery(domain, options);

    if (options.fields && options.fields.length > 0) {
      if (
        this.hiddenFields.length &&
        options.fields.some(
          (field) => !/^[a-z_][a-z0-9_]*$/i.test(field) || this.hiddenFields.includes(field)
        )
      ) {
        throw Object.assign(new Error('Invalid or private field selection'), { statusCode: 400 });
      }
      // Ensure 'id' is always selected
      const fields = Array.from(new Set(['id', ...options.fields]));
      qb.select(fields);
    }

    const records = await qb;
    return records.map((record) => record.toJSON());
  }

  /**
   * Returns the number of records matching the domain.
   */
  static async search_count<M extends BaseModel>(
    this: { new (): M } & typeof BaseModel,
    domain: Domain = [],
    options: SearchOptions = {}
  ): Promise<number> {
    const qb = this.buildSearchQuery(domain, { ...options, order: '' });
    const countResult: unknown = await qb.count('* as count').first();
    const count =
      typeof countResult === 'object' && countResult !== null && 'count' in countResult
        ? countResult.count
        : undefined;
    return typeof count === 'string' ? parseInt(count, 10) : Number(count || 0);
  }

  /**
   * Loads record(s) by ID(s).
   */
  static async browse<M extends BaseModel>(
    this: { new (): M } & typeof BaseModel,
    ids: number | number[],
    options: SearchOptions = {}
  ): Promise<M | M[] | null> {
    const trx = this.resolveTrx(options.transaction as Transaction | undefined);
    if (Array.isArray(ids)) {
      if (ids.length === 0) return [];
      let qb = this.query(trx).whereIn('id', ids);
      if (options.withGraphFetched) {
        qb = qb.withGraphFetched(options.withGraphFetched);
      }
      return (await qb) as unknown as M[];
    } else {
      let qb = this.query(trx).findById(ids);
      if (options.withGraphFetched) {
        qb = qb.withGraphFetched(options.withGraphFetched);
      }
      const record = await qb;
      return (record ?? null) as unknown as M | null;
    }
  }

  /**
   * Archive record (soft delete).
   */
  async action_archive(): Promise<this> {
    return this.write({ active: false });
  }

  /**
   * Unarchive record.
   */
  async action_unarchive(): Promise<this> {
    return this.write({ active: true });
  }

  /**
   * Private fields (e.g. password hashes) must never be usable as a filter or sort key,
   * otherwise their content could be inferred one comparison at a time.
   */
  private static assertQueryable(domain: Domain, order?: string): void {
    if (this.hiddenFields.length === 0) return;
    const used: string[] = [];
    for (const item of domain) if (Array.isArray(item)) used.push(String(item[0]));
    if (order) {
      for (const part of order.split(',')) used.push(part.trim().split(/\s+/)[0] ?? '');
    }
    if (used.some((field) => this.hiddenFields.includes(field.split('.').pop() ?? field))) {
      throw Object.assign(new Error('Invalid or private field in domain or order'), {
        statusCode: 400,
      });
    }
  }

  /**
   * Helper to construct the query with domain, activeTest, ordering, and pagination.
   */
  private static buildSearchQuery<M extends BaseModel>(
    this: { new (): M } & typeof BaseModel,
    domain: Domain = [],
    options: SearchOptions = {}
  ): QueryBuilder<BaseModel, BaseModel[]> {
    const trx = this.resolveTrx(options.transaction as Transaction | undefined);
    const context = this.resolveContext(options.context);
    this.assertQueryable(domain, options.order);

    let qb: QueryBuilder<BaseModel, BaseModel[]> = this.query(trx);

    // Apply activeTest filter if active field exists and activeTest is true (default)
    const activeTest = options.activeTest ?? context.activeTest ?? true;
    const hasExplicitActiveInDomain = domain.some(
      (item) => Array.isArray(item) && item[0] === 'active'
    );

    if (activeTest && !hasExplicitActiveInDomain) {
      qb = qb.where('active', true);
    }

    // Apply domain AST
    qb = applyDomain(qb, domain);

    // Apply relations eager loading
    if (options.withGraphFetched) {
      qb = qb.withGraphFetched(options.withGraphFetched);
    }

    // Pagination
    if (options.offset !== undefined && options.offset > 0) {
      qb = qb.offset(options.offset);
    }
    if (options.limit !== undefined && options.limit > 0) {
      qb = qb.limit(options.limit);
    }

    // Ordering
    const orderClause = options.order === undefined ? this.defaultOrder : options.order;
    if (orderClause) {
      const parts = orderClause.split(',').map((s) => s.trim());
      for (const part of parts) {
        const [col, dir] = part.split(/\s+/);
        qb = qb.orderBy(col, (dir?.toLowerCase() as 'asc' | 'desc') || 'asc');
      }
    }

    return qb;
  }
}
