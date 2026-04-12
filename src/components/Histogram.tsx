import * as React from "react";
import { LightingSettings } from "../types";
import { getFilterString } from "../lib/imageProcessing";

interface HistogramProps {
  settings: LightingSettings;
  imageUrl: string;
}

export function Histogram({ settings, imageUrl }: HistogramProps) {
  const [data, setData] = React.useState<number[]>(new Array(64).fill(0));
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    if (!imageUrl) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;

    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      // Use a small size for performance
      const size = 100;
      canvas.width = size;
      canvas.height = size;

      ctx.filter = getFilterString(settings);
      ctx.drawImage(img, 0, 0, size, size);

      try {
        const imageData = ctx.getImageData(0, 0, size, size);
        const pixels = imageData.data;
        const bins = new Array(64).fill(0);

        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          // Luminance (Rec. 709)
          const avg = Math.round((0.2126 * r + 0.7152 * g + 0.0722 * b) / 4);
          bins[Math.min(avg, 63)]++;
        }

        const max = Math.max(...bins);
        setData(bins.map(v => (v / max) * 100));
      } catch (e) {
        console.error("Histogram calculation error:", e);
      }
    };
  }, [settings, imageUrl]);

  return (
    <div className="h-24 w-full bg-zinc-900/30 rounded-lg border border-zinc-800/50 p-2 flex items-end gap-[1px] overflow-hidden relative">
      <canvas ref={canvasRef} className="hidden" />
      {data.map((v, i) => (
        <div 
          key={i}
          className="flex-1 bg-amber-500/40 rounded-t-[1px] transition-all duration-150"
          style={{ 
            height: `${Math.max(2, v)}%`,
            opacity: 0.2 + (v / 150)
          }}
        />
      ))}
      <div className="absolute bottom-1 left-2 text-[8px] font-black uppercase tracking-widest text-zinc-600 pointer-events-none">
        Luminancia
      </div>
    </div>
  );
}
