import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Download,
  Eraser,
  Loader2,
  RotateCcw,
  Save,
  Sparkles,
  Type as TypeIcon,
  Upload,
} from 'lucide-react';
import {
  applyAiArtisticEffect,
  deriveLocalSceneBlueprint,
  inpaintMaskedRegion,
  loadImageElement,
  synthesizeGenerativeArtwork,
  type AiStyleId,
} from "./imageProcessing";
import type { AiToolMode, SceneBlueprint, StudioProject } from '../../types/editor';

interface AiStudioWorkspaceProps {
  initialTool: AiToolMode;
  activeImageUrl: string;
  onSaveProject: (project: StudioProject) => void;
  onOpenInPhotoEditor: (imageUrl: string, title: string) => void;
  onNotify: (msg: string) => void;
}

const AI_TABS: { id: AiToolMode; label: string; icon: typeof Eraser }[] = [
  { id: 'object-remover', label: 'Object Remover', icon: Eraser },
  { id: 'ai-effects', label: 'AI Effects', icon: Sparkles },
  { id: 'text-to-image', label: 'Text to Image', icon: TypeIcon },
];

const AI_STYLES: { id: AiStyleId; name: string; desc: string }[] = [
  { id: 'duotone-gold', name: 'Duotone Obsidian Gold', desc: 'High-contrast metallic cinema look' },
  { id: 'prism-split', name: 'Prism Chromatic Split', desc: 'Refracted RGB optical separation' },
  { id: 'anamorphic-bloom', name: 'Anamorphic Bloom', desc: 'Halation glow on specular highlights' },
  { id: 'oil-impasto', name: 'Oil Impasto', desc: 'Quantized palette knife brushwork' },
  { id: 'infrared-sapphire', name: 'Infrared Sapphire', desc: 'Electric blue surreal spectrum' },
];

const PROMPT_MOTIFS = [
  'Obsidian glass prism refracting gold and violet light rays',
  'Moonlit alpine mountain peaks under electric blue aurora',
  'Futuristic midnight luxury city skyline with golden tower windows',
  'Deep cosmic sapphire planet with brushed gold orbital rings',
  'Still midnight ocean horizon reflecting warm amber moonlight',
];

export function AiStudioWorkspace({
  initialTool,
  activeImageUrl,
  on SaveProject,
  onOpenInPhotoEditor,
  onNotify,
}: AiStudioWorkspaceProps) {
  const [tool, setTool] = useState<AiToolMode>(initialTool);
  const [sourceUrl, setSourceUrl] = useState(activeImageUrl);

  // Object Remover state
  const [brushSize, setBrushSize] = useState(26);
  const [hasMask, setHasMask] = useState(false);
  const [removingBusy, setRemovingBusy] = useState(false);
  const isDrawingRef = useRef(false);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const objCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const objOriginalRef = useRef<ImageData | null>(null);
  const objCurrentRef = useRef<ImageData | null>(null);

  // AI Effects state
  const [effectStyle, setEffectStyle] = useState<AiStyleId>('duotone-gold');
  const [effectIntensity, setEffectIntensity] = useState(78);
  const fxCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fxOriginalRef = useRef<ImageData | null>(null);

  // Text to Image state
  const [prompt, setPrompt] = useState(PROMPT_MOTIFS[0]);
  const [genBusy, setGenBusy] = useState(false);
  const [genSeed, setGenSeed] = useState(1);
  const [genCaption, setGenCaption] = useState('Obsidian Prism — Generative Scene');
  const genCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setTool(initialTool);
  }, [initialTool]);

  useEffect(() => {
    setSourceUrl(activeImageUrl);
  }, [activeImageUrl]);

  // Load source image into Object Remover and AI Effects buffers
  useEffect(() => {
    let active = true;
    loadImageElement(sourceUrl)
      .then((img) => {
        if (!active) return;
        const maxSide = 960;
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(160, Math.round(img.naturalWidth * scale));
        const h = Math.max(160, Math.round(img.naturalHeight * scale));

        const off = document.createElement('canvas');
        off.width = w;
        off.height = h;
        const oCtx = off.getContext('2d');
        if (!oCtx) return;
        oCtx.drawImage(img, 0, 0, w, h);
        const imgData = oCtx.getImageData(0, 0, w, h);

        objOriginalRef.current = imgData;
        objCurrentRef.current = new ImageData(new Uint8ClampedArray(imgData.data), w, h);
        fxOriginalRef.current = imgData;

        if (objCanvasRef.current && maskCanvasRef.current) {
          objCanvasRef.current.width = w;
          objCanvasRef.current.height = h;
          maskCanvasRef.current.width = w;
          maskCanvasRef.current.height = h;
          objCanvasRef.current.getContext('2d')?.putImageData(imgData, 0, 0);
          maskCanvasRef.current.getContext('2d')?.clearRect(0, 0, w, h);
          setHasMask(false);
        }

        if (fxCanvasRef.current) {
          fxCanvasRef.current.width = w;
          fxCanvasRef.current.height = h;
          const out = applyAiArtisticEffect(imgData, effectStyle, effectIntensity);
          fxCanvasRef.current.getContext('2d')?.putImageData(out, 0, 0);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [sourceUrl]);

  // Re-render AI Effects whenever style/intensity changes
  useEffect(() => {
    if (tool !== 'ai-effects' || !fxCanvasRef.current || !fxOriginalRef.current) return;
    const base = fxOriginalRef.current;
    fxCanvasRef.current.width = base.width;
    fxCanvasRef.current.height = base.height;
    const out = applyAiArtisticEffect(base, effectStyle, effectIntensity);
    fxCanvasRef.current.getContext('2d')?.putImageData(out, 0, 0);
  }, [tool, effectStyle, effectIntensity]);

  // Re-render Object Remover canvas when switching back to tab
  useEffect(() => {
    if (tool !== 'object-remover' || !objCanvasRef.current || !objCurrentRef.current || !maskCanvasRef.current) return;
    const cur = objCurrentRef.current;
    objCanvasRef.current.width = cur.width;
    objCanvasRef.current.height = cur.height;
    maskCanvasRef.current.width = cur.width;
    maskCanvasRef.current.height = cur.height;
    objCanvasRef.current.getContext('2d')?.putImageData(cur, 0, 0);
  }, [tool]);

  // Initial generative canvas render when entering Text-to-Image tab
  const renderBlueprint = useCallback((blueprint: SceneBlueprint, seed: number) => {
    const canvas = genCanvasRef.current;
    if (!canvas) return;
    synthesizeGenerativeArtwork(canvas, blueprint, seed);
    setGenCaption(blueprint.caption || 'Generated Studio Art');
  }, []);

  useEffect(() => {
    if (tool === 'text-to-image' && genCanvasRef.current) {
      const bp = deriveLocalSceneBlueprint(prompt);
      renderBlueprint(bp, genSeed);
    }
  }, [tool]);

  const paintMaskAt = (clientX: number, clientY: number) => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const rect = maskCanvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * maskCanvas.width;
    const y = ((clientY - rect.top) / rect.height) * maskCanvas.height;
    const ctx = maskCanvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = 'rgba(212, 175, 55, 0.72)';
    ctx.beginPath();
    ctx.arc(x, y, brushSize, 0, Math.PI * 2);
    ctx.fill();
    setHasMask(true);
  };

  const handleRunObjectRemoval = () => {
    const maskCanvas = maskCanvasRef.current;
    const objCanvas = objCanvasRef.current;
    const cur = objCurrentRef.current;
    if (!maskCanvas || !objCanvas || !cur) return;

    const mCtx = maskCanvas.getContext('2d');
    if (!mCtx) return;
    const maskPixels = mCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
    const binaryMask = new Uint8Array(cur.width * cur.height);
    let maskedCount = 0;

    for (let i = 0; i < binaryMask.length; i++) {
      if (maskPixels[i * 4 + 3] > 20) {
        binaryMask[i] = 1;
        maskedCount++;
      }
    }

    if (maskedCount === 0) {
      onNotify('Paint over the object you want to remove first');
      return;
    }

    setRemovingBusy(true);
    setTimeout(() => {
      const inpainted = inpaintMaskedRegion(cur, binaryMask);
      objCurrentRef.current = inpainted;
      objCanvas.getContext('2d')?.putImageData(inpainted, 0, 0);
      mCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
      setHasMask(false);
      setRemovingBusy(false);
      onNotify('Object cleanly removed and inpainted');
    }, 30);
  };

  const handleGenerateArtwork = async () => {
    if (!prompt.trim()) return;
    setGenBusy(true);
    const nextSeed = genSeed + 7;
    setGenSeed(nextSeed);

    try {
      const res = await fetch('/api/ai/scene-blueprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      if (res.ok) {
        const data = (await res.json()) as { blueprint?: SceneBlueprint };
        if (data.blueprint) {
          renderBlueprint(data.blueprint, nextSeed);
          onNotify('Generated AI studio artwork');
          setGenBusy(false);
          return;
        }
      }
    } catch {
      // Fallback transparently to local scene analyzer
    }

    const fallbackBp = deriveLocalSceneBlueprint(prompt);
    renderBlueprint(fallbackBp, nextSeed);
    onNotify('Rendered studio scene from prompt');
    setGenBusy(false);
  };

  const getActiveCanvas = (): HTMLCanvasElement | null => {
    if (tool === 'object-remover') return objCanvasRef.current;
    if (tool === 'ai-effects') return fxCanvasRef.current;
    return genCanvasRef.current;
  };

  const handleSaveActiveCanvas = (openInPhoto = false) => {
    const canvas = getActiveCanvas();
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');

    if (openInPhoto) {
      onOpenInPhotoEditor(dataUrl, tool === 'text-to-image' ? genCaption : 'AI Studio Output');
      return;
    }

    onSaveProject({
      id: `ai-${Date.now()}`,
      title: tool === 'text-to-image' ? genCaption : tool === 'ai-effects' ? 'AI Stylized Look' : 'Object Removed Edit',
      kind: 'AI Art',
      thumbnailUrl: canvas.toDataURL('image/jpeg', 0.88),
      dimensions: `${canvas.width} × ${canvas.height}`,
      updatedLabel: 'Just now',
      lastTool: AI_TABS.find((t) => t.id === tool)?.label ?? 'AI Studio',
    });
    onNotify('Saved artwork to Recent Projects');
  };

  const handleDownloadActive = () => {
    const canvas = getActiveCanvas();
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `dipti-editor-${tool}.png`;
    a.click();
    onNotify('Downloaded PNG render');
  };

  const handleUploadImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSourceUrl(reader.result);
      }
    };
    reader.readAsDataURL(f);
  };

  return (
    <div className="space-y-5">
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUploadImage} className="hidden" />

      {/* Top Mode Bar */}
      <div className="glass-surface rounded-2xl p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {AI_TABS.map((t) => {
            const Icon = t.icon;
            const active = tool === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTool(t.id)}
                className={`min-h-[42px] px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition-colors ${
                  active
                    ? 'bg-gradient-to-r from-[#d4af37]/25 via-[#8b5cf6]/25 to-[#3b82f6]/25 text-white border border-[#d4af37]/45'
                    : 'bg-[#050814] text-slate-400 hover:text-white border border-white/10'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-[#d4af37]' : ''}`} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tool !== 'text-to-image' && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[40px] px-3.5 rounded-xl bg-white/[0.06] border border-white/10 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5 text-[#d4af37]" />
              <span>Change Photo</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => handleSaveActiveCanvas(false)}
            className="min-h-[40px] px-3.5 rounded-xl bg-[#8b5cf6]/20 border border-[#8b5cf6]/45 text-xs font-semibold text-violet-100 inline-flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadActive}
            className="min-h-[40px] px-4 rounded-xl bg-gradient-to-r from-[#e5c158] to-[#c49b27] text-[#050811] text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Tool Panels */}
      {tool === 'object-remover' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-8 rounded-3xl overflow-hidden border border-white/10 bg-[#050812] p-3 flex items-center justify-center">
            <div className="relative inline-block max-w-full">
              <canvas
                ref={objCanvasRef}
                className="max-w-full max-h-[500px] w-auto h-auto rounded-xl block"
              />
              <canvas
                ref={maskCanvasRef}
                onPointerDown={(e) => {
                  isDrawingRef.current = true;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  paintMaskAt(e.clientX, e.clientY);
                }}
                onPointerMove={(e) => {
                  if (isDrawingRef.current) paintMaskAt(e.clientX, e.clientY);
                }}
                onPointerUp={() => {
                  isDrawingRef.current = false;
                }}
                className="absolute inset-0 w-full h-full rounded-xl cursor-crosshair touch-none"
              />
            </div>
          </div>

          <div className="lg:col-span-4 glass-surface rounded-3xl p-5 space-y-5">
            <div>
              <h3 className="text-base font-semibold text-white">Object Remover</h3>
              <p className="text-xs text-slate-400 mt-1">
                Paint directly over blemishes, wires, or unwanted subjects on the canvas, then erase cleanly.
              </p>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-slate-300">Mask Brush Size</span>
                <span className="font-mono text-slate-400 tabular-nums">{brushSize}px</span>
              </div>
              <input
                type="range"
                min={8}
                max={64}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-full accent-[#d4af37]"
              />
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                disabled={removingBusy || !hasMask}
                onClick={handleRunObjectRemoval}
                className="w-full min-h-[48px] rounded-2xl bg-gradient-to-r from-[#e5c158] to-[#c49b27] text-[#050811] text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-45"
              >
                {removingBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eraser className="w-4 h-4" />}
                <span>{removingBusy ? 'Inpainting...' : 'Remove Masked Object'}</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const m = maskCanvasRef.current;
                    m?.getContext('2d')?.clearRect(0, 0, m.width, m.height);
                    setHasMask(false);
                  }}
                  className="min-h-[42px] rounded-xl border border-white/10 text-xs text-slate-300 hover:text-white"
                >
                  Clear Mask
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (objOriginalRef.current && objCanvasRef.current) {
                      const copy = new ImageData(
                        new Uint8ClampedArray(objOriginalRef.current.data),
                        objOriginalRef.current.width,
                        objOriginalRef.current.height
                      );
                      objCurrentRef.current = copy;
                      objCanvasRef.current.getContext('2d')?.putImageData(copy, 0, 0);
                      onNotify('Restored original photo');
                    }
                  }}
                  className="min-h-[42px] rounded-xl border border-white/10 text-xs text-slate-300 hover:text-white inline-flex items-center justify-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Revert</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tool === 'ai-effects' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-8 rounded-3xl overflow-hidden border border-white/10 bg-[#050812] p-3 flex items-center justify-center">
            <canvas ref={fxCanvasRef} className="max-w-full max-h-[500px] w-auto h-auto rounded-xl" />
          </div>

          <div className="lg:col-span-4 glass-surface rounded-3xl p-5 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-white">AI Effects Engine</h3>
              <p className="text-xs text-slate-400 mt-1">Stylized studio passes blended onto your photo</p>
            </div>

            <div className="space-y-2">
              {AI_STYLES.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setEffectStyle(st.id)}
                  className={`w-full min-h-[52px] px-3.5 py-2.5 rounded-xl border text-left transition-colors ${
                    effectStyle === st.id
                      ? 'border-[#8b5cf6]/60 bg-[#8b5cf6]/20 text-white'
                      : 'border-white/[0.07] bg-[#050814]/80 text-slate-300 hover:border-white/20'
                  }`}
                >
                  <p className="text-xs font-semibold">{st.name}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{st.desc}</p>
                </button>
              ))}
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">Blend Intensity</span>
                <span className="font-mono text-slate-400 tabular-nums">{effectIntensity}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={effectIntensity}
                onChange={(e) => setEffectIntensity(Number(e.target.value))}
                className="w-full accent-[#8b5cf6]"
              />
            </div>

            <button
              type="button"
              onClick={() => handleSaveActiveCanvas(true)}
              className="w-full min-h-[44px] rounded-xl bg-white/[0.07] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-white inline-flex items-center justify-center gap-2"
            >
              <span>Refine in Photo Editor</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#d4af37]" />
            </button>
          </div>
        </div>
      )}

      {tool === 'text-to-image' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-8 rounded-3xl overflow-hidden border border-white/10 bg-[#050812] p-3 flex flex-col items-center justify-center">
            <canvas
              ref={genCanvasRef}
              width={1280}
              height={720}
              className="w-full aspect-video rounded-2xl shadow-2xl"
            />
          </div>

          <div className="lg:col-span-4 glass-surface rounded-3xl p-5 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-white">Text to Image Studio</h3>
              <p className="text-xs text-slate-400 mt-1">
                Describe an atmosphere, subject, or palette to synthesize a luxury 16:9 canvas artwork.
              </p>
            </div>

            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe lighting, subject, mood, and colors..."
              className="w-full p-3 rounded-xl bg-[#050814] border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#d4af37]/60"
            />

            <button
              type="button"
              disabled={genBusy || !prompt.trim()}
              onClick={handleGenerateArtwork}
              className="w-full min-h-[48px] rounded-2xl bg-gradient-to-r from-[#e5c158] via-[#8b5cf6] to-[#3b82f6] text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-lg"
            >
              {genBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>{genBusy ? 'Synthesizing Scene...' : 'Generate Artwork'}</span>
            </button>

            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-wider text-slate-400">Quick Inspiration</p>
              <div className="flex flex-wrap gap-1.5">
                {PROMPT_MOTIFS.map((m, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPrompt(m)}
                    className="px-2.5 py-1.5 rounded-lg bg-[#050814] border border-white/10 text-[11px] text-slate-300 hover:border-[#d4af37]/50 text-left"
                  >
                    {m.split(' ').slice(0, 4).join(' ')}…
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleSaveActiveCanvas(true)}
              className="w-full min-h-[44px] rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-white inline-flex items-center justify-center gap-2"
            >
              <span>Edit in Photo Studio</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#d4af37]" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
