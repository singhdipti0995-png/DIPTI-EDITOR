import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ShieldCheck,
  Download,
  CheckCircle2,
  AlertCircle,
  Play,
  Loader2,
  Sliders,
  Film,
  Sparkles,
  RotateCcw,
} from 'lucide-react';
import { AppSettings, DEFAULT_ADJUSTMENTS, ExportRecord, PhotoAdjustments } from '../../types/editor';
import { ExportResolution, VideoClip, VideoQualityTier } from '../../types/video';
import { FILTER_PRESETS } from '../../data/studioCatalog';
import { AssetPickerBar } from '../AssetPickerBar';
import { BeforeAfterSlider } from '../BeforeAfterSlider';
import { SliderControl } from '../SliderControl';
import {
  createThumbnailDataUrl,
  loadImageElement,
  renderAdjustedCanvas,
} from '../../utils/canvasEngine';
import {
  ImageExportFormat,
  detectImageFormatSupport,
  downloadExportedBlob,
  encodeCanvasToBlob,
} from '../../utils/exportEngine';
import {
  HdAuditTestResult,
  HdQualityPreset,
  releaseCanvasMemory,
  resolveHdPhotoExportPlan,
  resolveHdVideoExportPlan,
  runHdQualityVerificationSuite,
} from '../../utils/hdQualityEngine';
import { renderDslrPortraitComposition, runLocalSubjectSegmentation } from '../../utils/dslrPortraitEngine';
import { DEFAULT_DSLR_CONFIG } from '../../utils/dslrPortraitEngine';
import { formatBytes } from '../../utils/indexedDbStorage';
import { GallerySaveResult, saveMediaToGallery } from '../../utils/gallerySaveEngine';
import { GallerySaveBanner } from '../GallerySaveBanner';

interface HdQualityStudioProps {
  imageUrl: string;
  onChangeImage: (url: string) => void;
  settings: AppSettings;
  onRecordExport?: (record: ExportRecord) => Promise<void>;
  onOpenExportCenter?: () => void;
}

const FEATURED_FILTERS = FILTER_PRESETS.slice(0, 10);

export const HdQualityStudio: React.FC<HdQualityStudioProps> = ({
  imageUrl,
  onChangeImage,
  settings,
  onRecordExport,
  onOpenExportCenter,
}) => {
  const [sourceDims, setSourceDims] = useState<{ w: number; h: number }>({ w: 1920, h: 1080 });
  const [beforeUrl, setBeforeUrl] = useState<string>(imageUrl);
  const [afterUrl, setAfterUrl] = useState<string>(imageUrl);

  const [selectedFilterId, setSelectedFilterId] = useState<string>('obsidian-gold');
  const [filterIntensity, setFilterIntensity] = useState<number>(75);
  const [sharpness, setSharpness] = useState<number>(36);
  const [hdrBoost, setHdrBoost] = useState<number>(16);

  const [qualityPreset, setQualityPreset] = useState<HdQualityPreset>('original');
  const [customQuality, setCustomQuality] = useState<number>(settings.exportQuality || 96);

  const [isExporting, setIsExporting] = useState<ImageExportFormat | null>(null);
  const [lastExportResult, setLastExportResult] = useState<{
    format: string;
    dims: string;
    bytes: number;
    fileName: string;
  } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [gallerySaving, setGallerySaving] = useState(false);
  const [galleryProgress, setGalleryProgress] = useState(0);
  const [galleryStage, setGalleryStage] = useState<string | null>(null);
  const [galleryResult, setGalleryResult] = useState<GallerySaveResult | null>(null);
  const [lastFormatUsed, setLastFormatUsed] = useState<ImageExportFormat>('png');

  // Video Quality Guard Tester
  const [simSourceTier, setSimSourceTier] = useState<'720p' | '1080p' | '4k'>('1080p');
  const [simTargetRes, setSimTargetRes] = useState<ExportResolution>('4k');
  const [simQualityTier, setSimQualityTier] = useState<VideoQualityTier>('maximum');
  const [simFps, setSimFps] = useState<24 | 30 | 60>(30);

  // Automated QA Suite
  const [runningAudit, setRunningAudit] = useState(false);
  const [auditResults, setAuditResults] = useState<HdAuditTestResult[] | null>(null);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const imgSupport = useMemo(() => detectImageFormatSupport(), []);

  const computedAdjustments: PhotoAdjustments = useMemo(
    () => ({
      ...DEFAULT_ADJUSTMENTS,
      activeFilterId: selectedFilterId,
      filterIntensity,
      sharpness,
      hdr: hdrBoost,
    }),
    [selectedFilterId, filterIntensity, sharpness, hdrBoost]
  );

  // Load full-resolution source and generate crisp comparison frames
  useEffect(() => {
    let cancelled = false;
    loadImageElement(imageUrl)
      .then((img) => {
        if (cancelled) return;
        imgRef.current = img;
        setSourceDims({ w: img.naturalWidth, h: img.naturalHeight });
        setBeforeUrl(imageUrl);

        const c = document.createElement('canvas');
        renderAdjustedCanvas(img, c, computedAdjustments, { maxPreviewDim: 1280 });
        setAfterUrl(c.toDataURL('image/png'));
        releaseCanvasMemory(c);
      })
      .catch(() => {
        if (!cancelled) setExportError('Unable to decode image for HD quality inspection.');
      });
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  useEffect(() => {
    if (!imgRef.current) return;
    const c = document.createElement('canvas');
    renderAdjustedCanvas(imgRef.current, c, computedAdjustments, { maxPreviewDim: 1280 });
    setAfterUrl(c.toDataURL('image/png'));
    releaseCanvasMemory(c);
  }, [computedAdjustments]);

  const photoPlan = useMemo(
    () =>
      resolveHdPhotoExportPlan(
        sourceDims.w,
        sourceDims.h,
        qualityPreset,
        'jpg',
        'original',
        customQuality
      ),
    [sourceDims.w, sourceDims.h, qualityPreset, customQuality]
  );

  const videoPlan = useMemo(() => {
    const dims =
      simSourceTier === '4k'
        ? { w: 3840, h: 2160 }
        : simSourceTier === '1080p'
          ? { w: 1920, h: 1080 }
          : { w: 1280, h: 720 };
    const mockClip: VideoClip = {
      id: 'audit-clip',
      name: `Source ${simSourceTier}`,
      sourceType: 'video',
      src: '',
      nativeDuration: 6,
      nativeWidth: dims.w,
      nativeHeight: dims.h,
      nativeFps: simFps,
      trimStart: 0,
      trimEnd: 6,
      speed: 1,
      slowMoBlur: false,
      volume: 100,
      brightness: 0,
      contrast: 0,
      saturation: 0,
      vignette: 0,
      filterId: 'natural',
      transitionOut: 'none',
      transitionDuration: 0.5,
    };
    return resolveHdVideoExportPlan('16:9', [mockClip], simTargetRes, simQualityTier, simFps, 18);
  }, [simSourceTier, simTargetRes, simQualityTier, simFps]);

  const handleFullResExport = async (
    format: ImageExportFormat,
    forceDuplicate = false,
    triggerSource: 'export' | 'manual' = 'export'
  ) => {
    if (!imgRef.current) return;
    setExportError(null);
    setIsExporting(format);
    setLastFormatUsed(format);
    setGallerySaving(true);
    setGalleryProgress(12);
    setGalleryStage(`Rendering 1:1 full-resolution ${format.toUpperCase()}...`);
    setGalleryResult(null);

    const outCanvas = document.createElement('canvas');
    try {
      // Always render at exact 1:1 original natural dimensions without maxPreviewDim clamp
      renderAdjustedCanvas(imgRef.current, outCanvas, computedAdjustments);
      const plan = resolveHdPhotoExportPlan(
        outCanvas.width,
        outCanvas.height,
        qualityPreset,
        format,
        'original',
        customQuality
      );
      setGalleryProgress(40);
      const { blob, mimeType } = await encodeCanvasToBlob(outCanvas, format, plan.qualityPercent);
      const fileName = `dipti-hd-${selectedFilterId}-${outCanvas.width}x${outCanvas.height}.${format}`;
      const thumb = createThumbnailDataUrl(outCanvas, 320);

      if (!settings.autoSaveToGallery && triggerSource === 'export') {
        downloadExportedBlob(blob, fileName);
        setLastExportResult({
          format: format.toUpperCase(),
          dims: `${outCanvas.width}×${outCanvas.height}`,
          bytes: blob.size,
          fileName,
        });
        if (onRecordExport) {
          await onRecordExport({
            id: `exp-hd-${Date.now()}`,
            fileName,
            mediaType: 'image',
            format,
            resolutionLabel: `${outCanvas.width}×${outCanvas.height}`,
            width: outCanvas.width,
            height: outCanvas.height,
            quality: plan.qualityPercent,
            fileSizeBytes: blob.size,
            status: 'completed',
            thumbnailDataUrl: thumb,
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
        quality: format === 'png' ? 100 : plan.qualityPercent,
        thumbnailDataUrl: thumb,
        settings,
        triggerSource,
        forceDuplicate,
        onProgress: (pct, st) => {
          setGalleryProgress(pct);
          setGalleryStage(st);
        },
        onRecordExport,
      });

      setGalleryResult(gRes);
      if (gRes.saved) {
        setLastExportResult({
          format: format.toUpperCase(),
          dims: `${outCanvas.width}×${outCanvas.height}`,
          bytes: blob.size,
          fileName,
        });
      } else if (gRes.error) {
        setExportError(gRes.error);
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Full-resolution HD export failed.');
    } finally {
      releaseCanvasMemory(outCanvas);
      setIsExporting(null);
      setGallerySaving(false);
    }
  };

  const handleRunQualityTests = async () => {
    setRunningAudit(true);
    try {
      const baseTests = await runHdQualityVerificationSuite(imgRef.current);

      // Additional live test: DSLR subject detection + background blur composition
      if (imgRef.current) {
        const mask = await runLocalSubjectSegmentation(imgRef.current);
        const dslrCanvas = document.createElement('canvas');
        renderDslrPortraitComposition(
          imgRef.current,
          dslrCanvas,
          mask,
          { ...DEFAULT_DSLR_CONFIG, blurIntensity: 68, bokehStyle: 'circular' },
          { showMaskOverlay: false }
        );
        const dslrOk =
          dslrCanvas.width === imgRef.current.naturalWidth &&
          dslrCanvas.height === imgRef.current.naturalHeight &&
          mask.width > 0;
        baseTests.push({
          id: 'dslr-fullres-blur',
          title: 'Portrait & Background Blur Full-Res Composition',
          passed: dslrOk,
          detail: dslrOk
            ? `Subject segmented locally via ${mask.engine} and composited at exact source resolution.`
            : 'DSLR blur composition failed to preserve original resolution.',
          metrics: `Mask ${mask.width}×${mask.height} · Output ${dslrCanvas.width}×${dslrCanvas.height}`,
        });
        releaseCanvasMemory(dslrCanvas);
      }

      setAuditResults(baseTests);
    } finally {
      setRunningAudit(false);
    }
  };

  return (
    <div className="space-y-5 pb-24 lg:pb-8">
      <AssetPickerBar activeImageUrl={imageUrl} onSelectImage={onChangeImage} />

      {/* Main Split: Zoomable Original vs Edited Comparison + HD Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-7 xl:col-span-8 rounded-2xl bg-[#080B14] border border-amber-400/20 p-3 sm:p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-300" />
              <span className="font-semibold text-white">Original vs Edited Zoom Comparison</span>
            </div>
            <span className="font-mono-tabular text-emerald-300">
              Source {sourceDims.w}×{sourceDims.h}px · Output {photoPlan.outputWidth}×{photoPlan.outputHeight}px
            </span>
          </div>

          <div className="h-[340px] sm:h-[470px]">
            <BeforeAfterSlider
              beforeSrc={beforeUrl}
              afterSrc={afterUrl}
              beforeLabel="Untouched Original"
              afterLabel="HD Filtered"
              enableZoom
            />
          </div>

          {/* Full-Resolution Export Strip */}
          <div className="pt-1 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#060812] border border-white/[0.08] px-3 py-2">
              <span className="text-xs text-slate-300 font-medium">
                Zero-Compression Loss Guard ·{' '}
                <strong className="text-amber-300">
                  {photoPlan.preservesOriginalResolution ? '100% Original Pixels Locked' : 'Custom Scaled'}
                </strong>
              </span>
              {onOpenExportCenter && (
                <button
                  type="button"
                  onClick={onOpenExportCenter}
                  className="text-xs font-semibold text-violet-300 hover:text-white cursor-pointer"
                >
                  Open Export Center →
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                disabled={Boolean(isExporting)}
                onClick={() => handleFullResExport('jpg')}
                className="min-h-[46px] px-4 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] border border-amber-400/40 text-xs font-semibold text-amber-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Download className="w-4 h-4 text-amber-300" />
                <span>
                  {isExporting === 'jpg' ? 'Rendering...' : `Export JPG (${photoPlan.qualityPercent}%)`}
                </span>
              </button>

              <button
                type="button"
                disabled={Boolean(isExporting) || !imgSupport.webp}
                onClick={() => handleFullResExport('webp')}
                className="min-h-[46px] px-4 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] border border-violet-400/40 text-xs font-semibold text-violet-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Download className="w-4 h-4 text-violet-300" />
                <span>{isExporting === 'webp' ? 'Rendering...' : 'Export WebP HD'}</span>
              </button>

              <button
                type="button"
                disabled={Boolean(isExporting)}
                onClick={() => handleFullResExport('png')}
                className="min-h-[46px] px-4 rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-amber-500 hover:brightness-110 text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-[0_6px_24px_rgba(124,58,237,0.3)]"
              >
                <Download className="w-4 h-4" />
                <span>{isExporting === 'png' ? 'Rendering...' : 'Export Lossless PNG'}</span>
              </button>
            </div>

            {lastExportResult && !galleryResult && (
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/30 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-200">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                  <span>
                    Exported <strong>{lastExportResult.fileName}</strong>
                  </span>
                </span>
                <span className="font-mono-tabular">
                  {lastExportResult.dims} px · {lastExportResult.format} · {formatBytes(lastExportResult.bytes)}
                </span>
              </div>
            )}

            {exportError && !galleryResult?.error && (
              <div className="rounded-xl bg-rose-500/10 border border-rose-400/35 px-3.5 py-2.5 flex items-center gap-2 text-xs text-rose-200">
                <AlertCircle className="w-4 h-4 text-rose-300 shrink-0" />
                <span>{exportError}</span>
              </div>
            )}

            <GallerySaveBanner
              saving={gallerySaving}
              progressPct={galleryProgress}
              stageLabel={galleryStage}
              result={galleryResult}
              onSaveCopyAnyway={() => handleFullResExport(lastFormatUsed, true, 'manual')}
              onDismiss={() => setGalleryResult(null)}
            />
          </div>
        </div>

        {/* Right Controls: HD Quality Tiers, Detail Preservation & Video 4K Honesty */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          <div className="rounded-2xl bg-[#0B1020]/90 border border-white/10 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-300" />
                <h2 className="font-display text-sm font-bold text-white">Photo Quality Engine</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedFilterId('original');
                  setFilterIntensity(100);
                  setSharpness(0);
                  setHdrBoost(0);
                }}
                className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { id: 'original', label: 'Original (98%)' },
                  { id: 'high', label: 'High (92%)' },
                  { id: 'maximum', label: 'Maximum (100%)' },
                  { id: 'custom', label: 'Custom Quality' },
                ] as const
              ).map((tier) => (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => setQualityPreset(tier.id)}
                  className={`min-h-[40px] px-2.5 rounded-xl border text-xs font-semibold cursor-pointer ${
                    qualityPreset === tier.id
                      ? 'bg-amber-400/20 border-amber-400/70 text-amber-100'
                      : 'bg-[#060812] border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  {tier.label}
                </button>
              ))}
            </div>

            {qualityPreset === 'custom' && (
              <SliderControl
                label="Custom JPEG / WebP Quality"
                value={customQuality}
                min={50}
                max={100}
                defaultValue={96}
                unit="%"
                onChange={setCustomQuality}
              />
            )}

            <div className="space-y-2 pt-2 border-t border-white/[0.07]">
              <p className="text-xs font-semibold text-white">Full-Res Filter Pipeline</p>
              <div className="grid grid-cols-2 gap-1.5 max-h-[160px] overflow-y-auto pr-1">
                {FEATURED_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelectedFilterId(f.id)}
                    className={`min-h-[36px] px-2.5 rounded-lg border text-[11px] font-medium text-left truncate cursor-pointer ${
                      selectedFilterId === f.id
                        ? 'bg-violet-600/30 border-amber-400/60 text-white'
                        : 'bg-[#060812] border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            </div>

            <SliderControl
              label="Filter Intensity"
              value={filterIntensity}
              min={0}
              max={100}
              defaultValue={75}
              unit="%"
              onChange={setFilterIntensity}
            />
            <SliderControl
              label="Crisp Edge Sharpening"
              value={sharpness}
              min={0}
              max={100}
              defaultValue={36}
              unit="%"
              onChange={setSharpness}
            />
            <SliderControl
              label="Texture Micro-Contrast"
              value={hdrBoost}
              min={0}
              max={60}
              defaultValue={16}
              unit="%"
              onChange={setHdrBoost}
            />
          </div>

          {/* Video Resolution & Fake-4K Guard Matrix */}
          <div className="rounded-2xl bg-[#0B1020]/90 border border-white/10 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Film className="w-4 h-4 text-violet-300" />
              <h2 className="font-display text-sm font-bold text-white">Video Quality &amp; 4K Protection</h2>
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] text-slate-400 block">Simulated Source Footage Resolution</span>
              <div className="grid grid-cols-3 gap-1.5">
                {(['720p', '1080p', '4k'] as const).map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => setSimSourceTier(tier)}
                    className={`min-h-[38px] rounded-lg border text-xs font-mono-tabular uppercase font-semibold cursor-pointer ${
                      simSourceTier === tier
                        ? 'bg-violet-600/30 border-violet-400 text-white'
                        : 'bg-[#060812] border-white/10 text-slate-400'
                    }`}
                  >
                    {tier}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] text-slate-400 block">Requested Export Target</span>
              <div className="grid grid-cols-4 gap-1.5">
                {(['original', '720p', '1080p', '4k'] as const).map((res) => (
                  <button
                    key={res}
                    type="button"
                    onClick={() => setSimTargetRes(res)}
                    className={`min-h-[38px] rounded-lg border text-[11px] font-mono-tabular uppercase font-semibold cursor-pointer ${
                      simTargetRes === res
                        ? 'bg-amber-400/20 border-amber-400/70 text-amber-100'
                        : 'bg-[#060812] border-white/10 text-slate-400'
                    }`}
                  >
                    {res === 'original' ? 'Source' : res}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {(['high', 'maximum'] as const).map((qt) => (
                <button
                  key={qt}
                  type="button"
                  onClick={() => setSimQualityTier(qt)}
                  className={`min-h-[36px] rounded-lg border text-xs font-medium capitalize cursor-pointer ${
                    simQualityTier === qt
                      ? 'bg-white/10 border-amber-400/50 text-white'
                      : 'bg-[#060812] border-white/10 text-slate-400'
                  }`}
                >
                  {qt} Bitrate
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {([24, 30, 60] as const).map((fps) => (
                <button
                  key={fps}
                  type="button"
                  onClick={() => setSimFps(fps)}
                  className={`min-h-[36px] rounded-lg border text-xs font-mono-tabular cursor-pointer ${
                    simFps === fps
                      ? 'bg-white/10 border-violet-400/50 text-white'
                      : 'bg-[#060812] border-white/10 text-slate-400'
                  }`}
                >
                  {fps} FPS
                </button>
              ))}
            </div>

            <div className="rounded-xl bg-[#060812] border border-white/[0.08] p-3 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Honest Output</span>
                <span className="font-mono-tabular font-bold text-amber-300">
                  {videoPlan.label} · {videoPlan.fps} fps · {videoPlan.bitrateMbps} Mbps
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                {videoPlan.warningNote
                  ? videoPlan.warningNote
                  : `Native resolution match confirmed (${videoPlan.effectiveResolution.toUpperCase()}). MP4: ${videoPlan.mp4Supported ? 'Ready' : 'N/A'}, WebM: ${videoPlan.webmSupported ? 'Ready' : 'N/A'}.`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Live Quality & Regression Testing Suite */}
      <section className="rounded-2xl bg-[#0B1020]/90 border border-white/10 p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-300" />
              <h2 className="font-display text-base sm:text-lg font-bold text-white">
                HD Quality Verification Suite
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              Runs real browser Canvas, Blob, DSLR Blur, and Video Non-Upscaling checks on this device.
            </p>
          </div>

          <button
            type="button"
            disabled={runningAudit}
            onClick={handleRunQualityTests}
            className="min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-violet-600 to-amber-500 hover:brightness-110 disabled:opacity-50 text-xs font-semibold text-white flex items-center gap-2 cursor-pointer"
          >
            {runningAudit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>{runningAudit ? 'Testing...' : 'Run Quality & Export Audit'}</span>
          </button>
        </div>

        {auditResults && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {auditResults.map((res) => (
              <div
                key={res.id}
                className={`rounded-xl border p-3.5 space-y-1.5 ${
                  res.passed
                    ? 'bg-emerald-500/5 border-emerald-400/30'
                    : 'bg-rose-500/10 border-rose-400/35'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                    {res.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span>{res.title}</span>
                  </span>
                  <span
                    className={`text-[11px] font-mono-tabular font-bold ${
                      res.passed ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    {res.passed ? 'PASS' : 'FAIL'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">{res.detail}</p>
                <p className="text-[11px] font-mono-tabular text-amber-300">{res.metrics}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
