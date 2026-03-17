"use client";

import React, { useCallback, useId } from "react";

export interface KeyValuePair {
  id: string;
  key: string;
  value: string;
}

interface KeyValueEditorProps {
  pairs: KeyValuePair[];
  onChange: (pairs: KeyValuePair[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel?: string;
  disabled?: boolean;
  maxPairs?: number;
  label?: string;
  className?: string;
  valueType?: "text" | "textarea" | "number";
  reservedKeys?: string[];
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function KeyValueEditor({
  pairs,
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
  addLabel = "Add field",
  disabled = false,
  maxPairs = Infinity,
  label,
  className = "",
  valueType = "text",
  reservedKeys = [],
}: KeyValueEditorProps) {
  const id = useId();

  const addPair = useCallback(() => {
    if (pairs.length >= maxPairs) return;
    onChange([...pairs, { id: generateId(), key: "", value: "" }]);
  }, [pairs, maxPairs, onChange]);

  const updatePair = useCallback(
    (pairId: string, field: "key" | "value", val: string) => {
      onChange(pairs.map((p) => (p.id === pairId ? { ...p, [field]: val } : p)));
    },
    [pairs, onChange]
  );

  const removePair = useCallback(
    (pairId: string) => {
      onChange(pairs.filter((p) => p.id !== pairId));
    },
    [pairs, onChange]
  );

  const movePair = useCallback(
    (from: number, to: number) => {
      const next = [...pairs];
      const spliced = next.splice(from, 1);
      const item = spliced[0];
      if (!item) return;
      next.splice(to, 0, item);
      onChange(next);
    },
    [pairs, onChange]
  );

  const isDuplicateKey = (key: string, currentId: string) =>
    key.trim() !== "" && pairs.some((p) => p.id !== currentId && p.key.trim() === key.trim());

  const isReservedKey = (key: string) =>
    reservedKeys.includes(key.trim());

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        {label && (
          <label className="text-sm font-medium text-slate-700">{label}</label>
        )}
        {!label && <div />}
        <div className="flex items-center gap-2 text-xs text-slate-400">
          {pairs.length > 0 && <span>{pairs.length} {pairs.length === 1 ? "field" : "fields"}</span>}
        </div>
      </div>

      {/* Pairs list */}
      <div className="space-y-2">
        {pairs.map((pair, index) => {
          const hasDuplicate = isDuplicateKey(pair.key, pair.id);
          const hasReserved = isReservedKey(pair.key);
          const hasError = hasDuplicate || hasReserved;

          return (
            <div key={pair.id} className="group flex items-start gap-2">
              {/* Drag handle */}
              <button
                type="button"
                disabled={disabled}
                className="mt-2.5 p-1 text-slate-300 hover:text-slate-500 cursor-grab disabled:cursor-default
                  opacity-0 group-hover:opacity-100 transition-opacity"
                title="Drag to reorder"
                aria-label="Drag to reorder"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="9" cy="7" r="1.5" />
                  <circle cx="15" cy="7" r="1.5" />
                  <circle cx="9" cy="12" r="1.5" />
                  <circle cx="15" cy="12" r="1.5" />
                  <circle cx="9" cy="17" r="1.5" />
                  <circle cx="15" cy="17" r="1.5" />
                </svg>
              </button>

              {/* Key field */}
              <div className="flex-1 min-w-0">
                <input
                  id={`${id}-key-${pair.id}`}
                  type="text"
                  value={pair.key}
                  onChange={(e) => updatePair(pair.id, "key", e.target.value)}
                  placeholder={keyPlaceholder}
                  disabled={disabled}
                  aria-label={`Key ${index + 1}`}
                  className={`w-full px-2.5 py-2 rounded-lg border text-sm transition-colors
                    focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                    ${hasError
                      ? "border-red-300 bg-red-50 text-red-900"
                      : "border-slate-200 bg-slate-50 text-slate-900"
                    }
                    ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
                />
                {hasDuplicate && (
                  <p className="mt-0.5 text-xs text-red-500">Duplicate key</p>
                )}
                {hasReserved && (
                  <p className="mt-0.5 text-xs text-red-500">Reserved key</p>
                )}
              </div>

              <span className="mt-2.5 text-slate-300 text-sm font-medium shrink-0">:</span>

              {/* Value field */}
              <div className="flex-[2] min-w-0">
                {valueType === "textarea" ? (
                  <textarea
                    value={pair.value}
                    onChange={(e) => updatePair(pair.id, "value", e.target.value)}
                    placeholder={valuePlaceholder}
                    disabled={disabled}
                    rows={2}
                    aria-label={`Value ${index + 1}`}
                    className={`w-full px-2.5 py-2 rounded-lg border text-sm resize-none transition-colors
                      focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                      border-slate-200 bg-slate-50 text-slate-900
                      ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
                  />
                ) : (
                  <input
                    type={valueType}
                    value={pair.value}
                    onChange={(e) => updatePair(pair.id, "value", e.target.value)}
                    placeholder={valuePlaceholder}
                    disabled={disabled}
                    aria-label={`Value ${index + 1}`}
                    className={`w-full px-2.5 py-2 rounded-lg border text-sm transition-colors
                      focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                      border-slate-200 bg-slate-50 text-slate-900
                      ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
                  />
                )}
              </div>

              {/* Order controls */}
              <div className="flex flex-col gap-0.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => movePair(index, Math.max(0, index - 1))}
                  disabled={index === 0 || disabled}
                  className="p-0.5 text-slate-300 hover:text-slate-500 disabled:opacity-30 transition-colors"
                  aria-label="Move up"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => movePair(index, Math.min(pairs.length - 1, index + 1))}
                  disabled={index === pairs.length - 1 || disabled}
                  className="p-0.5 text-slate-300 hover:text-slate-500 disabled:opacity-30 transition-colors"
                  aria-label="Move down"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {/* Remove */}
              <button
                type="button"
                onClick={() => removePair(pair.id)}
                disabled={disabled}
                aria-label={`Remove field ${pair.key || index + 1}`}
                className="mt-2 p-1 text-slate-300 hover:text-red-500 transition-colors
                  disabled:cursor-not-allowed opacity-0 group-hover:opacity-100"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {pairs.length === 0 && (
        <div className="flex items-center justify-center py-5 border border-dashed border-slate-200 rounded-xl">
          <p className="text-sm text-slate-400">No fields yet</p>
        </div>
      )}

      {/* Add button */}
      {pairs.length < maxPairs && !disabled && (
        <button
          type="button"
          onClick={addPair}
          className="mt-3 flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700
            font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {addLabel}
        </button>
      )}
    </div>
  );
}
