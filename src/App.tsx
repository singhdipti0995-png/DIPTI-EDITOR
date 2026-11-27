import React, { useEffect, useRef, useState } from 'react';
import {
  LayoutGrid,
  Sliders,
  Film,
  Scissors,
  Sparkles,
  Palette,
  Type as TypeIcon,
  FolderOpen,
  Settings,
  ChevronLeft,
  Upload,
  Layers,
  X,
  Wand2,
  Zap,
  Box,
  Crosshair,
  Download,
  AlertCircle,
  Camera,
  Aperture,
  ShieldCheck,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AppSettings,
  BackdropMode,
  DEFAULT_ADJUSTMENTS,
  DslrStudioConfig,
  ExportRecord,
  PhotoAdjustments,
  PhotoRestorationConfig,
  PortraitStudioConfig,
  ProjectHistoryEntry,
  ProjectItem,
  StickerLayer,
  StorageUsageStats,
  StudioToolId,
  TextLayer,
} from './types/editor';
import { VideoTimelineState } from './types/video';
import { TypographyDesignDoc } from './types/typography';
import { ColorGradingState } from './types/colorGrading';
import { CREATIVE_STUDIO_CARDS, STUDIO_ASSETS, STUDIO_FEATURES } from './data/studioCatalog';
import {
  SEEDED_PROJECTS,
  loadSettings,
  saveSettings,
} from './utils/storage';
import {
  clearExportHistoryInDb,
  clearProjectHistoryInDb,
  clearProjectsInDb,
  deleteProjectFromDb,
  duplicateProjectInDb,
  getStorageStatsFromDb,
  initAndLoadProjectsDb,
  loadExportHistoryFromDb,
  loadProjectHistoryFromDb,
  recordExportInDb,
  renameProjectInDb,
  saveProjectToDb,
} from './utils/indexedDbStorage';
import { BrandLogo } from './components/BrandLogo';
import { DashboardView } from './components/DashboardView';
import { PhotoEditorStudio } from './components/studios/PhotoEditorStudio';
import { VideoEditorStudio, createDefaultVideoTimeline } from './components/studios/VideoEditorStudio';
import { BackgroundRemoverStudio } from './components/studios/BackgroundRemoverStudio';
import { ImageEnhancerStudio } from './components/studios/ImageEnhancerStudio';
import { FiltersEffectsStudio } from './components/studios/FiltersEffectsStudio';
import { TextFontsStudio } from './components/studios/TextFontsStudio';
import { AiMagicRetouchStudio } from './components/studios/AiMagicRetouchStudio';
import { CinemaColorFxStudio } from './components/studios/CinemaColorFxStudio';
import { DesignBrandStudio } from './components/studios/DesignBrandStudio';
import { ProMotionVfxStudio } from './components/studios/ProMotionVfxStudio';
import { PortraitCinematicStudio } from './components/studios/PortraitCinematicStudio';
import { DslrPortraitStudio } from './components/studios/DslrPortraitStudio';
import { PhotoRestorationStudio } from './components/studios/PhotoRestorationStudio';
import { HdQualityStudio } from './components/studios/HdQualityStudio';
import { ColorGradingStudio } from './components/studios/ColorGradingStudio';
import { PresetLibraryStudio } from './components/studios/PresetLibraryStudio';
import { BatchPhotoStudio } from './components/studios/BatchPhotoStudio';
import { ExportCenterView } from './components/studios/ExportCenterView';
import { ProjectsView } from './components/studios/ProjectsView';
import { SettingsView } from './components/studios/SettingsView';

const NAV_ITEMS: Array<{ id: StudioToolId; label: string; icon: React.ReactNode }> = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutGrid className="w-4 h-4" /> },
  { id: 'photo', label: 'AI Photo Editor', icon: <Sliders className="w-4 h-4" /> },
  { id: 'video', label: 'Video Editor', icon: <Film className="w-4 h-4" /> },
  { id: 'color-grading', label: 'Color Grading Studio', icon: <Palette className="w-4 h-4" /> },
  { id: 'preset-library', label: 'Custom Preset Library', icon: <Layers className="w-4 h-4" /> },
  { id: 'batch-editor', label: 'Batch Photo Editor', icon: <Layers className="w-4 h-4" /> },
  { id: 'hd-quality', label: 'HD Quality Engine', icon: <ShieldCheck className="w-4 h-4" /> },
  { id: 'portrait-studio', label: 'Portrait & Filter Studio', icon: <Camera className="w-4 h-4" /> },
  { id: 'dslr-studio', label: 'DSLR Portrait & BG', icon: <Aperture className="w-4 h-4" /> },
  { id: 'photo-restoration', label: 'Photo Restoration', icon: <Wand2 className="w-4 h-4" /> },
  { id: 'bg-remover', label: 'AI Background Remover', icon: <Scissors className="w-4 h-4" /> },
  { id: 'enhancer', label: 'AI Image Enhancer', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'filters', label: 'Filters & Effects Studio', icon: <Palette className="w-4 h-4" /> },
  { id: 'text', label: 'Text & Fonts Studio', icon: <TypeIcon className="w-4 h-4" /> },
  { id: 'ai-retouch', label: 'AI Creative Studio', icon: <Wand2 className="w-4 h-4" /> },
  { id: 'cinema-fx', label: 'Cinema Color & FX', icon: <Zap className="w-4 h-4" /> },
  { id: 'design-studio', label: 'Typography & Motion', icon: <Box className="w-4 h-4" /> },
  { id: 'motion-vfx', label: 'Pro Motion & VFX', icon: <Crosshair className="w-4 h-4" /> },
  { id: 'export-center', label: 'Export Center', icon: <Download className="w-4 h-4" /> },
  { id: 'projects', label: 'My Projects', icon: <FolderOpen className="w-4 h-4" /> },
  { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
];

const VIEW_TITLES: Record<StudioToolId, { title: string; subtitle: string }> = {
  dashboard: { title: 'Studio Home', subtitle: 'AI Photo & Cinema Video Workspace' },
  photo: { title: 'AI Photo Editor', subtitle: 'Natural-language grading and RAW-style adjustments' },
  video: { title: 'Video Editor', subtitle: 'Timeline trimming, speed ramps, LUTs, and HD/4K export' },
  'color-grading': {
    title: 'Advanced Color Grading Studio',
    subtitle: 'RGB curves, 3-way color wheels, HSL/RGB channels, 10 cinematic presets & photo/video grading',
  },
  'preset-library': {
    title: 'Custom Preset Library',
    subtitle: '42+ pro presets across 10 categories, custom recipe builder, IndexedDB save & photo/video apply',
  },
  'batch-editor': {
    title: 'DIPTI Batch Photo Editor',
    subtitle: 'Multi-photo import, batch filters, color grading, watermarks, resize/crop/rotate & Gallery export',
  },
  'hd-quality': {
    title: 'DIPTI HD Quality Engine',
    subtitle: 'Original resolution protection, 1×-4× zoom compare, non-upscaled video guard & QA audit',
  },
  'portrait-studio': {
    title: 'AI Portrait & Cinematic Filter Studio',
    subtitle: '30 live portrait presets, 0-100% intensity, multi-effect stacking & JPG/PNG export',
  },
  'dslr-studio': {
    title: 'DIPTI DSLR Portrait & Background Studio',
    subtitle: 'Local segmentation, circular & cinematic bokeh blur 0-100%, hair edge refine & backdrops',
  },
  'photo-restoration': {
    title: 'DIPTI AI Photo Restoration Studio',
    subtitle: 'Local old photo recovery, noise & blur reduction, faded color stretch, dust/scratch repair & JPG/PNG export',
  },
  'bg-remover': {
    title: 'DIPTI AI Background Remover Studio',
    subtitle: 'Free local MediaPipe AI cutout, transparent PNG, solid/gradient/custom backdrops & DSLR blur',
  },
  enhancer: { title: 'AI Image Enhancer', subtitle: '2x crisp upscaling and deconvolution sharpening' },
  filters: { title: 'Filters & Effects Studio', subtitle: 'Cinema presets, optical bloom, and film grain' },
  text: { title: 'Text & Fonts Studio', subtitle: 'Interactive multi-layer editorial typography' },
  'ai-retouch': { title: 'AI Creative Studio', subtitle: 'Text-to-Image, Cartoon & Anime, Watercolor, Oil Paint, Double Exposure, Avatar & Templates' },
  'cinema-fx': { title: 'Cinema Color & FX Studio', subtitle: '3-way color wheels, 30 LUTs, glitch RGB split, and neon glow' },
  'design-studio': { title: 'Typography & Motion Design Studio', subtitle: '12 fonts, metallic gold & purple neon, curved 3D text, motion presets, templates & transparent PNG' },
  'motion-vfx': { title: 'Pro Motion & VFX Video Studio', subtitle: 'Chroma key green screen, keyframes, motion tracking, and speed ramping' },
  'export-center': { title: 'Export Center', subtitle: 'JPG, PNG, WebP, MP4/WebM export, 720p/1080p/4K, quality, FPS, file sizes & sharing' },
  projects: { title: 'Project Manager', subtitle: 'IndexedDB projects, categories, duplicate, history restore & local storage' },
  settings: { title: 'Settings', subtitle: 'Export defaults, auto-save, guides, and IndexedDB storage' },
};

export default function App() {
  const [activeTool, setActiveTool] = useState<StudioToolId>('dashboard');
  const [activeImages, setActiveImages] = useState<Record<string, string>>({
    photo: STUDIO_ASSETS[0].url,
    'color-grading': STUDIO_ASSETS[4].url,
    'preset-library': STUDIO_ASSETS[3].url,
    'hd-quality': STUDIO_ASSETS[2].url,
    'portrait-studio': STUDIO_ASSETS[0].url,
    'dslr-studio': STUDIO_ASSETS[0].url,
    'photo-restoration': STUDIO_ASSETS[2].url,
    'bg-remover': STUDIO_ASSETS[1].url,
    enhancer: STUDIO_ASSETS[2].url,
    filters: STUDIO_ASSETS[3].url,
    text: STUDIO_ASSETS[5].url,
    'ai-retouch': STUDIO_ASSETS[0].url,
    'cinema-fx': STUDIO_ASSETS[3].url,
  });

  const [projects, setProjects] = useState<ProjectItem[]>(SEEDED_PROJECTS);
  const [projectHistory, setProjectHistory] = useState<ProjectHistoryEntry[]>([]);
  const [exportHistory, setExportHistory] = useState<ExportRecord[]>([]);
  const [storageStats, setStorageStats] = useState<StorageUsageStats>({
    indexedDbSupported: typeof indexedDB !== 'undefined',
    projectCount: SEEDED_PROJECTS.length,
    historyCount: 0,
    exportCount: 0,
    projectsBytes: 0,
    historyBytes: 0,
    exportsBytes: 0,
    localStorageBytes: 0,
    quotaBytes: null,
    usageBytes: null,
  });
  const [storageError, setStorageError] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>(undefined);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [mobileStudiosOpen, setMobileStudiosOpen] = useState(false);

  const [photoInitAdj, setPhotoInitAdj] = useState<PhotoAdjustments | undefined>(undefined);
  const [photoInitText, setPhotoInitText] = useState<TextLayer[] | undefined>(undefined);
  const [photoInitStickers, setPhotoInitStickers] = useState<StickerLayer[] | undefined>(undefined);
  const [photoInitBgRemoved, setPhotoInitBgRemoved] = useState<boolean | undefined>(undefined);
  const [photoInitBackdrop, setPhotoInitBackdrop] = useState<BackdropMode | undefined>(undefined);
  const [textInitLayers, setTextInitLayers] = useState<TextLayer[] | undefined>(undefined);
  const [filterInitPreset, setFilterInitPreset] = useState<string | undefined>(undefined);
  const [filterInitIntensity, setFilterInitIntensity] = useState<number | undefined>(undefined);
  const [videoInitTimeline, setVideoInitTimeline] = useState<VideoTimelineState | undefined>(undefined);
  const [designInitDoc, setDesignInitDoc] = useState<TypographyDesignDoc | undefined>(undefined);
  const [portraitInitConfig, setPortraitInitConfig] = useState<PortraitStudioConfig | undefined>(undefined);
  const [dslrInitConfig, setDslrInitConfig] = useState<DslrStudioConfig | undefined>(undefined);
  const [photoRestoreInitConfig, setPhotoRestoreInitConfig] = useState<PhotoRestorationConfig | undefined>(undefined);
  const [colorGradingInitState, setColorGradingInitState] = useState<ColorGradingState | undefined>(undefined);
  const [latestPhotoAdj, setLatestPhotoAdj] = useState<PhotoAdjustments | undefined>(undefined);
  const [batchIncomingImage, setBatchIncomingImage] = useState<{
    url: string;
    name: string;
    seq: number;
  } | null>(null);
  const latestVideoTimelineRef = useRef<VideoTimelineState | null>(null);

  const quickFileRef = useRef<HTMLInputElement>(null);

  const refreshDbMeta = async () => {
    const [hist, exps, stats] = await Promise.all([
      loadProjectHistoryFromDb(),
      loadExportHistoryFromDb(),
      getStorageStatsFromDb(),
    ]);
    setProjectHistory(hist);
    setExportHistory(exps);
    setStorageStats(stats);
  };

  useEffect(() => {
    initAndLoadProjectsDb().then((res) => {
      setProjects(res.projects);
      if (res.error) setStorageError(res.error);
      refreshDbMeta();
    });
  }, []);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const setToolImage = (tool: string, url: string) => {
    setActiveImages((prev) => ({ ...prev, [tool]: url }));
  };

  const handleImportForTool = (imageUrl: string, targetTool: StudioToolId) => {
    if (
      targetTool !== 'dashboard' &&
      targetTool !== 'projects' &&
      targetTool !== 'settings' &&
      targetTool !== 'export-center'
    ) {
      setToolImage(targetTool, imageUrl);
    }
    setActiveTool(targetTool);
  };

  const handleGlobalFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    if (activeTool === 'batch-editor') {
      files.forEach((file, idx) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            setBatchIncomingImage({
              url: reader.result,
              name: file.name,
              seq: Date.now() + idx,
            });
          }
        };
        reader.readAsDataURL(file);
      });
      e.target.value = '';
      return;
    }
    const file = files[0];
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const target: StudioToolId =
          activeTool === 'color-grading' ||
          activeTool === 'preset-library' ||
          activeTool === 'hd-quality' ||
          activeTool === 'portrait-studio' ||
          activeTool === 'dslr-studio' ||
          activeTool === 'photo-restoration' ||
          activeTool === 'bg-remover' ||
          activeTool === 'enhancer' ||
          activeTool === 'filters' ||
          activeTool === 'text' ||
          activeTool === 'ai-retouch' ||
          activeTool === 'cinema-fx'
            ? activeTool
            : 'photo';
        handleImportForTool(reader.result, target);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSaveProject = async (project: ProjectItem): Promise<boolean> => {
    setStorageError(null);
    const res = await saveProjectToDb(project, project.autoSaved ? 'Auto-saved snapshot' : 'Manual save');
    if (!res.ok) {
      setStorageError(res.error || 'Failed to persist project to IndexedDB.');
      return false;
    }
    setProjects(res.projects);
    setActiveProjectId(project.id);
    await refreshDbMeta();
    return true;
  };

  const handleAutoSaveProject = async (project: ProjectItem): Promise<boolean> => {
    const res = await saveProjectToDb(project, 'Auto-saved edit');
    if (!res.ok) {
      setStorageError(res.error || 'Auto-save failed.');
      return false;
    }
    setProjects(res.projects);
    setActiveProjectId(project.id);
    await refreshDbMeta();
    return true;
  };

  const handleRenameProject = async (id: string, newName: string) => {
    const res = await renameProjectInDb(id, newName);
    if (!res.ok) {
      setStorageError(res.error || 'Failed to rename project.');
      return;
    }
    setProjects(res.projects);
    await refreshDbMeta();
  };

  const handleDuplicateProject = async (id: string) => {
    const res = await duplicateProjectInDb(id);
    if (!res.ok) {
      setStorageError(res.error || 'Failed to duplicate project.');
      return;
    }
    setProjects(res.projects);
    await refreshDbMeta();
  };

  const handleDeleteProject = async (id: string) => {
    const res = await deleteProjectFromDb(id);
    if (!res.ok) {
      setStorageError(res.error || 'Failed to delete project.');
      return;
    }
    setProjects(res.projects);
    await refreshDbMeta();
  };

  const handleClearProjects = async () => {
    const res = await clearProjectsInDb();
    if (!res.ok) {
      setStorageError(res.error || 'Failed to clear projects.');
      return;
    }
    setProjects([]);
    await refreshDbMeta();
  };

  const handleClearHistory = async () => {
    await clearProjectHistoryInDb();
    await refreshDbMeta();
  };

  const handleClearExports = async () => {
    await clearExportHistoryInDb();
    await refreshDbMeta();
  };

  const handleRecordExport = async (record: ExportRecord) => {
    const updated = await recordExportInDb(record);
    setExportHistory(updated);
    const stats = await getStorageStatsFromDb();
    setStorageStats(stats);
  };

  const handleApplyFeaturedEffect = (presetId: string) => {
    setPhotoInitAdj({
      ...DEFAULT_ADJUSTMENTS,
      activeFilterId: presetId,
      filterIntensity: 100,
    });
    setActiveTool('photo');
  };

  const handleOpenProject = (project: ProjectItem) => {
    setActiveProjectId(project.id);
    setToolImage(project.tool, project.sourceImageUrl);
    if (project.tool === 'photo') {
      setPhotoInitAdj(project.adjustments);
      setPhotoInitText(project.textLayers);
      setPhotoInitStickers(project.stickers);
      setPhotoInitBgRemoved(project.bgRemoved);
      setPhotoInitBackdrop(project.backdropMode);
    }
    if (project.tool === 'video') {
      setVideoInitTimeline(project.videoTimeline);
    }
    if (project.tool === 'text' && project.textLayers) {
      setTextInitLayers(project.textLayers);
    }
    if (project.tool === 'filters') {
      setFilterInitPreset(project.filterPresetId);
      setFilterInitIntensity(project.filterIntensity);
    }
    if (project.tool === 'design-studio' && project.typographyDoc) {
      setDesignInitDoc(project.typographyDoc);
    }
    if (project.tool === 'portrait-studio' && project.portraitStudioState) {
      setPortraitInitConfig(project.portraitStudioState);
    }
    if (project.tool === 'dslr-studio' && project.dslrStudioState) {
      setDslrInitConfig(project.dslrStudioState);
    }
    if (project.tool === 'photo-restoration' && project.photoRestorationState) {
      setPhotoRestoreInitConfig(project.photoRestorationState);
    }
    if (project.tool === 'color-grading' && project.colorGradingState) {
      setColorGradingInitState(project.colorGradingState);
    }
    setActiveTool(project.tool);
  };

  const handleRestoreRevision = async (entry: ProjectHistoryEntry) => {
    const restored: ProjectItem = {
      ...entry.snapshot,
      updatedAt: new Date().toISOString(),
    };
    await saveProjectToDb(restored, `Restored from ${new Date(entry.createdAt).toLocaleTimeString()}`);
    await refreshDbMeta();
    handleOpenProject(restored);
  };

  const navigateTo = (tool: StudioToolId) => {
    setActiveTool(tool);
    setMobileStudiosOpen(false);
    window.scrollTo({ top: 0, behavior: settings.reducedMotion ? 'auto' : 'smooth' });
  };

  const currentMeta = VIEW_TITLES[activeTool];

  return (
    <div className="min-h-screen bg-[#06070B] text-slate-100 flex">
      <input
        ref={quickFileRef}
        type="file"
        accept="image/*"
        multiple={activeTool === 'batch-editor'}
        onChange={handleGlobalFilePick}
        className="hidden"
      />

      {/* Ambient Backdrop Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 left-1/4 w-[520px] h-[520px] rounded-full bg-violet-700/10 blur-[140px]" />
        <div className="absolute bottom-0 right-1/5 w-[480px] h-[480px] rounded-full bg-sky-600/10 blur-[140px]" />
      </div>

      {/* Desktop Left Studio Navigation Rail */}
      <aside className="hidden lg:flex lg:w-[252px] lg:shrink-0 lg:flex-col lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto bg-[#080B14]/90 backdrop-blur-xl border-r border-white/[0.08] z-20 p-4 justify-between gap-4">
        <div className="space-y-6">
          <button
            type="button"
            onClick={() => navigateTo('dashboard')}
            className="w-full text-left px-1 py-1 cursor-pointer"
          >
            <BrandLogo size="md" />
          </button>

          <nav className="space-y-1" aria-label="Studio navigation">
            {NAV_ITEMS.map((item, idx) => {
              const isActive = activeTool === item.id;
              const addDivider = idx === 1 || idx === 9 || idx === 13;
              return (
                <React.Fragment key={item.id}>
                  {addDivider && <div className="my-2.5 border-t border-white/[0.06]" />}
                  <button
                    type="button"
                    onClick={() => navigateTo(item.id)}
                    className={`w-full min-h-[42px] px-3 py-2 rounded-xl text-left text-xs font-medium flex items-center gap-3 transition-all whitespace-nowrap cursor-pointer ${
                      isActive
                        ? 'bg-gradient-to-r from-violet-600/25 via-indigo-600/20 to-sky-500/15 border border-sky-400/35 text-white shadow-[0_4px_20px_rgba(37,99,235,0.16)]'
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.05] border border-transparent'
                    }`}
                  >
                    <span className={isActive ? 'text-sky-300' : 'text-slate-400'}>{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </button>
                </React.Fragment>
              );
            })}
          </nav>
        </div>

        <div className="rounded-2xl bg-[#0B1020] border border-white/[0.07] p-3.5 space-y-2">
          <p className="text-xs font-semibold text-white">DIPTI Studio Engine</p>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Upload any photo or video to edit, enhance, or export directly from your browser.
          </p>
          <button
            type="button"
            onClick={() => quickFileRef.current?.click()}
            className="w-full min-h-[38px] rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-amber-300 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Quick Import</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col relative z-10">
        {/* Top App Bar (Mobile + Desktop) */}
        <header className="sticky top-0 z-30 h-14 lg:h-16 px-4 sm:px-6 bg-[#06070B]/85 backdrop-blur-xl border-b border-white/[0.08] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {activeTool !== 'dashboard' ? (
              <button
                type="button"
                onClick={() => navigateTo('dashboard')}
                className="lg:hidden min-h-[40px] min-w-[40px] -ml-1 rounded-xl hover:bg-white/10 flex items-center justify-center text-slate-200 cursor-pointer"
                aria-label="Back to Dashboard"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            ) : (
              <div className="lg:hidden">
                <BrandLogo size="sm" />
              </div>
            )}

            <div className={`min-w-0 ${activeTool === 'dashboard' ? 'hidden lg:block' : 'block'}`}>
              <h1 className="font-display text-sm sm:text-base font-bold text-white truncate">
                {currentMeta.title}
              </h1>
              <p className="hidden sm:block text-xs text-slate-400 truncate">{currentMeta.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => quickFileRef.current?.click()}
              className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-sky-500 hover:brightness-110 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import</span>
            </button>
          </div>
        </header>

        {/* Active Studio Viewport */}
        <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 pt-5">
          {storageError && (
            <div className="mb-4 rounded-xl bg-rose-500/10 border border-rose-400/35 px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-rose-200">
              <span className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-300 shrink-0" />
                <span>{storageError}</span>
              </span>
              <button type="button" onClick={() => setStorageError(null)} className="text-rose-200 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTool}
              initial={settings.reducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={settings.reducedMotion ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            >
              {activeTool === 'dashboard' && (
                <DashboardView
                  onNavigate={navigateTo}
                  onImportImageForTool={handleImportForTool}
                  onApplyFeaturedEffect={handleApplyFeaturedEffect}
                  projects={projects}
                  onOpenProject={handleOpenProject}
                  reducedMotion={settings.reducedMotion}
                />
              )}

              {activeTool === 'photo' && (
                <PhotoEditorStudio
                  imageUrl={activeImages.photo}
                  onChangeImage={(url) => {
                    setActiveProjectId(undefined);
                    setPhotoInitAdj(undefined);
                    setPhotoInitText(undefined);
                    setPhotoInitStickers(undefined);
                    setPhotoInitBgRemoved(undefined);
                    setPhotoInitBackdrop(undefined);
                    setToolImage('photo', url);
                  }}
                  initialAdjustments={photoInitAdj}
                  initialTextLayers={photoInitText}
                  initialStickers={photoInitStickers}
                  initialBgRemoved={photoInitBgRemoved}
                  initialBackdrop={photoInitBackdrop}
                  activeProjectId={activeProjectId}
                  settings={settings}
                  onSaveProject={handleSaveProject}
                  onAutoSaveProject={handleAutoSaveProject}
                  onRecordExport={handleRecordExport}
                  onOpenExportCenter={() => navigateTo('export-center')}
                  onOpenPresetLibrary={() => navigateTo('preset-library')}
                  onAdjustmentsChange={setLatestPhotoAdj}
                />
              )}

              {activeTool === 'video' && (
                <VideoEditorStudio
                  initialTimeline={videoInitTimeline}
                  activeProjectId={activeProjectId}
                  autoSaveEnabled={settings.autoSaveProjects}
                  settings={settings}
                  onSaveProject={handleSaveProject}
                  onAutoSaveProject={handleAutoSaveProject}
                  onRecordExport={handleRecordExport}
                  onTimelineChange={(tl) => {
                    latestVideoTimelineRef.current = tl;
                  }}
                />
              )}

              {activeTool === 'preset-library' && (
                <PresetLibraryStudio
                  imageUrl={activeImages['preset-library']}
                  onChangeImage={(url) => setToolImage('preset-library', url)}
                  currentPhotoAdjustments={latestPhotoAdj ?? photoInitAdj}
                  settings={settings}
                  onApplyPresetToPhotoEditor={(mergedAdj) => {
                    setToolImage('photo', activeImages['preset-library']);
                    setPhotoInitAdj(mergedAdj);
                    setLatestPhotoAdj(mergedAdj);
                    navigateTo('photo');
                  }}
                  onApplyPresetToVideoEditor={(videoGrade) => {
                    const baseTl =
                      latestVideoTimelineRef.current ?? videoInitTimeline ?? createDefaultVideoTimeline();
                    const updated: VideoTimelineState = {
                      ...baseTl,
                      clips: baseTl.clips.map((c) => ({
                        ...c,
                        filterId: videoGrade.filterId,
                        brightness: videoGrade.brightness,
                        contrast: videoGrade.contrast,
                        saturation: videoGrade.saturation,
                        temperature: videoGrade.temperature,
                        vignette: videoGrade.vignette,
                        grain: videoGrade.grain,
                      })),
                    };
                    latestVideoTimelineRef.current = updated;
                    setVideoInitTimeline(updated);
                    navigateTo('video');
                  }}
                  onRecordExport={handleRecordExport}
                />
              )}

              {activeTool === 'batch-editor' && (
                <BatchPhotoStudio
                  settings={settings}
                  onRecordExport={handleRecordExport}
                  incomingImage={batchIncomingImage}
                />
              )}

              {activeTool === 'color-grading' && (
                <ColorGradingStudio
                  imageUrl={activeImages['color-grading']}
                  onChangeImage={(url) => {
                    setActiveProjectId(undefined);
                    setColorGradingInitState(undefined);
                    setToolImage('color-grading', url);
                  }}
                  initialState={colorGradingInitState}
                  activeProjectId={activeProjectId}
                  settings={settings}
                  onSaveProject={handleSaveProject}
                  onRecordExport={handleRecordExport}
                />
              )}

              {activeTool === 'hd-quality' && (
                <HdQualityStudio
                  imageUrl={activeImages['hd-quality']}
                  onChangeImage={(url) => setToolImage('hd-quality', url)}
                  settings={settings}
                  onRecordExport={handleRecordExport}
                  onOpenExportCenter={() => navigateTo('export-center')}
                />
              )}

              {activeTool === 'portrait-studio' && (
                <PortraitCinematicStudio
                  imageUrl={activeImages['portrait-studio']}
                  onChangeImage={(url) => {
                    setPortraitInitConfig(undefined);
                    setToolImage('portrait-studio', url);
                  }}
                  initialConfig={portraitInitConfig}
                  settings={settings}
                  onSaveProject={handleSaveProject}
                  onRecordExport={handleRecordExport}
                />
              )}

              {activeTool === 'dslr-studio' && (
                <DslrPortraitStudio
                  imageUrl={activeImages['dslr-studio']}
                  onChangeImage={(url) => {
                    setDslrInitConfig(undefined);
                    setToolImage('dslr-studio', url);
                  }}
                  initialConfig={dslrInitConfig}
                  settings={settings}
                  onSaveProject={handleSaveProject}
                  onRecordExport={handleRecordExport}
                />
              )}

              {activeTool === 'photo-restoration' && (
                <PhotoRestorationStudio
                  imageUrl={activeImages['photo-restoration']}
                  onChangeImage={(url) => {
                    setPhotoRestoreInitConfig(undefined);
                    setToolImage('photo-restoration', url);
                  }}
                  initialConfig={photoRestoreInitConfig}
                  settings={settings}
                  onSaveProject={handleSaveProject}
                  onRecordExport={handleRecordExport}
                />
              )}

              {activeTool === 'bg-remover' && (
                <BackgroundRemoverStudio
                  imageUrl={activeImages['bg-remover']}
                  onChangeImage={(url) => setToolImage('bg-remover', url)}
                  settings={settings}
                  onSaveProject={handleSaveProject}
                  onRecordExport={handleRecordExport}
                />
              )}

              {activeTool === 'enhancer' && (
                <ImageEnhancerStudio
                  imageUrl={activeImages.enhancer}
                  onChangeImage={(url) => setToolImage('enhancer', url)}
                  settings={settings}
                  onSaveProject={handleSaveProject}
                  onRecordExport={handleRecordExport}
                />
              )}

              {activeTool === 'filters' && (
                <FiltersEffectsStudio
                  imageUrl={activeImages.filters}
                  onChangeImage={(url) => setToolImage('filters', url)}
                  initialPresetId={filterInitPreset}
                  initialIntensity={filterInitIntensity}
                  settings={settings}
                  onSaveProject={handleSaveProject}
                  onRecordExport={handleRecordExport}
                />
              )}

              {activeTool === 'text' && (
                <TextFontsStudio
                  imageUrl={activeImages.text}
                  onChangeImage={(url) => setToolImage('text', url)}
                  initialLayers={textInitLayers}
                  settings={settings}
                  onSaveProject={handleSaveProject}
                  onRecordExport={handleRecordExport}
                />
              )}

              {activeTool === 'ai-retouch' && (
                <AiMagicRetouchStudio
                  imageUrl={activeImages['ai-retouch']}
                  onChangeImage={(url) => setToolImage('ai-retouch', url)}
                  settings={settings}
                  onSaveProject={handleSaveProject}
                  onRecordExport={handleRecordExport}
                  projects={projects}
                  onOpenProject={handleOpenProject}
                  onLaunchTemplateInDesign={(doc) => {
                    setDesignInitDoc(doc);
                    navigateTo('design-studio');
                  }}
                />
              )}

              {activeTool === 'cinema-fx' && (
                <CinemaColorFxStudio
                  imageUrl={activeImages['cinema-fx']}
                  onChangeImage={(url) => setToolImage('cinema-fx', url)}
                  settings={settings}
                  onSaveProject={handleSaveProject}
                  onRecordExport={handleRecordExport}
                />
              )}

              {activeTool === 'design-studio' && (
                <DesignBrandStudio
                  settings={settings}
                  initialDoc={designInitDoc}
                  onSaveProject={handleSaveProject}
                  onRecordExport={handleRecordExport}
                />
              )}

              {activeTool === 'motion-vfx' && (
                <ProMotionVfxStudio
                  settings={settings}
                  onRecordExport={handleRecordExport}
                />
              )}

              {activeTool === 'export-center' && (
                <ExportCenterView
                  activePhotoUrl={activeImages.photo}
                  projects={projects}
                  exportHistory={exportHistory}
                  settings={settings}
                  onRecordExport={handleRecordExport}
                  onClearExportHistory={handleClearExports}
                />
              )}

              {activeTool === 'projects' && (
                <ProjectsView
                  projects={projects}
                  projectHistory={projectHistory}
                  exportHistory={exportHistory}
                  storageStats={storageStats}
                  onOpenProject={handleOpenProject}
                  onRestoreRevision={handleRestoreRevision}
                  onRenameProject={handleRenameProject}
                  onDuplicateProject={handleDuplicateProject}
                  onDeleteProject={handleDeleteProject}
                  onClearHistory={handleClearHistory}
                  onClearExports={handleClearExports}
                  onClearAllProjects={handleClearProjects}
                  onNavigate={navigateTo}
                />
              )}

              {activeTool === 'settings' && (
                <SettingsView
                  settings={settings}
                  onUpdateSettings={setSettings}
                  projectCount={projects.length}
                  storageStats={storageStats}
                  onClearProjects={handleClearProjects}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile Bottom Sheet Drawer for All 6 Studios */}
      <AnimatePresence>
        {mobileStudiosOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="lg:hidden fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-end"
            onClick={() => setMobileStudiosOpen(false)}
          >
            <motion.div
              initial={{ y: 60 }}
              animate={{ y: 0 }}
              exit={{ y: 60 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-h-[78vh] overflow-y-auto rounded-t-3xl bg-[#0B1020] border-t border-white/15 p-5 pb-8 space-y-4"
            >
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto" />
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-bold text-white">Select Studio</h2>
                <button
                  type="button"
                  onClick={() => setMobileStudiosOpen(false)}
                  className="p-2 rounded-xl bg-white/[0.06] text-slate-300 cursor-pointer"
                  aria-label="Close studios drawer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-3">
                <p className="text-[11px] font-medium text-slate-400">Core Studios</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {STUDIO_FEATURES.map((f) => {
                    const navIcon = NAV_ITEMS.find((n) => n.id === f.id)?.icon;
                    const active = activeTool === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => navigateTo(f.id)}
                        className={`min-h-[54px] p-3 rounded-2xl border text-left flex items-center gap-2.5 cursor-pointer ${
                          active
                            ? 'bg-violet-600/25 border-sky-400/60 text-white'
                            : 'bg-[#060812] border-white/10 text-slate-200'
                        }`}
                      >
                        <span className="text-sky-300 shrink-0">{navIcon}</span>
                        <span className="text-xs font-semibold leading-tight">{f.title}</span>
                      </button>
                    );
                  })}
                </div>

                <p className="text-[11px] font-medium text-amber-300 pt-1">Advanced Creative Studio</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {CREATIVE_STUDIO_CARDS.map((f) => {
                    const navIcon = NAV_ITEMS.find((n) => n.id === f.id)?.icon;
                    const active = activeTool === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => navigateTo(f.id)}
                        className={`min-h-[54px] p-3 rounded-2xl border text-left flex items-center gap-2.5 cursor-pointer ${
                          active
                            ? 'bg-amber-500/20 border-amber-400/60 text-white'
                            : 'bg-[#060812] border-white/10 text-slate-200'
                        }`}
                      >
                        <span className="text-amber-300 shrink-0">{navIcon}</span>
                        <span className="text-xs font-semibold leading-tight">{f.title}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="pt-1 border-t border-white/[0.08] space-y-2">
                  <button
                    type="button"
                    onClick={() => navigateTo('export-center')}
                    className={`w-full min-h-[48px] px-3.5 py-2.5 rounded-2xl border text-left flex items-center justify-between cursor-pointer ${
                      activeTool === 'export-center'
                        ? 'bg-amber-500/20 border-amber-400/60 text-white'
                        : 'bg-[#060812] border-white/10 text-slate-200'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Download className="w-4 h-4 text-amber-300" />
                      <span className="text-xs font-semibold">Export Center (JPG / PNG / WebP / MP4)</span>
                    </span>
                    <span className="text-[11px] text-slate-400">Open</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateTo('settings')}
                    className={`w-full min-h-[48px] px-3.5 py-2.5 rounded-2xl border text-left flex items-center justify-between cursor-pointer ${
                      activeTool === 'settings'
                        ? 'bg-amber-500/20 border-amber-400/60 text-white'
                        : 'bg-[#060812] border-white/10 text-slate-200'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Settings className="w-4 h-4 text-amber-300" />
                      <span className="text-xs font-semibold">Studio Settings &amp; IndexedDB Storage</span>
                    </span>
                    <span className="text-[11px] text-slate-400">Open</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-[#070810]/95 backdrop-blur-xl border-t border-amber-400/15 grid grid-cols-5 items-center px-1"
      >
        <button
          type="button"
          onClick={() => navigateTo('dashboard')}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-1 cursor-pointer ${
            activeTool === 'dashboard' ? 'text-amber-300' : 'text-slate-400'
          }`}
        >
          <LayoutGrid className="w-5 h-5" />
          <span className="text-[10px] font-medium">Home</span>
        </button>

        <button
          type="button"
          onClick={() => navigateTo('photo')}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-1 cursor-pointer ${
            activeTool === 'photo' ? 'text-violet-300' : 'text-slate-400'
          }`}
        >
          <Sliders className="w-5 h-5" />
          <span className="text-[10px] font-medium">Photo</span>
        </button>

        <button
          type="button"
          onClick={() => navigateTo('video')}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-1 cursor-pointer ${
            activeTool === 'video' ? 'text-amber-300' : 'text-slate-400'
          }`}
        >
          <Film className="w-5 h-5" />
          <span className="text-[10px] font-medium">Video</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileStudiosOpen(true)}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-1 cursor-pointer ${
            activeTool !== 'dashboard' &&
            activeTool !== 'photo' &&
            activeTool !== 'video' &&
            activeTool !== 'projects'
              ? 'text-violet-300'
              : 'text-slate-400'
          }`}
        >
          <Layers className="w-5 h-5" />
          <span className="text-[10px] font-medium">Studios</span>
        </button>

        <button
          type="button"
          onClick={() => navigateTo('projects')}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-1 cursor-pointer ${
            activeTool === 'projects' ? 'text-amber-300' : 'text-slate-400'
          }`}
        >
          <FolderOpen className="w-5 h-5" />
          <span className="text-[10px] font-medium">Projects</span>
        </button>
      </nav>
    </div>
  );
}
