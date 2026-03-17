"use client";

import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode | ((error: Error, reset: () => void) => React.ReactNode);
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.props.onError?.(error, info);
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (error) {
      if (typeof fallback === "function") return fallback(error, this.reset);
      if (fallback) return fallback;

      return (
        <div className="flex flex-col items-center justify-center min-h-48 p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-slate-900 mb-1">Something went wrong</h3>
          <p className="text-sm text-slate-500 mb-4 max-w-sm">
            {error.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={this.reset}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium
              hover:bg-indigo-700 transition-colors"
          >
            Try again
          </button>
        </div>
      );
    }

    return children;
  }
}

// Functional wrapper for convenience
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ErrorBoundaryProps["fallback"]
) {
  const Wrapped = (props: P) => (
    <ErrorBoundary fallback={fallback}>
      <Component {...props} />
    </ErrorBoundary>
  );
  Wrapped.displayName = `withErrorBoundary(${Component.displayName ?? Component.name})`;
  return Wrapped;
}
