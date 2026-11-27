import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import { RefineStroke } from '../types/editor';
import { releaseCanvasMemory } from './hdQualityEngine';

export type BgReplacementMode =
  | 'transparent'
  | 'solid'
  | 'gradient'
  | 'blur'
  | 'custom-image';

export type BgBokehStyle = 'circular' | 'soft' | 'cinematic';

export type BgModelStatus =
  | 'idle'
  | 'loading-model'
  | 'running'
  | 'ready'
  | 'unavailable';

export interface BgRemoverConfig {
  backgroundRemoved: boolean;
  backgroundMode: BgReplacementMode;
  solidColor: string;
  gradientStart: string;
  gradientEnd: string;
  gradientAngle: number;
  customBgUrl: string | null;
  blurIntensity: number; // 0..100
  bokehStyle: BgBokehStyle;
  hairRefinement: number; // 0..100
  hairDecontaminate: number; // 0..100
  subjectEdgeShift: number; // -20..20
  edgeFeather: number; // 0..6
  refineStrokes: RefineStroke[];
}

export const DEFAULT_BG_REMOVER_CONFIG: BgRemoverConfig = {
  backgroundRemoved: false,
  backgroundMode: 'transparent',
  solidColor: '#090A10',
  gradientStart: '#6D28D9',
  gradientEnd: '#06070B',
  gradientAngle: 145,
  customBgUrl: null,
  blurIntensity: 68,
  bokehStyle: 'circular',
  hairRefinement: 70,
  hairDecontaminate: 45,
  subjectEdgeShift: 0,
  edgeFeather: 1.5,
  refineStrokes: [],
};

export interface BgSegmentationMask {
  available: boolean;
  width: number;
  height: number;
  /** Floating-point foreground confidence 0..1 per pixel (null when model unavailable) */
  confidence: Float32Array | null;
  coveragePercent: number;
  engineLabel: string;
  statusMessage: string;
  limitationReason?: string;
}

let cachedSegmenterPromise: Promise<ImageSegmenter> | null = null;

export function isLocalSegmentationEnvironmentSupported(): {
  supported: boolean;
  reason?: string;
} {
  if (typeof window === 'undefined') {
    return { supported: false, reason: 'Browser DOM environment unavailable.' };
  }
  if (typeof WebAssembly === 'undefined') {
    return {
      supported: false,
      reason: 'WebAssembly is disabled or unsupported in this browser.',
    };
  }
  return { supported: true };
}

async function getOrInitMediaPipeSegmenter(
  onProgress?: (pct: number, stage: string) => void
): Promise<ImageSegmenter> {
  if (cachedSegmenterPromise) {
    onProgress?.(45, 'Using cached MediaPipe Selfie Segmenter model...');
    return cachedSegmenterPromise;
  }

  onProgress?.(18, 'Loading local MediaPipe WASM runtime...');
  cachedSegmenterPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
    const modelPath = '/mediapipe/models/selfie_segmenter.tflite';
    onProgress?.(42, 'Initializing Selfie Segmenter TFLite model...');

    try {
      return await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: modelPath,
          delegate: 'GPU',
        },
        runningMode: 'IMAGE',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
    } catch {
      onProgress?.(50, 'GPU delegate unavailable — switching to local CPU WASM...');
      return await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: modelPath,
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
    }
  })().catch((err) => {
    cachedSegmenterPromise = null;
    throw err;
  });

  return cachedSegmenterPromise;
}

/**
 * Runs local open-source MediaPipe Selfie Segmenter without paid APIs or fake AI fallbacks.
 * If the model cannot load or WebAssembly is unsupported, returns `available: false` with a clear explanation.
 */
export async function runLocalBgSegmentation(
  img: HTMLImageElement,
  onProgress?: (pct: number, stage: string) => void
): Promise<BgSegmentationMask> {
  const env = isLocalSegmentationEnvironmentSupported();
  if (!env.supported) {
    return {
      available: false,
      width: img.naturalWidth || img.width || 1,
      height: img.naturalHeight || img.height || 1,
      confidence: null,
      coveragePercent: 0,
      engineLabel: 'Local Model Unavailable',
      statusMessage:
        'Local AI segmentation model is unavailable in this environment. No fake AI cutout was applied.',
      limitationReason: `${env.reason} You can still manually isolate or erase areas with the Keep/Erase refine brushes.`,
    };
  }

  try {
    const segmenter = await getOrInitMediaPipeSegmenter(onProgress);
    onProgress?.(68, 'Analyzing subject & hair contours locally...');

    const result = segmenter.segment(img);
    const masks = result.confidenceMasks;
    if (!masks || masks.length === 0) {
      result.close();
      return {
        available: false,
        width: img.naturalWidth || 1,
        height: img.naturalHeight || 1,
        confidence: null,
        coveragePercent: 0,
        engineLabel: 'MediaPipe Selfie Segmenter',
        statusMessage: 'Model returned no confidence mask for this image.',
        limitationReason:
          'MediaPipe Selfie Segmenter could not generate a subject matte here. Use manual Keep/Erase brushes for custom cutouts.',
      };
    }

    const labels = segmenter.getLabels();
    let targetIdx = 0;
    if (masks.length > 1) {
      const personIdx = labels.findIndex((l) =>
        /person|selfie|foreground|body|face|hair/i.test(l)
      );
      targetIdx = personIdx >= 0 ? personIdx : masks.length - 1;
    }

    const mask = masks[targetIdx];
    const w = mask.width;
    const h = mask.height;
    const raw = mask.getAsFloat32Array();
    const confidence = new Float32Array(raw.length);

    let fgPixels = 0;
    for (let i = 0; i < raw.length; i++) {
      const v = Math.max(0, Math.min(1, raw[i]));
      confidence[i] = v;
      if (v >= 0.5) fgPixels++;
    }
    result.close();

    onProgress?.(92, 'Refining alpha hair matte...');
    const coveragePercent = Math.round((fgPixels / Math.max(1, confidence.length)) * 100);

    let limitationReason: string | undefined;
    let statusMessage = `MediaPipe Selfie Segmenter ready (${coveragePercent}% foreground detected locally on-device).`;

    if (coveragePercent < 2) {
      limitationReason =
        'Local model (MediaPipe Selfie Segmenter) is trained for people/portraits and found under 2% subject in this scene. Paint Keep strokes over non-human objects to isolate them manually.';
      statusMessage = 'Minimal portrait subject detected (<2%).';
    } else if (coveragePercent > 98) {
      limitationReason =
        'Local model marked >98% of the frame as foreground. Adjust Subject Edge or paint Erase strokes on background regions.';
      statusMessage = 'Foreground covers nearly the entire frame (>98%).';
    }

    onProgress?.(100, 'Subject mask ready');
    return {
      available: true,
      width: w,
      height: h,
      confidence,
      coveragePercent,
      engineLabel: 'MediaPipe Selfie Segmenter (Local WASM)',
      statusMessage,
      limitationReason,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unable to initialize MediaPipe WASM/TFLite model.';
    return {
      available: false,
      width: img.naturalWidth || 1,
      height: img.naturalHeight || 1,
      confidence: null,
      coveragePercent: 0,
      engineLabel: 'Local Model Unavailable',
      statusMessage: 'Local segmentation model failed to load.',
      limitationReason: `Compatible local model could not run (${reason}). Instead of producing fake AI results, the original image is preserved — use the manual Keep/Erase brushes or try on a WebAssembly-enabled browser.`,
    };
  }
}

export function buildRefinedAlphaMaskCanvas(
  maskData: BgSegmentationMask | null,
  outW: number,
  outH: number,
  config: BgRemoverConfig
): HTMLCanvasElement {
  const fullMask = document.createElement('canvas');
  fullMask.width = outW;
  fullMask.height = outH;
  const fCtx = fullMask.getContext('2d');
  if (!fCtx) return fullMask;

  // If background removal hasn't been triggered OR local model is unavailable without manual strokes,
  // start from opaque alpha (unless user manually painted Erase strokes!)
  if (!maskData?.available || !maskData.confidence) {
    fCtx.fillStyle = 'rgba(255,255,255,1)';
    fCtx.fillRect(0, 0, outW, outH);
    applyManualBrushStrokes(fCtx, outW, outH, config.refineStrokes);
    return fullMask;
  }

  const mw = maskData.width;
  const mh = maskData.height;
  const smallMask = document.createElement('canvas');
  smallMask.width = mw;
  smallMask.height = mh;

  try {
    const sCtx = smallMask.getContext('2d', { willReadFrequently: true });
    if (sCtx) {
      const imgData = sCtx.createImageData(mw, mh);
      const d = imgData.data;

      const thresholdBias = (-config.subjectEdgeShift / 20) * 0.24;
      const hairGamma = 1 + (config.hairRefinement / 100) * 1.15;
      const src = maskData.confidence;

      for (let i = 0; i < src.length; i++) {
        let v = Math.max(0, Math.min(1, src[i] - thresholdBias));

        if (v < 0.06) {
          v = 0;
        } else if (v > 0.94) {
          v = 1;
        } else {
          const t = (v - 0.06) / 0.88;
          v =
            t < 0.5
              ? 0.5 * Math.pow(t * 2, hairGamma)
              : 1 - 0.5 * Math.pow((1 - t) * 2, 1 + (config.hairRefinement / 100) * 0.6);
        }

        const p = i * 4;
        d[p] = 255;
        d[p + 1] = 255;
        d[p + 2] = 255;
        d[p + 3] = Math.round(v * 255);
      }
      sCtx.putImageData(imgData, 0, 0);

      fCtx.imageSmoothingEnabled = true;
      fCtx.imageSmoothingQuality = 'high';
      if (config.edgeFeather > 0) {
        fCtx.filter = `blur(${(config.edgeFeather * Math.max(0.55, outW / 960)).toFixed(1)}px)`;
      }
      fCtx.drawImage(smallMask, 0, 0, outW, outH);
      fCtx.filter = 'none';
    }
  } finally {
    releaseCanvasMemory(smallMask);
  }

  applyManualBrushStrokes(fCtx, outW, outH, config.refineStrokes);
  return fullMask;
}

function applyManualBrushStrokes(
  fCtx: CanvasRenderingContext2D,
  outW: number,
  outH: number,
  strokes: RefineStroke[]
): void {
  if (!strokes.length) return;
  for (const stroke of strokes) {
    const cx = stroke.x * outW;
    const cy = stroke.y * outH;
    const r = Math.max(6, stroke.radius * outW);
    fCtx.save();
    fCtx.globalCompositeOperation = stroke.mode === 'keep' ? 'source-over' : 'destination-out';
    const grad = fCtx.createRadialGradient(cx, cy, r * 0.45, cx, cy, r);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    fCtx.fillStyle = grad;
    fCtx.beginPath();
    fCtx.arc(cx, cy, r, 0, Math.PI * 2);
    fCtx.fill();
    fCtx.restore();
  }
}

/**
 * Reduces background color spill on semi-transparent hair and subject fringe pixels
 * by pulling boundary pixels toward neutral subject interior tone proportional to `amount`.
 */
function decontaminateHairFringe(
  fgCtx: CanvasRenderingContext2D,
  w: number,
  h: number,
  amount: number
): void {
  if (amount <= 0) return;
  const strength = Math.min(0.85, (amount / 100) * 0.72);
  const imgData = fgCtx.getImageData(0, 0, w, h);
  const d = imgData.data;

  // Estimate core foreground tint from opaque pixels (alpha >= 242)
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;
  const step = Math.max(1, Math.floor((w * h) / 6000));
  for (let p = 0; p < w * h; p += step) {
    const i = p * 4;
    if (d[i + 3] >= 242) {
      rSum += d[i];
      gSum += d[i + 1];
      bSum += d[i + 2];
      count++;
    }
  }
  if (count === 0) return;

  const fgR = rSum / count;
  const fgG = gSum / count;
  const fgB = bSum / count;

  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a > 8 && a < 235) {
      const edgeWeight = (1 - a / 255) * strength;
      d[i] = Math.round(d[i] * (1 - edgeWeight) + fgR * edgeWeight);
      d[i + 1] = Math.round(d[i + 1] * (1 - edgeWeight) + fgG * edgeWeight);
      d[i + 2] = Math.round(d[i + 2] * (1 - edgeWeight) + fgB * edgeWeight);
    }
  }
  fgCtx.putImageData(imgData, 0, 0);
}

function renderDslrBackgroundPass(
  srcBgCanvas: HTMLCanvasElement,
  targetCanvas: HTMLCanvasElement,
  blurIntensity: number,
  bokehStyle: BgBokehStyle
): void {
  const w = targetCanvas.width;
  const h = targetCanvas.height;
  const ctx = targetCanvas.getContext('2d');
  if (!ctx) return;

  if (blurIntensity <= 0) {
    ctx.drawImage(srcBgCanvas, 0, 0, w, h);
    return;
  }

  if (bokehStyle === 'soft') {
    const blurPx = (blurIntensity / 100) * Math.max(16, Math.min(w, h) * 0.036);
    ctx.save();
    ctx.filter = `blur(${blurPx.toFixed(1)}px)`;
    ctx.drawImage(
      srcBgCanvas,
      -blurPx * 0.4,
      -blurPx * 0.4,
      w + blurPx * 0.8,
      h + blurPx * 0.8
    );
    ctx.restore();
    return;
  }

  if (bokehStyle === 'cinematic') {
    const nearBlur = (blurIntensity / 100) * Math.max(4, Math.min(w, h) * 0.009);
    const farBlur = (blurIntensity / 100) * Math.max(18, Math.min(w, h) * 0.042);

    ctx.save();
    ctx.filter = `blur(${nearBlur.toFixed(1)}px)`;
    ctx.drawImage(srcBgCanvas, 0, 0, w, h);
    ctx.restore();

    const farCanvas = document.createElement('canvas');
    farCanvas.width = w;
    farCanvas.height = h;
    try {
      const fCtx = farCanvas.getContext('2d');
      if (fCtx) {
        fCtx.filter = `blur(${farBlur.toFixed(1)}px)`;
        fCtx.drawImage(
          srcBgCanvas,
          -farBlur * 0.4,
          -farBlur * 0.4,
          w + farBlur * 0.8,
          h + farBlur * 0.8
        );
        fCtx.filter = 'none';
        fCtx.globalCompositeOperation = 'destination-in';
        const depthGrad = fCtx.createLinearGradient(0, 0, 0, h);
        depthGrad.addColorStop(0, 'rgba(255,255,255,1)');
        depthGrad.addColorStop(0.62, 'rgba(255,255,255,0.85)');
        depthGrad.addColorStop(1, 'rgba(255,255,255,0.18)');
        fCtx.fillStyle = depthGrad;
        fCtx.fillRect(0, 0, w, h);
        ctx.drawImage(farCanvas, 0, 0, w, h);
      }
    } finally {
      releaseCanvasMemory(farCanvas);
    }
    return;
  }

  // Circular disc bokeh
  const maxBlurPx = Math.max(4, (blurIntensity / 100) * Math.max(14, Math.min(w, h) * 0.032));
  ctx.save();
  ctx.filter = `blur(${(maxBlurPx * 0.72).toFixed(1)}px)`;
  ctx.drawImage(
    srcBgCanvas,
    -maxBlurPx * 0.4,
    -maxBlurPx * 0.4,
    w + maxBlurPx * 0.8,
    h + maxBlurPx * 0.8
  );
  ctx.restore();

  const smallW = Math.max(48, Math.round(w / 4));
  const smallH = Math.max(48, Math.round(h / 4));
  const hiCanvas = document.createElement('canvas');
  hiCanvas.width = smallW;
  hiCanvas.height = smallH;

  try {
    const hCtx = hiCanvas.getContext('2d', { willReadFrequently: true });
    if (!hCtx) return;
    hCtx.drawImage(srcBgCanvas, 0, 0, smallW, smallH);
    const imgData = hCtx.getImageData(0, 0, smallW, smallH);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i + 3] = lum < 135 ? 0 : Math.min(255, Math.round(((lum - 135) / 120) * 200));
    }
    hCtx.putImageData(imgData, 0, 0);

    const ringRadius = Math.max(2.5, (blurIntensity / 100) * Math.max(8, Math.min(w, h) * 0.018));
    const taps = 10;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = Math.min(0.28, (blurIntensity / 100) * 0.24) / (taps * 0.35);
    for (let i = 0; i < taps; i++) {
      const angle = (i / taps) * Math.PI * 2;
      ctx.drawImage(hiCanvas, Math.cos(angle) * ringRadius, Math.sin(angle) * ringRadius, w, h);
    }
    ctx.restore();
  } finally {
    releaseCanvasMemory(hiCanvas);
  }
}

export function renderBgRemoverComposition(
  img: HTMLImageElement,
  targetCanvas: HTMLCanvasElement,
  maskData: BgSegmentationMask | null,
  config: BgRemoverConfig,
  options?: {
    maxPreviewDim?: number;
    customBgImg?: HTMLImageElement | null;
    showMaskOverlay?: boolean;
  }
): { outW: number; outH: number } {
  const srcW = Math.max(1, img.naturalWidth || img.width);
  const srcH = Math.max(1, img.naturalHeight || img.height);

  let outW = srcW;
  let outH = srcH;
  if (options?.maxPreviewDim && Math.max(srcW, srcH) > options.maxPreviewDim) {
    const scale = options.maxPreviewDim / Math.max(srcW, srcH);
    outW = Math.max(1, Math.round(srcW * scale));
    outH = Math.max(1, Math.round(srcH * scale));
  }

  targetCanvas.width = outW;
  targetCanvas.height = outH;
  const ctx = targetCanvas.getContext('2d');
  if (!ctx) return { outW, outH };

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, outW, outH);

  // If user has not removed the background yet AND has no manual erase strokes, show crisp original
  const hasManualErase = config.refineStrokes.some((s) => s.mode === 'erase');
  if (!config.backgroundRemoved && !hasManualErase) {
    ctx.drawImage(img, 0, 0, outW, outH);
    return { outW, outH };
  }

  // If local model is unavailable AND user hasn't painted manual strokes, show original honestly (no fake cutout!)
  if ((!maskData?.available || !maskData.confidence) && !hasManualErase && !options?.showMaskOverlay) {
    ctx.drawImage(img, 0, 0, outW, outH);
    return { outW, outH };
  }

  const maskCanvas = buildRefinedAlphaMaskCanvas(maskData, outW, outH, config);
  const fgCanvas = document.createElement('canvas');
  fgCanvas.width = outW;
  fgCanvas.height = outH;

  let rawBgCanvas: HTMLCanvasElement | null = null;
  let blurredBgCanvas: HTMLCanvasElement | null = null;
  let tintCanvas: HTMLCanvasElement | null = null;

  try {
    // 1. Background layer (unless pure transparent alpha PNG)
    if (config.backgroundMode !== 'transparent') {
      rawBgCanvas = document.createElement('canvas');
      rawBgCanvas.width = outW;
      rawBgCanvas.height = outH;
      const bgCtx = rawBgCanvas.getContext('2d');

      if (bgCtx) {
        if (config.backgroundMode === 'solid') {
          bgCtx.fillStyle = config.solidColor || '#090A10';
          bgCtx.fillRect(0, 0, outW, outH);
        } else if (config.backgroundMode === 'gradient') {
          const rad = ((config.gradientAngle || 145) * Math.PI) / 180;
          const cx = outW / 2;
          const cy = outH / 2;
          const len = Math.hypot(outW, outH) * 0.5;
          const grad = bgCtx.createLinearGradient(
            cx - Math.cos(rad) * len,
            cy - Math.sin(rad) * len,
            cx + Math.cos(rad) * len,
            cy + Math.sin(rad) * len
          );
          grad.addColorStop(0, config.gradientStart || '#6D28D9');
          grad.addColorStop(1, config.gradientEnd || '#06070B');
          bgCtx.fillStyle = grad;
          bgCtx.fillRect(0, 0, outW, outH);
        } else if (
          config.backgroundMode === 'custom-image' &&
          options?.customBgImg &&
          options.customBgImg.naturalWidth > 0
        ) {
          const scale = Math.max(
            outW / options.customBgImg.naturalWidth,
            outH / options.customBgImg.naturalHeight
          );
          const dw = options.customBgImg.naturalWidth * scale;
          const dh = options.customBgImg.naturalHeight * scale;
          bgCtx.drawImage(options.customBgImg, (outW - dw) / 2, (outH - dh) / 2, dw, dh);
        } else {
          // DSLR blur over original scene OR placeholder dark gradient if custom image not yet chosen
          if (config.backgroundMode === 'blur') {
            bgCtx.drawImage(img, 0, 0, outW, outH);
          } else {
            bgCtx.fillStyle = '#0A0B12';
            bgCtx.fillRect(0, 0, outW, outH);
          }
        }

        // Apply DSLR-style lens blur if mode is 'blur' OR user dialed blur on custom-image
        if (
          config.backgroundMode === 'blur' ||
          (config.backgroundMode === 'custom-image' && config.blurIntensity > 0)
        ) {
          blurredBgCanvas = document.createElement('canvas');
          blurredBgCanvas.width = outW;
          blurredBgCanvas.height = outH;
          renderDslrBackgroundPass(
            rawBgCanvas,
            blurredBgCanvas,
            config.blurIntensity,
            config.bokehStyle
          );
          ctx.drawImage(blurredBgCanvas, 0, 0, outW, outH);
        } else {
          ctx.drawImage(rawBgCanvas, 0, 0, outW, outH);
        }
      }
    }

    // 2. Cutout foreground subject + hair edge refinement
    const fgCtx = fgCanvas.getContext('2d', { willReadFrequently: true });
    if (fgCtx) {
      fgCtx.imageSmoothingEnabled = true;
      fgCtx.imageSmoothingQuality = 'high';
      fgCtx.drawImage(img, 0, 0, outW, outH);
      fgCtx.save();
      fgCtx.globalCompositeOperation = 'destination-in';
      fgCtx.drawImage(maskCanvas, 0, 0, outW, outH);
      fgCtx.restore();

      if (config.hairDecontaminate > 0) {
        decontaminateHairFringe(fgCtx, outW, outH, config.hairDecontaminate);
      }

      ctx.drawImage(fgCanvas, 0, 0, outW, outH);
    }

    // 3. Optional Mask Overlay visualization
    if (options?.showMaskOverlay) {
      tintCanvas = document.createElement('canvas');
      tintCanvas.width = outW;
      tintCanvas.height = outH;
      const tCtx = tintCanvas.getContext('2d');
      if (tCtx) {
        tCtx.fillStyle = 'rgba(139, 92, 246, 0.42)';
        tCtx.fillRect(0, 0, outW, outH);
        tCtx.globalCompositeOperation = 'destination-in';
        tCtx.drawImage(maskCanvas, 0, 0, outW, outH);
        ctx.drawImage(tintCanvas, 0, 0, outW, outH);
      }
    }
  } finally {
    releaseCanvasMemory(maskCanvas);
    releaseCanvasMemory(fgCanvas);
    if (rawBgCanvas) releaseCanvasMemory(rawBgCanvas);
    if (blurredBgCanvas) releaseCanvasMemory(blurredBgCanvas);
    if (tintCanvas) releaseCanvasMemory(tintCanvas);
  }

  return { outW, outH };
}
