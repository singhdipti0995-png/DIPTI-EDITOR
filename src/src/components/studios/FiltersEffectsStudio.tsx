import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Palette, Download, Save, Eye, Check, RotateCcw } from 'lucide-react';
import {
  AppSettings,
  DEFAULT_ADJUSTMENTS,
  ExportRecord,
  FilterPreset,
  PhotoAdjustments,
  ProjectItem,
} from '../../types/editor';
import { FILTER_PRESETS } from '../../data/studioCatalog';
import { AssetPickerBar } from '../AssetPickerBar';
import { SliderControl } from '../SliderControl';
import {
  createThumbnailDataUrl,
  loadImageElement,
  renderAdjustedCanvas,
} from '../../utils/canvasEngine';
import { downloadExportedBlob, encodeCanvasToBlob } from '../../utils/exportEngine';
import { releaseCanvasMemory } from '../../utils/hdQualityEngine';
import { GallerySaveResult, exportCanvasViaGallery } from '../../utils/gallerySaveEngine';
import { GallerySaveBanner } from '../GallerySaveBanner';

interface FiltersEffectsStudioProps {
  imageUrl: string;
  onChangeImage: (url: string) => void;
  initialPresetId?: string;
  initialIntensity?: number;
  settings: AppSettings;
  onSaveProject: (project: ProjectItem) => Promise<boolean> | void;
  onRecordExport?: (record: ExportRecord) => void;
}

const CATEGORIES = ['All', 'Cinema', 'Editorial', 'Portrait', 'Noir', 'Neon', 'Vintage'] as const;

export const FiltersEffectsStudio: React.FC<FiltersEffectsStudioProps> = ({
  imageUrl,
  onChangeImage,
  initialPresetId,
  initialIntensity,
  settings,
  onSaveProject,
  onRecordExport,
}) => {
  const [selectedPresetId, setSelectedPresetId] = useState(initialPresetId || 'obsidian-gold');
  const [intensity, setIntensity] = useState(initialIntensity ?? 85);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All');
  const [extraBloom, setExtraBloom] = useState(0);
  const [extraGrain, setExtraGrain] = useState(0);
  const [extraVignette, setExtraVignette] = useState(0);
  const [showOriginal, setShowOriginal] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [gallerySaving, setGallerySaving] = useState(false);
  const [galleryProgress, setGalleryProgress] = useState(0);
  const [galleryStage, setGalleryStage] = useState<string | null>(null);
  const [galleryResult, setGalleryResult] = useState<GallerySaveResult | null>(null);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const activePreset: FilterPreset =
    FILTER_PRESETS.find((p) => p.id === selectedPresetId) || FILTER_PRESETS[0];

  const computedAdjustments = useMemo<PhotoAdjustments>(() => {
    const ratio = intensity / 100;
    const p = activePreset.adjustments;
    const scaleVal = (v?: number) => Math.round((v ?? 0) * ratio);
    return {
      ...DEFAULT_ADJUSTMENTS,
      exposure: scaleVal(p.exposure),
      contrast: scaleVal(p.contrast),
      highlights: scaleVal(p.highlights),
      shadows: scaleVal(p.shadows),
      saturation: scaleVal(p.saturation),
      temperature: scaleVal(p.temperature),
      tint: scaleVal(p.tint),
      sharpness: scaleVal(p.sharpness),
      vignette: Math.min(100, scaleVal(p.vignette) + extraVignette),
      grain: Math.min(60, scaleVal(p.grain) + extraGrain),
      bloom: Math.min(60, scaleVal(p.bloom) + extraBloom),
    };
  }, [activePreset, intensity, extraBloom, extraGrain, extraVignette]);

  useEffect(() => {
    let cancelled = false;
    loadImageElement(imageUrl)
      .then((img) => {
        if (cancelled) return;
        imgRef.current = img;
        if (canvasRef.current) {
          renderAdjustedCanvas(
            img,
            canvasRef.current,
            showOriginal ? DEFAULT_ADJUSTMENTS : computedAdjustments,
            1080
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  useEffect(() => {
    if (imgRef.current && canvasRef.current) {
      renderAdjustedCanvas(
        imgRef.current,
        canvasRef.current,
        showOriginal ? DEFAULT_ADJUSTMENTS : computedAdjustments,
        1080
      );
    }
  }, [computedAdjustments, showOriginal]);

  const filteredPresets =
    category === 'All'
      ? FILTER_PRESETS
      : FILTER_PRESETS.filter((p) => p.category === category);

  const handleExport = async (
    forceDuplicate = false,
    triggerSource: 'save' | 'export' | 'manual' = 'export'
  ) => {
    if (!imgRef.current) return;
    const fmt = settings.exportFormat === 'jpeg' ? 'jpg' : settings.exportFormat;
    setGallerySaving(true);
    setGalleryProgress(12);
    setGalleryStage(`Rendering full-resolution ${fmt.toUpperCase()}...`);
    setGalleryResult(null);
    const outCanvas = document.createElement('canvas');
    try {
      renderAdjustedCanvas(imgRef.current, outCanvas, computedAdjustments);
      const baseFileName = `dipti-${activePreset.id}-${outCanvas.width}x${outCanvas.height}-${Date.now()}`;
      if (!settings.autoSaveToGallery && triggerSource === 'export') {
        const { blob } = await encodeCanvasToBlob(outCanvas, fmt, settings.exportQuality);
        const fileName = `${baseFileName}.${fmt}`;
        downloadExportedBlob(blob, fileName);
        onRecordExport?.({
          id: `exp-flt-${Date.now()}`,
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
    if (!canvasRef.current) return;
    const thumb = createThumbnailDataUrl(canvasRef.current, 480);
    const ok = await onSaveProject({
      id: `proj-${Date.now()}`,
      name: `${activePreset.name} Look`,
      tool: 'filters',
      thumbnailDataUrl: thumb || imageUrl,
      sourceImageUrl: imageUrl,
      width: imgRef.current?.naturalWidth || canvasRef.current.width,
      height: imgRef.current?.naturalHeight || canvasRef.current.height,
      updatedAt: new Date().toISOString(),
      filterPresetId: selectedPresetId,
      filterIntensity: intensity,
      adjustments: computedAdjustments,
    });
    if (ok === false) return;
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);

    if (settings.autoSaveToGallery) {
      await handleExport(false, 'save');
    }
  };

  return (
    <div className="space-y-4 pb-24 lg:pb-8">
      <AssetPickerBar activeImageUrl={imageUrl} onSelectImage={onChangeImage} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-7 xl:col-span-8 rounded-2xl bg-[#080B14] border border-white/10 p-3 sm:p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Palette className="w-3.5 h-3.5 text-violet-300" />
              <span className="font-semibold text-white">{activePreset.name}</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="font-mono-tabular text-amber-300">{intensity}%</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowOriginal((v) => !v)}
                className={`min-h-[38px] px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                  showOriginal
                    ? 'bg-amber-400/20 border-amber-400/50 text-amber-200'
                    : 'bg-white/[0.05] border-white/10 text-slate-300 hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{showOriginal ? 'Original' : 'Compare'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedPresetId('original');
                  setIntensity(100);
                  setExtraBloom(0);
                  setExtraGrain(0);
                  setExtraVignette(0);
                }}
                className="min-h-[38px] px-3 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs text-slate-300 flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          <div className="min-h-[280px] sm:min-h-[420px] rounded-xl bg-[#04060A] border border-white/[0.06] flex items-center justify-center p-2 overflow-hidden">
            <canvas ref={canvasRef} className="max-w-full max-h-[500px] object-contain rounded-lg" />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={handleSave}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-xs sm:text-sm font-semibold text-white flex items-center gap-2 cursor-pointer"
            >
              {savedNotice ? <Check className="w-4 h-4 text-emerald-400" /> : <Save className="w-4 h-4 text-amber-300" />}
              <span>{savedNotice ? 'Saved to Projects' : 'Save Look'}</span>
            </button>

            <button
              type="button"
              onClick={() => handleExport(false, 'export')}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-sky-500 hover:brightness-110 text-xs sm:text-sm font-semibold text-white flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export {settings.exportFormat.toUpperCase()}</span>
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
          <div className="rounded-2xl bg-[#0B1020]/85 backdrop-blur-xl border border-white/10 p-4 space-y-4">
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`min-h-[36px] px-3 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    category === cat
                      ? 'bg-violet-500/25 text-white border border-violet-400/50'
                      : 'bg-[#060812] text-slate-400 border border-white/10 hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-2.5 max-h-[300px] overflow-y-auto pr-1">
              {filteredPresets.map((preset) => {
                const isActive = preset.id === selectedPresetId;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedPresetId(preset.id)}
                    className={`text-left rounded-xl border p-2 transition-all cursor-pointer ${
                      isActive
                        ? 'bg-white/10 border-amber-400/70 shadow-[0_0_16px_rgba(212,175,55,0.2)]'
                        : 'bg-[#060812] border-white/10 hover:border-white/25'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/20"
                        style={{ backgroundColor: preset.accentColor }}
                      />
                      <span className="text-xs font-semibold text-white truncate">{preset.name}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 pl-5">{preset.category}</p>
                  </button>
                );
              })}
            </div>

            <div className="space-y-1 pt-2 border-t border-white/[0.07]">
              <SliderControl
                label="Preset Intensity"
                value={intensity}
                min={0}
                max={100}
                defaultValue={85}
                unit="%"
                onChange={setIntensity}
              />
              <SliderControl
                label="Optical Bloom"
                value={extraBloom}
                min={0}
                max={40}
                defaultValue={0}
                onChange={setExtraBloom}
              />
              <SliderControl
                label="Extra Vignette"
                value={extraVignette}
                min={0}
                max={50}
                defaultValue={0}
                onChange={setExtraVignette}
              />
              <SliderControl
                label="Analog Film Grain"
                value={extraGrain}
                min={0}
                max={45}
                defaultValue={0}
                onChange={setExtraGrain}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
