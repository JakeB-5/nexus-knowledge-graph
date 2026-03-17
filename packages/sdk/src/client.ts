import type { Node, CreateNode, UpdateNode, Edge, CreateEdge, User } from "@nexus/shared";

export interface NexusClientOptions {
  baseUrl: string;
  apiKey?: string;
  accessToken?: string;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class NexusClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(options: NexusClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.headers = {
      "Content-Type": "application/json",
    };
    if (options.apiKey) {
      this.headers["X-API-Key"] = options.apiKey;
    }
    if (options.accessToken) {
      this.headers["Authorization"] = `Bearer ${options.accessToken}`;
    }
  }

  // --- Nodes ---

  async createNode(data: CreateNode): Promise<Node> {
    return this.post("/api/nodes", data);
  }

  async getNode(id: string): Promise<Node> {
    return this.get(`/api/nodes/${id}`);
  }

  async updateNode(id: string, data: UpdateNode): Promise<Node> {
    return this.patch(`/api/nodes/${id}`, data);
  }

  async deleteNode(id: string): Promise<void> {
    await this.delete(`/api/nodes/${id}`);
  }

  async listNodes(params?: {
    page?: number;
    limit?: number;
    type?: string;
    search?: string;
  }): Promise<PaginatedResponse<Node>> {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.type) query.set("type", params.type);
    if (params?.search) query.set("search", params.search);
    return this.get(`/api/nodes?${query.toString()}`);
  }

  // --- Edges ---

  async createEdge(data: CreateEdge): Promise<Edge> {
    return this.post("/api/edges", data);
  }

  async deleteEdge(id: string): Promise<void> {
    await this.delete(`/api/edges/${id}`);
  }

  async getNodeEdges(
    nodeId: string,
    direction?: "outgoing" | "incoming" | "both",
  ): Promise<Edge[]> {
    const query = direction ? `?direction=${direction}` : "";
    return this.get(`/api/nodes/${nodeId}/edges${query}`);
  }

  // --- Graph ---

  async traverse(
    startNodeId: string,
    options?: { maxDepth?: number; direction?: string },
  ): Promise<{ visited: string[]; paths: Record<string, string[]> }> {
    return this.post(`/api/graph/traverse/${startNodeId}`, options ?? {});
  }

  async shortestPath(
    sourceId: string,
    targetId: string,
  ): Promise<{ path: string[] | null }> {
    return this.get(`/api/graph/shortest-path?source=${sourceId}&target=${targetId}`);
  }

  // --- Search ---

  async search(
    query: string,
    options?: { limit?: number; types?: string[]; semantic?: boolean },
  ): Promise<{ results: Array<{ id: string; score: number; highlights: string[] }> }> {
    return this.post("/api/search", { query, ...options });
  }

  // --- Auth ---

  async login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: User }> {
    return this.post("/api/auth/login", { email, password });
  }

  async register(
    data: { email: string; password: string; name: string },
  ): Promise<{ accessToken: string; refreshToken: string; user: User }> {
    return this.post("/api/auth/register", data);
  }

  setAccessToken(token: string): void {
    this.headers["Authorization"] = `Bearer ${token}`;
  }

  // --- HTTP helpers ---

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(`Nexus API error ${res.status}: ${(error as any).message}`);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  private get<T>(path: string): Promise<T> {
    return this.request("GET", path);
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.request("POST", path, body);
  }

  private patch<T>(path: string, body: unknown): Promise<T> {
    return this.request("PATCH", path, body);
  }

  private delete<T>(path: string): Promise<T> {
    return this.request("DELETE", path);
  }
}
