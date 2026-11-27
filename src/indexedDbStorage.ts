import {
  ExportRecord,
  ProjectHistoryEntry,
  ProjectItem,
  StorageUsageStats,
} from '../types/editor';
import { SEEDED_PROJECTS } from './storage';

const DB_NAME = 'dipti_editor_db';
const DB_VERSION = 3;
const STORE_PROJECTS = 'projects';
const STORE_HISTORY = 'project_history';
const STORE_EXPORTS = 'export_history';
const STORE_PRESETS = 'preset_library';
const STORE_GALLERY_HANDLES = 'gallery_handles';
const LEGACY_PROJECTS_KEY = 'dipti_editor_projects_v1';

export interface SaveProjectResult {
  ok: boolean;
  projects: ProjectItem[];
  savedProject?: ProjectItem;
  error?: string;
}

export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      reject(new Error('IndexedDB is unavailable in this environment.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_HISTORY)) {
        const histStore = db.createObjectStore(STORE_HISTORY, { keyPath: 'id' });
        histStore.createIndex('projectId', 'projectId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_EXPORTS)) {
        db.createObjectStore(STORE_EXPORTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_PRESETS)) {
        db.createObjectStore(STORE_PRESETS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_GALLERY_HANDLES)) {
        db.createObjectStore(STORE_GALLERY_HANDLES, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB.'));
  });
}

function txRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed.'));
  });
}

function sortByNewest<T extends { updatedAt?: string; createdAt?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return tb - ta;
  });
}

function safeJsonByteLength(val: unknown): number {
  try {
    return new Blob([JSON.stringify(val)]).size;
  } catch {
    return JSON.stringify(val).length * 2;
  }
}

export async function initAndLoadProjectsDb(): Promise<{
  projects: ProjectItem[];
  storageReady: boolean;
  error?: string;
}> {
  if (!isIndexedDbAvailable()) {
    return { projects: SEEDED_PROJECTS, storageReady: false, error: 'IndexedDB not available in current runtime.' };
  }

  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_PROJECTS, 'readonly');
    const existing = (await txRequest(tx.objectStore(STORE_PROJECTS).getAll())) as ProjectItem[];

    if (existing.length > 0) {
      db.close();
      return { projects: sortByNewest(existing), storageReady: true };
    }

    // Check legacy localStorage migration or seed defaults once
    let seedSource = SEEDED_PROJECTS;
    try {
      const legacyRaw = localStorage.getItem(LEGACY_PROJECTS_KEY);
      if (legacyRaw) {
        const parsed = JSON.parse(legacyRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          seedSource = parsed;
        }
      }
    } catch {
      // ignore legacy read issues
    }

    const writeTx = db.transaction(STORE_PROJECTS, 'readwrite');
    const store = writeTx.objectStore(STORE_PROJECTS);
    for (const proj of seedSource) {
      store.put(proj);
    }
    await new Promise<void>((resolve, reject) => {
      writeTx.oncomplete = () => resolve();
      writeTx.onerror = () => reject(writeTx.error ?? new Error('Failed to seed IndexedDB.'));
    });
    db.close();
    return { projects: sortByNewest(seedSource), storageReady: true };
  } catch (err) {
    return {
      projects: SEEDED_PROJECTS,
      storageReady: false,
      error: err instanceof Error ? err.message : 'Unable to open IndexedDB storage.',
    };
  }
}

export async function saveProjectToDb(
  project: ProjectItem,
  historyLabel = 'Saved revision'
): Promise<SaveProjectResult> {
  if (!isIndexedDbAvailable()) {
    return {
      ok: false,
      projects: SEEDED_PROJECTS,
      error: 'IndexedDB is disabled or unsupported in this browser context. Project could not be persisted.',
    };
  }

  let db: IDBDatabase | null = null;
  try {
    db = await openDatabase();
    const normalized: ProjectItem = {
      ...project,
      updatedAt: project.updatedAt || new Date().toISOString(),
    };

    const tx = db.transaction([STORE_PROJECTS, STORE_HISTORY], 'readwrite');
    tx.objectStore(STORE_PROJECTS).put(normalized);

    const historyEntry: ProjectHistoryEntry = {
      id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      projectId: normalized.id,
      projectName: normalized.name,
      tool: normalized.tool,
      label: historyLabel,
      snapshot: JSON.parse(JSON.stringify(normalized)),
      createdAt: normalized.updatedAt,
    };
    tx.objectStore(STORE_HISTORY).put(historyEntry);

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write rejected.'));
      tx.onabort = () => reject(tx.error ?? new Error('Storage quota exceeded or transaction aborted.'));
    });

    // Keep project history bounded cleanly for Android memory limits (max 30 recent revisions total)
    await pruneOldHistoryEntries(db, 30);

    const readTx = db.transaction(STORE_PROJECTS, 'readonly');
    const all = (await txRequest(readTx.objectStore(STORE_PROJECTS).getAll())) as ProjectItem[];
    db.close();
    return {
      ok: true,
      projects: sortByNewest(all),
      savedProject: normalized,
    };
  } catch (err) {
    if (db) db.close();
    return {
      ok: false,
      projects: [],
      error: err instanceof Error ? err.message : 'Failed to write project to IndexedDB.',
    };
  }
}

async function pruneOldHistoryEntries(db: IDBDatabase, maxTotal = 30): Promise<void> {
  try {
    const readTx = db.transaction(STORE_HISTORY, 'readonly');
    const all = (await txRequest(readTx.objectStore(STORE_HISTORY).getAll())) as ProjectHistoryEntry[];
    if (all.length <= maxTotal) return;
    const sorted = sortByNewest(all);
    const toRemove = sorted.slice(maxTotal);
    const delTx = db.transaction(STORE_HISTORY, 'readwrite');
    const store = delTx.objectStore(STORE_HISTORY);
    for (const item of toRemove) {
      store.delete(item.id);
    }
  } catch {
    // ignore cleanup failure
  }
}

export async function renameProjectInDb(id: string, newName: string): Promise<SaveProjectResult> {
  const trimmed = newName.trim();
  if (!trimmed) {
    return { ok: false, projects: [], error: 'Project name cannot be empty.' };
  }
  if (!isIndexedDbAvailable()) {
    return { ok: false, projects: [], error: 'IndexedDB unavailable.' };
  }
  let db: IDBDatabase | null = null;
  try {
    db = await openDatabase();
    const tx = db.transaction(STORE_PROJECTS, 'readwrite');
    const store = tx.objectStore(STORE_PROJECTS);
    const existing = (await txRequest(store.get(id))) as ProjectItem | undefined;
    if (!existing) {
      db.close();
      return { ok: false, projects: [], error: 'Project not found in IndexedDB.' };
    }
    const updated: ProjectItem = {
      ...existing,
      name: trimmed,
      updatedAt: new Date().toISOString(),
    };
    store.put(updated);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Rename failed.'));
    });
    const all = (await txRequest(
      db.transaction(STORE_PROJECTS, 'readonly').objectStore(STORE_PROJECTS).getAll()
    )) as ProjectItem[];
    db.close();
    return { ok: true, projects: sortByNewest(all), savedProject: updated };
  } catch (err) {
    if (db) db.close();
    return { ok: false, projects: [], error: err instanceof Error ? err.message : 'Rename failed.' };
  }
}

export async function duplicateProjectInDb(id: string): Promise<SaveProjectResult> {
  if (!isIndexedDbAvailable()) {
    return { ok: false, projects: [], error: 'IndexedDB unavailable.' };
  }
  let db: IDBDatabase | null = null;
  try {
    db = await openDatabase();
    const readTx = db.transaction(STORE_PROJECTS, 'readonly');
    const source = (await txRequest(readTx.objectStore(STORE_PROJECTS).get(id))) as ProjectItem | undefined;
    db.close();
    if (!source) {
      return { ok: false, projects: [], error: 'Source project not found.' };
    }
    const copy: ProjectItem = {
      ...JSON.parse(JSON.stringify(source)),
      id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: `${source.name} (Copy)`,
      updatedAt: new Date().toISOString(),
      autoSaved: false,
    };
    return await saveProjectToDb(copy, 'Duplicated project');
  } catch (err) {
    if (db) db.close();
    return { ok: false, projects: [], error: err instanceof Error ? err.message : 'Duplicate failed.' };
  }
}

export async function deleteProjectFromDb(id: string): Promise<SaveProjectResult> {
  if (!isIndexedDbAvailable()) {
    return { ok: false, projects: [], error: 'IndexedDB unavailable.' };
  }
  let db: IDBDatabase | null = null;
  try {
    db = await openDatabase();
    const histTx = db.transaction(STORE_HISTORY, 'readonly');
    const histIdx = histTx.objectStore(STORE_HISTORY).index('projectId');
    const relatedHist = (await txRequest(histIdx.getAll(id))) as ProjectHistoryEntry[];

    const tx = db.transaction([STORE_PROJECTS, STORE_HISTORY], 'readwrite');
    tx.objectStore(STORE_PROJECTS).delete(id);
    const hStore = tx.objectStore(STORE_HISTORY);
    for (const h of relatedHist) hStore.delete(h.id);

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Delete failed.'));
    });

    const all = (await txRequest(
      db.transaction(STORE_PROJECTS, 'readonly').objectStore(STORE_PROJECTS).getAll()
    )) as ProjectItem[];
    db.close();
    return { ok: true, projects: sortByNewest(all) };
  } catch (err) {
    if (db) db.close();
    return { ok: false, projects: [], error: err instanceof Error ? err.message : 'Delete failed.' };
  }
}

export async function clearProjectsInDb(): Promise<SaveProjectResult> {
  if (!isIndexedDbAvailable()) {
    return { ok: false, projects: [], error: 'IndexedDB unavailable.' };
  }
  let db: IDBDatabase | null = null;
  try {
    db = await openDatabase();
    const tx = db.transaction([STORE_PROJECTS, STORE_HISTORY], 'readwrite');
    tx.objectStore(STORE_PROJECTS).clear();
    tx.objectStore(STORE_HISTORY).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Clear failed.'));
    });
    db.close();
    return { ok: true, projects: [] };
  } catch (err) {
    if (db) db.close();
    return { ok: false, projects: [], error: err instanceof Error ? err.message : 'Clear failed.' };
  }
}

export async function loadProjectHistoryFromDb(projectId?: string): Promise<ProjectHistoryEntry[]> {
  if (!isIndexedDbAvailable()) return [];
  let db: IDBDatabase | null = null;
  try {
    db = await openDatabase();
    const tx = db.transaction(STORE_HISTORY, 'readonly');
    const store = tx.objectStore(STORE_HISTORY);
    const entries = projectId
      ? ((await txRequest(store.index('projectId').getAll(projectId))) as ProjectHistoryEntry[])
      : ((await txRequest(store.getAll())) as ProjectHistoryEntry[]);
    db.close();
    return sortByNewest(entries);
  } catch {
    if (db) db.close();
    return [];
  }
}

export async function clearProjectHistoryInDb(): Promise<boolean> {
  if (!isIndexedDbAvailable()) return false;
  let db: IDBDatabase | null = null;
  try {
    db = await openDatabase();
    const tx = db.transaction(STORE_HISTORY, 'readwrite');
    tx.objectStore(STORE_HISTORY).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Clear history failed.'));
    });
    db.close();
    return true;
  } catch {
    if (db) db.close();
    return false;
  }
}

export async function recordExportInDb(record: ExportRecord): Promise<ExportRecord[]> {
  if (!isIndexedDbAvailable()) return [];
  let db: IDBDatabase | null = null;
  try {
    db = await openDatabase();
    const tx = db.transaction(STORE_EXPORTS, 'readwrite');
    tx.objectStore(STORE_EXPORTS).put(record);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to save export record.'));
    });
    const all = (await txRequest(
      db.transaction(STORE_EXPORTS, 'readonly').objectStore(STORE_EXPORTS).getAll()
    )) as ExportRecord[];
    const sorted = sortByNewest(all);
    if (sorted.length > 40) {
      const trimTx = db.transaction(STORE_EXPORTS, 'readwrite');
      const eStore = trimTx.objectStore(STORE_EXPORTS);
      for (const old of sorted.slice(40)) eStore.delete(old.id);
    }
    db.close();
    return sorted.slice(0, 40);
  } catch {
    if (db) db.close();
    return [];
  }
}

export async function loadExportHistoryFromDb(): Promise<ExportRecord[]> {
  if (!isIndexedDbAvailable()) return [];
  let db: IDBDatabase | null = null;
  try {
    db = await openDatabase();
    const tx = db.transaction(STORE_EXPORTS, 'readonly');
    const all = (await txRequest(tx.objectStore(STORE_EXPORTS).getAll())) as ExportRecord[];
    db.close();
    return sortByNewest(all);
  } catch {
    if (db) db.close();
    return [];
  }
}

export async function clearExportHistoryInDb(): Promise<boolean> {
  if (!isIndexedDbAvailable()) return false;
  let db: IDBDatabase | null = null;
  try {
    db = await openDatabase();
    const tx = db.transaction(STORE_EXPORTS, 'readwrite');
    tx.objectStore(STORE_EXPORTS).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to clear export history.'));
    });
    db.close();
    return true;
  } catch {
    if (db) db.close();
    return false;
  }
}

export async function getStorageStatsFromDb(): Promise<StorageUsageStats> {
  let localBytes = 0;
  try {
    if (typeof localStorage !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) {
          const v = localStorage.getItem(k) || '';
          localBytes += (k.length + v.length) * 2;
        }
      }
    }
  } catch {
    // ignore
  }

  let quotaBytes: number | null = null;
  let usageBytes: number | null = null;
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      quotaBytes = typeof est.quota === 'number' ? est.quota : null;
      usageBytes = typeof est.usage === 'number' ? est.usage : null;
    }
  } catch {
    // ignore
  }

  if (!isIndexedDbAvailable()) {
    return {
      indexedDbSupported: false,
      projectCount: 0,
      historyCount: 0,
      exportCount: 0,
      projectsBytes: 0,
      historyBytes: 0,
      exportsBytes: 0,
      localStorageBytes: localBytes,
      quotaBytes,
      usageBytes,
    };
  }

  let db: IDBDatabase | null = null;
  try {
    db = await openDatabase();
    const tx = db.transaction([STORE_PROJECTS, STORE_HISTORY, STORE_EXPORTS], 'readonly');
    const [projects, history, exportsList] = await Promise.all([
      txRequest(tx.objectStore(STORE_PROJECTS).getAll()) as Promise<ProjectItem[]>,
      txRequest(tx.objectStore(STORE_HISTORY).getAll()) as Promise<ProjectHistoryEntry[]>,
      txRequest(tx.objectStore(STORE_EXPORTS).getAll()) as Promise<ExportRecord[]>,
    ]);
    db.close();
    return {
      indexedDbSupported: true,
      projectCount: projects.length,
      historyCount: history.length,
      exportCount: exportsList.length,
      projectsBytes: safeJsonByteLength(projects),
      historyBytes: safeJsonByteLength(history),
      exportsBytes: safeJsonByteLength(exportsList),
      localStorageBytes: localBytes,
      quotaBytes,
      usageBytes,
    };
  } catch {
    if (db) db.close();
    return {
      indexedDbSupported: true,
      projectCount: 0,
      historyCount: 0,
      exportCount: 0,
      projectsBytes: 0,
      historyBytes: 0,
      exportsBytes: 0,
      localStorageBytes: localBytes,
      quotaBytes,
      usageBytes,
    };
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
