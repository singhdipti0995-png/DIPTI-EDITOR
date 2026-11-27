import { CINEMATIC_GRADE_PRESETS, createStateFromPreset } from '../data/colorGradingPresets';
import { ColorGradingState, CustomColorGradePreset } from '../types/colorGrading';
import { AppSettings, CropAspect, DEFAULT_ADJUSTMENTS, ExportRecord, PhotoAdjustments } from '../types/editor';
import {
  applyPixelAdjustments,
  applySharpenConvolution,
  getCroppedDimensions,
  loadImageElement,
  mergeFilterWithAdjustments,
} from './canvasEngine';
import { applyColorGradingToImageData, loadCustomColorPresets } from './colorGradingEngine';
import {
  ImageExportFormat,
  downloadExportedBlob,
  encodeCanvasToBlob,
} from './exportEngine';
import {
  GallerySaveResult,
  computeMediaFingerprint,
  saveMediaToGallery,
} from './gallerySaveEngine';
import { releaseCanvasMemory } from './hdQualityEngine';

export type BatchPhotoStatus =
  | 'idle'
  | 'processing'
  | 'done'
  | 'skipped-duplicate'
  | 'error'
  | 'cancelled';

export type BatchResizeMode =
  | 'original'
  | 'max-long-edge'
  | 'exact-width'
  | 'exact-height'
  | 'scale-pct';

export type BatchWatermarkPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'tiled';

export interface BatchPhotoItem {
  id: string;
  name: string;
  sourceUrl: string;
  isObjectUrl: boolean;
  thumbUrl: string;
  origWidth: number;
  origHeight: number;
  fileSizeBytes: number;
  selected: boolean;
  status: BatchPhotoStatus;
  errorMessage?: string;
  lastLocationLabel?: string;
  outputWidth?: number;
  outputHeight?: number;
  outputBytes?: number;
}

export interface BatchResizeConfig {
  mode: BatchResizeMode;
  maxLongEdgePx: number;
  targetWidthPx: number;
  targetHeightPx: number;
  scalePercent: number;
}

export interface BatchWatermarkConfig {
  enabled: boolean;
  text: string;
  fontFamily: string;
  sizePercent: number; // % of short edge (1.5..14)
  color: string;
  opacity: number; // 10..100
  position: BatchWatermarkPosition;
  outlineWidth: number; // 0..8
  outlineColor: string;
  shadowBlur: number; // 0..24
  badgeBackdrop: boolean;
  tileAngleDeg: number; // -45..45
}

export interface BatchEditRecipe {
  filterId: string;
  filterIntensity: number;
  colorGradePresetId: string; // 'none' or preset id
  colorGradeIntensity: number; // 0..100
  brightness: number; // -50..50
  contrast: number; // -50..50
  saturation: number; // -100..100
  exposure: number; // -50..50
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  cropAspect: CropAspect;
  resize: BatchResizeConfig;
  watermark: BatchWatermarkConfig;
  exportFormat: ImageExportFormat;
  exportQuality: number; // 50..100
}

export const DEFAULT_BATCH_RECIPE: BatchEditRecipe = {
  filterId: 'original',
  filterIntensity: 100,
  colorGradePresetId: 'none',
  colorGradeIntensity: 100,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  exposure: 0,
  rotation: 0,
  flipH: false,
  flipV: false,
  cropAspect: 'original',
  resize: {
    mode: 'original',
    maxLongEdgePx: 1920,
    targetWidthPx: 1920,
    targetHeightPx: 1080,
    scalePercent: 100,
  },
  watermark: {
    enabled: false,
    text: '© DIPTI EDITOR',
    fontFamily: "'Montserrat', sans-serif",
    sizePercent: 4.2,
    color: '#FBBF24',
    opacity: 85,
    position: 'bottom-right',
    outlineWidth: 1.5,
    outlineColor: '#05060B',
    shadowBlur: 6,
    badgeBackdrop: false,
    tileAngleDeg: -28,
  },
  exportFormat: 'jpg',
  exportQuality: 95,
};

const MAX_SAFE_CANVAS_EDGE = 8192;

function clampEdge(v: number, fallback: number): number {
  if (!Number.isFinite(v) || v < 64) return fallback;
  return Math.min(MAX_SAFE_CANVAS_EDGE, Math.max(64, Math.round(v)));
}

export interface BatchComputedDimensions {
  croppedW: number;
  croppedH: number;
  outW: number;
  outH: number;
  resized: boolean;
}

export function computeBatchOutputDimensions(
  origW: number,
  origH: number,
  rotation: number,
  cropAspect: CropAspect,
  resize: BatchResizeConfig
): BatchComputedDimensions {
  const safeW = Math.max(1, Math.round(origW));
  const safeH = Math.max(1, Math.round(origH));
  const cropped = getCroppedDimensions(safeW, safeH, rotation, cropAspect);
  const croppedW = Math.max(1, cropped.outW);
  const croppedH = Math.max(1, cropped.outH);

  if (resize.mode === 'original') {
    return {
      croppedW,
      croppedH,
      outW: croppedW,
      outH: croppedH,
      resized: false,
    };
  }

  const aspect = croppedW / croppedH;

  if (resize.mode === 'max-long-edge') {
    const targetLong = clampEdge(resize.maxLongEdgePx, 1920);
    if (croppedW >= croppedH) {
      const outW = targetLong;
      const outH = Math.max(1, Math.round(outW / aspect));
      return {
        croppedW,
        croppedH,
        outW,
        outH,
        resized: outW !== croppedW || outH !== croppedH,
      };
    }
    const outH = targetLong;
    const outW = Math.max(1, Math.round(outH * aspect));
    return {
      croppedW,
      croppedH,
      outW,
      outH,
      resized: outW !== croppedW || outH !== croppedH,
    };
  }

  if (resize.mode === 'exact-width') {
    const outW = clampEdge(resize.targetWidthPx, 1920);
    const outH = Math.max(1, Math.round(outW / aspect));
    return {
      croppedW,
      croppedH,
      outW,
      outH,
      resized: outW !== croppedW || outH !== croppedH,
    };
  }

  if (resize.mode === 'exact-height') {
    const outH = clampEdge(resize.targetHeightPx, 1080);
    const outW = Math.max(1, Math.round(outH * aspect));
    return {
      croppedW,
      croppedH,
      outW,
      outH,
      resized: outW !== croppedW || outH !== croppedH,
    };
  }

  // scale-pct
  const pct = Math.max(10, Math.min(100, resize.scalePercent || 100));
  const factor = pct / 100;
  const outW = Math.max(1, Math.round(croppedW * factor));
  const outH = Math.max(1, Math.round(croppedH * factor));
  return {
    croppedW,
    croppedH,
    outW,
    outH,
    resized: outW !== croppedW || outH !== croppedH,
  };
}

function resolveBatchColorGradingState(
  presetId: string,
  intensity: number,
  customPresets?: CustomColorGradePreset[]
): ColorGradingState | null {
  if (!presetId || presetId === 'none' || intensity <= 0) return null;

  const builtIn = CINEMATIC_GRADE_PRESETS.find((p) => p.id === presetId);
  if (builtIn) {
    const base = createStateFromPreset(builtIn);
    return { ...base, presetIntensity: Math.max(0, Math.min(100, intensity)) };
  }

  const customs = customPresets ?? loadCustomColorPresets();
  const custom = customs.find((p) => p.id === presetId);
  if (custom) {
    return {
      ...custom.state,
      presetIntensity: Math.max(0, Math.min(100, intensity)),
    };
  }

  return null;
}

export function drawBatchWatermark(
  ctx: CanvasRenderingContext2D,
  outW: number,
  outH: number,
  wm: BatchWatermarkConfig
): void {
  const cleanText = wm.text.trim();
  if (!wm.enabled || !cleanText) return;

  const shortEdge = Math.max(1, Math.min(outW, outH));
  const fontSize = Math.max(11, Math.round((wm.sizePercent / 100) * shortEdge));
  const alpha = Math.max(0.05, Math.min(1, wm.opacity / 100));
  const strokePx = wm.outlineWidth > 0 ? Math.max(1, (wm.outlineWidth / 40) * fontSize) : 0;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `700 ${fontSize}px ${wm.fontFamily}`;

  if (wm.shadowBlur > 0) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
    ctx.shadowBlur = Math.max(1, (wm.shadowBlur / 28) * fontSize);
    ctx.shadowOffsetY = Math.max(1, Math.round(fontSize * 0.08));
  }

  if (wm.position === 'tiled') {
    const metrics = ctx.measureText(cleanText);
    const stepX = Math.max(fontSize * 4.2, metrics.width + fontSize * 2.4);
    const stepY = Math.max(fontSize * 3.4, fontSize * 4.2);
    const diag = Math.hypot(outW, outH);

    ctx.translate(outW / 2, outH / 2);
    ctx.rotate(((wm.tileAngleDeg || -28) * Math.PI) / 180);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let rowIdx = 0;
    for (let y = -diag * 0.65; y <= diag * 0.65; y += stepY) {
      const stagger = rowIdx % 2 === 1 ? stepX * 0.5 : 0;
      for (let x = -diag * 0.65 + stagger; x <= diag * 0.65; x += stepX) {
        if (strokePx > 0) {
          ctx.lineWidth = strokePx * 2;
          ctx.strokeStyle = wm.outlineColor;
          ctx.lineJoin = 'round';
          ctx.strokeText(cleanText, x, y);
        }
        ctx.fillStyle = wm.color;
        ctx.fillText(cleanText, x, y);
      }
      rowIdx++;
    }
    ctx.restore();
    return;
  }

  const pad = Math.max(12, Math.round(shortEdge * 0.042));
  const isLeft = wm.position.endsWith('left');
  const isRight = wm.position.endsWith('right');
  const isTop = wm.position.startsWith('top');
  const isBottom = wm.position.startsWith('bottom');

  const anchorX = isLeft ? pad : isRight ? outW - pad : outW / 2;
  const anchorY = isTop ? pad + fontSize * 0.5 : isBottom ? outH - pad - fontSize * 0.5 : outH / 2;

  ctx.textAlign = isLeft ? 'left' : isRight ? 'right' : 'center';
  ctx.textBaseline = 'middle';

  if (wm.badgeBackdrop) {
    const textW = ctx.measureText(cleanText).width;
    const padX = Math.round(fontSize * 0.58);
    const padY = Math.round(fontSize * 0.34);
    const boxW = textW + padX * 2;
    const boxH = fontSize + padY * 2;
    const boxX = isLeft ? anchorX - padX * 0.35 : isRight ? anchorX - textW - padX * 1.65 : anchorX - boxW / 2;
    const boxY = anchorY - boxH / 2;
    const adjustedTextX = isLeft ? boxX + padX : isRight ? boxX + boxW - padX : anchorX;

    ctx.save();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = 'rgba(6, 7, 11, 0.76)';
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.58)';
    ctx.lineWidth = Math.max(1.5, fontSize * 0.06);
    const r = Math.min(14, boxH * 0.3);
    ctx.beginPath();
    ctx.moveTo(boxX + r, boxY);
    ctx.lineTo(boxX + boxW - r, boxY);
    ctx.quadraticCurveTo(boxX + boxW, boxY, boxX + boxW, boxY + r);
    ctx.lineTo(boxX + boxW, boxY + boxH - r);
    ctx.quadraticCurveTo(boxX + boxW, boxY + boxH, boxX + boxW - r, boxY + boxH);
    ctx.lineTo(boxX + r, boxY + boxH);
    ctx.quadraticCurveTo(boxX, boxY + boxH, boxX, boxY + boxH - r);
    ctx.lineTo(boxX, boxY + r);
    ctx.quadraticCurveTo(boxX, boxY, boxX + r, boxY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    if (strokePx > 0) {
      ctx.lineWidth = strokePx * 2;
      ctx.strokeStyle = wm.outlineColor;
      ctx.lineJoin = 'round';
      ctx.strokeText(cleanText, adjustedTextX, anchorY);
    }
    ctx.fillStyle = wm.color;
    ctx.fillText(cleanText, adjustedTextX, anchorY);
    ctx.restore();
    return;
  }

  if (strokePx > 0) {
    ctx.lineWidth = strokePx * 2;
    ctx.strokeStyle = wm.outlineColor;
    ctx.lineJoin = 'round';
    ctx.strokeText(cleanText, anchorX, anchorY);
  }
  ctx.fillStyle = wm.color;
  ctx.fillText(cleanText, anchorX, anchorY);
  ctx.restore();
}

export function renderBatchPhotoToCanvas(
  img: HTMLImageElement,
  targetCanvas: HTMLCanvasElement,
  recipe: BatchEditRecipe,
  opts?: {
    maxPreviewDim?: number;
    geometryOnly?: boolean;
    customColorPresets?: CustomColorGradePreset[];
  }
): BatchComputedDimensions {
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const dims = computeBatchOutputDimensions(
    srcW,
    srcH,
    recipe.rotation,
    recipe.cropAspect,
    recipe.resize
  );

  let canvasW = dims.outW;
  let canvasH = dims.outH;
  if (opts?.maxPreviewDim && Math.max(canvasW, canvasH) > opts.maxPreviewDim) {
    const scale = opts.maxPreviewDim / Math.max(canvasW, canvasH);
    canvasW = Math.max(1, Math.round(canvasW * scale));
    canvasH = Math.max(1, Math.round(canvasH * scale));
  }

  const isRotated90 = recipe.rotation === 90 || recipe.rotation === 270;
  const effW = isRotated90 ? srcH : srcW;
  const effH = isRotated90 ? srcW : srcH;
  const cropped = getCroppedDimensions(srcW, srcH, recipe.rotation, recipe.cropAspect);

  // Step 1: Rotate & Flip into temporary transform canvas, blit cropped area onto targetCanvas, release tempCanvas immediately
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = effW;
  tempCanvas.height = effH;
  const tCtx = tempCanvas.getContext('2d');
  if (!tCtx) {
    return dims;
  }

  tCtx.imageSmoothingEnabled = true;
  tCtx.imageSmoothingQuality = 'high';
  tCtx.save();
  tCtx.translate(effW / 2, effH / 2);
  tCtx.rotate((recipe.rotation * Math.PI) / 180);
  tCtx.scale(recipe.flipH ? -1 : 1, recipe.flipV ? -1 : 1);
  tCtx.drawImage(img, -srcW / 2, -srcH / 2);
  tCtx.restore();

  targetCanvas.width = canvasW;
  targetCanvas.height = canvasH;
  const ctx = targetCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    releaseCanvasMemory(tempCanvas);
    return dims;
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.drawImage(
    tempCanvas,
    cropped.sx,
    cropped.sy,
    cropped.sw,
    cropped.sh,
    0,
    0,
    canvasW,
    canvasH
  );
  releaseCanvasMemory(tempCanvas);

  if (opts?.geometryOnly) {
    return dims;
  }

  // Step 2: Filter preset + Brightness/Contrast/Saturation/Exposure adjustments
  const baseAdj: PhotoAdjustments = {
    ...DEFAULT_ADJUSTMENTS,
    activeFilterId: recipe.filterId,
    filterIntensity: recipe.filterIntensity,
    brightness: recipe.brightness,
    contrast: recipe.contrast,
    saturation: recipe.saturation,
    exposure: recipe.exposure,
    rotation: recipe.rotation,
    flipH: recipe.flipH,
    flipV: recipe.flipV,
    cropAspect: recipe.cropAspect,
  };
  const adj = mergeFilterWithAdjustments(baseAdj);
  const effectiveSharpness = Math.min(100, adj.sharpness + Math.round((adj.hdr ?? 0) * 0.28));
  const needsFilterPass =
    adj.brightness !== 0 ||
    adj.exposure !== 0 ||
    adj.contrast !== 0 ||
    adj.highlights !== 0 ||
    adj.shadows !== 0 ||
    adj.saturation !== 0 ||
    (adj.hueShift ?? 0) !== 0 ||
    (adj.hslLightness ?? 0) !== 0 ||
    (adj.redShift ?? 0) !== 0 ||
    (adj.greenShift ?? 0) !== 0 ||
    (adj.blueShift ?? 0) !== 0 ||
    adj.temperature !== 0 ||
    adj.tint !== 0 ||
    (adj.sepia ?? 0) > 0 ||
    (adj.hdr ?? 0) > 0 ||
    (adj.colorPop ?? 0) > 0 ||
    adj.grain > 0 ||
    effectiveSharpness > 0;

  if (needsFilterPass) {
    const imgData = ctx.getImageData(0, 0, canvasW, canvasH);
    applyPixelAdjustments(imgData, adj);
    if (effectiveSharpness > 0) {
      applySharpenConvolution(imgData, effectiveSharpness);
    }
    ctx.putImageData(imgData, 0, 0);
  }

  if (adj.bloom > 0) {
    const bloomCanvas = document.createElement('canvas');
    bloomCanvas.width = Math.max(1, Math.round(canvasW / 4));
    bloomCanvas.height = Math.max(1, Math.round(canvasH / 4));
    const bCtx = bloomCanvas.getContext('2d');
    if (bCtx) {
      bCtx.filter = 'blur(10px) brightness(1.15)';
      bCtx.drawImage(targetCanvas, 0, 0, bloomCanvas.width, bloomCanvas.height);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = Math.min(0.45, adj.bloom / 120);
      ctx.drawImage(bloomCanvas, 0, 0, canvasW, canvasH);
      ctx.restore();
    }
    releaseCanvasMemory(bloomCanvas);
  }

  // Step 3: Existing Color Grading Preset pass (if selected)
  const gradeState = resolveBatchColorGradingState(
    recipe.colorGradePresetId,
    recipe.colorGradeIntensity,
    opts?.customColorPresets
  );

  let totalVignette = adj.vignette;
  if (gradeState) {
    const imgData = ctx.getImageData(0, 0, canvasW, canvasH);
    applyColorGradingToImageData(imgData, gradeState);
    ctx.putImageData(imgData, 0, 0);
    totalVignette = Math.max(
      totalVignette,
      Math.round((gradeState.vignette * gradeState.presetIntensity) / 100)
    );
  }

  if (totalVignette > 0) {
    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const outer = Math.hypot(cx, cy);
    const grad = ctx.createRadialGradient(cx, cy, outer * 0.34, cx, cy, outer);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(4,6,14,${Math.min(0.88, (totalVignette / 100) * 0.85)})`);
    ctx.save();
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.restore();
  }

  // Step 4: Watermark / Text overlay
  drawBatchWatermark(ctx, canvasW, canvasH, recipe.watermark);

  return dims;
}

function buildCompactThumb(img: HTMLImageElement, maxDim = 220): string {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  const url = c.toDataURL('image/jpeg', 0.78);
  releaseCanvasMemory(c);
  return url;
}

export async function createBatchItemFromFile(file: File): Promise<BatchPhotoItem> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`"${file.name}" is not a supported image file.`);
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(objectUrl);
    const origWidth = img.naturalWidth;
    const origHeight = img.naturalHeight;
    if (!origWidth || !origHeight) {
      throw new Error(`"${file.name}" has invalid image dimensions.`);
    }
    const thumbUrl = buildCompactThumb(img, 220) || objectUrl;
    img.src = '';
    return {
      id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      sourceUrl: objectUrl,
      isObjectUrl: true,
      thumbUrl,
      origWidth,
      origHeight,
      fileSizeBytes: file.size,
      selected: true,
      status: 'idle',
    };
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw err instanceof Error ? err : new Error(`Failed to load "${file.name}".`);
  }
}

export async function createBatchItemFromUrl(
  url: string,
  name: string,
  approxBytes = 0
): Promise<BatchPhotoItem> {
  const img = await loadImageElement(url);
  const origWidth = img.naturalWidth;
  const origHeight = img.naturalHeight;
  const thumbUrl = buildCompactThumb(img, 220) || url;
  img.src = '';
  return {
    id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    sourceUrl: url,
    isObjectUrl: false,
    thumbUrl,
    origWidth,
    origHeight,
    fileSizeBytes: approxBytes,
    selected: true,
    status: 'idle',
  };
}

export interface BatchExportItemOutcome {
  itemId: string;
  fileName: string;
  status: 'done' | 'skipped-duplicate' | 'error' | 'cancelled';
  width: number;
  height: number;
  sizeBytes: number;
  locationLabel?: string;
  errorMessage?: string;
  galleryResult?: GallerySaveResult;
}

export interface BatchExportQueueSummary {
  total: number;
  completed: number;
  skippedDuplicates: number;
  failed: number;
  cancelledCount: number;
  wasCancelled: boolean;
  outcomes: BatchExportItemOutcome[];
}

export interface BatchExportQueueOptions {
  items: BatchPhotoItem[];
  recipe: BatchEditRecipe;
  settings: AppSettings;
  customColorPresets?: CustomColorGradePreset[];
  forceDuplicate?: boolean;
  shouldCancel: () => boolean;
  onItemStart?: (itemId: string, index: number, total: number) => void;
  onItemProgress?: (itemId: string, overallPct: number, stage: string) => void;
  onItemComplete?: (outcome: BatchExportItemOutcome, index: number, total: number) => void;
  onRecordExport?: (record: ExportRecord) => Promise<void> | void;
}

function buildBatchExportFileName(
  originalName: string,
  width: number,
  height: number,
  format: ImageExportFormat,
  usedNamesInRun: Set<string>
): string {
  const withoutExt = originalName.replace(/\.[^/.]+$/, '');
  const cleanBase =
    withoutExt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'dipti-photo';

  let candidate = `${cleanBase}-dipti-${width}x${height}.${format}`;
  let suffix = 2;
  while (usedNamesInRun.has(candidate.toLowerCase())) {
    candidate = `${cleanBase}-dipti-${width}x${height}-${suffix}.${format}`;
    suffix++;
  }
  usedNamesInRun.add(candidate.toLowerCase());
  return candidate;
}

export async function runBatchExportQueue(
  opts: BatchExportQueueOptions
): Promise<BatchExportQueueSummary> {
  const { items, recipe, settings, shouldCancel } = opts;
  const total = items.length;
  const outcomes: BatchExportItemOutcome[] = [];
  const usedNamesInRun = new Set<string>();
  const batchFingerprints = new Set<string>();

  let completed = 0;
  let skippedDuplicates = 0;
  let failed = 0;
  let cancelledCount = 0;
  let wasCancelled = false;

  for (let i = 0; i < total; i++) {
    const item = items[i];
    if (shouldCancel()) {
      wasCancelled = true;
      for (let k = i; k < total; k++) {
        cancelledCount++;
        const cancelledOutcome: BatchExportItemOutcome = {
          itemId: items[k].id,
          fileName: items[k].name,
          status: 'cancelled',
          width: items[k].origWidth,
          height: items[k].origHeight,
          sizeBytes: 0,
        };
        outcomes.push(cancelledOutcome);
        opts.onItemComplete?.(cancelledOutcome, k, total);
      }
      break;
    }

    opts.onItemStart?.(item.id, i, total);
    const basePct = Math.round((i / Math.max(1, total)) * 100);
    opts.onItemProgress?.(item.id, basePct, `Loading ${item.name} (${i + 1}/${total})...`);

    let workCanvas: HTMLCanvasElement | null = null;
    let loadedImg: HTMLImageElement | null = null;

    try {
      loadedImg = await loadImageElement(item.sourceUrl);
      if (shouldCancel()) {
        throw new Error('__BATCH_CANCELLED__');
      }

      workCanvas = document.createElement('canvas');
      opts.onItemProgress?.(
        item.id,
        Math.min(99, basePct + Math.round(35 / Math.max(1, total))),
        `Processing ${item.name} at full resolution...`
      );

      const dims = renderBatchPhotoToCanvas(loadedImg, workCanvas, recipe, {
        customColorPresets: opts.customColorPresets,
      });

      // Release decoded bitmap immediately after drawing to canvas to minimize Android RAM peak
      loadedImg.src = '';
      loadedImg = null;

      if (shouldCancel()) {
        throw new Error('__BATCH_CANCELLED__');
      }

      opts.onItemProgress?.(
        item.id,
        Math.min(99, basePct + Math.round(65 / Math.max(1, total))),
        `Encoding ${recipe.exportFormat.toUpperCase()} (${dims.outW}×${dims.outH})...`
      );

      const { blob, mimeType } = await encodeCanvasToBlob(
        workCanvas,
        recipe.exportFormat,
        recipe.exportQuality
      );
      const compactThumb = buildCompactThumbFromCanvas(workCanvas, 240);

      // Immediately free full-res Canvas memory before Gallery write
      releaseCanvasMemory(workCanvas);
      workCanvas = null;

      if (shouldCancel()) {
        throw new Error('__BATCH_CANCELLED__');
      }

      const fileName = buildBatchExportFileName(
        item.name,
        dims.outW,
        dims.outH,
        recipe.exportFormat,
        usedNamesInRun
      );

      const sig = await computeMediaFingerprint(
        blob,
        'image',
        recipe.exportFormat,
        dims.outW,
        dims.outH
      );

      if (settings.preventDuplicateGallerySaves && !opts.forceDuplicate && batchFingerprints.has(sig)) {
        skippedDuplicates++;
        const dupOutcome: BatchExportItemOutcome = {
          itemId: item.id,
          fileName,
          status: 'skipped-duplicate',
          width: dims.outW,
          height: dims.outH,
          sizeBytes: blob.size,
          locationLabel: 'Skipped duplicate output in batch',
        };
        outcomes.push(dupOutcome);
        opts.onItemComplete?.(dupOutcome, i, total);
        continue;
      }

      if (settings.autoSaveToGallery) {
        opts.onItemProgress?.(
          item.id,
          Math.min(99, basePct + Math.round(85 / Math.max(1, total))),
          `Saving ${fileName} to Gallery...`
        );

        const gRes = await saveMediaToGallery({
          blob,
          fileName,
          mimeType,
          mediaType: 'image',
          format: recipe.exportFormat,
          width: dims.outW,
          height: dims.outH,
          quality: recipe.exportFormat === 'png' ? 100 : recipe.exportQuality,
          thumbnailDataUrl: compactThumb || item.thumbUrl,
          settings,
          triggerSource: 'export',
          forceDuplicate: opts.forceDuplicate,
          onRecordExport: opts.onRecordExport,
        });

        if (gRes.saved) {
          batchFingerprints.add(sig);
          completed++;
          const okOutcome: BatchExportItemOutcome = {
            itemId: item.id,
            fileName,
            status: 'done',
            width: dims.outW,
            height: dims.outH,
            sizeBytes: blob.size,
            locationLabel: gRes.locationLabel,
            galleryResult: gRes,
          };
          outcomes.push(okOutcome);
          opts.onItemComplete?.(okOutcome, i, total);
        } else if (gRes.duplicatePrevented) {
          skippedDuplicates++;
          const dupOutcome: BatchExportItemOutcome = {
            itemId: item.id,
            fileName: gRes.fileName || fileName,
            status: 'skipped-duplicate',
            width: dims.outW,
            height: dims.outH,
            sizeBytes: blob.size,
            locationLabel: gRes.locationLabel,
            galleryResult: gRes,
          };
          outcomes.push(dupOutcome);
          opts.onItemComplete?.(dupOutcome, i, total);
        } else {
          failed++;
          const errOutcome: BatchExportItemOutcome = {
            itemId: item.id,
            fileName,
            status: 'error',
            width: dims.outW,
            height: dims.outH,
            sizeBytes: blob.size,
            errorMessage: gRes.error || gRes.statusMessage || 'Gallery save failed.',
            galleryResult: gRes,
          };
          outcomes.push(errOutcome);
          opts.onItemComplete?.(errOutcome, i, total);
        }
      } else {
        // Auto-save to Gallery is disabled in Settings: trigger clean manual browser download instead
        downloadExportedBlob(blob, fileName);
        batchFingerprints.add(sig);
        const locationLabel = `Downloads/${fileName} (Manual Download — Gallery Auto-Save OFF)`;
        await opts.onRecordExport?.({
          id: `exp-batch-${Date.now()}-${i}`,
          fileName,
          mediaType: 'image',
          format: recipe.exportFormat,
          resolutionLabel: `${dims.outW}×${dims.outH}`,
          width: dims.outW,
          height: dims.outH,
          quality: recipe.exportFormat === 'png' ? 100 : recipe.exportQuality,
          fileSizeBytes: blob.size,
          status: 'completed',
          thumbnailDataUrl: compactThumb || item.thumbUrl,
          galleryDelivery: 'browser-download',
          galleryLocationLabel: locationLabel,
          createdAt: new Date().toISOString(),
        });

        completed++;
        const dlOutcome: BatchExportItemOutcome = {
          itemId: item.id,
          fileName,
          status: 'done',
          width: dims.outW,
          height: dims.outH,
          sizeBytes: blob.size,
          locationLabel,
        };
        outcomes.push(dlOutcome);
        opts.onItemComplete?.(dlOutcome, i, total);
      }
    } catch (err) {
      if (err instanceof Error && err.message === '__BATCH_CANCELLED__') {
        wasCancelled = true;
        for (let k = i; k < total; k++) {
          cancelledCount++;
          const cancelledOutcome: BatchExportItemOutcome = {
            itemId: items[k].id,
            fileName: items[k].name,
            status: 'cancelled',
            width: items[k].origWidth,
            height: items[k].origHeight,
            sizeBytes: 0,
          };
          outcomes.push(cancelledOutcome);
          opts.onItemComplete?.(cancelledOutcome, k, total);
        }
        break;
      }

      failed++;
      const msg = err instanceof Error ? err.message : `Failed to process "${item.name}".`;
      await opts.onRecordExport?.({
        id: `exp-batch-err-${Date.now()}-${i}`,
        fileName: item.name,
        mediaType: 'image',
        format: recipe.exportFormat,
        resolutionLabel: `${item.origWidth}×${item.origHeight}`,
        width: item.origWidth,
        height: item.origHeight,
        quality: recipe.exportQuality,
        fileSizeBytes: 0,
        status: 'failed',
        errorMessage: msg,
        createdAt: new Date().toISOString(),
      });

      const errOutcome: BatchExportItemOutcome = {
        itemId: item.id,
        fileName: item.name,
        status: 'error',
        width: item.origWidth,
        height: item.origHeight,
        sizeBytes: 0,
        errorMessage: msg,
      };
      outcomes.push(errOutcome);
      opts.onItemComplete?.(errOutcome, i, total);
    } finally {
      if (loadedImg) {
        loadedImg.src = '';
      }
      if (workCanvas) {
        releaseCanvasMemory(workCanvas);
      }
    }

    // Yield briefly between items so Android UI thread stays responsive for Cancel taps
    if (i < total - 1) {
      await new Promise((resolve) => setTimeout(resolve, 24));
    }
  }

  return {
    total,
    completed,
    skippedDuplicates,
    failed,
    cancelledCount,
    wasCancelled,
    outcomes,
  };
}

function buildCompactThumbFromCanvas(canvas: HTMLCanvasElement, maxDim = 240): string {
  const scale = Math.min(1, maxDim / Math.max(canvas.width || 1, canvas.height || 1));
  const w = Math.max(1, Math.round(canvas.width * scale));
  const h = Math.max(1, Math.round(canvas.height * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(canvas, 0, 0, w, h);
  const url = c.toDataURL('image/jpeg', 0.78);
  releaseCanvasMemory(c);
  return url;
}
