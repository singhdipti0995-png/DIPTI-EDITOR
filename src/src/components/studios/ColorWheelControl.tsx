import React, { useRef } from 'react';
import { RotateCcw } from 'lucide-react';
import { ColorWheelVector } from '../../types/colorGrading';
import { hslToRgbUnit } from '../../utils/colorGradingEngine';

interface ColorWheelControlProps {
  title: string;
  subtitle: string;
  value: ColorWheelVector;
  accentHex?: string;
  onChange: (next: ColorWheelVector) => void;
  onCommit?: (next: ColorWheelVector) => void;
}

export const ColorWheelControl: React.FC<ColorWheelControlProps> = ({
  title,
  subtitle,
  value,
  accentHex = '#D4AF37',
  onChange,
  onCommit,
}) => {
  const wheelRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const updateFromPointer = (clientX: number, clientY: number, commit = false) => {
    const el = wheelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const radius = Math.max(1, rect.width / 2 - 8);
    let dx = (clientX - cx) / radius;
    let dy = (clientY - cy) / radius;
    const dist = Math.hypot(dx, dy);
    if (dist > 1) {
      dx /= dist;
      dy /= dist;
    }
    const next: ColorWheelVector = {
      ...value,
      x: Number(dx.toFixed(3)),
      y: Number(dy.toFixed(3)),
    };
    onChange(next);
    if (commit && onCommit) onCommit(next);
  };

  const mag = Math.min(1, Math.hypot(value.x, value.y));
  const angleDeg = (Math.atan2(value.y, value.x) * 180) / Math.PI;
  const [ur, ug, ub] = hslToRgbUnit(angleDeg);
  const puckTint =
    mag < 0.03
      ? '#FFFFFF'
      : `rgb(${Math.round(ur * 255)}, ${Math.round(ug * 255)}, ${Math.round(ub * 255)})`;

  // Convert normalized -1..1 coordinates to SVG percentage (10%..90% radius inside 100×100 viewBox)
  const svgX = 50 + value.x * 40;
  const svgY = 50 + value.y * 40;

  return (
    <div className="rounded-xl bg-[#060812] border border-white/[0.08] p-3 flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white truncate">{title}</p>
          <p className="text-[11px] text-slate-400 truncate">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            const reset = { x: 0, y: 0, luma: 0 };
            onChange(reset);
            onCommit?.(reset);
          }}
          className="min-h-[34px] min-w-[34px] px-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-[11px] text-slate-300 flex items-center justify-center gap-1 cursor-pointer"
          title={`Reset ${title}`}
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset</span>
        </button>
      </div>

      <div className="flex items-center justify-center">
        <div
          ref={wheelRef}
          onPointerDown={(e) => {
            draggingRef.current = true;
            (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
            updateFromPointer(e.clientX, e.clientY, false);
          }}
          onPointerMove={(e) => {
            if (!draggingRef.current) return;
            updateFromPointer(e.clientX, e.clientY, false);
          }}
          onPointerUp={(e) => {
            if (!draggingRef.current) return;
            draggingRef.current = false;
            updateFromPointer(e.clientX, e.clientY, true);
          }}
          onDoubleClick={() => {
            const reset = { ...value, x: 0, y: 0 };
            onChange(reset);
            onCommit?.(reset);
          }}
          className="relative w-32 h-32 sm:w-36 sm:h-36 rounded-full touch-none select-none cursor-crosshair border border-white/15 shadow-[inset_0_0_24px_rgba(0,0,0,0.65)]"
          style={{
            background:
              'radial-gradient(circle, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.35) 36%, rgba(0,0,0,0) 74%), conic-gradient(from 90deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
          }}
          role="slider"
          aria-label={`${title} color wheel`}
          aria-valuetext={`X ${value.x}, Y ${value.y}`}
        >
          <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full pointer-events-none">
            <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="0.6" />
            <circle cx="50" cy="50" r="20" fill="none" stroke="rgba(255,255,255,0.12)" strokeDasharray="2 2" strokeWidth="0.5" />
            <line x1="50" y1="6" x2="50" y2="94" stroke="rgba(15,23,42,0.45)" strokeWidth="0.7" />
            <line x1="6" y1="50" x2="94" y2="50" stroke="rgba(15,23,42,0.45)" strokeWidth="0.7" />
            <line x1="50" y1="50" x2={svgX} y2={svgY} stroke={accentHex} strokeWidth="1.2" strokeOpacity="0.85" />
            <circle cx={svgX} cy={svgY} r="5.5" fill={puckTint} stroke="#06070B" strokeWidth="2" />
            <circle cx={svgX} cy={svgY} r="6.5" fill="none" stroke="#FFFFFF" strokeWidth="0.9" />
          </svg>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] font-mono-tabular">
          <span className="text-slate-400">Luma Offset</span>
          <span className="text-amber-300">{value.luma > 0 ? `+${Math.round(value.luma)}` : Math.round(value.luma)}</span>
        </div>
        <input
          type="range"
          min={-50}
          max={50}
          step={1}
          value={value.luma}
          onChange={(e) => {
            const next = { ...value, luma: Number(e.target.value) };
            onChange(next);
          }}
          onPointerUp={() => onCommit?.(value)}
          className="w-full accent-amber-400 cursor-pointer h-5"
          aria-label={`${title} luminance offset`}
        />
      </div>
    </div>
  );
};
