import * as React from "react";
import { Label } from "@/components/ui/label";

interface ColorWheelProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
  onCommit: (color: string) => void;
}

function ColorWheel({ label, value, onChange, onCommit }: ColorWheelProps) {
  const wheelRef = React.useRef<HTMLDivElement>(null);
  const isDraggingRef = React.useRef(false);
  const lastValueRef = React.useRef(value);

  // Parse current value → {h, s} for pointer position
  const parsedValue = React.useMemo(() => {
    if (!value || value === "transparent") return null;
    try {
      const parts = value.match(/[\d.]+/g);
      if (!parts || parts.length < 2) return null;
      return { h: parseFloat(parts[0]), s: parseFloat(parts[1]) };
    } catch { return null; }
  }, [value]);

  const getColorFromEvent = React.useCallback((e: PointerEvent | React.PointerEvent) => {
    const wheel = wheelRef.current;
    if (!wheel) return null;
    const rect = wheel.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const radius = rect.width / 2;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Clamp to wheel boundary
    const clampedDist = Math.min(dist, radius);
    let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (angle < 0) angle += 360;
    if (angle >= 360) angle -= 360;
    const saturation = (clampedDist / radius) * 100;

    return `hsla(${angle.toFixed(1)}, ${saturation.toFixed(1)}%, 50%, 0.6)`;
  }, []);

  const handlePointerDown = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    isDraggingRef.current = true;
    // Pointer capture: drag continues even if pointer leaves the element
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    const color = getColorFromEvent(e);
    if (color) { lastValueRef.current = color; onChange(color); }
  }, [getColorFromEvent, onChange]);

  const handlePointerMove = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    e.preventDefault();
    const color = getColorFromEvent(e);
    if (color) { lastValueRef.current = color; onChange(color); }
  }, [getColorFromEvent, onChange]);

  const handlePointerUp = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    onCommit(lastValueRef.current);
  }, [onCommit]);

  // Pointer dot position
  const pointerStyle = React.useMemo(() => {
    if (!parsedValue) return null;
    const { h, s } = parsedValue;
    const angleRad = (h - 90) * (Math.PI / 180);
    const r = (s / 100) * 50; // % of element half-width
    return {
      left: `${50 + r * Math.cos(angleRad)}%`,
      top: `${50 + r * Math.sin(angleRad)}%`,
      backgroundColor: value.replace("0.6", "1"),
    };
  }, [parsedValue, value]);

  return (
    <div className="flex flex-col items-center gap-2">
      <Label className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">
        {label}
      </Label>

      <div
        ref={wheelRef}
        className="relative cursor-crosshair select-none touch-none"
        style={{ width: 80, height: 80, borderRadius: "50%", overflow: "hidden" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Hue ring (conic gradient) */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: "conic-gradient(from 270deg, red, yellow, lime, cyan, blue, magenta, red)",
          }}
        />
        {/* Saturation fade: radial white→transparent overlaid on hue ring */}
        {/* This creates the classic wheel: saturated on edge, neutral white at center */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,255,255,0.6) 30%, rgba(255,255,255,0) 70%)",
          }}
        />
        {/* Subtle dark border for depth */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{ boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.4), inset 0 0 8px rgba(0,0,0,0.2)" }}
        />
        {/* Drag indicator dot */}
        {pointerStyle && (
          <div
            className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow-lg pointer-events-none z-10"
            style={{
              ...pointerStyle,
              transform: "translate(-50%, -50%)",
              boxShadow: "0 0 0 1px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.5)",
            }}
          />
        )}
      </div>

      {/* Current color swatch + reset */}
      <div className="flex items-center gap-2">
        <div
          className="w-4 h-4 rounded-full border border-zinc-700"
          style={{ background: value === "transparent" ? "#3f3f46" : value.replace("0.6", "1") }}
        />
        <button
          onClick={() => { onChange("transparent"); onCommit("transparent"); }}
          className="text-[8px] uppercase text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

interface ColorBalanceProps {
  shadows: string;
  midtones: string;
  highlights: string;
  onChange: (key: "shadowTint" | "midtoneTint" | "highlightTint", value: string) => void;
  onCommit: (key: "shadowTint" | "midtoneTint" | "highlightTint", value: string) => void;
}

export function ColorBalance({ shadows, midtones, highlights, onChange, onCommit }: ColorBalanceProps) {
  return (
    <div className="flex justify-between items-start px-1">
      <ColorWheel
        label="Sombras"
        value={shadows}
        onChange={(v) => onChange("shadowTint", v)}
        onCommit={(v) => onCommit("shadowTint", v)}
      />
      <ColorWheel
        label="Medios"
        value={midtones}
        onChange={(v) => onChange("midtoneTint", v)}
        onCommit={(v) => onCommit("midtoneTint", v)}
      />
      <ColorWheel
        label="Altas"
        value={highlights}
        onChange={(v) => onChange("highlightTint", v)}
        onCommit={(v) => onCommit("highlightTint", v)}
      />
    </div>
  );
}
