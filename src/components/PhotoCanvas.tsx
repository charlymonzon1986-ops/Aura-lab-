import * as React from "react";
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
    ctx.translate(-drawWidth / 2, -drawHeight / 2);
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, drawWidth, drawHeight);
    
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
