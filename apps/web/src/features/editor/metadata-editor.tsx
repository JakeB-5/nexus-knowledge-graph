'use client';

import React, { useState, useCallback, useRef } from 'react';

type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'json';

interface MetadataField {
  id: string;
  key: string;
  value: string;
  type: FieldType;
  error?: string;
}

interface MetadataEditorProps {
  initialData?: Record<string, unknown>;
  onChange?: (data: Record<string, unknown>) => void;
  className?: string;
  readOnly?: boolean;
}

function detectType(value: string): FieldType {
  if (value === 'true' || value === 'false') return 'boolean';
  if (!isNaN(Number(value)) && value.trim() !== '') return 'number';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
  try { JSON.parse(value); if (value.trim().startsWith('{') || value.trim().startsWith('[')) return 'json'; } catch { /* */ }
  return 'string';
}

function validateField(field: MetadataField): string | undefined {
  if (!field.key.trim()) return 'Key required';
  if (field.type === 'number' && isNaN(Number(field.value))) return 'Invalid number';
  if (field.type === 'boolean' && field.value !== 'true' && field.value !== 'false') return 'Must be true/false';
  if (field.type === 'json') {
    try { JSON.parse(field.value); } catch { return 'Invalid JSON'; }
  }
  if (field.type === 'date' && isNaN(Date.parse(field.value))) return 'Invalid date';
  return undefined;
}

function parseValue(field: MetadataField): unknown {
  switch (field.type) {
    case 'number': return Number(field.value);
    case 'boolean': return field.value === 'true';
    case 'json': try { return JSON.parse(field.value); } catch { return field.value; }
    case 'date': return new Date(field.value).toISOString();
    default: return field.value;
  }
}

function makeId(): string {
  return Math.random().toString(36).slice(2);
}

function recordToFields(data: Record<string, unknown>): MetadataField[] {
  return Object.entries(data).map(([key, value]) => {
    const strValue = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
    const type = detectType(strValue);
    return { id: makeId(), key, value: strValue, type };
  });
}

const TYPE_COLORS: Record<FieldType, string> = {
  string: 'bg-blue-50 text-blue-600',
  number: 'bg-amber-50 text-amber-600',
  boolean: 'bg-purple-50 text-purple-600',
  date: 'bg-emerald-50 text-emerald-600',
  json: 'bg-rose-50 text-rose-600',
};

export function MetadataEditor({
  initialData = {},
  onChange,
  className = '',
  readOnly = false,
}: MetadataEditorProps) {
  const [fields, setFields] = useState<MetadataField[]>(() => recordToFields(initialData));
  const [showJson, setShowJson] = useState(false);
  const [jsonError, setJsonError] = useState('');
  const dragRef = useRef<{ id: string; overId: string | null }>({ id: '', overId: null });

  const emit = useCallback((updated: MetadataField[]) => {
    const record: Record<string, unknown> = {};
    updated.forEach((f) => {
      if (f.key.trim()) record[f.key] = parseValue(f);
    });
    onChange?.(record);
  }, [onChange]);

  const updateField = useCallback((id: string, patch: Partial<MetadataField>) => {
    setFields((prev) => {
      const next = prev.map((f) => {
        if (f.id !== id) return f;
        const updated = { ...f, ...patch };
        updated.error = validateField(updated);
        return updated;
      });
      emit(next);
      return next;
    });
  }, [emit]);

  const addField = useCallback(() => {
    const newField: MetadataField = { id: makeId(), key: '', value: '', type: 'string' };
    setFields((prev) => {
      const next = [...prev, newField];
      emit(next);
      return next;
    });
  }, [emit]);

  const removeField = useCallback((id: string) => {
    setFields((prev) => {
      const next = prev.filter((f) => f.id !== id);
      emit(next);
      return next;
    });
  }, [emit]);

  const handleValueChange = useCallback((id: string, value: string) => {
    const type = detectType(value);
    updateField(id, { value, type });
  }, [updateField]);

  // JSON view
  const jsonValue = JSON.stringify(
    Object.fromEntries(fields.filter((f) => f.key).map((f) => [f.key, parseValue(f)])),
    null, 2
  );

  const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const raw = e.target.value;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        const newFields = recordToFields(parsed);
        setFields(newFields);
        emit(newFields);
        setJsonError('');
      } else {
        setJsonError('Must be a JSON object');
      }
    } catch {
      setJsonError('Invalid JSON');
    }
  };

  // Drag to reorder
  const handleDragStart = (id: string) => { dragRef.current.id = id; };
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    dragRef.current.overId = id;
  };
  const handleDrop = () => {
    const { id, overId } = dragRef.current;
    if (!id || !overId || id === overId) return;
    setFields((prev) => {
      const from = prev.findIndex((f) => f.id === id);
      const to = prev.findIndex((f) => f.id === overId);
      const next = [...prev];
      const [item] = next.splice(from, 1);
      if (item) next.splice(to, 0, item);
      emit(next);
      return next;
    });
    dragRef.current = { id: '', overId: null };
  };

  return (
    <div className={`border border-gray-200 rounded-xl overflow-hidden bg-white ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
        <span className="text-sm font-semibold text-gray-700">Metadata</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{fields.length} fields</span>
          <button
            onClick={() => setShowJson((v) => !v)}
            className={`text-xs px-2 py-1 rounded-md border transition-colors ${showJson ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'border-gray-200 text-gray-500 hover:bg-gray-100'}`}
          >
            {'{}'} JSON
          </button>
        </div>
      </div>

      {showJson ? (
        <div className="p-3">
          <textarea
            value={jsonValue}
            onChange={handleJsonChange}
            readOnly={readOnly}
            className="w-full font-mono text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus:border-indigo-400"
            rows={Math.max(6, fields.length * 2 + 3)}
          />
          {jsonError && <p className="text-xs text-rose-500 mt-1">{jsonError}</p>}
        </div>
      ) : (
        <>
          {/* Field list */}
          <div className="divide-y divide-gray-50">
            {fields.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                No metadata yet. Click Add Field to start.
              </div>
            )}
            {fields.map((field) => (
              <div
                key={field.id}
                draggable={!readOnly}
                onDragStart={() => handleDragStart(field.id)}
                onDragOver={(e) => handleDragOver(e, field.id)}
                onDrop={handleDrop}
                className="flex items-start gap-2 px-3 py-2.5 hover:bg-gray-50 group"
              >
                {/* Drag handle */}
                {!readOnly && (
                  <div className="text-gray-300 cursor-grab mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity select-none text-xs">⠿</div>
                )}

                {/* Key input */}
                <input
                  type="text"
                  value={field.key}
                  onChange={(e) => updateField(field.id, { key: e.target.value })}
                  readOnly={readOnly}
                  placeholder="key"
                  className="w-32 flex-shrink-0 text-xs font-mono border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-indigo-400 bg-white"
                />

                {/* Type badge */}
                <select
                  value={field.type}
                  onChange={(e) => updateField(field.id, { type: e.target.value as FieldType })}
                  disabled={readOnly}
                  className={`text-xs px-2 py-1.5 rounded-md border-0 font-medium cursor-pointer focus:outline-none ${TYPE_COLORS[field.type]}`}
                >
                  <option value="string">str</option>
                  <option value="number">num</option>
                  <option value="boolean">bool</option>
                  <option value="date">date</option>
                  <option value="json">json</option>
                </select>

                {/* Value input */}
                <div className="flex-1 min-w-0">
                  {field.type === 'boolean' ? (
                    <select
                      value={field.value}
                      onChange={(e) => updateField(field.id, { value: e.target.value })}
                      disabled={readOnly}
                      className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-indigo-400 bg-white"
                    >
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : field.type === 'date' ? (
                    <input
                      type="date"
                      value={field.value.slice(0, 10)}
                      onChange={(e) => handleValueChange(field.id, e.target.value)}
                      readOnly={readOnly}
                      className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-indigo-400 bg-white"
                    />
                  ) : field.type === 'json' ? (
                    <textarea
                      value={field.value}
                      onChange={(e) => handleValueChange(field.id, e.target.value)}
                      readOnly={readOnly}
                      rows={2}
                      className="w-full text-xs font-mono border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-indigo-400 bg-white resize-none"
                    />
                  ) : (
                    <input
                      type={field.type === 'number' ? 'number' : 'text'}
                      value={field.value}
                      onChange={(e) => handleValueChange(field.id, e.target.value)}
                      readOnly={readOnly}
                      placeholder="value"
                      className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-indigo-400 bg-white"
                    />
                  )}
                  {field.error && <p className="text-xs text-rose-500 mt-0.5">{field.error}</p>}
                </div>

                {/* Remove */}
                {!readOnly && (
                  <button
                    onClick={() => removeField(field.id)}
                    className="text-gray-300 hover:text-rose-400 transition-colors mt-1.5 opacity-0 group-hover:opacity-100 text-sm flex-shrink-0"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Add field button */}
          {!readOnly && (
            <div className="px-3 py-2 border-t border-gray-100">
              <button
                onClick={addField}
                className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
              >
                <span className="text-base leading-none">+</span> Add Field
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
