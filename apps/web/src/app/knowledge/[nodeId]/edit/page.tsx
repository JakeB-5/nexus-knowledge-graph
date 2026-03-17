"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

const NODE_TYPES = ["concept", "document", "person", "place", "event", "tag"];

interface MetadataEntry {
  key: string;
  value: string;
}

interface NodeFormState {
  title: string;
  type: string;
  content: string;
  tags: string[];
  metadata: MetadataEntry[];
}

// Mock initial data
const MOCK_NODE: NodeFormState = {
  title: "Quantum Computing Fundamentals",
  type: "document",
  content: `Quantum computing is a type of computation that harnesses quantum mechanical phenomena such as superposition and entanglement to perform operations on data.

Unlike classical computers that use bits (0 or 1), quantum computers use quantum bits (qubits) that can exist in multiple states simultaneously.`,
  tags: ["quantum", "computing", "physics"],
  metadata: [
    { key: "author", value: "Research Team" },
    { key: "status", value: "published" },
  ],
};

type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

export default function NodeEditPage() {
  const router = useRouter();
  const params = useParams();
  const nodeId = params?.nodeId as string;

  const [form, setForm] = useState<NodeFormState>(MOCK_NODE);
  const [original, setOriginal] = useState<NodeFormState>(MOCK_NODE);
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>("idle");
  const [showPreview, setShowPreview] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isDirty = JSON.stringify(form) !== JSON.stringify(original);

  // Auto-resize textarea
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [form.content, resizeTextarea]);

  // Auto-save logic
  useEffect(() => {
    if (!isDirty) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setAutoSaveStatus("idle");
    autoSaveTimerRef.current = setTimeout(async () => {
      setAutoSaveStatus("saving");
      try {
        // Simulate API call
        await new Promise((r) => setTimeout(r, 600));
        setAutoSaveStatus("saved");
        setOriginal(form);
        setTimeout(() => setAutoSaveStatus("idle"), 3000);
      } catch {
        setAutoSaveStatus("error");
      }
    }, 1500);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [form, isDirty]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await new Promise((r) => setTimeout(r, 800));
      setOriginal(form);
      router.push(`/knowledge/${nodeId}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    await new Promise((r) => setTimeout(r, 500));
    router.push("/knowledge");
  };

  const addTag = (tag: string) => {
    const t = tag.trim().toLowerCase();
    if (t && !form.tags.includes(t)) {
      setForm((f) => ({ ...f, tags: [...f.tags, t] }));
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }));
  };

  const addMetadata = () => {
    setForm((f) => ({ ...f, metadata: [...f.metadata, { key: "", value: "" }] }));
  };

  const updateMetadata = (i: number, field: "key" | "value", val: string) => {
    setForm((f) => ({
      ...f,
      metadata: f.metadata.map((m, idx) => (idx === i ? { ...m, [field]: val } : m)),
    }));
  };

  const removeMetadata = (i: number) => {
    setForm((f) => ({ ...f, metadata: f.metadata.filter((_, idx) => idx !== i) }));
  };

  const autoSaveLabel: Record<AutoSaveStatus, string> = {
    idle: isDirty ? "Unsaved changes" : "All changes saved",
    saving: "Saving...",
    saved: "Saved",
    error: "Save failed",
  };

  const autoSaveColor: Record<AutoSaveStatus, string> = {
    idle: isDirty ? "text-amber-500" : "text-slate-400",
    saving: "text-indigo-500",
    saved: "text-emerald-500",
    error: "text-red-500",
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/knowledge/${nodeId}`}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-lg font-semibold text-slate-900">Edit Node</h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Auto-save indicator */}
          <div className={`flex items-center gap-1.5 text-xs font-medium ${autoSaveColor[autoSaveStatus]}`}>
            {autoSaveStatus === "saving" && (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {autoSaveStatus === "saved" && (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {autoSaveLabel[autoSaveStatus]}
          </div>

          {/* Preview toggle */}
          <button
            onClick={() => setShowPreview((p) => !p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${showPreview ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Preview
          </button>

          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            Delete
          </button>

          <button
            onClick={() => router.push(`/knowledge/${nodeId}`)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>

          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="px-4 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white
              hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div className={`grid gap-5 ${showPreview ? "grid-cols-2" : "grid-cols-1"}`}>
        {/* Editor column */}
        <div className="space-y-4">
          {/* Title & type */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
                Title
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Node title..."
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-lg font-semibold
                  text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
                Type
              </label>
              <div className="flex flex-wrap gap-2">
                {NODE_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, type }))}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium capitalize transition-colors
                      ${form.type === type
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
              Content
            </label>
            <textarea
              ref={textareaRef}
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              onInput={resizeTextarea}
              placeholder="Write content..."
              className="w-full min-h-48 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm
                text-slate-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500
                focus:border-transparent resize-none overflow-hidden"
            />
          </div>

          {/* Tags */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
              Tags
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {form.tags.map((tag) => (
                <span key={tag} className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700
                  rounded-full text-xs font-medium">
                  #{tag}
                  <button type="button" onClick={() => removeTag(tag)} className="text-indigo-400 hover:text-indigo-600 ml-0.5">×</button>
                </span>
              ))}
            </div>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput); }
              }}
              placeholder="Add tags (press Enter)..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm
                focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Metadata */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide">
                Metadata
              </label>
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
                    className="w-32 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-sm
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
              {form.metadata.length === 0 && (
                <p className="text-sm text-slate-400 italic">No metadata. Click "+ Add field" to add.</p>
              )}
            </div>
          </div>
        </div>

        {/* Preview column */}
        {showPreview && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 h-fit sticky top-20">
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-4">Preview</h3>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 capitalize font-medium">
                  {form.type}
                </span>
                {form.tags.map((t) => (
                  <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">#{t}</span>
                ))}
              </div>
              <h1 className="text-xl font-bold text-slate-900">{form.title || "Untitled"}</h1>
              <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                {form.content || <span className="text-slate-400 italic">No content yet...</span>}
              </div>
              {form.metadata.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  {form.metadata.filter((m) => m.key).map((m, i) => (
                    <div key={i} className="flex gap-2 text-xs text-slate-500 mb-1">
                      <span className="font-medium capitalize">{m.key}:</span>
                      <span>{m.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Delete Node?</h3>
            <p className="text-sm text-slate-500 mb-5">
              This will permanently delete "{form.title}" and all its connections. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700
                  hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium
                  hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
