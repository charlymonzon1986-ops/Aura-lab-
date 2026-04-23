import * as React from "react";
import { toast } from "sonner";
import { LightingSettings } from "../types";
import { getFilterString } from "../lib/imageProcessing";
import { WebGLRenderer } from "../lib/webglRenderer";

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
  const { isComparing = false, compareValue = 50, width, height } = options;
  const drawWidth = width || canvas.width;
  const drawHeight = height || canvas.height;

  canvas.width = drawWidth;
  canvas.height = drawHeight;

  try {
    // Try WebGL first for high-performance rendering
    const renderer = new WebGLRenderer(canvas);
    
    // 1. Draw Original (if comparing)
    renderer.setImage(img);
    if (isComparing) {
      // Scissor test for comparison
      const gl = canvas.getContext('webgl')!;
      gl.enable(gl.SCISSOR_TEST);
      
      const splitX = Math.floor(drawWidth * (compareValue / 100));
      
      // Draw Original on left (Scissor is bottom-left based)
      gl.scissor(0, 0, splitX, drawHeight);
      renderer.render({ ...settings, exposure: 0, brightness: 100, contrast: 100, saturation: 100, vibrance: 100, warmth: 0, tint: 0, highlights: 100, shadows: 100, whites: 100, blacks: 100, vignette: 0, grain: 0, sepia: 0, blur: 0, lut: null }, drawWidth, drawHeight);
      
      // Draw Adjusted on right
      gl.scissor(splitX, 0, drawWidth - splitX, drawHeight);
      renderer.render(settings, drawWidth, drawHeight);
      
      gl.disable(gl.SCISSOR_TEST);
    } else {
      renderer.render(settings, drawWidth, drawHeight);
    }
    
    renderer.destroy();
  } catch (e) {
    console.warn("WebGL failed, falling back to 2D context", e);
    // Fallback to 2D context
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, drawWidth, drawHeight);
    
    // (Rest of the 2D logic remains as fallback)
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

    ctx.filter = getFilterString(settings);
    ctx.save();
    
    const cropX = (settings.cropLeft / 100) * img.width;
    const cropY = (settings.cropTop / 100) * img.height;
    const cropW = img.width * (1 - (settings.cropLeft + settings.cropRight) / 100);
    const cropH = img.height * (1 - (settings.cropTop + settings.cropBottom) / 100);
    
    ctx.translate(drawWidth / 2, drawHeight / 2);
    ctx.rotate((settings.rotation * Math.PI) / 180);
    ctx.scale(settings.flipX ? -1 : 1, settings.flipY ? -1 : 1);
    
    // In rotated 2D context, we still need to draw with correct aspect ratio
    const rotVal = Math.abs(settings.rotation % 360);
    const isVertical = rotVal === 90 || rotVal === 270;
    const destW = isVertical ? drawHeight : drawWidth;
    const destH = isVertical ? drawWidth : drawHeight;
    
    ctx.drawImage(img, cropX, cropY, cropW, cropH, -destW / 2, -destH / 2, destW, destH);
    
    // Add Color Tints in 2D fallback
    if (settings.shadowTint && settings.shadowTint !== "transparent") {
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = settings.shadowTint;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(0, 0, drawWidth, drawHeight);
    }
    if (settings.midtoneTint && settings.midtoneTint !== "transparent") {
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = settings.midtoneTint;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(0, 0, drawWidth, drawHeight);
    }
    if (settings.highlightTint && settings.highlightTint !== "transparent") {
      ctx.globalCompositeOperation = 'color';
      ctx.fillStyle = settings.highlightTint;
      ctx.globalAlpha = 0.4;
      ctx.fillRect(0, 0, drawWidth, drawHeight);
    }

    ctx.restore();

    if (isComparing) ctx.restore();

    // Vignette/Grain/Tints (Omitted in fallback for brevity, but could be added back)
  }
}

interface PhotoCanvasProps {
  imageUrl: string;
  settings: LightingSettings;
  isComparing?: boolean;
  compareValue?: number;
  className?: string;
  onImageReady?: (canvas: HTMLCanvasElement) => void;
  onHistogramData?: (pixels: Uint8Array) => void;
}

export const PhotoCanvas = React.memo(React.forwardRef<HTMLCanvasElement, PhotoCanvasProps>(({ 
  imageUrl, 
  settings, 
  isComparing = false, 
  compareValue = 50,
  className = "",
  onImageReady,
  onHistogramData
}, ref) => {
  const internalCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const canvasRef = (ref as React.RefObject<HTMLCanvasElement>) || internalCanvasRef;
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [img, setImg] = React.useState<HTMLImageElement | null>(null);
  const rendererRef = React.useRef<WebGLRenderer | null>(null);
  const histogramTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Load image
  React.useEffect(() => {
    if (!imageUrl) {
      setImg(null);
      return;
    }
    
    let isMounted = true;
    const tryLoad = (useCors: boolean) => {
      console.log(`PhotoCanvas: Loading image (CORS: ${useCors}):`, imageUrl);
      const i = new Image();
      if (useCors) i.crossOrigin = "anonymous";
      
      const timeout = setTimeout(() => {
        if (!i.complete && isMounted) {
          console.warn("PhotoCanvas: Image load timeout");
          if (useCors) {
            console.log("PhotoCanvas: Retrying without CORS...");
            tryLoad(false);
          }
        }
      }, 8000);

      i.onload = () => {
        clearTimeout(timeout);
        if (isMounted) {
          console.log("PhotoCanvas: Success:", i.width, "x", i.height);
          setImg(i);
        }
      };
      
      i.onerror = () => {
        clearTimeout(timeout);
        if (isMounted) {
          if (useCors) {
            console.log("PhotoCanvas: CORS failure, retrying without CORS...");
            tryLoad(false);
          } else {
            console.error("PhotoCanvas: Hard load failure:", imageUrl);
            toast.error("No se pudo cargar la imagen principal.");
          }
        }
      };
      
      i.src = imageUrl;
    };

    tryLoad(true);
    
    return () => {
      isMounted = false;
    };
  }, [imageUrl]);

  // Handle Resize
  const [containerSize, setContainerSize] = React.useState({ width: 0, height: 0 });
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver((entries) => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        setContainerSize({ width, height });
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Use a cleaner render loop
  React.useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !img) return;

    const cWidth = containerSize.width || container.clientWidth;
    const cHeight = containerSize.height || container.clientHeight;
    
    if (cWidth === 0 || cHeight === 0) return;

    const rotInput = typeof settings.rotation === 'number' ? settings.rotation : 0;
    const rot = Math.abs(rotInput % 360);
    const isVertical = rot === 90 || rot === 270;
    const imgWidth = isVertical ? img.height : img.width;
    const imgHeight = isVertical ? img.width : img.height;
    
    const imgRatio = imgWidth / imgHeight;
    const containerRatio = cWidth / cHeight;
    
    let drawWidth, drawHeight;
    if (imgRatio > containerRatio) {
      drawWidth = cWidth;
      drawHeight = cWidth / imgRatio;
    } else {
      drawHeight = cHeight;
      drawWidth = cHeight * imgRatio;
    }

    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(drawWidth * dpr);
    const h = Math.floor(drawHeight * dpr);

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${drawWidth}px`;
      canvas.style.height = `${drawHeight}px`;
      
      if (rendererRef.current) {
        rendererRef.current.destroy();
        rendererRef.current = null;
      }
    }

    const render = () => {
      if (!img || !img.complete || img.naturalWidth === 0) return;
      
      try {
        if (!rendererRef.current) {
          rendererRef.current = new WebGLRenderer(canvas);
        }
        const renderer = rendererRef.current;
        renderer.setImage(img);

        if (isComparing) {
          const gl = canvas.getContext('webgl')!;
          gl.enable(gl.SCISSOR_TEST);
          const splitX = Math.floor(w * (compareValue / 100));
          
          // Draw Original on left
          gl.scissor(0, 0, splitX, h);
          renderer.render({ 
            ...settings, 
            exposure: 0, brightness: 100, contrast: 100, saturation: 100, vibrance: 100, 
            warmth: 0, tint: 0, highlights: 100, shadows: 100, whites: 100, blacks: 100, 
            vignette: 0, grain: 0, sepia: 0, blur: 0, lut: null,
            texture: 0, clarity: 0, dehaze: 0, sharpening: 0, noiseReduction: 0,
            shadowTint: "transparent", midtoneTint: "transparent", highlightTint: "transparent",
            balance: 0
          }, w, h);
          
          gl.scissor(splitX, 0, w - splitX, h);
          renderer.render(settings, w, h);
          gl.disable(gl.SCISSOR_TEST);
        } else {
          renderer.render(settings, w, h);
        }
        
        // Throttled Histogram Analysis (150ms)
        if (onHistogramData) {
          if (histogramTimeoutRef.current) clearTimeout(histogramTimeoutRef.current);
          histogramTimeoutRef.current = setTimeout(() => {
            if (rendererRef.current) {
              const pixels = rendererRef.current.getAnalysisPixels(settings);
              onHistogramData(pixels);
            }
          }, 150);
        }
        
        if (onImageReady) onImageReady(canvas);
      } catch (e) {
        console.error("WebGL Draw Failure:", e);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, w, h);
          if (isComparing) {
            const splitX = w * (compareValue / 100);
            ctx.save();
            ctx.beginPath(); ctx.rect(0, 0, splitX, h); ctx.clip();
            ctx.drawImage(img, 0, 0, w, h);
            ctx.restore();
            ctx.save();
            ctx.beginPath(); ctx.rect(splitX, 0, w - splitX, h); ctx.clip();
            ctx.filter = getFilterString(settings);
            ctx.drawImage(img, 0, 0, w, h);
            ctx.restore();
          } else {
            ctx.filter = getFilterString(settings);
            ctx.drawImage(img, 0, 0, w, h);
          }
        }
      }
    };

    render();
    
    return () => {
      if (histogramTimeoutRef.current) clearTimeout(histogramTimeoutRef.current);
    };
  }, [img, settings, isComparing, compareValue, containerSize, onHistogramData]);

  return (
    <div ref={containerRef} className={`absolute inset-0 flex items-center justify-center overflow-visible ${className}`}>
      <canvas 
        ref={canvasRef} 
        className="shadow-[0_0_100px_rgba(0,0,0,0.9)] rounded-sm bg-black"
        style={{
          display: 'block',
          userSelect: 'none'
        }}
      />
    </div>
  );
}));
