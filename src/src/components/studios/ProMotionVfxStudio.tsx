import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  Upload,
  Download,
  Crosshair,
  KeyRound,
  MonitorPlay,
  Gauge,
  Plus,
  Trash2,
} from 'lucide-react';
import { AppSettings, DEFAULT_SETTINGS, ExportRecord } from '../../types/editor';
import { STUDIO_ASSETS } from '../../data/studioCatalog';
import { SliderControl } from '../SliderControl';
import { detectVideoExportCapabilities, formatTimecode } from '../../utils/videoEngine';
import { downloadExportedBlob } from '../../utils/exportEngine';
import { GallerySaveResult, saveMediaToGallery } from '../../utils/gallerySaveEngine';
import { GallerySaveBanner } from '../GallerySaveBanner';

type VfxTab = 'green-screen' | 'keyframes' | 'tracking' | 'speed-ramp';

interface ProMotionVfxStudioProps {
  settings?: AppSettings;
  onRecordExport?: (record: ExportRecord) => void;
}

interface KeyframePoint {
  id: string;
  time: number; // 0..duration
  scale: number; // 0.6..2.0
  x: number; // -0.4..0.4
  y: number; // -0.4..0.4
  rotation: number; // -45..45
  opacity: number; // 0..100
}

export const ProMotionVfxStudio: React.FC<ProMotionVfxStudioProps> = ({
  settings = DEFAULT_SETTINGS,
  onRecordExport,
}) => {
  const [tab, setTab] = useState<VfxTab>('green-screen');
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [duration, setDuration] = useState(10);
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  // Green screen (Chroma Key)
  const [chromaEnabled, setChromaEnabled] = useState(false);
  const [keyColor, setKeyColor] = useState<'green' | 'blue'>('green');
  const [keyThreshold, setKeyThreshold] = useState(85);
  const [keySmooth, setKeySmooth] = useState(28);
  const [bgImageUrl, setBgImageUrl] = useState(STUDIO_ASSETS[4].url);

  // Keyframes
  const [keyframes, setKeyframes] = useState<KeyframePoint[]>([
    { id: 'kf-1', time: 0, scale: 1.0, x: 0, y: 0, rotation: 0, opacity: 100 },
    { id: 'kf-2', time: 5, scale: 1.18, x: 0.04, y: -0.02, rotation: 2, opacity: 100 },
    { id: 'kf-3', time: 10, scale: 1.0, x: 0, y: 0, rotation: 0, opacity: 100 },
  ]);
  const [selectedKfId, setSelectedKfId] = useState('kf-2');

  // Motion Tracking
  const [trackEnabled, setTrackEnabled] = useState(true);
  const [trackStart, setTrackStart] = useState({ x: 0.38, y: 0.42 });
  const [trackEnd, setTrackEnd] = useState({ x: 0.62, y: 0.38 });
  const [trackLabel, setTrackLabel] = useState('SUBJECT LOCKED');

  // Speed Ramping (Start -> Mid -> End)
  const [rampStart, setRampStart] = useState(1.2);
  const [rampMid, setRampMid] = useState(0.4);
  const [rampEnd, setRampEnd] = useState(1.8);

  const [isExporting, setIsExporting] = useState(false);
  const [gallerySaving, setGallerySaving] = useState(false);
  const [galleryProgress, setGalleryProgress] = useState(0);
  const [galleryStage, setGalleryStage] = useState<string | null>(null);
  const [galleryResult, setGalleryResult] = useState<GallerySaveResult | null>(null);
  const lastExportedVfxRef = useRef<{
    blob: Blob;
    mimeType: string;
    fileName: string;
    ext: 'mp4' | 'webm';
    width: number;
    height: number;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fgDemoImgRef = useRef<HTMLImageElement | null>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const playheadRef = useRef(0);

  useEffect(() => {
    const fg = new Image();
    fg.crossOrigin = 'anonymous';
    fg.src = STUDIO_ASSETS[1].url;
    fg.onload = () => {
      fgDemoImgRef.current = fg;
    };
  }, []);

  useEffect(() => {
    const bg = new Image();
    bg.crossOrigin = 'anonymous';
    bg.src = bgImageUrl;
    bg.onload = () => {
      bgImgRef.current = bg;
    };
  }, [bgImageUrl]);

  const getSpeedAt = (t: number) => {
    const u = Math.max(0, Math.min(1, t / Math.max(1, duration)));
    if (u < 0.5) {
      const k = u * 2;
      return rampStart + (rampMid - rampStart) * k;
    }
    const k = (u - 0.5) * 2;
    return rampMid + (rampEnd - rampMid) * k;
  };

  const getInterpolatedTransform = (t: number) => {
    const sorted = [...keyframes].sort((a, b) => a.time - b.time);
    if (sorted.length === 0) return { scale: 1, x: 0, y: 0, rotation: 0, opacity: 100 };
    if (t <= sorted[0].time) return sorted[0];
    if (t >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1];

    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      if (t >= a.time && t <= b.time) {
        const raw = (t - a.time) / Math.max(0.01, b.time - a.time);
        const ease = raw * raw * (3 - 2 * raw); // smooth cubic ease
        return {
          scale: a.scale + (b.scale - a.scale) * ease,
          x: a.x + (b.x - a.x) * ease,
          y: a.y + (b.y - a.y) * ease,
          rotation: a.rotation + (b.rotation - a.rotation) * ease,
          opacity: a.opacity + (b.opacity - a.opacity) * ease,
        };
      }
    }
    return sorted[0];
  };

  useEffect(() => {
    let rafId: number;
    let last = performance.now();

    const draw = (now: number) => {
      const dt = Math.min(0.08, (now - last) / 1000);
      last = now;

      if (isPlaying && !isExporting) {
        const curSpeed = getSpeedAt(playheadRef.current);
        let next = playheadRef.current + dt * curSpeed;
        if (next >= duration) next = 0;
        playheadRef.current = next;
        setPlayhead(next);
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const w = 960;
        const h = 540;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.clearRect(0, 0, w, h);

          // V2 Background Layer (visible when Chroma Key is enabled)
          if (chromaEnabled && bgImgRef.current) {
            const bg = bgImgRef.current;
            const bs = Math.max(w / bg.naturalWidth, h / bg.naturalHeight);
            ctx.drawImage(bg, (w - bg.naturalWidth * bs) / 2, (h - bg.naturalHeight * bs) / 2, bg.naturalWidth * bs, bg.naturalHeight * bs);
          } else {
            ctx.fillStyle = '#05070C';
            ctx.fillRect(0, 0, w, h);
          }

          // V1 Foreground Layer with Keyframe Transform
          const xf = getInterpolatedTransform(playheadRef.current);
          const fgCanvas = document.createElement('canvas');
          fgCanvas.width = w;
          fgCanvas.height = h;
          const fgCtx = fgCanvas.getContext('2d', { willReadFrequently: true });

          if (fgCtx) {
            fgCtx.save();
            fgCtx.translate(w / 2 + xf.x * w, h / 2 + xf.y * h);
            fgCtx.rotate((xf.rotation * Math.PI) / 180);
            fgCtx.scale(xf.scale, xf.scale);

            if (videoSrc && videoRef.current && videoRef.current.readyState >= 2) {
              const vid = videoRef.current;
              if (Math.abs(vid.currentTime - (playheadRef.current % Math.max(1, vid.duration || 10))) > 0.14) {
                vid.currentTime = playheadRef.current % Math.max(1, vid.duration || 10);
              }
              const s = Math.max(w / vid.videoWidth, h / vid.videoHeight);
              fgCtx.drawImage(vid, -(vid.videoWidth * s) / 2, -(vid.videoHeight * s) / 2, vid.videoWidth * s, vid.videoHeight * s);
            } else if (fgDemoImgRef.current) {
              const img = fgDemoImgRef.current;
              const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
              fgCtx.drawImage(img, -(img.naturalWidth * s) / 2, -(img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
            }
            fgCtx.restore();

            // Chroma Key Pass
            if (chromaEnabled) {
              const imgData = fgCtx.getImageData(0, 0, w, h);
              const d = imgData.data;
              const [kr, kg, kb] = keyColor === 'green' ? [30, 195, 65] : [35, 90, 210];
              for (let i = 0; i < d.length; i += 4) {
                const dist = Math.hypot(d[i] - kr, d[i + 1] - kg, d[i + 2] - kb);
                if (dist < keyThreshold) {
                  d[i + 3] = 0;
                } else if (dist < keyThreshold + keySmooth) {
                  d[i + 3] = Math.round(((dist - keyThreshold) / Math.max(1, keySmooth)) * 255);
                }
              }
              fgCtx.putImageData(imgData, 0, 0);
            }

            ctx.save();
            ctx.globalAlpha = xf.opacity / 100;
            ctx.drawImage(fgCanvas, 0, 0);
            ctx.restore();
          }

          // Motion Tracking Callout Reticle
          if (trackEnabled) {
            const u = playheadRef.current / Math.max(1, duration);
            const tx = (trackStart.x + (trackEnd.x - trackStart.x) * u) * w;
            const ty = (trackStart.y + (trackEnd.y - trackStart.y) * u) * h;

            ctx.save();
            ctx.strokeStyle = '#38BDF8';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(tx, ty, 28, 0, Math.PI * 2);
            ctx.stroke();

            ctx.strokeStyle = '#D4AF37';
            ctx.beginPath();
            ctx.moveTo(tx + 24, ty - 18);
            ctx.lineTo(tx + 64, ty - 42);
            ctx.lineTo(tx + 195, ty - 42);
            ctx.stroke();

            ctx.fillStyle = 'rgba(6, 7, 11, 0.85)';
            ctx.fillRect(tx + 64, ty - 68, 148, 24);
            ctx.fillStyle = '#FDE68A';
            ctx.font = "600 12px 'JetBrains Mono', monospace";
            ctx.textBaseline = 'middle';
            ctx.fillText(trackLabel.slice(0, 16), tx + 72, ty - 56);
            ctx.restore();
          }
        }
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [
    isPlaying,
    isExporting,
    duration,
    chromaEnabled,
    keyColor,
    keyThreshold,
    keySmooth,
    bgImageUrl,
    keyframes,
    trackEnabled,
    trackStart,
    trackEnd,
    trackLabel,
    rampStart,
    rampMid,
    rampEnd,
    videoSrc,
  ]);

  const handleVideoImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const vid = document.createElement('video');
    vid.src = url;
    vid.muted = true;
    vid.playsInline = true;
    vid.onloadedmetadata = () => {
      videoRef.current = vid;
      setVideoSrc(url);
      setDuration(Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration : 10);
      playheadRef.current = 0;
      setPlayhead(0);
    };
    e.target.value = '';
  };

  const handleAddKeyframe = () => {
    const kf: KeyframePoint = {
      id: `kf-${Date.now()}`,
      time: Number(playhead.toFixed(1)),
      scale: 1.1,
      x: 0,
      y: 0,
      rotation: 0,
      opacity: 100,
    };
    setKeyframes((prev) => [...prev, kf].sort((a, b) => a.time - b.time));
    setSelectedKfId(kf.id);
  };

  const selectedKf = keyframes.find((k) => k.id === selectedKfId) || keyframes[0];

  const handleExportVfx = async (forceDuplicate = false) => {
    if (forceDuplicate && lastExportedVfxRef.current) {
      const prev = lastExportedVfxRef.current;
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
      } finally {
        setGallerySaving(false);
      }
      return;
    }

    const caps = detectVideoExportCapabilities();
    if (!canvasRef.current || !caps.mediaRecorderSupported || !caps.bestMimeType) {
      setGalleryResult({
        saved: false,
        isDirectGallery: false,
        delivery: 'browser-download',
        fileName: 'dipti-vfx.mp4',
        albumName: settings.galleryAlbumName || 'DIPTI EDITOR',
        locationLabel: 'Unsupported',
        sizeBytes: 0,
        signature: '',
        statusMessage: 'Video recording is not supported in this browser.',
        error: 'MediaRecorder video export is not supported in this browser.',
      });
      return;
    }

    const mimeType = caps.bestMimeType;
    const ext: 'mp4' | 'webm' = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const w = canvasRef.current.width || 960;
    const h = canvasRef.current.height || 540;

    setIsExporting(true);
    setGalleryResult(null);
    setGallerySaving(true);
    setGalleryProgress(12);
    setGalleryStage(`Rendering VFX ${ext.toUpperCase()} (${w}×${h})...`);
    playheadRef.current = 0;
    setIsPlaying(true);

    try {
      const stream = canvasRef.current.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
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
      const recordMs = Math.min(7000, Math.max(2000, duration * 1000));
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          if (recorder.state === 'recording') recorder.stop();
          resolve();
        }, recordMs);
      });

      const blob = await done;
      if (failed || blob.size === 0) {
        setGalleryResult({
          saved: false,
          isDirectGallery: false,
          delivery: 'browser-download',
          fileName: `dipti-vfx-${Date.now()}.${ext}`,
          albumName: settings.galleryAlbumName || 'DIPTI EDITOR',
          locationLabel: 'Export failed',
          sizeBytes: 0,
          signature: '',
          statusMessage: 'VFX video recording produced an empty file.',
          error: 'Recorded VFX clip was 0 bytes and was not saved to Gallery.',
        });
        return;
      }

      const fileName = `dipti-vfx-${Date.now()}.${ext}`;
      lastExportedVfxRef.current = { blob, mimeType, fileName, ext, width: w, height: h };

      if (!settings.autoSaveToGallery) {
        downloadExportedBlob(blob, fileName);
        onRecordExport?.({
          id: `exp-vfx-${Date.now()}`,
          fileName,
          mediaType: 'video',
          format: ext,
          resolutionLabel: `${w}×${h} @ 30fps`,
          width: w,
          height: h,
          frameRate: 30,
          fileSizeBytes: blob.size,
          status: 'completed',
          galleryDelivery: 'skipped-disabled',
          galleryLocationLabel: 'Manual Browser Download (Auto-Save OFF)',
          createdAt: new Date().toISOString(),
        });
        setGalleryResult({
          saved: true,
          isDirectGallery: false,
          delivery: 'browser-download',
          fileName,
          albumName: settings.galleryAlbumName || 'DIPTI EDITOR',
          locationLabel: `Downloads/${fileName}`,
          sizeBytes: blob.size,
          signature: '',
          statusMessage: `Downloaded ${fileName} (Auto-Save to Gallery is OFF in Settings).`,
        });
        return;
      }

      const gRes = await saveMediaToGallery({
        blob,
        fileName,
        mimeType,
        mediaType: 'video',
        format: ext,
        width: w,
        height: h,
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
    } finally {
      setIsExporting(false);
      setGallerySaving(false);
    }
  };

  const vfxTabs: Array<{ id: VfxTab; label: string; icon: React.ReactNode }> = [
    { id: 'green-screen', label: 'Green Screen', icon: <MonitorPlay className="w-3.5 h-3.5" /> },
    { id: 'keyframes', label: 'Keyframes', icon: <KeyRound className="w-3.5 h-3.5" /> },
    { id: 'tracking', label: 'Motion Track', icon: <Crosshair className="w-3.5 h-3.5" /> },
    { id: 'speed-ramp', label: 'Speed Ramp', icon: <Gauge className="w-3.5 h-3.5" /> },
  ];

  const vfxCaps = detectVideoExportCapabilities();

  return (
    <div className="space-y-4 pb-24 lg:pb-8">
      <input ref={fileInputRef} type="file" accept="video/*" onChange={handleVideoImport} className="hidden" />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          <div className="rounded-2xl bg-[#080B14] border border-white/10 p-3 sm:p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[40px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-xs font-semibold text-white flex items-center gap-2 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-sky-300" />
                <span>Import Video Layer</span>
              </button>

              <button
                type="button"
                disabled={isExporting}
                onClick={() => handleExportVfx(false)}
                className="min-h-[40px] px-4 rounded-xl bg-gradient-to-r from-violet-600 to-sky-500 text-xs font-semibold text-white flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>
                  {isExporting
                    ? 'Rendering VFX...'
                    : `Export VFX ${vfxCaps.mp4Supported ? 'MP4' : 'WebM'}`}
                </span>
              </button>
            </div>

            <GallerySaveBanner
              saving={gallerySaving}
              progressPct={galleryProgress}
              stageLabel={galleryStage}
              result={galleryResult}
              onSaveCopyAnyway={() => handleExportVfx(true)}
              onDismiss={() => setGalleryResult(null)}
            />

            <div className="min-h-[250px] sm:min-h-[360px] rounded-xl bg-[#04060A] border border-white/[0.06] flex items-center justify-center p-2 overflow-hidden">
              <canvas
                ref={canvasRef}
                onClick={(e) => {
                  if (tab !== 'tracking' || !canvasRef.current) return;
                  const rect = canvasRef.current.getBoundingClientRect();
                  const x = Math.max(0.08, Math.min(0.92, (e.clientX - rect.left) / rect.width));
                  const y = Math.max(0.08, Math.min(0.92, (e.clientY - rect.top) / rect.height));
                  if (playhead < duration * 0.5) setTrackStart({ x, y });
                  else setTrackEnd({ x, y });
                }}
                className={`max-w-full max-h-[420px] object-contain rounded-lg ${tab === 'tracking' ? 'cursor-crosshair' : ''}`}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPlaying((p) => !p)}
                  className="min-h-[42px] min-w-[42px] rounded-xl bg-gradient-to-r from-violet-600 to-sky-500 text-white flex items-center justify-center cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>
                <span className="text-xs font-mono-tabular text-amber-300">
                  {formatTimecode(playhead)} / {formatTimecode(duration)}
                </span>
              </div>
              <span className="text-xs font-mono-tabular text-sky-300">
                Speed {getSpeedAt(playhead).toFixed(2)}x
              </span>
            </div>
          </div>

          {/* 4-Layer Multi-Track VFX Timeline */}
          <div className="rounded-2xl bg-[#080B14] border border-white/10 p-3 sm:p-4 space-y-2.5">
            <input
              type="range"
              min={0}
              max={duration}
              step={0.05}
              value={playhead}
              onChange={(e) => {
                const v = Number(e.target.value);
                playheadRef.current = v;
                setPlayhead(v);
              }}
              className="studio-slider w-full cursor-pointer"
            />
            <div className="flex items-center gap-2">
              <span className="w-8 text-[10px] font-mono-tabular text-sky-300">V1</span>
              <div className="flex-1 h-8 rounded-lg bg-violet-600/20 border border-violet-400/35 px-3 flex items-center text-[11px] text-white">
                Foreground Layer {chromaEnabled ? '(Chroma Keyed)' : ''}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-8 text-[10px] font-mono-tabular text-emerald-300">V2</span>
              <div className="flex-1 h-8 rounded-lg bg-sky-600/15 border border-sky-400/25 px-3 flex items-center text-[11px] text-slate-300">
                {chromaEnabled ? 'Composite Backdrop Plate Active' : 'Enable Green Screen to reveal V2 Backdrop'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-8 text-[10px] font-mono-tabular text-amber-300">K1</span>
              <div className="flex-1 h-8 rounded-lg bg-[#060812] border border-white/10 relative">
                {keyframes.map((kf) => (
                  <button
                    key={kf.id}
                    type="button"
                    onClick={() => {
                      setSelectedKfId(kf.id);
                      playheadRef.current = kf.time;
                      setPlayhead(kf.time);
                      setTab('keyframes');
                    }}
                    style={{ left: `${Math.min(96, (kf.time / duration) * 100)}%` }}
                    className={`absolute top-1.5 w-4 h-4 rotate-45 border cursor-pointer ${
                      selectedKf?.id === kf.id ? 'bg-amber-400 border-white' : 'bg-violet-500 border-white/40'
                    }`}
                    title={`Keyframe ${kf.time}s`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right VFX Inspector */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          <div className="rounded-2xl bg-[#0B1020]/85 backdrop-blur-xl border border-white/10 p-2 grid grid-cols-2 gap-1.5">
            {vfxTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`min-h-[40px] px-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                  tab === t.id
                    ? 'bg-gradient-to-r from-violet-600/30 to-sky-500/25 border-sky-400/50 text-white'
                    : 'bg-[#060812] border-white/[0.06] text-slate-400'
                }`}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          <div className="rounded-2xl bg-[#0B1020]/85 backdrop-blur-xl border border-white/10 p-4 space-y-4">
            {tab === 'green-screen' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">Chroma Keyer</span>
                  <button
                    type="button"
                    onClick={() => setChromaEnabled((v) => !v)}
                    className={`min-h-[34px] px-3 rounded-lg border text-xs font-mono-tabular cursor-pointer ${
                      chromaEnabled ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200' : 'bg-[#060812] border-white/10 text-slate-400'
                    }`}
                  >
                    {chromaEnabled ? 'KEY ON' : 'KEY OFF'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {(['green', 'blue'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKeyColor(k)}
                      className={`min-h-[38px] rounded-xl border text-xs capitalize cursor-pointer ${
                        keyColor === k ? 'bg-white/12 border-sky-400 text-white' : 'bg-[#060812] border-white/10 text-slate-400'
                      }`}
                    >
                      {k} Screen
                    </button>
                  ))}
                </div>

                <SliderControl label="Key Similarity" value={keyThreshold} min={20} max={160} defaultValue={85} onChange={setKeyThreshold} />
                <SliderControl label="Edge Smoothness" value={keySmooth} min={0} max={80} defaultValue={28} onChange={setKeySmooth} />

                <div>
                  <p className="text-xs font-medium text-slate-300 mb-1.5">V2 Composite Backdrop</p>
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {STUDIO_ASSETS.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setBgImageUrl(a.url);
                          setChromaEnabled(true);
                        }}
                        className={`w-12 h-10 rounded-lg overflow-hidden border shrink-0 cursor-pointer ${
                          bgImageUrl === a.url ? 'border-amber-400' : 'border-white/10'
                        }`}
                      >
                        <img src={a.url} alt={a.title} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === 'keyframes' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">Keyframes ({keyframes.length})</span>
                  <button
                    type="button"
                    onClick={handleAddKeyframe}
                    className="min-h-[36px] px-3 rounded-lg bg-violet-600/30 border border-violet-400/40 text-xs font-semibold text-white flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add at {playhead.toFixed(1)}s</span>
                  </button>
                </div>

                {selectedKf && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between pb-1">
                      <span className="text-xs font-mono-tabular text-amber-300">t = {selectedKf.time.toFixed(1)}s</span>
                      {keyframes.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setKeyframes((prev) => prev.filter((k) => k.id !== selectedKf.id))}
                          className="p-1 text-slate-400 hover:text-rose-300 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <SliderControl
                      label="Scale"
                      value={Number(selectedKf.scale.toFixed(2))}
                      min={0.6}
                      max={2}
                      step={0.05}
                      defaultValue={1}
                      unit="x"
                      onChange={(v) => setKeyframes((p) => p.map((k) => (k.id === selectedKf.id ? { ...k, scale: v } : k)))}
                    />
                    <SliderControl
                      label="Rotation"
                      value={selectedKf.rotation}
                      min={-45}
                      max={45}
                      defaultValue={0}
                      unit="°"
                      onChange={(v) => setKeyframes((p) => p.map((k) => (k.id === selectedKf.id ? { ...k, rotation: v } : k)))}
                    />
                    <SliderControl
                      label="Opacity"
                      value={selectedKf.opacity}
                      min={0}
                      max={100}
                      defaultValue={100}
                      unit="%"
                      onChange={(v) => setKeyframes((p) => p.map((k) => (k.id === selectedKf.id ? { ...k, opacity: v } : k)))}
                    />
                  </div>
                )}
              </div>
            )}

            {tab === 'tracking' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">Motion Tracking Callout</span>
                  <button
                    type="button"
                    onClick={() => setTrackEnabled((v) => !v)}
                    className={`min-h-[34px] px-3 rounded-lg border text-xs font-mono-tabular cursor-pointer ${
                      trackEnabled ? 'bg-sky-500/20 border-sky-400 text-white' : 'bg-[#060812] border-white/10 text-slate-400'
                    }`}
                  >
                    {trackEnabled ? 'ACTIVE' : 'OFF'}
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  Tap directly on the video preview to pin Start (first half) or End (second half) tracking coordinates.
                </p>
                <input
                  type="text"
                  value={trackLabel}
                  onChange={(e) => setTrackLabel(e.target.value)}
                  className="w-full min-h-[40px] px-3 rounded-xl bg-[#060812] border border-white/10 text-xs text-amber-200 font-mono-tabular"
                />
                <SliderControl label="Start X" value={Math.round(trackStart.x * 100)} min={10} max={90} unit="%" onChange={(v) => setTrackStart((p) => ({ ...p, x: v / 100 }))} />
                <SliderControl label="End X" value={Math.round(trackEnd.x * 100)} min={10} max={90} unit="%" onChange={(v) => setTrackEnd((p) => ({ ...p, x: v / 100 }))} />
              </div>
            )}

            {tab === 'speed-ramp' && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-white">Dynamic Speed Curve</p>
                <p className="text-[11px] text-slate-400">Smoothly ramps velocity across Start → Mid → End of the clip.</p>
                <SliderControl label="Start Velocity" value={rampStart} min={0.25} max={3} step={0.05} defaultValue={1.2} unit="x" onChange={setRampStart} />
                <SliderControl label="Mid Slow-Mo / Peak" value={rampMid} min={0.25} max={3} step={0.05} defaultValue={0.4} unit="x" onChange={setRampMid} />
                <SliderControl label="End Velocity" value={rampEnd} min={0.25} max={3} step={0.05} defaultValue={1.8} unit="x" onChange={setRampEnd} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
