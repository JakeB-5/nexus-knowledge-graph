"use client";

import React, { createContext, useContext, useCallback, useState, useRef, useEffect } from "react";

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  message: string;
  title?: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastContextValue {
  toast: (message: string, options?: ToastOptions) => string;
  success: (message: string, options?: Omit<ToastOptions, "variant">) => string;
  error: (message: string, options?: Omit<ToastOptions, "variant">) => string;
  warning: (message: string, options?: Omit<ToastOptions, "variant">) => string;
  info: (message: string, options?: Omit<ToastOptions, "variant">) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

interface ToastOptions {
  title?: string;
  duration?: number;
  variant?: ToastVariant;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 4000;
const MAX_TOASTS = 5;

const VARIANT_STYLES: Record<ToastVariant, { container: string; icon: React.ReactNode; progress: string }> = {
  success: {
    container: "bg-white border-green-200",
    progress: "bg-green-500",
    icon: (
      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    ),
  },
  error: {
    container: "bg-white border-red-200",
    progress: "bg-red-500",
    icon: (
      <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
        <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-9.25a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zm.75 6a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
        </svg>
      </div>
    ),
  },
  warning: {
    container: "bg-white border-yellow-200",
    progress: "bg-yellow-500",
    icon: (
      <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center shrink-0">
        <svg className="w-4 h-4 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
      </div>
    ),
  },
  info: {
    container: "bg-white border-nexus-200",
    progress: "bg-nexus-500",
    icon: (
      <div className="w-8 h-8 rounded-full bg-nexus-100 flex items-center justify-center shrink-0">
        <svg className="w-4 h-4 text-nexus-600" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
        </svg>
      </div>
    ),
  },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false);
  const [progressWidth, setProgressWidth] = useState(100);
  const styles = VARIANT_STYLES[toast.variant];

  // Animate in
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  // Progress bar
  useEffect(() => {
    if (toast.duration <= 0) return;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 100 - (elapsed / toast.duration) * 100);
      setProgressWidth(pct);
      if (pct > 0) requestAnimationFrame(tick);
    };
    const raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [toast.duration]);

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(() => onDismiss(toast.id), 200);
  };

  return (
    <div
      className={`relative flex items-start gap-3 p-4 rounded-2xl border shadow-lg overflow-hidden transition-all duration-200 ${styles.container} ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
      role="alert"
      aria-live="polite"
    >
      {styles.icon}

      <div className="flex-1 min-w-0 pt-0.5">
        {toast.title && (
          <p className="text-sm font-semibold text-gray-900 mb-0.5">{toast.title}</p>
        )}
        <p className="text-sm text-gray-600">{toast.message}</p>
      </div>

      <button
        onClick={handleDismiss}
        className="shrink-0 text-gray-400 hover:text-gray-600 transition mt-0.5"
        aria-label="Dismiss"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Progress bar */}
      {toast.duration > 0 && (
        <div className="absolute bottom-0 left-0 h-0.5 w-full bg-gray-100">
          <div
            className={`h-full transition-none ${styles.progress}`}
            style={{ width: `${progressWidth}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const dismissAll = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
    setToasts([]);
  }, []);

  const add = useCallback(
    (message: string, options: ToastOptions = {}): string => {
      const id = Math.random().toString(36).slice(2);
      const duration = options.duration ?? DEFAULT_DURATION;
      const newToast: Toast = {
        id,
        message,
        title: options.title,
        variant: options.variant ?? "info",
        duration,
      };

      setToasts((prev) => {
        const next = [...prev, newToast];
        // Drop oldest if over limit
        return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
      });

      if (duration > 0) {
        const timer = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, timer);
      }

      return id;
    },
    [dismiss]
  );

  const toast = useCallback((msg: string, opts?: ToastOptions) => add(msg, opts), [add]);
  const success = useCallback((msg: string, opts?: Omit<ToastOptions, "variant">) => add(msg, { ...opts, variant: "success" }), [add]);
  const error = useCallback((msg: string, opts?: Omit<ToastOptions, "variant">) => add(msg, { ...opts, variant: "error", duration: opts?.duration ?? 6000 }), [add]);
  const warning = useCallback((msg: string, opts?: Omit<ToastOptions, "variant">) => add(msg, { ...opts, variant: "warning" }), [add]);
  const info = useCallback((msg: string, opts?: Omit<ToastOptions, "variant">) => add(msg, { ...opts, variant: "info" }), [add]);

  return (
    <ToastContext.Provider value={{ toast, success, error, warning, info, dismiss, dismissAll }}>
      {children}

      {/* Toast stack */}
      <div
        aria-label="Notifications"
        className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 w-80 pointer-events-none"
      >
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToastContext(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToastContext must be used within ToastProvider");
  return ctx;
}
