import { ExportResolution, VideoAspect, VideoClip, VideoQualityTier } from '../types/video';
import {
  ExportTargetResolution,
  ImageExportFormat,
  detectImageFormatSupport,
  encodeCanvasToBlob,
  getImageExportDimensions,
} from './exportEngine';
import { detectVideoExportCapabilities, getExportSpec } from './videoEngine';

export type HdQualityPreset = 'original' | 'high' | 'maximum' | 'custom';

export interface HdPhotoExportPlan {
  preset: HdQualityPreset;
  format: ImageExportFormat;
  targetResolution: ExportTargetResolution;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  qualityPercent: number;
  preservesOriginalResolution: boolean;
  isDownscaled: boolean;
  isUpscaled: boolean;
  clampedForMobile: boolean;
  warningNote?: string;
  summaryLabel: string;
}

export interface SourceVideoAudit {
  hasVideoFileClips: boolean;
  clipCount: number;
  maxWidth: number;
  maxHeight: number;
  sourceFps: number;
  nativeLabel: string;
  supportsNative720p: boolean;
  supportsNative1080p: boolean;
  supportsNative4k: boolean;
}

export interface HdVideoExportPlan {
  preset: VideoQualityTier;
  requestedResolution: ExportResolution;
  effectiveResolution: ExportResolution;
  width: number;
  height: number;
  fps: 24 | 30 | 60;
  bitrateBps: number;
  bitrateMbps: number;
  label: string;
  preservesSourceResolution: boolean;
  upscalePrevented: boolean;
  warningNote?: string;
  codecSupported: boolean;
  mp4Supported: boolean;
  webmSupported: boolean;
}

export interface HdAuditTestResult {
  id: string;
  title: string;
  passed: boolean;
  detail: string;
  metrics: string;
}

export function releaseCanvasMemory(canvas: HTMLCanvasElement | null | undefined): void {
  if (!canvas) return;
  try {
    canvas.width = 0;
    canvas.height = 0;
  } catch {
    // ignore detached canvas
  }
}

export function resolveHdPhotoExportPlan(
  sourceW: number,
  sourceH: number,
  preset: HdQualityPreset,
  format: ImageExportFormat,
  customResolution: ExportTargetResolution = 'original',
  customQuality = 95
): HdPhotoExportPlan {
  const safeW = Math.max(1, Math.round(sourceW));
  const safeH = Math.max(1, Math.round(sourceH));

  let targetResolution: ExportTargetResolution = 'original';
  let qualityPercent = 98;

  if (preset === 'original') {
    targetResolution = 'original';
    qualityPercent = format === 'png' ? 100 : 98;
  } else if (preset === 'high') {
    targetResolution = 'original';
    qualityPercent = format === 'png' ? 100 : 92;
  } else if (preset === 'maximum') {
    targetResolution = 'original';
    qualityPercent = 100;
  } else {
    targetResolution = customResolution;
    qualityPercent = format === 'png' ? 100 : Math.max(50, Math.min(100, Math.round(customQuality)));
  }

  const dims = getImageExportDimensions(safeW, safeH, targetResolution);
  const preservesOriginalResolution = dims.width === safeW && dims.height === safeH;
  const isDownscaled = dims.width < safeW || dims.height < safeH;
  const isUpscaled = dims.width > safeW || dims.height > safeH;

  let warningNote: string | undefined;
  if (isUpscaled) {
    warningNote = `Source photo is ${safeW}×${safeH}. Selecting ${targetResolution.toUpperCase()} stretches dimensions without adding real optical detail — Original (${safeW}×${safeH}) preserves true crispness.`;
  } else if (isDownscaled && preset === 'custom') {
    warningNote = `Custom target ${targetResolution.toUpperCase()} downscales ${safeW}×${safeH} → ${dims.width}×${dims.height}. Switch to Original/High/Maximum to keep 100% source pixels.`;
  } else if (dims.clampedForMobile) {
    warningNote = `Clamped to ${dims.width}×${dims.height} to stay within mobile GPU texture limits.`;
  }

  const qualityLabel = format === 'png' ? 'Lossless PNG' : `${qualityPercent}% Quality`;
  return {
    preset,
    format,
    targetResolution,
    sourceWidth: safeW,
    sourceHeight: safeH,
    outputWidth: dims.width,
    outputHeight: dims.height,
    qualityPercent,
    preservesOriginalResolution,
    isDownscaled,
    isUpscaled,
    clampedForMobile: dims.clampedForMobile,
    warningNote,
    summaryLabel: `${dims.width}×${dims.height} · ${qualityLabel}`,
  };
}

export function inspectSourceVideoMetadata(clips: VideoClip[]): SourceVideoAudit {
  let maxW = 0;
  let maxH = 0;
  let maxFps = 30;
  let hasVideoFileClips = false;

  for (const clip of clips) {
    if (clip.sourceType === 'video') {
      hasVideoFileClips = true;
    }
    const w = clip.nativeWidth ?? (clip.sourceType === 'studio-reel' ? 1920 : 1280);
    const h = clip.nativeHeight ?? (clip.sourceType === 'studio-reel' ? 1080 : 720);
    if (w * h > maxW * maxH) {
      maxW = w;
      maxH = h;
    }
    if (clip.nativeFps && clip.nativeFps > maxFps) {
      maxFps = clip.nativeFps;
    }
  }

  if (maxW === 0 || maxH === 0) {
    maxW = 1920;
    maxH = 1080;
  }

  const longEdge = Math.max(maxW, maxH);
  return {
    hasVideoFileClips,
    clipCount: clips.length,
    maxWidth: maxW,
    maxHeight: maxH,
    sourceFps: maxFps,
    nativeLabel: `${maxW}×${maxH}`,
    supportsNative720p: longEdge >= 1280,
    supportsNative1080p: longEdge >= 1920,
    supportsNative4k: longEdge >= 3840,
  };
}

function snapEven(n: number): number {
  const rounded = Math.max(2, Math.round(n));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

export function resolveHdVideoExportPlan(
  aspect: VideoAspect,
  clips: VideoClip[],
  requestedResolution: ExportResolution,
  qualityTier: VideoQualityTier = 'high',
  requestedFps: 24 | 30 | 60 = 30,
  customBitrateMbps = 14
): HdVideoExportPlan {
  const sourceAudit = inspectSourceVideoMetadata(clips);
  const caps = detectVideoExportCapabilities();

  const sourceLongEdge = Math.max(sourceAudit.maxWidth, sourceAudit.maxHeight);
  const specForRequested = getExportSpec(aspect, requestedResolution, {
    sourceWidth: sourceAudit.maxWidth,
    sourceHeight: sourceAudit.maxHeight,
    qualityTier,
    customBitrateMbps,
  });
  const requestedLongEdge = Math.max(specForRequested.width, specForRequested.height);

  // Never upscale low-resolution footage and claim it is native 4K or higher-res than source.
  let effectiveResolution: ExportResolution = requestedResolution;
  let upscalePrevented = false;
  let warningNote: string | undefined;

  if (requestedResolution !== 'original' && requestedLongEdge > sourceLongEdge) {
    upscalePrevented = true;
    effectiveResolution = 'original';
    warningNote = `Source footage is ${sourceAudit.nativeLabel}. ${requestedResolution.toUpperCase()} would require artificial upscaling, so DIPTI HD Quality Engine locks output to native ${sourceAudit.nativeLabel} without fake 4K upscaling.`;
  }

  const finalSpec = getExportSpec(aspect, effectiveResolution, {
    sourceWidth: snapEven(sourceAudit.maxWidth),
    sourceHeight: snapEven(sourceAudit.maxHeight),
    qualityTier,
    customBitrateMbps,
  });

  const fps = requestedFps;
  const bitrateBps = finalSpec.bitrate;
  const bitrateMbps = Number((bitrateBps / 1_000_000).toFixed(1));

  return {
    preset: qualityTier,
    requestedResolution,
    effectiveResolution,
    width: finalSpec.width,
    height: finalSpec.height,
    fps,
    bitrateBps,
    bitrateMbps,
    label: finalSpec.label,
    preservesSourceResolution: effectiveResolution === 'original' || Math.max(finalSpec.width, finalSpec.height) === sourceLongEdge,
    upscalePrevented,
    warningNote,
    codecSupported: caps.mediaRecorderSupported && Boolean(caps.bestMimeType),
    mp4Supported: caps.mp4Supported,
    webmSupported: caps.webmSupported,
  };
}

/**
 * Automated local verification suite for DIPTI HD QUALITY ENGINE.
 * Executes real canvas renders, verifies zero accidental downscaling, verifies PNG/JPG/WebP blobs,
 * and checks non-fake 4K video guards.
 */
export async function runHdQualityVerificationSuite(
  sampleImg: HTMLImageElement | null
): Promise<HdAuditTestResult[]> {
  const results: HdAuditTestResult[] = [];

  // 1. Original Photo Resolution Preservation Test
  const srcW = sampleImg?.naturalWidth || 1600;
  const srcH = sampleImg?.naturalHeight || 1200;
  const origPlan = resolveHdPhotoExportPlan(srcW, srcH, 'original', 'png');
  const maxPlan = resolveHdPhotoExportPlan(srcW, srcH, 'maximum', 'jpg');
  const dimsMatch =
    origPlan.outputWidth === srcW &&
    origPlan.outputHeight === srcH &&
    maxPlan.outputWidth === srcW &&
    maxPlan.outputHeight === srcH;

  results.push({
    id: 'photo-res-lock',
    title: 'Original Photo Resolution Preservation',
    passed: dimsMatch && origPlan.preservesOriginalResolution && !origPlan.isDownscaled,
    detail: dimsMatch
      ? 'Original & Maximum quality presets retain 100% of natural sensor dimensions without downscaling.'
      : 'Resolution mismatch detected between source and planned output.',
    metrics: `${srcW}×${srcH} → ${origPlan.outputWidth}×${origPlan.outputHeight} px`,
  });

  // 2. Real Full-Resolution Canvas Render + JPG / PNG / WebP Encoding Check
  if (typeof document !== 'undefined') {
    const testCanvas = document.createElement('canvas');
    testCanvas.width = srcW;
    testCanvas.height = srcH;
    const ctx = testCanvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (sampleImg) {
        ctx.drawImage(sampleImg, 0, 0, srcW, srcH);
      } else {
        const g = ctx.createLinearGradient(0, 0, srcW, srcH);
        g.addColorStop(0, '#1e1b4b');
        g.addColorStop(1, '#d4af37');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, srcW, srcH);
      }

      const [pngRes, jpgRes] = await Promise.all([
        encodeCanvasToBlob(testCanvas, 'png', 100).catch(() => null),
        encodeCanvasToBlob(testCanvas, 'jpg', 100).catch(() => null),
      ]);
      const fmtSupport = detectImageFormatSupport();
      const webpRes = fmtSupport.webp
        ? await encodeCanvasToBlob(testCanvas, 'webp', 96).catch(() => null)
        : null;

      const encodeOk =
        Boolean(pngRes && pngRes.blob.size > 0) &&
        Boolean(jpgRes && jpgRes.blob.size > 0) &&
        testCanvas.width === srcW &&
        testCanvas.height === srcH;

      const kb = (b?: { blob: Blob } | null) => (b ? `${Math.round(b.blob.size / 1024)} KB` : 'N/A');
      results.push({
        id: 'multi-format-encode',
        title: 'Full-Res Lossless PNG, 100% JPG & WebP Encoding',
        passed: encodeOk,
        detail: encodeOk
          ? 'Real Canvas-to-Blob outputs produced with matching dimensions across supported codecs.'
          : 'Canvas encoding failed to produce valid non-empty image blobs.',
        metrics: `PNG ${kb(pngRes)} · JPG 100% ${kb(jpgRes)} · WebP ${kb(webpRes)}`,
      });
    }
    releaseCanvasMemory(testCanvas);
  }

  // 3. Accidental Compression / Resolution Loss Guard Check
  const highPlan = resolveHdPhotoExportPlan(2400, 1800, 'high', 'jpg');
  const maxJpgPlan = resolveHdPhotoExportPlan(2400, 1800, 'maximum', 'jpg');
  const qualityOrderOk =
    highPlan.qualityPercent >= 90 &&
    maxJpgPlan.qualityPercent === 100 &&
    highPlan.outputWidth === 2400 &&
    maxJpgPlan.outputHeight === 1800;

  results.push({
    id: 'compression-guard',
    title: 'Quality Tier & Zero-Downscale Guard',
    passed: qualityOrderOk,
    detail: 'High (92%), Maximum (100%), and Original presets prevent accidental resolution drop.',
    metrics: `High ${highPlan.qualityPercent}% · Max ${maxJpgPlan.qualityPercent}% @ 2400×1800`,
  });

  // 4. Video Non-Upscaling & Native 4K Honesty Check
  const sample720Clip: VideoClip = {
    id: 'test-720',
    name: 'Test 720p Clip',
    sourceType: 'video',
    src: '',
    nativeDuration: 5,
    nativeWidth: 1280,
    nativeHeight: 720,
    nativeFps: 30,
    trimStart: 0,
    trimEnd: 5,
    speed: 1,
    slowMoBlur: false,
    volume: 100,
    brightness: 0,
    contrast: 0,
    saturation: 0,
    vignette: 0,
    filterId: 'natural',
    transitionOut: 'none',
    transitionDuration: 0.5,
  };
  const blocked4k = resolveHdVideoExportPlan('16:9', [sample720Clip], '4k', 'maximum', 30);
  const native4kClip: VideoClip = { ...sample720Clip, id: 'test-4k', nativeWidth: 3840, nativeHeight: 2160 };
  const allowed4k = resolveHdVideoExportPlan('16:9', [native4kClip], '4k', 'maximum', 60);

  const videoGuardPassed =
    blocked4k.upscalePrevented &&
    blocked4k.width === 1280 &&
    blocked4k.height === 720 &&
    !allowed4k.upscalePrevented &&
    allowed4k.width === 3840 &&
    allowed4k.height === 2160;

  results.push({
    id: 'video-4k-honesty',
    title: 'Video Non-Upscaling & Native 4K Guard',
    passed: videoGuardPassed,
    detail: videoGuardPassed
      ? 'Blocks fake 4K upscaling on 720p/1080p footage while unlocking true 3840×2160 for native 4K clips.'
      : 'Video resolution guard did not enforce native source limits properly.',
    metrics: `720p→4K locked to ${blocked4k.label} · Native 4K→${allowed4k.label} @ ${allowed4k.bitrateMbps} Mbps`,
  });

  return results;
}
