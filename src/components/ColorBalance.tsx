import * as React from "react";
import { Label } from "@/components/ui/label";

interface ColorWheelProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
}

function ColorWheel({ label, value, onChange }: ColorWheelProps) {
  // Simplified color wheel using a circular div and a pointer
  // In a real app, this would use a canvas or a specialized library
  const [isDragging, setIsDragging] = React.useState(false);
  const wheelRef = React.useRef<HTMLDivElement>(null);

  const handleInteraction = (e: React.MouseEvent | React.TouchEvent) => {
    if (!wheelRef.current) return;
    const rect = wheelRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const radius = rect.width / 2;
    
    // Calculate angle for hue
    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
    if (angle < 0) angle += 360;
    
    // Calculate saturation based on distance from center
    const saturation = Math.min(100, (distance / radius) * 100);
    
    if (distance <= radius || isDragging) {
      const safeAngle = typeof angle === 'number' ? angle : 0;
      const safeSaturation = typeof saturation === 'number' ? saturation : 0;
      onChange(`hsla(${safeAngle.toFixed(0)}, ${safeSaturation.toFixed(0)}%, 50%, 0.5)`);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <Label className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">{label}</Label>
      <div 
        ref={wheelRef}
        className="w-20 h-20 rounded-full relative cursor-crosshair border border-zinc-800 shadow-inner"
        style={{
          background: `conic-gradient(from 0deg, red, yellow, lime, cyan, blue, magenta, red)`,
        }}
        onMouseDown={(e) => { setIsDragging(true); handleInteraction(e); }}
        onMouseMove={(e) => isDragging && handleInteraction(e)}
        onMouseUp={() => setIsDragging(false)}
        onMouseLeave={() => setIsDragging(false)}
        onTouchStart={(e) => { setIsDragging(true); handleInteraction(e); }}
        onTouchMove={(e) => isDragging && handleInteraction(e)}
        onTouchEnd={() => setIsDragging(false)}
      >
        {/* Pointer */}
        {value !== "transparent" && (
          <div 
            className="absolute w-3 h-3 border-2 border-white rounded-full shadow-md pointer-events-none -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${50 + (parseFloat(value.split(',')[1]) / 2) * Math.cos((parseFloat(value.split('(')[1]) - 0) * (Math.PI / 180))}%`,
              top: `${50 + (parseFloat(value.split(',')[1]) / 2) * Math.sin((parseFloat(value.split('(')[1]) - 0) * (Math.PI / 180))}%`,
              backgroundColor: value.replace('0.5', '1')
            }}
          />
        )}
        {/* Inner shadow for "wheel" look */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-b from-transparent to-black/20 pointer-events-none" />
      </div>
      <button 
        onClick={() => onChange("transparent")}
        className="text-[8px] uppercase text-zinc-600 hover:text-zinc-400 transition-colors"
      >
        Reset
      </button>
    </div>
  );
}

interface ColorBalanceProps {
  shadows: string;
  midtones: string;
  highlights: string;
  onChange: (key: 'shadowTint' | 'midtoneTint' | 'highlightTint', value: string) => void;
}

export function ColorBalance({ shadows, midtones, highlights, onChange }: ColorBalanceProps) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center px-2">
        <ColorWheel label="Sombras" value={shadows} onChange={(v) => onChange('shadowTint', v)} />
        <ColorWheel label="Medios" value={midtones} onChange={(v) => onChange('midtoneTint', v)} />
        <ColorWheel label="Altas" value={highlights} onChange={(v) => onChange('highlightTint', v)} />
      </div>
    </div>
  );
}
