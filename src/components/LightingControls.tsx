import * as React from "react";
import { motion } from "motion/react";
import { Label } from "@/components/ui/label";
import { ColorBalance } from "./ColorBalance";
import { 
  Sun, Contrast, Droplets, Zap, Thermometer, Lock, Sparkles,
  Eye, Layers, CircleDot, Palette, Wind, RotateCw, FlipHorizontal,
  FlipVertical, Scissors, CloudFog, Waves, Box, Focus, Ghost,
  Copy, ClipboardPaste
} from "lucide-react";
import { LightingSettings, PlanType, DEFAULT_SETTINGS } from "@/src/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface LightingControlsProps {
  settings: LightingSettings;
  onChange: (settings: LightingSettings) => void;
  onPreviewChange?: (settings: LightingSettings) => void;
  userPlan: PlanType;
  onSmartEnhance: (prompt?: string) => void;
  isAutoEnhancing: boolean;
  onCopySettings: () => void;
  onPasteSettings: () => void;
  hasCopiedSettings: boolean;
  activeCategory?: string | null;
}

// ── ControlItem fuera del componente padre ────────────────────────────────────
// Esto es clave: si está adentro se recrea en cada render y rompe el memo.
interface ControlItemProps {
  label: string;
  icon: any;
  value: number;
  min: number;
  max: number;
  step?: number;
  settingKey: keyof LightingSettings;
  requiredPlan?: PlanType;
  displayValue?: string;
  locked: boolean;
  onSliderChange: (key: keyof LightingSettings, val: number) => void;
  onSliderCommit: (key: keyof LightingSettings, val: number) => void;
}

const ControlItem = React.memo(function ControlItem({
  label, icon: Icon, value, min, max, step = 0.1,
  settingKey, displayValue, locked, onSliderChange, onSliderCommit
}: ControlItemProps) {
  const showVal = displayValue || (
    typeof value === 'number' 
      ? (value > 0 && !['brightness', 'contrast', 'saturation', 'warmth', 'tint'].includes(settingKey as string)
          ? `+${value.toFixed(settingKey === 'exposure' ? 2 : 1)}`
          : value.toFixed(settingKey === 'exposure' ? 2 : 0))
      : '0'
  );

  const handleChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!locked) onSliderChange(settingKey, parseFloat(e.target.value));
  }, [locked, settingKey, onSliderChange]);

  const handlePointerUp = React.useCallback((e: React.PointerEvent<HTMLInputElement>) => {
    if (!locked) onSliderCommit(settingKey, parseFloat((e.target as HTMLInputElement).value));
  }, [locked, settingKey, onSliderCommit]);

  const handleDoubleClick = React.useCallback(() => {
    if (!locked) {
      const defaultValue = (DEFAULT_SETTINGS as any)[settingKey];
      onSliderChange(settingKey, defaultValue);
      onSliderCommit(settingKey, defaultValue);
    }
  }, [locked, settingKey, onSliderChange, onSliderCommit]);

  return (
    <div className={`space-y-2 ${locked ? 'opacity-40 select-none pointer-events-none' : ''} relative transition-opacity duration-300`}>
      <div className="flex items-center justify-between">
        <div 
          className="flex items-center gap-2 text-zinc-400 cursor-pointer active:scale-95 transition-transform"
          onDoubleClick={handleDoubleClick}
          title="Doble clic para restablecer"
        >
          <Icon className="w-3.5 h-3.5" />
          <Label className="text-[10px] font-bold uppercase tracking-wider">{label}</Label>
          {locked && <Lock className="w-3 h-3 text-amber-500 ml-1" />}
        </div>
        <span className="text-[10px] font-mono text-zinc-500">{showVal}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={isNaN(value) ? (min + max) / 2 : value}
        disabled={locked}
        className="aura-slider"
        onChange={handleChange}
        onPointerUp={handlePointerUp}
      />
    </div>
  );
});

// ── Componente principal ──────────────────────────────────────────────────────
export const LightingControls = React.memo(function LightingControls({ 
  settings, onChange, onPreviewChange, userPlan, onSmartEnhance, isAutoEnhancing,
  onCopySettings, onPasteSettings, hasCopiedSettings, activeCategory = null
}: LightingControlsProps) {

  const [localSettings, setLocalSettings] = React.useState(settings);
  const localRef = React.useRef(localSettings);
  const prevSettingsRef = React.useRef(settings);

  // Sync cuando cambia la foto o se confirma un cambio (commit)
  React.useEffect(() => {
    if (settings !== prevSettingsRef.current) {
      setLocalSettings(settings);
      localRef.current = settings;
      prevSettingsRef.current = settings;
    }
  }, [settings]);

  // Solo actualiza preview — no dispara re-render del padre
  const handleSliderChange = React.useCallback((key: keyof LightingSettings, val: number) => {
    const next = { ...localRef.current, [key]: val };
    localRef.current = next;
    setLocalSettings(next);
    if (onPreviewChange) onPreviewChange(next);
  }, [onPreviewChange]);

  // Guarda en estado global solo al soltar — esto sí dispara App
  const handleSliderCommit = React.useCallback((key: keyof LightingSettings, val: number) => {
    const next = { ...localRef.current, [key]: val };
    localRef.current = next;
    setLocalSettings(next); // IMPORTANTE: Sincronizar local tmb
    if (onPreviewChange) onPreviewChange(next); // IMPORTANTE: Reflejar en preview de App
    onChange(next);
  }, [onChange, onPreviewChange]);

  const handleColorBalanceChange = React.useCallback((
    key: 'shadowTint' | 'midtoneTint' | 'highlightTint', value: string
  ) => {
    const next = { ...localRef.current, [key]: value };
    localRef.current = next;
    setLocalSettings(next);
    if (onPreviewChange) onPreviewChange(next);
  }, [onPreviewChange]);

  const handleColorBalanceCommit = React.useCallback((
    key: 'shadowTint' | 'midtoneTint' | 'highlightTint', value: string
  ) => {
    const next = { ...localRef.current, [key]: value };
    localRef.current = next;
    setLocalSettings(next);
    onChange(next);
  }, [onChange]);

  const isLocked = React.useCallback((requiredPlan: PlanType) => {
    const levels: Record<PlanType, number> = { free: 0, pro: 1, studio: 2 };
    return levels[userPlan] < levels[requiredPlan];
  }, [userPlan]);

  const s = localSettings;

  const [aiPrompt, setAiPrompt] = React.useState("");

  return (
    <div className={activeCategory ? "space-y-6" : "space-y-10 pb-20"}>

      {/* AI Smart Enhance */}
      {(!activeCategory || activeCategory === 'ia') && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 to-transparent border border-amber-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white">Smart Enhance AI</span>
              </div>
              <Badge className="bg-zinc-800 text-zinc-400 border-zinc-700 text-[8px]">GEMINI PRO</Badge>
            </div>
            
            <div className="space-y-2">
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                Optimiza automáticamente o describe un estilo (ej: "Atardecer cálido", "Look cinematográfico").
              </p>
              <div className="relative group">
                <input 
                  type="text" 
                  placeholder="¿Qué look buscas?..." 
                  className="w-full bg-black/40 border border-zinc-800 rounded-lg py-2 px-3 text-[10px] focus:outline-none focus:border-amber-500/50 transition-all text-zinc-300 placeholder:text-zinc-600"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isAutoEnhancing) {
                      onSmartEnhance(aiPrompt);
                      setAiPrompt("");
                    }
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 text-zinc-500 hover:text-amber-500"
                  onClick={() => {
                    onSmartEnhance(aiPrompt);
                    setAiPrompt("");
                  }}
                  disabled={isAutoEnhancing}
                >
                  <Zap className="w-3 h-3" />
                </Button>
              </div>
            </div>

            <Button
              className="w-full bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-white font-bold text-[10px] uppercase tracking-wider h-9 rounded-xl transition-all"
              onClick={() => onSmartEnhance()}
              disabled={isAutoEnhancing}
            >
              {isAutoEnhancing ? (
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                  <RotateCw className="w-3.5 h-3.5" />
                </motion.div>
              ) : "Optimización Automática"}
            </Button>
          </div>

          {/* Copy/Paste Actions */}
          <div className="grid grid-cols-2 gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="h-9 border-zinc-800 text-[10px] uppercase font-bold tracking-widest text-zinc-400 hover:text-white hover:border-zinc-700"
              onClick={onCopySettings}
            >
              <Copy className="w-3.5 h-3.5 mr-2" />
              Copiar
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className={`h-9 border-zinc-800 text-[10px] uppercase font-bold tracking-widest ${hasCopiedSettings ? 'text-amber-500 border-amber-500/20 bg-amber-500/5' : 'text-zinc-400 opacity-50'}`}
              onClick={onPasteSettings}
            >
              <ClipboardPaste className="w-3.5 h-3.5 mr-2" />
              Pegar
            </Button>
          </div>
        </div>
      )}

      {/* Geometría y Recorte */}
      {(!activeCategory || activeCategory === 'geometry') && (
        <div className="space-y-6">
          {!activeCategory && (
            <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600 border-b border-zinc-900 pb-2 flex items-center justify-between">
              Geometría y Recorte
              <Badge variant="outline" className="text-[7px] border-zinc-800 text-zinc-500">PRO</Badge>
            </h4>
          )}
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1">
                <ControlItem label="Rotación" icon={RotateCw} value={s.rotation} min={-180} max={180} step={1}
                  settingKey="rotation" requiredPlan="pro" locked={isLocked('pro')}
                  onSliderChange={handleSliderChange} onSliderCommit={handleSliderCommit} />
              </div>
              <div className="flex gap-1 pt-6">
                <Button variant="outline" size="icon" className="h-8 w-8 border-zinc-800"
                  onClick={() => { const v = ((s.rotation - 90 + 180) % 360) - 180; handleSliderChange('rotation', v); handleSliderCommit('rotation', v); }}
                  disabled={isLocked('pro')}><RotateCw className="w-3.5 h-3.5 rotate-180" /></Button>
                <Button variant="outline" size="icon" className="h-8 w-8 border-zinc-800"
                  onClick={() => { const v = ((s.rotation + 90 + 180) % 360) - 180; handleSliderChange('rotation', v); handleSliderCommit('rotation', v); }}
                  disabled={isLocked('pro')}><RotateCw className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" size="sm"
                className={`h-9 border-zinc-800 text-[10px] uppercase font-bold tracking-widest ${s.flipX ? 'border-amber-500/50 text-amber-500 bg-amber-500/5' : 'text-zinc-400'}`}
                onClick={() => { const v = !s.flipX; handleSliderChange('flipX', v as any); handleSliderCommit('flipX', v as any); }}
                disabled={isLocked('pro')}>
                <FlipHorizontal className="w-3.5 h-3.5 mr-2" />Espejo H
              </Button>
              <Button variant="outline" size="sm"
                className={`h-9 border-zinc-800 text-[10px] uppercase font-bold tracking-widest ${s.flipY ? 'border-amber-500/50 text-amber-500 bg-amber-500/5' : 'text-zinc-400'}`}
                onClick={() => { const v = !s.flipY; handleSliderChange('flipY', v as any); handleSliderCommit('flipY', v as any); }}
                disabled={isLocked('pro')}>
                <FlipVertical className="w-3.5 h-3.5 mr-2" />Espejo V
              </Button>
            </div>
            <div className="pt-2 space-y-4">
              <ControlItem label="Recorte Sup" icon={Scissors} value={s.cropTop} min={0} max={50} settingKey="cropTop" locked={isLocked('studio')} onSliderChange={handleSliderChange} onSliderCommit={handleSliderCommit} />
              <ControlItem label="Recorte Inf" icon={Scissors} value={s.cropBottom} min={0} max={50} settingKey="cropBottom" locked={isLocked('studio')} onSliderChange={handleSliderChange} onSliderCommit={handleSliderCommit} />
              <ControlItem label="Recorte Izq" icon={Scissors} value={s.cropLeft} min={0} max={50} settingKey="cropLeft" locked={isLocked('studio')} onSliderChange={handleSliderChange} onSliderCommit={handleSliderCommit} />
              <ControlItem label="Recorte Der" icon={Scissors} value={s.cropRight} min={0} max={50} settingKey="cropRight" locked={isLocked('studio')} onSliderChange={handleSliderChange} onSliderCommit={handleSliderCommit} />
            </div>
          </div>
        </div>
      )}

      {/* Ajustes Básicos */}
      {(!activeCategory || activeCategory === 'light') && (
        <div className="space-y-6">
          {!activeCategory && <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600 border-b border-zinc-900 pb-2">Ajustes Básicos</h4>}
          <div className="space-y-5">
            <ControlItem label="Exposición" icon={Zap} value={s.exposure} min={-5} max={5} step={0.01} settingKey="exposure" locked={false} onSliderChange={handleSliderChange} onSliderCommit={handleSliderCommit} />
            <ControlItem label="Brillo" icon={Sun} value={s.brightness} min={0} max={200} step={1} settingKey="brightness" locked={false} onSliderChange={handleSliderChange} onSliderCommit={handleSliderCommit} />
            <ControlItem label="Contraste" icon={Contrast} value={s.contrast} min={0} max={200} step={1} settingKey="contrast" locked={false} onSliderChange={handleSliderChange} onSliderCommit={handleSliderCommit} />
            <ControlItem label="Saturación" icon={Droplets} value={s.saturation} min={0} max={200} step={1} settingKey="saturation" locked={false} onSliderChange={handleSliderChange} onSliderCommit={handleSliderCommit} />
            <ControlItem label="Temperatura" icon={Thermometer} value={s.warmth} min={-100} max={100} step={1} settingKey="warmth" locked={false} onSliderChange={handleSliderChange} onSliderCommit={handleSliderCommit} />
            <ControlItem label="Tinte" icon={Palette} value={s.tint} min={-100} max={100} step={1} settingKey="tint" locked={isLocked('pro')} onSliderChange={handleSliderChange} onSliderCommit={handleSliderCommit} />
          </div>
        </div>
      )}

      {/* Luz y Tono */}
      {(!activeCategory || activeCategory === 'light') && (
        <div className="space-y-6">
          {!activeCategory && <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600 border-b border-zinc-900 pb-2">Luz y Tono</h4>}
          <div className="space-y-5">
            <ControlItem label="Altas Luces" icon={Sun} value={s.highlights} min={0} max={200} settingKey="highlights" locked={isLocked('pro')} onSliderChange={handleSliderChange} onSliderCommit={handleSliderCommit} />
            <ControlItem label="Sombras" icon={Wind} value={s.shadows} min={0} max={200} settingKey="shadows" locked={isLocked('pro')} onSliderChange={handleSliderChange} onSliderCommit={handleSliderCommit} />
            <ControlItem label="Blancos" icon={CircleDot} value={s.whites} min={0} max={200} settingKey="whites" locked={isLocked('pro')} onSliderChange={handleSliderChange} onSliderCommit={handleSliderCommit} />
            <ControlItem label="Negros" icon={CircleDot} value={s.blacks} min={0} max={200} settingKey="blacks" locked={isLocked('pro')} onSliderChange={handleSliderChange} onSliderCommit={handleSliderCommit} />
          </div>
        </div>
      )}

      {/* Presencia */}
      {(!activeCategory || activeCategory === 'effects') && (
        <div className="space-y-6">
          {!activeCategory && <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600 border-b border-zinc-900 pb-2">Presencia</h4>}
          <div className="space-y-5">
            <ControlItem label="Claridad" icon={Eye} value={s.clarity} min={-100} max={100} settingKey="clarity" locked={isLocked('pro')} onSliderChange={handleSliderChange} onSliderCommit={handleSliderCommit} />
            <ControlItem label="Vibrance" icon={Sparkles} value={s.vibrance} min={0} max={200} settingKey="vibrance" locked={isLocked('pro')} onSliderChange={handleSliderChange} onSliderCommit={handleSliderCommit} />
            <ControlItem label="Textura" icon={Layers} value={s.texture} min={0} max={100} settingKey="texture" locked={isLocked('studio')} onSliderChange={handleSliderChange} onSliderCommit={handleSliderCommit} />
            <ControlItem label="Dehaze" icon={CloudFog} value={s.dehaze} min={0} max={100} settingKey="dehaze" locked={isLocked('studio')} onSliderChange={handleSliderChange} onSliderCommit={handleSliderCommit} />
          </div>
        </div>
      )}

      {/* Color Balance */}
      {(!activeCategory || activeCategory === 'color') && (
        <div className="space-y-6 relative">
          {!activeCategory && (
            <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600 border-b border-zinc-900 pb-2 flex items-center justify-between">
              Color Balance
              <div className="flex items-center gap-2">
                {isLocked('pro') && <Badge variant="outline" className="text-amber-500 border-amber-500/20">PRO</Badge>}
                <Palette className="w-3 h-3" />
              </div>
            </h4>
          )}
          <div className={isLocked('pro') ? 'opacity-20 pointer-events-none grayscale' : ''}>
            <ColorBalance
              shadows={s.shadowTint} midtones={s.midtoneTint} highlights={s.highlightTint}
              onChange={handleColorBalanceChange}
              onCommit={handleColorBalanceCommit}
            />
          </div>
          {isLocked('pro') && (
            <div className="absolute inset-0 top-8 flex flex-col items-center justify-center bg-zinc-950/40 backdrop-blur-[1px] rounded-lg">
              <Lock className="w-4 h-4 text-amber-500 mb-2" />
              <p className="text-[8px] font-black uppercase tracking-widest text-white">Plan Pro Requerido</p>
            </div>
          )}
        </div>
      )}

      {/* Detalle y Óptica */}
      {(!activeCategory || activeCategory === 'detail') && (
        <div className="space-y-6">
          {!activeCategory && <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600 border-b border-zinc-900 pb-2">Detalle y Óptica</h4>}
          <div className="space-y-5">
            <ControlItem label="Nitidez" icon={Focus} value={s.sharpening} min={0} max={100} settingKey="sharpening" locked={isLocked('pro')} onSliderChange={handleSliderChange} onSliderCommit={handleSliderCommit} />
            <ControlItem label="Enfoque" icon={Zap} value={s.focus} min={0} max={100} settingKey="focus" locked={isLocked('pro')} onSliderChange={handleSliderChange} onSliderCommit={handleSliderCommit} />
            <ControlItem label="Red. Ruido" icon={Waves} value={s.noiseReduction} min={0} max={100} settingKey="noiseReduction" locked={isLocked('studio')} onSliderChange={handleSliderChange} onSliderCommit={handleSliderCommit} />
            <ControlItem label="Viñeteo" icon={CircleDot} value={s.vignette} min={0} max={100} settingKey="vignette" locked={isLocked('pro')} onSliderChange={handleSliderChange} onSliderCommit={handleSliderCommit} />
            <ControlItem label="Distorsión" icon={Box} value={s.distortion} min={-50} max={50} settingKey="distortion" locked={isLocked('studio')} onSliderChange={handleSliderChange} onSliderCommit={handleSliderCommit} />
          </div>
        </div>
      )}

      {/* Efectos Creativos */}
      {(!activeCategory || activeCategory === 'effects') && (
        <div className="space-y-6">
          {!activeCategory && <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600 border-b border-zinc-900 pb-2">Efectos Creativos</h4>}
          <div className="space-y-5">
            <ControlItem label="Sepia" icon={Palette} value={s.sepia} min={0} max={100} settingKey="sepia" locked={isLocked('studio')} onSliderChange={handleSliderChange} onSliderCommit={handleSliderCommit} />
            <ControlItem label="Grano" icon={Ghost} value={s.grain} min={0} max={100} settingKey="grain" locked={isLocked('studio')} onSliderChange={handleSliderChange} onSliderCommit={handleSliderCommit} />
            <ControlItem label="Desenfoque" icon={CloudFog} value={s.blur} min={0} max={20} step={0.1} settingKey="blur" locked={isLocked('studio')} onSliderChange={handleSliderChange} onSliderCommit={handleSliderCommit} />
          </div>
        </div>
      )}

      {/* LUTs (Color Lookup Tables) */}
      {(!activeCategory || activeCategory === 'effects') && (
        <div className="space-y-6">
          {!activeCategory && (
            <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
              <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600">LUTs (Color Lookup)</h4>
              {isLocked('studio') && <Badge variant="outline" className="text-amber-500 border-amber-500/20 text-[8px]">STUDIO</Badge>}
            </div>
          )}
          <div className={`space-y-4 ${isLocked('studio') ? 'opacity-40 pointer-events-none' : ''}`}>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: null, name: 'Ninguno' },
                { id: 'cinematic', name: 'Cine' },
                { id: 'vintage', name: 'Vintage' },
                { id: 'noir', name: 'Noir' },
                { id: 'teal-orange', name: 'T&O' },
                { id: 'warm-gold', name: 'Gold' }
              ].map((lut) => (
                <button
                  key={lut.id || 'none'}
                  onClick={() => handleSliderCommit('lut', lut.id as any)}
                  className={`px-2 py-2 rounded-md text-[9px] font-bold uppercase tracking-tighter transition-all border ${s.lut === lut.id ? 'bg-amber-500 text-black border-amber-500' : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-700'}`}
                >
                  {lut.name}
                </button>
              ))}
            </div>
            {s.lut && (
              <ControlItem 
                label="Intensidad LUT" 
                icon={Sparkles} 
                value={s.lutIntensity || 100} 
                min={0} 
                max={100} 
                settingKey="lutIntensity" 
                locked={isLocked('studio')} 
                onSliderChange={handleSliderChange} 
                onSliderCommit={handleSliderCommit} 
              />
            )}
          </div>
        </div>
      )}

    </div>
  );
});
