import * as React from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Download, ImageIcon, FileType, Maximize2, Lock, Crown } from "lucide-react";
import { PlanLimits, PlanType } from "@/src/types";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (settings: ExportSettings) => void;
  photoTitle: string;
  planLimits: PlanLimits;
  currentPlan: PlanType;
  onUpgrade: () => void;
}

export interface ExportSettings {
  format: 'image/jpeg' | 'image/png' | 'image/webp';
  quality: number;
  scale: number;
}

const FORMAT_LABELS: Record<string, string> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WEBP',
};

const PLAN_LABELS: Record<PlanType, string> = { free: 'Free', pro: 'Pro', studio: 'Studio' };

const SCALE_REQUIREMENTS: Record<number, PlanType> = {
  0.5: 'free', 1: 'free', 2: 'pro', 4: 'studio',
};

export function ExportModal({ isOpen, onClose, onExport, photoTitle, planLimits, currentPlan, onUpgrade }: ExportModalProps) {
  const defaultFormat: ExportSettings['format'] = planLimits.exportFormats.includes('jpeg') ? 'image/jpeg' : `image/${planLimits.exportFormats[0]}` as any;

  const [settings, setSettings] = React.useState<ExportSettings>({
    format: defaultFormat,
    quality: Math.min(0.9, planLimits.exportMaxQuality),
    scale: 1,
  });

  React.useEffect(() => {
    setSettings(prev => ({
      format: planLimits.exportFormats.includes(prev.format.split('/')[1] as any) ? prev.format : defaultFormat,
      quality: Math.min(prev.quality, planLimits.exportMaxQuality),
      scale: prev.scale <= planLimits.exportMaxScale ? prev.scale : 1,
    }));
  }, [planLimits]);

  const isFormatLocked = (fmt: 'jpeg' | 'png' | 'webp') => !planLimits.exportFormats.includes(fmt);
  const isScaleLocked  = (scale: number) => {
    const req = SCALE_REQUIREMENTS[scale];
    const levels: Record<PlanType, number> = { free: 0, pro: 1, studio: 2 };
    return levels[currentPlan] < levels[req];
  };
  const qualityMax = Math.round(planLimits.exportMaxQuality * 100);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-zinc-950 border-zinc-900 text-zinc-100 sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Download className="w-5 h-5 text-amber-500" />
            Exportar Imagen
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Configura la calidad y el formato para "{photoTitle}"
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] text-zinc-600 uppercase tracking-widest">Plan actual</span>
          <Badge className={`text-[9px] font-black uppercase tracking-wider ${
            currentPlan === 'studio' ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' :
            currentPlan === 'pro'    ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                                       'bg-zinc-800 text-zinc-400 border-zinc-700'
          }`}>
            {currentPlan !== 'free' && <Crown className="w-2.5 h-2.5 mr-1" />}
            {PLAN_LABELS[currentPlan]}
          </Badge>
        </div>

        <div className="space-y-6 py-2">
          {/* Formato */}
          <div className="space-y-3">
            <Label className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 flex items-center gap-2">
              <FileType className="w-3 h-3" />
              Formato de Archivo
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {(['image/jpeg', 'image/png', 'image/webp'] as const).map((f) => {
                const key = f.split('/')[1] as 'jpeg' | 'png' | 'webp';
                const locked = isFormatLocked(key);
                const req: PlanType = key === 'jpeg' ? 'free' : 'pro';
                return (
                  <button
                    key={f}
                    disabled={locked}
                    onClick={() => !locked && setSettings({ ...settings, format: f })}
                    className={`relative h-9 rounded-lg text-[10px] font-bold uppercase border transition-all
                      ${settings.format === f && !locked
                        ? 'bg-amber-500 text-black border-amber-500'
                        : locked
                          ? 'border-zinc-800 text-zinc-700 bg-zinc-900/50 cursor-not-allowed'
                          : 'border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900'
                      }`}
                  >
                    {FORMAT_LABELS[f]}
                    {locked && (
                      <span className="absolute -top-2 -right-2 bg-amber-500 text-black rounded-full text-[7px] font-black px-1 py-0.5 leading-none uppercase">
                        {PLAN_LABELS[req]}
                      </span>
                    )}
                    {locked && <Lock className="w-2.5 h-2.5 absolute bottom-1 right-1 text-zinc-600" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Calidad */}
          {settings.format !== 'image/png' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 flex items-center gap-2">
                  <ImageIcon className="w-3 h-3" />
                  Calidad
                  {currentPlan === 'free' && <span className="text-[9px] text-zinc-600">(máx. {qualityMax}% en Free)</span>}
                </Label>
                <span className="text-[10px] font-mono text-amber-500">{Math.round(settings.quality * 100)}%</span>
              </div>
              <Slider
                value={settings.quality * 100}
                min={10}
                max={qualityMax}
                step={1}
                onValueChange={(val: number) => setSettings({ ...settings, quality: val / 100 })}
                className="py-2"
              />
              {currentPlan === 'free' && (
                <p className="text-[9px] text-zinc-600">
                  Calidad al 100% disponible en{' '}
                  <button onClick={onUpgrade} className="text-amber-500 hover:underline font-bold">Pro o Studio</button>
                </p>
              )}
            </div>
          )}

          {/* Resolución */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 flex items-center gap-2">
                <Maximize2 className="w-3 h-3" />
                Resolución
              </Label>
              <span className="text-[10px] font-mono text-amber-500">{Math.round(settings.scale * 100)}%</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {([0.5, 1, 2, 4] as const).map((s) => {
                const locked = isScaleLocked(s);
                const req = SCALE_REQUIREMENTS[s];
                return (
                  <button
                    key={s}
                    disabled={locked}
                    onClick={() => !locked && setSettings({ ...settings, scale: s })}
                    className={`relative h-8 rounded-lg text-[10px] font-bold border transition-all
                      ${settings.scale === s && !locked
                        ? 'bg-amber-500 text-black border-amber-500'
                        : locked
                          ? 'border-zinc-800 text-zinc-700 bg-zinc-900/50 cursor-not-allowed'
                          : 'border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900'
                      }`}
                  >
                    {s * 100}%
                    {locked && (
                      <span className="absolute -top-2 -right-1 bg-amber-500 text-black rounded-full text-[6px] font-black px-1 py-0.5 leading-none uppercase">
                        {PLAN_LABELS[req]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {currentPlan === 'free' && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 flex items-center justify-between gap-3">
            <p className="text-[10px] text-zinc-400 leading-relaxed">
              <span className="text-amber-500 font-bold">Pro y Studio</span> desbloquean PNG, WebP, resolución ×2–×4 y calidad al 100%.
            </p>
            <Button size="sm" className="shrink-0 h-7 bg-amber-500 hover:bg-amber-600 text-black text-[9px] font-black uppercase tracking-wider px-3" onClick={onUpgrade}>
              Ver planes
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-zinc-400 hover:text-white hover:bg-zinc-900 text-[10px] uppercase font-bold tracking-widest">
            Cancelar
          </Button>
          <Button
            onClick={() => { onExport(settings); onClose(); }}
            className="bg-amber-500 text-black hover:bg-amber-600 text-[10px] uppercase font-bold tracking-widest px-8"
          >
            Descargar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
import * as React from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Download, X, ImageIcon, FileType, Maximize2 } from "lucide-react";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (settings: ExportSettings) => void;
  photoTitle: string;
}

export interface ExportSettings {
  format: 'image/jpeg' | 'image/png' | 'image/webp';
  quality: number;
  scale: number;
}

export function ExportModal({ isOpen, onClose, onExport, photoTitle }: ExportModalProps) {
  const [settings, setSettings] = React.useState<ExportSettings>({
    format: 'image/jpeg',
    quality: 0.9,
    scale: 1
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-zinc-950 border-zinc-900 text-zinc-100 sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Download className="w-5 h-5 text-amber-500" />
            Exportar Imagen
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Configura la calidad y el formato para "{photoTitle}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Formato */}
          <div className="space-y-3">
            <Label className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 flex items-center gap-2">
              <FileType className="w-3 h-3" />
              Formato de Archivo
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {(['image/jpeg', 'image/png', 'image/webp'] as const).map((f) => (
                <Button
                  key={f}
                  variant={settings.format === f ? "default" : "outline"}
                  className={`h-9 text-[10px] font-bold uppercase ${
                    settings.format === f 
                      ? "bg-amber-500 text-black hover:bg-amber-600" 
                      : "border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900"
                  }`}
                  onClick={() => setSettings({ ...settings, format: f })}
                >
                  {f.split('/')[1]}
                </Button>
              ))}
            </div>
          </div>

          {/* Calidad (solo para JPEG y WebP) */}
          {settings.format !== 'image/png' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 flex items-center gap-2">
                  <ImageIcon className="w-3 h-3" />
                  Calidad de Compresión
                </Label>
                <span className="text-[10px] font-mono text-amber-500">{Math.round(settings.quality * 100)}%</span>
              </div>
              <Slider
                value={[isNaN(settings.quality) ? 90 : settings.quality * 100]}
                min={10}
                max={100}
                step={1}
                onValueChange={(vals: number[]) => setSettings({ ...settings, quality: vals[0] / 100 })}
                className="py-2"
              />
              <p className="text-[8px] text-zinc-600 italic">
                Ajusta el nivel de compresión. 100% es máxima calidad, menor porcentaje reduce el tamaño del archivo.
              </p>
            </div>
          )}

          {/* Tamaño / Escala */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 flex items-center gap-2">
                <Maximize2 className="w-3 h-3" />
                Resolución
              </Label>
              <span className="text-[10px] font-mono text-amber-500">{Math.round(settings.scale * 100)}%</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[0.5, 1, 2, 4].map((s) => (
                <Button
                  key={s}
                  variant={settings.scale === s ? "default" : "outline"}
                  className={`h-8 text-[10px] font-bold ${
                    settings.scale === s 
                      ? "bg-amber-500 text-black hover:bg-amber-600" 
                      : "border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900"
                  }`}
                  onClick={() => setSettings({ ...settings, scale: s })}
                >
                  {s * 100}%
                </Button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button 
            variant="ghost" 
            onClick={onClose}
            className="text-zinc-400 hover:text-white hover:bg-zinc-900 text-[10px] uppercase font-bold tracking-widest"
          >
            Cancelar
          </Button>
          <Button 
            onClick={() => {
              onExport(settings);
              onClose();
            }}
            className="bg-amber-500 text-black hover:bg-amber-600 text-[10px] uppercase font-bold tracking-widest px-8"
          >
            Descargar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
