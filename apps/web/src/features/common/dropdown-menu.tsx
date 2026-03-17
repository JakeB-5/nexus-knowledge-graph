"use client";

import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  useId,
} from "react";

// ---- Context ----

interface DropdownContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
  triggerId: string;
  menuId: string;
  activeIndex: number;
  setActiveIndex: (i: number) => void;
}

const DropdownContext = createContext<DropdownContextValue | null>(null);

function useDropdown() {
  const ctx = useContext(DropdownContext);
  if (!ctx) throw new Error("Dropdown components must be used within DropdownMenu");
  return ctx;
}

// ---- Root ----

interface DropdownMenuProps {
  children: React.ReactNode;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function DropdownMenu({ children, defaultOpen = false, onOpenChange }: DropdownMenuProps) {
  const [open, setOpenState] = useState(defaultOpen);
  const [activeIndex, setActiveIndex] = useState(-1);
  const id = useId();

  const setOpen = useCallback(
    (v: boolean) => {
      setOpenState(v);
      if (!v) setActiveIndex(-1);
      onOpenChange?.(v);
    },
    [onOpenChange]
  );

  return (
    <DropdownContext.Provider
      value={{
        open,
        setOpen,
        triggerId: `${id}-trigger`,
        menuId: `${id}-menu`,
        activeIndex,
        setActiveIndex,
      }}
    >
      <div className="relative inline-block">{children}</div>
    </DropdownContext.Provider>
  );
}

// ---- Trigger ----

interface DropdownTriggerProps {
  children: React.ReactNode;
  className?: string;
  asChild?: boolean;
}

export function DropdownTrigger({ children, className = "" }: DropdownTriggerProps) {
  const { open, setOpen, triggerId, menuId } = useDropdown();

  return (
    <button
      id={triggerId}
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={menuId}
      onClick={() => setOpen(!open)}
      className={className}
    >
      {children}
    </button>
  );
}

// ---- Content ----

type DropdownAlign = "start" | "center" | "end";
type DropdownSide = "bottom" | "top";

interface DropdownContentProps {
  children: React.ReactNode;
  align?: DropdownAlign;
  side?: DropdownSide;
  className?: string;
  minWidth?: number;
}

const ALIGN_CLASSES: Record<DropdownAlign, string> = {
  start: "left-0",
  center: "left-1/2 -translate-x-1/2",
  end: "right-0",
};

const SIDE_CLASSES: Record<DropdownSide, string> = {
  bottom: "top-full mt-1.5",
  top: "bottom-full mb-1.5",
};

export function DropdownContent({
  children,
  align = "start",
  side = "bottom",
  className = "",
  minWidth = 180,
}: DropdownContentProps) {
  const { open, setOpen, menuId, triggerId, activeIndex, setActiveIndex } = useDropdown();
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        const trigger = document.getElementById(triggerId);
        if (trigger?.contains(e.target as Node)) return;
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, setOpen, triggerId]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])');
    const count = items?.length ?? 0;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); return; }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = (activeIndex + 1) % count;
        setActiveIndex(next);
        items?.[next]?.focus();
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = (activeIndex - 1 + count) % count;
        setActiveIndex(prev);
        items?.[prev]?.focus();
      }
      if (e.key === "Tab") setOpen(false);
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, activeIndex, setActiveIndex, setOpen]);

  if (!open) return null;

  return (
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      aria-labelledby={triggerId}
      style={{ minWidth }}
      className={`absolute z-50 bg-white border border-slate-200 rounded-xl shadow-lg py-1 overflow-hidden
        ${ALIGN_CLASSES[align]} ${SIDE_CLASSES[side]} ${className}`}
    >
      {children}
    </div>
  );
}

// ---- Item ----

interface DropdownItemProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "danger";
  icon?: React.ReactNode;
  shortcut?: string;
  className?: string;
}

export function DropdownItem({
  children,
  onClick,
  disabled = false,
  variant = "default",
  icon,
  shortcut,
  className = "",
}: DropdownItemProps) {
  const { setOpen } = useDropdown();

  const handleClick = () => {
    if (disabled) return;
    onClick?.();
    setOpen(false);
  };

  const colorClass =
    variant === "danger"
      ? "text-red-600 hover:bg-red-50 focus:bg-red-50"
      : "text-slate-700 hover:bg-slate-50 focus:bg-slate-50";

  return (
    <button
      role="menuitem"
      type="button"
      disabled={disabled}
      onClick={handleClick}
      className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left transition-colors
        focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed
        ${colorClass} ${className}`}
    >
      {icon && <span className="w-4 h-4 shrink-0 opacity-70">{icon}</span>}
      <span className="flex-1">{children}</span>
      {shortcut && (
        <span className="text-xs text-slate-400 ml-4 font-mono">{shortcut}</span>
      )}
    </button>
  );
}

// ---- Separator ----

export function DropdownSeparator({ className = "" }: { className?: string }) {
  return <div role="separator" className={`h-px bg-slate-100 my-1 ${className}`} />;
}

// ---- Label ----

export function DropdownLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide ${className}`}>
      {children}
    </div>
  );
}
