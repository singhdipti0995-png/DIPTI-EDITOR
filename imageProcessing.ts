import type { FilterAdjustments, FilterPresetId, SceneBlueprint } from '../types/editor';

export interface PresetDefinition {
  id: FilterPresetId;
  name: string;
  subtitle: string;
  swatch: [string, string];
  values: Partial<FilterAdjustments>;
}

export const CINEMATIC_PRESETS: PresetDefinition[] = [
  {
    id: 'original',
    name: 'Natural',
    subtitle: 'True neutral RAW',
    swatch: ['#1e293b', '#475569'],
    values: { exposure: 0, contrast: 0, saturation: 0, temperature: 0, vignette: 0 },
  },
  {
    id: 'gold-noir',
    name: 'Gold Noir',
    subtitle: 'Warm amber highlights',
    swatch: ['#d4af37', '#0f172a'],
    values: { exposure: 6, contrast: 24, saturation: -14, temperature: 26, vignette: 32 },
  },
  {
    id: 'midnight-velvet',
    name: 'Midnight',
    subtitle: 'Deep navy shadows',
    swatch: ['#1d4ed8', '#020617'],
    values: { exposure: -4, contrast: 20, saturation: -8, temperature: -20, vignette: 38 },
  },
  {
    id: 'electric-sapphire',
    name: 'Sapphire',
    subtitle: 'Crisp blue cinema',
    swatch: ['#3b82f6', '#0f172a'],
    values: { exposure: 4, contrast: 18, saturation: 18, temperature: -24, vignette: 18 },
  },
  {
    id: 'amethyst-haze',
    name: 'Amethyst',
    subtitle: 'Royal violet dusk',
    swatch: ['#8b5cf6', '#1e1b4b'],
    values: { exposure: 5, contrast: 14, saturation: 12, temperature: -6, vignette: 24 },
  },
  {
    id: 'film-matte',
    name: 'Film Matte',
    subtitle: 'Lifted shadow fade',
    swatch: ['#b45309', '#1c1917'],
    values: { exposure: 8, contrast: -12, saturation: -18, temperature: 16, vignette: 22 },
  },
  {
    id: 'silver-mono',
    name: 'Silver Lux',
    subtitle: 'Leica monochrome',
    swatch: ['#e2e8f0', '#09090b'],
    values: { exposure: 4, contrast: 32, saturation: -100, temperature: 0, vignette: 30 },
  },
];

function clamp255(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : n;
}

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image asset.'));
    img.src = src;
  });
}

export function applyFilterAndEffects(
  source: ImageData,
  adj: FilterAdjustments
): ImageData {
  const { width, height, data } = source;
  const out = new Uint8ClampedArray(data.length);

  const exposureMul = Math.pow(2, adj.exposure / 55);
  const contrastFactor = Math.pow((100 + adj.contrast) / 100, 1.35);
  const satFactor = (100 + adj.saturation) / 100;
  const tempShift = adj.temperature * 0.72;
  const halfW = width * 0.5;
  const halfH = height * 0.5;
  const maxDistSq = halfW * halfW + halfH * halfH;
  const vigStrength = adj.vignette / 100;
  const grainStrength = adj.grain * 0.75;

  const isAmethyst = adj.preset === 'amethyst-haze';
  const isMatte = adj.preset === 'film-matte';

  for (let y = 0; y < height; y++) {
    const dy = y - halfH;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      let r = data[idx];
      let g = data[idx + 1];
      let b = data[idx + 2];
      const a = data[idx + 3];

      if (a === 0) {
        out[idx + 3] = 0;
        continue;
      }

      // Exposure
      r *= exposureMul;
      g *= exposureMul;
      b *= exposureMul;

      // Color temperature
      r += tempShift;
      b -= tempShift * 0.9;

      // Preset split toning
      if (isAmethyst) {
        r += 7;
        b += 14;
      } else if (isMatte) {
        r = r * 0.92 + 16;
        g = g * 0.92 + 14;
        b = b * 0.92 + 13;
      }

      // Contrast around 128
      r = (r - 128) * contrastFactor + 128;
      g = (g - 128) * contrastFactor + 128;
      b = (b - 128) * contrastFactor + 128;

      // Saturation
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = lum + (r - lum) * satFactor;
      g = lum + (g - lum) * satFactor;
      b = lum + (b - lum) * satFactor;

      // Vignette
      if (vigStrength > 0.01) {
        const dx = x - halfW;
        const distNorm = (dx * dx + dy * dy) / maxDistSq;
        const falloff = Math.max(0.2, 1 - distNorm * vigStrength * 0.95);
        r *= falloff;
        g *= falloff;
        b *= falloff;
      }

      // Film grain
      if (grainStrength > 0.5) {
        const hash = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        const noise = ((hash - Math.floor(hash)) - 0.5) * grainStrength;
        r += noise;
        g += noise;
        b += noise;
      }

      out[idx] = clamp255(r);
      out[idx + 1] = clamp255(g);
      out[idx + 2] = clamp255(b);
      out[idx + 3] = a;
    }
  }

  // Optional 3x3 unsharp-mask sharpen pass
  if (adj.sharpen > 2) {
    const amt = (adj.sharpen / 100) * 1.1;
    const copy = new Uint8ClampedArray(out);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        if (copy[idx + 3] === 0) continue;
        const up = ((y - 1) * width + x) * 4;
        const dn = ((y + 1) * width + x) * 4;
        const lf = (y * width + (x - 1)) * 4;
        const rt = (y * width + (x + 1)) * 4;
        for (let c = 0; c < 3; c++) {
          const blur = (copy[up + c] + copy[dn + c] + copy[lf + c] + copy[rt + c]) * 0.25;
          out[idx + c] = clamp255(copy[idx + c] + (copy[idx + c] - blur) * amt);
        }
      }
    }
  }

  return new ImageData(out, width, height);
}

// Compute auto-levels histogram stretch + clarity parameters for AI Enhance
export function computeAutoEnhanceAdjustments(source: ImageData): FilterAdjustments {
  const hist = new Uint32Array(256);
  const { data } = source;
  let totalPixels = 0;
  let sumSat = 0;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 20) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = Math.min(255, Math.max(0, Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)));
    hist[lum]++;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    sumSat += mx === 0 ? 0 : (mx - mn) / mx;
    totalPixels++;
  }

  if (totalPixels === 0) {
    return {
      exposure: 8,
      contrast: 18,
      saturation: 14,
      temperature: 4,
      vignette: 10,
      sharpen: 24,
      grain: 0,
      preset: 'original',
    };
  }

  let acc = 0;
  let p2 = 0;
  let p98 = 255;
  const lowThresh = totalPixels * 0.02;
  const highThresh = totalPixels * 0.98;

  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= lowThresh && p2 === 0) p2 = i;
    if (acc >= highThresh) {
      p98 = i;
      break;
    }
  }

  const avgSat = sumSat / totalPixels;
  const midPoint = (p2 + p98) * 0.5;
  const exposure = Math.round(Math.max(-18, Math.min(22, (128 - midPoint) * 0.32)));
  const dynamicSpan = Math.max(40, p98 - p2);
  const contrast = Math.round(Math.max(10, Math.min(34, (240 / dynamicSpan) * 14)));
  const saturation = avgSat < 0.35 ? 20 : 10;

  return {
    exposure,
    contrast,
    saturation,
    temperature: 5,
    vignette: 12,
    sharpen: 28,
    grain: 0,
    preset: 'original',
  };
}

// Smart background removal: corner-seeded chroma/luminance distance + feathered alpha mask
export function removeBackgroundChroma(
  source: ImageData,
  targetRgb: [number, number, number] | null,
  tolerance: number, // 10..110
  feather: number // 0..40
): ImageData {
  const { width, height, data } = source;
  const out = new Uint8ClampedArray(data);

  let refR = 0;
  let refG = 0;
  let refB = 0;

  if (targetRgb) {
    [refR, refG, refB] = targetRgb;
  } else {
    // Sample 4 outer corners to estimate studio backdrop color
    const sampleCoords = [
      [2, 2],
      [width - 3, 2],
      [2, height - 3],
      [width - 3, height - 3],
      [Math.floor(width / 2), 2],
    ];
    let count = 0;
    for (const [sx, sy] of sampleCoords) {
      const cx = Math.max(0, Math.min(width - 1, sx));
      const cy = Math.max(0, Math.min(height - 1, sy));
      const i = (cy * width + cx) * 4;
      refR += data[i];
      refG += data[i + 1];
      refB += data[i + 2];
      count++;
    }
    refR /= count;
    refG /= count;
    refB /= count;
  }

  const hardDist = tolerance * 2.1;
  const softDist = hardDist + Math.max(8, feather * 1.9);

  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - refR;
    const dg = data[i + 1] - refG;
    const db = data[i + 2] - refB;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);

    if (dist <= hardDist) {
      out[i + 3] = 0;
    } else if (dist < softDist) {
      const ratio = (dist - hardDist) / (softDist - hardDist);
      out[i + 3] = Math.round(data[i + 3] * ratio * ratio);
    }
  }

  return new ImageData(out, width, height);
}

// Multi-pass spiral neighbor inpainting for Object Remover mask
export function inpaintMaskedRegion(
  source: ImageData,
  mask: Uint8Array // 1 = masked pixel to remove, 0 = keep
): ImageData {
  const { width, height, data } = source;
  const work = new Uint8ClampedArray(data);
  const filled = new Uint8Array(width * height);

  for (let p = 0; p < filled.length; p++) {
    filled[p] = mask[p] === 1 ? 0 : 1;
  }

  const offsets = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
    [-2, 0],
    [2, 0],
    [0, -2],
    [0, 2],
  ];

  // Iteratively erode inward from mask boundary using valid surrounding texture
  for (let pass = 0; pass < 42; pass++) {
    let remaining = 0;
    const nextFilled: number[] = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        if (filled[p] === 1) continue;
        remaining++;

        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let wSum = 0;

        for (let o = 0; o < offsets.length; o++) {
          const nx = x + offsets[o][0];
          const ny = y + offsets[o][1];
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const np = ny * width + nx;
          if (filled[np] === 1) {
            const weight = o < 4 ? 1.5 : o < 8 ? 1.0 : 0.6;
            const nIdx = np * 4;
            rSum += work[nIdx] * weight;
            gSum += work[nIdx + 1] * weight;
            bSum += work[nIdx + 2] * weight;
            wSum += weight;
          }
        }

        if (wSum > 0) {
          const idx = p * 4;
          // Slight subtle micro-grain prevents flat plastic banding
          const jitter = ((Math.sin(x * 19.7 + y * 31.3) * 43758.5) % 1) * 4 - 2;
          work[idx] = clamp255(rSum / wSum + jitter);
          work[idx + 1] = clamp255(gSum / wSum + jitter);
          work[idx + 2] = clamp255(bSum / wSum + jitter);
          work[idx + 3] = 255;
          nextFilled.push(p);
        }
      }
    }

    for (const p of nextFilled) {
      filled[p] = 1;
    }
    if (remaining === 0 || nextFilled.length === 0) break;
  }

  return new ImageData(work, width, height);
}

export type AiStyleId =
  | 'duotone-gold'
  | 'prism-split'
  | 'anamorphic-bloom'
  | 'oil-impasto'
  | 'infrared-sapphire';

export function applyAiArtisticEffect(
  source: ImageData,
  style: AiStyleId,
  intensity: number // 0..100
): ImageData {
  const { width, height, data } = source;
  const out = new Uint8ClampedArray(data.length);
  const blend = intensity / 100;

  if (style === 'prism-split') {
    const shift = Math.max(2, Math.round((intensity / 100) * 14));
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const rIdx = (y * width + Math.min(width - 1, x + shift)) * 4;
        const bIdx = (y * width + Math.max(0, x - shift)) * 4;
        out[idx] = clamp255(data[idx] * (1 - blend) + data[rIdx] * blend);
        out[idx + 1] = data[idx + 1];
        out[idx + 2] = clamp255(data[idx + 2] * (1 - blend) + data[bIdx + 2] * blend);
        out[idx + 3] = data[idx + 3];
      }
    }
    return new ImageData(out, width, height);
  }

  if (style === 'oil-impasto') {
    const radius = Math.max(1, Math.round(1 + (intensity / 100) * 3));
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        // Quantized directional sample for painterly brushstrokes
        const qx = Math.min(width - 1, Math.max(0, x - (x % radius)));
        const qy = Math.min(height - 1, Math.max(0, y - (y % radius)));
        const qIdx = (qy * width + qx) * 4;
        const r = Math.round((data[qIdx] / 24)) * 24;
        const g = Math.round((data[qIdx + 1] / 24)) * 24;
        const b = Math.round((data[qIdx + 2] / 24)) * 24;
        out[idx] = clamp255(data[idx] * (1 - blend) + r * blend);
        out[idx + 1] = clamp255(data[idx + 1] * (1 - blend) + g * blend);
        out[idx + 2] = clamp255(data[idx + 2] * (1 - blend) + b * blend);
        out[idx + 3] = data[idx + 3];
      }
    }
    return new ImageData(out, width, height);
  }

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

    let tr = r;
    let tg = g;
    let tb = b;

    if (style === 'duotone-gold') {
      // Deep midnight shadow -> Champagne gold highlight
      tr = 8 + lum * 238;
      tg = 12 + lum * 188;
      tb = 32 + lum * 62;
    } else if (style === 'anamorphic-bloom') {
      const glow = lum > 0.65 ? (lum - 0.65) * 2.4 : 0;
      tr = r + glow * 110;
      tg = g + glow * 85;
      tb = b + glow * 145;
    } else if (style === 'infrared-sapphire') {
      tr = b * 0.45 + lum * 95;
      tg = g * 0.65 + lum * 40;
      tb = Math.min(255, r * 1.15 + 45);
    }

    out[i] = clamp255(r * (1 - blend) + tr * blend);
    out[i + 1] = clamp255(g * (1 - blend) + tg * blend);
    out[i + 2] = clamp255(b * (1 - blend) + tb * blend);
    out[i + 3] = data[i + 3];
  }

  return new ImageData(out, width, height);
}

export function deriveLocalSceneBlueprint(prompt: string): SceneBlueprint {
  const lower = prompt.toLowerCase();
  const motif: SceneBlueprint['motif'] =
    lower.includes('mountain') || lower.includes('alpine') || lower.includes('peak')
      ? 'alpine'
      : lower.includes('city') || lower.includes('skyline') || lower.includes('tower')
      ? 'cityscape'
      : lower.includes('ocean') || lower.includes('sea') || lower.includes('water')
      ? 'ocean'
      : lower.includes('space') || lower.includes('galaxy') || lower.includes('star')
      ? 'cosmos'
      : 'prism';

  const warm = lower.includes('gold') || lower.includes('sunset') || lower.includes('amber');
  const violet = lower.includes('purple') || lower.includes('amethyst') || lower.includes('violet');

  return {
    motif,
    skyTopHex: '#03050d',
    skyMidHex: violet ? '#1b1140' : '#0a1638',
    groundHex: '#050814',
    accentHex: warm ? '#e5b84b' : '#60a5fa',
    secondaryAccentHex: violet ? '#a855f7' : '#d4af37',
    lightAngleDeg: 34,
    particleDensity: 55,
    caption: prompt.trim().slice(0, 48),
  };
}

export function synthesizeGenerativeArtwork(
  canvas: HTMLCanvasElement,
  blueprint: SceneBlueprint,
  seedInput: number
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  let seed = Math.abs(seedInput) + 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Sky / Backdrop gradient
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, blueprint.skyTopHex);
  bg.addColorStop(0.58, blueprint.skyMidHex);
  bg.addColorStop(1, blueprint.groundHex);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Atmospheric radial aura
  const cx = w * (0.35 + rand() * 0.3);
  const cy = h * (0.34 + rand() * 0.18);
  const aura = ctx.createRadialGradient(cx, cy, 10, cx, cy, w * 0.55);
  aura.addColorStop(0, `${blueprint.accentHex}66`);
  aura.addColorStop(0.45, `${blueprint.secondaryAccentHex}2a`);
  aura.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = aura;
  ctx.fillRect(0, 0, w, h);

  // Atmospheric star / bokeh particles
  const count = Math.round(25 + blueprint.particleDensity * 0.9);
  for (let i = 0; i < count; i++) {
    const px = rand() * w;
    const py = rand() * h * 0.72;
    const rad = rand() * 2.4 + 0.6;
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fillStyle = i % 3 === 0 ? `${blueprint.accentHex}aa` : 'rgba(248, 250, 252, 0.48)';
    ctx.fill();
  }

  // Motif Geometry
  const horizonY = h * 0.64;
  if (blueprint.motif === 'alpine') {
    for (let layer = 0; layer < 3; layer++) {
      const baseY = horizonY + layer * 42;
      ctx.beginPath();
      ctx.moveTo(0, h);
      const steps = 10;
      for (let s = 0; s <= steps; s++) {
        const px = (w / steps) * s;
        const peak = Math.sin(s * 1.4 + layer * 2.1 + seedInput) * (95 - layer * 22);
        ctx.lineTo(px, baseY - Math.abs(peak));
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = layer === 0 ? '#111834' : layer === 1 ? '#090e22' : '#03050c';
      ctx.fill();
      if (layer === 0) {
        ctx.strokeStyle = `${blueprint.accentHex}66`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  } else if (blueprint.motif === 'cityscape') {
    const bCount = 22;
    const bw = w / bCount;
    for (let i = 0; i < bCount; i++) {
      const bh = 90 + rand() * (h * 0.42);
      const bx = i * bw;
      const by = horizonY + 80 - bh;
      ctx.fillStyle = i % 2 === 0 ? '#070b1a' : '#0b1228';
      ctx.fillRect(bx + 2, by, bw - 4, bh + 160);
      ctx.fillStyle = `${blueprint.accentHex}88`;
      for (let wy = by + 16; wy < horizonY + 50; wy += 18) {
        if (rand() > 0.45) {
          ctx.fillRect(bx + 8, wy, bw * 0.28, 3);
        }
      }
    }
  } else if (blueprint.motif === 'ocean') {
    // Luminous moon / sun disc
    ctx.beginPath();
    ctx.arc(cx, horizonY - 40, 74, 0, Math.PI * 2);
    ctx.fillStyle = `${blueprint.accentHex}cc`;
    ctx.fill();
    // Mirror reflection bars
    for (let row = 0; row < 28; row++) {
      const y = horizonY + row * 9;
      const widthBar = Math.max(12, 180 - row * 4 + (rand() - 0.5) * 40);
      ctx.fillStyle = `${blueprint.accentHex}${row < 10 ? '88' : '44'}`;
      ctx.fillRect(cx - widthBar / 2, y, widthBar, 3);
    }
  } else if (blueprint.motif === 'cosmos') {
    // Celestial planet + orbital ring
    ctx.save();
    ctx.translate(w * 0.5, h * 0.46);
    const pGrad = ctx.createRadialGradient(-30, -30, 12, 0, 0, 125);
    pGrad.addColorStop(0, blueprint.accentHex);
    pGrad.addColorStop(0.6, blueprint.secondaryAccentHex);
    pGrad.addColorStop(1, '#040610');
    ctx.beginPath();
    ctx.arc(0, 0, 120, 0, Math.PI * 2);
    ctx.fillStyle = pGrad;
    ctx.fill();

    ctx.rotate(-0.28);
    ctx.beginPath();
    ctx.ellipse(0, 0, 230, 42, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `${blueprint.accentHex}aa`;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
  } else {
    // Signature sculptural glass prism + light refraction beams
    const px = w * 0.42;
    const py = h * 0.66;
    const size = Math.min(w, h) * 0.34;

    const beamGrad = ctx.createLinearGradient(px, py - size * 0.5, w, py - size * 0.8);
    beamGrad.addColorStop(0, `${blueprint.accentHex}cc`);
    beamGrad.addColorStop(0.5, `${blueprint.secondaryAccentHex}88`);
    beamGrad.addColorStop(1, 'rgba(59,130,246,0.15)');

    ctx.beginPath();
    ctx.moveTo(px + 20, py - size * 0.55);
    ctx.lineTo(w, py - size * 1.1);
    ctx.lineTo(w, py - size * 0.35);
    ctx.closePath();
    ctx.fillStyle = beamGrad;
    ctx.fill();

    // Obsidian triangle
    ctx.beginPath();
    ctx.moveTo(px, py - size);
    ctx.lineTo(px + size * 0.72, py);
    ctx.lineTo(px - size * 0.72, py);
    ctx.closePath();
    const triGrad = ctx.createLinearGradient(px - size * 0.6, py - size, px + size * 0.6, py);
    triGrad.addColorStop(0, '#1e293b');
    triGrad.addColorStop(0.5, '#090e1c');
    triGrad.addColorStop(1, '#02040a');
    ctx.fillStyle = triGrad;
    ctx.fill();
    ctx.strokeStyle = `${blueprint.accentHex}aa`;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // Subtle floor reflection sheen
  const floorGrad = ctx.createLinearGradient(0, h * 0.72, 0, h);
  floorGrad.addColorStop(0, 'rgba(3,5,12,0)');
  floorGrad.addColorStop(1, 'rgba(2,4,10,0.92)');
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, h * 0.72, w, h * 0.28);
}
