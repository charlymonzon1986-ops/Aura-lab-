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
                  Calidad
                </Label>
                <span className="text-[10px] font-mono text-amber-500">{Math.round(settings.quality * 100)}%</span>
              </div>
              <Slider
                value={[settings.quality * 100]}
                min={10}
                max={100}
                step={1}
                onValueChange={(vals: number[]) => setSettings({ ...settings, quality: vals[0] / 100 })}
                className="py-2"
              />
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
