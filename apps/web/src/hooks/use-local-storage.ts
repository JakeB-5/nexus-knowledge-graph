import { useState, useCallback } from "react";

/**
 * A useState-like hook that persists state to localStorage.
 * Handles JSON serialization and SSR gracefully.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === "undefined") return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      try {
        setStoredValue((prev) => {
          const next = value instanceof Function ? value(prev) : value;
          if (typeof window !== "undefined") {
            window.localStorage.setItem(key, JSON.stringify(next));
          }
          return next;
        });
      } catch (error) {
        console.error(`useLocalStorage: failed to set key "${key}"`, error);
      }
    },
    [key]
  );

  const removeValue = useCallback(() => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(key);
      }
      setStoredValue(initialValue);
    } catch (error) {
      console.error(`useLocalStorage: failed to remove key "${key}"`, error);
    }
  }, [key, initialValue]);

  return [storedValue, setValue, removeValue];
}
