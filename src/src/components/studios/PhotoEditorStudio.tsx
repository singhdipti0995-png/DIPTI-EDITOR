import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Wand2,
  Download,
  Save,
  RotateCcw,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Eye,
  Sparkles,
  AlertCircle,
  Check,
  Undo2,
  Redo2,
  SplitSquareHorizontal,
  Sliders,
  Palette,
  Crop,
  Droplets,
  Scissors,
  Type as TypeIcon,
  Sticker,
  Plus,
  Trash2,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';
import {
  AppSettings,
  BackdropMode,
  CropAspect,
  DEFAULT_ADJUSTMENTS,
  ExportRecord,
  PhotoAdjustments,
  ProjectItem,
  StickerLayer,
  SubjectSegmentConfig,
  TextLayer,
} from '../../types/editor';
import {
  FILTER_PRESETS,
  STUDIO_FONTS,
  STUDIO_OVERLAYS,
  STUDIO_STICKERS,
} from '../../data/studioCatalog';
import { AssetPickerBar } from '../AssetPickerBar';
import { BeforeAfterSlider } from '../BeforeAfterSlider';
import { SliderControl } from '../SliderControl';
import {
  compressImageForAI,
  createThumbnailDataUrl,
  loadImageElement,
  mergeFilterWithAdjustments,
  renderAdjustedCanvas,
} from '../../utils/canvasEngine';
import { downloadExportedBlob, encodeCanvasToBlob } from '../../utils/exportEngine';
import { HdQualityPreset, releaseCanvasMemory, resolveHdPhotoExportPlan } from '../../utils/hdQualityEngine';
import { formatBytes } from '../../utils/indexedDbStorage';
import { GallerySaveResult, saveMediaToGallery } from '../../utils/gallerySaveEngine';
import { GallerySaveBanner } from '../GallerySaveBanner';
import { PRESET_LIBRARY_CATEGORIES } from '../../data/customPresetLibrary';
import { PresetCategory } from '../../types/presetLibrary';
import { createCustomLibraryPreset } from '../../utils/presetLibraryStorage';

interface PhotoEditorStudioProps {
  imageUrl: string;
  onChangeImage: (url: string) => void;
  initialAdjustments?: PhotoAdjustments;
  initialTextLayers?: TextLayer[];
  initialStickers?: StickerLayer[];
  initialBgRemoved?: boolean;
  initialBackdrop?: BackdropMode;
  activeProjectId?: string;
  settings: AppSettings;
  onSaveProject: (project: ProjectItem) => Promise<boolean> | void;
  onAutoSaveProject?: (project: ProjectItem) => Promise<boolean>;
  onRecordExport?: (record: ExportRecord) => Promise<void>;
  onOpenExportCenter?: () => void;
  onOpenPresetLibrary?: () => void;
  onAdjustmentsChange?: (adj: PhotoAdjustments) => void;
}

interface EditorSnapshot {
  adj: PhotoAdjustments;
  textLayers: TextLayer[];
  stickers: StickerLayer[];
  bgEnabled: boolean;
  backdrop: BackdropMode;
  segment: SubjectSegmentConfig;
}

type StudioDeckTab = 'tune' | 'color' | 'filters' | 'fx' | 'crop' | 'ai' | 'bg' | 'text' | 'stickers';

const AI_QUICK_PROMPTS = [
  { label: 'Auto Balance', prompt: 'Balanced dynamic range, crisp detail, and natural studio tones' },
  { label: 'Midnight Gold', prompt: 'Deep obsidian shadows with warm burnished gold highlights and cinema contrast' },
  { label: 'Electric Navy', prompt: 'Cool electric blue shadows, sharp contrast, and sleek futuristic grading' },
  { label: 'Leica Noir', prompt: 'High-contrast silver monochrome black and white editorial film look' },
];

const FILTER_CATEGORIES = ['All', 'Cinema', 'Editorial', 'Portrait', 'Noir', 'Neon', 'Vintage'] as const;

const BACKDROP_OPTIONS: Array<{ id: BackdropMode; label: string; swatch: string }> = [
  { id: 'transparent', label: 'Transparent', swatch: 'bg-checkerboard' },
  { id: 'navy', label: 'Deep Navy', swatch: 'bg-gradient-to-br from-[#070B18] to-[#15224A]' },
  { id: 'purple-glow', label: 'Purple Glow', swatch: 'bg-gradient-to-br from-violet-700 to-[#06070B]' },
  { id: 'gold-noir', label: 'Gold Noir', swatch: 'bg-gradient-to-br from-amber-700/60 to-zinc-950' },
  { id: 'studio-white', label: 'Clean White', swatch: 'bg-slate-100' },
  { id: 'bokeh', label: 'Bokeh', swatch: 'bg-gradient-to-br from-sky-900 to-slate-900' },
];

const COLOR_SWATCHES = ['#F8FAFC', '#D4AF37', '#38BDF8', '#A855F7', '#F43F5E', '#09090B'];

const DEFAULT_SEGMENT: SubjectSegmentConfig = {
  subjectLabel: 'Foreground Subject',
  xMin: 0.22,
  yMin: 0.1,
  xMax: 0.78,
  yMax: 0.95,
  threshold: 34,
  feather: 2,
};

function cloneSnapshot(s: EditorSnapshot): EditorSnapshot {
  return {
    adj: { ...s.adj },
    textLayers: s.textLayers.map((l) => ({ ...l })),
    stickers: stClone(s.stickers),
    bgEnabled: s.bgEnabled,
    backdrop: s.backdrop,
    segment: { ...s.segment },
  };
}

function stClone(list: StickerLayer[]): StickerLayer[] {
  return list.map((s) => ({ ...s }));
}

export const PhotoEditorStudio: React.FC<PhotoEditorStudioProps> = ({
  imageUrl,
  onChangeImage,
  initialAdjustments,
  initialTextLayers,
  initialStickers,
  initialBgRemoved,
  initialBackdrop,
  activeProjectId,
  settings,
  onSaveProject,
  onAutoSaveProject,
  onRecordExport,
  onOpenExportCenter,
  onOpenPresetLibrary,
  onAdjustmentsChange,
}) => {
  const initialSnapshot: EditorSnapshot = {
    adj: initialAdjustments ? { ...DEFAULT_ADJUSTMENTS, ...initialAdjustments } : { ...DEFAULT_ADJUSTMENTS },
    textLayers: initialTextLayers ?? [],
    stickers: initialStickers ?? [],
    bgEnabled: Boolean(initialBgRemoved),
    backdrop: initialBackdrop ?? 'transparent',
    segment: { ...DEFAULT_SEGMENT },
  };

  const [history, setHistory] = useState<EditorSnapshot[]>([cloneSnapshot(initialSnapshot)]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const [draft, setDraft] = useState<EditorSnapshot>(cloneSnapshot(initialSnapshot));

  const [activeTab, setActiveTab] = useState<StudioDeckTab>('filters');
  const [filterCategory, setFilterCategory] = useState<(typeof FILTER_CATEGORIES)[number]>('All');
  const [selectedTextId, setSelectedTextId] = useState<string | null>(initialTextLayers?.[0]?.id ?? null);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(initialStickers?.[0]?.id ?? null);
  const [draggingItem, setDraggingItem] = useState<{ type: 'text' | 'sticker'; id: string } | null>(null);

  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const [showOriginal, setShowOriginal] = useState(false);
  const [splitCompare, setSplitCompare] = useState(false);
  const [beforePreviewDataUrl, setBeforePreviewDataUrl] = useState<string>(imageUrl);
  const [afterPreviewDataUrl, setAfterPreviewDataUrl] = useState<string>(imageUrl);
  const [filterThumbs, setFilterThumbs] = useState<Record<string, string>>({});
  const [savedNotice, setSavedNotice] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [autoSaveText, setAutoSaveText] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [gallerySaving, setGallerySaving] = useState(false);
  const [galleryProgress, setGalleryProgress] = useState(0);
  const [galleryStage, setGalleryStage] = useState<string | null>(null);
  const [galleryResult, setGalleryResult] = useState<GallerySaveResult | null>(null);
  const [lastFormatUsed, setLastFormatUsed] = useState<'png' | 'jpg' | 'webp'>('png');
  const [hdQualityPreset, setHdQualityPreset] = useState<HdQualityPreset>('original');
  const [libPresetName, setLibPresetName] = useState('');
  const [libPresetCat, setLibPresetCat] = useState<PresetCategory>('Cinematic');
  const [libSavedNote, setLibSavedNote] = useState(false);
  const [imgDims, setImgDims] = useState({ w: 0, h: 0 });

  const imgRef = useRef<HTMLImageElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const historyCommitTimerRef = useRef<number | null>(null);
  const historyIdxRef = useRef(historyIdx);
  historyIdxRef.current = historyIdx;
  const sessionProjectIdRef = useRef(activeProjectId || `proj-photo-${Date.now()}`);
  if (activeProjectId) sessionProjectIdRef.current = activeProjectId;

  useEffect(() => {
    return () => {
      if (historyCommitTimerRef.current) {
        window.clearTimeout(historyCommitTimerRef.current);
      }
    };
  }, []);

  const commitSnapshot = useCallback((next: EditorSnapshot) => {
    if (historyCommitTimerRef.current) {
      window.clearTimeout(historyCommitTimerRef.current);
      historyCommitTimerRef.current = null;
    }
    const snap = cloneSnapshot(next);
    setDraft(snap);
    setHistory((prev) => {
      const nextList = [...prev.slice(0, historyIdxRef.current + 1), snap].slice(-35);
      historyIdxRef.current = nextList.length - 1;
      setHistoryIdx(nextList.length - 1);
      return nextList;
    });
  }, []);

  const canUndo = historyIdx > 0;
  const canRedo = historyIdx < history.length - 1;

  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    const nextIdx = historyIdx - 1;
    setHistoryIdx(nextIdx);
    setDraft(cloneSnapshot(history[nextIdx]));
  }, [canUndo, history, historyIdx]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    const nextIdx = historyIdx + 1;
    setHistoryIdx(nextIdx);
    setDraft(cloneSnapshot(history[nextIdx]));
  }, [canRedo, history, historyIdx]);

  // Keyboard shortcuts for Undo / Redo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleUndo, handleRedo]);

  useEffect(() => {
    onAdjustmentsChange?.(mergeFilterWithAdjustments(draft.adj));
  }, [draft.adj, onAdjustmentsChange]);

  // Reset history when project props change explicitly
  useEffect(() => {
    if (initialAdjustments || initialTextLayers || initialStickers || initialBgRemoved) {
      const snap: EditorSnapshot = {
        adj: initialAdjustments ? { ...DEFAULT_ADJUSTMENTS, ...initialAdjustments } : { ...DEFAULT_ADJUSTMENTS },
        textLayers: initialTextLayers ?? [],
        stickers: initialStickers ?? [],
        bgEnabled: Boolean(initialBgRemoved),
        backdrop: initialBackdrop ?? 'transparent',
        segment: { ...DEFAULT_SEGMENT },
      };
      setDraft(cloneSnapshot(snap));
      setHistory([cloneSnapshot(snap)]);
      setHistoryIdx(0);
      setSelectedTextId(snap.textLayers[0]?.id ?? null);
      setSelectedStickerId(snap.stickers[0]?.id ?? null);
    }
  }, [initialAdjustments, initialTextLayers, initialStickers, initialBgRemoved, initialBackdrop]);

  const renderViewport = useCallback(
    (img: HTMLImageElement, snap: EditorSnapshot, peekOriginal: boolean) => {
      if (!previewCanvasRef.current) return;
      if (peekOriginal) {
        renderAdjustedCanvas(img, previewCanvasRef.current, DEFAULT_ADJUSTMENTS, { maxPreviewDim: 1080 });
      } else {
        renderAdjustedCanvas(img, previewCanvasRef.current, snap.adj, {
          maxPreviewDim: 1080,
          textLayers: snap.textLayers,
          stickers: snap.stickers,
          bgCutout: snap.bgEnabled
            ? { enabled: true, segment: snap.segment, backdrop: snap.backdrop }
            : undefined,
        });
      }
      if (splitCompare && previewCanvasRef.current) {
        setAfterPreviewDataUrl(previewCanvasRef.current.toDataURL('image/png'));
        const hasGeometryEdit =
          snap.adj.rotation !== 0 ||
          snap.adj.fineRotation !== 0 ||
          snap.adj.flipH ||
          snap.adj.flipV ||
          snap.adj.cropAspect !== 'original';
        if (hasGeometryEdit) {
          const refCanvas = document.createElement('canvas');
          renderAdjustedCanvas(
            img,
            refCanvas,
            {
              ...DEFAULT_ADJUSTMENTS,
              rotation: snap.adj.rotation,
              fineRotation: snap.adj.fineRotation,
              flipH: snap.adj.flipH,
              flipV: snap.adj.flipV,
              cropAspect: snap.adj.cropAspect,
            },
            { maxPreviewDim: 1080 }
          );
          setBeforePreviewDataUrl(refCanvas.toDataURL('image/png'));
        } else {
          setBeforePreviewDataUrl(imageUrl);
        }
      }
    },
    [imageUrl, splitCompare]
  );

  useEffect(() => {
    let cancelled = false;
    setFilterThumbs({});
    loadImageElement(imageUrl)
      .then((img) => {
        if (cancelled) return;
        imgRef.current = img;
        setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
        renderViewport(img, draftRef.current, showOriginal);

        // Generate real-time filter preview thumbnails from the actual uploaded image
        let cursor = 0;
        const thumbCanvas = document.createElement('canvas');
        const buildBatch = () => {
          if (cancelled) return;
          const end = Math.min(FILTER_PRESETS.length, cursor + 5);
          const batchThumbs: Record<string, string> = {};
          for (; cursor < end; cursor++) {
            const preset = FILTER_PRESETS[cursor];
            renderAdjustedCanvas(
              img,
              thumbCanvas,
              {
                ...DEFAULT_ADJUSTMENTS,
                activeFilterId: preset.id,
                filterIntensity: 100,
              },
              { maxPreviewDim: 120 }
            );
            batchThumbs[preset.id] = thumbCanvas.toDataURL('image/jpeg', 0.78);
          }
          setFilterThumbs((prev) => ({ ...prev, ...batchThumbs }));
          if (cursor < FILTER_PRESETS.length) {
            window.requestAnimationFrame(buildBatch);
          }
        };
        window.requestAnimationFrame(buildBatch);
      })
      .catch(() => {
        if (!cancelled) setAiError('Could not load selected image into the canvas.');
      });
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => {
      if (imgRef.current) {
        renderViewport(imgRef.current, draft, showOriginal);
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [draft, showOriginal, splitCompare, renderViewport]);

  // Discrete property change (commits immediately to undo stack)
  const updateAdj = <K extends keyof PhotoAdjustments>(key: K, val: PhotoAdjustments[K]) => {
    commitSnapshot({
      ...draft,
      adj: { ...draft.adj, [key]: val },
    });
  };

  // Continuous slider change (60fps live canvas preview + debounced undo commit)
  const liveUpdateAdj = <K extends keyof PhotoAdjustments>(key: K, val: PhotoAdjustments[K]) => {
    const nextSnap: EditorSnapshot = {
      ...draftRef.current,
      adj: { ...draftRef.current.adj, [key]: val },
    };
    setDraft(nextSnap);
    if (historyCommitTimerRef.current) {
      window.clearTimeout(historyCommitTimerRef.current);
    }
    historyCommitTimerRef.current = window.setTimeout(() => {
      commitSnapshot(draftRef.current);
    }, 260);
  };

  const applyEffectPreset = (presetId: string) => {
    commitSnapshot({
      ...draft,
      adj: {
        ...draft.adj,
        activeFilterId: presetId,
        filterIntensity: 100,
      },
    });
  };

  const handleResetAll = () => {
    commitSnapshot({
      adj: { ...DEFAULT_ADJUSTMENTS },
      textLayers: [],
      stickers: [],
      bgEnabled: false,
      backdrop: 'transparent',
      segment: { ...DEFAULT_SEGMENT },
    });
    setSelectedTextId(null);
    setSelectedStickerId(null);
    setAiNote(null);
  };

  // AI Color Grade
  const runAiGrade = async (promptText?: string) => {
    if (!imgRef.current) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const { base64, mimeType } = compressImageForAI(imgRef.current, 768);
      const res = await fetch('/api/ai/photo-grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType,
          prompt: promptText ?? aiPrompt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI grading failed.');
      commitSnapshot({
        ...draft,
        adj: {
          ...draft.adj,
          exposure: Number(data.exposure ?? 0),
          contrast: Number(data.contrast ?? 0),
          highlights: Number(data.highlights ?? 0),
          shadows: Number(data.shadows ?? 0),
          saturation: Number(data.saturation ?? 0),
          temperature: Number(data.temperature ?? 0),
          tint: Number(data.tint ?? 0),
          sharpness: Number(data.sharpness ?? 0),
          vignette: Number(data.vignette ?? 0),
          grain: Number(data.grain ?? 0),
          bloom: Number(data.bloom ?? 0),
        },
      });
      setAiNote(`${data.styleName || 'AI Grade'}: ${data.summary || 'Applied intelligent color balance.'}`);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Unable to reach AI grading service.');
    } finally {
      setAiLoading(false);
    }
  };

  // AI Auto-Enhance
  const runAiEnhance = async () => {
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
          mode: 'restore',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI enhancement failed.');
      commitSnapshot({
        ...draft,
        adj: {
          ...draft.adj,
          exposure: Number(data.exposureLift ?? 4),
          contrast: Number(data.contrastBoost ?? 14),
          saturation: Number(data.colorVibrance ?? 12),
          sharpness: Number(data.sharpen ?? 40),
          shadows: Math.round(Number(data.clarity ?? 24) * 0.4),
        },
      });
      setAiNote(data.diagnosisNote || 'AI Photo Enhancement applied.');
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Unable to reach AI enhancement engine.');
    } finally {
      setAiLoading(false);
    }
  };

  // AI Background Removal inside Photo Studio
  const runAiBgRemove = async () => {
    if (!imgRef.current) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const { base64, mimeType } = compressImageForAI(imgRef.current, 768);
      const res = await fetch('/api/ai/subject-segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI subject detection failed.');
      commitSnapshot({
        ...draft,
        bgEnabled: true,
        segment: {
          subjectLabel: data.subjectLabel || 'Detected Subject',
          xMin: Math.max(0, Math.min(0.85, Number(data.xMin ?? 0.2))),
          yMin: Math.max(0, Math.min(0.85, Number(data.yMin ?? 0.1))),
          xMax: Math.max(0.15, Math.min(1, Number(data.xMax ?? 0.8))),
          yMax: Math.max(0.15, Math.min(1, Number(data.yMax ?? 0.95))),
          threshold: Math.max(15, Math.min(65, Number(data.recommendedThreshold ?? 34))),
          feather: Math.max(0, Math.min(5, Number(data.edgeFeather ?? 2))),
          backgroundStyle: data.backgroundStyle,
        },
      });
      setAiNote(`Isolated ${data.subjectLabel || 'subject'}.`);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Unable to reach AI segmentation service.');
    } finally {
      setAiLoading(false);
    }
  };

  // Text Layer actions
  const activeTextLayer = draft.textLayers.find((l) => l.id === selectedTextId) || draft.textLayers[0] || null;
  const addTextLayer = () => {
    const newLayer: TextLayer = {
      id: `txt-${Date.now()}`,
      text: 'DIPTI STUDIO',
      x: 0.5,
      y: 0.5,
      fontFamily: "'Syne', sans-serif",
      fontSize: 68,
      fontWeight: 700,
      color: '#F8FAFC',
      letterSpacing: 3,
      lineHeight: 1.1,
      opacity: 96,
      rotation: 0,
      shadowBlur: 14,
      strokeWidth: 0,
      strokeColor: '#000000',
      align: 'center',
      uppercase: false,
    };
    commitSnapshot({ ...draft, textLayers: [...draft.textLayers, newLayer] });
    setSelectedTextId(newLayer.id);
  };

  const updateTextLayer = <K extends keyof TextLayer>(key: K, val: TextLayer[K]) => {
    if (!activeTextLayer) return;
    commitSnapshot({
      ...draft,
      textLayers: draft.textLayers.map((l) => (l.id === activeTextLayer.id ? { ...l, [key]: val } : l)),
    });
  };

  const removeTextLayer = (id: string) => {
    const next = draft.textLayers.filter((l) => l.id !== id);
    commitSnapshot({ ...draft, textLayers: next });
    if (selectedTextId === id) setSelectedTextId(next[0]?.id ?? null);
  };

  // Sticker Layer actions
  const activeSticker = draft.stickers.find((s) => s.id === selectedStickerId) || draft.stickers[0] || null;
  const addSticker = (kind: StickerLayer['kind'], label: string, color: string) => {
    const newSticker: StickerLayer = {
      id: `stk-${Date.now()}`,
      kind,
      label,
      x: 0.5,
      y: 0.45,
      size: 120,
      rotation: 0,
      opacity: 95,
      color,
    };
    commitSnapshot({ ...draft, stickers: [...draft.stickers, newSticker] });
    setSelectedStickerId(newSticker.id);
  };

  const updateSticker = <K extends keyof StickerLayer>(key: K, val: StickerLayer[K]) => {
    if (!activeSticker) return;
    commitSnapshot({
      ...draft,
      stickers: draft.stickers.map((s) => (s.id === activeSticker.id ? { ...s, [key]: val } : s)),
    });
  };

  const removeSticker = (id: string) => {
    const next = draft.stickers.filter((s) => s.id !== id);
    commitSnapshot({ ...draft, stickers: next });
    if (selectedStickerId === id) setSelectedStickerId(next[0]?.id ?? null);
  };

  // Canvas drag for text & stickers
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const candidates: Array<{ type: 'text' | 'sticker'; id: string; x: number; y: number }> = [
      ...draft.textLayers.map((t) => ({ type: 'text' as const, id: t.id, x: t.x, y: t.y })),
      ...draft.stickers.map((s) => ({ type: 'sticker' as const, id: s.id, x: s.x, y: s.y })),
    ];
    if (candidates.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;

    let closest = candidates[0];
    let best = Infinity;
    for (const c of candidates) {
      const d = Math.hypot(c.x - nx, c.y - ny);
      if (d < best) {
        best = d;
        closest = c;
      }
    }
    if (best > 0.28) return;

    if (closest.type === 'text') {
      setSelectedTextId(closest.id);
      setActiveTab('text');
    } else {
      setSelectedStickerId(closest.id);
      setActiveTab('stickers');
    }
    setDraggingItem({ type: closest.type, id: closest.id });
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingItem || !previewCanvasRef.current) return;
    const rect = previewCanvasRef.current.getBoundingClientRect();
    const nx = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0.05, Math.min(0.95, (e.clientY - rect.top) / rect.height));

    setDraft((prev) => ({
      ...prev,
      textLayers:
        draggingItem.type === 'text'
          ? prev.textLayers.map((l) => (l.id === draggingItem.id ? { ...l, x: nx, y: ny } : l))
          : prev.textLayers,
      stickers:
        draggingItem.type === 'sticker'
          ? prev.stickers.map((s) => (s.id === draggingItem.id ? { ...s, x: nx, y: ny } : s))
          : prev.stickers,
    }));
  };

  const handleCanvasPointerUp = () => {
    if (draggingItem) {
      setDraggingItem(null);
      commitSnapshot(draftRef.current);
    }
  };

  // Debounced Auto-Save to IndexedDB when enabled
  useEffect(() => {
    if (!settings.autoSaveProjects || !onAutoSaveProject || historyIdx === 0) return;
    const timer = window.setTimeout(async () => {
      if (!previewCanvasRef.current) return;
      const thumb = createThumbnailDataUrl(previewCanvasRef.current, 420);
      const activeFilterName = FILTER_PRESETS.find((f) => f.id === draftRef.current.adj.activeFilterId)?.name;
      const ok = await onAutoSaveProject({
        id: sessionProjectIdRef.current,
        name:
          activeFilterName && activeFilterName !== 'Original'
            ? `${activeFilterName} Edit`
            : 'Studio Photo Edit',
        tool: 'photo',
        thumbnailDataUrl: thumb || imageUrl,
        sourceImageUrl: imageUrl,
        width: imgDims.w || previewCanvasRef.current.width,
        height: imgDims.h || previewCanvasRef.current.height,
        updatedAt: new Date().toISOString(),
        adjustments: draftRef.current.adj,
        textLayers: draftRef.current.textLayers,
        stickers: draftRef.current.stickers,
        bgRemoved: draftRef.current.bgEnabled,
        backdropMode: draftRef.current.backdrop,
        undoSteps: historyIdx,
        redoSteps: Math.max(0, history.length - 1 - historyIdx),
        autoSaved: true,
      });
      if (ok) {
        setAutoSaveText(`Auto-saved · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
        setSaveError(null);
      } else {
        setAutoSaveText(null);
        setSaveError('Auto-save failed: browser storage rejected write.');
      }
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [draft, historyIdx, history.length, settings.autoSaveProjects, onAutoSaveProject, imageUrl, imgDims.w, imgDims.h]);

  const handleExportFormat = async (
    format: 'png' | 'jpg' | 'webp',
    opts?: { triggerSource?: 'save' | 'export' | 'manual'; forceDuplicate?: boolean }
  ) => {
    if (!imgRef.current) return;
    const triggerSource = opts?.triggerSource ?? 'export';
    setExportError(null);
    setExportNotice(null);
    setLastFormatUsed(format);
    setGallerySaving(true);
    setGalleryProgress(8);
    setGalleryStage(`Rendering ${imgDims.w || 'full'}×${imgDims.h || 'res'} ${format.toUpperCase()}...`);
    setGalleryResult(null);

    const exportCanvas = document.createElement('canvas');
    try {
      renderAdjustedCanvas(imgRef.current, exportCanvas, draft.adj, {
        textLayers: draft.textLayers,
        stickers: draft.stickers,
        bgCutout: draft.bgEnabled
          ? { enabled: true, segment: draft.segment, backdrop: draft.backdrop }
          : undefined,
      });
      const plan = resolveHdPhotoExportPlan(
        exportCanvas.width,
        exportCanvas.height,
        hdQualityPreset,
        format,
        'original',
        settings.exportQuality
      );
      setGalleryProgress(32);
      setGalleryStage(`Encoding ${format.toUpperCase()} (${exportCanvas.width}×${exportCanvas.height})...`);
      const { blob, mimeType } = await encodeCanvasToBlob(exportCanvas, format, plan.qualityPercent);
      const fileName = `dipti-photo-${exportCanvas.width}x${exportCanvas.height}-${Date.now()}.${format}`;
      const thumb = createThumbnailDataUrl(exportCanvas, 320);

      if (!settings.autoSaveToGallery && triggerSource === 'export') {
        downloadExportedBlob(blob, fileName);
        setExportNotice(
          `Manual download · ${format.toUpperCase()} · ${exportCanvas.width}×${exportCanvas.height}px · ${formatBytes(blob.size)} (Gallery auto-save is OFF in Settings)`
        );
        if (onRecordExport) {
          await onRecordExport({
            id: `exp-${Date.now()}`,
            projectId: sessionProjectIdRef.current,
            fileName,
            mediaType: 'image',
            format,
            resolutionLabel: `${exportCanvas.width}×${exportCanvas.height}`,
            width: exportCanvas.width,
            height: exportCanvas.height,
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

      const res = await saveMediaToGallery({
        blob,
        fileName,
        mimeType,
        mediaType: 'image',
        format,
        width: exportCanvas.width,
        height: exportCanvas.height,
        settings,
        triggerSource,
        forceDuplicate: opts?.forceDuplicate,
        projectId: sessionProjectIdRef.current,
        quality: format === 'png' ? 100 : plan.qualityPercent,
        thumbnailDataUrl: thumb,
        onProgress: (pct, stage) => {
          setGalleryProgress(pct);
          setGalleryStage(stage);
        },
        onRecordExport,
      });

      setGalleryResult(res);
      if (res.saved) {
        setExportNotice(
          `${format.toUpperCase()} · ${exportCanvas.width}×${exportCanvas.height}px · ${formatBytes(blob.size)}`
        );
      } else if (res.error) {
        setExportError(res.error);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Photo export failed.';
      setExportError(msg);
    } finally {
      releaseCanvasMemory(exportCanvas);
      setGallerySaving(false);
    }
  };

  const handleSave = async () => {
    if (!previewCanvasRef.current) return;
    setSaveError(null);
    const thumb = createThumbnailDataUrl(previewCanvasRef.current, 480);
    const activeFilterName = FILTER_PRESETS.find((f) => f.id === draft.adj.activeFilterId)?.name;
    const result = await onSaveProject({
      id: sessionProjectIdRef.current,
      name: aiNote
        ? aiNote.split(':')[0]
        : activeFilterName && activeFilterName !== 'Original'
          ? `${activeFilterName} Edit`
          : 'Studio Photo Edit',
      tool: 'photo',
      thumbnailDataUrl: thumb || imageUrl,
      sourceImageUrl: imageUrl,
      width: imgDims.w || previewCanvasRef.current.width,
      height: imgDims.h || previewCanvasRef.current.height,
      updatedAt: new Date().toISOString(),
      adjustments: draft.adj,
      textLayers: draft.textLayers,
      stickers: draft.stickers,
      bgRemoved: draft.bgEnabled,
      backdropMode: draft.backdrop,
      undoSteps: historyIdx,
      redoSteps: Math.max(0, history.length - 1 - historyIdx),
      autoSaved: false,
    });
    if (result === false) {
      setSaveError('Failed to save project to My Projects.');
      return;
    }
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);

    // Automatically save edited photo to Phone Gallery when enabled in Settings
    if (settings.autoSaveToGallery) {
      const targetFmt: 'png' | 'jpg' | 'webp' =
        settings.exportFormat === 'jpeg' ? 'jpg' : settings.exportFormat;
      await handleExportFormat(targetFmt, { triggerSource: 'save' });
    }
  };

  const aspects: CropAspect[] = ['original', '1:1', '4:5', '3:4', '16:9', '9:16'];
  const filteredPresets =
    filterCategory === 'All'
      ? FILTER_PRESETS
      : FILTER_PRESETS.filter((p) => p.category === filterCategory);

  const deckTabs: Array<{ id: StudioDeckTab; label: string; icon: React.ReactNode }> = [
    { id: 'filters', label: '30 Filters', icon: <Palette className="w-3.5 h-3.5" /> },
    { id: 'tune', label: 'Tune', icon: <Sliders className="w-3.5 h-3.5" /> },
    { id: 'color', label: 'RGB / HSL', icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: 'fx', label: 'Effects', icon: <Droplets className="w-3.5 h-3.5" /> },
    { id: 'crop', label: 'Crop', icon: <Crop className="w-3.5 h-3.5" /> },
    { id: 'ai', label: 'AI Enhance', icon: <Wand2 className="w-3.5 h-3.5" /> },
    { id: 'bg', label: 'BG Remove', icon: <Scissors className="w-3.5 h-3.5" /> },
    { id: 'text', label: 'Text', icon: <TypeIcon className="w-3.5 h-3.5" /> },
    { id: 'stickers', label: 'Stickers', icon: <Sticker className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-4 pb-24 lg:pb-8">
      <AssetPickerBar activeImageUrl={imageUrl} onSelectImage={onChangeImage} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Canvas Viewport Column */}
        <div className="lg:col-span-7 xl:col-span-8 rounded-2xl bg-[#080B14] border border-white/10 p-3 sm:p-4 flex flex-col gap-3">
          {/* Top Studio Action Bar: Undo, Redo, Split Compare, Peek, Reset */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={!canUndo}
                onClick={handleUndo}
                title="Undo"
                className="min-h-[38px] min-w-[38px] px-2.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] disabled:opacity-35 border border-white/10 text-xs font-medium text-slate-200 flex items-center gap-1.5 cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Undo</span>
              </button>
              <button
                type="button"
                disabled={!canRedo}
                onClick={handleRedo}
                title="Redo"
                className="min-h-[38px] min-w-[38px] px-2.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] disabled:opacity-35 border border-white/10 text-xs font-medium text-slate-200 flex items-center gap-1.5 cursor-pointer"
              >
                <Redo2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Redo</span>
              </button>
              <span className="hidden md:inline text-xs font-mono-tabular text-slate-400 pl-2">
                {imgDims.w}×{imgDims.h}px · Full Res
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setSplitCompare((v) => !v);
                  setShowOriginal(false);
                }}
                className={`min-h-[38px] px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                  splitCompare
                    ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                    : 'bg-white/[0.05] border-white/10 text-slate-300 hover:text-white'
                }`}
              >
                <SplitSquareHorizontal className="w-3.5 h-3.5" />
                <span>Compare</span>
              </button>

              {!splitCompare && (
                <button
                  type="button"
                  onClick={() => setShowOriginal((v) => !v)}
                  className={`min-h-[38px] px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                    showOriginal
                      ? 'bg-amber-400/20 border-amber-400/50 text-amber-200'
                      : 'bg-white/[0.05] border-white/10 text-slate-300 hover:text-white'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{showOriginal ? 'Original' : 'Before'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleResetAll}
                className="min-h-[38px] px-3 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs font-medium text-slate-300 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* Canvas / Split Compare Surface */}
          <div
            className={`relative min-h-[290px] sm:min-h-[430px] max-h-[560px] rounded-xl border border-white/[0.06] overflow-hidden flex items-center justify-center p-2 ${
              draft.bgEnabled && draft.backdrop === 'transparent' ? 'bg-checkerboard' : 'bg-[#04060A]'
            }`}
          >
            {splitCompare ? (
              <div className="w-full h-[320px] sm:h-[440px]">
                <BeforeAfterSlider
                  beforeSrc={beforePreviewDataUrl}
                  afterSrc={afterPreviewDataUrl}
                  beforeLabel="Original"
                  afterLabel="Edited"
                />
              </div>
            ) : null}

            <canvas
              ref={previewCanvasRef}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              className={`max-w-full max-h-[520px] object-contain rounded-lg shadow-2xl ${
                splitCompare ? 'hidden' : 'block'
              } ${
                draft.textLayers.length > 0 || draft.stickers.length > 0 ? 'cursor-grab active:cursor-grabbing touch-none' : ''
              }`}
            />

            {!splitCompare && settings.showCanvasGrid && (
              <div className="absolute inset-4 pointer-events-none grid grid-cols-3 grid-rows-3 border border-white/10">
                {Array.from({ length: 9 }).map((_, idx) => (
                  <div key={idx} className="border border-white/[0.06]" />
                ))}
              </div>
            )}
          </div>

          {/* Save & Download JPG / PNG / WebP Bar */}
          <div className="space-y-2.5 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#060812] border border-white/[0.07] px-3 py-2">
              <span className="text-[11px] font-medium text-slate-300">
                HD Output Quality ({imgDims.w}×{imgDims.h}px Native)
              </span>
              <div className="flex items-center gap-1">
                {(
                  [
                    { id: 'original', label: 'Original' },
                    { id: 'high', label: 'High' },
                    { id: 'maximum', label: 'Max 100%' },
                    { id: 'custom', label: `Custom (${settings.exportQuality}%)` },
                  ] as const
                ).map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setHdQualityPreset(q.id)}
                    className={`min-h-[32px] px-2.5 rounded-lg border text-[11px] font-medium cursor-pointer transition-colors ${
                      hdQualityPreset === q.id
                        ? 'bg-amber-400/20 border-amber-400/65 text-amber-200 font-semibold'
                        : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleSave}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-xs sm:text-sm font-semibold text-white flex items-center gap-2 whitespace-nowrap cursor-pointer"
                >
                  {savedNotice ? <Check className="w-4 h-4 text-emerald-400" /> : <Save className="w-4 h-4 text-amber-300" />}
                  <span>{savedNotice ? 'Saved to IndexedDB' : 'Save Edit'}</span>
                </button>
                {autoSaveText && !savedNotice && (
                  <span className="text-[11px] font-mono-tabular text-emerald-300/90 hidden sm:inline">
                    {autoSaveText}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleExportFormat('jpg')}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-amber-400/35 text-xs font-semibold text-amber-200 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-amber-300" />
                  <span>JPG</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportFormat('webp')}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-violet-400/35 text-xs font-semibold text-violet-200 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-violet-300" />
                  <span>WebP</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportFormat('png')}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-amber-500 hover:brightness-110 text-xs font-semibold text-white flex items-center gap-1.5 shadow-[0_6px_24px_rgba(124,58,237,0.35)] whitespace-nowrap cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>PNG</span>
                </button>
                {onOpenExportCenter && (
                  <button
                    type="button"
                    onClick={onOpenExportCenter}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-[#060812] hover:bg-white/[0.08] border border-white/15 text-xs font-medium text-slate-200 cursor-pointer"
                  >
                    Export Center
                  </button>
                )}
              </div>
            </div>

            {exportNotice && !galleryResult && (
              <p className="text-xs text-emerald-300 font-mono-tabular">
                Exported {exportNotice}
              </p>
            )}
            {(saveError || (exportError && !galleryResult?.error)) && (
              <p className="text-xs text-rose-300">{saveError || exportError}</p>
            )}
            <GallerySaveBanner
              saving={gallerySaving}
              progressPct={galleryProgress}
              stageLabel={galleryStage}
              result={galleryResult}
              onSaveCopyAnyway={() =>
                handleExportFormat(lastFormatUsed, { triggerSource: 'manual', forceDuplicate: true })
              }
              onDismiss={() => setGalleryResult(null)}
            />
          </div>
        </div>

        {/* Control Deck Column */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          {/* Scrollable 8-Tool Tab Strip */}
          <div className="rounded-2xl bg-[#0B1020]/85 backdrop-blur-xl border border-white/10 p-2">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {deckTabs.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-all ${
                      active
                        ? 'bg-gradient-to-r from-violet-600/30 to-sky-500/25 border-sky-400/50 text-white'
                        : 'bg-[#060812] border-white/[0.06] text-slate-400 hover:text-white'
                    }`}
                  >
                    <span className={active ? 'text-amber-300' : 'text-slate-400'}>{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Deck Panel */}
          <div className="rounded-2xl bg-[#0B1020]/85 backdrop-blur-xl border border-white/10 p-4 space-y-4">
            {/* 1. TUNE: Brightness, Contrast, Saturation, Exposure, Highlights, Shadows, Temp, Tint */}
            {activeTab === 'tune' && (
              <div className="space-y-1">
                <SliderControl label="Brightness" value={draft.adj.brightness} min={-50} max={50} onChange={(v) => liveUpdateAdj('brightness', v)} />
                <SliderControl label="Contrast" value={draft.adj.contrast} min={-50} max={50} onChange={(v) => liveUpdateAdj('contrast', v)} />
                <SliderControl label="Saturation" value={draft.adj.saturation} min={-100} max={100} onChange={(v) => liveUpdateAdj('saturation', v)} />
                <SliderControl label="Exposure" value={draft.adj.exposure} min={-50} max={50} onChange={(v) => liveUpdateAdj('exposure', v)} />
                <SliderControl label="Highlights" value={draft.adj.highlights} min={-50} max={50} onChange={(v) => liveUpdateAdj('highlights', v)} />
                <SliderControl label="Shadows" value={draft.adj.shadows} min={-50} max={50} onChange={(v) => liveUpdateAdj('shadows', v)} />
                <SliderControl label="Temperature" value={draft.adj.temperature} min={-50} max={50} onChange={(v) => liveUpdateAdj('temperature', v)} />
                <SliderControl label="Tint" value={draft.adj.tint} min={-50} max={50} onChange={(v) => liveUpdateAdj('tint', v)} />
              </div>
            )}

            {/* 1B. RGB & HSL PRECISION ADJUSTMENT */}
            {activeTab === 'color' && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-amber-300">HSL Color Matrix</p>
                  <SliderControl label="Hue Shift" value={draft.adj.hueShift ?? 0} min={-180} max={180} defaultValue={0} unit="°" onChange={(v) => liveUpdateAdj('hueShift', v)} />
                  <SliderControl label="Saturation" value={draft.adj.saturation} min={-100} max={100} defaultValue={0} onChange={(v) => liveUpdateAdj('saturation', v)} />
                  <SliderControl label="Lightness" value={draft.adj.hslLightness ?? 0} min={-50} max={50} defaultValue={0} onChange={(v) => liveUpdateAdj('hslLightness', v)} />
                </div>

                <div className="space-y-1 pt-2 border-t border-white/[0.07]">
                  <p className="text-xs font-semibold text-violet-300">RGB Channel Mixer</p>
                  <SliderControl label="Red Channel" value={draft.adj.redShift ?? 0} min={-50} max={50} defaultValue={0} onChange={(v) => liveUpdateAdj('redShift', v)} />
                  <SliderControl label="Green Channel" value={draft.adj.greenShift ?? 0} min={-50} max={50} defaultValue={0} onChange={(v) => liveUpdateAdj('greenShift', v)} />
                  <SliderControl label="Blue Channel" value={draft.adj.blueShift ?? 0} min={-50} max={50} defaultValue={0} onChange={(v) => liveUpdateAdj('blueShift', v)} />
                </div>
              </div>
            )}

            {/* 2. 30 PROFESSIONAL PHOTO FILTERS WITH REAL-TIME UPLOADED PHOTO PREVIEWS */}
            {activeTab === 'filters' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white">30 Pro Filters</span>
                  <span className="text-[11px] font-mono-tabular text-amber-300">
                    {FILTER_PRESETS.find((f) => f.id === draft.adj.activeFilterId)?.name || 'Original'}
                  </span>
                </div>

                <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar">
                  {FILTER_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setFilterCategory(cat)}
                      className={`min-h-[34px] px-2.5 rounded-lg border text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                        filterCategory === cat
                          ? 'bg-violet-500/25 border-amber-400/50 text-white'
                          : 'bg-[#060812] border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-2 max-h-[290px] overflow-y-auto pr-1">
                  {filteredPresets.map((preset) => {
                    const active = draft.adj.activeFilterId === preset.id;
                    const thumbSrc = filterThumbs[preset.id];
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => updateAdj('activeFilterId', preset.id)}
                        className={`group text-left rounded-xl border overflow-hidden cursor-pointer transition-all ${
                          active
                            ? 'bg-amber-400/15 border-amber-400 shadow-[0_0_16px_rgba(212,175,55,0.28)]'
                            : 'bg-[#060812] border-white/10 hover:border-white/30'
                        }`}
                      >
                        <div className="aspect-[4/3] w-full bg-[#090B14] overflow-hidden relative">
                          {thumbSrc ? (
                            <img
                              src={thumbSrc}
                              alt={preset.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            />
                          ) : (
                            <div
                              className="w-full h-full opacity-40"
                              style={{ backgroundColor: preset.accentColor }}
                            />
                          )}
                        </div>
                        <div className="p-1.5">
                          <p className="text-[11px] font-semibold text-white truncate">{preset.name}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <SliderControl
                  label="Filter Intensity"
                  value={draft.adj.filterIntensity}
                  min={0}
                  max={100}
                  defaultValue={100}
                  unit="%"
                  onChange={(v) => liveUpdateAdj('filterIntensity', v)}
                />

                <div className="pt-2.5 border-t border-white/[0.08] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-amber-300">
                      Save Current Edit as Custom Preset
                    </span>
                    {onOpenPresetLibrary && (
                      <button
                        type="button"
                        onClick={onOpenPresetLibrary}
                        className="text-[11px] text-violet-300 hover:text-amber-300 cursor-pointer"
                      >
                        Open Library
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={libPresetName}
                      onChange={(e) => setLibPresetName(e.target.value)}
                      placeholder="Preset name..."
                      className="flex-1 min-w-0 min-h-[38px] px-2.5 rounded-lg bg-[#060812] border border-white/15 text-xs text-white placeholder:text-slate-500"
                    />
                    <select
                      value={libPresetCat}
                      onChange={(e) => setLibPresetCat(e.target.value as PresetCategory)}
                      className="min-h-[38px] px-2 rounded-lg bg-[#060812] border border-white/15 text-[11px] text-white"
                      aria-label="Custom preset category"
                    >
                      {PRESET_LIBRARY_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const merged = mergeFilterWithAdjustments(draft.adj);
                      await createCustomLibraryPreset({
                        name: libPresetName || `Photo Grade ${new Date().toLocaleTimeString()}`,
                        category: libPresetCat,
                        adjustments: merged,
                      });
                      setLibPresetName('');
                      setLibSavedNote(true);
                      window.setTimeout(() => setLibSavedNote(false), 2000);
                    }}
                    className="w-full min-h-[38px] rounded-lg bg-white/[0.07] hover:bg-amber-400/20 border border-amber-400/35 text-xs font-semibold text-amber-200 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {libSavedNote ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Save className="w-3.5 h-3.5" />}
                    <span>{libSavedNote ? 'Saved to Preset Library!' : 'Save to Custom Preset Library'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* 3. SIGNATURE EFFECTS ENGINE: HDR, COLOR POP, SEPIA, VINTAGE, GOLD, PURPLE DREAM, NEON, CYBERPUNK, B&W + OPTICS */}
            {activeTab === 'fx' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-amber-300">Signature Creative Effects</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'obsidian-gold', label: 'Cinema Gold' },
                      { id: 'velvet-violet', label: 'Purple Dream' },
                      { id: 'cyber-magenta', label: 'Cyberpunk' },
                      { id: 'electric-navy', label: 'Neon Glow' },
                      { id: 'kodak-warmth', label: 'Vintage' },
                      { id: 'leica-noir', label: 'B & W' },
                      { id: 'sepia-archive', label: 'Sepia' },
                      { id: 'blockbuster-70', label: 'HDR Style' },
                      { id: 'monaco-sun', label: 'Color Pop' },
                    ].map((fx) => {
                      const active = draft.adj.activeFilterId === fx.id;
                      return (
                        <button
                          key={fx.id}
                          type="button"
                          onClick={() => applyEffectPreset(fx.id)}
                          className={`min-h-[38px] px-2 rounded-xl border text-[11px] font-semibold truncate cursor-pointer transition-all ${
                            active
                              ? 'bg-gradient-to-r from-violet-600/35 to-amber-500/25 border-amber-400 text-white'
                              : 'bg-[#060812] border-white/10 text-slate-300 hover:text-white hover:border-white/25'
                          }`}
                        >
                          {fx.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1 pt-2 border-t border-white/[0.07]">
                  <p className="text-xs font-semibold text-violet-300">Effect &amp; Optics Sliders</p>
                  <SliderControl label="HDR Effect" value={draft.adj.hdr ?? 0} min={0} max={100} unit="%" onChange={(v) => liveUpdateAdj('hdr', v)} />
                  <SliderControl label="Color Pop" value={draft.adj.colorPop ?? 0} min={0} max={100} unit="%" onChange={(v) => liveUpdateAdj('colorPop', v)} />
                  <SliderControl label="Sepia Tone" value={draft.adj.sepia ?? 0} min={0} max={100} unit="%" onChange={(v) => liveUpdateAdj('sepia', v)} />
                  <SliderControl label="Vignette" value={draft.adj.vignette} min={0} max={100} onChange={(v) => liveUpdateAdj('vignette', v)} />
                  <SliderControl label="Film Grain" value={draft.adj.grain} min={0} max={60} onChange={(v) => liveUpdateAdj('grain', v)} />
                  <SliderControl label="Sharpen" value={draft.adj.sharpness} min={0} max={100} onChange={(v) => liveUpdateAdj('sharpness', v)} />
                  <SliderControl label="Blur" value={draft.adj.blur} min={0} max={25} unit="px" onChange={(v) => liveUpdateAdj('blur', v)} />
                  <SliderControl label="Optical Bloom" value={draft.adj.bloom} min={0} max={60} onChange={(v) => liveUpdateAdj('bloom', v)} />
                </div>
              </div>
            )}

            {/* 4. CROP & ROTATE */}
            {activeTab === 'crop' && (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-slate-300 mb-2">Crop Aspect Ratio</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {aspects.map((ratio) => (
                      <button
                        key={ratio}
                        type="button"
                        onClick={() => updateAdj('cropAspect', ratio)}
                        className={`min-h-[40px] rounded-xl border text-xs font-mono-tabular cursor-pointer ${
                          draft.adj.cropAspect === ratio
                            ? 'bg-sky-500/20 border-sky-400 text-white font-semibold'
                            : 'bg-[#060812] border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        {ratio === 'original' ? 'Original' : ratio}
                      </button>
                    ))}
                  </div>
                </div>

                <SliderControl
                  label="Straighten Angle"
                  value={draft.adj.fineRotation}
                  min={-45}
                  max={45}
                  unit="°"
                  onChange={(v) => updateAdj('fineRotation', v)}
                />

                <div>
                  <p className="text-xs font-medium text-slate-300 mb-2">Rotate &amp; Mirror</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => updateAdj('rotation', (draft.adj.rotation + 270) % 360)}
                      className="min-h-[42px] rounded-xl bg-[#060812] hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-sky-300" />
                      <span>Rotate -90°</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateAdj('rotation', (draft.adj.rotation + 90) % 360)}
                      className="min-h-[42px] rounded-xl bg-[#060812] hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <RotateCw className="w-3.5 h-3.5 text-sky-300" />
                      <span>Rotate +90°</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateAdj('flipH', !draft.adj.flipH)}
                      className={`min-h-[42px] rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
                        draft.adj.flipH
                          ? 'bg-violet-500/20 border-violet-400/50 text-white'
                          : 'bg-[#060812] border-white/10 text-slate-200 hover:bg-white/10'
                      }`}
                    >
                      <FlipHorizontal className="w-3.5 h-3.5" />
                      <span>Flip Horizontal</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateAdj('flipV', !draft.adj.flipV)}
                      className={`min-h-[42px] rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
                        draft.adj.flipV
                          ? 'bg-violet-500/20 border-violet-400/50 text-white'
                          : 'bg-[#060812] border-white/10 text-slate-200 hover:bg-white/10'
                      }`}
                    >
                      <FlipVertical className="w-3.5 h-3.5" />
                      <span>Flip Vertical</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 5. AI PHOTO ENHANCEMENT & PROMPT COLOR DIRECTOR */}
            {activeTab === 'ai' && (
              <div className="space-y-3">
                <button
                  type="button"
                  disabled={aiLoading}
                  onClick={runAiEnhance}
                  className="w-full min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-amber-500 via-violet-600 to-sky-500 hover:brightness-110 disabled:opacity-50 text-xs sm:text-sm font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className={`w-4 h-4 ${aiLoading ? 'animate-spin' : ''}`} />
                  <span>{aiLoading ? 'Enhancing...' : 'One-Tap AI Photo Enhance'}</span>
                </button>

                <div className="pt-2 border-t border-white/[0.07] space-y-2">
                  <p className="text-xs font-medium text-slate-300">AI Style &amp; Color Prompt</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !aiLoading) runAiGrade();
                      }}
                      placeholder="e.g. warm golden cinema mood..."
                      className="flex-1 min-w-0 min-h-[44px] px-3 py-2 rounded-xl bg-[#060812] border border-white/10 focus:border-sky-400/60 outline-none text-xs text-white placeholder:text-slate-500"
                    />
                    <button
                      type="button"
                      disabled={aiLoading}
                      onClick={() => runAiGrade()}
                      className="min-h-[44px] px-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
                    >
                      Apply
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {AI_QUICK_PROMPTS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      disabled={aiLoading}
                      onClick={() => {
                        setAiPrompt(preset.prompt);
                        runAiGrade(preset.prompt);
                      }}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-violet-500/20 border border-white/10 text-[11px] font-medium text-slate-200 cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {aiNote && (
                  <p className="text-xs text-sky-200 bg-sky-500/10 border border-sky-400/20 rounded-xl px-3 py-2">
                    {aiNote}
                  </p>
                )}
                {aiError && (
                  <div className="flex items-start gap-2 text-xs text-rose-200 bg-rose-500/10 border border-rose-400/25 rounded-xl px-3 py-2">
                    <AlertCircle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
                    <span>{aiError}</span>
                  </div>
                )}
              </div>
            )}

            {/* 6. BACKGROUND REMOVAL INTERFACE */}
            {activeTab === 'bg' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white">Background Cutout</span>
                  <button
                    type="button"
                    onClick={() => commitSnapshot({ ...draft, bgEnabled: !draft.bgEnabled })}
                    className={`min-h-[34px] px-3 rounded-lg border text-xs font-mono-tabular cursor-pointer ${
                      draft.bgEnabled
                        ? 'bg-amber-400/20 border-amber-400/60 text-amber-200 font-semibold'
                        : 'bg-[#060812] border-white/10 text-slate-400'
                    }`}
                  >
                    {draft.bgEnabled ? 'ACTIVE' : 'OFF'}
                  </button>
                </div>

                <button
                  type="button"
                  disabled={aiLoading}
                  onClick={runAiBgRemove}
                  className="w-full min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-violet-600 to-sky-500 hover:brightness-110 disabled:opacity-50 text-xs sm:text-sm font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Scissors className={`w-4 h-4 ${aiLoading ? 'animate-spin' : ''}`} />
                  <span>{aiLoading ? 'Isolating Subject...' : 'AI Remove Background'}</span>
                </button>

                {draft.bgEnabled && (
                  <>
                    <SliderControl
                      label="Edge Tolerance"
                      value={draft.segment.threshold}
                      min={10}
                      max={75}
                      defaultValue={34}
                      onChange={(v) =>
                        commitSnapshot({
                          ...draft,
                          segment: { ...draft.segment, threshold: v },
                        })
                      }
                    />
                    <SliderControl
                      label="Edge Feather"
                      value={draft.segment.feather}
                      min={0}
                      max={5}
                      defaultValue={2}
                      unit="px"
                      onChange={(v) =>
                        commitSnapshot({
                          ...draft,
                          segment: { ...draft.segment, feather: v },
                        })
                      }
                    />

                    <div>
                      <p className="text-xs font-medium text-slate-300 mb-2">Studio Backdrop</p>
                      <div className="grid grid-cols-3 gap-2">
                        {BACKDROP_OPTIONS.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => commitSnapshot({ ...draft, backdrop: b.id })}
                            className={`min-h-[40px] p-2 rounded-xl border flex items-center gap-1.5 cursor-pointer ${
                              draft.backdrop === b.id
                                ? 'bg-white/10 border-amber-400/60 text-white'
                                : 'bg-[#060812] border-white/10 text-slate-400'
                            }`}
                          >
                            <span className={`w-3.5 h-3.5 rounded shrink-0 border border-white/20 ${b.swatch}`} />
                            <span className="text-[11px] truncate">{b.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {aiError && (
                  <div className="flex items-start gap-2 text-xs text-rose-200 bg-rose-500/10 border border-rose-400/25 rounded-xl px-3 py-2">
                    <AlertCircle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
                    <span>{aiError}</span>
                  </div>
                )}
              </div>
            )}

            {/* 7. PROFESSIONAL TEXT EDITOR */}
            {activeTab === 'text' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white">
                    Text Layers ({draft.textLayers.length})
                  </span>
                  <button
                    type="button"
                    onClick={addTextLayer}
                    className="min-h-[36px] px-3 rounded-lg bg-violet-600/30 hover:bg-violet-600/45 border border-violet-400/40 text-xs font-semibold text-white flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Text</span>
                  </button>
                </div>

                {draft.textLayers.length > 0 && (
                  <div className="space-y-1.5 max-h-[110px] overflow-y-auto">
                    {draft.textLayers.map((l) => (
                      <div
                        key={l.id}
                        onClick={() => setSelectedTextId(l.id)}
                        className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl border cursor-pointer ${
                          activeTextLayer?.id === l.id
                            ? 'bg-white/10 border-amber-400/60 text-white'
                            : 'bg-[#060812] border-white/10 text-slate-300'
                        }`}
                      >
                        <span className="text-xs truncate">{l.text || 'Empty text'}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeTextLayer(l.id);
                          }}
                          className="p-1 text-slate-400 hover:text-rose-300 cursor-pointer"
                          aria-label="Remove text layer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {activeTextLayer ? (
                  <div className="space-y-3 pt-2 border-t border-white/[0.07]">
                    <textarea
                      rows={2}
                      value={activeTextLayer.text}
                      onChange={(e) => updateTextLayer('text', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#060812] border border-white/10 focus:border-sky-400/60 outline-none text-xs text-white"
                    />

                    <div className="grid grid-cols-2 gap-1.5">
                      {STUDIO_FONTS.map((font) => (
                        <button
                          key={font.id}
                          type="button"
                          onClick={() => updateTextLayer('fontFamily', font.family)}
                          className={`min-h-[38px] px-2.5 rounded-xl border text-left cursor-pointer ${
                            activeTextLayer.fontFamily === font.family
                              ? 'bg-sky-500/20 border-sky-400 text-white'
                              : 'bg-[#060812] border-white/10 text-slate-300'
                          }`}
                        >
                          <span className="text-xs truncate block" style={{ fontFamily: font.family }}>
                            {font.label}
                          </span>
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {COLOR_SWATCHES.map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            onClick={() => updateTextLayer('color', hex)}
                            className={`w-6 h-6 rounded-full border cursor-pointer ${
                              activeTextLayer.color === hex ? 'border-white scale-110' : 'border-white/20'
                            }`}
                            style={{ backgroundColor: hex }}
                            aria-label={`Text color ${hex}`}
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-1">
                        {(['left', 'center', 'right'] as const).map((al) => (
                          <button
                            key={al}
                            type="button"
                            onClick={() => updateTextLayer('align', al)}
                            className={`p-1.5 rounded-lg border cursor-pointer ${
                              activeTextLayer.align === al
                                ? 'bg-white/15 border-white/30 text-white'
                                : 'bg-[#060812] border-white/10 text-slate-400'
                            }`}
                          >
                            {al === 'left' ? (
                              <AlignLeft className="w-3.5 h-3.5" />
                            ) : al === 'center' ? (
                              <AlignCenter className="w-3.5 h-3.5" />
                            ) : (
                              <AlignRight className="w-3.5 h-3.5" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    <SliderControl label="Font Size" value={activeTextLayer.fontSize} min={18} max={150} defaultValue={68} unit="px" onChange={(v) => updateTextLayer('fontSize', v)} />
                    <SliderControl label="Letter Spacing" value={activeTextLayer.letterSpacing} min={-4} max={24} defaultValue={3} unit="px" onChange={(v) => updateTextLayer('letterSpacing', v)} />
                    <SliderControl label="Rotation" value={activeTextLayer.rotation} min={-45} max={45} defaultValue={0} unit="°" onChange={(v) => updateTextLayer('rotation', v)} />
                    <SliderControl label="Outline Stroke" value={activeTextLayer.strokeWidth} min={0} max={8} defaultValue={0} unit="px" onChange={(v) => updateTextLayer('strokeWidth', v)} />
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    Tap Add Text to place stylish editorial typography on your photo, then drag it directly on the canvas.
                  </p>
                )}
              </div>
            )}

            {/* 8. STICKERS & OVERLAYS */}
            {activeTab === 'stickers' && (
              <div className="space-y-4">
                {/* Optical Overlays */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-white">Light &amp; Frame Overlays</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {STUDIO_OVERLAYS.map((ov) => (
                      <button
                        key={ov.id}
                        type="button"
                        onClick={() => updateAdj('overlayId', ov.id)}
                        className={`min-h-[42px] p-2 rounded-xl border text-left flex items-center gap-1.5 cursor-pointer ${
                          draft.adj.overlayId === ov.id
                            ? 'bg-white/10 border-amber-400/60 text-white'
                            : 'bg-[#060812] border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 rounded shrink-0 border border-white/20 ${ov.swatch}`} />
                        <span className="text-[11px] truncate">{ov.label}</span>
                      </button>
                    ))}
                  </div>
                  {draft.adj.overlayId !== 'none' && (
                    <SliderControl
                      label="Overlay Opacity"
                      value={draft.adj.overlayOpacity}
                      min={10}
                      max={100}
                      defaultValue={55}
                      unit="%"
                      onChange={(v) => updateAdj('overlayOpacity', v)}
                    />
                  )}
                </div>

                {/* Graphic Stickers */}
                <div className="space-y-2 pt-2 border-t border-white/[0.07]">
                  <p className="text-xs font-semibold text-white">Tap to Add Sticker</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {STUDIO_STICKERS.map((st) => (
                      <button
                        key={st.kind}
                        type="button"
                        onClick={() => addSticker(st.kind, st.label, st.defaultColor)}
                        className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-[#060812] hover:bg-white/10 border border-white/10 text-[11px] font-medium text-slate-200 flex items-center gap-1.5 cursor-pointer"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: st.defaultColor }}
                        />
                        <span className="truncate">{st.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {draft.stickers.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-white/[0.07]">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-300">
                        Active Stickers ({draft.stickers.length})
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-[100px] overflow-y-auto">
                      {draft.stickers.map((s) => (
                        <div
                          key={s.id}
                          onClick={() => setSelectedStickerId(s.id)}
                          className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl border cursor-pointer ${
                            activeSticker?.id === s.id
                              ? 'bg-white/10 border-sky-400/60 text-white'
                              : 'bg-[#060812] border-white/10 text-slate-300'
                          }`}
                        >
                          <span className="text-xs truncate">{s.label}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeSticker(s.id);
                            }}
                            className="p-1 text-slate-400 hover:text-rose-300 cursor-pointer"
                            aria-label="Delete sticker"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {activeSticker && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 py-1">
                          {COLOR_SWATCHES.map((hex) => (
                            <button
                              key={hex}
                              type="button"
                              onClick={() => updateSticker('color', hex)}
                              className={`w-6 h-6 rounded-full border cursor-pointer ${
                                activeSticker.color === hex ? 'border-white scale-110' : 'border-white/20'
                              }`}
                              style={{ backgroundColor: hex }}
                              aria-label={`Sticker color ${hex}`}
                            />
                          ))}
                        </div>
                        <SliderControl label="Sticker Size" value={activeSticker.size} min={40} max={320} defaultValue={120} unit="px" onChange={(v) => updateSticker('size', v)} />
                        <SliderControl label="Sticker Rotation" value={activeSticker.rotation} min={-180} max={180} defaultValue={0} unit="°" onChange={(v) => updateSticker('rotation', v)} />
                        <SliderControl label="Sticker Opacity" value={activeSticker.opacity} min={15} max={100} defaultValue={95} unit="%" onChange={(v) => updateSticker('opacity', v)} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
