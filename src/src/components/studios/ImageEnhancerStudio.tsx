import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Wand2, Download, Save, AlertCircle, Check } from 'lucide-react';
import { AppSettings, EnhanceParams, ExportRecord, ProjectItem } from '../../types/editor';
import { AssetPickerBar } from '../AssetPickerBar';
import { BeforeAfterSlider } from '../BeforeAfterSlider';
import { SliderControl } from '../SliderControl';
import {
  compressImageForAI,
  createThumbnailDataUrl,
  loadImageElement,
  renderEnhancedCanvas,
} from '../../utils/canvasEngine';
import { downloadExportedBlob, encodeCanvasToBlob } from '../../utils/exportEngine';
import { releaseCanvasMemory } from '../../utils/hdQualityEngine';
import { GallerySaveResult, exportCanvasViaGallery } from '../../utils/gallerySaveEngine';
import { GallerySaveBanner } from '../GallerySaveBanner';

interface ImageEnhancerStudioProps {
  imageUrl: string;
  onChangeImage: (url: string) => void;
  settings: AppSettings;
  onSaveProject: (project: ProjectItem) => Promise<boolean> | void;
  onRecordExport?: (record: ExportRecord) => void;
}

const ENHANCE_MODES = [
  { id: 'restore', label: 'AI Restore' },
  { id: 'portrait', label: 'Portrait Clarity' },
  { id: 'night', label: 'Night Denoise' },
  { id: 'upscale', label: '2x Crisp Upscale' },
] as const;

export const ImageEnhancerStudio: React.FC<ImageEnhancerStudioProps> = ({
  imageUrl,
  onChangeImage,
  settings,
  onSaveProject,
  onRecordExport,
}) => {
  const [params, setParams] = useState<EnhanceParams>({
    sharpen: 42,
    denoise: 16,
    clarity: 32,
    exposureLift: 4,
    contrastBoost: 14,
    colorVibrance: 14,
    upscale2x: settings.defaultUpscale === '2x',
  });
  const [mode, setMode] = useState<(typeof ENHANCE_MODES)[number]['id']>('restore');
  const [afterPreviewUrl, setAfterPreviewUrl] = useState<string>(imageUrl);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [gallerySaving, setGallerySaving] = useState(false);
  const [galleryProgress, setGalleryProgress] = useState(0);
  const [galleryStage, setGalleryStage] = useState<string | null>(null);
  const [galleryResult, setGalleryResult] = useState<GallerySaveResult | null>(null);

  const imgRef = useRef<HTMLImageElement | null>(null);

  const recomputePreview = (img: HTMLImageElement, p: EnhanceParams) => {
    const c = document.createElement('canvas');
    renderEnhancedCanvas(img, c, p, 960);
    setAfterPreviewUrl(c.toDataURL('image/jpeg', 0.92));
  };

  useEffect(() => {
    let cancelled = false;
    loadImageElement(imageUrl)
      .then((img) => {
        if (cancelled) return;
        imgRef.current = img;
        setDims({ w: img.naturalWidth, h: img.naturalHeight });
        recomputePreview(img, params);
      })
      .catch(() => {
        if (!cancelled) setAiError('Unable to load image for enhancement.');
      });
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  useEffect(() => {
    if (imgRef.current) {
      recomputePreview(imgRef.current, params);
    }
  }, [params]);

  const runAiDiagnose = async (selectedMode = mode) => {
    if (!imgRef.current) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const { base64, mimeType } = compressImageForAI(imgRef.current, 768);
      const res = await fetch('/api/ai/enhance-diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType,
          mode: selectedMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI enhancement diagnosis failed.');
      setParams((prev) => ({
        ...prev,
        sharpen: Number(data.sharpen ?? 45),
        denoise: Number(data.denoise ?? 18),
        clarity: Number(data.clarity ?? 34),
        exposureLift: Number(data.exposureLift ?? 4),
        contrastBoost: Number(data.contrastBoost ?? 14),
        colorVibrance: Number(data.colorVibrance ?? 14),
        diagnosisNote: data.diagnosisNote,
      }));
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Unable to reach AI enhancement engine.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleExport = async (
    forceDuplicate = false,
    triggerSource: 'save' | 'export' | 'manual' = 'export'
  ) => {
    if (!imgRef.current) return;
    const fmt = settings.exportFormat === 'jpeg' ? 'jpg' : settings.exportFormat;
    setGallerySaving(true);
    setGalleryProgress(12);
    setGalleryStage(`Rendering enhanced ${fmt.toUpperCase()}...`);
    setGalleryResult(null);
    const outCanvas = document.createElement('canvas');
    try {
      renderEnhancedCanvas(imgRef.current, outCanvas, params);
      const baseFileName = `dipti-enhanced-${params.upscale2x ? '2x-' : ''}${outCanvas.width}x${outCanvas.height}-${Date.now()}`;
      if (!settings.autoSaveToGallery && triggerSource === 'export') {
        const { blob } = await encodeCanvasToBlob(outCanvas, fmt, settings.exportQuality);
        const fileName = `${baseFileName}.${fmt}`;
        downloadExportedBlob(blob, fileName);
        onRecordExport?.({
          id: `exp-enh-${Date.now()}`,
          fileName,
          mediaType: 'image',
          format: fmt,
          resolutionLabel: `${outCanvas.width}×${outCanvas.height}`,
          width: outCanvas.width,
          height: outCanvas.height,
          quality: fmt === 'png' ? 100 : settings.exportQuality,
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
        format: fmt,
        qualityPercent: settings.exportQuality,
        settings,
        triggerSource,
        forceDuplicate,
        onProgress: (pct, st) => {
          setGalleryProgress(pct);
          setGalleryStage(st);
        },
        onRecordExport: onRecordExport ? async (rec) => { onRecordExport(rec); } : undefined,
      });
      setGalleryResult(gRes);
    } finally {
      window.setTimeout(() => releaseCanvasMemory(outCanvas), 500);
      setGallerySaving(false);
    }
  };

  const handleSave = async () => {
    if (!imgRef.current) return;
    const c = document.createElement('canvas');
    renderEnhancedCanvas(imgRef.current, c, params, 640);
    const thumb = createThumbnailDataUrl(c, 480);
    releaseCanvasMemory(c);
    const scale = params.upscale2x ? 2 : 1;
    const ok = await onSaveProject({
      id: `proj-${Date.now()}`,
      name: `Enhanced ${scale}x Frame`,
      tool: 'enhancer',
      thumbnailDataUrl: thumb || afterPreviewUrl,
      sourceImageUrl: imageUrl,
      width: dims.w * scale,
      height: dims.h * scale,
      updatedAt: new Date().toISOString(),
    });
    if (ok === false) return;
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);

    if (settings.autoSaveToGallery) {
      await handleExport(false, 'save');
    }
  };

  const outMult = params.upscale2x ? 2 : 1;

  return (
    <div className="space-y-4 pb-24 lg:pb-8">
      <AssetPickerBar activeImageUrl={imageUrl} onSelectImage={onChangeImage} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-7 xl:col-span-8 rounded-2xl bg-[#080B14] border border-white/10 p-3 sm:p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 text-xs font-mono-tabular text-slate-400">
            <span>
              Input {dims.w}×{dims.h} → Output{' '}
              <strong className="text-sky-300">
                {dims.w * outMult}×{dims.h * outMult}px
              </strong>
            </span>
            <span className="text-amber-300">{params.upscale2x ? '2x Upscale Active' : '1x Native'}</span>
          </div>

          <div className="h-[320px] sm:h-[460px]">
            <BeforeAfterSlider
              beforeSrc={imageUrl}
              afterSrc={afterPreviewUrl}
              beforeLabel="Original"
              afterLabel={`Enhanced ${outMult}x`}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={handleSave}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-xs sm:text-sm font-semibold text-white flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              {savedNotice ? <Check className="w-4 h-4 text-emerald-400" /> : <Save className="w-4 h-4 text-amber-300" />}
              <span>{savedNotice ? 'Saved to Projects' : 'Save Enhanced'}</span>
            </button>

            <button
              type="button"
              onClick={() => handleExport(false, 'export')}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-violet-600 hover:brightness-110 text-xs sm:text-sm font-semibold text-white flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export {outMult}x {settings.exportFormat.toUpperCase()}</span>
            </button>
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

        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          <div className="rounded-2xl bg-[#0B1020]/85 backdrop-blur-xl border border-sky-400/25 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-sky-300" />
                <h2 className="font-display text-sm font-bold text-white">AI Detail Restoration</h2>
              </div>
              <span className="text-[11px] font-mono-tabular text-amber-300">Deconvolution</span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {ENHANCE_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setMode(m.id);
                    if (m.id === 'upscale') setParams((p) => ({ ...p, upscale2x: true }));
                  }}
                  className={`min-h-[38px] px-2.5 rounded-xl border text-xs font-medium cursor-pointer transition-colors ${
                    mode === m.id
                      ? 'bg-sky-500/20 border-sky-400 text-white'
                      : 'bg-[#060812] border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={aiLoading}
              onClick={() => runAiDiagnose()}
              className="w-full min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-sky-500 to-violet-600 hover:brightness-110 disabled:opacity-50 text-xs sm:text-sm font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
            >
              <Wand2 className={`w-4 h-4 ${aiLoading ? 'animate-spin' : ''}`} />
              <span>{aiLoading ? 'Diagnosing Pixels...' : 'Auto-Enhance with AI'}</span>
            </button>

            {params.diagnosisNote && (
              <p className="text-xs text-sky-200 bg-sky-500/10 border border-sky-400/20 rounded-xl px-3 py-2">
                {params.diagnosisNote}
              </p>
            )}
            {aiError && (
              <div className="flex items-start gap-2 text-xs text-rose-200 bg-rose-500/10 border border-rose-400/25 rounded-xl px-3 py-2">
                <AlertCircle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
                <span>{aiError}</span>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-[#0B1020]/85 backdrop-blur-xl border border-white/10 p-4 space-y-2">
            <div className="flex items-center justify-between pb-2 mb-1 border-b border-white/[0.07]">
              <div>
                <span className="text-xs font-medium text-slate-200 block">2x Local Bicubic + Sharpen</span>
                <span className="text-[10px] text-slate-400">Uses high-quality resampling (no fake AI upscaling)</span>
              </div>
              <button
                type="button"
                onClick={() => setParams((p) => ({ ...p, upscale2x: !p.upscale2x }))}
                className={`min-h-[34px] px-3 rounded-lg border text-xs font-mono-tabular cursor-pointer ${
                  params.upscale2x
                    ? 'bg-amber-400/20 border-amber-400/60 text-amber-200 font-semibold'
                    : 'bg-[#060812] border-white/10 text-slate-400'
                }`}
              >
                {params.upscale2x ? '2x ON' : '1x OFF'}
              </button>
            </div>

            <SliderControl
              label="Detail Sharpen"
              value={params.sharpen}
              min={0}
              max={100}
              defaultValue={42}
              onChange={(v) => setParams((p) => ({ ...p, sharpen: v }))}
            />
            <SliderControl
              label="Noise Smooth"
              value={params.denoise}
              min={0}
              max={60}
              defaultValue={16}
              onChange={(v) => setParams((p) => ({ ...p, denoise: v }))}
            />
            <SliderControl
              label="Micro Clarity"
              value={params.clarity}
              min={0}
              max={80}
              defaultValue={32}
              onChange={(v) => setParams((p) => ({ ...p, clarity: v }))}
            />
            <SliderControl
              label="Exposure Lift"
              value={params.exposureLift}
              min={-25}
              max={30}
              defaultValue={4}
              onChange={(v) => setParams((p) => ({ ...p, exposureLift: v }))}
            />
            <SliderControl
              label="Contrast Boost"
              value={params.contrastBoost}
              min={0}
              max={40}
              defaultValue={14}
              onChange={(v) => setParams((p) => ({ ...p, contrastBoost: v }))}
            />
            <SliderControl
              label="Color Vibrance"
              value={params.colorVibrance}
              min={0}
              max={45}
              defaultValue={14}
              onChange={(v) => setParams((p) => ({ ...p, colorVibrance: v }))}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
