import type { EditorSettings, StudioProject } from '../types/editor';

const PROJECTS_KEY = 'dipti_editor_projects_v1';
const SETTINGS_KEY = 'dipti_editor_settings_v1';

export const HERO_BANNER_IMAGE = '/src/assets/images/hero_ai_studio_1795470360471.jpg';

export const DEFAULT_PROJECTS: StudioProject[] = [
  {
    id: 'proj-noir-portrait',
    title: 'Golden Rim Editorial Portrait',
    kind: 'Photo',
    thumbnailUrl: '/src/assets/images/project_noir_portrait_1795470360374.jpg',
    dimensions: '1400 × 1050',
    updatedLabel: 'Edited 18m ago',
    lastTool: 'AI Enhance',
  },
  {
    id: 'proj-alpine-reel',
    title: 'Alpine Dusk Cinema Reel',
    kind: 'Video',
    thumbnailUrl: '/src/assets/images/project_alpine_reel_1795470361878.jpg',
    dimensions: '1920 × 1080',
    updatedLabel: 'Edited 2h ago',
    durationSec: 12,
    lastTool: 'Auto Captions',
  },
  {
    id: 'proj-arch-lux',
    title: 'Twilight Pavilion Grade',
    kind: 'Photo',
    thumbnailUrl: '/src/assets/images/project_architecture_lux_1795470362156.jpg',
    dimensions: '1400 × 1050',
    updatedLabel: 'Yesterday',
    lastTool: 'Filters',
  },
  {
    id: 'proj-timepiece-gold',
    title: 'Obsidian Chronograph Macro',
    kind: 'AI Art',
    thumbnailUrl: '/src/assets/images/project_product_gold_1795470363006.jpg',
    dimensions: '1400 × 1050',
    updatedLabel: '2 days ago',
    lastTool: 'AI Effects',
  },
];

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  creatorName: 'DIPTI SINGH',
  studioTagline: 'Cinematic Photography & Visual Post-Production',
  exportResolution: '1080p',
  exportFormat: 'png',
  autoSaveProjects: true,
  highPrecisionCanvas: true,
};

export function loadStoredProjects(): StudioProject[] {
  try {
    const raw = window.localStorage.getItem(PROJECTS_KEY);
    if (!raw) return DEFAULT_PROJECTS;
    const parsed = JSON.parse(raw) as StudioProject[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_PROJECTS;
  } catch {
    return DEFAULT_PROJECTS;
  }
}

export function saveStoredProjects(projects: StudioProject[]): void {
  try {
    window.localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects.slice(0, 18)));
  } catch {
    // Handle storage quota limits gracefully
  }
}

export function loadEditorSettings(): EditorSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_EDITOR_SETTINGS;
    return { ...DEFAULT_EDITOR_SETTINGS, ...(JSON.parse(raw) as Partial<EditorSettings>) };
  } catch {
    return DEFAULT_EDITOR_SETTINGS;
  }
}

export function saveEditorSettings(settings: EditorSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage write errors
  }
}
