import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Download,
  Eye,
  FolderOpen,
  Layers,
  Loader2,
  Pipette,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-react';
import {
  CINEMATIC_PRESETS,
  applyFilterAndEffects,
  computeAutoEnhanceAdjustments,
  loadImageElement,
  removeBackgroundChroma,
} from '../../utils/imageProcessing';
import {
  DEFAULT_ADJUSTMENTS,
  type EditorSettings,
  type FilterAdjustments,
  type PhotoToolMode,
  type StudioProject,
} from '../../types/editor';

interface PhotoEditorWorkspaceProps {
  initialTool: PhotoToolMode;
  activeImageUrl: string;
  activeTitle: string;
  projects: StudioProject[];
  settings: EditorSettings;
  onSaveProject: (project: StudioProject) => void;
  onNotify: (msg: string) => void;
}

const PHOTO_TABS: { id: PhotoToolMode; label: string; icon: typeof Wand2 }[] = [
  { id: 'enhance', label: 'AI Enhance', icon: Wand2 },
  { id: 'bg-remove', label: 'BG Remover', icon: Layers },
  { id: 'filters', label: 'Filters', icon: Sparkles },
  { id: 'effects', label: 'Effects', icon: SlidersHorizontal },
];

export function PhotoEditorWorkspace({
  initialTool,
  activeImageUrl,
  activeTitle,
  projects,
  settings,
  onSaveProject,
  onNotify,
}: PhotoEditorWorkspaceProps) {
  const [tool, setTool] = useState<PhotoToolMode>(initialTool);
  const [sourceUrl, setSourceUrl] = useState<string>(activeImageUrl);
  const [projectTitle, setProjectTitle] = useState<string>(activeTitle);
  const [adj, setAdj] = useState<FilterAdjustments>(DEFAULT_ADJUSTMENTS);

  // Background Remover state
  const [bgRemoved, setBgRemoved] = useState(false);
  const [bgTolerance, setBgTolerance] = useState(42);
  const [bgFeather, setBgFeather] = useState(14);
  const [pickedColor, setPickedColor] = useState<[number, number, number] | null>(null);
  const [eyedropperActive, setEyedropperActive] = useState(false);

  // Compare & Loading states
  const [showOriginal, setShowOriginal] = useState(false);
  const [compareSplit, setCompareSplit] = useState(50);
  const [compareMode, setCompareMode] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 1200, height: 900 });

  // AI Mood Grade Recipe
  const [moodPrompt, setMoodPrompt] = useState('');
  const [aiMoodBusy, setAiMoodBusy] = useState(false);
  const [aiMoodStatus, setAiMoodStatus] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalImageDataRef = useRef<ImageData | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setTool(initialTool);
  }, [initialTool]);

  useEffect(() => {
    setSourceUrl(activeImageUrl);
    setProjectTitle(activeTitle);
    setAdj(DEFAULT_ADJUSTMENTS);
    setBgRemoved(false);
    setPickedColor(null);
  }, [activeImageUrl, activeTitle]);

  // Load source image into working buffer
  useEffect(() => {
    let active = true;
    setImageLoading(true);
    setImageError(null);

    loadImageElement(sourceUrl)
      .then((img) => {
        if (!active) return;
        const maxSide = settings.highPrecisionCanvas ? 1280 : 960;
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const targetW = Math.max(120, Math.round(img.naturalWidth * scale));
        const targetH = Math.max(120, Math.round(img.naturalHeight * scale));

        const offscreen = document.createElement('canvas');
        offscreen.width = targetW;
        offscreen.height = targetH;
        const offCtx = offscreen.getContext('2d');
        if (!offCtx) throw new Error('Unable to initialize canvas buffer.');
        offCtx.drawImage(img, 0, 0, targetW, targetH);

        originalImageDataRef.current = offCtx.getImageData(0, 0, targetW, targetH);
        setDimensions({ width: targetW, height: targetH });
        setImageLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setImageError(err instanceof Error ? err.message : 'Unable to load image.');
        setImageLoading(false);
      });

    return () => {
      active = false;
    };
  }, [sourceUrl, settings.highPrecisionCanvas]);

  // Render pipeline whenever adjustments or background removal settings change
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const baseData = originalImageDataRef.current;
    if (!canvas || !baseData) return;

    canvas.width = baseData.width;
    canvas.height = baseData.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (showOriginal) {
      ctx.putImageData(baseData, 0, 0);
      return;
    }

    let working = baseData;
    if (bgRemoved) {
      working = removeBackgroundChroma(working, pickedColor, bgTolerance, bgFeather);
    }
    const graded = applyFilterAndEffects(working, adj);

    if (compareMode) {
      const splitX = Math.round((compareSplit / 100) * baseData.width);
      ctx.putImageData(graded, 0, 0);
      if (splitX > 0) {
        ctx.putImageData(baseData, 0, 0, 0, 0, splitX, baseData.height);
      }
      ctx.save();
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = Math.max(2, Math.round(baseData.width * 0.003));
      ctx.beginPath();
      ctx.moveTo(splitX, 0);
      ctx.lineTo(splitX, baseData.height);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.putImageData(graded, 0, 0);
    }
  }, [adj, bgRemoved, bgTolerance, bgFeather, pickedColor, showOriginal, compareMode, compareSplit]);

  useEffect(() => {
    if (!imageLoading && !imageError) {
      renderCanvas();
    }
  }, [imageLoading, imageError, renderCanvas]);

  const handleUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSourceUrl(reader.result);
        setProjectTitle(file.name.replace(/\.[^.]+$/, '') || 'Studio Import');
        setAdj(DEFAULT_ADJUSTMENTS);
        setBgRemoved(false);
        setPickedColor(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAutoEnhance = () => {
    if (!originalImageDataRef.current) return;
    const next = computeAutoEnhanceAdjustments(originalImageDataRef.current);
    setAdj(next);
    setAiMoodStatus('Applied smart auto-levels histogram stretch and highlight clarity.');
    onNotify('AI Auto Enhance applied');
  };

  const handleApplyMoodRecipe = async () => {
    if (!moodPrompt.trim()) return;
    setAiMoodBusy(true);
    setAiMoodStatus(null);
    try {
      const res = await fetch('/api/ai/grade-recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mood: moodPrompt.trim() }),
      });
      const payload = (await res.json()) as {
        recipe?: {
          lookName: string;
          exposure: number;
          contrast: number;
          saturation: number;
          temperature: number;
          vignette: number;
          sharpen: number;
        };
        error?: string;
      };

      if (!res.ok || !payload.recipe) {
        // Local cinematic fallback parser when server key is not set
        const lower = moodPrompt.toLowerCase();
        const warm = lower.includes('gold') || lower.includes('warm') || lower.includes('sunset');
        const moody = lower.includes('dark') || lower.includes('noir') || lower.includes('night');
        setAdj({
          ...DEFAULT_ADJUSTMENTS,
          exposure: moody ? -8 : 6,
          contrast: 24,
          saturation: moody ? -16 : 14,
          temperature: warm ? 24 : -18,
          vignette: moody ? 36 : 18,
          sharpen: 18,
          preset: warm ? 'gold-noir' : 'midnight-velvet',
        });
        setAiMoodStatus('Applied local cinematic mood grade profile.');
        return;
      }

      const r = payload.recipe;
      setAdj((prev) => ({
        ...prev,
        exposure: Math.max(-50, Math.min(50, Math.round(r.exposure))),
        contrast: Math.max(-50, Math.min(60, Math.round(r.contrast))),
        saturation: Math.max(-100, Math.min(60, Math.round(r.saturation))),
        temperature: Math.max(-50, Math.min(50, Math.round(r.temperature))),
        vignette: Math.max(0, Math.min(85, Math.round(r.vignette))),
        sharpen: Math.max(0, Math.min(60, Math.round(r.sharpen))),
      }));
      setAiMoodStatus(`Applied "${r.lookName}" AI color grade.`);
      onNotify(`Applied ${r.lookName}`);
    } catch {
      setAiMoodStatus('Unable to reach grade assistant; use sliders or presets directly.');
    } finally {
      setAiMoodBusy(false);
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!eyedropperActive || !canvasRef.current || !originalImageDataRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(originalImageDataRef.current.width - 1, Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width))
    );
    const y = Math.max(
      0,
      Math.min(originalImageDataRef.current.height - 1, Math.floor(((e.clientY - rect.top) / rect.height) * canvas.height))
    );
    const idx = (y * originalImageDataRef.current.width + x) * 4;
    const d = originalImageDataRef.current.data;
    setPickedColor([d[idx], d[idx + 1], d[idx + 2]]);
    setBgRemoved(true);
    setEyedropperActive(false);
    onNotify('Sampled background color for alpha cutout');
  };

  const handleExport = (saveAsProject: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const mime =
      settings.exportFormat === 'jpeg'
        ? 'image/jpeg'
        : settings.exportFormat === 'webp'
        ? 'image/webp'
        : 'image/png';
    const dataUrl = canvas.toDataURL(mime, 0.94);

    if (saveAsProject) {
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = 480;
      thumbCanvas.height = Math.round((canvas.height / canvas.width) * 480);
      const tCtx = thumbCanvas.getContext('2d');
      tCtx?.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);

      onSaveProject({
        id: `photo-${Date.now()}`,
        title: projectTitle || 'Edited Photo',
        kind: 'Photo',
        thumbnailUrl: thumbCanvas.toDataURL('image/jpeg', 0.86),
        dimensions: `${canvas.width} × ${canvas.height}`,
        updatedLabel: 'Just now',
        lastTool: PHOTO_TABS.find((t) => t.id === tool)?.label ?? 'Photo Editor',
      });
      onNotify('Saved project to Recent Projects');
      return;
    }

    const link = document.createElement('a');
    link.download = `${(projectTitle || 'dipti-editor').toLowerCase().replace(/\s+/g, '-')}.${settings.exportFormat}`;
    link.href = dataUrl;
    link.click();
    onNotify(`Exported ${settings.exportFormat.toUpperCase()} render`);
  };

  const handleReset = () => {
    setAdj(DEFAULT_ADJUSTMENTS);
    setBgRemoved(false);
    setPickedColor(null);
    setAiMoodStatus(null);
    onNotify('Reset adjustments to original RAW');
  };

  return (
    <div className="space-y-5">
      {/* Top Toolbar */}
      <div className="glass-surface rounded-2xl p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <input
            type="text"
            value={projectTitle}
            onChange={(e) => setProjectTitle(e.target.value)}
            aria-label="Project title"
            className="min-h-[40px] px-3 rounded-xl bg-[#050814] border border-white/10 text-sm font-semibold text-white w-48 sm:w-64 focus:outline-none focus:border-[#d4af37]/60"
          />
          <span className="hidden sm:inline text-xs text-slate-400 tabular-nums whitespace-nowrap">
            {dimensions.width} × {dimensions.height}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleUploadFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[40px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-medium text-slate-100 inline-flex items-center gap-2 whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5 text-[#d4af37]" />
            <span>Import Photo</span>
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="min-h-[40px] px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] border border-white/10 text-xs font-medium text-slate-300 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={() => handleExport(true)}
            className="min-h-[40px] px-3.5 rounded-xl bg-[#8b5cf6]/20 hover:bg-[#8b5cf6]/30 border border-[#8b5cf6]/40 text-xs font-semibold text-violet-100 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save</span>
          </button>

          <button
            type="button"
            onClick={() => handleExport(false)}
            className="min-h-[40px] px-4 rounded-xl bg-gradient-to-r from-[#e5c158] to-[#c49b27] text-[#050811] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left/Center Live Canvas Viewport */}
        <div className="lg:col-span-8 space-y-3">
          <div
            className={`relative rounded-3xl overflow-hidden border border-white/10 min-h-[320px] sm:min-h-[440px] flex items-center justify-center p-3 ${
              bgRemoved ? 'checkerboard-alpha' : 'bg-[#050812]'
            }`}
          >
            {imageLoading ? (
              <div className="flex flex-col items-center gap-3 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin text-[#d4af37]" />
                <span className="text-xs">Preparing high-precision canvas...</span>
              </div>
            ) : imageError ? (
              <div className="text-center p-6 space-y-3">
                <p className="text-sm text-rose-300">{imageError}</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[44px] px-4 rounded-xl bg-white/10 text-xs font-medium text-white"
                >
                  Choose another photo
                </button>
              </div>
            ) : (
              <canvas
                ref={canvasRef}
                onClick={handleCanvasClick}
                className={`max-w-full max-h-[520px] w-auto h-auto rounded-xl shadow-2xl ${
                  eyedropperActive ? 'cursor-crosshair ring-2 ring-[#d4af37]' : ''
                }`}
              />
            )}

            {eyedropperActive && (
              <div className="absolute top-3 left-3 px-3 py-1.5 rounded-xl bg-[#03050a]/90 border border-[#d4af37]/50 text-xs text-amber-200">
                Tap anywhere on the background to sample cutout color
              </div>
            )}
          </div>

          {/* Compare & Quick Project Switcher Strip */}
          <div className="glass-surface rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onMouseDown={() => setShowOriginal(true)}
                onMouseUp={() => setShowOriginal(false)}
                onMouseLeave={() => setShowOriginal(false)}
                onTouchStart={() => setShowOriginal(true)}
                onTouchEnd={() => setShowOriginal(false)}
                className="min-h-[40px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Eye className="w-3.5 h-3.5 text-[#d4af37]" />
                <span>Hold Original</span>
              </button>

              <button
                type="button"
                onClick={() => setCompareMode((v) => !v)}
                className={`min-h-[40px] px-3 rounded-xl border text-xs font-medium whitespace-nowrap ${
                  compareMode
                    ? 'bg-[#d4af37]/15 border-[#d4af37]/50 text-amber-100'
                    : 'bg-white/[0.04] border-white/10 text-slate-300'
                }`}
              >
                Split Compare
              </button>

              {compareMode && (
                <input
                  type="range"
                  min={5}
                  max={95}
                  value={compareSplit}
                  onChange={(e) => setCompareSplit(Number(e.target.value))}
                  aria-label="Before and after split position"
                  className="w-28 accent-[#d4af37]"
                />
              )}
            </div>

            <div className="flex items-center gap-2 overflow-x-auto max-w-full">
              <FolderOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              {projects
                .filter((p) => p.kind !== 'Video')
                .slice(0, 4)
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSourceUrl(p.thumbnailUrl);
                      setProjectTitle(p.title);
                      setBgRemoved(false);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap border transition-colors ${
                      sourceUrl === p.thumbnailUrl
                        ? 'border-[#d4af37]/50 bg-[#d4af37]/15 text-amber-100'
                        : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-white'
                    }`}
                  >
                    {p.title.split(' ').slice(0, 2).join(' ')}
                  </button>
                ))}
            </div>
          </div>
        </div>

        {/* Right Interactive Tool Panel */}
        <div className="lg:col-span-4 glass-surface rounded-3xl p-4 sm:p-5 flex flex-col gap-5">
          {/* 4 Tool Mode Selector */}
          <div className="grid grid-cols-4 gap-1.5 bg-[#050814] p-1.5 rounded-2xl border border-white/[0.06]">
            {PHOTO_TABS.map((t) => {
              const Icon = t.icon;
              const active = tool === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTool(t.id)}
                  className={`min-h-[44px] px-1.5 py-1.5 rounded-xl text-[11px] font-medium flex flex-col items-center justify-center gap-1 transition-colors ${
                    active
                      ? 'bg-gradient-to-br from-[#d4af37]/25 via-[#8b5cf6]/25 to-[#3b82f6]/20 text-white border border-[#d4af37]/40'
                      : 'text-slate-400 hover:text-white border border-transparent'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${active ? 'text-[#d4af37]' : ''}`} />
                  <span className="truncate max-w-full">{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tool Content */}
          {tool === 'enhance' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-white">AI Enhance Engine</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Automatically balances dynamic range, shadow recovery, and edge micro-contrast.
                </p>
              </div>

              <button
                type="button"
                onClick={handleAutoEnhance}
                className="w-full min-h-[48px] rounded-2xl bg-gradient-to-r from-[#e5c158] via-[#d4af37] to-[#b88f21] text-[#050811] text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-[#d4af37]/15"
              >
                <Wand2 className="w-4 h-4" />
                <span>One-Tap AI Auto Enhance</span>
              </button>

              <div className="pt-3 border-t border-white/[0.08] space-y-2.5">
                <label htmlFor="mood-grade-input" className="block text-xs font-medium text-slate-300">
                  AI Color Mood Director
                </label>
                <div className="flex gap-2">
                  <input
                    id="mood-grade-input"
                    type="text"
                    value={moodPrompt}
                    onChange={(e) => setMoodPrompt(e.target.value)}
                    placeholder="e.g. Moody Tokyo rain or warm golden dusk"
                    className="flex-1 min-h-[44px] px-3 rounded-xl bg-[#050814] border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#d4af37]/60"
                  />
                  <button
                    type="button"
                    disabled={aiMoodBusy || !moodPrompt.trim()}
                    onClick={handleApplyMoodRecipe}
                    className="min-h-[44px] px-3.5 rounded-xl bg-[#8b5cf6]/25 border border-[#8b5cf6]/45 text-xs font-semibold text-violet-100 disabled:opacity-40 whitespace-nowrap"
                  >
                    {aiMoodBusy ? 'Grading...' : 'Apply'}
                  </button>
                </div>
                {aiMoodStatus && (
                  <p className="text-xs text-amber-200/90 bg-[#d4af37]/10 border border-[#d4af37]/25 rounded-xl px-3 py-2">
                    {aiMoodStatus}
                  </p>
                )}
              </div>
            </div>
          )}

          {tool === 'bg-remove' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-white">Background Remover</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Isolate your subject with transparent PNG alpha matting.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setPickedColor(null);
                    setBgRemoved(true);
                    onNotify('Auto background cutout applied');
                  }}
                  className={`min-h-[44px] px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 ${
                    bgRemoved && !pickedColor
                      ? 'bg-[#3b82f6]/25 border-[#3b82f6]/50 text-blue-100'
                      : 'bg-white/[0.06] border-white/10 text-slate-200'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Auto Cutout</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEyedropperActive((v) => !v)}
                  className={`min-h-[44px] px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 ${
                    eyedropperActive
                      ? 'bg-[#d4af37]/25 border-[#d4af37]/60 text-amber-100'
                      : 'bg-white/[0.06] border-white/10 text-slate-200'
                  }`}
                >
                  <Pipette className="w-3.5 h-3.5" />
                  <span>Pick Backdrop</span>
                </button>
              </div>

              {bgRemoved && (
                <button
                  type="button"
                  onClick={() => setBgRemoved(false)}
                  className="w-full min-h-[40px] rounded-xl border border-white/10 text-xs text-slate-300 hover:text-white"
                >
                  Restore Original Background
                </button>
              )}

              <div className="space-y-3 pt-2">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">Color Tolerance</span>
                    <span className="text-slate-400 tabular-nums">{bgTolerance}</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={110}
                    value={bgTolerance}
                    onChange={(e) => {
                      setBgTolerance(Number(e.target.value));
                      setBgRemoved(true);
                    }}
                    className="w-full accent-[#3b82f6]"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">Edge Feather</span>
                    <span className="text-slate-400 tabular-nums">{bgFeather}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={40}
                    value={bgFeather}
                    onChange={(e) => {
                      setBgFeather(Number(e.target.value));
                      setBgRemoved(true);
                    }}
                    className="w-full accent-[#3b82f6]"
                  />
                </div>
              </div>
            </div>
          )}

          {tool === 'filters' && (
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-white">Cinematic Look Presets</h3>
                <p className="text-xs text-slate-400 mt-0.5">Select a signature LUT curve</p>
              </div>

              <div className="grid grid-cols-1 gap-2 max-h-[340px] overflow-y-auto pr-1">
                {CINEMATIC_PRESETS.map((preset) => {
                  const selected = adj.preset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        setAdj({
                          ...DEFAULT_ADJUSTMENTS,
                          ...preset.values,
                          preset: preset.id,
                        })
                      }
                      className={`min-h-[52px] px-3 py-2 rounded-xl border flex items-center justify-between gap-3 transition-colors text-left ${
                        selected
                          ? 'border-[#d4af37]/60 bg-[#d4af37]/12'
                          : 'border-white/[0.07] bg-[#050814]/80 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="w-8 h-8 rounded-lg border border-white/15 shrink-0"
                          style={{
                            background: `linear-gradient(135deg, ${preset.swatch[0]}, ${preset.swatch[1]})`,
                          }}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{preset.name}</p>
                          <p className="text-[11px] text-slate-400 truncate">{preset.subtitle}</p>
                        </div>
                      </div>
                      {selected && <Check className="w-4 h-4 text-[#d4af37] shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {tool === 'effects' && (
            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              <h3 className="text-sm font-semibold text-white">Precision Effects & Tone</h3>
              {(
                [
                  ['exposure', 'Exposure', -50, 50],
                  ['contrast', 'Contrast', -50, 60],
                  ['saturation', 'Saturation', -100, 60],
                  ['temperature', 'Warmth', -50, 50],
                  ['vignette', 'Cinematic Vignette', 0, 85],
                  ['sharpen', 'Clarity Sharpen', 0, 60],
                  ['grain', '35mm Film Grain', 0, 45],
                ] as const
              ).map(([key, label, min, max]) => (
                <div key={key}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">{label}</span>
                    <span className="font-mono text-slate-400 tabular-nums">{adj[key]}</span>
                  </div>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    value={adj[key]}
                    onChange={(e) =>
                      setAdj((prev) => ({
                        ...prev,
                        [key]: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-[#8b5cf6]"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
