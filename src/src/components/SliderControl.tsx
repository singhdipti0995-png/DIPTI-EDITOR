import React from 'react';
import { RotateCcw } from 'lucide-react';

interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  unit?: string;
  onChange: (value: number) => void;
}

export const SliderControl: React.FC<SliderControlProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  defaultValue = 0,
  unit = '',
  onChange,
}) => {
  const isModified = value !== defaultValue;

  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-xs font-medium text-slate-300">{label}</span>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-mono-tabular ${
              isModified ? 'text-sky-300 font-semibold' : 'text-slate-400'
            }`}
          >
            {value > 0 && min < 0 ? `+${value}` : value}
            {unit}
          </span>
          {isModified && (
            <button
              type="button"
              onClick={() => onChange(defaultValue)}
              title={`Reset ${label}`}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="studio-slider w-full cursor-pointer"
        aria-label={label}
      />
    </div>
  );
};
