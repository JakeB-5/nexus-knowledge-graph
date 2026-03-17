import { useState, useEffect, useRef, useCallback } from "react";

interface UseInfiniteScrollOptions {
  /** How close to the bottom (px) before triggering load */
  threshold?: number;
  /** Disable auto-loading */
  disabled?: boolean;
}

interface UseInfiniteScrollReturn<T> {
  items: T[];
  isLoading: boolean;
  hasMore: boolean;
  error: Error | null;
  loaderRef: React.RefObject<HTMLDivElement | null>;
  loadMore: () => void;
  reset: () => void;
}

/**
 * Infinite scroll hook using IntersectionObserver.
 * Attach loaderRef to a sentinel element at the bottom of the list.
 */
export function useInfiniteScroll<T>(
  fetchFn: (page: number) => Promise<{ items: T[]; hasMore: boolean }>,
  options: UseInfiniteScrollOptions = {}
): UseInfiniteScrollReturn<T> {
  const { threshold = 0, disabled = false } = options;

  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const loaderRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(
    async (pageNum: number) => {
      if (isLoading || !hasMore || disabled) return;
      setIsLoading(true);
      setError(null);
      try {
        const result = await fetchFn(pageNum);
        setItems((prev) => (pageNum === 0 ? result.items : [...prev, ...result.items]));
        setHasMore(result.hasMore);
        setPage(pageNum + 1);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to load"));
      } finally {
        setIsLoading(false);
      }
    },
    [fetchFn, isLoading, hasMore, disabled]
  );

  const loadMore = useCallback(() => load(page), [load, page]);

  const reset = useCallback(() => {
    setItems([]);
    setPage(0);
    setHasMore(true);
    setError(null);
  }, []);

  // Initial load
  useEffect(() => {
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // IntersectionObserver for sentinel element
  useEffect(() => {
    const el = loaderRef.current;
    if (!el || !hasMore || disabled) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isLoading) {
          loadMore();
        }
      },
      { rootMargin: `${threshold}px` }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, isLoading, threshold, disabled, loadMore]);

  return { items, isLoading, hasMore, error, loaderRef, loadMore, reset };
}
