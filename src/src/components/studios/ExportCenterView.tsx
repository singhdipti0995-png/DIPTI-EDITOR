import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Share2,
  Film,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  History,
  Trash2,
  Upload,
  Sliders,
  XCircle,
  ShieldCheck,
} from 'lucide-react';
import { AppSettings, ExportRecord, ProjectItem } from '../../types/editor';
import { ExportResolution, VideoContainerFormat, VideoQualityTier } from '../../types/video';
import { STUDIO_ASSETS } from '../../data/studioCatalog';
import {
  ExportTargetResolution,
  ImageExportFormat,
  detectImageFormatSupport,
  downloadExportedBlob,
  encodeCanvasToBlob,
  renderPhotoProjectToExportCanvas,
  shareExportedBlob,
} from '../../utils/exportEngine';
import {
  VIDEO_FILTER_PRESETS,
  detectVideoExportCapabilities,
  findActiveClipAtTime,
  getTotalTimelineDuration,
  startSynthSoundtrack,
} from '../../utils/videoEngine';
import {
  HdQualityPreset,
  releaseCanvasMemory,
  resolveHdPhotoExportPlan,
  resolveHdVideoExportPlan,
} from '../../utils/hdQualityEngine';
import { loadImageElement, createThumbnailDataUrl } from '../../utils/canvasEngine';
import { formatBytes } from '../../utils/indexedDbStorage';
import { GallerySaveResult, saveMediaToGallery } from '../../utils/gallerySaveEngine';
import { GallerySaveBanner } from '../GallerySaveBanner';
import { SliderControl } from '../SliderControl';

interface ExportCenterViewProps {
  activePhotoUrl: string;
  projects: ProjectItem[];
  exportHistory: ExportRecord[];
  settings: AppSettings;
  onRecordExport: (record: ExportRecord) => Promise<void>;
  onClearExportHistory: () => Promise<void>;
}

export const ExportCenterView: React.FC<ExportCenterViewProps> = ({
  activePhotoUrl,
  projects,
  exportHistory,
  settings,
  onRecordExport,
  onClearExportHistory,
}) => {
  const [mode, setMode] = useState<'image' | 'video' | 'history'>('image');

  const photoProjects = useMemo(
    () => projects.filter((p) => p.tool !== 'video' && p.tool !== 'motion-vfx'),
    [projects]
  );
  const videoProjects = useMemo(
    () => projects.filter((p) => p.tool === 'video' && Boolean(p.videoTimeline)),
    [projects]
  );

  // Image Export State — defaults to Original Full Resolution preservation
  const [selectedPhotoProjectId, setSelectedPhotoProjectId] = useState<string>('active-photo');
  const [customImageUrl, setCustomImageUrl] = useState<string | null>(null);
  const [imgFormat, setImgFormat] = useState<ImageExportFormat>(
    settings.exportFormat === 'jpeg' ? 'jpg' : settings.exportFormat
  );
  const [imgQualityPreset, setImgQualityPreset] = useState<HdQualityPreset>('original');
  const [imgResolution, setImgResolution] = useState<ExportTargetResolution>('original');
  const [imgQuality, setImgQuality] = useState<number>(settings.exportQuality || 98);
  const [measuredSourceDims, setMeasuredSourceDims] = useState<{ w: number; h: number }>({ w: 1920, h: 1080 });

  // Video Export State — defaults to Source Native & High Quality
  const [selectedVideoProjectId, setSelectedVideoProjectId] = useState<string>(
    videoProjects[0]?.id || 'default-reel'
  );
  const [vidResolution, setVidResolution] = useState<ExportResolution>('original');
  const [vidQualityTier, setVidQualityTier] = useState<VideoQualityTier>('high');
  const [vidCustomBitrateMbps, setVidCustomBitrateMbps] = useState<number>(16);
  const [vidFormat, setVidFormat] = useState<VideoContainerFormat>('auto');
  const [vidFps, setVidFps] = useState<24 | 30 | 60>(30);

  // Shared Progress / Result State
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [completedFile, setCompletedFile] = useState<{
    blob: Blob;
    fileName: string;
    mimeType: string;
    format: 'jpg' | 'png' | 'webp' | 'mp4' | 'webm';
    width: number;
    height: number;
    quality?: number;
    frameRate?: number;
    formatLabel: string;
    resolutionLabel: string;
    sizeBytes: number;
    previewUrl: string;
    mediaType: 'image' | 'video';
  } | null>(null);
  const [gallerySaving, setGallerySaving] = useState(false);
  const [galleryProgress, setGalleryProgress] = useState(0);
  const [galleryStage, setGalleryStage] = useState<string | null>(null);
  const [galleryResult, setGalleryResult] = useState<GallerySaveResult | null>(null);

  const abortRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const imageFormatSupport = useMemo(() => detectImageFormatSupport(), []);
  const videoCaps = useMemo(() => detectVideoExportCapabilities(), []);

  const selectedPhotoProject =
    selectedPhotoProjectId === 'active-photo'
      ? null
      : photoProjects.find((p) => p.id === selectedPhotoProjectId) || null;

  const activeSourceUrl = customImageUrl || selectedPhotoProject?.sourceImageUrl || activePhotoUrl;

  // Measure actual full-resolution image dimensions directly from loaded bitmap
  useEffect(() => {
    let cancelled = false;
    if (selectedPhotoProject?.tool === 'design-studio' && selectedPhotoProject.typographyDoc) {
      setMeasuredSourceDims({
        w: selectedPhotoProject.typographyDoc.width,
        h: selectedPhotoProject.typographyDoc.height,
      });
      return;
    }
    loadImageElement(activeSourceUrl)
      .then((img) => {
        if (!cancelled && img.naturalWidth > 0) {
          setMeasuredSourceDims({ w: img.naturalWidth, h: img.naturalHeight });
        }
      })
      .catch(() => {
        if (!cancelled && selectedPhotoProject) {
          setMeasuredSourceDims({
            w: selectedPhotoProject.width || 1920,
            h: selectedPhotoProject.height || 1080,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeSourceUrl, selectedPhotoProject]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (completedFile?.previewUrl) URL.revokeObjectURL(completedFile.previewUrl);
    };
  }, [completedFile?.previewUrl]);

  const photoPlan = useMemo(
    () =>
      resolveHdPhotoExportPlan(
        measuredSourceDims.w,
        measuredSourceDims.h,
        imgQualityPreset,
        imgFormat,
        imgResolution,
        imgQuality
      ),
    [measuredSourceDims.w, measuredSourceDims.h, imgQualityPreset, imgFormat, imgResolution, imgQuality]
  );

  const activeVideoProject = videoProjects.find((p) => p.id === selectedVideoProjectId) || videoProjects[0] || null;
  const fallbackClips = useMemo(
    () => [
      {
        id: 'fallback-1',
        name: 'Pacific Twilight Coast',
        sourceType: 'studio-reel' as const,
        src: STUDIO_ASSETS[4].url,
        nativeDuration: 5,
        nativeWidth: 1920,
        nativeHeight: 1080,
        nativeFps: 30,
        trimStart: 0,
        trimEnd: 5,
        speed: 1,
        slowMoBlur: false,
        volume: 100,
        brightness: 0,
        contrast: 12,
        saturation: 8,
        vignette: 24,
        filterId: 'anamorphic',
        transitionOut: 'none' as const,
        transitionDuration: 0.6,
      },
    ],
    []
  );
  const activeVideoClips = activeVideoProject?.videoTimeline?.clips || fallbackClips;
  const activeVideoAspect = activeVideoProject?.videoTimeline?.aspect || '16:9';

  const hdVideoPlan = useMemo(
    () =>
      resolveHdVideoExportPlan(
        activeVideoAspect,
        activeVideoClips,
        vidResolution,
        vidQualityTier,
        vidFps,
        vidCustomBitrateMbps
      ),
    [activeVideoAspect, activeVideoClips, vidResolution, vidQualityTier, vidFps, vidCustomBitrateMbps]
  );

  const resetFeedback = () => {
    setErrorMessage(null);
    setShareNote(null);
    setStatusMessage(null);
    setGalleryResult(null);
  };

  const handleSelectPhotoPreset = (preset: HdQualityPreset) => {
    setImgQualityPreset(preset);
    if (preset === 'original') {
      setImgResolution('original');
      setImgQuality(98);
    } else if (preset === 'high') {
      setImgResolution('original');
      setImgQuality(92);
    } else if (preset === 'maximum') {
      setImgResolution('original');
      setImgQuality(100);
    }
  };

  const handleRunImageExport = async () => {
    resetFeedback();
    if (imgFormat === 'webp' && !imageFormatSupport.webp) {
      const msg = 'WebP export is not supported in this browser. Choose JPG or PNG.';
      setErrorMessage(msg);
      await onRecordExport({
        id: `exp-${Date.now()}`,
        projectId: selectedPhotoProject?.id,
        fileName: 'export.webp',
        mediaType: 'image',
        format: 'webp',
        resolutionLabel: `${photoPlan.outputWidth}×${photoPlan.outputHeight}`,
        width: photoPlan.outputWidth,
        height: photoPlan.outputHeight,
        quality: photoPlan.qualityPercent,
        fileSizeBytes: 0,
        status: 'failed',
        errorMessage: msg,
        createdAt: new Date().toISOString(),
      });
      return;
    }

    setIsExporting(true);
    setProgress(15);
    setStatusMessage(`Rendering ${photoPlan.outputWidth}×${photoPlan.outputHeight} canvas...`);

    let renderedCanvas: HTMLCanvasElement | null = null;
    try {
      const { canvas, width, height } = await renderPhotoProjectToExportCanvas(
        activeSourceUrl,
        selectedPhotoProject,
        photoPlan.targetResolution
      );
      renderedCanvas = canvas;
      setProgress(65);
      setStatusMessage(`Encoding ${imgFormat.toUpperCase()} (${width}×${height} @ ${photoPlan.qualityPercent}%)...`);

      const { blob, mimeType } = await encodeCanvasToBlob(canvas, imgFormat, photoPlan.qualityPercent);
      const baseName = (selectedPhotoProject?.name || 'dipti-export')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const fileName = `${baseName || 'dipti-export'}-${width}x${height}.${imgFormat}`;
      const previewUrl = URL.createObjectURL(blob);
      const thumb = createThumbnailDataUrl(canvas, 320);

      if (completedFile?.previewUrl) URL.revokeObjectURL(completedFile.previewUrl);

      setCompletedFile({
        blob,
        fileName,
        mimeType,
        format: imgFormat,
        width,
        height,
        quality: imgFormat === 'png' ? 100 : photoPlan.qualityPercent,
        formatLabel: imgFormat.toUpperCase(),
        resolutionLabel: `${width}×${height}`,
        sizeBytes: blob.size,
        previewUrl,
        mediaType: 'image',
      });
      setProgress(90);

      if (settings.autoSaveToGallery) {
        setGallerySaving(true);
        const gRes = await saveMediaToGallery({
          blob,
          fileName,
          mimeType,
          mediaType: 'image',
          format: imgFormat,
          width,
          height,
          quality: imgFormat === 'png' ? 100 : photoPlan.qualityPercent,
          projectId: selectedPhotoProject?.id,
          thumbnailDataUrl: thumb,
          settings,
          triggerSource: 'export',
          onProgress: (pct, stage) => {
            setGalleryProgress(pct);
            setGalleryStage(stage);
          },
          onRecordExport,
        });
        setGallerySaving(false);
        setGalleryResult(gRes);
        setProgress(100);
        if (gRes.saved) {
          setStatusMessage(
            `Saved to ${gRes.albumName} · ${width}×${height}px (${formatBytes(blob.size)})`
          );
        } else if (gRes.duplicatePrevented) {
          setStatusMessage(gRes.statusMessage);
        } else if (gRes.error) {
          setErrorMessage(gRes.error);
          setStatusMessage(null);
        }
      } else {
        setProgress(100);
        setStatusMessage(
          `Rendered ${width}×${height}px (${formatBytes(blob.size)}) — Auto-save to Gallery is OFF; use Download below.`
        );
        await onRecordExport({
          id: `exp-${Date.now()}`,
          projectId: selectedPhotoProject?.id,
          fileName,
          mediaType: 'image',
          format: imgFormat,
          resolutionLabel: `${width}×${height}`,
          width,
          height,
          quality: imgFormat === 'png' ? 100 : photoPlan.qualityPercent,
          fileSizeBytes: blob.size,
          status: 'completed',
          thumbnailDataUrl: thumb,
          galleryDelivery: 'skipped-disabled',
          galleryLocationLabel: 'Rendered for Manual Download (Auto-Save OFF)',
          createdAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Image export failed due to canvas memory or encoding error.';
      setErrorMessage(msg);
      setStatusMessage(null);
      setProgress(0);
      await onRecordExport({
        id: `exp-${Date.now()}`,
        projectId: selectedPhotoProject?.id,
        fileName: `failed-export.${imgFormat}`,
        mediaType: 'image',
        format: imgFormat,
        resolutionLabel: `${photoPlan.outputWidth}×${photoPlan.outputHeight}`,
        width: photoPlan.outputWidth,
        height: photoPlan.outputHeight,
        quality: photoPlan.qualityPercent,
        fileSizeBytes: 0,
        status: 'failed',
        errorMessage: msg,
        createdAt: new Date().toISOString(),
      });
    } finally {
      releaseCanvasMemory(renderedCanvas);
      setIsExporting(false);
    }
  };

  const handleRunVideoExport = async () => {
    resetFeedback();

    if (!videoCaps.mediaRecorderSupported || !videoCaps.bestMimeType) {
      const msg = 'MediaRecorder video encoding is unsupported in this browser.';
      setErrorMessage(msg);
      return;
    }

    if (vidFormat === 'mp4' && !videoCaps.mp4Supported) {
      const msg =
        'Native MP4 (H.264) recording is not supported by this browser’s MediaRecorder API. Select WebM or Auto Best instead.';
      setErrorMessage(msg);
      await onRecordExport({
        id: `exp-${Date.now()}`,
        projectId: activeVideoProject?.id,
        fileName: `dipti-video-${hdVideoPlan.width}x${hdVideoPlan.height}.mp4`,
        mediaType: 'video',
        format: 'mp4',
        resolutionLabel: `${hdVideoPlan.effectiveResolution.toUpperCase()} (${hdVideoPlan.label})`,
        width: hdVideoPlan.width,
        height: hdVideoPlan.height,
        frameRate: hdVideoPlan.fps,
        fileSizeBytes: 0,
        status: 'failed',
        errorMessage: msg,
        createdAt: new Date().toISOString(),
      });
      return;
    }

    const mimeType =
      vidFormat === 'mp4'
        ? videoCaps.mp4MimeType!
        : vidFormat === 'webm' && videoCaps.webmMimeType
          ? videoCaps.webmMimeType
          : videoCaps.bestMimeType;
    const ext: 'mp4' | 'webm' = mimeType.includes('mp4') ? 'mp4' : 'webm';

    const timeline = activeVideoProject?.videoTimeline || {
      clips: fallbackClips,
      texts: [],
      overlays: [],
      audio: { mode: 'none' as const, name: 'None', synthPreset: 'none' as const, volume: 70, muted: true },
      aspect: '16:9' as const,
      resolution: vidResolution,
    };

    const totalDur = Math.max(1, getTotalTimelineDuration(timeline.clips));

    setIsExporting(true);
    setProgress(0);
    abortRef.current = false;
    setStatusMessage(
      `Encoding ${hdVideoPlan.label} @ ${hdVideoPlan.fps} fps (${hdVideoPlan.bitrateMbps} Mbps) as ${ext.toUpperCase()}...`
    );

    const offscreen = document.createElement('canvas');
    offscreen.width = hdVideoPlan.width;
    offscreen.height = hdVideoPlan.height;
    const ctx = offscreen.getContext('2d');
    if (!ctx) {
      setErrorMessage('Could not create video rendering canvas on this device.');
      setIsExporting(false);
      return;
    }

    let audioCtx: AudioContext | null = null;
    let stopSynth: (() => void) | null = null;

    try {
      const loadedImgs = new Map<string, HTMLImageElement>();
      for (const c of timeline.clips) {
        if (!loadedImgs.has(c.src)) {
          const img = await loadImageElement(c.src).catch(() => null);
          if (img) loadedImgs.set(c.src, img);
        }
      }

      const streamTracks: MediaStreamTrack[] = [...offscreen.captureStream(hdVideoPlan.fps).getVideoTracks()];
      if (!timeline.audio.muted && timeline.audio.mode === 'synth' && timeline.audio.synthPreset !== 'none') {
        try {
          audioCtx = new AudioContext();
          const dest = audioCtx.createMediaStreamDestination();
          stopSynth = startSynthSoundtrack(audioCtx, dest, timeline.audio.synthPreset, timeline.audio.volume, {
            totalDuration: totalDur,
            fadeIn: timeline.audio.fadeIn ?? 0,
            fadeOut: timeline.audio.fadeOut ?? 0,
          });
          streamTracks.push(...dest.stream.getAudioTracks());
        } catch {
          // proceed with silent video stream
        }
      }

      const recorder = new MediaRecorder(new MediaStream(streamTracks), {
        mimeType,
        videoBitsPerSecond: hdVideoPlan.bitrateBps,
      });

      const chunks: BlobPart[] = [];
      let recorderErr: string | null = null;
      recorder.onerror = () => {
        recorderErr = 'MediaRecorder encountered an encoding failure.';
      };
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };

      const stopped = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      });

      const drawFrame = (t: number) => {
        ctx.fillStyle = '#06070B';
        ctx.fillRect(0, 0, hdVideoPlan.width, hdVideoPlan.height);
        const win = findActiveClipAtTime(timeline.clips, t);
        if (!win) return;
        const img = loadedImgs.get(win.clip.src);
        const presetCss = VIDEO_FILTER_PRESETS.find((f) => f.id === win.clip.filterId)?.cssFilter;
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        const parts: string[] = [];
        if (presetCss && presetCss !== 'none') parts.push(presetCss);
        if (win.clip.brightness !== 0) parts.push(`brightness(${1 + win.clip.brightness / 100})`);
        if (win.clip.contrast !== 0) parts.push(`contrast(${1 + win.clip.contrast / 100})`);
        if (win.clip.saturation !== 0) parts.push(`saturate(${1 + win.clip.saturation / 100})`);
        if (parts.length > 0) ctx.filter = parts.join(' ');
        if (img && img.naturalWidth > 0) {
          const s = Math.max(hdVideoPlan.width / img.naturalWidth, hdVideoPlan.height / img.naturalHeight);
          const dw = img.naturalWidth * s;
          const dh = img.naturalHeight * s;
          ctx.drawImage(img, (hdVideoPlan.width - dw) / 2, (hdVideoPlan.height - dh) / 2, dw, dh);
        }
        ctx.restore();

        for (const txt of timeline.texts) {
          if (t < txt.startTime || t > txt.endTime) continue;
          ctx.save();
          const scale = hdVideoPlan.width / 1000;
          ctx.font = `700 ${Math.round(txt.fontSize * scale)}px ${txt.fontFamily}`;
          ctx.fillStyle = txt.color;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const yPos =
            txt.position === 'top'
              ? hdVideoPlan.height * 0.16
              : txt.position === 'center'
                ? hdVideoPlan.height * 0.5
                : hdVideoPlan.height * 0.84;
          ctx.fillText(txt.text, hdVideoPlan.width / 2, yPos);
          ctx.restore();
        }
      };

      recorder.start(250);
      const startTime = performance.now();

      await new Promise<void>((resolve) => {
        const loop = () => {
          if (abortRef.current || recorderErr) {
            resolve();
            return;
          }
          const elapsed = (performance.now() - startTime) / 1000;
          if (elapsed >= totalDur) {
            drawFrame(totalDur);
            setProgress(100);
            resolve();
            return;
          }
          drawFrame(elapsed);
          setProgress(Math.min(99, Math.round((elapsed / totalDur) * 100)));
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      });

      if (recorder.state !== 'inactive') recorder.stop();
      if (stopSynth) stopSynth();
      if (audioCtx) audioCtx.close().catch(() => {});

      const blob = await stopped;
      if (abortRef.current) {
        setStatusMessage('Video export cancelled.');
        setProgress(0);
      } else if (recorderErr || blob.size === 0) {
        const msg = recorderErr || `Video export returned empty output at ${hdVideoPlan.label}. Try 720p on mobile.`;
        setErrorMessage(msg);
        setStatusMessage(null);
        await onRecordExport({
          id: `exp-${Date.now()}`,
          projectId: activeVideoProject?.id,
          fileName: `dipti-video-${hdVideoPlan.width}x${hdVideoPlan.height}.${ext}`,
          mediaType: 'video',
          format: ext,
          resolutionLabel: `${hdVideoPlan.effectiveResolution.toUpperCase()} (${hdVideoPlan.label})`,
          width: hdVideoPlan.width,
          height: hdVideoPlan.height,
          frameRate: hdVideoPlan.fps,
          fileSizeBytes: 0,
          status: 'failed',
          errorMessage: msg,
          createdAt: new Date().toISOString(),
        });
      } else {
        const fileName = `dipti-video-${hdVideoPlan.width}x${hdVideoPlan.height}-${hdVideoPlan.fps}fps-${Date.now()}.${ext}`;
        const previewUrl = URL.createObjectURL(blob);
        if (completedFile?.previewUrl) URL.revokeObjectURL(completedFile.previewUrl);

        setCompletedFile({
          blob,
          fileName,
          mimeType,
          format: ext,
          width: hdVideoPlan.width,
          height: hdVideoPlan.height,
          frameRate: hdVideoPlan.fps,
          formatLabel: ext.toUpperCase(),
          resolutionLabel: `${hdVideoPlan.label} · ${hdVideoPlan.fps} fps · ${hdVideoPlan.bitrateMbps} Mbps`,
          sizeBytes: blob.size,
          previewUrl,
          mediaType: 'video',
        });

        if (settings.autoSaveToGallery) {
          setGallerySaving(true);
          const gRes = await saveMediaToGallery({
            blob,
            fileName,
            mimeType,
            mediaType: 'video',
            format: ext,
            width: hdVideoPlan.width,
            height: hdVideoPlan.height,
            frameRate: hdVideoPlan.fps,
            projectId: activeVideoProject?.id,
            thumbnailDataUrl: activeVideoProject?.thumbnailDataUrl,
            settings,
            triggerSource: 'export',
            onProgress: (pct, stage) => {
              setGalleryProgress(pct);
              setGalleryStage(stage);
            },
            onRecordExport,
          });
          setGallerySaving(false);
          setGalleryResult(gRes);
          if (gRes.saved) {
            setStatusMessage(
              `Saved video to ${gRes.albumName} · ${fileName} (${formatBytes(blob.size)})`
            );
          } else if (gRes.duplicatePrevented) {
            setStatusMessage(gRes.statusMessage);
          } else if (gRes.error) {
            setErrorMessage(gRes.error);
            setStatusMessage(null);
          }
        } else {
          setStatusMessage(
            `Rendered ${fileName} (${formatBytes(blob.size)}) — Auto-save to Gallery is OFF; use Download below.`
          );
          await onRecordExport({
            id: `exp-${Date.now()}`,
            projectId: activeVideoProject?.id,
            fileName,
            mediaType: 'video',
            format: ext,
            resolutionLabel: `${hdVideoPlan.effectiveResolution.toUpperCase()} (${hdVideoPlan.label})`,
            width: hdVideoPlan.width,
            height: hdVideoPlan.height,
            frameRate: hdVideoPlan.fps,
            fileSizeBytes: blob.size,
            status: 'completed',
            thumbnailDataUrl: activeVideoProject?.thumbnailDataUrl,
            galleryDelivery: 'skipped-disabled',
            galleryLocationLabel: 'Rendered for Manual Download (Auto-Save OFF)',
            createdAt: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Video export failed unexpectedly.';
      setErrorMessage(msg);
      setStatusMessage(null);
    } finally {
      releaseCanvasMemory(offscreen);
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-5 pb-24 lg:pb-8">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = () => {
            if (typeof r.result === 'string') {
              setCustomImageUrl(r.result);
              setSelectedPhotoProjectId('active-photo');
            }
          };
          r.readAsDataURL(f);
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Mode Selector Bar */}
      <div className="rounded-2xl bg-[#0B0D16]/90 border border-amber-400/20 p-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setMode('image');
              resetFeedback();
            }}
            className={`min-h-[44px] px-4 rounded-xl border text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all ${
              mode === 'image'
                ? 'bg-gradient-to-r from-violet-600/40 to-amber-500/25 border-amber-400/65 text-white'
                : 'bg-[#06070B] border-white/10 text-slate-400 hover:text-white'
            }`}
          >
            <ImageIcon className="w-4 h-4 text-amber-300" />
            <span>Image Export (JPG / PNG / WebP)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('video');
              resetFeedback();
            }}
            className={`min-h-[44px] px-4 rounded-xl border text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all ${
              mode === 'video'
                ? 'bg-gradient-to-r from-violet-600/40 to-amber-500/25 border-amber-400/65 text-white'
                : 'bg-[#06070B] border-white/10 text-slate-400 hover:text-white'
            }`}
          >
            <Film className="w-4 h-4 text-violet-300" />
            <span>Video Export (MP4 / WebM)</span>
          </button>

          <button
            type="button"
            onClick={() => setMode('history')}
            className={`min-h-[44px] px-4 rounded-xl border text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all ${
              mode === 'history'
                ? 'bg-gradient-to-r from-violet-600/40 to-amber-500/25 border-amber-400/65 text-white'
                : 'bg-[#06070B] border-white/10 text-slate-400 hover:text-white'
            }`}
          >
            <History className="w-4 h-4 text-amber-300" />
            <span>Export History ({exportHistory.length})</span>
          </button>
        </div>

        <span className="text-[11px] font-medium text-emerald-300 flex items-center gap-1.5 px-2">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>HD Quality Protection Active</span>
        </span>
      </div>

      {mode !== 'history' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left: Export Settings Panel */}
          <div className="lg:col-span-6 rounded-2xl bg-[#0B0D16]/90 border border-white/10 p-4 sm:p-5 space-y-5">
            {mode === 'image' ? (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-semibold text-white">Source Artwork / Project</label>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="min-h-[36px] px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-amber-400/35 text-[11px] font-semibold text-amber-200 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Pick Photo</span>
                    </button>
                  </div>
                  <select
                    value={selectedPhotoProjectId}
                    onChange={(e) => {
                      setCustomImageUrl(null);
                      setSelectedPhotoProjectId(e.target.value);
                    }}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-[#06070B] border border-white/15 text-xs text-white outline-none focus:border-amber-400/60"
                  >
                    <option value="active-photo">
                      Active Studio Photo ({measuredSourceDims.w}×{measuredSourceDims.h})
                    </option>
                    {photoProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.width}×{p.height})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quality Preset Selection: Original / High / Maximum / Custom */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white">HD Quality Preset</span>
                    <span className="font-mono-tabular text-emerald-300">
                      Source {measuredSourceDims.w}×{measuredSourceDims.h}px
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {(
                      [
                        { id: 'original', label: 'Original' },
                        { id: 'high', label: 'High Quality' },
                        { id: 'maximum', label: 'Max 100%' },
                        { id: 'custom', label: 'Custom' },
                      ] as const
                    ).map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectPhotoPreset(preset.id)}
                        className={`min-h-[42px] px-2 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                          imgQualityPreset === preset.id
                            ? 'bg-gradient-to-r from-violet-600/35 to-amber-500/25 border-amber-400/70 text-white'
                            : 'bg-[#06070B] border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Format Selection: JPG / PNG / WebP */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-white block">Image Format</span>
                  <div className="grid grid-cols-3 gap-2">
                    {(['jpg', 'png', 'webp'] as const).map((fmt) => {
                      const supported = imageFormatSupport[fmt];
                      return (
                        <button
                          key={fmt}
                          type="button"
                          onClick={() => setImgFormat(fmt)}
                          className={`min-h-[44px] rounded-xl border text-xs font-mono-tabular uppercase font-semibold cursor-pointer transition-all ${
                            imgFormat === fmt
                              ? 'bg-gradient-to-r from-violet-600/35 to-amber-500/25 border-amber-400/70 text-white'
                              : 'bg-[#06070B] border-white/10 text-slate-400 hover:text-white'
                          }`}
                        >
                          {fmt} {!supported ? '(N/A)' : ''}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Resolution Options */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white">Target Resolution</span>
                    <span className="font-mono-tabular text-amber-300">
                      {photoPlan.outputWidth} × {photoPlan.outputHeight} px
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(
                      [
                        { id: 'original', label: 'Original' },
                        { id: '720p', label: '720p' },
                        { id: '1080p', label: '1080p' },
                        { id: '4k', label: '4K UHD' },
                      ] as const
                    ).map((res) => (
                      <button
                        key={res.id}
                        type="button"
                        onClick={() => {
                          setImgResolution(res.id);
                          if (res.id !== 'original') setImgQualityPreset('custom');
                        }}
                        className={`min-h-[44px] rounded-xl border text-xs font-mono-tabular font-semibold cursor-pointer ${
                          photoPlan.targetResolution === res.id
                            ? 'bg-amber-400/20 border-amber-400/70 text-amber-100'
                            : 'bg-[#06070B] border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        {res.label}
                      </button>
                    ))}
                  </div>
                  {photoPlan.warningNote && (
                    <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-400/25 rounded-xl px-3 py-2">
                      {photoPlan.warningNote}
                    </p>
                  )}
                </div>

                {/* Quality Slider */}
                <div className="space-y-1.5">
                  <SliderControl
                    label={imgFormat === 'png' ? 'PNG Mode (Lossless)' : 'Compression Quality'}
                    value={imgFormat === 'png' ? 100 : photoPlan.qualityPercent}
                    min={50}
                    max={100}
                    defaultValue={98}
                    unit="%"
                    onChange={(val) => {
                      setImgQuality(val);
                      setImgQualityPreset('custom');
                    }}
                  />
                </div>

                <button
                  type="button"
                  disabled={isExporting}
                  onClick={handleRunImageExport}
                  className="w-full min-h-[48px] rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-amber-500 hover:brightness-110 disabled:opacity-50 text-sm font-semibold text-white flex items-center justify-center gap-2 cursor-pointer shadow-[0_8px_28px_rgba(124,58,237,0.3)]"
                >
                  {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sliders className="w-4 h-4" />}
                  <span>
                    {isExporting
                      ? 'Exporting Image...'
                      : `Render ${photoPlan.outputWidth}×${photoPlan.outputHeight} ${imgFormat.toUpperCase()}`}
                  </span>
                </button>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-white block">Source Video Project</label>
                  <select
                    value={selectedVideoProjectId}
                    onChange={(e) => setSelectedVideoProjectId(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-[#06070B] border border-white/15 text-xs text-white outline-none focus:border-amber-400/60"
                  >
                    {videoProjects.length === 0 ? (
                      <option value="default-reel">Studio Cinema Reel (1920×1080 Source)</option>
                    ) : (
                      videoProjects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.width}×{p.height})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Video Quality Tier */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white">Video Bitrate Preset</span>
                    <span className="font-mono-tabular text-emerald-300">{hdVideoPlan.bitrateMbps} Mbps</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(
                      [
                        { id: 'original', label: 'Original' },
                        { id: 'high', label: 'High' },
                        { id: 'maximum', label: 'Maximum' },
                        { id: 'custom', label: 'Custom' },
                      ] as const
                    ).map((tier) => (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() => setVidQualityTier(tier.id)}
                        className={`min-h-[42px] px-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                          vidQualityTier === tier.id
                            ? 'bg-gradient-to-r from-violet-600/35 to-amber-500/25 border-amber-400/70 text-white'
                            : 'bg-[#06070B] border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        {tier.label}
                      </button>
                    ))}
                  </div>
                  {vidQualityTier === 'custom' && (
                    <SliderControl
                      label="Custom Target Bitrate"
                      value={vidCustomBitrateMbps}
                      min={4}
                      max={45}
                      defaultValue={16}
                      unit=" Mbps"
                      onChange={setVidCustomBitrateMbps}
                    />
                  )}
                </div>

                {/* Container Format with honest capability reporting */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white">Video Container</span>
                    <span className="font-mono-tabular text-slate-400">
                      MP4: {videoCaps.mp4Supported ? 'Supported' : 'Unsupported'} · WebM: {videoCaps.webmSupported ? 'Supported' : 'Unsupported'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'auto', label: 'Auto Best' },
                        { id: 'mp4', label: videoCaps.mp4Supported ? 'MP4 (H.264)' : 'MP4 (N/A)' },
                        { id: 'webm', label: 'WebM' },
                      ] as const
                    ).map((fmt) => (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={() => setVidFormat(fmt.id)}
                        className={`min-h-[44px] px-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                          vidFormat === fmt.id
                            ? 'bg-gradient-to-r from-violet-600/35 to-amber-500/25 border-amber-400/70 text-white'
                            : 'bg-[#06070B] border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        {fmt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Video Resolution with Original + non-upscaling protection */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white">Resolution</span>
                    <span className="font-mono-tabular text-amber-300">Actual: {hdVideoPlan.label}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(
                      [
                        { id: 'original', label: 'Source' },
                        { id: '720p', label: '720p' },
                        { id: '1080p', label: '1080p' },
                        { id: '4k', label: '4K' },
                      ] as const
                    ).map((res) => (
                      <button
                        key={res.id}
                        type="button"
                        onClick={() => setVidResolution(res.id)}
                        className={`min-h-[44px] rounded-xl border text-xs font-mono-tabular uppercase font-semibold cursor-pointer ${
                          vidResolution === res.id
                            ? 'bg-amber-400/20 border-amber-400/70 text-amber-100'
                            : 'bg-[#06070B] border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        {res.label}
                      </button>
                    ))}
                  </div>
                  {hdVideoPlan.warningNote && (
                    <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-400/25 rounded-xl px-3 py-2">
                      {hdVideoPlan.warningNote}
                    </p>
                  )}
                </div>

                {/* Video Frame Rate */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-white block">Frame Rate (FPS)</span>
                  <div className="grid grid-cols-3 gap-2">
                    {([24, 30, 60] as const).map((fps) => (
                      <button
                        key={fps}
                        type="button"
                        onClick={() => setVidFps(fps)}
                        className={`min-h-[44px] rounded-xl border text-xs font-mono-tabular font-semibold cursor-pointer ${
                          vidFps === fps
                            ? 'bg-violet-600/35 border-violet-400 text-white'
                            : 'bg-[#06070B] border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        {fps} FPS
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={handleRunVideoExport}
                    className="flex-1 min-h-[48px] rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-amber-500 hover:brightness-110 disabled:opacity-50 text-sm font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
                    <span>
                      {isExporting
                        ? `Rendering ${progress}%`
                        : `Export ${hdVideoPlan.label} (${hdVideoPlan.bitrateMbps} Mbps)`}
                    </span>
                  </button>
                  {isExporting && (
                    <button
                      type="button"
                      onClick={() => {
                        abortRef.current = true;
                      }}
                      className="min-h-[48px] px-4 rounded-xl bg-rose-600/25 border border-rose-400/40 text-xs font-semibold text-rose-200 flex items-center gap-1.5 cursor-pointer"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Cancel</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Right: Live Progress, Output Preview, File Size, Download & Share */}
          <div className="lg:col-span-6 rounded-2xl bg-[#080A12] border border-white/10 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-base font-bold text-white">Export Output &amp; Status</h3>
              <span className="text-xs font-mono-tabular text-amber-300">{progress}%</span>
            </div>

            <div className="w-full h-2.5 rounded-full bg-[#040508] border border-white/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 via-purple-500 to-amber-400 transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>

            {statusMessage && !galleryResult && (
              <div className="flex items-start gap-2.5 rounded-xl bg-emerald-500/10 border border-emerald-400/30 px-3.5 py-2.5 text-xs text-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
                <span>{statusMessage}</span>
              </div>
            )}

            {errorMessage && !galleryResult?.error && (
              <div className="flex items-start gap-2.5 rounded-xl bg-rose-500/10 border border-rose-400/35 px-3.5 py-2.5 text-xs text-rose-200">
                <AlertCircle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            <GallerySaveBanner
              saving={gallerySaving}
              progressPct={galleryProgress}
              stageLabel={galleryStage}
              result={galleryResult}
              onSaveCopyAnyway={
                completedFile
                  ? async () => {
                      setGallerySaving(true);
                      const copyName = completedFile.fileName.replace(/(\.\w+)$/, '-copy$1');
                      const gRes = await saveMediaToGallery({
                        blob: completedFile.blob,
                        fileName: copyName,
                        mimeType: completedFile.mimeType,
                        mediaType: completedFile.mediaType,
                        format: completedFile.format,
                        width: completedFile.width,
                        height: completedFile.height,
                        quality: completedFile.quality,
                        frameRate: completedFile.frameRate,
                        settings,
                        triggerSource: 'manual',
                        forceDuplicate: true,
                        onProgress: (pct, st) => {
                          setGalleryProgress(pct);
                          setGalleryStage(st);
                        },
                        onRecordExport,
                      });
                      setGallerySaving(false);
                      setGalleryResult(gRes);
                    }
                  : undefined
              }
              onDismiss={() => setGalleryResult(null)}
            />

            <div className="aspect-[16/10] w-full rounded-xl bg-[#040508] border border-white/[0.08] overflow-hidden flex items-center justify-center">
              {completedFile ? (
                completedFile.mediaType === 'video' ? (
                  <video src={completedFile.previewUrl} controls className="w-full h-full object-contain" />
                ) : (
                  <img src={completedFile.previewUrl} alt="Exported preview" className="w-full h-full object-contain" />
                )
              ) : mode === 'image' ? (
                <img src={activeSourceUrl} alt="Source preview" className="w-full h-full object-contain opacity-85" />
              ) : (
                <img
                  src={activeVideoProject?.thumbnailDataUrl || STUDIO_ASSETS[4].url}
                  alt="Video sequence thumbnail"
                  className="w-full h-full object-contain opacity-85"
                />
              )}
            </div>

            {completedFile ? (
              <div className="rounded-xl bg-[#0B0D16] border border-amber-400/30 p-3.5 space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-[#06070B] p-2">
                    <p className="text-[10px] text-slate-400">Format</p>
                    <p className="text-xs font-mono-tabular font-bold text-white">{completedFile.formatLabel}</p>
                  </div>
                  <div className="rounded-lg bg-[#06070B] p-2">
                    <p className="text-[10px] text-slate-400">Output Specs</p>
                    <p className="text-xs font-mono-tabular font-bold text-amber-300 truncate">{completedFile.resolutionLabel}</p>
                  </div>
                  <div className="rounded-lg bg-[#06070B] p-2">
                    <p className="text-[10px] text-slate-400">File Size</p>
                    <p className="text-xs font-mono-tabular font-bold text-emerald-300">{formatBytes(completedFile.sizeBytes)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => downloadExportedBlob(completedFile.blob, completedFile.fileName)}
                    className="min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-violet-600 to-amber-500 hover:brightness-110 text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download File</span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await shareExportedBlob(
                        completedFile.blob,
                        completedFile.fileName,
                        completedFile.mimeType
                      );
                      setShareNote(res.ok ? 'Opened device share sheet.' : res.error || 'Share unavailable.');
                    }}
                    className="min-h-[44px] px-4 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/15 text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Share2 className="w-4 h-4 text-amber-300" />
                    <span>Share File</span>
                  </button>
                </div>

                {shareNote && <p className="text-[11px] text-amber-200">{shareNote}</p>}
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-2">
                {mode === 'image'
                  ? `Planned output: ${photoPlan.summaryLabel} (Source ${measuredSourceDims.w}×${measuredSourceDims.h}px). Click Render to inspect file size.`
                  : `Planned video output: ${hdVideoPlan.label} @ ${hdVideoPlan.fps} fps (${hdVideoPlan.bitrateMbps} Mbps). Click Render to export.`}
              </p>
            )}
          </div>
        </div>
      ) : (
        /* Export History Log View */
        <div className="rounded-2xl bg-[#0B0D16]/90 border border-white/10 p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-bold text-white">Export History Log</h3>
              <p className="text-xs text-slate-400">
                Recorded photo and video exports persisted locally in IndexedDB.
              </p>
            </div>
            {exportHistory.length > 0 && (
              <button
                type="button"
                onClick={onClearExportHistory}
                className="min-h-[40px] px-3.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-400/30 text-xs font-semibold text-rose-200 flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Export History</span>
              </button>
            )}
          </div>

          {exportHistory.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center border border-dashed border-white/10 rounded-xl">
              No export records yet. Complete an image or video export to log file sizes, formats, and statuses here.
            </p>
          ) : (
            <div className="space-y-2">
              {exportHistory.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl bg-[#06070B] border border-white/[0.08] p-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {item.thumbnailDataUrl ? (
                      <img
                        src={item.thumbnailDataUrl}
                        alt={item.fileName}
                        className="w-12 h-9 rounded-lg object-cover border border-white/10 shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-9 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center shrink-0">
                        {item.mediaType === 'video' ? (
                          <Film className="w-4 h-4 text-violet-300" />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-amber-300" />
                        )}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{item.fileName}</p>
                      <p className="text-[11px] font-mono-tabular text-slate-400">
                        {item.format.toUpperCase()} · {item.resolutionLabel}
                        {item.frameRate ? ` · ${item.frameRate} fps` : ''}
                        {item.status === 'completed' ? ` · ${formatBytes(item.fileSizeBytes)}` : ''}
                      </p>
                      {item.errorMessage && (
                        <p className="text-[11px] text-rose-300 mt-0.5">{item.errorMessage}</p>
                      )}
                    </div>
                  </div>
                  <span
                    className={`text-[11px] font-mono-tabular font-semibold ${
                      item.status === 'completed' ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    {item.status === 'completed' ? 'Completed' : 'Failed'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
