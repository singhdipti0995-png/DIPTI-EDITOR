import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Brush,
  Check,
  Download,
  Eye,
  Info,
  Loader2,
  Redo2,
  RotateCcw,
  Save,
  Sparkles,
  SplitSquareHorizontal,
  Trash2,
  Undo2,
  Wand2,
} from 'lucide-react';
import {
  AppSettings,
  ExportRecord,
  PhotoRestorationConfig,
  ProjectItem,
} from '../../types/editor';
import { createThumbnailDataUrl, loadImageElement } from '../../utils/canvasEngine';
import { downloadExportedBlob, encodeCanvasToBlob } from '../../utils/exportEngine';
import { GallerySaveResult, exportCanvasViaGallery } from '../../utils/gallerySaveEngine';
import { releaseCanvasMemory } from '../../utils/hdQualityEngine';
import { formatBytes } from '../../utils/indexedDbStorage';
import {
  DEFAULT_PHOTO_RESTORATION_CONFIG,
  PhotoAnalysisReport,
  RESTORATION_PRESETS,
  analyzeOldPhotoDiagnostics,
  renderPhotoRestorationCanvas,
} from '../../utils/photoRestorationEngine';
import { AssetPickerBar } from '../AssetPickerBar';
import { BeforeAfterSlider } from '../BeforeAfterSlider';
import { GallerySaveBanner } from '../GallerySaveBanner';
import { SliderControl } from '../SliderControl';

interface PhotoRestorationStudioProps {
  imageUrl: string;
  onChangeImage: (url: string) => void;
  initialConfig?: PhotoRestorationConfig;
  settings: AppSettings;
  onSaveProject: (project: ProjectItem) => Promise<boolean> | void;
  onRecordExport?: (record: ExportRecord) => void;
}

type ViewMode = 'restored' | 'compare' | 'repair-mask';
type ControlTab = 'clarity' | 'color-tone';
type RestorationExportFormat = 'png' | 'jpg';

function cloneConfig(c: PhotoRestorationConfig): PhotoRestorationConfig {
  return {
    ...c,
    spotStrokes: c.spotStrokes.map((s) => ({ ...s })),
  };
}

export const PhotoRestorationStudio: React.FC<PhotoRestorationStudioProps> = ({
  imageUrl,
  onChangeImage,
  initialConfig,
  settings,
  onSaveProject,
  onRecordExport,
}) => {
  const [config, setConfig] = useState<PhotoRestorationConfig>(() =>
    initialConfig ? cloneConfig(initialConfig) : cloneConfig(DEFAULT_PHOTO_RESTORATION_CONFIG)
  );
  const [history, setHistory] = useState<PhotoRestorationConfig[]>(() => [
    initialConfig ? cloneConfig(initialConfig) : cloneConfig(DEFAULT_PHOTO_RESTORATION_CONFIG),
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [viewMode, setViewMode] = useState<ViewMode>('compare');
  const [controlTab, setControlTab] = useState<ControlTab>('clarity');
  const [exportFormat, setExportFormat] = useState<RestorationExportFormat>(
    settings.exportFormat === 'png' ? 'png' : 'jpg'
  );
  const [jpgQuality, setJpgQuality] = useState<number>(Math.max(80, Math.min(100, settings.exportQuality || 95)));

  const [spotBrushActive, setSpotBrushActive] = useState(false);
  const [spotBrushRadiusPct, setSpotBrushRadiusPct] = useState(2.2); // 1.0% - 7.0% of width

  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [rendering, setRendering] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [repairedDustCount, setRepairedDustCount] = useState(0);
  const [previewDataUrl, setPreviewDataUrl] = useState<string>(imageUrl);
  const [analysis, setAnalysis] = useState<PhotoAnalysisReport | null>(null);

  const [savedNotice, setSavedNotice] = useState(false);
  const [lastExportMeta, setLastExportMeta] = useState<{
    width: number;
    height: number;
    bytes: number;
    format: string;
  } | null>(null);
  const [gallerySaving, setGallerySaving] = useState(false);
  const [galleryProgress, setGalleryProgress] = useState(0);
  const [galleryStage, setGalleryStage] = useState<string | null>(null);
  const [galleryResult, setGalleryResult] = useState<GallerySaveResult | null>(null);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const renderTimerRef = useRef<number | null>(null);
  const sliderCommitTimerRef = useRef<number | null>(null);
  const isPaintingRef = useRef(false);
  const historyIndexRef = useRef(historyIndex);
  historyIndexRef.current = historyIndex;

  useEffect(() => {
    if (initialConfig) {
      const cloned = cloneConfig(initialConfig);
      setConfig(cloned);
      setHistory([cloned]);
      setHistoryIndex(0);
    }
  }, [initialConfig]);

  const commitHistorySnapshot = useCallback((nextCfg: PhotoRestorationConfig) => {
    const snap = cloneConfig(nextCfg);
    setHistory((prev) => {
      const sliced = prev.slice(0, historyIndexRef.current + 1);
      const updated = [...sliced, snap].slice(-35);
      setHistoryIndex(updated.length - 1);
      return updated;
    });
  }, []);

  const updateSliderConfig = useCallback(
    (patch: Partial<PhotoRestorationConfig>) => {
      setConfig((prev) => {
        const next: PhotoRestorationConfig = {
          ...prev,
          ...patch,
          presetId: patch.presetId ?? 'custom',
        };
        if (sliderCommitTimerRef.current) {
          window.clearTimeout(sliderCommitTimerRef.current);
        }
        sliderCommitTimerRef.current = window.setTimeout(() => {
          commitHistorySnapshot(next);
        }, 320);
        return next;
      });
    },
    [commitHistorySnapshot]
  );

  const applyImmediateConfig = useCallback(
    (next: PhotoRestorationConfig) => {
      if (sliderCommitTimerRef.current) {
        window.clearTimeout(sliderCommitTimerRef.current);
      }
      const cloned = cloneConfig(next);
      setConfig(cloned);
      commitHistorySnapshot(cloned);
    },
    [commitHistorySnapshot]
  );

  const handleUndo = () => {
    if (historyIndex <= 0) return;
    if (sliderCommitTimerRef.current) window.clearTimeout(sliderCommitTimerRef.current);
    const nextIdx = historyIndex - 1;
    setHistoryIndex(nextIdx);
    setConfig(cloneConfig(history[nextIdx]));
  };

  const handleRedo = () => {
    if (historyIndex >= history.length - 1) return;
    if (sliderCommitTimerRef.current) window.clearTimeout(sliderCommitTimerRef.current);
    const nextIdx = historyIndex + 1;
    setHistoryIndex(nextIdx);
    setConfig(cloneConfig(history[nextIdx]));
  };

  const handleReset = () => {
    applyImmediateConfig({
      ...DEFAULT_PHOTO_RESTORATION_CONFIG,
      presetId: 'vintage-revival',
      intensity: 0,
      noiseReduction: 0,
      blurReduction: 0,
      sharpening: 0,
      detailTexture: 0,
      fadedColorRestore: 0,
      castNeutralize: 0,
      scratchDustReduction: 0,
      exposureRecovery: 0,
      brightness: 0,
      contrast: 0,
      shadowsRecovery: 0,
      highlightsRecovery: 0,
      spotStrokes: [],
    });
    setSpotBrushActive(false);
  };

  // Load image on source change
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setAnalysis(null);
    setLastExportMeta(null);

    loadImageElement(imageUrl)
      .then((img) => {
        if (cancelled) return;
        imgRef.current = img;
        setDims({ w: img.naturalWidth, h: img.naturalHeight });
        // Reset spot strokes when loading a brand-new photo
        setConfig((prev) => ({ ...prev, spotStrokes: [] }));
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('Could not load this image for restoration. Please pick a valid JPG, PNG, or WebP file.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  // Bounded live preview renderer (keeps Android mobile RAM lean)
  useEffect(() => {
    if (!imgRef.current) return;
    if (renderTimerRef.current) window.clearTimeout(renderTimerRef.current);

    renderTimerRef.current = window.setTimeout(() => {
      const img = imgRef.current;
      if (!img) return;
      setRendering(true);

      const maxPreviewDim = typeof window !== 'undefined' && window.innerWidth < 768 ? 640 : 820;
      const scratch = previewCanvasRef.current || document.createElement('canvas');
      try {
        const res = renderPhotoRestorationCanvas(img, scratch, config, {
          maxPreviewDim,
          showRepairMask: viewMode === 'repair-mask',
        });
        setRepairedDustCount(res.repairedDustPixels);
        if (viewMode === 'compare') {
          setPreviewDataUrl(scratch.toDataURL('image/jpeg', 0.92));
        }
      } finally {
        if (!previewCanvasRef.current) {
          releaseCanvasMemory(scratch);
        }
        setRendering(false);
      }
    }, 35);

    return () => {
      if (renderTimerRef.current) window.clearTimeout(renderTimerRef.current);
    };
  }, [config, viewMode, dims.w, dims.h]);

  useEffect(() => {
    return () => {
      if (sliderCommitTimerRef.current) window.clearTimeout(sliderCommitTimerRef.current);
      if (renderTimerRef.current) window.clearTimeout(renderTimerRef.current);
      releaseCanvasMemory(previewCanvasRef.current);
    };
  }, []);

  const handleAnalyzePhoto = () => {
    if (!imgRef.current) return;
    const report = analyzeOldPhotoDiagnostics(imgRef.current);
    setAnalysis(report);
    applyImmediateConfig({
      ...report.recommendedConfig,
      spotStrokes: config.spotStrokes,
    });
  };

  const applyPreset = (presetId: string) => {
    const preset = RESTORATION_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    applyImmediateConfig({
      ...config,
      ...preset.settings,
      presetId: preset.id,
    });
  };

  // Manual Spot-Heal Canvas Painting
  const paintSpotAtPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!spotBrushActive || viewMode === 'compare') return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const radius = spotBrushRadiusPct / 100;

    setConfig((prev) => {
      const last = prev.spotStrokes[prev.spotStrokes.length - 1];
      if (last && Math.hypot(last.x - nx, last.y - ny) < radius * 0.45) {
        return prev;
      }
      return {
        ...prev,
        intensity: prev.intensity === 0 ? 100 : prev.intensity,
        spotStrokes: [
          ...prev.spotStrokes,
          {
            id: `spot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            x: nx,
            y: ny,
            radius,
          },
        ],
      };
    });
  };

  const finishSpotStroke = () => {
    if (!isPaintingRef.current) return;
    isPaintingRef.current = false;
    setConfig((latest) => {
      commitHistorySnapshot(latest);
      return latest;
    });
  };

  // Full-resolution Save & Export
  const handleExport = async (
    forceDuplicate = false,
    triggerSource: 'save' | 'export' = 'export'
  ) => {
    if (!imgRef.current) return;
    const activeFmt = exportFormat;
    const activeQuality = activeFmt === 'png' ? 100 : jpgQuality;

    setGallerySaving(true);
    setGalleryProgress(10);
    setGalleryStage(`Processing full ${dims.w}×${dims.h} restoration (${activeFmt.toUpperCase()})...`);
    setGalleryResult(null);

    const outCanvas = document.createElement('canvas');
    try {
      // Yield 16ms so UI progress indicator paints smoothly on Android
      await new Promise((r) => window.setTimeout(r, 16));
      renderPhotoRestorationCanvas(imgRef.current, outCanvas, config);
      setGalleryProgress(58);
      setGalleryStage(`Encoding ${outCanvas.width}×${outCanvas.height} ${activeFmt.toUpperCase()}...`);

      const baseFileName = `dipti-restored-${outCanvas.width}x${outCanvas.height}-${Date.now()}`;

      if (!settings.autoSaveToGallery && triggerSource === 'export') {
        const { blob } = await encodeCanvasToBlob(outCanvas, activeFmt, activeQuality);
        const fileName = `${baseFileName}.${activeFmt}`;
        downloadExportedBlob(blob, fileName);
        setLastExportMeta({
          width: outCanvas.width,
          height: outCanvas.height,
          bytes: blob.size,
          format: activeFmt.toUpperCase(),
        });
        onRecordExport?.({
          id: `exp-restore-${Date.now()}`,
          fileName,
          mediaType: 'image',
          format: activeFmt,
          resolutionLabel: `${outCanvas.width}×${outCanvas.height}`,
          width: outCanvas.width,
          height: outCanvas.height,
          quality: activeQuality,
          fileSizeBytes: blob.size,
          status: 'completed',
          thumbnailDataUrl: createThumbnailDataUrl(outCanvas, 320),
          galleryDelivery: 'skipped-disabled',
          galleryLocationLabel: 'Manual Browser Download (Auto-Save OFF)',
          createdAt: new Date().toISOString(),
        });
        setGallerySaving(false);
        return;
      }

      const gRes = await exportCanvasViaGallery({
        canvas: outCanvas,
        baseFileName,
        format: activeFmt,
        qualityPercent: activeQuality,
        settings,
        triggerSource,
        forceDuplicate,
        onProgress: (pct, st) => {
          setGalleryProgress(pct);
          setGalleryStage(st);
        },
        onRecordExport: onRecordExport
          ? async (rec) => {
              onRecordExport(rec);
            }
          : undefined,
      });

      if (gRes.saved) {
        setLastExportMeta({
          width: outCanvas.width,
          height: outCanvas.height,
          bytes: gRes.sizeBytes,
          format: activeFmt.toUpperCase(),
        });
      }
      setGalleryResult(gRes);
    } finally {
      window.setTimeout(() => releaseCanvasMemory(outCanvas), 450);
      setGallerySaving(false);
    }
  };

  const handleSaveProject = async () => {
    if (!imgRef.current) return;
    const thumbCanvas = document.createElement('canvas');
    let thumbUrl = previewDataUrl;
    try {
      renderPhotoRestorationCanvas(imgRef.current, thumbCanvas, config, { maxPreviewDim: 480 });
      thumbUrl = createThumbnailDataUrl(thumbCanvas, 440) || previewDataUrl;
    } finally {
      releaseCanvasMemory(thumbCanvas);
    }

    const activePreset = RESTORATION_PRESETS.find((p) => p.id === config.presetId);
    const ok = await onSaveProject({
      id: `proj-restore-${Date.now()}`,
      name: `Restored · ${activePreset ? activePreset.name : 'Custom Recovery'}`,
      tool: 'photo-restoration',
      thumbnailDataUrl: thumbUrl,
      sourceImageUrl: imageUrl,
      width: dims.w,
      height: dims.h,
      photoRestorationState: cloneConfig(config),
      undoSteps: historyIndex,
      redoSteps: Math.max(0, history.length - 1 - historyIndex),
      updatedAt: new Date().toISOString(),
    });
    if (ok === false) return;
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 2000);

    if (settings.autoSaveToGallery) {
      await handleExport(false, 'save');
    }
  };

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  const isCustomOrInactive = config.intensity === 0;

  return (
    <div className="space-y-4 pb-24 lg:pb-8">
      <AssetPickerBar activeImageUrl={imageUrl} onSelectImage={onChangeImage} />

      {loadError && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-400/35 px-4 py-3 flex items-center gap-2.5 text-xs text-rose-200">
          <AlertTriangle className="w-4 h-4 text-rose-300 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left / Center Restoration Viewport */}
        <div className="lg:col-span-7 xl:col-span-8 rounded-2xl bg-[#080B14] border border-white/10 p-3 sm:p-4 space-y-3">
          {/* Top Viewport Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-[#05070D] border border-white/10">
              <button
                type="button"
                onClick={() => setViewMode('compare')}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                  viewMode === 'compare'
                    ? 'bg-gradient-to-r from-violet-600/80 to-amber-500/75 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <SplitSquareHorizontal className="w-3.5 h-3.5" />
                <span>Before / After</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('restored')}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                  viewMode === 'restored'
                    ? 'bg-violet-600/70 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Restored</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('repair-mask')}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                  viewMode === 'repair-mask'
                    ? 'bg-amber-500/25 border border-amber-400/50 text-amber-200'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Repair Overlay</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleUndo}
                disabled={!canUndo}
                title="Undo"
                className="min-h-[36px] px-2.5 rounded-lg bg-[#05070D] border border-white/10 text-xs text-slate-200 disabled:opacity-40 hover:border-amber-400/40 flex items-center gap-1 whitespace-nowrap cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Undo</span>
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={!canRedo}
                title="Redo"
                className="min-h-[36px] px-2.5 rounded-lg bg-[#05070D] border border-white/10 text-xs text-slate-200 disabled:opacity-40 hover:border-amber-400/40 flex items-center gap-1 whitespace-nowrap cursor-pointer"
              >
                <Redo2 className="w-3.5 h-3.5" />
                <span>Redo</span>
              </button>
              <button
                type="button"
                onClick={handleReset}
                title="Reset all adjustments to zero"
                className="min-h-[36px] px-2.5 rounded-lg bg-[#05070D] border border-white/10 text-xs text-slate-300 hover:text-amber-200 hover:border-amber-400/40 flex items-center gap-1 whitespace-nowrap cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* Resolution & Repair Telemetry Line */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono-tabular text-slate-400 px-0.5">
            <span>
              Original {dims.w}×{dims.h} · Output{' '}
              <strong className="text-amber-300">
                {dims.w}×{dims.h}px
              </strong>{' '}
              (Aspect Locked)
            </span>
            <span className="flex items-center gap-2">
              {rendering && <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-300" />}
              <span>
                {isCustomOrInactive
                  ? 'Bypass (0% intensity)'
                  : `Auto-repaired ${repairedDustCount.toLocaleString()} specks · ${config.spotStrokes.length} spot patches`}
              </span>
            </span>
          </div>

          {/* Canvas / Comparison Display */}
          <div className="relative h-[320px] sm:h-[470px] rounded-2xl bg-[#05070C] border border-white/10 overflow-hidden flex items-center justify-center">
            {viewMode === 'compare' ? (
              <div className="w-full h-full p-1">
                <BeforeAfterSlider
                  beforeSrc={imageUrl}
                  afterSrc={previewDataUrl}
                  beforeLabel="Original"
                  afterLabel={`Restored (${config.intensity}%)`}
                  enableZoom
                />
              </div>
            ) : (
              <canvas
                ref={previewCanvasRef}
                onPointerDown={(e) => {
                  if (!spotBrushActive) return;
                  (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
                  isPaintingRef.current = true;
                  paintSpotAtPointer(e);
                }}
                onPointerMove={(e) => {
                  if (!spotBrushActive || !isPaintingRef.current) return;
                  paintSpotAtPointer(e);
                }}
                onPointerUp={finishSpotStroke}
                onPointerCancel={finishSpotStroke}
                className={`max-w-full max-h-full object-contain touch-none ${
                  spotBrushActive ? 'cursor-crosshair' : 'cursor-default'
                }`}
              />
            )}

            {/* Keep hidden offscreen canvas mounted when in compare mode so previewCanvasRef stays stable */}
            {viewMode === 'compare' && (
              <canvas ref={previewCanvasRef} className="hidden" aria-hidden="true" />
            )}

            {viewMode === 'repair-mask' && (
              <div className="absolute bottom-3 left-3 right-3 sm:right-auto rounded-xl bg-black/80 backdrop-blur-md border border-white/15 px-3 py-1.5 text-[11px] text-slate-200 pointer-events-none">
                Gold = Auto dust/scratch outlier repairs · Violet = Manual spot-heal brush strokes
              </div>
            )}
          </div>

          {/* Interactive Spot-Heal Brush Strip */}
          <div className="rounded-xl bg-[#05070D] border border-white/[0.08] px-3 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const next = !spotBrushActive;
                  setSpotBrushActive(next);
                  if (next && viewMode === 'compare') {
                    setViewMode('restored');
                  }
                }}
                className={`min-h-[38px] px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                  spotBrushActive
                    ? 'bg-violet-600/30 border-violet-400 text-white'
                    : 'bg-white/[0.04] border-white/10 text-slate-200 hover:border-amber-400/40'
                }`}
              >
                <Brush className="w-3.5 h-3.5 text-amber-300" />
                <span>{spotBrushActive ? 'Spot-Heal Brush ON (Paint on Photo)' : 'Manual Spot-Heal Brush'}</span>
              </button>

              {config.spotStrokes.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    applyImmediateConfig({
                      ...config,
                      spotStrokes: [],
                    })
                  }
                  className="min-h-[38px] px-2.5 rounded-xl bg-white/[0.04] hover:bg-rose-500/15 border border-white/10 text-xs text-slate-300 hover:text-rose-200 flex items-center gap-1 whitespace-nowrap cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear {config.spotStrokes.length} Patches</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2.5 min-w-[180px]">
              <span className="text-[11px] text-slate-400 whitespace-nowrap">
                Patch Size <strong className="text-amber-300 font-mono-tabular">{spotBrushRadiusPct.toFixed(1)}%</strong>
              </span>
              <input
                type="range"
                min={1}
                max={7}
                step={0.3}
                value={spotBrushRadiusPct}
                onChange={(e) => setSpotBrushRadiusPct(Number(e.target.value))}
                className="w-28 accent-amber-400 cursor-pointer"
                aria-label="Spot-heal brush size"
              />
            </div>
          </div>

          {/* Export Format, Save & Gallery Actions */}
          <div className="rounded-xl bg-[#05070D] border border-white/[0.08] p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0B1020] border border-white/10">
                {(['jpg', 'png'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setExportFormat(fmt)}
                    className={`min-h-[34px] px-3 rounded-lg text-xs font-mono-tabular font-semibold uppercase cursor-pointer transition-colors ${
                      exportFormat === fmt
                        ? 'bg-amber-400/20 border border-amber-400/60 text-amber-200'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>

              {exportFormat === 'jpg' ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400 whitespace-nowrap">Quality</span>
                  <input
                    type="range"
                    min={75}
                    max={100}
                    step={1}
                    value={jpgQuality}
                    onChange={(e) => setJpgQuality(Number(e.target.value))}
                    className="w-20 accent-amber-400 cursor-pointer"
                    aria-label="JPG Export Quality"
                  />
                  <span className="font-mono-tabular text-amber-300 w-9">{jpgQuality}%</span>
                </div>
              ) : (
                <span className="text-[11px] text-slate-400 font-mono-tabular">Lossless PNG</span>
              )}

              {lastExportMeta && (
                <span className="text-[11px] font-mono-tabular text-emerald-300">
                  Last: {lastExportMeta.width}×{lastExportMeta.height} · {formatBytes(lastExportMeta.bytes)}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleSaveProject}
                disabled={gallerySaving}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-xs sm:text-sm font-semibold text-white flex items-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                {savedNotice ? <Check className="w-4 h-4 text-emerald-400" /> : <Save className="w-4 h-4 text-amber-300" />}
                <span>{savedNotice ? 'Saved to Projects' : 'Save Project'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleExport(false, 'export')}
                disabled={gallerySaving || dims.w === 0}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-amber-500 hover:brightness-110 text-xs sm:text-sm font-semibold text-white flex items-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                {gallerySaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span>Export {exportFormat.toUpperCase()}</span>
              </button>
            </div>
          </div>

          <GallerySaveBanner
            saving={gallerySaving}
            progressPct={galleryProgress}
            stageLabel={galleryStage}
            result={galleryResult}
            onSaveCopyAnyway={() => handleExport(true, 'export')}
            onDismiss={() => setGalleryResult(null)}
          />
        </div>

        {/* Right Controls Column */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          {/* Honest Local Engine Disclosure + Auto-Analyze */}
          <div className="rounded-2xl bg-[#0B1020]/90 backdrop-blur-xl border border-amber-400/25 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-amber-300" />
                <h2 className="font-display text-sm font-bold text-white">Local Old Photo Analyzer</h2>
              </div>
              <span className="text-[11px] font-mono-tabular text-violet-300">On-Device · Free</span>
            </div>

            <button
              type="button"
              onClick={handleAnalyzePhoto}
              disabled={dims.w === 0}
              className="w-full min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-amber-500 hover:brightness-110 disabled:opacity-50 text-xs sm:text-sm font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Analyze &amp; Auto-Restore Old Photo</span>
            </button>

            {analysis ? (
              <div className="rounded-xl bg-[#060812] border border-white/10 p-3 space-y-2 text-xs">
                <p className="text-slate-200 leading-relaxed">{analysis.summary}</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-mono-tabular text-slate-400 pt-1 border-t border-white/[0.06]">
                  <span>Range: <strong className="text-amber-300">{analysis.dynamicRangePct}%</strong></span>
                  <span>Fade: <strong className="text-violet-300">{analysis.fadeSeverityPct}%</strong></span>
                  <span>Noise: <strong className="text-slate-200">{analysis.estimatedNoisePct}%</strong></span>
                  <span>Softness: <strong className="text-slate-200">{analysis.softnessPct}%</strong></span>
                  <span>Dust Specks: <strong className="text-amber-300">{analysis.dustSpeckPct}%</strong></span>
                  <span>Cast: <strong className="text-slate-200">{analysis.colorCastShift}</strong></span>
                </div>
              </div>
            ) : null}

            <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] px-3 py-2 flex items-start gap-2 text-[11px] text-slate-300 leading-relaxed">
              <Info className="w-3.5 h-3.5 text-amber-300 shrink-0 mt-0.5" />
              <span>
                Runs deterministic Canvas math locally (percentile auto-levels, gray-world de-yellowing, bilateral denoising, directional dust/scratch repair &amp; deconvolution sharpening). Does not run generative neural AI to reconstruct torn/missing faces — use the Manual Spot-Heal Brush for creases or tears.
              </span>
            </div>
          </div>

          {/* Restoration Presets & Master Intensity */}
          <div className="rounded-2xl bg-[#0B1020]/90 backdrop-blur-xl border border-white/10 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-sm font-bold text-white">Old Photo Presets</h2>
              <span className="text-[11px] font-mono-tabular text-slate-400">
                {config.presetId === 'custom' ? 'Custom Mix' : 'Preset Active'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {RESTORATION_PRESETS.map((preset) => {
                const active = config.presetId === preset.id && config.intensity > 0;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset.id)}
                    className={`min-h-[54px] p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                      active
                        ? 'bg-violet-600/25 border-amber-400/65 text-white'
                        : 'bg-[#060812] border-white/10 text-slate-300 hover:border-white/25 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-xs font-semibold truncate">{preset.name}</span>
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: preset.accentColor }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5 truncate">{preset.subtitle}</p>
                  </button>
                );
              })}
            </div>

            <div className="pt-1 border-t border-white/[0.07]">
              <SliderControl
                label="Restoration Intensity"
                value={config.intensity}
                min={0}
                max={100}
                unit="%"
                defaultValue={85}
                onChange={(v) => updateSliderConfig({ intensity: v, presetId: config.presetId })}
              />
            </div>
          </div>

          {/* Detailed Controls Tabs */}
          <div className="rounded-2xl bg-[#0B1020]/90 backdrop-blur-xl border border-white/10 p-4 space-y-3">
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#060812] border border-white/10">
              <button
                type="button"
                onClick={() => setControlTab('clarity')}
                className={`min-h-[38px] rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  controlTab === 'clarity'
                    ? 'bg-gradient-to-r from-violet-600/75 to-amber-500/70 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Damage &amp; Clarity
              </button>
              <button
                type="button"
                onClick={() => setControlTab('color-tone')}
                className={`min-h-[38px] rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  controlTab === 'color-tone'
                    ? 'bg-gradient-to-r from-violet-600/75 to-amber-500/70 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Color &amp; Exposure
              </button>
            </div>

            {controlTab === 'clarity' ? (
              <div className="space-y-2.5">
                <SliderControl
                  label="Noise Reduction (Bilateral)"
                  value={config.noiseReduction}
                  min={0}
                  max={100}
                  unit="%"
                  defaultValue={28}
                  onChange={(v) => updateSliderConfig({ noiseReduction: v })}
                />
                <SliderControl
                  label="Blur Reduction (Deconvolution)"
                  value={config.blurReduction}
                  min={0}
                  max={100}
                  unit="%"
                  defaultValue={34}
                  onChange={(v) => updateSliderConfig({ blurReduction: v })}
                />
                <SliderControl
                  label="Fine Edge Sharpening"
                  value={config.sharpening}
                  min={0}
                  max={100}
                  unit="%"
                  defaultValue={26}
                  onChange={(v) => updateSliderConfig({ sharpening: v })}
                />
                <SliderControl
                  label="Detail & Texture Boost"
                  value={config.detailTexture}
                  min={0}
                  max={100}
                  unit="%"
                  defaultValue={30}
                  onChange={(v) => updateSliderConfig({ detailTexture: v })}
                />
                <SliderControl
                  label="Auto Scratch & Dust Clean"
                  value={config.scratchDustReduction}
                  min={0}
                  max={100}
                  unit="%"
                  defaultValue={38}
                  onChange={(v) => updateSliderConfig({ scratchDustReduction: v })}
                />
                <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
                  Auto scratch &amp; dust detection targets isolated pinholes, specks, and hairline marks. For thicker paper creases or stains, activate the Manual Spot-Heal Brush below the preview.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                <SliderControl
                  label="Faded Color Restoration"
                  value={config.fadedColorRestore}
                  min={0}
                  max={100}
                  unit="%"
                  defaultValue={48}
                  onChange={(v) => updateSliderConfig({ fadedColorRestore: v })}
                />
                <SliderControl
                  label="Yellow / Age Cast Removal"
                  value={config.castNeutralize}
                  min={0}
                  max={100}
                  unit="%"
                  defaultValue={35}
                  onChange={(v) => updateSliderConfig({ castNeutralize: v })}
                />
                <SliderControl
                  label="Exposure Recovery"
                  value={config.exposureRecovery}
                  min={-50}
                  max={50}
                  defaultValue={4}
                  onChange={(v) => updateSliderConfig({ exposureRecovery: v })}
                />
                <SliderControl
                  label="Brightness"
                  value={config.brightness}
                  min={-50}
                  max={50}
                  defaultValue={2}
                  onChange={(v) => updateSliderConfig({ brightness: v })}
                />
                <SliderControl
                  label="Contrast Recovery"
                  value={config.contrast}
                  min={-50}
                  max={50}
                  defaultValue={16}
                  onChange={(v) => updateSliderConfig({ contrast: v })}
                />
                <SliderControl
                  label="Shadows Recovery"
                  value={config.shadowsRecovery}
                  min={0}
                  max={100}
                  unit="%"
                  defaultValue={22}
                  onChange={(v) => updateSliderConfig({ shadowsRecovery: v })}
                />
                <SliderControl
                  label="Highlights Recovery"
                  value={config.highlightsRecovery}
                  min={0}
                  max={100}
                  unit="%"
                  defaultValue={18}
                  onChange={(v) => updateSliderConfig({ highlightsRecovery: v })}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
