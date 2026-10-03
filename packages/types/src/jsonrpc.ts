import type { JsonValue } from './domain.js';

export interface JsonRpcRequest<P = JsonValue> {
  jsonrpc: '2.0';
  method: string;
  params?: P;
  id: string | number | null;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: JsonValue;
}

export interface JsonRpcResponse<R = JsonValue> {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: R;
  error?: JsonRpcError;
}

export interface ExecuteKwParams {
  service: 'object';
  method: 'execute_kw';
  args: [string, string, JsonValue[]?, Record<string, JsonValue>?];
}
