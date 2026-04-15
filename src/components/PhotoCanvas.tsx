import * as React from "react";
import { LightingSettings } from "../types";
import { getFilterString } from "../lib/imageProcessing";

export async function renderImageToCanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  settings: LightingSettings,
  options: { 
    isComparing?: boolean; 
    compareValue?: number;
    width?: number;
    height?: number;
  } = {}
) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const { isComparing = false, compareValue = 50, width, height } = options;
  
  const drawWidth = width || canvas.width;
  const drawHeight = height || canvas.height;

  canvas.width = drawWidth;
  canvas.height = drawHeight;

  ctx.clearRect(0, 0, drawWidth, drawHeight);
  
  // 1. Draw Original (if comparing)
  if (isComparing) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, drawWidth * (compareValue / 100), drawHeight);
    ctx.clip();
    
    ctx.filter = 'none';
    ctx.drawImage(img, 0, 0, drawWidth, drawHeight);
    ctx.restore();
    
    ctx.save();
    ctx.beginPath();
    ctx.rect(drawWidth * (compareValue / 100), 0, drawWidth, drawHeight);
    ctx.clip();
  }

  // 2. Apply Filters
  ctx.filter = getFilterString(settings);
  
  // 3. Handle Rotations, Flips & Crops
  ctx.save();
  
  const cropX = (settings.cropLeft / 100) * img.width;
  const cropY = (settings.cropTop / 100) * img.height;
  const cropW = img.width * (1 - (settings.cropLeft + settings.cropRight) / 100);
  const cropH = img.height * (1 - (settings.cropTop + settings.cropBottom) / 100);

  ctx.translate(drawWidth / 2, drawHeight / 2);
  ctx.rotate((settings.rotation * Math.PI) / 180);
  ctx.scale(settings.flipX ? -1 : 1, settings.flipY ? -1 : 1);
  ctx.translate(-drawWidth / 2, -drawHeight / 2);
  
  ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, drawWidth, drawHeight);
  ctx.restore();

  if (isComparing) {
    ctx.restore();
  }

  // 4. Vignette
  if (settings.vignette > 0) {
    ctx.save();
    const grad = ctx.createRadialGradient(
      drawWidth / 2, drawHeight / 2, 0,
      drawWidth / 2, drawHeight / 2, Math.max(drawWidth, drawHeight) / 1.2
    );
    grad.addColorStop(0.4, 'transparent');
    grad.addColorStop(1, `rgba(0,0,0,${settings.vignette / 100})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, drawWidth, drawHeight);
    ctx.restore();
  }

  // 5. Grain
  if (settings.grain > 0) {
    ctx.save();
    ctx.globalAlpha = settings.grain / 200;
    ctx.globalCompositeOperation = 'overlay';
    const grainData = ctx.createImageData(drawWidth, drawHeight);
    for (let i = 0; i < grainData.data.length; i += 4) {
      const val = Math.random() * 255;
      grainData.data[i] = val;
      grainData.data[i+1] = val;
      grainData.data[i+2] = val;
      grainData.data[i+3] = 255;
    }
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = drawWidth;
    tempCanvas.height = drawHeight;
    tempCanvas.getContext('2d')?.putImageData(grainData, 0, 0);
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.restore();
  }

  // 6. Color Balance Tints
  if (settings.shadowTint !== "transparent" || settings.midtoneTint !== "transparent" || settings.highlightTint !== "transparent") {
    ctx.save();
    if (settings.shadowTint !== "transparent") {
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = settings.shadowTint;
      ctx.fillRect(0, 0, drawWidth, drawHeight);
    }
    if (settings.midtoneTint !== "transparent") {
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = settings.midtoneTint;
      ctx.fillRect(0, 0, drawWidth, drawHeight);
    }
    if (settings.highlightTint !== "transparent") {
      ctx.globalCompositeOperation = 'color';
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = settings.highlightTint;
      ctx.fillRect(0, 0, drawWidth, drawHeight);
    }
    ctx.restore();
  }
}

interface PhotoCanvasProps {
  imageUrl: string;
  settings: LightingSettings;
  isComparing?: boolean;
  compareValue?: number;
  className?: string;
  onImageReady?: (canvas: HTMLCanvasElement) => void;
}

export const PhotoCanvas = React.forwardRef<HTMLCanvasElement, PhotoCanvasProps>(({ 
  imageUrl, 
  settings, 
  isComparing = false, 
  compareValue = 50,
  className = "",
  onImageReady
}, ref) => {
  const internalCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const canvasRef = (ref as React.RefObject<HTMLCanvasElement>) || internalCanvasRef;
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [img, setImg] = React.useState<HTMLImageElement | null>(null);

  // Load image
  React.useEffect(() => {
    if (!imageUrl) return;
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => setImg(i);
    i.src = imageUrl;
  }, [imageUrl]);

  // Render loop
  React.useEffect(() => {
    const render = async () => {
      if (!img || !canvasRef.current || !containerRef.current) return;
      
      const canvas = canvasRef.current;
      const container = containerRef.current;
      const { width: containerWidth, height: containerHeight } = container.getBoundingClientRect();
      
      if (containerWidth === 0 || containerHeight === 0) return;

      const imgRatio = img.width / img.height;
      const containerRatio = containerWidth / containerHeight;
      
      let drawWidth, drawHeight;
      if (imgRatio > containerRatio) {
        drawWidth = containerWidth;
        drawHeight = containerWidth / imgRatio;
      } else {
        drawHeight = containerHeight;
        drawWidth = containerHeight * imgRatio;
      }

      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = `${drawWidth}px`;
      canvas.style.height = `${drawHeight}px`;
      
      await renderImageToCanvas(canvas, img, settings, {
        isComparing,
        compareValue,
        width: drawWidth * dpr,
        height: drawHeight * dpr
      });

      if (onImageReady) onImageReady(canvas);
    };

    render();
  }, [img, settings, isComparing, compareValue]);

  return (
    <div ref={containerRef} className={`relative w-full h-full flex items-center justify-center overflow-hidden ${className}`}>
      <canvas 
        ref={canvasRef} 
        className="max-w-full max-h-full object-contain shadow-2xl rounded-sm"
        style={{ width: 'auto', height: 'auto' }}
      />
    </div>
  );
});
