import { useState, useCallback, useRef } from "react";

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
  title?: string;
}

interface ToastOptions {
  title?: string;
  duration?: number;
  variant?: ToastVariant;
}

interface UseToastReturn {
  toasts: Toast[];
  toast: (message: string, options?: ToastOptions) => string;
  success: (message: string, options?: Omit<ToastOptions, "variant">) => string;
  error: (message: string, options?: Omit<ToastOptions, "variant">) => string;
  warning: (message: string, options?: Omit<ToastOptions, "variant">) => string;
  info: (message: string, options?: Omit<ToastOptions, "variant">) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const DEFAULT_DURATION = 4000;

/**
 * Toast notification system hook.
 * Use this with ToastProvider or standalone with the returned toasts array.
 */
export function useToast(): UseToastReturn {
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
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current.clear();
    setToasts([]);
  }, []);

  const add = useCallback(
    (message: string, options: ToastOptions = {}): string => {
      const id = Math.random().toString(36).slice(2);
      const duration = options.duration ?? DEFAULT_DURATION;
      const toast: Toast = {
        id,
        message,
        variant: options.variant ?? "info",
        duration,
        title: options.title,
      };

      setToasts((prev) => {
        // Limit to 5 visible toasts, dropping oldest
        const next = [...prev, toast];
        return next.length > 5 ? next.slice(next.length - 5) : next;
      });

      if (duration > 0) {
        const timer = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, timer);
      }

      return id;
    },
    [dismiss]
  );

  const toast = useCallback(
    (message: string, options?: ToastOptions) => add(message, options),
    [add]
  );

  const success = useCallback(
    (message: string, options?: Omit<ToastOptions, "variant">) =>
      add(message, { ...options, variant: "success" }),
    [add]
  );

  const error = useCallback(
    (message: string, options?: Omit<ToastOptions, "variant">) =>
      add(message, { ...options, variant: "error", duration: options?.duration ?? 6000 }),
    [add]
  );

  const warning = useCallback(
    (message: string, options?: Omit<ToastOptions, "variant">) =>
      add(message, { ...options, variant: "warning" }),
    [add]
  );

  const info = useCallback(
    (message: string, options?: Omit<ToastOptions, "variant">) =>
      add(message, { ...options, variant: "info" }),
    [add]
  );

  return { toasts, toast, success, error, warning, info, dismiss, dismissAll };
}
