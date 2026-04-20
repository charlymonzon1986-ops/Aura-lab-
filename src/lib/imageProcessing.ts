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
  
  // 1. Exposure: Multiplicative brightness
  const exposureAdj = Math.pow(2, exposure);
  
  // 2. Brightness: Additive brightness
  const brightnessAdj = brightness / 100;
  
  // 3. Contrast: Slope around 0.5
  const contrastAdj = contrast / 100;
  
  // 4. Saturation & Vibrance
  const saturationAdj = (saturation / 100) * (1 + (vibrance - 100) / 200);
  
  // 5. Highlights & Shadows (Increased impact for better visibility)
  const highAdj = (highlights - 100) / 2.5;
  const shadAdj = (shadows - 100) / 2.5;
  
  // 6. Whites & Blacks
  const whiteAdj = (whites - 100) / 2;
  const blackAdj = (blacks - 100) / 2;

  // 7. Clarity & Texture (Balanced with others)
  const clarityAdj = clarity / 1.25;
  const textureAdj = texture / 1.5;

  // 8. Dehaze
  const dehazeAdj = dehaze / 1.25;

  // Final combined values for CSS filters
  const finalBrightness = (100 * exposureAdj * brightnessAdj) + highAdj + (shadAdj / 1.5) + whiteAdj + blackAdj - (dehaze / 6);
  const finalContrast = contrast + clarityAdj + textureAdj + (dehazeAdj * 0.8);
  const finalSaturation = saturationAdj * 100 + (dehaze / 2);

  // Warmth & Tint
  const sepia = warmth > 0 ? warmth / 150 : 0;
  const warmthHue = warmth < 0 ? warmth / 1.5 : warmth / 5;
  const tintHue = tint / 1.2;

  // Noise Reduction
  const nrBlur = noiseReduction / 40;

  return `
    brightness(${finalBrightness}%) 
    contrast(${finalContrast}%) 
    saturate(${finalSaturation}%) 
    sepia(${sepia + (sepiaVal / 100)}) 
    hue-rotate(${warmthHue + tintHue}deg)
    blur(${blurVal + nrBlur}px)
    ${lutFilter}
    ${(sharpening > 0 || focus > 0) ? 'url(#f-sharpen)' : ''}
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
