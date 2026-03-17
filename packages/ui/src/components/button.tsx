import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

const variantClasses = {
  primary: "bg-nexus-600 text-white hover:bg-nexus-700 focus:ring-nexus-200",
  secondary: "border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-200",
  ghost: "text-gray-600 hover:bg-gray-100 focus:ring-gray-200",
  danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-200",
};

const sizeClasses = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
