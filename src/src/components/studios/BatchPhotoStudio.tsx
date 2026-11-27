import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  CheckSquare,
  CopyCheck,
  Crop,
  Download,
  FlipHorizontal,
  FlipVertical,
  FolderPlus,
  ImagePlus,
  Layers,
  Loader2,
  Palette,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Sliders,
  Sparkles,
  Square,
  Trash2,
  Type as TypeIcon,
  XCircle,
} from 'lucide-react';
import { CINEMATIC_GRADE_PRESETS } from '../../data/colorGradingPresets';
import { FILTER_PRESETS, STUDIO_ASSETS, STUDIO_FONTS } from '../../data/studioCatalog';
import { CustomColorGradePreset } from '../../types/colorGrading';
import { AppSettings, CropAspect, ExportRecord } from '../../types/editor';
import {
  BatchEditRecipe,
  BatchExportItemOutcome,
  BatchExportQueueSummary,
  BatchPhotoItem,
  BatchResizeMode,
  BatchWatermarkPosition,
  DEFAULT_BATCH_RECIPE,
  computeBatchOutputDimensions,
  createBatchItemFromFile,
  createBatchItemFromUrl,
  renderBatchPhotoToCanvas,
  runBatchExportQueue,
} from '../../utils/batchPhotoEngine';
import { loadImageElement } from '../../utils/canvasEngine';
import { loadCustomColorPresets } from '../../utils/colorGradingEngine';
import { detectImageFormatSupport, ImageExportFormat } from '../../utils/exportEngine';
import { GallerySaveResult } from '../../utils/gallerySaveEngine';
import { releaseCanvasMemory } from '../../utils/hdQualityEngine';
import { formatBytes } from '../../utils/indexedDbStorage';
import { BeforeAfterSlider } from '../BeforeAfterSlider';
import { GallerySaveBanner } from '../GallerySaveBanner';
import { SliderControl } from '../SliderControl';

interface BatchPhotoStudioProps {
  settings: AppSettings;
  onRecordExport: (record: ExportRecord) => Promise<void> | void;
  incomingImage?: { url: string; name: string; seq: number } | null;
}

type InspectorTab = 'filters' | 'grading' | 'transform' | 'watermark' | 'export';
type PreviewMode = 'edited' | 'split' | 'original';

const CROP_OPTIONS: Array<{ id: CropAspect; label: string }> = [
  { id: 'original', label: 'Original' },
  { id: '1:1', label: '1:1 Square' },
  { id: '4:5', label: '4:5 Portrait' },
  { id: '3:4', label: '3:4 Editorial' },
  { id: '16:9', label: '16:9 Cinema' },
  { id: '9:16', label: '9:16 Story' },
];

const WATERMARK_POSITIONS: Array<{ id: BatchWatermarkPosition; label: string }> = [
  { id: 'top-left', label: 'Top L' },
  { id: 'top-center', label: 'Top C' },
  { id: 'top-right', label: 'Top R' },
  { id: 'middle-left', label: 'Mid L' },
  { id: 'center', label: 'Center' },
  { id: 'middle-right', label: 'Mid R' },
  { id: 'bottom-left', label: 'Bot L' },
  { id: 'bottom-center', label: 'Bot C' },
  { id: 'bottom-right', label: 'Bot R' },
];

const WATERMARK_COLORS = ['#FFFFFF', '#FBBF24', '#D4AF37', '#C084FC', '#38BDF8', '#09090B'];

export const BatchPhotoStudio: React.FC<BatchPhotoStudioProps> = ({
  settings,
  onRecordExport,
  incomingImage,
}) => {
  const [items, setItems] = useState<BatchPhotoItem[]>([]);
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<BatchEditRecipe>(() => ({
    ...DEFAULT_BATCH_RECIPE,
    exportFormat:
      settings.exportFormat === 'png'
        ? 'png'
        : settings.exportFormat === 'webp'
          ? 'webp'
          : 'jpg',
    exportQuality: settings.exportQuality || 95,
  }));
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('filters');
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [previewMode, setPreviewMode] = useState<PreviewMode>('edited');
  const [customColorPresets, setCustomColorPresets] = useState<CustomColorGradePreset[]>(() =>
    loadCustomColorPresets()
  );

  // Import & drag state
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Live preview URLs for active photo
  const [previewEditedUrl, setPreviewEditedUrl] = useState<string>('');
  const [previewOriginalGeomUrl, setPreviewOriginalGeomUrl] = useState<string>('');
  const [isRenderingPreview, setIsRenderingPreview] = useState(false);

  // Batch Export Execution State
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgressPct, setExportProgressPct] = useState(0);
  const [exportStageLabel, setExportStageLabel] = useState<string | null>(null);
  const [exportSummary, setExportSummary] = useState<BatchExportQueueSummary | null>(null);
  const [lastGalleryResult, setLastGalleryResult] = useState<GallerySaveResult | null>(null);
  const [forceDuplicateNext, setForceDuplicateNext] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const origPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevImageUrlRef = useRef<string | null>(null);
  const prevOrigUrlRef = useRef<string | null>(null);

  const imageFormatSupport = useMemo(() => detectImageFormatSupport(), []);

  // Append photo when global top-bar Quick Import is used while Batch Photo Editor is open
  const lastSeqRef = useRef<number>(0);
  useEffect(() => {
    if (!incomingImage || incomingImage.seq === lastSeqRef.current) return;
    lastSeqRef.current = incomingImage.seq;
    createBatchItemFromUrl(incomingImage.url, incomingImage.name)
      .then((item) => {
        setItems((prev) => [...prev, item]);
        setActivePhotoId((prevId) => prevId ?? item.id);
      })
      .catch((err) => {
        setImportError(err instanceof Error ? err.message : 'Unable to append imported photo.');
      });
  }, [incomingImage]);

  // Revoke any remaining Object URLs & scratch canvases on unmount
  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();
      if (prevImageUrlRef.current) URL.revokeObjectURL(prevImageUrlRef.current);
      if (prevOrigUrlRef.current) URL.revokeObjectURL(prevOrigUrlRef.current);
      if (previewCanvasRef.current) releaseCanvasMemory(previewCanvasRef.current);
      if (origPreviewCanvasRef.current) releaseCanvasMemory(origPreviewCanvasRef.current);
    };
  }, []);

  // Keep activePhotoId valid when items change
  useEffect(() => {
    if (items.length === 0) {
      setActivePhotoId(null);
      return;
    }
    if (!activePhotoId || !items.some((p) => p.id === activePhotoId)) {
      setActivePhotoId(items[0].id);
    }
  }, [items, activePhotoId]);

  const activeItem = useMemo(
    () => items.find((p) => p.id === activePhotoId) ?? items[0] ?? null,
    [items, activePhotoId]
  );

  const activeIndex = useMemo(
    () => (activeItem ? items.findIndex((p) => p.id === activeItem.id) : -1),
    [items, activeItem]
  );

  const selectedItems = useMemo(() => items.filter((p) => p.selected), [items]);

  const activeOutputDims = useMemo(() => {
    if (!activeItem) return null;
    return computeBatchOutputDimensions(
      activeItem.origWidth,
      activeItem.origHeight,
      recipe.rotation,
      recipe.cropAspect,
      recipe.resize
    );
  }, [activeItem, recipe.rotation, recipe.cropAspect, recipe.resize]);

  // Render interactive preview for activeItem whenever activeItem or recipe changes
  useEffect(() => {
    if (!activeItem) {
      setPreviewEditedUrl('');
      setPreviewOriginalGeomUrl('');
      return;
    }

    let cancelled = false;
    setIsRenderingPreview(true);

    const timer = window.setTimeout(async () => {
      let img: HTMLImageElement | null = null;
      try {
        img = await loadImageElement(activeItem.sourceUrl);
        if (cancelled) return;

        if (!previewCanvasRef.current) {
          previewCanvasRef.current = document.createElement('canvas');
        }
        if (!origPreviewCanvasRef.current) {
          origPreviewCanvasRef.current = document.createElement('canvas');
        }

        renderBatchPhotoToCanvas(img, previewCanvasRef.current, recipe, {
          maxPreviewDim: 920,
          customColorPresets,
        });
        renderBatchPhotoToCanvas(img, origPreviewCanvasRef.current, recipe, {
          maxPreviewDim: 920,
          geometryOnly: true,
        });

        const editedUrl = previewCanvasRef.current.toDataURL('image/jpeg', 0.88);
        const origGeomUrl = origPreviewCanvasRef.current.toDataURL('image/jpeg', 0.88);
        if (!cancelled) {
          setPreviewEditedUrl(editedUrl);
          setPreviewOriginalGeomUrl(origGeomUrl);
        }
      } catch (err) {
        if (!cancelled) {
          setImportError(
            err instanceof Error ? err.message : 'Unable to render preview for selected photo.'
          );
        }
      } finally {
        if (img) img.src = '';
        if (!cancelled) setIsRenderingPreview(false);
      }
    }, 35);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeItem, recipe, customColorPresets]);

  const handleFilesImported = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) {
      setImportError('Please select valid image files (JPG, PNG, WebP, etc.).');
      return;
    }

    setIsImporting(true);
    setImportError(null);
    const created: BatchPhotoItem[] = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        const item = await createBatchItemFromFile(file);
        if (item.isObjectUrl) {
          objectUrlsRef.current.add(item.sourceUrl);
        }
        created.push(item);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : `Failed to load ${file.name}`);
      }
    }

    if (created.length > 0) {
      setItems((prev) => [...prev, ...created]);
      setActivePhotoId((prevId) => prevId ?? created[0].id);
    }
    if (errors.length > 0) {
      setImportError(errors.join(' · '));
    }
    setIsImporting(false);
  }, []);

  const handleLoadSamplePack = async () => {
    setIsImporting(true);
    setImportError(null);
    const created: BatchPhotoItem[] = [];
    for (const asset of STUDIO_ASSETS.slice(0, 4)) {
      try {
        const item = await createBatchItemFromUrl(
          asset.url,
          `${asset.title.toLowerCase().replace(/\s+/g, '-')}.jpg`
        );
        created.push(item);
      } catch {
        // skip failed asset
      }
    }
    if (created.length > 0) {
      setItems((prev) => [...prev, ...created]);
      setActivePhotoId((prevId) => prevId ?? created[0].id);
    } else {
      setImportError('Could not load sample studio photos.');
    }
    setIsImporting(false);
  };

  const toggleSelectItem = (id: string) => {
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, selected: !p.selected } : p)));
  };

  const handleSelectAll = () => {
    setItems((prev) => prev.map((p) => ({ ...p, selected: true })));
  };

  const handleDeselectAll = () => {
    setItems((prev) => prev.map((p) => ({ ...p, selected: false })));
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target?.isObjectUrl) {
        URL.revokeObjectURL(target.sourceUrl);
        objectUrlsRef.current.delete(target.sourceUrl);
      }
      return prev.filter((p) => p.id !== id);
    });
  };

  const handleRemoveSelected = () => {
    setItems((prev) => {
      prev.forEach((p) => {
        if (p.selected && p.isObjectUrl) {
          URL.revokeObjectURL(p.sourceUrl);
          objectUrlsRef.current.delete(p.sourceUrl);
        }
      });
      return prev.filter((p) => !p.selected);
    });
  };

  const handleClearQueue = () => {
    items.forEach((p) => {
      if (p.isObjectUrl) {
        URL.revokeObjectURL(p.sourceUrl);
        objectUrlsRef.current.delete(p.sourceUrl);
      }
    });
    setItems([]);
    setExportSummary(null);
    setLastGalleryResult(null);
  };

  const executeBatchExport = async (targetList: BatchPhotoItem[], forceDuplicate = false) => {
    if (isExporting || targetList.length === 0) return;

    if (recipe.exportFormat === 'webp' && !imageFormatSupport.webp) {
      setImportError('WebP encoding is not supported in this browser. Switch to JPG or PNG.');
      return;
    }

    cancelRef.current = false;
    setIsExporting(true);
    setExportProgressPct(4);
    setExportStageLabel(`Starting batch export (${targetList.length} photo${targetList.length === 1 ? '' : 's'})...`);
    setExportSummary(null);
    setLastGalleryResult(null);

    const targetIds = new Set(targetList.map((p) => p.id));
    setItems((prev) =>
      prev.map((p) =>
        targetIds.has(p.id)
          ? { ...p, status: 'idle', errorMessage: undefined, lastLocationLabel: undefined }
          : p
      )
    );

    const summary = await runBatchExportQueue({
      items: targetList,
      recipe,
      settings,
      customColorPresets,
      forceDuplicate: forceDuplicate || forceDuplicateNext,
      shouldCancel: () => cancelRef.current,
      onItemStart: (itemId) => {
        setItems((prev) =>
          prev.map((p) => (p.id === itemId ? { ...p, status: 'processing' } : p))
        );
      },
      onItemProgress: (_itemId, overallPct, stage) => {
        setExportProgressPct(overallPct);
        setExportStageLabel(stage);
      },
      onItemComplete: (outcome: BatchExportItemOutcome, index, total) => {
        setExportProgressPct(Math.round(((index + 1) / Math.max(1, total)) * 100));
        if (outcome.galleryResult) {
          setLastGalleryResult(outcome.galleryResult);
        }
        setItems((prev) =>
          prev.map((p) =>
            p.id === outcome.itemId
              ? {
                  ...p,
                  status: outcome.status,
                  errorMessage: outcome.errorMessage,
                  lastLocationLabel: outcome.locationLabel,
                  outputWidth: outcome.width,
                  outputHeight: outcome.height,
                  outputBytes: outcome.sizeBytes,
                }
              : p
          )
        );
      },
      onRecordExport,
    });

    setIsExporting(false);
    setExportSummary(summary);
    setForceDuplicateNext(false);

    if (summary.wasCancelled) {
      setExportStageLabel(
        `Batch cancelled after ${summary.completed} saved (${summary.cancelledCount} stopped).`
      );
    } else if (summary.failed > 0) {
      setExportStageLabel(
        `Finished: ${summary.completed} saved, ${summary.failed} failed${summary.skippedDuplicates > 0 ? `, ${summary.skippedDuplicates} duplicates skipped` : ''}.`
      );
    } else if (summary.skippedDuplicates > 0 && summary.completed === 0) {
      setExportStageLabel(
        `Skipped ${summary.skippedDuplicates} duplicate export${summary.skippedDuplicates === 1 ? '' : 's'} already saved.`
      );
    } else {
      setExportStageLabel(
        `Completed: ${summary.completed} of ${summary.total} photo${summary.total === 1 ? '' : 's'} exported.`
      );
    }
  };

  const handleCancelBatch = () => {
    cancelRef.current = true;
    setExportStageLabel('Cancelling after current photo finishes...');
  };

  const filteredPresets = useMemo(
    () =>
      filterCategory === 'All'
        ? FILTER_PRESETS
        : FILTER_PRESETS.filter((f) => f.category === filterCategory),
    [filterCategory]
  );

  const filterCategories = ['All', 'Cinema', 'Editorial', 'Portrait', 'Noir', 'Neon', 'Vintage'];

  const resetAdjustments = () => {
    setRecipe((prev) => ({
      ...prev,
      filterId: 'original',
      filterIntensity: 100,
      colorGradePresetId: 'none',
      colorGradeIntensity: 100,
      brightness: 0,
      contrast: 0,
      saturation: 0,
      exposure: 0,
    }));
  };

  return (
    <div className="space-y-5 pb-24 lg:pb-10">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => {
          if (e.target.files) handleFilesImported(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Top Batch Action Bar */}
      <section className="rounded-2xl bg-[#0B0D16]/90 border border-amber-400/20 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <h2 className="font-display text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-300 shrink-0" />
            <span>DIPTI Batch Photo Studio</span>
          </h2>
          <p className="text-xs text-slate-400 font-mono-tabular">
            {items.length} photo{items.length === 1 ? '' : 's'} loaded · {selectedItems.length} selected ·{' '}
            {recipe.resize.mode === 'original' ? 'Original Dimensions Locked' : `Resize: ${recipe.resize.mode}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isImporting || isExporting}
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-violet-600 to-amber-500 hover:brightness-110 disabled:opacity-50 text-xs font-semibold text-white flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            {isImporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ImagePlus className="w-4 h-4" />
            )}
            <span>Import Photos (Multi)</span>
          </button>

          <button
            type="button"
            disabled={isImporting || isExporting}
            onClick={handleLoadSamplePack}
            className="min-h-[44px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-50 border border-white/15 text-xs font-medium text-amber-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <FolderPlus className="w-4 h-4 text-amber-300" />
            <span>Add 4 Samples</span>
          </button>

          {items.length > 0 && (
            <>
              <button
                type="button"
                disabled={isExporting}
                onClick={selectedItems.length === items.length ? handleDeselectAll : handleSelectAll}
                className="min-h-[44px] px-3.5 rounded-xl bg-[#06070B] hover:bg-white/[0.08] border border-white/15 text-xs font-medium text-slate-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                {selectedItems.length === items.length ? (
                  <Square className="w-4 h-4 text-slate-400" />
                ) : (
                  <CheckSquare className="w-4 h-4 text-amber-300" />
                )}
                <span>{selectedItems.length === items.length ? 'Deselect All' : 'Select All'}</span>
              </button>

              {selectedItems.length > 0 && (
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={handleRemoveSelected}
                  className="min-h-[44px] px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-400/30 text-xs font-medium text-rose-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Remove ({selectedItems.length})</span>
                </button>
              )}
            </>
          )}
        </div>
      </section>

      {importError && (
        <div className="rounded-xl bg-rose-500/12 border border-rose-400/40 px-4 py-3 flex items-center justify-between gap-3 text-xs text-rose-200">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-300 shrink-0" />
            <span>{importError}</span>
          </span>
          <button
            type="button"
            onClick={() => setImportError(null)}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center text-rose-200 hover:text-white cursor-pointer"
            aria-label="Dismiss error"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Split Workspace: Left Preview + Grid | Right Controls Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: Live Preview + Thumbnail Grid */}
        <div className="lg:col-span-7 space-y-5">
          {/* Interactive Photo Preview Stage */}
          <section
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              if (e.dataTransfer.files?.length) {
                handleFilesImported(e.dataTransfer.files);
              }
            }}
            className={`rounded-2xl bg-[#0B0D16]/90 border p-4 space-y-3 transition-colors ${
              dragActive ? 'border-amber-400 bg-amber-500/5' : 'border-white/[0.08]'
            }`}
          >
            {!activeItem ? (
              <div className="min-h-[320px] rounded-xl border border-dashed border-amber-400/30 bg-[#06070B]/70 p-8 flex flex-col items-center justify-center text-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600/25 to-amber-500/20 border border-amber-400/35 flex items-center justify-center">
                  <ImagePlus className="w-7 h-7 text-amber-300" />
                </div>
                <div className="space-y-1.5 max-w-md">
                  <h3 className="font-display text-lg font-bold text-white">
                    Import Multiple Photos to Batch Edit
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                    Select multiple photos from your phone gallery or drop them here. Apply filters, color grades, resize/crop/rotate, and custom watermarks to every selected image at full resolution.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="min-h-[48px] px-5 rounded-xl bg-gradient-to-r from-violet-600 to-amber-500 hover:brightness-110 text-sm font-semibold text-white flex items-center gap-2 cursor-pointer"
                  >
                    <ImagePlus className="w-4 h-4" />
                    <span>Select Photos from Gallery</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleLoadSamplePack}
                    className="min-h-[48px] px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-sm font-medium text-amber-200 flex items-center gap-2 cursor-pointer"
                  >
                    <FolderPlus className="w-4 h-4 text-amber-300" />
                    <span>Load 4 Sample Photos</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {(['edited', 'split', 'original'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPreviewMode(m)}
                        className={`min-h-[40px] px-3 rounded-xl border text-xs font-semibold capitalize cursor-pointer transition-colors ${
                          previewMode === m
                            ? 'bg-violet-600/30 border-amber-400/65 text-white'
                            : 'bg-[#06070B] border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        {m === 'split' ? 'Split Compare' : m}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={items.length <= 1}
                      onClick={() => {
                        const prevIdx = (activeIndex - 1 + items.length) % items.length;
                        setActivePhotoId(items[prevIdx].id);
                      }}
                      className="min-h-[40px] px-3 rounded-xl bg-[#06070B] border border-white/10 text-xs text-slate-200 disabled:opacity-40 cursor-pointer"
                    >
                      Prev
                    </button>
                    <span className="text-xs font-mono-tabular text-slate-300 px-1.5">
                      {activeIndex + 1} / {items.length}
                    </span>
                    <button
                      type="button"
                      disabled={items.length <= 1}
                      onClick={() => {
                        const nextIdx = (activeIndex + 1) % items.length;
                        setActivePhotoId(items[nextIdx].id);
                      }}
                      className="min-h-[40px] px-3 rounded-xl bg-[#06070B] border border-white/10 text-xs text-slate-200 disabled:opacity-40 cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                </div>

                {/* Preview Canvas Frame */}
                <div className="relative rounded-2xl overflow-hidden bg-[#05060B] border border-white/10 min-h-[280px] flex items-center justify-center">
                  {previewMode === 'split' && previewOriginalGeomUrl && previewEditedUrl ? (
                    <div className="w-full h-full min-h-[300px]">
                      <BeforeAfterSlider
                        beforeSrc={previewOriginalGeomUrl}
                        afterSrc={previewEditedUrl}
                        beforeLabel="Original"
                        afterLabel="Batch Edited"
                        enableZoom={true}
                      />
                    </div>
                  ) : (
                    <img
                      src={
                        previewMode === 'original'
                          ? activeItem.sourceUrl
                          : previewEditedUrl || activeItem.sourceUrl
                      }
                      alt={activeItem.name}
                      referrerPolicy="no-referrer"
                      className="w-full max-h-[440px] object-contain"
                    />
                  )}

                  {isRenderingPreview && (
                    <div className="absolute top-3 right-3 px-2.5 py-1.5 rounded-lg bg-black/75 border border-amber-400/35 text-[11px] text-amber-200 flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" />
                      <span>Rendering</span>
                    </div>
                  )}
                </div>

                {/* Preview Metadata + Single Photo Export */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-xs font-semibold text-white truncate">{activeItem.name}</p>
                    <p className="text-[11px] font-mono-tabular text-slate-400">
                      Source {activeItem.origWidth}×{activeItem.origHeight} → Export{' '}
                      <span className="text-amber-300 font-semibold">
                        {activeOutputDims ? `${activeOutputDims.outW}×${activeOutputDims.outH}` : '—'}
                      </span>
                      {activeOutputDims && !activeOutputDims.resized && ' (Original Res Preserved)'}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={() => executeBatchExport([activeItem], true)}
                    className="min-h-[44px] px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-50 border border-amber-400/40 text-xs font-semibold text-amber-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-300" />
                    <span>Export This Photo</span>
                  </button>
                </div>
              </>
            )}
          </section>

          {/* Batch Thumbnail Grid */}
          {items.length > 0 && (
            <section className="rounded-2xl bg-[#0B0D16]/90 border border-white/[0.08] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-sm font-bold text-white">
                  Imported Queue ({items.length})
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={handleClearQueue}
                    className="min-h-[38px] px-3 rounded-lg bg-white/[0.05] hover:bg-rose-500/15 border border-white/10 text-[11px] font-medium text-slate-300 hover:text-rose-200 cursor-pointer"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[460px] overflow-y-auto pr-1">
                {items.map((item) => {
                  const isActive = activeItem?.id === item.id;
                  const dims = computeBatchOutputDimensions(
                    item.origWidth,
                    item.origHeight,
                    recipe.rotation,
                    recipe.cropAspect,
                    recipe.resize
                  );
                  return (
                    <div
                      key={item.id}
                      className={`rounded-xl bg-[#06070B] border overflow-hidden flex flex-col transition-all ${
                        isActive
                          ? 'border-amber-400/75 shadow-[0_0_20px_rgba(251,191,36,0.16)]'
                          : item.selected
                            ? 'border-violet-400/40'
                            : 'border-white/[0.08] opacity-75'
                      }`}
                    >
                      <div className="relative aspect-[4/3] bg-black overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setActivePhotoId(item.id)}
                          className="w-full h-full block cursor-pointer"
                          title={`Preview ${item.name}`}
                        >
                          <img
                            src={item.thumbUrl}
                            alt={item.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        </button>

                        {/* 44x44 Selection Checkbox Hitbox */}
                        <button
                          type="button"
                          disabled={isExporting}
                          onClick={() => toggleSelectItem(item.id)}
                          aria-label={item.selected ? `Deselect ${item.name}` : `Select ${item.name}`}
                          className="absolute top-0 left-0 min-h-[44px] min-w-[44px] flex items-start justify-start p-2 cursor-pointer"
                        >
                          <span
                            className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-colors ${
                              item.selected
                                ? 'bg-amber-400 border-amber-300 text-black'
                                : 'bg-black/70 border-white/40 text-transparent'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </span>
                        </button>

                        {/* Quick Single Export & Remove */}
                        <div className="absolute top-0 right-0 flex items-center">
                          <button
                            type="button"
                            disabled={isExporting}
                            onClick={() => executeBatchExport([item], true)}
                            aria-label={`Export ${item.name}`}
                            title="Export this photo"
                            className="min-h-[44px] min-w-[38px] flex items-start justify-center p-2 cursor-pointer text-white/90 hover:text-amber-300"
                          >
                            <span className="w-6 h-6 rounded-lg bg-black/75 border border-white/20 flex items-center justify-center">
                              <Download className="w-3 h-3" />
                            </span>
                          </button>
                          <button
                            type="button"
                            disabled={isExporting}
                            onClick={() => handleRemoveItem(item.id)}
                            aria-label={`Remove ${item.name}`}
                            title="Remove photo"
                            className="min-h-[44px] min-w-[38px] flex items-start justify-center p-2 cursor-pointer text-white/90 hover:text-rose-300"
                          >
                            <span className="w-6 h-6 rounded-lg bg-black/75 border border-white/20 flex items-center justify-center">
                              <Trash2 className="w-3 h-3" />
                            </span>
                          </button>
                        </div>

                        {/* Status Strip */}
                        {item.status !== 'idle' && (
                          <div
                            className={`absolute bottom-0 left-0 right-0 px-2 py-1 text-[10px] font-semibold flex items-center gap-1 ${
                              item.status === 'done'
                                ? 'bg-emerald-950/90 text-emerald-200'
                                : item.status === 'processing'
                                  ? 'bg-violet-950/90 text-amber-200'
                                  : item.status === 'skipped-duplicate'
                                    ? 'bg-amber-950/90 text-amber-200'
                                    : item.status === 'cancelled'
                                      ? 'bg-slate-900/90 text-slate-300'
                                      : 'bg-rose-950/90 text-rose-200'
                            }`}
                          >
                            {item.status === 'done' && <CheckCircle2 className="w-3 h-3 shrink-0" />}
                            {item.status === 'processing' && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
                            {item.status === 'skipped-duplicate' && <CopyCheck className="w-3 h-3 shrink-0" />}
                            {item.status === 'error' && <AlertCircle className="w-3 h-3 shrink-0" />}
                            <span className="truncate">
                              {item.status === 'done'
                                ? `Saved · ${item.outputBytes ? formatBytes(item.outputBytes) : ''}`
                                : item.status === 'processing'
                                  ? 'Exporting...'
                                  : item.status === 'skipped-duplicate'
                                    ? 'Duplicate Skipped'
                                    : item.status === 'cancelled'
                                      ? 'Cancelled'
                                      : item.errorMessage || 'Error'}
                            </span>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setActivePhotoId(item.id)}
                        className="p-2.5 text-left space-y-0.5 cursor-pointer"
                      >
                        <p className="text-[11px] font-semibold text-white truncate">{item.name}</p>
                        <p className="text-[10px] font-mono-tabular text-slate-400 truncate">
                          {item.origWidth}×{item.origHeight} → {dims.outW}×{dims.outH}
                        </p>
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* RIGHT COLUMN: Batch Recipe Controls & Export Queue */}
        <div className="lg:col-span-5 space-y-4">
          {/* Inspector Section Switcher */}
          <div className="rounded-2xl bg-[#0B0D16]/95 border border-amber-400/20 p-2 grid grid-cols-5 gap-1">
            {(
              [
                { id: 'filters', label: 'Filters', icon: <Sparkles className="w-3.5 h-3.5" /> },
                { id: 'grading', label: 'Grading', icon: <Palette className="w-3.5 h-3.5" /> },
                { id: 'transform', label: 'Size', icon: <Crop className="w-3.5 h-3.5" /> },
                { id: 'watermark', label: 'Text', icon: <TypeIcon className="w-3.5 h-3.5" /> },
                { id: 'export', label: 'Export', icon: <Download className="w-3.5 h-3.5" /> },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setInspectorTab(t.id)}
                className={`min-h-[48px] px-1.5 rounded-xl border text-[11px] font-semibold flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${
                  inspectorTab === t.id
                    ? 'bg-gradient-to-b from-violet-600/35 to-amber-500/20 border-amber-400/65 text-white'
                    : 'bg-[#06070B] border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                <span className={inspectorTab === t.id ? 'text-amber-300' : 'text-slate-400'}>
                  {t.icon}
                </span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {/* 1. FILTERS & TONE TAB */}
          {inspectorTab === 'filters' && (
            <div className="rounded-2xl bg-[#0B0D16]/90 border border-white/[0.08] p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-bold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-amber-300" />
                  <span>Batch Tone &amp; 30 Filters</span>
                </h3>
                <button
                  type="button"
                  onClick={resetAdjustments}
                  className="min-h-[36px] px-2.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-[11px] text-slate-300 flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              </div>

              {/* Exposure, Brightness, Contrast, Saturation */}
              <div className="space-y-1 border-b border-white/[0.08] pb-3">
                <SliderControl
                  label="Exposure"
                  value={recipe.exposure}
                  min={-50}
                  max={50}
                  onChange={(v) => setRecipe((r) => ({ ...r, exposure: v }))}
                />
                <SliderControl
                  label="Brightness"
                  value={recipe.brightness}
                  min={-50}
                  max={50}
                  onChange={(v) => setRecipe((r) => ({ ...r, brightness: v }))}
                />
                <SliderControl
                  label="Contrast"
                  value={recipe.contrast}
                  min={-50}
                  max={50}
                  onChange={(v) => setRecipe((r) => ({ ...r, contrast: v }))}
                />
                <SliderControl
                  label="Saturation"
                  value={recipe.saturation}
                  min={-100}
                  max={100}
                  onChange={(v) => setRecipe((r) => ({ ...r, saturation: v }))}
                />
              </div>

              {/* Filter Category Selector + 30 Filter Presets */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {filterCategories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setFilterCategory(cat)}
                      className={`min-h-[38px] px-3 rounded-lg border text-[11px] font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                        filterCategory === cat
                          ? 'bg-violet-600/30 border-amber-400/60 text-white'
                          : 'bg-[#06070B] border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {recipe.filterId !== 'original' && (
                  <SliderControl
                    label="Filter Intensity"
                    value={recipe.filterIntensity}
                    min={0}
                    max={100}
                    defaultValue={100}
                    unit="%"
                    onChange={(v) => setRecipe((r) => ({ ...r, filterIntensity: v }))}
                  />
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-2 max-h-[260px] overflow-y-auto pr-1">
                  {filteredPresets.map((preset) => {
                    const active = recipe.filterId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setRecipe((r) => ({ ...r, filterId: preset.id }))}
                        className={`min-h-[46px] p-2.5 rounded-xl border text-left flex items-center gap-2 cursor-pointer transition-all ${
                          active
                            ? 'bg-amber-400/15 border-amber-400/70 text-white'
                            : 'bg-[#06070B] border-white/10 text-slate-300 hover:border-white/25'
                        }`}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/30"
                          style={{ backgroundColor: preset.accentColor }}
                        />
                        <span className="text-xs font-medium truncate">{preset.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 2. COLOR GRADING PRESETS TAB */}
          {inspectorTab === 'grading' && (
            <div className="rounded-2xl bg-[#0B0D16]/90 border border-white/[0.08] p-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-sm font-bold text-white flex items-center gap-2">
                  <Palette className="w-4 h-4 text-violet-300" />
                  <span>Color Grading Presets</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setCustomColorPresets(loadCustomColorPresets())}
                  className="min-h-[36px] px-2.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-[11px] text-amber-300 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Refresh Custom</span>
                </button>
              </div>

              {recipe.colorGradePresetId !== 'none' && (
                <SliderControl
                  label="Color Grade Intensity"
                  value={recipe.colorGradeIntensity}
                  min={0}
                  max={100}
                  defaultValue={100}
                  unit="%"
                  onChange={(v) => setRecipe((r) => ({ ...r, colorGradeIntensity: v }))}
                />
              )}

              <div className="grid grid-cols-2 gap-2 max-h-[360px] overflow-y-auto pr-1">
                <button
                  type="button"
                  onClick={() => setRecipe((r) => ({ ...r, colorGradePresetId: 'none' }))}
                  className={`min-h-[54px] p-2.5 rounded-xl border text-left flex flex-col justify-between cursor-pointer ${
                    recipe.colorGradePresetId === 'none'
                      ? 'bg-violet-600/25 border-amber-400/70 text-white'
                      : 'bg-[#06070B] border-white/10 text-slate-300'
                  }`}
                >
                  <span className="text-xs font-semibold">No Color Grade</span>
                  <span className="text-[10px] text-slate-400">Use base filter/tone only</span>
                </button>

                {CINEMATIC_GRADE_PRESETS.map((preset) => {
                  const active = recipe.colorGradePresetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setRecipe((r) => ({ ...r, colorGradePresetId: preset.id }))}
                      className={`min-h-[54px] p-2.5 rounded-xl border text-left flex flex-col justify-between cursor-pointer transition-all ${
                        active
                          ? 'bg-amber-400/15 border-amber-400/70 text-white'
                          : 'bg-[#06070B] border-white/10 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: preset.accentColor }}
                        />
                        <span className="text-xs font-semibold truncate">{preset.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 truncate">
                        {preset.description}
                      </span>
                    </button>
                  );
                })}

                {customColorPresets.map((custom) => {
                  const active = recipe.colorGradePresetId === custom.id;
                  return (
                    <button
                      key={custom.id}
                      type="button"
                      onClick={() => setRecipe((r) => ({ ...r, colorGradePresetId: custom.id }))}
                      className={`min-h-[54px] p-2.5 rounded-xl border text-left flex flex-col justify-between cursor-pointer transition-all ${
                        active
                          ? 'bg-violet-500/25 border-amber-400/70 text-white'
                          : 'bg-[#06070B] border-violet-400/25 text-slate-200 hover:border-violet-400/50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: custom.accentColor }}
                        />
                        <span className="text-xs font-semibold truncate">{custom.name}</span>
                      </div>
                      <span className="text-[10px] text-violet-300">Saved Custom Grade</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. CROP, ROTATE & RESIZE TAB */}
          {inspectorTab === 'transform' && (
            <div className="rounded-2xl bg-[#0B0D16]/90 border border-white/[0.08] p-4 space-y-4">
              <h3 className="font-display text-sm font-bold text-white flex items-center gap-2">
                <Crop className="w-4 h-4 text-amber-300" />
                <span>Batch Crop, Rotate &amp; Resize</span>
              </h3>

              {/* Rotate & Flip */}
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-slate-400">Orientation</p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setRecipe((r) => ({
                        ...r,
                        rotation: (((r.rotation + 90) % 360) as 0 | 90 | 180 | 270),
                      }))
                    }
                    className="min-h-[44px] px-3 rounded-xl bg-[#06070B] border border-white/10 hover:border-amber-400/50 text-xs font-medium text-white flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-amber-300" />
                    <span>+90° ({recipe.rotation}°)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecipe((r) => ({ ...r, flipH: !r.flipH }))}
                    className={`min-h-[44px] px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
                      recipe.flipH
                        ? 'bg-violet-600/30 border-amber-400/60 text-white'
                        : 'bg-[#06070B] border-white/10 text-slate-300'
                    }`}
                  >
                    <FlipHorizontal className="w-3.5 h-3.5" />
                    <span>Flip H</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecipe((r) => ({ ...r, flipV: !r.flipV }))}
                    className={`min-h-[44px] px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
                      recipe.flipV
                        ? 'bg-violet-600/30 border-amber-400/60 text-white'
                        : 'bg-[#06070B] border-white/10 text-slate-300'
                    }`}
                  >
                    <FlipVertical className="w-3.5 h-3.5" />
                    <span>Flip V</span>
                  </button>
                </div>
              </div>

              {/* Aspect Crop */}
              <div className="space-y-2 border-t border-white/[0.08] pt-3">
                <p className="text-[11px] font-semibold text-slate-400">Batch Aspect Crop</p>
                <div className="grid grid-cols-3 gap-2">
                  {CROP_OPTIONS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setRecipe((r) => ({ ...r, cropAspect: c.id }))}
                      className={`min-h-[42px] px-2 rounded-xl border text-xs font-medium cursor-pointer ${
                        recipe.cropAspect === c.id
                          ? 'bg-amber-400/20 border-amber-400/65 text-white'
                          : 'bg-[#06070B] border-white/10 text-slate-300'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Aspect-Preserving Resize */}
              <div className="space-y-2.5 border-t border-white/[0.08] pt-3">
                <p className="text-[11px] font-semibold text-slate-400">
                  Resolution &amp; Resize (Aspect Ratio Locked)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-1.5">
                  {(
                    [
                      {
                        id: 'original',
                        title: 'Original Dimensions (No Resize)',
                        desc: 'Preserves full native pixel size per photo',
                      },
                      {
                        id: 'max-long-edge',
                        title: 'Fit Longest Edge (px)',
                        desc: 'Scales portrait & landscape proportionally',
                      },
                      {
                        id: 'exact-width',
                        title: 'Target Width (Auto Height)',
                        desc: 'Matches exact width while keeping aspect ratio',
                      },
                      {
                        id: 'exact-height',
                        title: 'Target Height (Auto Width)',
                        desc: 'Matches exact height while keeping aspect ratio',
                      },
                      {
                        id: 'scale-pct',
                        title: 'Percentage Scale (%)',
                        desc: 'Uniformly scale every photo by percentage',
                      },
                    ] as Array<{ id: BatchResizeMode; title: string; desc: string }>
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() =>
                        setRecipe((r) => ({ ...r, resize: { ...r.resize, mode: mode.id } }))
                      }
                      className={`min-h-[48px] px-3 py-2 rounded-xl border text-left cursor-pointer transition-colors ${
                        recipe.resize.mode === mode.id
                          ? 'bg-violet-600/25 border-amber-400/65 text-white'
                          : 'bg-[#06070B] border-white/10 text-slate-300'
                      }`}
                    >
                      <p className="text-xs font-semibold">{mode.title}</p>
                      <p className="text-[10px] text-slate-400">{mode.desc}</p>
                    </button>
                  ))}
                </div>

                {recipe.resize.mode === 'max-long-edge' && (
                  <div className="space-y-2 pt-1">
                    <div className="grid grid-cols-4 gap-1.5">
                      {[1080, 1920, 2560, 3840].map((px) => (
                        <button
                          key={px}
                          type="button"
                          onClick={() =>
                            setRecipe((r) => ({
                              ...r,
                              resize: { ...r.resize, maxLongEdgePx: px },
                            }))
                          }
                          className={`min-h-[38px] rounded-lg border text-xs font-mono-tabular cursor-pointer ${
                            recipe.resize.maxLongEdgePx === px
                              ? 'bg-amber-400/20 border-amber-400 text-amber-200'
                              : 'bg-[#06070B] border-white/10 text-slate-300'
                          }`}
                        >
                          {px}px
                        </button>
                      ))}
                    </div>
                    <label className="block text-[11px] text-slate-400">
                      Custom Long Edge (px)
                      <input
                        type="number"
                        min={64}
                        max={8192}
                        value={recipe.resize.maxLongEdgePx}
                        onChange={(e) =>
                          setRecipe((r) => ({
                            ...r,
                            resize: {
                              ...r.resize,
                              maxLongEdgePx: Math.max(64, Math.min(8192, Number(e.target.value) || 64)),
                            },
                          }))
                        }
                        className="mt-1 w-full min-h-[42px] px-3 rounded-xl bg-[#06070B] border border-white/15 text-xs font-mono-tabular text-white"
                      />
                    </label>
                  </div>
                )}

                {recipe.resize.mode === 'exact-width' && (
                  <label className="block text-[11px] text-slate-400 pt-1">
                    Target Output Width (px)
                    <input
                      type="number"
                      min={64}
                      max={8192}
                      value={recipe.resize.targetWidthPx}
                      onChange={(e) =>
                        setRecipe((r) => ({
                          ...r,
                          resize: {
                            ...r.resize,
                            targetWidthPx: Math.max(64, Math.min(8192, Number(e.target.value) || 64)),
                          },
                        }))
                      }
                      className="mt-1 w-full min-h-[42px] px-3 rounded-xl bg-[#06070B] border border-white/15 text-xs font-mono-tabular text-white"
                    />
                  </label>
                )}

                {recipe.resize.mode === 'exact-height' && (
                  <label className="block text-[11px] text-slate-400 pt-1">
                    Target Output Height (px)
                    <input
                      type="number"
                      min={64}
                      max={8192}
                      value={recipe.resize.targetHeightPx}
                      onChange={(e) =>
                        setRecipe((r) => ({
                          ...r,
                          resize: {
                            ...r.resize,
                            targetHeightPx: Math.max(64, Math.min(8192, Number(e.target.value) || 64)),
                          },
                        }))
                      }
                      className="mt-1 w-full min-h-[42px] px-3 rounded-xl bg-[#06070B] border border-white/15 text-xs font-mono-tabular text-white"
                    />
                  </label>
                )}

                {recipe.resize.mode === 'scale-pct' && (
                  <SliderControl
                    label="Output Scale"
                    value={recipe.resize.scalePercent}
                    min={25}
                    max={100}
                    defaultValue={100}
                    unit="%"
                    onChange={(v) =>
                      setRecipe((r) => ({ ...r, resize: { ...r.resize, scalePercent: v } }))
                    }
                  />
                )}
              </div>
            </div>
          )}

          {/* 4. TEXT & WATERMARK TAB */}
          {inspectorTab === 'watermark' && (
            <div className="rounded-2xl bg-[#0B0D16]/90 border border-white/[0.08] p-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-sm font-bold text-white flex items-center gap-2">
                  <TypeIcon className="w-4 h-4 text-amber-300" />
                  <span>Batch Text &amp; Watermark</span>
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    setRecipe((r) => ({
                      ...r,
                      watermark: { ...r.watermark, enabled: !r.watermark.enabled },
                    }))
                  }
                  className={`min-h-[40px] px-3.5 rounded-xl border text-xs font-semibold cursor-pointer ${
                    recipe.watermark.enabled
                      ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200'
                      : 'bg-[#06070B] border-white/15 text-slate-300'
                  }`}
                >
                  {recipe.watermark.enabled ? 'Watermark ON' : 'Watermark OFF'}
                </button>
              </div>

              <div className="space-y-3">
                <label className="block text-[11px] text-slate-400">
                  Watermark / Signature Text
                  <input
                    type="text"
                    value={recipe.watermark.text}
                    onChange={(e) =>
                      setRecipe((r) => ({
                        ...r,
                        watermark: { ...r.watermark, text: e.target.value, enabled: true },
                      }))
                    }
                    placeholder="© Your Brand or Photographer Name"
                    className="mt-1 w-full min-h-[44px] px-3 rounded-xl bg-[#06070B] border border-white/15 focus:border-amber-400/60 outline-none text-xs text-white"
                  />
                </label>

                <label className="block text-[11px] text-slate-400">
                  Typography Font
                  <select
                    value={recipe.watermark.fontFamily}
                    onChange={(e) =>
                      setRecipe((r) => ({
                        ...r,
                        watermark: { ...r.watermark, fontFamily: e.target.value, enabled: true },
                      }))
                    }
                    className="mt-1 w-full min-h-[44px] px-3 rounded-xl bg-[#06070B] border border-white/15 text-xs text-white"
                  >
                    {STUDIO_FONTS.map((f) => (
                      <option key={f.id} value={f.family}>
                        {f.label} — {f.styleNote}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="space-y-1">
                  <SliderControl
                    label="Text Size (% of short edge)"
                    value={recipe.watermark.sizePercent}
                    min={1.5}
                    max={14}
                    step={0.3}
                    defaultValue={4.2}
                    unit="%"
                    onChange={(v) =>
                      setRecipe((r) => ({
                        ...r,
                        watermark: { ...r.watermark, sizePercent: v, enabled: true },
                      }))
                    }
                  />
                  <SliderControl
                    label="Opacity"
                    value={recipe.watermark.opacity}
                    min={10}
                    max={100}
                    defaultValue={85}
                    unit="%"
                    onChange={(v) =>
                      setRecipe((r) => ({
                        ...r,
                        watermark: { ...r.watermark, opacity: v, enabled: true },
                      }))
                    }
                  />
                  <SliderControl
                    label="Outline Thickness"
                    value={recipe.watermark.outlineWidth}
                    min={0}
                    max={8}
                    step={0.5}
                    defaultValue={1.5}
                    onChange={(v) =>
                      setRecipe((r) => ({
                        ...r,
                        watermark: { ...r.watermark, outlineWidth: v, enabled: true },
                      }))
                    }
                  />
                </div>

                {/* Color Swatches */}
                <div className="space-y-1.5">
                  <p className="text-[11px] text-slate-400">Text Color</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {WATERMARK_COLORS.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() =>
                          setRecipe((r) => ({
                            ...r,
                            watermark: { ...r.watermark, color: hex, enabled: true },
                          }))
                        }
                        aria-label={`Watermark color ${hex}`}
                        className={`w-9 h-9 rounded-xl border cursor-pointer ${
                          recipe.watermark.color.toUpperCase() === hex
                            ? 'border-amber-300 ring-2 ring-amber-400/50'
                            : 'border-white/25'
                        }`}
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                    <input
                      type="color"
                      value={recipe.watermark.color}
                      onChange={(e) =>
                        setRecipe((r) => ({
                          ...r,
                          watermark: { ...r.watermark, color: e.target.value, enabled: true },
                        }))
                      }
                      aria-label="Custom watermark color"
                      className="w-10 h-9 rounded-lg bg-transparent border border-white/20 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Placement 3x3 Grid + Tiled */}
                <div className="space-y-2 pt-1">
                  <p className="text-[11px] text-slate-400">Placement</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {WATERMARK_POSITIONS.map((pos) => (
                      <button
                        key={pos.id}
                        type="button"
                        onClick={() =>
                          setRecipe((r) => ({
                            ...r,
                            watermark: { ...r.watermark, position: pos.id, enabled: true },
                          }))
                        }
                        className={`min-h-[40px] rounded-xl border text-[11px] font-medium cursor-pointer ${
                          recipe.watermark.position === pos.id
                            ? 'bg-amber-400/20 border-amber-400 text-amber-200'
                            : 'bg-[#06070B] border-white/10 text-slate-300'
                        }`}
                      >
                        {pos.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setRecipe((r) => ({
                          ...r,
                          watermark: { ...r.watermark, position: 'tiled', enabled: true },
                        }))
                      }
                      className={`min-h-[42px] px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                        recipe.watermark.position === 'tiled'
                          ? 'bg-violet-600/30 border-amber-400 text-white'
                          : 'bg-[#06070B] border-white/10 text-slate-300'
                      }`}
                    >
                      Tiled Repeating Pattern
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setRecipe((r) => ({
                          ...r,
                          watermark: {
                            ...r.watermark,
                            badgeBackdrop: !r.watermark.badgeBackdrop,
                            enabled: true,
                          },
                        }))
                      }
                      className={`min-h-[42px] px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                        recipe.watermark.badgeBackdrop
                          ? 'bg-amber-400/20 border-amber-400 text-amber-200'
                          : 'bg-[#06070B] border-white/10 text-slate-300'
                      }`}
                    >
                      {recipe.watermark.badgeBackdrop ? 'Gold Badge: ON' : 'Gold Badge: OFF'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 5. RECIPE OVERVIEW CARD WHEN EXPORT TAB IS SELECTED */}
          {inspectorTab === 'export' && (
            <div className="rounded-2xl bg-[#0B0D16]/90 border border-white/[0.08] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-sm font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Active Batch Recipe</span>
                </h3>
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => setRecipe({ ...DEFAULT_BATCH_RECIPE, exportFormat: recipe.exportFormat })}
                  className="min-h-[34px] px-2.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-[11px] text-slate-300 flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Recipe</span>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-xl bg-[#06070B] border border-white/10 p-2.5">
                  <p className="text-slate-400">Filter Preset</p>
                  <p className="font-semibold text-white truncate mt-0.5">
                    {FILTER_PRESETS.find((f) => f.id === recipe.filterId)?.name || 'Original'}
                    {recipe.filterId !== 'original' ? ` (${recipe.filterIntensity}%)` : ''}
                  </p>
                </div>
                <div className="rounded-xl bg-[#06070B] border border-white/10 p-2.5">
                  <p className="text-slate-400">Color Grading</p>
                  <p className="font-semibold text-white truncate mt-0.5">
                    {recipe.colorGradePresetId === 'none'
                      ? 'Off'
                      : CINEMATIC_GRADE_PRESETS.find((g) => g.id === recipe.colorGradePresetId)?.name ||
                        customColorPresets.find((c) => c.id === recipe.colorGradePresetId)?.name ||
                        'Custom'}
                  </p>
                </div>
                <div className="rounded-xl bg-[#06070B] border border-white/10 p-2.5">
                  <p className="text-slate-400">Geometry &amp; Size</p>
                  <p className="font-semibold text-white truncate mt-0.5">
                    {recipe.rotation}° · {recipe.cropAspect} ·{' '}
                    {recipe.resize.mode === 'original' ? 'Original px' : recipe.resize.mode}
                  </p>
                </div>
                <div className="rounded-xl bg-[#06070B] border border-white/10 p-2.5">
                  <p className="text-slate-400">Watermark</p>
                  <p className="font-semibold text-white truncate mt-0.5">
                    {recipe.watermark.enabled && recipe.watermark.text.trim()
                      ? `${recipe.watermark.position} (${recipe.watermark.opacity}%)`
                      : 'Disabled'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 6. BATCH EXPORT & GALLERY SAVE PANEL (Always accessible below inspector) */}
          <div className="rounded-2xl bg-[#0B0D16]/95 border border-amber-400/25 p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-bold text-white flex items-center gap-2">
                <Download className="w-4 h-4 text-amber-300" />
                <span>Batch Export &amp; Gallery Save</span>
              </h3>
              <span className="text-[11px] font-mono-tabular text-amber-300">
                {settings.autoSaveToGallery ? `Album: ${settings.galleryAlbumName}` : 'Manual Downloads'}
              </span>
            </div>

            {/* Format Selector: JPG, PNG, WebP */}
            <div className="grid grid-cols-3 gap-2">
              {(['jpg', 'png', 'webp'] as ImageExportFormat[]).map((fmt) => {
                const supported = imageFormatSupport[fmt];
                const active = recipe.exportFormat === fmt;
                return (
                  <button
                    key={fmt}
                    type="button"
                    disabled={!supported || isExporting}
                    onClick={() => setRecipe((r) => ({ ...r, exportFormat: fmt }))}
                    className={`min-h-[44px] rounded-xl border text-xs font-semibold uppercase cursor-pointer transition-colors disabled:opacity-40 ${
                      active
                        ? 'bg-gradient-to-r from-violet-600/35 to-amber-500/25 border-amber-400 text-white'
                        : 'bg-[#06070B] border-white/10 text-slate-300'
                    }`}
                  >
                    {fmt}
                    {fmt === 'png' ? ' · Lossless' : ''}
                  </button>
                );
              })}
            </div>

            {recipe.exportFormat !== 'png' ? (
              <SliderControl
                label={`${recipe.exportFormat.toUpperCase()} Quality`}
                value={recipe.exportQuality}
                min={50}
                max={100}
                defaultValue={95}
                unit="%"
                onChange={(v) => setRecipe((r) => ({ ...r, exportQuality: v }))}
              />
            ) : (
              <p className="text-[11px] text-emerald-300/90">
                PNG exports losslessly with zero compression artifacts.
              </p>
            )}

            {/* Export Actions or Cancel */}
            {isExporting ? (
              <div className="space-y-3 rounded-xl bg-[#06070B] border border-amber-400/35 p-3.5">
                <div className="flex items-center justify-between gap-2 text-xs text-amber-200">
                  <span className="flex items-center gap-2 min-w-0">
                    <Loader2 className="w-4 h-4 animate-spin text-amber-300 shrink-0" />
                    <span className="truncate">{exportStageLabel || 'Processing batch...'}</span>
                  </span>
                  <span className="font-mono-tabular font-bold text-amber-300 shrink-0">
                    {exportProgressPct}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-violet-500 via-purple-400 to-amber-400 transition-all duration-150"
                    style={{ width: `${Math.max(4, Math.min(100, exportProgressPct))}%` }}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCancelBatch}
                  className="w-full min-h-[46px] rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Cancel Batch Processing</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
                <button
                  type="button"
                  disabled={selectedItems.length === 0}
                  onClick={() => executeBatchExport(selectedItems, false)}
                  className="w-full min-h-[48px] px-4 rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-amber-500 hover:brightness-110 disabled:opacity-40 text-sm font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Export Selected ({selectedItems.length})</span>
                </button>

                <button
                  type="button"
                  disabled={items.length === 0}
                  onClick={() => executeBatchExport(items, false)}
                  className="w-full min-h-[46px] px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-40 border border-amber-400/35 text-xs font-semibold text-amber-200 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Layers className="w-4 h-4 text-amber-300" />
                  <span>Export All Photos ({items.length})</span>
                </button>
              </div>
            )}

            {lastGalleryResult && (
              <GallerySaveBanner
                saving={false}
                result={lastGalleryResult}
                onSaveCopyAnyway={
                  lastGalleryResult.duplicatePrevented && selectedItems.length > 0
                    ? () => executeBatchExport(selectedItems, true)
                    : undefined
                }
                onDismiss={() => setLastGalleryResult(null)}
              />
            )}

            {exportSummary && (
              <div className="rounded-xl bg-[#06070B] border border-white/10 p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-white">Batch Export Report</p>
                  <span className="text-[11px] font-mono-tabular text-slate-300">
                    {exportSummary.completed} saved · {exportSummary.skippedDuplicates} skipped ·{' '}
                    {exportSummary.failed} failed
                    {exportSummary.wasCancelled ? ` · ${exportSummary.cancelledCount} cancelled` : ''}
                  </span>
                </div>

                {exportSummary.skippedDuplicates > 0 && !isExporting && (
                  <button
                    type="button"
                    onClick={() =>
                      executeBatchExport(
                        items.filter((it) =>
                          exportSummary.outcomes.some(
                            (o) => o.itemId === it.id && o.status === 'skipped-duplicate'
                          )
                        ),
                        true
                      )
                    }
                    className="w-full min-h-[40px] px-3 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/45 text-[11px] font-semibold text-amber-200 cursor-pointer"
                  >
                    Save Copies Anyway for {exportSummary.skippedDuplicates} Skipped Photo
                    {exportSummary.skippedDuplicates === 1 ? '' : 's'}
                  </button>
                )}

                <div className="max-h-[210px] overflow-y-auto space-y-1.5 pr-1">
                  {exportSummary.outcomes.map((o) => (
                    <div
                      key={o.itemId}
                      className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-2.5 py-2 flex items-start justify-between gap-2 text-[11px]"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-white truncate">{o.fileName}</p>
                        <p className="font-mono-tabular text-slate-400 truncate">
                          {o.width}×{o.height}
                          {o.sizeBytes > 0 ? ` · ${formatBytes(o.sizeBytes)}` : ''}
                          {o.locationLabel ? ` · ${o.locationLabel}` : ''}
                        </p>
                        {o.errorMessage && (
                          <p className="text-rose-300 mt-0.5">{o.errorMessage}</p>
                        )}
                      </div>
                      <span
                        className={`font-semibold shrink-0 ${
                          o.status === 'done'
                            ? 'text-emerald-300'
                            : o.status === 'skipped-duplicate'
                              ? 'text-amber-300'
                              : o.status === 'cancelled'
                                ? 'text-slate-400'
                                : 'text-rose-300'
                        }`}
                      >
                        {o.status === 'done'
                          ? 'Saved'
                          : o.status === 'skipped-duplicate'
                            ? 'Duplicate'
                            : o.status === 'cancelled'
                              ? 'Cancelled'
                              : 'Error'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
