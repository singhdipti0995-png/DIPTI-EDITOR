export interface InpaintStroke {
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  radius: number; // normalized 0..1 relative to width
}

export type SkyPreset = 'sunset-gold' | 'twilight-aurora' | 'midnight-stars' | 'electric-storm';

export interface MagicRetouchParams {
  operation:
    | 'object-remove'
    | 'bg-replace'
    | 'portrait'
    | 'restore'
    | 'upscale'
    | 'sky'
    | 'cartoon'
    | 'colorize'
    | 'style-transfer';
  horizonY: number;
  skinSmooth: number;
  detailBoost: number;
  warmth: number;
  contrastBoost: number;
  saturationBoost: number;
  edgeStrength: number;
  posterizeLevels: number;
  shadowTintHex: string;
  highlightTintHex: string;
  skyPreset: SkyPreset;
  upscaleFactor: 2 | 3;
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return [128, 128, 200];
  const n = parseInt(clean, 16);
  if (Number.isNaN(n)) return [128, 128, 200];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// 1. Object Remover Patch-Diffusion Inpaint
export function applyObjectInpaint(
  img: HTMLImageElement,
  canvas: HTMLCanvasElement,
  strokes: InpaintStroke[],
  showMaskOverlay: boolean,
  maxDim = 960
): void {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  ctx.drawImage(img, 0, 0, w, h);
  if (strokes.length === 0) return;

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // Build binary mask of painted strokes
  const mask = new Uint8Array(w * h);
  for (const s of strokes) {
    const cx = Math.round(s.x * w);
    const cy = Math.round(s.y * h);
    const r = Math.max(6, Math.round(s.radius * w));
    const rSq = r * r;
    for (let y = Math.max(1, cy - r); y < Math.min(h - 1, cy + r); y++) {
      for (let x = Math.max(1, cx - r); x < Math.min(w - 1, cx + r); x++) {
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rSq) {
          mask[y * w + x] = 1;
        }
      }
    }
  }

  if (showMaskOverlay) {
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) {
        const idx = i * 4;
        data[idx] = clamp255(data[idx] * 0.45 + 168 * 0.55);
        data[idx + 1] = clamp255(data[idx + 1] * 0.45 + 85 * 0.55);
        data[idx + 2] = clamp255(data[idx + 2] * 0.45 + 247 * 0.55);
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return;
  }

  // Iterative inward harmonic diffusion inpainting (24 passes for clean neighbor fill)
  const buf = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) buf[i] = data[i];

  // Seed masked pixels initially with nearest horizontal/vertical border average
  for (let pass = 0; pass < 26; pass++) {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const pos = y * w + x;
        if (!mask[pos]) continue;
        const idx = pos * 4;
        const n1 = ((y - 1) * w + x) * 4;
        const n2 = ((y + 1) * w + x) * 4;
        const n3 = (y * w + (x - 1)) * 4;
        const n4 = (y * w + (x + 1)) * 4;
        for (let c = 0; c < 3; c++) {
          buf[idx + c] = (buf[n1 + c] + buf[n2 + c] + buf[n3 + c] + buf[n4 + c]) * 0.25;
        }
      }
    }
  }

  // Add subtle natural grain inside filled region so it blends organically
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) {
      const idx = i * 4;
      const jitter = (Math.random() - 0.5) * 6;
      data[idx] = clamp255(buf[idx] + jitter);
      data[idx + 1] = clamp255(buf[idx + 1] + jitter);
      data[idx + 2] = clamp255(buf[idx + 2] + jitter);
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

// 2. Sky Replacement Canvas Engine
export function applySkyReplacement(
  img: HTMLImageElement,
  canvas: HTMLCanvasElement,
  horizonY: number,
  skyPreset: SkyPreset,
  maxDim = 960
): void {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  // Draw synthetic sky layer on offscreen canvas
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = w;
  skyCanvas.height = h;
  const sCtx = skyCanvas.getContext('2d');
  if (!sCtx) return;

  const grad = sCtx.createLinearGradient(0, 0, 0, h * Math.min(0.95, horizonY + 0.15));
  if (skyPreset === 'sunset-gold') {
    grad.addColorStop(0, '#1E1B4B');
    grad.addColorStop(0.55, '#9A3412');
    grad.addColorStop(1, '#FBBF24');
  } else if (skyPreset === 'twilight-aurora') {
    grad.addColorStop(0, '#040714');
    grad.addColorStop(0.5, '#4C1D95');
    grad.addColorStop(1, '#38BDF8');
  } else if (skyPreset === 'midnight-stars') {
    grad.addColorStop(0, '#02040A');
    grad.addColorStop(0.7, '#0F172A');
    grad.addColorStop(1, '#1E3A8A');
  } else {
    grad.addColorStop(0, '#090D16');
    grad.addColorStop(0.6, '#1E293B');
    grad.addColorStop(1, '#6366F1');
  }
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, w, h);

  if (skyPreset === 'midnight-stars') {
    for (let i = 0; i < 140; i++) {
      sCtx.fillStyle = `rgba(255,255,255,${0.35 + Math.random() * 0.65})`;
      sCtx.fillRect(Math.random() * w, Math.random() * h * horizonY, 1.8, 1.8);
    }
  }

  ctx.drawImage(img, 0, 0, w, h);
  const srcData = ctx.getImageData(0, 0, w, h);
  const skyData = sCtx.getImageData(0, 0, w, h);
  const s = srcData.data;
  const k = skyData.data;
  const horizonPx = Math.round(horizonY * h);

  for (let y = 0; y < h; y++) {
    const heightWeight = y < horizonPx ? 1 : Math.max(0, 1 - (y - horizonPx) / (h * 0.18));
    if (heightWeight <= 0) continue;
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const lum = (0.299 * s[idx] + 0.587 * s[idx + 1] + 0.114 * s[idx + 2]) / 255;
      // Blend sky strongly on higher-luminance upper regions while preserving dark silhouettes
      const blend = Math.min(0.92, Math.max(0, (lum - 0.22) * 1.45) * heightWeight);
      s[idx] = clamp255(s[idx] * (1 - blend) + k[idx] * blend);
      s[idx + 1] = clamp255(s[idx + 1] * (1 - blend) + k[idx + 1] * blend);
      s[idx + 2] = clamp255(s[idx + 2] * (1 - blend) + k[idx + 2] * blend);
    }
  }
  ctx.putImageData(srcData, 0, 0);
}

// 3. Cartoon / Anime Cel-Shader + Sobel Edge Ink
export function applyCartoonShader(
  img: HTMLImageElement,
  canvas: HTMLCanvasElement,
  levels: number,
  edgeStrength: number,
  saturationBoost: number,
  maxDim = 960,
  animeMode = false
): void {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  // Mild smoothing pass first for flat cel regions
  ctx.filter = animeMode ? 'blur(1.4px) brightness(1.05)' : 'blur(1px)';
  ctx.drawImage(img, 0, 0, w, h);
  ctx.filter = 'none';

  const imgData = ctx.getImageData(0, 0, w, h);
  const src = new Uint8ClampedArray(imgData.data);
  const dst = imgData.data;

  const qLevels = Math.max(3, Math.min(12, levels));
  const step = 255 / (qLevels - 1);
  const satMult = 1 + (saturationBoost + (animeMode ? 18 : 0)) / 100;
  const edgeThresh = Math.max(25, 160 - edgeStrength * 1.2);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      let r = src[idx];
      let g = src[idx + 1];
      let b = src[idx + 2];

      // Boost vibrance before quantization
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + (r - gray) * satMult;
      g = gray + (g - gray) * satMult;
      b = gray + (b - gray) * satMult;

      // Quantize
      r = Math.round(clamp255(r) / step) * step;
      g = Math.round(clamp255(g) / step) * step;
      b = Math.round(clamp255(b) / step) * step;

      if (animeMode) {
        // Soft pastel warm skin & cool twilight shadow lift
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        if (lum < 0.35) b = Math.min(255, b + 16);
        else if (lum > 0.72) {
          r = Math.min(255, r + 10);
          g = Math.min(255, g + 6);
        }
      }

      // Sobel edge gradient
      const lumL = src[(y * w + (x - 1)) * 4];
      const lumR = src[(y * w + (x + 1)) * 4];
      const lumU = src[((y - 1) * w + x) * 4];
      const lumD = src[((y + 1) * w + x) * 4];
      const grad = Math.abs(lumR - lumL) + Math.abs(lumD - lumU);

      if (grad > edgeThresh && edgeStrength > 5) {
        const inkFactor = Math.min(animeMode ? 0.72 : 0.92, (grad - edgeThresh) / 90);
        r *= 1 - inkFactor;
        g *= 1 - inkFactor;
        b *= 1 - inkFactor;
      }

      dst[idx] = clamp255(r);
      dst[idx + 1] = clamp255(g);
      dst[idx + 2] = clamp255(b);
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

// 4. AI Colorization & Style Transfer Tone Mapping
export function applyColorizeOrStyle(
  img: HTMLImageElement,
  canvas: HTMLCanvasElement,
  shadowHex: string,
  highlightHex: string,
  contrastBoost: number,
  saturationBoost: number,
  blendMode: 'colorize' | 'style',
  maxDim = 960
): void {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  const [sr, sg, sb] = hexToRgb(shadowHex);
  const [hr, hg, hb] = hexToRgb(highlightHex);
  const con = Math.pow((100 + contrastBoost) / 100, 1.25);

  for (let i = 0; i < d.length; i += 4) {
    const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    const mappedR = sr * (1 - lum) + hr * lum;
    const mappedG = sg * (1 - lum) + hg * lum;
    const mappedB = sb * (1 - lum) + hb * lum;

    const mix = blendMode === 'colorize' ? 0.62 : Math.min(0.85, 0.45 + Math.max(0, saturationBoost) / 120);
    let r = d[i] * (1 - mix) + mappedR * mix;
    let g = d[i + 1] * (1 - mix) + mappedG * mix;
    let b = d[i + 2] * (1 - mix) + mappedB * mix;

    r = (r - 128) * con + 128;
    g = (g - 128) * con + 128;
    b = (b - 128) * con + 128;

    d[i] = clamp255(r);
    d[i + 1] = clamp255(g);
    d[i + 2] = clamp255(b);
  }
  ctx.putImageData(imgData, 0, 0);
}

// 5. Cinema Glitch & Neon Edge Glow FX
export function applyCinemaGlitchAndNeon(
  img: HTMLImageElement,
  canvas: HTMLCanvasElement,
  opts: {
    glitchRgb: number; // 0..40
    scanlines: number; // 0..100
    neonGlow: number; // 0..100
    neonColorHex: string;
    liftTintHex: string;
    gainTintHex: string;
    gradeStrength: number; // 0..100
  },
  maxDim = 960
): void {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const src = new Uint8ClampedArray(imgData.data);
  const dst = imgData.data;

  const shiftPx = Math.round(opts.glitchRgb * 0.8);
  const [nr, ng, nb] = hexToRgb(opts.neonColorHex);
  const [lr, lg, lb] = hexToRgb(opts.liftTintHex);
  const [gr, gg, gb] = hexToRgb(opts.gainTintHex);
  const gradeMix = (opts.gradeStrength / 100) * 0.36;
  const neonMix = opts.neonGlow / 100;

  for (let y = 1; y < h - 1; y++) {
    // Periodic horizontal glitch slice tear
    const tearShift =
      opts.glitchRgb > 4 && (y % 47 < 4 || y % 89 < 3) ? Math.round(Math.sin(y) * shiftPx * 1.6) : 0;

    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      const rx = Math.max(0, Math.min(w - 1, x - shiftPx + tearShift));
      const bx = Math.max(0, Math.min(w - 1, x + shiftPx + tearShift));
      const gx = Math.max(0, Math.min(w - 1, x + tearShift));

      let r = src[(y * w + rx) * 4];
      let g = src[(y * w + gx) * 4 + 1];
      let b = src[(y * w + bx) * 4 + 2];

      // Lift/Gain color grading
      if (gradeMix > 0) {
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const tR = lr * (1 - lum) + gr * lum;
        const tG = lg * (1 - lum) + gg * lum;
        const tB = lb * (1 - lum) + gb * lum;
        r = r * (1 - gradeMix) + tR * gradeMix;
        g = g * (1 - gradeMix) + tG * gradeMix;
        b = b * (1 - gradeMix) + tB * gradeMix;
      }

      // Neon edge glow
      if (neonMix > 0.02) {
        const edge =
          Math.abs(src[(y * w + (x + 1)) * 4] - src[(y * w + (x - 1)) * 4]) +
          Math.abs(src[((y + 1) * w + x) * 4] - src[((y - 1) * w + x) * 4]);
        const glow = Math.min(1, edge / 95) * neonMix;
        r += nr * glow;
        g += ng * glow;
        b += nb * glow;
      }

      // CRT Scanlines
      if (opts.scanlines > 0 && y % 3 === 0) {
        const dim = 1 - (opts.scanlines / 100) * 0.45;
        r *= dim;
        g *= dim;
        b *= dim;
      }

      dst[idx] = clamp255(r);
      dst[idx + 1] = clamp255(g);
      dst[idx + 2] = clamp255(b);
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

// 6. Procedural Concept Artwork Synthesis (for AI Concept Art Generator)
export interface ConceptArtRecipe {
  title: string;
  description: string;
  pattern: 'aurora' | 'prism-waves' | 'neon-grid' | 'solar-eclipse' | 'crystal-mesh';
  bgHex: string;
  primaryHex: string;
  secondaryHex: string;
  highlightHex: string;
  angleDeg: number;
  complexity: number;
}

export function renderConceptArtCanvas(
  canvas: HTMLCanvasElement,
  recipe: ConceptArtRecipe,
  width = 1280,
  height = 720
): void {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = recipe.bgHex || '#060814';
  ctx.fillRect(0, 0, width, height);

  const count = Math.max(4, Math.min(14, recipe.complexity || 7));

  if (recipe.pattern === 'solar-eclipse') {
    const cx = width * 0.5;
    const cy = height * 0.48;
    const r = Math.min(width, height) * 0.28;
    const halo = ctx.createRadialGradient(cx, cy, r * 0.85, cx, cy, r * 2.2);
    halo.addColorStop(0, recipe.highlightHex);
    halo.addColorStop(0.4, recipe.primaryHex);
    halo.addColorStop(1, 'transparent');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, width, height);

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = recipe.bgHex;
    ctx.fill();
    ctx.strokeStyle = recipe.highlightHex;
    ctx.lineWidth = 4;
    ctx.stroke();
  } else if (recipe.pattern === 'neon-grid') {
    ctx.save();
    ctx.strokeStyle = recipe.primaryHex;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1.5;
    const horizon = height * 0.45;
    for (let i = -12; i <= 12; i++) {
      ctx.beginPath();
      ctx.moveTo(width / 2 + i * 28, horizon);
      ctx.lineTo(width / 2 + i * 160, height);
      ctx.stroke();
    }
    for (let y = horizon; y < height; y += 26) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();
    const glow = ctx.createRadialGradient(width / 2, horizon, 10, width / 2, horizon, width * 0.5);
    glow.addColorStop(0, recipe.highlightHex);
    glow.addColorStop(0.5, recipe.secondaryHex);
    glow.addColorStop(1, 'transparent');
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
  } else {
    // aurora / prism-waves / crystal-mesh
    for (let i = 0; i < count; i++) {
      const cx = width * ((i + 0.5) / count);
      const cy = height * (0.3 + Math.sin(i * 1.4 + recipe.angleDeg) * 0.25);
      const rad = Math.max(width, height) * (0.28 + (i % 3) * 0.12);
      const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, rad);
      const col = i % 3 === 0 ? recipe.primaryHex : i % 3 === 1 ? recipe.secondaryHex : recipe.highlightHex;
      grad.addColorStop(0, col);
      grad.addColorStop(1, 'transparent');
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }
  }
}

// 7. Local Pencil & Charcoal Sketch Shader (Sobel gradient + paper hatching)
export function applySketchEffect(
  img: HTMLImageElement,
  canvas: HTMLCanvasElement,
  style: 'pencil' | 'charcoal' | 'ink',
  edgeWeight: number, // 20..100
  contrast: number, // 0..60
  maxDim = 960
): void {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const src = new Uint8ClampedArray(imgData.data);
  const dst = imgData.data;

  const sens = 0.55 + (edgeWeight / 100) * 1.45;
  const con = 1 + contrast / 75;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      const lum = 0.299 * src[idx] + 0.587 * src[idx + 1] + 0.114 * src[idx + 2];
      const lL = 0.299 * src[(y * w + x - 1) * 4] + 0.587 * src[(y * w + x - 1) * 4 + 1] + 0.114 * src[(y * w + x - 1) * 4 + 2];
      const lR = 0.299 * src[(y * w + x + 1) * 4] + 0.587 * src[(y * w + x + 1) * 4 + 1] + 0.114 * src[(y * w + x + 1) * 4 + 2];
      const lU = 0.299 * src[((y - 1) * w + x) * 4] + 0.587 * src[((y - 1) * w + x) * 4 + 1] + 0.114 * src[((y - 1) * w + x) * 4 + 2];
      const lD = 0.299 * src[((y + 1) * w + x) * 4] + 0.587 * src[((y + 1) * w + x) * 4 + 1] + 0.114 * src[((y + 1) * w + x) * 4 + 2];
      const edge = (Math.abs(lR - lL) + Math.abs(lD - lU)) * sens;

      let shade: number;
      if (style === 'charcoal') {
        // Dark obsidian paper with luminous chalk strokes
        const hatch = ((x + y) % 5 === 0) ? 0.92 : 1;
        const val = (lum * 0.32 + edge * 1.15) * con * hatch;
        shade = clamp255(val);
        dst[idx] = clamp255(shade * 0.96);
        dst[idx + 1] = clamp255(shade * 0.94);
        dst[idx + 2] = clamp255(shade * 1.04);
      } else if (style === 'ink') {
        // High-contrast ink wash on warm ivory
        const val = 248 - edge * 2.1 - (lum < 95 ? (95 - lum) * 1.1 : 0);
        shade = clamp255((val - 128) * con + 128);
        dst[idx] = shade;
        dst[idx + 1] = clamp255(shade * 0.98);
        dst[idx + 2] = clamp255(shade * 0.93);
      } else {
        // Graphite pencil on textured paper
        const grain = ((((x * 374761393 + y * 668265263) >>> 0) % 100) / 100 - 0.5) * 14;
        const basePaper = 244 - (255 - lum) * 0.22 - edge * 1.45 + grain;
        shade = clamp255((basePaper - 128) * con + 128);
        dst[idx] = shade;
        dst[idx + 1] = shade;
        dst[idx + 2] = clamp255(shade * 0.97);
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

// 8. Local Watercolor Wash Effect (soft pigment spread + wet edge pooling + cold-press grain)
export function applyWatercolorEffect(
  img: HTMLImageElement,
  canvas: HTMLCanvasElement,
  pigmentSpread: number, // 1..6
  vibrance: number, // 0..60
  paperGrain: number, // 0..40
  maxDim = 900
): void {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  ctx.filter = `blur(${Math.max(1, pigmentSpread * 0.85).toFixed(1)}px) saturate(${(1 + vibrance / 100).toFixed(2)})`;
  ctx.drawImage(img, 0, 0, w, h);
  ctx.filter = 'none';

  const imgData = ctx.getImageData(0, 0, w, h);
  const src = new Uint8ClampedArray(imgData.data);
  const dst = imgData.data;
  const step = 28;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      // Soft quantized pigment wash
      let r = Math.round(src[idx] / step) * step * 0.38 + src[idx] * 0.62;
      let g = Math.round(src[idx + 1] / step) * step * 0.38 + src[idx + 1] * 0.62;
      let b = Math.round(src[idx + 2] / step) * step * 0.38 + src[idx + 2] * 0.62;

      // Subtle wet-edge pigment ring pooling
      const e =
        Math.abs(src[(y * w + x + 1) * 4] - src[(y * w + x - 1) * 4]) +
        Math.abs(src[((y + 1) * w + x) * 4] - src[((y - 1) * w + x) * 4]);
      const pool = Math.min(0.28, e / 180);
      r = r * (1 - pool) + 12;
      g = g * (1 - pool) + 10;
      b = b * (1 - pool) + 14;

      if (paperGrain > 0) {
        const tex = ((((x * 1597334677 ^ y * 3812015801) >>> 0) % 100) / 100 - 0.5) * (paperGrain * 0.7);
        r += tex;
        g += tex;
        b += tex;
      }

      dst[idx] = clamp255(r);
      dst[idx + 1] = clamp255(g);
      dst[idx + 2] = clamp255(b);
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

// 9. Local Oil Painting Shader (Intensity-binned brushstroke clustering)
export function applyOilPaintingEffect(
  img: HTMLImageElement,
  canvas: HTMLCanvasElement,
  brushRadius: number, // 2..6
  levels: number, // 8..24
  contrastBoost: number, // 0..40
  maxDim = 720
): void {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const src = new Uint8ClampedArray(imgData.data);
  const dst = imgData.data;

  const rRad = Math.max(2, Math.min(6, Math.round(brushRadius)));
  const bins = Math.max(6, Math.min(24, Math.round(levels)));
  const step = rRad >= 4 ? 2 : 1;
  const con = 1 + contrastBoost / 90;

  const countBin = new Int32Array(bins);
  const sumR = new Int32Array(bins);
  const sumG = new Int32Array(bins);
  const sumB = new Int32Array(bins);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      countBin.fill(0);
      sumR.fill(0);
      sumG.fill(0);
      sumB.fill(0);

      const y0 = Math.max(0, y - rRad);
      const y1 = Math.min(h - 1, y + rRad);
      const x0 = Math.max(0, x - rRad);
      const x1 = Math.min(w - 1, x + rRad);

      for (let ny = y0; ny <= y1; ny += step) {
        const rowOff = ny * w;
        for (let nx = x0; nx <= x1; nx += step) {
          const p = (rowOff + nx) * 4;
          const r = src[p];
          const g = src[p + 1];
          const b = src[p + 2];
          const intensity = Math.min(bins - 1, Math.floor((((r + g + b) / 3) * bins) / 256));
          countBin[intensity]++;
          sumR[intensity] += r;
          sumG[intensity] += g;
          sumB[intensity] += b;
        }
      }

      let maxCount = 0;
      let bestBin = 0;
      for (let i = 0; i < bins; i++) {
        if (countBin[i] > maxCount) {
          maxCount = countBin[i];
          bestBin = i;
        }
      }

      const idx = (y * w + x) * 4;
      const outR = (sumR[bestBin] / Math.max(1, maxCount) - 128) * con + 128;
      const outG = (sumG[bestBin] / Math.max(1, maxCount) - 128) * con + 128;
      const outB = (sumB[bestBin] / Math.max(1, maxCount) - 128) * con + 128;

      dst[idx] = clamp255(outR);
      dst[idx + 1] = clamp255(outG);
      dst[idx + 2] = clamp255(outB);
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

// 10. Local Double Exposure Compositor
export function applyDoubleExposureEffect(
  primaryImg: HTMLImageElement,
  secondaryImg: HTMLImageElement | null,
  canvas: HTMLCanvasElement,
  blendMode: 'screen' | 'lighten' | 'overlay',
  secondaryOpacity: number, // 10..100
  silhouetteContrast: number, // 0..60
  tintHex: string,
  maxDim = 960
): void {
  const scale = Math.min(1, maxDim / Math.max(primaryImg.naturalWidth, primaryImg.naturalHeight));
  const w = Math.max(1, Math.round(primaryImg.naturalWidth * scale));
  const h = Math.max(1, Math.round(primaryImg.naturalHeight * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.save();
  ctx.filter = `contrast(${(1 + silhouetteContrast / 70).toFixed(2)}) saturate(0.72)`;
  ctx.drawImage(primaryImg, 0, 0, w, h);
  ctx.restore();

  if (secondaryImg && secondaryImg.naturalWidth > 0) {
    const s = Math.max(w / secondaryImg.naturalWidth, h / secondaryImg.naturalHeight);
    const dw = secondaryImg.naturalWidth * s;
    const dh = secondaryImg.naturalHeight * s;
    ctx.save();
    ctx.globalCompositeOperation = blendMode;
    ctx.globalAlpha = Math.max(0.1, Math.min(1, secondaryOpacity / 100));
    ctx.drawImage(secondaryImg, (w - dw) / 2, (h - dh) / 2, dw, dh);
    ctx.restore();
  }

  // Editorial color wash
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = tintHex || '#7C3AED';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// 11. Local Portrait Artistic Effects
export function applyPortraitArtEffect(
  img: HTMLImageElement,
  canvas: HTMLCanvasElement,
  preset: 'gold-halo' | 'velvet-noir' | 'neon-rim' | 'pop-art' | 'soft-dream',
  intensity: number, // 10..100
  maxDim = 960
): void {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const strength = Math.max(0.1, Math.min(1, intensity / 100));

  if (preset === 'pop-art') {
    applyCartoonShader(img, canvas, 4, Math.round(75 * strength), Math.round(55 * strength), maxDim, false);
    return;
  }

  if (preset === 'velvet-noir') {
    ctx.filter = `grayscale(1) contrast(${(1 + 0.55 * strength).toFixed(2)}) brightness(${(1 + 0.04 * strength).toFixed(2)})`;
    ctx.drawImage(img, 0, 0, w, h);
    ctx.filter = 'none';
    const vig = ctx.createRadialGradient(w * 0.5, h * 0.44, w * 0.18, w * 0.5, h * 0.5, Math.hypot(w, h) * 0.62);
    vig.addColorStop(0, 'rgba(255,255,255,0.08)');
    vig.addColorStop(1, `rgba(4,5,10,${0.72 * strength})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
    return;
  }

  if (preset === 'neon-rim') {
    applyCinemaGlitchAndNeon(
      img,
      canvas,
      {
        glitchRgb: Math.round(3 * strength),
        scanlines: 0,
        neonGlow: Math.round(68 * strength),
        neonColorHex: '#A855F7',
        liftTintHex: '#1E1B4B',
        gainTintHex: '#38BDF8',
        gradeStrength: Math.round(65 * strength),
      },
      maxDim
    );
    return;
  }

  // gold-halo or soft-dream
  ctx.drawImage(img, 0, 0, w, h);
  const bloom = document.createElement('canvas');
  bloom.width = Math.max(1, Math.round(w / 4));
  bloom.height = Math.max(1, Math.round(h / 4));
  const bCtx = bloom.getContext('2d');
  if (bCtx) {
    bCtx.filter = 'blur(12px) brightness(1.18)';
    bCtx.drawImage(img, 0, 0, bloom.width, bloom.height);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.42 * strength;
    ctx.drawImage(bloom, 0, 0, w, h);
    ctx.restore();
  }

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const halo = ctx.createRadialGradient(w * 0.5, h * 0.36, w * 0.05, w * 0.5, h * 0.45, Math.max(w, h) * 0.65);
  if (preset === 'gold-halo') {
    halo.addColorStop(0, `rgba(251, 191, 36, ${0.38 * strength})`);
    halo.addColorStop(0.55, `rgba(212, 175, 55, ${0.14 * strength})`);
  } else {
    halo.addColorStop(0, `rgba(192, 132, 252, ${0.36 * strength})`);
    halo.addColorStop(0.55, `rgba(56, 189, 248, ${0.15 * strength})`);
  }
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// 12. Avatar Design Workspace Renderer
export function renderAvatarCanvas(
  img: HTMLImageElement,
  canvas: HTMLCanvasElement,
  opts: {
    shape: 'circle' | 'rounded' | 'hex' | 'diamond';
    frameStyle: 'gold-ring' | 'purple-neon' | 'double-halo' | 'none';
    bgMode: 'transparent' | 'obsidian' | 'purple-gold';
    zoom: number; // 1.0..2.4
    offsetX: number; // -0.5..0.5
    offsetY: number; // -0.5..0.5
    badgeText: string;
    ringColor: string;
  },
  size = 1024
): void {
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, size, size);

  if (opts.bgMode === 'obsidian') {
    ctx.fillStyle = '#06070B';
    ctx.fillRect(0, 0, size, size);
  } else if (opts.bgMode === 'purple-gold') {
    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, '#2E1065');
    g.addColorStop(0.6, '#090B14');
    g.addColorStop(1, '#452C08');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }

  const cx = size / 2;
  const cy = size / 2;
  const rad = size * 0.42;

  const traceShapePath = (r: number) => {
    ctx.beginPath();
    if (opts.shape === 'circle') {
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
    } else if (opts.shape === 'rounded') {
      ctx.roundRect(cx - r, cy - r, r * 2, r * 2, r * 0.42);
    } else if (opts.shape === 'hex') {
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 - Math.PI / 6;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else {
      ctx.moveTo(cx, cy - r * 1.06);
      ctx.lineTo(cx + r * 1.06, cy);
      ctx.lineTo(cx, cy + r * 1.06);
      ctx.lineTo(cx - r * 1.06, cy);
      ctx.closePath();
    }
  };

  ctx.save();
  traceShapePath(rad);
  ctx.clip();

  const coverScale = Math.max((rad * 2) / img.naturalWidth, (rad * 2) / img.naturalHeight) * (opts.zoom || 1);
  const dw = img.naturalWidth * coverScale;
  const dh = img.naturalHeight * coverScale;
  ctx.drawImage(
    img,
    cx - dw / 2 + opts.offsetX * rad,
    cy - dh / 2 + opts.offsetY * rad,
    dw,
    dh
  );
  ctx.restore();

  // Avatar frame ring
  if (opts.frameStyle !== 'none') {
    ctx.save();
    if (opts.frameStyle === 'gold-ring') {
      const g = ctx.createLinearGradient(0, 0, size, size);
      g.addColorStop(0, '#FDE047');
      g.addColorStop(0.5, '#D4AF37');
      g.addColorStop(1, '#92400E');
      ctx.strokeStyle = g;
      ctx.lineWidth = size * 0.022;
      traceShapePath(rad);
      ctx.stroke();
    } else if (opts.frameStyle === 'purple-neon') {
      ctx.shadowColor = '#A855F7';
      ctx.shadowBlur = size * 0.038;
      ctx.strokeStyle = '#C084FC';
      ctx.lineWidth = size * 0.02;
      traceShapePath(rad);
      ctx.stroke();
    } else if (opts.frameStyle === 'double-halo') {
      ctx.strokeStyle = opts.ringColor || '#D4AF37';
      ctx.lineWidth = size * 0.016;
      traceShapePath(rad);
      ctx.stroke();
      ctx.strokeStyle = '#A855F7';
      ctx.lineWidth = size * 0.008;
      traceShapePath(rad * 1.06);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Optional bottom avatar badge ribbon
  if (opts.badgeText.trim()) {
    ctx.save();
    const bw = size * 0.48;
    const bh = size * 0.085;
    const by = cy + rad * 0.86;
    ctx.fillStyle = '#0B1020';
    ctx.strokeStyle = opts.frameStyle === 'purple-neon' ? '#C084FC' : '#D4AF37';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(cx - bw / 2, by - bh / 2, bw, bh, bh / 2);
    ctx.fill();
    ctx.stroke();

    ctx.font = `700 ${Math.round(size * 0.036)}px 'Syne', sans-serif`;
    ctx.fillStyle = '#FDE047';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(opts.badgeText.trim().toUpperCase(), cx, by);
    ctx.restore();
  }
}

