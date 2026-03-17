"use client";

import React, { useEffect, useRef } from "react";

type ConfirmVariant = "danger" | "warning" | "info";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  loading?: boolean;
}

const VARIANT_STYLES: Record<ConfirmVariant, {
  iconBg: string;
  iconColor: string;
  confirmBtn: string;
  icon: React.ReactNode;
}> = {
  danger: {
    iconBg: "bg-red-50",
    iconColor: "text-red-500",
    confirmBtn: "bg-red-600 hover:bg-red-700 text-white",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    ),
  },
  warning: {
    iconBg: "bg-amber-50",
    iconColor: "text-amber-500",
    confirmBtn: "bg-amber-600 hover:bg-amber-700 text-white",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
  info: {
    iconBg: "bg-indigo-50",
    iconColor: "text-indigo-500",
    confirmBtn: "bg-indigo-600 hover:bg-indigo-700 text-white",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
};

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  loading = false,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const v = VARIANT_STYLES[variant];

  // Keyboard handling
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && !loading) onConfirm();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose, onConfirm, loading]);

  // Focus confirm button when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => confirmRef.current?.focus(), 50);
    }
  }, [open]);

  // Prevent body scroll
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in">
        <div className="p-6">
          {/* Icon */}
          <div className={`w-12 h-12 rounded-2xl ${v.iconBg} ${v.iconColor} flex items-center justify-center mb-4`}>
            {v.icon}
          </div>

          {/* Content */}
          <h3 id="confirm-dialog-title" className="text-lg font-semibold text-slate-900 mb-2">
            {title}
          </h3>
          {description && (
            <p className="text-sm text-slate-500 leading-relaxed">{description}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium
              text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={async () => {
              await onConfirm();
            }}
            disabled={loading}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50
              transition-colors ${v.confirmBtn}`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Processing...
              </span>
            ) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
