import React, { useState } from 'react';
import {
  FolderOpen,
  Search,
  Trash2,
  ArrowUpRight,
  Pencil,
  Check,
  X,
  Copy,
  History,
  RotateCcw,
  HardDrive,
  Download,
  Film,
  Image as ImageIcon,
  Undo2,
} from 'lucide-react';
import {
  ExportRecord,
  ProjectHistoryEntry,
  ProjectItem,
  StorageUsageStats,
  StudioToolId,
} from '../../types/editor';
import { formatBytes } from '../../utils/indexedDbStorage';

interface ProjectsViewProps {
  projects: ProjectItem[];
  projectHistory: ProjectHistoryEntry[];
  exportHistory: ExportRecord[];
  storageStats: StorageUsageStats;
  onOpenProject: (project: ProjectItem) => void;
  onRestoreRevision: (entry: ProjectHistoryEntry) => void;
  onRenameProject: (id: string, newName: string) => void;
  onDuplicateProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onClearHistory: () => void;
  onClearExports: () => void;
  onClearAllProjects: () => void;
  onNavigate: (tool: StudioToolId) => void;
}

const TOOL_LABELS: Record<ProjectItem['tool'], string> = {
  photo: 'AI Photo Editor',
  video: 'Video Editor',
  'portrait-studio': 'AI Portrait & Filter Studio',
  'dslr-studio': 'DSLR Portrait & BG Studio',
  'photo-restoration': 'Photo Restoration Studio',
  'bg-remover': 'AI Background Remover Studio',
  enhancer: 'Image Enhancer',
  filters: 'Filters & Effects',
  text: 'Text & Fonts',
  'ai-retouch': 'AI Creative Studio',
  'cinema-fx': 'Cinema Color & FX',
  'design-studio': 'Typography & Motion',
  'motion-vfx': 'Pro Motion & VFX',
  'hd-quality': 'HD Quality Engine',
  'color-grading': 'Color Grading Studio',
  'preset-library': 'Custom Preset Library',
  'batch-editor': 'Batch Photo Editor',
};

type ProjectCategoryFilter = 'all' | 'photo-cat' | 'video-cat' | 'creative-cat';

function matchesCategory(tool: ProjectItem['tool'], cat: ProjectCategoryFilter): boolean {
  if (cat === 'all') return true;
  if (cat === 'video-cat') return tool === 'video' || tool === 'motion-vfx';
  if (cat === 'photo-cat') {
    return (
      tool === 'photo' ||
      tool === 'portrait-studio' ||
      tool === 'dslr-studio' ||
      tool === 'photo-restoration' ||
      tool === 'bg-remover' ||
      tool === 'enhancer' ||
      tool === 'filters' ||
      tool === 'cinema-fx' ||
      tool === 'hd-quality' ||
      tool === 'color-grading' ||
      tool === 'preset-library' ||
      tool === 'batch-editor'
    );
  }
  return tool === 'ai-retouch' || tool === 'design-studio' || tool === 'text';
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  projects,
  projectHistory,
  exportHistory,
  storageStats,
  onOpenProject,
  onRestoreRevision,
  onRenameProject,
  onDuplicateProject,
  onDeleteProject,
  onClearHistory,
  onClearExports,
  onClearAllProjects,
  onNavigate,
}) => {
  const [sectionTab, setSectionTab] = useState<'projects' | 'history' | 'exports' | 'storage'>('projects');
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ProjectCategoryFilter>('all');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [historyProjectFilter, setHistoryProjectFilter] = useState<string | null>(null);
  const [confirmResetAll, setConfirmResetAll] = useState(false);

  const filtered = projects.filter((p) => {
    const matchesCat = matchesCategory(p.tool, categoryFilter);
    const matchesQuery =
      !query.trim() || p.name.toLowerCase().includes(query.trim().toLowerCase());
    return matchesCat && matchesQuery;
  });

  const visibleHistory = historyProjectFilter
    ? projectHistory.filter((h) => h.projectId === historyProjectFilter)
    : projectHistory;

  const totalDbBytes =
    storageStats.projectsBytes + storageStats.historyBytes + storageStats.exportsBytes;

  return (
    <div className="space-y-5 pb-24 lg:pb-8">
      {/* Top Manager Navigation Tabs */}
      <div className="rounded-2xl bg-[#0B0D16]/90 border border-amber-400/20 p-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {(
            [
              { id: 'projects', label: `Projects (${projects.length})`, icon: <FolderOpen className="w-3.5 h-3.5" /> },
              { id: 'history', label: `Revision History (${projectHistory.length})`, icon: <History className="w-3.5 h-3.5" /> },
              { id: 'exports', label: `Export History (${exportHistory.length})`, icon: <Download className="w-3.5 h-3.5" /> },
              { id: 'storage', label: 'Local Storage', icon: <HardDrive className="w-3.5 h-3.5" /> },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSectionTab(t.id)}
              className={`min-h-[42px] px-3.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-all ${
                sectionTab === t.id
                  ? 'bg-gradient-to-r from-violet-600/35 to-amber-500/20 border-amber-400/65 text-white'
                  : 'bg-[#06070B] border-white/10 text-slate-400 hover:text-white'
              }`}
            >
              <span className={sectionTab === t.id ? 'text-amber-300' : 'text-slate-400'}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="min-h-[42px] px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/15 text-xs font-medium text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Gallery Settings
          </button>
          <button
            type="button"
            onClick={() => onNavigate('export-center')}
            className="min-h-[42px] px-4 rounded-xl bg-gradient-to-r from-violet-600 to-amber-500 hover:brightness-110 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Open Export Center</span>
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-400 px-1">
        Editable project files and timelines stay organized here in <strong className="text-white">My Projects</strong> (IndexedDB), separate from final exported photos and videos saved to your device Gallery.
      </p>

      {/* 1. PROJECTS GRID + CATEGORIES */}
      {sectionTab === 'projects' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl bg-[#0B1020]/80 border border-white/10 p-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search saved projects..."
                className="w-full min-h-[44px] pl-10 pr-4 rounded-xl bg-[#060812] border border-white/10 focus:border-amber-400/60 outline-none text-sm text-white placeholder:text-slate-500"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {(
                [
                  { id: 'all', label: 'All Projects' },
                  { id: 'photo-cat', label: 'Photo Projects' },
                  { id: 'video-cat', label: 'Video Projects' },
                  { id: 'creative-cat', label: 'Creative & Design' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCategoryFilter(tab.id)}
                  className={`min-h-[40px] px-3.5 rounded-xl border text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                    categoryFilter === tab.id
                      ? 'bg-violet-500/25 border-amber-400/60 text-white'
                      : 'bg-[#060812] border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-3xl bg-[#0B1020]/70 border border-white/10 p-10 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/15 border border-violet-400/30 flex items-center justify-center mx-auto">
                <FolderOpen className="w-6 h-6 text-violet-300" />
              </div>
              <div className="space-y-1">
                <h3 className="font-display text-lg font-bold text-white">No matching projects</h3>
                <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
                  Start an edit in Photo Studio, Video Studio, or AI Creative Studio to persist your work in IndexedDB.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('photo')}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-amber-500 text-xs sm:text-sm font-semibold text-white inline-flex items-center gap-2 cursor-pointer"
              >
                <span>Open AI Photo Editor</span>
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {filtered.map((project) => (
                <div
                  key={project.id}
                  className="rounded-2xl bg-[#0B0D16]/90 border border-white/[0.08] hover:border-amber-400/30 overflow-hidden flex flex-col justify-between group transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => onOpenProject(project)}
                    className="text-left cursor-pointer flex-1"
                  >
                    <div className="aspect-[16/10] w-full overflow-hidden bg-[#04060A]">
                      <img
                        src={project.thumbnailDataUrl}
                        alt={project.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                      />
                    </div>
                    <div className="p-4 space-y-1.5">
                      <h3 className="font-display text-base font-bold text-white truncate">
                        {project.name}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono-tabular">
                        <span>{TOOL_LABELS[project.tool]}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {project.width}×{project.height}
                        </span>
                        {typeof project.undoSteps === 'number' && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-amber-300 inline-flex items-center gap-1">
                              <Undo2 className="w-3 h-3" />
                              {project.undoSteps} steps
                            </span>
                          </>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 font-mono-tabular">
                        {project.autoSaved ? 'Auto-saved' : 'Saved'} · {new Date(project.updatedAt).toLocaleString()}
                      </p>
                    </div>
                  </button>

                  <div className="px-4 py-3 border-t border-white/[0.06] space-y-2">
                    {renamingId === project.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && renameValue.trim()) {
                              onRenameProject(project.id, renameValue);
                              setRenamingId(null);
                            }
                          }}
                          className="flex-1 min-w-0 min-h-[38px] px-2.5 rounded-lg bg-[#060812] border border-amber-400/60 outline-none text-xs text-white"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (renameValue.trim()) onRenameProject(project.id, renameValue);
                            setRenamingId(null);
                          }}
                          className="min-h-[38px] min-w-[38px] rounded-lg bg-amber-500 text-black flex items-center justify-center cursor-pointer"
                          aria-label="Save rename"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenamingId(null)}
                          className="min-h-[38px] min-w-[38px] rounded-lg bg-white/10 text-slate-300 flex items-center justify-center cursor-pointer"
                          aria-label="Cancel rename"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenProject(project)}
                        className="min-h-[40px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>Restore &amp; Edit</span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-amber-300" />
                      </button>

                      {pendingDeleteId === project.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteProject(project.id);
                              setPendingDeleteId(null);
                            }}
                            className="min-h-[38px] px-2.5 rounded-lg bg-rose-600 text-xs font-semibold text-white cursor-pointer"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDeleteId(null)}
                            className="min-h-[38px] px-2.5 rounded-lg bg-white/10 text-xs text-slate-300 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setHistoryProjectFilter(project.id);
                              setSectionTab('history');
                            }}
                            className="min-h-[38px] min-w-[38px] rounded-lg hover:bg-violet-500/15 text-slate-400 hover:text-violet-300 flex items-center justify-center cursor-pointer"
                            aria-label="View project history"
                            title="Project History"
                          >
                            <History className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDuplicateProject(project.id)}
                            className="min-h-[38px] min-w-[38px] rounded-lg hover:bg-sky-500/15 text-slate-400 hover:text-sky-300 flex items-center justify-center cursor-pointer"
                            aria-label="Duplicate project"
                            title="Duplicate"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingId(project.id);
                              setRenameValue(project.name);
                            }}
                            className="min-h-[38px] min-w-[38px] rounded-lg hover:bg-amber-400/15 text-slate-400 hover:text-amber-300 flex items-center justify-center cursor-pointer"
                            aria-label="Rename project"
                            title="Rename"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDeleteId(project.id)}
                            className="min-h-[38px] min-w-[38px] rounded-lg hover:bg-rose-500/15 text-slate-400 hover:text-rose-300 flex items-center justify-center cursor-pointer"
                            aria-label="Delete project"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* 2. PROJECT REVISION HISTORY & RESTORE */}
      {sectionTab === 'history' && (
        <div className="rounded-2xl bg-[#0B0D16]/90 border border-white/10 p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-bold text-white">Project Revision History</h3>
              <p className="text-xs text-slate-400">
                Restore any prior saved or auto-saved snapshot from IndexedDB.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {historyProjectFilter && (
                <button
                  type="button"
                  onClick={() => setHistoryProjectFilter(null)}
                  className="min-h-[38px] px-3 rounded-xl bg-white/[0.06] border border-white/15 text-xs text-slate-200 cursor-pointer"
                >
                  Show All Projects
                </button>
              )}
              {projectHistory.length > 0 && (
                <button
                  type="button"
                  onClick={onClearHistory}
                  className="min-h-[38px] px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-400/30 text-xs font-semibold text-rose-200 cursor-pointer"
                >
                  Clear History
                </button>
              )}
            </div>
          </div>

          {visibleHistory.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center border border-dashed border-white/10 rounded-xl">
              No saved revisions recorded yet. Saving or auto-saving a project stores restorable snapshots here.
            </p>
          ) : (
            <div className="space-y-2">
              {visibleHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl bg-[#06070B] border border-white/[0.08] p-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={entry.snapshot.thumbnailDataUrl}
                      alt={entry.projectName}
                      className="w-12 h-9 rounded-lg object-cover border border-white/10 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">
                        {entry.projectName} · <span className="text-amber-300">{entry.label}</span>
                      </p>
                      <p className="text-[11px] font-mono-tabular text-slate-400">
                        {TOOL_LABELS[entry.tool]} · {new Date(entry.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRestoreRevision(entry)}
                    className="min-h-[40px] px-3.5 rounded-xl bg-violet-600/25 hover:bg-violet-600/40 border border-violet-400/45 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-300" />
                    <span>Restore Snapshot</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. EXPORT HISTORY */}
      {sectionTab === 'exports' && (
        <div className="rounded-2xl bg-[#0B0D16]/90 border border-white/10 p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-bold text-white">Export History</h3>
              <p className="text-xs text-slate-400">
                Complete audit log of image and video exports, file sizes, and status.
              </p>
            </div>
            {exportHistory.length > 0 && (
              <button
                type="button"
                onClick={onClearExports}
                className="min-h-[38px] px-3.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-400/30 text-xs font-semibold text-rose-200 cursor-pointer"
              >
                Clear Export Logs
              </button>
            )}
          </div>

          {exportHistory.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center border border-dashed border-white/10 rounded-xl">
              No exports logged yet. Export a photo or video in any studio or the Export Center.
            </p>
          ) : (
            <div className="space-y-2">
              {exportHistory.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl bg-[#06070B] border border-white/[0.08] p-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center shrink-0">
                      {item.mediaType === 'video' ? (
                        <Film className="w-4 h-4 text-violet-300" />
                      ) : (
                        <ImageIcon className="w-4 h-4 text-amber-300" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{item.fileName}</p>
                      <p className="text-[11px] font-mono-tabular text-slate-400">
                        {item.format.toUpperCase()} · {item.resolutionLabel} ·{' '}
                        {item.status === 'completed' ? formatBytes(item.fileSizeBytes) : '0 KB'} ·{' '}
                        {new Date(item.createdAt).toLocaleString()}
                      </p>
                      {item.galleryLocationLabel && (
                        <p className="text-[11px] text-amber-300/90 mt-0.5 truncate">
                          {item.galleryLocationLabel}
                        </p>
                      )}
                      {item.errorMessage && (
                        <p className="text-[11px] text-rose-300 mt-0.5">{item.errorMessage}</p>
                      )}
                    </div>
                  </div>
                  <span
                    className={`text-xs font-mono-tabular font-semibold ${
                      item.status === 'completed' ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    {item.status === 'completed' ? 'Completed' : 'Failed'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4. LOCAL STORAGE MANAGEMENT */}
      {sectionTab === 'storage' && (
        <div className="rounded-2xl bg-[#0B0D16]/90 border border-white/10 p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-bold text-white">Local Storage &amp; IndexedDB</h3>
              <p className="text-xs text-slate-400">
                Engine: {storageStats.indexedDbSupported ? 'IndexedDB Active (dipti_editor_db)' : 'Memory Fallback (IndexedDB Unavailable)'}
              </p>
            </div>
            {storageStats.quotaBytes !== null && storageStats.usageBytes !== null && (
              <span className="text-xs font-mono-tabular text-amber-300">
                Browser Quota: {formatBytes(storageStats.usageBytes)} / {formatBytes(storageStats.quotaBytes)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl bg-[#06070B] border border-white/10 p-3.5">
              <p className="text-[11px] text-slate-400">Saved Projects</p>
              <p className="text-lg font-mono-tabular font-bold text-white mt-0.5">{storageStats.projectCount}</p>
              <p className="text-[11px] font-mono-tabular text-amber-300">{formatBytes(storageStats.projectsBytes)}</p>
            </div>
            <div className="rounded-xl bg-[#06070B] border border-white/10 p-3.5">
              <p className="text-[11px] text-slate-400">Revision Snapshots</p>
              <p className="text-lg font-mono-tabular font-bold text-white mt-0.5">{storageStats.historyCount}</p>
              <p className="text-[11px] font-mono-tabular text-violet-300">{formatBytes(storageStats.historyBytes)}</p>
            </div>
            <div className="rounded-xl bg-[#06070B] border border-white/10 p-3.5">
              <p className="text-[11px] text-slate-400">Export Records</p>
              <p className="text-lg font-mono-tabular font-bold text-white mt-0.5">{storageStats.exportCount}</p>
              <p className="text-[11px] font-mono-tabular text-sky-300">{formatBytes(storageStats.exportsBytes)}</p>
            </div>
            <div className="rounded-xl bg-[#06070B] border border-white/10 p-3.5">
              <p className="text-[11px] text-slate-400">Settings &amp; Prompts</p>
              <p className="text-lg font-mono-tabular font-bold text-white mt-0.5">localStorage</p>
              <p className="text-[11px] font-mono-tabular text-emerald-300">{formatBytes(storageStats.localStorageBytes)}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10">
            <span className="text-xs font-mono-tabular text-slate-300">
              Total IndexedDB Project Footprint: <strong className="text-amber-300">{formatBytes(totalDbBytes)}</strong>
            </span>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onClearHistory}
                className="min-h-[42px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-xs font-semibold text-white cursor-pointer"
              >
                Prune Revision History
              </button>
              <button
                type="button"
                onClick={onClearExports}
                className="min-h-[42px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-xs font-semibold text-white cursor-pointer"
              >
                Clear Export Logs
              </button>

              {confirmResetAll ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onClearAllProjects();
                      setConfirmResetAll(false);
                    }}
                    className="min-h-[42px] px-3.5 rounded-xl bg-rose-600 text-xs font-semibold text-white cursor-pointer"
                  >
                    Confirm Delete All
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmResetAll(false)}
                    className="min-h-[42px] px-3 rounded-xl bg-white/10 text-xs text-slate-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmResetAll(true)}
                  className="min-h-[42px] px-3.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-400/35 text-xs font-semibold text-rose-200 cursor-pointer"
                >
                  Delete All Projects
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
