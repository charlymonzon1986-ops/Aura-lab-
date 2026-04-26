import * as React from "react"
import { cn } from "@/lib/utils"

interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange'> {
  onValueChange?: (value: number[]) => void
  value?: number[]
  defaultValue?: number[]
  min?: number
  max?: number
  step?: number
}

function Slider({
  className,
  value,
  onValueChange,
  defaultValue,
  min = 0,
  max = 100,
  step = 1,
  ...props
}: SliderProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    onValueChange?.([val]);
  };

  return (
    <div className={cn("relative flex w-full touch-none select-none items-center", className)}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value?.[0] ?? defaultValue?.[0] ?? 0}
        onChange={handleChange}
        className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
        {...props}
      />
    </div>
  )
}

export { Slider }
