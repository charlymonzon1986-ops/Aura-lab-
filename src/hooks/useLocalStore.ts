import * as React from "react";
import { Photo, Preset, Folder, LightingSettings, DEFAULT_SETTINGS, UserProfile } from "@/src/types";
import { SYSTEM_PRESETS } from "@/src/constants/presets";

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      db: {
        getPhotos:    () => Promise<Photo[]>;
        addPhoto:     (photo: Omit<Photo, 'id'>) => Promise<Photo>;
        updatePhoto:  (id: string, updates: Partial<Photo>) => Promise<Photo | null>;
        deletePhoto:  (id: string) => Promise<boolean>;
        getPresets:   () => Promise<Preset[]>;
        addPreset:    (preset: Omit<Preset, 'id'>) => Promise<Preset>;
        deletePreset: (id: string) => Promise<boolean>;
        getFolders:   () => Promise<Folder[]>;
        addFolder:    (name: string) => Promise<Folder>;
        deleteFolder: (id: string) => Promise<boolean>;
      };
      file: {
        savePhoto:  (buf: ArrayBuffer, name: string) => Promise<{ 
          localPath: string; 
          fileName: string;
          thumbnailPath: string | null;
          previewUrl: string | null;
          isRaw: boolean;
        }>;
        readPhoto:  (localPath: string) => Promise<string | null>;
        getDataDir: () => Promise<string>;
      };
      dialog: {
        openFile:   () => Promise<string[]>;
        openFolder: () => Promise<string | null>;
      };
    };
  }
}

const RAW_EXTS = /\.(arw|cr2|cr3|nef|dng|orf|raf|rw2|pef|srw)$/i;
const eAPI = () => window.electronAPI!;

export function localPathToUrl(localPath: string): string {
  if (!localPath) return '';
  if (localPath.startsWith('auralab://') || localPath.startsWith('blob:') || localPath.startsWith('http')) return localPath;
  const normalized = localPath.replace(/\\/g, '/');
  return `auralab://local/${encodeURIComponent(normalized)}`;
}

export function useLocalStore() {
  const [photos, setPhotos] = React.useState<Photo[]>([]);
  const [presets, setPresets] = React.useState<Preset[]>([]);
  const [folders, setFolders] = React.useState<Folder[]>([]);
  const [isReady, setIsReady] = React.useState(false);

  const localUser: UserProfile = {
    uid: 'local-user',
    email: 'local@aura-lab',
    displayName: 'Aura Lab User',
    role: 'admin',
    plan: 'studio',
    storageUsed: 0,
    createdAt: new Date().toISOString(),
  };

  React.useEffect(() => {
    (async () => {
      const [dbPhotos, dbPresets, dbFolders] = await Promise.all([
        eAPI().db.getPhotos(),
        eAPI().db.getPresets(),
        eAPI().db.getFolders(),
      ]);

      const fixedPhotos = dbPhotos.map(p => ({
        ...p,
        // Use thumbnailPath for RAW files, otherwise use localPath
        url: (p as any).thumbnailPath 
          ? localPathToUrl((p as any).thumbnailPath)
          : (p as any).localPath 
            ? localPathToUrl((p as any).localPath) 
            : p.url,
        thumbnailUrl: (p as any).thumbnailPath ? localPathToUrl((p as any).thumbnailPath) : undefined,
      }));

      setPhotos(fixedPhotos);
      const userPresets = dbPresets.filter(p => !p.isSystem);
      setPresets([...SYSTEM_PRESETS.map(sp => ({ ...sp, isSystem: true })), ...userPresets]);
      setFolders(dbFolders);
      setIsReady(true);
    })();
  }, []);

  // ── Photos ────────────────────────────────────────────────────────────────
  const addPhotoFromFile = async (file: File): Promise<Photo | null> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await eAPI().file.savePhoto(arrayBuffer, file.name);
      const { localPath, thumbnailPath, previewUrl, isRaw } = result;

      // For RAW: display URL is the thumbnail JPEG; for normal: display URL is the original
      const displayUrl = previewUrl || localPathToUrl(localPath);
      const thumbUrl = thumbnailPath ? localPathToUrl(thumbnailPath) : undefined;

      const newPhoto = await eAPI().db.addPhoto({
        url: displayUrl,
        localPath,
        thumbnailPath: thumbnailPath || null,
        thumbnailUrl: thumbUrl,
        title: file.name,
        size: file.size,
        isRaw,
        settings: { ...DEFAULT_SETTINGS },
        folderId: null,
      } as any);

      const photoWithUrl = { 
        ...newPhoto, 
        url: displayUrl,
        thumbnailUrl: thumbUrl,
      };
      setPhotos(prev => [photoWithUrl, ...prev]);
      return photoWithUrl;
    } catch (err) {
      console.error('Error saving photo:', err);
      return null;
    }
  };

  const addPhotoFromUrl = async (url: string, title: string, size: number): Promise<Photo | null> => {
    try {
      const newPhoto = await eAPI().db.addPhoto({
        url, title, size,
        settings: { ...DEFAULT_SETTINGS },
        folderId: null,
      } as any);
      setPhotos(prev => [newPhoto, ...prev]);
      return newPhoto;
    } catch (err) {
      console.error('Error adding photo from URL:', err);
      return null;
    }
  };

  const persistPhotoSettings = async (id: string, settings: LightingSettings) => {
    try { await eAPI().db.updatePhoto(id, { settings }); }
    catch (err) { console.error('Error persisting settings:', err); }
  };

  const deletePhoto = async (id: string) => {
    await eAPI().db.deletePhoto(id);
    setPhotos(prev => prev.filter(p => p.id !== id));
  };

  // ── Presets ───────────────────────────────────────────────────────────────
  const addPreset = async (preset: Omit<Preset, 'id'>): Promise<Preset> => {
    const newPreset = await eAPI().db.addPreset(preset);
    setPresets(prev => [newPreset, ...prev]);
    return newPreset;
  };

  const deletePreset = async (id: string) => {
    await eAPI().db.deletePreset(id);
    setPresets(prev => prev.filter(p => p.id !== id));
  };

  // ── Folders ───────────────────────────────────────────────────────────────
  const addFolder = async (name: string): Promise<Folder> => {
    const folder = await eAPI().db.addFolder(name);
    setFolders(prev => [...prev, folder]);
    return folder;
  };

  const deleteFolder = async (id: string) => {
    await eAPI().db.deleteFolder(id);
    setFolders(prev => prev.filter(f => f.id !== id));
    setPhotos(prev => prev.map(p => (p as any).folderId === id ? { ...p, folderId: null } : p));
  };

  const movePhotoToFolder = async (photoId: string, folderId: string | null) => {
    setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, folderId } as any : p));
    await eAPI().db.updatePhoto(photoId, { folderId } as any);
  };

  return {
    photos, setPhotos, presets, folders, isReady, localUser,
    addPhotoFromFile, addPhotoFromUrl, persistPhotoSettings,
    deletePhoto, addPreset, deletePreset,
    addFolder, deleteFolder, movePhotoToFolder,
  };
}
