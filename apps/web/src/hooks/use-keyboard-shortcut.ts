import { useEffect, useCallback } from "react";

interface ShortcutOptions {
  /** Require Ctrl/Cmd key */
  ctrl?: boolean;
  /** Require Alt/Option key */
  alt?: boolean;
  /** Require Shift key */
  shift?: boolean;
  /** Require Meta key (Cmd on Mac, Win on Windows) */
  meta?: boolean;
  /** Prevent default browser behavior */
  preventDefault?: boolean;
  /** Only fire when this element or its children are focused */
  targetElement?: HTMLElement | null;
  /** Disable the shortcut */
  disabled?: boolean;
}

/**
 * Registers a keyboard shortcut and fires the handler when matched.
 * Automatically cleans up on unmount.
 */
export function useKeyboardShortcut(
  key: string,
  handler: (event: KeyboardEvent) => void,
  options: ShortcutOptions = {}
): void {
  const {
    ctrl = false,
    alt = false,
    shift = false,
    meta = false,
    preventDefault = true,
    targetElement,
    disabled = false,
  } = options;

  const memoHandler = useCallback(handler, [handler]);

  useEffect(() => {
    if (disabled) return;

    const listener = (event: KeyboardEvent) => {
      // Check modifier keys
      const ctrlMatch = ctrl ? (event.ctrlKey || event.metaKey) : true;
      const altMatch = alt ? event.altKey : !event.altKey || alt;
      const shiftMatch = shift ? event.shiftKey : !event.shiftKey || shift;
      const metaMatch = meta ? event.metaKey : true;

      // Strict modifier check when specified
      if (ctrl && !event.ctrlKey && !event.metaKey) return;
      if (alt && !event.altKey) return;
      if (shift && !event.shiftKey) return;
      if (meta && !event.metaKey) return;

      // Avoid triggering inside input elements unless explicitly targeting them
      const target = event.target as HTMLElement;
      const isInput = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
      if (isInput && !targetElement) return;

      if (event.key.toLowerCase() !== key.toLowerCase()) return;

      void ctrlMatch; void altMatch; void shiftMatch; void metaMatch;

      if (preventDefault) event.preventDefault();
      memoHandler(event);
    };

    const el = targetElement ?? document;
    el.addEventListener("keydown", listener as EventListener);
    return () => el.removeEventListener("keydown", listener as EventListener);
  }, [key, ctrl, alt, shift, meta, preventDefault, targetElement, disabled, memoHandler]);
}

/**
 * Register multiple shortcuts at once.
 */
export function useKeyboardShortcuts(
  shortcuts: Array<{
    key: string;
    handler: (event: KeyboardEvent) => void;
    options?: ShortcutOptions;
  }>
): void {
  useEffect(() => {
    const listeners = shortcuts.map(({ key, handler, options = {} }) => {
      const { ctrl = false, alt = false, shift = false, preventDefault = true, disabled = false } = options;

      const listener = (event: KeyboardEvent) => {
        if (disabled) return;
        if (ctrl && !event.ctrlKey && !event.metaKey) return;
        if (alt && !event.altKey) return;
        if (shift && !event.shiftKey) return;
        if (event.key.toLowerCase() !== key.toLowerCase()) return;

        const target = event.target as HTMLElement;
        if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

        if (preventDefault) event.preventDefault();
        handler(event);
      };

      document.addEventListener("keydown", listener);
      return listener;
    });

    return () => {
      listeners.forEach((l) => document.removeEventListener("keydown", l));
    };
  }, [shortcuts]);
}
