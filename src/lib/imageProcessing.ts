import { LightingSettings } from "@/src/types";

export function getFilterString(settings: LightingSettings): string {
  const { 
    brightness, 
    contrast, 
    saturation, 
    exposure, 
    warmth, 
    tint,
    vibrance,
    sharpening,
    clarity,
    highlights,
    shadows,
    whites,
    blacks
  } = settings;
  
  // Combine exposure and whites/blacks into brightness/contrast
  // Whites (100 is neutral, > 100 increases brightness of bright areas)
  // Blacks (100 is neutral, < 100 decreases brightness of dark areas)
  const whiteAdj = (whites - 100) / 2;
  const blackAdj = (blacks - 100) / 2;
  const effectiveBrightness = brightness + exposure + whiteAdj + blackAdj;
  
  // Highlights and Shadows simulation
  const highAdj = (highlights - 100) / 4;
  const shadAdj = (shadows - 100) / 4;
  const effectiveContrast = contrast + (clarity / 2) + highAdj - shadAdj;
  
  // Warmth is simulated with sepia and hue-rotate
  const sepia = warmth > 0 ? warmth / 200 : 0;
  const warmthHue = warmth < 0 ? warmth / 2 : 0; // Negative warmth = cooler (blue)
  
  // Tint is simulated with hue-rotate
  const tintHue = tint / 2;
  
  // Vibrance is a "smarter" saturation
  const effectiveSaturation = saturation * (vibrance / 100);
  
  return `
    brightness(${effectiveBrightness}%) 
    contrast(${effectiveContrast}%) 
    saturate(${effectiveSaturation}%) 
    sepia(${sepia}) 
    hue-rotate(${warmthHue + tintHue}deg)
    ${sharpening > 0 ? `blur(${sharpening / 100}px)` : ''}
  `.replace(/\s+/g, ' ').trim();
}
