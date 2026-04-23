import * as React from "react";
import { LightingSettings } from "../types";

interface HistogramProps {
  settings: LightingSettings;
  imageUrl: string;
  pixelData?: Uint8Array;
}

export function Histogram({ settings, imageUrl, pixelData }: HistogramProps) {
  const [data, setData] = React.useState<{ r: number[], g: number[], b: number[], l: number[] }>({
    r: new Array(256).fill(0),
    g: new Array(256).fill(0),
    b: new Array(256).fill(0),
    l: new Array(256).fill(0)
  });
  
  const calculateFromPixels = React.useCallback((pixels: Uint8Array) => {
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
      
      const luma = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
      lBins[Math.min(luma, 255)]++;
    }

    const findMax = (bins: number[]) => {
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
  }, []);

  React.useEffect(() => {
    if (pixelData) {
      calculateFromPixels(pixelData);
    }
  }, [pixelData, calculateFromPixels]);

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
    <div className={`h-32 w-64 bg-black/80 backdrop-blur-xl rounded-xl border border-white/10 p-4 flex flex-col gap-2 overflow-hidden relative transition-all duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-50`}>
      <div className="flex-1 relative">
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

        <svg viewBox="0 0 256 100" preserveAspectRatio="none" className="w-full h-full">
          <path d={generatePath(data.r)} fill="rgba(239, 68, 68, 0.4)" className="mix-blend-screen" />
          <path d={generatePath(data.g)} fill="rgba(34, 197, 94, 0.4)" className="mix-blend-screen" />
          <path d={generatePath(data.b)} fill="rgba(59, 130, 246, 0.4)" className="mix-blend-screen" />
          <path d={generatePath(data.l)} fill="none" stroke="rgba(255, 255, 255, 0.5)" strokeWidth="1" className="transition-all duration-300" />
        </svg>
      </div>

      <div className="flex justify-between items-center">
        <div className="flex flex-col">
          <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-zinc-500">
            Histograma Real
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
