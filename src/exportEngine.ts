import { DEFAULT_ADJUSTMENTS, ProjectItem } from '../types/editor';
import { loadImageElement, renderAdjustedCanvas } from './canvasEngine';
import { renderTypographyDocument } from './typographyEngine';
import { renderPortraitStudioCanvas } from './portraitFilterEngine';
import { renderDslrPortraitComposition, runLocalSubjectSegmentation } from './dslrPortraitEngine';
import { renderColorGradedPhoto } from './colorGradingEngine';

export type ImageExportFormat = 'jpg' | 'png' | 'webp';
export type ExportTargetResolution = 'original' | '720p' | '1080p' | '4k';

const RESOLUTION_LONG_EDGE: Record<Exclude<ExportTargetResolution, 'original'>, number> = {
  '720p': 1280,
  '1080p': 1920,
  '4k': 3840,
};

export function getImageExportDimensions(
  srcW: number,
  srcH: number,
  targetRes: ExportTargetResolution
): { width: number; height: number; clampedForMobile: boolean } {
  const safeW = Math.max(1, Math.round(srcW));
  const safeH = Math.max(1, Math.round(srcH));
  if (targetRes === 'original') {
    return { width: safeW, height: safeH, clampedForMobile: false };
  }
  const desiredLong = RESOLUTION_LONG_EDGE[targetRes];
  const maxSafeDim = 3840; // Safe upper bound across Android Chrome/WebView GPU textures
  const clampedLong = Math.min(desiredLong, maxSafeDim);
  const ratio = safeW / safeH;

  if (ratio >= 1) {
    return {
      width: clampedLong,
      height: Math.max(1, Math.round(clampedLong / ratio)),
      clampedForMobile: clampedLong < desiredLong,
    };
  }
  return {
    width: Math.max(1, Math.round(clampedLong * ratio)),
    height: clampedLong,
    clampedForMobile: clampedLong < desiredLong,
  };
}

export function getMimeTypeForImageFormat(format: ImageExportFormat): string {
  if (format === 'jpg') return 'image/jpeg';
  if (format === 'webp') return 'image/webp';
  return 'image/png';
}

export function detectImageFormatSupport(): Record<ImageExportFormat, boolean> {
  if (typeof document === 'undefined') {
    return { jpg: true, png: true, webp: true };
  }
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 2;
  const webpOk = c.toDataURL('image/webp').startsWith('data:image/webp');
  return { jpg: true, png: true, webp: webpOk };
}

export function encodeCanvasToBlob(
  canvas: HTMLCanvasElement,
  format: ImageExportFormat,
  qualityPercent = 95
): Promise<{ blob: Blob; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const mimeType = getMimeTypeForImageFormat(format);
    const q = Math.max(0.5, Math.min(1, qualityPercent / 100));
    try {
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size === 0) {
            reject(new Error(`Browser failed to encode ${format.toUpperCase()} image data.`));
            return;
          }
          // Verify WebP actually produced WebP rather than silent PNG fallback
          if (format === 'webp' && blob.type && blob.type !== 'image/webp') {
            reject(new Error('WebP encoding is not supported in this browser; please select PNG or JPG.'));
            return;
          }
          resolve({ blob, mimeType: blob.type || mimeType });
        },
        mimeType,
        format === 'png' ? undefined : q
      );
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Canvas encoding error.'));
    }
  });
}

export function downloadExportedBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function isWebShareFilesSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export async function shareExportedBlob(
  blob: Blob,
  fileName: string,
  mimeType: string,
  title = 'DIPTI EDITOR Export'
): Promise<{ ok: boolean; error?: string }> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return {
      ok: false,
      error: 'Web Share API is unavailable in this browser. Use the Download button instead.',
    };
  }
  try {
    const file = new File([blob], fileName, { type: mimeType });
    if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
      return {
        ok: false,
        error: 'Direct file sharing is blocked on this browser/iframe. Please download the file to share.',
      };
    }
    await navigator.share({
      title,
      text: 'Exported from DIPTI EDITOR',
      files: [file],
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, error: 'Share sheet cancelled.' };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unable to share exported file.',
    };
  }
}

export async function renderPhotoProjectToExportCanvas(
  sourceUrl: string,
  project: ProjectItem | null,
  targetRes: ExportTargetResolution
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  // Typography & Motion Design project
  if (project?.tool === 'design-studio' && project.typographyDoc) {
    const doc = project.typographyDoc;
    const dims = getImageExportDimensions(doc.width, doc.height, targetRes);
    const canvas = document.createElement('canvas');
    let bgPhoto: HTMLImageElement | null = null;
    if (doc.background.mode === 'photo' && doc.background.photoUrl) {
      bgPhoto = await loadImageElement(doc.background.photoUrl).catch(() => null);
    }
    renderTypographyDocument(canvas, { ...doc, width: dims.width, height: dims.height }, {
      bgImage: bgPhoto,
      showGuides: false,
      transparentExport: doc.background.mode === 'transparent',
    });
    return { canvas, width: dims.width, height: dims.height };
  }

  const img = await loadImageElement(sourceUrl);
  const baseCanvas = document.createElement('canvas');

  if (project?.tool === 'dslr-studio' && project.dslrStudioState) {
    const mask = await runLocalSubjectSegmentation(img);
    let customBgImg: HTMLImageElement | null = null;
    if (project.dslrStudioState.customBgImageUrl) {
      customBgImg = await loadImageElement(project.dslrStudioState.customBgImageUrl).catch(() => null);
    }
    renderDslrPortraitComposition(img, baseCanvas, mask, project.dslrStudioState, {
      customBgImg,
      showMaskOverlay: false,
    });
  } else if (project?.tool === 'color-grading' && project.colorGradingState) {
    renderColorGradedPhoto(img, baseCanvas, project.colorGradingState);
  } else if (project?.tool === 'portrait-studio' && project.portraitStudioState) {
    renderPortraitStudioCanvas(img, baseCanvas, project.portraitStudioState);
  } else if (project?.tool === 'photo' && project.adjustments) {
    renderAdjustedCanvas(img, baseCanvas, { ...DEFAULT_ADJUSTMENTS, ...project.adjustments }, {
      textLayers: project.textLayers,
      stickers: project.stickers,
    });
  } else if (project?.tool === 'text' && project.textLayers) {
    renderAdjustedCanvas(img, baseCanvas, DEFAULT_ADJUSTMENTS, {
      textLayers: project.textLayers,
    });
  } else {
    baseCanvas.width = img.naturalWidth;
    baseCanvas.height = img.naturalHeight;
    const ctx = baseCanvas.getContext('2d');
    if (ctx) ctx.drawImage(img, 0, 0);
  }

  const dims = getImageExportDimensions(baseCanvas.width, baseCanvas.height, targetRes);
  if (dims.width === baseCanvas.width && dims.height === baseCanvas.height) {
    return { canvas: baseCanvas, width: baseCanvas.width, height: baseCanvas.height };
  }

  const scaled = document.createElement('canvas');
  scaled.width = dims.width;
  scaled.height = dims.height;
  const sCtx = scaled.getContext('2d');
  if (!sCtx) {
    baseCanvas.width = 0;
    baseCanvas.height = 0;
    throw new Error('Could not initialize 2D export context on this device.');
  }
  sCtx.imageSmoothingEnabled = true;
  sCtx.imageSmoothingQuality = 'high';
  sCtx.drawImage(baseCanvas, 0, 0, dims.width, dims.height);
  baseCanvas.width = 0;
  baseCanvas.height = 0;
  return { canvas: scaled, width: dims.width, height: dims.height };
}
