import { FILTER_PRESETS } from '../data/studioCatalog';
import {
  BackdropMode,
  CropAspect,
  DEFAULT_ADJUSTMENTS,
  EnhanceParams,
  OverlayId,
  PhotoAdjustments,
  RefineStroke,
  StickerKind,
  StickerLayer,
  SubjectSegmentConfig,
  TextLayer,
} from '../types/editor';

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unable to load image asset.'));
    img.src = src;
  });
}

export function getCroppedDimensions(
  srcW: number,
  srcH: number,
  rotation: number,
  cropAspect: CropAspect
): { sx: number; sy: number; sw: number; sh: number; outW: number; outH: number } {
  const isRotated90 = rotation === 90 || rotation === 270;
  const effW = isRotated90 ? srcH : srcW;
  const effH = isRotated90 ? srcW : srcH;

  if (cropAspect === 'original') {
    return { sx: 0, sy: 0, sw: effW, sh: effH, outW: effW, outH: effH };
  }

  const targetRatioMap: Record<Exclude<CropAspect, 'original'>, number> = {
    '1:1': 1,
    '4:5': 4 / 5,
    '3:4': 3 / 4,
    '16:9': 16 / 9,
    '9:16': 9 / 16,
  };
  const targetRatio = targetRatioMap[cropAspect];
  const currentRatio = effW / effH;

  let sw = effW;
  let sh = effH;
  if (currentRatio > targetRatio) {
    sw = Math.round(effH * targetRatio);
  } else {
    sh = Math.round(effW / targetRatio);
  }
  const sx = Math.round((effW - sw) / 2);
  const sy = Math.round((effH - sh) / 2);
  return { sx, sy, sw, sh, outW: sw, outH: sh };
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

export function mergeFilterWithAdjustments(adj: PhotoAdjustments): PhotoAdjustments {
  const preset = FILTER_PRESETS.find((p) => p.id === adj.activeFilterId);
  if (!preset || preset.id === 'original' || adj.filterIntensity <= 0) {
    return adj;
  }
  const ratio = adj.filterIntensity / 100;
  const f = preset.adjustments;
  const add = (base: number, delta?: number, min = -100, max = 100) =>
    Math.max(min, Math.min(max, Math.round(base + (delta ?? 0) * ratio)));

  return {
    ...adj,
    brightness: add(adj.brightness, f.brightness, -60, 60),
    exposure: add(adj.exposure, f.exposure, -60, 60),
    contrast: add(adj.contrast, f.contrast, -60, 75),
    highlights: add(adj.highlights, f.highlights, -60, 60),
    shadows: add(adj.shadows, f.shadows, -60, 60),
    saturation: add(adj.saturation, f.saturation, -100, 100),
    hueShift: add(adj.hueShift ?? 0, f.hueShift, -180, 180),
    hslLightness: add(adj.hslLightness ?? 0, f.hslLightness, -50, 50),
    redShift: add(adj.redShift ?? 0, f.redShift, -50, 50),
    greenShift: add(adj.greenShift ?? 0, f.greenShift, -50, 50),
    blueShift: add(adj.blueShift ?? 0, f.blueShift, -50, 50),
    temperature: add(adj.temperature, f.temperature, -60, 60),
    tint: add(adj.tint, f.tint, -60, 60),
    sharpness: add(adj.sharpness, f.sharpness, 0, 100),
    vignette: add(adj.vignette, f.vignette, 0, 100),
    grain: add(adj.grain, f.grain, 0, 60),
    bloom: add(adj.bloom, f.bloom, 0, 60),
    sepia: add(adj.sepia ?? 0, f.sepia, 0, 100),
    hdr: add(adj.hdr ?? 0, f.hdr, 0, 100),
    colorPop: add(adj.colorPop ?? 0, f.colorPop, 0, 100),
  };
}

export function applyPixelAdjustments(imageData: ImageData, adj: PhotoAdjustments): void {
  const data = imageData.data;
  const brightShift = adj.brightness * 1.45;
  const expFactor = Math.pow(2, adj.exposure / 35);
  const contrastFactor = Math.pow((100 + adj.contrast) / 100, 1.35);
  const satFactor = Math.max(0, 1 + adj.saturation / 100);
  const tempShift = adj.temperature * 0.75;
  const tintShift = adj.tint * 0.65;
  const hiShift = adj.highlights * 0.6;
  const shShift = adj.shadows * 0.6;
  const grainAmp = adj.grain * 0.85;

  const rOff = (adj.redShift ?? 0) * 1.6;
  const gOff = (adj.greenShift ?? 0) * 1.6;
  const bOff = (adj.blueShift ?? 0) * 1.6;
  const hueDeg = adj.hueShift ?? 0;
  const hslLight = (adj.hslLightness ?? 0) * 1.5;
  const sepiaRatio = Math.max(0, Math.min(1, (adj.sepia ?? 0) / 100));
  const hdrRatio = Math.max(0, Math.min(1, (adj.hdr ?? 0) / 100));
  const popRatio = Math.max(0, Math.min(1, (adj.colorPop ?? 0) / 100));

  const hasHue = hueDeg !== 0;
  const cosA = hasHue ? Math.cos((hueDeg * Math.PI) / 180) : 1;
  const sinA = hasHue ? Math.sin((hueDeg * Math.PI) / 180) : 0;
  const m00 = cosA + (1 - cosA) / 3;
  const m01 = (1 - cosA) / 3 - Math.sqrt(1 / 3) * sinA;
  const m02 = (1 - cosA) / 3 + Math.sqrt(1 / 3) * sinA;
  const m10 = (1 - cosA) / 3 + Math.sqrt(1 / 3) * sinA;
  const m11 = cosA + (1 - cosA) / 3;
  const m12 = (1 - cosA) / 3 - Math.sqrt(1 / 3) * sinA;
  const m20 = (1 - cosA) / 3 - Math.sqrt(1 / 3) * sinA;
  const m21 = (1 - cosA) / 3 + Math.sqrt(1 / 3) * sinA;
  const m22 = cosA + (1 - cosA) / 3;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;

    let r = data[i] * expFactor + brightShift + hslLight;
    let g = data[i + 1] * expFactor + brightShift + hslLight;
    let b = data[i + 2] * expFactor + brightShift + hslLight;

    // RGB Channels + Temperature & Tint
    r += rOff + tempShift + tintShift * 0.3;
    g += gOff - tintShift * 0.6;
    b += bOff - tempShift + tintShift * 0.3;

    // HSL Hue Rotation
    if (hasHue) {
      const nr = r * m00 + g * m01 + b * m02;
      const ng = r * m10 + g * m11 + b * m12;
      const nb = r * m20 + g * m21 + b * m22;
      r = nr;
      g = ng;
      b = nb;
    }

    // Luminance-aware Shadows & Highlights + HDR Tone Compression
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (shShift !== 0 || hdrRatio > 0) {
      const shadowWeight = Math.pow(1 - Math.min(1, Math.max(0, lum)), 1.6);
      const lift = (shShift + hdrRatio * 34) * shadowWeight;
      r += lift;
      g += lift;
      b += lift;
    }
    if (hiShift !== 0 || hdrRatio > 0) {
      const highlightWeight = Math.pow(Math.min(1, Math.max(0, lum)), 1.6);
      const shift = (hiShift - hdrRatio * 28) * highlightWeight;
      r += shift;
      g += shift;
      b += shift;
    }

    // Contrast (+ HDR mid-tone punch)
    const totalContrast = contrastFactor * (1 + hdrRatio * 0.24);
    r = (r - 128) * totalContrast + 128;
    g = (g - 128) * totalContrast + 128;
    b = (b - 128) * totalContrast + 128;

    // Saturation + Color Pop (vibrance + selective chroma boost)
    if (satFactor !== 1 || popRatio > 0 || hdrRatio > 0) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const chroma = (maxC - minC) / 255;
      const popBoost = popRatio * (0.55 + (1 - chroma) * 0.65);
      const hdrSatBoost = hdrRatio * 0.2;
      const effectiveSat = satFactor * (1 + popBoost + hdrSatBoost);
      r = gray + (r - gray) * effectiveSat;
      g = gray + (g - gray) * effectiveSat;
      b = gray + (b - gray) * effectiveSat;
    }

    // Sepia Matrix Blend
    if (sepiaRatio > 0) {
      const sr = 0.393 * r + 0.769 * g + 0.189 * b;
      const sg = 0.349 * r + 0.686 * g + 0.168 * b;
      const sb = 0.272 * r + 0.534 * g + 0.131 * b;
      r = r * (1 - sepiaRatio) + sr * sepiaRatio;
      g = g * (1 - sepiaRatio) + sg * sepiaRatio;
      b = b * (1 - sepiaRatio) + sb * sepiaRatio;
    }

    // Deterministic Film grain (flicker-free during live slider dragging)
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
}

export function applySharpenConvolution(imageData: ImageData, amount: number): void {
  if (amount <= 0) return;
  const strength = Math.min(1.6, amount / 55);
  const w = imageData.width;
  const h = imageData.height;
  const src = new Uint8ClampedArray(imageData.data);
  const dst = imageData.data;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      if (src[idx + 3] === 0) continue;
      const top = ((y - 1) * w + x) * 4;
      const bot = ((y + 1) * w + x) * 4;
      const left = (y * w + (x - 1)) * 4;
      const right = (y * w + (x + 1)) * 4;

      for (let c = 0; c < 3; c++) {
        const center = src[idx + c];
        const avg = (src[top + c] + src[bot + c] + src[left + c] + src[right + c]) * 0.25;
        const sharpened = center + (center - avg) * strength;
        dst[idx + c] = clamp255(sharpened);
      }
    }
  }
}

function drawOverlayEffect(
  ctx: CanvasRenderingContext2D,
  outW: number,
  outH: number,
  overlayId: OverlayId,
  opacityPct: number
) {
  if (overlayId === 'none' || opacityPct <= 0) return;
  const alpha = Math.max(0, Math.min(1, opacityPct / 100));
  ctx.save();
  ctx.globalAlpha = alpha;

  if (overlayId === 'golden-flare') {
    ctx.globalCompositeOperation = 'screen';
    const grad = ctx.createRadialGradient(outW * 0.15, outH * 0.12, 0, outW * 0.2, outH * 0.2, outW * 0.75);
    grad.addColorStop(0, 'rgba(251, 191, 36, 0.75)');
    grad.addColorStop(0.45, 'rgba(245, 158, 11, 0.28)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, outW, outH);
  } else if (overlayId === 'cyber-prism') {
    ctx.globalCompositeOperation = 'screen';
    const grad = ctx.createLinearGradient(0, 0, outW, outH);
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.52)');
    grad.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(1, 'rgba(168, 85, 247, 0.56)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, outW, outH);
  } else if (overlayId === 'violet-mist') {
    ctx.globalCompositeOperation = 'screen';
    const grad = ctx.createLinearGradient(0, outH, 0, outH * 0.25);
    grad.addColorStop(0, 'rgba(139, 92, 246, 0.65)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, outW, outH);
  } else if (overlayId === 'cinema-bars') {
    ctx.fillStyle = '#05060A';
    const barH = Math.round(outH * 0.1);
    ctx.fillRect(0, 0, outW, barH);
    ctx.fillRect(0, outH - barH, outW, barH);
  } else if (overlayId === 'film-border') {
    const pad = Math.max(10, Math.round(Math.min(outW, outH) * 0.032));
    ctx.strokeStyle = '#D4AF37';
    ctx.lineWidth = Math.max(2, Math.round(Math.min(outW, outH) * 0.004));
    ctx.strokeRect(pad, pad, outW - pad * 2, outH - pad * 2);
  }

  ctx.restore();
}

function drawStickerShape(
  ctx: CanvasRenderingContext2D,
  kind: StickerKind,
  radius: number,
  color: string
) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, radius * 0.12);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (kind === 'starburst' || kind === 'compass') {
    const spikes = kind === 'starburst' ? 8 : 4;
    const innerR = kind === 'starburst' ? radius * 0.42 : radius * 0.28;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? radius : innerR;
      const angle = (i * Math.PI) / spikes - Math.PI / 2;
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'sparkle') {
    ctx.beginPath();
    ctx.moveTo(0, -radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.quadraticCurveTo(0, 0, 0, radius);
    ctx.quadraticCurveTo(0, 0, -radius, 0);
    ctx.quadraticCurveTo(0, 0, 0, -radius);
    ctx.fill();
  } else if (kind === 'crown') {
    const w = radius * 1.1;
    const h = radius * 0.85;
    ctx.beginPath();
    ctx.moveTo(-w, h * 0.6);
    ctx.lineTo(-w * 0.9, -h * 0.45);
    ctx.lineTo(-w * 0.35, h * 0.05);
    ctx.lineTo(0, -h * 0.7);
    ctx.lineTo(w * 0.35, h * 0.05);
    ctx.lineTo(w * 0.9, -h * 0.45);
    ctx.lineTo(w, h * 0.6);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'aperture') {
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.85, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.32, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * radius * 0.35, Math.sin(a) * radius * 0.35);
      ctx.lineTo(Math.cos(a + 0.5) * radius * 0.85, Math.sin(a + 0.5) * radius * 0.85);
      ctx.stroke();
    }
  } else if (kind === 'heart') {
    const s = radius * 0.9;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.75);
    ctx.bezierCurveTo(-s * 1.2, -s * 0.1, -s * 0.55, -s * 1.0, 0, -s * 0.3);
    ctx.bezierCurveTo(s * 0.55, -s * 1.0, s * 1.2, -s * 0.1, 0, s * 0.75);
    ctx.fill();
  } else if (kind === 'bolt') {
    const s = radius;
    ctx.beginPath();
    ctx.moveTo(s * 0.18, -s);
    ctx.lineTo(-s * 0.55, s * 0.08);
    ctx.lineTo(s * 0.02, s * 0.08);
    ctx.lineTo(-s * 0.2, s);
    ctx.lineTo(s * 0.58, -s * 0.08);
    ctx.lineTo(0, -s * 0.08);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'badge') {
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.88, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#06070B';
    ctx.lineWidth = Math.max(2, radius * 0.14);
    ctx.beginPath();
    ctx.moveTo(-radius * 0.34, 0);
    ctx.lineTo(-radius * 0.08, radius * 0.28);
    ctx.lineTo(radius * 0.36, -radius * 0.26);
    ctx.stroke();
  } else if (kind === 'moon') {
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.85, 0.4, Math.PI * 1.65);
    ctx.arc(radius * 0.32, -radius * 0.1, radius * 0.65, Math.PI * 1.6, 0.45, true);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'prism') {
    ctx.beginPath();
    ctx.moveTo(0, -radius);
    ctx.lineTo(radius * 0.75, 0);
    ctx.lineTo(0, radius);
    ctx.lineTo(-radius * 0.75, 0);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'frame-stamp') {
    const w = radius * 1.35;
    const h = radius * 0.72;
    ctx.strokeRect(-w, -h, w * 2, h * 2);
    ctx.beginPath();
    ctx.arc(-w * 0.55, 0, radius * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = '#EF4444';
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = `700 ${Math.round(radius * 0.46)}px 'JetBrains Mono', monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('REC', -w * 0.2, 1);
  } else if (kind === 'sun') {
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.48, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * radius * 0.66, Math.sin(a) * radius * 0.66);
      ctx.lineTo(Math.cos(a) * radius * 0.95, Math.sin(a) * radius * 0.95);
      ctx.stroke();
    }
  }
}

export function drawStickersOnContext(
  ctx: CanvasRenderingContext2D,
  outW: number,
  outH: number,
  stickers: StickerLayer[]
): void {
  const scaleFactor = outW / 1000;
  for (const st of stickers) {
    ctx.save();
    ctx.translate(st.x * outW, st.y * outH);
    ctx.rotate((st.rotation * Math.PI) / 180);
    ctx.globalAlpha = Math.max(0, Math.min(1, st.opacity / 100));
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 12 * scaleFactor;
    const rad = Math.max(14, (st.size * scaleFactor) / 2);
    drawStickerShape(ctx, st.kind, rad, st.color);
    ctx.restore();
  }
}

export function drawTextLayersOnContext(
  ctx: CanvasRenderingContext2D,
  outW: number,
  outH: number,
  layers: TextLayer[]
): void {
  const scaleFactor = outW / 1000;
  for (const layer of layers) {
    ctx.save();
    ctx.translate(layer.x * outW, layer.y * outH);
    ctx.rotate((layer.rotation * Math.PI) / 180);

    const fontPx = Math.max(12, Math.round(layer.fontSize * scaleFactor));
    ctx.font = `${layer.fontWeight} ${fontPx}px ${layer.fontFamily}`;
    ctx.textAlign = layer.align;
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity / 100));

    if (layer.shadowBlur > 0) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
      ctx.shadowBlur = layer.shadowBlur * scaleFactor;
      ctx.shadowOffsetY = 4 * scaleFactor;
    }

    const content = layer.uppercase ? layer.text.toUpperCase() : layer.text;
    const lines = content.split('\n');
    const stepY = fontPx * layer.lineHeight;
    const startY = -((lines.length - 1) * stepY) / 2;

    if ('letterSpacing' in ctx) {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${layer.letterSpacing * scaleFactor}px`;
    }

    lines.forEach((line, index) => {
      const yOffset = startY + index * stepY;
      if (layer.strokeWidth > 0) {
        ctx.lineWidth = layer.strokeWidth * scaleFactor * 2;
        ctx.strokeStyle = layer.strokeColor;
        ctx.lineJoin = 'round';
        ctx.strokeText(line, 0, yOffset);
      }
      ctx.fillStyle = layer.color;
      ctx.fillText(line, 0, yOffset);
    });

    ctx.restore();
  }
}

export interface StudioCompositeOptions {
  maxPreviewDim?: number;
  textLayers?: TextLayer[];
  stickers?: StickerLayer[];
  bgCutout?: {
    enabled: boolean;
    segment: SubjectSegmentConfig;
    backdrop: BackdropMode;
  };
}

export function renderAdjustedCanvas(
  img: HTMLImageElement,
  targetCanvas: HTMLCanvasElement,
  rawAdj: PhotoAdjustments,
  maxPreviewDimOrOpts?: number | StudioCompositeOptions
): void {
  const opts: StudioCompositeOptions =
    typeof maxPreviewDimOrOpts === 'number'
      ? { maxPreviewDim: maxPreviewDimOrOpts }
      : maxPreviewDimOrOpts ?? {};

  const adj = mergeFilterWithAdjustments(rawAdj);

  const { sx, sy, sw, sh } = getCroppedDimensions(
    img.naturalWidth,
    img.naturalHeight,
    adj.rotation,
    adj.cropAspect
  );

  let outW = sw;
  let outH = sh;
  if (opts.maxPreviewDim && Math.max(sw, sh) > opts.maxPreviewDim) {
    const scale = opts.maxPreviewDim / Math.max(sw, sh);
    outW = Math.max(1, Math.round(sw * scale));
    outH = Math.max(1, Math.round(sh * scale));
  }

  // Step 1: Rotate (90° + fine straighten) & flip original into an offscreen buffer
  const isRotated90 = adj.rotation === 90 || adj.rotation === 270;
  const effW = isRotated90 ? img.naturalHeight : img.naturalWidth;
  const effH = isRotated90 ? img.naturalWidth : img.naturalHeight;

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = effW;
  tempCanvas.height = effH;
  const tCtx = tempCanvas.getContext('2d');
  if (!tCtx) return;

  // Base image (optionally BG-cutout first)
  let sourceDrawable: HTMLCanvasElement | HTMLImageElement = img;
  if (opts.bgCutout?.enabled) {
    const cutCanvas = document.createElement('canvas');
    renderBackgroundCutout(img, cutCanvas, opts.bgCutout.segment, [], opts.bgCutout.backdrop);
    sourceDrawable = cutCanvas;
  }

  tCtx.imageSmoothingEnabled = true;
  tCtx.imageSmoothingQuality = 'high';
  tCtx.save();
  tCtx.translate(effW / 2, effH / 2);
  const totalRad = ((adj.rotation + adj.fineRotation) * Math.PI) / 180;
  tCtx.rotate(totalRad);
  // Slight scale-to-cover when fine-rotating so corners stay filled
  if (adj.fineRotation !== 0) {
    const absRad = (Math.abs(adj.fineRotation) * Math.PI) / 180;
    const coverScale = Math.cos(absRad) + Math.sin(absRad) * Math.max(effW / effH, effH / effW);
    tCtx.scale(coverScale, coverScale);
  }
  tCtx.scale(adj.flipH ? -1 : 1, adj.flipV ? -1 : 1);
  if (adj.blur > 0) {
    tCtx.filter = `blur(${adj.blur}px)`;
  }
  tCtx.drawImage(sourceDrawable, -img.naturalWidth / 2, -img.naturalHeight / 2);
  tCtx.restore();

  // Step 2: Crop & resize onto targetCanvas
  targetCanvas.width = outW;
  targetCanvas.height = outH;
  const ctx = targetCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, outW, outH);
  ctx.drawImage(tempCanvas, sx, sy, sw, sh, 0, 0, outW, outH);

  // Step 3: Pixel-level adjustments & sharpness
  const effectiveSharpness = Math.min(100, adj.sharpness + Math.round((adj.hdr ?? 0) * 0.28));
  const needsPixelPass =
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

  if (needsPixelPass) {
    const imgData = ctx.getImageData(0, 0, outW, outH);
    applyPixelAdjustments(imgData, adj);
    if (effectiveSharpness > 0) {
      applySharpenConvolution(imgData, effectiveSharpness);
    }
    ctx.putImageData(imgData, 0, 0);
  }

  // Step 4: Optical Bloom glow
  if (adj.bloom > 0) {
    const bloomCanvas = document.createElement('canvas');
    bloomCanvas.width = Math.max(1, Math.round(outW / 4));
    bloomCanvas.height = Math.max(1, Math.round(outH / 4));
    const bCtx = bloomCanvas.getContext('2d');
    if (bCtx) {
      bCtx.filter = 'blur(10px) brightness(1.15)';
      bCtx.drawImage(targetCanvas, 0, 0, bloomCanvas.width, bloomCanvas.height);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = Math.min(0.45, adj.bloom / 120);
      ctx.drawImage(bloomCanvas, 0, 0, outW, outH);
      ctx.restore();
    }
  }

  // Step 5: Vignette overlay
  if (adj.vignette > 0) {
    const cx = outW / 2;
    const cy = outH / 2;
    const outerRadius = Math.hypot(cx, cy);
    const grad = ctx.createRadialGradient(cx, cy, outerRadius * 0.35, cx, cy, outerRadius);
    const alpha = Math.min(0.88, adj.vignette / 100);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(4,6,14,${alpha})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, outW, outH);
  }

  // Step 6: Optical Overlays
  drawOverlayEffect(ctx, outW, outH, adj.overlayId, adj.overlayOpacity);

  // Step 7: Stickers
  if (opts.stickers && opts.stickers.length > 0) {
    drawStickersOnContext(ctx, outW, outH, opts.stickers);
  }

  // Step 8: Text Layers
  if (opts.textLayers && opts.textLayers.length > 0) {
    drawTextLayersOnContext(ctx, outW, outH, opts.textLayers);
  }
}

export function renderEnhancedCanvas(
  img: HTMLImageElement,
  targetCanvas: HTMLCanvasElement,
  params: EnhanceParams,
  maxPreviewDim?: number
): void {
  const scale = params.upscale2x && !maxPreviewDim ? 2 : 1;
  let outW = img.naturalWidth * scale;
  let outH = img.naturalHeight * scale;

  if (maxPreviewDim && Math.max(outW, outH) > maxPreviewDim) {
    const s = maxPreviewDim / Math.max(outW, outH);
    outW = Math.max(1, Math.round(outW * s));
    outH = Math.max(1, Math.round(outH * s));
  }

  targetCanvas.width = outW;
  targetCanvas.height = outH;
  const ctx = targetCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (params.denoise > 0) {
    ctx.filter = `blur(${(params.denoise / 90).toFixed(2)}px)`;
    ctx.drawImage(img, 0, 0, outW, outH);
    ctx.filter = 'none';
    ctx.globalAlpha = 0.7;
    ctx.drawImage(img, 0, 0, outW, outH);
    ctx.globalAlpha = 1;
  } else {
    ctx.drawImage(img, 0, 0, outW, outH);
  }

  const imgData = ctx.getImageData(0, 0, outW, outH);
  const adj: PhotoAdjustments = {
    ...DEFAULT_ADJUSTMENTS,
    exposure: params.exposureLift,
    contrast: params.contrastBoost + Math.round(params.clarity * 0.25),
    highlights: -Math.round(params.clarity * 0.15),
    shadows: Math.round(params.clarity * 0.25),
    saturation: params.colorVibrance,
    sharpness: params.sharpen,
  };
  applyPixelAdjustments(imgData, adj);
  applySharpenConvolution(imgData, params.sharpen + Math.round(params.clarity * 0.4));
  ctx.putImageData(imgData, 0, 0);
}

export function renderBackgroundCutout(
  img: HTMLImageElement,
  targetCanvas: HTMLCanvasElement,
  segment: SubjectSegmentConfig,
  refineStrokes: RefineStroke[],
  backdrop: BackdropMode,
  maxPreviewDim?: number
): void {
  let outW = img.naturalWidth;
  let outH = img.naturalHeight;
  if (maxPreviewDim && Math.max(outW, outH) > maxPreviewDim) {
    const s = maxPreviewDim / Math.max(outW, outH);
    outW = Math.max(1, Math.round(outW * s));
    outH = Math.max(1, Math.round(outH * s));
  }

  targetCanvas.width = outW;
  targetCanvas.height = outH;
  const ctx = targetCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const fgCanvas = document.createElement('canvas');
  fgCanvas.width = outW;
  fgCanvas.height = outH;
  const fgCtx = fgCanvas.getContext('2d', { willReadFrequently: true });
  if (!fgCtx) return;

  fgCtx.drawImage(img, 0, 0, outW, outH);
  const imgData = fgCtx.getImageData(0, 0, outW, outH);
  const data = imgData.data;

  const alphaMask = new Uint8Array(outW * outH);
  alphaMask.fill(255);

  const visited = new Uint8Array(outW * outH);
  const queue = new Int32Array(outW * outH);

  const seedCoords: Array<[number, number]> = [
    [0, 0],
    [outW - 1, 0],
    [0, outH - 1],
    [outW - 1, outH - 1],
    [Math.floor(outW * 0.5), 0],
    [0, Math.floor(outH * 0.5)],
    [outW - 1, Math.floor(outH * 0.5)],
  ];

  const coreXMin = Math.floor((segment.xMin + (segment.xMax - segment.xMin) * 0.2) * outW);
  const coreXMax = Math.floor((segment.xMax - (segment.xMax - segment.xMin) * 0.2) * outW);
  const coreYMin = Math.floor((segment.yMin + (segment.yMax - segment.yMin) * 0.18) * outH);
  const coreYMax = Math.floor((segment.yMax - (segment.yMax - segment.yMin) * 0.15) * outH);

  const threshSq = Math.pow(segment.threshold * 2.2, 2);

  for (const [sx, sy] of seedCoords) {
    const startPos = sy * outW + sx;
    if (visited[startPos]) continue;

    const sIdx = startPos * 4;
    const sr = data[sIdx];
    const sg = data[sIdx + 1];
    const sb = data[sIdx + 2];

    let head = 0;
    let tail = 0;
    queue[tail++] = startPos;
    visited[startPos] = 1;

    while (head < tail) {
      const pos = queue[head++];
      const px = pos % outW;
      const py = (pos - px) / outW;

      const idx = pos * 4;
      const dr = data[idx] - sr;
      const dg = data[idx + 1] - sg;
      const db = data[idx + 2] - sb;
      const distSq = dr * dr + dg * dg + db * db;

      const insideCore = px >= coreXMin && px <= coreXMax && py >= coreYMin && py <= coreYMax;
      const effectiveThresh = insideCore ? threshSq * 0.38 : threshSq;

      if (distSq <= effectiveThresh) {
        alphaMask[pos] = 0;

        if (px > 0) {
          const n = pos - 1;
          if (!visited[n]) {
            visited[n] = 1;
            queue[tail++] = n;
          }
        }
        if (px < outW - 1) {
          const n = pos + 1;
          if (!visited[n]) {
            visited[n] = 1;
            queue[tail++] = n;
          }
        }
        if (py > 0) {
          const n = pos - outW;
          if (!visited[n]) {
            visited[n] = 1;
            queue[tail++] = n;
          }
        }
        if (py < outH - 1) {
          const n = pos + outW;
          if (!visited[n]) {
            visited[n] = 1;
            queue[tail++] = n;
          }
        }
      }
    }
  }

  for (const stroke of refineStrokes) {
    const cx = Math.round(stroke.x * outW);
    const cy = Math.round(stroke.y * outH);
    const r = Math.max(4, Math.round(stroke.radius * outW));
    const rSq = r * r;
    const yStart = Math.max(0, cy - r);
    const yEnd = Math.min(outH - 1, cy + r);
    const xStart = Math.max(0, cx - r);
    const xEnd = Math.min(outW - 1, cx + r);

    for (let y = yStart; y <= yEnd; y++) {
      for (let x = xStart; x <= xEnd; x++) {
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rSq) {
          alphaMask[y * outW + x] = stroke.mode === 'keep' ? 255 : 0;
        }
      }
    }
  }

  const feather = Math.max(0, Math.min(5, segment.feather));
  if (feather > 0) {
    const feathered = new Uint8Array(alphaMask);
    for (let y = feather; y < outH - feather; y++) {
      for (let x = feather; x < outW - feather; x++) {
        const pos = y * outW + x;
        const curr = alphaMask[pos];
        const up = alphaMask[(y - 1) * outW + x];
        const down = alphaMask[(y + 1) * outW + x];
        const left = alphaMask[y * outW + (x - 1)];
        const right = alphaMask[y * outW + (x + 1)];
        if (curr !== up || curr !== down || curr !== left || curr !== right) {
          let sum = 0;
          let count = 0;
          for (let dy = -feather; dy <= feather; dy++) {
            for (let dx = -feather; dx <= feather; dx++) {
              sum += alphaMask[(y + dy) * outW + (x + dx)];
              count++;
            }
          }
          feathered[pos] = Math.round(sum / count);
        }
      }
    }
    for (let i = 0; i < alphaMask.length; i++) {
      data[i * 4 + 3] = feathered[i];
    }
  } else {
    for (let i = 0; i < alphaMask.length; i++) {
      data[i * 4 + 3] = alphaMask[i];
    }
  }

  fgCtx.putImageData(imgData, 0, 0);

  ctx.clearRect(0, 0, outW, outH);
  if (backdrop === 'navy') {
    const grad = ctx.createLinearGradient(0, 0, outW, outH);
    grad.addColorStop(0, '#070B18');
    grad.addColorStop(1, '#15224A');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, outW, outH);
  } else if (backdrop === 'purple-glow') {
    const grad = ctx.createRadialGradient(outW * 0.5, outH * 0.4, outW * 0.05, outW * 0.5, outH * 0.5, outW * 0.75);
    grad.addColorStop(0, '#4C1D95');
    grad.addColorStop(0.55, '#1E1B4B');
    grad.addColorStop(1, '#06070B');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, outW, outH);
  } else if (backdrop === 'gold-noir') {
    const grad = ctx.createLinearGradient(0, 0, outW, outH);
    grad.addColorStop(0, '#14110A');
    grad.addColorStop(0.5, '#29200D');
    grad.addColorStop(1, '#09090B');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, outW, outH);
  } else if (backdrop === 'studio-white') {
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 0, outW, outH);
  } else if (backdrop === 'bokeh') {
    ctx.save();
    ctx.filter = 'blur(18px) brightness(0.65)';
    ctx.drawImage(img, 0, 0, outW, outH);
    ctx.restore();
  }

  ctx.drawImage(fgCanvas, 0, 0);
}

export function renderTextStudioCanvas(
  img: HTMLImageElement,
  targetCanvas: HTMLCanvasElement,
  layers: TextLayer[],
  maxPreviewDim?: number
): void {
  let outW = img.naturalWidth;
  let outH = img.naturalHeight;
  if (maxPreviewDim && Math.max(outW, outH) > maxPreviewDim) {
    const s = maxPreviewDim / Math.max(outW, outH);
    outW = Math.max(1, Math.round(outW * s));
    outH = Math.max(1, Math.round(outH * s));
  }

  targetCanvas.width = outW;
  targetCanvas.height = outH;
  const ctx = targetCanvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, outW, outH);
  ctx.drawImage(img, 0, 0, outW, outH);
  drawTextLayersOnContext(ctx, outW, outH, layers);
}

export function compressImageForAI(img: HTMLImageElement, maxDim = 768): { base64: string; mimeType: string } {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return { base64: '', mimeType: 'image/jpeg' };
  ctx.drawImage(img, 0, 0, w, h);
  const dataUrl = c.toDataURL('image/jpeg', 0.85);
  return {
    base64: dataUrl.replace(/^data:image\/jpeg;base64,/, ''),
    mimeType: 'image/jpeg',
  };
}

export function createThumbnailDataUrl(canvas: HTMLCanvasElement, maxDim = 480): string {
  const scale = Math.min(1, maxDim / Math.max(canvas.width, canvas.height));
  const w = Math.max(1, Math.round(canvas.width * scale));
  const h = Math.max(1, Math.round(canvas.height * scale));
  const thumb = document.createElement('canvas');
  thumb.width = w;
  thumb.height = h;
  const ctx = thumb.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(canvas, 0, 0, w, h);
  return thumb.toDataURL('image/jpeg', 0.82);
}

export function downloadCanvasImage(
  canvas: HTMLCanvasElement,
  filenameBase: string,
  format: 'png' | 'jpeg' | 'webp' = 'png',
  quality = 95
): void {
  const mime = format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg';
  const url = canvas.toDataURL(mime, quality / 100);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filenameBase}.${format}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
