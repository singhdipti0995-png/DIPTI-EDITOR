import React, { useEffect, useRef, useState } from 'react';
import {
  Type as TypeIcon,
  Plus,
  Trash2,
  Download,
  Save,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Check,
} from 'lucide-react';
import { AppSettings, ExportRecord, ProjectItem, TextLayer } from '../../types/editor';
import { STUDIO_FONTS } from '../../data/studioCatalog';
import { AssetPickerBar } from '../AssetPickerBar';
import { SliderControl } from '../SliderControl';
import {
  createThumbnailDataUrl,
  loadImageElement,
  renderTextStudioCanvas,
} from '../../utils/canvasEngine';
import { downloadExportedBlob, encodeCanvasToBlob } from '../../utils/exportEngine';
import { releaseCanvasMemory } from '../../utils/hdQualityEngine';
import { GallerySaveResult, exportCanvasViaGallery } from '../../utils/gallerySaveEngine';
import { GallerySaveBanner } from '../GallerySaveBanner';

interface TextFontsStudioProps {
  imageUrl: string;
  onChangeImage: (url: string) => void;
  initialLayers?: TextLayer[];
  settings: AppSettings;
  onSaveProject: (project: ProjectItem) => Promise<boolean> | void;
  onRecordExport?: (record: ExportRecord) => void;
}

const DEFAULT_LAYERS: TextLayer[] = [
  {
    id: 'layer-1',
    text: 'DIPTI STUDIO',
    x: 0.5,
    y: 0.44,
    fontFamily: "'Syne', sans-serif",
    fontSize: 78,
    fontWeight: 700,
    color: '#F8FAFC',
    letterSpacing: 6,
    lineHeight: 1.05,
    opacity: 96,
    rotation: 0,
    shadowBlur: 18,
    strokeWidth: 0,
    strokeColor: '#000000',
    align: 'center',
    uppercase: true,
  },
  {
    id: 'layer-2',
    text: 'Cinematic Editorial Edition',
    x: 0.5,
    y: 0.55,
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 34,
    fontWeight: 600,
    color: '#D4AF37',
    letterSpacing: 2,
    lineHeight: 1.2,
    opacity: 92,
    rotation: 0,
    shadowBlur: 10,
    strokeWidth: 0,
    strokeColor: '#000000',
    align: 'center',
    uppercase: false,
  },
];

const COLOR_SWATCHES = ['#F8FAFC', '#D4AF37', '#38BDF8', '#A855F7', '#F43F5E', '#09090B'];

export const TextFontsStudio: React.FC<TextFontsStudioProps> = ({
  imageUrl,
  onChangeImage,
  initialLayers,
  settings,
  onSaveProject,
  onRecordExport,
}) => {
  const [layers, setLayers] = useState<TextLayer[]>(
    initialLayers && initialLayers.length > 0 ? initialLayers : DEFAULT_LAYERS
  );
  const [selectedId, setSelectedId] = useState<string>(
    (initialLayers && initialLayers[0]?.id) || DEFAULT_LAYERS[0].id
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [gallerySaving, setGallerySaving] = useState(false);
  const [galleryProgress, setGalleryProgress] = useState(0);
  const [galleryStage, setGalleryStage] = useState<string | null>(null);
  const [galleryResult, setGalleryResult] = useState<GallerySaveResult | null>(null);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (initialLayers && initialLayers.length > 0) {
      setLayers(initialLayers);
      setSelectedId(initialLayers[0].id);
    }
  }, [initialLayers]);

  useEffect(() => {
    let cancelled = false;
    loadImageElement(imageUrl)
      .then((img) => {
        if (cancelled) return;
        imgRef.current = img;
        if (canvasRef.current) {
          renderTextStudioCanvas(img, canvasRef.current, layers, 1080);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  useEffect(() => {
    if (imgRef.current && canvasRef.current) {
      renderTextStudioCanvas(imgRef.current, canvasRef.current, layers, 1080);
    }
  }, [layers]);

  const activeLayer = layers.find((l) => l.id === selectedId) || layers[0];

  const updateLayer = <K extends keyof TextLayer>(key: K, val: TextLayer[K]) => {
    if (!activeLayer) return;
    setLayers((prev) => prev.map((l) => (l.id === activeLayer.id ? { ...l, [key]: val } : l)));
  };

  const addLayer = () => {
    const newLayer: TextLayer = {
      id: `layer-${Date.now()}`,
      text: 'NEW HEADLINE',
      x: 0.5,
      y: 0.35,
      fontFamily: "'Playfair Display', serif",
      fontSize: 64,
      fontWeight: 700,
      color: '#F8FAFC',
      letterSpacing: 2,
      lineHeight: 1.1,
      opacity: 100,
      rotation: 0,
      shadowBlur: 12,
      strokeWidth: 0,
      strokeColor: '#000000',
      align: 'center',
      uppercase: false,
    };
    setLayers((prev) => [...prev, newLayer]);
    setSelectedId(newLayer.id);
  };

  const removeLayer = (id: string) => {
    setLayers((prev) => {
      const next = prev.filter((l) => l.id !== id);
      if (selectedId === id && next.length > 0) {
        setSelectedId(next[0].id);
      }
      return next;
    });
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || layers.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;

    // Pick closest layer to tap
    let closest = layers[0];
    let bestDist = Infinity;
    for (const l of layers) {
      const dist = Math.hypot(l.x - nx, l.y - ny);
      if (dist < bestDist) {
        bestDist = dist;
        closest = l;
      }
    }
    setSelectedId(closest.id);
    setDraggingId(closest.id);
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const nx = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0.05, Math.min(0.95, (e.clientY - rect.top) / rect.height));
    setLayers((prev) => prev.map((l) => (l.id === draggingId ? { ...l, x: nx, y: ny } : l)));
  };

  const handleExport = async (
    forceDuplicate = false,
    triggerSource: 'save' | 'export' | 'manual' = 'export'
  ) => {
    if (!imgRef.current) return;
    const fmt = settings.exportFormat === 'jpeg' ? 'jpg' : settings.exportFormat;
    setGallerySaving(true);
    setGalleryProgress(12);
    setGalleryStage(`Rendering typography ${fmt.toUpperCase()}...`);
    setGalleryResult(null);
    const outCanvas = document.createElement('canvas');
    try {
      renderTextStudioCanvas(imgRef.current, outCanvas, layers);
      const baseFileName = `dipti-typography-${Date.now()}`;
      if (!settings.autoSaveToGallery && triggerSource === 'export') {
        const { blob } = await encodeCanvasToBlob(outCanvas, fmt, settings.exportQuality);
        const fileName = `${baseFileName}.${fmt}`;
        downloadExportedBlob(blob, fileName);
        onRecordExport?.({
          id: `exp-txt-${Date.now()}`,
          fileName,
          mediaType: 'image',
          format: fmt,
          resolutionLabel: `${outCanvas.width}×${outCanvas.height}`,
          width: outCanvas.width,
          height: outCanvas.height,
          quality: fmt === 'png' ? 100 : settings.exportQuality,
          fileSizeBytes: blob.size,
          status: 'completed',
          thumbnailDataUrl: createThumbnailDataUrl(outCanvas, 320),
          galleryDelivery: 'skipped-disabled',
          galleryLocationLabel: 'Manual Browser Download (Auto-Save OFF)',
          createdAt: new Date().toISOString(),
        });
        return;
      }

      const gRes = await exportCanvasViaGallery({
        canvas: outCanvas,
        baseFileName,
        format: fmt,
        qualityPercent: settings.exportQuality,
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
    } finally {
      releaseCanvasMemory(outCanvas);
      setGallerySaving(false);
    }
  };

  const handleSave = async () => {
    if (!canvasRef.current) return;
    const thumb = createThumbnailDataUrl(canvasRef.current, 480);
    const ok = await onSaveProject({
      id: `proj-${Date.now()}`,
      name: activeLayer?.text.slice(0, 28) || 'Typography Cover',
      tool: 'text',
      thumbnailDataUrl: thumb || imageUrl,
      sourceImageUrl: imageUrl,
      width: canvasRef.current.width,
      height: canvasRef.current.height,
      updatedAt: new Date().toISOString(),
      textLayers: layers,
    });
    if (ok === false) return;
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);

    if (settings.autoSaveToGallery) {
      await handleExport(false, 'save');
    }
  };

  return (
    <div className="space-y-4 pb-24 lg:pb-8">
      <AssetPickerBar activeImageUrl={imageUrl} onSelectImage={onChangeImage} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-7 xl:col-span-8 rounded-2xl bg-[#080B14] border border-white/10 p-3 sm:p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <TypeIcon className="w-3.5 h-3.5 text-amber-300" />
              <span>Drag directly on canvas to reposition selected text layer</span>
            </div>
            <button
              type="button"
              onClick={addLayer}
              className="min-h-[38px] px-3 rounded-lg bg-violet-600/25 hover:bg-violet-600/40 border border-violet-400/40 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Text Layer</span>
            </button>
          </div>

          <div className="min-h-[280px] sm:min-h-[430px] rounded-xl bg-[#04060A] border border-white/[0.06] flex items-center justify-center p-2 overflow-hidden">
            <canvas
              ref={canvasRef}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={() => setDraggingId(null)}
              className="max-w-full max-h-[500px] object-contain rounded-lg cursor-grab active:cursor-grabbing touch-none"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={handleSave}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-xs sm:text-sm font-semibold text-white flex items-center gap-2 cursor-pointer"
            >
              {savedNotice ? <Check className="w-4 h-4 text-emerald-400" /> : <Save className="w-4 h-4 text-amber-300" />}
              <span>{savedNotice ? 'Saved to Projects' : 'Save Typography'}</span>
            </button>

            <button
              type="button"
              onClick={() => handleExport(false, 'export')}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-violet-600 hover:brightness-110 text-xs sm:text-sm font-semibold text-white flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export {settings.exportFormat.toUpperCase()}</span>
            </button>
          </div>

          <GallerySaveBanner
            saving={gallerySaving}
            progressPct={galleryProgress}
            stageLabel={galleryStage}
            result={galleryResult}
            onSaveCopyAnyway={() => handleExport(true, 'export')}
            onDismiss={() => setGalleryResult(null)}
          />
        </div>

        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          {/* Layers List */}
          <div className="rounded-2xl bg-[#0B1020]/85 backdrop-blur-xl border border-white/10 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-white">Text Layers ({layers.length})</h2>
            </div>
            {layers.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">No text layers. Tap Add Text Layer above.</p>
            ) : (
              <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
                {layers.map((layer) => (
                  <div
                    key={layer.id}
                    className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 cursor-pointer ${
                      activeLayer?.id === layer.id
                        ? 'bg-white/10 border-amber-400/50 text-white'
                        : 'bg-[#060812] border-white/10 text-slate-300'
                    }`}
                    onClick={() => setSelectedId(layer.id)}
                  >
                    <span className="text-xs font-medium truncate">{layer.text || 'Empty layer'}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeLayer(layer.id);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer"
                      aria-label="Delete layer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {activeLayer && (
            <div className="rounded-2xl bg-[#0B1020]/85 backdrop-blur-xl border border-white/10 p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Layer Copy</label>
                <textarea
                  rows={2}
                  value={activeLayer.text}
                  onChange={(e) => updateLayer('text', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#060812] border border-white/10 focus:border-sky-400/60 outline-none text-xs sm:text-sm text-white"
                />
              </div>

              <div>
                <p className="text-xs font-medium text-slate-300 mb-1.5">Typeface</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {STUDIO_FONTS.map((font) => (
                    <button
                      key={font.id}
                      type="button"
                      onClick={() => updateLayer('fontFamily', font.family)}
                      className={`min-h-[42px] px-2.5 py-1.5 rounded-xl border text-left cursor-pointer transition-colors ${
                        activeLayer.fontFamily === font.family
                          ? 'bg-sky-500/20 border-sky-400 text-white'
                          : 'bg-[#060812] border-white/10 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <p className="text-xs truncate" style={{ fontFamily: font.family }}>
                        {font.label}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {COLOR_SWATCHES.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => updateLayer('color', hex)}
                      className={`w-7 h-7 rounded-full border cursor-pointer ${
                        activeLayer.color === hex ? 'border-white scale-110' : 'border-white/20'
                      }`}
                      style={{ backgroundColor: hex }}
                      aria-label={`Color ${hex}`}
                    />
                  ))}
                  <input
                    type="color"
                    value={activeLayer.color}
                    onChange={(e) => updateLayer('color', e.target.value)}
                    className="w-7 h-7 rounded-full bg-transparent border-0 cursor-pointer"
                    aria-label="Custom text color"
                  />
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => updateLayer('align', 'left')}
                    className={`p-2 rounded-lg border cursor-pointer ${
                      activeLayer.align === 'left'
                        ? 'bg-white/15 border-white/30 text-white'
                        : 'bg-[#060812] border-white/10 text-slate-400'
                    }`}
                    aria-label="Align left"
                  >
                    <AlignLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => updateLayer('align', 'center')}
                    className={`p-2 rounded-lg border cursor-pointer ${
                      activeLayer.align === 'center'
                        ? 'bg-white/15 border-white/30 text-white'
                        : 'bg-[#060812] border-white/10 text-slate-400'
                    }`}
                    aria-label="Align center"
                  >
                    <AlignCenter className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => updateLayer('align', 'right')}
                    className={`p-2 rounded-lg border cursor-pointer ${
                      activeLayer.align === 'right'
                        ? 'bg-white/15 border-white/30 text-white'
                        : 'bg-[#060812] border-white/10 text-slate-400'
                    }`}
                    aria-label="Align right"
                  >
                    <AlignRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <SliderControl
                  label="Font Size"
                  value={activeLayer.fontSize}
                  min={18}
                  max={160}
                  defaultValue={72}
                  unit="px"
                  onChange={(v) => updateLayer('fontSize', v)}
                />
                <SliderControl
                  label="Letter Spacing"
                  value={activeLayer.letterSpacing}
                  min={-4}
                  max={24}
                  defaultValue={2}
                  unit="px"
                  onChange={(v) => updateLayer('letterSpacing', v)}
                />
                <SliderControl
                  label="Rotation"
                  value={activeLayer.rotation}
                  min={-45}
                  max={45}
                  defaultValue={0}
                  unit="°"
                  onChange={(v) => updateLayer('rotation', v)}
                />
                <SliderControl
                  label="Opacity"
                  value={activeLayer.opacity}
                  min={10}
                  max={100}
                  defaultValue={96}
                  unit="%"
                  onChange={(v) => updateLayer('opacity', v)}
                />
                <SliderControl
                  label="Outline Stroke"
                  value={activeLayer.strokeWidth}
                  min={0}
                  max={8}
                  defaultValue={0}
                  unit="px"
                  onChange={(v) => updateLayer('strokeWidth', v)}
                />
                <SliderControl
                  label="Drop Shadow"
                  value={activeLayer.shadowBlur}
                  min={0}
                  max={40}
                  defaultValue={14}
                  onChange={(v) => updateLayer('shadowBlur', v)}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
