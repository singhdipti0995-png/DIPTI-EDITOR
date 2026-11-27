import React, { useEffect, useRef, useState } from 'react';
import { Palette, Zap, Sparkles, Download, Save, Eye, RotateCcw, Check } from 'lucide-react';
import { AppSettings, DEFAULT_ADJUSTMENTS, ExportRecord, ProjectItem } from '../../types/editor';
import { FILTER_PRESETS } from '../../data/studioCatalog';
import { AssetPickerBar } from '../AssetPickerBar';
import { SliderControl } from '../SliderControl';
import {
  createThumbnailDataUrl,
  loadImageElement,
  renderAdjustedCanvas,
} from '../../utils/canvasEngine';
import { downloadExportedBlob, encodeCanvasToBlob } from '../../utils/exportEngine';
import { GallerySaveResult, exportCanvasViaGallery } from '../../utils/gallerySaveEngine';
import { GallerySaveBanner } from '../GallerySaveBanner';
import { applyCinemaGlitchAndNeon } from '../../utils/creativeCanvas';

interface CinemaColorFxStudioProps {
  imageUrl: string;
  onChangeImage: (url: string) => void;
  settings: AppSettings;
  onSaveProject: (project: ProjectItem) => Promise<boolean> | void;
  onRecordExport?: (record: ExportRecord) => void;
}

const FX_TABS = [
  { id: 'grading', label: 'Color Grading', icon: <Palette className="w-3.5 h-3.5" /> },
  { id: 'luts', label: '30 Pro LUTs', icon: <Sparkles className="w-3.5 h-3.5" /> },
  { id: 'glitch-neon', label: 'Glitch & Neon', icon: <Zap className="w-3.5 h-3.5" /> },
] as const;

export const CinemaColorFxStudio: React.FC<CinemaColorFxStudioProps> = ({
  imageUrl,
  onChangeImage,
  settings,
  onSaveProject,
  onRecordExport,
}) => {
  const [tab, setTab] = useState<(typeof FX_TABS)[number]['id']>('grading');
  const [lutId, setLutId] = useState('obsidian-gold');
  const [lutIntensity, setLutIntensity] = useState(85);
  const [liftHex, setLiftHex] = useState('#0F172A');
  const [gainHex, setGainHex] = useState('#F59E0B');
  const [gradeStrength, setGradeStrength] = useState(32);

  const [glitchRgb, setGlitchRgb] = useState(12);
  const [scanlines, setScanlines] = useState(24);
  const [neonGlow, setNeonGlow] = useState(38);
  const [neonHex, setNeonHex] = useState('#38BDF8');

  const [showOriginal, setShowOriginal] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [imgVersion, setImgVersion] = useState(0);
  const [gallerySaving, setGallerySaving] = useState(false);
  const [galleryProgress, setGalleryProgress] = useState(0);
  const [galleryStage, setGalleryStage] = useState<string | null>(null);
  const [galleryResult, setGalleryResult] = useState<GallerySaveResult | null>(null);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    loadImageElement(imageUrl)
      .then((img) => {
        imgRef.current = img;
        setImgVersion((v) => v + 1);
      })
      .catch(() => {});
  }, [imageUrl]);

  useEffect(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;

    if (showOriginal) {
      renderAdjustedCanvas(img, canvas, DEFAULT_ADJUSTMENTS, 960);
      return;
    }

    // First apply LUT onto offscreen, then run 3-way grade + glitch/neon shader
    const lutCanvas = document.createElement('canvas');
    renderAdjustedCanvas(
      img,
      lutCanvas,
      { ...DEFAULT_ADJUSTMENTS, activeFilterId: lutId, filterIntensity: lutIntensity },
      960
    );

    const tempImg = new Image();
    tempImg.onload = () => {
      applyCinemaGlitchAndNeon(
        tempImg,
        canvas,
        {
          glitchRgb: tab === 'glitch-neon' || glitchRgb > 0 ? glitchRgb : 0,
          scanlines: tab === 'glitch-neon' || scanlines > 0 ? scanlines : 0,
          neonGlow: tab === 'glitch-neon' || neonGlow > 0 ? neonGlow : 0,
          neonColorHex: neonHex,
          liftTintHex: liftHex,
          gainTintHex: gainHex,
          gradeStrength,
        },
        960
      );
    };
    tempImg.src = lutCanvas.toDataURL('image/png');
  }, [imageUrl, tab, lutId, lutIntensity, liftHex, gainHex, gradeStrength, glitchRgb, scanlines, neonGlow, neonHex, showOriginal, imgVersion]);

  const handleReset = () => {
    setLutId('original');
    setGradeStrength(0);
    setGlitchRgb(0);
    setScanlines(0);
    setNeonGlow(0);
  };

  const handleExport = async (
    forceDuplicate = false,
    triggerSource: 'save' | 'export' | 'manual' = 'export'
  ) => {
    if (!canvasRef.current) return;
    const fmt = settings.exportFormat === 'jpeg' ? 'jpg' : settings.exportFormat;
    setGallerySaving(true);
    setGalleryProgress(12);
    setGalleryStage(`Encoding Cinema FX ${fmt.toUpperCase()}...`);
    setGalleryResult(null);
    try {
      const baseFileName = `dipti-cinema-fx-${Date.now()}`;
      if (!settings.autoSaveToGallery && triggerSource === 'export') {
        const { blob } = await encodeCanvasToBlob(canvasRef.current, fmt, settings.exportQuality);
        const fileName = `${baseFileName}.${fmt}`;
        downloadExportedBlob(blob, fileName);
        onRecordExport?.({
          id: `exp-fx-${Date.now()}`,
          fileName,
          mediaType: 'image',
          format: fmt,
          resolutionLabel: `${canvasRef.current.width}×${canvasRef.current.height}`,
          width: canvasRef.current.width,
          height: canvasRef.current.height,
          quality: fmt === 'png' ? 100 : settings.exportQuality,
          fileSizeBytes: blob.size,
          status: 'completed',
          thumbnailDataUrl: createThumbnailDataUrl(canvasRef.current, 320),
          galleryDelivery: 'skipped-disabled',
          galleryLocationLabel: 'Manual Browser Download (Auto-Save OFF)',
          createdAt: new Date().toISOString(),
        });
        return;
      }

      const gRes = await exportCanvasViaGallery({
        canvas: canvasRef.current,
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
      setGallerySaving(false);
    }
  };

  const handleSave = async () => {
    if (!canvasRef.current) return;
    const thumb = createThumbnailDataUrl(canvasRef.current, 480);
    const ok = await onSaveProject({
      id: `proj-${Date.now()}`,
      name: `Cinema FX · ${FILTER_PRESETS.find((f) => f.id === lutId)?.name || 'Custom'}`,
      tool: 'filters',
      thumbnailDataUrl: thumb || imageUrl,
      sourceImageUrl: imageUrl,
      width: canvasRef.current.width,
      height: canvasRef.current.height,
      updatedAt: new Date().toISOString(),
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
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-white">Cinema Color &amp; Shader FX</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowOriginal((v) => !v)}
                className={`min-h-[38px] px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                  showOriginal ? 'bg-amber-400/20 border-amber-400/50 text-amber-200' : 'bg-white/[0.05] border-white/10 text-slate-300'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{showOriginal ? 'Original' : 'Compare'}</span>
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="min-h-[38px] px-3 rounded-lg bg-white/[0.05] border border-white/10 text-xs text-slate-300 flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          <div className="min-h-[290px] sm:min-h-[430px] rounded-xl bg-[#04060A] border border-white/[0.06] flex items-center justify-center p-2 overflow-hidden">
            <canvas ref={canvasRef} className="max-w-full max-h-[500px] object-contain rounded-lg" />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={handleSave}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-xs sm:text-sm font-semibold text-white flex items-center gap-2 cursor-pointer"
            >
              {savedNotice ? <Check className="w-4 h-4 text-emerald-400" /> : <Save className="w-4 h-4 text-amber-300" />}
              <span>{savedNotice ? 'Saved to Projects' : 'Save Look'}</span>
            </button>

            <button
              type="button"
              onClick={() => handleExport(false, 'export')}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-sky-500 hover:brightness-110 text-xs sm:text-sm font-semibold text-white flex items-center gap-2 cursor-pointer"
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
          <div className="rounded-2xl bg-[#0B1020]/85 backdrop-blur-xl border border-white/10 p-2 grid grid-cols-3 gap-1.5">
            {FX_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`min-h-[40px] px-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                  tab === t.id
                    ? 'bg-gradient-to-r from-violet-600/30 to-sky-500/25 border-sky-400/50 text-white'
                    : 'bg-[#060812] border-white/[0.06] text-slate-400'
                }`}
              >
                {t.icon}
                <span className="truncate">{t.label}</span>
              </button>
            ))}
          </div>

          <div className="rounded-2xl bg-[#0B1020]/85 backdrop-blur-xl border border-white/10 p-4 space-y-4">
            {tab === 'grading' && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-white">Split-Tone Cinema Wheels</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center justify-between bg-[#060812] border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-300">
                    <span>Shadow Lift</span>
                    <input type="color" value={liftHex} onChange={(e) => setLiftHex(e.target.value)} className="w-6 h-6 bg-transparent cursor-pointer" />
                  </label>
                  <label className="flex items-center justify-between bg-[#060812] border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-300">
                    <span>Highlight Gain</span>
                    <input type="color" value={gainHex} onChange={(e) => setGainHex(e.target.value)} className="w-6 h-6 bg-transparent cursor-pointer" />
                  </label>
                </div>
                <SliderControl label="Grade Intensity" value={gradeStrength} min={0} max={100} defaultValue={32} unit="%" onChange={setGradeStrength} />
              </div>
            )}

            {tab === 'luts' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 max-h-[290px] overflow-y-auto pr-1">
                  {FILTER_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setLutId(p.id)}
                      className={`text-left rounded-xl border p-2.5 cursor-pointer ${
                        lutId === p.id ? 'bg-white/10 border-amber-400/70' : 'bg-[#060812] border-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.accentColor }} />
                        <span className="text-xs font-semibold text-white truncate">{p.name}</span>
                      </div>
                    </button>
                  ))}
                </div>
                <SliderControl label="LUT Strength" value={lutIntensity} min={0} max={100} defaultValue={85} unit="%" onChange={setLutIntensity} />
              </div>
            )}

            {tab === 'glitch-neon' && (
              <div className="space-y-2">
                <SliderControl label="Glitch RGB Split" value={glitchRgb} min={0} max={40} defaultValue={12} unit="px" onChange={setGlitchRgb} />
                <SliderControl label="CRT Scanlines" value={scanlines} min={0} max={100} defaultValue={24} unit="%" onChange={setScanlines} />
                <SliderControl label="Neon Edge Glow" value={neonGlow} min={0} max={100} defaultValue={38} unit="%" onChange={setNeonGlow} />
                <div className="flex items-center justify-between pt-2 border-t border-white/[0.07]">
                  <span className="text-xs font-medium text-slate-300">Neon Accent Color</span>
                  <div className="flex items-center gap-1.5">
                    {['#38BDF8', '#A855F7', '#D4AF37', '#EC4899', '#2DD4BF'].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNeonHex(c)}
                        className={`w-6 h-6 rounded-full border cursor-pointer ${neonHex === c ? 'border-white scale-110' : 'border-white/20'}`}
                        style={{ backgroundColor: c }}
                      />
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
