import React, { useMemo, useRef, useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { CurveChannelId, CurvePoint, RgbCurvesState } from '../../types/colorGrading';
import { RgbHistogramBins, evaluateCurveLut } from '../../utils/colorGradingEngine';

interface RgbCurvesControlProps {
  curves: RgbCurvesState;
  histogram: RgbHistogramBins;
  onChange: (next: RgbCurvesState) => void;
  onCommit?: (next: RgbCurvesState) => void;
}

const CHANNEL_TABS: Array<{ id: CurveChannelId; label: string; stroke: string; pillClass: string }> = [
  { id: 'master', label: 'Master', stroke: '#F8FAFC', pillClass: 'border-amber-400/70 text-white bg-white/10' },
  { id: 'red', label: 'Red', stroke: '#FB7185', pillClass: 'border-rose-400/70 text-rose-200 bg-rose-500/20' },
  { id: 'green', label: 'Green', stroke: '#34D399', pillClass: 'border-emerald-400/70 text-emerald-200 bg-emerald-500/20' },
  { id: 'blue', label: 'Blue', stroke: '#38BDF8', pillClass: 'border-sky-400/70 text-sky-200 bg-sky-500/20' },
];

export const RgbCurvesControl: React.FC<RgbCurvesControlProps> = ({
  curves,
  histogram,
  onChange,
  onCommit,
}) => {
  const [channel, setChannel] = useState<CurveChannelId>('master');
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingIdxRef = useRef<number | null>(null);

  const activePoints = curves[channel];
  const sortedWithIndices = useMemo(
    () =>
      activePoints
        .map((pt, idx) => ({ pt, idx }))
        .sort((a, b) => a.pt.x - b.pt.x),
    [activePoints]
  );

  const curvePath = useMemo(() => {
    const lut = evaluateCurveLut(activePoints);
    const cmds: string[] = [];
    for (let i = 0; i < 256; i += 4) {
      const sx = (i / 255) * 100;
      const sy = 100 - (lut[i] / 255) * 100;
      cmds.push(`${i === 0 ? 'M' : 'L'} ${sx.toFixed(2)} ${sy.toFixed(2)}`);
    }
    const lastY = 100 - (lut[255] / 255) * 100;
    cmds.push(`L 100 ${lastY.toFixed(2)}`);
    return cmds.join(' ');
  }, [activePoints]);

  const histogramPath = useMemo(() => {
    const bins =
      channel === 'red'
        ? histogram.red
        : channel === 'green'
          ? histogram.green
          : channel === 'blue'
            ? histogram.blue
            : histogram.luma;
    if (!bins.length) return '';
    const cmds = ['M 0 100'];
    bins.forEach((v, idx) => {
      const x = (idx / Math.max(1, bins.length - 1)) * 100;
      const y = 100 - Math.min(92, v * 88);
      cmds.push(`L ${x.toFixed(2)} ${y.toFixed(2)}`);
    });
    cmds.push('L 100 100 Z');
    return cmds.join(' ');
  }, [channel, histogram]);

  const toNormalizedCoords = (clientX: number, clientY: number): CurvePoint => {
    const svg = svgRef.current;
    if (!svg) return { x: 0.5, y: 0.5 };
    const rect = svg.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    const ny = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / Math.max(1, rect.height)));
    return { x: Number(nx.toFixed(3)), y: Number(ny.toFixed(3)) };
  };

  const commitCurve = (pts: CurvePoint[], doCommit = false) => {
    const next: RgbCurvesState = {
      ...curves,
      [channel]: pts,
    };
    onChange(next);
    if (doCommit) onCommit?.(next);
  };

  const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const coords = toNormalizedCoords(e.clientX, e.clientY);
    // Check if touching an existing knot within threshold
    let hitIdx: number | null = null;
    let bestDist = 0.085;
    activePoints.forEach((pt, idx) => {
      const d = Math.hypot(pt.x - coords.x, pt.y - coords.y);
      if (d < bestDist) {
        bestDist = d;
        hitIdx = idx;
      }
    });

    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);

    if (hitIdx !== null) {
      draggingIdxRef.current = hitIdx;
      setSelectedIdx(hitIdx);
      return;
    }

    // Add a new control point (cap at 9 points so curve remains responsive on mobile)
    if (activePoints.length < 9) {
      const nextPts = [...activePoints, coords].sort((a, b) => a.x - b.x);
      const newIdx = nextPts.findIndex((p) => p.x === coords.x && p.y === coords.y);
      draggingIdxRef.current = newIdx >= 0 ? newIdx : null;
      setSelectedIdx(draggingIdxRef.current);
      commitCurve(nextPts, false);
    }
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const idx = draggingIdxRef.current;
    if (idx === null) return;
    const coords = toNormalizedCoords(e.clientX, e.clientY);
    const nextPts = activePoints.map((pt, i) => {
      if (i !== idx) return pt;
      // Keep endpoint x pinned near edges unless middle point
      const isLeftEndpoint = idx === 0 && pt.x === 0;
      const isRightEndpoint = idx === activePoints.length - 1 && pt.x === 1;
      return {
        x: isLeftEndpoint ? 0 : isRightEndpoint ? 1 : Math.max(0.03, Math.min(0.97, coords.x)),
        y: coords.y,
      };
    });
    commitCurve(nextPts, false);
  };

  const handleSvgPointerUp = () => {
    if (draggingIdxRef.current !== null) {
      draggingIdxRef.current = null;
      commitCurve(activePoints, true);
    }
  };

  const removeSelectedPoint = () => {
    if (selectedIdx === null || activePoints.length <= 2) return;
    if (selectedIdx === 0 || selectedIdx === activePoints.length - 1) return;
    const nextPts = activePoints.filter((_, i) => i !== selectedIdx);
    setSelectedIdx(null);
    commitCurve(nextPts, true);
  };

  const activeMeta = CHANNEL_TABS.find((c) => c.id === channel)!;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-1.5">
        {CHANNEL_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setChannel(tab.id);
              setSelectedIdx(null);
            }}
            className={`min-h-[38px] px-2 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
              channel === tab.id ? tab.pillClass : 'bg-[#060812] border-white/10 text-slate-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl bg-[#05070E] border border-white/10 p-2.5 space-y-2">
        <svg
          ref={svgRef}
          viewBox="0 0 100 100"
          onPointerDown={handleSvgPointerDown}
          onPointerMove={handleSvgPointerMove}
          onPointerUp={handleSvgPointerUp}
          className="w-full aspect-square max-h-[240px] rounded-lg bg-[#03050A] border border-white/[0.06] touch-none select-none cursor-crosshair"
        >
          {/* Quarter Grid */}
          {[25, 50, 75].map((g) => (
            <React.Fragment key={g}>
              <line x1={g} y1="0" x2={g} y2="100" stroke="rgba(255,255,255,0.08)" strokeWidth="0.4" />
              <line x1="0" y1={g} x2="100" y2={g} stroke="rgba(255,255,255,0.08)" strokeWidth="0.4" />
            </React.Fragment>
          ))}
          {/* Linear diagonal reference */}
          <line x1="0" y1="100" x2="100" y2="0" stroke="rgba(255,255,255,0.16)" strokeDasharray="2 2" strokeWidth="0.6" />

          {/* Live RGB / Luma Histogram Fill */}
          {histogramPath && (
            <path d={histogramPath} fill={activeMeta.stroke} fillOpacity="0.16" />
          )}

          {/* Monotone Cubic Spline Curve */}
          <path d={curvePath} fill="none" stroke={activeMeta.stroke} strokeWidth="1.8" strokeLinecap="round" />

          {/* Draggable Control Knots */}
          {sortedWithIndices.map(({ pt, idx }) => {
            const cx = pt.x * 100;
            const cy = 100 - pt.y * 100;
            const isSel = selectedIdx === idx;
            return (
              <g
                key={`${idx}-${pt.x}`}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (activePoints.length > 2 && idx > 0 && idx < activePoints.length - 1) {
                    const nextPts = activePoints.filter((_, i) => i !== idx);
                    setSelectedIdx(null);
                    commitCurve(nextPts, true);
                  }
                }}
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={isSel ? '4.4' : '3.4'}
                  fill={isSel ? '#FBBF24' : '#06070B'}
                  stroke={activeMeta.stroke}
                  strokeWidth="1.4"
                />
              </g>
            );
          })}
        </svg>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
          <span>Tap curve to add points · Drag to shape tone</span>
          <div className="flex items-center gap-1.5">
            {selectedIdx !== null && selectedIdx > 0 && selectedIdx < activePoints.length - 1 && (
              <button
                type="button"
                onClick={removeSelectedPoint}
                className="min-h-[32px] px-2.5 rounded-lg bg-rose-500/15 border border-rose-400/35 text-rose-200 flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>Delete Point</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setSelectedIdx(null);
                commitCurve([{ x: 0, y: 0 }, { x: 1, y: 1 }], true);
              }}
              className="min-h-[32px] px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-slate-200 flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset {activeMeta.label}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
