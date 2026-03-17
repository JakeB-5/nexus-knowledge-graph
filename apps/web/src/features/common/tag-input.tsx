"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  maxTags?: number;
  disabled?: boolean;
  className?: string;
  label?: string;
  allowCreate?: boolean;
}

export default function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = "Add tag...",
  maxTags = Infinity,
  disabled = false,
  className = "",
  label,
  allowCreate = true,
}: TagInputProps) {
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredSuggestions = input.trim()
    ? suggestions.filter(
        (s) =>
          s.toLowerCase().includes(input.toLowerCase()) &&
          !value.includes(s)
      ).slice(0, 6)
    : [];

  const showDropdown = focused && filteredSuggestions.length > 0;

  const addTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim().toLowerCase().replace(/\s+/g, "-");
      if (!trimmed || value.includes(trimmed) || value.length >= maxTags) return;
      if (!allowCreate && !suggestions.includes(trimmed)) return;
      onChange([...value, trimmed]);
      setInput("");
      setSelectedSuggestionIdx(-1);
    },
    [value, maxTags, allowCreate, suggestions, onChange]
  );

  const removeTag = useCallback(
    (tag: string) => {
      onChange(value.filter((t) => t !== tag));
    },
    [value, onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (selectedSuggestionIdx >= 0 && filteredSuggestions[selectedSuggestionIdx]) {
        addTag(filteredSuggestions[selectedSuggestionIdx]);
      } else if (input.trim()) {
        addTag(input);
      }
    } else if (e.key === "Backspace" && !input && value.length > 0) {
      const last = value[value.length - 1];
      if (last) removeTag(last);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedSuggestionIdx((i) => Math.min(i + 1, filteredSuggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedSuggestionIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Escape") {
      setInput("");
      setSelectedSuggestionIdx(-1);
      inputRef.current?.blur();
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className={className}>
      {label && (
        <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      )}

      <div
        onClick={() => !disabled && inputRef.current?.focus()}
        className={`flex flex-wrap gap-1.5 min-h-10 px-2.5 py-2 rounded-xl border transition-colors cursor-text
          ${focused ? "border-indigo-500 ring-2 ring-indigo-500/20" : "border-slate-200"}
          ${disabled ? "bg-slate-50 opacity-60 cursor-not-allowed" : "bg-white"}`}
      >
        {/* Tags */}
        {value.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 px-2.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-full
              text-xs font-medium select-none"
          >
            #{tag}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
                className="text-indigo-400 hover:text-indigo-700 transition-colors ml-0.5 leading-none"
                aria-label={`Remove ${tag}`}
              >
                ×
              </button>
            )}
          </span>
        ))}

        {/* Input */}
        {value.length < maxTags && !disabled && (
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setSelectedSuggestionIdx(-1);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            placeholder={value.length === 0 ? placeholder : ""}
            className="flex-1 min-w-24 text-sm text-slate-900 placeholder:text-slate-400
              outline-none bg-transparent"
          />
        )}
      </div>

      {/* Helper text */}
      <div className="flex items-center justify-between mt-1">
        <p className="text-xs text-slate-400">
          {allowCreate ? "Press Enter or comma to add" : "Select from suggestions"}
        </p>
        {maxTags !== Infinity && (
          <p className="text-xs text-slate-400">{value.length}/{maxTags}</p>
        )}
      </div>

      {/* Suggestions dropdown */}
      {showDropdown && (
        <div className="relative z-20 mt-1">
          <div className="absolute top-0 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg
            overflow-hidden">
            {filteredSuggestions.map((suggestion, i) => (
              <button
                key={suggestion}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); addTag(suggestion); }}
                className={`w-full px-3 py-2 text-left text-sm transition-colors
                  ${i === selectedSuggestionIdx
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-700 hover:bg-slate-50"
                  }`}
              >
                <span className="font-medium text-indigo-500">#</span>{suggestion}
              </button>
            ))}
            {allowCreate && input.trim() && !filteredSuggestions.includes(input.trim().toLowerCase()) && (
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); addTag(input); }}
                className="w-full px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50 border-t border-slate-100"
              >
                Create tag <span className="font-semibold text-slate-700">"{input.trim()}"</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
