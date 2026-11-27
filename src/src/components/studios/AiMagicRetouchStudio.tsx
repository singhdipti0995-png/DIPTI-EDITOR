import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  Smile,
  PenTool,
  Brush,
  Layers,
  Palette,
  Scissors,
  CloudSun,
  UserCheck,
  UserCircle,
  LayoutTemplate,
  FolderOpen,
  Eraser,
  Wand2,
  Download,
  Save,
  Eye,
  RotateCcw,
  Upload,
  Check,
  AlertCircle,
  Cpu,
  SlidersHorizontal,
  ArrowUpRight,
} from 'lucide-react';
import { AppSettings, BackdropMode, ExportRecord, ProjectItem, SubjectSegmentConfig } from '../../types/editor';
import { TypographyDesignDoc } from '../../types/typography';
import { STUDIO_ASSETS } from '../../data/studioCatalog';
import {
  ART_STYLE_OPTIONS,
  COLORIZE_PRESETS,
  CREATIVE_PHOTO_PRESETS,
  CreativePhotoPreset,
  CreativeStyleId,
  PORTRAIT_ART_PRESETS,
  PortraitArtPresetId,
} from '../../data/creativePresets';
import { AssetPickerBar } from '../AssetPickerBar';
import { SliderControl } from '../SliderControl';
import {
  compressImageForAI,
  createThumbnailDataUrl,
  loadImageElement,
  renderBackgroundCutout,
} from '../../utils/canvasEngine';
import { downloadExportedBlob, encodeCanvasToBlob } from '../../utils/exportEngine';
import { GallerySaveResult, exportCanvasViaGallery } from '../../utils/gallerySaveEngine';
import { GallerySaveBanner } from '../GallerySaveBanner';
import {
  ConceptArtRecipe,
  InpaintStroke,
  SkyPreset,
  applyCartoonShader,
  applyCinemaGlitchAndNeon,
  applyColorizeOrStyle,
  applyDoubleExposureEffect,
  applyObjectInpaint,
  applyOilPaintingEffect,
  applyPortraitArtEffect,
  applySketchEffect,
  applySkyReplacement,
  applyWatercolorEffect,
  renderAvatarCanvas,
  renderConceptArtCanvas,
} from '../../utils/creativeCanvas';
import {
  CreativePromptEntry,
  deletePromptHistoryEntry,
  loadPromptHistory,
  savePromptHistoryEntry,
} from '../../utils/storage';
import { CreativePromptPanel } from './CreativePromptPanel';
import { CreativeTemplatesPanel } from './CreativeTemplatesPanel';

interface AiMagicRetouchStudioProps {
  imageUrl: string;
  onChangeImage: (url: string) => void;
  settings: AppSettings;
  onSaveProject: (project: ProjectItem) => Promise<boolean> | void;
  onRecordExport?: (record: ExportRecord) => void;
  projects?: ProjectItem[];
  onOpenProject?: (project: ProjectItem) => void;
  onLaunchTemplateInDesign?: (doc: TypographyDesignDoc) => void;
}

type CreativeTabId =
  | 'presets'
  | 'text-to-image'
  | 'cartoon'
  | 'sketch-watercolor'
  | 'oil-painting'
  | 'double-exposure'
  | 'colorize'
  | 'bg-replace'
  | 'sky'
  | 'portrait'
  | 'avatar'
  | 'object-remove'
  | 'templates'
  | 'saved-projects';

const CREATIVE_TABS: Array<{
  id: CreativeTabId;
  label: string;
  engine: 'local' | 'hybrid';
  icon: React.ReactNode;
}> = [
  { id: 'presets', label: 'Creative Presets', engine: 'local', icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
  { id: 'text-to-image', label: 'Text-to-Image', engine: 'hybrid', icon: <Sparkles className="w-3.5 h-3.5" /> },
  { id: 'cartoon', label: 'Cartoon & Anime', engine: 'local', icon: <Smile className="w-3.5 h-3.5" /> },
  { id: 'sketch-watercolor', label: 'Sketch & Watercolor', engine: 'local', icon: <PenTool className="w-3.5 h-3.5" /> },
  { id: 'oil-painting', label: 'Oil Painting', engine: 'local', icon: <Brush className="w-3.5 h-3.5" /> },
  { id: 'double-exposure', label: 'Double Exposure', engine: 'local', icon: <Layers className="w-3.5 h-3.5" /> },
  { id: 'colorize', label: 'Colorize', engine: 'hybrid', icon: <Palette className="w-3.5 h-3.5" /> },
  { id: 'bg-replace', label: 'BG Replace', engine: 'hybrid', icon: <Scissors className="w-3.5 h-3.5" /> },
  { id: 'sky', label: 'Sky Replace', engine: 'hybrid', icon: <CloudSun className="w-3.5 h-3.5" /> },
  { id: 'portrait', label: 'Portrait Art', engine: 'local', icon: <UserCheck className="w-3.5 h-3.5" /> },
  { id: 'avatar', label: 'Avatar Studio', engine: 'local', icon: <UserCircle className="w-3.5 h-3.5" /> },
  { id: 'object-remove', label: 'Smart Erase', engine: 'hybrid', icon: <Eraser className="w-3.5 h-3.5" /> },
  { id: 'templates', label: 'Templates', engine: 'local', icon: <LayoutTemplate className="w-3.5 h-3.5" /> },
  { id: 'saved-projects', label: 'Saved Projects', engine: 'local', icon: <FolderOpen className="w-3.5 h-3.5" /> },
];

const SKY_OPTIONS: Array<{ id: SkyPreset; label: string }> = [
  { id: 'sunset-gold', label: 'Golden Sunset' },
  { id: 'twilight-aurora', label: 'Violet Aurora' },
  { id: 'midnight-stars', label: 'Starry Night' },
  { id: 'electric-storm', label: 'Electric Storm' },
];

const ASPECT_DIMENSIONS: Record<'1:1' | '16:9' | '9:16' | '4:5', { w: number; h: number }> = {
  '1:1': { w: 1024, h: 1024 },
  '16:9': { w: 1280, h: 720 },
  '9:16': { w: 720, h: 1280 },
  '4:5': { w: 960, h: 1200 },
};

export const AiMagicRetouchStudio: React.FC<AiMagicRetouchStudioProps> = ({
  imageUrl,
  onChangeImage,
  settings,
  onSaveProject,
  onRecordExport,
  projects = [],
  onOpenProject,
  onLaunchTemplateInDesign,
}) => {
  const [activeTab, setActiveTab] = useState<CreativeTabId>('cartoon');
  const [lastRenderOp, setLastRenderOp] = useState<
    | 'cartoon'
    | 'sketch-watercolor'
    | 'oil-painting'
    | 'double-exposure'
    | 'colorize'
    | 'bg-replace'
    | 'sky'
    | 'portrait'
    | 'avatar'
    | 'object-remove'
    | 'text-to-image'
    | 'cyber-neon'
    | 'gold-editorial'
  >('cartoon');

  // Text-to-image & Style state
  const [genPrompt, setGenPrompt] = useState('Obsidian royal portrait illuminated by violet aurora and metallic gold rim light');
  const [artStyle, setArtStyle] = useState<CreativeStyleId>('anime-cel');
  const [genAspect, setGenAspect] = useState<'1:1' | '16:9' | '9:16' | '4:5'>('16:9');
  const [promptHistory, setPromptHistory] = useState<CreativePromptEntry[]>(() => loadPromptHistory());
  const [genRecipe, setGenRecipe] = useState<ConceptArtRecipe>({
    title: 'Obsidian Aurora',
    description: 'Local procedural studio backdrop',
    pattern: 'aurora',
    bgHex: '#060814',
    primaryHex: '#7C3AED',
    secondaryHex: '#38BDF8',
    highlightHex: '#D4AF37',
    angleDeg: 35,
    complexity: 7,
  });

  // Cartoon & Anime
  const [animeMode, setAnimeMode] = useState(true);
  const [cartoonLevels, setCartoonLevels] = useState(6);
  const [cartoonEdge, setCartoonEdge] = useState(54);
  const [cartoonSat, setCartoonSat] = useState(26);

  // Sketch & Watercolor
  const [mediaMode, setMediaMode] = useState<'pencil' | 'charcoal' | 'ink' | 'watercolor'>('watercolor');
  const [sketchEdgeWeight, setSketchEdgeWeight] = useState(58);
  const [sketchContrast, setSketchContrast] = useState(24);
  const [wcSpread, setWcSpread] = useState(3);
  const [wcVibrance, setWcVibrance] = useState(24);
  const [wcGrain, setWcGrain] = useState(16);

  // Oil Painting
  const [oilRadius, setOilRadius] = useState(3);
  const [oilLevels, setOilLevels] = useState(14);
  const [oilContrast, setOilContrast] = useState(14);

  // Double Exposure
  const [doubleExpSecondUrl, setDoubleExpSecondUrl] = useState(STUDIO_ASSETS[4].url);
  const [doubleExpBlend, setDoubleExpBlend] = useState<'screen' | 'lighten' | 'overlay'>('screen');
  const [doubleExpOpacity, setDoubleExpOpacity] = useState(74);
  const [doubleExpContrast, setDoubleExpContrast] = useState(28);
  const [doubleExpTint, setDoubleExpTint] = useState('#7C3AED');

  // Colorize
  const [colorShadowHex, setColorShadowHex] = useState('#1E3A8A');
  const [colorHighlightHex, setColorHighlightHex] = useState('#F59E0B');
  const [colorContrast, setColorContrast] = useState(18);

  // BG Replace
  const [bgSegment, setBgSegment] = useState<SubjectSegmentConfig>({
    subjectLabel: 'Subject',
    xMin: 0.22,
    yMin: 0.1,
    xMax: 0.78,
    yMax: 0.95,
    threshold: 34,
    feather: 2,
  });
  const [bgBackdrop, setBgBackdrop] = useState<BackdropMode>('purple-glow');
  const [customBgUrl, setCustomBgUrl] = useState<string | null>(null);

  // Sky Replace
  const [skyHorizon, setSkyHorizon] = useState(0.48);
  const [skyPreset, setSkyPreset] = useState<SkyPreset>('twilight-aurora');

  // Portrait Art
  const [portraitPreset, setPortraitPreset] = useState<PortraitArtPresetId>('gold-halo');
  const [portraitIntensity, setPortraitIntensity] = useState(78);

  // Avatar Designer
  const [avatarShape, setAvatarShape] = useState<'circle' | 'rounded' | 'hex' | 'diamond'>('circle');
  const [avatarFrame, setAvatarFrame] = useState<'gold-ring' | 'purple-neon' | 'double-halo' | 'none'>('gold-ring');
  const [avatarBg, setAvatarBg] = useState<'transparent' | 'obsidian' | 'purple-gold'>('purple-gold');
  const [avatarZoom, setAvatarZoom] = useState(1.15);
  const [avatarOffsetX, setAvatarOffsetX] = useState(0);
  const [avatarOffsetY, setAvatarOffsetY] = useState(0);
  const [avatarBadge, setAvatarBadge] = useState('DIPTI');

  // Smart Erase (Object Remover)
  const [inpaintStrokes, setInpaintStrokes] = useState<InpaintStroke[]>([]);
  const [inpaintApplied, setInpaintApplied] = useState(false);
  const [brushSize, setBrushSize] = useState(26);

  // UI & Save State
  const [projectTitle, setProjectTitle] = useState('Creative Studio Artwork');
  const [exportFormat, setExportFormat] = useState<'png' | 'jpeg' | 'webp'>(settings.exportFormat || 'png');
  const [showOriginal, setShowOriginal] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [imgVersion, setImgVersion] = useState(0);
  const [gallerySaving, setGallerySaving] = useState(false);
  const [galleryProgress, setGalleryProgress] = useState(0);
  const [galleryStage, setGalleryStage] = useState<string | null>(null);
  const [galleryResult, setGalleryResult] = useState<GallerySaveResult | null>(null);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const secondaryImgRef = useRef<HTMLImageElement | null>(null);
  const customBgImgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const customBgInputRef = useRef<HTMLInputElement>(null);
  const doubleExpInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInpaintStrokes([]);
    setInpaintApplied(false);
    loadImageElement(imageUrl)
      .then((img) => {
        imgRef.current = img;
        setImgVersion((v) => v + 1);
      })
      .catch(() => {});
  }, [imageUrl]);

  useEffect(() => {
    loadImageElement(doubleExpSecondUrl)
      .then((img) => {
        secondaryImgRef.current = img;
        setImgVersion((v) => v + 1);
      })
      .catch(() => {});
  }, [doubleExpSecondUrl]);

  useEffect(() => {
    if (!customBgUrl) {
      customBgImgRef.current = null;
      return;
    }
    loadImageElement(customBgUrl)
      .then((img) => {
        customBgImgRef.current = img;
        setImgVersion((v) => v + 1);
      })
      .catch(() => {});
  }, [customBgUrl]);

  const effectiveRenderOp =
    activeTab === 'presets' || activeTab === 'templates' || activeTab === 'saved-projects'
      ? lastRenderOp
      : activeTab;

  // Render active Canvas artwork
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (effectiveRenderOp === 'text-to-image') {
      const dims = ASPECT_DIMENSIONS[genAspect];
      renderConceptArtCanvas(canvas, genRecipe, dims.w, dims.h);
      return;
    }

    const img = imgRef.current;
    if (!img) return;

    if (showOriginal) {
      const s = Math.min(1, 960 / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.round(img.naturalWidth * s);
      canvas.height = Math.round(img.naturalHeight * s);
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
      return;
    }

    if (effectiveRenderOp === 'cartoon') {
      applyCartoonShader(img, canvas, cartoonLevels, cartoonEdge, cartoonSat, 960, animeMode);
    } else if (effectiveRenderOp === 'sketch-watercolor') {
      if (mediaMode === 'watercolor') {
        applyWatercolorEffect(img, canvas, wcSpread, wcVibrance, wcGrain, 900);
      } else {
        applySketchEffect(img, canvas, mediaMode, sketchEdgeWeight, sketchContrast, 960);
      }
    } else if (effectiveRenderOp === 'oil-painting') {
      applyOilPaintingEffect(img, canvas, oilRadius, oilLevels, oilContrast, 640);
    } else if (effectiveRenderOp === 'double-exposure') {
      applyDoubleExposureEffect(
        img,
        secondaryImgRef.current,
        canvas,
        doubleExpBlend,
        doubleExpOpacity,
        doubleExpContrast,
        doubleExpTint,
        960
      );
    } else if (effectiveRenderOp === 'colorize') {
      applyColorizeOrStyle(img, canvas, colorShadowHex, colorHighlightHex, colorContrast, 22, 'colorize', 960);
    } else if (effectiveRenderOp === 'bg-replace') {
      if (customBgImgRef.current) {
        const fg = document.createElement('canvas');
        renderBackgroundCutout(img, fg, bgSegment, [], 'transparent', 960);
        canvas.width = fg.width;
        canvas.height = fg.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(customBgImgRef.current, 0, 0, canvas.width, canvas.height);
          ctx.drawImage(fg, 0, 0);
        }
      } else {
        renderBackgroundCutout(img, canvas, bgSegment, [], bgBackdrop, 960);
      }
    } else if (effectiveRenderOp === 'sky') {
      applySkyReplacement(img, canvas, skyHorizon, skyPreset, 960);
    } else if (effectiveRenderOp === 'portrait') {
      applyPortraitArtEffect(img, canvas, portraitPreset, portraitIntensity, 960);
    } else if (effectiveRenderOp === 'avatar') {
      renderAvatarCanvas(
        img,
        canvas,
        {
          shape: avatarShape,
          frameStyle: avatarFrame,
          bgMode: avatarBg,
          zoom: avatarZoom,
          offsetX: avatarOffsetX,
          offsetY: avatarOffsetY,
          badgeText: avatarBadge,
          ringColor: '#D4AF37',
        },
        1024
      );
    } else if (effectiveRenderOp === 'object-remove') {
      applyObjectInpaint(img, canvas, inpaintStrokes, !inpaintApplied, 960);
    } else if (effectiveRenderOp === 'cyber-neon') {
      applyCinemaGlitchAndNeon(
        img,
        canvas,
        {
          glitchRgb: 5,
          scanlines: 12,
          neonGlow: 62,
          neonColorHex: '#EC4899',
          liftTintHex: '#1E1B4B',
          gainTintHex: '#38BDF8',
          gradeStrength: 75,
        },
        960
      );
    } else if (effectiveRenderOp === 'gold-editorial') {
      applyColorizeOrStyle(img, canvas, '#141008', '#D4AF37', 30, 12, 'style', 960);
    }
  }, [
    effectiveRenderOp,
    imageUrl,
    showOriginal,
    genRecipe,
    genAspect,
    animeMode,
    cartoonLevels,
    cartoonEdge,
    cartoonSat,
    mediaMode,
    sketchEdgeWeight,
    sketchContrast,
    wcSpread,
    wcVibrance,
    wcGrain,
    oilRadius,
    oilLevels,
    oilContrast,
    doubleExpSecondUrl,
    doubleExpBlend,
    doubleExpOpacity,
    doubleExpContrast,
    doubleExpTint,
    colorShadowHex,
    colorHighlightHex,
    colorContrast,
    bgSegment,
    bgBackdrop,
    customBgUrl,
    skyHorizon,
    skyPreset,
    portraitPreset,
    portraitIntensity,
    avatarShape,
    avatarFrame,
    avatarBg,
    avatarZoom,
    avatarOffsetX,
    avatarOffsetY,
    avatarBadge,
    inpaintStrokes,
    inpaintApplied,
    imgVersion,
  ]);

  const recordPrompt = (styleLabel: string) => {
    const trimmed = genPrompt.trim();
    if (!trimmed) return;
    const entry: CreativePromptEntry = {
      id: `pr-${Date.now()}`,
      prompt: trimmed,
      styleLabel,
      aspect: genAspect,
      createdAt: new Date().toISOString(),
    };
    setPromptHistory(savePromptHistoryEntry(entry));
  };

  const handleApplyStyleToActivePhoto = (style: CreativeStyleId) => {
    setShowOriginal(false);
    setAiError(null);
    const label = ART_STYLE_OPTIONS.find((s) => s.id === style)?.label || style;
    recordPrompt(label);

    if (style === 'anime-cel') {
      setAnimeMode(true);
      setCartoonLevels(6);
      setCartoonEdge(52);
      setCartoonSat(30);
      setLastRenderOp('cartoon');
      setActiveTab('cartoon');
    } else if (style === 'pencil-sketch') {
      setMediaMode('pencil');
      setSketchEdgeWeight(64);
      setSketchContrast(26);
      setLastRenderOp('sketch-watercolor');
      setActiveTab('sketch-watercolor');
    } else if (style === 'watercolor') {
      setMediaMode('watercolor');
      setWcSpread(3);
      setWcVibrance(26);
      setLastRenderOp('sketch-watercolor');
      setActiveTab('sketch-watercolor');
    } else if (style === 'oil-paint') {
      setOilRadius(3);
      setOilLevels(12);
      setOilContrast(16);
      setLastRenderOp('oil-painting');
      setActiveTab('oil-painting');
    } else if (style === 'double-exposure') {
      setLastRenderOp('double-exposure');
      setActiveTab('double-exposure');
    } else if (style === 'colorize-warm') {
      setColorShadowHex('#2C1E14');
      setColorHighlightHex('#F3C98B');
      setColorContrast(18);
      setLastRenderOp('colorize');
      setActiveTab('colorize');
    } else if (style === 'cyber-neon') {
      setPortraitPreset('neon-rim');
      setPortraitIntensity(88);
      setLastRenderOp('portrait');
      setActiveTab('portrait');
    } else if (style === 'gold-editorial') {
      setPortraitPreset('gold-halo');
      setPortraitIntensity(86);
      setLastRenderOp('portrait');
      setActiveTab('portrait');
    }
    setAiNote(`Applied "${label}" locally to your active photo.`);
  };

  const handleApplyCreativePreset = (preset: CreativePhotoPreset) => {
    setShowOriginal(false);
    setAiError(null);
    if (preset.id === 'preset-anime') {
      setAnimeMode(true);
      setCartoonLevels(6);
      setCartoonEdge(52);
      setCartoonSat(32);
    } else if (preset.id === 'preset-sketch') {
      setMediaMode('charcoal');
      setSketchEdgeWeight(66);
      setSketchContrast(28);
    } else if (preset.id === 'preset-watercolor') {
      setMediaMode('watercolor');
      setWcSpread(4);
      setWcVibrance(30);
    } else if (preset.id === 'preset-oil') {
      setOilRadius(4);
      setOilLevels(12);
      setOilContrast(18);
    } else if (preset.id === 'preset-double') {
      setDoubleExpBlend('screen');
      setDoubleExpOpacity(78);
      setDoubleExpTint('#7C3AED');
    } else if (preset.id === 'preset-colorize') {
      setColorShadowHex('#2C1E14');
      setColorHighlightHex('#F3C98B');
      setColorContrast(18);
    } else if (preset.id === 'preset-portrait-gold') {
      setPortraitPreset('gold-halo');
      setPortraitIntensity(85);
    } else if (preset.id === 'preset-portrait-neon') {
      setPortraitPreset('neon-rim');
      setPortraitIntensity(85);
    }
    setLastRenderOp(preset.targetTool);
    setActiveTab(preset.targetTool);
    setAiNote(`Preset "${preset.label}" active in Local Canvas Engine.`);
  };

  const handleBrushPaint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeTab !== 'object-remove' || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    setInpaintApplied(false);
    setInpaintStrokes((prev) => [...prev, { x, y, radius: brushSize / 700 }]);
  };

  const runExternalAiAction = async (mode: 'concept-art' | 'bg-segment' | 'magic-retouch') => {
    setAiLoading(true);
    setAiError(null);
    setAiNote(null);

    try {
      if (mode === 'concept-art') {
        const styleLabel = ART_STYLE_OPTIONS.find((s) => s.id === artStyle)?.label || artStyle;
        recordPrompt(`${styleLabel} (External AI)`);
        const res = await fetch('/api/ai/concept-art', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: `${styleLabel}: ${genPrompt}` }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(
            data.error ||
              'External AI API key is not configured on the server. Use "Local Canvas" tools or Procedural Backdrop instead.'
          );
        }
        setGenRecipe(data);
        setLastRenderOp('text-to-image');
        setAiNote(`External AI directed backdrop: ${data.title}`);
        return;
      }

      if (!imgRef.current) return;
      const { base64, mimeType } = compressImageForAI(imgRef.current, 768);

      if (mode === 'bg-segment') {
        const res = await fetch('/api/ai/subject-segment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, mimeType }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'External AI segmentation unavailable without an API key.');
        }
        setBgSegment({
          subjectLabel: data.subjectLabel || 'Subject',
          xMin: Number(data.xMin ?? 0.2),
          yMin: Number(data.yMin ?? 0.1),
          xMax: Number(data.xMax ?? 0.8),
          yMax: Number(data.yMax ?? 0.95),
          threshold: Number(data.recommendedThreshold ?? 34),
          feather: Number(data.edgeFeather ?? 2),
        });
        setAiNote(`External AI isolated "${data.subjectLabel || 'subject'}".`);
        return;
      }

      const opParam =
        activeTab === 'sky'
          ? 'sky'
          : activeTab === 'colorize'
            ? 'colorize'
            : activeTab === 'object-remove'
              ? 'object-remove'
              : 'cartoon';

      const res = await fetch('/api/ai/magic-retouch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType,
          operation: opParam,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'External AI model endpoint unavailable without an API key.');
      }

      if (opParam === 'object-remove') {
        setInpaintApplied(true);
      } else if (opParam === 'sky') {
        setSkyHorizon(Math.max(0.2, Math.min(0.75, Number(data.horizonY ?? 0.45))));
      } else if (opParam === 'colorize') {
        if (data.shadowTintHex) setColorShadowHex(data.shadowTintHex);
        if (data.highlightTintHex) setColorHighlightHex(data.highlightTintHex);
      }
      setAiNote(data.summary || 'External AI parameters calibrated.');
    } catch (err) {
      setAiError(
        err instanceof Error
          ? err.message
          : 'External AI API requires a configured server key. Local Canvas effects continue working offline.'
      );
    } finally {
      setAiLoading(false);
    }
  };

  const handleExport = async (
    fmt: 'png' | 'jpeg' | 'webp',
    forceDuplicate = false,
    triggerSource: 'save' | 'export' | 'manual' = 'export'
  ) => {
    if (!canvasRef.current) return;
    const normFmt: 'png' | 'jpg' | 'webp' = fmt === 'jpeg' ? 'jpg' : fmt;
    setAiError(null);
    setGallerySaving(true);
    setGalleryProgress(12);
    setGalleryStage(`Encoding ${normFmt.toUpperCase()}...`);
    setGalleryResult(null);

    try {
      const baseFileName = `dipti-creative-${effectiveRenderOp}-${Date.now()}`;
      if (!settings.autoSaveToGallery && triggerSource === 'export') {
        const { blob } = await encodeCanvasToBlob(canvasRef.current, normFmt, settings.exportQuality);
        const fileName = `${baseFileName}.${normFmt}`;
        downloadExportedBlob(blob, fileName);
        onRecordExport?.({
          id: `exp-creative-${Date.now()}`,
          fileName,
          mediaType: 'image',
          format: normFmt,
          resolutionLabel: `${canvasRef.current.width}×${canvasRef.current.height}`,
          width: canvasRef.current.width,
          height: canvasRef.current.height,
          quality: normFmt === 'png' ? 100 : settings.exportQuality,
          fileSizeBytes: blob.size,
          status: 'completed',
          thumbnailDataUrl: createThumbnailDataUrl(canvasRef.current, 320),
          galleryDelivery: 'skipped-disabled',
          galleryLocationLabel: 'Manual Browser Download (Auto-Save OFF)',
          createdAt: new Date().toISOString(),
        });
        setAiNote(`Downloaded ${fileName} (Auto-Save to Gallery is OFF in Settings).`);
        return;
      }

      const gRes = await exportCanvasViaGallery({
        canvas: canvasRef.current,
        baseFileName,
        format: normFmt,
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
      if (gRes.saved) {
        setAiNote(gRes.statusMessage);
      } else if (gRes.error) {
        setAiError(gRes.error);
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setGallerySaving(false);
    }
  };

  const handleSave = async () => {
    if (!canvasRef.current) return;
    const thumb = createThumbnailDataUrl(canvasRef.current, 480);
    const activeLabel = CREATIVE_TABS.find((t) => t.id === activeTab)?.label || 'Creative Studio';
    const ok = await onSaveProject({
      id: `proj-${Date.now()}`,
      name: projectTitle.trim() || activeLabel,
      tool: 'ai-retouch',
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
      await handleExport(exportFormat, false, 'save');
    }
  };

  const handleLaunchTemplate = (doc: TypographyDesignDoc, attachCurrentArtwork: boolean) => {
    if (!onLaunchTemplateInDesign) return;
    const cloned: TypographyDesignDoc = JSON.parse(JSON.stringify(doc));
    if (attachCurrentArtwork && canvasRef.current) {
      cloned.background.photoUrl = canvasRef.current.toDataURL('image/jpeg', 0.9);
      cloned.background.mode = 'photo';
      cloned.background.photoDim = 32;
    }
    onLaunchTemplateInDesign(cloned);
  };

  const isTransparentPreview =
    (effectiveRenderOp === 'bg-replace' && bgBackdrop === 'transparent' && !customBgUrl) ||
    (effectiveRenderOp === 'avatar' && avatarBg === 'transparent');

  const currentTabMeta = CREATIVE_TABS.find((t) => t.id === activeTab) || CREATIVE_TABS[0];

  return (
    <div className="space-y-4 pb-24 lg:pb-8">
      {/* Hidden Gallery File Pickers */}
      <input
        ref={customBgInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = () => typeof r.result === 'string' && setCustomBgUrl(r.result);
          r.readAsDataURL(f);
          e.target.value = '';
        }}
        className="hidden"
      />
      <input
        ref={doubleExpInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = () => typeof r.result === 'string' && setDoubleExpSecondUrl(r.result);
          r.readAsDataURL(f);
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Transparent Local Canvas vs External AI Notice */}
      <div className="rounded-2xl bg-gradient-to-r from-[#130C22]/90 via-[#0B0D16]/95 to-[#161108]/90 border border-amber-400/20 px-4 py-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 text-xs text-slate-300">
          <Cpu className="w-4 h-4 text-amber-300 shrink-0" />
          <span>
            <strong className="text-white">AI Creative Studio:</strong> Artistic filters, Cartoon/Anime, Sketch/Watercolor, Oil Painting, Double Exposure, Portrait Art &amp; Avatars run <strong className="text-amber-300">100% locally on Canvas</strong> with zero API keys. Only optional <strong className="text-violet-300">External AI API</strong> actions call an external model.
          </span>
        </div>
      </div>

      {/* Primary Photo Asset Bar (Android gallery upload + studio samples) */}
      {effectiveRenderOp !== 'text-to-image' && (
        <AssetPickerBar activeImageUrl={imageUrl} onSelectImage={onChangeImage} />
      )}

      {/* Horizontal Touch-Friendly Studio Tab Strip */}
      <div className="rounded-2xl bg-[#0B0D16]/90 backdrop-blur-xl border border-white/10 p-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {CREATIVE_TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  if (tab.id !== 'presets' && tab.id !== 'templates' && tab.id !== 'saved-projects') {
                    setLastRenderOp(tab.id);
                  }
                  setAiNote(null);
                  setAiError(null);
                }}
                className={`min-h-[44px] px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-all ${
                  active
                    ? 'bg-gradient-to-r from-violet-600/35 to-amber-500/20 border-amber-400/65 text-white shadow-[0_4px_18px_rgba(124,58,237,0.25)]'
                    : 'bg-[#06070B] border-white/[0.06] text-slate-400 hover:text-white'
                }`}
              >
                <span className={active ? 'text-amber-300' : 'text-slate-400'}>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Split Workspace: Live Canvas Preview + Tool Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Canvas Preview + Save & Multi-Format Export */}
        <div className="lg:col-span-7 xl:col-span-8 rounded-2xl bg-[#080A12] border border-white/10 p-3 sm:p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-white">{currentTabMeta.label}</span>
              <span className="text-slate-500" aria-hidden="true">·</span>
              <span className={currentTabMeta.engine === 'hybrid' ? 'text-violet-300' : 'text-amber-300'}>
                {currentTabMeta.engine === 'hybrid' ? 'Local Canvas + Optional External AI' : 'Local Canvas Engine'}
              </span>
            </div>

            {effectiveRenderOp !== 'text-to-image' && (
              <button
                type="button"
                onClick={() => setShowOriginal((v) => !v)}
                className={`min-h-[40px] px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                  showOriginal
                    ? 'bg-amber-400/20 border-amber-400/60 text-amber-200'
                    : 'bg-white/[0.05] border-white/10 text-slate-300 hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{showOriginal ? 'Showing Original' : 'Before / Original'}</span>
              </button>
            )}
          </div>

          <div
            className={`min-h-[290px] sm:min-h-[430px] rounded-xl border border-white/[0.07] flex items-center justify-center p-2 overflow-hidden ${
              isTransparentPreview ? 'bg-checkerboard' : 'bg-[#040508]'
            }`}
          >
            <canvas
              ref={canvasRef}
              onPointerDown={(e) => {
                if (activeTab === 'object-remove') {
                  (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
                  handleBrushPaint(e);
                }
              }}
              onPointerMove={(e) => {
                if (activeTab === 'object-remove' && (e.buttons === 1 || e.pointerType === 'touch')) {
                  handleBrushPaint(e);
                }
              }}
              className={`max-w-full max-h-[500px] object-contain rounded-lg ${
                activeTab === 'object-remove' ? 'cursor-crosshair touch-none' : ''
              }`}
            />
          </div>

          {/* Project Title + Save + Multi-Format Export Controls */}
          <div className="pt-1 space-y-3 border-t border-white/[0.06]">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <input
                  type="text"
                  value={projectTitle}
                  onChange={(e) => setProjectTitle(e.target.value)}
                  placeholder="Project title..."
                  aria-label="Creative project title"
                  className="flex-1 min-h-[44px] px-3 rounded-xl bg-[#06070B] border border-white/15 focus:border-amber-400/60 outline-none text-xs text-white"
                />
                <button
                  type="button"
                  onClick={handleSave}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-amber-400/35 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {savedNotice ? <Check className="w-4 h-4 text-emerald-400" /> : <Save className="w-4 h-4 text-amber-300" />}
                  <span>{savedNotice ? 'Saved!' : 'Save Project'}</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {(['png', 'jpeg', 'webp'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => {
                      setExportFormat(fmt);
                      handleExport(fmt, false, 'export');
                    }}
                    className={`min-h-[44px] px-3.5 rounded-xl border text-xs font-semibold uppercase flex items-center gap-1.5 cursor-pointer transition-all ${
                      exportFormat === fmt
                        ? 'bg-gradient-to-r from-violet-600 to-amber-500 border-amber-400/50 text-white'
                        : 'bg-[#06070B] border-white/15 text-slate-300 hover:border-amber-400/50 hover:text-white'
                    }`}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{fmt === 'png' && isTransparentPreview ? 'Transparent PNG' : fmt.toUpperCase()}</span>
                  </button>
                ))}
              </div>
            </div>

            <GallerySaveBanner
              saving={gallerySaving}
              progressPct={galleryProgress}
              stageLabel={galleryStage}
              result={galleryResult}
              onSaveCopyAnyway={() => handleExport(exportFormat, true, 'export')}
              onDismiss={() => setGalleryResult(null)}
            />
          </div>
        </div>

        {/* Right: Active Creative Tool Controls */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          <div className="rounded-2xl bg-[#0B0D16]/90 backdrop-blur-xl border border-white/10 p-4 space-y-4">
            {/* 1. Creative Photo Presets */}
            {activeTab === 'presets' && (
              <div className="space-y-3">
                <p className="text-xs text-slate-300 leading-relaxed">
                  One-tap creative presets processed locally on Canvas. Tap any look to transform your photo and fine-tune parameters.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {CREATIVE_PHOTO_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleApplyCreativePreset(preset)}
                      className="min-h-[60px] p-3 rounded-xl bg-[#06070B] hover:bg-white/[0.06] border border-white/10 hover:border-amber-400/55 text-left flex flex-col justify-between gap-1 cursor-pointer transition-all"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: preset.accent }}
                        />
                        <span className="text-[10px] font-mono-tabular text-slate-400">{preset.category}</span>
                      </div>
                      <span className="text-xs font-semibold text-white leading-tight">{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 2. Text-to-Image + AI Art Style + Prompt History */}
            {activeTab === 'text-to-image' && (
              <CreativePromptPanel
                prompt={genPrompt}
                onChangePrompt={setGenPrompt}
                selectedStyle={artStyle}
                onSelectStyle={setArtStyle}
                aspect={genAspect}
                onSelectAspect={setGenAspect}
                promptHistory={promptHistory}
                onReuseHistory={(entry) => {
                  setGenPrompt(entry.prompt);
                  const found = ART_STYLE_OPTIONS.find((s) => s.label === entry.styleLabel);
                  if (found) setArtStyle(found.id);
                  if (entry.aspect === '1:1' || entry.aspect === '16:9' || entry.aspect === '9:16' || entry.aspect === '4:5') {
                    setGenAspect(entry.aspect);
                  }
                }}
                onDeleteHistory={(id) => setPromptHistory(deletePromptHistoryEntry(id))}
                onTryExternalAiApi={() => runExternalAiAction('concept-art')}
                onComposeLocalBackdrop={(recipe) => {
                  setGenRecipe(recipe);
                  setLastRenderOp('text-to-image');
                  recordPrompt(`${ART_STYLE_OPTIONS.find((s) => s.id === artStyle)?.label || artStyle} (Local Backdrop)`);
                  setAiError(null);
                  setAiNote(`Rendered "${recipe.title}" geometric Canvas backdrop locally.`);
                }}
                onApplyStyleToActivePhoto={handleApplyStyleToActivePhoto}
                aiLoading={aiLoading}
              />
            )}

            {/* 3. Cartoon & Anime Effects */}
            {activeTab === 'cartoon' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAnimeMode(true)}
                    className={`min-h-[44px] rounded-xl border text-xs font-semibold cursor-pointer ${
                      animeMode
                        ? 'bg-gradient-to-r from-violet-600/35 to-amber-500/20 border-amber-400/60 text-white'
                        : 'bg-[#06070B] border-white/10 text-slate-400'
                    }`}
                  >
                    Anime Pastel
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnimeMode(false)}
                    className={`min-h-[44px] rounded-xl border text-xs font-semibold cursor-pointer ${
                      !animeMode
                        ? 'bg-gradient-to-r from-violet-600/35 to-amber-500/20 border-amber-400/60 text-white'
                        : 'bg-[#06070B] border-white/10 text-slate-400'
                    }`}
                  >
                    Bold Cartoon
                  </button>
                </div>
                <SliderControl label="Cel Color Bands" value={cartoonLevels} min={3} max={12} defaultValue={6} onChange={setCartoonLevels} />
                <SliderControl label="Ink Outline Strength" value={cartoonEdge} min={0} max={100} defaultValue={54} onChange={setCartoonEdge} />
                <SliderControl label="Color Vibrance" value={cartoonSat} min={0} max={70} defaultValue={26} onChange={setCartoonSat} />
              </div>
            )}

            {/* 4. Sketch & Watercolor Effects */}
            {activeTab === 'sketch-watercolor' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'watercolor', label: 'Watercolor Wash' },
                      { id: 'pencil', label: 'Pencil Sketch' },
                      { id: 'charcoal', label: 'Charcoal Chalk' },
                      { id: 'ink', label: 'Ink Monograph' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMediaMode(m.id)}
                      className={`min-h-[42px] px-2.5 rounded-xl border text-xs font-semibold cursor-pointer ${
                        mediaMode === m.id
                          ? 'bg-gradient-to-r from-violet-600/35 to-amber-500/20 border-amber-400/60 text-white'
                          : 'bg-[#06070B] border-white/10 text-slate-400'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {mediaMode === 'watercolor' ? (
                  <>
                    <SliderControl label="Pigment Spread" value={wcSpread} min={1} max={6} defaultValue={3} onChange={setWcSpread} />
                    <SliderControl label="Pigment Vibrance" value={wcVibrance} min={0} max={60} defaultValue={24} onChange={setWcVibrance} />
                    <SliderControl label="Cold-Press Paper Grain" value={wcGrain} min={0} max={40} defaultValue={16} onChange={setWcGrain} />
                  </>
                ) : (
                  <>
                    <SliderControl label="Stroke Line Weight" value={sketchEdgeWeight} min={20} max={100} defaultValue={58} onChange={setSketchEdgeWeight} />
                    <SliderControl label="Graphite Contrast" value={sketchContrast} min={0} max={60} defaultValue={24} onChange={setSketchContrast} />
                  </>
                )}
              </div>
            )}

            {/* 5. Oil Painting Effects */}
            {activeTab === 'oil-painting' && (
              <div className="space-y-3">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Local intensity-binned brush clustering simulates thick impasto oil strokes directly on Canvas.
                </p>
                <SliderControl label="Brush Stroke Size" value={oilRadius} min={2} max={6} defaultValue={3} unit="px" onChange={setOilRadius} />
                <SliderControl label="Pigment Detail Levels" value={oilLevels} min={8} max={24} defaultValue={14} onChange={setOilLevels} />
                <SliderControl label="Canvas Contrast" value={oilContrast} min={0} max={40} defaultValue={14} onChange={setOilContrast} />
              </div>
            )}

            {/* 6. Double Exposure Effects */}
            {activeTab === 'double-exposure' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200">Secondary Layer Photo</span>
                    <button
                      type="button"
                      onClick={() => doubleExpInputRef.current?.click()}
                      className="min-h-[36px] px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-amber-400/35 text-[11px] font-semibold text-amber-200 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>From Gallery</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    {STUDIO_ASSETS.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setDoubleExpSecondUrl(a.url)}
                        className={`w-12 h-12 rounded-lg overflow-hidden border shrink-0 cursor-pointer ${
                          doubleExpSecondUrl === a.url ? 'border-amber-400 ring-1 ring-amber-400/60' : 'border-white/10'
                        }`}
                      >
                        <img src={a.url} alt={a.title} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {(['screen', 'lighten', 'overlay'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setDoubleExpBlend(mode)}
                      className={`min-h-[40px] rounded-xl border text-xs capitalize font-semibold cursor-pointer ${
                        doubleExpBlend === mode
                          ? 'bg-violet-600/30 border-amber-400/60 text-white'
                          : 'bg-[#06070B] border-white/10 text-slate-400'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>

                <SliderControl label="Blend Opacity" value={doubleExpOpacity} min={10} max={100} defaultValue={74} unit="%" onChange={setDoubleExpOpacity} />
                <SliderControl label="Silhouette Contrast" value={doubleExpContrast} min={0} max={60} defaultValue={28} onChange={setDoubleExpContrast} />
                <label className="flex items-center justify-between gap-2 bg-[#06070B] border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-300">
                  <span>Atmospheric Wash Tint</span>
                  <input type="color" value={doubleExpTint} onChange={(e) => setDoubleExpTint(e.target.value)} className="w-7 h-7 bg-transparent cursor-pointer" />
                </label>
              </div>
            )}

            {/* 7. Photo Colorization Tools */}
            {activeTab === 'colorize' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-1.5">
                  {COLORIZE_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setColorShadowHex(p.shadowHex);
                        setColorHighlightHex(p.highlightHex);
                        setColorContrast(p.contrast);
                      }}
                      className="min-h-[42px] px-2.5 py-2 rounded-xl bg-[#06070B] hover:bg-white/[0.06] border border-white/10 hover:border-amber-400/50 text-left text-[11px] font-semibold text-white cursor-pointer"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <label className="flex items-center justify-between gap-2 bg-[#06070B] border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-300">
                    <span>Shadows</span>
                    <input type="color" value={colorShadowHex} onChange={(e) => setColorShadowHex(e.target.value)} className="w-6 h-6 bg-transparent cursor-pointer" />
                  </label>
                  <label className="flex items-center justify-between gap-2 bg-[#06070B] border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-300">
                    <span>Highlights</span>
                    <input type="color" value={colorHighlightHex} onChange={(e) => setColorHighlightHex(e.target.value)} className="w-6 h-6 bg-transparent cursor-pointer" />
                  </label>
                </div>

                <SliderControl label="Tonal Contrast" value={colorContrast} min={0} max={45} defaultValue={18} onChange={setColorContrast} />

                <button
                  type="button"
                  disabled={aiLoading}
                  onClick={() => runExternalAiAction('magic-retouch')}
                  className="w-full min-h-[44px] px-4 rounded-xl bg-[#06070B] hover:bg-white/[0.06] border border-violet-400/40 text-xs font-semibold text-violet-200 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Wand2 className="w-4 h-4 text-violet-300" />
                  <span>{aiLoading ? 'Analyzing...' : 'Auto-Detect Palette (External AI)'}</span>
                </button>
              </div>
            )}

            {/* 8. Background Replacement Workspace */}
            {activeTab === 'bg-replace' && (
              <div className="space-y-3">
                <SliderControl
                  label="Edge Tolerance"
                  value={bgSegment.threshold}
                  min={10}
                  max={75}
                  defaultValue={34}
                  onChange={(v) => setBgSegment((s) => ({ ...s, threshold: v }))}
                />
                <SliderControl
                  label="Edge Feather"
                  value={bgSegment.feather}
                  min={0}
                  max={6}
                  defaultValue={2}
                  onChange={(v) => setBgSegment((s) => ({ ...s, feather: v }))}
                />
                <div className="grid grid-cols-3 gap-1.5">
                  {(['transparent', 'navy', 'purple-glow', 'gold-noir', 'studio-white', 'bokeh'] as BackdropMode[]).map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => {
                        setCustomBgUrl(null);
                        setBgBackdrop(b);
                      }}
                      className={`min-h-[40px] px-2 rounded-xl border text-[11px] capitalize cursor-pointer ${
                        !customBgUrl && bgBackdrop === b
                          ? 'bg-amber-400/20 border-amber-400/65 text-white font-semibold'
                          : 'bg-[#06070B] border-white/10 text-slate-400'
                      }`}
                    >
                      {b.replace('-', ' ')}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => customBgInputRef.current?.click()}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-amber-300" />
                  <span>Upload Custom Backdrop</span>
                </button>
                <button
                  type="button"
                  disabled={aiLoading}
                  onClick={() => runExternalAiAction('bg-segment')}
                  className="w-full min-h-[44px] px-4 rounded-xl bg-[#06070B] hover:bg-white/[0.06] border border-violet-400/40 text-xs font-semibold text-violet-200 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Wand2 className="w-4 h-4 text-violet-300" />
                  <span>{aiLoading ? 'Isolating...' : 'Auto-Detect Subject Box (External AI)'}</span>
                </button>
              </div>
            )}

            {/* 9. Sky Replacement Workspace */}
            {activeTab === 'sky' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {SKY_OPTIONS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSkyPreset(s.id)}
                      className={`min-h-[42px] px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                        skyPreset === s.id
                          ? 'bg-amber-400/20 border-amber-400/65 text-amber-100'
                          : 'bg-[#06070B] border-white/10 text-slate-300'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <SliderControl
                  label="Horizon Height"
                  value={Math.round(skyHorizon * 100)}
                  min={20}
                  max={80}
                  defaultValue={48}
                  unit="%"
                  onChange={(v) => setSkyHorizon(v / 100)}
                />
                <button
                  type="button"
                  disabled={aiLoading}
                  onClick={() => runExternalAiAction('magic-retouch')}
                  className="w-full min-h-[44px] px-4 rounded-xl bg-[#06070B] hover:bg-white/[0.06] border border-violet-400/40 text-xs font-semibold text-violet-200 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Wand2 className="w-4 h-4 text-violet-300" />
                  <span>{aiLoading ? 'Detecting...' : 'Auto-Detect Horizon (External AI)'}</span>
                </button>
              </div>
            )}

            {/* 10. Portrait Artistic Effects */}
            {activeTab === 'portrait' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  {PORTRAIT_ART_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPortraitPreset(p.id)}
                      className={`w-full min-h-[48px] px-3 py-2 rounded-xl border text-left flex items-center justify-between gap-2 cursor-pointer ${
                        portraitPreset === p.id
                          ? 'bg-gradient-to-r from-violet-600/30 to-amber-500/20 border-amber-400/60 text-white'
                          : 'bg-[#06070B] border-white/10 text-slate-300'
                      }`}
                    >
                      <span className="text-xs font-semibold">{p.label}</span>
                      <span className="text-[11px] text-slate-400">{p.note}</span>
                    </button>
                  ))}
                </div>
                <SliderControl label="Portrait FX Intensity" value={portraitIntensity} min={10} max={100} defaultValue={78} unit="%" onChange={setPortraitIntensity} />
              </div>
            )}

            {/* 11. Avatar Design Workspace */}
            {activeTab === 'avatar' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-200 block">Avatar Crop Shape</span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['circle', 'rounded', 'hex', 'diamond'] as const).map((shape) => (
                      <button
                        key={shape}
                        type="button"
                        onClick={() => setAvatarShape(shape)}
                        className={`min-h-[40px] rounded-xl border text-[11px] capitalize font-semibold cursor-pointer ${
                          avatarShape === shape
                            ? 'bg-amber-400/20 border-amber-400/65 text-amber-200'
                            : 'bg-[#06070B] border-white/10 text-slate-400'
                        }`}
                      >
                        {shape}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-200 block">Ring Frame &amp; Backdrop</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: 'gold-ring', label: 'Gold Metallic' },
                        { id: 'purple-neon', label: 'Purple Neon' },
                        { id: 'double-halo', label: 'Double Halo' },
                        { id: 'none', label: 'No Ring' },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setAvatarFrame(f.id)}
                        className={`min-h-[38px] rounded-xl border text-[11px] font-semibold cursor-pointer ${
                          avatarFrame === f.id
                            ? 'bg-violet-600/30 border-violet-400 text-white'
                            : 'bg-[#06070B] border-white/10 text-slate-400'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {(['transparent', 'obsidian', 'purple-gold'] as const).map((bg) => (
                    <button
                      key={bg}
                      type="button"
                      onClick={() => setAvatarBg(bg)}
                      className={`min-h-[38px] rounded-xl border text-[11px] capitalize font-semibold cursor-pointer ${
                        avatarBg === bg
                          ? 'bg-amber-400/20 border-amber-400/60 text-white'
                          : 'bg-[#06070B] border-white/10 text-slate-400'
                      }`}
                    >
                      {bg.replace('-', ' ')}
                    </button>
                  ))}
                </div>

                <SliderControl label="Portrait Zoom" value={Math.round(avatarZoom * 100)} min={100} max={240} defaultValue={115} unit="%" onChange={(v) => setAvatarZoom(v / 100)} />
                <SliderControl label="Pan Horizontal" value={Math.round(avatarOffsetX * 100)} min={-50} max={50} defaultValue={0} unit="%" onChange={(v) => setAvatarOffsetX(v / 100)} />
                <SliderControl label="Pan Vertical" value={Math.round(avatarOffsetY * 100)} min={-50} max={50} defaultValue={0} unit="%" onChange={(v) => setAvatarOffsetY(v / 100)} />

                <input
                  type="text"
                  maxLength={14}
                  value={avatarBadge}
                  onChange={(e) => setAvatarBadge(e.target.value)}
                  placeholder="Optional badge text (e.g. DIPTI)..."
                  className="w-full min-h-[42px] px-3 rounded-xl bg-[#06070B] border border-white/15 focus:border-amber-400/60 outline-none text-xs text-white"
                />
              </div>
            )}

            {/* 12. Smart Erase (Object Remover) */}
            {activeTab === 'object-remove' && (
              <div className="space-y-3">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Paint over unwanted elements directly on the Canvas, then apply local harmonic inpainting to fill surrounding textures.
                </p>
                <SliderControl label="Brush Size" value={brushSize} min={10} max={70} defaultValue={26} unit="px" onChange={setBrushSize} />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={inpaintStrokes.length === 0}
                    onClick={() => setInpaintApplied(true)}
                    className="flex-1 min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-violet-600 to-amber-500 disabled:opacity-45 text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Eraser className="w-4 h-4" />
                    <span>Apply Local Fill</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInpaintStrokes([]);
                      setInpaintApplied(false);
                    }}
                    className="min-h-[44px] px-3 rounded-xl bg-white/[0.06] border border-white/10 text-xs text-slate-300 cursor-pointer"
                    aria-label="Reset erase mask"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* 13. Poster / YouTube Thumbnail / Social Media Templates */}
            {activeTab === 'templates' && (
              <CreativeTemplatesPanel onLaunchTemplate={handleLaunchTemplate} />
            )}

            {/* 14. Saved Creative Projects */}
            {activeTab === 'saved-projects' && (
              <div className="space-y-3">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Resume your saved Creative Studio artworks and recent photo/design sessions.
                </p>
                {projects.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center border border-dashed border-white/10 rounded-xl">
                    No saved creative projects yet. Click &quot;Save Project&quot; below the canvas to store this session.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[380px] overflow-y-auto pr-0.5">
                    {projects.slice(0, 12).map((proj) => (
                      <button
                        key={proj.id}
                        type="button"
                        onClick={() => onOpenProject?.(proj)}
                        className="w-full p-2.5 rounded-xl bg-[#06070B] hover:bg-white/[0.06] border border-white/10 hover:border-amber-400/50 flex items-center justify-between gap-3 text-left cursor-pointer group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={proj.thumbnailDataUrl}
                            alt={proj.name}
                            className="w-12 h-10 rounded-lg object-cover border border-white/10 shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-white truncate">{proj.name}</p>
                            <p className="text-[10px] font-mono-tabular text-slate-400">
                              {proj.width}×{proj.height} · {proj.tool === 'ai-retouch' ? 'Creative Studio' : proj.tool}
                            </p>
                          </div>
                        </div>
                        <ArrowUpRight className="w-4 h-4 text-amber-300 opacity-75 group-hover:opacity-100 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {aiNote && (
              <p className="text-xs text-amber-200 bg-amber-500/10 border border-amber-400/25 rounded-xl px-3 py-2">
                {aiNote}
              </p>
            )}
            {aiError && (
              <div className="flex items-start gap-2 text-xs text-rose-200 bg-rose-500/10 border border-rose-400/25 rounded-xl px-3 py-2">
                <AlertCircle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
                <span>{aiError}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
