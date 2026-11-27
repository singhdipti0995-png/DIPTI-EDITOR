import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Box,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  Film,
  Layers,
  LayoutTemplate,
  Lock,
  Move,
  Palette,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Shapes,
  Sparkles,
  Trash2,
  Type as TypeIcon,
  Undo2,
  Unlock,
  Upload,
  AlertCircle,
} from 'lucide-react';
import { AppSettings, ExportRecord, OverlayId, ProjectItem, StickerKind } from '../../types/editor';
import {
  DesignBackgroundMode,
  DesignCanvasCategory,
  DesignElementLayer,
  DesignLayer,
  DesignShapeKind,
  DesignTextLayer,
  TextAnimPreset,
  TextStyleEffect,
  TypographyDesignDoc,
} from '../../types/typography';
import { STUDIO_ASSETS, STUDIO_FONTS, STUDIO_OVERLAYS, STUDIO_STICKERS } from '../../data/studioCatalog';
import {
  BACKGROUND_GRADIENT_PRESETS,
  CANVAS_ASPECT_OPTIONS,
  cloneTypographyDoc,
  createTextLayerDefaults,
  DESIGN_SHAPES,
  DESIGN_TEMPLATES,
  TEXT_ANIMATION_PRESETS,
  TEXT_GRADIENT_PRESETS,
} from '../../data/typographyCatalog';
import { SliderControl } from '../SliderControl';
import { createThumbnailDataUrl, loadImageElement } from '../../utils/canvasEngine';
import { downloadExportedBlob, encodeCanvasToBlob } from '../../utils/exportEngine';
import { releaseCanvasMemory } from '../../utils/hdQualityEngine';
import {
  GallerySaveResult,
  exportCanvasViaGallery,
  saveMediaToGallery,
} from '../../utils/gallerySaveEngine';
import { GallerySaveBanner } from '../GallerySaveBanner';
import { hitTestDesignCanvas, renderTypographyDocument } from '../../utils/typographyEngine';
import { detectVideoExportCapabilities } from '../../utils/videoEngine';

interface DesignBrandStudioProps {
  settings: AppSettings;
  initialDoc?: TypographyDesignDoc;
  onSaveProject: (project: ProjectItem) => Promise<boolean> | void;
  onRecordExport?: (record: ExportRecord) => void;
}

type StudioInspectorTab = 'text' | 'effects' | 'motion' | 'layers' | 'templates' | 'backdrop';

const ANIM_CYCLE_SEC = 3.4;

export const DesignBrandStudio: React.FC<DesignBrandStudioProps> = ({
  settings,
  initialDoc,
  onSaveProject,
  onRecordExport,
}) => {
  const initialDocument = useMemo(
    () => cloneTypographyDoc(initialDoc ?? DESIGN_TEMPLATES[0].doc),
    [initialDoc]
  );

  const [doc, setDoc] = useState<TypographyDesignDoc>(initialDocument);
  const [history, setHistory] = useState<TypographyDesignDoc[]>([initialDocument]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(
    initialDocument.layers[initialDocument.layers.length - 1]?.id ?? null
  );
  const [activeTab, setActiveTab] = useState<StudioInspectorTab>('text');
  const [templateFilter, setTemplateFilter] = useState<'all' | Exclude<DesignCanvasCategory, 'custom'>>('all');

  // Playback & animation controls
  const [animPlaying, setAnimPlaying] = useState(false);
  const [animTime, setAnimTime] = useState(ANIM_CYCLE_SEC);
  const animTimeRef = useRef(ANIM_CYCLE_SEC);
  const animPlayingRef = useRef(false);

  // Canvas interaction state
  const [snapGuides, setSnapGuides] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
  const dragStateRef = useRef<{
    layerId: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  // Background image & export state
  const [bgLoadedTick, setBgLoadedTick] = useState(0);
  const [fontsLoadedTick, setFontsLoadedTick] = useState(0);
  const [savedNotice, setSavedNotice] = useState(false);
  const [isExportingVideo, setIsExportingVideo] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [gallerySaving, setGallerySaving] = useState(false);
  const [galleryProgress, setGalleryProgress] = useState(0);
  const [galleryStage, setGalleryStage] = useState<string | null>(null);
  const [galleryResult, setGalleryResult] = useState<GallerySaveResult | null>(null);
  const [lastExportMode, setLastExportMode] = useState<'alpha' | 'full' | 'video'>('full');
  const lastMotionVideoRef = useRef<{
    blob: Blob;
    mimeType: string;
    fileName: string;
    ext: 'mp4' | 'webm';
    width: number;
    height: number;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const bgFileInputRef = useRef<HTMLInputElement>(null);
  const docRef = useRef(doc);
  const selectedIdRef = useRef(selectedLayerId);
  const liveDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  useEffect(() => {
    selectedIdRef.current = selectedLayerId;
  }, [selectedLayerId]);

  useEffect(() => {
    animPlayingRef.current = animPlaying;
  }, [animPlaying]);

  // Sync external initialDoc if reopened from My Projects
  useEffect(() => {
    if (!initialDoc) return;
    const cloned = cloneTypographyDoc(initialDoc);
    setDoc(cloned);
    setHistory([cloned]);
    setHistoryIndex(0);
    setSelectedLayerId(cloned.layers[cloned.layers.length - 1]?.id ?? null);
  }, [initialDoc]);

  // Re-render once Google Fonts finish loading
  useEffect(() => {
    if (typeof document !== 'undefined' && 'fonts' in document) {
      document.fonts.ready.then(() => setFontsLoadedTick((t) => t + 1)).catch(() => {});
    }
  }, []);

  // Load photo background when selected
  useEffect(() => {
    if (doc.background.mode !== 'photo' || !doc.background.photoUrl) {
      bgImgRef.current = null;
      return;
    }
    let cancelled = false;
    loadImageElement(doc.background.photoUrl)
      .then((img) => {
        if (!cancelled) {
          bgImgRef.current = img;
          setBgLoadedTick((v) => v + 1);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [doc.background.mode, doc.background.photoUrl]);

  // Commit state into 40-step Undo/Redo history
  const commitDoc = useCallback(
    (nextDoc: TypographyDesignDoc) => {
      const snapshot = cloneTypographyDoc(nextDoc);
      setDoc(snapshot);
      setHistory((prev) => {
        const sliced = prev.slice(0, historyIndex + 1);
        return [...sliced, snapshot].slice(-40);
      });
      setHistoryIndex((prev) => Math.min(39, prev + 1));
    },
    [historyIndex]
  );

  // Live debounced commit for sliders & drag gestures
  const liveCommitDoc = useCallback(
    (nextDoc: TypographyDesignDoc) => {
      setDoc(nextDoc);
      if (liveDebounceRef.current) window.clearTimeout(liveDebounceRef.current);
      liveDebounceRef.current = window.setTimeout(() => {
        const snapshot = cloneTypographyDoc(nextDoc);
        setHistory((prev) => {
          const sliced = prev.slice(0, historyIndex + 1);
          return [...sliced, snapshot].slice(-40);
        });
        setHistoryIndex((prev) => Math.min(39, prev + 1));
      }, 260);
    },
    [historyIndex]
  );

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    const idx = historyIndex - 1;
    setHistoryIndex(idx);
    setDoc(cloneTypographyDoc(history[idx]));
  }, [canUndo, history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    const idx = historyIndex + 1;
    setHistoryIndex(idx);
    setDoc(cloneTypographyDoc(history[idx]));
  }, [canRedo, history, historyIndex]);

  // Keyboard Undo / Redo shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  // Canvas rendering & animation loop
  useEffect(() => {
    let rafId: number;
    let last = performance.now();

    const drawFrame = (now: number) => {
      const dt = Math.min(0.08, (now - last) / 1000);
      last = now;

      if (animPlayingRef.current) {
        animTimeRef.current = (animTimeRef.current + dt) % ANIM_CYCLE_SEC;
        setAnimTime(animTimeRef.current);
      }

      if (canvasRef.current && !isExportingVideo) {
        renderTypographyDocument(canvasRef.current, docRef.current, {
          timeSec: animTimeRef.current,
          animate: animPlayingRef.current || animTimeRef.current < ANIM_CYCLE_SEC - 0.05,
          selectedLayerId: selectedIdRef.current,
          showGuides: true,
          snapCenterX: snapGuides.x,
          snapCenterY: snapGuides.y,
          bgImage: bgImgRef.current,
        });
      }

      if (animPlayingRef.current) {
        rafId = requestAnimationFrame(drawFrame);
      }
    };

    rafId = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(rafId);
  }, [doc, selectedLayerId, animPlaying, animTime, snapGuides, bgLoadedTick, fontsLoadedTick, isExportingVideo]);

  const selectedLayer = useMemo(
    () => doc.layers.find((l) => l.id === selectedLayerId) ?? null,
    [doc.layers, selectedLayerId]
  );

  const selectedTextLayer: DesignTextLayer | null =
    selectedLayer && selectedLayer.kind === 'text' ? selectedLayer : null;

  const selectedElementLayer: DesignElementLayer | null =
    selectedLayer && selectedLayer.kind !== 'text' ? selectedLayer : null;

  // Helpers to update the active layer
  const updateLayerById = (
    id: string,
    updater: (layer: DesignLayer) => DesignLayer,
    live = false
  ) => {
    const next: TypographyDesignDoc = {
      ...docRef.current,
      layers: docRef.current.layers.map((l) => (l.id === id ? updater(l) : l)),
    };
    if (live) liveCommitDoc(next);
    else commitDoc(next);
  };

  const updateSelectedText = (patch: Partial<DesignTextLayer>, live = false) => {
    if (!selectedTextLayer) return;
    updateLayerById(
      selectedTextLayer.id,
      (l) => (l.kind === 'text' ? { ...l, ...patch } : l),
      live
    );
  };

  const updateSelectedElement = (patch: Partial<DesignElementLayer>, live = false) => {
    if (!selectedElementLayer) return;
    updateLayerById(
      selectedElementLayer.id,
      (l) => (l.kind !== 'text' ? { ...l, ...patch } : l),
      live
    );
  };

  // Add Text, Subtitle, Sticker, Shape
  const handleAddTextLayer = (role: 'headline' | 'subtitle' | 'badge') => {
    const count = doc.layers.filter((l) => l.kind === 'text').length + 1;
    const layer =
      role === 'subtitle'
        ? createTextLayerDefaults({
            role: 'subtitle',
            name: `Subtitle ${count}`,
            text: 'Cinematic Subtitle Caption',
            y: 0.78,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: 34,
            fontWeight: 600,
            effect: 'solid',
            color: '#F8FAFC',
            uppercase: false,
            letterSpacing: 1,
            subtitleBgEnabled: true,
            subtitleBgColor: '#06070B',
            subtitleBgOpacity: 82,
            animation: 'slide-up',
          })
        : createTextLayerDefaults({
            role,
            name: role === 'badge' ? `Badge ${count}` : `Headline ${count}`,
            text: role === 'badge' ? 'LIMITED EDITION' : 'NEW TITLE',
            y: role === 'badge' ? 0.2 : 0.48,
            fontSize: role === 'badge' ? 28 : 84,
            effect: role === 'badge' ? 'solid' : 'metallic-gold',
            color: role === 'badge' ? '#FBBF24' : '#F8FAFC',
            animation: 'fade',
          });
    commitDoc({ ...doc, layers: [...doc.layers, layer] });
    setSelectedLayerId(layer.id);
    setActiveTab('text');
  };

  const handleAddSticker = (kind: StickerKind, label: string, defaultColor: string) => {
    const el: DesignElementLayer = {
      id: `stk-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      kind: 'sticker',
      name: label,
      stickerKind: kind,
      x: 0.5,
      y: 0.35,
      width: 140,
      height: 140,
      rotation: 0,
      opacity: 96,
      color: defaultColor,
      strokeWidth: 4,
      filled: true,
      glowBlur: 12,
      visible: true,
      locked: false,
    };
    commitDoc({ ...doc, layers: [...doc.layers, el] });
    setSelectedLayerId(el.id);
    setActiveTab('backdrop');
  };

  const handleAddShape = (shapeKind: DesignShapeKind, label: string) => {
    const isLine = shapeKind === 'accent-line';
    const isCorner = shapeKind === 'corner-frame';
    const el: DesignElementLayer = {
      id: `shp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      kind: 'shape',
      name: label,
      shapeKind,
      x: 0.5,
      y: 0.5,
      width: isCorner ? 780 : isLine ? 360 : 280,
      height: isCorner ? 780 : isLine ? 6 : shapeKind === 'pill-box' ? 88 : 220,
      rotation: shapeKind === 'diagonal-bar' ? -12 : 0,
      opacity: 88,
      color: shapeKind === 'pill-box' || shapeKind === 'diagonal-bar' ? '#7C3AED' : '#D4AF37',
      strokeWidth: 5,
      filled: shapeKind === 'rect' || shapeKind === 'pill-box' || shapeKind === 'accent-line' || shapeKind === 'diagonal-bar',
      glowBlur: 10,
      visible: true,
      locked: false,
    };
    commitDoc({ ...doc, layers: [...doc.layers, el] });
    setSelectedLayerId(el.id);
    setActiveTab('backdrop');
  };

  // Layer ordering & management
  const moveLayerOrder = (id: string, dir: -1 | 1) => {
    const idx = doc.layers.findIndex((l) => l.id === id);
    if (idx < 0) return;
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= doc.layers.length) return;
    const next = [...doc.layers];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    commitDoc({ ...doc, layers: next });
  };

  const duplicateLayer = (id: string) => {
    const idx = doc.layers.findIndex((l) => l.id === id);
    if (idx < 0) return;
    const orig = doc.layers[idx];
    const copy: DesignLayer = {
      ...JSON.parse(JSON.stringify(orig)),
      id: `copy-${Date.now()}`,
      name: `${orig.name} Copy`,
      x: Math.min(0.88, orig.x + 0.04),
      y: Math.min(0.88, orig.y + 0.04),
    };
    const next = [...doc.layers.slice(0, idx + 1), copy, ...doc.layers.slice(idx + 1)];
    commitDoc({ ...doc, layers: next });
    setSelectedLayerId(copy.id);
  };

  const deleteLayer = (id: string) => {
    const next = doc.layers.filter((l) => l.id !== id);
    commitDoc({ ...doc, layers: next });
    if (selectedLayerId === id) {
      setSelectedLayerId(next[next.length - 1]?.id ?? null);
    }
  };

  // Pointer drag-and-drop on canvas (mobile touch + desktop mouse)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;

    const hit = hitTestDesignCanvas(doc, nx, ny);
    if (hit) {
      setSelectedLayerId(hit.id);
      if (hit.kind === 'text' && activeTab === 'backdrop') setActiveTab('text');
      if (hit.kind !== 'text' && (activeTab === 'text' || activeTab === 'effects')) setActiveTab('backdrop');
      dragStateRef.current = {
        layerId: hit.id,
        offsetX: hit.x - nx,
        offsetY: hit.y - ny,
      };
      canvas.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragStateRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    let nx = Math.max(0.04, Math.min(0.96, (e.clientX - rect.left) / rect.width + drag.offsetX));
    let ny = Math.max(0.04, Math.min(0.96, (e.clientY - rect.top) / rect.height + drag.offsetY));

    const snapX = Math.abs(nx - 0.5) < 0.018;
    const snapY = Math.abs(ny - 0.5) < 0.018;
    if (snapX) nx = 0.5;
    if (snapY) ny = 0.5;
    setSnapGuides({ x: snapX, y: snapY });

    updateLayerById(
      drag.layerId,
      (l) => ({ ...l, x: Number(nx.toFixed(3)), y: Number(ny.toFixed(3)) }),
      true
    );
  };

  const handlePointerUp = () => {
    dragStateRef.current = null;
    setSnapGuides({ x: false, y: false });
  };

  // Upload custom background image from Android gallery
  const handleUploadBgPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        commitDoc({
          ...doc,
          background: {
            ...doc.background,
            mode: 'photo',
            photoUrl: reader.result,
          },
        });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // True Exports: Transparent PNG (alpha-only layers), Full PNG, and Motion Video
  const exportRenderedCanvas = async (
    transparentOnly: boolean,
    baseFileName: string,
    forceDuplicate = false,
    triggerSource: 'save' | 'export' | 'manual' = 'export'
  ) => {
    setExportError(null);
    setLastExportMode(transparentOnly ? 'alpha' : 'full');
    setGallerySaving(true);
    setGalleryProgress(12);
    setGalleryStage('Rendering typography canvas...');
    setGalleryResult(null);
    const out = document.createElement('canvas');

    try {
      renderTypographyDocument(out, doc, {
        timeSec: animTime,
        animate: animTime < ANIM_CYCLE_SEC - 0.05,
        showGuides: false,
        transparentExport: transparentOnly ? true : doc.background.mode === 'transparent',
        bgImage: transparentOnly ? undefined : bgImgRef.current,
      });

      if (!settings.autoSaveToGallery && triggerSource === 'export') {
        const { blob } = await encodeCanvasToBlob(out, 'png', 100);
        const fileName = `${baseFileName}.png`;
        downloadExportedBlob(blob, fileName);
        onRecordExport?.({
          id: `exp-type-${Date.now()}`,
          fileName,
          mediaType: 'image',
          format: 'png',
          resolutionLabel: `${out.width}×${out.height}`,
          width: out.width,
          height: out.height,
          quality: 100,
          fileSizeBytes: blob.size,
          status: 'completed',
          galleryDelivery: 'skipped-disabled',
          galleryLocationLabel: 'Manual Browser Download (Auto-Save OFF)',
          createdAt: new Date().toISOString(),
        });
        setExportStatus(
          transparentOnly
            ? 'Exported Transparent PNG (alpha background removed).'
            : `Exported ${doc.width}×${doc.height} PNG.`
        );
        setTimeout(() => setExportStatus(null), 2600);
        return;
      }

      const gRes = await exportCanvasViaGallery({
        canvas: out,
        baseFileName,
        format: 'png',
        qualityPercent: 100,
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
        setExportStatus(
          transparentOnly
            ? `Saved Transparent PNG to ${gRes.albumName}.`
            : `Saved ${doc.width}×${doc.height} PNG to ${gRes.albumName}.`
        );
        setTimeout(() => setExportStatus(null), 3000);
      } else if (gRes.error) {
        setExportError(gRes.error);
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Unable to export PNG.');
    } finally {
      releaseCanvasMemory(out);
      setGallerySaving(false);
    }
  };

  const handleExportTransparentPng = (forceDuplicate = false) =>
    exportRenderedCanvas(true, `dipti-typography-alpha-${Date.now()}`, forceDuplicate, 'export');

  const handleExportFullPng = (
    forceDuplicate = false,
    triggerSource: 'save' | 'export' | 'manual' = 'export'
  ) =>
    exportRenderedCanvas(
      false,
      `dipti-design-${doc.category}-${Date.now()}`,
      forceDuplicate,
      triggerSource
    );

  const handleExportMotionVideo = async (forceDuplicate = false) => {
    setExportError(null);
    setLastExportMode('video');

    if (forceDuplicate && lastMotionVideoRef.current) {
      const prev = lastMotionVideoRef.current;
      setGallerySaving(true);
      setGalleryProgress(45);
      setGalleryStage(`Saving copy to ${settings.galleryAlbumName || 'DIPTI EDITOR'}...`);
      try {
        const gRes = await saveMediaToGallery({
          blob: prev.blob,
          fileName: prev.fileName,
          mimeType: prev.mimeType,
          mediaType: 'video',
          format: prev.ext,
          width: prev.width,
          height: prev.height,
          frameRate: 30,
          settings,
          triggerSource: 'export',
          forceDuplicate: true,
          onProgress: (pct, st) => {
            setGalleryProgress(pct);
            setGalleryStage(st);
          },
          onRecordExport: onRecordExport ? async (rec) => { onRecordExport(rec); } : undefined,
        });
        setGalleryResult(gRes);
        if (gRes.saved) {
          setExportStatus(`Saved Motion ${prev.ext.toUpperCase()} copy to ${gRes.albumName}.`);
        } else if (gRes.error) {
          setExportError(gRes.error);
        }
      } finally {
        setGallerySaving(false);
      }
      return;
    }

    const caps = detectVideoExportCapabilities();
    if (!caps.mediaRecorderSupported || !caps.bestMimeType) {
      setExportError('MediaRecorder video export is not supported in this browser.');
      return;
    }

    const mimeType = caps.bestMimeType;
    const ext: 'mp4' | 'webm' = mimeType.includes('mp4') ? 'mp4' : 'webm';
    setIsExportingVideo(true);
    setAnimPlaying(false);
    setGalleryResult(null);
    setExportStatus(`Recording ${ANIM_CYCLE_SEC.toFixed(1)}s motion clip (${ext.toUpperCase()})...`);

    const offscreen = document.createElement('canvas');
    offscreen.width = doc.width;
    offscreen.height = doc.height;

    try {
      const stream = offscreen.captureStream(30);
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 6_000_000,
      });
      const chunks: BlobPart[] = [];
      let failed = false;
      recorder.onerror = () => {
        failed = true;
      };
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };

      const done = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      });

      recorder.start(200);
      const start = performance.now();
      await new Promise<void>((resolve) => {
        const step = () => {
          if (failed) {
            resolve();
            return;
          }
          const t = (performance.now() - start) / 1000;
          if (t >= ANIM_CYCLE_SEC) {
            renderTypographyDocument(offscreen, doc, {
              timeSec: ANIM_CYCLE_SEC,
              animate: true,
              showGuides: false,
              bgImage: bgImgRef.current,
            });
            resolve();
            return;
          }
          renderTypographyDocument(offscreen, doc, {
            timeSec: t,
            animate: true,
            showGuides: false,
            bgImage: bgImgRef.current,
          });
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });

      if (recorder.state !== 'inactive') recorder.stop();
      const blob = await done;
      if (failed || blob.size === 0) {
        setExportError('Motion video export produced an empty file in this browser.');
        setExportStatus(null);
        return;
      }

      const fileName = `dipti-motion-type-${Date.now()}.${ext}`;
      lastMotionVideoRef.current = {
        blob,
        mimeType,
        fileName,
        ext,
        width: doc.width,
        height: doc.height,
      };

      if (!settings.autoSaveToGallery) {
        downloadExportedBlob(blob, fileName);
        onRecordExport?.({
          id: `exp-motion-${Date.now()}`,
          fileName,
          mediaType: 'video',
          format: ext,
          resolutionLabel: `${doc.width}×${doc.height} @ 30fps`,
          width: doc.width,
          height: doc.height,
          frameRate: 30,
          fileSizeBytes: blob.size,
          status: 'completed',
          galleryDelivery: 'skipped-disabled',
          galleryLocationLabel: 'Manual Browser Download (Auto-Save OFF)',
          createdAt: new Date().toISOString(),
        });
        setExportStatus(`Motion ${ext.toUpperCase()} downloaded (${(blob.size / (1024 * 1024)).toFixed(2)} MB).`);
        setTimeout(() => setExportStatus(null), 3000);
        return;
      }

      setGallerySaving(true);
      setGalleryProgress(72);
      setGalleryStage(`Saving motion ${ext.toUpperCase()} to Gallery...`);
      const gRes = await saveMediaToGallery({
        blob,
        fileName,
        mimeType,
        mediaType: 'video',
        format: ext,
        width: doc.width,
        height: doc.height,
        frameRate: 30,
        settings,
        triggerSource: 'export',
        forceDuplicate,
        onProgress: (pct, st) => {
          setGalleryProgress(pct);
          setGalleryStage(st);
        },
        onRecordExport: onRecordExport ? async (rec) => { onRecordExport(rec); } : undefined,
      });

      setGalleryResult(gRes);
      if (gRes.saved) {
        setExportStatus(`Motion ${ext.toUpperCase()} saved (${(blob.size / (1024 * 1024)).toFixed(2)} MB).`);
        setTimeout(() => setExportStatus(null), 3000);
      } else {
        setExportStatus(null);
        if (gRes.error) setExportError(gRes.error);
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Unable to export motion video.');
      setExportStatus(null);
    } finally {
      releaseCanvasMemory(offscreen);
      setIsExportingVideo(false);
      setGallerySaving(false);
    }
  };

  const handleSaveProject = async () => {
    const preview = document.createElement('canvas');
    renderTypographyDocument(preview, doc, {
      timeSec: ANIM_CYCLE_SEC,
      animate: false,
      showGuides: false,
      bgImage: bgImgRef.current,
    });
    const thumb = createThumbnailDataUrl(preview, 480);
    releaseCanvasMemory(preview);
    const firstText = doc.layers.find((l) => l.kind === 'text') as DesignTextLayer | undefined;
    const ok = await onSaveProject({
      id: `proj-type-${Date.now()}`,
      name: `${firstText?.text.split('\n')[0] || 'Typography Design'} (${doc.category})`,
      tool: 'design-studio',
      thumbnailDataUrl: thumb || doc.background.photoUrl || STUDIO_ASSETS[5].url,
      sourceImageUrl: doc.background.photoUrl || STUDIO_ASSETS[5].url,
      width: doc.width,
      height: doc.height,
      updatedAt: new Date().toISOString(),
      typographyDoc: cloneTypographyDoc(doc),
    });
    if (ok === false) return;
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);

    if (settings.autoSaveToGallery) {
      await handleExportFullPng(false, 'save');
    }
  };

  const filteredTemplates = useMemo(
    () =>
      templateFilter === 'all'
        ? DESIGN_TEMPLATES
        : DESIGN_TEMPLATES.filter((t) => t.category === templateFilter),
    [templateFilter]
  );

  const inspectorTabs: Array<{ id: StudioInspectorTab; label: string; icon: React.ReactNode }> = [
    { id: 'text', label: 'Text & Font', icon: <TypeIcon className="w-3.5 h-3.5" /> },
    { id: 'effects', label: 'Effects', icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: 'motion', label: 'Motion', icon: <Play className="w-3.5 h-3.5" /> },
    { id: 'layers', label: `Layers (${doc.layers.length})`, icon: <Layers className="w-3.5 h-3.5" /> },
    { id: 'templates', label: 'Templates', icon: <LayoutTemplate className="w-3.5 h-3.5" /> },
    { id: 'backdrop', label: 'Stickers & BG', icon: <Shapes className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-4 pb-24 lg:pb-8">
      <input
        ref={bgFileInputRef}
        type="file"
        accept="image/*"
        onChange={handleUploadBgPhoto}
        className="hidden"
      />

      {/* Top Studio Bar: Add Text/Subtitle, Undo/Redo, Play Motion, Save & Export */}
      <div className="rounded-2xl bg-[#0B1020]/85 backdrop-blur-xl border border-amber-400/20 p-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => handleAddTextLayer('headline')}
            className="min-h-[42px] px-3.5 rounded-xl bg-gradient-to-r from-violet-600/40 to-amber-500/30 hover:brightness-110 border border-amber-400/35 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-amber-300" />
            <span>Add Text</span>
          </button>

          <button
            type="button"
            onClick={() => handleAddTextLayer('subtitle')}
            className="min-h-[42px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-violet-400/30 text-xs font-semibold text-violet-200 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-violet-300" />
            <span>Add Subtitle</span>
          </button>

          <button
            type="button"
            disabled={!canUndo}
            onClick={handleUndo}
            title="Undo"
            className="min-h-[42px] px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] disabled:opacity-35 border border-white/10 text-xs font-medium text-slate-200 flex items-center gap-1.5 cursor-pointer"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Undo</span>
          </button>

          <button
            type="button"
            disabled={!canRedo}
            onClick={handleRedo}
            title="Redo"
            className="min-h-[42px] px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] disabled:opacity-35 border border-white/10 text-xs font-medium text-slate-200 flex items-center gap-1.5 cursor-pointer"
          >
            <Redo2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Redo</span>
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleSaveProject}
            className="min-h-[42px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            {savedNotice ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Save className="w-3.5 h-3.5 text-amber-300" />}
            <span>{savedNotice ? 'Saved' : 'Save'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleExportTransparentPng(false)}
            className="min-h-[42px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-violet-500/20 border border-violet-400/35 text-xs font-semibold text-violet-200 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-violet-300" />
            <span>Transparent PNG</span>
          </button>

          <button
            type="button"
            onClick={() => handleExportFullPng(false, 'export')}
            className="min-h-[42px] px-4 rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-amber-500 hover:brightness-110 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shadow-[0_6px_22px_rgba(124,58,237,0.3)] cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export PNG</span>
          </button>
        </div>
      </div>

      <GallerySaveBanner
        saving={gallerySaving}
        progressPct={galleryProgress}
        stageLabel={galleryStage}
        result={galleryResult}
        onSaveCopyAnyway={() => {
          if (lastExportMode === 'video') handleExportMotionVideo(true);
          else if (lastExportMode === 'alpha') handleExportTransparentPng(true);
          else handleExportFullPng(true, 'export');
        }}
        onDismiss={() => setGalleryResult(null)}
      />

      {exportStatus && (
        <div className="rounded-xl bg-[#0B1020] border border-amber-400/35 px-4 py-2 text-xs text-amber-200 font-medium">
          {exportStatus}
        </div>
      )}

      {exportError && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-400/35 px-4 py-2 flex items-center gap-2 text-xs text-rose-200">
          <AlertCircle className="w-4 h-4 text-rose-300 shrink-0" />
          <span>{exportError}</span>
        </div>
      )}

      {/* Main Split: Interactive Touch Canvas + Tabbed Studio Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-7 xl:col-span-8 space-y-3">
          <div className="rounded-2xl bg-[#080B14] border border-white/10 p-3 sm:p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-mono-tabular text-slate-300 flex items-center gap-1.5">
                <Move className="w-3.5 h-3.5 text-amber-300" />
                <span>
                  {doc.width}×{doc.height} · Tap or drag layers on canvas
                </span>
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (!animPlaying) {
                      animTimeRef.current = 0;
                      setAnimTime(0);
                    }
                    setAnimPlaying((p) => !p);
                  }}
                  className="min-h-[38px] px-3 rounded-lg bg-violet-600/25 hover:bg-violet-600/40 border border-violet-400/40 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
                >
                  {animPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{animPlaying ? 'Pause' : 'Play Motion'}</span>
                </button>

                <button
                  type="button"
                  disabled={isExportingVideo}
                  onClick={() => handleExportMotionVideo(false)}
                  className="min-h-[38px] px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-xs font-semibold text-amber-200 flex items-center gap-1.5 cursor-pointer"
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>{isExportingVideo ? 'Recording...' : 'Export Video'}</span>
                </button>
              </div>
            </div>

            {/* Interactive Canvas Viewport */}
            <div className="relative min-h-[300px] sm:min-h-[450px] rounded-xl bg-[#04060A] border border-white/[0.06] flex items-center justify-center p-2 overflow-hidden">
              <canvas
                ref={canvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="max-w-full max-h-[520px] object-contain rounded-lg cursor-grab active:cursor-grabbing touch-none shadow-2xl"
              />
              {settings.showCanvasGrid && (
                <div className="pointer-events-none absolute inset-4 border border-dashed border-amber-400/25 rounded-lg" />
              )}
            </div>

            {/* Motion Scrub Timeline + Quick Position Snap */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2.5 flex-1 min-w-[200px]">
                <span className="text-[11px] font-mono-tabular text-amber-300 shrink-0">
                  {animTime.toFixed(1)}s / {ANIM_CYCLE_SEC.toFixed(1)}s
                </span>
                <input
                  type="range"
                  min={0}
                  max={ANIM_CYCLE_SEC}
                  step={0.05}
                  value={animTime}
                  onChange={(e) => {
                    const t = Number(e.target.value);
                    setAnimPlaying(false);
                    animTimeRef.current = t;
                    setAnimTime(t);
                  }}
                  className="studio-slider flex-1 cursor-pointer"
                  aria-label="Motion animation scrubber"
                />
              </div>

              {selectedLayer && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => updateLayerById(selectedLayer.id, (l) => ({ ...l, x: 0.5 }))}
                    className="min-h-[34px] px-2.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-[11px] font-medium text-slate-200 cursor-pointer"
                  >
                    Center X
                  </button>
                  <button
                    type="button"
                    onClick={() => updateLayerById(selectedLayer.id, (l) => ({ ...l, y: 0.5 }))}
                    className="min-h-[34px] px-2.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-[11px] font-medium text-slate-200 cursor-pointer"
                  >
                    Center Y
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Inspector Column */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          {/* Inspector Tabs */}
          <div className="rounded-2xl bg-[#0B1020]/85 backdrop-blur-xl border border-white/10 p-2">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {inspectorTabs.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`min-h-[42px] px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-all ${
                      active
                        ? 'bg-gradient-to-r from-violet-600/35 to-amber-500/25 border-amber-400/55 text-white'
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

          <div className="rounded-2xl bg-[#0B1020]/85 backdrop-blur-xl border border-white/10 p-4 space-y-4">
            {/* TAB 1: TEXT & FONT LIBRARY */}
            {activeTab === 'text' && (
              selectedTextLayer ? (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-amber-300 truncate">{selectedTextLayer.name}</span>
                    <div className="flex items-center gap-1">
                      {(['headline', 'subtitle', 'badge'] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() =>
                            updateSelectedText({
                              role: r,
                              subtitleBgEnabled: r === 'subtitle' ? true : selectedTextLayer.subtitleBgEnabled,
                            })
                          }
                          className={`min-h-[30px] px-2 rounded-lg border text-[10px] capitalize cursor-pointer ${
                            selectedTextLayer.role === r
                              ? 'bg-violet-600/35 border-violet-400 text-white'
                              : 'bg-[#060812] border-white/10 text-slate-400'
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>

                  <textarea
                    rows={2}
                    value={selectedTextLayer.text}
                    onChange={(e) => updateSelectedText({ text: e.target.value }, true)}
                    placeholder="Enter text or subtitle..."
                    className="w-full px-3 py-2 rounded-xl bg-[#060812] border border-white/10 focus:border-amber-400/60 outline-none text-xs sm:text-sm text-white"
                  />

                  {/* 12 Professional Fonts */}
                  <div>
                    <p className="text-xs font-medium text-slate-300 mb-1.5">Professional Font Library (12)</p>
                    <div className="grid grid-cols-2 gap-1.5 max-h-[190px] overflow-y-auto pr-1">
                      {STUDIO_FONTS.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => updateSelectedText({ fontFamily: f.family })}
                          className={`min-h-[42px] px-2.5 py-1.5 rounded-xl border text-left cursor-pointer transition-colors ${
                            selectedTextLayer.fontFamily === f.family
                              ? 'bg-amber-400/15 border-amber-400 text-white'
                              : 'bg-[#060812] border-white/10 text-slate-300 hover:border-white/25'
                          }`}
                        >
                          <p className="text-xs truncate" style={{ fontFamily: f.family }}>
                            {f.label}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate">{f.styleNote}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Alignment & Case */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      {(['left', 'center', 'right'] as const).map((al) => (
                        <button
                          key={al}
                          type="button"
                          onClick={() => updateSelectedText({ align: al })}
                          className={`min-h-[38px] min-w-[38px] rounded-lg border flex items-center justify-center cursor-pointer ${
                            selectedTextLayer.align === al
                              ? 'bg-violet-600/30 border-violet-400 text-white'
                              : 'bg-[#060812] border-white/10 text-slate-400'
                          }`}
                          aria-label={`Align ${al}`}
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

                    <button
                      type="button"
                      onClick={() => updateSelectedText({ uppercase: !selectedTextLayer.uppercase })}
                      className={`min-h-[38px] px-3 rounded-lg border text-xs font-mono-tabular cursor-pointer ${
                        selectedTextLayer.uppercase
                          ? 'bg-amber-400/20 border-amber-400/60 text-amber-200'
                          : 'bg-[#060812] border-white/10 text-slate-400'
                      }`}
                    >
                      AA / Aa
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        updateSelectedText({ subtitleBgEnabled: !selectedTextLayer.subtitleBgEnabled })
                      }
                      className={`min-h-[38px] px-2.5 rounded-lg border text-[11px] font-medium cursor-pointer ${
                        selectedTextLayer.subtitleBgEnabled
                          ? 'bg-violet-600/30 border-violet-400 text-white'
                          : 'bg-[#060812] border-white/10 text-slate-400'
                      }`}
                    >
                      Subtitle Bar
                    </button>
                  </div>

                  {/* Size, Scale, Spacing, Rotation, Curved Text */}
                  <div className="space-y-1">
                    <SliderControl
                      label="Font Size"
                      value={selectedTextLayer.fontSize}
                      min={18}
                      max={200}
                      defaultValue={84}
                      unit="px"
                      onChange={(v) => updateSelectedText({ fontSize: v }, true)}
                    />
                    <SliderControl
                      label="Scale"
                      value={Number(selectedTextLayer.scale.toFixed(2))}
                      min={0.3}
                      max={2.5}
                      step={0.05}
                      defaultValue={1}
                      unit="x"
                      onChange={(v) => updateSelectedText({ scale: v }, true)}
                    />
                    <SliderControl
                      label="Letter Spacing"
                      value={selectedTextLayer.letterSpacing}
                      min={-6}
                      max={36}
                      defaultValue={3}
                      unit="px"
                      onChange={(v) => updateSelectedText({ letterSpacing: v }, true)}
                    />
                    <SliderControl
                      label="Line Spacing"
                      value={Number(selectedTextLayer.lineHeight.toFixed(2))}
                      min={0.8}
                      max={2.2}
                      step={0.05}
                      defaultValue={1.08}
                      onChange={(v) => updateSelectedText({ lineHeight: v }, true)}
                    />
                    <SliderControl
                      label="Rotation"
                      value={selectedTextLayer.rotation}
                      min={-180}
                      max={180}
                      defaultValue={0}
                      unit="°"
                      onChange={(v) => updateSelectedText({ rotation: v }, true)}
                    />
                    <SliderControl
                      label="Curved Text Arc"
                      value={selectedTextLayer.curveAmount}
                      min={-100}
                      max={100}
                      defaultValue={0}
                      onChange={(v) => updateSelectedText({ curveAmount: v }, true)}
                    />
                    <SliderControl
                      label="Opacity"
                      value={selectedTextLayer.opacity}
                      min={10}
                      max={100}
                      defaultValue={100}
                      unit="%"
                      onChange={(v) => updateSelectedText({ opacity: v }, true)}
                    />
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center space-y-3">
                  <p className="text-xs text-slate-400">
                    Select a text layer on the canvas or add a new headline or subtitle.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleAddTextLayer('headline')}
                    className="min-h-[42px] px-4 rounded-xl bg-violet-600/30 border border-violet-400/50 text-xs font-semibold text-white cursor-pointer"
                  >
                    + Add New Headline
                  </button>
                </div>
              )
            )}

            {/* TAB 2: TEXT EFFECTS (METALLIC GOLD, PURPLE NEON, GRADIENT, 3D, SHADOWS, OUTLINES) */}
            {activeTab === 'effects' && (
              selectedTextLayer ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-white mb-2">Text Finish Style</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          { id: 'solid', label: 'Solid Color' },
                          { id: 'metallic-gold', label: 'Metallic Gold' },
                          { id: 'purple-neon', label: 'Purple Neon' },
                          { id: 'gradient', label: 'Gradient Fill' },
                          { id: '3d-extrude', label: '3D Extrude' },
                        ] as Array<{ id: TextStyleEffect; label: string }>
                      ).map((ef) => (
                        <button
                          key={ef.id}
                          type="button"
                          onClick={() => updateSelectedText({ effect: ef.id })}
                          className={`min-h-[40px] px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                            selectedTextLayer.effect === ef.id
                              ? 'bg-gradient-to-r from-amber-500/25 to-violet-600/30 border-amber-400 text-white'
                              : 'bg-[#060812] border-white/10 text-slate-300 hover:border-white/25'
                          }`}
                        >
                          {ef.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {selectedTextLayer.effect === 'solid' && (
                    <div className="flex items-center justify-between bg-[#060812] border border-white/10 rounded-xl px-3 py-2">
                      <span className="text-xs text-slate-300">Fill Color</span>
                      <input
                        type="color"
                        value={selectedTextLayer.color}
                        onChange={(e) => updateSelectedText({ color: e.target.value }, true)}
                        className="w-8 h-8 bg-transparent cursor-pointer"
                      />
                    </div>
                  )}

                  {selectedTextLayer.effect === 'purple-neon' && (
                    <div className="flex items-center justify-between bg-[#060812] border border-violet-400/30 rounded-xl px-3 py-2">
                      <span className="text-xs text-violet-200">Neon Tube Glow</span>
                      <input
                        type="color"
                        value={selectedTextLayer.neonColor}
                        onChange={(e) => updateSelectedText({ neonColor: e.target.value }, true)}
                        className="w-8 h-8 bg-transparent cursor-pointer"
                      />
                    </div>
                  )}

                  {selectedTextLayer.effect === 'gradient' && (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-2 gap-1.5">
                        {TEXT_GRADIENT_PRESETS.map((gp) => (
                          <button
                            key={gp.id}
                            type="button"
                            onClick={() =>
                              updateSelectedText({
                                gradientColorA: gp.a,
                                gradientColorB: gp.b,
                                gradientAngle: gp.angle,
                              })
                            }
                            className="min-h-[36px] px-2.5 rounded-lg bg-[#060812] border border-white/10 hover:border-amber-400/50 text-[11px] text-slate-200 flex items-center gap-2 cursor-pointer"
                          >
                            <span
                              className="w-4 h-4 rounded-full shrink-0"
                              style={{ background: `linear-gradient(135deg, ${gp.a}, ${gp.b})` }}
                            />
                            <span className="truncate">{gp.label}</span>
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex items-center justify-between bg-[#060812] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-300">
                          <span>Start</span>
                          <input
                            type="color"
                            value={selectedTextLayer.gradientColorA}
                            onChange={(e) => updateSelectedText({ gradientColorA: e.target.value }, true)}
                            className="w-6 h-6 bg-transparent cursor-pointer"
                          />
                        </label>
                        <label className="flex items-center justify-between bg-[#060812] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-300">
                          <span>End</span>
                          <input
                            type="color"
                            value={selectedTextLayer.gradientColorB}
                            onChange={(e) => updateSelectedText({ gradientColorB: e.target.value }, true)}
                            className="w-6 h-6 bg-transparent cursor-pointer"
                          />
                        </label>
                      </div>
                      <SliderControl
                        label="Gradient Angle"
                        value={selectedTextLayer.gradientAngle}
                        min={0}
                        max={360}
                        defaultValue={135}
                        unit="°"
                        onChange={(v) => updateSelectedText({ gradientAngle: v }, true)}
                      />
                    </div>
                  )}

                  {selectedTextLayer.effect === '3d-extrude' && (
                    <div className="space-y-2 pt-1 border-t border-white/[0.07]">
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex items-center justify-between bg-[#060812] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-300">
                          <span>Face</span>
                          <input
                            type="color"
                            value={selectedTextLayer.color}
                            onChange={(e) => updateSelectedText({ color: e.target.value }, true)}
                            className="w-6 h-6 bg-transparent cursor-pointer"
                          />
                        </label>
                        <label className="flex items-center justify-between bg-[#060812] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-300">
                          <span>Depth</span>
                          <input
                            type="color"
                            value={selectedTextLayer.extrudeColor}
                            onChange={(e) => updateSelectedText({ extrudeColor: e.target.value }, true)}
                            className="w-6 h-6 bg-transparent cursor-pointer"
                          />
                        </label>
                      </div>
                      <SliderControl
                        label="3D Depth"
                        value={selectedTextLayer.depth3D}
                        min={2}
                        max={28}
                        defaultValue={12}
                        onChange={(v) => updateSelectedText({ depth3D: v }, true)}
                      />
                      <SliderControl
                        label="3D Angle"
                        value={selectedTextLayer.angle3D}
                        min={0}
                        max={360}
                        defaultValue={38}
                        unit="°"
                        onChange={(v) => updateSelectedText({ angle3D: v }, true)}
                      />
                    </div>
                  )}

                  {/* Outline & Drop Shadow */}
                  <div className="space-y-1 pt-2 border-t border-white/[0.07]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-white">Outline &amp; Drop Shadow</span>
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] text-slate-400 flex items-center gap-1">
                          <span>Stroke</span>
                          <input
                            type="color"
                            value={selectedTextLayer.strokeColor}
                            onChange={(e) => updateSelectedText({ strokeColor: e.target.value }, true)}
                            className="w-5 h-5 bg-transparent cursor-pointer"
                          />
                        </label>
                      </div>
                    </div>
                    <SliderControl
                      label="Outline Width"
                      value={selectedTextLayer.strokeWidth}
                      min={0}
                      max={14}
                      defaultValue={0}
                      unit="px"
                      onChange={(v) => updateSelectedText({ strokeWidth: v }, true)}
                    />
                    <SliderControl
                      label="Shadow Blur"
                      value={selectedTextLayer.shadowBlur}
                      min={0}
                      max={48}
                      defaultValue={18}
                      onChange={(v) => updateSelectedText({ shadowBlur: v }, true)}
                    />
                    <SliderControl
                      label="Shadow Offset Y"
                      value={selectedTextLayer.shadowOffsetY}
                      min={-20}
                      max={30}
                      defaultValue={6}
                      onChange={(v) => updateSelectedText({ shadowOffsetY: v }, true)}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 py-4 text-center">
                  Select a text layer to apply metallic gold, purple neon, gradient, 3D extrusion, or outlines.
                </p>
              )
            )}

            {/* TAB 3: ANIMATED TEXT PRESETS (FADE, SLIDE, ZOOM, BOUNCE, SHIMMER, NEON) */}
            {activeTab === 'motion' && (
              selectedTextLayer ? (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-white">Motion Animation Preset</p>
                    <button
                      type="button"
                      onClick={() => {
                        animTimeRef.current = 0;
                        setAnimTime(0);
                        setAnimPlaying(true);
                      }}
                      className="min-h-[32px] px-2.5 rounded-lg bg-amber-400/20 border border-amber-400/50 text-[11px] font-semibold text-amber-200 flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Replay</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    {TEXT_ANIMATION_PRESETS.map((ap) => (
                      <button
                        key={ap.id}
                        type="button"
                        onClick={() => {
                          updateSelectedText({ animation: ap.id });
                          animTimeRef.current = 0;
                          setAnimTime(0);
                          setAnimPlaying(true);
                        }}
                        className={`min-h-[40px] px-2 rounded-xl border text-[11px] font-semibold cursor-pointer ${
                          selectedTextLayer.animation === ap.id
                            ? 'bg-violet-600/35 border-amber-400 text-white'
                            : 'bg-[#060812] border-white/10 text-slate-300 hover:border-white/25'
                        }`}
                      >
                        {ap.label}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-1 pt-2 border-t border-white/[0.07]">
                    <SliderControl
                      label="Duration"
                      value={Number(selectedTextLayer.animDuration.toFixed(1))}
                      min={0.4}
                      max={3.0}
                      step={0.1}
                      defaultValue={1.2}
                      unit="s"
                      onChange={(v) => updateSelectedText({ animDuration: v }, true)}
                    />
                    <SliderControl
                      label="Start Delay"
                      value={Number(selectedTextLayer.animDelay.toFixed(1))}
                      min={0}
                      max={2.0}
                      step={0.1}
                      defaultValue={0}
                      unit="s"
                      onChange={(v) => updateSelectedText({ animDelay: v }, true)}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 py-4 text-center">
                  Select any text or subtitle layer to assign fade, slide, zoom, bounce, or shimmer motion.
                </p>
              )
            )}

            {/* TAB 4: LAYER MANAGEMENT */}
            {activeTab === 'layers' && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-white">Layer Stack (Top to Bottom)</p>
                  <span className="text-[11px] text-slate-400 font-mono-tabular">
                    {doc.layers.length} {doc.layers.length === 1 ? 'layer' : 'layers'}
                  </span>
                </div>

                {doc.layers.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">No layers yet. Add text, stickers, or shapes.</p>
                ) : (
                  <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
                    {[...doc.layers].reverse().map((layer) => {
                      const isSel = layer.id === selectedLayerId;
                      return (
                        <div
                          key={layer.id}
                          onClick={() => setSelectedLayerId(layer.id)}
                          className={`rounded-xl border p-2.5 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                            isSel
                              ? 'bg-gradient-to-r from-violet-600/25 to-amber-500/15 border-amber-400/60 text-white'
                              : 'bg-[#060812] border-white/10 text-slate-300 hover:border-white/25'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold truncate">
                              {layer.kind === 'text' ? layer.text.split('\n')[0] || layer.name : layer.name}
                            </p>
                            <p className="text-[10px] font-mono-tabular text-slate-400 uppercase">
                              {layer.kind === 'text' ? `${layer.role} · ${layer.effect}` : layer.kind}
                            </p>
                          </div>

                          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => moveLayerOrder(layer.id, 1)}
                              className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/10 text-slate-300 cursor-pointer"
                              aria-label="Bring forward"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveLayerOrder(layer.id, -1)}
                              className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/10 text-slate-300 cursor-pointer"
                              aria-label="Send backward"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateLayerById(layer.id, (l) => ({ ...l, visible: !l.visible }))
                              }
                              className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/10 text-slate-300 cursor-pointer"
                              aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
                            >
                              {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateLayerById(layer.id, (l) => ({ ...l, locked: !l.locked }))
                              }
                              className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/10 text-slate-300 cursor-pointer"
                              aria-label={layer.locked ? 'Unlock layer' : 'Lock layer'}
                            >
                              {layer.locked ? <Lock className="w-3.5 h-3.5 text-amber-300" /> : <Unlock className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => duplicateLayer(layer.id)}
                              className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/10 text-slate-300 cursor-pointer"
                              aria-label="Duplicate layer"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteLayer(layer.id)}
                              className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 cursor-pointer"
                              aria-label="Delete layer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 5: TEMPLATES (LOGOS, YOUTUBE THUMBNAILS, INSTAGRAM POSTS, POSTERS) */}
            {activeTab === 'templates' && (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-white mb-2">Canvas Aspect &amp; Size</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {CANVAS_ASPECT_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          commitDoc({
                            ...doc,
                            width: opt.w,
                            height: opt.h,
                          })
                        }
                        className={`min-h-[38px] px-2 rounded-xl border text-[11px] font-mono-tabular cursor-pointer ${
                          doc.width === opt.w && doc.height === opt.h
                            ? 'bg-amber-400/20 border-amber-400 text-amber-200 font-semibold'
                            : 'bg-[#060812] border-white/10 text-slate-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-white/[0.07]">
                  <p className="text-xs font-semibold text-amber-300">Curated Studio Templates</p>
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar">
                    {(
                      [
                        { id: 'all', label: 'All' },
                        { id: 'logo', label: 'Logos' },
                        { id: 'thumbnail', label: 'YouTube' },
                        { id: 'instagram', label: 'Instagram' },
                        { id: 'poster', label: 'Posters' },
                      ] as const
                    ).map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setTemplateFilter(cat.id)}
                        className={`min-h-[34px] px-3 rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                          templateFilter === cat.id
                            ? 'bg-violet-600/35 text-white border border-violet-400/60'
                            : 'bg-[#060812] text-slate-400 border border-white/10'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 gap-2 max-h-[290px] overflow-y-auto pr-1">
                    {filteredTemplates.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => {
                          const cloned = cloneTypographyDoc(tpl.doc);
                          commitDoc(cloned);
                          setSelectedLayerId(cloned.layers[cloned.layers.length - 1]?.id ?? null);
                          animTimeRef.current = 0;
                          setAnimTime(0);
                          setAnimPlaying(true);
                        }}
                        className="min-h-[48px] px-3 py-2 rounded-xl bg-[#060812] hover:bg-white/[0.07] border border-white/10 hover:border-amber-400/50 text-left flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <div>
                          <p className="text-xs font-semibold text-white">{tpl.name}</p>
                          <p className="text-[10px] font-mono-tabular text-slate-400 uppercase">
                            {tpl.category} · {tpl.sizeLabel}
                          </p>
                        </div>
                        <span className="text-[11px] text-amber-300 font-medium">Load</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 6: STICKERS, SHAPES & CUSTOM BACKGROUNDS */}
            {activeTab === 'backdrop' && (
              <div className="space-y-4">
                {/* Selected Sticker / Shape Properties */}
                {selectedElementLayer && (
                  <div className="rounded-xl bg-[#060812] border border-amber-400/30 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-amber-200">{selectedElementLayer.name}</span>
                      <input
                        type="color"
                        value={selectedElementLayer.color}
                        onChange={(e) => updateSelectedElement({ color: e.target.value }, true)}
                        className="w-6 h-6 bg-transparent cursor-pointer"
                        aria-label="Element color"
                      />
                    </div>
                    <SliderControl
                      label="Width / Size"
                      value={selectedElementLayer.width}
                      min={40}
                      max={920}
                      unit="px"
                      onChange={(v) =>
                        updateSelectedElement(
                          selectedElementLayer.kind === 'sticker' ? { width: v, height: v } : { width: v },
                          true
                        )
                      }
                    />
                    {selectedElementLayer.kind === 'shape' && (
                      <SliderControl
                        label="Height"
                        value={selectedElementLayer.height}
                        min={4}
                        max={920}
                        unit="px"
                        onChange={(v) => updateSelectedElement({ height: v }, true)}
                      />
                    )}
                    <SliderControl
                      label="Rotation"
                      value={selectedElementLayer.rotation}
                      min={-180}
                      max={180}
                      unit="°"
                      onChange={(v) => updateSelectedElement({ rotation: v }, true)}
                    />
                    <SliderControl
                      label="Opacity"
                      value={selectedElementLayer.opacity}
                      min={10}
                      max={100}
                      unit="%"
                      onChange={(v) => updateSelectedElement({ opacity: v }, true)}
                    />
                    <SliderControl
                      label="Glow"
                      value={selectedElementLayer.glowBlur}
                      min={0}
                      max={32}
                      onChange={(v) => updateSelectedElement({ glowBlur: v }, true)}
                    />
                  </div>
                )}

                {/* Background Mode */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-white">Canvas Background</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(
                      [
                        { id: 'transparent', label: 'Alpha' },
                        { id: 'solid', label: 'Solid' },
                        { id: 'gradient', label: 'Gradient' },
                        { id: 'photo', label: 'Photo' },
                      ] as Array<{ id: DesignBackgroundMode; label: string }>
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() =>
                          commitDoc({
                            ...doc,
                            background: { ...doc.background, mode: m.id },
                          })
                        }
                        className={`min-h-[38px] rounded-xl border text-[11px] font-semibold cursor-pointer ${
                          doc.background.mode === m.id
                            ? 'bg-amber-400/20 border-amber-400 text-amber-200'
                            : 'bg-[#060812] border-white/10 text-slate-300'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {doc.background.mode === 'solid' && (
                    <div className="flex items-center justify-between bg-[#060812] border border-white/10 rounded-xl px-3 py-2">
                      <span className="text-xs text-slate-300">Background Color</span>
                      <input
                        type="color"
                        value={doc.background.solidColor}
                        onChange={(e) =>
                          liveCommitDoc({
                            ...doc,
                            background: { ...doc.background, solidColor: e.target.value },
                          })
                        }
                        className="w-7 h-7 bg-transparent cursor-pointer"
                      />
                    </div>
                  )}

                  {doc.background.mode === 'gradient' && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-1.5">
                        {BACKGROUND_GRADIENT_PRESETS.map((bg) => (
                          <button
                            key={bg.id}
                            type="button"
                            onClick={() =>
                              commitDoc({
                                ...doc,
                                background: {
                                  ...doc.background,
                                  gradientStart: bg.start,
                                  gradientEnd: bg.end,
                                  gradientAngle: bg.angle,
                                },
                              })
                            }
                            className="min-h-[34px] px-2 rounded-lg bg-[#060812] border border-white/10 text-[11px] text-slate-200 flex items-center gap-2 cursor-pointer"
                          >
                            <span
                              className="w-4 h-4 rounded shrink-0 border border-white/20"
                              style={{ background: `linear-gradient(${bg.angle}deg, ${bg.start}, ${bg.end})` }}
                            />
                            <span className="truncate">{bg.label}</span>
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex items-center justify-between bg-[#060812] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-300">
                          <span>Color A</span>
                          <input
                            type="color"
                            value={doc.background.gradientStart}
                            onChange={(e) =>
                              liveCommitDoc({
                                ...doc,
                                background: { ...doc.background, gradientStart: e.target.value },
                              })
                            }
                            className="w-6 h-6 bg-transparent cursor-pointer"
                          />
                        </label>
                        <label className="flex items-center justify-between bg-[#060812] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-300">
                          <span>Color B</span>
                          <input
                            type="color"
                            value={doc.background.gradientEnd}
                            onChange={(e) =>
                              liveCommitDoc({
                                ...doc,
                                background: { ...doc.background, gradientEnd: e.target.value },
                              })
                            }
                            className="w-6 h-6 bg-transparent cursor-pointer"
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {doc.background.mode === 'photo' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                        <button
                          type="button"
                          onClick={() => bgFileInputRef.current?.click()}
                          className="w-11 h-11 rounded-lg bg-violet-600/25 border border-violet-400/50 flex items-center justify-center shrink-0 cursor-pointer"
                          aria-label="Upload gallery background"
                        >
                          <Upload className="w-4 h-4 text-white" />
                        </button>
                        {STUDIO_ASSETS.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() =>
                              commitDoc({
                                ...doc,
                                background: { ...doc.background, photoUrl: a.url },
                              })
                            }
                            className={`w-11 h-11 rounded-lg overflow-hidden border shrink-0 cursor-pointer ${
                              doc.background.photoUrl === a.url ? 'border-amber-400' : 'border-white/10'
                            }`}
                          >
                            <img src={a.url} alt={a.title} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                      <SliderControl
                        label="Backdrop Dim"
                        value={doc.background.photoDim}
                        min={0}
                        max={85}
                        unit="%"
                        onChange={(v) =>
                          liveCommitDoc({
                            ...doc,
                            background: { ...doc.background, photoDim: v },
                          })
                        }
                      />
                    </div>
                  )}
                </div>

                {/* Geometric Shapes */}
                <div className="space-y-2 pt-2 border-t border-white/[0.07]">
                  <p className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <Box className="w-3.5 h-3.5 text-amber-300" />
                    <span>Add Shapes</span>
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {DESIGN_SHAPES.map((s) => (
                      <button
                        key={s.kind}
                        type="button"
                        onClick={() => handleAddShape(s.kind, s.label)}
                        className="min-h-[36px] px-2 rounded-lg bg-[#060812] hover:bg-white/10 border border-white/10 text-[11px] text-slate-200 truncate cursor-pointer"
                      >
                        + {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Stickers */}
                <div className="space-y-2 pt-2 border-t border-white/[0.07]">
                  <p className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-violet-300" />
                    <span>Add Stickers</span>
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {STUDIO_STICKERS.map((st) => (
                      <button
                        key={st.kind}
                        type="button"
                        onClick={() => handleAddSticker(st.kind, st.label, st.defaultColor)}
                        className="min-h-[36px] px-2 rounded-lg bg-[#060812] hover:bg-white/10 border border-white/10 text-[11px] text-slate-200 flex items-center gap-1.5 cursor-pointer"
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: st.defaultColor }} />
                        <span className="truncate">{st.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Studio Lighting Overlays */}
                <div className="space-y-2 pt-2 border-t border-white/[0.07]">
                  <p className="text-xs font-semibold text-white">Optical Overlays</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {STUDIO_OVERLAYS.map((ov) => (
                      <button
                        key={ov.id}
                        type="button"
                        onClick={() => commitDoc({ ...doc, overlayId: ov.id as OverlayId })}
                        className={`min-h-[34px] px-2 rounded-lg border text-[10px] truncate cursor-pointer ${
                          doc.overlayId === ov.id
                            ? 'bg-white/12 border-amber-400/60 text-white'
                            : 'bg-[#060812] border-white/10 text-slate-400'
                        }`}
                      >
                        {ov.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
