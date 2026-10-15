export type Role = 'system' | 'superadmin' | 'user';

export interface UserProfile {
  id: number;
  login: string;
  role: Role;
  partner_id?: number;
  company_id?: number;
  language_id?: number | null;
  timezone?: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  refresh_expires_at?: string;
  user: UserProfile;
}

export interface LoginParams {
  login: string;
  password: string;
}

export interface RegisterParams {
  login: string;
  password: string;
  name?: string;
  email?: string;
}

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
  name: string;
  type: FieldType;
  label: string;
  help?: string;
  required: boolean;
  readonly: boolean;
  unique: boolean;
  writeOnly?: boolean;
  default?: string | number | boolean;
  selection?: { value: string; label: string }[];
  relation?: string;
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
  fields: string[];
  filters: SearchFilter[];
}

/** What the caller may do on a model; drives which buttons a UI shows. */
export interface ModelPermissions {
  read: boolean;
  create: boolean;
  write: boolean;
  unlink: boolean;
}

export interface ModelInfo {
  model: string;
  table: string;
  menu: {
    label?: string;
    group: string;
    sequence: number;
    developmentOnly: boolean;
  };
}

export interface ModelFields {
  model: string;
  permissions: ModelPermissions;
  fields: FieldMeta[];
}

export interface ResolvedViews {
  model: string;
  title: string;
  permissions: ModelPermissions;
  fields: FieldMeta[];
  list: ListView;
  form: FormView;
  search: SearchView;
  actions?: string[];
}

export type DomainTerm = [string, string, unknown];
/** Odoo-style prefix (Polish) notation: `['|', a, b]` means a OR b; terms are ANDed by default. */
export type DomainItem = DomainTerm | [string, unknown] | '&' | '|' | '!';
export type Domain = DomainItem[];

export interface SearchReadOptions {
  domain?: Domain;
  fields?: string[];
  offset?: number;
  /** Server default 80, max 500. */
  limit?: number;
  order?: string;
  /** Objection relation expression, e.g. `partner.company`. */
  with?: string;
  /** Also return the total match count (extra query); needed for pagination. */
  count?: boolean;
}

export interface SearchReadResult<T = Record<string, unknown>> {
  records: T[];
  /** Only present when `count: true` was requested. */
  total?: number;
}

export type GroupCountValue = string | number | boolean | null;

export interface GroupCountOptions {
  domain?: Domain;
  groupBy: readonly string[];
  /** Server default 100, maximum 500 groups. */
  limit?: number;
  /** Server default 0, maximum 10,000. Use `hasMore` from the result to continue. */
  offset?: number;
}

export interface GroupCountRow {
  values: Record<string, GroupCountValue>;
  count: number;
}

export interface GroupCountResult {
  model: string;
  groupBy: string[];
  groups: GroupCountRow[];
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface TokenStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

export interface MoonWitnessClientOptions {
  baseUrl: string;
  storage?: TokenStorage;
  storageKey?: string;
  onSessionExpired?: () => void;
  fetch?: typeof fetch;
}
