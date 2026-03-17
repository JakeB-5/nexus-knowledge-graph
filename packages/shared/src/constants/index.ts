export const MAX_GRAPH_DEPTH = 10;
export const MAX_TRAVERSAL_NODES = 1000;
export const MAX_SEARCH_QUERY_LENGTH = 500;
export const MAX_CONTENT_LENGTH = 100_000;
export const MAX_TITLE_LENGTH = 500;
export const MAX_BATCH_SIZE = 100;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const EMBEDDING_DIMENSIONS = 1536;

export const JWT_ACCESS_TOKEN_EXPIRY = "15m";
export const JWT_REFRESH_TOKEN_EXPIRY = "7d";

export const RATE_LIMIT = {
  WINDOW_MS: 60_000,
  MAX_REQUESTS: 100,
  GRAPH_QUERY_MAX: 20,
} as const;

export const WS_EVENTS = {
  NODE_CREATED: "node:created",
  NODE_UPDATED: "node:updated",
  NODE_DELETED: "node:deleted",
  EDGE_CREATED: "edge:created",
  EDGE_DELETED: "edge:deleted",
  PRESENCE_UPDATE: "presence:update",
  PRESENCE_LEAVE: "presence:leave",
  CURSOR_MOVE: "cursor:move",
} as const;
