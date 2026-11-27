import { AppSettings, ExportRecord, GalleryDeliveryChannel } from '../types/editor';
import { createThumbnailDataUrl } from './canvasEngine';
import { ImageExportFormat, encodeCanvasToBlob } from './exportEngine';

const DB_NAME = 'dipti_editor_db';
const DB_VERSION = 3;
const STORE_PROJECTS = 'projects';
const STORE_HISTORY = 'project_history';
const STORE_EXPORTS = 'export_history';
const STORE_PRESETS = 'preset_library';
const STORE_GALLERY_HANDLES = 'gallery_handles';

const HANDLE_RECORD_ID = 'primary-gallery-folder';
const RECENT_SAVES_KEY = 'dipti_gallery_recent_saves_v1';
const MAX_RECENT_SIGNATURES = 40;

export interface AndroidGallerySaveResponse {
  saved: boolean;
  contentUri?: string;
  relativePath?: string;
  error?: string;
}

export interface AndroidPermissionStatus {
  granted: boolean;
  sdkInt?: number;
  permissionName?: string;
  message?: string;
}

export interface DiptiAndroidGalleryBridge {
  checkPermissions?: () => Promise<AndroidPermissionStatus>;
  requestPermissions?: () => Promise<AndroidPermissionStatus>;
  saveMediaToGallery: (payload: {
    base64Data: string;
    fileName: string;
    mimeType: string;
    mediaType: 'image' | 'video';
    albumName: string;
    collection: 'Pictures' | 'Movies';
    width: number;
    height: number;
  }) => Promise<AndroidGallerySaveResponse>;
}

interface FileSystemWritableLike {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
}

interface FileSystemFileHandleLike {
  getFile: () => Promise<File>;
  createWritable: () => Promise<FileSystemWritableLike>;
}

interface FileSystemDirectoryHandleLike {
  name: string;
  queryPermission?: (opts: { mode: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission?: (opts: { mode: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
  getDirectoryHandle: (name: string, opts?: { create?: boolean }) => Promise<FileSystemDirectoryHandleLike>;
  getFileHandle: (name: string, opts?: { create?: boolean }) => Promise<FileSystemFileHandleLike>;
}

interface GalleryHandleRecord {
  id: string;
  folderName: string;
  handle: FileSystemDirectoryHandleLike;
  linkedAt: string;
}

export interface GalleryRuntimeCapabilities {
  hasAndroidMediaStoreBridge: boolean;
  hasSafDirectoryPicker: boolean;
  hasLinkedSafFolder: boolean;
  linkedSafFolderName: string | null;
  safPermissionState: 'granted' | 'prompt' | 'denied' | 'unsupported' | 'unlinked';
  recommendedMethod: 'android-mediastore' | 'saf-directory' | 'browser-download';
  methodLabel: string;
  honestCapabilitySummary: string;
}

export interface RecentGallerySaveEntry {
  signature: string;
  fileName: string;
  mediaType: 'image' | 'video';
  format: string;
  width: number;
  height: number;
  sizeBytes: number;
  delivery: GalleryDeliveryChannel;
  albumName: string;
  savedAt: string;
}

export interface GallerySaveRequest {
  blob: Blob;
  fileName: string;
  mimeType: string;
  mediaType: 'image' | 'video';
  format: 'jpg' | 'png' | 'webp' | 'mp4' | 'webm';
  width: number;
  height: number;
  settings: Pick<
    AppSettings,
    'autoSaveToGallery' | 'galleryAlbumName' | 'preventDuplicateGallerySaves'
  >;
  triggerSource: 'save' | 'export' | 'manual';
  forceDuplicate?: boolean;
  projectId?: string;
  quality?: number;
  frameRate?: number;
  thumbnailDataUrl?: string;
  onProgress?: (progressPct: number, stageLabel: string) => void;
  onRecordExport?: (record: ExportRecord) => Promise<void> | void;
}

export interface GallerySaveResult {
  saved: boolean;
  isDirectGallery: boolean;
  delivery: GalleryDeliveryChannel;
  fileName: string;
  albumName: string;
  locationLabel: string;
  sizeBytes: number;
  signature: string;
  duplicatePrevented?: boolean;
  skippedBySetting?: boolean;
  permissionDenied?: boolean;
  statusMessage: string;
  error?: string;
}

const inFlightSignatures = new Set<string>();

function getAndroidBridge(): DiptiAndroidGalleryBridge | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    DiptiAndroidGallery?: DiptiAndroidGalleryBridge;
    Capacitor?: {
      isNativePlatform?: () => boolean;
      Plugins?: { DiptiMediaStore?: DiptiAndroidGalleryBridge };
    };
  };
  if (win.DiptiAndroidGallery && typeof win.DiptiAndroidGallery.saveMediaToGallery === 'function') {
    return win.DiptiAndroidGallery;
  }
  if (
    win.Capacitor?.isNativePlatform?.() &&
    win.Capacitor.Plugins?.DiptiMediaStore &&
    typeof win.Capacitor.Plugins.DiptiMediaStore.saveMediaToGallery === 'function'
  ) {
    return win.Capacitor.Plugins.DiptiMediaStore;
  }
  return null;
}

export function isSafDirectorySupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
  );
}

function sanitizeAlbumName(raw?: string): string {
  const cleaned = (raw || 'DIPTI EDITOR').replace(/[\\/:*?"<>|]/g, '').trim();
  return cleaned || 'DIPTI EDITOR';
}

function openHandlesDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
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

async function readLinkedHandleRecord(): Promise<GalleryHandleRecord | null> {
  if (typeof indexedDB === 'undefined') return null;
  let db: IDBDatabase | null = null;
  try {
    db = await openHandlesDb();
    const tx = db.transaction(STORE_GALLERY_HANDLES, 'readonly');
    const rec = await new Promise<GalleryHandleRecord | undefined>((resolve, reject) => {
      const req = tx.objectStore(STORE_GALLERY_HANDLES).get(HANDLE_RECORD_ID);
      req.onsuccess = () => resolve(req.result as GalleryHandleRecord | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return rec ?? null;
  } catch {
    if (db) db.close();
    return null;
  }
}

async function writeLinkedHandleRecord(record: GalleryHandleRecord): Promise<void> {
  const db = await openHandlesDb();
  const tx = db.transaction(STORE_GALLERY_HANDLES, 'readwrite');
  tx.objectStore(STORE_GALLERY_HANDLES).put(record);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to save folder handle.'));
  });
  db.close();
}

export async function unlinkDeviceGalleryFolder(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  let db: IDBDatabase | null = null;
  try {
    db = await openHandlesDb();
    const tx = db.transaction(STORE_GALLERY_HANDLES, 'readwrite');
    tx.objectStore(STORE_GALLERY_HANDLES).delete(HANDLE_RECORD_ID);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    if (db) db.close();
  }
}

export async function linkDeviceGalleryFolder(
  albumName = 'DIPTI EDITOR'
): Promise<{ ok: boolean; folderName?: string; albumPath?: string; error?: string }> {
  if (!isSafDirectorySupported()) {
    return {
      ok: false,
      error:
        'Direct folder linking (Storage Access Framework) is not supported in this browser. Files will download cleanly to your Downloads folder instead.',
    };
  }
  try {
    const showDirPicker = (
      window as unknown as {
        showDirectoryPicker: (opts?: {
          id?: string;
          mode?: 'read' | 'readwrite';
          startIn?: string;
        }) => Promise<FileSystemDirectoryHandleLike>;
      }
    ).showDirectoryPicker;

    const handle = await showDirPicker({
      id: 'dipti-editor-gallery',
      mode: 'readwrite',
      startIn: 'pictures',
    });

    const cleanAlbum = sanitizeAlbumName(albumName);
    // Pre-create dedicated DIPTI EDITOR folder to verify write access immediately
    const albumDir =
      handle.name.toUpperCase() === cleanAlbum.toUpperCase()
        ? handle
        : await handle.getDirectoryHandle(cleanAlbum, { create: true });

    await writeLinkedHandleRecord({
      id: HANDLE_RECORD_ID,
      folderName: handle.name,
      handle,
      linkedAt: new Date().toISOString(),
    });

    return {
      ok: true,
      folderName: handle.name,
      albumPath: `${handle.name}/${albumDir.name}`,
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, error: 'Folder selection cancelled.' };
    }
    if (err instanceof Error && err.name === 'SecurityError') {
      return {
        ok: false,
        error:
          'Folder access picker is blocked inside an embedded preview iframe. Open in a top-level browser tab or native Android app.',
      };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unable to link device gallery folder.',
    };
  }
}

export async function detectGalleryRuntimeCapabilities(): Promise<GalleryRuntimeCapabilities> {
  const bridge = getAndroidBridge();
  const safSupported = isSafDirectorySupported();
  const linked = safSupported ? await readLinkedHandleRecord() : null;

  let safPerm: GalleryRuntimeCapabilities['safPermissionState'] = !safSupported
    ? 'unsupported'
    : !linked
      ? 'unlinked'
      : 'prompt';

  if (linked && linked.handle.queryPermission) {
    try {
      const state = await linked.handle.queryPermission({ mode: 'readwrite' });
      safPerm = state;
    } catch {
      safPerm = 'prompt';
    }
  }

  if (bridge) {
    return {
      hasAndroidMediaStoreBridge: true,
      hasSafDirectoryPicker: safSupported,
      hasLinkedSafFolder: Boolean(linked),
      linkedSafFolderName: linked?.folderName ?? null,
      safPermissionState: safPerm,
      recommendedMethod: 'android-mediastore',
      methodLabel: 'Android MediaStore API (Direct Gallery)',
      honestCapabilitySummary:
        'Running with native Android MediaStore integration. Photos save directly to Pictures/DIPTI EDITOR and videos save directly to Movies/DIPTI EDITOR.',
    };
  }

  if (safSupported && linked) {
    return {
      hasAndroidMediaStoreBridge: false,
      hasSafDirectoryPicker: true,
      hasLinkedSafFolder: true,
      linkedSafFolderName: linked.folderName,
      safPermissionState: safPerm,
      recommendedMethod: 'saf-directory',
      methodLabel: `Linked Device Folder (${linked.folderName}/DIPTI EDITOR)`,
      honestCapabilitySummary: `Saves directly into "${linked.folderName}/DIPTI EDITOR" via the browser Storage Access Framework without download dialogs.`,
    };
  }

  if (safSupported) {
    return {
      hasAndroidMediaStoreBridge: false,
      hasSafDirectoryPicker: true,
      hasLinkedSafFolder: false,
      linkedSafFolderName: null,
      safPermissionState: 'unlinked',
      recommendedMethod: 'browser-download',
      methodLabel: 'Web Browser Downloads (Link a Folder for Direct Album Saving)',
      honestCapabilitySummary:
        'Browser mode active: exports save to your device Downloads folder unless you link a Pictures/Movies folder below via Storage Access Framework. Native Android builds use MediaStore automatically.',
    };
  }

  return {
    hasAndroidMediaStoreBridge: false,
    hasSafDirectoryPicker: false,
    hasLinkedSafFolder: false,
    linkedSafFolderName: null,
    safPermissionState: 'unsupported',
    recommendedMethod: 'browser-download',
    methodLabel: 'Web Browser Download Mechanism',
    honestCapabilitySummary:
      'Running in a web browser without File System Access folder APIs: exports save to your device Downloads folder automatically (distinct from native Android MediaStore Gallery indexing).',
  };
}

export async function requestAndroidGalleryPermissions(): Promise<AndroidPermissionStatus> {
  const bridge = getAndroidBridge();
  if (!bridge) {
    return {
      granted: false,
      message:
        'Native Android MediaStore bridge not attached in web preview. On web, use Browser Downloads or link a device folder via Storage Access Framework.',
    };
  }
  try {
    if (bridge.checkPermissions) {
      const current = await bridge.checkPermissions();
      if (current.granted) return current;
    }
    if (bridge.requestPermissions) {
      return await bridge.requestPermissions();
    }
    return { granted: true };
  } catch (err) {
    return {
      granted: false,
      message: err instanceof Error ? err.message : 'Android storage permission request failed.',
    };
  }
}

function readRecentSaves(): RecentGallerySaveEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_SAVES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecentGallerySaveEntry[]) : [];
  } catch {
    return [];
  }
}

function writeRecentSave(entry: RecentGallerySaveEntry): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const existing = readRecentSaves().filter((e) => e.signature !== entry.signature);
    const next = [entry, ...existing].slice(0, MAX_RECENT_SIGNATURES);
    localStorage.setItem(RECENT_SAVES_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
}

export function clearGalleryDuplicateHistory(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(RECENT_SAVES_KEY);
  } catch {
    // ignore
  }
}

/**
 * Computes a deterministic content + metadata signature without buffering large videos fully in RAM.
 */
export async function computeMediaFingerprint(
  blob: Blob,
  mediaType: 'image' | 'video',
  format: string,
  width: number,
  height: number
): Promise<string> {
  let hash = BigInt('0xcbf29ce484222325');
  const prime = BigInt('0x100000001b3');
  const mask = BigInt('0xffffffffffffffff');

  const feedStr = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      hash ^= BigInt(s.charCodeAt(i) & 0xff);
      hash = (hash * prime) & mask;
    }
  };

  const feedBytes = (bytes: Uint8Array) => {
    for (let i = 0; i < bytes.length; i++) {
      hash ^= BigInt(bytes[i]);
      hash = (hash * prime) & mask;
    }
  };

  feedStr(`${mediaType}|${format}|${width}x${height}|${blob.size}|`);

  const readSliceBytes = async (start: number, end: number): Promise<Uint8Array> => {
    const slice = blob.slice(Math.max(0, start), Math.min(blob.size, end));
    if (typeof slice.arrayBuffer === 'function') {
      return new Uint8Array(await slice.arrayBuffer());
    }
    return new Uint8Array(await new Response(slice).arrayBuffer());
  };

  const sampleSize = 64;
  if (blob.size <= sampleSize * 3) {
    feedBytes(await readSliceBytes(0, blob.size));
  } else {
    feedBytes(await readSliceBytes(0, sampleSize));
    const mid = Math.floor(blob.size / 2);
    feedBytes(await readSliceBytes(mid - 32, mid + 32));
    feedBytes(await readSliceBytes(blob.size - sampleSize, blob.size));
  }

  return hash.toString(16).padStart(16, '0');
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === 'undefined') {
      reject(new Error('FileReader unavailable to encode media payload.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const res = typeof reader.result === 'string' ? reader.result : '';
      const comma = res.indexOf(',');
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read media bytes.'));
    reader.readAsDataURL(blob);
  });
}

function triggerVerifiedBrowserDownload(blob: Blob, fileName: string): { ok: boolean; error?: string } {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
    return { ok: false, error: 'Browser download API is unavailable in this environment.' };
  }
  try {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 6000);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Browser download failed.',
    };
  }
}

export async function saveMediaToGallery(req: GallerySaveRequest): Promise<GallerySaveResult> {
  const albumName = sanitizeAlbumName(req.settings.galleryAlbumName);

  if (!req.blob || req.blob.size === 0) {
    return {
      saved: false,
      isDirectGallery: false,
      delivery: 'skipped-disabled',
      fileName: req.fileName,
      albumName,
      locationLabel: 'Not saved',
      sizeBytes: 0,
      signature: '',
      statusMessage: 'Cannot save empty 0-byte media file.',
      error: 'Rendered output contained 0 bytes; nothing was written to Gallery.',
    };
  }

  // Respect Auto-Save to Gallery setting when triggered automatically by Save/Export
  if (!req.settings.autoSaveToGallery && req.triggerSource !== 'manual') {
    const skippedRes: GallerySaveResult = {
      saved: false,
      isDirectGallery: false,
      delivery: 'skipped-disabled',
      fileName: req.fileName,
      albumName,
      locationLabel: 'Auto-save disabled in Settings',
      sizeBytes: req.blob.size,
      signature: '',
      skippedBySetting: true,
      statusMessage:
        'Auto-Save to Gallery is disabled in Settings. Enable it in Settings or use Download to save manually.',
    };
    return skippedRes;
  }

  req.onProgress?.(18, 'Checking duplicate protection...');
  const signature = await computeMediaFingerprint(
    req.blob,
    req.mediaType,
    req.format,
    req.width,
    req.height
  );

  // Prevent concurrent double-tap duplicate writes
  if (inFlightSignatures.has(signature)) {
    return {
      saved: false,
      isDirectGallery: false,
      delivery: 'duplicate-skipped',
      fileName: req.fileName,
      albumName,
      locationLabel: 'Save already in progress',
      sizeBytes: req.blob.size,
      signature,
      duplicatePrevented: true,
      statusMessage: 'Save already in progress — prevented duplicate write.',
    };
  }

  // Prevent accidental duplicate saves of the exact unmodified output
  if (req.settings.preventDuplicateGallerySaves && !req.forceDuplicate) {
    const existing = readRecentSaves().find((e) => e.signature === signature);
    if (existing) {
      return {
        saved: false,
        isDirectGallery:
          existing.delivery === 'android-mediastore' || existing.delivery === 'saf-directory',
        delivery: 'duplicate-skipped',
        fileName: existing.fileName,
        albumName: existing.albumName,
        locationLabel: `Already saved as ${existing.fileName}`,
        sizeBytes: req.blob.size,
        signature,
        duplicatePrevented: true,
        statusMessage: `Already saved to ${existing.albumName} (${existing.fileName}) — accidental duplicate save prevented.`,
      };
    }
  }

  inFlightSignatures.add(signature);
  try {
    // 1. Native Android MediaStore path when running inside Android APK WebView / Capacitor
    const bridge = getAndroidBridge();
    if (bridge) {
      req.onProgress?.(35, 'Checking Android storage permissions...');
      if (bridge.checkPermissions && bridge.requestPermissions) {
        const perm = await bridge.checkPermissions();
        if (!perm.granted) {
          const requested = await bridge.requestPermissions();
          if (!requested.granted) {
            return {
              saved: false,
              isDirectGallery: false,
              delivery: 'skipped-disabled',
              fileName: req.fileName,
              albumName,
              locationLabel: 'Permission denied',
              sizeBytes: req.blob.size,
              signature,
              permissionDenied: true,
              statusMessage: 'Android storage permission denied.',
              error:
                requested.message ||
                'Storage permission was denied. Grant Photos/Media permission in Android settings to save to Gallery.',
            };
          }
        }
      }

      req.onProgress?.(60, `Saving to Android MediaStore (${albumName})...`);
      const base64Data = await blobToBase64(req.blob);
      const collection = req.mediaType === 'video' ? 'Movies' : 'Pictures';
      const nativeRes = await bridge.saveMediaToGallery({
        base64Data,
        fileName: req.fileName,
        mimeType: req.mimeType,
        mediaType: req.mediaType,
        albumName,
        collection,
        width: req.width,
        height: req.height,
      });

      if (!nativeRes.saved) {
        return {
          saved: false,
          isDirectGallery: false,
          delivery: 'android-mediastore',
          fileName: req.fileName,
          albumName,
          locationLabel: 'Write failed',
          sizeBytes: req.blob.size,
          signature,
          statusMessage: 'Failed to save to Android MediaStore.',
          error: nativeRes.error || 'Android MediaStore rejected the media write.',
        };
      }

      const locationLabel =
        nativeRes.relativePath || `${collection}/${albumName}/${req.fileName}`;
      req.onProgress?.(100, 'Saved to Phone Gallery');

      writeRecentSave({
        signature,
        fileName: req.fileName,
        mediaType: req.mediaType,
        format: req.format,
        width: req.width,
        height: req.height,
        sizeBytes: req.blob.size,
        delivery: 'android-mediastore',
        albumName,
        savedAt: new Date().toISOString(),
      });

      await req.onRecordExport?.({
        id: `exp-gal-${Date.now()}`,
        projectId: req.projectId,
        fileName: req.fileName,
        mediaType: req.mediaType,
        format: req.format,
        resolutionLabel: `${req.width}×${req.height}`,
        width: req.width,
        height: req.height,
        quality: req.quality,
        frameRate: req.frameRate,
        fileSizeBytes: req.blob.size,
        status: 'completed',
        thumbnailDataUrl: req.thumbnailDataUrl,
        galleryDelivery: 'android-mediastore',
        albumName,
        galleryLocationLabel: locationLabel,
        createdAt: new Date().toISOString(),
      });

      return {
        saved: true,
        isDirectGallery: true,
        delivery: 'android-mediastore',
        fileName: req.fileName,
        albumName,
        locationLabel,
        sizeBytes: req.blob.size,
        signature,
        statusMessage: `Saved ${req.mediaType === 'video' ? 'video' : 'photo'} directly to Phone Gallery (${locationLabel}).`,
      };
    }

    // 2. Web Storage Access Framework (SAF) linked folder when configured
    const linked = isSafDirectorySupported() ? await readLinkedHandleRecord() : null;
    if (linked) {
      req.onProgress?.(45, `Verifying permission for ${linked.folderName}...`);
      let permState: 'granted' | 'denied' | 'prompt' = 'granted';
      if (linked.handle.queryPermission) {
        permState = await linked.handle.queryPermission({ mode: 'readwrite' });
      }
      if (permState !== 'granted' && linked.handle.requestPermission) {
        permState = await linked.handle.requestPermission({ mode: 'readwrite' });
      }

      if (permState === 'granted') {
        req.onProgress?.(72, `Writing to ${linked.folderName}/${albumName}...`);
        const albumDir =
          linked.handle.name.toUpperCase() === albumName.toUpperCase()
            ? linked.handle
            : await linked.handle.getDirectoryHandle(albumName, { create: true });

        const targetHandle = await albumDir.getFileHandle(req.fileName, { create: true });
        const writable = await targetHandle.createWritable();
        await writable.write(req.blob);
        await writable.close();

        // Verify the actual file written on disk is non-empty and matches blob size
        const writtenFile = await targetHandle.getFile();
        if (writtenFile.size !== req.blob.size) {
          throw new Error(
            `Verification mismatch: wrote ${writtenFile.size} bytes of ${req.blob.size} bytes.`
          );
        }

        const locationLabel = `${linked.folderName}/${albumDir.name}/${req.fileName}`;
        req.onProgress?.(100, `Saved to ${albumName} folder`);

        writeRecentSave({
          signature,
          fileName: req.fileName,
          mediaType: req.mediaType,
          format: req.format,
          width: req.width,
          height: req.height,
          sizeBytes: req.blob.size,
          delivery: 'saf-directory',
          albumName,
          savedAt: new Date().toISOString(),
        });

        await req.onRecordExport?.({
          id: `exp-gal-${Date.now()}`,
          projectId: req.projectId,
          fileName: req.fileName,
          mediaType: req.mediaType,
          format: req.format,
          resolutionLabel: `${req.width}×${req.height}`,
          width: req.width,
          height: req.height,
          quality: req.quality,
          frameRate: req.frameRate,
          fileSizeBytes: req.blob.size,
          status: 'completed',
          thumbnailDataUrl: req.thumbnailDataUrl,
          galleryDelivery: 'saf-directory',
          albumName,
          galleryLocationLabel: locationLabel,
          createdAt: new Date().toISOString(),
        });

        return {
          saved: true,
          isDirectGallery: true,
          delivery: 'saf-directory',
          fileName: req.fileName,
          albumName,
          locationLabel,
          sizeBytes: req.blob.size,
          signature,
          statusMessage: `Saved automatically to linked folder "${locationLabel}" via Storage Access Framework.`,
        };
      }
      // If user denied SAF permission when prompted, surface clear error rather than lying
      if (permState === 'denied') {
        return {
          saved: false,
          isDirectGallery: false,
          delivery: 'saf-directory',
          fileName: req.fileName,
          albumName,
          locationLabel: 'Folder permission denied',
          sizeBytes: req.blob.size,
          signature,
          permissionDenied: true,
          statusMessage: 'Folder write permission was denied.',
          error: `Write permission for "${linked.folderName}" was denied. Re-grant folder access in Settings or unlink it to use browser Downloads.`,
        };
      }
    }

    // 3. Standard Web App Fallback: Verified Browser Download (explicitly distinguished from native MediaStore Gallery)
    req.onProgress?.(78, 'Preparing browser download...');
    const dl = triggerVerifiedBrowserDownload(req.blob, req.fileName);
    if (!dl.ok) {
      return {
        saved: false,
        isDirectGallery: false,
        delivery: 'browser-download',
        fileName: req.fileName,
        albumName,
        locationLabel: 'Download failed',
        sizeBytes: req.blob.size,
        signature,
        statusMessage: 'Browser download failed.',
        error: dl.error || 'Unable to trigger download in this browser.',
      };
    }

    const locationLabel = `Downloads/${req.fileName} (Web Browser Mode)`;
    req.onProgress?.(100, 'Downloaded to device Downloads folder');

    writeRecentSave({
      signature,
      fileName: req.fileName,
      mediaType: req.mediaType,
      format: req.format,
      width: req.width,
      height: req.height,
      sizeBytes: req.blob.size,
      delivery: 'browser-download',
      albumName,
      savedAt: new Date().toISOString(),
    });

    await req.onRecordExport?.({
      id: `exp-gal-${Date.now()}`,
      projectId: req.projectId,
      fileName: req.fileName,
      mediaType: req.mediaType,
      format: req.format,
      resolutionLabel: `${req.width}×${req.height}`,
      width: req.width,
      height: req.height,
      quality: req.quality,
      frameRate: req.frameRate,
      fileSizeBytes: req.blob.size,
      status: 'completed',
      thumbnailDataUrl: req.thumbnailDataUrl,
      galleryDelivery: 'browser-download',
      albumName,
      galleryLocationLabel: locationLabel,
      createdAt: new Date().toISOString(),
    });

    return {
      saved: true,
      isDirectGallery: false,
      delivery: 'browser-download',
      fileName: req.fileName,
      albumName,
      locationLabel,
      sizeBytes: req.blob.size,
      signature,
      statusMessage:
        'Saved via browser download to your device Downloads folder (web browsers cannot write directly into Android MediaStore without a linked folder in Settings or native Android app).',
    };
  } catch (err) {
    return {
      saved: false,
      isDirectGallery: false,
      delivery: 'browser-download',
      fileName: req.fileName,
      albumName,
      locationLabel: 'Save error',
      sizeBytes: req.blob.size,
      signature,
      statusMessage: 'Gallery save failed.',
      error: err instanceof Error ? err.message : 'Unexpected failure saving media file.',
    };
  } finally {
    inFlightSignatures.delete(signature);
  }
}

export async function exportCanvasViaGallery(opts: {
  canvas: HTMLCanvasElement;
  baseFileName: string;
  format: 'png' | 'jpeg' | 'jpg' | 'webp';
  qualityPercent: number;
  settings: AppSettings;
  triggerSource: 'save' | 'export' | 'manual';
  forceDuplicate?: boolean;
  projectId?: string;
  onProgress?: (pct: number, stage: string) => void;
  onRecordExport?: (record: ExportRecord) => Promise<void> | void;
}): Promise<GallerySaveResult> {
  const normFmt: ImageExportFormat = opts.format === 'jpeg' ? 'jpg' : opts.format;
  opts.onProgress?.(10, `Encoding ${normFmt.toUpperCase()} (${opts.canvas.width}×${opts.canvas.height})...`);
  const { blob, mimeType } = await encodeCanvasToBlob(opts.canvas, normFmt, opts.qualityPercent);
  const fileName = `${opts.baseFileName}.${normFmt}`;
  const thumb = createThumbnailDataUrl(opts.canvas, 320);

  return saveMediaToGallery({
    blob,
    fileName,
    mimeType,
    mediaType: 'image',
    format: normFmt,
    width: opts.canvas.width,
    height: opts.canvas.height,
    settings: opts.settings,
    triggerSource: opts.triggerSource,
    forceDuplicate: opts.forceDuplicate,
    projectId: opts.projectId,
    quality: normFmt === 'png' ? 100 : opts.qualityPercent,
    thumbnailDataUrl: thumb,
    onProgress: opts.onProgress,
    onRecordExport: opts.onRecordExport,
  });
}
