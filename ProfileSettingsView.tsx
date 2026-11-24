import { Award, Film, Image as ImageIcon, Settings, Sparkles } from 'lucide-react';
import type { EditorSettings, StudioProject } from '../../types/editor';

interface ProfileSettingsViewProps {
  settings: EditorSettings;
  projects: StudioProject[];
  onOpenSettings: () => void;
  onOpenProject: (project: StudioProject) => void;
}

export function ProfileSettingsView({
  settings,
  projects,
  onOpenSettings,
  onOpenProject,
}: ProfileSettingsViewProps) {
  const photoCount = projects.filter((p) => p.kind === 'Photo').length;
  const videoCount = projects.filter((p) => p.kind === 'Video').length;
  const aiCount = projects.filter((p) => p.kind === 'AI Art').length;

  const initials = settings.creatorName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || 'DS';

  return (
    <div className="space-y-6">
      {/* Creator Luxury Hero Card */}
      <section className="glass-gold-edge rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-[#e5c158] via-[#8b5cf6] to-[#3b82f6] p-[2px] shrink-0">
            <div className="w-full h-full rounded-[14px] bg-[#060914] flex items-center justify-center font-display text-2xl sm:text-3xl font-semibold text-[#f3d478]">
              {initials}
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#d4af37] font-semibold">
              Creator & Developer
            </p>
            <h1 className="font-display text-3xl sm:text-4xl font-semibold text-white mt-0.5">
              {settings.creatorName}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1">{settings.studioTagline}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenSettings}
          className="min-h-[46px] px-5 rounded-2xl bg-white/[0.07] hover:bg-white/[0.12] border border-[#d4af37]/35 text-sm font-semibold text-amber-100 inline-flex items-center justify-center gap-2 self-start sm:self-center whitespace-nowrap"
        >
          <Settings className="w-4 h-4 text-[#d4af37]" />
          <span>Edit Studio Preferences</span>
        </button>
      </section>

      {/* Studio Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-surface rounded-2xl p-5 flex items-center gap-4">
          <span className="w-11 h-11 rounded-xl bg-[#d4af37]/15 border border-[#d4af37]/30 text-[#f3d478] flex items-center justify-center">
            <ImageIcon className="w-5 h-5" />
          </span>
          <div>
            <p className="text-xs text-slate-400">Photo Projects</p>
            <p className="text-2xl font-semibold text-white tabular-nums">{photoCount}</p>
          </div>
        </div>

        <div className="glass-surface rounded-2xl p-5 flex items-center gap-4">
          <span className="w-11 h-11 rounded-xl bg-[#3b82f6]/15 border border-[#3b82f6]/30 text-blue-300 flex items-center justify-center">
            <Film className="w-5 h-5" />
          </span>
          <div>
            <p className="text-xs text-slate-400">Video Timelines</p>
            <p className="text-2xl font-semibold text-white tabular-nums">{videoCount}</p>
          </div>
        </div>

        <div className="glass-surface rounded-2xl p-5 flex items-center gap-4">
          <span className="w-11 h-11 rounded-xl bg-[#8b5cf6]/15 border border-[#8b5cf6]/30 text-violet-300 flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </span>
          <div>
            <p className="text-xs text-slate-400">AI Studio Works</p>
            <p className="text-2xl font-semibold text-white tabular-nums">{aiCount}</p>
          </div>
        </div>
      </div>

      {/* Saved Studio Archive */}
      <section className="glass-surface rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Studio Library</h2>
            <p className="text-xs text-slate-400 mt-0.5">Tap any project to resume editing</p>
          </div>
          <span className="text-xs text-slate-400 tabular-nums">
            Export: {settings.exportResolution.toUpperCase()} · {settings.exportFormat.toUpperCase()}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpenProject(p)}
              className="p-3 rounded-2xl bg-[#050814]/90 border border-white/[0.07] hover:border-[#d4af37]/40 flex items-center gap-3.5 text-left transition-colors"
            >
              <img
                src={p.thumbnailUrl}
                alt={p.title}
                referrerPolicy="no-referrer"
                className="w-16 h-12 rounded-xl object-cover bg-[#0b1224] shrink-0"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-100 truncate">{p.title}</p>
                <p className="text-xs text-slate-400 truncate tabular-nums">
                  {p.kind} · {p.dimensions}
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* About Attribution */}
      <section className="glass-surface rounded-2xl p-5 flex items-center gap-4">
        <span className="w-10 h-10 rounded-xl bg-[#d4af37]/15 border border-[#d4af37]/30 text-[#d4af37] flex items-center justify-center shrink-0">
          <Award className="w-5 h-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-white">DIPTI EDITOR</p>
          <p className="text-xs text-slate-400">
            Designed & Developed by DIPTI SINGH · Responsive Android & Tablet Creative Suite
          </p>
        </div>
      </section>
    </div>
  );
}
