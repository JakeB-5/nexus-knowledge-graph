export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

export interface GraphTraversalOptions {
  maxDepth: number;
  maxNodes: number;
  edgeTypes?: string[];
  direction?: "outgoing" | "incoming" | "both";
}

export interface SearchQuery {
  text: string;
  nodeTypes?: string[];
  limit?: number;
  offset?: number;
  semantic?: boolean;
}

export interface SearchResult<T> {
  item: T;
  score: number;
  highlights?: string[];
}

export interface WebSocketMessage<T = unknown> {
  type: string;
  payload: T;
  timestamp: number;
  senderId?: string;
}

export interface PresenceInfo {
  userId: string;
  nodeId: string;
  cursor?: { line: number; column: number };
  lastSeen: number;
}
