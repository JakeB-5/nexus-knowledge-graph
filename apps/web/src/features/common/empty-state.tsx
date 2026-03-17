import React from "react";

interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  href?: string;
  variant?: "primary" | "secondary";
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actions?: EmptyStateAction[];
  className?: string;
  size?: "sm" | "md" | "lg";
}

const SIZE_STYLES = {
  sm: { wrapper: "py-8 px-4", icon: "w-10 h-10", title: "text-sm", desc: "text-xs", iconWrap: "w-12 h-12 mb-3" },
  md: { wrapper: "py-12 px-6", icon: "w-12 h-12", title: "text-base", desc: "text-sm", iconWrap: "w-16 h-16 mb-4" },
  lg: { wrapper: "py-16 px-8", icon: "w-14 h-14", title: "text-lg", desc: "text-sm", iconWrap: "w-20 h-20 mb-5" },
};

const DEFAULT_ICON = (
  <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
  </svg>
);

export default function EmptyState({
  icon = DEFAULT_ICON,
  title,
  description,
  actions = [],
  className = "",
  size = "md",
}: EmptyStateProps) {
  const s = SIZE_STYLES[size];

  return (
    <div className={`flex flex-col items-center justify-center text-center ${s.wrapper} ${className}`}>
      <div className={`${s.iconWrap} rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 p-3`}>
        <span className={s.icon}>{icon}</span>
      </div>

      <h3 className={`font-semibold text-slate-900 mb-1 ${s.title}`}>{title}</h3>

      {description && (
        <p className={`text-slate-500 max-w-xs mb-5 leading-relaxed ${s.desc}`}>{description}</p>
      )}

      {actions.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {actions.map((action, i) => {
            const isPrimary = action.variant !== "secondary";
            const baseClass = `px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              isPrimary
                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
            }`;

            if (action.href) {
              return (
                <a key={i} href={action.href} className={baseClass}>
                  {action.label}
                </a>
              );
            }

            return (
              <button key={i} onClick={action.onClick} className={baseClass}>
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
