"use client";

import React, { useState, useRef, useCallback, useId } from "react";

interface DropzoneFile {
  file: File;
  id: string;
  preview?: string;
  progress?: number;
  error?: string;
  uploaded?: boolean;
}

interface FileDropzoneProps {
  onFilesSelected: (files: File[]) => void | Promise<void>;
  accept?: string;
  multiple?: boolean;
  maxSizeMB?: number;
  maxFiles?: number;
  disabled?: boolean;
  className?: string;
  label?: string;
  description?: string;
  showPreview?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFileIcon(type: string): React.ReactNode {
  if (type.startsWith("image/")) {
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    );
  }
  if (type === "application/pdf") {
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    );
  }
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

export default function FileDropzone({
  onFilesSelected,
  accept,
  multiple = true,
  maxSizeMB = 10,
  maxFiles = 10,
  disabled = false,
  className = "",
  label = "Drop files here",
  description,
  showPreview = true,
}: FileDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const [dragError, setDragError] = useState("");
  const [files, setFiles] = useState<DropzoneFile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const dragCounter = useRef(0);

  const processFiles = useCallback(
    async (incoming: FileList | File[]) => {
      const arr = Array.from(incoming);
      const maxBytes = maxSizeMB * 1024 * 1024;
      const accepted: File[] = [];
      const errors: string[] = [];

      for (const file of arr) {
        if (files.length + accepted.length >= maxFiles) {
          errors.push(`Max ${maxFiles} files`);
          break;
        }
        if (file.size > maxBytes) {
          errors.push(`${file.name}: exceeds ${maxSizeMB}MB`);
          continue;
        }
        accepted.push(file);
      }

      if (errors.length > 0) {
        setDragError(errors[0] ?? "Upload error");
        setTimeout(() => setDragError(""), 4000);
      }

      if (accepted.length === 0) return;

      // Build preview entries
      const newEntries: DropzoneFile[] = await Promise.all(
        accepted.map(
          (file) =>
            new Promise<DropzoneFile>((resolve) => {
              const entry: DropzoneFile = {
                file,
                id: Math.random().toString(36).slice(2),
                progress: 0,
              };
              if (file.type.startsWith("image/") && showPreview) {
                const reader = new FileReader();
                reader.onload = (e) => {
                  entry.preview = e.target?.result as string;
                  resolve(entry);
                };
                reader.readAsDataURL(file);
              } else {
                resolve(entry);
              }
            })
        )
      );

      setFiles((prev) => [...prev, ...newEntries]);

      try {
        await onFilesSelected(accepted);
        setFiles((prev) =>
          prev.map((f) =>
            newEntries.some((e) => e.id === f.id) ? { ...f, progress: 100, uploaded: true } : f
          )
        );
      } catch {
        setFiles((prev) =>
          prev.map((f) =>
            newEntries.some((e) => e.id === f.id) ? { ...f, error: "Upload failed" } : f
          )
        );
      }
    },
    [files.length, maxFiles, maxSizeMB, showPreview, onFilesSelected]
  );

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (dragCounter.current === 1) setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragging(false);
    if (disabled) return;
    if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
      e.target.value = "";
    }
  };

  const removeFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const defaultDescription =
    description ??
    `${accept ? accept.replace(/,/g, ", ") : "Any file type"} · Max ${maxSizeMB}MB${
      multiple && maxFiles !== Infinity ? ` · Up to ${maxFiles} files` : ""
    }`;

  return (
    <div className={className}>
      {/* Drop zone */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-3 p-8 rounded-2xl border-2
          border-dashed transition-all cursor-pointer select-none
          ${dragging && !disabled
            ? "border-indigo-400 bg-indigo-50"
            : dragError
            ? "border-red-300 bg-red-50"
            : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
          }
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        {/* Upload icon */}
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors
          ${dragging ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-400"}`}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>

        <div className="text-center">
          <p className={`text-sm font-medium ${dragging ? "text-indigo-700" : "text-slate-700"}`}>
            {dragging ? "Drop to upload" : label}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {dragError
              ? <span className="text-red-500">{dragError}</span>
              : <>or <span className="text-indigo-600 font-medium">browse files</span></>
            }
          </p>
          <p className="text-xs text-slate-400 mt-1">{defaultDescription}</p>
        </div>

        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={handleInputChange}
          className="sr-only"
          aria-label="File upload"
        />
      </div>

      {/* File list */}
      {showPreview && files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200"
            >
              {/* Preview or icon */}
              {f.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={f.preview}
                  alt={f.file.name}
                  className="w-10 h-10 rounded-lg object-cover shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center
                  text-slate-400 shrink-0">
                  {getFileIcon(f.file.type)}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{f.file.name}</p>
                <p className="text-xs text-slate-400">{formatBytes(f.file.size)}</p>

                {/* Progress bar */}
                {f.progress !== undefined && !f.uploaded && !f.error && (
                  <div className="mt-1.5 h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all"
                      style={{ width: `${f.progress}%` }}
                    />
                  </div>
                )}
                {f.error && <p className="text-xs text-red-500 mt-0.5">{f.error}</p>}
              </div>

              {/* Status */}
              <div className="shrink-0">
                {f.uploaded ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Done
                  </span>
                ) : f.error ? (
                  <button
                    type="button"
                    onClick={() => removeFile(f.id)}
                    className="text-red-400 hover:text-red-600 transition-colors"
                    aria-label="Remove file"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => removeFile(f.id)}
                    className="text-slate-300 hover:text-slate-500 transition-colors"
                    aria-label="Remove file"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
