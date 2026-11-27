import React, { useRef } from 'react';
import { motion } from 'motion/react';
import {
  Sliders,
  Film,
  Scissors,
  Sparkles,
  Palette,
  Type as TypeIcon,
  FolderOpen,
  Settings,
  ArrowUpRight,
  Upload,
  Wand2,
  Zap,
  Box,
  Crosshair,
  Crop,
  Layers,
  Play,
  Download,
  Camera,
  Aperture,
  ShieldCheck,
} from 'lucide-react';
import { ProjectItem, StudioToolId } from '../types/editor';
import {
  CREATIVE_STUDIO_CARDS,
  FILTER_PRESETS,
  STUDIO_ASSETS,
  STUDIO_FEATURES,
} from '../data/studioCatalog';
import { BrandLogo } from './BrandLogo';

interface DashboardViewProps {
  onNavigate: (tool: StudioToolId) => void;
  onImportImageForTool: (imageUrl: string, targetTool: StudioToolId) => void;
  onApplyFeaturedEffect?: (presetId: string) => void;
  projects: ProjectItem[];
  onOpenProject: (project: ProjectItem) => void;
  reducedMotion?: boolean;
}

const FEATURE_ICONS: Record<string, React.ReactNode> = {
  photo: <Sliders className="w-4 h-4 text-violet-300" />,
  video: <Film className="w-4 h-4 text-amber-300" />,
  'portrait-studio': <Camera className="w-4 h-4 text-amber-300" />,
  'dslr-studio': <Aperture className="w-4 h-4 text-violet-300" />,
  'photo-restoration': <Wand2 className="w-4 h-4 text-amber-300" />,
  'hd-quality': <ShieldCheck className="w-4 h-4 text-amber-300" />,
  'color-grading': <Palette className="w-4 h-4 text-amber-300" />,
  'preset-library': <Layers className="w-4 h-4 text-violet-300" />,
  'batch-editor': <Layers className="w-4 h-4 text-amber-300" />,
  'bg-remover': <Scissors className="w-4 h-4 text-amber-300" />,
  enhancer: <Sparkles className="w-4 h-4 text-sky-300" />,
  filters: <Palette className="w-4 h-4 text-violet-300" />,
  text: <TypeIcon className="w-4 h-4 text-amber-300" />,
  'ai-retouch': <Wand2 className="w-4 h-4 text-violet-300" />,
  'cinema-fx': <Zap className="w-4 h-4 text-sky-300" />,
  'design-studio': <Box className="w-4 h-4 text-amber-300" />,
  'motion-vfx': <Crosshair className="w-4 h-4 text-sky-300" />,
};

const ACCENT_RING: Record<'purple' | 'blue' | 'gold', string> = {
  purple: 'hover:border-violet-400/50 hover:shadow-[0_12px_40px_rgba(124,58,237,0.18)]',
  blue: 'hover:border-sky-400/50 hover:shadow-[0_12px_40px_rgba(37,99,235,0.18)]',
  gold: 'hover:border-amber-400/55 hover:shadow-[0_12px_40px_rgba(212,175,55,0.18)]',
};

const QUICK_TOOLS: Array<{
  id: string;
  label: string;
  sublabel: string;
  target: StudioToolId;
  icon: React.ReactNode;
}> = [
  {
    id: 'crop',
    label: 'Crop & Rotate',
    sublabel: 'Aspect & flip',
    target: 'photo',
    icon: <Crop className="w-4 h-4 text-amber-300" />,
  },
  {
    id: 'rgb-hsl',
    label: 'Color Grading Studio',
    sublabel: 'Curves, Wheels & LUTs',
    target: 'color-grading',
    icon: <Palette className="w-4 h-4 text-violet-300" />,
  },
  {
    id: 'bg-cutout',
    label: 'BG Cutout',
    sublabel: 'Alpha isolate',
    target: 'bg-remover',
    icon: <Scissors className="w-4 h-4 text-amber-300" />,
  },
  {
    id: 'upscale',
    label: '2x Upscaler',
    sublabel: 'Detail crisp',
    target: 'enhancer',
    icon: <Sparkles className="w-4 h-4 text-sky-300" />,
  },
  {
    id: 'photo-restoration-tool',
    label: 'Photo Restoration',
    sublabel: 'Old prints, denoise & deblur',
    target: 'photo-restoration',
    icon: <Wand2 className="w-4 h-4 text-amber-300" />,
  },
  {
    id: 'creative-brand',
    label: 'Typography & Motion',
    sublabel: 'Gold, Neon & Templates',
    target: 'design-studio',
    icon: <Box className="w-4 h-4 text-amber-300" />,
  },
  {
    id: 'portrait',
    label: 'Portrait Studio',
    sublabel: '30 Cinema Looks',
    target: 'portrait-studio',
    icon: <Camera className="w-4 h-4 text-amber-300" />,
  },
  {
    id: 'batch-photo-tool',
    label: 'Batch Photo Editor',
    sublabel: 'Multi-photo & watermark',
    target: 'batch-editor',
    icon: <Layers className="w-4 h-4 text-amber-300" />,
  },
  {
    id: 'preset-library-tool',
    label: 'Preset Library',
    sublabel: '42+ Looks & Custom',
    target: 'preset-library',
    icon: <Layers className="w-4 h-4 text-violet-300" />,
  },
  {
    id: 'hd-quality-tool',
    label: 'HD Quality Engine',
    sublabel: 'Zoom & Full-Res',
    target: 'hd-quality',
    icon: <ShieldCheck className="w-4 h-4 text-amber-300" />,
  },
  {
    id: 'timeline',
    label: 'Export Center',
    sublabel: 'JPG/PNG/WebP & MP4',
    target: 'export-center',
    icon: <Download className="w-4 h-4 text-amber-300" />,
  },
];

const FEATURED_EFFECT_CARDS: Array<{
  presetId: string;
  previewUrl: string;
  cssFilter: string;
  tagline: string;
}> = [
  {
    presetId: 'obsidian-gold',
    previewUrl: STUDIO_ASSETS[0].url,
    cssFilter: 'contrast(1.18) saturate(0.9) sepia(0.18)',
    tagline: 'Metallic warmth · Deep shadows',
  },
  {
    presetId: 'anamorphic-teal',
    previewUrl: STUDIO_ASSETS[4].url,
    cssFilter: 'contrast(1.22) saturate(1.15) hue-rotate(-10deg)',
    tagline: 'Cinema scope · Teal & amber',
  },
  {
    presetId: 'velvet-violet',
    previewUrl: STUDIO_ASSETS[3].url,
    cssFilter: 'contrast(1.16) saturate(1.2) hue-rotate(14deg)',
    tagline: 'Violet bloom · Night highlights',
  },
  {
    presetId: 'leica-noir',
    previewUrl: STUDIO_ASSETS[5].url,
    cssFilter: 'grayscale(1) contrast(1.32)',
    tagline: 'High-contrast monochrome',
  },
];

const PROJECT_TOOL_BADGE: Record<StudioToolId, string> = {
  dashboard: 'Studio',
  photo: 'Photo Edit',
  video: 'Video Reel',
  'portrait-studio': 'Portrait FX',
  'dslr-studio': 'DSLR Bokeh',
  'photo-restoration': 'Photo Restore',
  'hd-quality': 'HD Engine',
  'color-grading': 'Color Grade',
  'preset-library': 'Preset Library',
  'batch-editor': 'Batch Edit',
  'bg-remover': 'Cutout',
  enhancer: '2x Enhanced',
  filters: 'Filter Grade',
  text: 'Typography',
  'ai-retouch': 'AI Creative',
  'cinema-fx': 'Cinema FX',
  'design-studio': 'Creative Design',
  'motion-vfx': 'Motion VFX',
  'export-center': 'Export',
  projects: 'Project',
  settings: 'Config',
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onImportImageForTool,
  onApplyFeaturedEffect,
  projects,
  onOpenProject,
  reducedMotion = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleQuickImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onImportImageForTool(reader.result, 'photo');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleEffectSelect = (presetId: string) => {
    if (onApplyFeaturedEffect) {
      onApplyFeaturedEffect(presetId);
    } else {
      onNavigate('filters');
    }
  };

  return (
    <div className="space-y-8 pb-24 lg:pb-10">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleQuickImport}
        className="hidden"
      />

      {/* Animated Cinematic Welcome Hero */}
      <motion.section
        initial={reducedMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0D0B18]/95 via-[#090B14]/95 to-[#06070B]/95 backdrop-blur-xl border border-amber-400/20 shadow-[0_20px_70px_rgba(124,58,237,0.14)]"
      >
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-amber-400/60 to-transparent pointer-events-none" />
        <div className="absolute -top-32 -right-24 w-96 h-96 rounded-full bg-violet-600/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-24 w-96 h-96 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

        <div className="relative grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-7 p-6 sm:p-8 lg:p-10 flex flex-col justify-between gap-6">
            <div className="space-y-4">
              <BrandLogo size="lg" />
              <div className="space-y-2.5">
                <p className="text-xs font-medium tracking-wide text-amber-300">
                  DIPTI CREATIVE WORKSPACE · STUDIO EDITION
                </p>
                <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-[1.08] tracking-tight text-balance">
                  Cinematic Photo &amp; Multi-Track Video Studio
                </h1>
              </div>
              <p className="text-sm sm:text-base text-slate-300 max-w-xl leading-relaxed">
                Color grade with RGB &amp; HSL matrices, cut subjects cleanly, design 3D posters and logos, and assemble multi-layer reels directly on your device.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate('photo')}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-amber-500 hover:brightness-110 text-white text-sm font-semibold flex items-center gap-2 shadow-[0_8px_30px_rgba(124,58,237,0.35)] transition-all whitespace-nowrap shrink-0 cursor-pointer active:scale-[0.98]"
                >
                  <Wand2 className="w-4 h-4" />
                  <span>Open Photo Studio</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('video')}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-amber-400/30 text-amber-200 text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Film className="w-4 h-4 text-amber-300" />
                  <span>Open Video Studio</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/15 text-slate-100 text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-violet-300" />
                  <span>Import Photo</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span>RGB &amp; HSL Matrix</span>
                <span aria-hidden="true">·</span>
                <span>30 Cinema LUTs</span>
                <span aria-hidden="true">·</span>
                <span>Multi-Track Video</span>
                <span aria-hidden="true">·</span>
                <span>4K WebM Export</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 relative min-h-[240px] lg:min-h-[340px] overflow-hidden border-t lg:border-t-0 lg:border-l border-white/10">
            <img
              src={STUDIO_ASSETS[0].url}
              alt="DIPTI EDITOR Studio Portrait Showcase"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#06070B]/95 via-transparent to-[#06070B]/20" />
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-amber-300">Featured Studio Frame</p>
                <p className="text-sm font-semibold text-white">Obsidian Rim Portrait</p>
              </div>
              <button
                type="button"
                onClick={() => onImportImageForTool(STUDIO_ASSETS[0].url, 'photo')}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-black/70 hover:bg-black/85 backdrop-blur-md border border-amber-400/35 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Edit Frame</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-amber-300" />
              </button>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Flagship Photo Studio & Video Studio Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
        <button
          type="button"
          onClick={() => onNavigate('photo')}
          className="group text-left rounded-2xl bg-gradient-to-br from-[#140F24]/90 to-[#090B14]/95 backdrop-blur-xl border border-violet-400/25 hover:border-amber-400/50 overflow-hidden transition-all duration-200 cursor-pointer flex flex-col sm:flex-row min-h-[156px]"
        >
          <div className="relative sm:w-44 aspect-[16/10] sm:aspect-auto shrink-0 overflow-hidden bg-[#060812]">
            <img
              src={STUDIO_ASSETS[0].url}
              alt="Photo Studio"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            />
            <div className="absolute inset-0 bg-gradient-to-t sm:bg-gradient-to-r from-[#0F0C1D]/90 via-transparent to-transparent" />
            <div className="absolute top-3 left-3 w-9 h-9 rounded-xl bg-[#06070B]/85 backdrop-blur-md border border-violet-400/35 flex items-center justify-center">
              <Sliders className="w-4 h-4 text-violet-300" />
            </div>
          </div>
          <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-amber-300">Primary Workspace</span>
                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-amber-300 transition-colors" />
              </div>
              <h2 className="font-display text-lg sm:text-xl font-bold text-white mt-1">
                Photo Studio
              </h2>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Crop, flip, exposure, highlights &amp; shadows, RGB/HSL grading, 30 filters, blur/sharpen, vignette &amp; before/after split.
              </p>
            </div>
            <p className="text-[11px] font-mono-tabular text-violet-300 pt-2 border-t border-white/[0.08]">
              RAW Tone · RGB/HSL · 30 Filters · Undo/Redo
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('video')}
          className="group text-left rounded-2xl bg-gradient-to-br from-[#16121A]/90 to-[#090B14]/95 backdrop-blur-xl border border-amber-400/25 hover:border-amber-400/60 overflow-hidden transition-all duration-200 cursor-pointer flex flex-col sm:flex-row min-h-[156px]"
        >
          <div className="relative sm:w-44 aspect-[16/10] sm:aspect-auto shrink-0 overflow-hidden bg-[#060812]">
            <img
              src={STUDIO_ASSETS[4].url}
              alt="Video Studio"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            />
            <div className="absolute inset-0 bg-gradient-to-t sm:bg-gradient-to-r from-[#120E18]/90 via-transparent to-transparent" />
            <div className="absolute top-3 left-3 w-9 h-9 rounded-xl bg-[#06070B]/85 backdrop-blur-md border border-amber-400/35 flex items-center justify-center">
              <Play className="w-4 h-4 text-amber-300" />
            </div>
          </div>
          <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-amber-300">Motion Timeline</span>
                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-amber-300 transition-colors" />
              </div>
              <h2 className="font-display text-lg sm:text-xl font-bold text-white mt-1">
                Video Studio
              </h2>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Trim &amp; split clips, merge reels, stack text &amp; visual overlay tracks, mix audio, speed ramp, and export 720p/1080p/4K.
              </p>
            </div>
            <p className="text-[11px] font-mono-tabular text-amber-300 pt-2 border-t border-white/[0.08]">
              Multi-Track · Overlays · Audio Mix · 4K WebM
            </p>
          </div>
        </button>
      </section>

      {/* Quick Editing Tools */}
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-white tracking-tight">
              Quick Editing Tools
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Jump directly into core adjustments and mobile-ready studio actions.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {QUICK_TOOLS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              onClick={() => onNavigate(tool.target)}
              className="group min-h-[68px] p-3.5 rounded-2xl bg-[#0B0D16]/85 backdrop-blur-xl border border-white/[0.08] hover:border-amber-400/45 hover:-translate-y-0.5 text-left flex flex-col justify-between gap-2 transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center">
                  {tool.icon}
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-300 transition-colors" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white truncate">{tool.label}</p>
                <p className="text-[11px] text-slate-400 truncate">{tool.sublabel}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Featured Effects */}
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-white tracking-tight">
              Featured Effects
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Tap any signature color look to launch it immediately in Photo Studio.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('filters')}
            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs font-medium text-amber-300 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>All 30 Filters</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {FEATURED_EFFECT_CARDS.map((card) => {
            const preset = FILTER_PRESETS.find((f) => f.id === card.presetId);
            if (!preset) return null;
            return (
              <button
                key={card.presetId}
                type="button"
                onClick={() => handleEffectSelect(card.presetId)}
                className="group text-left rounded-2xl bg-[#0B0D16]/85 backdrop-blur-xl border border-white/[0.08] hover:border-amber-400/50 overflow-hidden transition-all cursor-pointer"
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#06070B]">
                  <img
                    src={card.previewUrl}
                    alt={preset.name}
                    referrerPolicy="no-referrer"
                    style={{ filter: card.cssFilter }}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#06070B]/95 via-transparent to-transparent" />
                  <span
                    className="absolute top-2.5 right-2.5 w-3 h-3 rounded-full border border-white/40"
                    style={{ backgroundColor: preset.accentColor }}
                  />
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-white truncate">{preset.name}</p>
                    <ArrowUpRight className="w-3.5 h-3.5 text-amber-300 opacity-75 group-hover:opacity-100 shrink-0" />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 truncate">{card.tagline}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Main 6 Creative Studios Grid */}
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white tracking-tight">
              Studio Workspaces
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Select a dedicated workspace to begin editing media.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
          {STUDIO_FEATURES.map((feature) => (
            <button
              key={feature.id}
              type="button"
              onClick={() => onNavigate(feature.id)}
              className={`group text-left rounded-2xl bg-[#0B1020]/75 backdrop-blur-xl border border-white/[0.08] overflow-hidden transition-all duration-200 cursor-pointer flex flex-col ${ACCENT_RING[feature.accent]}`}
            >
              <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#060812]">
                <img
                  src={feature.thumbnail}
                  alt={feature.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0B1020] via-[#0B1020]/20 to-transparent" />
                <div className="absolute top-3 left-3 w-9 h-9 rounded-xl bg-[#06070B]/80 backdrop-blur-md border border-white/15 flex items-center justify-center">
                  {FEATURE_ICONS[feature.id]}
                </div>
                <div className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-[#06070B]/70 backdrop-blur-md border border-white/10 flex items-center justify-center opacity-75 group-hover:opacity-100 group-hover:border-amber-400/40 transition-all">
                  <ArrowUpRight className="w-4 h-4 text-white" />
                </div>
              </div>

              <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between gap-3">
                <div>
                  <h3 className="font-display text-base sm:text-lg font-bold text-white group-hover:text-amber-200 transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed">
                    {feature.subtitle}
                  </p>
                </div>
                <p className="text-[11px] font-mono-tabular text-slate-400 pt-2 border-t border-white/[0.06]">
                  {feature.specLine}
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Creative Studio & Pro VFX Suites */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white tracking-tight">
              Creative Studio &amp; VFX Suites
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Design templates, 3D text, stickers &amp; overlays, color grading, VFX timelines, and AI retouching.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {CREATIVE_STUDIO_CARDS.map((studio) => (
            <button
              key={studio.id}
              type="button"
              onClick={() => onNavigate(studio.id)}
              className={`group text-left rounded-2xl bg-[#0B1020]/80 backdrop-blur-xl border border-white/[0.08] overflow-hidden transition-all duration-200 cursor-pointer flex flex-col sm:flex-row ${ACCENT_RING[studio.accent]}`}
            >
              <div className="relative sm:w-44 md:w-48 aspect-[16/10] sm:aspect-auto shrink-0 overflow-hidden bg-[#060812]">
                <img
                  src={studio.thumbnail}
                  alt={studio.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                />
                <div className="absolute inset-0 bg-gradient-to-t sm:bg-gradient-to-r from-[#0B1020]/80 via-transparent to-transparent" />
                <div className="absolute top-3 left-3 w-9 h-9 rounded-xl bg-[#06070B]/85 backdrop-blur-md border border-white/15 flex items-center justify-center">
                  {FEATURE_ICONS[studio.id]}
                </div>
              </div>

              <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[11px] font-mono-tabular ${
                        studio.usesExternalAiApi ? 'text-violet-300' : 'text-amber-300'
                      }`}
                    >
                      {studio.badgeLabel}
                    </span>
                    <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors shrink-0" />
                  </div>
                  <h3 className="font-display text-base sm:text-lg font-bold text-white group-hover:text-amber-200 transition-colors mt-1">
                    {studio.title}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    {studio.subtitle}
                  </p>
                </div>
                <p className="text-[11px] font-mono-tabular text-slate-400 pt-2 border-t border-white/[0.06]">
                  {studio.specLine}
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Bottom Workspace Row: Recent Projects & Settings */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 rounded-2xl bg-[#0B1020]/75 backdrop-blur-xl border border-white/[0.08] p-5 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-400/25 flex items-center justify-center">
                <FolderOpen className="w-5 h-5 text-violet-300" />
              </div>
              <div>
                <h2 className="font-display text-lg font-bold text-white">Recent Projects</h2>
                <p className="text-xs text-slate-400 font-mono-tabular">
                  {projects.length} saved studio {projects.length === 1 ? 'session' : 'sessions'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('projects')}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Manage All</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-amber-300" />
            </button>
          </div>

          {projects.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-white/10 rounded-xl">
              No saved projects yet. Save any photo or video edit from a studio to revisit it here.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {projects.slice(0, 3).map((proj) => (
                <button
                  key={proj.id}
                  type="button"
                  onClick={() => onOpenProject(proj)}
                  className="group text-left rounded-xl bg-[#070A14] border border-white/[0.07] hover:border-amber-400/45 overflow-hidden transition-colors cursor-pointer"
                >
                  <div className="aspect-[16/10] w-full overflow-hidden bg-slate-950">
                    <img
                      src={proj.thumbnailDataUrl}
                      alt={proj.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                    />
                  </div>
                  <div className="p-2.5">
                    <p className="text-xs font-semibold text-white truncate">{proj.name}</p>
                    <p className="text-[11px] text-slate-400 font-mono-tabular mt-0.5 truncate">
                      {PROJECT_TOOL_BADGE[proj.tool]} · {proj.width}×{proj.height}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onNavigate('settings')}
          className="lg:col-span-4 text-left rounded-2xl bg-[#0B1020]/75 backdrop-blur-xl border border-white/[0.08] hover:border-amber-400/40 p-5 flex flex-col justify-between gap-4 transition-all cursor-pointer group"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-400/25 flex items-center justify-center">
              <Settings className="w-5 h-5 text-amber-300" />
            </div>
            <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-amber-300 transition-colors" />
          </div>
          <div className="space-y-1.5">
            <h2 className="font-display text-lg font-bold text-white">Settings</h2>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              Configure export format (PNG / JPEG / WebP), upscale defaults, canvas guides, and local project storage.
            </p>
          </div>
          <p className="text-[11px] font-mono-tabular text-amber-300/90 pt-2 border-t border-white/[0.06]">
            Export Pipeline · Workspace Guides · Storage
          </p>
        </button>
      </section>
    </div>
  );
};
