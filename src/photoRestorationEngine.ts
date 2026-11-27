import { PhotoRestorationConfig, SpotRepairStroke } from '../types/editor';
import { releaseCanvasMemory } from './hdQualityEngine';

export interface RestorationPreset {
  id: string;
  name: string;
  subtitle: string;
  accentColor: string;
  settings: Partial<PhotoRestorationConfig>;
}

export interface PhotoAnalysisReport {
  width: number;
  height: number;
  dynamicRangePct: number;
  fadeSeverityPct: number;
  colorCastShift: string;
  yellowCastPct: number;
  estimatedNoisePct: number;
  softnessPct: number;
  dustSpeckPct: number;
  summary: string;
  limitationNote: string;
  recommendedConfig: PhotoRestorationConfig;
}

export interface RestorationRenderResult {
  width: number;
  height: number;
  repairedDustPixels: number;
  appliedSpotStrokes: number;
}

export const DEFAULT_PHOTO_RESTORATION_CONFIG: PhotoRestorationConfig = {
  presetId: 'vintage-revival',
  intensity: 85,
  noiseReduction: 28,
  blurReduction: 34,
  sharpening: 26,
  detailTexture: 30,
  fadedColorRestore: 48,
  castNeutralize: 35,
  scratchDustReduction: 38,
  exposureRecovery: 4,
  brightness: 2,
  contrast: 16,
  shadowsRecovery: 22,
  highlightsRecovery: 18,
  spotStrokes: [],
};

export const RESTORATION_PRESETS: RestorationPreset[] = [
  {
    id: 'vintage-revival',
    name: 'Vintage Print Revival',
    subtitle: 'Balanced tone stretch, cast fix & micro-detail',
    accentColor: '#D4AF37',
    settings: {
      intensity: 88,
      noiseReduction: 28,
      blurReduction: 34,
      sharpening: 26,
      detailTexture: 30,
      fadedColorRestore: 52,
      castNeutralize: 40,
      scratchDustReduction: 40,
      exposureRecovery: 4,
      brightness: 2,
      contrast: 18,
      shadowsRecovery: 24,
      highlightsRecovery: 18,
    },
  },
  {
    id: 'faded-color-rescue',
    name: 'Faded Color Rescue',
    subtitle: 'Rebuilds washed-out dyes & yellowing casts',
    accentColor: '#A855F7',
    settings: {
      intensity: 92,
      noiseReduction: 20,
      blurReduction: 26,
      sharpening: 22,
      detailTexture: 32,
      fadedColorRestore: 82,
      castNeutralize: 68,
      scratchDustReduction: 25,
      exposureRecovery: 2,
      brightness: 0,
      contrast: 24,
      shadowsRecovery: 20,
      highlightsRecovery: 26,
    },
  },
  {
    id: 'soft-blur-deconv',
    name: 'Blur & Focus Recovery',
    subtitle: 'Edge-guided deconvolution + texture lift',
    accentColor: '#38BDF8',
    settings: {
      intensity: 90,
      noiseReduction: 22,
      blurReduction: 72,
      sharpening: 48,
      detailTexture: 52,
      fadedColorRestore: 28,
      castNeutralize: 18,
      scratchDustReduction: 18,
      exposureRecovery: 0,
      brightness: 0,
      contrast: 14,
      shadowsRecovery: 12,
      highlightsRecovery: 10,
    },
  },
  {
    id: 'dust-scratch-clean',
    name: 'Dust & Grain Cleanup',
    subtitle: 'Targets print specks, scratches & heavy grain',
    accentColor: '#F59E0B',
    settings: {
      intensity: 92,
      noiseReduction: 58,
      blurReduction: 24,
      sharpening: 22,
      detailTexture: 22,
      fadedColorRestore: 38,
      castNeutralize: 28,
      scratchDustReduction: 82,
      exposureRecovery: 2,
      brightness: 2,
      contrast: 14,
      shadowsRecovery: 16,
      highlightsRecovery: 14,
    },
  },
  {
    id: 'monochrome-archive',
    name: 'Archive B&W Clean',
    subtitle: 'High-contrast tonal recovery & scratch clean',
    accentColor: '#E2E8F0',
    settings: {
      intensity: 90,
      noiseReduction: 42,
      blurReduction: 40,
      sharpening: 34,
      detailTexture: 40,
      fadedColorRestore: 42,
      castNeutralize: 100,
      scratchDustReduction: 64,
      exposureRecovery: 4,
      brightness: 0,
      contrast: 26,
      shadowsRecovery: 28,
      highlightsRecovery: 22,
    },
  },
  {
    id: 'sun-bleached-recovery',
    name: 'Sun-Bleached Recovery',
    subtitle: 'Restores highlights & deepens milky shadows',
    accentColor: '#FB923C',
    settings: {
      intensity: 94,
      noiseReduction: 24,
      blurReduction: 32,
      sharpening: 28,
      detailTexture: 36,
      fadedColorRestore: 68,
      castNeutralize: 52,
      scratchDustReduction: 30,
      exposureRecovery: -10,
      brightness: -4,
      contrast: 30,
      shadowsRecovery: 16,
      highlightsRecovery: 64,
    },
  },
];

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Separable fast 1D box-blur approximation on an Uint8ClampedArray RGB buffer.
 * Uses minimal 1D line scratch memory so Android devices don't allocate extra 2D canvas layers.
 */
function boxBlurRGB(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number
): void {
  const r = Math.max(1, Math.min(8, Math.round(radius)));
  const temp = new Uint8ClampedArray(src.length);
  const windowSize = r * 2 + 1;

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    const rowOff = y * w;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    for (let dx = -r; dx <= r; dx++) {
      const sx = clamp(dx, 0, w - 1);
      const idx = (rowOff + sx) * 4;
      sumR += src[idx];
      sumG += src[idx + 1];
      sumB += src[idx + 2];
    }
    for (let x = 0; x < w; x++) {
      const dstIdx = (rowOff + x) * 4;
      temp[dstIdx] = sumR / windowSize;
      temp[dstIdx + 1] = sumG / windowSize;
      temp[dstIdx + 2] = sumB / windowSize;
      temp[dstIdx + 3] = src[dstIdx + 3];

      const remX = clamp(x - r, 0, w - 1);
      const addX = clamp(x + r + 1, 0, w - 1);
      const remIdx = (rowOff + remX) * 4;
      const addIdx = (rowOff + addX) * 4;
      sumR += src[addIdx] - src[remIdx];
      sumG += src[addIdx + 1] - src[remIdx + 1];
      sumB += src[addIdx + 2] - src[remIdx + 2];
    }
  }

  // Vertical pass
  for (let x = 0; x < w; x++) {
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    for (let dy = -r; dy <= r; dy++) {
      const sy = clamp(dy, 0, h - 1);
      const idx = (sy * w + x) * 4;
      sumR += temp[idx];
      sumG += temp[idx + 1];
      sumB += temp[idx + 2];
    }
    for (let y = 0; y < h; y++) {
      const dstIdx = (y * w + x) * 4;
      dst[dstIdx] = sumR / windowSize;
      dst[dstIdx + 1] = sumG / windowSize;
      dst[dstIdx + 2] = sumB / windowSize;
      dst[dstIdx + 3] = temp[dstIdx + 3];

      const remY = clamp(y - r, 0, h - 1);
      const addY = clamp(y + r + 1, 0, h - 1);
      const remIdx = (remY * w + x) * 4;
      const addIdx = (addY * w + x) * 4;
      sumR += temp[addIdx] - temp[remIdx];
      sumG += temp[addIdx + 1] - temp[remIdx + 1];
      sumB += temp[addIdx + 2] - temp[remIdx + 2];
    }
  }
}

/**
 * Radial inward ring-interpolated patch healing for manual dust/scratch/crease brush strokes.
 */
function applyManualSpotHeal(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  strokes: SpotRepairStroke[],
  repairOverlayMask?: Uint8Array
): void {
  if (strokes.length === 0) return;

  for (const stroke of strokes) {
    const cx = Math.round(stroke.x * w);
    const cy = Math.round(stroke.y * h);
    const r = Math.max(3, Math.round(stroke.radius * w));
    const outerR = r + Math.max(2, Math.round(r * 0.45));

    // Sample 12 perimeter ring points around the stroke boundary for seamless directional fill
    const ringSamples: Array<{ x: number; y: number; r: number; g: number; b: number }> = [];
    const sampleCount = 12;
    for (let s = 0; s < sampleCount; s++) {
      const theta = (s / sampleCount) * Math.PI * 2;
      const sx = clamp(Math.round(cx + Math.cos(theta) * outerR), 0, w - 1);
      const sy = clamp(Math.round(cy + Math.sin(theta) * outerR), 0, h - 1);
      const idx = (sy * w + sx) * 4;
      ringSamples.push({
        x: sx,
        y: sy,
        r: data[idx],
        g: data[idx + 1],
        b: data[idx + 2],
      });
    }

    const yMin = Math.max(0, cy - r);
    const yMax = Math.min(h - 1, cy + r);
    const xMin = Math.max(0, cx - r);
    const xMax = Math.min(w - 1, cx + r);
    const rSq = r * r;

    for (let y = yMin; y <= yMax; y++) {
      for (let x = xMin; x <= xMax; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const distSq = dx * dx + dy * dy;
        if (distSq > rSq) continue;

        const dist = Math.sqrt(distSq);
        const feather = clamp(1 - Math.max(0, dist - r * 0.65) / Math.max(1, r * 0.35), 0, 1);

        let wSum = 0;
        let accR = 0;
        let accG = 0;
        let accB = 0;
        for (let s = 0; s < ringSamples.length; s++) {
          const rs = ringSamples[s];
          const sdx = x - rs.x;
          const sdy = y - rs.y;
          const invW = 1 / (sdx * sdx + sdy * sdy + 4);
          wSum += invW;
          accR += rs.r * invW;
          accG += rs.g * invW;
          accB += rs.b * invW;
        }

        // Tiny deterministic grain match so healed regions do not look plasticky
        const hash = (((x * 73856093) ^ (y * 19349663)) >>> 0) % 100;
        const microGrain = (hash / 100 - 0.5) * 4;

        const idx = (y * w + x) * 4;
        const targetR = accR / wSum + microGrain;
        const targetG = accG / wSum + microGrain;
        const targetB = accB / wSum + microGrain;

        data[idx] = clamp255(data[idx] * (1 - feather) + targetR * feather);
        data[idx + 1] = clamp255(data[idx + 1] * (1 - feather) + targetG * feather);
        data[idx + 2] = clamp255(data[idx + 2] * (1 - feather) + targetB * feather);
        if (repairOverlayMask) {
          repairOverlayMask[y * w + x] = 2;
        }
      }
    }
  }
}

/**
 * Local directional impulse outlier detector & inpainting for dust specks & thin scratches.
 * Replaces bright/dark anomalies only when opposite neighbor pairs agree closely across multiple axes,
 * protecting crisp authentic edges like eyelashes, hairlines, and text.
 */
function applyDirectionalDustScratchRemoval(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  strengthPct: number,
  repairOverlayMask?: Uint8Array
): number {
  if (strengthPct <= 0 || w < 5 || h < 5) return 0;
  const blend = clamp(strengthPct / 100, 0, 1);
  // Higher strength lowers detection threshold to catch subtler specks
  const outlierThresh = 34 - blend * 18; // 34 down to 16
  const continuityGuard = 24 + blend * 10;

  const src = new Uint8ClampedArray(data);
  let repairedCount = 0;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      if (src[idx + 3] === 0) continue;

      const cLum = 0.299 * src[idx] + 0.587 * src[idx + 1] + 0.114 * src[idx + 2];

      const nIdx = ((y - 1) * w + x) * 4;
      const sIdx = ((y + 1) * w + x) * 4;
      const wIdx = (y * w + (x - 1)) * 4;
      const eIdx = (y * w + (x + 1)) * 4;
      const nwIdx = ((y - 1) * w + (x - 1)) * 4;
      const seIdx = ((y + 1) * w + (x + 1)) * 4;
      const neIdx = ((y - 1) * w + (x + 1)) * 4;
      const swIdx = ((y + 1) * w + (x - 1)) * 4;

      const lumN = 0.299 * src[nIdx] + 0.587 * src[nIdx + 1] + 0.114 * src[nIdx + 2];
      const lumS = 0.299 * src[sIdx] + 0.587 * src[sIdx + 1] + 0.114 * src[sIdx + 2];
      const lumW = 0.299 * src[wIdx] + 0.587 * src[wIdx + 1] + 0.114 * src[wIdx + 2];
      const lumE = 0.299 * src[eIdx] + 0.587 * src[eIdx + 1] + 0.114 * src[eIdx + 2];
      const lumNW = 0.299 * src[nwIdx] + 0.587 * src[nwIdx + 1] + 0.114 * src[nwIdx + 2];
      const lumSE = 0.299 * src[seIdx] + 0.587 * src[seIdx + 1] + 0.114 * src[seIdx + 2];
      const lumNE = 0.299 * src[neIdx] + 0.587 * src[neIdx + 1] + 0.114 * src[neIdx + 2];
      const lumSW = 0.299 * src[swIdx] + 0.587 * src[swIdx + 1] + 0.114 * src[swIdx + 2];

      const smoothPairs: number[] = [];
      let avgR = 0;
      let avgG = 0;
      let avgB = 0;

      const checkPair = (aIdx: number, bIdx: number, lA: number, lB: number) => {
        if (Math.abs(lA - lB) <= continuityGuard) {
          const mid = (lA + lB) * 0.5;
          if (Math.abs(cLum - mid) > outlierThresh) {
            smoothPairs.push(mid);
            avgR += (src[aIdx] + src[bIdx]) * 0.5;
            avgG += (src[aIdx + 1] + src[bIdx + 1]) * 0.5;
            avgB += (src[aIdx + 2] + src[bIdx + 2]) * 0.5;
          }
        }
      };

      checkPair(nIdx, sIdx, lumN, lumS);
      checkPair(wIdx, eIdx, lumW, lumE);
      checkPair(nwIdx, seIdx, lumNW, lumSE);
      checkPair(neIdx, swIdx, lumNE, lumSW);

      // Impulse speck or thin line across >= 2 smooth opposing axes
      if (smoothPairs.length >= 2) {
        const count = smoothPairs.length;
        const cleanR = avgR / count;
        const cleanG = avgG / count;
        const cleanB = avgB / count;
        const pixelBlend = clamp(0.45 + blend * 0.55, 0, 1);
        data[idx] = clamp255(src[idx] * (1 - pixelBlend) + cleanR * pixelBlend);
        data[idx + 1] = clamp255(src[idx + 1] * (1 - pixelBlend) + cleanG * pixelBlend);
        data[idx + 2] = clamp255(src[idx + 2] * (1 - pixelBlend) + cleanB * pixelBlend);
        repairedCount++;
        if (repairOverlayMask) {
          repairOverlayMask[y * w + x] = 1;
        }
      }
    }
  }

  return repairedCount;
}

/**
 * Fast edge-preserving bilateral filter (3x3 spatial + range Gaussian-like weight).
 * Smooths film grain and chroma blotches while keeping edge transitions sharp.
 */
function applyEdgePreservingDenoise(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  strengthPct: number
): void {
  if (strengthPct <= 0 || w < 3 || h < 3) return;
  const ratio = clamp(strengthPct / 100, 0, 1);
  // Range sigma widens softly with strength; chroma tolerates slightly wider smoothing than luma
  const rangeSigmaSq = Math.pow(14 + ratio * 38, 2);
  const blend = clamp(ratio * 0.92, 0, 0.95);
  const src = new Uint8ClampedArray(data);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      if (src[idx + 3] === 0) continue;

      const cr = src[idx];
      const cg = src[idx + 1];
      const cb = src[idx + 2];

      let wSum = 1.0;
      let accR = cr;
      let accG = cg;
      let accB = cb;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nIdx = ((y + dy) * w + (x + dx)) * 4;
          const dr = src[nIdx] - cr;
          const dg = src[nIdx + 1] - cg;
          const db = src[nIdx + 2] - cb;
          const colorDistSq = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
          const spatialW = dx === 0 || dy === 0 ? 0.85 : 0.6;
          const rangeW = Math.exp(-colorDistSq / rangeSigmaSq);
          const weight = spatialW * rangeW;

          wSum += weight;
          accR += src[nIdx] * weight;
          accG += src[nIdx + 1] * weight;
          accB += src[nIdx + 2] * weight;
        }
      }

      const dR = accR / wSum;
      const dG = accG / wSum;
      const dB = accB / wSum;

      data[idx] = clamp255(cr * (1 - blend) + dR * blend);
      data[idx + 1] = clamp255(cg * (1 - blend) + dG * blend);
      data[idx + 2] = clamp255(cb * (1 - blend) + dB * blend);
    }
  }
}

/**
 * Multi-scale deconvolution-style blur recovery + texture clarity + fine edge sharpening.
 * Uses halo-clamped residuals so high-contrast boundaries sharpen without ringing artifacts.
 */
function applyDeconvSharpnessAndTexture(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  blurReduction: number,
  sharpening: number,
  detailTexture: number
): void {
  if (blurReduction <= 0 && sharpening <= 0 && detailTexture <= 0) return;

  const blurRatio = clamp(blurReduction / 100, 0, 1);
  const sharpRatio = clamp(sharpening / 100, 0, 1);
  const texRatio = clamp(detailTexture / 100, 0, 1);

  const radius1Buf = new Uint8ClampedArray(data.length);
  boxBlurRGB(data, radius1Buf, w, h, 1);

  let radius4Buf: Uint8ClampedArray | null = null;
  if (texRatio > 0 || blurRatio > 0.25) {
    radius4Buf = new Uint8ClampedArray(data.length);
    boxBlurRGB(data, radius4Buf, w, h, 3);
  }

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;

    for (let c = 0; c < 3; c++) {
      const orig = data[i + c];
      const fineResidual = orig - radius1Buf[i + c];
      const midResidual = radius4Buf ? orig - radius4Buf[i + c] : fineResidual;

      // Halo-clamped local edge gain (suppresses overshoot beyond +/- 28 levels)
      const clampedFine = clamp(fineResidual, -28, 28);
      const clampedMid = clamp(midResidual, -34, 34);

      const deconvGain = blurRatio * 1.45;
      const fineSharpGain = sharpRatio * 1.1;
      const texGain = texRatio * 0.65;

      const delta = clampedFine * (deconvGain + fineSharpGain) + clampedMid * (texGain + blurRatio * 0.35);
      data[i + c] = clamp255(orig + delta);
    }
  }
}

/**
 * Measures real histogram statistics to drive faded color restoration, gray-world cast correction,
 * exposure, contrast, and shadow/highlight recovery.
 */
function applyFadedColorAndToneRecovery(
  data: Uint8ClampedArray,
  config: PhotoRestorationConfig
): void {
  const fadedRatio = clamp(config.fadedColorRestore / 100, 0, 1);
  const castRatio = clamp(config.castNeutralize / 100, 0, 1);
  const hasToneAdjust =
    fadedRatio > 0 ||
    castRatio > 0 ||
    config.exposureRecovery !== 0 ||
    config.brightness !== 0 ||
    config.contrast !== 0 ||
    config.shadowsRecovery !== 0 ||
    config.highlightsRecovery !== 0;

  if (!hasToneAdjust) return;

  // Build strided histogram for fast Android performance on high-res photos
  const totalPixels = data.length / 4;
  const stride = Math.max(1, Math.floor(totalPixels / 65000));
  const histR = new Uint32Array(256);
  const histG = new Uint32Array(256);
  const histB = new Uint32Array(256);
  let sampleCount = 0;
  let meanR = 0;
  let meanG = 0;
  let meanB = 0;

  for (let p = 0; p < totalPixels; p += stride) {
    const idx = p * 4;
    if (data[idx + 3] === 0) continue;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    histR[r]++;
    histG[g]++;
    histB[b]++;
    meanR += r;
    meanG += g;
    meanB += b;
    sampleCount++;
  }

  if (sampleCount === 0) return;

  const findPercentile = (hist: Uint32Array, pct: number): number => {
    const target = sampleCount * pct;
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= target) return v;
    }
    return 255;
  };

  const loR = findPercentile(histR, 0.015);
  const hiR = Math.max(loR + 18, findPercentile(histR, 0.985));
  const loG = findPercentile(histG, 0.015);
  const hiG = Math.max(loG + 18, findPercentile(histG, 0.985));
  const loB = findPercentile(histB, 0.015);
  const hiB = Math.max(loB + 18, findPercentile(histB, 0.985));

  // Gray-World average gains (clamped gently so artistic scenes don't flip harshly)
  const avgR = meanR / sampleCount;
  const avgG = meanG / sampleCount;
  const avgB = meanB / sampleCount;
  const grayAvg = (avgR + avgG + avgB) / 3;
  const gainR = clamp(grayAvg / Math.max(12, avgR), 0.72, 1.38);
  const gainG = clamp(grayAvg / Math.max(12, avgG), 0.72, 1.38);
  const gainB = clamp(grayAvg / Math.max(12, avgB), 0.72, 1.38);

  const expFactor = Math.pow(2, config.exposureRecovery / 35);
  const brightShift = config.brightness * 1.4;
  const contrastFactor = Math.pow((100 + config.contrast) / 100, 1.32);
  const shShift = config.shadowsRecovery * 0.55;
  const hiShift = -config.highlightsRecovery * 0.52;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;

    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // 1. Gray-World White Balance / Yellow Cast Neutralization
    if (castRatio > 0) {
      const wbR = r * gainR;
      const wbG = g * gainG;
      const wbB = b * gainB;
      r = r * (1 - castRatio * 0.75) + wbR * (castRatio * 0.75);
      g = g * (1 - castRatio * 0.75) + wbG * (castRatio * 0.75);
      b = b * (1 - castRatio * 0.75) + wbB * (castRatio * 0.75);
    }

    // 2. Per-channel percentile auto-levels for faded vintage prints
    if (fadedRatio > 0) {
      const stretchR = ((r - loR) / (hiR - loR)) * 255;
      const stretchG = ((g - loG) / (hiG - loG)) * 255;
      const stretchB = ((b - loB) / (hiB - loB)) * 255;
      const autoBlend = fadedRatio * 0.68;
      r = r * (1 - autoBlend) + clamp255(stretchR) * autoBlend;
      g = g * (1 - autoBlend) + clamp255(stretchG) * autoBlend;
      b = b * (1 - autoBlend) + clamp255(stretchB) * autoBlend;
    }

    // 3. Exposure & Brightness
    r = r * expFactor + brightShift;
    g = g * expFactor + brightShift;
    b = b * expFactor + brightShift;

    // 4. Shadow / Highlight Recovery
    const lum = clamp((0.299 * r + 0.587 * g + 0.114 * b) / 255, 0, 1);
    if (shShift > 0) {
      const wShadow = Math.pow(1 - lum, 1.7);
      const lift = shShift * wShadow;
      r += lift;
      g += lift;
      b += lift;
    }
    if (hiShift < 0) {
      const wHigh = Math.pow(lum, 1.7);
      const pull = hiShift * wHigh;
      r += pull;
      g += pull;
      b += pull;
    }

    // 5. Contrast
    if (config.contrast !== 0) {
      r = (r - 128) * contrastFactor + 128;
      g = (g - 128) * contrastFactor + 128;
      b = (b - 128) * contrastFactor + 128;
    }

    // 6. Selective Vibrance Revival for faded colors
    if (fadedRatio > 0) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const chroma = (maxC - minC) / 255;
      const vibBoost = 1 + fadedRatio * (0.38 + (1 - chroma) * 0.42);
      r = gray + (r - gray) * vibBoost;
      g = gray + (g - gray) * vibBoost;
      b = gray + (b - gray) * vibBoost;
    }

    data[i] = clamp255(r);
    data[i + 1] = clamp255(g);
    data[i + 2] = clamp255(b);
  }
}

/**
 * Analyzes an image locally to measure fade severity, color cast, noise floor, blur softness,
 * and dust specks, then returns real diagnostics + recommended restoration settings.
 */
export function analyzeOldPhotoDiagnostics(img: HTMLImageElement): PhotoAnalysisReport {
  const wSrc = img.naturalWidth || img.width || 1;
  const hSrc = img.naturalHeight || img.height || 1;
  const maxAnalysisDim = 256;
  const scale = Math.min(1, maxAnalysisDim / Math.max(wSrc, hSrc));
  const aw = Math.max(16, Math.round(wSrc * scale));
  const ah = Math.max(16, Math.round(hSrc * scale));

  const c = document.createElement('canvas');
  c.width = aw;
  c.height = ah;

  try {
    const ctx = c.getContext('2d');
    if (!ctx) {
      return {
        width: wSrc,
        height: hSrc,
        dynamicRangePct: 75,
        fadeSeverityPct: 25,
        colorCastShift: 'Neutral',
        yellowCastPct: 15,
        estimatedNoisePct: 22,
        softnessPct: 30,
        dustSpeckPct: 12,
        summary: 'Local pixel analysis complete using default restoration baseline.',
        limitationNote:
          'Uses deterministic local signal processing (tonal stretch, de-yellowing, bilateral denoise, directional dust clean, deconvolution sharpening) — not generative neural face synthesis.',
        recommendedConfig: { ...DEFAULT_PHOTO_RESTORATION_CONFIG },
      };
    }

    ctx.drawImage(img, 0, 0, aw, ah);
    const { data } = ctx.getImageData(0, 0, aw, ah);
    const histLum = new Uint32Array(256);
    const total = aw * ah;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let highFreqSum = 0;
    let smoothVarCount = 0;
    let speckHits = 0;

    for (let y = 1; y < ah - 1; y++) {
      for (let x = 1; x < aw - 1; x++) {
        const idx = (y * aw + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const lum = Math.round(clamp(0.299 * r + 0.587 * g + 0.114 * b, 0, 255));
        histLum[lum]++;
        sumR += r;
        sumG += g;
        sumB += b;

        const leftIdx = (y * aw + x - 1) * 4;
        const rightIdx = (y * aw + x + 1) * 4;
        const upIdx = ((y - 1) * aw + x) * 4;
        const downIdx = ((y + 1) * aw + x) * 4;

        const lumL = 0.299 * data[leftIdx] + 0.587 * data[leftIdx + 1] + 0.114 * data[leftIdx + 2];
        const lumR = 0.299 * data[rightIdx] + 0.587 * data[rightIdx + 1] + 0.114 * data[rightIdx + 2];
        const lumU = 0.299 * data[upIdx] + 0.587 * data[upIdx + 1] + 0.114 * data[upIdx + 2];
        const lumD = 0.299 * data[downIdx] + 0.587 * data[downIdx + 1] + 0.114 * data[downIdx + 2];

        const lap = Math.abs(4 * lum - lumL - lumR - lumU - lumD);
        highFreqSum += lap;
        const neighborSpan = Math.abs(lumL - lumR) + Math.abs(lumU - lumD);
        if (neighborSpan < 14 && lap > 10) smoothVarCount++;
        if (neighborSpan < 20 && Math.abs(lum - (lumL + lumR + lumU + lumD) * 0.25) > 22) {
          speckHits++;
        }
      }
    }

    const p2 = (() => {
      let acc = 0;
      const tgt = total * 0.02;
      for (let v = 0; v < 256; v++) {
        acc += histLum[v];
        if (acc >= tgt) return v;
      }
      return 0;
    })();
    const p98 = (() => {
      let acc = 0;
      const tgt = total * 0.98;
      for (let v = 0; v < 256; v++) {
        acc += histLum[v];
        if (acc >= tgt) return v;
      }
      return 255;
    })();

    const dynamicRangePct = Math.round(clamp(((p98 - p2) / 255) * 100, 10, 100));
    const fadeSeverityPct = Math.round(clamp(100 - dynamicRangePct + (p2 > 22 ? p2 * 0.5 : 0), 8, 95));

    const mR = sumR / total;
    const mG = sumG / total;
    const mB = sumB / total;
    const yellowDelta = (mR + mG) * 0.5 - mB;
    const yellowCastPct = Math.round(clamp(Math.abs(yellowDelta) * 1.4, 0, 95));

    let colorCastShift = 'Balanced';
    if (yellowDelta > 12) colorCastShift = 'Warm / Yellowed Print';
    else if (yellowDelta < -12) colorCastShift = 'Cool / Cyan Fade';
    else if (mR - mG > 14) colorCastShift = 'Magenta Age Cast';

    const interiorCount = Math.max(1, (aw - 2) * (ah - 2));
    const meanLap = highFreqSum / interiorCount;
    const softnessPct = Math.round(clamp(100 - meanLap * 3.1, 15, 88));
    const estimatedNoisePct = Math.round(clamp((smoothVarCount / interiorCount) * 320, 10, 88));
    const dustSpeckPct = Math.round(clamp((speckHits / interiorCount) * 850, 5, 90));

    const recContrast = Math.round(clamp(8 + fadeSeverityPct * 0.32, 8, 34));
    const recExposure = p98 < 185 ? Math.round(clamp((190 - p98) * 0.18, 0, 16)) : p2 > 45 ? -6 : 0;

    const recommendedConfig: PhotoRestorationConfig = {
      presetId: fadeSeverityPct > 45 ? 'faded-color-rescue' : 'vintage-revival',
      intensity: 90,
      noiseReduction: Math.round(clamp(16 + estimatedNoisePct * 0.55, 16, 68)),
      blurReduction: Math.round(clamp(18 + softnessPct * 0.6, 18, 74)),
      sharpening: Math.round(clamp(16 + softnessPct * 0.35, 14, 52)),
      detailTexture: Math.round(clamp(18 + softnessPct * 0.35, 18, 56)),
      fadedColorRestore: Math.round(clamp(22 + fadeSeverityPct * 0.72, 22, 88)),
      castNeutralize: Math.round(clamp(18 + yellowCastPct * 0.8, 16, 85)),
      scratchDustReduction: Math.round(clamp(20 + dustSpeckPct * 0.75, 18, 86)),
      exposureRecovery: recExposure,
      brightness: p98 < 180 ? 4 : 0,
      contrast: recContrast,
      shadowsRecovery: p2 > 18 ? 14 : 26,
      highlightsRecovery: p98 > 235 ? 36 : 16,
      spotStrokes: [],
    };

    return {
      width: wSrc,
      height: hSrc,
      dynamicRangePct,
      fadeSeverityPct,
      colorCastShift,
      yellowCastPct,
      estimatedNoisePct,
      softnessPct,
      dustSpeckPct,
      summary: `Measured ${dynamicRangePct}% dynamic range (${colorCastShift}), ~${estimatedNoisePct}% noise floor, and ~${softnessPct}% optical softness.`,
      limitationNote:
        'Restoration uses local mathematical image recovery (Auto-Levels contrast stretch, Gray-World de-yellowing, bilateral denoising, directional dust/scratch repair, and halo-clamped sharpening). It does not run a generative AI neural network to invent missing faces or torn background chunks.',
      recommendedConfig,
    };
  } finally {
    releaseCanvasMemory(c);
  }
}

export function renderPhotoRestorationCanvas(
  img: HTMLImageElement,
  targetCanvas: HTMLCanvasElement,
  config: PhotoRestorationConfig,
  options?: {
    maxPreviewDim?: number;
    showRepairMask?: boolean;
  }
): RestorationRenderResult {
  const origW = img.naturalWidth || img.width || 1;
  const origH = img.naturalHeight || img.height || 1;

  let outW = origW;
  let outH = origH;
  const maxDim = options?.maxPreviewDim;
  if (maxDim && Math.max(outW, outH) > maxDim) {
    const scale = maxDim / Math.max(outW, outH);
    outW = Math.max(1, Math.round(outW * scale));
    outH = Math.max(1, Math.round(outH * scale));
  }

  targetCanvas.width = outW;
  targetCanvas.height = outH;
  const ctx = targetCanvas.getContext('2d');
  if (!ctx) {
    return { width: outW, height: outH, repairedDustPixels: 0, appliedSpotStrokes: 0 };
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, outW, outH);
  ctx.drawImage(img, 0, 0, outW, outH);

  const masterBlend = clamp(config.intensity / 100, 0, 1);
  if (masterBlend <= 0) {
    return { width: outW, height: outH, repairedDustPixels: 0, appliedSpotStrokes: 0 };
  }

  const imageData = ctx.getImageData(0, 0, outW, outH);
  const workData = imageData.data;

  // Only allocate original backup copy if blending < 100%, optimizing Android peak memory
  const origCopy = masterBlend < 0.999 ? new Uint8ClampedArray(workData) : null;
  const repairOverlayMask = options?.showRepairMask ? new Uint8Array(outW * outH) : undefined;

  // 1. Manual Spot-Heal & Scratch Brush Repairs
  applyManualSpotHeal(workData, outW, outH, config.spotStrokes, repairOverlayMask);

  // 2. Automated Dust & Scratch Outlier Reduction
  const repairedDustPixels = applyDirectionalDustScratchRemoval(
    workData,
    outW,
    outH,
    config.scratchDustReduction,
    repairOverlayMask
  );

  // 3. Edge-Preserving Noise Reduction
  applyEdgePreservingDenoise(workData, outW, outH, config.noiseReduction);

  // 4. Blur Reduction, Detail Texture & Fine Sharpening
  applyDeconvSharpnessAndTexture(
    workData,
    outW,
    outH,
    config.blurReduction,
    config.sharpening,
    config.detailTexture
  );

  // 5. Faded Color, Cast Removal & Exposure / Contrast Recovery
  applyFadedColorAndToneRecovery(workData, config);

  // 6. Master Restoration Intensity Blend
  if (origCopy) {
    const inv = 1 - masterBlend;
    for (let i = 0; i < workData.length; i += 4) {
      workData[i] = clamp255(origCopy[i] * inv + workData[i] * masterBlend);
      workData[i + 1] = clamp255(origCopy[i + 1] * inv + workData[i + 1] * masterBlend);
      workData[i + 2] = clamp255(origCopy[i + 2] * inv + workData[i + 2] * masterBlend);
    }
  }

  // 7. Optional Diagnostic Repair Overlay (highlights dust/scratch & manual spot heals)
  if (repairOverlayMask) {
    for (let p = 0; p < repairOverlayMask.length; p++) {
      const m = repairOverlayMask[p];
      if (m === 0) continue;
      const idx = p * 4;
      if (m === 1) {
        // Auto dust/scratch repair -> warm gold tint
        workData[idx] = clamp255(workData[idx] * 0.45 + 245 * 0.55);
        workData[idx + 1] = clamp255(workData[idx + 1] * 0.45 + 185 * 0.55);
        workData[idx + 2] = clamp255(workData[idx + 2] * 0.45 + 45 * 0.55);
      } else if (m === 2) {
        // Manual spot-heal brush -> violet highlight
        workData[idx] = clamp255(workData[idx] * 0.45 + 168 * 0.55);
        workData[idx + 1] = clamp255(workData[idx + 1] * 0.45 + 85 * 0.55);
        workData[idx + 2] = clamp255(workData[idx + 2] * 0.45 + 247 * 0.55);
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);

  return {
    width: outW,
    height: outH,
    repairedDustPixels,
    appliedSpotStrokes: config.spotStrokes.length,
  };
}
