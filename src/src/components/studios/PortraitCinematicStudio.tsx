import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Camera,
  Check,
  Crosshair,
  Download,
  Eye,
  Layers,
  RotateCcw,
  Save,
  Sliders,
  SplitSquareHorizontal,
  Upload,
} from 'lucide-react';
import {
  PORTRAIT_PRESETS,
  PortraitPresetCategory,
} from '../../data/portraitPresets';
import {
  AppSettings,
  ExportRecord,
  PortraitStudioConfig,
  ProjectItem,
} from '../../types/editor';
import {
  DEFAULT_PORTRAIT_CONFIG,
  LocalFaceDetectionResult,
  RAW_ORIGINAL_PORTRAIT_CONFIG,
  detectLocalPortraitFaces,
  generatePortraitFilterThumbnailsAsync,
  renderPortraitStudioCanvas,
  resolveCombinedPortraitParams,
} from '../../utils/portraitFilterEngine';
import { createThumbnailDataUrl, loadImageElement } from '../../utils/canvasEngine';
import { releaseCanvasMemory } from '../../utils/hdQualityEngine';
import { downloadExportedBlob, encodeCanvasToBlob } from '../../utils/exportEngine';
import { formatBytes } from '../../utils/indexedDbStorage';
import { GallerySaveResult, saveMediaToGallery } from '../../utils/gallerySaveEngine';
import { GallerySaveBanner } from '../GallerySaveBanner';
import { AssetPickerBar } from '../AssetPickerBar';
import { SliderControl } from '../SliderControl';

interface PortraitCinematicStudioProps {
  imageUrl: string;
  onChangeImage: (url: string) => void;
  initialConfig?: PortraitStudioConfig;
  settings: AppSettings;
  onSaveProject: (project: ProjectItem) => Promise<boolean> | boolean;
  onRecordExport?: (record: ExportRecord) => Promise<void> | void;
}

const CATEGORIES: Array<'All 30' | PortraitPresetCategory> = [
  'All 30',
  'Signature',
  'Lighting',
  'Cinema & Film',
  'Tone & Color',
  'Editorial',
];

export const PortraitCinematicStudio: React.FC<PortraitCinematicStudioProps> = ({
  imageUrl,
  onChangeImage,
  initialConfig,
  settings,
  onSaveProject,
  onRecordExport,
}) => {
  const [config, setConfig] = useState<PortraitStudioConfig>(
    initialConfig ?? DEFAULT_PORTRAIT_CONFIG
  );
  const [category, setCategory] = useState<'All 30' | PortraitPresetCategory>('All 30');
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [thumbGenerating, setThumbGenerating] = useState(false);

  const [compareMode, setCompareMode] = useState<'off' | 'split' | 'original'>('off');
  const [splitPercent, setSplitPercent] = useState(50);
  const [pickFocusMode, setPickFocusMode] = useState(false);
  const [faceResult, setFaceResult] = useState<LocalFaceDetectionResult | null>(null);
  const [rightPanelTab, setRightPanelTab] = useState<'filters' | 'combine'>('filters');

  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [isExporting, setIsExporting] = useState<'jpg' | 'png' | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<'idle' | 'saved' | 'error'>('idle');
  const [gallerySaving, setGallerySaving] = useState(false);
  const [galleryProgress, setGalleryProgress] = useState(0);
  const [galleryStage, setGalleryStage] = useState<string | null>(null);
  const [galleryResult, setGalleryResult] = useState<GallerySaveResult | null>(null);
  const [lastFormatUsed, setLastFormatUsed] = useState<'jpg' | 'png'>('png');

  const imgRef = useRef<HTMLImageElement | null>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const editedCanvasRef = useRef<HTMLCanvasElement>(null);
  const splitStageRef = useRef<HTMLDivElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const isDraggingSplit = useRef(false);

  useEffect(() => {
    if (initialConfig) {
      setConfig(initialConfig);
    }
  }, [initialConfig]);

  // Load portrait, detect optional browser FaceDetector faces, and render all 30 actual thumbnails
  useEffect(() => {
    let cancelled = false;
    let cancelThumbBatch: (() => void) | null = null;
    setThumbnails({});
    setThumbGenerating(true);
    setExportError(null);

    loadImageElement(imageUrl)
      .then(async (img) => {
        if (cancelled) return;
        imgRef.current = img;
        setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });

        // Render untouched original layer for instant Before/After split comparison
        if (originalCanvasRef.current) {
          const origCanvas = originalCanvasRef.current;
          const maxDim = 1080;
          const s = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
          origCanvas.width = Math.max(1, Math.round(img.naturalWidth * s));
          origCanvas.height = Math.max(1, Math.round(img.naturalHeight * s));
          const oCtx = origCanvas.getContext('2d');
          if (oCtx) {
            oCtx.clearRect(0, 0, origCanvas.width, origCanvas.height);
            oCtx.drawImage(img, 0, 0, origCanvas.width, origCanvas.height);
          }
        }

        if (editedCanvasRef.current) {
          renderPortraitStudioCanvas(img, editedCanvasRef.current, config, 1080);
        }

        // Optional local FaceDetector API check (never fakes AI when unsupported)
        const faceRes = await detectLocalPortraitFaces(img);
        if (!cancelled) {
          setFaceResult(faceRes);
          if (faceRes.status === 'detected') {
            setConfig((prev) => ({
              ...prev,
              focusX: faceRes.focusX,
              focusY: faceRes.focusY,
            }));
          }
        }

        // Render genuine Canvas thumbnails from this exact uploaded portrait across all 30 presets
        if (!cancelled) {
          cancelThumbBatch = generatePortraitFilterThumbnailsAsync(
            img,
            PORTRAIT_PRESETS,
            (partialMap) => {
              if (!cancelled) setThumbnails(partialMap);
            },
            () => {
              if (!cancelled) setThumbGenerating(false);
            }
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setThumbGenerating(false);
          setExportError('Failed to decode the selected portrait image.');
        }
      });

    return () => {
      cancelled = true;
      if (cancelThumbBatch) cancelThumbBatch();
    };
  }, [imageUrl]);

  // Re-render real-time Canvas preview whenever filter preset, intensity, or combined effects change
  useEffect(() => {
    if (imgRef.current && editedCanvasRef.current) {
      renderPortraitStudioCanvas(imgRef.current, editedCanvasRef.current, config, 1080);
    }
  }, [config]);

  const activePreset = useMemo(
    () => PORTRAIT_PRESETS.find((p) => p.id === config.primaryPresetId) || null,
    [config.primaryPresetId]
  );

  const secondaryPreset = useMemo(
    () =>
      config.secondaryPresetId !== 'none'
        ? PORTRAIT_PRESETS.find((p) => p.id === config.secondaryPresetId) || null
        : null,
    [config.secondaryPresetId]
  );

  const combinedSummary = useMemo(() => resolveCombinedPortraitParams(config), [config]);

  const visiblePresets = useMemo(
    () =>
      category === 'All 30'
        ? PORTRAIT_PRESETS
        : PORTRAIT_PRESETS.filter((p) => p.category === category),
    [category]
  );

  const handleGalleryUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onChangeImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSelectPrimaryPreset = (presetId: string) => {
    setCompareMode('off');
    setConfig((prev) => ({
      ...prev,
      primaryPresetId: presetId,
      primaryIntensity: prev.primaryIntensity === 0 ? 85 : prev.primaryIntensity,
    }));
  };

  const handleResetToOriginal = () => {
    setCompareMode('off');
    setConfig((prev) => ({
      ...RAW_ORIGINAL_PORTRAIT_CONFIG,
      focusX: prev.focusX,
      focusY: prev.focusY,
    }));
  };

  const updateSplitFromClientX = (clientX: number) => {
    if (!splitStageRef.current) return;
    const rect = splitStageRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setSplitPercent(Math.max(4, Math.min(96, Math.round(pct))));
  };

  const handleCanvasTapForFocus = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!pickFocusMode || !splitStageRef.current) return;
    const rect = splitStageRef.current.getBoundingClientRect();
    const nx = Math.max(0.08, Math.min(0.92, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const ny = Math.max(0.08, Math.min(0.92, (e.clientY - rect.top) / Math.max(1, rect.height)));
    setConfig((prev) => ({ ...prev, focusX: Number(nx.toFixed(3)), focusY: Number(ny.toFixed(3)) }));
    setPickFocusMode(false);
  };

  const handleExport = async (
    format: 'jpg' | 'png',
    opts?: { triggerSource?: 'save' | 'export' | 'manual'; forceDuplicate?: boolean }
  ) => {
    if (!imgRef.current) return;
    const triggerSource = opts?.triggerSource ?? 'export';
    setIsExporting(format);
    setLastFormatUsed(format);
    setExportError(null);
    setExportNotice(null);
    setGallerySaving(true);
    setGalleryProgress(12);
    setGalleryStage(`Rendering full-resolution ${format.toUpperCase()} portrait...`);
    setGalleryResult(null);

    const outCanvas = document.createElement('canvas');
    try {
      renderPortraitStudioCanvas(imgRef.current, outCanvas, config);
      setGalleryProgress(40);
      setGalleryStage(`Encoding ${format.toUpperCase()}...`);
      const { blob, mimeType } = await encodeCanvasToBlob(
        outCanvas,
        format,
        format === 'jpg' ? settings.exportQuality || 94 : 100
      );
      const presetSlug = activePreset ? activePreset.id : 'original';
      const fileName = `dipti-portrait-${presetSlug}-${outCanvas.width}x${outCanvas.height}-${Date.now()}.${format}`;
      const thumb = createThumbnailDataUrl(outCanvas, 320);

      if (!settings.autoSaveToGallery && triggerSource === 'export') {
        downloadExportedBlob(blob, fileName);
        setExportNotice(
          `Manual download · ${format.toUpperCase()} · ${outCanvas.width}×${outCanvas.height}px (${formatBytes(blob.size)})`
        );
        if (onRecordExport) {
          await onRecordExport({
            id: `exp-${Date.now()}`,
            fileName,
            mediaType: 'image',
            format,
            resolutionLabel: `${outCanvas.width}×${outCanvas.height}`,
            width: outCanvas.width,
            height: outCanvas.height,
            quality: format === 'jpg' ? settings.exportQuality || 94 : 100,
            fileSizeBytes: blob.size,
            status: 'completed',
            thumbnailDataUrl: thumb || undefined,
            galleryDelivery: 'skipped-disabled',
            galleryLocationLabel: 'Manual Browser Download (Auto-Save OFF)',
            createdAt: new Date().toISOString(),
          });
        }
        return;
      }

      const gRes = await saveMediaToGallery({
        blob,
        fileName,
        mimeType,
        mediaType: 'image',
        format,
        width: outCanvas.width,
        height: outCanvas.height,
        quality: format === 'jpg' ? settings.exportQuality || 94 : 100,
        thumbnailDataUrl: thumb || undefined,
        settings,
        triggerSource,
        forceDuplicate: opts?.forceDuplicate,
        onProgress: (pct, st) => {
          setGalleryProgress(pct);
          setGalleryStage(st);
        },
        onRecordExport,
      });
      setGalleryResult(gRes);
      if (gRes.saved) {
        setExportNotice(
          `${format.toUpperCase()} · ${outCanvas.width}×${outCanvas.height}px (${formatBytes(blob.size)})`
        );
      } else if (gRes.error) {
        setExportError(gRes.error);
      }
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : `Failed to export ${format.toUpperCase()} portrait.`
      );
    } finally {
      releaseCanvasMemory(outCanvas);
      setIsExporting(null);
      setGallerySaving(false);
    }
  };

  const handleSave = async () => {
    if (!editedCanvasRef.current) return;
    const thumb = createThumbnailDataUrl(editedCanvasRef.current, 420);
    const label = activePreset ? activePreset.name : 'Original Portrait';
    const ok = await onSaveProject({
      id: `proj-portrait-${Date.now()}`,
      name: `${label}${secondaryPreset ? ` + ${secondaryPreset.name}` : ''}`,
      tool: 'portrait-studio',
      thumbnailDataUrl: thumb || imageUrl,
      sourceImageUrl: imageUrl,
      width: naturalSize.w || editedCanvasRef.current.width,
      height: naturalSize.h || editedCanvasRef.current.height,
      updatedAt: new Date().toISOString(),
      portraitStudioState: config,
      adjustments: combinedSummary.adjustments,
      filterPresetId: config.primaryPresetId,
      filterIntensity: config.primaryIntensity,
    });
    setSavedNotice(ok ? 'saved' : 'error');
    window.setTimeout(() => setSavedNotice('idle'), 2400);

    if (ok && settings.autoSaveToGallery) {
      const fmt: 'jpg' | 'png' = settings.exportFormat === 'png' ? 'png' : 'jpg';
      await handleExport(fmt, { triggerSource: 'save' });
    }
  };

  const activeEffectCount =
    (activePreset && config.primaryIntensity > 0 ? 1 : 0) +
    (secondaryPreset && config.secondaryIntensity > 0 ? 1 : 0) +
    (config.skinSoftness > 0 ? 1 : 0) +
    (config.portraitGlow > 0 ? 1 : 0) +
    (config.studioKeyLight !== 0 ? 1 : 0) +
    (config.softFocus > 0 ? 1 : 0) +
    (config.warmthShift !== 0 ? 1 : 0) +
    (config.contrastShift !== 0 ? 1 : 0) +
    (config.vignette > 0 ? 1 : 0) +
    (config.grain > 0 ? 1 : 0);

  return (
    <div className="space-y-5 pb-24 lg:pb-10">
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        onChange={handleGalleryUpload}
        className="hidden"
      />

      {/* Top Portrait Upload & Quick Asset Selector */}
      <div className="rounded-2xl bg-[#07080D]/95 border border-violet-500/25 p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-base sm:text-lg font-bold tracking-tight bg-gradient-to-r from-[#FDE68A] via-[#D4AF37] to-[#F59E0B] bg-clip-text text-transparent">
              AI Portrait &amp; Cinematic Filter Studio
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              30 live-rendered portrait presets · Intensity 0–100% · Multi-effect stack · Non-destructive JPG &amp; PNG
            </p>
          </div>

          <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-amber-500 hover:brightness-110 text-xs sm:text-sm font-semibold text-white flex items-center gap-2 shadow-[0_6px_24px_rgba(124,58,237,0.32)] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>Upload Portrait</span>
          </button>
        </div>

        <AssetPickerBar activeImageUrl={imageUrl} onSelectImage={onChangeImage} />
      </div>

      {/* Main Split Workspace: Portrait Stage (Left) + Presets & Multi-Effect Controls (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Portrait Preview Stage */}
        <div className="lg:col-span-6 xl:col-span-6 rounded-2xl bg-[#06070B] border border-white/10 p-3.5 sm:p-4 space-y-3.5">
          {/* Toolbar Row */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-bold bg-gradient-to-r from-[#FDE68A] via-[#D4AF37] to-[#F59E0B] bg-clip-text text-transparent truncate">
                {activePreset ? `${activePreset.index}. ${activePreset.name}` : 'Original Unfiltered Portrait'}
                {secondaryPreset ? ` + ${secondaryPreset.name}` : ''}
              </p>
              <p className="text-[11px] text-slate-400 font-mono-tabular">
                {naturalSize.w > 0 ? `${naturalSize.w}×${naturalSize.h}` : 'Loading'} · Intensity{' '}
                {config.primaryIntensity}% · {activeEffectCount} active{' '}
                {activeEffectCount === 1 ? 'layer' : 'layers'}
              </p>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setCompareMode((m) => (m === 'split' ? 'off' : 'split'))}
                className={`min-h-[40px] px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                  compareMode === 'split'
                    ? 'bg-violet-600/25 border-violet-400/70 text-white'
                    : 'bg-white/[0.05] border-white/10 text-slate-300 hover:text-white'
                }`}
              >
                <SplitSquareHorizontal className="w-3.5 h-3.5 text-violet-300" />
                <span>Split</span>
              </button>

              <button
                type="button"
                onClick={() => setCompareMode((m) => (m === 'original' ? 'off' : 'original'))}
                className={`min-h-[40px] px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                  compareMode === 'original'
                    ? 'bg-amber-500/20 border-amber-400/65 text-amber-200'
                    : 'bg-white/[0.05] border-white/10 text-slate-300 hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5 text-amber-300" />
                <span>{compareMode === 'original' ? 'Original On' : 'Before / After'}</span>
              </button>

              <button
                type="button"
                onClick={handleResetToOriginal}
                className="min-h-[40px] px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* Real-Time Canvas Viewport with Before/After Split & Interactive Focus Target */}
          <div
            ref={splitStageRef}
            onClick={handleCanvasTapForFocus}
            onPointerDown={(e) => {
              if (compareMode !== 'split') return;
              isDraggingSplit.current = true;
              updateSplitFromClientX(e.clientX);
            }}
            onPointerMove={(e) => {
              if (!isDraggingSplit.current || compareMode !== 'split') return;
              updateSplitFromClientX(e.clientX);
            }}
            onPointerUp={() => {
              isDraggingSplit.current = false;
            }}
            onPointerLeave={() => {
              isDraggingSplit.current = false;
            }}
            className={`relative min-h-[300px] sm:min-h-[420px] rounded-xl bg-[#030407] border border-white/[0.07] flex items-center justify-center p-2 overflow-hidden select-none touch-none ${
              pickFocusMode ? 'cursor-crosshair ring-2 ring-violet-500/60' : ''
            }`}
          >
            {/* Edited Filtered Canvas */}
            <canvas
              ref={editedCanvasRef}
              className={`max-w-full max-h-[500px] object-contain rounded-lg transition-opacity duration-150 ${
                compareMode === 'original' ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}
            />

            {/* Untouched Original Canvas Layer (shown when comparing) */}
            <canvas
              ref={originalCanvasRef}
              style={
                compareMode === 'split'
                  ? { clipPath: `inset(0 ${100 - splitPercent}% 0 0)` }
                  : undefined
              }
              className={`absolute inset-0 m-auto max-w-[calc(100%-16px)] max-h-[500px] object-contain rounded-lg pointer-events-none ${
                compareMode === 'off' ? 'opacity-0' : 'opacity-100'
              }`}
            />

            {/* Split Divider Handle */}
            {compareMode === 'split' && (
              <>
                <div
                  style={{ left: `${splitPercent}%` }}
                  className="absolute top-0 bottom-0 w-0.5 bg-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.8)] pointer-events-none"
                >
                  <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[#090B12] border-2 border-amber-300 flex items-center justify-center shadow-lg">
                    <SplitSquareHorizontal className="w-3.5 h-3.5 text-amber-300" />
                  </div>
                </div>
                <span className="absolute top-3 left-3 px-2 py-0.5 rounded bg-black/75 text-[11px] font-medium text-slate-200 pointer-events-none">
                  Original
                </span>
                <span className="absolute top-3 right-3 px-2 py-0.5 rounded bg-black/75 text-[11px] font-medium text-amber-300 pointer-events-none">
                  Filtered
                </span>
              </>
            )}

            {compareMode === 'original' && (
              <span className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-black/80 border border-amber-400/40 text-xs font-medium text-amber-300 pointer-events-none">
                Original Portrait (Unfiltered)
              </span>
            )}

            {/* Subtle Focus Target Reticle only while actively positioning focus */}
            {pickFocusMode && (
              <div
                style={{
                  left: `${config.focusX * 100}%`,
                  top: `${config.focusY * 100}%`,
                }}
                className="absolute -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full border-2 border-violet-400 bg-violet-500/15 pointer-events-none flex items-center justify-center"
              >
                <div className="w-2 h-2 rounded-full bg-amber-300" />
              </div>
            )}
          </div>

          {compareMode === 'split' && (
            <div className="px-1">
              <SliderControl
                label="Split Comparison Position"
                value={splitPercent}
                min={4}
                max={96}
                defaultValue={50}
                unit="%"
                onChange={setSplitPercent}
              />
            </div>
          )}

          {/* Primary Intensity Slider Always Accessible Below Preview */}
          <div className="rounded-xl bg-[#0A0C14] border border-violet-500/20 px-3.5 py-2">
            <SliderControl
              label={
                activePreset
                  ? `${activePreset.name} Intensity`
                  : 'Filter Intensity (Select any preset)'
              }
              value={config.primaryIntensity}
              min={0}
              max={100}
              defaultValue={85}
              unit="%"
              onChange={(val) =>
                setConfig((prev) => ({
                  ...prev,
                  primaryIntensity: val,
                }))
              }
            />
          </div>

          {/* Local Face Detection / Portrait Target Info (Honest Capability Notice) */}
          <div className="rounded-xl bg-[#090B12] border border-white/[0.08] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="min-w-0 space-y-0.5">
              <p className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-violet-300 shrink-0" />
                <span>
                  {faceResult?.method || 'Local Focus Target'} ({Math.round(config.focusX * 100)}%,{' '}
                  {Math.round(config.focusY * 100)}%)
                </span>
              </p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {faceResult?.message ||
                  'Checking browser native FaceDetector support for portrait lighting focus...'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setPickFocusMode((v) => !v)}
              className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                pickFocusMode
                  ? 'bg-violet-600/30 border-violet-400 text-white'
                  : 'bg-white/[0.05] hover:bg-white/[0.1] border-white/15 text-amber-300'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>{pickFocusMode ? 'Tap Portrait...' : 'Set Face Focus'}</span>
            </button>
          </div>

          {/* Save & JPG / PNG Export Controls */}
          <div className="pt-1 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={handleSave}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-xs sm:text-sm font-semibold text-white flex items-center gap-2 cursor-pointer"
              >
                {savedNotice === 'saved' ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Save className="w-4 h-4 text-amber-300" />
                )}
                <span>
                  {savedNotice === 'saved'
                    ? 'Saved to Projects'
                    : savedNotice === 'error'
                      ? 'Save Failed'
                      : 'Save Project'}
                </span>
              </button>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={isExporting !== null}
                  onClick={() => handleExport('jpg')}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-amber-400/35 text-xs sm:text-sm font-semibold text-amber-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-4 h-4 text-amber-300" />
                  <span>{isExporting === 'jpg' ? 'Exporting...' : 'Export JPG'}</span>
                </button>

                <button
                  type="button"
                  disabled={isExporting !== null}
                  onClick={() => handleExport('png')}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-amber-500 hover:brightness-110 text-xs sm:text-sm font-semibold text-white flex items-center gap-1.5 shadow-[0_6px_22px_rgba(124,58,237,0.3)] cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>{isExporting === 'png' ? 'Exporting...' : 'Export PNG'}</span>
                </button>
              </div>
            </div>

            {exportNotice && !galleryResult && (
              <p className="text-xs text-emerald-300 font-medium">{exportNotice}</p>
            )}
            {exportError && !galleryResult?.error && (
              <p className="text-xs text-rose-300 font-medium">{exportError}</p>
            )}
            <GallerySaveBanner
              saving={gallerySaving}
              progressPct={galleryProgress}
              stageLabel={galleryStage}
              result={galleryResult}
              onSaveCopyAnyway={() =>
                handleExport(lastFormatUsed, { triggerSource: 'manual', forceDuplicate: true })
              }
              onDismiss={() => setGalleryResult(null)}
            />
          </div>
        </div>

        {/* Right Workspace: All 30 Live Thumbnails Grid + Multi-Effect Stack Builder */}
        <div className="lg:col-span-6 xl:col-span-6 space-y-4">
          <div className="rounded-2xl bg-[#080A11]/95 border border-violet-500/20 p-3.5 sm:p-4 space-y-4">
            {/* Switch between 30 Presets Visual Grid and Combine Multiple Effects */}
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#05060A] border border-white/10">
              <button
                type="button"
                onClick={() => setRightPanelTab('filters')}
                className={`min-h-[42px] px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  rightPanelTab === 'filters'
                    ? 'bg-gradient-to-r from-violet-600/35 to-purple-600/30 border border-violet-400/60 text-white shadow-[0_0_16px_rgba(139,92,246,0.22)]'
                    : 'text-slate-400 hover:text-white border border-transparent'
                }`}
              >
                <Sliders className="w-3.5 h-3.5 text-amber-300" />
                <span>30 Portrait Filters</span>
              </button>

              <button
                type="button"
                onClick={() => setRightPanelTab('combine')}
                className={`min-h-[42px] px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  rightPanelTab === 'combine'
                    ? 'bg-gradient-to-r from-violet-600/35 to-purple-600/30 border border-violet-400/60 text-white shadow-[0_0_16px_rgba(139,92,246,0.22)]'
                    : 'text-slate-400 hover:text-white border border-transparent'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-violet-300" />
                <span>Combine Effects ({activeEffectCount})</span>
              </button>
            </div>

            {rightPanelTab === 'filters' ? (
              <div className="space-y-3.5">
                {/* Category Filter Tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={`min-h-[38px] px-3 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        category === cat
                          ? 'bg-violet-600/30 border border-violet-400/70 text-white'
                          : 'bg-[#05060A] border border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {thumbGenerating && (
                  <p className="text-[11px] text-slate-400">
                    Rendering live portrait thumbnails from your uploaded photo...
                  </p>
                )}

                {/* Visual Grid of All 30 Filters with Actual Uploaded Portrait Previews & Metallic Gold Names */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[600px] overflow-y-auto pr-1">
                  {visiblePresets.map((preset) => {
                    const isSelected = config.primaryPresetId === preset.id;
                    const thumbSrc = thumbnails[preset.id] || imageUrl;
                    return (
                      <motion.button
                        key={preset.id}
                        type="button"
                        whileTap={settings.reducedMotion ? undefined : { scale: 0.98 }}
                        onClick={() => handleSelectPrimaryPreset(preset.id)}
                        className={`group relative text-left rounded-xl overflow-hidden border transition-all cursor-pointer bg-[#05060A] ${
                          isSelected
                            ? 'border-violet-400 ring-2 ring-violet-500/45 shadow-[0_0_24px_rgba(139,92,246,0.3)]'
                            : 'border-white/10 hover:border-violet-400/45'
                        }`}
                      >
                        <div className="relative aspect-[4/5] w-full overflow-hidden bg-[#040508]">
                          <img
                            src={thumbSrc}
                            alt={preset.name}
                            referrerPolicy="no-referrer"
                            className={`w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03] ${
                              thumbnails[preset.id] ? 'opacity-100' : 'opacity-65'
                            }`}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#05060A] via-[#05060A]/25 to-transparent" />

                          {isSelected && (
                            <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-violet-600 border border-amber-300/70 flex items-center justify-center shadow-lg">
                              <Check className="w-3.5 h-3.5 text-white" />
                            </span>
                          )}

                          <div className="absolute bottom-0 left-0 right-0 p-2.5">
                            <p className="text-xs font-bold leading-tight bg-gradient-to-r from-[#FDE68A] via-[#D4AF37] to-[#F59E0B] bg-clip-text text-transparent">
                              {preset.index}. {preset.name}
                            </p>
                            <p className="text-[10px] text-slate-300/90 mt-0.5 truncate">
                              {preset.category}
                            </p>
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Secondary Stackable Filter Mixer */}
                <div className="rounded-xl bg-[#05060A] border border-violet-500/25 p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="secondary-filter-select"
                      className="text-xs font-bold bg-gradient-to-r from-[#FDE68A] via-[#D4AF37] to-[#F59E0B] bg-clip-text text-transparent"
                    >
                      Layer Second Filter Preset
                    </label>
                    {config.secondaryPresetId !== 'none' && (
                      <button
                        type="button"
                        onClick={() =>
                          setConfig((prev) => ({ ...prev, secondaryPresetId: 'none' }))
                        }
                        className="text-[11px] text-violet-300 hover:text-white cursor-pointer"
                      >
                        Clear Stack
                      </button>
                    )}
                  </div>

                  <select
                    id="secondary-filter-select"
                    value={config.secondaryPresetId}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        secondaryPresetId: e.target.value,
                      }))
                    }
                    className="w-full min-h-[42px] rounded-xl bg-[#0B0D16] border border-white/15 px-3 text-xs text-white focus:outline-none focus:border-violet-400"
                  >
                    <option value="none">None (Single Filter)</option>
                    {PORTRAIT_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.index}. {p.name} ({p.category})
                      </option>
                    ))}
                  </select>

                  {config.secondaryPresetId !== 'none' && (
                    <SliderControl
                      label="Secondary Filter Blend"
                      value={config.secondaryIntensity}
                      min={0}
                      max={100}
                      defaultValue={45}
                      unit="%"
                      onChange={(val) =>
                        setConfig((prev) => ({ ...prev, secondaryIntensity: val }))
                      }
                    />
                  )}
                </div>

                {/* Stackable Portrait & Optical Effect Sliders */}
                <div className="rounded-xl bg-[#05060A] border border-white/10 p-3.5 space-y-1">
                  <p className="text-xs font-bold bg-gradient-to-r from-[#FDE68A] via-[#D4AF37] to-[#F59E0B] bg-clip-text text-transparent pb-1.5">
                    Combine Portrait &amp; Cinema Effects
                  </p>

                  <SliderControl
                    label="Skin Softness (Tone-Aware)"
                    value={config.skinSoftness}
                    min={0}
                    max={100}
                    defaultValue={0}
                    unit="%"
                    onChange={(val) => setConfig((prev) => ({ ...prev, skinSoftness: val }))}
                  />
                  <SliderControl
                    label="Studio Key Light"
                    value={config.studioKeyLight}
                    min={-40}
                    max={60}
                    defaultValue={0}
                    onChange={(val) => setConfig((prev) => ({ ...prev, studioKeyLight: val }))}
                  />
                  <SliderControl
                    label="Dreamy Glow"
                    value={config.portraitGlow}
                    min={0}
                    max={60}
                    defaultValue={0}
                    onChange={(val) => setConfig((prev) => ({ ...prev, portraitGlow: val }))}
                  />
                  <SliderControl
                    label="Soft Focus Lens"
                    value={config.softFocus}
                    min={0}
                    max={50}
                    defaultValue={0}
                    onChange={(val) => setConfig((prev) => ({ ...prev, softFocus: val }))}
                  />
                  <SliderControl
                    label="Warm / Cool Tone Shift"
                    value={config.warmthShift}
                    min={-40}
                    max={40}
                    defaultValue={0}
                    onChange={(val) => setConfig((prev) => ({ ...prev, warmthShift: val }))}
                  />
                  <SliderControl
                    label="Contrast Trim"
                    value={config.contrastShift}
                    min={-40}
                    max={40}
                    defaultValue={0}
                    onChange={(val) => setConfig((prev) => ({ ...prev, contrastShift: val }))}
                  />
                  <SliderControl
                    label="Cinema Vignette"
                    value={config.vignette}
                    min={0}
                    max={100}
                    defaultValue={0}
                    onChange={(val) => setConfig((prev) => ({ ...prev, vignette: val }))}
                  />
                  <SliderControl
                    label="Analog Film Grain"
                    value={config.grain}
                    min={0}
                    max={60}
                    defaultValue={0}
                    onChange={(val) => setConfig((prev) => ({ ...prev, grain: val }))}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
