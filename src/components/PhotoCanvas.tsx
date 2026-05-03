import * as React from "react";
import { toast } from "sonner";
import { LightingSettings } from "../types";
import { getFilterString } from "../lib/imageProcessing";
import { WebGLRenderer } from "../lib/webglRenderer";

export async function renderImageToCanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement | ImageData,
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
    
    // 1. Draw Original
    renderer.setImage(img);
    if (isComparing) {
      // Scissor test for comparison
      const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl'))!;
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
    
    const drawImg = (context: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number) => {
      if (img instanceof ImageData) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        tempCanvas.getContext('2d')?.putImageData(img, 0, 0);
        context.drawImage(tempCanvas, dx, dy, dw, dh);
      } else {
        context.drawImage(img, dx, dy, dw, dh);
      }
    };

    if (isComparing) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, drawWidth * (compareValue / 100), drawHeight);
      ctx.clip();
      ctx.filter = 'none';
      drawImg(ctx, 0, 0, drawWidth, drawHeight);
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
    
    const rotVal = Math.abs(settings.rotation % 360);
    const isVertical = rotVal === 90 || rotVal === 270;
    const destW = isVertical ? drawHeight : drawWidth;
    const destH = isVertical ? drawWidth : drawHeight;
    
    if (img instanceof ImageData) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = img.width;
      tempCanvas.height = img.height;
      tempCanvas.getContext('2d')?.putImageData(img, 0, 0);
      ctx.drawImage(tempCanvas, cropX, cropY, cropW, cropH, -destW / 2, -destH / 2, destW, destH);
    } else {
      ctx.drawImage(img, cropX, cropY, cropW, cropH, -destW / 2, -destH / 2, destW, destH);
    }
    
    ctx.restore();
    if (isComparing) ctx.restore();
  }
}

interface PhotoCanvasProps {
  imageUrl?: string;
  imageData?: ImageData | null;
  settings: LightingSettings;
  isComparing?: boolean;
  compareValue?: number;
  className?: string;
  onImageReady?: (canvas: HTMLCanvasElement) => void;
  onHistogramData?: (pixels: Uint8Array) => void;
}

export const PhotoCanvas = React.memo(React.forwardRef<HTMLCanvasElement, PhotoCanvasProps>(({ 
  imageUrl, 
  imageData,
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
  const [source, setSource] = React.useState<HTMLImageElement | ImageData | null>(null);
  const rendererRef = React.useRef<WebGLRenderer | null>(null);
  const histogramTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Load image from URL with Auth
  React.useEffect(() => {
    if (!imageUrl) {
      if (!imageData) setSource(null);
      return;
    }

    let isMounted = true;
    let blobUrl: string | null = null;

    const loadWithAuth = async () => {
      try {
        // Obtener token de Firebase
        const { getAuth } = await import('firebase/auth');
        const auth = getAuth();
        const token = await auth.currentUser?.getIdToken();

        const headers: HeadersInit = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(imageUrl, { headers });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const blob = await response.blob();
        blobUrl = URL.createObjectURL(blob);

        if (!isMounted) {
          URL.revokeObjectURL(blobUrl);
          return;
        }

        const img = new Image();
        img.onload = () => {
          if (isMounted) {
            console.log("PhotoCanvas: Success:", img.width, "x", img.height);
            setSource(img);
          }
        };
        img.onerror = () => {
          if (blobUrl) URL.revokeObjectURL(blobUrl);
          console.error('PhotoCanvas: failed to render blob URL');
        };
        img.src = blobUrl;

      } catch (e) {
        if (isMounted) {
          console.error('PhotoCanvas: load failed', e);
          toast.error('No se pudo cargar la imagen.');
        }
      }
    };

    loadWithAuth();

    return () => {
      isMounted = false;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [imageUrl]);

  // Use ImageData if provided
  React.useEffect(() => {
    if (imageData) {
      setSource(imageData);
    }
  }, [imageData]);

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
    let isMounted = true;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !source) return;

    const cWidth = containerSize.width || container.clientWidth;
    const cHeight = containerSize.height || container.clientHeight;
    
    if (cWidth === 0 || cHeight === 0) return;

    const rotInput = typeof settings.rotation === 'number' ? settings.rotation : 0;
    const rot = Math.abs(rotInput % 360);
    const isVertical = rot === 90 || rot === 270;
    const srcWidth = source instanceof ImageData ? source.width : source.width;
    const srcHeight = source instanceof ImageData ? source.height : source.height;
    const imgWidth = isVertical ? srcHeight : srcWidth;
    const imgHeight = isVertical ? srcWidth : srcHeight;
    
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
      if (!source) return;
      if (source instanceof HTMLImageElement && (!source.complete || source.naturalWidth === 0)) return;
      
      requestAnimationFrame(() => {
        if (!isMounted) return;
        try {
          if (!rendererRef.current) {
            rendererRef.current = new WebGLRenderer(canvas);
          }
          const renderer = rendererRef.current;
          renderer.setImage(source);

          if (isComparing) {
            const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl'))!;
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
              focus: 0, distortion: 0,
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
              if (source instanceof ImageData) {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = source.width;
                tempCanvas.height = source.height;
                tempCanvas.getContext('2d')?.putImageData(source, 0, 0);
                ctx.drawImage(tempCanvas, 0, 0, w, h);
              } else {
                ctx.drawImage(source, 0, 0, w, h);
              }
              ctx.restore();
              ctx.save();
              ctx.beginPath(); ctx.rect(splitX, 0, w - splitX, h); ctx.clip();
              ctx.filter = getFilterString(settings);
              if (source instanceof ImageData) {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = source.width;
                tempCanvas.height = source.height;
                tempCanvas.getContext('2d')?.putImageData(source, 0, 0);
                ctx.drawImage(tempCanvas, 0, 0, w, h);
              } else {
                ctx.drawImage(source, 0, 0, w, h);
              }
              ctx.restore();
            } else {
              ctx.filter = getFilterString(settings);
              if (source instanceof ImageData) {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = source.width;
                tempCanvas.height = source.height;
                tempCanvas.getContext('2d')?.putImageData(source, 0, 0);
                ctx.drawImage(tempCanvas, 0, 0, w, h);
              } else {
                ctx.drawImage(source, 0, 0, w, h);
              }
            }
          }
        }
      });
    };

    render();
    
    return () => {
      isMounted = false;
      if (histogramTimeoutRef.current) clearTimeout(histogramTimeoutRef.current);
      if (rendererRef.current) {
        rendererRef.current.destroy();
        rendererRef.current = null;
      }
    };
  }, [source, settings, isComparing, compareValue, containerSize, onHistogramData]);

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
