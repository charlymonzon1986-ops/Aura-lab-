import * as React from "react";
import { motion } from "motion/react";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { 
  Sun, 
  Contrast, 
  Droplets, 
  Zap, 
  Thermometer, 
  Lock, 
  Sparkles, 
  Eye, 
  Layers, 
  CircleDot,
  Palette,
  Wind,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Scissors,
  CloudFog,
  Waves,
  Box,
  Focus,
  Ghost
} from "lucide-react";
import { LightingSettings, PlanType } from "@/src/types";
import { Button } from "@/components/ui/button";

interface LightingControlsProps {
  settings: LightingSettings;
  onChange: (settings: LightingSettings) => void;
  userPlan: PlanType;
  onSmartEnhance: () => void;
  isAutoEnhancing: boolean;
}

export const LightingControls = React.memo(function LightingControls({ 
  settings, 
  onChange, 
  userPlan,
  onSmartEnhance,
  isAutoEnhancing
}: LightingControlsProps) {
  const [localSettings, setLocalSettings] = React.useState(settings);

  // Sync local settings when props change (e.g. preset applied)
  React.useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const updateCSSVariables = (key: keyof LightingSettings, val: any) => {
    const root = document.documentElement;
    if (key === 'brightness') root.style.setProperty('--img-brightness', `${val}%`);
    if (key === 'contrast') root.style.setProperty('--img-contrast', `${val}%`);
    if (key === 'saturation') root.style.setProperty('--img-saturate', `${val}%`);
    if (key === 'warmth') root.style.setProperty('--img-sepia', `${val > 0 ? val : 0}%`);
    if (key === 'tint') root.style.setProperty('--img-hue', `${val}deg`);
    if (key === 'exposure') root.style.setProperty('--img-exposure', `${1 + val / 100}`);
    if (key === 'vignette') root.style.setProperty('--img-vignette', `${val / 100}`);
    if (key === 'rotation') root.style.setProperty('--img-rotate', `${val}deg`);
    if (key === 'flipX') root.style.setProperty('--img-flip-x', val ? '-1' : '1');
    if (key === 'flipY') root.style.setProperty('--img-flip-y', val ? '-1' : '1');
    if (key === 'sepia') root.style.setProperty('--img-sepia-val', `${val}%`);
    if (key === 'blur') root.style.setProperty('--img-blur', `${val}px`);
    if (key === 'cropTop') root.style.setProperty('--img-crop-top', `${val}%`);
    if (key === 'cropBottom') root.style.setProperty('--img-crop-bottom', `${val}%`);
    if (key === 'cropLeft') root.style.setProperty('--img-crop-left', `${val}%`);
    if (key === 'cropRight') root.style.setProperty('--img-crop-right', `${val}%`);
  };

  const handleChange = (key: keyof LightingSettings, value: any) => {
    const val = Array.isArray(value) ? value[0] : value;
    setLocalSettings(prev => ({ ...prev, [key]: val }));
    updateCSSVariables(key, val);
  };

  const handleCommit = (key: keyof LightingSettings, value: any) => {
    const val = Array.isArray(value) ? value[0] : value;
    onChange({ ...settings, [key]: val });
  };

  const isLocked = (requiredPlan: PlanType) => {
    const planLevels: Record<PlanType, number> = { free: 0, pro: 1, studio: 2 };
    return planLevels[userPlan] < planLevels[requiredPlan];
  };

  const ControlItem = ({ 
    label, 
    icon: Icon, 
    value, 
    min, 
    max, 
    step = 0.1, 
    settingKey, 
    requiredPlan = 'free',
    displayValue
  }: { 
    label: string, 
    icon: any, 
    value: number, 
    min: number, 
    max: number, 
    step?: number, 
    settingKey: keyof LightingSettings,
    requiredPlan?: PlanType,
    displayValue?: string
  }) => {
    const locked = isLocked(requiredPlan);

    return (
      <div className={`space-y-3 ${locked ? 'opacity-40 select-none pointer-events-none' : ''} relative group transition-opacity duration-300`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-400">
            <Icon className="w-3.5 h-3.5" />
            <Label className="text-[10px] font-bold uppercase tracking-wider">{label}</Label>
            {locked && <Lock className="w-3 h-3 text-amber-500 ml-1" />}
          </div>
          <span className="text-[10px] font-mono text-zinc-500">
            {displayValue || (value > 0 && !['brightness', 'contrast', 'saturation'].includes(settingKey) ? `+${value.toFixed(1)}` : value.toFixed(1))}
          </span>
        </div>
        <Slider
          value={[value]}
          min={min}
          max={max}
          step={step}
          onValueChange={(v) => !locked && handleChange(settingKey, v)}
          onValueCommit={(v) => !locked && handleCommit(settingKey, v)}
          className="py-1 cursor-pointer"
        />
      </div>
    );
  };

  return (
    <div className="space-y-10 pb-20">
      {/* AI Smart Enhance */}
      <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 to-transparent border border-amber-500/20 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-white">Smart Enhance</span>
          </div>
          <Badge className="bg-zinc-800 text-zinc-400 border-zinc-700 text-[8px]">FREE API</Badge>
        </div>
        <p className="text-[10px] text-zinc-500 leading-relaxed">
          Optimiza automáticamente la iluminación y el color usando Gemini 3 Flash.
        </p>
        <Button 
          className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold text-[10px] uppercase tracking-wider h-9 rounded-xl shadow-lg shadow-amber-500/20"
          onClick={onSmartEnhance}
          disabled={isAutoEnhancing}
        >
          {isAutoEnhancing ? (
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
              <RotateCw className="w-3.5 h-3.5" />
            </motion.div>
          ) : (
            "Aplicar Mejora IA"
          )}
        </Button>
      </div>

      {/* Geometría y Recorte */}
      <div className="space-y-6">
        <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600 border-b border-zinc-900 pb-2 flex items-center justify-between">
          Geometría y Recorte
          <Badge variant="outline" className="text-[7px] border-zinc-800 text-zinc-500">PRO</Badge>
        </h4>
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1">
              <ControlItem label="Rotación" icon={RotateCw} value={localSettings.rotation} min={-180} max={180} step={1} settingKey="rotation" requiredPlan="pro" />
            </div>
            <div className="flex gap-1 pt-6">
              <Button 
                variant="outline" 
                size="icon" 
                className="h-8 w-8 border-zinc-800"
                onClick={() => {
                  const newRot = ((localSettings.rotation - 90 + 180) % 360) - 180;
                  handleChange('rotation', newRot);
                  handleCommit('rotation', newRot);
                }}
                disabled={isLocked('pro')}
              >
                <RotateCw className="w-3.5 h-3.5 rotate-180" />
              </Button>
              <Button 
                variant="outline" 
                size="icon" 
                className="h-8 w-8 border-zinc-800"
                onClick={() => {
                  const newRot = ((localSettings.rotation + 90 + 180) % 360) - 180;
                  handleChange('rotation', newRot);
                  handleCommit('rotation', newRot);
                }}
                disabled={isLocked('pro')}
              >
                <RotateCw className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button 
              variant="outline" 
              size="sm" 
              className={`h-9 border-zinc-800 text-[10px] uppercase font-bold tracking-widest ${localSettings.flipX ? 'bg-amber-500/10 border-amber-500/50 text-amber-500' : 'text-zinc-400'}`}
              onClick={() => {
                const newVal = !localSettings.flipX;
                handleChange('flipX', newVal);
                handleCommit('flipX', newVal);
              }}
              disabled={isLocked('pro')}
            >
              <FlipHorizontal className="w-3.5 h-3.5 mr-2" />
              Espejo H
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className={`h-9 border-zinc-800 text-[10px] uppercase font-bold tracking-widest ${localSettings.flipY ? 'bg-amber-500/10 border-amber-500/50 text-amber-500' : 'text-zinc-400'}`}
              onClick={() => {
                const newVal = !localSettings.flipY;
                handleChange('flipY', newVal);
                handleCommit('flipY', newVal);
              }}
              disabled={isLocked('pro')}
            >
              <FlipVertical className="w-3.5 h-3.5 mr-2" />
              Espejo V
            </Button>
          </div>
          <div className="pt-2 space-y-4">
            <ControlItem label="Recorte Sup" icon={Scissors} value={localSettings.cropTop} min={0} max={50} settingKey="cropTop" requiredPlan="studio" />
            <ControlItem label="Recorte Inf" icon={Scissors} value={localSettings.cropBottom} min={0} max={50} settingKey="cropBottom" requiredPlan="studio" />
            <ControlItem label="Recorte Izq" icon={Scissors} value={localSettings.cropLeft} min={0} max={50} settingKey="cropLeft" requiredPlan="studio" />
            <ControlItem label="Recorte Der" icon={Scissors} value={localSettings.cropRight} min={0} max={50} settingKey="cropRight" requiredPlan="studio" />
          </div>
        </div>
      </div>

      {/* Ajustes Básicos */}
      <div className="space-y-6">
        <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600 border-b border-zinc-900 pb-2">Ajustes Básicos</h4>
        <div className="space-y-5">
          <ControlItem label="Exposición" icon={Zap} value={localSettings.exposure} min={-5} max={5} step={0.01} settingKey="exposure" />
          <ControlItem label="Contraste" icon={Contrast} value={localSettings.contrast} min={0} max={200} step={1} settingKey="contrast" />
          <ControlItem label="Brillo" icon={Sun} value={localSettings.brightness} min={0} max={200} step={1} settingKey="brightness" />
          <ControlItem label="Saturación" icon={Droplets} value={localSettings.saturation} min={0} max={200} step={1} settingKey="saturation" />
          <ControlItem label="Temperatura" icon={Thermometer} value={localSettings.warmth} min={-100} max={100} step={1} settingKey="warmth" />
          <ControlItem label="Tinte" icon={Palette} value={localSettings.tint} min={-100} max={100} step={1} settingKey="tint" requiredPlan="pro" />
        </div>
      </div>

      {/* Luz y Tono */}
      <div className="space-y-6">
        <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600 border-b border-zinc-900 pb-2">Luz y Tono</h4>
        <div className="space-y-5">
          <ControlItem label="Altas Luces" icon={Sun} value={localSettings.highlights} min={0} max={200} settingKey="highlights" requiredPlan="pro" />
          <ControlItem label="Sombras" icon={Wind} value={localSettings.shadows} min={0} max={200} settingKey="shadows" requiredPlan="pro" />
          <ControlItem label="Blancos" icon={CircleDot} value={localSettings.whites} min={0} max={200} settingKey="whites" requiredPlan="pro" />
          <ControlItem label="Negros" icon={CircleDot} value={localSettings.blacks} min={0} max={200} settingKey="blacks" requiredPlan="pro" />
        </div>
      </div>

      {/* Presencia */}
      <div className="space-y-6">
        <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600 border-b border-zinc-900 pb-2">Presencia</h4>
        <div className="space-y-5">
          <ControlItem label="Claridad" icon={Eye} value={localSettings.clarity} min={0} max={100} settingKey="clarity" requiredPlan="pro" />
          <ControlItem label="Vibrance" icon={Sparkles} value={localSettings.vibrance} min={0} max={200} settingKey="vibrance" requiredPlan="pro" />
          <ControlItem label="Textura" icon={Layers} value={localSettings.texture} min={0} max={100} settingKey="texture" requiredPlan="studio" />
          <ControlItem label="Dehaze" icon={CloudFog} value={localSettings.dehaze} min={0} max={100} settingKey="dehaze" requiredPlan="studio" />
        </div>
      </div>

      {/* Detalle y Óptica */}
      <div className="space-y-6">
        <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600 border-b border-zinc-900 pb-2">Detalle y Óptica</h4>
        <div className="space-y-5">
          <ControlItem label="Nitidez" icon={Focus} value={localSettings.sharpening} min={0} max={100} settingKey="sharpening" requiredPlan="pro" />
          <ControlItem label="Red. Ruido" icon={Waves} value={localSettings.noiseReduction} min={0} max={100} settingKey="noiseReduction" requiredPlan="studio" />
          <ControlItem label="Viñeteo" icon={CircleDot} value={localSettings.vignette} min={0} max={100} settingKey="vignette" requiredPlan="pro" />
          <ControlItem label="Distorsión" icon={Box} value={localSettings.distortion} min={-50} max={50} settingKey="distortion" requiredPlan="studio" />
        </div>
      </div>

      {/* Efectos Creativos */}
      <div className="space-y-6">
        <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600 border-b border-zinc-900 pb-2">Efectos Creativos</h4>
        <div className="space-y-5">
          <ControlItem label="Sepia" icon={Palette} value={localSettings.sepia} min={0} max={100} settingKey="sepia" requiredPlan="studio" />
          <ControlItem label="Grano" icon={Ghost} value={localSettings.grain} min={0} max={100} settingKey="grain" requiredPlan="studio" />
          <ControlItem label="Desenfoque" icon={CloudFog} value={localSettings.blur} min={0} max={20} step={0.1} settingKey="blur" requiredPlan="studio" />
        </div>
      </div>
    </div>
  );
});

function Badge({ children, className, variant = "default" }: { children: React.ReactNode, className?: string, variant?: "default" | "outline" }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${variant === 'outline' ? 'border border-zinc-800 text-zinc-500' : 'bg-amber-500 text-black'} ${className}`}>
      {children}
    </span>
  );
}
