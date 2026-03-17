'use client';

import React, { useState, useMemo } from 'react';

export interface Tag {
  id: string;
  label: string;
  count: number;
  category?: string;
}

interface TagCloudProps {
  tags: Tag[];
  onTagClick?: (tag: Tag) => void;
  selectedTags?: string[];
  className?: string;
  maxFontSize?: number;
  minFontSize?: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  default: '#6366f1',
  ai: '#8b5cf6',
  ml: '#ec4899',
  nlp: '#f97316',
  cv: '#22c55e',
  data: '#06b6d4',
  theory: '#f59e0b',
  systems: '#14b8a6',
};

function getCategoryColor(category?: string): string {
  if (!category) return CATEGORY_COLORS.default!;
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.default!;
}

export function TagCloud({
  tags,
  onTagClick,
  selectedTags = [],
  className = '',
  maxFontSize = 22,
  minFontSize = 11,
}: TagCloudProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ visible: boolean; x: number; y: number; tag: Tag | null }>({
    visible: false, x: 0, y: 0, tag: null,
  });

  const { sorted, minCount, maxCount } = useMemo(() => {
    const sorted = [...tags].sort(() => Math.random() - 0.5); // shuffle for visual variety
    const counts = tags.map((t) => t.count);
    return {
      sorted,
      minCount: Math.min(...counts),
      maxCount: Math.max(...counts),
    };
  }, [tags]);

  const getFontSize = (count: number): number => {
    if (maxCount === minCount) return (maxFontSize + minFontSize) / 2;
    const t = (count - minCount) / (maxCount - minCount);
    return minFontSize + t * (maxFontSize - minFontSize);
  };

  const getOpacity = (count: number): number => {
    if (maxCount === minCount) return 0.8;
    const t = (count - minCount) / (maxCount - minCount);
    return 0.5 + t * 0.5;
  };

  const handleMouseEnter = (e: React.MouseEvent, tag: Tag) => {
    setHoveredId(tag.id);
    setTooltip({ visible: true, x: e.clientX, y: e.clientY, tag });
  };

  const handleMouseMove = (e: React.MouseEvent, _tag: Tag) => {
    setTooltip((t) => ({ ...t, x: e.clientX, y: e.clientY }));
  };

  const handleMouseLeave = () => {
    setHoveredId(null);
    setTooltip((t) => ({ ...t, visible: false }));
  };

  return (
    <div className={`relative ${className}`}>
      <div className="flex flex-wrap gap-2 p-4 justify-center items-center min-h-[100px]">
        {sorted.map((tag) => {
          const fontSize = getFontSize(tag.count);
          const color = getCategoryColor(tag.category);
          const isSelected = selectedTags.includes(tag.id);
          const isHovered = hoveredId === tag.id;

          return (
            <button
              key={tag.id}
              onClick={() => onTagClick?.(tag)}
              onMouseEnter={(e) => handleMouseEnter(e, tag)}
              onMouseMove={(e) => handleMouseMove(e, tag)}
              onMouseLeave={handleMouseLeave}
              className="transition-all duration-150 rounded-full leading-none"
              style={{
                fontSize,
                color: isSelected ? 'white' : color,
                background: isSelected
                  ? color
                  : isHovered
                  ? `${color}18`
                  : 'transparent',
                padding: `${Math.max(3, fontSize * 0.25)}px ${Math.max(6, fontSize * 0.4)}px`,
                opacity: isSelected || isHovered ? 1 : getOpacity(tag.count),
                fontWeight: fontSize > 16 ? 600 : 400,
                border: `1px solid ${isSelected ? color : isHovered ? color : color + '40'}`,
                transform: isHovered ? 'scale(1.08)' : 'scale(1)',
              }}
            >
              {tag.label}
            </button>
          );
        })}
      </div>

      {/* Tooltip */}
      {tooltip.visible && tooltip.tag && (
        <div
          className="fixed z-50 pointer-events-none rounded-lg px-3 py-1.5 text-xs shadow-lg"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 30,
            background: '#1f2937',
            color: '#f9fafb',
          }}
        >
          <span className="font-medium">{tooltip.tag.label}</span>
          <span className="ml-2 opacity-70">{tooltip.tag.count} uses</span>
          {tooltip.tag.category && (
            <span className="ml-1 opacity-50">· {tooltip.tag.category}</span>
          )}
        </div>
      )}

      {/* Legend */}
      {Object.keys(CATEGORY_COLORS).filter((k) => k !== 'default' && tags.some((t) => t.category === k)).length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pb-3 justify-center">
          {Object.entries(CATEGORY_COLORS)
            .filter(([key]) => key !== 'default' && tags.some((t) => t.category === key))
            .map(([key, color]) => (
              <div key={key} className="flex items-center gap-1 text-xs text-gray-500">
                <span className="w-2 h-2 rounded-full" style={{ background: color, display: 'inline-block' }} />
                {key}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
