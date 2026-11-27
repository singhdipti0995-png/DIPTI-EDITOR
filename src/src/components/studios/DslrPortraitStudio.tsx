import React, { useEffect, useRef, useState } from 'react';
import {
  Aperture,
  Brush,
  Check,
  Download,
  Eraser,
  Eye,
  ImagePlus,
  Layers,
  Loader2,
  RotateCcw,
  Save,
  Sliders,
  Sparkles,
  SplitSquareHorizontal,
  Sun,
  Upload,
} from 'lucide-react';
import {
  AppSettings,
  DslrBackgroundMode,
  DslrBokehStyle,
  DslrStudioConfig,
  ExportRecord,
  ProjectItem,
} from '../../types/editor';
import { STUDIO_ASSETS } from '../../data/studioCatalog';
import {
  DEFAULT_DSLR_CONFIG,
  SubjectMaskData,
  renderDslrPortraitComposition,
  runLocalSubjectSegmentation,
} from '../../utils/dslrPortraitEngine';
import { createThumbnailDataUrl, loadImageElement } from '../../utils/canvasEngine';
import { releaseCanvasMemory } from '../../utils/hdQualityEngine';
import { downloadExportedBlob, encodeCanvasToBlob } from '../../utils/exportEngine';
import { formatBytes } from '../../utils/indexedDbStorage';
import { GallerySaveResult, saveMediaToGallery } from '../../utils/gallerySaveEngine';
import { GallerySaveBanner } from '../GallerySaveBanner';
import { AssetPickerBar } from '../AssetPickerBar';
import { SliderControl } from '../SliderControl';

interface DslrPortraitStudioProps {
  imageUrl: string;
  onChangeImage: (url: string) => void;
  initialConfig?: DslrStudioConfig;
  settings: AppSettings;
  onSaveProject: (project: ProjectItem) => Promise<boolean> | boolean;
  onRecordExport?: (record: ExportRecord) => Promise<void> | void;
}

const BOKEH_OPTIONS: Array<{ id: DslrBokehStyle; label: string; sub: string }> = [
  { id: 'circular', label: 'Circular Bokeh', sub: 'Disc aperture orbs' },
  { id: 'soft', label: 'Soft Bokeh', sub: 'Creamy f/1.4 blur' },
  { id: 'cinematic-depth', label: 'Cinematic Depth', sub: 'Progressive depth' },
];

const BACKGROUND_OPTIONS: Array<{
  id: DslrBackgroundMode;
  label: string;
  swatchStyle: React.CSSProperties;
}> = [
  {
    id: 'original-blur',
    label: 'Scene Blur',
    swatchStyle: { background: 'linear-gradient(135deg, #1E293B, #0F172A)' },
  },
  {
    id: 'black-studio',
    label: 'Black Studio',
    swatchStyle: { background: 'radial-gradient(circle, #1E2028 0%, #030407 90%)' },
  },
  {
    id: 'white-studio',
    label: 'White Studio',
    swatchStyle: { background: 'radial-gradient(circle, #FFFFFF 0%, #CBD5E1 95%)' },
  },
  {
    id: 'purple-luxury',
    label: 'Purple Luxury',
    swatchStyle: { background: 'radial-gradient(circle, #6D28D9 0%, #16092B 85%)' },
  },
  {
    id: 'gold-cinematic',
    label: 'Gold Cinematic',
    swatchStyle: { background: 'radial-gradient(circle, #B4831D 0%, #171005 88%)' },
  },
  {
    id: 'custom-gradient',
    label: 'Custom Gradient',
    swatchStyle: { background: 'linear-gradient(135deg, #7C3AED 0%, #D4AF37 100%)' },
  },
  {
    id: 'custom-image',
    label: 'Custom Photo',
    swatchStyle: { background: 'linear-gradient(135deg, #0EA5E9 0%, #4F46E5 100%)' },
  },
];

const QUICK_GRADIENTS: Array<{ label: string; start: string; end: string; angle: number }> = [
  { label: 'Royal Amethyst', start: '#6D28D9', end: '#06070B', angle: 145 },
  { label: 'Obsidian Gold', start: '#B4831D', end: '#07080D', angle: 135 },
  { label: 'Violet Dusk', start: '#7C3AED', end: '#D4AF37', angle: 160 },
  { label: 'Midnight Sapphire', start: '#1D4ED8', end: '#04060E', angle: 150 },
];

export const DslrPortraitStudio: React.FC<DslrPortraitStudioProps> = ({
  imageUrl,
  onChangeImage,
  initialConfig,
  settings,
  onSaveProject,
  onRecordExport,
}) => {
  const [config, setConfig] = useState<DslrStudioConfig>(initialConfig ?? DEFAULT_DSLR_CONFIG);
  const [rightTab, setRightTab] = useState<'bokeh' | 'backgrounds' | 'edges'>('bokeh');

  const [maskData, setMaskData] = useState<SubjectMaskData | null>(null);
  const [isSegmenting, setIsSegmenting] = useState(true);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const [compareMode, setCompareMode] = useState<'off' | 'split' | 'original'>('off');
  const [splitPercent, setSplitPercent] = useState(50);
  const [showMaskOverlay, setShowMaskOverlay] = useState(false);

  // Touch mask brush controls
  const [brushMode, setBrushMode] = useState<'off' | 'keep' | 'erase'>('off');
  const [brushSizePct, setBrushSizePct] = useState(4);

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
  const customBgImgRef = useRef<HTMLImageElement | null>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const editedCanvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const uploadPortraitRef = useRef<HTMLInputElement>(null);
  const uploadCustomBgRef = useRef<HTMLInputElement>(null);
  const isPointerActive = useRef(false);

  useEffect(() => {
    if (initialConfig) setConfig(initialConfig);
  }, [initialConfig]);

  // Load main portrait & run MediaPipe local subject segmentation (or honest fallback)
  useEffect(() => {
    let cancelled = false;
    setIsSegmenting(true);
    setExportError(null);

    loadImageElement(imageUrl)
      .then(async (img) => {
        if (cancelled) return;
        imgRef.current = img;
        setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });

        // Draw raw untouched portrait on originalCanvasRef for Before/After comparison
        if (originalCanvasRef.current) {
          const orig = originalCanvasRef.current;
          const s = Math.min(1, 1080 / Math.max(img.naturalWidth, img.naturalHeight));
          orig.width = Math.max(1, Math.round(img.naturalWidth * s));
          orig.height = Math.max(1, Math.round(img.naturalHeight * s));
          const oCtx = orig.getContext('2d');
          if (oCtx) {
            oCtx.clearRect(0, 0, orig.width, orig.height);
            oCtx.drawImage(img, 0, 0, orig.width, orig.height);
          }
        }

        const seg = await runLocalSubjectSegmentation(img);
        if (cancelled) return;
        setMaskData(seg);
        setIsSegmenting(false);
      })
      .catch(() => {
        if (!cancelled) {
          setIsSegmenting(false);
          setExportError('Unable to decode selected portrait image.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  // Load optional uploaded custom background image
  useEffect(() => {
    let cancelled = false;
    if (!config.customBgImageUrl) {
      customBgImgRef.current = null;
      return;
    }
    loadImageElement(config.customBgImageUrl)
      .then((bgImg) => {
        if (cancelled) return;
        customBgImgRef.current = bgImg;
        if (imgRef.current && editedCanvasRef.current && maskData) {
          renderDslrPortraitComposition(imgRef.current, editedCanvasRef.current, maskData, config, {
            maxPreviewDim: 1080,
            customBgImg: bgImg,
            showMaskOverlay,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setExportError('Could not load the selected custom background image.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [config.customBgImageUrl]);

  // Re-render DSLR composition whenever mask, blur, bokeh, background, lighting, or edges change
  useEffect(() => {
    if (!imgRef.current || !editedCanvasRef.current || !maskData) return;
    renderDslrPortraitComposition(imgRef.current, editedCanvasRef.current, maskData, config, {
      maxPreviewDim: 1080,
      customBgImg: customBgImgRef.current,
      showMaskOverlay,
    });
  }, [maskData, config, showMaskOverlay]);

  const handleUploadPortrait = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setConfig((prev) => ({ ...prev, refineStrokes: [] }));
        onChangeImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleUploadCustomBg = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setConfig((prev) => ({
          ...prev,
          backgroundMode: 'custom-image',
          customBgImageUrl: reader.result as string,
        }));
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRedetectSubject = async () => {
    if (!imgRef.current) return;
    setIsSegmenting(true);
    const seg = await runLocalSubjectSegmentation(imgRef.current);
    setMaskData(seg);
    setIsSegmenting(false);
  };

  const paintBrushAtClientPos = (clientX: number, clientY: number) => {
    if (brushMode === 'off' || !editedCanvasRef.current) return;
    const rect = editedCanvasRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = (clientX - rect.left) / rect.width;
    const ny = (clientY - rect.top) / rect.height;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;
    setConfig((prev) => ({
      ...prev,
      refineStrokes: [
        ...prev.refineStrokes,
        {
          mode: brushMode,
          x: Number(nx.toFixed(4)),
          y: Number(ny.toFixed(4)),
          radius: brushSizePct / 100,
        },
      ],
    }));
  };

  const updateSplitFromClientX = (clientX: number) => {
    if (!stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setSplitPercent(Math.max(4, Math.min(96, Math.round(pct))));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isPointerActive.current = true;
    if (brushMode !== 'off') {
      paintBrushAtClientPos(e.clientX, e.clientY);
    } else if (compareMode === 'split') {
      updateSplitFromClientX(e.clientX);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerActive.current) return;
    if (brushMode !== 'off') {
      paintBrushAtClientPos(e.clientX, e.clientY);
    } else if (compareMode === 'split') {
      updateSplitFromClientX(e.clientX);
    }
  };

  const handlePointerUp = () => {
    isPointerActive.current = false;
  };

  const handleResetAll = () => {
    setCompareMode('off');
    setBrushMode('off');
    setShowMaskOverlay(false);
    setConfig(DEFAULT_DSLR_CONFIG);
  };

  const handleExport = async (
    format: 'jpg' | 'png',
    opts?: { triggerSource?: 'save' | 'export' | 'manual'; forceDuplicate?: boolean }
  ) => {
    if (!imgRef.current || !maskData) return;
    const triggerSource = opts?.triggerSource ?? 'export';
    setIsExporting(format);
    setLastFormatUsed(format);
    setExportError(null);
    setExportNotice(null);
    setGallerySaving(true);
    setGalleryProgress(12);
    setGalleryStage(`Rendering DSLR portrait (${format.toUpperCase()})...`);
    setGalleryResult(null);

    const outCanvas = document.createElement('canvas');
    try {
      renderDslrPortraitComposition(imgRef.current, outCanvas, maskData, config, {
        customBgImg: customBgImgRef.current,
        showMaskOverlay: false,
      });

      setGalleryProgress(40);
      const { blob, mimeType } = await encodeCanvasToBlob(
        outCanvas,
        format,
        format === 'jpg' ? settings.exportQuality || 94 : 100
      );
      const fileName = `dipti-dslr-${config.backgroundMode}-${outCanvas.width}x${outCanvas.height}-${Date.now()}.${format}`;
      const thumb = createThumbnailDataUrl(outCanvas, 320);

      if (!settings.autoSaveToGallery && triggerSource === 'export') {
        downloadExportedBlob(blob, fileName);
        setExportNotice(
          `Manual download · ${format.toUpperCase()} · ${outCanvas.width}×${outCanvas.height}px (${formatBytes(blob.size)})`
        );
        if (onRecordExport) {
          await onRecordExport({
            id: `exp-dslr-${Date.now()}`,
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
        err instanceof Error ? err.message : `Failed to export ${format.toUpperCase()} image.`
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
    const bgLabel =
      BACKGROUND_OPTIONS.find((b) => b.id === config.backgroundMode)?.label || 'DSLR Portrait';
    const ok = await onSaveProject({
      id: `proj-dslr-${Date.now()}`,
      name: `DSLR ${bgLabel}`,
      tool: 'dslr-studio',
      thumbnailDataUrl: thumb || imageUrl,
      sourceImageUrl: imageUrl,
      width: naturalSize.w || editedCanvasRef.current.width,
      height: naturalSize.h || editedCanvasRef.current.height,
      updatedAt: new Date().toISOString(),
      dslrStudioState: config,
    });
    setSavedNotice(ok ? 'saved' : 'error');
    window.setTimeout(() => setSavedNotice('idle'), 2400);

    if (ok && settings.autoSaveToGallery && maskData) {
      const fmt: 'jpg' | 'png' = settings.exportFormat === 'png' ? 'png' : 'jpg';
      await handleExport(fmt, { triggerSource: 'save' });
    }
  };

  return (
    <div className="space-y-5 pb-24 lg:pb-10">
      <input
        ref={uploadPortraitRef}
        type="file"
        accept="image/*"
        onChange={handleUploadPortrait}
        className="hidden"
      />
      <input
        ref={uploadCustomBgRef}
        type="file"
        accept="image/*"
        onChange={handleUploadCustomBg}
        className="hidden"
      />

      {/* Top Portrait Import & Gallery Bar */}
      <div className="rounded-2xl bg-[#07080D]/95 border border-violet-500/25 p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-base sm:text-lg font-bold tracking-tight bg-gradient-to-r from-[#FDE68A] via-[#D4AF37] to-[#F59E0B] bg-clip-text text-transparent">
              DIPTI DSLR Portrait &amp; Background Studio
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              On-device subject segmentation · Circular &amp; cinematic bokeh · Hair/edge refinement · Studio backdrops
            </p>
          </div>

          <button
            type="button"
            onClick={() => uploadPortraitRef.current?.click()}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-amber-500 hover:brightness-110 text-xs sm:text-sm font-semibold text-white flex items-center gap-2 shadow-[0_6px_24px_rgba(124,58,237,0.32)] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>Import Portrait</span>
          </button>
        </div>

        <AssetPickerBar activeImageUrl={imageUrl} onSelectImage={onChangeImage} />
      </div>

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Portrait Canvas & Comparison Controls */}
        <div className="lg:col-span-7 xl:col-span-7 rounded-2xl bg-[#06070B] border border-white/10 p-3.5 sm:p-4 space-y-3.5">
          {/* Local Segmentation Engine Status Row */}
          <div className="rounded-xl bg-[#0A0C14] border border-white/[0.08] px-3 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {isSegmenting ? (
                <Loader2 className="w-4 h-4 text-violet-300 animate-spin shrink-0" />
              ) : (
                <Sparkles
                  className={`w-4 h-4 shrink-0 ${
                    maskData?.isFallback ? 'text-amber-300' : 'text-violet-300'
                  }`}
                />
              )}
              <p className="text-[11px] sm:text-xs text-slate-300 leading-snug">
                {isSegmenting
                  ? 'Running local MediaPipe Selfie Segmenter on portrait...'
                  : maskData?.statusMessage || 'Ready'}
              </p>
            </div>

            <button
              type="button"
              onClick={handleRedetectSubject}
              disabled={isSegmenting}
              className="min-h-[36px] px-3 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/15 text-xs font-medium text-amber-300 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              Re-Detect Subject
            </button>
          </div>

          {/* Comparison & Brush Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setBrushMode('off');
                  setCompareMode((m) => (m === 'split' ? 'off' : 'split'));
                }}
                className={`min-h-[40px] px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${
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
                onClick={() => {
                  setBrushMode('off');
                  setCompareMode((m) => (m === 'original' ? 'off' : 'original'));
                }}
                className={`min-h-[40px] px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${
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
                onClick={() => setShowMaskOverlay((v) => !v)}
                className={`min-h-[40px] px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${
                  showMaskOverlay
                    ? 'bg-violet-600/30 border-violet-400 text-white'
                    : 'bg-white/[0.05] border-white/10 text-slate-300 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-violet-300" />
                <span>Subject Mask</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setCompareMode('off');
                  setBrushMode((m) => (m === 'keep' ? 'off' : 'keep'));
                }}
                className={`min-h-[40px] px-2.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                  brushMode === 'keep'
                    ? 'bg-emerald-500/20 border-emerald-400/70 text-emerald-200'
                    : 'bg-white/[0.05] border-white/10 text-slate-300 hover:text-white'
                }`}
              >
                <Brush className="w-3.5 h-3.5" />
                <span>Keep</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCompareMode('off');
                  setBrushMode((m) => (m === 'erase' ? 'off' : 'erase'));
                }}
                className={`min-h-[40px] px-2.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                  brushMode === 'erase'
                    ? 'bg-rose-500/20 border-rose-400/70 text-rose-200'
                    : 'bg-white/[0.05] border-white/10 text-slate-300 hover:text-white'
                }`}
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>Erase</span>
              </button>

              <button
                type="button"
                onClick={handleResetAll}
                className="min-h-[40px] px-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* Interactive Portrait Viewport */}
          <div
            ref={stageRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className={`relative min-h-[310px] sm:min-h-[440px] rounded-xl bg-[#030407] border border-white/[0.07] flex items-center justify-center p-2 overflow-hidden select-none touch-none ${
              brushMode !== 'off' ? 'cursor-crosshair ring-2 ring-violet-500/50' : ''
            }`}
          >
            <canvas
              ref={editedCanvasRef}
              className={`max-w-full max-h-[520px] object-contain rounded-lg transition-opacity duration-150 ${
                compareMode === 'original' ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}
            />

            <canvas
              ref={originalCanvasRef}
              style={
                compareMode === 'split'
                  ? { clipPath: `inset(0 ${100 - splitPercent}% 0 0)` }
                  : undefined
              }
              className={`absolute inset-0 m-auto max-w-[calc(100%-16px)] max-h-[520px] object-contain rounded-lg pointer-events-none ${
                compareMode === 'off' ? 'opacity-0' : 'opacity-100'
              }`}
            />

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
                  DSLR Studio
                </span>
              </>
            )}

            {compareMode === 'original' && (
              <span className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-black/80 border border-amber-400/40 text-xs font-medium text-amber-300 pointer-events-none">
                Original Unedited Portrait
              </span>
            )}
          </div>

          {compareMode === 'split' && (
            <div className="px-1">
              <SliderControl
                label="Before / After Split"
                value={splitPercent}
                min={4}
                max={96}
                defaultValue={50}
                unit="%"
                onChange={setSplitPercent}
              />
            </div>
          )}

          {brushMode !== 'off' && (
            <div className="rounded-xl bg-[#0A0C14] border border-violet-500/30 p-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex-1 min-w-[180px]">
                <SliderControl
                  label={`Mask ${brushMode === 'keep' ? 'Keep Subject' : 'Erase Background'} Brush Size`}
                  value={brushSizePct}
                  min={1}
                  max={10}
                  defaultValue={4}
                  unit="%"
                  onChange={setBrushSizePct}
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={config.refineStrokes.length === 0}
                  onClick={() =>
                    setConfig((prev) => ({
                      ...prev,
                      refineStrokes: prev.refineStrokes.slice(0, -1),
                    }))
                  }
                  className="min-h-[38px] px-3 rounded-lg bg-white/[0.06] border border-white/10 text-xs text-slate-200 disabled:opacity-40 cursor-pointer"
                >
                  Undo Stroke
                </button>
                <button
                  type="button"
                  disabled={config.refineStrokes.length === 0}
                  onClick={() => setConfig((prev) => ({ ...prev, refineStrokes: [] }))}
                  className="min-h-[38px] px-3 rounded-lg bg-white/[0.06] border border-white/10 text-xs text-rose-300 disabled:opacity-40 cursor-pointer"
                >
                  Clear Strokes
                </button>
              </div>
            </div>
          )}

          {/* Save & JPG / PNG Export */}
          <div className="pt-1 space-y-2">
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
                  disabled={isExporting !== null || !maskData}
                  onClick={() => handleExport('jpg')}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-amber-400/35 text-xs sm:text-sm font-semibold text-amber-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-4 h-4 text-amber-300" />
                  <span>{isExporting === 'jpg' ? 'Exporting...' : 'Export JPG'}</span>
                </button>

                <button
                  type="button"
                  disabled={isExporting !== null || !maskData}
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

        {/* Right: DSLR Blur/Bokeh, Studio Backgrounds & Hair/Subject Edge Refinement */}
        <div className="lg:col-span-5 xl:col-span-5 space-y-4">
          <div className="rounded-2xl bg-[#080A11]/95 border border-violet-500/20 p-3.5 sm:p-4 space-y-4">
            {/* Section Tabs */}
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#05060A] border border-white/10">
              <button
                type="button"
                onClick={() => setRightTab('bokeh')}
                className={`min-h-[42px] px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  rightTab === 'bokeh'
                    ? 'bg-gradient-to-r from-violet-600/35 to-purple-600/30 border border-violet-400/60 text-white'
                    : 'text-slate-400 hover:text-white border border-transparent'
                }`}
              >
                <Aperture className="w-3.5 h-3.5 text-amber-300" />
                <span>DSLR Blur</span>
              </button>

              <button
                type="button"
                onClick={() => setRightTab('backgrounds')}
                className={`min-h-[42px] px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  rightTab === 'backgrounds'
                    ? 'bg-gradient-to-r from-violet-600/35 to-purple-600/30 border border-violet-400/60 text-white'
                    : 'text-slate-400 hover:text-white border border-transparent'
                }`}
              >
                <ImagePlus className="w-3.5 h-3.5 text-violet-300" />
                <span>Backdrops</span>
              </button>

              <button
                type="button"
                onClick={() => setRightTab('edges')}
                className={`min-h-[42px] px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  rightTab === 'edges'
                    ? 'bg-gradient-to-r from-violet-600/35 to-purple-600/30 border border-violet-400/60 text-white'
                    : 'text-slate-400 hover:text-white border border-transparent'
                }`}
              >
                <Sliders className="w-3.5 h-3.5 text-amber-300" />
                <span>Edge &amp; Hair</span>
              </button>
            </div>

            {rightTab === 'bokeh' && (
              <div className="space-y-4">
                {/* Blur Intensity 0-100 */}
                <div className="rounded-xl bg-[#05060A] border border-white/10 p-3.5 space-y-2">
                  <p className="text-xs font-bold bg-gradient-to-r from-[#FDE68A] via-[#D4AF37] to-[#F59E0B] bg-clip-text text-transparent">
                    DSLR Optical Depth &amp; Bokeh
                  </p>
                  <SliderControl
                    label="Background Blur Intensity"
                    value={config.blurIntensity}
                    min={0}
                    max={100}
                    defaultValue={68}
                    unit="%"
                    onChange={(v) => setConfig((prev) => ({ ...prev, blurIntensity: v }))}
                  />

                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {BOKEH_OPTIONS.map((opt) => {
                      const active = config.bokehStyle === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setConfig((prev) => ({ ...prev, bokehStyle: opt.id }))}
                          className={`min-h-[58px] p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                            active
                              ? 'bg-violet-600/25 border-violet-400 text-white shadow-[0_0_16px_rgba(139,92,246,0.28)]'
                              : 'bg-[#090B12] border-white/10 text-slate-300 hover:border-white/25'
                          }`}
                        >
                          <p className="text-xs font-bold bg-gradient-to-r from-[#FDE68A] via-[#D4AF37] to-[#F59E0B] bg-clip-text text-transparent">
                            {opt.label}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{opt.sub}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Independent Lighting & Background Grading */}
                <div className="rounded-xl bg-[#05060A] border border-white/10 p-3.5 space-y-1">
                  <p className="text-xs font-bold bg-gradient-to-r from-[#FDE68A] via-[#D4AF37] to-[#F59E0B] bg-clip-text text-transparent flex items-center gap-1.5 pb-1">
                    <Sun className="w-3.5 h-3.5 text-amber-300" />
                    <span>Subject &amp; Background Lighting</span>
                  </p>

                  <SliderControl
                    label="Portrait Lighting (Subject Only)"
                    value={config.portraitLighting}
                    min={-40}
                    max={60}
                    defaultValue={12}
                    onChange={(v) => setConfig((prev) => ({ ...prev, portraitLighting: v }))}
                  />
                  <SliderControl
                    label="Background Brightness"
                    value={config.bgBrightness}
                    min={-60}
                    max={60}
                    defaultValue={-6}
                    onChange={(v) => setConfig((prev) => ({ ...prev, bgBrightness: v }))}
                  />
                  <SliderControl
                    label="Background Saturation"
                    value={config.bgSaturation}
                    min={-100}
                    max={100}
                    defaultValue={-8}
                    onChange={(v) => setConfig((prev) => ({ ...prev, bgSaturation: v }))}
                  />
                </div>
              </div>
            )}

            {rightTab === 'backgrounds' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {BACKGROUND_OPTIONS.map((bg) => {
                    const active = config.backgroundMode === bg.id;
                    return (
                      <button
                        key={bg.id}
                        type="button"
                        onClick={() => {
                          if (bg.id === 'custom-image' && !config.customBgImageUrl) {
                            uploadCustomBgRef.current?.click();
                          }
                          setConfig((prev) => ({ ...prev, backgroundMode: bg.id }));
                        }}
                        className={`rounded-xl border p-2 text-left transition-all cursor-pointer bg-[#05060A] ${
                          active
                            ? 'border-violet-400 ring-2 ring-violet-500/40 shadow-[0_0_18px_rgba(139,92,246,0.28)]'
                            : 'border-white/10 hover:border-white/25'
                        }`}
                      >
                        <div
                          className="h-12 w-full rounded-lg border border-white/10 mb-2"
                          style={bg.swatchStyle}
                        />
                        <p className="text-xs font-bold bg-gradient-to-r from-[#FDE68A] via-[#D4AF37] to-[#F59E0B] bg-clip-text text-transparent truncate">
                          {bg.label}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Gradient Controls */}
                {config.backgroundMode === 'custom-gradient' && (
                  <div className="rounded-xl bg-[#05060A] border border-violet-500/25 p-3.5 space-y-3">
                    <p className="text-xs font-bold bg-gradient-to-r from-[#FDE68A] via-[#D4AF37] to-[#F59E0B] bg-clip-text text-transparent">
                      Custom Gradient Builder
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-1 text-[11px] text-slate-300">
                        <span>Top / Primary Color</span>
                        <input
                          type="color"
                          value={config.customGradientStart}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              customGradientStart: e.target.value,
                            }))
                          }
                          className="w-full h-10 rounded-lg bg-[#090B12] border border-white/15 cursor-pointer"
                        />
                      </label>
                      <label className="space-y-1 text-[11px] text-slate-300">
                        <span>Bottom / Deep Color</span>
                        <input
                          type="color"
                          value={config.customGradientEnd}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              customGradientEnd: e.target.value,
                            }))
                          }
                          className="w-full h-10 rounded-lg bg-[#090B12] border border-white/15 cursor-pointer"
                        />
                      </label>
                    </div>
                    <SliderControl
                      label="Gradient Angle"
                      value={config.customGradientAngle}
                      min={0}
                      max={360}
                      defaultValue={145}
                      unit="°"
                      onChange={(v) => setConfig((prev) => ({ ...prev, customGradientAngle: v }))}
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_GRADIENTS.map((qg) => (
                        <button
                          key={qg.label}
                          type="button"
                          onClick={() =>
                            setConfig((prev) => ({
                              ...prev,
                              customGradientStart: qg.start,
                              customGradientEnd: qg.end,
                              customGradientAngle: qg.angle,
                            }))
                          }
                          className="min-h-[34px] px-2.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-[11px] text-slate-200 cursor-pointer"
                        >
                          {qg.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Custom Background Image Upload & Presets */}
                {config.backgroundMode === 'custom-image' && (
                  <div className="rounded-xl bg-[#05060A] border border-violet-500/25 p-3.5 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold bg-gradient-to-r from-[#FDE68A] via-[#D4AF37] to-[#F59E0B] bg-clip-text text-transparent">
                        Custom Background Photo
                      </p>
                      <button
                        type="button"
                        onClick={() => uploadCustomBgRef.current?.click()}
                        className="min-h-[38px] px-3 rounded-lg bg-violet-600/30 hover:bg-violet-600/45 border border-violet-400/50 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload Scene</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {STUDIO_ASSETS.slice(3).map((scene) => (
                        <button
                          key={scene.id}
                          type="button"
                          onClick={() =>
                            setConfig((prev) => ({
                              ...prev,
                              backgroundMode: 'custom-image',
                              customBgImageUrl: scene.url,
                            }))
                          }
                          className={`rounded-lg overflow-hidden border aspect-[16/10] cursor-pointer ${
                            config.customBgImageUrl === scene.url
                              ? 'border-amber-400 ring-1 ring-amber-400'
                              : 'border-white/10'
                          }`}
                        >
                          <img
                            src={scene.url}
                            alt={scene.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {rightTab === 'edges' && (
              <div className="rounded-xl bg-[#05060A] border border-white/10 p-3.5 space-y-2">
                <p className="text-xs font-bold bg-gradient-to-r from-[#FDE68A] via-[#D4AF37] to-[#F59E0B] bg-clip-text text-transparent pb-1">
                  Hair &amp; Subject Edge Refinement
                </p>

                <SliderControl
                  label="Hair Edge Refinement"
                  value={config.hairRefinement}
                  min={0}
                  max={100}
                  defaultValue={65}
                  unit="%"
                  onChange={(v) => setConfig((prev) => ({ ...prev, hairRefinement: v }))}
                />
                <SliderControl
                  label="Subject Edge Tighten / Expand"
                  value={config.subjectEdgeShift}
                  min={-20}
                  max={20}
                  defaultValue={0}
                  onChange={(v) => setConfig((prev) => ({ ...prev, subjectEdgeShift: v }))}
                />
                <SliderControl
                  label="Edge Feather Smoothness"
                  value={config.edgeFeather}
                  min={0}
                  max={12}
                  defaultValue={3}
                  unit="px"
                  onChange={(v) => setConfig((prev) => ({ ...prev, edgeFeather: v }))}
                />

                <p className="text-[11px] text-slate-400 pt-2 border-t border-white/[0.06] leading-relaxed">
                  Tip: Toggle <strong className="text-slate-200">Keep</strong> or{' '}
                  <strong className="text-slate-200">Erase</strong> above the portrait to paint touch mask refinements directly along fine hair strands or shoulders.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
