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
    focus,
    clarity,
    highlights,
    shadows,
    whites,
    blacks,
    texture,
    dehaze,
    noiseReduction,
    sepia: sepiaVal,
    blur: blurVal
  } = settings;
  
  // Combine exposure and whites/blacks into brightness/contrast
  const whiteAdj = (whites - 100) / 2;
  const blackAdj = (blacks - 100) / 2;
  const effectiveBrightness = brightness + (exposure * 20) + whiteAdj + blackAdj;
  
  // Dehaze simulation: Increase contrast and decrease brightness slightly
  const dehazeContrast = dehaze * 0.5;
  const dehazeBrightness = dehaze * -0.2;
  
  // Highlights and Shadows simulation
  const highAdj = (highlights - 100) / 4;
  const shadAdj = (shadows - 100) / 4;
  
  // Texture and Clarity contribute to contrast
  const textureAdj = texture / 4;
  const clarityAdj = clarity / 2;
  
  const effectiveContrast = contrast + clarityAdj + textureAdj + dehazeContrast + highAdj - shadAdj;
  const finalBrightness = effectiveBrightness + dehazeBrightness;
  
  // Warmth is simulated with sepia and hue-rotate
  const sepia = warmth > 0 ? warmth / 200 : 0;
  const warmthHue = warmth < 0 ? warmth / 2 : 0; // Negative warmth = cooler (blue)
  
  // Tint is simulated with hue-rotate
  const tintHue = tint / 2;
  
  // Vibrance is a "smarter" saturation
  const dehazeSaturate = dehaze * 0.2;
  const effectiveSaturation = (saturation * (vibrance / 100)) + dehazeSaturate;
  
  // Noise Reduction is a subtle blur
  const nrBlur = noiseReduction / 50;
  
  return `
    brightness(${finalBrightness}%) 
    contrast(${effectiveContrast}%) 
    saturate(${effectiveSaturation}%) 
    sepia(${sepia + (sepiaVal / 100)}) 
    hue-rotate(${warmthHue + tintHue}deg)
    blur(${blurVal + nrBlur}px)
    ${(sharpening > 0 || focus > 0) ? 'url(#sharpen-filter)' : ''}
  `.replace(/\s+/g, ' ').trim();
}

export const fixImageUrl = (url: string) => {
  if (!url) return "";
  if (url.startsWith('/uploads/') || url.startsWith('blob:') || url.startsWith('data:')) return url;
  
  // Google Drive Fix
  const driveMatch = url.match(/\/(?:file\/d\/|open\?id=|uc\?id=)([a-zA-Z0-9_-]+)/);
  if (driveMatch && driveMatch[1]) {
    return `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
  }

  // Dropbox Fix
  if (url.includes("dropbox.com")) {
    if (url.endsWith("dl=0")) return url.replace("dl=0", "raw=1");
    if (!url.includes("raw=1") && !url.includes("dl=1")) return `${url}${url.includes('?') ? '&' : '?'}raw=1`;
  }
  
  return url;
};
