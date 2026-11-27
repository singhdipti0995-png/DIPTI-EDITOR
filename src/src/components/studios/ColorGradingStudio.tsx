import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookmarkPlus,
  Check,
  Download,
  Eye,
  Film,
  Image as ImageIcon,
  Layers,
  Palette,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  Save,
  Share2,
  Sliders,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react';
import {
  ColorGradingState,
  CustomColorGradePreset,
  DEFAULT_COLOR_GRADING_STATE,
} from '../../types/colorGrading';
import { AppSettings, ExportRecord, ProjectItem } from '../../types/editor';
import { ExportResolution, VideoClip, VideoQualityTier } from '../../types/video';
import { CINEMATIC_GRADE_PRESETS, createStateFromPreset } from '../../data/colorGradingPresets';
import { STUDIO_ASSETS } from '../../data/studioCatalog';
import { AssetPickerBar } from '../AssetPickerBar';
import { BeforeAfterSlider } from '../BeforeAfterSlider';
import { SliderControl } from '../SliderControl';
import { ColorWheelControl } from './ColorWheelControl';
import { RgbCurvesControl } from './RgbCurvesControl';
import { createThumbnailDataUrl, loadImageElement } from '../../utils/canvasEngine';
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
  resolveHdVideoExportPlan,
} from '../../utils/hdQualityEngine';
import { formatTimecode } from '../../utils/videoEngine';
import { GallerySaveResult, saveMediaToGallery } from '../../utils/gallerySaveEngine';
import { GallerySaveBanner } from '../GallerySaveBanner';
import {
  RgbHistogramBins,
  computeHistogramBins,
  deleteCustomColorPreset,
  loadCustomColorPresets,
  renderColorGradedPhoto,
  renderColorGradedVideoFrame,
  saveCustomColorPreset,
} from '../../utils/colorGradingEngine';

interface ColorGradingStudioProps {
  imageUrl: string;
  onChangeImage: (url: string) => void;
  initialState?: ColorGradingState;
  activeProjectId?: string;
  settings: AppSettings;
  onSaveProject: (project: ProjectItem) => Promise<boolean> | void;
  onRecordExport?: (record: ExportRecord) => void;
}

type StudioMediaMode = 'photo' | 'video';
type GradeInspectorTab = 'presets' | 'tone' | 'color' | 'curves' | 'wheels' | 'export';

const INSPECTOR_TABS: Array<{ id: GradeInspectorTab; label: string; icon: React.ReactNode }> = [
  { id: 'presets', label: 'Presets', icon: <Sparkles className="w-3.5 h-3.5" /> },
  { id: 'tone', label: 'Tone', icon: <Sliders className="w-3.5 h-3.5" /> },
  { id: 'color', label: 'RGB/HSL', icon: <Palette className="w-3.5 h-3.5" /> },
  { id: 'curves', label: 'Curves', icon: <Layers className="w-3.5 h-3.5" /> },
  { id: 'wheels', label: 'Wheels', icon: <Sparkles className="w-3.5 h-3.5" /> },
  { id: 'export', label: 'Export', icon: <Download className="w-3.5 h-3.5" /> },
];

const EMPTY_HISTOGRAM: RgbHistogramBins = {
  red: new Array(48).fill(0),
  green: new Array(48).fill(0),
  blue: new Array(48).fill(0),
  luma: new Array(48).fill(0),
};

function cloneGradeState(s: ColorGradingState): ColorGradingState {
  return JSON.parse(JSON.stringify(s)) as ColorGradingState;
}

function formatBytesLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export const ColorGradingStudio: React.FC<ColorGradingStudioProps> = ({
  imageUrl,
  onChangeImage,
  initialState,
  activeProjectId,
  settings,
  onSaveProject,
  onRecordExport,
}) => {
  const startState = initialState
    ? cloneGradeState(initialState)
    : createStateFromPreset(CINEMATIC_GRADE_PRESETS[0]);

  const [mediaMode, setMediaMode] = useState<StudioMediaMode>('photo');
  const [activeTab, setActiveTab] = useState<GradeInspectorTab>('presets');
  const [gradeState, setGradeState] = useState<ColorGradingState>(startState);
  const [history, setHistory] = useState<ColorGradingState[]>([cloneGradeState(startState)]);
  const [historyIdx, setHistoryIdx] = useState(0);

  // Photo preview & comparison state
  const [imgDims, setImgDims] = useState<{ w: number; h: number }>({ w: 1920, h: 1080 });
  const [compareMode, setCompareMode] = useState<'graded' | 'split' | 'original'>('graded');
  const [afterDataUrl, setAfterDataUrl] = useState<string>('');
  const [histogram, setHistogram] = useState<RgbHistogramBins>(EMPTY_HISTOGRAM);

  // Custom presets state
  const [customPresets, setCustomPresets] = useState<CustomColorGradePreset[]>(() =>
    loadCustomColorPresets()
  );
  const [customPresetName, setCustomPresetName] = useState('');
  const [presetSavedFlash, setPresetSavedFlash] = useState(false);

  // Save & Export feedback state
  const [savedNotice, setSavedNotice] = useState(false);
  const [exportFormat, setExportFormat] = useState<ImageExportFormat>(
    settings.exportFormat === 'jpeg' ? 'jpg' : settings.exportFormat
  );
  const [qualityPreset, setQualityPreset] = useState<HdQualityPreset>('original');
  const [customQualityPct, setCustomQualityPct] = useState(settings.exportQuality || 95);
  const [isExportingPhoto, setIsExportingPhoto] = useState(false);
  const [photoExportResult, setPhotoExportResult] = useState<{
    blob: Blob;
    mimeType: string;
    fileName: string;
    width: number;
    height: number;
    sizeLabel: string;
    qualityLabel: string;
  } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [gallerySaving, setGallerySaving] = useState(false);
  const [galleryProgress, setGalleryProgress] = useState(0);
  const [galleryStage, setGalleryStage] = useState<string | null>(null);
  const [galleryResult, setGalleryResult] = useState<GallerySaveResult | null>(null);
  const [lastGalleryTarget, setLastGalleryTarget] = useState<'photo' | 'video'>('photo');

  // Video Color Grading state
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoMeta, setVideoMeta] = useState<{
    name: string;
    width: number;
    height: number;
    duration: number;
    fps: 24 | 30 | 60;
    isSampleImageReel: boolean;
  }>({
    name: 'Pacific Twilight Cinema Sample',
    width: 1920,
    height: 1080,
    duration: 8,
    fps: 30,
    isSampleImageReel: true,
  });
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [videoTime, setVideoTime] = useState(0);
  const [videoSplitCompare, setVideoSplitCompare] = useState(false);
  const [videoSplitPct, setVideoSplitPct] = useState(50);
  const [videoResolution, setVideoResolution] = useState<ExportResolution>('original');
  const [videoQualityTier, setVideoQualityTier] = useState<VideoQualityTier>('high');
  const [isExportingVideo, setIsExportingVideo] = useState(false);
  const [videoExportProgress, setVideoExportProgress] = useState(0);
  const [exportedVideoResult, setExportedVideoResult] = useState<{
    url: string;
    blob: Blob;
    mimeType: string;
    fileName: string;
    width: number;
    height: number;
    fps: number;
    bitrateMbps: number;
    sizeLabel: string;
  } | null>(null);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const sampleReelImgRef = useRef<HTMLImageElement | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const videoCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoScratchRef = useRef<HTMLCanvasElement | null>(null);
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const videoUrlRef = useRef<string | null>(null);
  const exportedVideoUrlRef = useRef<string | null>(null);
  const sessionProjectIdRef = useRef(activeProjectId || `proj-grade-${Date.now()}`);
  const historyDebounceRef = useRef<number | null>(null);
  const historyIdxRef = useRef(historyIdx);
  historyIdxRef.current = historyIdx;
  const exportAbortRef = useRef(false);

  if (activeProjectId) sessionProjectIdRef.current = activeProjectId;
  videoUrlRef.current = videoUrl;
  exportedVideoUrlRef.current = exportedVideoResult?.url ?? null;

  const formatSupport = useMemo(() => detectImageFormatSupport(), []);

  const canUndo = historyIdx > 0;
  const canRedo = historyIdx < history.length - 1;

  const pushHistory = useCallback((snapshot: ColorGradingState) => {
    const cloned = cloneGradeState(snapshot);
    setHistory((prev) => {
      const sliced = prev.slice(0, historyIdxRef.current + 1);
      const next = [...sliced, cloned].slice(-40);
      setHistoryIdx(next.length - 1);
      return next;
    });
  }, []);

  const updateGrade = useCallback(
    (updater: (prev: ColorGradingState) => ColorGradingState, immediateHistory = false) => {
      setGradeState((prev) => {
        const next = updater(prev);
        if (historyDebounceRef.current) window.clearTimeout(historyDebounceRef.current);
        if (immediateHistory) {
          pushHistory(next);
        } else {
          historyDebounceRef.current = window.setTimeout(() => {
            pushHistory(next);
          }, 260);
        }
        return next;
      });
    },
    [pushHistory]
  );

  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    const idx = historyIdx - 1;
    setHistoryIdx(idx);
    setGradeState(cloneGradeState(history[idx]));
  }, [canUndo, history, historyIdx]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    const idx = historyIdx + 1;
    setHistoryIdx(idx);
    setGradeState(cloneGradeState(history[idx]));
  }, [canRedo, history, historyIdx]);

  // Keyboard Undo/Redo shortcuts
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

  // Unmount cleanup (Android GPU / Blob memory hygiene)
  useEffect(() => {
    return () => {
      if (historyDebounceRef.current) window.clearTimeout(historyDebounceRef.current);
      if (videoUrlRef.current?.startsWith('blob:')) URL.revokeObjectURL(videoUrlRef.current);
      if (exportedVideoUrlRef.current?.startsWith('blob:')) {
        URL.revokeObjectURL(exportedVideoUrlRef.current);
      }
      releaseCanvasMemory(videoScratchRef.current);
      releaseCanvasMemory(previewCanvasRef.current);
      releaseCanvasMemory(videoCanvasRef.current);
    };
  }, []);

  // Load sample cinema frame for demo Video Grading mode
  useEffect(() => {
    loadImageElement(STUDIO_ASSETS[4].url)
      .then((img) => {
        sampleReelImgRef.current = img;
      })
      .catch(() => {});
  }, []);

  // Render Photo Grade preview whenever image or gradeState updates
  const [imgVersion, setImgVersion] = useState(0);
  useEffect(() => {
    let active = true;
    loadImageElement(imageUrl)
      .then((img) => {
        if (!active) return;
        imgRef.current = img;
        setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
        setPhotoExportResult(null);
        setImgVersion((v) => v + 1);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [imageUrl]);

  useEffect(() => {
    if (mediaMode !== 'photo') return;
    const img = imgRef.current;
    const canvas = previewCanvasRef.current;
    if (!img || !canvas) return;

    const effective =
      compareMode === 'original' ? DEFAULT_COLOR_GRADING_STATE : gradeState;
    renderColorGradedPhoto(img, canvas, effective, 960);
    setHistogram(computeHistogramBins(canvas, 48));

    if (compareMode === 'split') {
      setAfterDataUrl(canvas.toDataURL('image/png'));
    }
  }, [mediaMode, imgVersion, gradeState, compareMode]);

  // Compute current Photo & Video HD export plans
  const photoPlan = useMemo(
    () =>
      resolveHdPhotoExportPlan(
        imgDims.w,
        imgDims.h,
        qualityPreset,
        exportFormat,
        'original',
        customQualityPct
      ),
    [imgDims.w, imgDims.h, qualityPreset, exportFormat, customQualityPct]
  );

  const syntheticVideoClip: VideoClip = useMemo(
    () => ({
      id: 'grade-vid-clip',
      name: videoMeta.name,
      sourceType: videoMeta.isSampleImageReel ? 'studio-reel' : 'video',
      src: videoUrl || STUDIO_ASSETS[4].url,
      nativeDuration: videoMeta.duration,
      trimStart: 0,
      trimEnd: videoMeta.duration,
      speed: 1,
      volume: 100,
      filterId: 'natural',
      brightness: 0,
      contrast: 0,
      saturation: 0,
      temperature: 0,
      glitch: 0,
      rgbSplit: 0,
      vignette: 0,
      grain: 0,
      transitionOut: 'none',
      transitionDuration: 0.4,
      slowMoBlur: false,
      nativeWidth: videoMeta.width,
      nativeHeight: videoMeta.height,
      nativeFps: videoMeta.fps,
    }),
    [videoMeta, videoUrl]
  );

  const videoPlan = useMemo(() => {
    const aspect =
      videoMeta.height > videoMeta.width
        ? '9:16'
        : Math.abs(videoMeta.width - videoMeta.height) < 20
          ? '1:1'
          : '16:9';
    return resolveHdVideoExportPlan(
      aspect,
      [syntheticVideoClip],
      videoResolution,
      videoQualityTier,
      videoMeta.fps
    );
  }, [syntheticVideoClip, videoMeta.width, videoMeta.height, videoMeta.fps, videoResolution, videoQualityTier]);

  // Video Frame Rendering helper
  const drawCurrentVideoFrame = useCallback(
    (timeSec: number, previewSpeedMode = true) => {
      const canvas = videoCanvasRef.current;
      if (!canvas) return;
      if (!videoScratchRef.current) {
        videoScratchRef.current = document.createElement('canvas');
      }

      const previewScale = Math.min(1, 960 / Math.max(videoMeta.width, videoMeta.height));
      const pw = Math.max(320, Math.round(videoMeta.width * previewScale));
      const ph = Math.max(180, Math.round(videoMeta.height * previewScale));

      const source = videoMeta.isSampleImageReel
        ? sampleReelImgRef.current
        : videoElRef.current;
      if (!source) return;
      if (source instanceof HTMLVideoElement && source.readyState < 2) return;

      renderColorGradedVideoFrame(source, canvas, gradeState, { w: pw, h: ph }, {
        previewSpeedMode,
        compareSplitPct: videoSplitCompare ? videoSplitPct : null,
        scratchCanvas: videoScratchRef.current,
      });

      if (!isVideoPlaying) {
        setHistogram(computeHistogramBins(canvas, 48));
      }

      void timeSec;
    },
    [gradeState, isVideoPlaying, videoMeta.height, videoMeta.isSampleImageReel, videoMeta.width, videoSplitCompare, videoSplitPct]
  );

  // Sync video element time when paused & scrubbing
  useEffect(() => {
    if (mediaMode !== 'video') return;
    if (!videoMeta.isSampleImageReel && videoElRef.current) {
      const vid = videoElRef.current;
      if (Math.abs(vid.currentTime - videoTime) > 0.08 && !isVideoPlaying) {
        vid.currentTime = videoTime;
      }
    }
    const raf = requestAnimationFrame(() => drawCurrentVideoFrame(videoTime, true));
    return () => cancelAnimationFrame(raf);
  }, [mediaMode, videoTime, gradeState, videoSplitCompare, videoSplitPct, isVideoPlaying, videoMeta.isSampleImageReel, drawCurrentVideoFrame]);

  // Video Playback loop
  useEffect(() => {
    if (mediaMode !== 'video' || !isVideoPlaying) {
      if (videoElRef.current && !videoElRef.current.paused) {
        videoElRef.current.pause();
      }
      return;
    }

    if (!videoMeta.isSampleImageReel && videoElRef.current) {
      const vid = videoElRef.current;
      vid.currentTime = videoTime >= videoMeta.duration - 0.05 ? 0 : videoTime;
      vid.play().catch(() => {});
    }

    let lastTs = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastTs) / 1000);
      lastTs = now;

      if (!videoMeta.isSampleImageReel && videoElRef.current) {
        const vid = videoElRef.current;
        if (vid.ended || vid.currentTime >= videoMeta.duration) {
          setIsVideoPlaying(false);
          setVideoTime(0);
          vid.pause();
          vid.currentTime = 0;
          return;
        }
        setVideoTime(vid.currentTime);
        drawCurrentVideoFrame(vid.currentTime, true);
      } else {
        setVideoTime((prev) => {
          const next = prev + dt;
          if (next >= videoMeta.duration) {
            setIsVideoPlaying(false);
            return 0;
          }
          drawCurrentVideoFrame(next, true);
          return next;
        });
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [mediaMode, isVideoPlaying, videoMeta.duration, videoMeta.isSampleImageReel, drawCurrentVideoFrame]);

  const handleImportVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExportError(null);
    setIsVideoPlaying(false);
    setVideoTime(0);
    if (videoUrl?.startsWith('blob:')) URL.revokeObjectURL(videoUrl);

    const objUrl = URL.createObjectURL(file);
    const vid = document.createElement('video');
    vid.preload = 'auto';
    vid.muted = false;
    vid.playsInline = true;
    vid.src = objUrl;
    vid.onloadedmetadata = () => {
      const nw = vid.videoWidth || 1280;
      const nh = vid.videoHeight || 720;
      const dur = Number.isFinite(vid.duration) && vid.duration > 0.2 ? vid.duration : 6;
      videoElRef.current = vid;
      setVideoUrl(objUrl);
      setVideoMeta({
        name: file.name,
        width: nw,
        height: nh,
        duration: dur,
        fps: 30,
        isSampleImageReel: false,
      });
      setMediaMode('video');
      vid.currentTime = 0;
    };
    vid.onseeked = () => {
      drawCurrentVideoFrame(vid.currentTime, true);
    };
    vid.onerror = () => {
      URL.revokeObjectURL(objUrl);
      setExportError('This browser cannot decode the selected video format.');
    };
    e.target.value = '';
  };

  const handleSelectPreset = (presetId: string) => {
    const found = CINEMATIC_GRADE_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    const nextState = createStateFromPreset(found);
    setGradeState(nextState);
    pushHistory(nextState);
  };

  const handleSaveCustomPreset = () => {
    const updated = saveCustomColorPreset(customPresetName || `Grade ${customPresets.length + 1}`, gradeState);
    setCustomPresets(updated);
    setCustomPresetName('');
    setPresetSavedFlash(true);
    window.setTimeout(() => setPresetSavedFlash(false), 1800);
  };

  const handleResetAll = () => {
    const neutral = cloneGradeState(DEFAULT_COLOR_GRADING_STATE);
    setGradeState(neutral);
    pushHistory(neutral);
  };

  // Full-Resolution Photo Export (never resized unless custom target chosen; preserves original naturalWidth × naturalHeight)
  const handleExportPhoto = async (
    forceDuplicate = false,
    triggerSource: 'save' | 'export' | 'manual' = 'export'
  ) => {
    const img = imgRef.current;
    if (!img) {
      setExportError('Please load or select a photo before exporting.');
      return;
    }
    setExportError(null);
    setLastGalleryTarget('photo');
    setIsExportingPhoto(true);
    setGallerySaving(true);
    setGalleryProgress(10);
    setGalleryStage(`Rendering full-resolution ${exportFormat.toUpperCase()}...`);
    setGalleryResult(null);
    const outCanvas = document.createElement('canvas');

    try {
      await new Promise((r) => setTimeout(r, 16));
      renderColorGradedPhoto(img, outCanvas, gradeState);
      setGalleryProgress(40);
      setGalleryStage(`Encoding ${outCanvas.width}×${outCanvas.height} ${exportFormat.toUpperCase()}...`);
      const { blob, mimeType } = await encodeCanvasToBlob(
        outCanvas,
        exportFormat,
        photoPlan.qualityPercent
      );
      const ext = exportFormat;
      const fileName = `dipti-color-grade-${outCanvas.width}x${outCanvas.height}.${ext}`;
      const sizeLabel = formatBytesLabel(blob.size);
      const qualityLabel =
        exportFormat === 'png'
          ? 'Lossless PNG'
          : `${photoPlan.qualityPercent}% ${exportFormat.toUpperCase()}`;
      const thumb = previewCanvasRef.current
        ? createThumbnailDataUrl(previewCanvasRef.current, 320)
        : undefined;

      if (!settings.autoSaveToGallery && triggerSource === 'export') {
        downloadExportedBlob(blob, fileName);
        setPhotoExportResult({
          blob,
          mimeType,
          fileName,
          width: outCanvas.width,
          height: outCanvas.height,
          sizeLabel,
          qualityLabel,
        });
        onRecordExport?.({
          id: `exp-${Date.now()}`,
          projectId: sessionProjectIdRef.current,
          fileName,
          mediaType: 'image',
          format: exportFormat,
          resolutionLabel: `${outCanvas.width}×${outCanvas.height} (${qualityPreset})`,
          width: outCanvas.width,
          height: outCanvas.height,
          quality: photoPlan.qualityPercent,
          fileSizeBytes: blob.size,
          status: 'completed',
          thumbnailDataUrl: thumb,
          galleryDelivery: 'skipped-disabled',
          galleryLocationLabel: 'Manual Browser Download (Auto-Save OFF)',
          createdAt: new Date().toISOString(),
        });
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
        quality: exportFormat === 'png' ? 100 : photoPlan.qualityPercent,
        thumbnailDataUrl: thumb,
        projectId: sessionProjectIdRef.current,
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
        setPhotoExportResult({
          blob,
          mimeType,
          fileName,
          width: outCanvas.width,
          height: outCanvas.height,
          sizeLabel,
          qualityLabel,
        });
      } else if (gRes.error) {
        setExportError(gRes.error);
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Photo export failed.');
    } finally {
      releaseCanvasMemory(outCanvas);
      setIsExportingPhoto(false);
      setGallerySaving(false);
    }
  };

  const handleSaveProject = async () => {
    const canvas = previewCanvasRef.current;
    const thumb = canvas ? createThumbnailDataUrl(canvas, 480) : imageUrl;
    const activePresetName =
      CINEMATIC_GRADE_PRESETS.find((p) => p.id === gradeState.presetId)?.name || 'Custom Grade';

    const ok = await onSaveProject({
      id: sessionProjectIdRef.current,
      name: `Color Grade · ${activePresetName}`,
      tool: 'color-grading',
      thumbnailDataUrl: thumb || imageUrl,
      sourceImageUrl: imageUrl,
      width: imgDims.w,
      height: imgDims.h,
      updatedAt: new Date().toISOString(),
      colorGradingState: cloneGradeState(gradeState),
    });
    if (ok === false) return;
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 2000);

    if (settings.autoSaveToGallery) {
      if (mediaMode === 'photo') {
        await handleExportPhoto(false, 'save');
      } else {
        await handleExportVideo(false, 'save');
      }
    }
  };

  // Real-time Browser Video Export (only when MediaRecorder is supported; never fakes unsupported 4K)
  const handleExportVideo = async (
    forceDuplicate = false,
    triggerSource: 'save' | 'export' | 'manual' = 'export'
  ) => {
    setExportError(null);
    setLastGalleryTarget('video');

    // Fast path: if retrying a duplicate save on an already-rendered video blob, skip re-encoding
    if (forceDuplicate && exportedVideoResult) {
      setGallerySaving(true);
      setGalleryProgress(45);
      setGalleryStage(`Saving copy to ${settings.galleryAlbumName || 'DIPTI EDITOR'}...`);
      const ext = exportedVideoResult.mimeType.includes('mp4') ? 'mp4' : 'webm';
      try {
        const gRes = await saveMediaToGallery({
          blob: exportedVideoResult.blob,
          fileName: exportedVideoResult.fileName,
          mimeType: exportedVideoResult.mimeType,
          mediaType: 'video',
          format: ext,
          width: exportedVideoResult.width,
          height: exportedVideoResult.height,
          frameRate: exportedVideoResult.fps,
          projectId: sessionProjectIdRef.current,
          settings,
          triggerSource,
          forceDuplicate: true,
          onProgress: (pct, st) => {
            setGalleryProgress(pct);
            setGalleryStage(st);
          },
          onRecordExport: onRecordExport ? async (rec) => { onRecordExport(rec); } : undefined,
        });
        setGalleryResult(gRes);
        if (!gRes.saved && gRes.error) setExportError(gRes.error);
      } finally {
        setGallerySaving(false);
      }
      return;
    }

    if (!videoPlan.codecSupported) {
      setExportError(
        'Browser MediaRecorder video encoding is not supported on this device/browser.'
      );
      return;
    }
    if (exportedVideoResult?.url) {
      URL.revokeObjectURL(exportedVideoResult.url);
      setExportedVideoResult(null);
    }

    setIsVideoPlaying(false);
    setIsExportingVideo(true);
    setVideoExportProgress(2);
    setGalleryResult(null);
    exportAbortRef.current = false;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = videoPlan.width;
    exportCanvas.height = videoPlan.height;
    const scratch = document.createElement('canvas');
    const chunks: BlobPart[] = [];

    try {
      const stream = exportCanvas.captureStream(videoPlan.fps);
      const mimeType = videoPlan.mp4Supported
        ? (['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4'].find((m) =>
            MediaRecorder.isTypeSupported(m)
          ) ?? 'video/mp4')
        : (['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8', 'video/webm'].find((m) =>
            MediaRecorder.isTypeSupported(m)
          ) ?? 'video/webm');

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: videoPlan.bitrateBps,
      });

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };

      const donePromise = new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => {
          const outBlob = new Blob(chunks, { type: mimeType });
          if (outBlob.size === 0) reject(new Error('Recorded video produced 0 bytes.'));
          else resolve(outBlob);
        };
        recorder.onerror = () => reject(new Error('MediaRecorder encoding failed.'));
      });

      recorder.start(250);

      const dur = Math.max(0.5, videoMeta.duration);
      const vid = !videoMeta.isSampleImageReel ? videoElRef.current : null;
      if (vid) {
        vid.currentTime = 0;
        await vid.play().catch(() => {});
      }

      const startMs = performance.now();
      await new Promise<void>((resolve) => {
        const step = () => {
          if (exportAbortRef.current) {
            resolve();
            return;
          }
          const elapsed = vid ? vid.currentTime : (performance.now() - startMs) / 1000;
          const pct = Math.min(95, Math.round((elapsed / dur) * 100));
          setVideoExportProgress(pct);

          const source = videoMeta.isSampleImageReel
            ? sampleReelImgRef.current
            : videoElRef.current;
          if (source) {
            renderColorGradedVideoFrame(
              source,
              exportCanvas,
              gradeState,
              { w: videoPlan.width, h: videoPlan.height },
              { previewSpeedMode: false, compareSplitPct: null, scratchCanvas: scratch }
            );
          }

          if (elapsed >= dur - 0.04 || (vid && vid.ended)) {
            resolve();
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });

      if (vid && !vid.paused) vid.pause();
      if (recorder.state !== 'inactive') recorder.stop();

      if (exportAbortRef.current) {
        setIsExportingVideo(false);
        return;
      }

      const outBlob = await donePromise;
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const fileName = `dipti-graded-video-${videoPlan.width}x${videoPlan.height}.${ext}`;
      const url = URL.createObjectURL(outBlob);
      const sizeLabel = formatBytesLabel(outBlob.size);

      if (!settings.autoSaveToGallery && triggerSource === 'export') {
        downloadExportedBlob(outBlob, fileName);
        setExportedVideoResult({
          url,
          blob: outBlob,
          mimeType,
          fileName,
          width: videoPlan.width,
          height: videoPlan.height,
          fps: videoPlan.fps,
          bitrateMbps: videoPlan.bitrateMbps,
          sizeLabel,
        });
        setVideoExportProgress(100);
        onRecordExport?.({
          id: `exp-vid-${Date.now()}`,
          projectId: sessionProjectIdRef.current,
          fileName,
          mediaType: 'video',
          format: ext,
          resolutionLabel: `${videoPlan.width}×${videoPlan.height} @ ${videoPlan.fps}fps`,
          width: videoPlan.width,
          height: videoPlan.height,
          frameRate: videoPlan.fps,
          fileSizeBytes: outBlob.size,
          status: 'completed',
          galleryDelivery: 'skipped-disabled',
          galleryLocationLabel: 'Manual Browser Download (Auto-Save OFF)',
          createdAt: new Date().toISOString(),
        });
        return;
      }

      setGallerySaving(true);
      setGalleryProgress(80);
      setGalleryStage(`Saving ${ext.toUpperCase()} to Gallery...`);
      const gRes = await saveMediaToGallery({
        blob: outBlob,
        fileName,
        mimeType,
        mediaType: 'video',
        format: ext,
        width: videoPlan.width,
        height: videoPlan.height,
        frameRate: videoPlan.fps,
        projectId: sessionProjectIdRef.current,
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
        setExportedVideoResult({
          url,
          blob: outBlob,
          mimeType,
          fileName,
          width: videoPlan.width,
          height: videoPlan.height,
          fps: videoPlan.fps,
          bitrateMbps: videoPlan.bitrateMbps,
          sizeLabel,
        });
        setVideoExportProgress(100);
      } else {
        URL.revokeObjectURL(url);
        if (gRes.error) setExportError(gRes.error);
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Video export failed.');
    } finally {
      releaseCanvasMemory(exportCanvas);
      releaseCanvasMemory(scratch);
      setIsExportingVideo(false);
      setGallerySaving(false);
    }
  };

  const activePresetMeta = CINEMATIC_GRADE_PRESETS.find((p) => p.id === gradeState.presetId);

  return (
    <div className="space-y-4 pb-24 lg:pb-10">
      <input
        ref={videoFileInputRef}
        type="file"
        accept="video/*"
        onChange={handleImportVideo}
        className="hidden"
      />

      {/* Mode Switcher + Photo Asset Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-[#0B0D18]/90 border border-amber-400/20 p-3">
        <div className="flex items-center gap-1.5 bg-[#06070B] border border-white/10 rounded-xl p-1">
          <button
            type="button"
            onClick={() => {
              setIsVideoPlaying(false);
              setMediaMode('photo');
            }}
            className={`min-h-[40px] px-3.5 rounded-lg text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors ${
              mediaMode === 'photo'
                ? 'bg-gradient-to-r from-violet-600/80 to-amber-500/80 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Photo Color Grading</span>
          </button>
          <button
            type="button"
            onClick={() => setMediaMode('video')}
            className={`min-h-[40px] px-3.5 rounded-lg text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors ${
              mediaMode === 'video'
                ? 'bg-gradient-to-r from-violet-600/80 to-amber-500/80 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Video Color Grading</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleUndo}
            disabled={!canUndo}
            className="min-h-[40px] px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] disabled:opacity-35 border border-white/10 text-xs text-slate-200 flex items-center gap-1.5 cursor-pointer"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Undo</span>
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={!canRedo}
            className="min-h-[40px] px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] disabled:opacity-35 border border-white/10 text-xs text-slate-200 flex items-center gap-1.5 cursor-pointer"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="w-3.5 h-3.5" />
            <span>Redo</span>
          </button>
          <button
            type="button"
            onClick={handleResetAll}
            className="min-h-[40px] px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs text-slate-200 flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-300" />
            <span>Reset All</span>
          </button>
          <button
            type="button"
            onClick={handleSaveProject}
            className="min-h-[40px] px-3.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 text-xs font-semibold text-amber-200 flex items-center gap-1.5 cursor-pointer"
          >
            {savedNotice ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Save className="w-3.5 h-3.5" />}
            <span>{savedNotice ? 'Saved' : 'Save Project'}</span>
          </button>
        </div>
      </div>

      <GallerySaveBanner
        saving={gallerySaving}
        progressPct={galleryProgress}
        stageLabel={galleryStage}
        result={galleryResult}
        onSaveCopyAnyway={() =>
          lastGalleryTarget === 'video' ? handleExportVideo(true) : handleExportPhoto(true)
        }
        onDismiss={() => setGalleryResult(null)}
      />

      {mediaMode === 'photo' ? (
        <AssetPickerBar activeImageUrl={imageUrl} onSelectImage={onChangeImage} />
      ) : (
        <div className="rounded-2xl bg-[#0B0D18]/85 border border-white/10 p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white truncate">{videoMeta.name}</p>
            <p className="text-[11px] font-mono-tabular text-amber-300">
              Native {videoMeta.width}×{videoMeta.height} · {videoMeta.fps} fps · {videoMeta.duration.toFixed(1)}s
              {videoMeta.isSampleImageReel ? ' · Sample Cinema Frame' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => videoFileInputRef.current?.click()}
            className="min-h-[42px] px-4 rounded-xl bg-gradient-to-r from-violet-600 to-amber-500 hover:brightness-110 text-xs font-semibold text-white flex items-center gap-2 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import Video From Device</span>
          </button>
        </div>
      )}

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Viewport Canvas */}
        <div className="lg:col-span-7 xl:col-span-8 rounded-2xl bg-[#080A12] border border-white/10 p-3 sm:p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-slate-300 min-w-0">
              <span className="font-semibold text-white truncate">
                {activePresetMeta?.name || 'Custom Grade'}
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="font-mono-tabular text-amber-300">
                {mediaMode === 'photo'
                  ? `${imgDims.w} × ${imgDims.h} px`
                  : `${videoMeta.width} × ${videoMeta.height} px`}
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="font-mono-tabular text-violet-300">{gradeState.presetIntensity}%</span>
            </div>

            {mediaMode === 'photo' ? (
              <div className="flex items-center gap-1 bg-[#05060B] border border-white/10 rounded-xl p-1">
                {(['graded', 'split', 'original'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setCompareMode(m)}
                    className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer ${
                      compareMode === m
                        ? 'bg-amber-400/20 text-amber-200 border border-amber-400/40'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {m === 'split' && <Eye className="w-3 h-3" />}
                    <span>{m === 'graded' ? 'Graded' : m === 'split' ? 'Compare Split' : 'Original'}</span>
                  </button>
                ))}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setVideoSplitCompare((v) => !v)}
                className={`min-h-[36px] px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                  videoSplitCompare
                    ? 'bg-amber-400/20 border-amber-400/60 text-amber-200'
                    : 'bg-white/[0.05] border-white/10 text-slate-300'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{videoSplitCompare ? 'Split Compare ON' : 'Compare Split'}</span>
              </button>
            )}
          </div>

          {mediaMode === 'photo' ? (
            <div className="min-h-[300px] sm:min-h-[450px] rounded-xl bg-[#040509] border border-white/[0.06] flex items-center justify-center p-2 overflow-hidden">
              {compareMode === 'split' && afterDataUrl ? (
                <div className="w-full h-[380px] sm:h-[480px]">
                  <BeforeAfterSlider
                    beforeSrc={imageUrl}
                    afterSrc={afterDataUrl}
                    beforeLabel="Original"
                    afterLabel="Color Graded"
                    enableZoom
                  />
                </div>
              ) : (
                <canvas
                  ref={previewCanvasRef}
                  className="max-w-full max-h-[520px] object-contain rounded-lg"
                />
              )}
              {compareMode === 'split' && (
                <canvas ref={previewCanvasRef} className="hidden" />
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative min-h-[260px] sm:min-h-[400px] rounded-xl bg-[#040509] border border-white/[0.06] flex items-center justify-center p-2 overflow-hidden">
                <canvas
                  ref={videoCanvasRef}
                  className="max-w-full max-h-[460px] object-contain rounded-lg"
                />
                {videoSplitCompare && (
                  <>
                    <span className="absolute top-3 left-3 text-[11px] bg-black/75 border border-white/15 px-2 py-0.5 rounded text-slate-200 pointer-events-none">
                      Original
                    </span>
                    <span className="absolute top-3 right-3 text-[11px] bg-black/75 border border-amber-400/35 px-2 py-0.5 rounded text-amber-300 pointer-events-none">
                      Graded
                    </span>
                  </>
                )}
              </div>

              {videoSplitCompare && (
                <div className="px-1">
                  <SliderControl
                    label="Video Split Curtain Position"
                    value={videoSplitPct}
                    min={5}
                    max={95}
                    defaultValue={50}
                    unit="%"
                    onChange={setVideoSplitPct}
                  />
                </div>
              )}

              {/* Video Transport & Timeline Scrubber */}
              <div className="rounded-xl bg-[#06070E] border border-white/10 p-3 flex flex-col sm:flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsVideoPlaying((p) => !p)}
                  className="w-full sm:w-auto min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-violet-600 to-amber-500 text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer shrink-0"
                >
                  {isVideoPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  <span>{isVideoPlaying ? 'Pause' : 'Play Graded'}</span>
                </button>
                <div className="flex-1 w-full flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={videoMeta.duration}
                    step={0.04}
                    value={videoTime}
                    onChange={(e) => {
                      setIsVideoPlaying(false);
                      setVideoTime(Number(e.target.value));
                    }}
                    className="flex-1 accent-amber-400 cursor-pointer h-6"
                    aria-label="Seek video frame"
                  />
                  <span className="text-xs font-mono-tabular text-slate-300 shrink-0">
                    {formatTimecode(videoTime)} / {formatTimecode(videoMeta.duration)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Quick Master Intensity Strip directly under preview */}
          <div className="rounded-xl bg-[#060812] border border-white/[0.07] px-3 py-2">
            <SliderControl
              label="Master Grade & Preset Intensity"
              value={gradeState.presetIntensity}
              min={0}
              max={100}
              defaultValue={100}
              unit="%"
              onChange={(v) => updateGrade((s) => ({ ...s, presetIntensity: v }))}
            />
          </div>
        </div>

        {/* Right Inspector Panels */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          {/* Inspector Navigation Tabs */}
          <div className="rounded-2xl bg-[#0B0D18]/90 backdrop-blur-xl border border-white/10 p-2 grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-3 gap-1.5">
            {INSPECTOR_TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`min-h-[42px] px-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    active
                      ? 'bg-gradient-to-r from-violet-600/35 to-amber-500/25 border-amber-400/60 text-white'
                      : 'bg-[#06070B] border-white/[0.06] text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.icon}
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl bg-[#0B0D18]/90 backdrop-blur-xl border border-white/10 p-4 space-y-4">
            {/* PRESETS TAB */}
            {activeTab === 'presets' && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xs font-semibold text-white">10 Cinematic Presets</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Applies full curve, wheel &amp; color tone matrices locally.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {CINEMATIC_GRADE_PRESETS.map((preset) => {
                    const active = gradeState.presetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectPreset(preset.id)}
                        className={`min-h-[58px] rounded-xl border p-2.5 text-left transition-all cursor-pointer flex flex-col justify-between gap-1 ${
                          active
                            ? 'bg-gradient-to-br from-violet-600/25 to-amber-500/20 border-amber-400/75'
                            : 'bg-[#06070D] border-white/10 hover:border-white/25'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="text-xs font-semibold text-white truncate">
                            {preset.name}
                          </span>
                          <span
                            className="w-3 h-3 rounded-full shrink-0 border border-white/30"
                            style={{ backgroundColor: preset.accentColor }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-400 line-clamp-1">
                          {preset.description}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Save Custom Preset */}
                <div className="pt-3 border-t border-white/[0.08] space-y-2.5">
                  <h3 className="text-xs font-semibold text-amber-200">Save Custom Preset</h3>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={customPresetName}
                      onChange={(e) => setCustomPresetName(e.target.value)}
                      placeholder="Preset name (e.g. Dusk Velvet)"
                      className="flex-1 min-h-[42px] px-3 rounded-xl bg-[#05060B] border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400/60"
                    />
                    <button
                      type="button"
                      onClick={handleSaveCustomPreset}
                      className="min-h-[42px] px-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-amber-500 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      {presetSavedFlash ? <Check className="w-3.5 h-3.5" /> : <BookmarkPlus className="w-3.5 h-3.5" />}
                      <span>{presetSavedFlash ? 'Saved' : 'Save'}</span>
                    </button>
                  </div>

                  {customPresets.length > 0 && (
                    <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                      {customPresets.map((cp) => (
                        <div
                          key={cp.id}
                          className="flex items-center justify-between gap-2 rounded-xl bg-[#06070D] border border-white/10 px-3 py-2"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              const loaded = cloneGradeState(cp.state);
                              setGradeState(loaded);
                              pushHistory(loaded);
                            }}
                            className="flex-1 text-left text-xs font-medium text-white hover:text-amber-300 truncate cursor-pointer"
                          >
                            {cp.name}
                          </button>
                          <button
                            type="button"
                            onClick={() => setCustomPresets(deleteCustomColorPreset(cp.id))}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer"
                            aria-label={`Delete ${cp.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TONE TAB */}
            {activeTab === 'tone' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-xs font-semibold text-white">Tone, Dynamic Range &amp; Gamma</h2>
                  <button
                    type="button"
                    onClick={() =>
                      updateGrade(
                        (s) => ({
                          ...s,
                          exposure: 0,
                          brightness: 0,
                          contrast: 0,
                          highlights: 0,
                          shadows: 0,
                          whites: 0,
                          blacks: 0,
                          gamma: 1.0,
                        }),
                        true
                      )
                    }
                    className="text-[11px] text-amber-300 hover:underline cursor-pointer"
                  >
                    Reset Tone
                  </button>
                </div>
                <SliderControl label="Exposure" value={gradeState.exposure} min={-50} max={50} defaultValue={0} onChange={(v) => updateGrade((s) => ({ ...s, exposure: v }))} />
                <SliderControl label="Brightness" value={gradeState.brightness} min={-50} max={50} defaultValue={0} onChange={(v) => updateGrade((s) => ({ ...s, brightness: v }))} />
                <SliderControl label="Contrast" value={gradeState.contrast} min={-50} max={50} defaultValue={0} onChange={(v) => updateGrade((s) => ({ ...s, contrast: v }))} />
                <SliderControl label="Highlights" value={gradeState.highlights} min={-50} max={50} defaultValue={0} onChange={(v) => updateGrade((s) => ({ ...s, highlights: v }))} />
                <SliderControl label="Shadows" value={gradeState.shadows} min={-50} max={50} defaultValue={0} onChange={(v) => updateGrade((s) => ({ ...s, shadows: v }))} />
                <SliderControl label="Whites" value={gradeState.whites} min={-50} max={50} defaultValue={0} onChange={(v) => updateGrade((s) => ({ ...s, whites: v }))} />
                <SliderControl label="Blacks" value={gradeState.blacks} min={-50} max={50} defaultValue={0} onChange={(v) => updateGrade((s) => ({ ...s, blacks: v }))} />
                <SliderControl label="Gamma" value={gradeState.gamma} min={0.5} max={2.2} step={0.02} defaultValue={1.0} onChange={(v) => updateGrade((s) => ({ ...s, gamma: v }))} />
              </div>
            )}

            {/* RGB & HSL COLOR TAB */}
            {activeTab === 'color' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-white">Temperature, HSL &amp; RGB Channels</h2>
                  <button
                    type="button"
                    onClick={() =>
                      updateGrade(
                        (s) => ({
                          ...s,
                          temperature: 0,
                          tint: 0,
                          saturation: 0,
                          hueShift: 0,
                          hslSaturation: 0,
                          hslLightness: 0,
                          redAdjust: 0,
                          greenAdjust: 0,
                          blueAdjust: 0,
                        }),
                        true
                      )
                    }
                    className="text-[11px] text-amber-300 hover:underline cursor-pointer"
                  >
                    Reset Color
                  </button>
                </div>

                <div className="space-y-1.5">
                  <SliderControl label="Temperature" value={gradeState.temperature} min={-50} max={50} defaultValue={0} onChange={(v) => updateGrade((s) => ({ ...s, temperature: v }))} />
                  <SliderControl label="Tint" value={gradeState.tint} min={-50} max={50} defaultValue={0} onChange={(v) => updateGrade((s) => ({ ...s, tint: v }))} />
                  <SliderControl label="Saturation" value={gradeState.saturation} min={-100} max={100} defaultValue={0} onChange={(v) => updateGrade((s) => ({ ...s, saturation: v }))} />
                </div>

                <div className="pt-2 border-t border-white/[0.08] space-y-1.5">
                  <p className="text-[11px] font-semibold text-violet-300">HSL Color Controls</p>
                  <SliderControl label="HSL Hue" value={gradeState.hueShift} min={-180} max={180} defaultValue={0} unit="°" onChange={(v) => updateGrade((s) => ({ ...s, hueShift: v }))} />
                  <SliderControl label="HSL Saturation" value={gradeState.hslSaturation} min={-100} max={100} defaultValue={0} onChange={(v) => updateGrade((s) => ({ ...s, hslSaturation: v }))} />
                  <SliderControl label="HSL Lightness" value={gradeState.hslLightness} min={-50} max={50} defaultValue={0} onChange={(v) => updateGrade((s) => ({ ...s, hslLightness: v }))} />
                </div>

                <div className="pt-2 border-t border-white/[0.08] space-y-1.5">
                  <p className="text-[11px] font-semibold text-amber-300">RGB Channel Balance</p>
                  <SliderControl label="Red Channel" value={gradeState.redAdjust} min={-50} max={50} defaultValue={0} onChange={(v) => updateGrade((s) => ({ ...s, redAdjust: v }))} />
                  <SliderControl label="Green Channel" value={gradeState.greenAdjust} min={-50} max={50} defaultValue={0} onChange={(v) => updateGrade((s) => ({ ...s, greenAdjust: v }))} />
                  <SliderControl label="Blue Channel" value={gradeState.blueAdjust} min={-50} max={50} defaultValue={0} onChange={(v) => updateGrade((s) => ({ ...s, blueAdjust: v }))} />
                </div>
              </div>
            )}

            {/* SVG RGB CURVES TAB */}
            {activeTab === 'curves' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-white">RGB Tone Curves &amp; Histogram</h2>
                  <button
                    type="button"
                    onClick={() =>
                      updateGrade(
                        (s) => ({
                          ...s,
                          curves: cloneGradeState(DEFAULT_COLOR_GRADING_STATE).curves,
                        }),
                        true
                      )
                    }
                    className="text-[11px] text-amber-300 hover:underline cursor-pointer"
                  >
                    Reset All Curves
                  </button>
                </div>
                <RgbCurvesControl
                  curves={gradeState.curves}
                  histogram={histogram}
                  onChange={(nextCurves) =>
                    setGradeState((s) => ({ ...s, curves: nextCurves }))
                  }
                  onCommit={(nextCurves) =>
                    updateGrade((s) => ({ ...s, curves: nextCurves }), true)
                  }
                />
              </div>
            )}

            {/* 3-WAY COLOR WHEELS + FINISHING TAB */}
            {activeTab === 'wheels' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-white">3-Way Color Wheels &amp; Finish</h2>
                  <button
                    type="button"
                    onClick={() =>
                      updateGrade(
                        (s) => ({
                          ...s,
                          wheels: cloneGradeState(DEFAULT_COLOR_GRADING_STATE).wheels,
                          vignette: 0,
                          grain: 0,
                          sharpness: 0,
                        }),
                        true
                      )
                    }
                    className="text-[11px] text-amber-300 hover:underline cursor-pointer"
                  >
                    Reset Wheels
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 gap-2.5">
                  <ColorWheelControl
                    title="Lift"
                    subtitle="Shadows"
                    value={gradeState.wheels.lift}
                    accentHex="#38BDF8"
                    onChange={(vec) =>
                      setGradeState((s) => ({
                        ...s,
                        wheels: { ...s.wheels, lift: vec },
                      }))
                    }
                    onCommit={(vec) =>
                      updateGrade(
                        (s) => ({ ...s, wheels: { ...s.wheels, lift: vec } }),
                        true
                      )
                    }
                  />
                  <ColorWheelControl
                    title="Gamma"
                    subtitle="Midtones"
                    value={gradeState.wheels.gamma}
                    accentHex="#A855F7"
                    onChange={(vec) =>
                      setGradeState((s) => ({
                        ...s,
                        wheels: { ...s.wheels, gamma: vec },
                      }))
                    }
                    onCommit={(vec) =>
                      updateGrade(
                        (s) => ({ ...s, wheels: { ...s.wheels, gamma: vec } }),
                        true
                      )
                    }
                  />
                  <ColorWheelControl
                    title="Gain"
                    subtitle="Highlights"
                    value={gradeState.wheels.gain}
                    accentHex="#D4AF37"
                    onChange={(vec) =>
                      setGradeState((s) => ({
                        ...s,
                        wheels: { ...s.wheels, gain: vec },
                      }))
                    }
                    onCommit={(vec) =>
                      updateGrade(
                        (s) => ({ ...s, wheels: { ...s.wheels, gain: vec } }),
                        true
                      )
                    }
                  />
                </div>

                <div className="pt-2 border-t border-white/[0.08] space-y-1.5">
                  <p className="text-[11px] font-semibold text-amber-300">Optical Finish</p>
                  <SliderControl label="Vignette" value={gradeState.vignette} min={0} max={100} defaultValue={0} unit="%" onChange={(v) => updateGrade((s) => ({ ...s, vignette: v }))} />
                  <SliderControl label="Film Grain" value={gradeState.grain} min={0} max={60} defaultValue={0} unit="%" onChange={(v) => updateGrade((s) => ({ ...s, grain: v }))} />
                  <SliderControl label="Sharpening" value={gradeState.sharpness} min={0} max={100} defaultValue={0} unit="%" onChange={(v) => updateGrade((s) => ({ ...s, sharpness: v }))} />
                </div>
              </div>
            )}

            {/* EXPORT TAB */}
            {activeTab === 'export' && (
              <div className="space-y-4">
                {mediaMode === 'photo' ? (
                  <>
                    <div>
                      <h2 className="text-xs font-semibold text-white">Full-Resolution Photo Export</h2>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Renders every color curve, wheel &amp; sharpening pass at exact source dimensions ({imgDims.w}×{imgDims.h} px).
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {(['jpg', 'png', 'webp'] as const).map((fmt) => {
                        const supported = formatSupport[fmt];
                        const active = exportFormat === fmt;
                        return (
                          <button
                            key={fmt}
                            type="button"
                            disabled={!supported}
                            onClick={() => setExportFormat(fmt)}
                            className={`min-h-[44px] rounded-xl border text-xs font-semibold cursor-pointer disabled:opacity-35 ${
                              active
                                ? 'bg-amber-400/20 border-amber-400/70 text-amber-200'
                                : 'bg-[#06070D] border-white/10 text-slate-300'
                            }`}
                          >
                            {fmt.toUpperCase()}
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-1.5">
                      {(['original', 'high', 'maximum', 'custom'] as const).map((tier) => (
                        <button
                          key={tier}
                          type="button"
                          onClick={() => setQualityPreset(tier)}
                          className={`min-h-[40px] px-2.5 rounded-xl border text-xs font-semibold capitalize cursor-pointer ${
                            qualityPreset === tier
                              ? 'bg-violet-600/30 border-violet-400/70 text-white'
                              : 'bg-[#06070D] border-white/10 text-slate-400'
                          }`}
                        >
                          {tier}
                        </button>
                      ))}
                    </div>

                    {qualityPreset === 'custom' && exportFormat !== 'png' && (
                      <SliderControl
                        label="Export Quality"
                        value={customQualityPct}
                        min={50}
                        max={100}
                        defaultValue={95}
                        unit="%"
                        onChange={setCustomQualityPct}
                      />
                    )}

                    <div className="rounded-xl bg-[#06070D] border border-white/10 p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between text-slate-300">
                        <span>Output Resolution</span>
                        <span className="font-mono-tabular text-amber-300">
                          {photoPlan.outputWidth} × {photoPlan.outputHeight} px
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-300">
                        <span>Encoding Quality</span>
                        <span className="font-mono-tabular text-white">
                          {exportFormat === 'png' ? '100% Lossless PNG' : `${photoPlan.qualityPercent}%`}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isExportingPhoto}
                      onClick={() => handleExportPhoto(false, 'export')}
                      className="w-full min-h-[48px] rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-amber-500 hover:brightness-110 disabled:opacity-50 text-xs sm:text-sm font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>
                        {isExportingPhoto
                          ? 'Rendering Full-Resolution Grade...'
                          : `Export Graded ${exportFormat.toUpperCase()}`}
                      </span>
                    </button>

                    {photoExportResult && (
                      <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/35 p-3 space-y-2 text-xs">
                        <div className="flex items-center justify-between text-emerald-200 font-semibold">
                          <span>Export Complete</span>
                          <span className="font-mono-tabular">{photoExportResult.sizeLabel}</span>
                        </div>
                        <p className="text-[11px] font-mono-tabular text-slate-300">
                          {photoExportResult.width}×{photoExportResult.height} px · {photoExportResult.qualityLabel}
                        </p>
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() =>
                              downloadExportedBlob(photoExportResult.blob, photoExportResult.fileName)
                            }
                            className="flex-1 min-h-[38px] rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-white flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Save Again</span>
                          </button>
                          {isWebShareFilesSupported() && (
                            <button
                              type="button"
                              onClick={() =>
                                shareExportedBlob(
                                  photoExportResult.blob,
                                  photoExportResult.fileName,
                                  photoExportResult.mimeType
                                )
                              }
                              className="flex-1 min-h-[38px] rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-amber-200 flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                              <span>Share</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div>
                      <h2 className="text-xs font-semibold text-white">Video Color Grade Export</h2>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Preserves source resolution &amp; FPS without fake 4K upscaling.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-1.5">
                      {(['original', '720p', '1080p', '4k'] as const).map((res) => (
                        <button
                          key={res}
                          type="button"
                          onClick={() => setVideoResolution(res)}
                          className={`min-h-[40px] px-2 rounded-xl border text-xs font-semibold uppercase cursor-pointer ${
                            videoResolution === res
                              ? 'bg-amber-400/20 border-amber-400/70 text-amber-200'
                              : 'bg-[#06070D] border-white/10 text-slate-400'
                          }`}
                        >
                          {res === 'original' ? 'Original' : res}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      {(['original', 'high', 'maximum'] as const).map((tier) => (
                        <button
                          key={tier}
                          type="button"
                          onClick={() => setVideoQualityTier(tier)}
                          className={`min-h-[40px] px-2 rounded-xl border text-xs font-semibold capitalize cursor-pointer ${
                            videoQualityTier === tier
                              ? 'bg-violet-600/30 border-violet-400/70 text-white'
                              : 'bg-[#06070D] border-white/10 text-slate-400'
                          }`}
                        >
                          {tier}
                        </button>
                      ))}
                    </div>

                    {videoPlan.warningNote && (
                      <div className="rounded-xl bg-amber-500/10 border border-amber-400/35 p-2.5 text-[11px] text-amber-200 leading-relaxed">
                        {videoPlan.warningNote}
                      </div>
                    )}

                    <div className="rounded-xl bg-[#06070D] border border-white/10 p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between text-slate-300">
                        <span>Output Dimensions</span>
                        <span className="font-mono-tabular text-amber-300">
                          {videoPlan.width} × {videoPlan.height} px
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-300">
                        <span>Frame Rate &amp; Bitrate</span>
                        <span className="font-mono-tabular text-white">
                          {videoPlan.fps} fps · {videoPlan.bitrateMbps} Mbps
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-300">
                        <span>Container Support</span>
                        <span className="font-mono-tabular text-violet-300">
                          {videoPlan.mp4Supported
                            ? 'MP4 Native'
                            : videoPlan.webmSupported
                              ? 'WebM Native'
                              : 'Unsupported'}
                        </span>
                      </div>
                    </div>

                    {isExportingVideo ? (
                      <div className="space-y-2">
                        <div className="h-2.5 rounded-full bg-[#05060B] overflow-hidden border border-white/10">
                          <div
                            className="h-full bg-gradient-to-r from-violet-500 to-amber-400 transition-all"
                            style={{ width: `${videoExportProgress}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-300">
                          <span>Encoding Graded Video ({videoExportProgress}%)</span>
                          <button
                            type="button"
                            onClick={() => {
                              exportAbortRef.current = true;
                            }}
                            className="text-rose-300 hover:underline cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={!videoPlan.codecSupported}
                        onClick={() => handleExportVideo(false, 'export')}
                        className="w-full min-h-[48px] rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-amber-500 hover:brightness-110 disabled:opacity-40 text-xs sm:text-sm font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        <span>
                          {videoPlan.codecSupported
                            ? `Export Graded ${videoPlan.mp4Supported ? 'MP4' : 'WebM'}`
                            : 'Video Recording Unsupported in This Browser'}
                        </span>
                      </button>
                    )}

                    {exportedVideoResult && (
                      <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/35 p-3 space-y-2 text-xs">
                        <div className="flex items-center justify-between text-emerald-200 font-semibold">
                          <span>Video Export Ready</span>
                          <span className="font-mono-tabular">{exportedVideoResult.sizeLabel}</span>
                        </div>
                        <p className="text-[11px] font-mono-tabular text-slate-300">
                          {exportedVideoResult.width}×{exportedVideoResult.height} · {exportedVideoResult.fps}fps · {exportedVideoResult.bitrateMbps} Mbps
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            downloadExportedBlob(exportedVideoResult.blob, exportedVideoResult.fileName)
                          }
                          className="w-full min-h-[40px] rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-white flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download Video File</span>
                        </button>
                      </div>
                    )}
                  </>
                )}

                {exportError && (
                  <div className="rounded-xl bg-rose-500/15 border border-rose-400/40 p-2.5 text-xs text-rose-200">
                    {exportError}
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
