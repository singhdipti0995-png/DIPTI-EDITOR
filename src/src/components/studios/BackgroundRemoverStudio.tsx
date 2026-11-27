import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Aperture,
  Check,
  Cpu,
  Download,
  Eraser,
  Eye,
  ImagePlus,
  Loader2,
  Paintbrush,
  Palette,
  Redo2,
  RotateCcw,
  Save,
  Scissors,
  Sparkles,
  SplitSquareHorizontal,
  Undo2,
  Wand2,
} from 'lucide-react';
import { STUDIO_ASSETS } from '../../data/studioCatalog';
import { AppSettings, ExportRecord, ProjectItem } from '../../types/editor';
import {
  BgBokehStyle,
  BgModelStatus,
  BgRemoverConfig,
  BgReplacementMode,
  BgSegmentationMask,
  DEFAULT_BG_REMOVER_CONFIG,
  renderBgRemoverComposition,
  runLocalBgSegmentation,
} from '../../utils/bgRemoverEngine';
import { createThumbnailDataUrl, loadImageElement } from '../../utils/canvasEngine';
import { downloadExportedBlob, encodeCanvasToBlob } from '../../utils/exportEngine';
import { GallerySaveResult, exportCanvasViaGallery } from '../../utils/gallerySaveEngine';
import { releaseCanvasMemory } from '../../utils/hdQualityEngine';
import { formatBytes } from '../../utils/indexedDbStorage';
import { AssetPickerBar } from '../AssetPickerBar';
import { BeforeAfterSlider } from '../BeforeAfterSlider';
import { GallerySaveBanner } from '../GallerySaveBanner';
import { SliderControl } from '../SliderControl';

interface BackgroundRemoverStudioProps {
  imageUrl: string;
  onChangeImage: (url: string) => void;
  settings: AppSettings;
  onSaveProject: (project: ProjectItem) => Promise<boolean> | void;
  onRecordExport?: (record: ExportRecord) => void;
}

const SOLID_SWATCHES = [
  { hex: '#090A10', label: 'Obsidian' },
  { hex: '#FFFFFF', label: 'Pure White' },
  { hex: '#D4AF37', label: 'Royal Gold' },
  { hex: '#6D28D9', label: 'Deep Purple' },
  { hex: '#1D4ED8', label: 'Cobalt' },
  { hex: '#1E293B', label: 'Slate Studio' },
];

const GRADIENT_PRESETS = [
  { label: 'Purple Luxury', start: '#6D28D9', end: '#06070B', angle: 145 },
  { label: 'Gold Noir', start: '#B4831D', end: '#07080D', angle: 135 },
  { label: 'Amethyst Gold', start: '#7C3AED', end: '#D4AF37', angle: 155 },
  { label: 'Midnight Navy', start: '#1E3A8A', end: '#04060B', angle: 160 },
  { label: 'Studio Silver', start: '#CBD5E1', end: '#334155', angle: 180 },
];

const MODE_OPTIONS: Array<{ id: BgReplacementMode; label: string }> = [
  { id: 'transparent', label: 'Transparent' },
  { id: 'solid', label: 'Solid Color' },
  { id: 'gradient', label: 'Gradient' },
  { id: 'blur', label: 'DSLR Blur' },
  { id: 'custom-image', label: 'Custom Photo' },
];

const BOKEH_STYLES: Array<{ id: BgBokehStyle; label: string }> = [
  { id: 'circular', label: 'Circular Bokeh' },
  { id: 'soft', label: 'Soft Creamy' },
  { id: 'cinematic', label: 'Cinematic Depth' },
];

function cloneConfig(cfg: BgRemoverConfig): BgRemoverConfig {
  return {
    ...cfg,
    refineStrokes: cfg.refineStrokes.map((s) => ({ ...s })),
  };
}

export const BackgroundRemoverStudio: React.FC<BackgroundRemoverStudioProps> = ({
  imageUrl,
  onChangeImage,
  settings,
  onSaveProject,
  onRecordExport,
}) => {
  const [config, setConfig] = useState<BgRemoverConfig>(() => cloneConfig(DEFAULT_BG_REMOVER_CONFIG));
  const [undoStack, setUndoStack] = useState<BgRemoverConfig[]>([]);
  const [redoStack, setRedoStack] = useState<BgRemoverConfig[]>([]);

  const [rightTab, setRightTab] = useState<'backdrop' | 'edges' | 'blur'>('backdrop');
  const [viewMode, setViewMode] = useState<'result' | 'compare' | 'mask'>('result');
  const [brushMode, setBrushMode] = useState<'none' | 'keep' | 'erase'>('none');
  const [brushSize, setBrushSize] = useState(24);
  const [exportFormat, setExportFormat] = useState<'png' | 'jpg' | 'webp'>('png');

  // Model & Segmentation State
  const [modelStatus, setModelStatus] = useState<BgModelStatus>('idle');
  const [modelProgressPct, setModelProgressPct] = useState(0);
  const [modelStageLabel, setModelStageLabel] = useState<string>('Ready for one-tap removal');
  const [maskData, setMaskData] = useState<BgSegmentationMask | null>(null);
  const [imageDims, setImageDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [loadError, setLoadError] = useState<string | null>(null);

  // Split Compare & Export State
  const [compareAfterUrl, setCompareAfterUrl] = useState<string>('');
  const [savedNotice, setSavedNotice] = useState(false);
  const [gallerySaving, setGallerySaving] = useState(false);
  const [galleryProgress, setGalleryProgress] = useState(0);
  const [galleryStage, setGalleryStage] = useState<string | null>(null);
  const [galleryResult, setGalleryResult] = useState<GallerySaveResult | null>(null);
  const [lastExportMeta, setLastExportMeta] = useState<{
    width: number;
    height: number;
    bytes: number;
    format: string;
  } | null>(null);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const customBgImgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compareCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const customBgInputRef = useRef<HTMLInputElement>(null);
  const customBgObjUrlRef = useRef<string | null>(null);
  const strokeCommitSnapshotRef = useRef<BgRemoverConfig | null>(null);
  const sliderStartSnapshotRef = useRef<BgRemoverConfig | null>(null);
  const sliderCommitTimerRef = useRef<number | null>(null);

  // Cleanup custom BG object URLs, timers & offscreen scratch canvas on unmount
  useEffect(() => {
    return () => {
      if (sliderCommitTimerRef.current) {
        window.clearTimeout(sliderCommitTimerRef.current);
      }
      if (customBgObjUrlRef.current) {
        URL.revokeObjectURL(customBgObjUrlRef.current);
      }
      if (compareCanvasRef.current) {
        releaseCanvasMemory(compareCanvasRef.current);
      }
    };
  }, []);

  const commitConfigChange = useCallback(
    (updater: (prev: BgRemoverConfig) => BgRemoverConfig) => {
      if (sliderCommitTimerRef.current) {
        window.clearTimeout(sliderCommitTimerRef.current);
        sliderCommitTimerRef.current = null;
      }
      setConfig((prev) => {
        const baseForUndo = sliderStartSnapshotRef.current ?? cloneConfig(prev);
        sliderStartSnapshotRef.current = null;
        const next = updater(prev);
        setUndoStack((u) => [...u.slice(-29), baseForUndo]);
        setRedoStack([]);
        return next;
      });
    },
    []
  );

  const updateSliderConfig = useCallback(
    (updater: (prev: BgRemoverConfig) => BgRemoverConfig) => {
      setConfig((prev) => {
        if (!sliderStartSnapshotRef.current) {
          sliderStartSnapshotRef.current = cloneConfig(prev);
        }
        return updater(prev);
      });
      if (sliderCommitTimerRef.current) {
        window.clearTimeout(sliderCommitTimerRef.current);
      }
      sliderCommitTimerRef.current = window.setTimeout(() => {
        const snap = sliderStartSnapshotRef.current;
        sliderStartSnapshotRef.current = null;
        sliderCommitTimerRef.current = null;
        if (snap) {
          setUndoStack((u) => [...u.slice(-29), snap]);
          setRedoStack([]);
        }
      }, 420);
    },
    []
  );

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((u) => u.slice(0, -1));
    setRedoStack((r) => [cloneConfig(config), ...r.slice(0, 29)]);
    setConfig(cloneConfig(previous));
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[0];
    setRedoStack((r) => r.slice(1));
    setUndoStack((u) => [...u.slice(-29), cloneConfig(config)]);
    setConfig(cloneConfig(next));
  };

  const handleReset = () => {
    commitConfigChange(() => cloneConfig(DEFAULT_BG_REMOVER_CONFIG));
    setBrushMode('none');
    setViewMode('result');
    setGalleryResult(null);
  };

  const renderPreview = useCallback(
    (cfg: BgRemoverConfig, currentMask: BgSegmentationMask | null, mode: 'result' | 'compare' | 'mask') => {
      const img = imgRef.current;
      if (!img) return;

      if (canvasRef.current) {
        renderBgRemoverComposition(img, canvasRef.current, currentMask, cfg, {
          maxPreviewDim: 840,
          customBgImg: customBgImgRef.current,
          showMaskOverlay: mode === 'mask',
        });
      }

      if (mode === 'compare') {
        if (!compareCanvasRef.current) {
          compareCanvasRef.current = document.createElement('canvas');
        }
        renderBgRemoverComposition(img, compareCanvasRef.current, currentMask, cfg, {
          maxPreviewDim: 840,
          customBgImg: customBgImgRef.current,
          showMaskOverlay: false,
        });
        setCompareAfterUrl(compareCanvasRef.current.toDataURL('image/png'));
      }
    },
    []
  );

  const executeLocalSegmentation = useCallback(
    async (autoEnableCutout: boolean) => {
      const img = imgRef.current;
      if (!img) return;

      setLoadError(null);
      setModelStatus('loading-model');
      setModelProgressPct(12);
      setModelStageLabel('Loading local open-source MediaPipe segmentation model...');

      const result = await runLocalBgSegmentation(img, (pct, stage) => {
        setModelProgressPct(pct);
        setModelStageLabel(stage);
        setModelStatus(pct >= 60 && pct < 100 ? 'running' : 'loading-model');
      });

      setMaskData(result);
      if (result.available) {
        setModelStatus('ready');
        setModelProgressPct(100);
        setModelStageLabel(result.statusMessage);
        if (autoEnableCutout) {
          commitConfigChange((prev) => ({
            ...prev,
            backgroundRemoved: true,
          }));
        }
      } else {
        setModelStatus('unavailable');
        setModelProgressPct(0);
        setModelStageLabel(result.statusMessage);
        setLoadError(result.limitationReason || result.statusMessage);
      }
    },
    [commitConfigChange]
  );

  // Load main image when imageUrl changes & run local segmentation automatically for instant readiness
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setGalleryResult(null);
    setLastExportMeta(null);
    setUndoStack([]);
    setRedoStack([]);
    setConfig(cloneConfig(DEFAULT_BG_REMOVER_CONFIG));

    loadImageElement(imageUrl)
      .then(async (img) => {
        if (cancelled) return;
        imgRef.current = img;
        setImageDims({ w: img.naturalWidth, h: img.naturalHeight });
        renderPreview(DEFAULT_BG_REMOVER_CONFIG, null, viewMode);

        setModelStatus('loading-model');
        setModelProgressPct(15);
        setModelStageLabel('Initializing local MediaPipe Selfie Segmenter...');
        const seg = await runLocalBgSegmentation(img, (pct, stage) => {
          if (cancelled) return;
          setModelProgressPct(pct);
          setModelStageLabel(stage);
          setModelStatus(pct >= 60 && pct < 100 ? 'running' : 'loading-model');
        });
        if (cancelled) return;

        setMaskData(seg);
        if (seg.available) {
          setModelStatus('ready');
          setModelProgressPct(100);
          setModelStageLabel(seg.statusMessage);
          const autoCfg: BgRemoverConfig = {
            ...DEFAULT_BG_REMOVER_CONFIG,
            backgroundRemoved: true,
          };
          setConfig(autoCfg);
          renderPreview(autoCfg, seg, viewMode);
        } else {
          setModelStatus('unavailable');
          setModelProgressPct(0);
          setModelStageLabel(seg.statusMessage);
          setLoadError(seg.limitationReason || seg.statusMessage);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('Unable to load the selected image.');
          setModelStatus('unavailable');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  // Load custom background image when config.customBgUrl changes
  useEffect(() => {
    if (!config.customBgUrl) {
      customBgImgRef.current = null;
      renderPreview(config, maskData, viewMode);
      return;
    }
    let cancelled = false;
    loadImageElement(config.customBgUrl)
      .then((bgImg) => {
        if (cancelled) return;
        customBgImgRef.current = bgImg;
        renderPreview(config, maskData, viewMode);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('Unable to decode custom background image.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [config.customBgUrl]);

  // Re-render preview whenever config, mask, or view mode changes
  useEffect(() => {
    renderPreview(config, maskData, viewMode);
  }, [config, maskData, viewMode, renderPreview]);

  // If user switches to transparent mode, enforce PNG export automatically
  useEffect(() => {
    if (config.backgroundMode === 'transparent' && exportFormat === 'jpg') {
      setExportFormat('png');
    }
  }, [config.backgroundMode, exportFormat]);

  const handleCustomBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (customBgObjUrlRef.current) {
      URL.revokeObjectURL(customBgObjUrlRef.current);
    }
    const objUrl = URL.createObjectURL(file);
    customBgObjUrlRef.current = objUrl;
    commitConfigChange((prev) => ({
      ...prev,
      backgroundRemoved: true,
      backgroundMode: 'custom-image',
      customBgUrl: objUrl,
    }));
    e.target.value = '';
  };

  const paintStrokeAtPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (brushMode === 'none') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;

    setConfig((prev) => ({
      ...prev,
      backgroundRemoved: true,
      refineStrokes: [
        ...prev.refineStrokes,
        {
          mode: brushMode,
          x,
          y,
          radius: brushSize / 600,
        },
      ],
    }));
  };

  const handleOneTapRemoveOrRestore = async () => {
    if (config.backgroundRemoved) {
      commitConfigChange((prev) => ({ ...prev, backgroundRemoved: false }));
      return;
    }
    if (maskData?.available) {
      commitConfigChange((prev) => ({ ...prev, backgroundRemoved: true }));
    } else {
      await executeLocalSegmentation(true);
    }
  };

  const handleExport = async (
    forceDuplicate = false,
    triggerSource: 'save' | 'export' | 'manual' = 'export'
  ) => {
    const img = imgRef.current;
    if (!img) return;

    const chosenFmt: 'png' | 'jpg' | 'webp' =
      config.backgroundMode === 'transparent' && exportFormat === 'jpg' ? 'png' : exportFormat;

    setGallerySaving(true);
    setGalleryProgress(10);
    setGalleryStage(
      `Rendering full-resolution ${img.naturalWidth}×${img.naturalHeight} ${chosenFmt.toUpperCase()}...`
    );
    setGalleryResult(null);

    const outCanvas = document.createElement('canvas');
    try {
      const { outW, outH } = renderBgRemoverComposition(img, outCanvas, maskData, config, {
        customBgImg: customBgImgRef.current,
        showMaskOverlay: false,
      });

      const baseFileName = `dipti-bg-removed-${outW}x${outH}-${Date.now()}`;
      const qualityPct = chosenFmt === 'png' ? 100 : 96;

      if (!settings.autoSaveToGallery && triggerSource === 'export') {
        const { blob } = await encodeCanvasToBlob(outCanvas, chosenFmt, qualityPct);
        const fileName = `${baseFileName}.${chosenFmt}`;
        downloadExportedBlob(blob, fileName);
        setLastExportMeta({ width: outW, height: outH, bytes: blob.size, format: chosenFmt.toUpperCase() });
        onRecordExport?.({
          id: `exp-bg-${Date.now()}`,
          fileName,
          mediaType: 'image',
          format: chosenFmt,
          resolutionLabel: `${outW}×${outH}`,
          width: outW,
          height: outH,
          quality: qualityPct,
          fileSizeBytes: blob.size,
          status: 'completed',
          thumbnailDataUrl: createThumbnailDataUrl(outCanvas, 320),
          galleryDelivery: 'skipped-disabled',
          galleryLocationLabel: 'Manual Browser Download (Auto-Save OFF)',
          createdAt: new Date().toISOString(),
        });
        return;
      }

      const gRes = await exportCanvasViaGallery({
        canvas: outCanvas,
        baseFileName,
        format: chosenFmt,
        qualityPercent: qualityPct,
        settings,
        triggerSource,
        forceDuplicate,
        onProgress: (pct, stage) => {
          setGalleryProgress(pct);
          setGalleryStage(stage);
        },
        onRecordExport: onRecordExport ? async (rec) => { onRecordExport(rec); } : undefined,
      });
      setGalleryResult(gRes);
      if (gRes.saved) {
        setLastExportMeta({
          width: outW,
          height: outH,
          bytes: gRes.sizeBytes,
          format: chosenFmt.toUpperCase(),
        });
      }
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Failed to render full-resolution cutout export.'
      );
    } finally {
      releaseCanvasMemory(outCanvas);
      setGallerySaving(false);
    }
  };

  const handleSaveProject = async () => {
    const img = imgRef.current;
    if (!canvasRef.current || !img) return;
    const thumb = createThumbnailDataUrl(canvasRef.current, 480);
    const ok = await onSaveProject({
      id: `proj-bg-${Date.now()}`,
      name: `BG Cutout (${config.backgroundMode})`,
      tool: 'bg-remover',
      thumbnailDataUrl: thumb || imageUrl,
      sourceImageUrl: imageUrl,
      width: img.naturalWidth || canvasRef.current.width,
      height: img.naturalHeight || canvasRef.current.height,
      updatedAt: new Date().toISOString(),
    });
    if (ok === false) return;
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);

    if (settings.autoSaveToGallery) {
      await handleExport(false, 'save');
    }
  };

  const effectiveFormat = useMemo(
    () => (config.backgroundMode === 'transparent' && exportFormat === 'jpg' ? 'png' : exportFormat),
    [config.backgroundMode, exportFormat]
  );

  return (
    <div className="space-y-4 pb-24 lg:pb-8">
      <input
        ref={customBgInputRef}
        type="file"
        accept="image/*"
        onChange={handleCustomBgUpload}
        className="hidden"
      />

      <AssetPickerBar activeImageUrl={imageUrl} onSelectImage={onChangeImage} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT STAGE: Subject Preview, Split Compare, Mask View & Export */}
        <div className="lg:col-span-7 xl:col-span-8 rounded-2xl bg-[#080B14] border border-amber-400/20 p-3 sm:p-4 space-y-3">
          {/* Top Stage Toolbar: View Modes + Undo / Redo / Reset */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {(
                [
                  { id: 'result', label: 'Subject Preview', icon: <Scissors className="w-3.5 h-3.5" /> },
                  { id: 'compare', label: 'Before / After', icon: <SplitSquareHorizontal className="w-3.5 h-3.5" /> },
                  { id: 'mask', label: 'Subject Mask', icon: <Eye className="w-3.5 h-3.5" /> },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setViewMode(m.id)}
                  className={`min-h-[42px] px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                    viewMode === m.id
                      ? 'bg-gradient-to-r from-violet-600/35 to-amber-500/20 border-amber-400/65 text-white'
                      : 'bg-[#06070B] border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  <span className={viewMode === m.id ? 'text-amber-300' : 'text-slate-400'}>
                    {m.icon}
                  </span>
                  <span>{m.label}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={undoStack.length === 0}
                onClick={handleUndo}
                aria-label="Undo"
                title="Undo"
                className="min-h-[42px] min-w-[42px] px-2.5 rounded-xl bg-[#06070B] border border-white/10 text-xs text-slate-200 disabled:opacity-35 flex items-center justify-center gap-1 cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Undo</span>
              </button>
              <button
                type="button"
                disabled={redoStack.length === 0}
                onClick={handleRedo}
                aria-label="Redo"
                title="Redo"
                className="min-h-[42px] min-w-[42px] px-2.5 rounded-xl bg-[#06070B] border border-white/10 text-xs text-slate-200 disabled:opacity-35 flex items-center justify-center gap-1 cursor-pointer"
              >
                <Redo2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Redo</span>
              </button>
              <button
                type="button"
                onClick={handleReset}
                aria-label="Reset edits"
                title="Reset"
                className="min-h-[42px] px-3 rounded-xl bg-[#06070B] border border-white/10 hover:border-amber-400/45 text-xs text-slate-300 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-300" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* Model Progress Bar during initialization / inference */}
          {(modelStatus === 'loading-model' || modelStatus === 'running') && (
            <div className="rounded-xl bg-[#0B1020] border border-violet-400/35 px-3.5 py-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs text-amber-200">
                <span className="flex items-center gap-2 min-w-0">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300 shrink-0" />
                  <span className="truncate">{modelStageLabel}</span>
                </span>
                <span className="font-mono-tabular font-semibold text-amber-300 shrink-0">
                  {modelProgressPct}%
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 via-purple-400 to-amber-400 transition-all duration-150"
                  style={{ width: `${Math.max(8, Math.min(100, modelProgressPct))}%` }}
                />
              </div>
            </div>
          )}

          {/* Honest Error or Model Limitation Notice (Never fake AI!) */}
          {(loadError || maskData?.limitationReason) && (
            <div
              className={`rounded-xl px-3.5 py-2.5 flex items-start gap-2.5 text-xs border ${
                modelStatus === 'unavailable'
                  ? 'bg-rose-500/12 border-rose-400/40 text-rose-100'
                  : 'bg-amber-500/10 border-amber-400/35 text-amber-100'
              }`}
            >
              {modelStatus === 'unavailable' ? (
                <AlertCircle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1 leading-relaxed">
                <p>{loadError || maskData?.limitationReason}</p>
              </div>
            </div>
          )}

          {/* Canvas / Split Compare Viewport */}
          <div className="relative min-h-[320px] sm:min-h-[440px] rounded-xl bg-checkerboard border border-white/10 overflow-hidden flex items-center justify-center p-2">
            {viewMode === 'compare' && compareAfterUrl ? (
              <div className="w-full h-full min-h-[340px]">
                <BeforeAfterSlider
                  beforeSrc={imageUrl}
                  afterSrc={compareAfterUrl}
                  beforeLabel="Original"
                  afterLabel={config.backgroundRemoved ? 'AI Cutout' : 'Unchanged'}
                  enableZoom={true}
                />
              </div>
            ) : (
              <canvas
                ref={canvasRef}
                onPointerDown={(e) => {
                  if (brushMode !== 'none') {
                    strokeCommitSnapshotRef.current = cloneConfig(config);
                    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
                    paintStrokeAtPointer(e);
                  }
                }}
                onPointerMove={(e) => {
                  if (brushMode !== 'none' && (e.buttons === 1 || e.pointerType === 'touch')) {
                    paintStrokeAtPointer(e);
                  }
                }}
                onPointerUp={() => {
                  if (strokeCommitSnapshotRef.current) {
                    const snap = strokeCommitSnapshotRef.current;
                    strokeCommitSnapshotRef.current = null;
                    setUndoStack((u) => [...u.slice(-29), snap]);
                    setRedoStack([]);
                  }
                }}
                className={`max-w-full max-h-[500px] object-contain rounded-lg ${
                  brushMode !== 'none' ? 'cursor-crosshair touch-none' : ''
                }`}
              />
            )}

            {/* Resolution Readout Overlay */}
            {imageDims.w > 0 && (
              <span className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-black/75 border border-white/15 text-[11px] font-mono-tabular text-slate-200 pointer-events-none">
                {imageDims.w}×{imageDims.h}px · Original Res Locked
              </span>
            )}
          </div>

          {/* Export Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSaveProject}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-xs sm:text-sm font-semibold text-white flex items-center gap-2 whitespace-nowrap cursor-pointer"
              >
                {savedNotice ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Save className="w-4 h-4 text-amber-300" />
                )}
                <span>{savedNotice ? 'Saved to Projects' : 'Save Cutout'}</span>
              </button>

              <div className="flex items-center rounded-xl bg-[#06070B] border border-white/10 p-1">
                {(['png', 'jpg', 'webp'] as const).map((fmt) => {
                  const disabled = fmt === 'jpg' && config.backgroundMode === 'transparent';
                  const active = effectiveFormat === fmt;
                  return (
                    <button
                      key={fmt}
                      type="button"
                      disabled={disabled}
                      onClick={() => setExportFormat(fmt)}
                      title={
                        disabled
                          ? 'JPG does not support transparency — select PNG or WebP'
                          : `Export ${fmt.toUpperCase()}`
                      }
                      className={`min-h-[36px] px-2.5 rounded-lg text-[11px] font-semibold uppercase cursor-pointer disabled:opacity-30 ${
                        active
                          ? 'bg-amber-400/20 text-amber-200 border border-amber-400/50'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {fmt}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              disabled={gallerySaving}
              onClick={() => handleExport(false, 'export')}
              className="min-h-[46px] px-5 py-2 rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-amber-500 hover:brightness-110 disabled:opacity-50 text-xs sm:text-sm font-semibold text-white flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              {gallerySaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>
                {config.backgroundMode === 'transparent'
                  ? `Export Transparent ${effectiveFormat.toUpperCase()}`
                  : `Export Full-Res ${effectiveFormat.toUpperCase()}`}
              </span>
            </button>
          </div>

          {lastExportMeta && (
            <p className="text-[11px] font-mono-tabular text-emerald-300">
              Exported {lastExportMeta.width}×{lastExportMeta.height}px · {lastExportMeta.format} ·{' '}
              {formatBytes(lastExportMeta.bytes)}
            </p>
          )}

          <GallerySaveBanner
            saving={gallerySaving}
            progressPct={galleryProgress}
            stageLabel={galleryStage}
            result={galleryResult}
            onSaveCopyAnyway={() => handleExport(true, 'export')}
            onDismiss={() => setGalleryResult(null)}
          />
        </div>

        {/* RIGHT INSPECTOR: One-Tap AI Removal, Backdrops, Hair & Edge Refine, DSLR Blur */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          {/* One-Tap Local AI Segmentation Card */}
          <div className="rounded-2xl bg-[#0B0D16]/95 border border-amber-400/25 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-sm font-bold text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-amber-300" />
                <span>Local Neural Segmentation</span>
              </h2>
              <span className="text-[11px] font-mono-tabular text-amber-300">
                {maskData?.available ? `${maskData.coveragePercent}% Subject` : 'On-Device'}
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              {maskData?.available
                ? maskData.statusMessage
                : 'Runs free open-source MediaPipe Selfie Segmenter locally on-device with zero cloud APIs.'}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
              <button
                type="button"
                disabled={modelStatus === 'loading-model' || modelStatus === 'running'}
                onClick={handleOneTapRemoveOrRestore}
                className="w-full min-h-[48px] px-4 rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-amber-500 hover:brightness-110 disabled:opacity-50 text-xs sm:text-sm font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
              >
                {modelStatus === 'loading-model' || modelStatus === 'running' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4" />
                )}
                <span>
                  {config.backgroundRemoved
                    ? 'Show Original Background'
                    : 'One-Tap Remove Background'}
                </span>
              </button>

              <button
                type="button"
                disabled={modelStatus === 'loading-model' || modelStatus === 'running'}
                onClick={() => executeLocalSegmentation(true)}
                className="w-full min-h-[42px] px-3 rounded-xl bg-[#06070B] hover:bg-white/[0.06] border border-white/15 text-xs font-medium text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Re-Run Local AI Segmentation</span>
              </button>
            </div>
          </div>

          {/* Control Tabs */}
          <div className="rounded-2xl bg-[#0B0D16]/95 border border-white/10 p-1.5 grid grid-cols-3 gap-1.5">
            {(
              [
                { id: 'backdrop', label: 'Background', icon: <Palette className="w-3.5 h-3.5" /> },
                { id: 'edges', label: 'Hair & Edge', icon: <Scissors className="w-3.5 h-3.5" /> },
                { id: 'blur', label: 'DSLR Blur', icon: <Aperture className="w-3.5 h-3.5" /> },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setRightTab(t.id)}
                className={`min-h-[44px] px-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                  rightTab === t.id
                    ? 'bg-violet-600/30 border-amber-400/65 text-white'
                    : 'bg-[#06070B] border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                <span className={rightTab === t.id ? 'text-amber-300' : 'text-slate-400'}>
                  {t.icon}
                </span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {/* TAB 1: BACKGROUNDS (Transparent, Solid, Gradient, Blur, Custom Photo) */}
          {rightTab === 'backdrop' && (
            <div className="rounded-2xl bg-[#0B0D16]/90 border border-white/10 p-4 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-2">
                {MODE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      commitConfigChange((prev) => ({
                        ...prev,
                        backgroundRemoved: true,
                        backgroundMode: opt.id,
                      }))
                    }
                    className={`min-h-[44px] px-3 rounded-xl border text-xs font-semibold text-left cursor-pointer transition-colors ${
                      config.backgroundMode === opt.id
                        ? 'bg-amber-400/15 border-amber-400/70 text-white'
                        : 'bg-[#06070B] border-white/10 text-slate-300 hover:border-white/25'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {config.backgroundMode === 'transparent' && (
                <p className="text-xs text-slate-400 leading-relaxed">
                  Exports with full alpha transparency (<strong className="text-white">PNG / WebP</strong>) at original source resolution.
                </p>
              )}

              {config.backgroundMode === 'solid' && (
                <div className="space-y-3 border-t border-white/[0.08] pt-3">
                  <p className="text-xs font-medium text-slate-300">Solid Background Color</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {SOLID_SWATCHES.map((s) => (
                      <button
                        key={s.hex}
                        type="button"
                        onClick={() =>
                          commitConfigChange((prev) => ({
                            ...prev,
                            backgroundRemoved: true,
                            backgroundMode: 'solid',
                            solidColor: s.hex,
                          }))
                        }
                        title={s.label}
                        className={`w-9 h-9 rounded-xl border cursor-pointer ${
                          config.solidColor.toUpperCase() === s.hex
                            ? 'border-amber-300 ring-2 ring-amber-400/50'
                            : 'border-white/25'
                        }`}
                        style={{ backgroundColor: s.hex }}
                      />
                    ))}
                    <input
                      type="color"
                      value={config.solidColor}
                      onChange={(e) =>
                        commitConfigChange((prev) => ({
                          ...prev,
                          backgroundRemoved: true,
                          backgroundMode: 'solid',
                          solidColor: e.target.value,
                        }))
                      }
                      aria-label="Custom solid background color"
                      className="w-10 h-9 rounded-lg bg-transparent border border-white/20 cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {config.backgroundMode === 'gradient' && (
                <div className="space-y-3 border-t border-white/[0.08] pt-3">
                  <p className="text-xs font-medium text-slate-300">Gradient Backdrops</p>
                  <div className="grid grid-cols-2 gap-2">
                    {GRADIENT_PRESETS.map((g) => (
                      <button
                        key={g.label}
                        type="button"
                        onClick={() =>
                          commitConfigChange((prev) => ({
                            ...prev,
                            backgroundRemoved: true,
                            backgroundMode: 'gradient',
                            gradientStart: g.start,
                            gradientEnd: g.end,
                            gradientAngle: g.angle,
                          }))
                        }
                        className="min-h-[42px] px-2.5 rounded-xl bg-[#06070B] border border-white/10 hover:border-amber-400/55 flex items-center gap-2 text-left cursor-pointer"
                      >
                        <span
                          className="w-5 h-5 rounded-md border border-white/20 shrink-0"
                          style={{
                            background: `linear-gradient(${g.angle}deg, ${g.start}, ${g.end})`,
                          }}
                        />
                        <span className="text-[11px] font-medium text-slate-200 truncate">
                          {g.label}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <label className="text-[11px] text-slate-400 flex items-center justify-between gap-2 bg-[#06070B] border border-white/10 rounded-xl px-3 py-2">
                      <span>Start</span>
                      <input
                        type="color"
                        value={config.gradientStart}
                        onChange={(e) =>
                          commitConfigChange((prev) => ({
                            ...prev,
                            gradientStart: e.target.value,
                          }))
                        }
                        className="w-8 h-7 rounded bg-transparent cursor-pointer"
                      />
                    </label>
                    <label className="text-[11px] text-slate-400 flex items-center justify-between gap-2 bg-[#06070B] border border-white/10 rounded-xl px-3 py-2">
                      <span>End</span>
                      <input
                        type="color"
                        value={config.gradientEnd}
                        onChange={(e) =>
                          commitConfigChange((prev) => ({
                            ...prev,
                            gradientEnd: e.target.value,
                          }))
                        }
                        className="w-8 h-7 rounded bg-transparent cursor-pointer"
                      />
                    </label>
                  </div>

                  <SliderControl
                    label="Gradient Angle"
                    value={config.gradientAngle}
                    min={0}
                    max={360}
                    defaultValue={145}
                    unit="°"
                    onChange={(v) =>
                      updateSliderConfig((prev) => ({ ...prev, gradientAngle: v }))
                    }
                  />
                </div>
              )}

              {config.backgroundMode === 'custom-image' && (
                <div className="space-y-3 border-t border-white/[0.08] pt-3">
                  <button
                    type="button"
                    onClick={() => customBgInputRef.current?.click()}
                    className="w-full min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-violet-600/35 to-amber-500/25 hover:brightness-110 border border-amber-400/50 text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <ImagePlus className="w-4 h-4 text-amber-300" />
                    <span>Upload Custom Background Photo</span>
                  </button>

                  <p className="text-[11px] text-slate-400">Or choose a Studio Scene:</p>
                  <div className="grid grid-cols-3 gap-2">
                    {STUDIO_ASSETS.slice(0, 6).map((asset) => (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() =>
                          commitConfigChange((prev) => ({
                            ...prev,
                            backgroundRemoved: true,
                            backgroundMode: 'custom-image',
                            customBgUrl: asset.url,
                          }))
                        }
                        className={`aspect-[16/10] rounded-lg overflow-hidden border cursor-pointer ${
                          config.customBgUrl === asset.url
                            ? 'border-amber-400 ring-1 ring-amber-400'
                            : 'border-white/10'
                        }`}
                      >
                        <img
                          src={asset.url}
                          alt={asset.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {config.backgroundMode === 'blur' && (
                <div className="space-y-2 border-t border-white/[0.08] pt-3">
                  <SliderControl
                    label="DSLR Background Blur"
                    value={config.blurIntensity}
                    min={0}
                    max={100}
                    defaultValue={68}
                    unit="%"
                    onChange={(v) => updateSliderConfig((prev) => ({ ...prev, blurIntensity: v }))}
                  />
                </div>
              )}
            </div>
          )}

          {/* TAB 2: HAIR DETAIL & EDGE REFINEMENT */}
          {rightTab === 'edges' && (
            <div className="rounded-2xl bg-[#0B0D16]/90 border border-white/10 p-4 space-y-4">
              <div className="space-y-1">
                <SliderControl
                  label="Hair Detail Preservation"
                  value={config.hairRefinement}
                  min={0}
                  max={100}
                  defaultValue={70}
                  unit="%"
                  onChange={(v) => updateSliderConfig((prev) => ({ ...prev, hairRefinement: v }))}
                />
                <SliderControl
                  label="Hair Fringe Decontaminate"
                  value={config.hairDecontaminate}
                  min={0}
                  max={100}
                  defaultValue={45}
                  unit="%"
                  onChange={(v) => updateSliderConfig((prev) => ({ ...prev, hairDecontaminate: v }))}
                />
                <SliderControl
                  label="Subject Edge Shift"
                  value={config.subjectEdgeShift}
                  min={-20}
                  max={20}
                  defaultValue={0}
                  onChange={(v) => updateSliderConfig((prev) => ({ ...prev, subjectEdgeShift: v }))}
                />
                <SliderControl
                  label="Edge Feather"
                  value={config.edgeFeather}
                  min={0}
                  max={6}
                  step={0.5}
                  defaultValue={1.5}
                  unit="px"
                  onChange={(v) => updateSliderConfig((prev) => ({ ...prev, edgeFeather: v }))}
                />
              </div>

              <div className="space-y-2.5 pt-3 border-t border-white/[0.08]">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-200">Manual Touch Refine Brush</p>
                  {config.refineStrokes.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        commitConfigChange((prev) => ({ ...prev, refineStrokes: [] }))
                      }
                      className="text-[11px] text-amber-300 hover:underline cursor-pointer"
                    >
                      Clear ({config.refineStrokes.length})
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setBrushMode('none')}
                    className={`min-h-[42px] rounded-xl border text-xs font-medium cursor-pointer ${
                      brushMode === 'none'
                        ? 'bg-white/15 border-white/35 text-white'
                        : 'bg-[#06070B] border-white/10 text-slate-400'
                    }`}
                  >
                    Pan / Off
                  </button>
                  <button
                    type="button"
                    onClick={() => setBrushMode('keep')}
                    className={`min-h-[42px] rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
                      brushMode === 'keep'
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                        : 'bg-[#06070B] border-white/10 text-slate-400'
                    }`}
                  >
                    <Paintbrush className="w-3.5 h-3.5" />
                    <span>Keep</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBrushMode('erase')}
                    className={`min-h-[42px] rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
                      brushMode === 'erase'
                        ? 'bg-rose-500/20 border-rose-400 text-rose-200'
                        : 'bg-[#06070B] border-white/10 text-slate-400'
                    }`}
                  >
                    <Eraser className="w-3.5 h-3.5" />
                    <span>Erase</span>
                  </button>
                </div>

                {brushMode !== 'none' && (
                  <SliderControl
                    label="Brush Size"
                    value={brushSize}
                    min={8}
                    max={64}
                    defaultValue={24}
                    unit="px"
                    onChange={setBrushSize}
                  />
                )}
              </div>
            </div>
          )}

          {/* TAB 3: DSLR BACKGROUND BLUR */}
          {rightTab === 'blur' && (
            <div className="rounded-2xl bg-[#0B0D16]/90 border border-white/10 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-bold text-white flex items-center gap-2">
                  <Aperture className="w-4 h-4 text-amber-300" />
                  <span>DSLR Lens Blur &amp; Bokeh</span>
                </h3>
                {config.backgroundMode !== 'blur' && config.backgroundMode !== 'custom-image' && (
                  <button
                    type="button"
                    onClick={() =>
                      commitConfigChange((prev) => ({
                        ...prev,
                        backgroundRemoved: true,
                        backgroundMode: 'blur',
                      }))
                    }
                    className="min-h-[34px] px-2.5 rounded-lg bg-amber-400/15 border border-amber-400/50 text-[11px] font-semibold text-amber-200 cursor-pointer"
                  >
                    Activate Scene Blur
                  </button>
                )}
              </div>

              <SliderControl
                label="Background Blur Intensity"
                value={config.blurIntensity}
                min={0}
                max={100}
                defaultValue={68}
                unit="%"
                onChange={(v) =>
                  updateSliderConfig((prev) => ({
                    ...prev,
                    backgroundRemoved: true,
                    backgroundMode:
                      prev.backgroundMode === 'custom-image' ? 'custom-image' : 'blur',
                    blurIntensity: v,
                  }))
                }
              />

              <div className="grid grid-cols-3 gap-2">
                {BOKEH_STYLES.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() =>
                      commitConfigChange((prev) => ({
                        ...prev,
                        backgroundRemoved: true,
                        backgroundMode:
                          prev.backgroundMode === 'custom-image' ? 'custom-image' : 'blur',
                        bokehStyle: b.id,
                      }))
                    }
                    className={`min-h-[44px] px-2 rounded-xl border text-[11px] font-semibold cursor-pointer ${
                      config.bokehStyle === b.id
                        ? 'bg-violet-600/30 border-amber-400/65 text-white'
                        : 'bg-[#06070B] border-white/10 text-slate-300'
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                Keeps your main subject sharp while blurring the original photo or custom uploaded background image.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
