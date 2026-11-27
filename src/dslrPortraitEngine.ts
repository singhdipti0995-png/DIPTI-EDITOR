import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import { DslrStudioConfig, RefineStroke } from '../types/editor';

export const DEFAULT_DSLR_CONFIG: DslrStudioConfig = {
  blurIntensity: 68,
  bokehStyle: 'circular',
  backgroundMode: 'original-blur',
  customGradientStart: '#4C1D95',
  customGradientEnd: '#09090F',
  customGradientAngle: 145,
  hairRefinement: 65,
  subjectEdgeShift: 0,
  edgeFeather: 3,
  portraitLighting: 12,
  bgBrightness: -6,
  bgSaturation: -8,
  refineStrokes: [],
};

export interface SubjectMaskData {
  width: number;
  height: number;
  /** Floating-point foreground confidence 0..1 per pixel */
  confidence: Float32Array;
  engine: 'mediapipe-selfie' | 'local-heuristic-fallback';
  coveragePercent: number;
  statusMessage: string;
  isFallback: boolean;
}

let cachedSegmenterPromise: Promise<ImageSegmenter> | null = null;

async function getMediaPipeSegmenter(): Promise<ImageSegmenter> {
  if (cachedSegmenterPromise) return cachedSegmenterPromise;

  cachedSegmenterPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
    const modelPath = '/mediapipe/models/selfie_segmenter.tflite';

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
 * Local color-boundary + center-weighted fallback mask used ONLY if MediaPipe WASM/TFLite cannot run.
 */
export function buildFallbackPortraitMask(img: HTMLImageElement): SubjectMaskData {
  const maxDim = 320;
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(32, Math.round(img.naturalWidth * scale));
  const h = Math.max(32, Math.round(img.naturalHeight * scale));

  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const conf = new Float32Array(w * h);

  if (!ctx) {
    conf.fill(1);
    return {
      width: w,
      height: h,
      confidence: conf,
      engine: 'local-heuristic-fallback',
      coveragePercent: 100,
      statusMessage:
        'Canvas 2D unavailable for segmentation. Use the manual Keep/Erase mask brush.',
      isFallback: true,
    };
  }

  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  // Sample border background color mean from top/left/right margins
  let br = 0;
  let bg = 0;
  let bb = 0;
  let count = 0;
  for (let x = 0; x < w; x += 2) {
    const idx = x * 4;
    br += data[idx];
    bg += data[idx + 1];
    bb += data[idx + 2];
    count++;
  }
  for (let y = 0; y < Math.floor(h * 0.7); y += 2) {
    for (const x of [0, w - 1]) {
      const idx = (y * w + x) * 4;
      br += data[idx];
      bg += data[idx + 1];
      bb += data[idx + 2];
      count++;
    }
  }
  br /= Math.max(1, count);
  bg /= Math.max(1, count);
  bb /= Math.max(1, count);

  let fgCount = 0;
  const cx = w * 0.5;
  const cy = h * 0.54;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const idx = p * 4;
      const dr = data[idx] - br;
      const dg = data[idx + 1] - bg;
      const db = data[idx + 2] - bb;
      const colorDist = Math.sqrt(dr * dr + dg * dg + db * db) / 441.67;

      const nx = (x - cx) / (w * 0.34);
      const ny = (y - cy) / (h * 0.48);
      const radialPrior = Math.max(0, 1 - (nx * nx + ny * ny));

      const rawScore = colorDist * 1.45 + radialPrior * 0.65 - 0.38;
      const smooth = Math.max(0, Math.min(1, rawScore * 2.2));
      conf[p] = smooth;
      if (smooth > 0.5) fgCount++;
    }
  }

  return {
    width: w,
    height: h,
    confidence: conf,
    engine: 'local-heuristic-fallback',
    coveragePercent: Math.round((fgCount / conf.length) * 100),
    statusMessage:
      'Local MediaPipe neural model could not initialize on this browser. Switched honestly to Color-Boundary Fallback Mask — refine edges with the Keep/Erase brush if needed.',
    isFallback: true,
  };
}

export async function runLocalSubjectSegmentation(
  img: HTMLImageElement
): Promise<SubjectMaskData> {
  if (typeof window === 'undefined' || typeof WebAssembly === 'undefined') {
    return buildFallbackPortraitMask(img);
  }

  try {
    const segmenter = await getMediaPipeSegmenter();
    const result = segmenter.segment(img);
    const masks = result.confidenceMasks;
    if (!masks || masks.length === 0) {
      result.close();
      return buildFallbackPortraitMask(img);
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

    const coveragePercent = Math.round((fgPixels / Math.max(1, confidence.length)) * 100);
    if (coveragePercent < 2 || coveragePercent > 98) {
      return {
        width: w,
        height: h,
        confidence,
        engine: 'mediapipe-selfie',
        coveragePercent,
        statusMessage:
          coveragePercent < 2
            ? 'MediaPipe Selfie Segmenter found minimal foreground subject in this frame. Use Keep/Erase brush to mark your subject manually.'
            : 'MediaPipe Selfie Segmenter marked nearly the entire frame as foreground. Lower Subject Edge or paint Erase strokes on background areas.',
        isFallback: false,
      };
    }

    return {
      width: w,
      height: h,
      confidence,
      engine: 'mediapipe-selfie',
      coveragePercent,
      statusMessage: `MediaPipe Selfie Segmenter active (${coveragePercent}% subject detected locally on-device).`,
      isFallback: false,
    };
  } catch (err) {
    const fallback = buildFallbackPortraitMask(img);
    const reason = err instanceof Error ? err.message : 'WASM/Model init failed';
    return {
      ...fallback,
      statusMessage: `MediaPipe model unavailable (${reason}). Using local color-boundary fallback mask — touch Keep/Erase brush is active for manual edge refinement.`,
    };
  }
}

function createMaskCanvasFromData(
  maskData: SubjectMaskData,
  outW: number,
  outH: number,
  hairRefinement: number,
  subjectEdgeShift: number,
  edgeFeather: number,
  refineStrokes: RefineStroke[]
): HTMLCanvasElement {
  // Build mask at segmentation resolution first, apply hair/edge matte curve, then smoothly upscale
  const mw = maskData.width;
  const mh = maskData.height;
  const smallMask = document.createElement('canvas');
  smallMask.width = mw;
  smallMask.height = mh;
  const sCtx = smallMask.getContext('2d', { willReadFrequently: true });
  if (!sCtx) return smallMask;

  const imgData = sCtx.createImageData(mw, mh);
  const d = imgData.data;

  // subjectEdgeShift (-20..20) shifts threshold around 0.5
  const thresholdBias = (-subjectEdgeShift / 20) * 0.24;
  // hairRefinement (0..100) sharpens mid-confidence hair strands & cleans faint background halo
  const hairGamma = 1 + (hairRefinement / 100) * 1.15;

  const src = maskData.confidence;
  for (let i = 0; i < src.length; i++) {
    let v = src[i] - thresholdBias;
    v = Math.max(0, Math.min(1, v));

    // Hair & strand matte shaping: preserve fine hair wisps between 0.15..0.85 while clamping background spill
    if (v < 0.08) {
      v = 0;
    } else if (v > 0.92) {
      v = 1;
    } else {
      const t = (v - 0.08) / 0.84;
      // S-curve + hair detail preservation
      const shaped = t < 0.5
        ? 0.5 * Math.pow(t * 2, hairGamma)
        : 1 - 0.5 * Math.pow((1 - t) * 2, 1 + (hairRefinement / 100) * 0.55);
      v = shaped;
    }

    const alpha = Math.round(v * 255);
    const p = i * 4;
    d[p] = 255;
    d[p + 1] = 255;
    d[p + 2] = 255;
    d[p + 3] = alpha;
  }
  sCtx.putImageData(imgData, 0, 0);

  // Upscale smoothly to output size + apply edge feather + touch Keep/Erase brush strokes
  const fullMask = document.createElement('canvas');
  fullMask.width = outW;
  fullMask.height = outH;
  const fCtx = fullMask.getContext('2d');
  if (!fCtx) return fullMask;

  fCtx.imageSmoothingEnabled = true;
  fCtx.imageSmoothingQuality = 'high';
  if (edgeFeather > 0) {
    fCtx.filter = `blur(${(edgeFeather * Math.max(0.6, outW / 900)).toFixed(1)}px)`;
  }
  fCtx.drawImage(smallMask, 0, 0, outW, outH);
  fCtx.filter = 'none';

  // Apply manual user touch strokes (Keep Subject / Erase Background)
  if (refineStrokes.length > 0) {
    for (const stroke of refineStrokes) {
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

  return fullMask;
}

function renderCircularDiscBokeh(
  srcBgCanvas: HTMLCanvasElement,
  targetCanvas: HTMLCanvasElement,
  blurIntensity: number
): void {
  const w = targetCanvas.width;
  const h = targetCanvas.height;
  const ctx = targetCanvas.getContext('2d');
  if (!ctx) return;

  if (blurIntensity <= 0) {
    ctx.drawImage(srcBgCanvas, 0, 0, w, h);
    return;
  }

  // First pass: soft lens base
  const maxBlurPx = Math.max(4, (blurIntensity / 100) * Math.max(14, Math.min(w, h) * 0.032));
  ctx.save();
  ctx.filter = `blur(${(maxBlurPx * 0.72).toFixed(1)}px)`;
  ctx.drawImage(srcBgCanvas, -maxBlurPx * 0.4, -maxBlurPx * 0.4, w + maxBlurPx * 0.8, h + maxBlurPx * 0.8);
  ctx.restore();

  // Second pass: multi-tap circular aperture PSF on bright highlights for genuine circular bokeh discs
  const smallW = Math.max(48, Math.round(w / 4));
  const smallH = Math.max(48, Math.round(h / 4));
  const hiCanvas = document.createElement('canvas');
  hiCanvas.width = smallW;
  hiCanvas.height = smallH;
  const hCtx = hiCanvas.getContext('2d', { willReadFrequently: true });
  if (!hCtx) return;

  hCtx.drawImage(srcBgCanvas, 0, 0, smallW, smallH);
  const imgData = hCtx.getImageData(0, 0, smallW, smallH);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (lum < 135) {
      d[i + 3] = 0;
    } else {
      const weight = Math.min(255, Math.round(((lum - 135) / 120) * 200));
      d[i + 3] = weight;
    }
  }
  hCtx.putImageData(imgData, 0, 0);

  const ringRadius = Math.max(2.5, (blurIntensity / 100) * Math.max(8, Math.min(w, h) * 0.018));
  const taps = 10;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = Math.min(0.28, (blurIntensity / 100) * 0.24) / (taps * 0.35);
  for (let i = 0; i < taps; i++) {
    const angle = (i / taps) * Math.PI * 2;
    const dx = Math.cos(angle) * ringRadius;
    const dy = Math.sin(angle) * ringRadius;
    ctx.drawImage(hiCanvas, dx, dy, w, h);
  }
  ctx.restore();
}

function renderCinematicDepthBlur(
  srcBgCanvas: HTMLCanvasElement,
  targetCanvas: HTMLCanvasElement,
  blurIntensity: number
): void {
  const w = targetCanvas.width;
  const h = targetCanvas.height;
  const ctx = targetCanvas.getContext('2d');
  if (!ctx) return;

  if (blurIntensity <= 0) {
    ctx.drawImage(srcBgCanvas, 0, 0, w, h);
    return;
  }

  // Near-plane mild blur at bottom transitioning to deep far-plane blur at upper background
  const nearBlur = (blurIntensity / 100) * Math.max(4, Math.min(w, h) * 0.009);
  const farBlur = (blurIntensity / 100) * Math.max(18, Math.min(w, h) * 0.042);

  ctx.save();
  ctx.filter = `blur(${nearBlur.toFixed(1)}px)`;
  ctx.drawImage(srcBgCanvas, 0, 0, w, h);
  ctx.restore();

  const farCanvas = document.createElement('canvas');
  farCanvas.width = w;
  farCanvas.height = h;
  const fCtx = farCanvas.getContext('2d');
  if (!fCtx) return;

  fCtx.filter = `blur(${farBlur.toFixed(1)}px)`;
  fCtx.drawImage(srcBgCanvas, -farBlur * 0.4, -farBlur * 0.4, w + farBlur * 0.8, h + farBlur * 0.8);
  fCtx.filter = 'none';

  // Mask far-plane blur with smooth top-to-bottom depth gradient
  fCtx.globalCompositeOperation = 'destination-in';
  const depthGrad = fCtx.createLinearGradient(0, 0, 0, h);
  depthGrad.addColorStop(0, 'rgba(255,255,255,1)');
  depthGrad.addColorStop(0.62, 'rgba(255,255,255,0.85)');
  depthGrad.addColorStop(1, 'rgba(255,255,255,0.18)');
  fCtx.fillStyle = depthGrad;
  fCtx.fillRect(0, 0, w, h);

  ctx.drawImage(farCanvas, 0, 0, w, h);

  // Subtle atmospheric depth falloff vignette
  const falloff = ctx.createRadialGradient(w * 0.5, h * 0.42, Math.min(w, h) * 0.25, w * 0.5, h * 0.5, Math.hypot(w, h) * 0.65);
  falloff.addColorStop(0, 'rgba(0,0,0,0)');
  falloff.addColorStop(1, `rgba(4,5,12,${Math.min(0.42, (blurIntensity / 100) * 0.36).toFixed(3)})`);
  ctx.fillStyle = falloff;
  ctx.fillRect(0, 0, w, h);
}

function drawStudioBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  config: DslrStudioConfig,
  customBgImg?: HTMLImageElement | null
): void {
  if (config.backgroundMode === 'black-studio') {
    const grad = ctx.createRadialGradient(w * 0.5, h * 0.36, w * 0.04, w * 0.5, h * 0.45, Math.hypot(w, h) * 0.65);
    grad.addColorStop(0, '#1A1C24');
    grad.addColorStop(0.55, '#0B0C11');
    grad.addColorStop(1, '#030407');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    return;
  }

  if (config.backgroundMode === 'white-studio') {
    const grad = ctx.createRadialGradient(w * 0.5, h * 0.35, w * 0.08, w * 0.5, h * 0.45, Math.hypot(w, h) * 0.7);
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.65, '#F1F5F9');
    grad.addColorStop(1, '#CBD5E1');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    return;
  }

  if (config.backgroundMode === 'purple-luxury') {
    const grad = ctx.createRadialGradient(w * 0.5, h * 0.32, w * 0.05, w * 0.5, h * 0.45, Math.hypot(w, h) * 0.72);
    grad.addColorStop(0, '#6D28D9');
    grad.addColorStop(0.42, '#3B0764');
    grad.addColorStop(0.8, '#16092B');
    grad.addColorStop(1, '#050409');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    return;
  }

  if (config.backgroundMode === 'gold-cinematic') {
    const grad = ctx.createRadialGradient(w * 0.5, h * 0.34, w * 0.04, w * 0.5, h * 0.45, Math.hypot(w, h) * 0.72);
    grad.addColorStop(0, '#926918');
    grad.addColorStop(0.38, '#4A320A');
    grad.addColorStop(0.75, '#1A1206');
    grad.addColorStop(1, '#060504');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    return;
  }

  if (config.backgroundMode === 'custom-gradient') {
    const rad = ((config.customGradientAngle || 145) * Math.PI) / 180;
    const cx = w / 2;
    const cy = h / 2;
    const len = Math.hypot(w, h) * 0.5;
    const dx = Math.cos(rad) * len;
    const dy = Math.sin(rad) * len;
    const grad = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
    grad.addColorStop(0, config.customGradientStart || '#4C1D95');
    grad.addColorStop(1, config.customGradientEnd || '#09090F');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    return;
  }

  if (config.backgroundMode === 'custom-image' && customBgImg && customBgImg.naturalWidth > 0) {
    const scale = Math.max(w / customBgImg.naturalWidth, h / customBgImg.naturalHeight);
    const dw = customBgImg.naturalWidth * scale;
    const dh = customBgImg.naturalHeight * scale;
    ctx.drawImage(customBgImg, (w - dw) / 2, (h - dh) / 2, dw, dh);
    return;
  }

  // Fallback solid dark studio if custom image hasn't been picked yet
  ctx.fillStyle = '#090B12';
  ctx.fillRect(0, 0, w, h);
}

export function renderDslrPortraitComposition(
  img: HTMLImageElement,
  targetCanvas: HTMLCanvasElement,
  maskData: SubjectMaskData,
  config: DslrStudioConfig,
  options?: {
    maxPreviewDim?: number;
    customBgImg?: HTMLImageElement | null;
    showMaskOverlay?: boolean;
  }
): void {
  const maxDim = options?.maxPreviewDim;
  let outW = img.naturalWidth;
  let outH = img.naturalHeight;
  if (maxDim && Math.max(outW, outH) > maxDim) {
    const scale = maxDim / Math.max(outW, outH);
    outW = Math.max(1, Math.round(outW * scale));
    outH = Math.max(1, Math.round(outH * scale));
  }

  targetCanvas.width = outW;
  targetCanvas.height = outH;
  const ctx = targetCanvas.getContext('2d');
  if (!ctx) return;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 1. Build refined alpha mask (hair refinement + edge choke + feather + keep/erase strokes)
  const maskCanvas = createMaskCanvasFromData(
    maskData,
    outW,
    outH,
    config.hairRefinement,
    config.subjectEdgeShift,
    config.edgeFeather,
    config.refineStrokes
  );

  // 2. Render raw background source (either original photo background or chosen studio/custom backdrop)
  const rawBgCanvas = document.createElement('canvas');
  rawBgCanvas.width = outW;
  rawBgCanvas.height = outH;
  const rawBgCtx = rawBgCanvas.getContext('2d');
  if (!rawBgCtx) return;

  if (config.backgroundMode === 'original-blur') {
    rawBgCtx.drawImage(img, 0, 0, outW, outH);
  } else {
    drawStudioBackdrop(rawBgCtx, outW, outH, config, options?.customBgImg);
  }

  // 3. Apply Background Brightness & Saturation controls independently from subject
  const bgBrightPct = Math.max(25, 100 + config.bgBrightness);
  const bgSatPct = Math.max(0, 100 + config.bgSaturation);
  if (config.bgBrightness !== 0 || config.bgSaturation !== 0) {
    const gradedBg = document.createElement('canvas');
    gradedBg.width = outW;
    gradedBg.height = outH;
    const gCtx = gradedBg.getContext('2d');
    if (gCtx) {
      gCtx.filter = `brightness(${bgBrightPct}%) saturate(${bgSatPct}%)`;
      gCtx.drawImage(rawBgCanvas, 0, 0, outW, outH);
      rawBgCtx.clearRect(0, 0, outW, outH);
      rawBgCtx.drawImage(gradedBg, 0, 0, outW, outH);
    }
  }

  // 4. Render DSLR lens blur / bokeh onto background canvas ONLY (never blurs the subject!)
  const blurredBgCanvas = document.createElement('canvas');
  blurredBgCanvas.width = outW;
  blurredBgCanvas.height = outH;

  if (config.bokehStyle === 'circular') {
    renderCircularDiscBokeh(rawBgCanvas, blurredBgCanvas, config.blurIntensity);
  } else if (config.bokehStyle === 'cinematic-depth') {
    renderCinematicDepthBlur(rawBgCanvas, blurredBgCanvas, config.blurIntensity);
  } else {
    // 'soft' creamy Gaussian DSLR bokeh
    const bCtx = blurredBgCanvas.getContext('2d');
    if (bCtx) {
      if (config.blurIntensity > 0) {
        const blurPx = (config.blurIntensity / 100) * Math.max(16, Math.min(outW, outH) * 0.036);
        bCtx.filter = `blur(${blurPx.toFixed(1)}px)`;
        bCtx.drawImage(rawBgCanvas, -blurPx * 0.4, -blurPx * 0.4, outW + blurPx * 0.8, outH + blurPx * 0.8);
      } else {
        bCtx.drawImage(rawBgCanvas, 0, 0, outW, outH);
      }
    }
  }

  // Draw blurred/replaced background onto targetCanvas
  ctx.clearRect(0, 0, outW, outH);
  ctx.drawImage(blurredBgCanvas, 0, 0, outW, outH);

  // 5. Prepare sharp foreground subject layer (with independent Portrait Lighting adjustment)
  const fgCanvas = document.createElement('canvas');
  fgCanvas.width = outW;
  fgCanvas.height = outH;
  const fgCtx = fgCanvas.getContext('2d');
  if (!fgCtx) return;

  fgCtx.drawImage(img, 0, 0, outW, outH);

  if (config.portraitLighting !== 0) {
    fgCtx.save();
    if (config.portraitLighting > 0) {
      const alpha = Math.min(0.45, (config.portraitLighting / 60) * 0.42);
      const keyGrad = fgCtx.createRadialGradient(
        outW * 0.48,
        outH * 0.34,
        outW * 0.04,
        outW * 0.5,
        outH * 0.42,
        Math.hypot(outW, outH) * 0.55
      );
      keyGrad.addColorStop(0, `rgba(255, 248, 236, ${alpha})`);
      keyGrad.addColorStop(1, 'rgba(255, 248, 236, 0)');
      fgCtx.globalCompositeOperation = 'screen';
      fgCtx.fillStyle = keyGrad;
      fgCtx.fillRect(0, 0, outW, outH);
    } else {
      const dimAlpha = Math.min(0.45, (Math.abs(config.portraitLighting) / 40) * 0.45);
      fgCtx.fillStyle = `rgba(4, 6, 14, ${dimAlpha})`;
      fgCtx.fillRect(0, 0, outW, outH);
    }
    fgCtx.restore();
  }

  // Apply refined subject + hair alpha mask to foreground cutout
  fgCtx.save();
  fgCtx.globalCompositeOperation = 'destination-in';
  fgCtx.drawImage(maskCanvas, 0, 0, outW, outH);
  fgCtx.restore();

  // Composite sharp foreground subject onto the DSLR background
  ctx.drawImage(fgCanvas, 0, 0, outW, outH);

  // Optional Mask Diagnostics Overlay when user toggles "View Subject Mask"
  if (options?.showMaskOverlay) {
    const tintCanvas = document.createElement('canvas');
    tintCanvas.width = outW;
    tintCanvas.height = outH;
    const tCtx = tintCanvas.getContext('2d');
    if (tCtx) {
      tCtx.fillStyle = 'rgba(139, 92, 246, 0.38)';
      tCtx.fillRect(0, 0, outW, outH);
      tCtx.globalCompositeOperation = 'destination-in';
      tCtx.drawImage(maskCanvas, 0, 0, outW, outH);
      ctx.drawImage(tintCanvas, 0, 0, outW, outH);
    }
  }
}
