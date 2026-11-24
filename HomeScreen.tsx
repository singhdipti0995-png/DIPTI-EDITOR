import { useState } from 'react';
import {
  ArrowRight,
  Captions,
  Eraser,
  Film,
  Layers,
  Music,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Type as TypeIcon,
  Wand2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { HERO_BANNER_IMAGE } from '../../db/projectsStore';
import type {
  AiToolMode,
  PhotoToolMode,
  StudioProject,
  VideoToolMode,
} from '../../types/editor';

interface HomeScreenProps {
  projects: StudioProject[];
  onStartCreating: () => void;
  onOpenPhotoTool: (tool: PhotoToolMode) => void;
  onOpenVideoTool: (tool: VideoToolMode) => void;
  onOpenAiTool: (tool: AiToolMode) => void;
  onOpenProject: (project: StudioProject) => void;
}

const PHOTO_TOOLS: {
  id: PhotoToolMode;
  title: string;
  subtitle: string;
  icon: typeof Wand2;
  accent: string;
}[] = [
  {
    id: 'enhance',
    title: 'AI Enhance',
    subtitle: 'Auto-levels & clarity',
    icon: Wand2,
    accent: 'from-[#d4af37]/25 to-[#d4af37]/5 text-[#f3d478] border-[#d4af37]/30',
  },
  {
    id: 'bg-remove',
    title: 'Background Remover',
    subtitle: 'Clean alpha cutout',
    icon: Layers,
    accent: 'from-[#3b82f6]/25 to-[#3b82f6]/5 text-blue-300 border-[#3b82f6]/30',
  },
  {
    id: 'filters',
    title: 'Filters',
    subtitle: '7 cinematic LUTs',
    icon: Sparkles,
    accent: 'from-[#8b5cf6]/25 to-[#8b5cf6]/5 text-violet-300 border-[#8b5cf6]/30',
  },
  {
    id: 'effects',
    title: 'Effects',
    subtitle: 'Tone, vignette & grain',
    icon: SlidersHorizontal,
    accent: 'from-amber-400/20 to-violet-500/10 text-amber-200 border-amber-300/25',
  },
];

const VIDEO_TOOLS: {
  id: VideoToolMode;
  title: string;
  subtitle: string;
  icon: typeof Scissors;
  accent: string;
}[] = [
  {
    id: 'trim',
    title: 'Trim',
    subtitle: 'Frame-accurate range',
    icon: Scissors,
    accent: 'from-[#3b82f6]/25 to-[#3b82f6]/5 text-blue-300 border-[#3b82f6]/30',
  },
  {
    id: 'music',
    title: 'Music',
    subtitle: 'Original studio score',
    icon: Music,
    accent: 'from-[#d4af37]/25 to-[#d4af37]/5 text-[#f3d478] border-[#d4af37]/30',
  },
  {
    id: 'transitions',
    title: 'Transitions',
    subtitle: 'Dissolve, wipe & zoom',
    icon: Film,
    accent: 'from-[#8b5cf6]/25 to-[#8b5cf6]/5 text-violet-300 border-[#8b5cf6]/30',
  },
  {
    id: 'captions',
    title: 'Auto Captions',
    subtitle: 'Timed AI subtitles',
    icon: Captions,
    accent: 'from-blue-500/25 to-violet-500/10 text-sky-200 border-blue-400/25',
  },
];

const AI_TOOLS: {
  id: AiToolMode;
  title: string;
  subtitle: string;
  icon: typeof Eraser;
}[] = [
  {
    id: 'object-remover',
    title: 'Object Remover',
    subtitle: 'Paint mask to seamlessly inpaint unwanted elements',
    icon: Eraser,
  },
  {
    id: 'ai-effects',
    title: 'AI Effects',
    subtitle: 'Duotone gold, prism split, bloom & infrared passes',
    icon: Sparkles,
  },
  {
    id: 'text-to-image',
    title: 'Text to Image',
    subtitle: 'Compose luxury generative scenes from natural prompts',
    icon: TypeIcon,
  },
];

export function HomeScreen({
  projects,
  onStartCreating,
  onOpenPhotoTool,
  onOpenVideoTool,
  onOpenAiTool,
  onOpenProject,
}: HomeScreenProps) {
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [failedThumbIds, setFailedThumbIds] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-8">
      {/* 1. Large Cinematic AI Magic Studio Hero Banner */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="relative rounded-3xl overflow-hidden glass-gold-edge min-h-[260px] sm:min-h-[320px] flex items-end"
      >
        {!heroImgFailed ? (
          <img
            src={HERO_BANNER_IMAGE}
            alt="DIPTI EDITOR AI Magic Studio prism refraction"
            referrerPolicy="no-referrer"
            onError={() => setHeroImgFailed(true)}
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-br from-[#0e1738] via-[#1b1140] to-[#050814]"
          />
        )}

        {/* Measured scrim for crisp editorial contrast */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-[#03050a] via-[#03050a]/72 to-[#03050a]/20"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-[#03050a]/88 via-[#03050a]/45 to-transparent"
        />

        <div className="relative z-10 w-full p-6 sm:p-9 lg:p-11 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#e6c565] mb-2">
              AI Magic Studio
            </p>
            <h1 className="font-display text-3xl sm:text-5xl font-semibold text-white tracking-tight leading-[1.06]">
              Craft cinema-grade visuals in moments.
            </h1>
            <p className="text-sm sm:text-base text-slate-300 mt-3 max-w-lg leading-relaxed">
              Precision RAW color grading, lossless timeline cutting, and generative AI synthesis engineered for creators.
            </p>
          </div>

          <button
            type="button"
            onClick={onStartCreating}
            className="min-h-[48px] px-6 py-3 rounded-2xl bg-gradient-to-r from-[#e5c158] via-[#d4af37] to-[#b88f21] text-[#050811] font-semibold text-sm inline-flex items-center justify-center gap-2.5 shadow-lg shadow-[#d4af37]/20 hover:brightness-110 active:scale-[0.98] transition-all whitespace-nowrap shrink-0 self-start sm:self-end"
          >
            <Sparkles className="w-4 h-4" />
            <span>Start Creating</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </motion.section>

      {/* 2. Photo Editor & Video Editor Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Photo Editor */}
        <section className="glass-surface rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white tracking-tight">Photo Editor</h2>
              <p className="text-xs text-slate-400 mt-0.5">Color grading, alpha cutout & tone curves</p>
            </div>
            <button
              type="button"
              onClick={() => onOpenPhotoTool('enhance')}
              className="min-h-[40px] px-3 rounded-xl text-xs font-medium text-[#e6c565] hover:bg-white/[0.05] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>Open Studio</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {PHOTO_TOOLS.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => onOpenPhotoTool(tool.id)}
                  className="group min-h-[88px] rounded-2xl bg-[#070b18]/90 hover:bg-[#0c1328] border border-white/[0.07] hover:border-[#d4af37]/40 p-3.5 text-left transition-all flex flex-col justify-between gap-2.5"
                >
                  <span
                    className={`w-9 h-9 rounded-xl bg-gradient-to-br border flex items-center justify-center shrink-0 ${tool.accent}`}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-100 group-hover:text-white leading-snug">
                      {tool.title}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5 leading-snug">{tool.subtitle}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Video Editor */}
        <section className="glass-surface rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white tracking-tight">Video Editor</h2>
              <p className="text-xs text-slate-400 mt-0.5">Timeline trim, audio score & smart captions</p>
            </div>
            <button
              type="button"
              onClick={() => onOpenVideoTool('trim')}
              className="min-h-[40px] px-3 rounded-xl text-xs font-medium text-blue-300 hover:bg-white/[0.05] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>Open Timeline</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {VIDEO_TOOLS.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => onOpenVideoTool(tool.id)}
                  className="group min-h-[88px] rounded-2xl bg-[#070b18]/90 hover:bg-[#0c1328] border border-white/[0.07] hover:border-[#3b82f6]/45 p-3.5 text-left transition-all flex flex-col justify-between gap-2.5"
                >
                  <span
                    className={`w-9 h-9 rounded-xl bg-gradient-to-br border flex items-center justify-center shrink-0 ${tool.accent}`}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-100 group-hover:text-white leading-snug">
                      {tool.title}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5 leading-snug">{tool.subtitle}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* 3. AI Tools Section */}
      <section className="space-y-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white tracking-tight">AI Tools</h2>
            <p className="text-xs text-slate-400 mt-0.5">Intelligent retouching & generative creation</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenAiTool('text-to-image')}
            className="min-h-[40px] px-3 rounded-xl text-xs font-medium text-violet-300 hover:bg-white/[0.05] inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <span>Explore AI Studio</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {AI_TOOLS.map((tool, index) => {
            const Icon = tool.icon;
            const gradientEdge =
              index === 0
                ? 'hover:border-[#d4af37]/45'
                : index === 1
                ? 'hover:border-[#8b5cf6]/50'
                : 'hover:border-[#3b82f6]/50';
            const iconBox =
              index === 0
                ? 'from-[#d4af37]/25 to-[#8b5cf6]/10 text-[#f3d478] border-[#d4af37]/30'
                : index === 1
                ? 'from-[#8b5cf6]/25 to-[#3b82f6]/10 text-violet-300 border-[#8b5cf6]/35'
                : 'from-[#3b82f6]/25 to-[#d4af37]/10 text-blue-300 border-[#3b82f6]/35';

            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => onOpenAiTool(tool.id)}
                className={`group glass-surface rounded-2xl p-5 text-left transition-all ${gradientEdge} flex items-start gap-4 min-h-[104px]`}
              >
                <span
                  className={`w-11 h-11 rounded-2xl bg-gradient-to-br border flex items-center justify-center shrink-0 ${iconBox}`}
                >
                  <Icon className="w-5 h-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold text-slate-100 group-hover:text-white">
                      {tool.title}
                    </h3>
                    <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-[#d4af37] transition-colors shrink-0" />
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{tool.subtitle}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 4. Recent Projects Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white tracking-tight">Recent Projects</h2>
            <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
              {projects.length} saved studio timelines & canvases
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {projects.slice(0, 8).map((project) => {
            const thumbFailed = failedThumbIds[project.id];
            return (
              <button
                key={project.id}
                type="button"
                onClick={() => onOpenProject(project)}
                className="group glass-surface rounded-2xl overflow-hidden text-left hover:border-[#d4af37]/40 transition-all flex flex-col"
              >
                <div className="aspect-[4/3] w-full bg-[#090f22] relative overflow-hidden">
                  {!thumbFailed ? (
                    <img
                      src={project.thumbnailUrl}
                      alt={project.title}
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setFailedThumbIds((prev) => ({ ...prev, [project.id]: true }))
                      }
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-[#121a38] via-[#1f1244] to-[#080d1b] flex items-center justify-center">
                      <Sparkles className="w-7 h-7 text-[#d4af37]/60" />
                    </div>
                  )}
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-t from-[#03050a]/80 via-transparent to-transparent"
                  />
                </div>

                <div className="p-3.5 space-y-1 flex-1 flex flex-col justify-between">
                  <p className="text-sm font-semibold text-slate-100 group-hover:text-[#f4d47c] transition-colors truncate">
                    {project.title}
                  </p>
                  <p className="text-xs text-slate-400 tabular-nums truncate">
                    {project.kind} · {project.dimensions} · {project.updatedLabel}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Quiet Signature Attribution Footer */}
      <footer className="pt-4 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
        <span>DIPTI EDITOR · Creative Suite</span>
        <span>Crafted & Developed by DIPTI SINGH</span>
      </footer>
    </div>
  );
}
