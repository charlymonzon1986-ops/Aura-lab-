import * as React from "react";
import { LightingSettings } from "../types";
import { getFilterString } from "../lib/imageProcessing";

interface HistogramProps {
  settings: LightingSettings;
  imageUrl: string;
}

export function Histogram({ settings, imageUrl }: HistogramProps) {
  const [data, setData] = React.useState<{ r: number[], g: number[], b: number[], l: number[] }>({
    r: new Array(256).fill(0),
    g: new Array(256).fill(0),
    b: new Array(256).fill(0),
    l: new Array(256).fill(0)
  });
  const [isLoading, setIsLoading] = React.useState(false);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    if (!imageUrl) return;

    setIsLoading(true);
    const img = new Image();
    img.crossOrigin = "anonymous";
    
    const calculate = () => {
      const canvas = canvasRef.current;
      if (!canvas || !img.width) return;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      // Use a fixed size for consistent calculation
      const size = 128;
      canvas.width = size;
      canvas.height = size;

      ctx.clearRect(0, 0, size, size);
      
      // Apply filters from imageProcessing
      ctx.filter = getFilterString(settings);
      
      try {
        ctx.drawImage(img, 0, 0, size, size);
        const imageData = ctx.getImageData(0, 0, size, size);
        const pixels = imageData.data;
        
        const rBins = new Array(256).fill(0);
        const gBins = new Array(256).fill(0);
        const bBins = new Array(256).fill(0);
        const lBins = new Array(256).fill(0);

        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          
          rBins[r]++;
          gBins[g]++;
          bBins[b]++;
          
          // Standard luminance formula
          const luma = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
          lBins[Math.min(luma, 255)]++;
        }

        // Find max value to normalize, ignoring extreme spikes
        const findMax = (bins: number[]) => {
          // Ignore the very first and last bins if they are extreme (often happens with black/white borders)
          const middleBins = bins.slice(1, 255);
          const maxInMiddle = Math.max(...middleBins);
          return Math.max(maxInMiddle, bins[0], bins[255], 1);
        };
        
        const maxVal = Math.max(findMax(rBins), findMax(gBins), findMax(bBins), findMax(lBins));

        setData({
          r: rBins.map(v => (v / maxVal) * 100),
          g: gBins.map(v => (v / maxVal) * 100),
          b: bBins.map(v => (v / maxVal) * 100),
          l: lBins.map(v => (v / maxVal) * 100)
        });
      } catch (e) {
        console.error("Histogram calculation error (CORS?):", e);
        // If it fails, we keep the previous data or show empty
      } finally {
        setIsLoading(false);
      }
    };

    img.onload = calculate;
    img.onerror = () => {
      console.error("Failed to load image for histogram");
      setIsLoading(false);
    };
    img.src = imageUrl;

    if (img.complete) {
      calculate();
    }
  }, [settings, imageUrl]);

  const generatePath = (values: number[]) => {
    if (values.length === 0) return "";
    const width = 256;
    const height = 100;
    let path = `M 0 ${height}`;
    values.forEach((v, i) => {
      path += ` L ${i} ${height - v}`;
    });
    path += ` L ${width} ${height} Z`;
    return path;
  };

  return (
    <div className={`h-32 w-64 bg-black/80 backdrop-blur-xl rounded-xl border border-white/10 p-4 flex flex-col gap-2 overflow-hidden relative transition-all duration-500 ${isLoading ? 'opacity-50 scale-95' : 'opacity-100 scale-100'} shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-50`}>
      <canvas ref={canvasRef} className="hidden" />
      
      <div className="flex-1 relative">
        {/* Grid Lines */}
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-10">
          <div className="border-t border-white w-full" />
          <div className="border-t border-white w-full" />
          <div className="border-t border-white w-full" />
        </div>
        <div className="absolute inset-0 flex justify-between pointer-events-none opacity-10">
          <div className="border-l border-white h-full" />
          <div className="border-l border-white h-full" />
          <div className="border-l border-white h-full" />
          <div className="border-l border-white h-full" />
        </div>

        <svg 
          viewBox="0 0 256 100" 
          preserveAspectRatio="none" 
          className="w-full h-full"
        >
          {/* RGB Paths */}
          <path d={generatePath(data.r)} fill="rgba(239, 68, 68, 0.4)" className="mix-blend-screen" />
          <path d={generatePath(data.g)} fill="rgba(34, 197, 94, 0.4)" className="mix-blend-screen" />
          <path d={generatePath(data.b)} fill="rgba(59, 130, 246, 0.4)" className="mix-blend-screen" />
          
          {/* Luminance Path (Outline) */}
          <path 
            d={generatePath(data.l)} 
            fill="none" 
            stroke="rgba(255, 255, 255, 0.5)" 
            strokeWidth="1" 
            className="transition-all duration-300"
          />
        </svg>
      </div>

      <div className="flex justify-between items-center">
        <div className="flex flex-col">
          <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-zinc-500">
            {isLoading ? 'Analizando...' : 'Histograma'}
          </span>
          <span className="text-[10px] font-medium text-zinc-300">RGB + Luminancia</span>
        </div>
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500/50 border border-red-500/20" />
          <div className="w-2 h-2 rounded-full bg-green-500/50 border border-green-500/20" />
          <div className="w-2 h-2 rounded-full bg-blue-500/50 border border-blue-500/20" />
        </div>
      </div>
    </div>
  );
}
