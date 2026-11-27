import { PhotoAdjustments } from '../types/editor';
import {
  LibraryPresetItem,
  PresetCategory,
  PresetLibraryMetaRecord,
} from '../types/presetLibrary';
import { BUILT_IN_LIBRARY_PRESETS } from '../data/customPresetLibrary';

const DB_NAME = 'dipti_editor_db';
const DB_VERSION = 3;
const STORE_PROJECTS = 'projects';
const STORE_HISTORY = 'project_history';
const STORE_EXPORTS = 'export_history';
const STORE_PRESETS = 'preset_library';
const STORE_GALLERY_HANDLES = 'gallery_handles';

const META_ID = '__library_meta__';
const LS_CUSTOM_KEY = 'dipti_custom_preset_library_v1';
const LS_META_KEY = 'dipti_custom_preset_meta_v1';

const DEFAULT_META: PresetLibraryMetaRecord = {
  id: META_ID,
  favorites: [],
  renamed: {},
  deletedBuiltins: [],
};

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_HISTORY)) {
        const hist = db.createObjectStore(STORE_HISTORY, { keyPath: 'id' });
        hist.createIndex('projectId', 'projectId', { unique: false });
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

function txReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB operation failed.'));
  });
}

function readLocalFallback(): { customs: LibraryPresetItem[]; meta: PresetLibraryMetaRecord } {
  let customs: LibraryPresetItem[] = [];
  let meta: PresetLibraryMetaRecord = { ...DEFAULT_META };
  try {
    const rawC = localStorage.getItem(LS_CUSTOM_KEY);
    if (rawC) {
      const parsed = JSON.parse(rawC);
      if (Array.isArray(parsed)) customs = parsed;
    }
    const rawM = localStorage.getItem(LS_META_KEY);
    if (rawM) {
      meta = { ...DEFAULT_META, ...JSON.parse(rawM) };
    }
  } catch {
    // ignore storage fallback errors
  }
  return { customs, meta };
}

function writeLocalFallback(customs: LibraryPresetItem[], meta: PresetLibraryMetaRecord): void {
  try {
    localStorage.setItem(LS_CUSTOM_KEY, JSON.stringify(customs));
    localStorage.setItem(LS_META_KEY, JSON.stringify(meta));
  } catch {
    // ignore quota errors
  }
}

async function readStoreRecords(): Promise<{
  customs: LibraryPresetItem[];
  meta: PresetLibraryMetaRecord;
  usingIndexedDb: boolean;
}> {
  if (!hasIndexedDb()) {
    return { ...readLocalFallback(), usingIndexedDb: false };
  }
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    const tx = db.transaction(STORE_PRESETS, 'readonly');
    const all = (await txReq(tx.objectStore(STORE_PRESETS).getAll())) as Array<
      LibraryPresetItem | PresetLibraryMetaRecord
    >;
    db.close();

    const metaRec = all.find((r) => r.id === META_ID) as PresetLibraryMetaRecord | undefined;
    const customs = all.filter((r) => r.id !== META_ID) as LibraryPresetItem[];
    return {
      customs: customs.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
      meta: metaRec ? { ...DEFAULT_META, ...metaRec } : { ...DEFAULT_META },
      usingIndexedDb: true,
    };
  } catch {
    if (db) db.close();
    return { ...readLocalFallback(), usingIndexedDb: false };
  }
}

async function putRecord(record: LibraryPresetItem | PresetLibraryMetaRecord): Promise<void> {
  if (hasIndexedDb()) {
    let db: IDBDatabase | null = null;
    try {
      db = await openDb();
      const tx = db.transaction(STORE_PRESETS, 'readwrite');
      tx.objectStore(STORE_PRESETS).put(record);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Write failed'));
      });
      db.close();
    } catch {
      if (db) db.close();
    }
  }
  const fb = readLocalFallback();
  if (record.id === META_ID) {
    writeLocalFallback(fb.customs, record as PresetLibraryMetaRecord);
  } else {
    const nextCustoms = [
      record as LibraryPresetItem,
      ...fb.customs.filter((c) => c.id !== record.id),
    ];
    writeLocalFallback(nextCustoms, fb.meta);
  }
}

async function deleteCustomRecord(id: string): Promise<void> {
  if (hasIndexedDb()) {
    let db: IDBDatabase | null = null;
    try {
      db = await openDb();
      const tx = db.transaction(STORE_PRESETS, 'readwrite');
      tx.objectStore(STORE_PRESETS).delete(id);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Delete failed'));
      });
      db.close();
    } catch {
      if (db) db.close();
    }
  }
  const fb = readLocalFallback();
  writeLocalFallback(
    fb.customs.filter((c) => c.id !== id),
    fb.meta
  );
}

export function mergeBuiltinsAndCustomPresets(
  customs: LibraryPresetItem[],
  meta: PresetLibraryMetaRecord
): { presets: LibraryPresetItem[]; hiddenBuiltinCount: number } {
  const deletedSet = new Set(meta.deletedBuiltins);
  const favSet = new Set(meta.favorites);

  const visibleBuiltins: LibraryPresetItem[] = BUILT_IN_LIBRARY_PRESETS.filter(
    (p) => !deletedSet.has(p.id)
  ).map((p) => ({
    ...p,
    name: meta.renamed[p.id] ?? p.name,
    isFavorite: favSet.has(p.id),
  }));

  const normalizedCustoms: LibraryPresetItem[] = customs.map((c) => ({
    ...c,
    isBuiltIn: false,
    isFavorite: favSet.has(c.id) || Boolean(c.isFavorite),
  }));

  return {
    presets: [...normalizedCustoms, ...visibleBuiltins],
    hiddenBuiltinCount: deletedSet.size,
  };
}

export async function loadPresetLibrary(): Promise<{
  presets: LibraryPresetItem[];
  hiddenBuiltinCount: number;
  usingIndexedDb: boolean;
}> {
  const { customs, meta, usingIndexedDb } = await readStoreRecords();
  const merged = mergeBuiltinsAndCustomPresets(customs, meta);
  return { ...merged, usingIndexedDb };
}

export async function createCustomLibraryPreset(input: {
  name: string;
  category: PresetCategory;
  description?: string;
  accentColor?: string;
  adjustments: Partial<PhotoAdjustments>;
}): Promise<{ presets: LibraryPresetItem[]; created: LibraryPresetItem; hiddenBuiltinCount: number }> {
  const now = new Date().toISOString();
  const cleanName = input.name.trim() || `Custom Preset ${new Date().toLocaleTimeString()}`;
  const created: LibraryPresetItem = {
    id: `lib-custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: cleanName,
    category: input.category,
    description: input.description?.trim() || 'Saved custom color & tone recipe',
    accentColor: input.accentColor || '#D4AF37',
    adjustments: JSON.parse(JSON.stringify(input.adjustments)) as Partial<PhotoAdjustments>,
    isBuiltIn: false,
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
  };

  await putRecord(created);
  const loaded = await loadPresetLibrary();
  return {
    presets: loaded.presets,
    created,
    hiddenBuiltinCount: loaded.hiddenBuiltinCount,
  };
}

export async function toggleFavoriteLibraryPreset(
  id: string
): Promise<{ presets: LibraryPresetItem[]; hiddenBuiltinCount: number }> {
  const { customs, meta } = await readStoreRecords();
  const favSet = new Set(meta.favorites);
  if (favSet.has(id)) favSet.delete(id);
  else favSet.add(id);

  const nextMeta: PresetLibraryMetaRecord = {
    ...meta,
    favorites: Array.from(favSet),
  };
  await putRecord(nextMeta);

  const customMatch = customs.find((c) => c.id === id);
  if (customMatch) {
    await putRecord({
      ...customMatch,
      isFavorite: favSet.has(id),
      updatedAt: new Date().toISOString(),
    });
  }

  const loaded = await loadPresetLibrary();
  return { presets: loaded.presets, hiddenBuiltinCount: loaded.hiddenBuiltinCount };
}

export async function renameLibraryPreset(
  id: string,
  newName: string
): Promise<{ presets: LibraryPresetItem[]; hiddenBuiltinCount: number }> {
  const trimmed = newName.trim();
  if (!trimmed) {
    const cur = await loadPresetLibrary();
    return { presets: cur.presets, hiddenBuiltinCount: cur.hiddenBuiltinCount };
  }

  const { customs, meta } = await readStoreRecords();
  const customMatch = customs.find((c) => c.id === id);
  if (customMatch) {
    await putRecord({
      ...customMatch,
      name: trimmed,
      updatedAt: new Date().toISOString(),
    });
  } else {
    const nextMeta: PresetLibraryMetaRecord = {
      ...meta,
      renamed: { ...meta.renamed, [id]: trimmed },
    };
    await putRecord(nextMeta);
  }

  const loaded = await loadPresetLibrary();
  return { presets: loaded.presets, hiddenBuiltinCount: loaded.hiddenBuiltinCount };
}

export async function deleteLibraryPreset(
  id: string
): Promise<{ presets: LibraryPresetItem[]; hiddenBuiltinCount: number }> {
  const { customs, meta } = await readStoreRecords();
  const isCustom = customs.some((c) => c.id === id);

  if (isCustom) {
    await deleteCustomRecord(id);
    if (meta.favorites.includes(id)) {
      await putRecord({
        ...meta,
        favorites: meta.favorites.filter((fid) => fid !== id),
      });
    }
  } else {
    const delSet = new Set(meta.deletedBuiltins);
    delSet.add(id);
    await putRecord({
      ...meta,
      deletedBuiltins: Array.from(delSet),
      favorites: meta.favorites.filter((fid) => fid !== id),
    });
  }

  const loaded = await loadPresetLibrary();
  return { presets: loaded.presets, hiddenBuiltinCount: loaded.hiddenBuiltinCount };
}

export async function restoreHiddenBuiltinPresets(): Promise<{
  presets: LibraryPresetItem[];
  hiddenBuiltinCount: number;
}> {
  const { meta } = await readStoreRecords();
  await putRecord({
    ...meta,
    deletedBuiltins: [],
  });
  const loaded = await loadPresetLibrary();
  return { presets: loaded.presets, hiddenBuiltinCount: loaded.hiddenBuiltinCount };
}
