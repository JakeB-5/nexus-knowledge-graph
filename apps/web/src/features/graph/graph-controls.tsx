"use client";

import React from "react";

export type LayoutType = "force" | "circular" | "hierarchical";

interface GraphControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onLayoutChange: (layout: LayoutType) => void;
  onToggleLabels: () => void;
  onToggleArrows: () => void;
  onToggleMinimap: () => void;
  onExportPNG: () => void;
  onToggleFullscreen: () => void;
  currentLayout: LayoutType;
  showLabels: boolean;
  showArrows: boolean;
  showMinimap: boolean;
  isFullscreen: boolean;
  className?: string;
}

function ControlButton({
  onClick,
  title,
  active,
  children,
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center justify-center w-8 h-8 rounded-md text-sm transition-colors
        ${active
          ? "bg-indigo-600 text-white"
          : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
        }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-6 bg-slate-200 mx-1" />;
}

export default function GraphControls({
  onZoomIn,
  onZoomOut,
  onFitView,
  onLayoutChange,
  onToggleLabels,
  onToggleArrows,
  onToggleMinimap,
  onExportPNG,
  onToggleFullscreen,
  currentLayout,
  showLabels,
  showArrows,
  showMinimap,
  isFullscreen,
  className = "",
}: GraphControlsProps) {
  const layouts: { value: LayoutType; label: string; icon: string }[] = [
    { value: "force", label: "Force", icon: "⚛" },
    { value: "circular", label: "Circular", icon: "◯" },
    { value: "hierarchical", label: "Hierarchical", icon: "⬆" },
  ];

  return (
    <div
      className={`flex items-center gap-1 px-2 py-1.5 bg-white border border-slate-200 rounded-xl shadow-md ${className}`}
    >
      {/* Zoom controls */}
      <ControlButton onClick={onZoomIn} title="Zoom in">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
        </svg>
      </ControlButton>

      <ControlButton onClick={onZoomOut} title="Zoom out">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
        </svg>
      </ControlButton>

      <ControlButton onClick={onFitView} title="Fit to view">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
      </ControlButton>

      <Divider />

      {/* Layout selector */}
      <div className="flex items-center gap-0.5">
        {layouts.map((layout) => (
          <button
            key={layout.value}
            onClick={() => onLayoutChange(layout.value)}
            title={`${layout.label} layout`}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors
              ${currentLayout === layout.value
                ? "bg-indigo-600 text-white"
                : "text-slate-600 hover:bg-slate-100"
              }`}
          >
            <span className="mr-1">{layout.icon}</span>
            {layout.label}
          </button>
        ))}
      </div>

      <Divider />

      {/* Toggle controls */}
      <ControlButton onClick={onToggleLabels} title="Toggle labels" active={showLabels}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
        </svg>
      </ControlButton>

      <ControlButton onClick={onToggleArrows} title="Toggle arrows" active={showArrows}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M17 8l4 4m0 0l-4 4m4-4H3" />
        </svg>
      </ControlButton>

      <ControlButton onClick={onToggleMinimap} title="Toggle minimap" active={showMinimap}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      </ControlButton>

      <Divider />

      {/* Export and fullscreen */}
      <ControlButton onClick={onExportPNG} title="Export as PNG">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      </ControlButton>

      <ControlButton onClick={onToggleFullscreen} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
        {isFullscreen ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        )}
      </ControlButton>
    </div>
  );
}
