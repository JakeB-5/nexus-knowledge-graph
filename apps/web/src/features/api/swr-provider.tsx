"use client";

import React, { createContext, useContext, useCallback, useRef, useState } from "react";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  revalidating: boolean;
}

type CacheStore = Map<string, CacheEntry<unknown>>;

interface SWRContextValue {
  get: <T,>(key: string) => CacheEntry<T> | undefined;
  set: <T,>(key: string, data: T) => void;
  invalidate: (key: string | RegExp) => void;
  subscribe: (key: string, listener: () => void) => () => void;
}

const SWRContext = createContext<SWRContextValue | null>(null);

const DEFAULT_STALE_MS = 30_000; // 30 seconds

interface SWRProviderProps {
  children: React.ReactNode;
  staleTime?: number;
}

export function SWRProvider({ children, staleTime: _staleTime = DEFAULT_STALE_MS }: SWRProviderProps) {
  const cache = useRef<CacheStore>(new Map());
  const listeners = useRef<Map<string, Set<() => void>>>(new Map());

  const notify = useCallback((key: string) => {
    listeners.current.get(key)?.forEach((fn) => fn());
  }, []);

  const get = useCallback(function<T>(key: string): CacheEntry<T> | undefined {
    return cache.current.get(key) as CacheEntry<T> | undefined;
  }, []);

  const set = useCallback(function<T>(key: string, data: T) {
    cache.current.set(key, { data, timestamp: Date.now(), revalidating: false });
    notify(key);
  }, [notify]);

  const invalidate = useCallback((key: string | RegExp) => {
    if (typeof key === "string") {
      cache.current.delete(key);
      notify(key);
    } else {
      for (const k of cache.current.keys()) {
        if (key.test(k)) {
          cache.current.delete(k);
          notify(k);
        }
      }
    }
  }, [notify]);

  const subscribe = useCallback((key: string, listener: () => void) => {
    if (!listeners.current.has(key)) {
      listeners.current.set(key, new Set());
    }
    listeners.current.get(key)!.add(listener);
    return () => {
      listeners.current.get(key)?.delete(listener);
    };
  }, []);

  return (
    <SWRContext.Provider value={{ get, set, invalidate, subscribe }}>
      {children}
    </SWRContext.Provider>
  );
}

export function useSWRContext(): SWRContextValue {
  const ctx = useContext(SWRContext);
  if (!ctx) throw new Error("useSWRContext must be used within SWRProvider");
  return ctx;
}

// ---- useSWR hook ----

interface UseSWROptions<T> {
  fetcher: () => Promise<T>;
  staleTime?: number;
  revalidateOnFocus?: boolean;
  enabled?: boolean;
}

interface UseSWRResult<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  mutate: (data?: T) => void;
  revalidate: () => void;
}

export function useSWR<T,>(key: string, options: UseSWROptions<T>): UseSWRResult<T> {
  const {
    fetcher,
    staleTime = DEFAULT_STALE_MS,
    revalidateOnFocus = true,
    enabled = true,
  } = options;

  const ctx = useSWRContext();
  const [, forceUpdate] = useState(0);
  const fetchingRef = useRef(false);

  const revalidate = useCallback(async () => {
    if (fetchingRef.current || !enabled) return;
    fetchingRef.current = true;

    try {
      const data = await fetcher();
      ctx.set(key, data);
    } catch (err) {
      ctx.set(key, { __error: err });
    } finally {
      fetchingRef.current = false;
      forceUpdate((n) => n + 1);
    }
  }, [ctx, key, fetcher, enabled]);

  // Subscribe to cache changes
  React.useEffect(() => {
    return ctx.subscribe(key, () => forceUpdate((n) => n + 1));
  }, [ctx, key]);

  // Initial fetch / stale check
  React.useEffect(() => {
    if (!enabled) {
      forceUpdate((n) => n + 1);
      return;
    }
    const entry = ctx.get<T>(key);
    const isStale = !entry || Date.now() - entry.timestamp > staleTime;
    if (isStale) revalidate();
  }, [ctx, key, enabled, staleTime, revalidate]);

  // Revalidate on window focus
  React.useEffect(() => {
    if (!revalidateOnFocus || !enabled) return;
    const handler = () => revalidate();
    window.addEventListener("focus", handler);
    return () => window.removeEventListener("focus", handler);
  }, [revalidateOnFocus, enabled, revalidate]);

  const entry = ctx.get<T>(key);
  const rawData = entry?.data as ({ __error?: unknown } & T) | undefined;
  const isError = rawData && typeof rawData === "object" && "__error" in rawData;

  return {
    data: isError ? undefined : (rawData as T | undefined),
    loading: !entry && fetchingRef.current,
    error: isError ? (rawData.__error as Error) : null,
    mutate: (data?: T) => {
      if (data !== undefined) ctx.set(key, data);
      else revalidate();
    },
    revalidate,
  };
}

// ---- Optimistic update helper ----

export function useOptimistic<T,>(
  key: string,
  mutationFn: (data: T) => Promise<T>
) {
  const ctx = useSWRContext();

  return useCallback(
    async (optimisticData: T) => {
      const prev = ctx.get<T>(key);
      ctx.set(key, optimisticData);
      try {
        const result = await mutationFn(optimisticData);
        ctx.set(key, result);
        return result;
      } catch (err) {
        // Rollback
        if (prev) ctx.set(key, prev.data as T);
        throw err;
      }
    },
    [ctx, key, mutationFn]
  );
}
