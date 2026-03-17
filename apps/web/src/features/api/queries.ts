"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiClient, ApiError, NetworkError, type PaginatedResponse } from "./client";

// ---- Domain types ----

export interface Node {
  id: string;
  title: string;
  type: string;
  content?: string;
  tags: string[];
  metadata: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface Edge {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  weight: number;
  createdAt: string;
}

export interface GraphData {
  nodes: Node[];
  edges: Edge[];
  rootId: string;
  depth: number;
}

export interface SearchResult {
  nodes: Node[];
  total: number;
  query: string;
}

export interface AnalyticsData {
  totalNodes: number;
  totalEdges: number;
  nodesByType: Record<string, number>;
  recentActivity: { date: string; count: number }[];
  topConnectedNodes: { id: string; title: string; connections: number }[];
}

export interface CreateNodeInput {
  title: string;
  type: string;
  content?: string;
  tags?: string[];
  metadata?: Record<string, string>;
}

export interface UpdateNodeInput {
  title?: string;
  type?: string;
  content?: string;
  tags?: string[];
  metadata?: Record<string, string>;
}

export interface CreateEdgeInput {
  sourceId: string;
  targetId: string;
  type: string;
  weight?: number;
}

// ---- Hook state types ----

interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | NetworkError | null;
}

interface MutationState<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | NetworkError | null;
}

// ---- Generic query hook ----

function useQuery<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
  enabled = true
): QueryState<T> & { refetch: () => void } {
  const [state, setState] = useState<QueryState<T>>({
    data: null,
    loading: enabled,
    error: null,
  });
  const fetchCountRef = useRef(0);

  const execute = useCallback(() => {
    const controller = new AbortController();
    const fetchId = ++fetchCountRef.current;

    setState((s) => ({ ...s, loading: true, error: null }));

    fetcher(controller.signal)
      .then((data) => {
        if (fetchId !== fetchCountRef.current) return;
        setState({ data, loading: false, error: null });
      })
      .catch((err) => {
        if (fetchId !== fetchCountRef.current) return;
        if (err instanceof Error && err.name === "AbortError") return;
        setState({ data: null, loading: false, error: err });
      });

    return controller;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const ctrl = execute();
    return () => ctrl.abort();
  }, [execute, enabled]);

  return { ...state, refetch: execute as () => void };
}

// ---- Generic mutation hook ----

function useMutation<TInput, TOutput>(
  mutator: (input: TInput, signal: AbortSignal) => Promise<TOutput>
): MutationState<TOutput> & { mutate: (input: TInput) => Promise<TOutput> } {
  const [state, setState] = useState<MutationState<TOutput>>({
    data: null,
    loading: false,
    error: null,
  });

  const mutate = useCallback(
    async (input: TInput): Promise<TOutput> => {
      const controller = new AbortController();
      setState({ data: null, loading: true, error: null });
      try {
        const data = await mutator(input, controller.signal);
        setState({ data, loading: false, error: null });
        return data;
      } catch (err) {
        const error = err as ApiError | NetworkError;
        setState({ data: null, loading: false, error });
        throw err;
      }
    },
    [mutator]
  );

  return { ...state, mutate };
}

// ---- Query hooks ----

export interface NodesOptions {
  page?: number;
  pageSize?: number;
  type?: string;
  tags?: string[];
  search?: string;
  orderBy?: "createdAt" | "updatedAt" | "title";
  order?: "asc" | "desc";
}

export function useNodes(options: NodesOptions = {}) {
  const { page = 1, pageSize = 20, type, tags, search, orderBy = "updatedAt", order = "desc" } = options;

  return useQuery<PaginatedResponse<Node>>(
    (signal) => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        orderBy,
        order,
      });
      if (type) params.set("type", type);
      if (tags?.length) params.set("tags", tags.join(","));
      if (search) params.set("search", search);
      return apiClient.get<PaginatedResponse<Node>>(`/nodes?${params}`, { signal });
    },
    [page, pageSize, type, tags?.join(","), search, orderBy, order]
  );
}

export function useNode(id: string | null) {
  return useQuery<Node>(
    (signal) => apiClient.get<Node>(`/nodes/${id}`, { signal }),
    [id],
    !!id
  );
}

export function useEdges(nodeId: string | null) {
  return useQuery<Edge[]>(
    (signal) => apiClient.get<Edge[]>(`/nodes/${nodeId}/edges`, { signal }),
    [nodeId],
    !!nodeId
  );
}

export interface SearchOptions {
  query: string;
  types?: string[];
  limit?: number;
}

export function useSearch(options: SearchOptions) {
  const { query, types, limit = 20 } = options;

  return useQuery<SearchResult>(
    (signal) => {
      const params = new URLSearchParams({ q: query, limit: String(limit) });
      if (types?.length) params.set("types", types.join(","));
      return apiClient.get<SearchResult>(`/search?${params}`, { signal });
    },
    [query, types?.join(","), limit],
    query.trim().length > 0
  );
}

export function useGraphData(rootId: string | null, depth = 2) {
  return useQuery<GraphData>(
    (signal) =>
      apiClient.get<GraphData>(`/nodes/${rootId}/graph?depth=${depth}`, { signal }),
    [rootId, depth],
    !!rootId
  );
}

export function useAnalytics() {
  return useQuery<AnalyticsData>(
    (signal) => apiClient.get<AnalyticsData>("/analytics", { signal }),
    []
  );
}

// ---- Mutation hooks ----

export function useCreateNode() {
  return useMutation<CreateNodeInput, Node>((input, signal) =>
    apiClient.post<Node>("/nodes", input, { signal })
  );
}

export function useUpdateNode(id: string) {
  return useMutation<UpdateNodeInput, Node>((input, signal) =>
    apiClient.patch<Node>(`/nodes/${id}`, input, { signal })
  );
}

export function useDeleteNode() {
  return useMutation<string, void>((id, signal) =>
    apiClient.delete<void>(`/nodes/${id}`, { signal })
  );
}

export function useCreateEdge() {
  return useMutation<CreateEdgeInput, Edge>((input, signal) =>
    apiClient.post<Edge>("/edges", input, { signal })
  );
}

export function useDeleteEdge() {
  return useMutation<string, void>((id, signal) =>
    apiClient.delete<void>(`/edges/${id}`, { signal })
  );
}
