import { AppSettings, DEFAULT_ADJUSTMENTS, DEFAULT_SETTINGS, ProjectItem } from '../types/editor';
import { STUDIO_ASSETS } from '../data/studioCatalog';

const PROJECTS_KEY = 'dipti_editor_projects_v1';
const SETTINGS_KEY = 'dipti_editor_settings_v1';

export const SEEDED_PROJECTS: ProjectItem[] = [
  {
    id: 'proj-seed-1',
    name: 'Obsidian Rim Editorial',
    tool: 'photo',
    thumbnailDataUrl: STUDIO_ASSETS[0].url,
    sourceImageUrl: STUDIO_ASSETS[0].url,
    width: 1920,
    height: 1080,
    updatedAt: '2026-11-25T09:15:00.000Z',
    adjustments: {
      ...DEFAULT_ADJUSTMENTS,
      contrast: 14,
      temperature: 8,
      vignette: 24,
      sharpness: 18,
    },
  },
  {
    id: 'proj-seed-2',
    name: 'Analog Camera Cutout',
    tool: 'bg-remover',
    thumbnailDataUrl: STUDIO_ASSETS[1].url,
    sourceImageUrl: STUDIO_ASSETS[1].url,
    width: 1600,
    height: 1200,
    updatedAt: '2026-11-24T18:40:00.000Z',
  },
  {
    id: 'proj-seed-3',
    name: 'Gallery Cover Monograph',
    tool: 'text',
    thumbnailDataUrl: STUDIO_ASSETS[5].url,
    sourceImageUrl: STUDIO_ASSETS[5].url,
    width: 1600,
    height: 1200,
    updatedAt: '2026-11-23T14:20:00.000Z',
    textLayers: [
      {
        id: 'layer-seed-1',
        text: 'LIGHT & SHADOW',
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
        id: 'layer-seed-2',
        text: 'Autumn Studio Monograph · Vol. IV',
        x: 0.5,
        y: 0.56,
        fontFamily: "'Cormorant Garamond', serif",
        fontSize: 34,
        fontWeight: 600,
        color: '#D4AF37',
        letterSpacing: 2,
        lineHeight: 1.2,
        opacity: 92,
        rotation: 0,
        shadowBlur: 8,
        strokeWidth: 0,
        strokeColor: '#000000',
        align: 'center',
        uppercase: false,
      },
    ],
  },
  {
    id: 'proj-seed-video-1',
    name: 'Pacific Twilight Cinema Reel',
    tool: 'video',
    thumbnailDataUrl: STUDIO_ASSETS[4].url,
    sourceImageUrl: STUDIO_ASSETS[4].url,
    width: 1920,
    height: 1080,
    updatedAt: '2026-11-25T08:30:00.000Z',
  },
];

export function loadProjects(): ProjectItem[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (!raw) {
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(SEEDED_PROJECTS));
      return SEEDED_PROJECTS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : SEEDED_PROJECTS;
  } catch {
    return SEEDED_PROJECTS;
  }
}

export function saveProject(project: ProjectItem): ProjectItem[] {
  const existing = loadProjects().filter((p) => p.id !== project.id);
  const next = [project, ...existing].slice(0, 24);
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(next));
  } catch {
    // Trim older thumbnails if localStorage quota is tight
    const trimmed = next.slice(0, 8);
    try {
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(trimmed));
      return trimmed;
    } catch {
      return existing;
    }
  }
  return next;
}

export function deleteProject(id: string): ProjectItem[] {
  const next = loadProjects().filter((p) => p.id !== id);
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
  return next;
}

export function renameProject(id: string, newName: string): ProjectItem[] {
  const trimmed = newName.trim();
  if (!trimmed) return loadProjects();
  const next = loadProjects().map((p) =>
    p.id === id ? { ...p, name: trimmed, updatedAt: new Date().toISOString() } : p
  );
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
  return next;
}

export function clearProjects(): ProjectItem[] {
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify([]));
  } catch {
    // ignore
  }
  return [];
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export interface CreativePromptEntry {
  id: string;
  prompt: string;
  styleLabel: string;
  aspect: string;
  createdAt: string;
}

const PROMPT_HISTORY_KEY = 'dipti_creative_prompt_history_v1';

export function loadPromptHistory(): CreativePromptEntry[] {
  try {
    const raw = localStorage.getItem(PROMPT_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePromptHistoryEntry(entry: CreativePromptEntry): CreativePromptEntry[] {
  const existing = loadPromptHistory().filter((p) => p.prompt !== entry.prompt);
  const next = [entry, ...existing].slice(0, 20);
  try {
    localStorage.setItem(PROMPT_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // ignore quota
  }
  return next;
}

export function deletePromptHistoryEntry(id: string): CreativePromptEntry[] {
  const next = loadPromptHistory().filter((p) => p.id !== id);
  try {
    localStorage.setItem(PROMPT_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

