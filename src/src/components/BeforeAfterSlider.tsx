import React, { useState, useRef } from 'react';
import { MoveHorizontal, ZoomIn, Hand, RotateCcw } from 'lucide-react';

interface BeforeAfterSliderProps {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
  enableZoom?: boolean;
}

const ZOOM_LEVELS = [1, 2, 3, 4] as const;

export const BeforeAfterSlider: React.FC<BeforeAfterSliderProps> = ({
  beforeSrc,
  afterSrc,
  beforeLabel = 'Original',
  afterLabel = 'Edited',
  enableZoom = true,
}) => {
  const [splitPct, setSplitPct] = useState(52);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [touchTool, setTouchTool] = useState<'split' | 'pan'>('split');
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ clientX: number; clientY: number; panX: number; panY: number } | null>(null);

  const clampPan = (nx: number, ny: number, z: number) => {
    const maxOffset = Math.max(0, ((z - 1) / (2 * z)) * 100);
    return {
      x: Math.max(-maxOffset, Math.min(maxOffset, nx)),
      y: Math.max(-maxOffset, Math.min(maxOffset, ny)),
    };
  };

  const updateFromClientX = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setSplitPct(Math.max(4, Math.min(96, Math.round(pct))));
  };

  const handleZoomChange = (nextZoom: number) => {
    setZoom(nextZoom);
    if (nextZoom === 1) {
      setPan({ x: 0, y: 0 });
      setTouchTool('split');
    } else {
      setPan((prev) => clampPan(prev.x, prev.y, nextZoom));
    }
  };

  const transformStyle =
    zoom > 1
      ? {
          transform: `scale(${zoom}) translate(${pan.x}%, ${pan.y}%)`,
          transformOrigin: 'center center',
        }
      : undefined;

  return (
    <div className="relative w-full h-full flex flex-col gap-2">
      <div
        ref={containerRef}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
          if (zoom > 1 && touchTool === 'pan') {
            dragStartRef.current = {
              clientX: e.clientX,
              clientY: e.clientY,
              panX: pan.x,
              panY: pan.y,
            };
          } else {
            dragStartRef.current = null;
            updateFromClientX(e.clientX);
          }
        }}
        onPointerMove={(e) => {
          if (e.buttons !== 1 && e.pointerType !== 'touch') return;
          if (zoom > 1 && touchTool === 'pan' && dragStartRef.current && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const dxPct = ((e.clientX - dragStartRef.current.clientX) / Math.max(1, rect.width)) * (100 / zoom);
            const dyPct = ((e.clientY - dragStartRef.current.clientY) / Math.max(1, rect.height)) * (100 / zoom);
            setPan(clampPan(dragStartRef.current.panX + dxPct, dragStartRef.current.panY + dyPct, zoom));
          } else {
            updateFromClientX(e.clientX);
          }
        }}
        onPointerUp={() => {
          dragStartRef.current = null;
        }}
        className={`relative flex-1 w-full min-h-[260px] select-none overflow-hidden rounded-2xl bg-[#05070C] border border-white/10 touch-none flex items-center justify-center ${
          zoom > 1 && touchTool === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-ew-resize'
        }`}
      >
        {/* After Image (Full layer) */}
        <img
          src={afterSrc}
          alt={afterLabel}
          referrerPolicy="no-referrer"
          style={transformStyle}
          className="w-full h-full max-h-[520px] object-contain pointer-events-none transition-transform duration-100"
        />

        {/* Before Image (Clipped left) */}
        <div
          className="absolute inset-0 overflow-hidden pointer-events-none flex items-center justify-center"
          style={{ clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
        >
          <img
            src={beforeSrc}
            alt={beforeLabel}
            referrerPolicy="no-referrer"
            style={transformStyle}
            className="w-full h-full max-h-[520px] object-contain transition-transform duration-100"
          />
        </div>

        {/* Labels */}
        <span className="absolute top-3 left-3 text-[11px] font-medium tracking-wide text-slate-200 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-md border border-white/10 pointer-events-none">
          {beforeLabel} {zoom > 1 ? `(${zoom}×)` : ''}
        </span>
        <span className="absolute top-3 right-3 text-[11px] font-medium tracking-wide text-amber-300 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-md border border-amber-400/30 pointer-events-none">
          {afterLabel} {zoom > 1 ? `(${zoom}×)` : ''}
        </span>

        {/* Divider Handle */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-gradient-to-b from-violet-400 via-sky-400 to-amber-300 pointer-events-none"
          style={{ left: `${splitPct}%` }}
        >
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-[#0B1020]/90 border border-amber-400/60 shadow-[0_0_20px_rgba(212,175,55,0.45)] flex items-center justify-center">
            <MoveHorizontal className="w-4 h-4 text-white" />
          </div>
        </div>
      </div>

      {enableZoom && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-1">
            <ZoomIn className="w-3.5 h-3.5 text-amber-300 mr-1" />
            {ZOOM_LEVELS.map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => handleZoomChange(z)}
                className={`min-h-[32px] px-2.5 rounded-lg border text-[11px] font-mono-tabular font-semibold cursor-pointer transition-colors ${
                  zoom === z
                    ? 'bg-amber-400/20 border-amber-400/65 text-amber-200'
                    : 'bg-[#060812] border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                {z}×
              </button>
            ))}
          </div>

          {zoom > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setTouchTool((t) => (t === 'pan' ? 'split' : 'pan'))}
                className={`min-h-[32px] px-2.5 rounded-lg border text-[11px] font-medium flex items-center gap-1 cursor-pointer ${
                  touchTool === 'pan'
                    ? 'bg-violet-600/30 border-violet-400 text-white'
                    : 'bg-[#060812] border-white/10 text-slate-300 hover:text-white'
                }`}
              >
                {touchTool === 'pan' ? <Hand className="w-3 h-3 text-amber-300" /> : <MoveHorizontal className="w-3 h-3 text-violet-300" />}
                <span>{touchTool === 'pan' ? 'Panning View' : 'Drag Split'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleZoomChange(1)}
                className="min-h-[32px] px-2 rounded-lg bg-[#060812] border border-white/10 text-[11px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                title="Reset zoom"
              >
                <RotateCcw className="w-3 h-3" />
                <span>1×</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
