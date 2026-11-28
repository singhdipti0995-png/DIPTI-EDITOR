import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Captions,
  Download,
  Film,
  Loader2,
  Music,
  Pause,
  Play,
  Plus,
  Save,
  Scissors,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react';
import { loadImageElement } from "./imageProcessing";
import type {
  CaptionCue,
  MusicTrackId,
  StudioProject,
  VideoToolMode,
  VideoTransitionId,
} from "./src/types/editor";

interface VideoEditorWorkspaceProps {
  initialTool: VideoToolMode;
  projects: StudioProject[];
  onSaveProject: (project: StudioProject) => void;
  onNotify: (msg: string) => void;
}

const VIDEO_TABS: { id: VideoToolMode; label: string; icon: typeof Scissors }[] = [
  { id: 'trim', label: 'Trim', icon: Scissors },
  { id: 'music', label: 'Music', icon: Music },
  { id: 'transitions', label: 'Transitions', icon: Film },
  { id: 'captions', label: 'Auto Captions', icon: Captions },
];

const TRANSITIONS: { id: VideoTransitionId; name: string; desc: string }[] = [
  { id: 'crossfade', name: 'Silky Crossfade', desc: 'Smooth studio optical blend' },
  { id: 'gold-dissolve', name: 'Gold Dissolve', desc: 'Warm champagne flash dissolve' },
  { id: 'luma-wipe', name: 'Luma Wipe', desc: 'Directional cinema curtain sweep' },
  { id: 'prism-zoom', name: 'Prism Zoom', desc: 'Dynamic optical push transition' },
];

export function VideoEditorWorkspace({
  initialTool,
  projects,
  onSaveProject,
  onNotify,
}: VideoEditorWorkspaceProps) {
  const [tool, setTool] = useState<VideoToolMode>(initialTool);
  const [reelTitle, setReelTitle] = useState('Alpine Dusk Cinema Reel');
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [totalDuration, setTotalDuration] = useState(12);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(12);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Music state
  const [trackId, setTrackId] = useState<MusicTrackId>('midnight-gold');
  const [musicVolume, setMusicVolume] = useState(0.65);
  const [customAudioUrl, setCustomAudioUrl] = useState<string | null>(null);

  // Transitions & Captions
  const [transition, setTransition] = useState<VideoTransitionId>('gold-dissolve');
  const [captions, setCaptions] = useState<CaptionCue[]>([
    { id: 'c1', startSec: 0.4, endSec: 3.8, text: 'Shot in Obsidian Studio Grade' },
    { id: 'c2', startSec: 4.2, endSec: 8.2, text: 'Precision Color & Light by DIPTI EDITOR' },
    { id: 'c3', startSec: 8.6, endSec: 11.6, text: 'Directed by DIPTI SINGH' },
  ]);
  const [captionScriptPrompt, setCaptionScriptPrompt] = useState(
    'Golden hour mountain vista cutting to luxury studio watch macro and twilight pavilion.'
  );
  const [captionBusy, setCaptionBusy] = useState(false);
  const [captionError, setCaptionError] = useState<string | null>(null);
  const [newCueText, setNewCueText] = useState('');
  const [exporting, setExporting] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const customAudioRef = useRef<HTMLAudioElement | null>(null);
  const slideImagesRef = useRef<HTMLImageElement[]>([]);
  const musicEngineRef = useRef<AmbientMusicEngine | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setTool(initialTool);
  }, [initialTool]);

  // Preload project thumbnails for the built-in multi-clip Cinema Reel
  useEffect(() => {
    let active = true;
    const urls = projects.slice(0, 4).map((p) => p.thumbnailUrl);
    Promise.allSettled(urls.map((u) => loadImageElement(u))).then((results) => {
      if (!active) return;
      slideImagesRef.current = results
        .filter((r): r is PromiseFulfilledResult<HTMLImageElement> => r.status === 'fulfilled')
        .map((r) => r.value);
    });
    return () => {
      active = false;
    };
  }, [projects]);

  useEffect(() => {
    musicEngineRef.current = new AmbientMusicEngine();
    return () => {
      musicEngineRef.current?.stop();
    };
  }, []);

  // Sync audio playback with play/pause state
  useEffect(() => {
    if (!isPlaying) {
      musicEngineRef.current?.stop();
      customAudioRef.current?.pause();
      videoElRef.current?.pause();
      return;
    }

    if (trackId === 'custom' && customAudioRef.current) {
      customAudioRef.current.volume = musicVolume;
      void customAudioRef.current.play().catch(() => {});
    } else if (trackId !== 'none') {
      musicEngineRef.current?.start(trackId, musicVolume);
    }

    if (uploadedVideoUrl && videoElRef.current) {
      videoElRef.current.currentTime = Math.max(trimStart, Math.min(trimEnd, currentTime));
      void videoElRef.current.play().catch(() => {});
    }
  }, [isPlaying, trackId, musicVolume, uploadedVideoUrl]);

  useEffect(() => {
    musicEngineRef.current?.setVolume(musicVolume);
    if (customAudioRef.current) {
      customAudioRef.current.volume = musicVolume;
    }
  }, [musicVolume]);

  // Draw a single timeline frame at timestamp tSec onto canvas
  const renderTimelineFrame = useCallback(
    (tSec: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = '#03050a';
      ctx.fillRect(0, 0, w, h);

      if (uploadedVideoUrl && videoElRef.current && videoElRef.current.readyState >= 2) {
        ctx.drawImage(videoElRef.current, 0, 0, w, h);
      } else if (slideImagesRef.current.length > 0) {
        const slides = slideImagesRef.current;
        const span = Math.max(2, trimEnd - trimStart);
        const rel = Math.max(0, tSec - trimStart);
        const perSlide = span / slides.length;
        const slideIndex = Math.min(slides.length - 1, Math.floor(rel / perSlide));
        const nextIndex = (slideIndex + 1) % slides.length;
        const localProgress = (rel % perSlide) / perSlide;

        const drawCover = (img: HTMLImageElement, scaleBoost: number, alpha: number) => {
          ctx.save();
          ctx.globalAlpha = alpha;
          const baseScale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * scaleBoost;
          const dw = img.naturalWidth * baseScale;
          const dh = img.naturalHeight * baseScale;
          ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
          ctx.restore();
        };

        const zoomAmt = 1 + localProgress * 0.06;
        drawCover(slides[slideIndex], zoomAmt, 1);

        // Apply selected transition in final 25% of each slide
        if (localProgress > 0.75) {
          const tp = (localProgress - 0.75) / 0.25;
          if (transition === 'crossfade') {
            drawCover(slides[nextIndex], 1 + (1 - tp) * 0.04, tp);
          } else if (transition === 'gold-dissolve') {
            drawCover(slides[nextIndex], 1.02, tp);
            const flash = Math.sin(tp * Math.PI) * 0.35;
            ctx.fillStyle = `rgba(212, 175, 55, ${flash})`;
            ctx.fillRect(0, 0, w, h);
          } else if (transition === 'luma-wipe') {
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, w * tp, h);
            ctx.clip();
            drawCover(slides[nextIndex], 1.02, 1);
            ctx.restore();
          } else if (transition === 'prism-zoom') {
            drawCover(slides[nextIndex], 1.18 - tp * 0.16, tp);
          }
        }
      } else {
        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, '#091128');
        g.addColorStop(1, '#1b103f');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }

      // Active Timed Caption Overlay
      const activeCue = captions.find((c) => tSec >= c.startSec && tSec <= c.endSec);
      if (activeCue) {
        ctx.save();
        ctx.font = '600 28px "Plus Jakarta Sans", sans-serif';
        const metrics = ctx.measureText(activeCue.text);
        const padX = 24;
        const boxW = Math.min(w - 48, metrics.width + padX * 2);
        const boxH = 50;
        const bx = (w - boxW) / 2;
        const by = h - 78;
        ctx.fillStyle = 'rgba(3, 5, 12, 0.78)';
        ctx.beginPath();
        ctx.roundRect(bx, by, boxW, boxH, 12);
        ctx.fill();
        ctx.strokeStyle = 'rgba(212, 175, 55, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(activeCue.text, w / 2, by + boxH / 2, w - 72);
        ctx.restore();
      }
    },
    [uploadedVideoUrl, trimStart, trimEnd, transition, captions]
  );

  // Playback loop
  useEffect(() => {
    renderTimelineFrame(currentTime);
    if (!isPlaying) return;

    let rafId = 0;
    let lastTs = performance.now();

    const tick = (now: number) => {
      const dt = (now - lastTs) / 1000;
      lastTs = now;
      setCurrentTime((prev) => {
        const next = prev + dt;
        if (next >= trimEnd) {
          if (videoElRef.current) videoElRef.current.currentTime = trimStart;
          return trimStart;
        }
        return next;
      });
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, trimStart, trimEnd, currentTime, renderTimelineFrame]);

  const handleUploadVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setUploadedVideoUrl(url);
    setReelTitle(file.name.replace(/\.[^.]+$/, '') || 'Imported Clip');
    onNotify('Video clip loaded into timeline');
  };

  const handleUploadCustomAudio = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCustomAudioUrl(url);
    setTrackId('custom');
    onNotify('Custom soundtrack attached');
  };

  const handleGenerateAiCaptions = async () => {
    if (!captionScriptPrompt.trim()) return;
    setCaptionBusy(true);
    setCaptionError(null);
    try {
      const res = await fetch('/api/ai/captions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: captionScriptPrompt,
          durationSeconds: Math.max(4, Math.round(trimEnd - trimStart)),
          style: 'cinematic luxury',
        }),
      });
      const payload = (await res.json()) as {
        cues?: { startSec: number; endSec: number; text: string }[];
        error?: string;
      };
      if (!res.ok || !payload.cues?.length) {
        // Segment script into smooth timed cues locally so Auto Captions always produces usable cues
        const span = Math.max(4, trimEnd - trimStart);
        const clauses = captionScriptPrompt
          .split(/[,.;!?]+|\s+(?:and|then|cutting to|to)\s+/i)
          .map((s) => s.trim())
          .filter((s) => s.length > 2)
          .slice(0, 6);
        const usable = clauses.length > 0 ? clauses : [captionScriptPrompt.trim().slice(0, 48)];
        const sliceDur = span / usable.length;
        setCaptions(
          usable.map((text, idx) => ({
            id: `cue-${Date.now()}-${idx}`,
            startSec: Number((trimStart + idx * sliceDur + 0.1).toFixed(1)),
            endSec: Number((trimStart + (idx + 1) * sliceDur - 0.1).toFixed(1)),
            text,
          }))
        );
        setCaptionError(payload.error ? `${payload.error} Applied local smart timing.` : null);
        onNotify(`Generated ${usable.length} timed captions`);
        return;
      }
      setCaptions(
        payload.cues.map((c, idx) => ({
          id: `ai-cue-${Date.now()}-${idx}`,
          startSec: Number((trimStart + c.startSec).toFixed(1)),
          endSec: Number((trimStart + c.endSec).toFixed(1)),
          text: c.text,
        }))
      );
      onNotify(`Generated ${payload.cues.length} timed captions`);
    } catch {
      setCaptionError('Network error generating captions.');
    } finally {
      setCaptionBusy(false);
    }
  };

  const handleAddCue = () => {
    if (!newCueText.trim()) return;
    const start = Number(currentTime.toFixed(1));
    const end = Number(Math.min(totalDuration, start + 2.8).toFixed(1));
    setCaptions((prev) => [
      ...prev,
      { id: `cue-${Date.now()}`, startSec: start, endSec: end, text: newCueText.trim() },
    ]);
    setNewCueText('');
  };

  const handleExportVideo = async () => {
    const canvas = canvasRef.current;
    if (!canvas || typeof MediaRecorder === 'undefined') {
      onNotify('MediaRecorder export is not supported in this browser.');
      return;
    }

    setExporting(true);
    setIsPlaying(false);

    try {
      const stream = canvas.captureStream(30);
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };

      const exportDone = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      });

      recorder.start();
      const exportDuration = Math.min(8, Math.max(2, trimEnd - trimStart));
      const fps = 30;
      const totalFrames = Math.round(exportDuration * fps);
      for (let f = 0; f <= totalFrames; f++) {
        const t = trimStart + (f / totalFrames) * (trimEnd - trimStart);
        renderTimelineFrame(t);
        await new Promise((r) => setTimeout(r, Math.round(1000 / fps)));
      }
      recorder.stop();

      const blob = await exportDone;
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = `${reelTitle.toLowerCase().replace(/\s+/g, '-')}.webm`;
      a.click();
      onNotify('Video timeline exported (.webm)');
    } catch {
      onNotify('Could not complete video export.');
    } finally {
      setExporting(false);
    }
  };

  const handleSaveTimelineProject = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderTimelineFrame(currentTime);
    onSaveProject({
      id: `video-${Date.now()}`,
      title: reelTitle || 'Studio Reel',
      kind: 'Video',
      thumbnailUrl: canvas.toDataURL('image/jpeg', 0.85),
      dimensions: '1920 × 1080',
      updatedLabel: 'Just now',
      durationSec: Math.round(trimEnd - trimStart),
      lastTool: VIDEO_TABS.find((t) => t.id === tool)?.label ?? 'Video Editor',
    });
    onNotify('Video timeline saved to Recent Projects');
  };

  return (
    <div className="space-y-5">
      {/* Hidden Media Inputs */}
      <input ref={videoInputRef} type="file" accept="video/*" onChange={handleUploadVideo} className="hidden" />
      <input ref={audioInputRef} type="file" accept="audio/*" onChange={handleUploadCustomAudio} className="hidden" />
      {uploadedVideoUrl && (
        <video
          ref={videoElRef}
          src={uploadedVideoUrl}
          playsInline
          muted
          onLoadedMetadata={(e) => {
            const dur = Math.max(4, Math.round(e.currentTarget.duration || 12));
            setTotalDuration(dur);
            setTrimStart(0);
            setTrimEnd(dur);
            setCurrentTime(0);
          }}
          className="hidden"
        />
      )}
      {customAudioUrl && <audio ref={customAudioRef} src={customAudioUrl} loop className="hidden" />}

      {/* Top Bar */}
      <div className="glass-surface rounded-2xl p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={reelTitle}
            onChange={(e) => setReelTitle(e.target.value)}
            aria-label="Video project title"
            className="min-h-[40px] px-3 rounded-xl bg-[#050814] border border-white/10 text-sm font-semibold text-white w-48 sm:w-64 focus:outline-none focus:border-[#3b82f6]/60"
          />
          <span className="hidden sm:inline text-xs text-slate-400 tabular-nums whitespace-nowrap">
            {(trimEnd - trimStart).toFixed(1)}s cut
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            className="min-h-[40px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-medium text-slate-100 inline-flex items-center gap-2 whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5 text-blue-400" />
            <span>Import Video</span>
          </button>

          <button
            type="button"
            onClick={handleSaveTimelineProject}
            className="min-h-[40px] px-3.5 rounded-xl bg-[#8b5cf6]/20 hover:bg-[#8b5cf6]/30 border border-[#8b5cf6]/40 text-xs font-semibold text-violet-100 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save</span>
          </button>

          <button
            type="button"
            disabled={exporting}
            onClick={handleExportVideo}
            className="min-h-[40px] px-4 rounded-xl bg-gradient-to-r from-[#3b82f6] to-[#8b5cf6] text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            <span>{exporting ? 'Rendering...' : 'Export .webm'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Video Monitor & Timeline Scrubber */}
        <div className="lg:col-span-8 space-y-3">
          <div className="rounded-3xl overflow-hidden border border-white/10 bg-[#050812] p-3">
            <canvas
              ref={canvasRef}
              width={960}
              height={540}
              className="w-full aspect-video rounded-2xl bg-[#03050a]"
            />
          </div>

          <div className="glass-surface rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsPlaying((p) => !p)}
                aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
                className="min-h-[44px] min-w-[44px] rounded-xl bg-gradient-to-r from-[#e5c158] to-[#c49b27] text-[#050811] flex items-center justify-center shrink-0"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>

              <div className="flex-1 space-y-1">
                <input
                  type="range"
                  min={trimStart}
                  max={trimEnd}
                  step={0.1}
                  value={currentTime}
                  onChange={(e) => {
                    const t = Number(e.target.value);
                    setCurrentTime(t);
                    if (videoElRef.current) videoElRef.current.currentTime = t;
                  }}
                  aria-label="Timeline playhead"
                  className="w-full accent-[#d4af37]"
                />
                <div className="flex justify-between text-[11px] font-mono text-slate-400 tabular-nums">
                  <span>{currentTime.toFixed(1)}s</span>
                  <span>
                    In {trimStart.toFixed(1)}s · Out {trimEnd.toFixed(1)}s
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Controls */}
        <div className="lg:col-span-4 glass-surface rounded-3xl p-4 sm:p-5 flex flex-col gap-5">
          <div className="grid grid-cols-4 gap-1.5 bg-[#050814] p-1.5 rounded-2xl border border-white/[0.06]">
            {VIDEO_TABS.map((t) => {
              const Icon = t.icon;
              const active = tool === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTool(t.id)}
                  className={`min-h-[44px] px-1.5 py-1.5 rounded-xl text-[11px] font-medium flex flex-col items-center justify-center gap-1 transition-colors ${
                    active
                      ? 'bg-gradient-to-br from-[#3b82f6]/25 via-[#8b5cf6]/25 to-[#d4af37]/15 text-white border border-[#3b82f6]/45'
                      : 'text-slate-400 hover:text-white border border-transparent'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${active ? 'text-blue-300' : ''}`} />
                  <span className="truncate max-w-full">{t.label}</span>
                </button>
              );
            })}
          </div>

          {tool === 'trim' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-white">Frame-Accurate Trim</h3>
                <p className="text-xs text-slate-400 mt-0.5">Adjust start and end points of your cut</p>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Start Point</span>
                  <span className="font-mono text-slate-400 tabular-nums">{trimStart.toFixed(1)}s</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0.5, trimEnd - 1)}
                  step={0.2}
                  value={trimStart}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setTrimStart(v);
                    if (currentTime < v) setCurrentTime(v);
                  }}
                  className="w-full accent-[#3b82f6]"
                />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">End Point</span>
                  <span className="font-mono text-slate-400 tabular-nums">{trimEnd.toFixed(1)}s</span>
                </div>
                <input
                  type="range"
                  min={Math.min(totalDuration, trimStart + 1)}
                  max={totalDuration}
                  step={0.2}
                  value={trimEnd}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setTrimEnd(v);
                    if (currentTime > v) setCurrentTime(v);
                  }}
                  className="w-full accent-[#3b82f6]"
                />
              </div>
            </div>
          )}

          {tool === 'music' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">Studio Soundtrack</h3>
                <button
                  type="button"
                  onClick={() => audioInputRef.current?.click()}
                  className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs text-amber-200 border border-white/10"
                >
                  Upload Audio
                </button>
              </div>

              <div className="space-y-2">
                {BUILT_IN_TRACKS.map((tr) => (
                  <button
                    key={tr.id}
                    type="button"
                    onClick={() => setTrackId(tr.id)}
                    className={`w-full min-h-[48px] px-3 py-2 rounded-xl border flex items-center justify-between text-left ${
                      trackId === tr.id
                        ? 'border-[#d4af37]/55 bg-[#d4af37]/12 text-white'
                        : 'border-white/[0.07] bg-[#050814]/80 text-slate-300'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-semibold">{tr.title}</p>
                      <p className="text-[11px] text-slate-400">{tr.mood}</p>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400 tabular-nums">{tr.bpm} BPM</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setTrackId('none')}
                  className={`w-full min-h-[40px] px-3 rounded-xl border text-xs ${
                    trackId === 'none'
                      ? 'border-white/30 bg-white/10 text-white'
                      : 'border-white/[0.06] text-slate-400'
                  }`}
                >
                  Mute / Original Audio Only
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-300 inline-flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-[#d4af37]" /> Score Volume
                  </span>
                  <span className="font-mono text-slate-400 tabular-nums">{Math.round(musicVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={musicVolume}
                  onChange={(e) => setMusicVolume(Number(e.target.value))}
                  className="w-full accent-[#d4af37]"
                />
              </div>
            </div>
          )}

          {tool === 'transitions' && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-white">Scene Transitions</h3>
              <div className="space-y-2">
                {TRANSITIONS.map((tr) => (
                  <button
                    key={tr.id}
                    type="button"
                    onClick={() => {
                      setTransition(tr.id);
                      onNotify(`Transition set to ${tr.name}`);
                    }}
                    className={`w-full min-h-[52px] px-3.5 py-2.5 rounded-xl border text-left transition-colors ${
                      transition === tr.id
                        ? 'border-[#8b5cf6]/60 bg-[#8b5cf6]/18 text-white'
                        : 'border-white/[0.07] bg-[#050814]/80 text-slate-300 hover:border-white/20'
                    }`}
                  >
                    <p className="text-xs font-semibold">{tr.name}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{tr.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {tool === 'captions' && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-white">Auto Captions</h3>
              <textarea
                rows={2}
                value={captionScriptPrompt}
                onChange={(e) => setCaptionScriptPrompt(e.target.value)}
                placeholder="Describe scene or transcript for timed AI subtitles..."
                className="w-full p-2.5 rounded-xl bg-[#050814] border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#3b82f6]/60"
              />
              <button
                type="button"
                disabled={captionBusy || !captionScriptPrompt.trim()}
                onClick={handleGenerateAiCaptions}
                className="w-full min-h-[44px] rounded-xl bg-gradient-to-r from-[#8b5cf6] to-[#3b82f6] text-white text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {captionBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>{captionBusy ? 'Generating Timed Cues...' : 'Generate AI Auto Captions'}</span>
              </button>

              {captionError && (
                <p className="text-xs text-amber-200 bg-amber-500/10 border border-amber-400/25 rounded-xl px-3 py-2">
                  {captionError}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={newCueText}
                  onChange={(e) => setNewCueText(e.target.value)}
                  placeholder="Add subtitle at playhead..."
                  className="flex-1 min-h-[40px] px-3 rounded-xl bg-[#050814] border border-white/10 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={handleAddCue}
                  aria-label="Add subtitle cue"
                  className="min-h-[40px] min-w-[40px] rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                {captions.map((cue) => (
                  <div
                    key={cue.id}
                    className="p-2.5 rounded-xl bg-[#050814]/85 border border-white/[0.06] flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-[10px] font-mono text-[#d4af37] tabular-nums">
                        {cue.startSec}s – {cue.endSec}s
                      </p>
                      <p className="text-xs text-slate-200 truncate">{cue.text}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCaptions((prev) => prev.filter((c) => c.id !== cue.id))}
                      aria-label="Delete subtitle cue"
                      className="min-h-[32px] min-w-[32px] rounded-lg text-slate-500 hover:text-rose-300 flex items-center justify-center shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
