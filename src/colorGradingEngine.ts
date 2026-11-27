import {
  ColorGradingState,
  ColorWheelVector,
  CurvePoint,
  CustomColorGradePreset,
} from '../types/colorGrading';
import { resolveEffectiveColorGradingState } from '../data/colorGradingPresets';
import { applySharpenConvolution } from './canvasEngine';
import { releaseCanvasMemory } from './hdQualityEngine';

const CUSTOM_GRADE_STORAGE_KEY = 'dipti_custom_color_grades_v1';

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function hslToRgbUnit(hueDeg: number): [number, number, number] {
  const h = (((hueDeg % 360) + 360) % 360) / 60;
  const x = 1 - Math.abs((h % 2) - 1);
  if (h < 1) return [1, x, 0];
  if (h < 2) return [x, 1, 0];
  if (h < 3) return [0, 1, x];
  if (h < 4) return [0, x, 1];
  if (h < 5) return [x, 0, 1];
  return [1, 0, x];
}

export function wheelVectorToRgbShift(vec: ColorWheelVector, maxShift = 48): [number, number, number] {
  const mag = Math.min(1, Math.hypot(vec.x, vec.y));
  const lumaShift = vec.luma * 1.1;
  if (mag < 0.005) {
    return [lumaShift, lumaShift, lumaShift];
  }
  const angleDeg = (Math.atan2(vec.y, vec.x) * 180) / Math.PI;
  const [ur, ug, ub] = hslToRgbUnit(angleDeg);
  // Center tint so hue shifts chromatically without exploding overall exposure
  const avg = (ur + ug + ub) / 3;
  const scale = mag * maxShift;
  return [
    (ur - avg) * scale + lumaShift,
    (ug - avg) * scale + lumaShift,
    (ub - avg) * scale + lumaShift,
  ];
}

/**
 * Evaluates a sorted list of normalized CurvePoints into a 256-entry 0..255 LUT
 * using Fritsch-Carlson monotone cubic interpolation to avoid overshoot artifacts.
 */
export function evaluateCurveLut(rawPoints: CurvePoint[]): Uint8Array {
  const lut = new Uint8Array(256);
  const pts = [...rawPoints]
    .map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }))
    .sort((a, b) => a.x - b.x);

  if (pts.length === 0) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }

  // Deduplicate close x coordinates
  const clean: CurvePoint[] = [];
  for (const p of pts) {
    if (clean.length === 0 || p.x - clean[clean.length - 1].x > 0.004) {
      clean.push(p);
    } else {
      clean[clean.length - 1] = p;
    }
  }

  if (clean.length === 1) {
    const val = Math.round(clean[0].y * 255);
    lut.fill(val);
    return lut;
  }

  const n = clean.length;
  const dx = new Array<number>(n - 1);
  const dy = new Array<number>(n - 1);
  const slopes = new Array<number>(n - 1);
  for (let i = 0; i < n - 1; i++) {
    dx[i] = Math.max(0.0001, clean[i + 1].x - clean[i].x);
    dy[i] = clean[i + 1].y - clean[i].y;
    slopes[i] = dy[i] / dx[i];
  }

  const tangents = new Array<number>(n);
  tangents[0] = slopes[0];
  tangents[n - 1] = slopes[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (slopes[i - 1] * slopes[i] <= 0) {
      tangents[i] = 0;
    } else {
      tangents[i] = (slopes[i - 1] + slopes[i]) * 0.5;
    }
  }

  // Enforce monotonicity
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(slopes[i]) < 1e-6) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
    } else {
      const a = tangents[i] / slopes[i];
      const b = tangents[i + 1] / slopes[i];
      const h = Math.hypot(a, b);
      if (h > 3) {
        const t = 3 / h;
        tangents[i] = t * a * slopes[i];
        tangents[i + 1] = t * b * slopes[i];
      }
    }
  }

  let seg = 0;
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    if (x <= clean[0].x) {
      lut[i] = Math.round(clamp01(clean[0].y) * 255);
      continue;
    }
    if (x >= clean[n - 1].x) {
      lut[i] = Math.round(clamp01(clean[n - 1].y) * 255);
      continue;
    }
    while (seg < n - 2 && x > clean[seg + 1].x) {
      seg++;
    }
    const h = dx[seg];
    const t = (x - clean[seg].x) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;

    const y =
      h00 * clean[seg].y +
      h10 * h * tangents[seg] +
      h01 * clean[seg + 1].y +
      h11 * h * tangents[seg + 1];

    lut[i] = Math.round(clamp01(y) * 255);
  }

  return lut;
}

export interface CompiledColorGrade {
  effective: ColorGradingState;
  masterLut: Uint8Array;
  redLut: Uint8Array;
  greenLut: Uint8Array;
  blueLut: Uint8Array;
  liftRgb: [number, number, number];
  gammaRgb: [number, number, number];
  gainRgb: [number, number, number];
}

export function compileColorGrade(state: ColorGradingState): CompiledColorGrade {
  const effective = resolveEffectiveColorGradingState(state);
  return {
    effective,
    masterLut: evaluateCurveLut(effective.curves.master),
    redLut: evaluateCurveLut(effective.curves.red),
    greenLut: evaluateCurveLut(effective.curves.green),
    blueLut: evaluateCurveLut(effective.curves.blue),
    liftRgb: wheelVectorToRgbShift(effective.wheels.lift, 56),
    gammaRgb: wheelVectorToRgbShift(effective.wheels.gamma, 52),
    gainRgb: wheelVectorToRgbShift(effective.wheels.gain, 56),
  };
}

export function applyColorGradingToImageData(
  imageData: ImageData,
  state: ColorGradingState,
  options?: { skipSharpen?: boolean }
): void {
  const compiled = compileColorGrade(state);
  const eff = compiled.effective;
  const data = imageData.data;

  const expFactor = Math.pow(2, eff.exposure / 35);
  const brightShift = eff.brightness * 1.4 + eff.hslLightness * 1.45;
  const contrastFactor = Math.pow((100 + eff.contrast) / 100, 1.35);
  const invGamma = 1 / Math.max(0.45, Math.min(2.4, eff.gamma));

  // Combined Saturation (Main Saturation + HSL Saturation)
  const combinedSatDelta = Math.max(-100, Math.min(150, eff.saturation + eff.hslSaturation));
  const satFactor = Math.max(0, 1 + combinedSatDelta / 100);

  const tempShift = eff.temperature * 0.8;
  const tintShift = eff.tint * 0.65;
  const rChan = eff.redAdjust * 1.5;
  const gChan = eff.greenAdjust * 1.5;
  const bChan = eff.blueAdjust * 1.5;

  const hiShift = eff.highlights * 0.65;
  const shShift = eff.shadows * 0.65;
  const whiteShift = eff.whites * 0.72;
  const blackShift = eff.blacks * 0.72;
  const grainAmp = eff.grain * 0.85;

  const hasHue = Math.abs(eff.hueShift) > 0.5;
  const cosA = hasHue ? Math.cos((eff.hueShift * Math.PI) / 180) : 1;
  const sinA = hasHue ? Math.sin((eff.hueShift * Math.PI) / 180) : 0;
  const m00 = cosA + (1 - cosA) / 3;
  const m01 = (1 - cosA) / 3 - Math.sqrt(1 / 3) * sinA;
  const m02 = (1 - cosA) / 3 + Math.sqrt(1 / 3) * sinA;
  const m10 = (1 - cosA) / 3 + Math.sqrt(1 / 3) * sinA;
  const m11 = cosA + (1 - cosA) / 3;
  const m12 = (1 - cosA) / 3 - Math.sqrt(1 / 3) * sinA;
  const m20 = (1 - cosA) / 3 - Math.sqrt(1 / 3) * sinA;
  const m21 = (1 - cosA) / 3 + Math.sqrt(1 / 3) * sinA;
  const m22 = cosA + (1 - cosA) / 3;

  const { masterLut, redLut, greenLut, blueLut, liftRgb, gammaRgb, gainRgb } = compiled;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;

    // 1. Exposure + Brightness + RGB Channel Balance + Temp/Tint
    let r = data[i] * expFactor + brightShift + rChan + tempShift + tintShift * 0.3;
    let g = data[i + 1] * expFactor + brightShift + gChan - tintShift * 0.6;
    let b = data[i + 2] * expFactor + brightShift + bChan - tempShift + tintShift * 0.3;

    // 2. Hue Rotation (HSL Hue)
    if (hasHue) {
      const nr = r * m00 + g * m01 + b * m02;
      const ng = r * m10 + g * m11 + b * m12;
      const nb = r * m20 + g * m21 + b * m22;
      r = nr;
      g = ng;
      b = nb;
    }

    // 3. Luminance-aware Shadows / Highlights / Whites / Blacks & 3-Way Color Wheels
    const lum = clamp01((0.299 * r + 0.587 * g + 0.114 * b) / 255);
    const shadowW = Math.pow(1 - lum, 1.7);
    const midW = Math.sin(lum * Math.PI);
    const hiW = Math.pow(lum, 1.7);

    if (shShift !== 0) {
      const s = shShift * shadowW;
      r += s;
      g += s;
      b += s;
    }
    if (hiShift !== 0) {
      const h = hiShift * hiW;
      r += h;
      g += h;
      b += h;
    }
    if (blackShift !== 0 && lum < 0.45) {
      const bw = Math.pow(1 - lum / 0.45, 2.0) * blackShift;
      r += bw;
      g += bw;
      b += bw;
    }
    if (whiteShift !== 0 && lum > 0.55) {
      const ww = Math.pow((lum - 0.55) / 0.45, 2.0) * whiteShift;
      r += ww;
      g += ww;
      b += ww;
    }

    // 3-Way Color Wheels (Lift -> Shadows, Gamma -> Mids, Gain -> Highlights)
    r += liftRgb[0] * shadowW + gammaRgb[0] * midW + gainRgb[0] * hiW;
    g += liftRgb[1] * shadowW + gammaRgb[1] * midW + gainRgb[1] * hiW;
    b += liftRgb[2] * shadowW + gammaRgb[2] * midW + gainRgb[2] * hiW;

    // 4. Midtone Gamma Power Curve
    if (Math.abs(invGamma - 1) > 0.005) {
      r = Math.pow(clamp01(r / 255), invGamma) * 255;
      g = Math.pow(clamp01(g / 255), invGamma) * 255;
      b = Math.pow(clamp01(b / 255), invGamma) * 255;
    }

    // 5. Contrast
    if (eff.contrast !== 0) {
      r = (r - 128) * contrastFactor + 128;
      g = (g - 128) * contrastFactor + 128;
      b = (b - 128) * contrastFactor + 128;
    }

    // 6. RGB + Master Tone Curves
    r = masterLut[redLut[Math.round(clamp255(r))]];
    g = masterLut[greenLut[Math.round(clamp255(g))]];
    b = masterLut[blueLut[Math.round(clamp255(b))]];

    // 7. Saturation
    if (satFactor !== 1) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + (r - gray) * satFactor;
      g = gray + (g - gray) * satFactor;
      b = gray + (b - gray) * satFactor;
    }

    // 8. Deterministic Film Grain
    if (grainAmp > 0) {
      const h = ((i * 2654435761) >>> 0) % 1000;
      const noise = (h / 1000 - 0.5) * grainAmp;
      r += noise;
      g += noise;
      b += noise;
    }

    data[i] = clamp255(r);
    data[i + 1] = clamp255(g);
    data[i + 2] = clamp255(b);
  }

  if (!options?.skipSharpen && eff.sharpness > 0) {
    applySharpenConvolution(imageData, eff.sharpness);
  }
}

function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number, vignetteAmount: number) {
  if (vignetteAmount <= 0) return;
  const cx = w / 2;
  const cy = h / 2;
  const outer = Math.hypot(cx, cy);
  const grad = ctx.createRadialGradient(cx, cy, outer * 0.34, cx, cy, outer);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgba(4,5,10,${Math.min(0.88, (vignetteAmount / 100) * 0.85)})`);
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

export function renderColorGradedPhoto(
  img: HTMLImageElement,
  canvas: HTMLCanvasElement,
  state: ColorGradingState,
  maxPreviewDim?: number
): void {
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (srcW <= 0 || srcH <= 0) return;

  let outW = srcW;
  let outH = srcH;
  if (maxPreviewDim && Math.max(srcW, srcH) > maxPreviewDim) {
    const scale = maxPreviewDim / Math.max(srcW, srcH);
    outW = Math.max(1, Math.round(srcW * scale));
    outH = Math.max(1, Math.round(srcH * scale));
  }

  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, outW, outH);
  ctx.drawImage(img, 0, 0, outW, outH);

  const imageData = ctx.getImageData(0, 0, outW, outH);
  applyColorGradingToImageData(imageData, state);
  ctx.putImageData(imageData, 0, 0);

  const eff = resolveEffectiveColorGradingState(state);
  drawVignette(ctx, outW, outH, eff.vignette);
}

export interface RgbHistogramBins {
  red: number[]; // 64 normalized 0..1 bins
  green: number[];
  blue: number[];
  luma: number[];
}

export function computeHistogramBins(canvas: HTMLCanvasElement, bins = 48): RgbHistogramBins {
  const empty = () => new Array<number>(bins).fill(0);
  const rBins = empty();
  const gBins = empty();
  const bBins = empty();
  const lBins = empty();

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || canvas.width === 0 || canvas.height === 0) {
    return { red: rBins, green: gBins, blue: bBins, luma: lBins };
  }

  // Sample grid for instant calculation even on large canvases
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const totalPixels = canvas.width * canvas.height;
  const step = Math.max(1, Math.floor(totalPixels / 14000));

  for (let p = 0; p < totalPixels; p += step) {
    const i = p * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const l = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

    rBins[Math.min(bins - 1, Math.floor((r / 256) * bins))]++;
    gBins[Math.min(bins - 1, Math.floor((g / 256) * bins))]++;
    bBins[Math.min(bins - 1, Math.floor((b / 256) * bins))]++;
    lBins[Math.min(bins - 1, Math.floor((l / 256) * bins))]++;
  }

  const maxPeak = Math.max(1, ...rBins, ...gBins, ...bBins, ...lBins);
  const norm = (arr: number[]) => arr.map((v) => Math.min(1, v / maxPeak));
  return {
    red: norm(rBins),
    green: norm(gBins),
    blue: norm(bBins),
    luma: norm(lBins),
  };
}

/**
 * Renders a graded video frame onto targetCanvas at exact dimensions (dims.w × dims.h).
 * During live interactive playback, pixel work runs on a fast bounded working canvas (<= 720px long edge)
 * then blits crisp upscaled to preview, OR at full native resolution during final export.
 */
export function renderColorGradedVideoFrame(
  source: HTMLVideoElement | HTMLImageElement,
  targetCanvas: HTMLCanvasElement,
  state: ColorGradingState,
  dims: { w: number; h: number },
  options?: {
    previewSpeedMode?: boolean;
    compareSplitPct?: number | null; // null = full graded, 0..100 = split original left / graded right
    scratchCanvas?: HTMLCanvasElement | null;
  }
): void {
  if (targetCanvas.width !== dims.w || targetCanvas.height !== dims.h) {
    targetCanvas.width = dims.w;
    targetCanvas.height = dims.h;
  }
  const ctx = targetCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const srcW = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const srcH = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
  if (!srcW || !srcH) return;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const drawCover = (c: CanvasRenderingContext2D, w: number, h: number) => {
    const scale = Math.max(w / srcW, h / srcH);
    const dw = srcW * scale;
    const dh = srcH * scale;
    c.drawImage(source, (w - dw) / 2, (h - dh) / 2, dw, dh);
  };

  let workW = dims.w;
  let workH = dims.h;
  if (options?.previewSpeedMode && Math.max(dims.w, dims.h) > 640) {
    const s = 640 / Math.max(dims.w, dims.h);
    workW = Math.max(2, Math.round(dims.w * s));
    workH = Math.max(2, Math.round(dims.h * s));
  }

  let ownScratch = false;
  let workCanvas = options?.scratchCanvas ?? null;
  if (!workCanvas) {
    workCanvas = document.createElement('canvas');
    ownScratch = true;
  }
  if (workCanvas.width !== workW || workCanvas.height !== workH) {
    workCanvas.width = workW;
    workCanvas.height = workH;
  }
  const wCtx = workCanvas.getContext('2d', { willReadFrequently: true });
  if (!wCtx) {
    if (ownScratch) releaseCanvasMemory(workCanvas);
    return;
  }

  wCtx.imageSmoothingEnabled = true;
  wCtx.imageSmoothingQuality = 'high';
  wCtx.clearRect(0, 0, workW, workH);
  drawCover(wCtx, workW, workH);

  const imgData = wCtx.getImageData(0, 0, workW, workH);
  applyColorGradingToImageData(imgData, state, { skipSharpen: options?.previewSpeedMode });
  wCtx.putImageData(imgData, 0, 0);

  const eff = resolveEffectiveColorGradingState(state);
  drawVignette(wCtx, workW, workH, eff.vignette);

  ctx.clearRect(0, 0, dims.w, dims.h);
  ctx.drawImage(workCanvas, 0, 0, dims.w, dims.h);

  // Live Before/After Split Curtain across the video frame
  if (typeof options?.compareSplitPct === 'number') {
    const splitX = Math.round((Math.max(0, Math.min(100, options.compareSplitPct)) / 100) * dims.w);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, splitX, dims.h);
    ctx.clip();
    drawCover(ctx, dims.w, dims.h);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = '#FBBF24';
    ctx.lineWidth = Math.max(2, Math.round(dims.w * 0.0025));
    ctx.beginPath();
    ctx.moveTo(splitX, 0);
    ctx.lineTo(splitX, dims.h);
    ctx.stroke();
    ctx.restore();
  }

  if (ownScratch) {
    releaseCanvasMemory(workCanvas);
  }
}

export function loadCustomColorPresets(): CustomColorGradePreset[] {
  try {
    const raw = localStorage.getItem(CUSTOM_GRADE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomColorPreset(
  name: string,
  state: ColorGradingState,
  accentColor = '#D4AF37'
): CustomColorGradePreset[] {
  const cleanName = name.trim() || `Custom Grade ${new Date().toLocaleTimeString()}`;
  const entry: CustomColorGradePreset = {
    id: `custom-grade-${Date.now()}`,
    name: cleanName,
    accentColor,
    state: JSON.parse(JSON.stringify(state)) as ColorGradingState,
    createdAt: new Date().toISOString(),
  };
  const existing = loadCustomColorPresets();
  const next = [entry, ...existing].slice(0, 24);
  try {
    localStorage.setItem(CUSTOM_GRADE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota
  }
  return next;
}

export function deleteCustomColorPreset(id: string): CustomColorGradePreset[] {
  const next = loadCustomColorPresets().filter((p) => p.id !== id);
  try {
    localStorage.setItem(CUSTOM_GRADE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}
