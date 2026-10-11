export type DomainOperator =
  | '='
  | '!='
  | '<>'
  | '>'
  | '>='
  | '<'
  | '<='
  | 'like'
  | 'ilike'
  | 'not like'
  | 'not ilike'
  | '=like'
  | 'in'
  | 'not in'
  | 'is null'
  | 'is not null';

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type DomainLeaf = [string, DomainOperator, JsonValue] | [string, JsonValue];

export type DomainLogical = '&' | '|' | '!';

export type DomainItem = DomainLeaf | DomainLogical;

export type Domain = DomainItem[];

export interface SearchOptions {
  offset?: number;
  limit?: number;
  order?: string;
  fields?: string[];
  activeTest?: boolean;
  withGraphFetched?: string;
  context?: ModelContext;
  transaction?: object;
}

export interface GroupCountOptions extends Pick<
  SearchOptions,
  'activeTest' | 'context' | 'transaction'
> {
  /** Maximum number of distinct groups returned (1–500). */
  limit?: number;
  /** Number of groups to skip, bounded by the API. */
  offset?: number;
}

export interface GroupCountRow {
  values: Record<string, JsonValue>;
  count: number;
}

export interface GroupCountPage {
  groups: GroupCountRow[];
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface SearchReadOptions extends SearchOptions {
  fields?: string[];
}

export interface ModelContext {
  userId?: number;
  role?: string;
  companyId?: number;
  lang?: string;
  tz?: string;
  activeTest?: boolean;
  [key: string]: JsonValue | undefined;
}
