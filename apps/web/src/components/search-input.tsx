"use client";

import { useEffect, useRef, useState } from "react";
import { debounce } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  placeholder?: string;
  value?: string;
  onSearch: (value: string) => void;
  debounceMs?: number;
  className?: string;
  autoFocus?: boolean;
}

export function SearchInput({
  placeholder = "Search…",
  value: controlledValue,
  onSearch,
  debounceMs = 300,
  className,
  autoFocus,
}: SearchInputProps) {
  const [localValue, setLocalValue] = useState(controlledValue ?? "");
  const debouncedSearch = useRef(debounce(onSearch, debounceMs));

  // Sync if controlled value changes externally
  useEffect(() => {
    if (controlledValue !== undefined) setLocalValue(controlledValue);
  }, [controlledValue]);

  // Update debounce delay if prop changes
  useEffect(() => {
    debouncedSearch.current = debounce(onSearch, debounceMs);
  }, [onSearch, debounceMs]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setLocalValue(val);
    debouncedSearch.current(val);
  }

  function handleClear() {
    setLocalValue("");
    onSearch("");
  }

  return (
    <div className={cn("relative flex items-center", className)}>
      <span className="pointer-events-none absolute left-3 text-gray-400">
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
          />
        </svg>
      </span>

      <input
        type="search"
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={cn(
          "w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-9 text-sm text-gray-900",
          "placeholder:text-gray-400 focus:border-nexus-400 focus:outline-none focus:ring-2 focus:ring-nexus-100",
          "transition-colors"
        )}
      />

      {localValue && (
        <button
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute right-3 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
