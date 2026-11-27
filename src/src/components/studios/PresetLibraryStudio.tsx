import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookmarkPlus,
  Check,
  Download,
  Edit3,
  Eye,
  Film,
  Heart,
  Image as ImageIcon,
  RotateCcw,
  Save,
  Search,
  Share2,
  Sliders,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  AppSettings,
  DEFAULT_ADJUSTMENTS,
  ExportRecord,
  PhotoAdjustments,
} from '../../types/editor';
import {
  CompatibleVideoColorGrade,
  LibraryPresetItem,
  PresetCategory,
} from '../../types/presetLibrary';
import {
  PRESET_LIBRARY_CATEGORIES,
  applyPresetToAdjustments,
  mapPresetToVideoColorSettings,
} from '../../data/customPresetLibrary';
import {
  createCustomLibraryPreset,
  deleteLibraryPreset,
  loadPresetLibrary,
  renameLibraryPreset,
  restoreHiddenBuiltinPresets,
  toggleFavoriteLibraryPreset,
} from '../../utils/presetLibraryStorage';
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
  isWebShareFilesSupported,
  shareExportedBlob,
} from '../../utils/exportEngine';
import {
  HdQualityPreset,
  releaseCanvasMemory,
  resolveHdPhotoExportPlan,
} from '../../utils/hdQualityEngine';
import { GallerySaveResult, saveMediaToGallery } from '../../utils/gallerySaveEngine';
import { GallerySaveBanner } from '../GallerySaveBanner';

interface PresetLibraryStudioProps {
  imageUrl: string;
  onChangeImage: (url: string) => void;
  currentPhotoAdjustments?: PhotoAdjustments;
  settings: AppSettings;
  onApplyPresetToPhotoEditor: (mergedAdjustments: PhotoAdjustments, presetName: string) => void;
  onApplyPresetToVideoEditor: (videoGrade: CompatibleVideoColorGrade, presetName: string) => void;
  onRecordExport?: (record: ExportRecord) => void;
}

type CategoryFilter = 'All' | 'Favorites' | 'Custom' | PresetCategory;

const ACCENT_SWATCHES = ['#D4AF37', '#A855F7', '#2DD4BF', '#F97316', '#38BDF8', '#F43F5E', '#E2E8F0'];

function formatBytesLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export const PresetLibraryStudio: React.FC<PresetLibraryStudioProps> = ({
  imageUrl,
  onChangeImage,
  currentPhotoAdjustments,
  settings,
  onApplyPresetToPhotoEditor,
  onApplyPresetToVideoEditor,
  onRecordExport,
}) => {
  const [presets, setPresets] = useState<LibraryPresetItem[]>([]);
  const [hiddenBuiltinCount, setHiddenBuiltinCount] = useState(0);
  const [usingIndexedDb, setUsingIndexedDb] = useState(true);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('lib-gld-royal-dipti');
  const [intensity, setIntensity] = useState(100);
  const [preserveExistingEdits, setPreserveExistingEdits] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('All');
  const [compareMode, setCompareMode] = useState<'preset' | 'split' | 'original'>('preset');

  // Preview rendering state
  const [imgDims, setImgDims] = useState({ w: 1920, h: 1080 });
  const [imgVersion, setImgVersion] = useState(0);
  const [afterDataUrl, setAfterDataUrl] = useState('');
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  // Rename inline dialog state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  // Create custom preset drawer state
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<PresetCategory>('Gold');
  const [newAccent, setNewAccent] = useState('#D4AF37');
  const [newDesc, setNewDesc] = useState('');
  const [draftCustomAdj, setDraftCustomAdj] = useState<PhotoAdjustments>(
    currentPhotoAdjustments ? { ...DEFAULT_ADJUSTMENTS, ...currentPhotoAdjustments } : { ...DEFAULT_ADJUSTMENTS }
  );

  // Action feedback & full-res export state
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<ImageExportFormat>(
    settings.exportFormat === 'jpeg' ? 'jpg' : settings.exportFormat
  );
  const [qualityPreset, setQualityPreset] = useState<HdQualityPreset>('original');
  const [gallerySaving, setGallerySaving] = useState(false);
  const [galleryProgress, setGalleryProgress] = useState(0);
  const [galleryStage, setGalleryStage] = useState<string | null>(null);
  const [galleryResult, setGalleryResult] = useState<GallerySaveResult | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{
    blob: Blob;
    mimeType: string;
    fileName: string;
    width: number;
    height: number;
    sizeLabel: string;
  } | null>(null);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const formatSupport = useMemo(() => detectImageFormatSupport(), []);

  // Load presets persistently from IndexedDB on mount
  useEffect(() => {
    let active = true;
    loadPresetLibrary().then((res) => {
      if (!active) return;
      setPresets(res.presets);
      setHiddenBuiltinCount(res.hiddenBuiltinCount);
      setUsingIndexedDb(res.usingIndexedDb);
      if (res.presets.length > 0 && !res.presets.some((p) => p.id === selectedPresetId)) {
        setSelectedPresetId(res.presets[0].id);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Load main uploaded / selected photo
  useEffect(() => {
    let active = true;
    loadImageElement(imageUrl)
      .then((img) => {
        if (!active) return;
        imgRef.current = img;
        setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
        setExportResult(null);
        setThumbs({});
        setImgVersion((v) => v + 1);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [imageUrl]);

  // Cleanup preview canvas memory on unmount
  useEffect(() => {
    return () => {
      releaseCanvasMemory(previewCanvasRef.current);
    };
  }, []);

  const selectedPreset = useMemo(
    () => presets.find((p) => p.id === selectedPresetId) || presets[0] || null,
    [presets, selectedPresetId]
  );

  // Base adjustments preserve geometry & optionally current color settings
  const baseAdjustments = useMemo<PhotoAdjustments>(
    () =>
      currentPhotoAdjustments
        ? { ...DEFAULT_ADJUSTMENTS, ...currentPhotoAdjustments }
        : { ...DEFAULT_ADJUSTMENTS },
    [currentPhotoAdjustments]
  );

  const effectiveAdjustments = useMemo<PhotoAdjustments>(() => {
    if (!selectedPreset) return baseAdjustments;
    return applyPresetToAdjustments(
      baseAdjustments,
      selectedPreset.adjustments,
      intensity,
      preserveExistingEdits
    );
  }, [baseAdjustments, selectedPreset, intensity, preserveExistingEdits]);

  // Render live canvas preview
  useEffect(() => {
    const img = imgRef.current;
    const canvas = previewCanvasRef.current;
    if (!img || !canvas) return;

    const toRender = compareMode === 'original' ? baseAdjustments : effectiveAdjustments;
    renderAdjustedCanvas(img, canvas, toRender, 960);

    if (compareMode === 'split') {
      setAfterDataUrl(canvas.toDataURL('image/png'));
    }
  }, [imgVersion, baseAdjustments, effectiveAdjustments, compareMode]);

  // Filtered preset list
  const filteredPresets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return presets.filter((p) => {
      if (categoryFilter === 'Favorites' && !p.isFavorite) return false;
      if (categoryFilter === 'Custom' && p.isBuiltIn) return false;
      if (
        categoryFilter !== 'All' &&
        categoryFilter !== 'Favorites' &&
        categoryFilter !== 'Custom' &&
        p.category !== categoryFilter
      ) {
        return false;
      }
      if (q) {
        const hay = `${p.name} ${p.category} ${p.description}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [presets, categoryFilter, searchQuery]);

  // Batched incremental thumbnail generation on actual uploaded photo (mobile-safe, non-blocking)
  useEffect(() => {
    const img = imgRef.current;
    if (!img || presets.length === 0) return;

    let cancelled = false;
    const pending = filteredPresets.filter((p) => !thumbs[p.id]);
    if (pending.length === 0) return;

    const thumbCanvas = document.createElement('canvas');
    let cursor = 0;

    const processBatch = () => {
      if (cancelled) {
        releaseCanvasMemory(thumbCanvas);
        return;
      }
      const nextMap: Record<string, string> = {};
      const end = Math.min(pending.length, cursor + 4);
      for (; cursor < end; cursor++) {
        const p = pending[cursor];
        const previewAdj = applyPresetToAdjustments(DEFAULT_ADJUSTMENTS, p.adjustments, 100, false);
        renderAdjustedCanvas(img, thumbCanvas, previewAdj, 150);
        try {
          nextMap[p.id] = thumbCanvas.toDataURL('image/jpeg', 0.8);
        } catch {
          // ignore security errors if tainted
        }
      }
      if (Object.keys(nextMap).length > 0) {
        setThumbs((prev) => ({ ...prev, ...nextMap }));
      }
      if (cursor < pending.length) {
        window.setTimeout(processBatch, 24);
      } else {
        releaseCanvasMemory(thumbCanvas);
      }
    };

    const timer = window.setTimeout(processBatch, 20);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      releaseCanvasMemory(thumbCanvas);
    };
  }, [imgVersion, filteredPresets, presets.length, thumbs]);

  const flashNotice = (msg: string) => {
    setActionFeedback(msg);
    window.setTimeout(() => setActionFeedback(null), 2600);
  };

  const handleToggleFavorite = async (id: string) => {
    const res = await toggleFavoriteLibraryPreset(id);
    setPresets(res.presets);
    setHiddenBuiltinCount(res.hiddenBuiltinCount);
  };

  const handleCommitRename = async () => {
    if (!renamingId) return;
    const res = await renameLibraryPreset(renamingId, renameDraft);
    setPresets(res.presets);
    setRenamingId(null);
    setRenameDraft('');
    flashNotice('Preset renamed persistently');
  };

  const handleDeletePreset = async (preset: LibraryPresetItem) => {
    const res = await deleteLibraryPreset(preset.id);
    setPresets(res.presets);
    setHiddenBuiltinCount(res.hiddenBuiltinCount);
    if (selectedPresetId === preset.id && res.presets.length > 0) {
      setSelectedPresetId(res.presets[0].id);
    }
    flashNotice(`Deleted "${preset.name}"`);
  };

  const handleRestoreBuiltins = async () => {
    const res = await restoreHiddenBuiltinPresets();
    setPresets(res.presets);
    setHiddenBuiltinCount(res.hiddenBuiltinCount);
    flashNotice('Restored built-in presets');
  };

  const handleCreateCustomPreset = async () => {
    const createdAdj: Partial<PhotoAdjustments> = {
      brightness: draftCustomAdj.brightness,
      exposure: draftCustomAdj.exposure,
      contrast: draftCustomAdj.contrast,
      highlights: draftCustomAdj.highlights,
      shadows: draftCustomAdj.shadows,
      saturation: draftCustomAdj.saturation,
      temperature: draftCustomAdj.temperature,
      tint: draftCustomAdj.tint,
      hueShift: draftCustomAdj.hueShift,
      hslLightness: draftCustomAdj.hslLightness,
      redShift: draftCustomAdj.redShift,
      greenShift: draftCustomAdj.greenShift,
      blueShift: draftCustomAdj.blueShift,
      sharpness: draftCustomAdj.sharpness,
      vignette: draftCustomAdj.vignette,
      grain: draftCustomAdj.grain,
      bloom: draftCustomAdj.bloom,
      sepia: draftCustomAdj.sepia,
      hdr: draftCustomAdj.hdr,
      colorPop: draftCustomAdj.colorPop,
    };

    const res = await createCustomLibraryPreset({
      name: newName || `My ${newCategory} Look`,
      category: newCategory,
      description: newDesc || 'Custom preset built from DIPTI editing adjustments',
      accentColor: newAccent,
      adjustments: createdAdj,
    });
    setPresets(res.presets);
    setSelectedPresetId(res.created.id);
    setCreateOpen(false);
    setNewName('');
    setNewDesc('');
    flashNotice(`Saved "${res.created.name}" to library`);
  };

  const handleFullResExport = async (forceDuplicate = false, triggerSource: 'export' | 'manual' = 'export') => {
    const img = imgRef.current;
    if (!img) return;
    setIsExporting(true);
    setGallerySaving(true);
    setGalleryProgress(12);
    setGalleryStage(`Rendering full-resolution ${exportFormat.toUpperCase()}...`);
    setGalleryResult(null);

    const outCanvas = document.createElement('canvas');
    try {
      await new Promise((r) => setTimeout(r, 16));
      const plan = resolveHdPhotoExportPlan(img.naturalWidth, img.naturalHeight, qualityPreset, exportFormat);
      // Full-resolution render without maxDimension downscale
      renderAdjustedCanvas(img, outCanvas, effectiveAdjustments);
      setGalleryProgress(42);
      const { blob, mimeType } = await encodeCanvasToBlob(outCanvas, exportFormat, plan.qualityPercent);
      const safeSlug = (selectedPreset?.name || 'preset').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const fileName = `dipti-${safeSlug}-${outCanvas.width}x${outCanvas.height}.${exportFormat}`;
      const thumb = previewCanvasRef.current ? createThumbnailDataUrl(previewCanvasRef.current, 320) : undefined;

      if (!settings.autoSaveToGallery && triggerSource === 'export') {
        downloadExportedBlob(blob, fileName);
        setExportResult({
          blob,
          mimeType,
          fileName,
          width: outCanvas.width,
          height: outCanvas.height,
          sizeLabel: formatBytesLabel(blob.size),
        });
        onRecordExport?.({
          id: `exp-lib-${Date.now()}`,
          fileName,
          mediaType: 'image',
          format: exportFormat,
          resolutionLabel: `${outCanvas.width}×${outCanvas.height} (${selectedPreset?.name || 'Preset'})`,
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
        flashNotice(`Manual download ${outCanvas.width}×${outCanvas.height} ${exportFormat.toUpperCase()}`);
        return;
      }

      const gRes = await saveMediaToGallery({
        blob,
        fileName,
        mimeType,
        mediaType: 'image',
        format: exportFormat,
        width: outCanvas.width,
        height: outCanvas.height,
        quality: exportFormat === 'png' ? 100 : plan.qualityPercent,
        thumbnailDataUrl: thumb,
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
      if (gRes.saved) {
        setExportResult({
          blob,
          mimeType,
          fileName,
          width: outCanvas.width,
          height: outCanvas.height,
          sizeLabel: formatBytesLabel(blob.size),
        });
        flashNotice(`Saved ${outCanvas.width}×${outCanvas.height} ${exportFormat.toUpperCase()} to ${gRes.albumName}`);
      } else if (gRes.error) {
        flashNotice(gRes.error);
      }
    } finally {
      releaseCanvasMemory(outCanvas);
      setIsExporting(false);
      setGallerySaving(false);
    }
  };

  const compatibleVideoPreview = useMemo(
    () => (selectedPreset ? mapPresetToVideoColorSettings(selectedPreset, intensity) : null),
    [selectedPreset, intensity]
  );

  const favoriteCount = presets.filter((p) => p.isFavorite).length;
  const customCount = presets.filter((p) => !p.isBuiltIn).length;

  return (
    <div className="space-y-4 pb-24 lg:pb-10">
      <AssetPickerBar activeImageUrl={imageUrl} onSelectImage={onChangeImage} />

      {/* Top Toolbar: Summary, Create Preset, Restore */}
      <div className="rounded-2xl bg-[#0B0D18]/90 border border-amber-400/20 p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span className="font-semibold text-white">{presets.length} Presets</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span className="text-amber-300">{favoriteCount} Favorites</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span className="text-violet-300">{customCount} Custom</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span className="text-slate-400">
              {usingIndexedDb ? 'IndexedDB Synced' : 'Local Storage'}
            </span>
          </div>
          {actionFeedback && (
            <p className="text-xs text-emerald-300 mt-1 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span>{actionFeedback}</span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hiddenBuiltinCount > 0 && (
            <button
              type="button"
              onClick={handleRestoreBuiltins}
              className="min-h-[42px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-xs text-slate-200 flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-300" />
              <span>Restore {hiddenBuiltinCount} Hidden</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setDraftCustomAdj({ ...effectiveAdjustments });
              setCreateOpen((v) => !v);
            }}
            className="min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-amber-500 hover:brightness-110 text-xs font-semibold text-white flex items-center gap-2 cursor-pointer"
          >
            <BookmarkPlus className="w-4 h-4" />
            <span>Create Custom Preset</span>
          </button>
        </div>
      </div>

      {/* Create Custom Preset Panel */}
      {createOpen && (
        <div className="rounded-2xl bg-[#0D0F1C] border border-amber-400/35 p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-white">Create Custom Preset From Editing Settings</h2>
              <p className="text-xs text-slate-400">
                Captures current adjustments cleanly and saves persistently to your library.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="p-2 rounded-xl bg-white/[0.05] text-slate-300 hover:text-white cursor-pointer"
              aria-label="Close preset creator"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Preset Name (e.g. Midnight Amber)"
              className="min-h-[44px] px-3 rounded-xl bg-[#06070C] border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400/60"
            />
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as PresetCategory)}
              className="min-h-[44px] px-3 rounded-xl bg-[#06070C] border border-white/15 text-xs text-white focus:outline-none focus:border-amber-400/60"
              aria-label="Preset category"
            >
              {PRESET_LIBRARY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Short look note (optional)"
              className="min-h-[44px] px-3 rounded-xl bg-[#06070C] border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400/60"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-[#070912] border border-white/[0.06] rounded-xl p-3">
            <SliderControl label="Brightness" value={draftCustomAdj.brightness} min={-50} max={50} defaultValue={0} onChange={(v) => setDraftCustomAdj((a) => ({ ...a, brightness: v }))} />
            <SliderControl label="Contrast" value={draftCustomAdj.contrast} min={-50} max={50} defaultValue={0} onChange={(v) => setDraftCustomAdj((a) => ({ ...a, contrast: v }))} />
            <SliderControl label="Saturation" value={draftCustomAdj.saturation} min={-100} max={100} defaultValue={0} onChange={(v) => setDraftCustomAdj((a) => ({ ...a, saturation: v }))} />
            <SliderControl label="Temperature" value={draftCustomAdj.temperature} min={-50} max={50} defaultValue={0} onChange={(v) => setDraftCustomAdj((a) => ({ ...a, temperature: v }))} />
            <SliderControl label="Exposure" value={draftCustomAdj.exposure} min={-50} max={50} defaultValue={0} onChange={(v) => setDraftCustomAdj((a) => ({ ...a, exposure: v }))} />
            <SliderControl label="Vignette" value={draftCustomAdj.vignette} min={0} max={100} defaultValue={0} unit="%" onChange={(v) => setDraftCustomAdj((a) => ({ ...a, vignette: v }))} />
            <SliderControl label="Film Grain" value={draftCustomAdj.grain} min={0} max={60} defaultValue={0} unit="%" onChange={(v) => setDraftCustomAdj((a) => ({ ...a, grain: v }))} />
            <SliderControl label="Sharpen" value={draftCustomAdj.sharpness} min={0} max={100} defaultValue={0} unit="%" onChange={(v) => setDraftCustomAdj((a) => ({ ...a, sharpness: v }))} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Swatch:</span>
              {ACCENT_SWATCHES.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setNewAccent(hex)}
                  className={`w-7 h-7 rounded-full border cursor-pointer ${
                    newAccent === hex ? 'border-white scale-110' : 'border-white/25'
                  }`}
                  style={{ backgroundColor: hex }}
                  aria-label={`Select accent color ${hex}`}
                />
              ))}
              {currentPhotoAdjustments && (
                <button
                  type="button"
                  onClick={() => setDraftCustomAdj({ ...DEFAULT_ADJUSTMENTS, ...currentPhotoAdjustments })}
                  className="ml-2 min-h-[36px] px-3 rounded-lg bg-white/[0.06] border border-white/10 text-xs text-amber-300 cursor-pointer"
                >
                  Load Current Photo Studio Edits
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleCreateCustomPreset}
              className="min-h-[44px] px-5 rounded-xl bg-gradient-to-r from-violet-600 to-amber-500 text-xs font-semibold text-white flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Save Custom Preset</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Split View: Live Preview + Inspector / Library */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Live Comparison Viewport & Apply / Export Controls */}
        <div className="lg:col-span-5 xl:col-span-5 rounded-2xl bg-[#080A12] border border-white/10 p-3 sm:p-4 space-y-3 lg:sticky lg:top-20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">
                {selectedPreset?.name || 'No Preset Selected'}
              </p>
              <p className="text-[11px] font-mono-tabular text-amber-300">
                {selectedPreset?.category || 'Library'} · {imgDims.w}×{imgDims.h} px
              </p>
            </div>

            <div className="flex items-center gap-1 bg-[#05060B] border border-white/10 rounded-xl p-1">
              {(['preset', 'split', 'original'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setCompareMode(m)}
                  className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer ${
                    compareMode === m
                      ? 'bg-amber-400/20 border border-amber-400/45 text-amber-200'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {m === 'split' && <Eye className="w-3 h-3" />}
                  <span>{m === 'preset' ? 'Preset' : m === 'split' ? 'Compare' : 'Original'}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-[270px] sm:min-h-[360px] rounded-xl bg-[#040509] border border-white/[0.06] flex items-center justify-center p-2 overflow-hidden">
            {compareMode === 'split' && afterDataUrl ? (
              <div className="w-full h-[320px] sm:h-[380px]">
                <BeforeAfterSlider
                  beforeSrc={imageUrl}
                  afterSrc={afterDataUrl}
                  beforeLabel="Original"
                  afterLabel={selectedPreset?.name || 'Preset'}
                  enableZoom
                />
              </div>
            ) : (
              <canvas
                ref={previewCanvasRef}
                className="max-w-full max-h-[390px] object-contain rounded-lg"
              />
            )}
            {compareMode === 'split' && <canvas ref={previewCanvasRef} className="hidden" />}
          </div>

          {/* Intensity Slider + Preserve Edits Toggle */}
          <div className="rounded-xl bg-[#060812] border border-white/[0.07] p-3 space-y-2.5">
            <SliderControl
              label="Preset Intensity"
              value={intensity}
              min={0}
              max={100}
              defaultValue={100}
              unit="%"
              onChange={setIntensity}
            />
            <label className="flex items-center justify-between gap-2 text-xs text-slate-300 cursor-pointer pt-1 border-t border-white/[0.06]">
              <span>Preserve Existing Photo Edits (Blend)</span>
              <input
                type="checkbox"
                checked={preserveExistingEdits}
                onChange={(e) => setPreserveExistingEdits(e.target.checked)}
                className="w-4 h-4 accent-amber-400 cursor-pointer"
              />
            </label>
          </div>

          {/* Apply to Photo / Video Studio */}
          {selectedPreset && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  onApplyPresetToPhotoEditor(effectiveAdjustments, selectedPreset.name);
                  flashNotice(`Applied "${selectedPreset.name}" to Photo Studio`);
                }}
                className="min-h-[44px] px-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:brightness-110 text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
              >
                <ImageIcon className="w-4 h-4" />
                <span>Apply to Photo Studio</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!compatibleVideoPreview) return;
                  onApplyPresetToVideoEditor(compatibleVideoPreview, selectedPreset.name);
                  flashNotice(`Applied "${selectedPreset.name}" color grade to Video clips`);
                }}
                className="min-h-[44px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-amber-400/35 text-xs font-semibold text-amber-200 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Film className="w-4 h-4 text-amber-300" />
                <span>Apply to Video Clips</span>
              </button>
            </div>
          )}

          {/* Direct Full-Resolution Export Strip */}
          <div className="rounded-xl bg-[#060812] border border-white/10 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-white">Full-Res Photo Export</span>
              <span className="text-[11px] font-mono-tabular text-slate-400">
                {imgDims.w}×{imgDims.h} px
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(['jpg', 'png', 'webp'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  disabled={!formatSupport[fmt]}
                  onClick={() => setExportFormat(fmt)}
                  className={`min-h-[36px] rounded-lg border text-xs font-semibold cursor-pointer disabled:opacity-35 ${
                    exportFormat === fmt
                      ? 'bg-amber-400/20 border-amber-400/70 text-amber-200'
                      : 'bg-[#04050A] border-white/10 text-slate-400'
                  }`}
                >
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(['original', 'high', 'maximum'] as const).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQualityPreset(q)}
                  className={`min-h-[34px] rounded-lg border text-[11px] font-medium capitalize cursor-pointer ${
                    qualityPreset === q
                      ? 'bg-violet-600/30 border-violet-400 text-white'
                      : 'bg-[#04050A] border-white/10 text-slate-400'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={isExporting || !selectedPreset}
              onClick={() => handleFullResExport(false, 'export')}
              className="w-full min-h-[44px] rounded-xl bg-gradient-to-r from-amber-500 to-violet-600 hover:brightness-110 disabled:opacity-45 text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{isExporting ? 'Rendering Full Resolution...' : `Export Full-Res ${exportFormat.toUpperCase()}`}</span>
            </button>

            <GallerySaveBanner
              saving={gallerySaving}
              progressPct={galleryProgress}
              stageLabel={galleryStage}
              result={galleryResult}
              onSaveCopyAnyway={() => handleFullResExport(true, 'manual')}
              onDismiss={() => setGalleryResult(null)}
            />

            {exportResult && (
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-400/30 p-2.5 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <p className="text-emerald-200 font-semibold truncate">{exportResult.fileName}</p>
                  <p className="text-[11px] font-mono-tabular text-slate-300">
                    {exportResult.width}×{exportResult.height} · {exportResult.sizeLabel}
                  </p>
                </div>
                {isWebShareFilesSupported() && (
                  <button
                    type="button"
                    onClick={() =>
                      shareExportedBlob(exportResult.blob, exportResult.fileName, exportResult.mimeType)
                    }
                    className="min-h-[36px] px-2.5 rounded-lg bg-white/10 text-amber-200 flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Share</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Search, Category Filters & Visual Preset Grid */}
        <div className="lg:col-span-7 xl:col-span-7 space-y-4">
          {/* Search + Category Filters */}
          <div className="rounded-2xl bg-[#0B0D18]/90 border border-white/10 p-3.5 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search 40+ presets by name, mood, or style..."
                className="w-full min-h-[44px] pl-10 pr-9 rounded-xl bg-[#05060C] border border-white/15 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400/60"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-white cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {(['All', 'Favorites', 'Custom', ...PRESET_LIBRARY_CATEGORIES] as CategoryFilter[]).map(
                (cat) => {
                  const active = categoryFilter === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategoryFilter(cat)}
                      className={`min-h-[38px] px-3 rounded-xl border text-xs font-semibold whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer transition-colors ${
                        active
                          ? 'bg-gradient-to-r from-violet-600/35 to-amber-500/25 border-amber-400/65 text-white'
                          : 'bg-[#06070D] border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      {cat === 'Favorites' && <Heart className="w-3 h-3 text-rose-400 fill-rose-400" />}
                      {cat === 'Custom' && <Sliders className="w-3 h-3 text-amber-300" />}
                      <span>{cat}</span>
                    </button>
                  );
                }
              )}
            </div>
          </div>

          {/* Inline Rename Modal Bar */}
          {renamingId && (
            <div className="rounded-2xl bg-[#110D1C] border border-amber-400/50 p-3 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                placeholder="New preset name..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCommitRename();
                  if (e.key === 'Escape') setRenamingId(null);
                }}
                className="flex-1 min-w-[180px] min-h-[42px] px-3 rounded-xl bg-[#05060C] border border-white/15 text-xs text-white focus:outline-none focus:border-amber-400"
              />
              <button
                type="button"
                onClick={handleCommitRename}
                className="min-h-[42px] px-4 rounded-xl bg-amber-500 text-xs font-semibold text-black cursor-pointer"
              >
                Save Name
              </button>
              <button
                type="button"
                onClick={() => setRenamingId(null)}
                className="min-h-[42px] px-3 rounded-xl bg-white/[0.06] text-xs text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Presets Visual Thumbnail Grid */}
          {filteredPresets.length === 0 ? (
            <div className="rounded-2xl bg-[#0B0D18]/85 border border-dashed border-white/15 p-8 text-center space-y-2">
              <Sparkles className="w-6 h-6 text-amber-300 mx-auto" />
              <p className="text-sm font-semibold text-white">No matching presets found</p>
              <p className="text-xs text-slate-400">
                Try clearing your search query or switching back to All categories.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredPresets.map((preset) => {
                const isSelected = preset.id === selectedPreset?.id;
                const thumb = thumbs[preset.id];
                return (
                  <div
                    key={preset.id}
                    className={`group rounded-2xl border overflow-hidden transition-all flex flex-col ${
                      isSelected
                        ? 'bg-[#120F1F] border-amber-400 shadow-[0_8px_28px_rgba(212,175,55,0.22)]'
                        : 'bg-[#080A12] border-white/10 hover:border-white/25'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedPresetId(preset.id)}
                      className="text-left cursor-pointer flex-1 flex flex-col"
                    >
                      <div className="relative aspect-[4/3] w-full bg-[#05060C] overflow-hidden">
                        {thumb ? (
                          <img
                            src={thumb}
                            alt={preset.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                        ) : (
                          <div
                            className="w-full h-full opacity-35"
                            style={{ backgroundColor: preset.accentColor }}
                          />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                        <span
                          className="absolute top-2 left-2 w-2.5 h-2.5 rounded-full border border-white/40"
                          style={{ backgroundColor: preset.accentColor }}
                        />
                        {!preset.isBuiltIn && (
                          <span className="absolute bottom-2 left-2 text-[10px] font-semibold text-amber-300 bg-black/70 px-1.5 py-0.5 rounded">
                            Custom
                          </span>
                        )}
                      </div>

                      <div className="p-2.5 pb-1.5 flex-1">
                        <p className="text-xs font-semibold text-white truncate">{preset.name}</p>
                        <p className="text-[11px] text-slate-400 truncate">{preset.category}</p>
                      </div>
                    </button>

                    {/* Real Functional Action Row: Apply · Favorite · Rename · Delete */}
                    <div className="px-2 pb-2 pt-1 flex items-center justify-between gap-1 border-t border-white/[0.06]">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPresetId(preset.id);
                          const merged = applyPresetToAdjustments(
                            baseAdjustments,
                            preset.adjustments,
                            intensity,
                            preserveExistingEdits
                          );
                          onApplyPresetToPhotoEditor(merged, preset.name);
                          flashNotice(`Applied "${preset.name}"`);
                        }}
                        className="min-h-[34px] px-2 rounded-lg bg-white/[0.07] hover:bg-amber-400/20 text-[11px] font-semibold text-amber-200 cursor-pointer"
                        title="Apply to Photo Studio"
                      >
                        Apply
                      </button>

                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => handleToggleFavorite(preset.id)}
                          className={`min-h-[34px] min-w-[34px] rounded-lg flex items-center justify-center cursor-pointer ${
                            preset.isFavorite
                              ? 'text-rose-400 bg-rose-500/15'
                              : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
                          }`}
                          aria-label={`Favorite ${preset.name}`}
                          title="Favorite"
                        >
                          <Heart className={`w-3.5 h-3.5 ${preset.isFavorite ? 'fill-rose-400' : ''}`} />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setRenamingId(preset.id);
                            setRenameDraft(preset.name);
                          }}
                          className="min-h-[34px] min-w-[34px] rounded-lg text-slate-400 hover:text-amber-300 hover:bg-white/[0.06] flex items-center justify-center cursor-pointer"
                          aria-label={`Rename ${preset.name}`}
                          title="Rename"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeletePreset(preset)}
                          className="min-h-[34px] min-w-[34px] rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 flex items-center justify-center cursor-pointer"
                          aria-label={`Delete ${preset.name}`}
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
