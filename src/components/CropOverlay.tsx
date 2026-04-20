import * as React from "react";
import { LightingSettings } from "../types";

interface CropOverlayProps {
  settings: LightingSettings;
  onCropChange: (newCrop: Partial<LightingSettings>) => void;
  imageRect: DOMRect | null;
}

export function CropOverlay({ settings, onCropChange, imageRect }: CropOverlayProps) {
  if (!imageRect) return null;

  const handleDrag = (side: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const startCrop = { ...settings };

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = ((moveEvent.clientX - startX) / imageRect.width) * 100;
      const deltaY = ((moveEvent.clientY - startY) / imageRect.height) * 100;

      const updates: Partial<LightingSettings> = {};

      if (side.includes("top")) updates.cropTop = Math.max(0, Math.min(startCrop.cropTop + deltaY, 100 - startCrop.cropBottom - 5));
      if (side.includes("bottom")) updates.cropBottom = Math.max(0, Math.min(startCrop.cropBottom - deltaY, 100 - startCrop.cropTop - 5));
      if (side.includes("left")) updates.cropLeft = Math.max(0, Math.min(startCrop.cropLeft + deltaX, 100 - startCrop.cropRight - 5));
      if (side.includes("right")) updates.cropRight = Math.max(0, Math.min(startCrop.cropRight - deltaX, 100 - startCrop.cropLeft - 5));

      onCropChange(updates);
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <div 
      className="absolute inset-0 pointer-events-none z-40"
      style={{
        top: `${settings.cropTop}%`,
        bottom: `${settings.cropBottom}%`,
        left: `${settings.cropLeft}%`,
        right: `${settings.cropRight}%`,
        border: "2px solid rgba(245, 158, 11, 0.8)",
        boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.5)"
      }}
    >
      {/* Grid lines */}
      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-30 pointer-events-none">
        <div className="border-r border-b border-white/50" />
        <div className="border-r border-b border-white/50" />
        <div className="border-b border-white/50" />
        <div className="border-r border-b border-white/50" />
        <div className="border-r border-b border-white/50" />
        <div className="border-b border-white/50" />
        <div className="border-r border-white/50" />
        <div className="border-r border-white/50" />
        <div />
      </div>

      {/* Handles */}
      <div className="absolute inset-0 pointer-events-auto">
        {/* Corners */}
        <div onMouseDown={(e) => handleDrag("top-left", e)} className="absolute -top-2 -left-2 w-4 h-4 bg-amber-500 rounded-full cursor-nwse-resize shadow-lg" />
        <div onMouseDown={(e) => handleDrag("top-right", e)} className="absolute -top-2 -right-2 w-4 h-4 bg-amber-500 rounded-full cursor-nesw-resize shadow-lg" />
        <div onMouseDown={(e) => handleDrag("bottom-left", e)} className="absolute -bottom-2 -left-2 w-4 h-4 bg-amber-500 rounded-full cursor-nesw-resize shadow-lg" />
        <div onMouseDown={(e) => handleDrag("bottom-right", e)} className="absolute -bottom-2 -right-2 w-4 h-4 bg-amber-500 rounded-full cursor-nwse-resize shadow-lg" />

        {/* Edges */}
        <div onMouseDown={(e) => handleDrag("top", e)} className="absolute -top-1 left-4 right-4 h-2 cursor-ns-resize" />
        <div onMouseDown={(e) => handleDrag("bottom", e)} className="absolute -bottom-1 left-4 right-4 h-2 cursor-ns-resize" />
        <div onMouseDown={(e) => handleDrag("left", e)} className="absolute -left-1 top-4 bottom-4 w-2 cursor-ew-resize" />
        <div onMouseDown={(e) => handleDrag("right", e)} className="absolute -right-1 top-4 bottom-4 w-2 cursor-ew-resize" />
      </div>
    </div>
  );
}
