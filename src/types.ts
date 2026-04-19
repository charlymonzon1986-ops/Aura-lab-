export interface Photo {
  id: string;
  url: string;
  thumbnailUrl?: string; // For RAW files preview
  title: string;
  description?: string;
  tags?: string[];
  settings: LightingSettings;
  userId?: string;
  createdAt?: any;
  updatedAt?: any;
  isPublic?: boolean;
  size?: number;
  storagePath?: string | null;
  folderId?: string | null;
  rating?: number; // 0-5 stars
  colorTag?: 'none' | 'red' | 'yellow' | 'green' | 'blue' | 'purple';
  flag?: 'none' | 'pick' | 'reject';
}

export interface Client {
  id: string;
  userId: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
  createdAt: any;
  updatedAt?: any;
}

export interface PhotoVersion {
  id: string;
  photoId: string;
  userId: string;
  name: string;
  settings: LightingSettings;
  createdAt: any;
}

export interface Folder {
  id: string;
  name: string;
  userId: string;
  createdAt: string;
}

export interface Preset {
  id: string;
  name: string;
  category: string;
  settings: LightingSettings;
  isSystem?: boolean;
  userId?: string;
  planRequired?: 'free' | 'pro' | 'studio';
}

export type PlanType = 'free' | 'pro' | 'studio';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  plan: PlanType;
  storageUsed: number;
  createdAt: string;
}

export const STORAGE_LIMITS: Record<PlanType, number> = {
  free: 2 * 1024 * 1024 * 1024, // 2GB
  pro: 50 * 1024 * 1024 * 1024, // 50GB
  studio: 1024 * 1024 * 1024 * 1024, // 1TB
};

export const PLAN_PRICES: Record<PlanType, number> = {
  free: 0,
  pro: 2900, // ARS por mes
  studio: 9900, // ARS por mes
};

export interface LightingSettings {
  // Basic
  brightness: number;
  contrast: number;
  saturation: number;
  exposure: number;
  warmth: number;
  tint: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  clarity: number;
  vibrance: number;
  texture: number;
  dehaze: number;
  
  // Detail
  sharpening: number;
  focus: number;
  noiseReduction: number;
  
  // Optics
  vignette: number;
  distortion: number;
  
  // Geometry
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  cropTop: number;
  cropBottom: number;
  cropLeft: number;
  cropRight: number;
  
  // Creative
  sepia: number;
  grain: number;
  blur: number;
  lut?: string | null; // URL or name of the LUT
  lutIntensity?: number;
  
  // Color Balance (HSL/Wheels)
  shadowTint: string; // hex or hsl
  midtoneTint: string;
  highlightTint: string;
}

export const DEFAULT_SETTINGS: LightingSettings = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  exposure: 0,
  warmth: 0,
  tint: 0,
  highlights: 100,
  shadows: 100,
  whites: 100,
  blacks: 100,
  clarity: 0,
  vibrance: 100,
  texture: 0,
  dehaze: 0,
  sharpening: 0,
  focus: 0,
  noiseReduction: 0,
  vignette: 0,
  distortion: 0,
  rotation: 0,
  flipX: false,
  flipY: false,
  cropTop: 0,
  cropBottom: 0,
  cropLeft: 0,
  cropRight: 0,
  sepia: 0,
  grain: 0,
  blur: 0,
  lut: null,
  lutIntensity: 100,
  shadowTint: "transparent",
  midtoneTint: "transparent",
  highlightTint: "transparent",
};
