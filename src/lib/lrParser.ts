import { LightingSettings, DEFAULT_SETTINGS } from "../types";

/**
 * Parses a Lightroom .lrtemplate file content and maps it to LightingSettings.
 * .lrtemplate files are Lua-based text files.
 */
export function parseLrtemplate(content: string): Partial<LightingSettings> {
  const settings: Partial<LightingSettings> = {};
  
  // Extract the settings block content
  // Usually looks like: settings = { ... }
  const settingsMatch = content.match(/settings\s*=\s*\{([\s\S]*?)\}/);
  if (!settingsMatch) return {};
  
  const settingsBlock = settingsMatch[1];
  
  // Helper to extract numeric values
  const getNum = (key: string): number | null => {
    const regex = new RegExp(`${key}\\s*=\\s*(-?\\d+\\.?\\d*)`);
    const match = settingsBlock.match(regex);
    return match ? parseFloat(match[1]) : null;
  };

  // Mapping Lightroom keys to our LightingSettings
  // Note: Lightroom values often have different scales than our 0-200 or 0-100 scales.
  // We'll try to normalize them.
  
  // Exposure: LR is usually -5 to +5. We use -100 to 100? No, our exposure is -100 to 100.
  // Actually, let's check our sliders in App.tsx to see the ranges.
  
  const lrExposure = getNum("Exposure");
  if (lrExposure !== null) settings.exposure = lrExposure * 20; // -5 * 20 = -100

  const lrContrast = getNum("Contrast");
  if (lrContrast !== null) settings.contrast = 100 + lrContrast; // LR -100 to 100 -> our 0 to 200

  const lrHighlights = getNum("Highlights");
  if (lrHighlights !== null) settings.highlights = 100 + lrHighlights;

  const lrShadows = getNum("Shadows");
  if (lrShadows !== null) settings.shadows = 100 + lrShadows;

  const lrWhites = getNum("Whites");
  if (lrWhites !== null) settings.whites = 100 + lrWhites;

  const lrBlacks = getNum("Blacks");
  if (lrBlacks !== null) settings.blacks = 100 + lrBlacks;

  const lrSaturation = getNum("Saturation");
  if (lrSaturation !== null) settings.saturation = 100 + lrSaturation;

  const lrVibrance = getNum("Vibrance");
  if (lrVibrance !== null) settings.vibrance = 100 + lrVibrance;

  const lrClarity = getNum("Clarity2012") || getNum("Clarity");
  if (lrClarity !== null) settings.clarity = lrClarity;

  const lrDehaze = getNum("Dehaze");
  if (lrDehaze !== null) settings.dehaze = lrDehaze;

  const lrTexture = getNum("Texture");
  if (lrTexture !== null) settings.texture = lrTexture;

  const lrSharpness = getNum("Sharpness");
  if (lrSharpness !== null) settings.sharpening = lrSharpness;

  const lrTemp = getNum("Temperature");
  if (lrTemp !== null) {
    // LR Temp is usually 2000-50000. Our warmth is -100 to 100.
    // This is a rough approximation.
    settings.warmth = (lrTemp - 5500) / 50; 
  }

  const lrTint = getNum("Tint");
  if (lrTint !== null) settings.tint = lrTint;

  return settings;
}

export function mergeWithDefaults(partial: Partial<LightingSettings>): LightingSettings {
  return { ...DEFAULT_SETTINGS, ...partial };
}
