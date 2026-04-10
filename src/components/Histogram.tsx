import * as React from "react";
import { LightingSettings } from "../types";

interface HistogramProps {
  settings: LightingSettings;
}

export function Histogram({ settings }: HistogramProps) {
  // Simplified visualization of how light distribution changes
  // In a real app, this would be calculated from pixel data
  const points = React.useMemo(() => {
    const basePoints = Array.from({ length: 20 }, (_, i) => Math.sin(i / 3) * 20 + 30);
    const shift = (settings.brightness - 100) / 2 + settings.exposure + (settings.whites - 100) / 4 + (settings.blacks - 100) / 4;
    const contrastScale = (settings.contrast / 100) + (settings.highlights - 100) / 200 - (settings.shadows - 100) / 200;
    
    return basePoints.map((p, i) => {
      const x = i * 10;
      const normalizedX = (x - 100) * contrastScale + 100 + shift;
      const height = p * (1 + Math.abs(normalizedX - 100) / 200);
      return { x, y: Math.max(5, Math.min(60, height)) };
    });
  }, [settings]);

  return (
    <div className="h-24 w-full bg-zinc-900/30 rounded-lg border border-zinc-800/50 p-2 flex items-end gap-0.5 overflow-hidden">
      {points.map((p, i) => (
        <div 
          key={i}
          className="flex-1 bg-orange-500/40 rounded-t-[1px] transition-all duration-300"
          style={{ 
            height: `${p.y}%`,
            opacity: 0.3 + (p.y / 100)
          }}
        />
      ))}
    </div>
  );
}
