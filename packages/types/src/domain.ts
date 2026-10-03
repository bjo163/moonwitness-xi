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

export interface SearchReadOptions extends SearchOptions {
  fields?: string[];
}

export interface ModelContext {
  userId?: number;
  lang?: string;
  tz?: string;
  activeTest?: boolean;
  [key: string]: JsonValue | undefined;
}
