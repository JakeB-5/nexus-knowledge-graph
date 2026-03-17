"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";

export interface TourStep {
  id: string;
  title: string;
  description: string;
  target: string; // CSS selector for highlighted element
  placement: "top" | "bottom" | "left" | "right";
}

export type TourId = "first-visit" | "graph-explorer" | "search" | "dashboard";

const TOURS: Record<TourId, TourStep[]> = {
  "first-visit": [
    {
      id: "fv-1",
      title: "Welcome to Nexus",
      description: "This is your knowledge graph platform. Let's take a quick tour to help you get started.",
      target: "body",
      placement: "bottom",
    },
    {
      id: "fv-2",
      title: "Sidebar Navigation",
      description: "Use the sidebar to navigate between Workspaces, Collections, the Graph Explorer, and more.",
      target: "[data-tour='sidebar']",
      placement: "right",
    },
    {
      id: "fv-3",
      title: "Quick Create",
      description: "Click the + button in the bottom-right to quickly create nodes, edges, or import data.",
      target: "[data-tour='quick-create']",
      placement: "left",
    },
    {
      id: "fv-4",
      title: "Command Palette",
      description: "Press Cmd+K (or Ctrl+K) at any time to open the command palette for fast navigation.",
      target: "[data-tour='search-trigger']",
      placement: "bottom",
    },
  ],
  "graph-explorer": [
    {
      id: "ge-1",
      title: "Graph Canvas",
      description: "This is your interactive knowledge graph. Nodes are ideas, edges are connections.",
      target: "[data-tour='graph-canvas']",
      placement: "top",
    },
    {
      id: "ge-2",
      title: "Zoom & Pan",
      description: "Scroll to zoom in and out. Click and drag to pan around the graph.",
      target: "[data-tour='graph-controls']",
      placement: "right",
    },
    {
      id: "ge-3",
      title: "Node Detail",
      description: "Click any node to see its full details, connections, and edit its properties.",
      target: "[data-tour='graph-canvas']",
      placement: "bottom",
    },
    {
      id: "ge-4",
      title: "Graph Filters",
      description: "Use the filter panel to focus on specific node types, date ranges, or tags.",
      target: "[data-tour='graph-filters']",
      placement: "left",
    },
  ],
  search: [
    {
      id: "s-1",
      title: "Advanced Search",
      description: "Build powerful queries combining node types, tags, owners, dates, and content.",
      target: "[data-tour='search-filters']",
      placement: "right",
    },
    {
      id: "s-2",
      title: "Query Builder",
      description: "Select node types with checkboxes. Leave all unchecked to search across all types.",
      target: "[data-tour='node-type-filter']",
      placement: "right",
    },
    {
      id: "s-3",
      title: "Save Searches",
      description: "Save your most-used queries as presets for quick access in the future.",
      target: "[data-tour='save-search']",
      placement: "bottom",
    },
  ],
  dashboard: [
    {
      id: "d-1",
      title: "Dashboard Overview",
      description: "Your dashboard shows key stats and recent activity across all your workspaces.",
      target: "[data-tour='stat-cards']",
      placement: "bottom",
    },
    {
      id: "d-2",
      title: "Activity Feed",
      description: "See what your teammates have been working on in real time.",
      target: "[data-tour='activity-feed']",
      placement: "left",
    },
    {
      id: "d-3",
      title: "Quick Actions",
      description: "Use quick actions to jump straight into common tasks without navigating.",
      target: "[data-tour='quick-actions']",
      placement: "top",
    },
  ],
};

interface TooltipPosition {
  top: number;
  left: number;
  arrowTop?: number;
  arrowLeft?: number;
  arrowDir: "top" | "bottom" | "left" | "right" | "none";
}

function getTooltipPosition(targetRect: DOMRect | null, placement: TourStep["placement"], tooltipW = 280, tooltipH = 140): TooltipPosition {
  if (!targetRect) {
    return { top: window.innerHeight / 2 - tooltipH / 2, left: window.innerWidth / 2 - tooltipW / 2, arrowDir: "none" };
  }
  const gap = 12;
  const cx = targetRect.left + targetRect.width / 2;
  const cy = targetRect.top + targetRect.height / 2;

  switch (placement) {
    case "bottom":
      return {
        top: targetRect.bottom + gap,
        left: Math.max(8, Math.min(cx - tooltipW / 2, window.innerWidth - tooltipW - 8)),
        arrowDir: "top",
        arrowLeft: cx - Math.max(8, Math.min(cx - tooltipW / 2, window.innerWidth - tooltipW - 8)) - 8,
      };
    case "top":
      return {
        top: targetRect.top - tooltipH - gap,
        left: Math.max(8, Math.min(cx - tooltipW / 2, window.innerWidth - tooltipW - 8)),
        arrowDir: "bottom",
        arrowLeft: cx - Math.max(8, Math.min(cx - tooltipW / 2, window.innerWidth - tooltipW - 8)) - 8,
      };
    case "right":
      return {
        top: Math.max(8, Math.min(cy - tooltipH / 2, window.innerHeight - tooltipH - 8)),
        left: targetRect.right + gap,
        arrowDir: "left",
        arrowTop: cy - Math.max(8, Math.min(cy - tooltipH / 2, window.innerHeight - tooltipH - 8)) - 8,
      };
    case "left":
      return {
        top: Math.max(8, Math.min(cy - tooltipH / 2, window.innerHeight - tooltipH - 8)),
        left: targetRect.left - tooltipW - gap,
        arrowDir: "right",
        arrowTop: cy - Math.max(8, Math.min(cy - tooltipH / 2, window.innerHeight - tooltipH - 8)) - 8,
      };
  }
}

interface GuidedTourProps {
  tourId: TourId;
  active: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

export function GuidedTour({ tourId, active, onComplete, onSkip }: GuidedTourProps) {
  const steps = TOURS[tourId] ?? [];
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const currentStep = steps[stepIndex];

  const measureTarget = useCallback(() => {
    if (!currentStep) return;
    if (currentStep.target === "body") {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(currentStep.target);
    if (el) {
      setTargetRect(el.getBoundingClientRect());
    } else {
      setTargetRect(null);
    }
  }, [currentStep]);

  useEffect(() => {
    if (!active) return;
    setStepIndex(0);
  }, [active, tourId]);

  useEffect(() => {
    if (!active) return;
    measureTarget();
    window.addEventListener("resize", measureTarget);
    window.addEventListener("scroll", measureTarget, true);
    return () => {
      window.removeEventListener("resize", measureTarget);
      window.removeEventListener("scroll", measureTarget, true);
    };
  }, [active, measureTarget]);

  const handleNext = useCallback(() => {
    if (stepIndex < steps.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      onComplete();
    }
  }, [stepIndex, steps.length, onComplete]);

  const handlePrev = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!active) return;
      if (e.key === "ArrowRight" || e.key === "Enter") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "Escape") onSkip();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, handleNext, handlePrev, onSkip]);

  if (!active || !currentStep) return null;

  const pos = getTooltipPosition(targetRect, currentStep.placement);
  const hasTarget = targetRect !== null;
  const padding = 6;

  const ARROW_SIZE = 8;
  const arrowStyle: React.CSSProperties = {};
  if (pos.arrowDir === "top") {
    arrowStyle.top = -ARROW_SIZE;
    arrowStyle.left = pos.arrowLeft ?? 24;
    arrowStyle.borderWidth = `0 ${ARROW_SIZE}px ${ARROW_SIZE}px ${ARROW_SIZE}px`;
    arrowStyle.borderColor = "transparent transparent white transparent";
  } else if (pos.arrowDir === "bottom") {
    arrowStyle.bottom = -ARROW_SIZE;
    arrowStyle.left = pos.arrowLeft ?? 24;
    arrowStyle.borderWidth = `${ARROW_SIZE}px ${ARROW_SIZE}px 0 ${ARROW_SIZE}px`;
    arrowStyle.borderColor = "white transparent transparent transparent";
  } else if (pos.arrowDir === "left") {
    arrowStyle.left = -ARROW_SIZE;
    arrowStyle.top = pos.arrowTop ?? 24;
    arrowStyle.borderWidth = `${ARROW_SIZE}px ${ARROW_SIZE}px ${ARROW_SIZE}px 0`;
    arrowStyle.borderColor = "transparent white transparent transparent";
  } else if (pos.arrowDir === "right") {
    arrowStyle.right = -ARROW_SIZE;
    arrowStyle.top = pos.arrowTop ?? 24;
    arrowStyle.borderWidth = `${ARROW_SIZE}px 0 ${ARROW_SIZE}px ${ARROW_SIZE}px`;
    arrowStyle.borderColor = "transparent transparent transparent white";
  }

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none">
      {/* Dark backdrop with cutout */}
      <svg className="absolute inset-0 w-full h-full pointer-events-auto" style={{ cursor: "default" }} onClick={onSkip}>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {hasTarget && (
              <rect
                x={targetRect!.left - padding}
                y={targetRect!.top - padding}
                width={targetRect!.width + padding * 2}
                height={targetRect!.height + padding * 2}
                rx={10}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#tour-mask)" />
      </svg>

      {/* Highlight ring */}
      {hasTarget && (
        <div
          className="absolute pointer-events-none rounded-xl ring-2 ring-nexus-400 ring-offset-2"
          style={{
            top: targetRect!.top - padding,
            left: targetRect!.left - padding,
            width: targetRect!.width + padding * 2,
            height: targetRect!.height + padding * 2,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="absolute pointer-events-auto w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 p-5"
        style={{ top: pos.top, left: pos.left }}
      >
        {/* Arrow */}
        {pos.arrowDir !== "none" && (
          <div
            className="absolute w-0 h-0"
            style={{ borderStyle: "solid", ...arrowStyle }}
          />
        )}

        {/* Step counter */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`rounded-full transition-all ${
                  i === stepIndex
                    ? "w-5 h-2 bg-nexus-600"
                    : i < stepIndex
                    ? "w-2 h-2 bg-nexus-400"
                    : "w-2 h-2 bg-gray-200"
                }`}
              />
            ))}
          </div>
          <span className="text-xs text-gray-400 font-medium">{stepIndex + 1} / {steps.length}</span>
        </div>

        {/* Content */}
        <h3 className="text-sm font-semibold text-gray-900 mb-1.5">{currentStep.title}</h3>
        <p className="text-sm text-gray-500 leading-relaxed mb-4">{currentStep.description}</p>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={onSkip}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors mr-auto"
          >
            Skip tour
          </button>
          {stepIndex > 0 && (
            <button
              onClick={handlePrev}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
          )}
          <button
            onClick={handleNext}
            className="px-4 py-1.5 bg-nexus-600 text-white rounded-lg text-xs font-semibold hover:bg-nexus-700 transition-colors"
          >
            {stepIndex === steps.length - 1 ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Hook for managing tour state
export function useGuidedTour(tourId: TourId) {
  const [active, setActive] = useState(false);

  function start() { setActive(true); }
  function stop() { setActive(false); }

  return {
    active,
    start,
    tourProps: {
      tourId,
      active,
      onComplete: stop,
      onSkip: stop,
    },
  };
}

// TourProvider: renders the tour and a launcher button
interface TourLauncherProps {
  tourId: TourId;
  label?: string;
  className?: string;
}

export function TourLauncher({ tourId, label = "Take a Tour", className = "" }: TourLauncherProps) {
  const { start, tourProps } = useGuidedTour(tourId);

  return (
    <>
      <button
        onClick={start}
        className={`inline-flex items-center gap-2 px-3 py-1.5 border border-nexus-200 text-nexus-700 rounded-lg text-sm font-medium hover:bg-nexus-50 transition-colors ${className}`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
        </svg>
        {label}
      </button>
      <GuidedTour {...tourProps} />
    </>
  );
}
