import React from "react";

function Shimmer({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`animate-pulse bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200
        bg-[length:400%_100%] rounded-lg ${className}`}
      style={{ backgroundSize: "400% 100%", animation: "shimmer 1.4s ease infinite", ...style }}
    />
  );
}

// Inject keyframes via a style tag once
function ShimmerStyles() {
  return (
    <style>{`
      @keyframes shimmer {
        0% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
    `}</style>
  );
}

// ---- Text skeleton ----
interface TextSkeletonProps {
  lines?: number;
  className?: string;
  lastLineWidth?: string;
}

export function TextSkeleton({ lines = 3, className = "", lastLineWidth = "60%" }: TextSkeletonProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      <ShimmerStyles />
      {Array.from({ length: lines }).map((_, i) => (
        <Shimmer
          key={i}
          className="h-4"
          style={{ width: i === lines - 1 ? lastLineWidth : "100%" } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

// ---- Card skeleton ----
interface CardSkeletonProps {
  showImage?: boolean;
  lines?: number;
  className?: string;
}

export function CardSkeleton({ showImage = false, lines = 3, className = "" }: CardSkeletonProps) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 p-5 space-y-4 ${className}`}>
      <ShimmerStyles />
      {showImage && <Shimmer className="w-full h-40 rounded-xl" />}
      <div className="space-y-2">
        <Shimmer className="h-5 w-3/4" />
        <Shimmer className="h-4 w-1/2" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Shimmer key={i} className="h-3" style={{ width: i === lines - 1 ? "70%" : "100%" } as React.CSSProperties} />
        ))}
      </div>
    </div>
  );
}

// ---- Table row skeleton ----
interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export function TableSkeleton({ rows = 5, columns = 4, className = "" }: TableSkeletonProps) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 overflow-hidden ${className}`}>
      <ShimmerStyles />
      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-3.5 border-b border-slate-100 bg-slate-50">
        {Array.from({ length: columns }).map((_, i) => (
          <Shimmer key={i} className="h-3 flex-1" style={{ maxWidth: i === 0 ? "30%" : undefined } as React.CSSProperties} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={rowIdx} className="flex items-center gap-4 px-5 py-4 border-b border-slate-50 last:border-0">
          {Array.from({ length: columns }).map((_, colIdx) => (
            <Shimmer
              key={colIdx}
              className="h-4 flex-1"
              style={{
                maxWidth: colIdx === 0 ? "30%" : colIdx === columns - 1 ? "10%" : undefined,
                width: `${70 + Math.random() * 30}%`,
              } as React.CSSProperties}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ---- Node list skeleton ----
interface NodeListSkeletonProps {
  count?: number;
  className?: string;
}

export function NodeListSkeleton({ count = 4, className = "" }: NodeListSkeletonProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      <ShimmerStyles />
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-3">
          <Shimmer className="w-10 h-10 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <Shimmer className="h-4 w-1/2" />
            <Shimmer className="h-3 w-1/3" />
          </div>
          <Shimmer className="h-3 w-16 mt-1 shrink-0" />
        </div>
      ))}
    </div>
  );
}

// ---- Graph skeleton ----
export function GraphSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 overflow-hidden relative ${className}`}>
      <ShimmerStyles />
      <Shimmer className="w-full h-full min-h-96" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <svg
            className="w-10 h-10 text-slate-300 mx-auto mb-2 animate-pulse"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <p className="text-sm text-slate-400">Loading graph...</p>
        </div>
      </div>
    </div>
  );
}

// ---- Stat card skeleton ----
export function StatCardSkeleton({ count = 4, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-4 gap-4 ${className}`}>
      <ShimmerStyles />
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
          <Shimmer className="h-3 w-2/3" />
          <Shimmer className="h-7 w-1/2" />
        </div>
      ))}
    </div>
  );
}

// ---- Detail page skeleton ----
export function DetailPageSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`max-w-4xl mx-auto space-y-5 ${className}`}>
      <ShimmerStyles />
      <Shimmer className="h-4 w-40" />
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
        <div className="flex gap-2">
          <Shimmer className="h-6 w-20 rounded-full" />
          <Shimmer className="h-6 w-16 rounded-full" />
        </div>
        <Shimmer className="h-8 w-3/4" />
        <Shimmer className="h-4 w-1/2" />
      </div>
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 space-y-5">
          <CardSkeleton lines={6} />
          <CardSkeleton lines={3} />
        </div>
        <div className="space-y-5">
          <CardSkeleton lines={4} />
          <CardSkeleton lines={3} />
        </div>
      </div>
    </div>
  );
}
