import { useState, useEffect } from "react";

/**
 * Tracks whether a CSS media query matches.
 * Returns false during SSR.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQueryList = window.matchMedia(query);
    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Set initial value
    setMatches(mediaQueryList.matches);

    mediaQueryList.addEventListener("change", handleChange);
    return () => mediaQueryList.removeEventListener("change", handleChange);
  }, [query]);

  return matches;
}

// Convenience hooks for common breakpoints
export const useIsMobile = () => useMediaQuery("(max-width: 639px)");
export const useIsTablet = () => useMediaQuery("(min-width: 640px) and (max-width: 1023px)");
export const useIsDesktop = () => useMediaQuery("(min-width: 1024px)");
export const usePrefersDark = () => useMediaQuery("(prefers-color-scheme: dark)");
export const usePrefersReducedMotion = () => useMediaQuery("(prefers-reduced-motion: reduce)");
