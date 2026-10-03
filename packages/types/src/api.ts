export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  details?: unknown;
}

export interface ApiListResponse<T = unknown> {
  success: boolean;
  model: string;
  count: number;
  total?: number;
  data: T[];
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  statusCode?: number;
  type?: string;
  details?: unknown;
}

export interface PaginationParams {
  limit?: number;
  offset?: number;
  page?: number;
}

export type SortOrder = 'asc' | 'desc';
