import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  Rewind,
  FastForward,
  Upload,
  Download,
  Wand2,
  Volume2,
  VolumeX,
  Scissors,
  AlertCircle,
  Undo2,
  Redo2,
  Sliders,
  Palette,
  Gauge,
  Sparkles,
  Type as TypeIcon,
  Music,
  Layers,
  Plus,
  Trash2,
  ArrowLeft,
  ArrowRight,
  Copy,
  X,
  Save,
  Check,
  Image as ImageIcon,
  MonitorPlay,
  Info,
  Zap,
  Share2,
} from 'lucide-react';
import { STUDIO_ASSETS, STUDIO_FONTS, STUDIO_OVERLAYS } from '../../data/studioCatalog';
import { AppSettings, DEFAULT_SETTINGS, ExportRecord, ProjectItem } from '../../types/editor';
import {
  BuiltInSynthTrack,
  ExportResolution,
  TitleAnimation,
  TransitionType,
  VideoAspect,
  VideoClip,
  VideoContainerFormat,
  VideoOverlayKind,
  VideoOverlayLayer,
  VideoQualityTier,
  VideoTextItem,
  VideoTimelineState,
} from '../../types/video';
import {
  VIDEO_FILTER_PRESETS,
  computeAudioFadeMultiplier,
  detectVideoExportCapabilities,
  findActiveClipAtTime,
  formatTimecode,
  getClipEffectiveDuration,
  getExportSpec,
  getGrainPatternCanvas,
  getTotalTimelineDuration,
  startSynthSoundtrack,
} from '../../utils/videoEngine';
import { createThumbnailDataUrl } from '../../utils/canvasEngine';
import { downloadExportedBlob, shareExportedBlob } from '../../utils/exportEngine';
import { releaseCanvasMemory, resolveHdVideoExportPlan } from '../../utils/hdQualityEngine';
import { GallerySaveResult, saveMediaToGallery } from '../../utils/gallerySaveEngine';
import { GallerySaveBanner } from '../GallerySaveBanner';
import { SliderControl } from '../SliderControl';

interface VideoEditorStudioProps {
  initialTimeline?: VideoTimelineState;
  activeProjectId?: string;
  autoSaveEnabled?: boolean;
  settings?: AppSettings;
  onSaveProject?: (project: ProjectItem) => Promise<boolean> | void;
  onAutoSaveProject?: (project: ProjectItem) => Promise<boolean>;
  onRecordExport?: (record: ExportRecord) => Promise<void>;
  onTimelineChange?: (timeline: VideoTimelineState) => void;
}

type VideoInspectorTab = 'color' | 'filters' | 'fx' | 'speed' | 'transitions' | 'text' | 'overlays' | 'audio' | 'ai';

const INITIAL_CLIPS: VideoClip[] = [
  {
    id: 'clip-demo-1',
    name: 'Pacific Twilight Coast',
    sourceType: 'studio-reel',
    src: STUDIO_ASSETS[4].url,
    nativeDuration: 6,
    nativeWidth: 1920,
    nativeHeight: 1080,
    nativeFps: 30,
    trimStart: 0,
    trimEnd: 6,
    speed: 1,
    slowMoBlur: false,
    volume: 100,
    brightness: 0,
    contrast: 10,
    saturation: 8,
    temperature: 0,
    vignette: 26,
    grain: 0,
    glitch: 0,
    rgbSplit: 0,
    filterId: 'anamorphic',
    transitionOut: 'crossfade',
    transitionDuration: 0.8,
  },
  {
    id: 'clip-demo-2',
    name: 'Obsidian Studio Frame',
    sourceType: 'studio-reel',
    src: STUDIO_ASSETS[0].url,
    nativeDuration: 5,
    nativeWidth: 1920,
    nativeHeight: 1080,
    nativeFps: 30,
    trimStart: 0,
    trimEnd: 5,
    speed: 1,
    slowMoBlur: false,
    volume: 100,
    brightness: 2,
    contrast: 12,
    saturation: 6,
    temperature: 8,
    vignette: 32,
    grain: 0,
    glitch: 0,
    rgbSplit: 0,
    filterId: 'obsidian-gold',
    transitionOut: 'none',
    transitionDuration: 0.7,
  },
];

const INITIAL_TEXTS: VideoTextItem[] = [
  {
    id: 'vtxt-1',
    kind: 'title',
    text: 'DIPTI CINEMA REEL',
    startTime: 0.4,
    endTime: 4.5,
    position: 'bottom',
    fontFamily: "'Syne', sans-serif",
    fontSize: 54,
    color: '#F8FAFC',
    animation: 'fade-up',
  },
  {
    id: 'vtxt-2',
    kind: 'subtitle',
    text: 'Shot on Studio Mobile · Color Graded',
    startTime: 5.5,
    endTime: 10.2,
    position: 'bottom',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontSize: 32,
    color: '#FCD34D',
    animation: 'slide-in',
  },
];

const INITIAL_STATE: VideoTimelineState = {
  clips: INITIAL_CLIPS,
  texts: INITIAL_TEXTS,
  overlays: [
    {
      id: 'vov-1',
      kind: 'golden-flare',
      label: 'Golden Flare',
      startTime: 0,
      endTime: 6,
      opacity: 40,
    },
  ],
  audio: {
    mode: 'none',
    name: 'No Audio Track',
    synthPreset: 'none',
    volume: 75,
    muted: false,
    fadeIn: 0.5,
    fadeOut: 1.0,
  },
  aspect: '16:9',
  resolution: 'original',
  qualityTier: 'high',
  customBitrateMbps: 14,
  exportFormat: 'auto',
  frameRate: 30,
};

export function createDefaultVideoTimeline(): VideoTimelineState {
  return cloneTimelineState(INITIAL_STATE);
}

function cloneTimelineState(s: VideoTimelineState): VideoTimelineState {
  return {
    clips: s.clips.map((c) => ({ ...c })),
    texts: s.texts.map((t) => ({ ...t })),
    overlays: (s.overlays ?? []).map((o) => ({ ...o })),
    audio: { ...s.audio },
    aspect: s.aspect,
    resolution: s.resolution,
    qualityTier: s.qualityTier ?? 'high',
    customBitrateMbps: s.customBitrateMbps ?? 14,
    exportFormat: s.exportFormat ?? 'auto',
    frameRate: s.frameRate ?? 30,
  };
}

function loadVideoMeta(src: string): Promise<{ duration: number; width: number; height: number; el: HTMLVideoElement }> {
  return new Promise((resolve, reject) => {
    const vid = document.createElement('video');
    vid.src = src;
    vid.playsInline = true;
    vid.muted = true;
    vid.preload = 'auto';
    vid.onloadedmetadata = () => {
      const dur = Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration : 8;
      resolve({
        duration: dur,
        width: vid.videoWidth || 1280,
        height: vid.videoHeight || 720,
        el: vid,
      });
    };
    vid.onerror = () => reject(new Error('Could not decode video file.'));
  });
}

function resizeOverlayImage(dataUrl: string, maxDim = 640): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export const VideoEditorStudio: React.FC<VideoEditorStudioProps> = ({
  initialTimeline,
  activeProjectId,
  autoSaveEnabled = true,
  settings = DEFAULT_SETTINGS,
  onSaveProject,
  onAutoSaveProject,
  onRecordExport,
  onTimelineChange,
}) => {
  const startState = initialTimeline ? cloneTimelineState(initialTimeline) : cloneTimelineState(INITIAL_STATE);
  const [history, setHistory] = useState<VideoTimelineState[]>([startState]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const [state, setState] = useState<VideoTimelineState>(cloneTimelineState(startState));

  const [selectedClipId, setSelectedClipId] = useState<string>(startState.clips[0]?.id || INITIAL_CLIPS[0].id);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(startState.texts[0]?.id ?? null);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(startState.overlays?.[0]?.id ?? null);
  const [activeTab, setActiveTab] = useState<VideoInspectorTab>('color');

  const [isPlaying, setIsPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [masterMuted, setMasterMuted] = useState(false);
  const [finalPreviewOpen, setFinalPreviewOpen] = useState(false);
  const [exportedVideo, setExportedVideo] = useState<{
    url: string;
    blob: Blob;
    mimeType: string;
    ext: 'mp4' | 'webm';
    sizeLabel: string;
    fileName: string;
    width: number;
    height: number;
    fps: number;
  } | null>(null);
  const [videoShareNote, setVideoShareNote] = useState<string | null>(null);

  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [gallerySaving, setGallerySaving] = useState(false);
  const [galleryProgress, setGalleryProgress] = useState(0);
  const [galleryStage, setGalleryStage] = useState<string | null>(null);
  const [galleryResult, setGalleryResult] = useState<GallerySaveResult | null>(null);
  const sessionProjectIdRef = useRef(activeProjectId || `proj-vid-${Date.now()}`);
  if (activeProjectId) sessionProjectIdRef.current = activeProjectId;

  const exportCapabilities = useMemo(() => detectVideoExportCapabilities(), []);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const finalPreviewCanvasRef = useRef<HTMLCanvasElement>(null);
  const prevBlendCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fxScratchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const overlayImageInputRef = useRef<HTMLInputElement>(null);

  const videoMapRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const imageMapRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const synthStopRef = useRef<(() => void) | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const playheadRef = useRef(playhead);
  playheadRef.current = playhead;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const finalPreviewOpenRef = useRef(finalPreviewOpen);
  finalPreviewOpenRef.current = finalPreviewOpen;
  const exportAbortRef = useRef(false);
  const historyIdxRef = useRef(historyIdx);
  historyIdxRef.current = historyIdx;
  const historyTimerRef = useRef<number | null>(null);

  const totalDuration = Math.max(0.5, getTotalTimelineDuration(state.clips));
  const selectedClip = state.clips.find((c) => c.id === selectedClipId) || state.clips[0];
  const selectedText = state.texts.find((t) => t.id === selectedTextId) || state.texts[0] || null;
  const overlays = state.overlays ?? [];
  const selectedOverlay = overlays.find((o) => o.id === selectedOverlayId) || overlays[0] || null;

  useEffect(() => {
    if (initialTimeline) {
      const next = cloneTimelineState(initialTimeline);
      setState(next);
      setHistory([cloneTimelineState(next)]);
      setHistoryIdx(0);
      setSelectedClipId(next.clips[0]?.id || '');
      setSelectedTextId(next.texts[0]?.id ?? null);
      setSelectedOverlayId(next.overlays?.[0]?.id ?? null);
    }
  }, [initialTimeline]);

  useEffect(() => {
    onTimelineChange?.(state);
  }, [state, onTimelineChange]);

  const commitState = useCallback((next: VideoTimelineState) => {
    if (historyTimerRef.current) {
      window.clearTimeout(historyTimerRef.current);
      historyTimerRef.current = null;
    }
    const snap = cloneTimelineState(next);
    setState(snap);
    setHistory((prev) => {
      const nextList = [...prev.slice(0, historyIdxRef.current + 1), snap].slice(-30);
      historyIdxRef.current = nextList.length - 1;
      setHistoryIdx(nextList.length - 1);
      return nextList;
    });
  }, []);

  const liveCommitState = useCallback(
    (next: VideoTimelineState) => {
      setState(next);
      if (historyTimerRef.current) {
        window.clearTimeout(historyTimerRef.current);
      }
      historyTimerRef.current = window.setTimeout(() => {
        commitState(stateRef.current);
      }, 250);
    },
    [commitState]
  );

  const canUndo = historyIdx > 0;
  const canRedo = historyIdx < history.length - 1;

  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    const nextIdx = historyIdx - 1;
    setHistoryIdx(nextIdx);
    setState(cloneTimelineState(history[nextIdx]));
  }, [canUndo, history, historyIdx]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    const nextIdx = historyIdx + 1;
    setHistoryIdx(nextIdx);
    setState(cloneTimelineState(history[nextIdx]));
  }, [canRedo, history, historyIdx]);

  const exportedVideoUrlRef = useRef<string | null>(null);
  exportedVideoUrlRef.current = exportedVideo?.url ?? null;

  useEffect(() => {
    return () => {
      if (historyTimerRef.current) window.clearTimeout(historyTimerRef.current);
      for (const [src, vid] of videoMapRef.current.entries()) {
        vid.pause();
        vid.removeAttribute('src');
        if (src.startsWith('blob:')) URL.revokeObjectURL(src);
      }
      videoMapRef.current.clear();
      if (exportedVideoUrlRef.current) {
        URL.revokeObjectURL(exportedVideoUrlRef.current);
      }
      releaseCanvasMemory(prevBlendCanvasRef.current);
      releaseCanvasMemory(fxScratchCanvasRef.current);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if (e.code === 'Space' && (!target || target.tagName !== 'BUTTON')) {
        e.preventDefault();
        setIsPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleUndo, handleRedo]);

  // Preload demo images, overlay images & video elements whenever clips or overlays change
  useEffect(() => {
    for (const clip of state.clips) {
      if (clip.sourceType === 'studio-reel' && !imageMapRef.current.has(clip.src)) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = clip.src;
        imageMapRef.current.set(clip.src, img);
      } else if (clip.sourceType === 'video' && !videoMapRef.current.has(clip.src)) {
        const vid = document.createElement('video');
        vid.src = clip.src;
        vid.playsInline = true;
        vid.preload = 'auto';
        vid.muted = true;
        videoMapRef.current.set(clip.src, vid);
      }
    }
    for (const ov of state.overlays ?? []) {
      if (ov.kind === 'image' && ov.imageSrc && !imageMapRef.current.has(ov.imageSrc)) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = ov.imageSrc;
        imageMapRef.current.set(ov.imageSrc, img);
      }
    }
  }, [state.clips, state.overlays]);

  // Manage Audio / Music playback synced with isPlaying & live fade-in / fade-out envelope
  useEffect(() => {
    if (synthStopRef.current) {
      synthStopRef.current();
      synthStopRef.current = null;
    }

    if (!isPlaying || masterMuted || state.audio.muted || state.audio.mode === 'none') {
      if (audioElRef.current) audioElRef.current.pause();
      return;
    }

    const fadeMult = computeAudioFadeMultiplier(
      playheadRef.current,
      totalDuration,
      state.audio.fadeIn ?? 0,
      state.audio.fadeOut ?? 0
    );

    if (state.audio.mode === 'file' && state.audio.src) {
      if (!audioElRef.current || audioElRef.current.src !== state.audio.src) {
        audioElRef.current = new Audio(state.audio.src);
      }
      audioElRef.current.volume = Math.max(0, Math.min(1, (state.audio.volume / 100) * fadeMult));
      audioElRef.current.currentTime = playheadRef.current % Math.max(1, audioElRef.current.duration || 60);
      audioElRef.current.play().catch(() => {});
    } else if (state.audio.mode === 'synth' && state.audio.synthPreset !== 'none') {
      try {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioContext();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        synthStopRef.current = startSynthSoundtrack(
          ctx,
          ctx.destination,
          state.audio.synthPreset,
          state.audio.volume * fadeMult
        );
      } catch {
        // ignore audio context failure
      }
    }

    return () => {
      if (synthStopRef.current) {
        synthStopRef.current();
        synthStopRef.current = null;
      }
      if (audioElRef.current) audioElRef.current.pause();
    };
  }, [isPlaying, masterMuted, state.audio, totalDuration]);

  // Dynamically update live audio fade envelope during playback
  useEffect(() => {
    if (!isPlaying || !audioElRef.current || state.audio.mode !== 'file') return;
    const fadeMult = computeAudioFadeMultiplier(
      playhead,
      totalDuration,
      state.audio.fadeIn ?? 0,
      state.audio.fadeOut ?? 0
    );
    audioElRef.current.volume = Math.max(0, Math.min(1, (state.audio.volume / 100) * fadeMult));
  }, [playhead, isPlaying, state.audio, totalDuration]);

  const drawSingleClipFrame = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      clip: VideoClip,
      localTime: number,
      w: number,
      h: number,
      offsetX = 0,
      alpha = 1,
      zoomScale = 1
    ) => {
      const preset = VIDEO_FILTER_PRESETS.find((f) => f.id === clip.filterId);
      const baseCss = preset && preset.cssFilter !== 'none' ? preset.cssFilter : '';
      const bri = 100 + clip.brightness * 1.4;
      const con = 100 + clip.contrast * 1.3;
      const sat = Math.max(0, 100 + clip.saturation * 1.4);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.filter = `${baseCss} brightness(${bri}%) contrast(${con}%) saturate(${sat}%)`.trim();

      if (clip.sourceType === 'video') {
        const vid = videoMapRef.current.get(clip.src);
        if (vid && vid.readyState >= 2) {
          if (Math.abs(vid.currentTime - localTime) > 0.14) {
            vid.currentTime = localTime;
          }
          const scale = Math.max(w / vid.videoWidth, h / vid.videoHeight) * zoomScale;
          const dw = vid.videoWidth * scale;
          const dh = vid.videoHeight * scale;
          ctx.drawImage(vid, offsetX + (w - dw) / 2, (h - dh) / 2, dw, dh);
        }
      } else {
        const img = imageMapRef.current.get(clip.src);
        if (img && img.complete && img.naturalWidth > 0) {
          const progress = Math.min(1, Math.max(0, localTime / Math.max(1, clip.nativeDuration)));
          const kenZoom = (1.03 + Math.sin(progress * Math.PI) * 0.08) * zoomScale;
          const panX = (progress - 0.5) * 44;
          const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * kenZoom;
          const dw = img.naturalWidth * scale;
          const dh = img.naturalHeight * scale;
          ctx.drawImage(img, offsetX + (w - dw) / 2 - panX, (h - dh) / 2, dw, dh);
        }
      }
      ctx.restore();

      // Color Temperature warm/cool wash
      const temp = clip.temperature ?? 0;
      if (temp !== 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'soft-light';
        ctx.globalAlpha = Math.min(0.45, (Math.abs(temp) / 50) * 0.42) * alpha;
        ctx.fillStyle = temp > 0 ? '#F59E0B' : '#38BDF8';
        ctx.fillRect(offsetX, 0, w, h);
        ctx.restore();
      }

      // Vignette
      if (clip.vignette > 0) {
        ctx.save();
        ctx.globalAlpha = alpha;
        const cx = offsetX + w / 2;
        const cy = h / 2;
        const r = Math.hypot(w / 2, h / 2);
        const grad = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, `rgba(4,6,14,${Math.min(0.85, clip.vignette / 100)})`);
        ctx.fillStyle = grad;
        ctx.fillRect(offsetX, 0, w, h);
        ctx.restore();
      }
    },
    []
  );

  const renderTimelineFrameAt = useCallback(
    (canvas: HTMLCanvasElement, timeSec: number, dims: { w: number; h: number }, curState: VideoTimelineState) => {
      if (canvas.width !== dims.w || canvas.height !== dims.h) {
        canvas.width = dims.w;
        canvas.height = dims.h;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#05070C';
      ctx.fillRect(0, 0, dims.w, dims.h);

      const active = findActiveClipAtTime(curState.clips, timeSec);
      if (active) {
        const { clip, localVideoTime, nextClip, transitionProgress } = active;

        if (nextClip && transitionProgress > 0 && clip.transitionOut !== 'none') {
          const nextStart = nextClip.trimStart;
          if (clip.transitionOut === 'crossfade') {
            drawSingleClipFrame(ctx, clip, localVideoTime, dims.w, dims.h, 0, 1 - transitionProgress, 1);
            drawSingleClipFrame(ctx, nextClip, nextStart, dims.w, dims.h, 0, transitionProgress, 1);
          } else if (clip.transitionOut === 'dip-black') {
            if (transitionProgress < 0.5) {
              drawSingleClipFrame(ctx, clip, localVideoTime, dims.w, dims.h, 0, 1 - transitionProgress * 2, 1);
            } else {
              drawSingleClipFrame(ctx, nextClip, nextStart, dims.w, dims.h, 0, (transitionProgress - 0.5) * 2, 1);
            }
          } else if (clip.transitionOut === 'slide-left') {
            const shift = Math.round(dims.w * transitionProgress);
            drawSingleClipFrame(ctx, clip, localVideoTime, dims.w, dims.h, -shift, 1, 1);
            drawSingleClipFrame(ctx, nextClip, nextStart, dims.w, dims.h, dims.w - shift, 1, 1);
          } else if (clip.transitionOut === 'zoom') {
            drawSingleClipFrame(ctx, clip, localVideoTime, dims.w, dims.h, 0, 1 - transitionProgress, 1 + transitionProgress * 0.25);
            drawSingleClipFrame(ctx, nextClip, nextStart, dims.w, dims.h, 0, transitionProgress, 0.92 + transitionProgress * 0.08);
          }
        } else {
          drawSingleClipFrame(ctx, clip, localVideoTime, dims.w, dims.h, 0, 1, 1);
        }

        // Slow-motion optical frame blend smoothing
        if (clip.slowMoBlur && clip.speed < 1) {
          if (!prevBlendCanvasRef.current) {
            prevBlendCanvasRef.current = document.createElement('canvas');
          }
          const prevC = prevBlendCanvasRef.current;
          if (prevC.width === dims.w && prevC.height === dims.h) {
            ctx.save();
            ctx.globalAlpha = 0.28;
            ctx.drawImage(prevC, 0, 0);
            ctx.restore();
          }
          prevC.width = dims.w;
          prevC.height = dims.h;
          const pCtx = prevC.getContext('2d');
          pCtx?.drawImage(canvas, 0, 0);
        }

        // Real-time RGB Chromatic Split & Glitch Slice FX (fast Canvas2D without CPU pixel stalls)
        const rgbSplitAmt = clip.rgbSplit ?? 0;
        const glitchAmt = clip.glitch ?? 0;
        if (rgbSplitAmt > 0 || glitchAmt > 0) {
          if (!fxScratchCanvasRef.current) {
            fxScratchCanvasRef.current = document.createElement('canvas');
          }
          const scratch = fxScratchCanvasRef.current;
          if (scratch.width !== dims.w || scratch.height !== dims.h) {
            scratch.width = dims.w;
            scratch.height = dims.h;
          }
          const sCtx = scratch.getContext('2d');
          if (sCtx) {
            sCtx.clearRect(0, 0, dims.w, dims.h);
            sCtx.drawImage(canvas, 0, 0);

            if (rgbSplitAmt > 0) {
              const shiftPx = Math.max(2, (rgbSplitAmt / 100) * (dims.w * 0.018));
              ctx.save();
              ctx.globalCompositeOperation = 'screen';
              ctx.globalAlpha = 0.28;
              ctx.drawImage(scratch, -shiftPx, 0);
              ctx.drawImage(scratch, shiftPx, 0);
              ctx.fillStyle = 'rgba(236, 72, 153, 0.09)';
              ctx.fillRect(-shiftPx, 0, dims.w, dims.h);
              ctx.fillStyle = 'rgba(56, 189, 248, 0.09)';
              ctx.fillRect(shiftPx, 0, dims.w, dims.h);
              ctx.restore();
            }

            if (glitchAmt > 0) {
              const pulse = Math.abs(Math.sin(timeSec * 14.5));
              if (pulse > 0.25) {
                const bandCount = 4;
                for (let b = 0; b < bandCount; b++) {
                  const seed = Math.sin(timeSec * 29 + b * 7.3);
                  const sy = Math.floor(((b + 0.15 + Math.abs(seed) * 0.5) / bandCount) * dims.h) % Math.max(1, dims.h - 24);
                  const sh = Math.max(10, Math.round(dims.h * (0.04 + Math.abs(seed) * 0.05)));
                  const dx = Math.round(seed * (glitchAmt / 100) * dims.w * 0.06);
                  ctx.drawImage(scratch, 0, sy, dims.w, Math.min(sh, dims.h - sy), dx, sy, dims.w, Math.min(sh, dims.h - sy));
                }
              }
            }
          }
        }

        // Fast Tiled Film Grain
        const grainAmt = clip.grain ?? 0;
        if (grainAmt > 0) {
          const grainTile = getGrainPatternCanvas();
          if (grainTile) {
            const pattern = ctx.createPattern(grainTile, 'repeat');
            if (pattern) {
              ctx.save();
              ctx.globalAlpha = Math.min(0.65, (grainAmt / 60) * 0.6);
              ctx.globalCompositeOperation = 'overlay';
              const ox = Math.floor((timeSec * 173) % 128);
              const oy = Math.floor((timeSec * 97) % 128);
              ctx.translate(-ox, -oy);
              ctx.fillStyle = pattern;
              ctx.fillRect(ox, oy, dims.w + 128, dims.h + 128);
              ctx.restore();
            }
          }
        }
      }

      // Render active timed Visual & Image Overlay layers
      for (const ov of curState.overlays ?? []) {
        if (timeSec >= ov.startTime && timeSec <= ov.endTime && ov.opacity > 0) {
          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(1, ov.opacity / 100));
          if (ov.kind === 'image' && ov.imageSrc) {
            const ovImg = imageMapRef.current.get(ov.imageSrc);
            if (ovImg && ovImg.complete && ovImg.naturalWidth > 0) {
              const targetW = dims.w * ((ov.scale ?? 28) / 100);
              const targetH = (targetW / ovImg.naturalWidth) * ovImg.naturalHeight;
              const cx = dims.w * (ov.x ?? 0.5);
              const cy = dims.h * (ov.y ?? 0.5);
              ctx.drawImage(ovImg, cx - targetW / 2, cy - targetH / 2, targetW, targetH);
            }
          } else if (ov.kind === 'golden-flare') {
            ctx.globalCompositeOperation = 'screen';
            const g = ctx.createRadialGradient(dims.w * 0.16, dims.h * 0.14, 0, dims.w * 0.2, dims.h * 0.2, dims.w * 0.72);
            g.addColorStop(0, 'rgba(251, 191, 36, 0.75)');
            g.addColorStop(0.5, 'rgba(245, 158, 11, 0.25)');
            g.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, dims.w, dims.h);
          } else if (ov.kind === 'cyber-prism') {
            ctx.globalCompositeOperation = 'screen';
            const g = ctx.createLinearGradient(0, 0, dims.w, dims.h);
            g.addColorStop(0, 'rgba(56, 189, 248, 0.5)');
            g.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
            g.addColorStop(1, 'rgba(168, 85, 247, 0.55)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, dims.w, dims.h);
          } else if (ov.kind === 'violet-mist') {
            ctx.globalCompositeOperation = 'screen';
            const g = ctx.createLinearGradient(0, dims.h, 0, dims.h * 0.3);
            g.addColorStop(0, 'rgba(139, 92, 246, 0.65)');
            g.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, dims.w, dims.h);
          } else if (ov.kind === 'cinema-bars') {
            ctx.fillStyle = '#05060A';
            const barH = Math.round(dims.h * 0.1);
            ctx.fillRect(0, 0, dims.w, barH);
            ctx.fillRect(0, dims.h - barH, dims.w, barH);
          } else if (ov.kind === 'gold-frame') {
            const pad = Math.max(12, Math.round(Math.min(dims.w, dims.h) * 0.03));
            ctx.strokeStyle = '#D4AF37';
            ctx.lineWidth = Math.max(2, Math.round(dims.w * 0.004));
            ctx.strokeRect(pad, pad, dims.w - pad * 2, dims.h - pad * 2);
          }
          ctx.restore();
        }
      }

      // Render active timed Text & Animated Title layers
      for (const txt of curState.texts) {
        if (timeSec >= txt.startTime && timeSec <= txt.endTime && txt.text.trim()) {
          ctx.save();
          const scale = dims.w / 1000;
          const fontPx = Math.max(14, Math.round(txt.fontSize * scale));
          ctx.font = `${txt.kind === 'title' ? 700 : 500} ${fontPx}px ${txt.fontFamily}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          const elapsedInTxt = Math.max(0, timeSec - txt.startTime);
          const animDur = 0.65;
          const tNorm = Math.min(1, elapsedInTxt / animDur);
          const easeOut = 1 - Math.pow(1 - tNorm, 3);
          const anim = txt.animation ?? 'none';

          let yPos = txt.position === 'top' ? dims.h * 0.16 : txt.position === 'center' ? dims.h * 0.5 : dims.h * 0.84;
          let xOffset = 0;
          let txtScale = 1;

          if (anim === 'fade-up') {
            ctx.globalAlpha = easeOut;
            yPos += (1 - easeOut) * (28 * scale);
          } else if (anim === 'slide-in') {
            ctx.globalAlpha = easeOut;
            xOffset = -(1 - easeOut) * (dims.w * 0.12);
          } else if (anim === 'scale-pop') {
            ctx.globalAlpha = easeOut;
            txtScale = 0.72 + easeOut * 0.28;
          } else if (anim === 'gold-glow') {
            ctx.globalAlpha = easeOut;
            ctx.shadowColor = 'rgba(251, 191, 36, 0.9)';
            ctx.shadowBlur = (16 + Math.sin(timeSec * 5) * 6) * scale;
          }

          ctx.translate(dims.w / 2 + xOffset, yPos);
          ctx.scale(txtScale, txtScale);

          if (txt.kind === 'subtitle') {
            const metrics = ctx.measureText(txt.text);
            const padX = 18 * scale;
            const boxW = metrics.width + padX * 2;
            const boxH = fontPx * 1.55;
            ctx.fillStyle = 'rgba(6, 7, 11, 0.72)';
            ctx.beginPath();
            ctx.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 8 * scale);
            ctx.fill();
          } else if (anim !== 'gold-glow') {
            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowBlur = 16 * scale;
          }

          ctx.fillStyle = txt.color;
          ctx.fillText(txt.kind === 'title' ? txt.text.toUpperCase() : txt.text, 0, 0);
          ctx.restore();
        }
      }
    },
    [drawSingleClipFrame]
  );

  // Main 60fps preview loop (renders both main monitor and Final Preview modal if open)
  useEffect(() => {
    let rafId: number;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      const cur = stateRef.current;
      const tot = Math.max(0.5, getTotalTimelineDuration(cur.clips));
      let nextHead = playheadRef.current;

      if (isPlayingRef.current && !isExporting) {
        nextHead += dt;
        if (nextHead >= tot) nextHead = 0;
        playheadRef.current = nextHead;
        setPlayhead(nextHead);
      }

      if (!isExporting) {
        const previewDims =
          cur.aspect === '16:9' ? { w: 960, h: 540 } : cur.aspect === '9:16' ? { w: 540, h: 960 } : { w: 720, h: 720 };
        if (canvasRef.current) {
          renderTimelineFrameAt(canvasRef.current, nextHead, previewDims, cur);
        }
        if (finalPreviewOpenRef.current && finalPreviewCanvasRef.current) {
          renderTimelineFrameAt(finalPreviewCanvasRef.current, nextHead, previewDims, cur);
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isExporting, renderTimelineFrameAt]);

  // Import multiple videos from Android Gallery
  const handleImportVideos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const newClips: VideoClip[] = [];
    for (const file of files) {
      const url = URL.createObjectURL(file);
      try {
        const { duration, width, height, el } = await loadVideoMeta(url);
        videoMapRef.current.set(url, el);
        newClips.push({
          id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name.replace(/\.[^.]+$/, ''),
          sourceType: 'video',
          src: url,
          nativeDuration: duration,
          nativeWidth: width,
          nativeHeight: height,
          nativeFps: 30,
          trimStart: 0,
          trimEnd: duration,
          speed: 1,
          slowMoBlur: false,
          volume: 100,
          brightness: 0,
          contrast: 0,
          saturation: 0,
          temperature: 0,
          vignette: 0,
          grain: 0,
          glitch: 0,
          rgbSplit: 0,
          filterId: 'natural',
          transitionOut: 'crossfade',
          transitionDuration: 0.7,
        });
      } catch {
        URL.revokeObjectURL(url);
      }
    }

    if (newClips.length > 0) {
      const hasRealVideos = state.clips.some((c) => c.sourceType === 'video');
      const nextClips = hasRealVideos ? [...state.clips, ...newClips] : newClips;
      commitState({ ...state, clips: nextClips });
      setSelectedClipId(newClips[0].id);
      setPlayhead(0);
      setIsPlaying(true);
    }
    e.target.value = '';
  };

  // Import audio file (music track)
  const handleImportAudio = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    commitState({
      ...state,
      audio: {
        ...state.audio,
        mode: 'file',
        name: file.name.replace(/\.[^.]+$/, ''),
        src: url,
        synthPreset: 'none',
        volume: state.audio.volume || 80,
        muted: false,
      },
    });
    e.target.value = '';
  };

  // Import image overlay (logo / sticker / graphic) resized safely for Android memory
  const handleImportOverlayImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result !== 'string') return;
      const resized = await resizeOverlayImage(reader.result, 640);
      const start = Number(Math.max(0, playhead).toFixed(1));
      const end = Number(Math.min(totalDuration, start + 5).toFixed(1));
      const item: VideoOverlayLayer = {
        id: `vov-img-${Date.now()}`,
        kind: 'image',
        label: file.name.replace(/\.[^.]+$/, '').slice(0, 18) || 'Image Overlay',
        startTime: start,
        endTime: Math.max(start + 0.8, end),
        opacity: 92,
        imageSrc: resized,
        x: 0.5,
        y: 0.5,
        scale: 30,
      };
      commitState({ ...state, overlays: [...(state.overlays ?? []), item] });
      setSelectedOverlayId(item.id);
      setActiveTab('overlays');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Clip helper updates (discrete + live continuous)
  const updateSelectedClip = (patch: Partial<VideoClip>) => {
    if (!selectedClip) return;
    commitState({
      ...state,
      clips: state.clips.map((c) => (c.id === selectedClip.id ? { ...c, ...patch } : c)),
    });
  };

  const liveUpdateSelectedClip = (patch: Partial<VideoClip>) => {
    if (!selectedClip) return;
    liveCommitState({
      ...stateRef.current,
      clips: stateRef.current.clips.map((c) => (c.id === selectedClip.id ? { ...c, ...patch } : c)),
    });
  };

  // Split active clip at playhead
  const handleSplitAtPlayhead = () => {
    const active = findActiveClipAtTime(state.clips, playhead);
    if (!active) return;
    const { clip, clipIndex, localVideoTime } = active;
    if (localVideoTime <= clip.trimStart + 0.25 || localVideoTime >= clip.trimEnd - 0.25) {
      setExportStatus('Move playhead at least 0.25s inside a clip to split.');
      setTimeout(() => setExportStatus(null), 2500);
      return;
    }

    const firstHalf: VideoClip = {
      ...clip,
      trimEnd: Number(localVideoTime.toFixed(2)),
    };
    const secondHalf: VideoClip = {
      ...clip,
      id: `clip-${Date.now()}`,
      name: `${clip.name} (2)`,
      trimStart: Number(localVideoTime.toFixed(2)),
    };

    const nextClips = [
      ...state.clips.slice(0, clipIndex),
      firstHalf,
      secondHalf,
      ...state.clips.slice(clipIndex + 1),
    ];
    commitState({ ...state, clips: nextClips });
    setSelectedClipId(secondHalf.id);
  };

  const handleDuplicateClip = () => {
    if (!selectedClip) return;
    const idx = state.clips.findIndex((c) => c.id === selectedClip.id);
    const copy: VideoClip = {
      ...selectedClip,
      id: `clip-${Date.now()}`,
      name: `${selectedClip.name} Copy`,
    };
    const nextClips = [...state.clips.slice(0, idx + 1), copy, ...state.clips.slice(idx + 1)];
    commitState({ ...state, clips: nextClips });
    setSelectedClipId(copy.id);
  };

  const handleMoveClip = (dir: -1 | 1) => {
    if (!selectedClip) return;
    const idx = state.clips.findIndex((c) => c.id === selectedClip.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= state.clips.length) return;
    const next = [...state.clips];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    commitState({ ...state, clips: next });
  };

  const handleDeleteClip = () => {
    if (!selectedClip || state.clips.length <= 1) return;
    const next = state.clips.filter((c) => c.id !== selectedClip.id);
    commitState({ ...state, clips: next });
    setSelectedClipId(next[0].id);
  };

  // Merge adjacent clips that share same source or flatten transitions for seamless playback
  const handleMergeTimeline = () => {
    if (state.clips.length <= 1) return;
    const merged: VideoClip[] = [];
    for (const clip of state.clips) {
      const prev = merged[merged.length - 1];
      if (
        prev &&
        prev.src === clip.src &&
        Math.abs(prev.trimEnd - clip.trimStart) < 0.35 &&
        prev.speed === clip.speed
      ) {
        prev.trimEnd = clip.trimEnd;
        prev.transitionOut = clip.transitionOut;
      } else {
        merged.push({ ...clip });
      }
    }
    if (merged.length < state.clips.length) {
      commitState({ ...state, clips: merged });
      setSelectedClipId(merged[0].id);
      setExportStatus(`Merged adjacent segments into ${merged.length} clip(s).`);
    } else {
      // Enable smooth crossfade merge across all clips
      commitState({
        ...state,
        clips: state.clips.map((c, i) => ({
          ...c,
          transitionOut: i < state.clips.length - 1 && c.transitionOut === 'none' ? 'crossfade' : c.transitionOut,
        })),
      });
      setExportStatus('Unified all clips into a seamless merged sequence.');
    }
    setTimeout(() => setExportStatus(null), 2600);
  };

  // Text & Subtitle CRUD
  const addTextOverlay = (kind: 'title' | 'subtitle') => {
    const start = Number(Math.max(0, playhead).toFixed(1));
    const end = Number(Math.min(totalDuration, start + 3.5).toFixed(1));
    const item: VideoTextItem = {
      id: `vtxt-${Date.now()}`,
      kind,
      text: kind === 'title' ? 'NEW CINEMA TITLE' : 'Subtitle caption text',
      startTime: start,
      endTime: Math.max(start + 0.6, end),
      position: kind === 'title' ? 'center' : 'bottom',
      fontFamily: kind === 'title' ? "'Syne', sans-serif" : "'Plus Jakarta Sans', sans-serif",
      fontSize: kind === 'title' ? 56 : 32,
      color: kind === 'title' ? '#F8FAFC' : '#FCD34D',
    };
    commitState({ ...state, texts: [...state.texts, item] });
    setSelectedTextId(item.id);
  };

  const updateSelectedText = (patch: Partial<VideoTextItem>) => {
    if (!selectedText) return;
    commitState({
      ...state,
      texts: state.texts.map((t) => (t.id === selectedText.id ? { ...t, ...patch } : t)),
    });
  };

  const deleteSelectedText = (id: string) => {
    const next = state.texts.filter((t) => t.id !== id);
    commitState({ ...state, texts: next });
    if (selectedTextId === id) setSelectedTextId(next[0]?.id ?? null);
  };

  // Overlay layer CRUD
  const addOverlayLayer = (kind: VideoOverlayKind, label: string) => {
    const start = Number(Math.max(0, playhead).toFixed(1));
    const end = Number(Math.min(totalDuration, start + 4.5).toFixed(1));
    const item: VideoOverlayLayer = {
      id: `vov-${Date.now()}`,
      kind,
      label,
      startTime: start,
      endTime: Math.max(start + 0.8, end),
      opacity: 50,
    };
    commitState({ ...state, overlays: [...(state.overlays ?? []), item] });
    setSelectedOverlayId(item.id);
  };

  const updateSelectedOverlay = (patch: Partial<VideoOverlayLayer>) => {
    if (!selectedOverlay) return;
    commitState({
      ...state,
      overlays: (state.overlays ?? []).map((o) => (o.id === selectedOverlay.id ? { ...o, ...patch } : o)),
    });
  };

  const deleteSelectedOverlay = (id: string) => {
    const next = (state.overlays ?? []).filter((o) => o.id !== id);
    commitState({ ...state, overlays: next });
    if (selectedOverlayId === id) setSelectedOverlayId(next[0]?.id ?? null);
  };

  const handleSaveVideoProject = async () => {
    if (!onSaveProject) return;
    const spec = getExportSpec(state.aspect, state.resolution);
    const thumb = canvasRef.current ? createThumbnailDataUrl(canvasRef.current, 480) : STUDIO_ASSETS[4].url;
    const serializableClips = state.clips.map((c) =>
      c.sourceType === 'video' ? { ...c, sourceType: 'studio-reel' as const, src: STUDIO_ASSETS[4].url } : c
    );
    const res = await onSaveProject({
      id: sessionProjectIdRef.current,
      name: `${state.clips[0]?.name || 'Cinema Reel'} (${state.resolution.toUpperCase()})`,
      tool: 'video',
      thumbnailDataUrl: thumb || STUDIO_ASSETS[4].url,
      sourceImageUrl: STUDIO_ASSETS[4].url,
      width: spec.width,
      height: spec.height,
      updatedAt: new Date().toISOString(),
      videoTimeline: {
        ...cloneTimelineState(state),
        clips: serializableClips,
      },
      undoSteps: historyIdx,
      redoSteps: Math.max(0, history.length - 1 - historyIdx),
      autoSaved: false,
    });
    if (res === false) {
      setExportError('Failed to persist video project to My Projects.');
      return;
    }
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);

    // Automatically render & save final edited video to Gallery when Auto-Save to Gallery is ON
    if (settings.autoSaveToGallery && !isExporting) {
      await handleExportVideo({ triggerSource: 'save' });
    }
  };

  // Debounced Video Auto-Save
  useEffect(() => {
    if (!autoSaveEnabled || !onAutoSaveProject || historyIdx === 0 || isExporting) return;
    const timer = window.setTimeout(async () => {
      const spec = getExportSpec(state.aspect, state.resolution);
      const thumb = canvasRef.current ? createThumbnailDataUrl(canvasRef.current, 420) : STUDIO_ASSETS[4].url;
      const serializableClips = state.clips.map((c) =>
        c.sourceType === 'video' ? { ...c, sourceType: 'studio-reel' as const, src: STUDIO_ASSETS[4].url } : c
      );
      await onAutoSaveProject({
        id: sessionProjectIdRef.current,
        name: `${state.clips[0]?.name || 'Cinema Reel'} (${state.resolution.toUpperCase()})`,
        tool: 'video',
        thumbnailDataUrl: thumb || STUDIO_ASSETS[4].url,
        sourceImageUrl: STUDIO_ASSETS[4].url,
        width: spec.width,
        height: spec.height,
        updatedAt: new Date().toISOString(),
        videoTimeline: {
          ...cloneTimelineState(state),
          clips: serializableClips,
        },
        undoSteps: historyIdx,
        redoSteps: Math.max(0, history.length - 1 - historyIdx),
        autoSaved: true,
      });
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [state, historyIdx, history.length, autoSaveEnabled, onAutoSaveProject, isExporting]);

  // AI Video Director
  const runAiVideoAssist = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const base64 = canvasRef.current
        ? canvasRef.current.toDataURL('image/jpeg', 0.75).replace(/^data:image\/jpeg;base64,/, '')
        : undefined;

      const res = await fetch('/api/ai/video-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: 'image/jpeg',
          prompt: aiPrompt || 'Cinematic dark luxury color grade and title card',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI Video Assist failed.');

      const nextClips = state.clips.map((c) =>
        c.id === selectedClip?.id
          ? {
              ...c,
              brightness: Number(data.exposure ?? 0),
              contrast: Number(data.contrast ?? 14),
              saturation: Number(data.saturation ?? 10),
              vignette: Number(data.vignette ?? 30),
            }
          : c
      );
      const nextTexts = [...state.texts];
      if (data.lookTitle) {
        nextTexts.unshift({
          id: `vtxt-ai-${Date.now()}`,
          kind: 'title',
          text: String(data.lookTitle),
          startTime: 0.2,
          endTime: Math.min(totalDuration, 3.8),
          position: 'center',
          fontFamily: "'Syne', sans-serif",
          fontSize: 58,
          color: '#F8FAFC',
        });
      }
      commitState({ ...state, clips: nextClips, texts: nextTexts });
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Unable to reach AI video assistant.');
    } finally {
      setAiLoading(false);
    }
  };

  // Real 480p / 720p / 1080p / 4K Multi-Clip + Audio Fade MP4/WebM Export
  const handleSaveRenderedVideoToGallery = async (
    payload: {
      blob: Blob;
      fileName: string;
      mimeType: string;
      ext: 'mp4' | 'webm';
      width: number;
      height: number;
      fps: number;
    },
    triggerSource: 'save' | 'export' | 'manual',
    forceDuplicate = false
  ) => {
    setGallerySaving(true);
    setGalleryProgress(20);
    setGalleryStage(`Saving ${payload.ext.toUpperCase()} video to Gallery...`);
    const thumb = canvasRef.current ? createThumbnailDataUrl(canvasRef.current, 320) : undefined;
    try {
      if (!settings.autoSaveToGallery && triggerSource === 'export') {
        downloadExportedBlob(payload.blob, payload.fileName);
        setExportStatus(
          `Manual download ready (${payload.ext.toUpperCase()}) — Auto-Save to Gallery is OFF in Settings.`
        );
        if (onRecordExport) {
          await onRecordExport({
            id: `exp-${Date.now()}`,
            projectId: sessionProjectIdRef.current,
            fileName: payload.fileName,
            mediaType: 'video',
            format: payload.ext,
            resolutionLabel: `${payload.width}×${payload.height}`,
            width: payload.width,
            height: payload.height,
            frameRate: payload.fps,
            fileSizeBytes: payload.blob.size,
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
        blob: payload.blob,
        fileName: payload.fileName,
        mimeType: payload.mimeType,
        mediaType: 'video',
        format: payload.ext,
        width: payload.width,
        height: payload.height,
        frameRate: payload.fps,
        settings,
        triggerSource,
        forceDuplicate,
        projectId: sessionProjectIdRef.current,
        thumbnailDataUrl: thumb,
        onProgress: (pct, stage) => {
          setGalleryProgress(pct);
          setGalleryStage(stage);
        },
        onRecordExport,
      });

      setGalleryResult(res);
      if (res.saved) {
        setExportStatus(
          `Verified ${payload.width}×${payload.height} @ ${payload.fps} fps · ${payload.ext.toUpperCase()} (${(payload.blob.size / (1024 * 1024)).toFixed(2)} MB)`
        );
      } else if (res.error) {
        setExportError(res.error);
      }
    } finally {
      setGallerySaving(false);
    }
  };

  const handleExportVideo = async (opts?: { triggerSource?: 'save' | 'export' }) => {
    const triggerSource = opts?.triggerSource ?? 'export';
    setExportError(null);
    setGalleryResult(null);
    if (!exportCapabilities.mediaRecorderSupported || !exportCapabilities.bestMimeType) {
      setExportError(
        'This browser does not support MediaRecorder video encoding. Try Chrome or Safari on an updated device.'
      );
      return;
    }

    const requestedFormat = state.exportFormat ?? 'auto';
    if (requestedFormat === 'mp4' && !exportCapabilities.mp4Supported) {
      setExportError(
        'Native MP4 (H.264) recording is not supported by this browser’s MediaRecorder API. Select WebM or Auto Best to export cleanly without losing frames.'
      );
      return;
    }

    const mimeType =
      requestedFormat === 'mp4'
        ? exportCapabilities.mp4MimeType!
        : requestedFormat === 'webm' && exportCapabilities.webmMimeType
          ? exportCapabilities.webmMimeType
          : exportCapabilities.bestMimeType;
    const fileExt: 'mp4' | 'webm' = mimeType.includes('mp4') ? 'mp4' : 'webm';

    setIsPlaying(false);
    setFinalPreviewOpen(false);
    setIsExporting(true);
    setExportProgress(0);
    exportAbortRef.current = false;
    if (exportedVideo?.url) {
      URL.revokeObjectURL(exportedVideo.url);
      setExportedVideo(null);
    }

    const fps = state.frameRate ?? 30;
    const hdPlan = resolveHdVideoExportPlan(
      state.aspect,
      state.clips,
      state.resolution,
      state.qualityTier ?? 'high',
      fps,
      state.customBitrateMbps ?? 14
    );
    setExportStatus(
      `Rendering ${hdPlan.effectiveResolution.toUpperCase()} (${hdPlan.label}) @ ${fps} fps · ${hdPlan.bitrateMbps} Mbps as ${fileExt.toUpperCase()}...`
    );

    const offscreen = document.createElement('canvas');
    offscreen.width = hdPlan.width;
    offscreen.height = hdPlan.height;

    let audioCtx: AudioContext | null = null;
    let stopSynth: (() => void) | null = null;
    let audioElem: HTMLAudioElement | null = null;

    try {
      const videoStream = offscreen.captureStream(fps);
      const combinedTracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()];
      const targetDur = getTotalTimelineDuration(state.clips);

      // Mix audio track with real Web Audio Fade-In / Fade-Out automation
      if (!state.audio.muted && state.audio.mode !== 'none') {
        try {
          audioCtx = new AudioContext();
          const dest = audioCtx.createMediaStreamDestination();
          if (state.audio.mode === 'synth' && state.audio.synthPreset !== 'none') {
            stopSynth = startSynthSoundtrack(audioCtx, dest, state.audio.synthPreset, state.audio.volume, {
              totalDuration: targetDur,
              fadeIn: state.audio.fadeIn ?? 0,
              fadeOut: state.audio.fadeOut ?? 0,
            });
          } else if (state.audio.mode === 'file' && state.audio.src) {
            audioElem = new Audio(state.audio.src);
            const srcNode = audioCtx.createMediaElementSource(audioElem);
            const fadeGain = audioCtx.createGain();
            const baseVol = Math.max(0, Math.min(1, state.audio.volume / 100));
            const now = audioCtx.currentTime;
            const fIn = Math.min(targetDur * 0.45, state.audio.fadeIn ?? 0);
            const fOut = Math.min(targetDur * 0.45, state.audio.fadeOut ?? 0);
            fadeGain.gain.setValueAtTime(fIn > 0 ? 0.0001 : baseVol, now);
            if (fIn > 0) fadeGain.gain.linearRampToValueAtTime(baseVol, now + fIn);
            if (fOut > 0) {
              fadeGain.gain.setValueAtTime(baseVol, now + Math.max(fIn, targetDur - fOut));
              fadeGain.gain.linearRampToValueAtTime(0.0001, now + targetDur);
            }
            srcNode.connect(fadeGain);
            fadeGain.connect(dest);
            await audioElem.play().catch(() => {});
          }
          combinedTracks.push(...dest.stream.getAudioTracks());
        } catch {
          // Proceed with video-only track if audio capture is blocked
        }
      }

      const stream = new MediaStream(combinedTracks);
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: hdPlan.bitrateBps,
      });

      const chunks: BlobPart[] = [];
      let recorderFailed = false;
      recorder.onerror = () => {
        recorderFailed = true;
      };
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };

      const finishPromise = new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: mimeType }));
        };
      });

      recorder.start(250);
      const exportStart = performance.now();

      await new Promise<void>((resolve) => {
        const step = () => {
          if (exportAbortRef.current || recorderFailed) {
            resolve();
            return;
          }
          const elapsed = (performance.now() - exportStart) / 1000;
          if (elapsed >= targetDur) {
            renderTimelineFrameAt(offscreen, targetDur, { w: hdPlan.width, h: hdPlan.height }, state);
            setExportProgress(100);
            resolve();
            return;
          }
          renderTimelineFrameAt(offscreen, elapsed, { w: hdPlan.width, h: hdPlan.height }, state);
          setExportProgress(Math.min(99, Math.round((elapsed / targetDur) * 100)));
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });

      if (recorder.state !== 'inactive') recorder.stop();
      if (stopSynth) stopSynth();
      if (audioElem) audioElem.pause();
      if (audioCtx) audioCtx.close().catch(() => {});

      const blob = await finishPromise;
      const fpsUsed = hdPlan.fps;
      if (exportAbortRef.current) {
        setExportStatus('Export cancelled.');
      } else if (recorderFailed || blob.size === 0) {
        const errMsg = `Video export failed (${hdPlan.label}). On mobile devices, try 480p or 720p to reduce memory usage.`;
        setExportError(errMsg);
        setExportStatus(null);
        if (onRecordExport) {
          await onRecordExport({
            id: `exp-${Date.now()}`,
            projectId: sessionProjectIdRef.current,
            fileName: `dipti-video-${hdPlan.effectiveResolution}.${fileExt}`,
            mediaType: 'video',
            format: fileExt,
            resolutionLabel: `${hdPlan.effectiveResolution.toUpperCase()} (${hdPlan.label})`,
            width: hdPlan.width,
            height: hdPlan.height,
            frameRate: fpsUsed,
            fileSizeBytes: 0,
            status: 'failed',
            errorMessage: errMsg,
            createdAt: new Date().toISOString(),
          });
        }
      } else {
        const url = URL.createObjectURL(blob);
        const mb = (blob.size / (1024 * 1024)).toFixed(2);
        const fileName = `dipti-video-${hdPlan.width}x${hdPlan.height}-${fpsUsed}fps-${Date.now()}.${fileExt}`;
        setExportedVideo({
          url,
          blob,
          mimeType,
          ext: fileExt,
          sizeLabel: `${mb} MB`,
          fileName,
          width: hdPlan.width,
          height: hdPlan.height,
          fps: fpsUsed,
        });

        await handleSaveRenderedVideoToGallery(
          {
            blob,
            fileName,
            mimeType,
            ext: fileExt,
            width: hdPlan.width,
            height: hdPlan.height,
            fps: fpsUsed,
          },
          triggerSource
        );
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? `Export failed: ${err.message}`
          : 'Unable to complete video export in this browser.';
      setExportError(msg);
      setExportStatus(null);
    } finally {
      releaseCanvasMemory(offscreen);
      setIsExporting(false);
    }
  };

  const activeHdPlan = useMemo(
    () =>
      resolveHdVideoExportPlan(
        state.aspect,
        state.clips,
        state.resolution,
        state.qualityTier ?? 'high',
        state.frameRate ?? 30,
        state.customBitrateMbps ?? 14
      ),
    [state.aspect, state.clips, state.resolution, state.qualityTier, state.frameRate, state.customBitrateMbps]
  );
  const activeSpec = { width: activeHdPlan.width, height: activeHdPlan.height, bitrate: activeHdPlan.bitrateBps, label: activeHdPlan.label };

  const inspectorTabs: Array<{ id: VideoInspectorTab; label: string; icon: React.ReactNode }> = [
    { id: 'color', label: 'Color & Trim', icon: <Sliders className="w-3.5 h-3.5" /> },
    { id: 'filters', label: 'Filters', icon: <Palette className="w-3.5 h-3.5" /> },
    { id: 'fx', label: 'Glitch & FX', icon: <Zap className="w-3.5 h-3.5" /> },
    { id: 'speed', label: 'Speed', icon: <Gauge className="w-3.5 h-3.5" /> },
    { id: 'transitions', label: 'Transitions', icon: <Layers className="w-3.5 h-3.5" /> },
    { id: 'text', label: 'Titles', icon: <TypeIcon className="w-3.5 h-3.5" /> },
    { id: 'overlays', label: 'Overlays', icon: <ImageIcon className="w-3.5 h-3.5" /> },
    { id: 'audio', label: 'Audio', icon: <Music className="w-3.5 h-3.5" /> },
    { id: 'ai', label: 'AI Grade', icon: <Sparkles className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-4 pb-24 lg:pb-8">
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        multiple
        onChange={handleImportVideos}
        className="hidden"
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        onChange={handleImportAudio}
        className="hidden"
      />

      <input
        ref={overlayImageInputRef}
        type="file"
        accept="image/*"
        onChange={handleImportOverlayImage}
        className="hidden"
      />

      {/* Top Studio Bar: Import, Undo/Redo, Aspect, 480p/720p/1080p/4K, MP4/WebM, Preview Final, Export */}
      <div className="rounded-2xl bg-[#0B1020]/85 backdrop-blur-xl border border-amber-400/20 p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            className="min-h-[42px] px-3.5 rounded-xl bg-gradient-to-r from-violet-600/40 to-amber-500/30 hover:brightness-110 border border-amber-400/35 text-xs font-semibold text-white flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-amber-300" />
            <span>Import Videos</span>
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
          <div className="flex items-center gap-1 bg-[#060812] border border-white/10 rounded-xl p-1">
            {(['16:9', '9:16', '1:1'] as VideoAspect[]).map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => commitState({ ...state, aspect: ratio })}
                className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-mono-tabular cursor-pointer ${
                  state.aspect === ratio ? 'bg-violet-600/35 text-white font-semibold' : 'text-slate-400 hover:text-white'
                }`}
              >
                {ratio}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-[#060812] border border-white/10 rounded-xl p-1">
            {(['original', '480p', '720p', '1080p', '4k'] as ExportResolution[]).map((res) => (
              <button
                key={res}
                type="button"
                onClick={() => commitState({ ...state, resolution: res })}
                className={`min-h-[34px] px-2 rounded-lg text-[11px] font-mono-tabular uppercase cursor-pointer ${
                  state.resolution === res
                    ? 'bg-amber-400/25 text-amber-200 font-semibold border border-amber-400/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {res === 'original' ? 'Source' : res}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-[#060812] border border-white/10 rounded-xl p-1">
            {(['original', 'high', 'maximum'] as VideoQualityTier[]).map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => commitState({ ...state, qualityTier: tier })}
                className={`min-h-[34px] px-2 rounded-lg text-[11px] font-medium capitalize cursor-pointer ${
                  (state.qualityTier ?? 'high') === tier
                    ? 'bg-violet-500/30 text-white font-semibold border border-violet-400/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tier === 'maximum' ? 'Max' : tier}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-[#060812] border border-white/10 rounded-xl p-1">
            {(['auto', 'mp4', 'webm'] as VideoContainerFormat[]).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => commitState({ ...state, exportFormat: fmt })}
                className={`min-h-[34px] px-2 rounded-lg text-[11px] font-mono-tabular uppercase cursor-pointer ${
                  (state.exportFormat ?? 'auto') === fmt
                    ? 'bg-violet-500/30 text-white font-semibold border border-violet-400/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {fmt}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-[#060812] border border-white/10 rounded-xl p-1">
            {([24, 30, 60] as const).map((fps) => (
              <button
                key={fps}
                type="button"
                onClick={() => commitState({ ...state, frameRate: fps })}
                className={`min-h-[34px] px-2 rounded-lg text-[11px] font-mono-tabular cursor-pointer ${
                  (state.frameRate ?? 30) === fps
                    ? 'bg-amber-400/25 text-amber-200 font-semibold border border-amber-400/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {fps}fps
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setPlayhead(0);
              playheadRef.current = 0;
              setFinalPreviewOpen(true);
              setIsPlaying(true);
            }}
            className="min-h-[42px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-violet-400/35 text-xs font-semibold text-violet-200 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <MonitorPlay className="w-3.5 h-3.5 text-amber-300" />
            <span>Preview Final</span>
          </button>

          {onSaveProject && (
            <button
              type="button"
              onClick={handleSaveVideoProject}
              className="min-h-[42px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              {savedNotice ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Save className="w-3.5 h-3.5 text-amber-300" />}
              <span>{savedNotice ? 'Saved' : 'Save Edit'}</span>
            </button>
          )}

          {isExporting ? (
            <button
              type="button"
              onClick={() => {
                exportAbortRef.current = true;
              }}
              className="min-h-[42px] px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white flex items-center gap-2 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancel ({exportProgress}%)</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleExportVideo({ triggerSource: 'export' })}
              className="min-h-[42px] px-4 rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-amber-500 hover:brightness-110 text-xs font-semibold text-white flex items-center gap-2 shadow-[0_6px_24px_rgba(124,58,237,0.32)] whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export {activeHdPlan.label}</span>
            </button>
          )}
        </div>
      </div>

      {/* Browser Codec Capability Notice + HD Non-Upscaling Protection */}
      <div className="rounded-xl bg-[#0B1020]/70 border border-white/[0.08] px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300">
        <span className="flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-amber-300 shrink-0" />
          <span>
            {exportCapabilities.mp4Supported
              ? 'Native MP4 (H.264) & WebM supported'
              : exportCapabilities.webmSupported
                ? 'Native WebM (VP9/VP8) supported (MP4 N/A in browser)'
                : 'MediaRecorder unsupported'} · Actual Output: {activeHdPlan.label} @ {activeHdPlan.fps} fps · {activeHdPlan.bitrateMbps} Mbps
          </span>
        </span>
        {activeHdPlan.warningNote && (
          <span className="text-amber-300 font-medium">{activeHdPlan.warningNote}</span>
        )}
      </div>

      {exportStatus && (
        <div className="rounded-xl bg-[#0B1020] border border-amber-400/35 px-4 py-2.5 flex items-center justify-between gap-3">
          <span className="text-xs text-amber-200 font-medium">{exportStatus}</span>
          {isExporting && (
            <div className="w-40 h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 via-purple-400 to-amber-300 transition-all"
                style={{ width: `${exportProgress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {exportError && !galleryResult?.error && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-400/35 px-4 py-2.5 flex items-start justify-between gap-3 text-xs text-rose-200">
          <span className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
            <span>{exportError}</span>
          </span>
          <button
            type="button"
            onClick={() => setExportError(null)}
            className="text-rose-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <GallerySaveBanner
        saving={gallerySaving}
        progressPct={galleryProgress}
        stageLabel={galleryStage}
        result={galleryResult}
        onSaveCopyAnyway={
          exportedVideo
            ? () =>
                handleSaveRenderedVideoToGallery(
                  {
                    blob: exportedVideo.blob,
                    fileName: exportedVideo.fileName.replace(/(\.\w+)$/, '-copy$1'),
                    mimeType: exportedVideo.mimeType,
                    ext: exportedVideo.ext,
                    width: exportedVideo.width,
                    height: exportedVideo.height,
                    fps: exportedVideo.fps,
                  },
                  'manual',
                  true
                )
            : undefined
        }
        onDismiss={() => setGalleryResult(null)}
      />

      {exportedVideo && (
        <div className="rounded-2xl bg-[#0B1020] border border-emerald-400/35 p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-emerald-300">
              Verified Rendered Export ({exportedVideo.ext.toUpperCase()} · {exportedVideo.sizeLabel})
            </span>
            <div className="flex items-center gap-2">
              <a
                href={exportedVideo.url}
                download={`dipti-video-${state.resolution}-${Date.now()}.${exportedVideo.ext}`}
                className="min-h-[36px] px-3 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-xs font-semibold text-emerald-200 flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </a>
              <button
                type="button"
                onClick={async () => {
                  const res = await shareExportedBlob(
                    exportedVideo.blob,
                    `dipti-video-${state.resolution}.${exportedVideo.ext}`,
                    exportedVideo.mimeType
                  );
                  setVideoShareNote(res.ok ? 'Opened share sheet.' : res.error || 'Share unavailable.');
                }}
                className="min-h-[36px] px-3 rounded-lg bg-white/[0.08] border border-white/15 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5 text-amber-300" />
                <span>Share</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(exportedVideo.url);
                  setExportedVideo(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer"
                aria-label="Dismiss rendered review"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {videoShareNote && <p className="text-[11px] text-amber-200 w-full">{videoShareNote}</p>}
          </div>
          <video
            src={exportedVideo.url}
            controls
            playsInline
            className="w-full max-h-[260px] rounded-xl bg-black"
          />
        </div>
      )}

      {/* Pre-Export Full-Sequence Preview Theater Modal */}
      {finalPreviewOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-3xl rounded-3xl bg-[#0B1020] border border-amber-400/35 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-base sm:text-lg font-bold text-white">
                  Final Timeline Preview ({state.aspect} · {state.resolution.toUpperCase()})
                </h3>
                <p className="text-xs text-slate-400">
                  Reviewing all clips, transitions, animated titles, overlays, and audio fades before export.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  setFinalPreviewOpen(false);
                }}
                className="min-h-[40px] min-w-[40px] rounded-xl bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-slate-200 cursor-pointer"
                aria-label="Close final preview"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-2xl bg-[#04060A] border border-white/10 p-2 flex items-center justify-center">
              <canvas ref={finalPreviewCanvasRef} className="max-w-full max-h-[55vh] object-contain rounded-lg" />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPlaying((p) => !p)}
                  className="min-h-[42px] px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isPlaying ? 'Pause' : 'Play'}</span>
                </button>
                <span className="text-xs font-mono-tabular text-amber-300">
                  {formatTimecode(playhead)} / {formatTimecode(totalDuration)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleExportVideo({ triggerSource: 'export' })}
                className="min-h-[42px] px-5 rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-amber-500 text-xs font-semibold text-white flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Proceed to Export {state.resolution.toUpperCase()}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Split: Video Monitor + Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          {/* Monitor Viewport */}
          <div className="rounded-2xl bg-[#080B14] border border-white/10 p-3 sm:p-4 space-y-3">
            <div className="relative min-h-[240px] sm:min-h-[360px] rounded-xl bg-[#04060A] border border-white/[0.06] flex items-center justify-center overflow-hidden p-2">
              <canvas ref={canvasRef} className="max-w-full max-h-[420px] object-contain rounded-lg" />
            </div>

            {/* Playback & Seek Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    playheadRef.current = 0;
                    setPlayhead(0);
                  }}
                  className="min-h-[44px] min-w-[40px] rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-200 flex items-center justify-center cursor-pointer"
                  aria-label="Seek to start"
                >
                  <SkipBack className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const next = Math.max(0, playheadRef.current - 1);
                    playheadRef.current = next;
                    setPlayhead(next);
                  }}
                  className="min-h-[44px] min-w-[40px] rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-200 flex items-center justify-center cursor-pointer"
                  aria-label="Seek back 1 second"
                >
                  <Rewind className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsPlaying((p) => !p)}
                  className="min-h-[44px] min-w-[48px] rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-amber-500 text-white flex items-center justify-center cursor-pointer"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const next = Math.min(totalDuration, playheadRef.current + 1);
                    playheadRef.current = next;
                    setPlayhead(next);
                  }}
                  className="min-h-[44px] min-w-[40px] rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-200 flex items-center justify-center cursor-pointer"
                  aria-label="Seek forward 1 second"
                >
                  <FastForward className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setMasterMuted((m) => !m)}
                  className="min-h-[44px] min-w-[40px] rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-200 flex items-center justify-center cursor-pointer"
                  aria-label={masterMuted ? 'Unmute audio' : 'Mute audio'}
                >
                  {masterMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-amber-300" />}
                </button>

                <span className="text-xs font-mono-tabular text-amber-300 pl-1">
                  {formatTimecode(playhead)} / {formatTimecode(totalDuration)}
                </span>
              </div>

              <span className="text-[11px] font-mono-tabular text-slate-400">
                Output {activeSpec.label} · {state.clips.length} {state.clips.length === 1 ? 'clip' : 'clips'}
              </span>
            </div>
          </div>

          {/* Multi-Track Professional Timeline */}
          <div className="rounded-2xl bg-[#080B14] border border-white/10 p-3 sm:p-4 space-y-3">
            {/* Timeline Action Tools: Split, Duplicate, Reorder, Merge, Delete */}
            <div className="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-white/[0.07]">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={handleSplitAtPlayhead}
                  className="min-h-[38px] px-3 rounded-lg bg-white/[0.06] hover:bg-violet-500/25 border border-white/10 text-xs font-medium text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <Scissors className="w-3.5 h-3.5 text-amber-300" />
                  <span>Split</span>
                </button>
                <button
                  type="button"
                  onClick={handleDuplicateClip}
                  className="min-h-[38px] px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-medium text-slate-200 flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5 text-sky-300" />
                  <span>Duplicate</span>
                </button>
                <button
                  type="button"
                  onClick={handleMergeTimeline}
                  className="min-h-[38px] px-3 rounded-lg bg-white/[0.06] hover:bg-sky-500/20 border border-white/10 text-xs font-medium text-slate-200 flex items-center gap-1.5 cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5 text-violet-300" />
                  <span>Merge Clips</span>
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleMoveClip(-1)}
                  title="Move clip left"
                  className="min-h-[36px] min-w-[36px] rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-slate-300 flex items-center justify-center cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveClip(1)}
                  title="Move clip right"
                  className="min-h-[36px] min-w-[36px] rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-slate-300 flex items-center justify-center cursor-pointer"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={state.clips.length <= 1}
                  onClick={handleDeleteClip}
                  title="Remove selected clip"
                  className="min-h-[36px] min-w-[36px] rounded-lg bg-white/[0.05] hover:bg-rose-500/20 disabled:opacity-30 border border-white/10 text-slate-300 hover:text-rose-300 flex items-center justify-center cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Playhead Scrub Ruler */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] font-mono-tabular text-slate-400">
                <span>00:00</span>
                <span>{formatTimecode(totalDuration * 0.5)}</span>
                <span>{formatTimecode(totalDuration)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={totalDuration}
                step={0.03}
                value={playhead}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  playheadRef.current = val;
                  setPlayhead(val);
                }}
                className="studio-slider w-full cursor-pointer"
                aria-label="Master timeline playhead"
              />
            </div>

            {/* Track V1: Video Clips */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-8 text-[10px] font-mono-tabular font-semibold text-sky-300 shrink-0">V1</span>
                <div className="flex-1 flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                  {state.clips.map((clip, idx) => {
                    const effDur = getClipEffectiveDuration(clip);
                    const pctWidth = Math.max(18, Math.round((effDur / totalDuration) * 100));
                    const isSelected = clip.id === selectedClip?.id;
                    return (
                      <React.Fragment key={clip.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedClipId(clip.id)}
                          style={{ width: `${pctWidth}%`, minWidth: '110px' }}
                          className={`min-h-[52px] rounded-xl border px-3 py-1.5 text-left transition-all cursor-pointer shrink-0 ${
                            isSelected
                              ? 'bg-gradient-to-r from-violet-600/35 to-sky-600/30 border-amber-400/75 text-white shadow-[0_0_16px_rgba(212,175,55,0.2)]'
                              : 'bg-[#0D1326] border-white/10 text-slate-300 hover:border-white/25'
                          }`}
                        >
                          <p className="text-xs font-semibold truncate">{clip.name}</p>
                          <p className="text-[10px] font-mono-tabular text-slate-300 mt-0.5">
                            {effDur.toFixed(1)}s · {clip.speed}x
                          </p>
                        </button>
                        {idx < state.clips.length - 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedClipId(clip.id);
                              setActiveTab('transitions');
                            }}
                            title={`Transition: ${clip.transitionOut}`}
                            className="min-h-[36px] px-2 rounded-lg bg-[#060812] border border-white/15 hover:border-violet-400/60 text-[10px] font-mono-tabular text-violet-300 shrink-0 cursor-pointer"
                          >
                            {clip.transitionOut === 'none' ? 'Cut' : clip.transitionOut}
                          </button>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              {/* Track T1: Timed Titles & Subtitles */}
              <div className="flex items-center gap-2">
                <span className="w-8 text-[10px] font-mono-tabular font-semibold text-amber-300 shrink-0">T1</span>
                <div className="flex-1 h-9 rounded-xl bg-[#060812] border border-white/[0.06] relative overflow-hidden">
                  {state.texts.length === 0 ? (
                    <span className="text-[11px] text-slate-500 px-3 leading-9">
                      No title or subtitle overlays
                    </span>
                  ) : (
                    state.texts.map((t) => {
                      const leftPct = (t.startTime / totalDuration) * 100;
                      const widthPct = Math.max(8, ((t.endTime - t.startTime) / totalDuration) * 100);
                      const isSel = selectedText?.id === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setSelectedTextId(t.id);
                            setActiveTab('text');
                          }}
                          style={{ left: `${leftPct}%`, width: `${Math.min(100 - leftPct, widthPct)}%` }}
                          className={`absolute top-1 bottom-1 rounded-lg border px-2 text-left truncate text-[10px] font-medium cursor-pointer ${
                            isSel
                              ? 'bg-amber-400/25 border-amber-400 text-amber-100'
                              : 'bg-amber-500/10 border-amber-400/30 text-amber-200/80'
                          }`}
                        >
                          {t.text}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Track O1: Timed Visual Overlays */}
              <div className="flex items-center gap-2">
                <span className="w-8 text-[10px] font-mono-tabular font-semibold text-fuchsia-300 shrink-0">O1</span>
                <div className="flex-1 h-9 rounded-xl bg-[#060812] border border-white/[0.06] relative overflow-hidden">
                  {overlays.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => setActiveTab('overlays')}
                      className="w-full h-full text-left text-[11px] text-slate-500 px-3 cursor-pointer"
                    >
                      Tap to add FX Overlays
                    </button>
                  ) : (
                    overlays.map((ov) => {
                      const leftPct = (ov.startTime / totalDuration) * 100;
                      const widthPct = Math.max(8, ((ov.endTime - ov.startTime) / totalDuration) * 100);
                      const isSel = selectedOverlay?.id === ov.id;
                      return (
                        <button
                          key={ov.id}
                          type="button"
                          onClick={() => {
                            setSelectedOverlayId(ov.id);
                            setActiveTab('overlays');
                          }}
                          style={{ left: `${leftPct}%`, width: `${Math.min(100 - leftPct, widthPct)}%` }}
                          className={`absolute top-1 bottom-1 rounded-lg border px-2 text-left truncate text-[10px] font-medium cursor-pointer ${
                            isSel
                              ? 'bg-fuchsia-500/25 border-fuchsia-400 text-fuchsia-100'
                              : 'bg-fuchsia-500/10 border-fuchsia-400/30 text-fuchsia-200/80'
                          }`}
                        >
                          {ov.label}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Track A1: Background Music / Audio */}
              <div className="flex items-center gap-2">
                <span className="w-8 text-[10px] font-mono-tabular font-semibold text-violet-300 shrink-0">A1</span>
                <button
                  type="button"
                  onClick={() => setActiveTab('audio')}
                  className="flex-1 h-9 rounded-xl bg-[#060812] hover:bg-white/[0.04] border border-white/[0.06] px-3 flex items-center justify-between text-left cursor-pointer"
                >
                  <span className="text-[11px] text-slate-300 truncate flex items-center gap-2">
                    <Music className="w-3.5 h-3.5 text-violet-300 shrink-0" />
                    <span>{state.audio.mode === 'none' ? 'Tap to add Music / Audio Track' : state.audio.name}</span>
                  </span>
                  {state.audio.mode !== 'none' && (
                    <span className="text-[10px] font-mono-tabular text-violet-300">
                      {state.audio.muted ? 'MUTED' : `${state.audio.volume}%`}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Inspector Panel */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          <div className="rounded-2xl bg-[#0B1020]/85 backdrop-blur-xl border border-white/10 p-2">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {inspectorTabs.map((tab) => {
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

          <div className="rounded-2xl bg-[#0B1020]/85 backdrop-blur-xl border border-white/10 p-4 space-y-4">
            {/* 1. COLOR & TRIM */}
            {activeTab === 'color' && selectedClip && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white truncate">{selectedClip.name}</span>
                  <span className="text-[11px] font-mono-tabular text-amber-300">
                    {getClipEffectiveDuration(selectedClip).toFixed(1)}s
                  </span>
                </div>

                <div className="space-y-1">
                  <SliderControl
                    label="Trim In"
                    value={Number(selectedClip.trimStart.toFixed(1))}
                    min={0}
                    max={Math.max(0.2, Number((selectedClip.trimEnd - 0.3).toFixed(1)))}
                    step={0.1}
                    defaultValue={0}
                    unit="s"
                    onChange={(v) => liveUpdateSelectedClip({ trimStart: v })}
                  />
                  <SliderControl
                    label="Trim Out"
                    value={Number(selectedClip.trimEnd.toFixed(1))}
                    min={Math.min(selectedClip.nativeDuration, Number((selectedClip.trimStart + 0.3).toFixed(1)))}
                    max={Number(selectedClip.nativeDuration.toFixed(1))}
                    step={0.1}
                    defaultValue={Number(selectedClip.nativeDuration.toFixed(1))}
                    unit="s"
                    onChange={(v) => liveUpdateSelectedClip({ trimEnd: v })}
                  />
                  <SliderControl
                    label="Brightness"
                    value={selectedClip.brightness}
                    min={-40}
                    max={40}
                    onChange={(v) => liveUpdateSelectedClip({ brightness: v })}
                  />
                  <SliderControl
                    label="Contrast"
                    value={selectedClip.contrast}
                    min={-40}
                    max={50}
                    onChange={(v) => liveUpdateSelectedClip({ contrast: v })}
                  />
                  <SliderControl
                    label="Saturation"
                    value={selectedClip.saturation}
                    min={-100}
                    max={60}
                    onChange={(v) => liveUpdateSelectedClip({ saturation: v })}
                  />
                  <SliderControl
                    label="Temperature"
                    value={selectedClip.temperature ?? 0}
                    min={-50}
                    max={50}
                    onChange={(v) => liveUpdateSelectedClip({ temperature: v })}
                  />
                </div>
              </div>
            )}

            {/* 2. CINEMATIC VIDEO FILTERS */}
            {activeTab === 'filters' && selectedClip && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-white">Cinematic Video LUTs (12)</p>
                <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1">
                  {VIDEO_FILTER_PRESETS.map((preset) => {
                    const active = selectedClip.filterId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => updateSelectedClip({ filterId: preset.id })}
                        className={`min-h-[44px] rounded-xl border p-2.5 text-left flex items-center gap-2 cursor-pointer ${
                          active
                            ? 'bg-white/10 border-amber-400/70 text-white'
                            : 'bg-[#060812] border-white/10 text-slate-300 hover:border-white/25'
                        }`}
                      >
                        <span
                          className="w-3 h-3 rounded-full shrink-0 border border-white/25"
                          style={{ backgroundColor: preset.accent }}
                        />
                        <span className="text-xs font-semibold truncate">{preset.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2B. GLITCH, RGB SPLIT, FILM GRAIN & VIGNETTE */}
            {activeTab === 'fx' && selectedClip && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-amber-300 mb-1">Glitch, RGB &amp; Optics FX</p>
                <SliderControl
                  label="RGB Chromatic Split"
                  value={selectedClip.rgbSplit ?? 0}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(v) => liveUpdateSelectedClip({ rgbSplit: v })}
                />
                <SliderControl
                  label="Glitch Slice Distortion"
                  value={selectedClip.glitch ?? 0}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(v) => liveUpdateSelectedClip({ glitch: v })}
                />
                <SliderControl
                  label="Film Grain"
                  value={selectedClip.grain ?? 0}
                  min={0}
                  max={60}
                  onChange={(v) => liveUpdateSelectedClip({ grain: v })}
                />
                <SliderControl
                  label="Vignette"
                  value={selectedClip.vignette}
                  min={0}
                  max={80}
                  onChange={(v) => liveUpdateSelectedClip({ vignette: v })}
                />
              </div>
            )}

            {/* 3. PLAYBACK SPEED: SLOW MOTION & FAST MOTION (0.25x - 4x) */}
            {activeTab === 'speed' && selectedClip && (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-white mb-2">Slow Motion &amp; Fast Motion</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4].map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() =>
                          updateSelectedClip({
                            speed: spd,
                            slowMoBlur: spd < 1 ? true : selectedClip.slowMoBlur,
                          })
                        }
                        className={`min-h-[40px] rounded-xl border text-xs font-mono-tabular cursor-pointer ${
                          selectedClip.speed === spd
                            ? 'bg-amber-400/20 border-amber-400 text-amber-200 font-semibold'
                            : 'bg-[#060812] border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        {spd}x
                      </button>
                    ))}
                  </div>
                </div>

                <SliderControl
                  label="Custom Speed"
                  value={selectedClip.speed}
                  min={0.25}
                  max={4}
                  step={0.05}
                  defaultValue={1}
                  unit="x"
                  onChange={(v) => liveUpdateSelectedClip({ speed: v })}
                />

                <div className="flex items-center justify-between pt-2 border-t border-white/[0.07]">
                  <div>
                    <p className="text-xs font-semibold text-white">Slow-Motion Frame Blend</p>
                    <p className="text-[11px] text-slate-400">Smooths optical motion below 1.0x speed.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateSelectedClip({ slowMoBlur: !selectedClip.slowMoBlur })}
                    className={`min-h-[34px] px-3 rounded-lg border text-xs font-mono-tabular cursor-pointer ${
                      selectedClip.slowMoBlur
                        ? 'bg-amber-400/20 border-amber-400/60 text-amber-200 font-semibold'
                        : 'bg-[#060812] border-white/10 text-slate-400'
                    }`}
                  >
                    {selectedClip.slowMoBlur ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>
            )}

            {/* 4. TRANSITIONS BETWEEN CLIPS */}
            {activeTab === 'transitions' && selectedClip && (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-white mb-1">
                    Outgoing Transition ({selectedClip.name})
                  </p>
                  <p className="text-[11px] text-slate-400 mb-3">
                    Applied between this clip and the following clip on Track V1.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { id: 'none', label: 'Hard Cut' },
                        { id: 'crossfade', label: 'Crossfade' },
                        { id: 'dip-black', label: 'Dip to Black' },
                        { id: 'slide-left', label: 'Slide Wipe' },
                        { id: 'zoom', label: 'Zoom Dissolve' },
                      ] as Array<{ id: TransitionType; label: string }>
                    ).map((tr) => (
                      <button
                        key={tr.id}
                        type="button"
                        onClick={() => updateSelectedClip({ transitionOut: tr.id })}
                        className={`min-h-[42px] px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                          selectedClip.transitionOut === tr.id
                            ? 'bg-violet-600/30 border-violet-400 text-white'
                            : 'bg-[#060812] border-white/10 text-slate-300 hover:border-white/25'
                        }`}
                      >
                        {tr.label}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedClip.transitionOut !== 'none' && (
                  <SliderControl
                    label="Transition Duration"
                    value={selectedClip.transitionDuration}
                    min={0.3}
                    max={1.5}
                    step={0.1}
                    defaultValue={0.7}
                    unit="s"
                    onChange={(v) => updateSelectedClip({ transitionDuration: v })}
                  />
                )}
              </div>
            )}

            {/* 5. TEXT, TITLES & SUBTITLES */}
            {activeTab === 'text' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => addTextOverlay('title')}
                    className="flex-1 min-h-[40px] px-3 rounded-xl bg-violet-600/25 hover:bg-violet-600/40 border border-violet-400/40 text-xs font-semibold text-white flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Title</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => addTextOverlay('subtitle')}
                    className="flex-1 min-h-[40px] px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/40 text-xs font-semibold text-amber-200 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Subtitle</span>
                  </button>
                </div>

                {selectedText ? (
                  <div className="space-y-3 pt-2 border-t border-white/[0.07]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-white uppercase">{selectedText.kind}</span>
                      <button
                        type="button"
                        onClick={() => deleteSelectedText(selectedText.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer"
                        aria-label="Delete title"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <input
                      type="text"
                      value={selectedText.text}
                      onChange={(e) => updateSelectedText({ text: e.target.value })}
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#060812] border border-white/10 focus:border-sky-400/60 outline-none text-xs text-white"
                    />

                    <div className="grid grid-cols-3 gap-1.5">
                      {(['top', 'center', 'bottom'] as const).map((pos) => (
                        <button
                          key={pos}
                          type="button"
                          onClick={() => updateSelectedText({ position: pos })}
                          className={`min-h-[36px] rounded-lg border text-xs capitalize cursor-pointer ${
                            selectedText.position === pos
                              ? 'bg-sky-500/20 border-sky-400 text-white'
                              : 'bg-[#060812] border-white/10 text-slate-400'
                          }`}
                        >
                          {pos}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-[11px] font-medium text-amber-300">Title Animation</p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(
                          [
                            { id: 'none', label: 'Static' },
                            { id: 'fade-up', label: 'Fade Up' },
                            { id: 'slide-in', label: 'Slide In' },
                            { id: 'scale-pop', label: 'Scale Pop' },
                            { id: 'gold-glow', label: 'Gold Glow' },
                          ] as Array<{ id: TitleAnimation; label: string }>
                        ).map((an) => (
                          <button
                            key={an.id}
                            type="button"
                            onClick={() => updateSelectedText({ animation: an.id })}
                            className={`min-h-[34px] px-2 rounded-lg border text-[11px] font-medium cursor-pointer ${
                              (selectedText.animation ?? 'none') === an.id
                                ? 'bg-amber-400/20 border-amber-400 text-amber-200'
                                : 'bg-[#060812] border-white/10 text-slate-400 hover:text-white'
                            }`}
                          >
                            {an.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5">
                      {STUDIO_FONTS.slice(0, 4).map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => updateSelectedText({ fontFamily: f.family })}
                          className={`min-h-[36px] px-2 rounded-lg border text-xs truncate cursor-pointer ${
                            selectedText.fontFamily === f.family
                              ? 'bg-white/12 border-amber-400/60 text-white'
                              : 'bg-[#060812] border-white/10 text-slate-300'
                          }`}
                          style={{ fontFamily: f.family }}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>

                    <SliderControl
                      label="Start Time"
                      value={Number(selectedText.startTime.toFixed(1))}
                      min={0}
                      max={Math.max(0.2, Number((selectedText.endTime - 0.3).toFixed(1)))}
                      step={0.1}
                      unit="s"
                      onChange={(v) => updateSelectedText({ startTime: v })}
                    />
                    <SliderControl
                      label="End Time"
                      value={Number(selectedText.endTime.toFixed(1))}
                      min={Math.min(totalDuration, Number((selectedText.startTime + 0.3).toFixed(1)))}
                      max={Number(totalDuration.toFixed(1))}
                      step={0.1}
                      unit="s"
                      onChange={(v) => updateSelectedText({ endTime: v })}
                    />
                    <SliderControl
                      label="Font Size"
                      value={selectedText.fontSize}
                      min={20}
                      max={96}
                      defaultValue={48}
                      unit="px"
                      onChange={(v) => updateSelectedText({ fontSize: v })}
                    />
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 py-2">
                    Add a Title or Subtitle above to appear at the current playhead timestamp.
                  </p>
                )}
              </div>
            )}

            {/* 5B. TIMED IMAGE OVERLAYS & OPTICAL EFFECTS */}
            {activeTab === 'overlays' && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => overlayImageInputRef.current?.click()}
                  className="w-full min-h-[42px] px-3 rounded-xl bg-gradient-to-r from-violet-600/35 to-amber-500/25 hover:brightness-110 border border-amber-400/40 text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ImageIcon className="w-4 h-4 text-amber-300" />
                  <span>Import Image / Logo Overlay</span>
                </button>

                <p className="text-xs font-semibold text-white">Optical &amp; Frame Overlays</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {STUDIO_OVERLAYS.filter((ov) => ov.id !== 'none').map((ov) => {
                    const kind: VideoOverlayKind = ov.id === 'film-border' ? 'gold-frame' : (ov.id as VideoOverlayKind);
                    return (
                      <button
                        key={ov.id}
                        type="button"
                        onClick={() => addOverlayLayer(kind, ov.label)}
                        className="min-h-[38px] px-2.5 rounded-xl bg-[#060812] hover:bg-white/10 border border-white/10 text-xs text-slate-200 flex items-center gap-2 cursor-pointer"
                      >
                        <span className={`w-3.5 h-3.5 rounded shrink-0 border border-white/20 ${ov.swatch}`} />
                        <span className="truncate">{ov.label}</span>
                      </button>
                    );
                  })}
                </div>

                {selectedOverlay && (
                  <div className="space-y-2 pt-2 border-t border-white/[0.07]">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-fuchsia-200">{selectedOverlay.label}</span>
                      <button
                        type="button"
                        onClick={() => deleteSelectedOverlay(selectedOverlay.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 cursor-pointer"
                        aria-label="Remove overlay layer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {selectedOverlay.kind === 'image' && (
                      <>
                        <SliderControl label="Horizontal X" value={Math.round((selectedOverlay.x ?? 0.5) * 100)} min={10} max={90} defaultValue={50} unit="%" onChange={(v) => updateSelectedOverlay({ x: v / 100 })} />
                        <SliderControl label="Vertical Y" value={Math.round((selectedOverlay.y ?? 0.5) * 100)} min={10} max={90} defaultValue={50} unit="%" onChange={(v) => updateSelectedOverlay({ y: v / 100 })} />
                        <SliderControl label="Image Size" value={selectedOverlay.scale ?? 30} min={10} max={80} defaultValue={30} unit="%" onChange={(v) => updateSelectedOverlay({ scale: v })} />
                      </>
                    )}
                    <SliderControl label="Start Time" value={Number(selectedOverlay.startTime.toFixed(1))} min={0} max={Math.max(0.2, Number((selectedOverlay.endTime - 0.3).toFixed(1)))} step={0.1} unit="s" onChange={(v) => updateSelectedOverlay({ startTime: v })} />
                    <SliderControl label="End Time" value={Number(selectedOverlay.endTime.toFixed(1))} min={Math.min(totalDuration, Number((selectedOverlay.startTime + 0.3).toFixed(1)))} max={Number(totalDuration.toFixed(1))} step={0.1} unit="s" onChange={(v) => updateSelectedOverlay({ endTime: v })} />
                    <SliderControl label="Opacity" value={selectedOverlay.opacity} min={10} max={100} defaultValue={50} unit="%" onChange={(v) => updateSelectedOverlay({ opacity: v })} />
                  </div>
                )}
              </div>
            )}

            {/* 6. BACKGROUND MUSIC, AUDIO IMPORT & FADE IN/OUT */}
            {activeTab === 'audio' && (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => audioInputRef.current?.click()}
                  className="w-full min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-violet-600/30 to-amber-500/25 hover:brightness-110 border border-amber-400/35 text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Music className="w-4 h-4 text-amber-300" />
                  <span>Import Audio / Music File</span>
                </button>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-300">Built-In Studio Soundtracks</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { id: 'none', label: 'No Music' },
                        { id: 'midnight-pad', label: 'Midnight Pad' },
                        { id: 'electric-pulse', label: 'Electric Pulse' },
                        { id: 'gold-drone', label: 'Warm Cinema' },
                      ] as Array<{ id: BuiltInSynthTrack; label: string }>
                    ).map((track) => {
                      const active =
                        (track.id === 'none' && state.audio.mode === 'none') ||
                        (state.audio.mode === 'synth' && state.audio.synthPreset === track.id);
                      return (
                        <button
                          key={track.id}
                          type="button"
                          onClick={() =>
                            commitState({
                              ...state,
                              audio: {
                                ...state.audio,
                                mode: track.id === 'none' ? 'none' : 'synth',
                                name: track.label,
                                synthPreset: track.id,
                                muted: false,
                              },
                            })
                          }
                          className={`min-h-[40px] px-3 rounded-xl border text-xs font-medium cursor-pointer ${
                            active
                              ? 'bg-violet-600/30 border-violet-400 text-white'
                              : 'bg-[#060812] border-white/10 text-slate-300 hover:border-white/25'
                          }`}
                        >
                          {track.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <SliderControl
                  label="Music Track Volume"
                  value={state.audio.volume}
                  min={0}
                  max={100}
                  defaultValue={75}
                  unit="%"
                  onChange={(v) =>
                    commitState({
                      ...state,
                      audio: { ...state.audio, volume: v },
                    })
                  }
                />

                <SliderControl
                  label="Audio Fade In"
                  value={Number((state.audio.fadeIn ?? 0).toFixed(1))}
                  min={0}
                  max={5}
                  step={0.2}
                  defaultValue={0.5}
                  unit="s"
                  onChange={(v) =>
                    commitState({
                      ...state,
                      audio: { ...state.audio, fadeIn: v },
                    })
                  }
                />

                <SliderControl
                  label="Audio Fade Out"
                  value={Number((state.audio.fadeOut ?? 0).toFixed(1))}
                  min={0}
                  max={5}
                  step={0.2}
                  defaultValue={1}
                  unit="s"
                  onChange={(v) =>
                    commitState({
                      ...state,
                      audio: { ...state.audio, fadeOut: v },
                    })
                  }
                />

                {selectedClip && (
                  <SliderControl
                    label={`Clip Volume (${selectedClip.name})`}
                    value={selectedClip.volume}
                    min={0}
                    max={100}
                    defaultValue={100}
                    unit="%"
                    onChange={(v) => liveUpdateSelectedClip({ volume: v })}
                  />
                )}

                <button
                  type="button"
                  onClick={() =>
                    commitState({
                      ...state,
                      audio: { ...state.audio, muted: !state.audio.muted },
                    })
                  }
                  className="w-full min-h-[40px] rounded-xl bg-white/[0.05] border border-white/10 text-xs font-semibold text-slate-200 cursor-pointer"
                >
                  {state.audio.muted ? 'Unmute Music Track' : 'Mute Music Track'}
                </button>
              </div>
            )}

            {/* 7. AI VIDEO DIRECTOR */}
            {activeTab === 'ai' && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-white">AI Video Grade &amp; Title Assistant</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="e.g. cyber neon night drive..."
                    className="flex-1 min-w-0 min-h-[44px] px-3 py-2 rounded-xl bg-[#060812] border border-white/10 focus:border-sky-400/60 outline-none text-xs text-white placeholder:text-slate-500"
                  />
                  <button
                    type="button"
                    disabled={aiLoading}
                    onClick={runAiVideoAssist}
                    className="min-h-[44px] px-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Wand2 className={`w-3.5 h-3.5 ${aiLoading ? 'animate-spin' : ''}`} />
                    <span>{aiLoading ? 'Styling...' : 'AI Style'}</span>
                  </button>
                </div>
                {aiError && (
                  <div className="flex items-start gap-2 text-xs text-rose-200 bg-rose-500/10 border border-rose-400/25 rounded-xl px-3 py-2">
                    <AlertCircle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
                    <span>{aiError}</span>
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
