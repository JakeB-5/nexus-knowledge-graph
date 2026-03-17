"use client";

import React, { useState, useRef, useEffect } from "react";

const NODE_TYPES = ["concept", "document", "person", "place", "event", "tag"];

interface MetadataEntry {
  key: string;
  value: string;
}

interface CreateNodeFormData {
  title: string;
  type: string;
  content: string;
  tags: string[];
  metadata: MetadataEntry[];
}

interface CreateNodeDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateNodeFormData) => Promise<void>;
  suggestedTags?: string[];
}

const INITIAL_FORM: CreateNodeFormData = {
  title: "",
  type: "concept",
  content: "",
  tags: [],
  metadata: [],
};

export default function CreateNodeDialog({
  open,
  onClose,
  onSubmit,
  suggestedTags = [],
}: CreateNodeDialogProps) {
  const [form, setForm] = useState<CreateNodeFormData>(INITIAL_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof CreateNodeFormData, string>>>({});
  const [tagInput, setTagInput] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setForm(INITIAL_FORM);
      setErrors({});
      setTagInput("");
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (tagInput.trim()) {
      const q = tagInput.toLowerCase();
      setTagSuggestions(
        suggestedTags.filter(
          (t) => t.toLowerCase().includes(q) && !form.tags.includes(t)
        ).slice(0, 5)
      );
    } else {
      setTagSuggestions([]);
    }
  }, [tagInput, suggestedTags, form.tags]);

  const validate = (): boolean => {
    const errs: typeof errors = {};
    if (!form.title.trim()) errs.title = "Title is required";
    if (!form.type) errs.type = "Type is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await onSubmit(form);
      onClose();
    } catch (err) {
      setErrors({ title: err instanceof Error ? err.message : "Submission failed" });
    } finally {
      setSubmitting(false);
    }
  };

  const addTag = (tag: string) => {
    const t = tag.trim().toLowerCase();
    if (t && !form.tags.includes(t)) {
      setForm((f) => ({ ...f, tags: [...f.tags, t] }));
    }
    setTagInput("");
    setTagSuggestions([]);
  };

  const removeTag = (tag: string) => {
    setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }));
  };

  const addMetadata = () => {
    setForm((f) => ({ ...f, metadata: [...f.metadata, { key: "", value: "" }] }));
  };

  const updateMetadata = (index: number, field: "key" | "value", val: string) => {
    setForm((f) => ({
      ...f,
      metadata: f.metadata.map((m, i) => (i === index ? { ...m, [field]: val } : m)),
    }));
  };

  const removeMetadata = (index: number) => {
    setForm((f) => ({ ...f, metadata: f.metadata.filter((_, i) => i !== index) }));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Create Node</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              ref={titleRef}
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Enter node title..."
              className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500
                ${errors.title ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"}`}
            />
            {errors.title && (
              <p className="mt-1 text-xs text-red-500">{errors.title}</p>
            )}
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Type <span className="text-red-500">*</span>
            </label>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm
                focus:outline-none focus:ring-2 focus:ring-indigo-500 capitalize"
            >
              {NODE_TYPES.map((t) => (
                <option key={t} value={t} className="capitalize">{t}</option>
              ))}
            </select>
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Content</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              placeholder="Enter content or description..."
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm
                focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tags</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.tags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="text-indigo-400 hover:text-indigo-600"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="relative">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); }
                  if (e.key === "," ) { e.preventDefault(); addTag(tagInput); }
                }}
                placeholder="Add tag and press Enter..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm
                  focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {tagSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10">
                  {tagSuggestions.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => addTag(tag)}
                      className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 first:rounded-t-lg last:rounded-b-lg"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Metadata */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700">Metadata</label>
              <button
                type="button"
                onClick={addMetadata}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
              >
                + Add field
              </button>
            </div>
            <div className="space-y-2">
              {form.metadata.map((entry, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={entry.key}
                    onChange={(e) => updateMetadata(i, "key", e.target.value)}
                    placeholder="Key"
                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-sm
                      focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <input
                    type="text"
                    value={entry.value}
                    onChange={(e) => updateMetadata(i, "value", e.target.value)}
                    placeholder="Value"
                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-sm
                      focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => removeMetadata(i)}
                    className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white
              hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Creating..." : "Create Node"}
          </button>
        </div>
      </div>
    </div>
  );
}
