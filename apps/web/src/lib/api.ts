// Client-side API utilities for Nexus dashboard

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api";

// ---------------------------------------------------------------------------
// Generic fetch wrapper
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    ...options,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Type definitions (mirrors backend DTOs)
// ---------------------------------------------------------------------------

export interface Node {
  id: string;
  title: string;
  type: string;
  content?: string;
  ownerId: string;
  ownerName: string;
  createdAt: string;
  updatedAt: string;
  connectionCount: number;
}

export interface Edge {
  id: string;
  sourceId: string;
  sourceTitle: string;
  targetId: string;
  targetTitle: string;
  type: string;
  weight: number;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "editor" | "viewer";
  status: "active" | "inactive";
  avatarUrl?: string;
  joinedAt: string;
  lastActiveAt: string;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
}

export interface DashboardStats {
  totalNodes: number;
  totalEdges: number;
  totalUsers: number;
  searchesToday: number;
  nodesDelta: number;
  edgesDelta: number;
  usersDelta: number;
  searchesDelta: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ActivityEvent {
  id: string;
  type: "node_created" | "node_updated" | "node_deleted" | "user_joined" | "edge_created" | "search";
  actorName: string;
  actorAvatar?: string;
  description: string;
  targetId?: string;
  targetTitle?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export const nodesApi = {
  list: (params?: { page?: number; pageSize?: number; type?: string; search?: string }) =>
    request<PaginatedResponse<Node>>(`/nodes?${new URLSearchParams(params as Record<string, string>)}`),
  get: (id: string) => request<Node>(`/nodes/${id}`),
  create: (body: Partial<Node>) => request<Node>("/nodes", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: Partial<Node>) =>
    request<Node>(`/nodes/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  delete: (id: string) => request<void>(`/nodes/${id}`, { method: "DELETE" }),
  bulkDelete: (ids: string[]) =>
    request<void>("/nodes/bulk-delete", { method: "POST", body: JSON.stringify({ ids }) }),
};

export const edgesApi = {
  list: (params?: { page?: number; pageSize?: number; type?: string }) =>
    request<PaginatedResponse<Edge>>(`/edges?${new URLSearchParams(params as Record<string, string>)}`),
  create: (body: Partial<Edge>) => request<Edge>("/edges", { method: "POST", body: JSON.stringify(body) }),
  delete: (id: string) => request<void>(`/edges/${id}`, { method: "DELETE" }),
};

export const usersApi = {
  list: (params?: { page?: number; pageSize?: number; role?: string }) =>
    request<PaginatedResponse<User>>(`/users?${new URLSearchParams(params as Record<string, string>)}`),
  get: (id: string) => request<User>(`/users/${id}`),
  update: (id: string, body: Partial<User>) =>
    request<User>(`/users/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  invite: (email: string, role: User["role"]) =>
    request<User>("/users/invite", { method: "POST", body: JSON.stringify({ email, role }) }),
  delete: (id: string) => request<void>(`/users/${id}`, { method: "DELETE" }),
};

export const analyticsApi = {
  stats: () => request<DashboardStats>("/analytics/stats"),
  activity: (limit = 20) => request<ActivityEvent[]>(`/analytics/activity?limit=${limit}`),
  topNodes: () => request<Array<{ id: string; title: string; connectionCount: number }>>("/analytics/top-nodes"),
  searchQueries: () =>
    request<Array<{ query: string; count: number; avgResults: number }>>("/analytics/search-queries"),
};

export const apiKeysApi = {
  list: () => request<ApiKey[]>("/api-keys"),
  create: (name: string) => request<{ key: string } & ApiKey>("/api-keys", { method: "POST", body: JSON.stringify({ name }) }),
  revoke: (id: string) => request<void>(`/api-keys/${id}`, { method: "DELETE" }),
};

export const settingsApi = {
  get: () => request<{ siteName: string; siteDescription: string; allowPublicSearch: boolean }>("/settings"),
  update: (body: Record<string, unknown>) =>
    request<void>("/settings", { method: "PUT", body: JSON.stringify(body) }),
};
