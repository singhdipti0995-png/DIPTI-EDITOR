import { PORTRAIT_PRESETS, PortraitFilterPreset } from '../data/portraitPresets';
import { DEFAULT_ADJUSTMENTS, PhotoAdjustments, PortraitStudioConfig } from '../types/editor';
import { applyPixelAdjustments, applySharpenConvolution } from './canvasEngine';

export const DEFAULT_PORTRAIT_CONFIG: PortraitStudioConfig = {
  primaryPresetId: 'cinematic-portrait',
  primaryIntensity: 85,
  secondaryPresetId: 'none',
  secondaryIntensity: 45,
  skinSoftness: 0,
  portraitGlow: 0,
  studioKeyLight: 0,
  softFocus: 0,
  warmthShift: 0,
  contrastShift: 0,
  vignette: 0,
  grain: 0,
  focusX: 0.5,
  focusY: 0.38,
};

export const RAW_ORIGINAL_PORTRAIT_CONFIG: PortraitStudioConfig = {
  ...DEFAULT_PORTRAIT_CONFIG,
  primaryPresetId: 'none',
  primaryIntensity: 0,
  secondaryPresetId: 'none',
  secondaryIntensity: 0,
};

export interface LocalFaceDetectionResult {
  status: 'detected' | 'no-face' | 'unsupported' | 'error';
  method: 'Browser FaceDetector API' | 'Local Focus Target';
  boxes: Array<{ x: number; y: number; width: number; height: number }>;
  focusX: number;
  focusY: number;
  message: string;
}

interface BrowserFaceDetectorBox {
  boundingBox: { x: number; y: number; width: number; height: number };
}

interface BrowserFaceDetectorCtor {
  new (options?: { fastMode?: boolean; maxDetectedFaces?: number }): {
    detect: (image: CanvasImageSource) => Promise<BrowserFaceDetectorBox[]>;
  };
}

export function isLocalFaceDetectorSupported(): boolean {
  return typeof window !== 'undefined' && 'FaceDetector' in window;
}

export async function detectLocalPortraitFaces(
  img: HTMLImageElement
): Promise<LocalFaceDetectionResult> {
  if (!isLocalFaceDetectorSupported()) {
    return {
      status: 'unsupported',
      method: 'Local Focus Target',
      boxes: [],
      focusX: 0.5,
      focusY: 0.38,
      message:
        'Browser native FaceDetector API is not available on this runtime. Tap anywhere on the portrait to place the studio key-light and skin-smoothing target manually.',
    };
  }

  try {
    const Detector = (window as unknown as { FaceDetector: BrowserFaceDetectorCtor }).FaceDetector;
    const detector = new Detector({ fastMode: true, maxDetectedFaces: 3 });
    const detected = await detector.detect(img);
    if (!detected || detected.length === 0) {
      return {
        status: 'no-face',
        method: 'Browser FaceDetector API',
        boxes: [],
        focusX: 0.5,
        focusY: 0.38,
        message:
          'Local FaceDetector ran with zero faces matched. Tap directly on your portrait to set the focus target.',
      };
    }

    const w = Math.max(1, img.naturalWidth);
    const h = Math.max(1, img.naturalHeight);
    const boxes = detected.map((d) => ({
      x: Math.max(0, Math.min(1, d.boundingBox.x / w)),
      y: Math.max(0, Math.min(1, d.boundingBox.y / h)),
      width: Math.max(0.05, Math.min(1, d.boundingBox.width / w)),
      height: Math.max(0.05, Math.min(1, d.boundingBox.height / h)),
    }));
    const lead = boxes[0];
    return {
      status: 'detected',
      method: 'Browser FaceDetector API',
      boxes,
      focusX: Math.max(0.1, Math.min(0.9, lead.x + lead.width / 2)),
      focusY: Math.max(0.1, Math.min(0.9, lead.y + lead.height * 0.45)),
      message: `Local FaceDetector found ${boxes.length} ${boxes.length === 1 ? 'face' : 'faces'} on-device.`,
    };
  } catch (err) {
    return {
      status: 'error',
      method: 'Local Focus Target',
      boxes: [],
      focusX: 0.5,
      focusY: 0.38,
      message:
        err instanceof Error
          ? `Local FaceDetector failed (${err.message}). Using manual portrait focus target instead.`
          : 'Local FaceDetector unavailable. Using manual portrait focus target instead.',
    };
  }
}

export function resolveCombinedPortraitParams(config: PortraitStudioConfig): {
  adjustments: PhotoAdjustments;
  skinSoftness: number;
  portraitGlow: number;
  studioKeyLight: number;
  softFocus: number;
} {
  const primary = PORTRAIT_PRESETS.find((p) => p.id === config.primaryPresetId) || null;
  const secondary =
    config.secondaryPresetId !== 'none'
      ? PORTRAIT_PRESETS.find((p) => p.id === config.secondaryPresetId) || null
      : null;

  const pRatio = primary ? Math.max(0, Math.min(1, config.primaryIntensity / 100)) : 0;
  const sRatio = secondary ? Math.max(0, Math.min(1, config.secondaryIntensity / 100)) : 0;

  const mix = (
    key: keyof PhotoAdjustments,
    manualExtra = 0,
    min = -100,
    max = 100
  ): number => {
    const pv = (primary?.adjustments[key] as number | undefined) ?? 0;
    const sv = (secondary?.adjustments[key] as number | undefined) ?? 0;
    const combined = pv * pRatio + sv * sRatio * 0.65 + manualExtra;
    return Math.max(min, Math.min(max, Math.round(combined)));
  };

  const adjustments: PhotoAdjustments = {
    ...DEFAULT_ADJUSTMENTS,
    brightness: mix('brightness', 0, -50, 50),
    exposure: mix('exposure', 0, -50, 50),
    contrast: mix('contrast', config.contrastShift, -60, 75),
    highlights: mix('highlights', 0, -50, 50),
    shadows: mix('shadows', 0, -50, 50),
    saturation: mix('saturation', 0, -100, 100),
    hueShift: mix('hueShift', 0, -180, 180),
    hslLightness: mix('hslLightness', 0, -50, 50),
    redShift: mix('redShift', 0, -50, 50),
    greenShift: mix('greenShift', 0, -50, 50),
    blueShift: mix('blueShift', 0, -50, 50),
    temperature: mix('temperature', config.warmthShift, -60, 60),
    tint: mix('tint', 0, -50, 50),
    sharpness: mix('sharpness', 0, 0, 100),
    vignette: mix('vignette', config.vignette, 0, 100),
    grain: mix('grain', config.grain, 0, 60),
    bloom: mix('bloom', Math.round(config.portraitGlow * 0.5), 0, 60),
    sepia: mix('sepia', 0, 0, 100),
    hdr: mix('hdr', 0, 0, 100),
    colorPop: mix('colorPop', 0, 0, 100),
  };

  const skinSoftness = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (primary?.portraitEffects.skinSoftness ?? 0) * pRatio +
          (secondary?.portraitEffects.skinSoftness ?? 0) * sRatio * 0.6 +
          config.skinSoftness
      )
    )
  );
  const portraitGlow = Math.max(
    0,
    Math.min(
      60,
      Math.round(
        (primary?.portraitEffects.portraitGlow ?? 0) * pRatio +
          (secondary?.portraitEffects.portraitGlow ?? 0) * sRatio * 0.6 +
          config.portraitGlow
      )
    )
  );
  const studioKeyLight = Math.max(
    -40,
    Math.min(
      60,
      Math.round(
        (primary?.portraitEffects.studioKeyLight ?? 0) * pRatio +
          (secondary?.portraitEffects.studioKeyLight ?? 0) * sRatio * 0.6 +
          config.studioKeyLight
      )
    )
  );
  const softFocus = Math.max(
    0,
    Math.min(
      50,
      Math.round(
        (primary?.portraitEffects.softFocus ?? 0) * pRatio +
          (secondary?.portraitEffects.softFocus ?? 0) * sRatio * 0.6 +
          config.softFocus
      )
    )
  );

  return {
    adjustments,
    skinSoftness,
    portraitGlow,
    studioKeyLight,
    softFocus,
  };
}

function applySkinToneBilateralBlend(
  ctx: CanvasRenderingContext2D,
  outW: number,
  outH: number,
  skinSoftness: number,
  focusX: number,
  focusY: number
): void {
  if (skinSoftness <= 0) return;
  const blurCanvas = document.createElement('canvas');
  blurCanvas.width = outW;
  blurCanvas.height = outH;
  const bCtx = blurCanvas.getContext('2d', { willReadFrequently: true });
  if (!bCtx) return;

  const blurPx = Math.max(1.5, (skinSoftness / 100) * Math.max(3, Math.min(outW, outH) * 0.012));
  bCtx.filter = `blur(${blurPx.toFixed(1)}px)`;
  bCtx.drawImage(ctx.canvas, 0, 0, outW, outH);

  const sharpData = ctx.getImageData(0, 0, outW, outH);
  const blurData = bCtx.getImageData(0, 0, outW, outH);
  const s = sharpData.data;
  const b = blurData.data;

  const strength = Math.min(0.72, (skinSoftness / 100) * 0.72);
  const fx = focusX * outW;
  const fy = focusY * outH;
  const focusRadius = Math.max(outW, outH) * 0.45;

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const idx = (y * outW + x) * 4;
      const r = s[idx];
      const g = s[idx + 1];
      const bl = s[idx + 2];

      // YCbCr skin chrominance detection (local heuristic, preserves crisp edges via luma diff)
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * bl;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * bl;
      const isSkinChroma = cb >= 74 && cb <= 132 && cr >= 130 && cr <= 178;
      if (!isSkinChroma) continue;

      const dist = Math.hypot(x - fx, y - fy);
      const focusWeight = Math.max(0.28, 1 - Math.min(1, dist / focusRadius) * 0.72);

      // Edge-preserving threshold: keep eyes, brows, lashes, and lip edges crisp
      const lumaDiff =
        Math.abs(r - b[idx]) + Math.abs(g - b[idx + 1]) + Math.abs(bl - b[idx + 2]);
      if (lumaDiff > 64) continue;
      const edgeWeight = 1 - lumaDiff / 64;

      const alpha = strength * focusWeight * edgeWeight;
      s[idx] = Math.round(r * (1 - alpha) + b[idx] * alpha);
      s[idx + 1] = Math.round(g * (1 - alpha) + b[idx + 1] * alpha);
      s[idx + 2] = Math.round(bl * (1 - alpha) + b[idx + 2] * alpha);
    }
  }

  ctx.putImageData(sharpData, 0, 0);
}

export function renderPortraitStudioCanvas(
  img: HTMLImageElement,
  targetCanvas: HTMLCanvasElement,
  config: PortraitStudioConfig,
  maxPreviewDim?: number
): void {
  const { adjustments, skinSoftness, portraitGlow, studioKeyLight, softFocus } =
    resolveCombinedPortraitParams(config);

  let outW = img.naturalWidth;
  let outH = img.naturalHeight;
  if (maxPreviewDim && Math.max(outW, outH) > maxPreviewDim) {
    const scale = maxPreviewDim / Math.max(outW, outH);
    outW = Math.max(1, Math.round(outW * scale));
    outH = Math.max(1, Math.round(outH * scale));
  }

  targetCanvas.width = outW;
  targetCanvas.height = outH;
  const ctx = targetCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, outW, outH);
  ctx.drawImage(img, 0, 0, outW, outH);

  // Step 1: Pixel-level color & tone adjustments + sharpen
  const needsPixelPass =
    adjustments.brightness !== 0 ||
    adjustments.exposure !== 0 ||
    adjustments.contrast !== 0 ||
    adjustments.highlights !== 0 ||
    adjustments.shadows !== 0 ||
    adjustments.saturation !== 0 ||
    (adjustments.hueShift ?? 0) !== 0 ||
    (adjustments.hslLightness ?? 0) !== 0 ||
    (adjustments.redShift ?? 0) !== 0 ||
    (adjustments.greenShift ?? 0) !== 0 ||
    (adjustments.blueShift ?? 0) !== 0 ||
    adjustments.temperature !== 0 ||
    adjustments.tint !== 0 ||
    (adjustments.sepia ?? 0) > 0 ||
    (adjustments.hdr ?? 0) > 0 ||
    (adjustments.colorPop ?? 0) > 0 ||
    adjustments.grain > 0 ||
    adjustments.sharpness > 0;

  if (needsPixelPass) {
    const imgData = ctx.getImageData(0, 0, outW, outH);
    applyPixelAdjustments(imgData, adjustments);
    if (adjustments.sharpness > 0) {
      applySharpenConvolution(imgData, adjustments.sharpness);
    }
    ctx.putImageData(imgData, 0, 0);
  }

  // Step 2: Local skin-tone edge-preserving soften
  if (skinSoftness > 0) {
    applySkinToneBilateralBlend(ctx, outW, outH, skinSoftness, config.focusX, config.focusY);
  }

  // Step 3: Optical Soft Focus lens diffusion
  if (softFocus > 0) {
    const softCanvas = document.createElement('canvas');
    softCanvas.width = Math.max(1, Math.round(outW / 2));
    softCanvas.height = Math.max(1, Math.round(outH / 2));
    const sCtx = softCanvas.getContext('2d');
    if (sCtx) {
      const blurPx = Math.max(2, (softFocus / 50) * 9);
      sCtx.filter = `blur(${blurPx.toFixed(1)}px)`;
      sCtx.drawImage(targetCanvas, 0, 0, softCanvas.width, softCanvas.height);
      ctx.save();
      ctx.globalAlpha = Math.min(0.55, softFocus / 80);
      ctx.drawImage(softCanvas, 0, 0, outW, outH);
      ctx.restore();
    }
  }

  // Step 4: Studio Portrait Key Light around focus target
  if (studioKeyLight !== 0) {
    const fx = config.focusX * outW;
    const fy = config.focusY * outH;
    const maxR = Math.hypot(outW, outH) * 0.65;
    ctx.save();
    if (studioKeyLight > 0) {
      const alpha = Math.min(0.42, (studioKeyLight / 60) * 0.42);
      const grad = ctx.createRadialGradient(fx, fy, maxR * 0.05, fx, fy, maxR * 0.72);
      grad.addColorStop(0, `rgba(255, 248, 235, ${alpha})`);
      grad.addColorStop(0.55, `rgba(255, 240, 220, ${(alpha * 0.35).toFixed(3)})`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, outW, outH);
    } else {
      const dim = Math.min(0.48, (Math.abs(studioKeyLight) / 40) * 0.48);
      const grad = ctx.createRadialGradient(fx, fy, maxR * 0.12, fx, fy, maxR * 0.8);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, `rgba(4, 6, 14, ${dim})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, outW, outH);
    }
    ctx.restore();
  }

  // Step 5: Dreamy Portrait Glow + Optical Bloom
  const totalGlow = Math.max(portraitGlow, adjustments.bloom);
  if (totalGlow > 0) {
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = Math.max(1, Math.round(outW / 4));
    glowCanvas.height = Math.max(1, Math.round(outH / 4));
    const gCtx = glowCanvas.getContext('2d');
    if (gCtx) {
      gCtx.filter = 'blur(10px) brightness(1.18)';
      gCtx.drawImage(targetCanvas, 0, 0, glowCanvas.width, glowCanvas.height);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = Math.min(0.48, totalGlow / 95);
      ctx.drawImage(glowCanvas, 0, 0, outW, outH);
      ctx.restore();
    }
  }

  // Step 6: Cinema Vignette
  if (adjustments.vignette > 0) {
    const cx = outW / 2;
    const cy = outH / 2;
    const outerRadius = Math.hypot(cx, cy);
    const grad = ctx.createRadialGradient(cx, cy, outerRadius * 0.36, cx, cy, outerRadius);
    const alpha = Math.min(0.88, adjustments.vignette / 100);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(4, 6, 14, ${alpha})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, outW, outH);
  }
}

export function renderSinglePortraitPresetThumbnail(
  img: HTMLImageElement,
  preset: PortraitFilterPreset,
  thumbWidth = 108
): string {
  const ratio = img.naturalHeight / Math.max(1, img.naturalWidth);
  const w = thumbWidth;
  const h = Math.max(64, Math.min(168, Math.round(thumbWidth * ratio)));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const cfg: PortraitStudioConfig = {
    ...DEFAULT_PORTRAIT_CONFIG,
    primaryPresetId: preset.id,
    primaryIntensity: 90,
  };
  renderPortraitStudioCanvas(img, c, cfg, Math.max(w, h));
  return c.toDataURL('image/jpeg', 0.78);
}

export function generatePortraitFilterThumbnailsAsync(
  img: HTMLImageElement,
  presets: PortraitFilterPreset[],
  onBatch: (partialMap: Record<string, string>) => void,
  onComplete?: () => void
): () => void {
  let cancelled = false;
  let index = 0;
  const acc: Record<string, string> = {};

  const step = () => {
    if (cancelled) return;
    const batchEnd = Math.min(presets.length, index + 5);
    for (; index < batchEnd; index++) {
      const preset = presets[index];
      acc[preset.id] = renderSinglePortraitPresetThumbnail(img, preset, 108);
    }
    onBatch({ ...acc });
    if (index < presets.length) {
      window.setTimeout(step, 0);
    } else if (onComplete) {
      onComplete();
    }
  };

  window.setTimeout(step, 0);
  return () => {
    cancelled = true;
  };
}
