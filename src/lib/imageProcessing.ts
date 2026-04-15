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
    blur: blurVal,
    lut,
    lutIntensity = 100
  } = settings;

  // LUT Approximations
  let lutFilter = '';
  const intensity = lutIntensity / 100;

  if (lut === 'cinematic') {
    lutFilter = `contrast(${100 + 20 * intensity}%) saturate(${100 - 15 * intensity}%) hue-rotate(${intensity * -5}deg)`;
  } else if (lut === 'vintage') {
    lutFilter = `sepia(${40 * intensity}%) contrast(${100 - 10 * intensity}%) brightness(${100 + 5 * intensity}%)`;
  } else if (lut === 'noir') {
    lutFilter = `grayscale(${100 * intensity}%) contrast(${100 + 30 * intensity}%)`;
  } else if (lut === 'teal-orange') {
    lutFilter = `hue-rotate(${intensity * 10}deg) saturate(${100 + 20 * intensity}%) contrast(${100 + 10 * intensity}%)`;
  } else if (lut === 'warm-gold') {
    lutFilter = `sepia(${20 * intensity}%) hue-rotate(${intensity * 5}deg) saturate(${100 + 15 * intensity}%)`;
  }
  
  // Combine exposure and whites/blacks into brightness/contrast
  const whiteAdj = (whites - 100) / 2;
  const blackAdj = (blacks - 100) / 2;
  const effectiveBrightness = brightness + (exposure * 20) + whiteAdj + blackAdj;
  
  // Dehaze simulation: Increase contrast and decrease brightness slightly
  const dehazeContrast = dehaze * 0.8;
  const dehazeBrightness = dehaze * -0.3;
  
  // Highlights and Shadows simulation
  const highAdj = (highlights - 100) / 3;
  const shadAdj = (shadows - 100) / 3;
  
  // Texture and Clarity contribute to contrast and sharpness perception
  const textureAdj = texture / 2;
  const clarityAdj = clarity / 1.5;
  
  const effectiveContrast = contrast + clarityAdj + textureAdj + dehazeContrast + highAdj - shadAdj;
  const finalBrightness = effectiveBrightness + dehazeBrightness;
  
  // Warmth is simulated with sepia and hue-rotate
  const sepia = warmth > 0 ? warmth / 150 : 0;
  const warmthHue = warmth < 0 ? warmth / 1.5 : 0; // Negative warmth = cooler (blue)
  
  // Tint is simulated with hue-rotate
  const tintHue = tint / 1.5;
  
  // Vibrance is a "smarter" saturation
  const dehazeSaturate = dehaze * 0.3;
  const effectiveSaturation = (saturation * (1 + (vibrance - 100) / 100)) + dehazeSaturate;
  
  // Noise Reduction is a subtle blur
  const nrBlur = noiseReduction / 40;
  
  // Vignette and Grain are handled via overlays/SVG filters in the UI
  // but we include them here for the canvas export if supported
  
  return `
    brightness(${finalBrightness}%) 
    contrast(${effectiveContrast}%) 
    saturate(${effectiveSaturation}%) 
    sepia(${sepia + (sepiaVal / 100)}) 
    hue-rotate(${warmthHue + tintHue}deg)
    blur(${blurVal + nrBlur}px)
    ${lutFilter}
    ${(sharpening > 0 || focus > 0) ? 'url(#sharpen-filter)' : ''}
    ${(settings.grain > 0) ? 'url(#grain-filter)' : ''}
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
