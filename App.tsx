import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, X } from 'lucide-react';
import { AiStudioWorkspace } from './AiStudioWorkspace';
import { EditorShell } from './EditorShell';
import { HomeScreen } from './HomeScreen';
import { PhotoEditorWorkspace } from './PhotoEditorWorkspace';
import { ProfileSettingsView } from './ProfileSettingsView';
import { SettingsModal } from './SettingsModal';
import { VideoEditorWorkspace } from './VideoEditorWorkspace';
import {
  DEFAULT_EDITOR_SETTINGS,
  DEFAULT_PROJECTS,
  loadEditorSettings,
  loadStoredProjects,
  saveEditorSettings,
  saveStoredProjects,
} from './projectsStore';
import type {
  AiToolMode,
  EditorSettings,
  EditorTab,
  PhotoToolMode,
  StudioProject,
  VideoToolMode,
} from './types/editor';

export default function App() {
  const [activeTab, setActiveTab] = useState<EditorTab>('home');
  const [photoTool, setPhotoTool] = useState<PhotoToolMode>('enhance');
  const [videoTool, setVideoTool] = useState<VideoToolMode>('trim');
  const [aiTool, setAiTool] = useState<AiToolMode>('text-to-image');

  const [projects, setProjects] = useState<StudioProject[]>(() => loadStoredProjects());
  const [settings, setSettings] = useState<EditorSettings>(() => loadEditorSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [activeImageUrl, setActiveImageUrl] = useState<string>(
    DEFAULT_PROJECTS[0].thumbnailUrl
  );
  const [activeImageTitle, setActiveImageTitle] = useState<string>(
    DEFAULT_PROJECTS[0].title
  );

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!toastMsg) return;
    const id = window.setTimeout(() => setToastMsg(null), 3200);
    return () => window.clearTimeout(id);
  }, [toastMsg]);

  const notify = useCallback((msg: string) => {
    setToastMsg(msg);
  }, []);

  const handleSaveProject = useCallback((project: StudioProject) => {
    setProjects((prev) => {
      const next = [project, ...prev.filter((p) => p.id !== project.id)].slice(0, 18);
      saveStoredProjects(next);
      return next;
    });
  }, []);

  const handleUpdateSettings = useCallback((next: EditorSettings) => {
    setSettings(next);
    saveEditorSettings(next);
  }, []);

  const handleResetSampleProjects = useCallback(() => {
    setProjects(DEFAULT_PROJECTS);
    saveStoredProjects(DEFAULT_PROJECTS);
    setSettings(DEFAULT_EDITOR_SETTINGS);
    saveEditorSettings(DEFAULT_EDITOR_SETTINGS);
    notify('Restored default DIPTI EDITOR projects');
  }, [notify]);

  const handleOpenPhotoTool = useCallback((tool: PhotoToolMode) => {
    setPhotoTool(tool);
    setActiveTab('photo');
  }, []);

  const handleOpenVideoTool = useCallback((tool: VideoToolMode) => {
    setVideoTool(tool);
    setActiveTab('video');
  }, []);

  const handleOpenAiTool = useCallback((tool: AiToolMode) => {
    setAiTool(tool);
    setActiveTab('ai-studio');
  }, []);

  const handleOpenProject = useCallback((project: StudioProject) => {
    if (project.kind === 'Video') {
      setVideoTool('trim');
      setActiveTab('video');
      return;
    }
    if (project.kind === 'AI Art') {
      setActiveImageUrl(project.thumbnailUrl);
      setActiveImageTitle(project.title);
      setAiTool('ai-effects');
      setActiveTab('ai-studio');
      return;
    }
    setActiveImageUrl(project.thumbnailUrl);
    setActiveImageTitle(project.title);
    setPhotoTool('enhance');
    setActiveTab('photo');
  }, []);

  return (
    <>
      <EditorShell
        activeTab={activeTab}
        creatorName={settings.creatorName}
        onSelectTab={setActiveTab}
        onOpenSettings={() => setSettingsOpen(true)}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            {activeTab === 'home' && (
              <HomeScreen
                projects={projects}
                onStartCreating={() => handleOpenAiTool('text-to-image')}
                onOpenPhotoTool={handleOpenPhotoTool}
                onOpenVideoTool={handleOpenVideoTool}
                onOpenAiTool={handleOpenAiTool}
                onOpenProject={handleOpenProject}
              />
            )}

            {activeTab === 'photo' && (
              <PhotoEditorWorkspace
                initialTool={photoTool}
                activeImageUrl={activeImageUrl}
                activeTitle={activeImageTitle}
                projects={projects}
                settings={settings}
                onSaveProject={handleSaveProject}
                onNotify={notify}
              />
            )}

            {activeTab === 'video' && (
              <VideoEditorWorkspace
                initialTool={videoTool}
                projects={projects}
                onSaveProject={handleSaveProject}
                onNotify={notify}
              />
            )}

            {activeTab === 'ai-studio' && (
              <AiStudioWorkspace
                initialTool={aiTool}
                activeImageUrl={activeImageUrl}
                onSaveProject={handleSaveProject}
                onOpenInPhotoEditor={(imageUrl, title) => {
                  setActiveImageUrl(imageUrl);
                  setActiveImageTitle(title);
                  setPhotoTool('filters');
                  setActiveTab('photo');
                }}
                onNotify={notify}
              />
            )}

            {activeTab === 'profile' && (
              <ProfileSettingsView
                settings={settings}
                projects={projects}
                onOpenSettings={() => setSettingsOpen(true)}
                onOpenProject={handleOpenProject}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </EditorShell>

      <SettingsModal
        isOpen={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onUpdateSettings={handleUpdateSettings}
        onResetSampleProjects={handleResetSampleProjects}
      />

      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 md:bottom-6 right-4 z-50 glass-gold-edge rounded-2xl px-4 py-3 shadow-2xl flex items-center gap-3 max-w-xs sm:max-w-sm"
        >
          <CheckCircle2 className="w-4 h-4 text-[#d4af37] shrink-0" />
          <p className="text-xs font-medium text-slate-100 flex-1">{toastMsg}</p>
          <button
            type="button"
            onClick={() => setToastMsg(null)}
            aria-label="Dismiss notification"
            className="min-h-[32px] min-w-[32px] rounded-lg text-slate-400 hover:text-white flex items-center justify-center"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </>
  );
}
