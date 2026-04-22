import React from "react";
import EXIF from "exif-js";
import { motion, AnimatePresence } from "motion/react";
import { GoogleGenAI } from "@google/genai";
import { 
  X,
  LayoutGrid, 
  Settings2, 
  User as UserIcon, 
  ShieldCheck, 
  HardDrive, 
  Zap,
  Layout,
  LayoutDashboard,
  PieChart,
  Folder as FolderIcon,
  FolderPlus,
  FileJson,
  Plus,
  HardDrive as HardDriveIcon,
  Image as ImageIcon, 
  Sun, 
  Maximize2, 
  ZoomIn,
  ZoomOut,
  Activity,
  Sparkles, 
  RotateCcw, 
  ChevronLeft, 
  ChevronRight,
  Download,
  Info,
  Upload,
  Eye,
  Split,
  Crop,
  MousePointer2,
  LogOut,
  Crown,
  Save,
  Trash2,
  Edit2,
  Lock,
  CreditCard,
  CheckCircle2,
  RotateCw,
  Trash2 as TrashIcon,
  ClipboardPaste,
  Star,
  Users,
  Search,
  Flag,
  XCircle,
  UserPlus,
  History as HistoryIcon,
  Database,
  ExternalLink,
  ChevronDown,
  Mail,
  Phone,
  Building2,
  Calendar,
  MoreVertical,
  Check,
  Menu
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import axios from "axios";
import { LightingControls } from "@/src/components/LightingControls";
import { Histogram } from "@/src/components/Histogram";
import { Filmstrip } from "@/src/components/Filmstrip";
import { PhotoCanvas, renderImageToCanvas } from "@/src/components/PhotoCanvas";
import { ExportModal, ExportSettings } from "@/src/components/ExportModal";
import { CropOverlay } from "@/src/components/CropOverlay";
import { Photo, DEFAULT_SETTINGS, LightingSettings, Client, PhotoVersion, ClientGallery, UserProfile, PlanType, STORAGE_LIMITS, Preset, PLAN_PRICES, Folder } from "@/src/types";
import { getFilterString, fixImageUrl } from "@/src/lib/imageProcessing";
import { auth, db, storage, signInWithGoogle, logout } from "@/src/firebase";
import { savePhotoLocally, getLocalPhotos, initLocalDB } from "@/src/lib/db";
import { ref, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject, getBlob } from "firebase/storage";
import { 
  collection, 
  query, 
  where, 
  or,
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  setDoc, 
  getDoc,
  getDocs,
  serverTimestamp,
  orderBy,
  limit,
  increment,
  writeBatch
} from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import { SYSTEM_PRESETS } from "@/src/constants/presets";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OperationType, handleFirestoreError } from "@/src/firebase";
import { parseLrtemplate, mergeWithDefaults } from "@/src/lib/lrParser";

const fixImageUrlLocal = (url: string) => {
  return fixImageUrl(url);
};

// Safe initialization of Gemini AI
let aiInstance: GoogleGenAI | null = null;

// Helper to get or initialize the AI instance with multiple key source lookups
const getAI = () => {
  if (aiInstance) return aiInstance;
  
  let key: string | undefined = undefined;
  
  try {
    // 1. Try standard process.env (platform guideline)
    key = (process.env as any).GEMINI_API_KEY;
    
    // 2. Try window global (sometimes used in platform iframes)
    if (!key || key === "undefined") {
      key = (window as any).GEMINI_API_KEY || (window as any).process?.env?.GEMINI_API_KEY;
    }
    
    // 3. Try Vite env (as a fallback if process.env was replaced during build)
    if (!key || key === "undefined") {
      key = (import.meta as any).env.VITE_GEMINI_API_KEY || (import.meta as any).env.GEMINI_API_KEY;
    }
  } catch (e) {
    console.warn("Non-critical: Error looking up Gemini key sources:", e);
  }

  if (key && key !== "undefined" && key.trim() !== "") {
    console.log("✅ Gemini AI initialized with key from environment");
    aiInstance = new GoogleGenAI({ apiKey: key });
    return aiInstance;
  }
  
  return null;
};

// Helper to safely parse AI JSON that might be wrapped in markdown
const parseAIJSON = (text: string) => {
  const cleanText = text.trim();
  try {
    // Try clean JSON first
    return JSON.parse(cleanText);
  } catch (e) {
    // Try to extract from markdown if present
    const match = cleanText.match(/```json\s*([\s\S]*?)\s*```/) || cleanText.match(/```([\s\S]*?)```/);
    if (match && match[1]) {
      try {
        return JSON.parse(match[1].trim());
      } catch (e2) {
        throw new Error("No se pudo procesar el formato de respuesta de la IA (JSON inválido)");
      }
    }
    throw e;
  }
};

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[100dvh] bg-zinc-950 flex items-center justify-center p-6 text-center">
          <div className="max-w-md space-y-4">
            <h1 className="text-2xl font-bold text-white uppercase tracking-widest">Algo salió mal</h1>
            <p className="text-zinc-500 text-sm leading-relaxed">
              La aplicación encontró un error inesperado al cargar.
            </p>
            <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-800 text-left overflow-auto max-h-40">
              <code className="text-[10px] text-red-400 font-mono">
                {this.state.error?.toString()}
              </code>
            </div>
            <Button 
              className="bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs uppercase tracking-widest"
              onClick={() => window.location.reload()}
            >
              Recargar Aplicación
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  // 1. All States
  const [user, setUser] = React.useState<User | null>(null);
  const [userProfile, setUserProfile] = React.useState<UserProfile | null>(null);
  const [photos, setPhotos] = React.useState<Photo[]>([]);
  const [folders, setFolders] = React.useState<Folder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = React.useState<string | null>(null);
  const [userPresets, setUserPresets] = React.useState<Preset[]>([]);
  const [isAuthReady, setIsAuthReady] = React.useState(false);
  const [customLogo, setCustomLogo] = React.useState<string | null>(null);
  const [showPricing, setShowPricing] = React.useState(false);
  const [showUpdateAvailable, setShowUpdateAvailable] = React.useState(false);
  const [latestVersion, setLatestVersion] = React.useState("");
  const [showStorageModal, setShowStorageModal] = React.useState(false);
  const [showCreateFolder, setShowCreateFolder] = React.useState(false);
  const [newFolderName, setNewFolderName] = React.useState("");
  const [isProcessingPayment, setIsProcessingPayment] = React.useState(false);
  const [isCreateClientOpen, setIsCreateClientOpen] = React.useState(false);
  const [isCreateGalleryOpen, setIsCreateGalleryOpen] = React.useState(false);
  const [newClientData, setNewClientData] = React.useState({ name: '', email: '', notes: '' });
  const [newGalleryData, setNewGalleryData] = React.useState({ title: '', clientId: '' });
  const [selectedClientId, setSelectedClientId] = React.useState<string | null>(null);
  const [selectedPhotoId, setSelectedPhotoId] = React.useState<string | null>(null);
  const [showEditorControls, setShowEditorControls] = React.useState(true);
  const [previewSettings, setPreviewSettings] = React.useState<LightingSettings | null>(null);
  const [selectedPhotoIds, setSelectedPhotoIds] = React.useState<string[]>([]);
  const [copiedSettings, setCopiedSettings] = React.useState<LightingSettings | null>(null);
  const [isAutoEnhancing, setIsAutoEnhancing] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [photoToDeleteId, setPhotoToDeleteId] = React.useState<string | null>(null);
  const [isSavingPreset, setIsSavingPreset] = React.useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = React.useState(false);
  const [bulkImportPlan, setBulkImportPlan] = React.useState<PlanType>("free");
  const [isImporting, setIsImporting] = React.useState(false);
  const [newPresetName, setNewPresetName] = React.useState("");
  const [newPresetIsSystem, setNewPresetIsSystem] = React.useState(false);
  const [newPresetPlan, setNewPresetPlan] = React.useState<PlanType>("free");
  const [history, setHistory] = React.useState<Record<string, LightingSettings[]>>({});
  const [totalStorageUsed, setTotalStorageUsed] = React.useState(0);
  const [clientSearchQuery, setClientSearchQuery] = React.useState("");
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<number>(0);
  const [clients, setClients] = React.useState<Client[]>([]);
  const [photoVersions, setPhotoVersions] = React.useState<PhotoVersion[]>([]);
  const [galleries, setGalleries] = React.useState<ClientGallery[]>([]);
  const [showCRM, setShowCRM] = React.useState(false);
  
  // Real-time Stats Calcs
  const stats = React.useMemo(() => {
    return {
      totalPhotos: photos.length,
      totalFolders: folders.length,
      totalClients: clients.length,
      totalGalleries: galleries.length,
      storageUsed: userProfile?.storageUsed || 0,
      capacity: userProfile?.plan === 'studio' ? STORAGE_LIMITS.studio : userProfile?.plan === 'pro' ? STORAGE_LIMITS.pro : STORAGE_LIMITS.free
    };
  }, [photos, folders, clients, galleries, userProfile?.plan]);

  const filteredClients = React.useMemo(() => {
    if (!clientSearchQuery) return clients;
    const q = clientSearchQuery.toLowerCase();
    return clients.filter(c => 
      c.name?.toLowerCase().includes(q) || 
      c.email?.toLowerCase().includes(q)
    );
  }, [clients, clientSearchQuery]);

  const selectedClient = React.useMemo(() => 
    clients.find(c => c.id === selectedClientId),
    [clients, selectedClientId]
  );

  const [searchQuery, setSearchQuery] = React.useState("");
  const [zoom, setZoom] = React.useState(0.8);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragStart, setDragStart] = React.useState({ x: 0, y: 0 });
  const [activeTab, setActiveTab] = React.useState<'dashboard' | 'gallery' | 'editor' | 'clients' | 'admin'>('dashboard');
  const [allUsers, setAllUsers] = React.useState<UserProfile[]>([]);
  const [systemConfig, setSystemConfig] = React.useState<any>(null);
  const [showControls, setShowControls] = React.useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const [isComparing, setIsComparing] = React.useState(false);
  const [compareValue, setCompareValue] = React.useState(50);
  const [isCropping, setIsCropping] = React.useState(false);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [isPressing, setIsPressing] = React.useState(false);
  const [newPhotoUrl, setNewPhotoUrl] = React.useState("");
  const [isExportModalOpen, setIsExportModalOpen] = React.useState(false);
  const [exportSettings, setExportSettings] = React.useState({
    format: 'image/jpeg' as const,
    quality: 0.9,
    scale: 1,
    watermark: false
  });
  const [publicGallerySlug, setPublicGallerySlug] = React.useState<string | null>(null);

  // Listen for hash changes for Public Gallery
  React.useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#gallery=')) {
        setPublicGallerySlug(hash.replace('#gallery=', ''));
      } else {
        setPublicGallerySlug(null);
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // 2. All Refs
  const galleryRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const imageRef = React.useRef<HTMLCanvasElement>(null);
  const imageStageRef = React.useRef<HTMLDivElement>(null);
  
  // Check for updates
  React.useEffect(() => {
    const checkUpdate = async () => {
      try {
        const response = await axios.get('/api/version');
        if (response.data.latest !== "1.3.1") {
          setLatestVersion(response.data.latest);
          setShowUpdateAvailable(true);
        }
      } catch (e) {
        console.log("Update check failed (local environment)");
      }
    };
    checkUpdate();
  }, []);
  const scrollToGallery = () => {
    galleryRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (error: any) {
      console.error("Login error details:", error);
      const errorMessage = error.code === 'auth/unauthorized-domain' 
        ? "Este dominio no está autorizado en Firebase. Por favor, añade este dominio a la lista de dominios autorizados en la consola de Firebase."
        : (error.message || "Error al iniciar sesión");
      
      toast.error(
        <div className="flex flex-col gap-1">
          <span className="font-bold">Error de Autenticación</span>
          <span className="text-xs opacity-80">{errorMessage}</span>
          {error.code && <span className="text-[10px] font-mono bg-red-500/20 px-1 rounded w-fit">Código: {error.code}</span>}
        </div>
      );
    }
  };

  // Auth Listener
  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          // Check/Create User Profile
          const userDocRef = doc(db, "users", currentUser.uid);
          
          const adminEmailsStr = (import.meta as any).env?.VITE_ADMIN_EMAILS;
          const adminEmails = adminEmailsStr ? adminEmailsStr.split(",") : [];
          const isAdmin = adminEmails.includes(currentUser.email?.toLowerCase() || "");
          
          const userDoc = await getDoc(userDocRef);
          if (!userDoc.exists()) {
            const profile: UserProfile = {
              uid: currentUser.uid,
              email: currentUser.email || "",
              displayName: currentUser.displayName || "Usuario",
              role: isAdmin ? "admin" : "user",
              plan: isAdmin ? "studio" : "free",
              storageUsed: 0,
              createdAt: new Date().toISOString()
            };
            await setDoc(userDocRef, profile);
          } else {
            const data = userDoc.data() as UserProfile;
            if (isAdmin && (data.role !== 'admin' || data.plan !== 'studio')) {
              await updateDoc(userDocRef, { role: 'admin', plan: 'studio' });
            }
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, "users/" + (currentUser?.uid || "unknown"));
        }
      } else {
        setUserProfile(null);
        setPhotos([]); 
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // User Profile Reactive Listener
  React.useEffect(() => {
    if (!user) return;
    
    const userDocRef = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(userDocRef, (doc) => {
      if (doc.exists()) {
        const profile = doc.data() as UserProfile;
        setUserProfile(profile);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "users/" + user.uid);
    });

    return () => unsubscribe();
  }, [user]);

  // Folders Listener
  React.useEffect(() => {
    if (!user) {
      setFolders([]);
      return;
    }
    const foldersQuery = query(collection(db, "folders"), where("userId", "==", user.uid));
    const unsubscribe = onSnapshot(foldersQuery, (snapshot) => {
      const foldersList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Folder));
      setFolders(foldersList);
    }, (error) => handleFirestoreError(error, OperationType.LIST, "folders"));
    
    return () => unsubscribe();
  }, [user]);

  // Combined Clients & Galleries Listener
  React.useEffect(() => {
    if (!user) {
      setClients([]);
      setGalleries([]);
      return;
    }

    const clientsQ = query(collection(db, "clients"), where("userId", "==", user.uid), orderBy("createdAt", "desc"));
    const unsubClients = onSnapshot(clientsQ, (snapshot) => {
      setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, "clients"));

    const galleriesQ = query(collection(db, "galleries"), where("userId", "==", user.uid), orderBy("createdAt", "desc"));
    const unsubGalleries = onSnapshot(galleriesQ, (snapshot) => {
      setGalleries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ClientGallery)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, "galleries"));
    
    return () => {
      unsubClients();
      unsubGalleries();
    };
  }, [user]);

  // Admin: All Users Listener
  React.useEffect(() => {
    if (!user || userProfile?.role !== 'admin') {
      setAllUsers([]);
      return;
    }

    const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAllUsers(snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id }) as UserProfile));
    }, (error) => console.error("Error loading all users:", error));

    return () => unsubscribe();
  }, [user, userProfile]);

  // Admin: Config Check
  React.useEffect(() => {
    if (activeTab === 'admin') {
      axios.get('/api/admin/config-check')
        .then(res => setSystemConfig(res.data))
        .catch(err => console.error("Config check failed:", err));
    }
  }, [activeTab]);

  // Photos Listener
  React.useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "photos"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedPhotos = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as Photo[];
      setPhotos(fetchedPhotos);
      
      // Save to local DB for offline access
      fetchedPhotos.forEach(p => savePhotoLocally(p.id, p));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "photos");
      
      // Fallback to local DB if offline or error
      getLocalPhotos().then(localPhotos => {
        if (localPhotos.length > 0) {
          setPhotos(localPhotos);
          toast.info("Cargando fotos desde el caché local (Modo Offline)");
        }
      });
    });

    return () => unsubscribe();
  }, [user]);

  // Presets Listener
  React.useEffect(() => {
    if (!user) {
      setUserPresets([]);
      return;
    }

    // Fetch both system presets and user presets
    // If user is admin, they can see all. If not, they need the filter.
    const isAdmin = userProfile?.role === 'admin';
    
    let q;
    if (isAdmin) {
      q = query(
        collection(db, "presets"),
        orderBy("createdAt", "desc")
      );
    } else {
      q = query(
        collection(db, "presets"),
        or(
          where("userId", "==", user.uid),
          where("isSystem", "==", true)
        ),
        orderBy("createdAt", "desc")
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allPresets = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as Preset[];
      
      setUserPresets(allPresets);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "presets");
    });

    return () => unsubscribe();
  }, [user, userProfile]);

  // Photo Versions Listener
  React.useEffect(() => {
    if (!user || !selectedPhotoId) {
      setPhotoVersions([]);
      return;
    }

    const q = query(
      collection(db, "photos", selectedPhotoId, "versions"),
      orderBy("createdAt", "desc"),
      limit(20)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPhotoVersions(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }) as PhotoVersion));
    }, (error) => console.error("Error loading versions:", error));

    return () => unsubscribe();
  }, [user, selectedPhotoId]);

  // Historial de versiones: Guardar versión
  const savePhotoVersion = async (photo: Photo, name?: string) => {
    if (!user) return;
    const versionName = name || `Versión ${new Date().toLocaleTimeString()}`;
    try {
      await addDoc(collection(db, "photos", photo.id, "versions"), {
        photoId: photo.id,
        userId: user.uid,
        name: versionName,
        settings: photo.settings,
        createdAt: serverTimestamp()
      });
      toast.success(`Versión "${versionName}" guardada`);
    } catch (error) {
      console.error("Error saving version:", error);
      toast.error("Error al guardar versión");
    }
  };

  // Flags & Colors
  const setPhotoFlag = async (photoId: string, flag: 'none' | 'pick' | 'reject') => {
    try {
      await updateDoc(doc(db, "photos", photoId), { flag });
      setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, flag } : p));
    } catch (e) { console.error(e); }
  };

  const setPhotoColor = async (photoId: string, colorTag: Photo['colorTag']) => {
    try {
      await updateDoc(doc(db, "photos", photoId), { colorTag });
      setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, colorTag } : p));
    } catch (e) { console.error(e); }
  };

  // Copy/Paste Logic
  const syncSettingsToSelected = async () => {
    if (!selectedPhotoId || selectedPhotoIds.length === 0 || !copiedSettings) return;
    
    setIsImporting(true);
    const batch = writeBatch(db);
    selectedPhotoIds.forEach(pid => {
      batch.update(doc(db, "photos", pid), { settings: copiedSettings });
    });
    
    try {
      await batch.commit();
      toast.success(`Sincronizados ${selectedPhotoIds.length} fotos`);
      setSelectedPhotoIds([]);
    } catch (e) { toast.error("Error en sincronización en lote"); }
    setIsImporting(false);
  };

  const addPhoto = async (url: string, title: string = "Nueva Foto", size: number = 0, storagePath?: string, thumbnailUrl?: string) => {
    if (!user || !userProfile) {
      toast.error("Debes iniciar sesión para guardar fotos");
      return;
    }

    // Check storage limits
    const currentLimit = STORAGE_LIMITS[userProfile.plan];
    if (userProfile.storageUsed + size > currentLimit) {
      toast.error("Has alcanzado el límite de almacenamiento de tu plan", {
        action: {
          label: "Mejorar Plan",
          onClick: () => setShowPricing(true)
        }
      });
      return;
    }

    const photoData = {
      userId: user.uid,
      url: url,
      thumbnailUrl: thumbnailUrl || null,
      title: title,
      description: "Imagen añadida por el usuario.",
      settings: { ...DEFAULT_SETTINGS },
      createdAt: serverTimestamp(),
      isPublic: false,
      size: size,
      storagePath: storagePath || null,
      folderId: selectedFolderId || null
    };

    console.log("Intentando guardar en Firestore con datos:", {
      ...photoData,
      url: url.startsWith('data:') ? `DataURL(${url.length} chars)` : url
    });

    try {
      const docRef = await addDoc(collection(db, "photos"), photoData);
      
      // Issue 5.1 fix: Increment handled by server Admin SDK in /api/upload
      // To avoid double increment, we removed the client-side call.
      
      console.log("Foto guardada en Firestore con ID:", docRef.id);

      toast.success("Foto guardada en tu galería privada");
      return docRef.id;
    } catch (error: any) {
      console.error("Error detallado al guardar en Firestore:", error);
      
      if (error.message?.includes("exceeds the maximum allowed size")) {
        toast.error("La imagen es demasiado grande para el modo de emergencia. Por favor, intenta con una imagen más pequeña (< 700KB) mientras se activa el almacenamiento en la nube.");
      } else {
        handleFirestoreError(error, OperationType.CREATE, "photos");
        toast.error("Error al guardar la información de la foto");
      }
    }
  };

  const handleUrlAdd = () => {
    if (!newPhotoUrl) return;
    try {
      const fixedUrl = fixImageUrl(newPhotoUrl);
      addPhoto(fixedUrl, "Foto desde URL", 0);
      setNewPhotoUrl("");
    } catch (error) {
      toast.error("Error al procesar la URL");
    }
  };

  const handleCreateClient = async () => {
    if (!user || !newClientData.name.trim()) {
      toast.error("El nombre del cliente es obligatorio");
      return;
    }

    try {
      if (selectedClientId && clients.find(c => c.id === selectedClientId)) {
        // Update existing
        await updateDoc(doc(db, "clients", selectedClientId), {
          name: newClientData.name,
          email: newClientData.email || "",
          notes: newClientData.notes || "",
          updatedAt: serverTimestamp()
        });
        toast.success("Cliente actualizado con éxito");
      } else {
        // Create new
        await addDoc(collection(db, "clients"), {
          userId: user.uid,
          name: newClientData.name,
          email: newClientData.email || "",
          notes: newClientData.notes || "",
          createdAt: serverTimestamp()
        });
        toast.success("Cliente creado con éxito");
      }
      setIsCreateClientOpen(false);
      setNewClientData({ name: '', email: '', notes: '' });
    } catch (e) {
      console.error(e);
      toast.error("Error al procesar cliente");
    }
  };

  const handleCreateGallery = async () => {
    if (!user || !newGalleryData.title || selectedPhotoIds.length === 0) {
      toast.error("Título y fotos seleccionadas son necesarios");
      return;
    }

    // Issue 2.5: Validate clientId
    if (!newGalleryData.clientId || newGalleryData.clientId === 'none') {
      toast.error("Debes seleccionar un cliente para la galería");
      return;
    }

    try {
      const slug = newGalleryData.title.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.random().toString(36).substring(7);
      await addDoc(collection(db, "galleries"), {
        userId: user.uid,
        clientId: newGalleryData.clientId || 'none',
        title: newGalleryData.title,
        photoIds: selectedPhotoIds,
        slug: slug,
        status: 'published',
        createdAt: serverTimestamp()
      });
      setIsCreateGalleryOpen(false);
      setSelectedPhotoIds([]);
      setNewGalleryData({ title: '', clientId: '' });
      toast.success("Galería publicada con éxito");
    } catch (e) {
      console.error(e);
      toast.error("Error al publicar la galería");
    }
  };


  const copyGalleryLink = (slug: string) => {
    const url = `${window.location.origin}${window.location.pathname}#gallery=${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Enlace de galería copiado");
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) {
      console.log("Upload aborted: No file or user not logged in", { file: !!file, user: !!user });
      return;
    }

    if (!userProfile) {
      toast.error("Cargando perfil de usuario... Por favor, espera un momento.");
      return;
    }

    // Pre-upload storage check
    const currentLimit = STORAGE_LIMITS[userProfile.plan];
    if ((userProfile.storageUsed || 0) + file.size > currentLimit) {
      toast.error("Has alcanzado el límite de almacenamiento de tu plan", {
        action: {
          label: "Mejorar Plan",
          onClick: () => setShowPricing(true)
        }
      });
      return;
    }

    console.log("Starting upload for file:", {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: new Date(file.lastModified).toISOString()
    });

    const isRaw = /\.(arw|cr2|nef|dng|orf|raf)$/i.test(file.name);
    const isImage = /\.(jpg|jpeg|png|webp)$/i.test(file.name);

    if (!isRaw && !isImage) {
      toast.error("Formato de archivo no soportado. Usa JPG, PNG o formatos RAW (ARW, CR2, etc.)");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      console.log("Iniciando subida a Backblaze B2...");
      
      const formData = new FormData();
      formData.append("file", file);
      formData.append("userId", user.uid);

      const response = await axios.post("/api/upload", formData, {
        onUploadProgress: (progressEvent) => {
          const total = progressEvent.total || file.size;
          const progress = Math.round((progressEvent.loaded / total) * 100);
          setUploadProgress(progress);
          console.log(`B2 Upload progress: ${progress}% (${progressEvent.loaded}/${total})`);
        },
        timeout: 300000 // 5 minutes timeout for large files
      });

      const { url, thumbnailUrl } = response.data;
      console.log("Subida a B2 exitosa:", { url, thumbnailUrl });

      const newId = await addPhoto(url, file.name, file.size, undefined, thumbnailUrl);
      
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
      
      if (newId) {
        setSelectedPhotoId(newId);
        setActiveTab('editor');
      }
      
      toast.success("Foto subida correctamente");

    } catch (error: any) {
      console.error("Error en la subida a B2:", error);
      toast.error("Error al subir la foto. Por favor, intenta de nuevo.");
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const filteredPhotos = React.useMemo(() => {
    let result = photos;
    
    // Filter by folder
    if (selectedFolderId) {
      result = result.filter(p => p.folderId === selectedFolderId);
    }
    
    // Smart Filter / Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (q === ':pick') result = result.filter(p => p.flag === 'pick');
      else if (q === ':reject') result = result.filter(p => p.flag === 'reject');
      else if (q.startsWith(':')) {
        const color = q.substring(1);
        result = result.filter(p => p.colorTag === color);
      } else {
        result = result.filter(p => 
          p.title.toLowerCase().includes(q) || 
          p.description?.toLowerCase().includes(q) ||
          p.tags?.some(t => t.toLowerCase().includes(q))
        );
      }
    }
    
    return result;
  }, [photos, selectedFolderId, searchQuery]);

  const selectedPhoto = React.useMemo(() => 
    photos.find(p => p.id === selectedPhotoId),
    [photos, selectedPhotoId]
  );

  // Reset preview settings when photo changes
  React.useEffect(() => {
    if (selectedPhoto) {
      setPreviewSettings(selectedPhoto.settings);
    } else {
      setPreviewSettings(null);
    }
  }, [selectedPhotoId]);

  const updatePhotoSettings = React.useCallback((id: string, updates: Partial<LightingSettings>) => {
    setPhotos(prev => {
      const photo = prev.find(p => p.id === id);
      if (!photo) return prev;
      
      const newSettings = { ...photo.settings, ...updates };
      
      // Update history
      setHistory(hPrev => {
        const photoHistory = hPrev[id] || [];
        const lastSettings = photoHistory[photoHistory.length - 1];
        if (JSON.stringify(lastSettings) === JSON.stringify(newSettings)) return hPrev;
        return {
          ...hPrev,
          [id]: [...photoHistory, newSettings].slice(-20)
        };
      });

      // Save to Firestore is now handled by the debounced useEffect (Issue 2.2 fix)
      /* 
      const photoRef = doc(db, "photos", id);
      updateDoc(photoRef, { 
        settings: newSettings,
        updatedAt: serverTimestamp() 
      }).catch(err => console.error("Error auto-saving settings:", err));
      */

      return prev.map(p => p.id === id ? { ...p, settings: newSettings } : p);
    });
  }, []);

  const updatePhotoRating = async (id: string, rating: number) => {
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, rating } : p));
    try {
      await updateDoc(doc(db, "photos", id), { rating });
    } catch (error) {
      console.error("Error updating rating:", error);
    }
  };

  const updatePhotoColorTag = async (id: string, colorTag: Photo['colorTag']) => {
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, colorTag } : p));
    try {
      await updateDoc(doc(db, "photos", id), { colorTag });
    } catch (error) {
      console.error("Error updating color tag:", error);
    }
  };

  // Debounced Firestore sync
  React.useEffect(() => {
    if (!selectedPhotoId || !user) return;
    
    const photo = photos.find(p => p.id === selectedPhotoId);
    if (!photo || photo.id.length < 10) return; // Skip samples

    const timer = setTimeout(async () => {
      try {
        await updateDoc(doc(db, "photos", photo.id), { settings: photo.settings });
      } catch (error) {
        console.error("Error syncing settings:", error);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [photos, selectedPhotoId, user]);

  const resetZoom = () => {
    setZoom(0.8);
    setPan({ x: 0, y: 0 });
  };

  // Pan con mouse — funciona en cualquier nivel de zoom
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Zoom con rueda del mouse apuntando al cursor — igual que Lightroom
  const handleWheel = React.useCallback((e: WheelEvent) => {
    e.preventDefault();
    const stage = imageStageRef.current;
    if (!stage) return;

    const rect = stage.getBoundingClientRect();
    const cursorX = e.clientX - rect.left - rect.width / 2;
    const cursorY = e.clientY - rect.top - rect.height / 2;

    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;

    setZoom(prevZoom => {
      const newZoom = Math.min(Math.max(prevZoom * zoomFactor, 0.1), 10);
      const scale = newZoom / prevZoom;
      setPan(prevPan => ({
        x: cursorX - scale * (cursorX - prevPan.x),
        y: cursorY - scale * (cursorY - prevPan.y)
      }));
      return newZoom;
    });
  }, []);

  // Attach wheel con passive:false para poder hacer preventDefault
  React.useEffect(() => {
    const stage = imageStageRef.current;
    if (!stage) return;
    stage.addEventListener('wheel', handleWheel, { passive: false });
    return () => stage.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Shortcut for ESC and Sidebar
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC to deselect or close editor
      if (e.key === 'Escape') {
        if (selectedPhotoId) {
          setSelectedPhotoId(null);
        } else if (selectedPhotoIds.length > 0) {
          setSelectedPhotoIds([]);
        }
      }
      
      // Shortcut to toggle sidebar (Alt + S)
      if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setIsSidebarOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPhotoId, selectedPhotoIds]);

  const deletePhoto = async (id: string) => {
    if (!user || !userProfile) {
      console.warn("Delete aborted: No user or profile");
      return;
    }
    console.log("Attempting to delete photo:", id);
    try {
      const photoToDelete = photos.find(p => p.id === id);
      if (!photoToDelete) {
        console.warn("Photo not found in state:", id);
        return;
      }

      const photoSize = (photoToDelete as any)?.size || 0;
      const storagePath = (photoToDelete as any)?.storagePath;
      const url = photoToDelete.url;
      const thumbnailUrl = (photoToDelete as any)?.thumbnailUrl;

      // 1. Delete from Firestore first
      await deleteDoc(doc(db, "photos", id));
      
      // 2. Delete from Storage (Server/B2)
      if (url && !url.startsWith('blob:')) {
        try {
          await axios.post("/api/delete-file", { 
            url, 
            thumbnailUrl,
            userId: user.uid,
            photoSize: photoSize
          });
          console.log("Archivo eliminado del servidor/B2 correctamente");
        } catch (localErr) {
          console.warn("Error al eliminar archivo del servidor/B2:", localErr);
        }
      }
      
      // 3. Delete from Firebase Storage (Cloud) - Optional/Fallback
      if (storagePath) {
        try {
          const storageRef = ref(storage, storagePath);
          await deleteObject(storageRef);
        } catch (storageErr) {
          // We log but don't fail, as cloud storage is often blocked/not used
          console.warn("Firebase Storage delete skipped or failed (expected in local mode):", storageErr);
        }
      }

      setSelectedPhotoId(null);
      setPhotos(prev => prev.filter(p => p.id !== id));
      toast.success("Foto eliminada");
    } catch (error) {
      console.error("Error al eliminar la foto:", error);
      toast.error("Error al eliminar la foto");
    }
  };

  const bulkDeletePhotos = async () => {
    if (selectedPhotoIds.length === 0) return;
    
    // Issue 2.4 fix: Using toast action instead of window.confirm
    toast("¿Eliminar selección?", {
      description: `Se eliminarán permanentemente ${selectedPhotoIds.length} fotos.`,
      action: {
        label: "Eliminar",
        onClick: async () => {
          const count = selectedPhotoIds.length;
          const toastId = toast.loading(`Eliminando ${count} fotos...`);
          
          try {
            const targets = photos.filter(p => selectedPhotoIds.includes(p.id));
            
            await Promise.all(targets.map(async (photo) => {
              try {
                await deleteDoc(doc(db, "photos", photo.id));
                if (photo.url && !photo.url.startsWith('blob:')) {
                  await axios.post("/api/delete-file", { 
                    url: photo.url, 
                    thumbnailUrl: (photo as any).thumbnailUrl,
                    userId: user?.uid,
                    photoSize: (photo as any).size || 0
                  });
                }
              } catch (err) {
                console.warn(`Error deleting photo ${photo.id}:`, err);
              }
            }));

            setPhotos(prev => prev.filter(p => !selectedPhotoIds.includes(p.id)));
            setSelectedPhotoIds([]);
            toast.success(`${count} fotos eliminadas correctamente`, { id: toastId });
          } catch (error) {
            console.error("Error in bulk delete:", error);
            toast.error("Error al eliminar algunas fotos", { id: toastId });
          }
        }
      }
    });
  };

  const saveCurrentAsPreset = () => {
    if (!user || !selectedPhoto) return;
    setNewPresetName("");
    setNewPresetIsSystem(false);
    setNewPresetPlan("free");
    setIsSavingPreset(true);
  };

  const confirmSavePreset = async () => {
    if (!user || !selectedPhoto || !newPresetName) {
      toast.error("Por favor, ingresa un nombre para el preset");
      return;
    }

    try {
      await addDoc(collection(db, "presets"), {
        userId: user.uid,
        name: newPresetName,
        category: newPresetIsSystem ? "Sistema" : "Mis Presets",
        settings: selectedPhoto.settings,
        createdAt: serverTimestamp(),
        isSystem: newPresetIsSystem,
        planRequired: newPresetIsSystem ? newPresetPlan : 'free'
      });
      
      toast.success(newPresetIsSystem ? "Preset del sistema guardado" : "Preset personal guardado");
      setIsSavingPreset(false);
      setNewPresetName("");
    } catch (error) {
      console.error("Error al guardar el preset:", error);
      toast.error("Error al guardar el preset");
    }
  };

  const handleBulkImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsImporting(true);
    let importedCount = 0;
    let errorCount = 0;

    const toastId = toast.loading(`Importando ${files.length} presets...`);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.name.toLowerCase().endsWith('.lrtemplate')) continue;

        // Update toast with progress
        toast.loading(`Importando ${i + 1}/${files.length}: ${file.name}`, { id: toastId });

        // Get category from folder name
        // webkitRelativePath is like "folder/subfolder/file.lrtemplate"
        const pathParts = file.webkitRelativePath.split('/');
        const category = pathParts.length > 1 ? pathParts[pathParts.length - 2] : "General";
        const name = file.name.replace(/\.lrtemplate$/i, '');

        try {
          const content = await file.text();
          const partialSettings = parseLrtemplate(content);
          const settings = mergeWithDefaults(partialSettings);

          await addDoc(collection(db, "presets"), {
            userId: user?.uid,
            name,
            category,
            settings,
            createdAt: serverTimestamp(),
            isSystem: true, // Bulk imports are usually system presets
            planRequired: bulkImportPlan
          });
          importedCount++;
        } catch (err) {
          console.error(`Error importing ${file.name}:`, err);
          errorCount++;
        }
      }

      toast.success(`Importación completada: ${importedCount} presets guardados.`, { id: toastId });
      if (errorCount > 0) {
        toast.error(`${errorCount} archivos no pudieron ser procesados.`);
      }
      setIsBulkImportOpen(false);
    } catch (error) {
      console.error("Error en importación masiva:", error);
      toast.error("Error crítico durante la importación", { id: toastId });
    } finally {
      setIsImporting(false);
    }
  };

  const applyPreset = (preset: Preset) => {
    if (!selectedPhoto) return;
    
    // Check plan requirement
    const planLevels: Record<PlanType, number> = { free: 0, pro: 1, studio: 2 };
    const userLevel = planLevels[userProfile?.plan || 'free'];
    const requiredLevel = planLevels[preset.planRequired || 'free'];

    if (userLevel < requiredLevel) {
      toast.error(`El preset "${preset.name}" requiere un plan ${preset.planRequired?.toUpperCase()}`, {
        action: {
          label: "Mejorar Plan",
          onClick: () => setShowPricing(true)
        }
      });
      return;
    }

    updatePhotoSettings(selectedPhoto.id, preset.settings);
    toast.success(`Preset "${preset.name}" aplicado`);
  };

  const handleUpgrade = async (plan: PlanType) => {
    if (!user) {
      handleLogin();
      return;
    }

    setIsProcessingPayment(true);
    try {
      const response = await fetch("/api/create-preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planName: plan.toUpperCase(),
          price: PLAN_PRICES[plan],
          userId: user.uid
        })
      });

      const data = await response.json();
      if (data.init_point) {
        window.location.href = data.init_point;
      } else {
        throw new Error("No se pudo obtener el link de pago");
      }
    } catch (error) {
      toast.error("Error al procesar el pago con Mercado Pago");
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const resetSettings = React.useCallback((id: string) => {
    updatePhotoSettings(id, { ...DEFAULT_SETTINGS });
  }, [updatePhotoSettings]);

  const handleEditorChange = React.useCallback((s: LightingSettings) => {
    if (!selectedPhotoId) return;
    updatePhotoSettings(selectedPhotoId, s);
  }, [selectedPhotoId, updatePhotoSettings]);

  const handleEditorPreview = React.useCallback((s: LightingSettings) => {
    setPreviewSettings(s);
  }, []);

  const handleLightroomImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      toast.loading("Leyendo catálogo de Lightroom...", { id: "lrcat-import" });
      
      // Load sql.js
      const initSqlJsGlobal = (window as any).initSqlJs;
      if (!initSqlJsGlobal) {
        toast.error("sql.js no se ha cargado correctamente.");
        return;
      }

      const SQL = await initSqlJsGlobal({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/${file}`
      });

      const arrayBuffer = await file.arrayBuffer();
      const lrcatDb = new SQL.Database(new Uint8Array(arrayBuffer));

      // Query for images
      // Lightroom schema: AgLibraryFile contains filenames, Adobe_images contains metadata
      const res = lrcatDb.exec("SELECT baseName, extension FROM AgLibraryFile LIMIT 100");
      
      if (res.length > 0) {
        const files = res[0].values.map(v => `${v[0]}.${v[1]}`);
        toast.success(`Se encontraron ${files.length} imágenes en el catálogo.`, { id: "lrcat-import" });
        console.log("Imágenes encontradas en el catálogo:", files);
        
        // For now, we just show them in console and toast
        // In a real app, we would match them with uploaded files
        toast.info("Nota: Para editar estas fotos, primero debes subirlas a Aura Lab.");
      } else {
        toast.error("No se encontraron imágenes en este catálogo.", { id: "lrcat-import" });
      }

      // Defer clean up
      if (lrcatDb && typeof lrcatDb.close === 'function') {
        try { lrcatDb.close(); } catch (e) {}
      }
    } catch (err) {
      console.error("Error al importar catálogo:", err);
      toast.error("Error al leer el catálogo de Lightroom. Asegúrate de que sea un archivo .lrcat válido.", { id: "lrcat-import" });
    }
  };

  const smartEnhance = async (id: string, customPrompt?: string, openEditor = false) => {
    const photo = photos.find(p => p.id === id);
    if (!photo) return;

    setIsAutoEnhancing(true);
    if (openEditor) setSelectedPhotoId(id);
    
    try {
      toast.loading(customPrompt ? "Aplicando estilo con IA..." : "Analizando imagen con IA...", { id: "ai-enhance" });
      console.log("Starting Smart Enhance for photo:", id, customPrompt ? `with prompt: ${customPrompt}` : "");
      
      // Get the image data
      let blob: Blob;
      const isRaw = /\.(arw|cr2|nef|dng|orf|raf)$/i.test(photo.url);
      const targetUrl = isRaw && photo.thumbnailUrl ? photo.thumbnailUrl : photo.url;
      
      if (photo.storagePath && !isRaw) {
        console.log("Fetching from storage:", photo.storagePath);
        const storageRef = ref(storage, photo.storagePath);
        blob = await getBlob(storageRef);
      } else {
        console.log(`Fetching from ${isRaw ? 'Thumbnail (RAW detected)' : 'URL'}:`, targetUrl);
        const imageUrl = fixImageUrl(targetUrl);
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error(`Error al descargar la imagen: ${response.statusText}`);
        blob = await response.blob();
      }
      
      console.log("Image blob obtained:", blob.type, blob.size);

      // Convert to base64
      const reader = new FileReader();
      const base64Promise = new Promise<{data: string, mimeType: string}>((resolve, reject) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          const commaIndex = result.indexOf(',');
          const base64 = result.substring(commaIndex + 1);
          const mimeType = result.substring(5, commaIndex).split(';')[0];
          
          if (!base64) reject(new Error("No se pudo convertir la imagen a base64"));
          resolve({ data: base64, mimeType });
        };
        reader.onerror = () => reject(new Error("Error al leer el archivo de imagen"));
        reader.readAsDataURL(blob);
      });
      const { data: base64Data, mimeType: detectedMimeType } = await base64Promise;

      console.log("Sending request to Gemini for Smart Enhance...");

      const baseInstruction = `Analiza esta fotografía y devuelve los ajustes de revelado ideales.
      REGLAS ESTRICTAS:
      - NO quemes las altas luces.
      - NO satures en exceso.
      - Responde ÚNICAMENTE con un objeto JSON.`;

      const promptUI = customPrompt 
        ? `El usuario solicita este estilo específico: "${customPrompt}". Ajusta los parámetros para lograr este look creativo manteniendo la calidad técnica.`
        : `Devuelve los ajustes ideales para que la foto luzca profesional, equilibrada y natural. El objetivo es un revelado orgánico, similar a una película analógica de alta calidad.`;

      const fullPrompt = `${baseInstruction}
      
      ${promptUI}
      
      JSON schema:
      - brightness (95-105, 100 es neutro)
      - contrast (98-108, 100 es neutro)
      - saturation (98-105, 100 es neutro)
      - exposure (-0.2 a 0.2, 0 es neutro)
      - warmth (-5 a 5, 0 es neutro)
      - tint (-2 a 2, 0 es neutro)
      - vibrance (100-108, 100 es neutro)
      - clarity (0-8, 0 es neutro)
      - highlights (70-100, 100 es neutro)
      - shadows (95-105, 100 es neutro)
      - whites (85-100, 100 es neutro)
      - blacks (95-105, 100 es neutro)`;

      console.log("Sending request to Gemini for Smart Enhance...");
      const ai = getAI();
      if (!ai) {
        throw new Error("La función de IA no está configurada (falta la clave API en el entorno)");
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            { text: fullPrompt },
            {
              inlineData: {
                mimeType: detectedMimeType || "image/jpeg",
                data: base64Data
              }
            }
          ]
        },
        config: {
          responseMimeType: "application/json"
        }
      });

      if (!response || !response.text) {
        throw new Error("No se recibió respuesta válida de la IA");
      }

      const responseText = response.text;
      console.log("Gemini response received for Smart Enhance:", responseText);
      const aiData = parseAIJSON(responseText);
      
      // Normalize AI response to match our internal ranges
      const enhancedSettings: LightingSettings = {
        ...photo.settings,
        ...aiData
      };
      
      updatePhotoSettings(id, enhancedSettings);
      if (id === selectedPhotoId) {
        setPreviewSettings(enhancedSettings);
      }
      toast.success("Iluminación optimizada por IA", { id: "ai-enhance" });
    } catch (error) {
      console.error("AI Enhance error:", error);
      toast.error("Error al usar la IA. Usando mejora automática básica.", { id: "ai-enhance" });
      
      const fallbackSettings: LightingSettings = {
        ...DEFAULT_SETTINGS,
        brightness: 105,
        contrast: 105,
        saturation: 102,
        exposure: 0.2,
        clarity: 15
      };
      updatePhotoSettings(id, fallbackSettings);
    } finally {
      setIsAutoEnhancing(false);
    }
  };

  const copySettings = (settings?: LightingSettings) => {
    if (settings) {
      setCopiedSettings({ ...settings });
      toast.info("Ajustes copiados");
      return;
    }
    const photo = photos.find(p => p.id === selectedPhotoId);
    if (photo) {
      setCopiedSettings({ ...photo.settings });
      toast.success("Ajustes copiados");
    }
  };

  const pasteSettings = async (photoId?: string) => {
    if (!copiedSettings) {
      toast.error("No hay ajustes copiados");
      return;
    }

    const targets = typeof photoId === 'string' ? [photoId] : (selectedPhotoIds.length > 0 ? selectedPhotoIds : (selectedPhotoId ? [selectedPhotoId] : []));
    
    if (targets.length === 0) {
      toast.error("Selecciona al menos una foto para pegar");
      return;
    }

    const toastId = toast.loading(`Pegando ajustes en ${targets.length} foto(s)...`);

    try {
      const batch = writeBatch(db);
      targets.forEach(id => {
        const photoRef = doc(db, "photos", id);
        batch.update(photoRef, { settings: copiedSettings });
      });
      await batch.commit();
      
      // Update local state
      setPhotos(prev => prev.map(p => targets.includes(p.id) ? { ...p, settings: copiedSettings } : p));
      
      toast.success("Ajustes pegados correctamente", { id: toastId });
    } catch (error) {
      console.error("Error pasting settings:", error);
      toast.error("Error al pegar los ajustes", { id: toastId });
    }
  };

  const handleBatchExport = async () => {
    if (selectedPhotoIds.length === 0) {
      toast.error("Selecciona fotos para exportar");
      return;
    }

    const selectedPhotos = photos.filter(p => selectedPhotoIds.includes(p.id));
    const toastId = toast.loading(`Preparando exportación de ${selectedPhotos.length} fotos...`);

    try {
      const response = await axios.post('/api/export/batch', {
        photos: selectedPhotos,
        format: 'jpg',
        quality: 90
      }, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `aura-batch-export-${Date.now()}.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success("Exportación completada", { id: toastId });
      setSelectedPhotoIds([]); // Clear selection after export
    } catch (error) {
      console.error("Batch export error:", error);
      toast.error("Error al exportar las fotos", { id: toastId });
    }
  };

  const selectAllPhotos = () => {
    if (photos.length === 0) return;
    const allIds = photos.map(p => p.id);
    setSelectedPhotoIds(allIds);
    toast.success(`${allIds.length} fotos seleccionadas`);
  };

  const clearSelection = () => {
    setSelectedPhotoIds([]);
  };

  const togglePhotoSelection = (id: string) => {
    setSelectedPhotoIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const analyzePhotoWithIA = async (id: string) => {
    const photo = photos.find(p => p.id === id);
    if (!photo) return;

    setIsAnalyzing(true);
    const toastId = toast.loading("Analizando imagen con Gemini...");

    try {
      const isRaw = /\.(arw|cr2|nef|dng|orf|raf)$/i.test(photo.url);
      const targetUrl = isRaw && photo.thumbnailUrl ? photo.thumbnailUrl : photo.url;
      
      console.log(`Fetching image for AI analysis (${isRaw ? 'RAW Proxy' : 'Original'}):`, targetUrl);
      const imageUrl = fixImageUrl(targetUrl);
      const imageRes = await fetch(imageUrl);
      if (!imageRes.ok) throw new Error(`Error al descargar la imagen: ${imageRes.statusText}`);
      
      const blob = await imageRes.blob();
      console.log("Image blob obtained:", blob.type, blob.size);
      
      const reader = new FileReader();
      const imageData = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          if (!base64) reject(new Error("No se pudo convertir la imagen a base64"));
          resolve(base64);
        };
        reader.onerror = () => reject(new Error("Error al leer el archivo de imagen"));
        reader.readAsDataURL(blob);
      });

      const prompt = `Analiza esta fotografía y devuelve un objeto JSON con:
      1. "title": Un título creativo y corto en ESPAÑOL (máx 30 caracteres).
      2. "description": Una descripción breve de la escena en ESPAÑOL.
      3. "tags": Un array de 5 etiquetas relevantes en ESPAÑOL.
      4. "presetSuggestion": El nombre de uno de estos presets que mejor le iría: "Cine Noir", "Urbano Brutalista", "Boda Elegante", "Amanecer Cálido", "Golden Hour Pro", "Retrato Suave".
      
      IMPORTANTE: Toda la respuesta de texto debe ser en ESPAÑOL.
      Responde ÚNICAMENTE con el JSON.`;

      console.log("Sending request to Gemini...");
      const ai = getAI();
      if (!ai) {
        throw new Error("La función de IA no está configurada (falta la clave API en el entorno)");
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: blob.type || "image/jpeg",
                data: imageData
              }
            }
          ]
        },
        config: {
          responseMimeType: "application/json"
        }
      });

      if (!response || !response.text) {
        throw new Error("No se recibió respuesta válida de la IA");
      }

      const responseText = response.text;
      console.log("Gemini response received:", responseText);
      const analysis = parseAIJSON(responseText);

      setPhotos(prev => prev.map(p => p.id === id ? { 
        ...p, 
        title: analysis.title || p.title,
        description: analysis.description || p.description,
        tags: analysis.tags || p.tags
      } : p));

      await updateDoc(doc(db, "photos", id), { 
        title: analysis.title || photo.title,
        description: analysis.description || photo.description || "",
        tags: analysis.tags || photo.tags || []
      });

      toast.success("Análisis completado", {
        description: `Sugerencia: ${analysis.presetSuggestion}`,
        id: toastId
      });
    } catch (error: any) {
      console.error("AI Analysis error:", error);
      toast.error(`Error en el análisis: ${error.message || "Error desconocido"}`, { id: toastId });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const navigatePhoto = (direction: 'prev' | 'next') => {
    // Issue 2.6 fix: Navigate over filtered list
    const list = filteredPhotos.length > 0 ? filteredPhotos : photos;
    const currentIndex = list.findIndex(p => p.id === selectedPhotoId);
    let nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    
    if (nextIndex >= list.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = list.length - 1;
    
    setSelectedPhotoId(list[nextIndex].id);
  };

  const updatePhotoTitle = async (id: string, newTitle: string) => {
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, title: newTitle } : p));
    try {
      await updateDoc(doc(db, "photos", id), { title: newTitle });
    } catch (error) {
      console.error("Error updating title:", error);
      toast.error("Error al actualizar el nombre");
    }
  };

  const downloadImage = async (settings: any) => {
    if (!selectedPhoto) return;
    
    const canvas = document.createElement('canvas');
    const img = new Image();
    img.crossOrigin = "anonymous";
    
    toast.promise(new Promise(async (resolve, reject) => {
      img.onload = async () => {
        const s = selectedPhoto.settings;
        
        // Calculate dimensions based on any rotation angle
        const angleRad = (s.rotation * Math.PI) / 180;
        const baseWidth = Math.abs(img.width * Math.cos(angleRad)) + Math.abs(img.height * Math.sin(angleRad));
        const baseHeight = Math.abs(img.width * Math.sin(angleRad)) + Math.abs(img.height * Math.cos(angleRad));
        
        const exportWidth = baseWidth * settings.scale;
        const exportHeight = baseHeight * settings.scale;

        // Limit max resolution to avoid browser crashes (e.g., 8192px is safe for most)
        const MAX_DIMENSION = 8192;
        let finalScale = settings.scale;
        if (exportWidth > MAX_DIMENSION || exportHeight > MAX_DIMENSION) {
          finalScale = Math.min(MAX_DIMENSION / baseWidth, MAX_DIMENSION / baseHeight);
          toast.warning(`Resolución ajustada a ${Math.round(finalScale * 100)}% por límites del navegador`);
        }

        const finalWidth = baseWidth * finalScale;
        const finalHeight = baseHeight * finalScale;

        await renderImageToCanvas(canvas, img, s, {
          width: finalWidth,
          height: finalHeight
        });
        
        const extension = settings.format.split('/')[1];
        const fileName = `lumina-${selectedPhoto.title.toLowerCase().replace(/\s+/g, '-')}.${extension}`;
        
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("No se pudo generar el archivo"));
            return;
          }
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.download = fileName;
          link.href = url;
          link.click();
          URL.revokeObjectURL(url);
          resolve(true);
        }, settings.format, settings.quality);
      };
      img.onerror = reject;
      // Issue 2.7 fix: Use fixImageUrl
      img.src = fixImageUrl(selectedPhoto.url);
    }), {
      loading: 'Preparando descarga...',
      success: 'Imagen descargada con éxito',
      error: 'Error al descargar la imagen. Intenta con otra foto.'
    });
  };

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 font-sans selection:bg-amber-500/30 flex overflow-hidden relative">
      {/* Sidebar Backdrop (Mobile) */}
      {/* Master SVG Filter for Real-time Image Processing */}
      <svg style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}>
        <filter id="aura-master-filter" colorInterpolationFilters="sRGB">
          {/* 1. Exposure & Brightness */}
          <feComponentTransfer id="f-exposure-brightness">
            <feFuncR type="linear" slope="1" intercept="0" />
            <feFuncG type="linear" slope="1" intercept="0" />
            <feFuncB type="linear" slope="1" intercept="0" />
          </feComponentTransfer>

          {/* 2. Contrast */}
          <feComponentTransfer id="f-contrast">
            <feFuncR type="linear" slope="1" intercept="0" />
            <feFuncG type="linear" slope="1" intercept="0" />
            <feFuncB type="linear" slope="1" intercept="0" />
          </feComponentTransfer>

          {/* 3. Tonal Adjustments (Highlights/Shadows/Whites/Blacks) */}
          <feComponentTransfer id="f-tonal">
            <feFuncR type="gamma" amplitude="1" exponent="1" offset="0" />
            <feFuncG type="gamma" amplitude="1" exponent="1" offset="0" />
            <feFuncB type="gamma" amplitude="1" exponent="1" offset="0" />
          </feComponentTransfer>

          {/* 4. Saturation & Vibrance */}
          <feColorMatrix id="f-saturation" type="saturate" values="1" />

          {/* 5. Warmth & Tint */}
          <feColorMatrix id="f-color-balance" type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0" />

        </filter>

        <filter id="f-sharpen-filter">
          <feConvolveMatrix 
            order="3" 
            preserveAlpha="true" 
            kernelMatrix="0 -1 0 -1 5 -1 0 -1 0" 
            divisor="1"
          />
        </filter>

        <filter id="grain-filter">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
          <feComposite operator="in" in2="SourceGraphic" />
        </filter>
      </svg>

      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {!isSidebarOpen && (
        <Button 
          variant="ghost" 
          size="icon" 
          className="fixed top-4 left-4 z-[100] bg-zinc-950/80 backdrop-blur-md border border-zinc-900 rounded-xl shadow-xl text-zinc-400 hover:text-white"
          onClick={() => setIsSidebarOpen(true)}
        >
          <Menu className="w-5 h-5" />
        </Button>
      )}

      {/* Sidebar Navigation */}
      <motion.aside 
        initial={false}
        animate={{ 
          width: isSidebarOpen ? 260 : 0,
          opacity: isSidebarOpen ? 1 : 0,
          x: isSidebarOpen ? 0 : -20
        }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="h-[100dvh] bg-zinc-950 border-r border-zinc-900 flex flex-col z-50 fixed lg:relative shrink-0 overflow-hidden shadow-2xl lg:shadow-none"
      >
        {/* Sidebar Header */}
        <div className="h-16 flex items-center px-4 border-b border-zinc-900 justify-between shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-yellow-600 rounded-lg flex items-center justify-center shadow-lg shadow-amber-500/20 overflow-hidden shrink-0">
              {userProfile?.plan === 'studio' && customLogo ? (
                <img src={customLogo} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <Sun className="w-5 h-5 text-white" />
              )}
            </div>
            <h1 className="text-sm font-bold tracking-tight text-white truncate">
              {userProfile?.plan === 'studio' && userProfile.displayName ? `${userProfile.displayName} Lab` : 'Aura Lab'}
            </h1>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-zinc-600 hover:text-white"
            onClick={() => setIsSidebarOpen(false)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>

        {/* Sidebar Content */}
        <div className="flex-1 py-6 px-3 space-y-2 overflow-y-auto overflow-x-hidden">
          <Button 
            variant="ghost" 
            className={`w-full justify-start h-11 px-3 ${activeTab === 'dashboard' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <LayoutDashboard className={`w-5 h-5 shrink-0 ${activeTab === 'dashboard' ? 'text-amber-500' : ''}`} />
            {isSidebarOpen && <span className="ml-3 text-xs font-bold uppercase tracking-wider">Dashboard</span>}
          </Button>

          <Button 
            variant="ghost" 
            className={`w-full justify-start h-11 px-3 ${activeTab === 'gallery' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'}`}
            onClick={() => setActiveTab('gallery')}
          >
            <ImageIcon className={`w-5 h-5 shrink-0 ${activeTab === 'gallery' ? 'text-amber-500' : ''}`} />
            {isSidebarOpen && <span className="ml-3 text-xs font-bold uppercase tracking-wider">Galería</span>}
          </Button>
          
          <Button 
            variant="ghost" 
            className={`w-full justify-start h-11 px-3 ${activeTab === 'editor' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'}`}
            onClick={() => setActiveTab('editor')}
          >
            <Settings2 className={`w-5 h-5 shrink-0 ${activeTab === 'editor' ? 'text-amber-500' : ''}`} />
            {isSidebarOpen && <span className="ml-3 text-xs font-bold uppercase tracking-wider">Editor</span>}
          </Button>

          <Button 
            variant="ghost" 
            className={`w-full justify-start h-11 px-3 ${activeTab === 'clients' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'}`}
            onClick={() => setActiveTab('clients')}
          >
            <Users className={`w-5 h-5 shrink-0 ${activeTab === 'clients' ? 'text-amber-500' : ''}`} />
            {isSidebarOpen && <span className="ml-3 text-xs font-bold uppercase tracking-wider">Clientes</span>}
          </Button>

          {userProfile?.role === 'admin' && (
            <>
              <Button 
                variant="ghost" 
                className={`w-full justify-start h-11 px-3 ${activeTab === 'admin' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'}`}
                onClick={() => setActiveTab('admin')}
              >
                <ShieldCheck className={`w-5 h-5 shrink-0 ${activeTab === 'admin' ? 'text-amber-500' : ''}`} />
                {isSidebarOpen && <span className="ml-3 text-xs font-bold uppercase tracking-wider">Admin Panel</span>}
              </Button>
              <Button 
                variant="ghost" 
                className={`w-full justify-start h-11 px-3 ${isBulkImportOpen ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'}`}
                onClick={() => setIsBulkImportOpen(true)}
              >
                <Database className={`w-5 h-5 shrink-0 ${isBulkImportOpen ? 'text-amber-500' : ''}`} />
                {isSidebarOpen && <span className="ml-3 text-xs font-bold uppercase tracking-wider">Planillas Admin</span>}
              </Button>
            </>
          )}

          <div className="pt-4 pb-2">
            <div className={`h-px bg-zinc-900 mx-2 ${isSidebarOpen ? 'mb-4' : 'mb-2'}`} />
            {isSidebarOpen && <p className="px-3 text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">Suscripción</p>}
          </div>

          <Button 
            variant="ghost" 
            className="w-full justify-start h-11 px-3 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50"
            onClick={() => setShowPricing(true)}
          >
            <Zap className="w-5 h-5 shrink-0 text-purple-500" />
            {isSidebarOpen && <span className="ml-3 text-xs font-bold uppercase tracking-wider">Planes</span>}
          </Button>
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-zinc-900 space-y-2">
          {user ? (
            <div className={`flex items-center gap-3 p-2 rounded-lg bg-zinc-900/30 border border-zinc-900/50 ${!isSidebarOpen ? 'justify-center' : ''}`}>
              <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 overflow-hidden">
                {user.photoURL ? (
                  <img src={user.photoURL} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <UserIcon className="w-4 h-4 text-zinc-500" />
                )}
              </div>
              {isSidebarOpen && (
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-white truncate">{user.displayName}</p>
                  <p className="text-[9px] text-zinc-500 uppercase tracking-tighter">Plan {userProfile?.plan || 'Free'}</p>
                </div>
              )}
              {isSidebarOpen && (
                <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-500 hover:text-red-400" onClick={() => logout()}>
                  <LogOut className="w-3 h-3" />
                </Button>
              )}
            </div>
          ) : (
            <Button 
              className="w-full bg-white text-black hover:bg-zinc-200 h-10 px-0"
              onClick={handleLogin}
            >
              <UserIcon className="w-4 h-4" />
              {isSidebarOpen && <span className="ml-2 text-[10px] font-bold uppercase">Entrar</span>}
            </Button>
          )}
          
          <Button 
            variant="ghost" 
            size="icon" 
            className="w-full h-8 text-zinc-600 hover:text-zinc-400"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          >
            {isSidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </Button>
          {isSidebarOpen && (
            <div className="mt-2 text-center">
              <span className="text-[9px] text-zinc-700 font-mono tracking-tighter">v1.3.1 PRO</span>
            </div>
          )}
        </div>
      </motion.aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-[100dvh] overflow-hidden relative">
        {showUpdateAvailable && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 flex items-center justify-between shrink-0 z-50">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Versión {latestVersion} Disponible</span>
            </div>
            <Button 
              variant="link" 
              className="h-auto p-0 text-[10px] text-zinc-300 underline font-bold"
              onClick={() => window.open('https://github.com/charlymonzon/aura-lab/actions', '_blank')}
            >
              Descargar Actualización
            </Button>
          </div>
        )}
        
        {/* Top Header (Minimal) */}
        <header className="h-16 border-b border-zinc-900 flex items-center justify-between px-4 md:px-8 bg-zinc-950/50 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-2 md:gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-9 w-9 text-zinc-500 hover:text-white lg:hidden"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            >
              <Layout className="w-5 h-5" />
            </Button>
            <h2 className="text-[10px] md:text-sm font-bold uppercase tracking-[0.1em] md:tracking-[0.3em] text-zinc-500 truncate max-w-[150px] md:max-w-none">
              {activeTab === 'gallery' ? 'Galería de Proyectos' : 'Laboratorio de Edición'}
            </h2>
          </div>
          
          <div className="flex items-center gap-2 md:gap-4">
            <Badge variant="outline" className="bg-zinc-900 border-zinc-800 text-zinc-500 font-mono text-[8px] md:text-[9px] px-1 md:px-2">
              v1.3.1
            </Badge>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto bg-zinc-950">
          <main className="container mx-auto px-4 md:px-8 py-8 md:py-12">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {activeTab === 'dashboard' ? (
                  <div className="space-y-12">
                    {!user ? (
                      /* Landing Page for non-logged users */
                      <div className="max-w-4xl mx-auto text-center space-y-8 py-12">
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] font-bold uppercase tracking-widest"
                        >
                          <Sparkles className="w-3 h-3" />
                          Tecnología Aura v1.3
                        </motion.div>
                        <h2 className="text-5xl md:text-7xl font-light tracking-tight text-white leading-tight">
                          La luz perfecta para cada <span className="text-amber-500 italic font-medium">fotografía</span>.
                        </h2>
                        <p className="text-zinc-400 text-lg max-w-2xl mx-auto leading-relaxed">
                          Aura Lab es el laboratorio digital definitivo para fotógrafos. Ajusta la iluminación, recupera sombras y realza detalles con precisión profesional.
                        </p>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
                          <Button 
                            size="lg" 
                            className="bg-white text-black hover:bg-zinc-200 h-14 px-8 text-sm font-bold uppercase tracking-wider"
                            onClick={handleLogin}
                          >
                            Empezar Gratis
                          </Button>
                          <Button 
                            size="lg" 
                            variant="outline" 
                            className="border-zinc-800 text-zinc-400 hover:bg-zinc-900 h-14 px-8 text-sm font-bold uppercase tracking-wider"
                            onClick={() => setShowPricing(true)}
                          >
                            Ver Planes
                          </Button>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-12">
                          {[
                            { icon: Sun, title: "Luz Natural", desc: "Algoritmos que respetan la física de la luz." },
                            { icon: Zap, title: "Procesado Rápido", desc: "Resultados instantáneos en alta resolución." },
                            { icon: ShieldCheck, title: "Galería Privada", desc: "Tus proyectos seguros y siempre disponibles." }
                          ].map((feature, i) => (
                            <div key={i} className="p-6 rounded-2xl bg-zinc-900/30 border border-zinc-900 space-y-3">
                              <feature.icon className="w-6 h-6 text-amber-500 mx-auto" />
                              <h4 className="text-white font-bold text-sm uppercase tracking-wider">{feature.title}</h4>
                              <p className="text-zinc-500 text-xs leading-relaxed">{feature.desc}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      /* Dashboard for logged users */
                      <div className="space-y-12">
                        {/* Dashboard Stats */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <Card 
                            className="bg-zinc-900/50 border-zinc-800 p-4 cursor-pointer hover:bg-zinc-800/50 transition-all hover:scale-[1.02] active:scale-[0.98]"
                            onClick={() => setActiveTab('gallery')}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                                <ImageIcon className="w-5 h-5 text-amber-500" />
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Total Fotos</p>
                                <p className="text-xl font-bold text-white">{stats.totalPhotos}</p>
                                <p className="text-[8px] text-amber-500/70 font-bold uppercase mt-1">Entrar a Galería →</p>
                              </div>
                            </div>
                          </Card>
                          <Card 
                            className="bg-zinc-900/50 border-zinc-800 p-4 cursor-pointer hover:bg-zinc-800/50 transition-all hover:scale-[1.02] active:scale-[0.98]"
                            onClick={() => setShowStorageModal(true)}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                                <HardDrive className="w-5 h-5 text-blue-500" />
                              </div>
                              <div className="flex-1">
                                <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Espacio</p>
                                <div className="flex items-end justify-between">
                                  <p className="text-xl font-bold text-white">{(stats.storageUsed / (1024 * 1024)).toFixed(1)}MB</p>
                                  <p className="text-[9px] text-zinc-500 mb-1">de {userProfile?.plan === 'studio' ? '1TB' : userProfile?.plan === 'pro' ? '50GB' : '2GB'}</p>
                                </div>
                                <div className="mt-2 h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-blue-500 transition-all duration-500" 
                                    style={{ 
                                      width: `${Math.min(100, (stats.storageUsed / stats.capacity) * 100)}%` 
                                    }} 
                                  />
                                </div>
                                <p className="text-[8px] text-blue-500/70 font-bold uppercase mt-1">Ver Almacenamiento →</p>
                              </div>
                            </div>
                          </Card>
                          <Card 
                            className="bg-zinc-900/50 border-zinc-800 p-4 cursor-pointer hover:bg-zinc-800/50 transition-all hover:scale-[1.02] active:scale-[0.98]"
                            onClick={() => setActiveTab('clients')}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                                <Users className="w-5 h-5 text-purple-500" />
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Clientes</p>
                                <p className="text-xl font-bold text-white">{stats.totalClients}</p>
                                <p className="text-[8px] text-purple-500/70 font-bold uppercase mt-1">Gestionar Clientes →</p>
                              </div>
                            </div>
                          </Card>
                          <Card className="bg-zinc-900/50 border-zinc-800 p-4 cursor-pointer hover:bg-zinc-800/50 transition-all hover:scale-[1.02] active:scale-[0.98]" onClick={() => setActiveTab('clients')}>
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                                <Eye className="w-5 h-5 text-green-500" />
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Galerías</p>
                                <p className="text-xl font-bold text-white">{stats.totalGalleries}</p>
                                <p className="text-[8px] text-green-500/70 font-bold uppercase mt-1">Ver Públicas →</p>
                              </div>
                            </div>
                          </Card>
                        </div>

                        {/* Upload Section */}
                        <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-12 text-center space-y-6">
                          <div className="space-y-2">
                            <h3 className="text-2xl font-bold text-white">Tu Laboratorio de Luz</h3>
                            <p className="text-zinc-400 text-sm max-w-md mx-auto">
                              Sube tus fotografías para empezar a ajustar la iluminación con tecnología Aura.
                            </p>
                          </div>
                          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-lg mx-auto">
                            <input 
                              type="text" 
                              placeholder="Pega el enlace de tu foto aquí..." 
                              className="flex-1 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-amber-500 transition-colors"
                              value={newPhotoUrl}
                              onChange={(e) => setNewPhotoUrl(e.target.value)}
                            />
                            <Button onClick={handleUrlAdd} className="w-full sm:w-auto bg-amber-600 hover:bg-amber-500 text-white h-11 px-6">
                              <Plus className="w-4 h-4 mr-2" />
                              Añadir Foto
                            </Button>
                          </div>
                          <div className="flex items-center justify-center gap-4 text-[10px] text-zinc-600 font-bold uppercase tracking-widest">
                            <span>O</span>
                            <div className="h-px w-8 bg-zinc-800" />
                            <button 
                              onClick={() => fileInputRef.current?.click()}
                              className="text-amber-500 hover:text-amber-400 transition-colors"
                            >
                              Subir archivo local
                            </button>
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*,.arw,.cr2,.nef,.dng,.orf,.raf" onChange={handleFileUpload} />
                          </div>

                          {isUploading && (
                            <div className="max-w-md mx-auto space-y-2 pt-4">
                              <div className="flex items-center justify-between text-[10px] uppercase font-bold text-amber-500">
                                <span className="flex items-center gap-2">
                                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }}>
                                    <RotateCcw className="w-3 h-3" />
                                  </motion.div>
                                  {uploadProgress < 100 ? "Subiendo archivo..." : "Procesando imagen..."}
                                </span>
                                <span>{Math.round(uploadProgress)}%</span>
                              </div>
                              <Progress value={isNaN(uploadProgress) ? 0 : uploadProgress} className="h-1 bg-zinc-800" />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : activeTab === 'gallery' ? (
                  /* Gallery View */
                  <div className="space-y-8">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <h3 className="text-2xl font-bold text-white">Tu Galería</h3>
                        <p className="text-zinc-500 text-sm">Gestiona y edita tus capturas.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="cursor-pointer">
                          <Button variant="outline" className="border-zinc-800 text-zinc-400 hover:bg-zinc-900">
                            <FileJson className="w-4 h-4 mr-2" />
                            Importar Lightroom
                          </Button>
                          <input type="file" className="hidden" accept=".lrcat" onChange={handleLightroomImport} />
                        </label>
                        <Button 
                          variant="outline" 
                          className="border-zinc-800 text-zinc-400 hover:bg-zinc-900"
                          onClick={() => setActiveTab('dashboard')}
                        >
                          <LayoutDashboard className="w-4 h-4 mr-2" />
                          Dashboard
                        </Button>
                      </div>
                    </div>

                    {/* Folders Bar */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                      <Button
                        variant={selectedFolderId === null ? "default" : "outline"}
                        size="sm"
                        className={`rounded-full px-6 ${selectedFolderId === null ? 'bg-amber-600 hover:bg-amber-500' : 'border-zinc-800 text-zinc-400'}`}
                        onClick={() => setSelectedFolderId(null)}
                      >
                        Todas
                      </Button>
                      {folders.map(folder => (
                        <Button
                          key={folder.id}
                          variant={selectedFolderId === folder.id ? "default" : "outline"}
                          size="sm"
                          className={`rounded-full px-6 ${selectedFolderId === folder.id ? 'bg-amber-600 hover:bg-amber-500' : 'border-zinc-800 text-zinc-400'}`}
                          onClick={() => setSelectedFolderId(folder.id)}
                        >
                          <FolderIcon className="w-3.5 h-3.5 mr-2" />
                          {folder.name}
                        </Button>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-full px-4 text-zinc-500 hover:text-amber-500 hover:bg-amber-500/10"
                        onClick={() => setShowCreateFolder(true)}
                      >
                        <FolderPlus className="w-4 h-4 mr-2" />
                        Nueva Carpeta
                      </Button>

                      <div className="flex items-center gap-2 ml-auto">
                        {selectedPhotoIds.length > 0 && (
                          <>
                            <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mr-2">
                              {selectedPhotoIds.length} seleccionadas
                            </span>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-[10px] uppercase font-bold text-zinc-500 hover:text-white"
                              onClick={clearSelection}
                            >
                              Deseleccionar
                            </Button>
                          </>
                        )}
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="rounded-full px-4 border-zinc-800 text-zinc-400 hover:text-white"
                          onClick={selectAllPhotos}
                        >
                          Seleccionar Todo
                        </Button>
                      </div>
                    </div>

                    {/* Search & Smart Filters */}
                    <div className="flex flex-col md:flex-row gap-4 bg-zinc-900/40 p-2 rounded-xl border border-zinc-900/50 backdrop-blur-sm">
                      <div className="relative flex-1 group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 group-focus-within:text-amber-500 transition-colors" />
                        <input 
                          type="text" 
                          placeholder="Buscar por título, etiquetas o metadata..." 
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-amber-500/50 transition-all opacity-80 focus:opacity-100"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                      </div>
                      <div className="flex items-center gap-2 overflow-x-auto pr-2">
                        <Button 
                          variant="ghost" size="sm" 
                          className={`text-[9px] uppercase font-bold tracking-widest gap-2 h-8 ${searchQuery === ':pick' ? 'text-green-500 bg-green-500/5' : 'text-zinc-500'}`}
                          onClick={() => setSearchQuery(prev => prev === ':pick' ? '' : ':pick')}
                        >
                          <Flag className="w-3 h-3 fill-current" /> Pick
                        </Button>
                        <Button 
                          variant="ghost" size="sm" 
                          className={`text-[9px] uppercase font-bold tracking-widest gap-2 h-8 ${searchQuery === ':reject' ? 'text-red-500 bg-red-500/5' : 'text-zinc-500'}`}
                          onClick={() => setSearchQuery(prev => prev === ':reject' ? '' : ':reject')}
                        >
                          <XCircle className="w-3 h-3" /> Reject
                        </Button>
                        <div className="w-px h-4 bg-zinc-800 mx-1" />
                        {(['red', 'yellow', 'green', 'blue', 'purple'] as Photo['colorTag'][]).map(color => (
                          <button 
                            key={color}
                            className={`w-3 h-3 rounded-full hover:scale-150 transition-all border border-black/20 ${searchQuery === `:${color}` ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-950 scale-125' : ''}`}
                            style={{ backgroundColor: color }}
                            onClick={() => setSearchQuery(prev => prev === `:${color}` ? '' : `:${color}`)}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Gallery Grid */}
                    <div className="space-y-6 relative">
                      {/* Floating Multi-select Actions */}
                      <AnimatePresence>
                        {selectedPhotoIds.length > 0 && (
                          <motion.div 
                            initial={{ opacity: 0, y: 50 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 50 }}
                            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 rounded-2xl p-4 shadow-2xl flex items-center gap-6 min-w-[400px]"
                          >
                            <div className="flex items-center gap-3 pr-6 border-r border-zinc-800">
                              <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center text-black font-bold text-xs">
                                {selectedPhotoIds.length}
                              </div>
                              <span className="text-xs font-bold text-white uppercase tracking-widest">Fotos Seleccionadas</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className={`h-9 text-[10px] uppercase font-bold tracking-widest ${copiedSettings ? 'text-amber-500 hover:bg-amber-500/10' : 'text-zinc-600 cursor-not-allowed'}`}
                                onClick={() => pasteSettings()}
                                disabled={!copiedSettings}
                              >
                                <ClipboardPaste className="w-3.5 h-3.5 mr-2" />
                                Pegar Ajustes
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-9 text-[10px] uppercase font-bold tracking-widest text-zinc-400 hover:text-white"
                                onClick={() => {
                                  toast.info("Iniciando exportación por lotes...");
                                  // We'll implement this logic
                                  handleBatchExport();
                                }}
                              >
                                <Download className="w-3.5 h-3.5 mr-2" />
                                Exportar
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-9 text-[10px] uppercase font-bold tracking-widest text-zinc-400 hover:text-white"
                                onClick={bulkDeletePhotos}
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-2" />
                                Borrar
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-9 text-[10px] uppercase font-bold tracking-widest text-zinc-400 hover:text-white"
                                onClick={clearSelection}
                              >
                                Cancelar
                              </Button>

                              <Dialog open={isCreateGalleryOpen} onOpenChange={setIsCreateGalleryOpen}>
                                <DialogTrigger
                                  className="inline-flex items-center justify-center rounded-md text-[10px] uppercase font-black tracking-[0.2em] bg-amber-600 hover:bg-amber-500 text-white h-9 px-3 ml-2 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                                >
                                  <Eye className="w-3.5 h-3.5 mr-2" />
                                  Crear Galería
                                </DialogTrigger>
                                <DialogContent className="bg-zinc-950 border-zinc-800 text-white">
                                  <DialogHeader>
                                    <DialogTitle className="text-xl font-black uppercase tracking-widest italic">Nueva Galería <span className="text-amber-500">Privada</span></DialogTitle>
                                    <DialogDescription className="text-zinc-500">
                                      Comparte estas {selectedPhotoIds.length} fotos con un cliente.
                                    </DialogDescription>
                                  </DialogHeader>
                                  <div className="space-y-6 py-6">
                                    <div className="space-y-2">
                                      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Título de la Sesión</label>
                                      <input 
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-sm focus:outline-none focus:border-amber-500" 
                                        placeholder="Ej: Boda de Ana y Luis"
                                        value={newGalleryData.title}
                                        onChange={e => setNewGalleryData({...newGalleryData, title: e.target.value})}
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Seleccionar Cliente</label>
                                      <select 
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-sm focus:outline-none focus:border-amber-500 appearance-none text-zinc-400"
                                        value={newGalleryData.clientId}
                                        onChange={e => setNewGalleryData({...newGalleryData, clientId: e.target.value})}
                                      >
                                        <option value="">-- Elige un cliente --</option>
                                        {clients.map(c => (
                                          <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                  <DialogFooter>
                                    <Button variant="outline" onClick={() => setIsCreateGalleryOpen(false)}>Cancelar</Button>
                                    <Button 
                                      className="bg-amber-600 hover:bg-amber-500 text-white" 
                                      onClick={handleCreateGallery}
                                    >
                                      Publicar Galería
                                    </Button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {filteredPhotos.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-32">
                          {filteredPhotos.map((photo) => (
                            <motion.div
                              key={photo.id}
                              layoutId={photo.id}
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              className={`group relative aspect-[4/5] bg-zinc-900 rounded-xl overflow-hidden border transition-all shadow-2xl ${selectedPhotoIds.includes(photo.id) ? 'border-amber-500 ring-1 ring-amber-500' : 'border-zinc-800 hover:border-amber-500/50'}`}
                            >
                              <div className="w-full h-full relative">
                                {/* Selection Checkbox */}
                                <div 
                                  className={`absolute top-3 left-3 z-20 w-5 h-5 rounded-full border flex items-center justify-center cursor-pointer transition-all ${selectedPhotoIds.includes(photo.id) ? 'bg-amber-500 border-amber-500' : 'bg-black/40 border-white/20 hover:border-white/50'}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    togglePhotoSelection(photo.id);
                                  }}
                                >
                                  {selectedPhotoIds.includes(photo.id) && <CheckCircle2 className="w-3.5 h-3.5 text-black" />}
                                </div>

                                {/* Rating and Color Tag Overlay */}
                                <div className="absolute bottom-3 left-3 right-3 z-20 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                                  <div className="flex items-center gap-0.5 bg-black/60 backdrop-blur-md rounded-full px-2 py-1 border border-white/10">
                                    {[1, 2, 3, 4, 5].map((star) => (
                                      <Star 
                                        key={star}
                                        className={`w-3 h-3 cursor-pointer transition-colors ${star <= (photo.rating || 0) ? 'text-amber-500 fill-amber-500' : 'text-zinc-500 hover:text-zinc-300'}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          updatePhotoRating(photo.id, star === photo.rating ? 0 : star);
                                        }}
                                      />
                                    ))}
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    {['red', 'yellow', 'green', 'blue', 'purple'].map((color) => (
                                      <div 
                                        key={color}
                                        className={`w-2.5 h-2.5 rounded-full cursor-pointer border border-white/20 transition-transform hover:scale-125 ${photo.colorTag === color ? 'ring-2 ring-white scale-110' : ''}`}
                                        style={{ 
                                          backgroundColor: color === 'red' ? '#ef4444' : 
                                                           color === 'yellow' ? '#f59e0b' : 
                                                           color === 'green' ? '#10b981' : 
                                                           color === 'blue' ? '#3b82f6' : '#a855f7' 
                                        }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          updatePhotoColorTag(photo.id, color === photo.colorTag ? 'none' : color as any);
                                        }}
                                      />
                                    ))}
                                  </div>
                                </div>

                                {(photo.thumbnailUrl && !/\.(arw|cr2|nef|dng|orf|raf)$/i.test(photo.thumbnailUrl)) || !/\.(arw|cr2|nef|dng|orf|raf)$/i.test(photo.url) ? (
                                  <img 
                                    src={fixImageUrl(photo.thumbnailUrl || photo.url)} 
                                    alt={photo.title}
                                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                    style={{ 
                                      filter: getFilterString(photo.settings),
                                      transform: `rotate(${photo.settings.rotation}deg) scaleX(${photo.settings.flipX ? -1 : 1}) scaleY(${photo.settings.flipY ? -1 : 1})`
                                    }}
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-800 text-zinc-500">
                                    <ImageIcon className="w-12 h-12 mb-2 opacity-20" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">RAW File</span>
                                    <span className="text-[8px] opacity-50 mt-1">Generando miniatura...</span>
                                  </div>
                                )}
                                {/* Color Balance Overlays for Gallery */}
                                <div className="absolute inset-0 pointer-events-none mix-blend-soft-light opacity-60" style={{ backgroundColor: photo.settings.shadowTint }} />
                                <div className="absolute inset-0 pointer-events-none mix-blend-overlay opacity-50" style={{ backgroundColor: photo.settings.midtoneTint }} />
                                <div className="absolute inset-0 pointer-events-none mix-blend-color opacity-40" style={{ backgroundColor: photo.settings.highlightTint }} />
                              </div>
                              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                                <h5 className="text-white font-bold text-sm mb-1">{photo.title}</h5>
                                <div className="flex items-center gap-2">
                                  <Button 
                                    size="sm" 
                                    className="flex-1 bg-white text-black hover:bg-zinc-200 h-8 text-[10px] uppercase font-bold"
                                    onClick={() => {
                                      setSelectedPhotoId(photo.id);
                                      setActiveTab('editor');
                                    }}
                                  >
                                    Editar Luz
                                  </Button>
                                  <Button 
                                    size="icon" 
                                    variant="destructive" 
                                    className="h-8 w-8 shadow-lg shadow-red-900/20"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPhotoToDeleteId(photo.id);
                                      setIsDeleteDialogOpen(true);
                                    }}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                              {/* Quick Delete Button (Always Visible on Mobile/Small Screens) */}
                              <button 
                                className="absolute top-2 right-2 p-2 bg-black/50 backdrop-blur-md rounded-full text-white/50 hover:text-red-500 sm:hidden transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPhotoToDeleteId(photo.id);
                                  setIsDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </motion.div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-32 border-2 border-dashed border-zinc-900 rounded-3xl">
                          <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mx-auto mb-6">
                            <ImageIcon className="w-8 h-8 text-zinc-700" />
                          </div>
                          <h4 className="text-white font-bold text-lg mb-2">Tu galería está vacía</h4>
                          <p className="text-zinc-500 text-sm max-w-xs mx-auto">
                            Empieza subiendo tu primera fotografía para verla aquí.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : activeTab === 'clients' ? (
                  /* Clients CRM View */
                  <div className="space-y-8">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <h3 className="text-2xl font-bold text-white uppercase tracking-tight">Clientes <span className="text-amber-500 italic">CRM</span></h3>
                        <p className="text-zinc-500 text-sm">Gestiona tus contactos y sesiones de fotos.</p>
                      </div>
                      <Dialog open={isCreateClientOpen} onOpenChange={setIsCreateClientOpen}>
                        <DialogTrigger
                          className="inline-flex items-center justify-center rounded-md bg-amber-600 hover:bg-amber-500 text-white gap-2 font-bold uppercase tracking-widest text-xs h-10 px-6 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                          onClick={() => {
                            setSelectedClientId(null);
                            setNewClientData({ name: '', email: '', notes: '' });
                          }}
                        >
                          <UserPlus className="w-4 h-4" /> Nuevo Cliente
                        </DialogTrigger>
                        <DialogContent className="bg-zinc-950 border-zinc-800 text-white">
                          <DialogHeader>
                            <DialogTitle className="text-xl font-bold uppercase tracking-widest italic">
                              {selectedClientId ? 'Editar Perfil' : 'Nuevo Cliente'}
                            </DialogTitle>
                            <DialogDescription className="text-zinc-500">
                              {selectedClientId ? 'Modifica los datos del contacto.' : 'Agrega los datos de contacto para tus galerías.'}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Nombre Completo</label>
                              <input 
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-sm focus:outline-none focus:border-amber-500" 
                                placeholder="Ej: Juan Pérez"
                                value={newClientData.name}
                                onChange={e => setNewClientData({...newClientData, name: e.target.value})}
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Correo Electrónico</label>
                              <input 
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-sm focus:outline-none focus:border-amber-500" 
                                placeholder="email@ejemplo.com"
                                value={newClientData.email}
                                onChange={e => setNewClientData({...newClientData, email: e.target.value})}
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Notas Privadas</label>
                              <textarea 
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-sm focus:outline-none focus:border-amber-500 h-24" 
                                placeholder="Detalles de la sesión, precios, etc."
                                value={newClientData.notes}
                                onChange={e => setNewClientData({...newClientData, notes: e.target.value})}
                              />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setIsCreateClientOpen(false)}>Cancelar</Button>
                            <Button className="bg-amber-600 hover:bg-amber-500 text-white" onClick={handleCreateClient}>
                              {selectedClientId ? 'Actualizar' : 'Guardar Cliente'}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>

                    <div className="flex flex-col md:flex-row gap-6">
                      {/* Search and List */}
                      <div className="w-full md:w-80 space-y-4">
                        <div className="relative group">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 group-focus-within:text-amber-500 transition-colors" />
                          <input 
                            type="text" 
                            placeholder="Buscar clientes..." 
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-amber-500/50"
                            value={clientSearchQuery}
                            onChange={e => setClientSearchQuery(e.target.value)}
                          />
                        </div>
                        <ScrollArea className="h-[600px] pr-4">
                          <div className="space-y-2">
                            {filteredClients.length > 0 ? filteredClients.map(client => (
                              <Card 
                                key={client.id} 
                                className={`bg-zinc-900 border-zinc-800 p-4 cursor-pointer transition-all ${selectedClientId === client.id ? 'border-amber-500 bg-amber-500/5' : 'hover:border-zinc-700'}`}
                                onClick={() => setSelectedClientId(client.id)}
                              >
                                <h4 className="font-bold text-white">{client.name}</h4>
                                <p className="text-xs text-zinc-500 truncate">{client.email || 'Sin email'}</p>
                                <div className="flex items-center gap-2 mt-2">
                                  <Badge className="text-[8px] bg-amber-500/10 text-amber-500 border-none uppercase font-bold tracking-widest">Activo</Badge>
                                </div>
                              </Card>
                            )) : (
                              <div className="text-center py-12 bg-zinc-900/10 border border-dashed border-zinc-800 rounded-lg">
                                <p className="text-zinc-600 text-[10px] uppercase font-bold tracking-widest leading-relaxed">No hay clientes aún.<br/>Empieza creando uno nuevo.</p>
                              </div>
                            )}
                          </div>
                        </ScrollArea>
                      </div>

                      {/* Detail View */}
                      <div className="flex-1 rounded-2xl bg-zinc-950/50 border border-zinc-900 min-h-[600px] overflow-hidden">
                        {selectedClientId ? (
                          <div className="p-8 space-y-8 h-full">
                            {(() => {
                              const client = clients.find(c => c.id === selectedClientId);
                              const clientGalleries = galleries.filter(g => g.clientId === selectedClientId);
                              return (
                                <>
                                  <div className="flex items-center justify-between border-b border-zinc-900 pb-8">
                                    <div className="space-y-1">
                                      <h3 className="text-3xl font-black text-white">{client?.name}</h3>
                                      <p className="text-zinc-500 text-sm">{client?.email}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <Button 
                                        variant="outline" 
                                        className="border-zinc-800 h-10 hover:bg-zinc-900 transition-colors"
                                        onClick={() => {
                                          if (selectedClient) {
                                            setNewClientData({
                                              name: selectedClient.name,
                                              email: selectedClient.email || '',
                                              notes: selectedClient.notes || ''
                                            });
                                            setIsCreateClientOpen(true);
                                          }
                                        }}
                                      >
                                        <Edit2 className="w-3.5 h-3.5 mr-2" />
                                        Editar Perfil
                                      </Button>
                                      <Button 
                                        className="bg-amber-500 hover:bg-amber-600 text-black font-bold h-10"
                                        onClick={() => {
                                          setNewGalleryData({ title: '', clientId: selectedClientId! });
                                          setIsCreateGalleryOpen(true);
                                        }}
                                      >
                                        <Plus className="w-3.5 h-3.5 mr-2" />
                                        Entregar Galería
                                      </Button>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                      <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Notas del Cliente</h4>
                                      <div className="bg-zinc-900/50 p-6 rounded-xl border border-zinc-900 text-sm text-zinc-400 leading-relaxed italic">
                                        {client?.notes || "Sin notas registradas."}
                                      </div>
                                    </div>

                                    <div className="space-y-4">
                                      <div className="flex items-center justify-between">
                                        <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Galerías Entregadas</h4>
                                        <Badge className="bg-blue-500/10 text-blue-500 border-none px-3 font-bold">{clientGalleries.length}</Badge>
                                      </div>
                                      
                                      <div className="space-y-3">
                                        {clientGalleries.length > 0 ? clientGalleries.map(gal => (
                                          <div key={gal.id} className="flex items-center justify-between p-4 bg-zinc-900 border border-zinc-800 rounded-xl group hover:border-amber-500/50 transition-all">
                                            <div className="flex items-center gap-4">
                                              <div className="w-12 h-12 rounded bg-zinc-950 flex items-center justify-center border border-zinc-800">
                                                <ImageIcon className="w-5 h-5 text-zinc-700" />
                                              </div>
                                              <div>
                                                <p className="text-sm font-bold text-white">{gal.title}</p>
                                                <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">{gal.photoIds.length} Fotos</p>
                                              </div>
                                            </div>
                                            <Button 
                                              variant="ghost" 
                                              size="icon" 
                                              className="text-zinc-600 hover:text-amber-500"
                                              onClick={() => window.open(`/gallery/${gal.slug}`, '_blank')}
                                            >
                                              <ExternalLink className="w-4 h-4" />
                                            </Button>
                                          </div>
                                        )) : (
                                          <div className="p-12 text-center bg-zinc-900/20 border border-dashed border-zinc-900 rounded-xl">
                                            <p className="text-[10px] font-black text-zinc-700 uppercase tracking-widest">No hay galerías aún</p>
                                            <Button 
                                              size="sm" 
                                              variant="link" 
                                              className="text-amber-500 text-[10px] font-black uppercase mt-2 h-auto p-0"
                                              onClick={() => setActiveTab('gallery')}
                                            >
                                              Ir a Galería →
                                            </Button>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center p-12 text-center text-zinc-600 h-full">
                            <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mb-6">
                              <Users className="w-8 h-8 opacity-20" />
                            </div>
                            <h4 className="font-bold uppercase tracking-widest text-xs text-zinc-500">Selecciona un cliente</h4>
                            <p className="max-w-xs text-[10px] mt-2 leading-relaxed uppercase tracking-wide opacity-50 font-bold">Aquí podrás ver el historial de sesiones, archivos entregados y notas privadas de cada cliente.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : activeTab === 'admin' ? (
                  /* Admin Dashboard View */
                  <div className="space-y-10">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <h3 className="text-2xl font-bold text-white uppercase tracking-tight">Admin <span className="text-amber-500 italic">Panel</span></h3>
                        <p className="text-zinc-500 text-sm">Control central de Aura Lab.</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge className={`px-3 py-1 ${systemConfig?.gemini_ai ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'} border-none text-[8px] font-black uppercase tracking-widest`}>
                          AI: {systemConfig?.gemini_ai ? 'Online' : 'Offline'}
                        </Badge>
                        <Badge className={`px-3 py-1 ${systemConfig?.mercadopago ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'} border-none text-[8px] font-black uppercase tracking-widest`}>
                          MP: {systemConfig?.mercadopago ? 'Online' : 'Offline'}
                        </Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <Card className="bg-zinc-900 border-zinc-800 p-6">
                        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Usuarios Totales</p>
                        <h4 className="text-3xl font-black text-white">{allUsers.length}</h4>
                      </Card>
                      <Card className="bg-zinc-900 border-zinc-800 p-6">
                        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Plan Pro / Studio</p>
                        <h4 className="text-3xl font-black text-amber-500">
                          {allUsers.filter(u => u.plan !== 'free').length}
                        </h4>
                      </Card>
                      <Card className="bg-zinc-900 border-zinc-800 p-6">
                        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Estado del Servidor</p>
                        <h4 className="text-3xl font-black text-blue-500 uppercase tracking-tighter">{systemConfig?.env || '...'}</h4>
                      </Card>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest">Lista de Usuarios</h4>
                      <Card className="bg-zinc-900 border-zinc-800 overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-zinc-950 text-zinc-500 uppercase font-black tracking-widest">
                            <tr>
                              <th className="px-6 py-4">Usuario</th>
                              <th className="px-6 py-4">Email</th>
                              <th className="px-6 py-4">Plan</th>
                              <th className="px-6 py-4">Registro</th>
                              <th className="px-6 py-4 text-right">Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800">
                            {allUsers.map((u) => (
                              <tr key={u.uid} className="hover:bg-zinc-800/50 transition-colors">
                                <td className="px-6 py-4 font-bold text-zinc-300">{u.displayName}</td>
                                <td className="px-6 py-4 text-zinc-500">{u.email}</td>
                                <td className="px-6 py-4">
                                  <Badge className={`
                                    ${u.plan === 'studio' ? 'bg-purple-500/10 text-purple-500' : 
                                      u.plan === 'pro' ? 'bg-amber-500/10 text-amber-500' : 
                                      'bg-zinc-800 text-zinc-500'} 
                                    border-none text-[8px] font-black uppercase tracking-widest px-2
                                  `}>
                                    {u.plan}
                                  </Badge>
                                </td>
                                <td className="px-6 py-4 text-zinc-600">
                                  {new Date(u.createdAt).toLocaleDateString()}
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <Button variant="ghost" size="sm" className="h-7 text-[10px] uppercase font-black text-zinc-500 hover:text-white">
                                    Gestionar
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </Card>
                    </div>
                  </div>
                ) : (
          /* Editor View (Lightroom Style) */
          <div className="fixed inset-0 top-16 bg-zinc-950 flex flex-col overflow-hidden z-40">
            {/* Top Toolbar */}
            <div className="min-h-14 border-b border-zinc-900 bg-zinc-950/50 backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between px-4 sm:px-6 py-2 sm:py-0 gap-3 z-20">
              <div className="flex items-center gap-3 sm:gap-6 overflow-hidden">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-zinc-400 hover:text-white gap-2 px-0 h-8 sm:h-auto"
                  onClick={() => {
                    setSelectedPhotoId(null);
                    setActiveTab('gallery');
                  }}
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="hidden xs:inline">Biblioteca</span>
                </Button>
                <div className="h-4 w-[1px] bg-zinc-800" />
                <div className="flex items-center gap-2 group min-w-0">
                  <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[9px] sm:text-[10px] uppercase font-black shrink-0">Revelar</Badge>
                  <div className="relative flex items-center min-w-0">
                    <input 
                      type="text"
                      value={selectedPhoto?.title || ""}
                      onChange={(e) => selectedPhoto && updatePhotoTitle(selectedPhoto.id, e.target.value)}
                      className="text-[10px] sm:text-xs font-bold text-zinc-300 uppercase tracking-widest bg-transparent border-none focus:ring-0 focus:outline-none hover:text-white transition-colors w-full sm:w-64 pr-6 truncate"
                      placeholder="Sin título"
                    />
                    <Edit2 className="w-3 h-3 text-zinc-600 absolute right-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
                <Button 
                  variant={isComparing ? "default" : "outline"} 
                  size="sm" 
                  className={`h-8 flex-shrink-0 ${isComparing ? 'bg-amber-500 text-black hover:bg-amber-600' : 'border-zinc-800 text-zinc-400 hover:text-white'} text-[10px] uppercase font-bold tracking-widest gap-2`}
                  onClick={() => setIsComparing(!isComparing)}
                >
                  <Split className="w-3 h-3" />
                  <span className="hidden lg:inline">{isComparing ? 'Viendo' : 'Comparar'}</span>
                </Button>

                <Button 
                  variant={isCropping ? "default" : "outline"} 
                  size="sm" 
                  className={`h-8 flex-shrink-0 ${isCropping ? 'bg-amber-500 text-black hover:bg-amber-600' : 'border-zinc-800 text-zinc-400 hover:text-white'} text-[10px] uppercase font-bold tracking-widest gap-2`}
                  onClick={() => setIsCropping(!isCropping)}
                >
                  <Crop className="w-3 h-3" />
                  <span className="hidden lg:inline">{isCropping ? 'Listo' : 'Recortar'}</span>
                </Button>

                <div className="h-4 w-px bg-zinc-800 shrink-0" />

                {/* Flags & Colors */}
                <div className="flex items-center gap-1 bg-zinc-900 rounded-lg p-0.5 px-1 shrink-0">
                  <Button 
                    variant="ghost" size="icon" className={`h-7 w-7 ${selectedPhoto?.flag === 'pick' ? 'text-green-500 bg-green-500/10' : 'text-zinc-500'}`}
                    onClick={() => selectedPhoto && setPhotoFlag(selectedPhoto.id, selectedPhoto.flag === 'pick' ? 'none' : 'pick')}
                  >
                    <Flag className="w-3.5 h-3.5 fill-current" />
                  </Button>
                  <Button 
                    variant="ghost" size="icon" className={`h-7 w-7 ${selectedPhoto?.flag === 'reject' ? 'text-red-500 bg-red-500/10' : 'text-zinc-500'}`}
                    onClick={() => selectedPhoto && setPhotoFlag(selectedPhoto.id, selectedPhoto.flag === 'reject' ? 'none' : 'reject')}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                  </Button>
                  
                  <div className="h-4 w-px bg-zinc-800 mx-1" />
                  
                  {(['red', 'yellow', 'green', 'blue', 'purple'] as Photo['colorTag'][]).map(color => (
                    <button 
                      key={color}
                      className={`w-3 h-3 rounded-full transition-transform hover:scale-125 ${
                        selectedPhoto?.colorTag === color ? 'ring-2 ring-white ring-offset-2 ring-offset-black' : ''
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => selectedPhoto && setPhotoColor(selectedPhoto.id, selectedPhoto.colorTag === color ? 'none' : color)}
                    />
                  ))}
                </div>

                <div className="h-4 w-px bg-zinc-800 shrink-0" />

                {/* Copy/Paste */}
                <div className="flex items-center gap-1 shrink-0">
                  <Button 
                    variant="ghost" size="sm" className="h-8 text-[10px] text-zinc-500 uppercase font-black px-2"
                    onClick={() => selectedPhoto && copySettings(selectedPhoto.settings)}
                  >
                    Copiar
                  </Button>
                  <Button 
                    variant="ghost" size="sm" className={`h-8 text-[10px] uppercase font-black px-2 ${copiedSettings ? 'text-amber-500' : 'text-zinc-700 disabled'}`}
                    onClick={() => selectedPhoto && pasteSettings(selectedPhoto.id)}
                    disabled={!copiedSettings}
                  >
                    Pegar
                  </Button>
                  {selectedPhotoIds.length > 1 && (
                    <Button 
                      variant="outline" size="sm" className="h-8 border-amber-500/50 text-amber-500 text-[10px] uppercase font-black animate-pulse px-2"
                      onClick={syncSettingsToSelected}
                    >
                      Sincro ({selectedPhotoIds.length})
                    </Button>
                  )}
                </div>

                <div className="h-4 w-px bg-zinc-800 shrink-0" />

                <div className="flex items-center bg-zinc-900 rounded-lg p-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-500 hover:text-white" onClick={() => setZoom(z => Math.max(0.1, z - 0.1))}><ZoomOut className="w-3.5 h-3.5" /></Button>
                  <span className="text-[10px] font-mono text-zinc-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-500 hover:text-white" onClick={() => setZoom(z => Math.min(5, z + 0.1))}><ZoomIn className="w-3.5 h-3.5" /></Button>
                </div>

                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={`h-8 flex-shrink-0 text-[10px] uppercase font-bold tracking-widest gap-2 ${showEditorControls ? 'text-amber-500 bg-amber-500/10' : 'text-zinc-600 hover:text-white'}`}
                  onClick={() => setShowEditorControls(!showEditorControls)}
                >
                  <Layout className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Panel</span>
                </Button>

                <div className="h-4 w-px bg-zinc-800 shrink-0" />

                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 border-zinc-800 text-zinc-400 hover:text-white text-[10px] uppercase font-bold tracking-widest gap-2 flex-shrink-0" 
                  onClick={() => selectedPhoto && analyzePhotoWithIA(selectedPhoto.id)}
                  disabled={isAnalyzing}
                >
                  <Zap className="w-3 h-3 text-amber-500" />
                  {isAnalyzing ? '...' : <span className="hidden sm:inline">IA</span>}
                </Button>

                <Button variant="outline" size="sm" className="h-8 border-zinc-800 text-zinc-400 hover:text-white text-[10px] uppercase font-bold tracking-widest gap-2 flex-shrink-0" onClick={() => selectedPhoto && resetSettings(selectedPhoto.id)}>
                  <RotateCcw className="w-3 h-3" />
                  <span className="hidden sm:inline">Rst</span>
                </Button>

                <Button className="h-8 bg-white text-black hover:bg-zinc-200 text-[10px] uppercase font-bold tracking-widest gap-2 flex-shrink-0" onClick={() => selectedPhoto && setIsExportModalOpen(true)}>
                  <Download className="w-3 h-3" />
                  <span className="hidden xs:inline">Exp</span>
                </Button>
              </div>
            </div>

            <div className="flex-1 flex overflow-hidden relative">
              {/* Left Sidebar: Presets & History */}
              <div className="w-64 border-r border-zinc-900 bg-zinc-950 flex flex-col overflow-hidden hidden lg:flex">
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
                  <div className="space-y-4">
                    <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600 border-b border-zinc-900 pb-2">Navegador</h4>
                    <div className="aspect-video bg-zinc-900 rounded-lg overflow-hidden relative border border-zinc-800">
                      {selectedPhoto && (
                        <img 
                          src={fixImageUrl(selectedPhoto.thumbnailUrl || selectedPhoto.url)} 
                          className="w-full h-full object-cover opacity-50"
                          style={{ 
                            filter: getFilterString(previewSettings || selectedPhoto.settings),
                            transform: `rotate(${selectedPhoto.settings.rotation}deg) scaleX(${selectedPhoto.settings.flipX ? -1 : 1}) scaleY(${selectedPhoto.settings.flipY ? -1 : 1})`
                          }}
                          referrerPolicy="no-referrer"
                        />
                      )}
                      <div className="absolute border border-amber-500 bg-amber-500/10 pointer-events-none" 
                        style={{ 
                          width: `${Math.min(100, 100/zoom)}%`, 
                          height: `${Math.min(100, 100/zoom)}%`,
                          left: `${50 - (pan.x / (imageStageRef.current?.offsetWidth || 1) * 50)}%`,
                          top: `${50 - (pan.y / (imageStageRef.current?.offsetHeight || 1) * 50)}%`,
                          transform: 'translate(-50%, -50%)'
                        }} 
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                      <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600">Historial de Versiones</h4>
                      <Button 
                        variant="ghost" size="icon" className="h-5 w-5 text-zinc-600 hover:text-white"
                        onClick={() => selectedPhoto && savePhotoVersion(selectedPhoto)}
                      >
                        <Save className="w-3 h-3" />
                      </Button>
                    </div>
                    {photoVersions.length > 0 ? (
                      <div className="space-y-1.5 pt-1">
                        {photoVersions.map(v => (
                          <div 
                            key={v.id} 
                            className="flex items-center justify-between group p-2 rounded bg-zinc-900/30 border border-zinc-900/50 hover:border-zinc-800 cursor-pointer"
                            onClick={() => selectedPhoto && updateDoc(doc(db, "photos", selectedPhoto.id), { settings: v.settings })}
                          >
                            <div className="overflow-hidden">
                              <p className="text-[10px] text-zinc-400 font-bold truncate">{v.name}</p>
                              <p className="text-[8px] text-zinc-600 font-mono">
                                {v.createdAt?.toDate ? v.createdAt.toDate().toLocaleString() : 'Reciente'}
                              </p>
                            </div>
                            <HistoryIcon className="w-3 h-3 text-zinc-700 group-hover:text-amber-500" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-zinc-700 italic px-2">Sin versiones guardadas</p>
                    )}
                  </div>

                  <div className="space-y-6">
                    <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                      <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600">Presets</h4>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-5 w-5 text-zinc-600 hover:text-white"
                        onClick={() => saveCurrentAsPreset()}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>

                    <div className="space-y-6">
                      {/* Grouped Presets */}
                      {(() => {
                        const allAvailablePresets = [...SYSTEM_PRESETS, ...userPresets];
                        const categories = Array.from(new Set(allAvailablePresets.map(p => p.category || "General")));
                        
                        return categories.sort().map(category => {
                          const categoryPresets = allAvailablePresets.filter(p => (p.category || "General") === category);
                          if (categoryPresets.length === 0) return null;

                          return (
                            <div key={category} className="space-y-2">
                              <h5 className="text-[8px] font-bold uppercase tracking-widest text-zinc-700 px-2">{category}</h5>
                              <div className="space-y-0.5">
                                {categoryPresets.map(preset => {
                                  const planLevels: Record<PlanType, number> = { free: 0, pro: 1, studio: 2 };
                                  const userLevel = planLevels[userProfile?.plan || 'free'];
                                  const requiredLevel = planLevels[preset.planRequired || 'free'];
                                  const isLocked = userLevel < requiredLevel;

                                  return (
                                    <Button 
                                      key={preset.id}
                                      variant="ghost"
                                      size="sm"
                                      className={`w-full justify-between h-8 text-[10px] uppercase font-bold tracking-widest px-2 group ${
                                        isLocked ? 'text-zinc-700' : 'text-zinc-500 hover:text-white hover:bg-zinc-900'
                                      }`}
                                      onClick={() => applyPreset(preset)}
                                    >
                                      <span className="truncate mr-2">{preset.name}</span>
                                      {isLocked ? (
                                        <Lock className="w-3 h-3 text-zinc-800 group-hover:text-amber-500/50 transition-colors" />
                                      ) : (
                                        preset.planRequired !== 'free' && (
                                          <Badge className="h-4 px-1 text-[7px] bg-amber-500/10 text-amber-500 border-amber-500/20">
                                            {preset.planRequired?.toUpperCase()}
                                          </Badge>
                                        )
                                      )}
                                    </Button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600 border-b border-zinc-900 pb-2">Historial</h4>
                    <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                      {selectedPhotoId && history[selectedPhotoId]?.length > 0 ? (
                        [...history[selectedPhotoId]].reverse().map((step, idx) => (
                          <Button 
                            key={idx}
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start h-8 text-[9px] uppercase font-bold tracking-widest text-zinc-500 hover:text-white hover:bg-zinc-900 px-2"
                            onClick={() => {
                              setPhotos(prev => prev.map(p => p.id === selectedPhotoId ? { ...p, settings: step } : p));
                            }}
                          >
                            <RotateCw className="w-3 h-3 mr-2 opacity-50" />
                            Paso {history[selectedPhotoId].length - idx}
                          </Button>
                        ))
                      ) : (
                        <p className="text-[9px] text-zinc-700 italic px-2">Sin cambios recientes</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Main Content Area */}
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative bg-[#0a0a0a]">
                {/* Image Stage */}
                  <div
                    ref={imageStageRef}
                    className={`flex-1 min-h-0 relative overflow-hidden flex items-center justify-center ${isDragging ? 'cursor-grabbing' : zoom > 1 ? 'cursor-grab' : 'cursor-default'}`}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onDoubleClick={resetZoom}
                    onWheel={(e) => {
                      e.preventDefault();
                      const delta = e.deltaY;
                      const factor = 0.002;
                      const zoomChange = -delta * factor;
                      
                      setZoom(prev => {
                        const newZoom = Math.min(10, Math.max(0.1, prev + zoomChange));
                        return newZoom;
                      });
                      
                      if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaX) > 0.5) {
                        setPan(prev => ({
                          x: prev.x - e.deltaX,
                          y: prev.y - e.deltaY
                        }));
                      }
                    }}
                  >
                  {!selectedPhoto ? (
                    <div className="text-center p-8">
                      <ImageIcon className="w-12 h-12 text-zinc-800 mx-auto mb-4" />
                      <p className="text-zinc-500">Selecciona una foto de tu galería.</p>
                    </div>
                  ) : (
                      <AnimatePresence mode="wait">
                        <motion.div 
                          key={selectedPhoto.id}
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 1.02 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className="relative flex items-center justify-center w-full h-full"
                          style={{ 
                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                            transition: 'none'
                          }}
                        >
                           {/\.(arw|cr2|nef|dng|orf|raf)$/i.test(selectedPhoto.url) && !selectedPhoto.thumbnailUrl ? (
                           <div className="flex flex-col items-center justify-center text-zinc-500 bg-zinc-900/50 p-12 rounded-2xl border border-zinc-800 backdrop-blur-xl">
                             <ImageIcon className="w-20 h-20 mb-6 opacity-20" />
                             <h3 className="text-xl font-bold text-white mb-2">Archivo RAW Detectado</h3>
                             <p className="text-zinc-400 text-center max-w-xs mb-6">
                               Los navegadores no pueden mostrar archivos RAW directamente. Por favor, sube una miniatura JPEG o espera a que el servidor la genere.
                             </p>
                             <div className="flex gap-3">
                               <Button variant="outline" size="sm" className="border-zinc-800" onClick={() => setSelectedPhotoId(null)}>
                                 Volver a Galería
                               </Button>
                             </div>
                           </div>
                         ) : (
                           <PhotoCanvas 
                             ref={imageRef}
                             imageUrl={fixImageUrl(selectedPhoto.thumbnailUrl || selectedPhoto.url)}
                             settings={previewSettings || selectedPhoto.settings}
                             isComparing={isComparing}
                             compareValue={compareValue}
                           />
                         )}


        {/* Crop Overlay */}
        {isCropping && (
          <div 
            className="absolute z-40 pointer-events-none"
            style={{
              width: imageRef.current?.style.width,
              height: imageRef.current?.style.height,
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)'
            }}
          >
            <CropOverlay 
              settings={selectedPhoto.settings}
              onCropChange={(updates) => updatePhotoSettings(selectedPhoto.id, updates)}
              imageRect={imageRef.current?.getBoundingClientRect() || null}
            />
          </div>
        )}

                        {/* Comparison Slider Handle */}
                        {isComparing && (
                          <>
                            <div 
                              className="absolute top-0 bottom-0 w-[2px] bg-amber-500 z-20 pointer-events-none"
                              style={{ left: `${compareValue}%` }}
                            >
                              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center shadow-lg border-2 border-zinc-950">
                                <Split className="w-4 h-4 text-black" />
                              </div>
                            </div>
                            <input 
                              type="range"
                              min="0"
                              max="100"
                              value={isNaN(compareValue) ? 50 : compareValue}
                              onMouseDown={(e) => e.stopPropagation()}
                              onMouseMove={(e) => e.stopPropagation()}
                              onMouseUp={(e) => e.stopPropagation()}
                              onChange={(e) => setCompareValue(parseInt(e.target.value))}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-30"
                            />
                          </>
                        )}
                        </motion.div>
                      </AnimatePresence>
                    )}
                </div>

                {/* Filmstrip */}
                <Filmstrip 
                  photos={photos} 
                  selectedPhotoId={selectedPhotoId} 
                  onSelect={setSelectedPhotoId} 
                />
              </div>

              {/* Right Sidebar: Controls */}
              <AnimatePresence>
                {showEditorControls && (
                  <>
                    {/* Overlay for mobile */}
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setShowEditorControls(false)}
                      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
                    />
                    <motion.div 
                      initial={{ x: "100%" }}
                      animate={{ x: 0 }}
                      exit={{ x: "100%" }}
                      transition={{ type: "spring", damping: 30, stiffness: 300 }}
                      className="fixed inset-y-0 right-0 w-[85%] lg:relative lg:w-80 lg:inset-auto border-l border-zinc-900 bg-zinc-950 flex flex-col overflow-hidden z-50 lg:z-auto shadow-2xl lg:shadow-none"
                    >
                      {selectedPhoto && (
                        <>
                          <div className="lg:hidden flex items-center justify-between p-4 border-b border-zinc-900 bg-zinc-900/30">
                            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Ajustes</span>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500" onClick={() => setShowEditorControls(false)}>
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </div>
                          {/* Fixed Histogram Section */}
                          <div className="p-4 sm:p-6 border-b border-zinc-900 bg-zinc-950/50 backdrop-blur-md z-10 shrink-0">
                            <div className="space-y-4">
                              <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600 border-b border-zinc-900 pb-2">
                                Histograma
                              </h4>
                              <Histogram 
                                settings={previewSettings || selectedPhoto.settings} 
                                imageUrl={fixImageUrl(selectedPhoto.thumbnailUrl || selectedPhoto.url)} 
                              />
                            </div>
                          </div>

                          {/* Scrollable Content Section */}
                          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6">
                            <div className="space-y-10">
                              {/* AI Information Section */}
                              {selectedPhoto.description && (
                                <div className="space-y-4">
                                  <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600 border-b border-zinc-900 pb-2 flex items-center justify-between">
                                    Análisis IA
                                    <Sparkles className="w-3 h-3 text-amber-500" />
                                  </h4>
                                  <div className="space-y-3">
                                    <p className="text-[11px] text-zinc-400 leading-relaxed italic">
                                      "{selectedPhoto.description}"
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {selectedPhoto.tags?.map((tag, idx) => (
                                        <Badge key={idx} variant="outline" className="text-[9px] border-zinc-800 text-zinc-500 bg-zinc-900/30">
                                          {tag}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Main Controls */}
                              <LightingControls 
                                settings={previewSettings || selectedPhoto.settings} 
                                onChange={handleEditorChange}
                                onPreviewChange={handleEditorPreview}
                                userPlan={userProfile?.plan || 'free'}
                                onSmartEnhance={(p) => smartEnhance(selectedPhoto.id, p)}
                                isAutoEnhancing={isAutoEnhancing}
                                onCopySettings={() => copySettings(selectedPhoto.settings)}
                                onPasteSettings={() => pasteSettings(selectedPhoto.id)}
                                hasCopiedSettings={!!copiedSettings}
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  </main>
    </div>
  </div>

  <ExportModal 
    isOpen={isExportModalOpen}
    onClose={() => setIsExportModalOpen(false)}
    onExport={downloadImage}
    photoTitle={selectedPhoto?.title || "Imagen"}
  />
  <Toaster position="bottom-right" theme="dark" />

      {/* Storage Modal */}
      <Dialog open={showStorageModal} onOpenChange={setShowStorageModal}>
        <DialogContent className="bg-zinc-950 border-zinc-900 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold uppercase tracking-widest flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-blue-500" />
              Estado del Almacenamiento
            </DialogTitle>
            <DialogDescription className="text-zinc-500">
              Gestiona el espacio de tu laboratorio digital.
            </DialogDescription>
          </DialogHeader>

          <div className="py-6 space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                <span className="text-zinc-500">Espacio Utilizado</span>
                <span className="text-white">
                  {Number((userProfile?.storageUsed || 0) / (1024 * 1024)).toFixed(1)} MB / 
                  {(userProfile?.plan === 'studio' ? 1024 : userProfile?.plan === 'pro' ? 50 : 2)} GB
                </span>
              </div>
              <Progress 
                value={isNaN(((userProfile?.storageUsed || 0) / (userProfile?.plan === 'studio' ? 1024 * 1024 * 1024 * 1024 : userProfile?.plan === 'pro' ? 50 * 1024 * 1024 * 1024 : 2 * 1024 * 1024 * 1024)) * 100) ? 0 : ((userProfile?.storageUsed || 0) / (userProfile?.plan === 'studio' ? 1024 * 1024 * 1024 * 1024 : userProfile?.plan === 'pro' ? 50 * 1024 * 1024 * 1024 : 2 * 1024 * 1024 * 1024)) * 100} 
                className="h-2 bg-zinc-900" 
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-1">
                <p className="text-[10px] text-zinc-500 font-bold uppercase">Fotos Totales</p>
                <p className="text-lg font-bold">{photos.length}</p>
              </div>
              <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-1">
                <p className="text-[10px] text-zinc-500 font-bold uppercase">Archivos RAW</p>
                <p className="text-lg font-bold">{photos.filter(p => /\.(arw|cr2|nef|dng|orf|raf)$/i.test(p.url)).length}</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10 flex items-start gap-3">
              <Info className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-zinc-400 leading-relaxed">
                Los archivos RAW consumen significativamente más espacio. Considera optimizar tu galería si te acercas al límite.
              </p>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" className="border-zinc-800 text-zinc-400 hover:bg-zinc-900" onClick={() => setShowStorageModal(false)}>
              Cerrar
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-500 text-white" onClick={() => { setShowStorageModal(false); setActiveTab('gallery'); }}>
              Gestionar en Galería
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pricing Dialog */}
      <Dialog open={showPricing} onOpenChange={setShowPricing}>
        <DialogContent className="max-w-[95vw] w-full lg:max-w-[1200px] h-[95vh] md:h-auto md:max-h-[90vh] overflow-hidden bg-zinc-950 border-zinc-800 text-white flex flex-col p-0 shadow-2xl shadow-black/50">
          <div className="absolute top-4 right-4 md:top-6 md:right-6 z-50">
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-zinc-500 hover:text-white h-9 w-9 md:h-10 md:w-10 rounded-full bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 hover:scale-110 transition-all"
              onClick={() => setShowPricing(false)}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-5 md:p-16 scrollbar-thin scrollbar-thumb-zinc-800">
            <DialogHeader className="mb-8 md:mb-12">
              <div className="flex justify-center mb-4">
                <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 px-3 py-0.5 md:px-4 md:py-1 rounded-full text-[10px] md:text-xs font-bold uppercase tracking-widest">
                  Planes Premium
                </Badge>
              </div>
              <DialogTitle className="text-2xl md:text-5xl font-black text-center bg-gradient-to-b from-white via-white to-zinc-500 bg-clip-text text-transparent tracking-tight leading-tight px-4">
                Potencia tu Flujo de Trabajo
              </DialogTitle>
              <DialogDescription className="text-center text-zinc-400 text-sm md:text-xl mt-3 md:mt-4 max-w-2xl mx-auto leading-relaxed px-4">
                Elige la herramienta perfecta para tus necesidades. Desde aficionados hasta estudios profesionales.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 mb-8 md:mb-12 max-w-6xl mx-auto px-2 md:px-0">
              {/* Free Plan */}
              <Card className="bg-zinc-900/30 border-zinc-800/50 p-6 md:p-8 flex flex-col hover:bg-zinc-900/50 transition-all duration-500 group hover:border-zinc-700">
                <div className="mb-6 md:mb-8">
                  <div className="w-10 h-10 md:w-12 md:h-12 bg-zinc-800 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Zap className="w-5 h-5 md:w-6 md:h-6 text-zinc-400" />
                  </div>
                  <h3 className="text-xl md:text-2xl font-bold text-zinc-100">Free</h3>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-3xl md:text-4xl font-black text-white">$0</span>
                    <span className="text-xs md:text-sm font-medium text-zinc-500">/siempre</span>
                  </div>
                </div>
                <ul className="space-y-4 md:space-y-5 mb-8 md:mb-10 flex-1">
                  <li className="text-sm md:text-base flex items-center gap-3 md:gap-4 text-zinc-400">
                    <div className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-2.5 h-2.5 md:w-3 md:h-3 text-zinc-500" />
                    </div>
                    2GB Almacenamiento
                  </li>
                  <li className="text-sm md:text-base flex items-center gap-3 md:gap-4 text-zinc-400">
                    <div className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-2.5 h-2.5 md:w-3 md:h-3 text-zinc-500" />
                    </div>
                    Edición Básica
                  </li>
                  <li className="text-sm md:text-base flex items-center gap-3 md:gap-4 text-zinc-400">
                    <div className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-2.5 h-2.5 md:w-3 md:h-3 text-zinc-500" />
                    </div>
                    Presets Gratuitos
                  </li>
                  <li className="text-sm md:text-base flex items-center gap-3 md:gap-4 text-zinc-400">
                    <div className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-2.5 h-2.5 md:w-3 md:h-3 text-zinc-500" />
                    </div>
                    Sin Marcas de Agua
                  </li>
                </ul>
                <Button 
                  variant="outline" 
                  className="w-full border-zinc-800 hover:bg-zinc-800 h-12 md:h-14 text-sm md:text-base font-bold rounded-xl transition-all" 
                  disabled={userProfile?.plan === 'free'}
                >
                  {userProfile?.plan === 'free' ? 'Tu Plan Actual' : 'Elegir Free'}
                </Button>
              </Card>

              {/* Pro Plan */}
              <Card className={`bg-zinc-900/40 p-6 md:p-8 flex flex-col relative overflow-hidden transition-all duration-500 hover:bg-zinc-900/60 group ${userProfile?.plan === 'pro' ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-zinc-800 hover:border-amber-500/30'}`}>
                <div className="absolute top-0 right-0 bg-amber-500 text-black text-[8px] md:text-[10px] font-black px-3 py-1 md:px-4 md:py-1.5 rounded-bl-xl uppercase tracking-widest">Popular</div>
                <div className="mb-6 md:mb-8">
                  <div className="w-10 h-10 md:w-12 md:h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Sparkles className="w-5 h-5 md:w-6 md:h-6 text-amber-500" />
                  </div>
                  <h3 className="text-xl md:text-2xl font-bold text-zinc-100">Pro</h3>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-3xl md:text-4xl font-black text-white">${PLAN_PRICES.pro}</span>
                    <span className="text-xs md:text-sm font-medium text-zinc-500">ARS/mes</span>
                  </div>
                </div>
                <ul className="space-y-4 md:space-y-5 mb-8 md:mb-10 flex-1">
                  <li className="text-sm md:text-base flex items-center gap-3 md:gap-4 text-zinc-200">
                    <div className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-2.5 h-2.5 md:w-3 md:h-3 text-amber-500" />
                    </div>
                    50GB Almacenamiento
                  </li>
                  <li className="text-sm md:text-base flex items-center gap-3 md:gap-4 text-zinc-200">
                    <div className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-2.5 h-2.5 md:w-3 md:h-3 text-amber-500" />
                    </div>
                    Presets Pro Ilimitados
                  </li>
                </ul>
                <Button 
                  className="w-full bg-amber-500 hover:bg-amber-400 text-black h-12 md:h-14 text-sm md:text-base font-black rounded-xl shadow-xl shadow-amber-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                  onClick={() => handleUpgrade('pro')}
                  disabled={isProcessingPayment || userProfile?.plan === 'pro'}
                >
                  {isProcessingPayment ? "Procesando..." : userProfile?.plan === 'pro' ? "Tu Plan Actual" : "Actualizar a Pro"}
                </Button>
              </Card>

              {/* Studio Plan */}
              <Card className={`bg-zinc-900/30 border-zinc-800/50 p-6 md:p-8 flex flex-col relative overflow-hidden transition-all duration-500 hover:bg-zinc-900/50 group hover:border-zinc-700 ${userProfile?.plan === 'studio' ? 'border-amber-500 ring-2 ring-amber-500/20' : ''}`}>
                <div className="mb-6 md:mb-8">
                  <div className="w-10 h-10 md:w-12 md:h-12 bg-zinc-800 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Crown className="w-5 h-5 md:w-6 md:h-6 text-amber-500" />
                  </div>
                  <h3 className="text-xl md:text-2xl font-bold text-zinc-100">Studio</h3>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-3xl md:text-4xl font-black text-white">${PLAN_PRICES.studio}</span>
                    <span className="text-xs md:text-sm font-medium text-zinc-500">ARS/mes</span>
                  </div>
                </div>
                <ul className="space-y-4 md:space-y-5 mb-8 md:mb-10 flex-1">
                  <li className="text-sm md:text-base flex items-center gap-3 md:gap-4 text-zinc-300">
                    <div className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-2.5 h-2.5 md:w-3 md:h-3 text-amber-500" />
                    </div>
                    1TB Almacenamiento
                  </li>
                  <li className="text-sm md:text-base flex items-center gap-3 md:gap-4 text-zinc-300">
                    <div className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-2.5 h-2.5 md:w-3 md:h-3 text-amber-500" />
                    </div>
                    Marca Blanca (Logo Propio)
                  </li>
                  <li className="text-sm md:text-base flex items-center gap-3 md:gap-4 text-zinc-300">
                    <div className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-2.5 h-2.5 md:w-3 md:h-3 text-amber-500" />
                    </div>
                    Soporte Prioritario 24/7
                  </li>
                </ul>
                <Button 
                  variant={userProfile?.plan === 'studio' ? "default" : "outline"}
                  className={`w-full h-12 md:h-14 text-sm md:text-base font-bold rounded-xl transition-all ${userProfile?.plan === 'studio' ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-xl shadow-amber-500/20' : 'border-zinc-800 hover:bg-zinc-800'}`}
                  onClick={() => handleUpgrade('studio')}
                  disabled={isProcessingPayment || userProfile?.plan === 'studio'}
                >
                  {isProcessingPayment ? "Procesando..." : userProfile?.plan === 'studio' ? "Tu Plan Actual" : "Elegir Studio"}
                </Button>
              </Card>
            </div>

            <div className="flex flex-col items-center justify-center gap-4 text-sm text-zinc-500 border-t border-zinc-900/50 pt-12 mt-8 pb-8 md:pb-0">
              <div className="flex items-center gap-3 bg-zinc-900/50 px-6 py-2 rounded-full border border-zinc-800">
                <CreditCard className="w-5 h-5 text-zinc-400" />
                <span className="text-[10px] md:text-sm font-medium">Pagos seguros vía Mercado Pago</span>
              </div>
              <p className="text-zinc-600 text-center text-[10px] md:text-xs max-w-md px-4">
                Tu suscripción se renovará automáticamente. Puedes cancelar o cambiar de plan en cualquier momento desde tu perfil.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Save Preset Dialog */}
      <Dialog open={isSavingPreset} onOpenChange={setIsSavingPreset}>
        <DialogContent className="bg-zinc-950 border-zinc-900 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Save className="w-5 h-5 text-amber-500" />
              Guardar como Preset
            </DialogTitle>
            <DialogDescription className="text-zinc-400 pt-2">
              Guarda los ajustes actuales de luz y color para aplicarlos rápidamente a otras fotos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Nombre del Preset</label>
              <input 
                type="text"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="Ej: Atardecer Cálido"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            
            {userProfile?.role === 'admin' && (
              <div className="space-y-4 pt-2 border-t border-zinc-900">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <label className="text-sm font-bold text-zinc-300">Preset del Sistema</label>
                    <p className="text-xs text-zinc-500">Disponible para todos los usuarios</p>
                  </div>
                  <input 
                    type="checkbox"
                    checked={newPresetIsSystem}
                    onChange={(e) => setNewPresetIsSystem(e.target.checked)}
                    className="w-5 h-5 accent-amber-500"
                  />
                </div>
                
                {newPresetIsSystem && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Plan Requerido</label>
                    <select 
                      value={newPresetPlan}
                      onChange={(e) => setNewPresetPlan(e.target.value as PlanType)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value="free">Free</option>
                      <option value="pro">Pro</option>
                      <option value="studio">Studio</option>
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="flex gap-3">
            <Button 
              variant="ghost" 
              className="flex-1 border-zinc-800 hover:bg-zinc-900"
              onClick={() => setIsSavingPreset(false)}
            >
              Cancelar
            </Button>
            <Button 
              className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-bold"
              onClick={confirmSavePreset}
            >
              Guardar Preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-900 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" />
              ¿Eliminar fotografía?
            </DialogTitle>
            <DialogDescription className="text-zinc-400 pt-2">
              Esta acción eliminará la foto permanentemente de Aura Lab y del almacenamiento en la nube. No se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-3 mt-6">
            <Button 
              variant="ghost" 
              className="flex-1 border-zinc-800 hover:bg-zinc-900"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              className="flex-1 bg-red-600 hover:bg-red-500"
              onClick={() => {
                if (photoToDeleteId) {
                  deletePhoto(photoToDeleteId);
                  setIsDeleteDialogOpen(false);
                }
              }}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Import Presets Dialog */}
      <Dialog open={isBulkImportOpen} onOpenChange={setIsBulkImportOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-900 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-500" />
              Importación Masiva de Presets
            </DialogTitle>
            <DialogDescription className="text-zinc-400 pt-2">
              Selecciona una carpeta que contenga archivos .lrtemplate. Los presets se organizarán por el nombre de la subcarpeta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Plan Requerido para este Lote</label>
              <select 
                value={bulkImportPlan}
                onChange={(e) => setBulkImportPlan(e.target.value as PlanType)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-500"
              >
                <option value="free">Free (Gratis)</option>
                <option value="pro">Pro (Suscripción)</option>
                <option value="studio">Studio (Profesional)</option>
              </select>
            </div>

            <div className="pt-4">
              <input
                type="file"
                id="bulk-preset-input"
                className="hidden"
                {...({ webkitdirectory: "", directory: "" } as any)}
                onChange={handleBulkImport}
                disabled={isImporting}
              />
              <Button 
                className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold h-12"
                onClick={() => document.getElementById('bulk-preset-input')?.click()}
                disabled={isImporting}
              >
                {isImporting ? (
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 animate-spin" />
                    Procesando...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <FolderPlus className="w-4 h-4" />
                    Seleccionar Carpeta de Presets
                  </div>
                )}
              </Button>
            </div>
            
            <p className="text-[10px] text-zinc-500 text-center italic">
              Nota: Los archivos deben ser formato .lrtemplate (Lightroom Classic).
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Public Gallery View Wrapper */}
      {publicGallerySlug && (
        <div className="fixed inset-0 z-[100] bg-zinc-950 overflow-auto">
          <PublicGallery slug={publicGallerySlug} onBack={() => setPublicGallerySlug(null)} />
        </div>
      )}
    </div>
  );
}

// --- PUBLIC GALLERY COMPONENT ---
function PublicGallery({ slug, onBack }: { slug: string, onBack: () => void }) {
  const [gallery, setGallery] = React.useState<ClientGallery | null>(null);
  const [photos, setPhotos] = React.useState<Photo[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchGallery = async () => {
      try {
        const q = query(collection(db, "galleries"), where("slug", "==", slug));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const gData = snap.docs[0].data() as ClientGallery;
          setGallery({ ...gData, id: snap.docs[0].id });
          
        if (gData.photoIds && gData.photoIds.length > 0) {
          // Optimized fetch for gallery photos
          const pQuery = query(collection(db, "photos"), where("__name__", "in", gData.photoIds.slice(0, 50)));
          const pSnap = await getDocs(pQuery);
          // Maintain original order
          const fetchedPhotos = pSnap.docs.map(d => ({ ...d.data(), id: d.id } as Photo));
          const orderedPhotos = gData.photoIds
            .map(pid => fetchedPhotos.find(p => p.id === pid))
            .filter(Boolean) as Photo[];
          setPhotos(orderedPhotos);
        }
        }
      } catch (err) {
        console.error("Gallery fetch error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchGallery();
  }, [slug]);

  if (loading) return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-zinc-950">
      <Activity className="w-8 h-8 text-amber-500 animate-spin" />
    </div>
  );

  if (!gallery) return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-zinc-950 text-white p-6 md:p-12 text-center">
      <XCircle className="w-16 h-16 text-zinc-800 mb-6" />
      <h1 className="text-3xl font-black uppercase tracking-tighter italic mb-4">Mala <span className="text-amber-500">Noticia</span></h1>
      <p className="text-zinc-500 max-w-sm mb-8">Esta galería no existe o ha sido eliminada por el fotógrafo.</p>
      <Button variant="outline" onClick={onBack}>Volver</Button>
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-white">
      <header className="fixed top-0 left-0 right-0 z-50 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-900 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Sparkles className="text-black w-6 h-6" />
          </div>
          <div>
            <h1 className="text-sm font-black uppercase tracking-widest">{gallery.title}</h1>
            <p className="text-[10px] text-amber-500/70 font-bold uppercase tracking-[0.2em]">Galería Privada</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="text-[10px] font-bold uppercase tracking-widest text-zinc-400" onClick={onBack}>
            Salir
          </Button>
          <Button 
            size="sm" 
            className="bg-white text-black hover:bg-zinc-200 text-[10px] font-black uppercase tracking-widest px-6" 
            onClick={() => window.open(`/api/gallery/download/${slug}`, '_blank')}
          >
            Descargar
          </Button>
        </div>
      </header>

      <main className="pt-24 pb-12 px-6 md:px-12 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {photos.map((photo) => (
            <motion.div key={photo.id} className="relative aspect-[4/5] bg-zinc-900 rounded-2xl overflow-hidden group">
              <img src={photo.url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                <Button size="sm" variant="secondary" className="w-full text-xs font-bold" onClick={() => window.open(photo.url, '_blank')}>
                  <Download className="w-3 h-3 mr-2" />
                  Ver Original
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      </main>
    </div>
  );
}
