import { DEFAULT_ADJUSTMENTS, PhotoAdjustments } from '../types/editor';
import {
  CompatibleVideoColorGrade,
  LibraryPresetItem,
  PresetCategory,
} from '../types/presetLibrary';

export const PRESET_LIBRARY_CATEGORIES: PresetCategory[] = [
  'Cinematic',
  'Portrait',
  'Nature',
  'Vintage',
  'Moody',
  'Black & White',
  'Gold',
  'Purple',
  'Travel',
  'Social Media',
];

type PresetSeed = Omit<LibraryPresetItem, 'isBuiltIn' | 'isFavorite' | 'createdAt' | 'updatedAt'>;

const SEEDS: PresetSeed[] = [
  // 1. Cinematic (5)
  {
    id: 'lib-cin-anamorphic',
    name: 'Anamorphic Teal & Amber',
    category: 'Cinematic',
    description: 'Theatrical teal shadow split with rich warm highlights',
    accentColor: '#2DD4BF',
    adjustments: { contrast: 24, highlights: -14, shadows: 8, temperature: 10, tint: -14, saturation: 12, blueShift: 10, redShift: 8, hdr: 24, vignette: 32 },
  },
  {
    id: 'lib-cin-blockbuster',
    name: 'Blockbuster 70mm',
    category: 'Cinematic',
    description: 'Punchy theatrical dynamic range with crisp edge contrast',
    accentColor: '#F97316',
    adjustments: { contrast: 26, highlights: -16, shadows: 14, temperature: 14, tint: -6, hdr: 44, colorPop: 28, sharpness: 22, vignette: 28 },
  },
  {
    id: 'lib-cin-hollywood',
    name: 'Hollywood Premiers',
    category: 'Cinematic',
    description: 'Rolled film highlights, deep contrast and studio polish',
    accentColor: '#F59E0B',
    adjustments: { exposure: 4, contrast: 24, highlights: -20, shadows: 12, temperature: 8, saturation: 8, grain: 12, vignette: 34, sharpness: 18 },
  },
  {
    id: 'lib-cin-tokyo-rain',
    name: 'Neon Rain Cinema',
    category: 'Cinematic',
    description: 'Cool cobalt street shadows with glowing speculars',
    accentColor: '#38BDF8',
    adjustments: { exposure: -4, contrast: 26, temperature: -20, tint: -6, saturation: 18, colorPop: 32, highlights: -16, bloom: 20, vignette: 30 },
  },
  {
    id: 'lib-cin-silver-screen',
    name: 'Silver Screen Scope',
    category: 'Cinematic',
    description: 'Clean neutral cinema curve for architectural & narrative scenes',
    accentColor: '#CBD5E1',
    adjustments: { contrast: 20, highlights: -12, shadows: 10, saturation: -10, sharpness: 24, vignette: 24, hdr: 20 },
  },

  // 2. Portrait (4)
  {
    id: 'lib-por-velvet-skin',
    name: 'Velvet Skin Studio',
    category: 'Portrait',
    description: 'Flattering warm skin tones with soft shadow lift',
    accentColor: '#FDA4AF',
    adjustments: { brightness: 6, exposure: 4, contrast: 8, shadows: 16, temperature: 10, tint: 8, saturation: 6, bloom: 14 },
  },
  {
    id: 'lib-por-golden-portrait',
    name: 'Golden Hour Portrait',
    category: 'Portrait',
    description: 'Luminous sunset rim warmth and smooth facial midtones',
    accentColor: '#FBBF24',
    adjustments: { exposure: 8, contrast: 10, highlights: -10, shadows: 14, temperature: 24, tint: 6, saturation: 14, bloom: 18, vignette: 18 },
  },
  {
    id: 'lib-por-editorial-crisp',
    name: 'Editorial Magazine',
    category: 'Portrait',
    description: 'High-clarity studio fashion portrait crispness',
    accentColor: '#E2E8F0',
    adjustments: { brightness: 4, contrast: 20, highlights: -8, shadows: 10, hdr: 24, sharpness: 28, saturation: -6, vignette: 22 },
  },
  {
    id: 'lib-por-pastel-silk',
    name: 'Pastel Soft Light',
    category: 'Portrait',
    description: 'Airy lifted shadows and gentle pastel complexion',
    accentColor: '#F9A8D4',
    adjustments: { brightness: 12, contrast: -8, shadows: 22, saturation: -14, tint: 10, bloom: 18 },
  },

  // 3. Nature (4)
  {
    id: 'lib-nat-emerald',
    name: 'Emerald Canopy',
    category: 'Nature',
    description: 'Deep botanical greens with balanced sky highlights',
    accentColor: '#10B981',
    adjustments: { contrast: 16, highlights: -14, shadows: 12, greenShift: 12, saturation: 18, colorPop: 24, hdr: 26, sharpness: 20 },
  },
  {
    id: 'lib-nat-alpine-mist',
    name: 'Alpine Morning Mist',
    category: 'Nature',
    description: 'Crisp mountain blues with serene shadow detail',
    accentColor: '#7DD3FC',
    adjustments: { exposure: 6, contrast: 12, temperature: -16, shadows: 16, blueShift: 8, sharpness: 22, bloom: 12 },
  },
  {
    id: 'lib-nat-desert-canyon',
    name: 'Desert Sandstone',
    category: 'Nature',
    description: 'Warm terracotta earth tones with rich rock texture',
    accentColor: '#EA580C',
    adjustments: { contrast: 18, temperature: 22, redShift: 10, hdr: 34, sharpness: 26, saturation: 14, vignette: 20 },
  },
  {
    id: 'lib-nat-ocean-horizon',
    name: 'Pacific Coastline',
    category: 'Nature',
    description: 'Vibrant marine blues and clean horizon clarity',
    accentColor: '#06B6D4',
    adjustments: { contrast: 16, highlights: -16, temperature: -10, tint: -8, saturation: 20, colorPop: 30, sharpness: 18 },
  },

  // 4. Vintage (4)
  {
    id: 'lib-vin-kodak-warm',
    name: 'Kodak Portra Warmth',
    category: 'Vintage',
    description: 'Warm analog emulsion with delicate grain texture',
    accentColor: '#D97706',
    adjustments: { contrast: 10, shadows: 14, temperature: 24, tint: 6, sepia: 16, grain: 22, vignette: 20 },
  },
  {
    id: 'lib-vin-polaroid-77',
    name: 'Polaroid 77 Fade',
    category: 'Vintage',
    description: 'Instant print cream highlights and green-amber tint',
    accentColor: '#FCD34D',
    adjustments: { brightness: 6, contrast: -10, shadows: 22, temperature: 18, tint: -10, sepia: 18, grain: 20 },
  },
  {
    id: 'lib-vin-super8-sepia',
    name: 'Super 8mm Archive',
    category: 'Vintage',
    description: 'Warm archival sepia wash with analog vignette',
    accentColor: '#B45309',
    adjustments: { sepia: 76, contrast: 14, shadows: 8, grain: 24, vignette: 32 },
  },
  {
    id: 'lib-vin-faded-78',
    name: 'Retro Warm 1978',
    category: 'Vintage',
    description: 'Matte low-contrast nostalgia with sun-bleached mids',
    accentColor: '#FB923C',
    adjustments: { contrast: -14, shadows: 26, highlights: -20, saturation: -20, sepia: 26, grain: 28, vignette: 24 },
  },

  // 5. Moody (4)
  {
    id: 'lib-moo-obsidian',
    name: 'Obsidian Shadow',
    category: 'Moody',
    description: 'Dark cinema blacks with controlled moody highlights',
    accentColor: '#6366F1',
    adjustments: { brightness: -10, exposure: -8, contrast: 28, shadows: -14, highlights: -16, saturation: -18, temperature: -12, vignette: 46 },
  },
  {
    id: 'lib-moo-midnight-storm',
    name: 'Midnight Storm',
    category: 'Moody',
    description: 'Cold slate blue atmosphere with dramatic cloud punch',
    accentColor: '#3B82F6',
    adjustments: { brightness: -8, contrast: 26, temperature: -24, saturation: -22, blueShift: 12, hdr: 30, vignette: 42 },
  },
  {
    id: 'lib-moo-dark-matte',
    name: 'Dark Slate Matte',
    category: 'Moody',
    description: 'Muted desaturated editorial tone with lifted blacks',
    accentColor: '#64748B',
    adjustments: { brightness: -4, contrast: -6, shadows: 18, highlights: -20, saturation: -34, grain: 16, vignette: 34 },
  },
  {
    id: 'lib-moo-charcoal-forest',
    name: 'Charcoal Pine',
    category: 'Moody',
    description: 'Deep desaturated greens and dark atmospheric contrast',
    accentColor: '#059669',
    adjustments: { exposure: -6, contrast: 22, saturation: -28, tint: -12, greenShift: 6, shadows: -10, vignette: 38 },
  },

  // 6. Black & White (4)
  {
    id: 'lib-bw-leica-noir',
    name: 'Leica Monochrome',
    category: 'Black & White',
    description: 'Iconic high-contrast black and white street contrast',
    accentColor: '#F8FAFC',
    adjustments: { saturation: -100, contrast: 34, highlights: 10, shadows: -12, sharpness: 28, grain: 16, vignette: 36 },
  },
  {
    id: 'lib-bw-silver-gelatin',
    name: 'Silver Gelatin Print',
    category: 'Black & White',
    description: 'Balanced darkroom silver halide greyscale depth',
    accentColor: '#CBD5E1',
    adjustments: { saturation: -100, exposure: 6, contrast: 20, shadows: 14, grain: 14, vignette: 24 },
  },
  {
    id: 'lib-bw-tri-x',
    name: 'Tri-X 400 Grain',
    category: 'Black & White',
    description: 'Classic gritty documentary monochrome film texture',
    accentColor: '#94A3B8',
    adjustments: { saturation: -100, contrast: 38, shadows: -16, sharpness: 30, grain: 30, vignette: 30 },
  },
  {
    id: 'lib-bw-platinum',
    name: 'Soft Platinum BW',
    category: 'Black & White',
    description: 'Gentle low-contrast portrait monochrome luminescence',
    accentColor: '#E2E8F0',
    adjustments: { saturation: -100, brightness: 10, contrast: 8, shadows: 18, bloom: 14 },
  },

  // 7. Gold (4)
  {
    id: 'lib-gld-royal-dipti',
    name: 'Royal DIPTI Gold',
    category: 'Gold',
    description: 'Signature DIPTI burnished metallic gold and obsidian contrast',
    accentColor: '#D4AF37',
    adjustments: { contrast: 22, highlights: -10, shadows: -6, temperature: 24, redShift: 10, greenShift: 4, blueShift: -12, hdr: 26, vignette: 34, bloom: 16 },
  },
  {
    id: 'lib-gld-champagne',
    name: 'Champagne Sunbeam',
    category: 'Gold',
    description: 'Luminous pale gold highlights with soft editorial air',
    accentColor: '#FDE68A',
    adjustments: { exposure: 8, contrast: 10, temperature: 20, saturation: 8, bloom: 22, shadows: 14, vignette: 16 },
  },
  {
    id: 'lib-gld-burnished-amber',
    name: 'Burnished Amber Luxe',
    category: 'Gold',
    description: 'Deep warm bronze midtones and bold gilded contrast',
    accentColor: '#F59E0B',
    adjustments: { contrast: 26, temperature: 28, redShift: 12, blueShift: -14, sharpness: 22, vignette: 30 },
  },
  {
    id: 'lib-gld-honey-twilight',
    name: 'Honey Twilight',
    category: 'Gold',
    description: 'Golden hour warmth with glowing sunset highlight bloom',
    accentColor: '#FBBF24',
    adjustments: { brightness: 4, contrast: 14, temperature: 30, tint: 8, saturation: 18, bloom: 20, vignette: 22 },
  },

  // 8. Purple (4)
  {
    id: 'lib-pur-dream-glow',
    name: 'Purple Dream Glow',
    category: 'Purple',
    description: 'Signature DIPTI ultraviolet velvet tint and dreamy bloom',
    accentColor: '#A855F7',
    adjustments: { contrast: 16, shadows: 12, tint: 30, redShift: 12, blueShift: 18, greenShift: -6, saturation: 18, bloom: 26, vignette: 28 },
  },
  {
    id: 'lib-pur-ultraviolet',
    name: 'Velvet Ultraviolet',
    category: 'Purple',
    description: 'Deep night violet mood with electric blue highlights',
    accentColor: '#8B5CF6',
    adjustments: { brightness: -4, contrast: 22, temperature: -24, tint: 24, blueShift: 16, saturation: 20, bloom: 22, vignette: 30 },
  },
  {
    id: 'lib-pur-cyberpunk',
    name: 'Cyberpunk Dusk',
    category: 'Purple',
    description: 'Magenta-violet neon highlights with crisp dark contrast',
    accentColor: '#EC4899',
    adjustments: { contrast: 28, temperature: -20, tint: 34, redShift: 14, blueShift: 20, colorPop: 48, hdr: 24, bloom: 24, vignette: 30 },
  },
  {
    id: 'lib-pur-orchid-haze',
    name: 'Orchid Studio Haze',
    category: 'Purple',
    description: 'Soft lavender shadow wash and gentle portrait tone',
    accentColor: '#C084FC',
    adjustments: { brightness: 6, contrast: 8, shadows: 18, tint: 22, saturation: -4, bloom: 18, vignette: 20 },
  },

  // 9. Travel (5)
  {
    id: 'lib-trv-kyoto-dawn',
    name: 'Kyoto Misty Dawn',
    category: 'Travel',
    description: 'Serene morning pastels and balanced street architecture',
    accentColor: '#F472B6',
    adjustments: { exposure: 4, contrast: 12, shadows: 14, temperature: 6, tint: 8, saturation: 10, sharpness: 18 },
  },
  {
    id: 'lib-trv-santorini',
    name: 'Santorini Aegean Blue',
    category: 'Travel',
    description: 'Crisp sunlit whites and vivid Mediterranean blues',
    accentColor: '#0EA5E9',
    adjustments: { brightness: 6, contrast: 18, highlights: -14, temperature: -12, blueShift: 10, saturation: 20, colorPop: 32, sharpness: 22 },
  },
  {
    id: 'lib-trv-sahara-sun',
    name: 'Sahara Sunburst',
    category: 'Travel',
    description: 'Golden dune warmth and crisp atmospheric depth',
    accentColor: '#F59E0B',
    adjustments: { exposure: 4, contrast: 18, temperature: 26, saturation: 16, hdr: 24, sharpness: 20, vignette: 18 },
  },
  {
    id: 'lib-trv-cliffside',
    name: 'Coastal Overlook',
    category: 'Travel',
    description: 'Clean outdoor clarity with balanced sky recovery',
    accentColor: '#14B8A6',
    adjustments: { contrast: 16, highlights: -18, shadows: 16, saturation: 14, hdr: 30, sharpness: 22 },
  },
  {
    id: 'lib-trv-tokyo-night',
    name: 'Tokyo City Lights',
    category: 'Travel',
    description: 'Vibrant after-dark city signs with crisp contrast',
    accentColor: '#60A5FA',
    adjustments: { exposure: -4, contrast: 24, temperature: -16, colorPop: 38, highlights: -18, shadows: 12, bloom: 18, sharpness: 20 },
  },

  // 10. Social Media (4)
  {
    id: 'lib-soc-creator-pop',
    name: 'Clean Creator Pop',
    category: 'Social Media',
    description: 'Bright scroll-stopping clarity balanced for mobile feeds',
    accentColor: '#FB923C',
    adjustments: { exposure: 6, brightness: 4, contrast: 16, shadows: 12, highlights: -10, colorPop: 42, sharpness: 24 },
  },
  {
    id: 'lib-soc-lifestyle',
    name: 'Warm Lifestyle Feed',
    category: 'Social Media',
    description: 'Cohesive creamy warm feed aesthetic with soft contrast',
    accentColor: '#FBBF24',
    adjustments: { brightness: 6, contrast: 10, temperature: 16, shadows: 16, saturation: 8, bloom: 12 },
  },
  {
    id: 'lib-soc-fashion-reel',
    name: 'Crisp Fashion Reel',
    category: 'Social Media',
    description: 'High-contrast modern lookbook punch and neutral whites',
    accentColor: '#E2E8F0',
    adjustments: { contrast: 24, highlights: -8, shadows: 8, saturation: -8, hdr: 28, sharpness: 30, vignette: 18 },
  },
  {
    id: 'lib-soc-vibrant-cafe',
    name: 'Vibrant Food & Cafe',
    category: 'Social Media',
    description: 'Appetizing warm color richness and crisp macro detail',
    accentColor: '#F43F5E',
    adjustments: { exposure: 4, contrast: 14, temperature: 14, saturation: 22, colorPop: 36, sharpness: 26, shadows: 10 },
  },
];

const BUILT_IN_TS = '2026-11-26T10:00:00.000Z';

export const BUILT_IN_LIBRARY_PRESETS: LibraryPresetItem[] = SEEDS.map((s) => ({
  ...s,
  isBuiltIn: true,
  isFavorite: false,
  createdAt: BUILT_IN_TS,
  updatedAt: BUILT_IN_TS,
}));

const COLOR_KEYS: Array<keyof PhotoAdjustments> = [
  'brightness',
  'exposure',
  'contrast',
  'highlights',
  'shadows',
  'saturation',
  'hueShift',
  'hslLightness',
  'redShift',
  'greenShift',
  'blueShift',
  'temperature',
  'tint',
  'sharpness',
  'vignette',
  'grain',
  'bloom',
  'sepia',
  'hdr',
  'colorPop',
];

/**
 * Applies a preset cleanly at `intensityPct` (0..100).
 * Always preserves geometry & non-color settings (rotation, fineRotation, flipH, flipV, cropAspect, blur, overlayId, overlayOpacity).
 * When `preserveExistingColorEdits` is true, stacks the scaled preset delta on top of existing color sliders.
 */
export function applyPresetToAdjustments(
  current: PhotoAdjustments,
  presetAdjustments: Partial<PhotoAdjustments>,
  intensityPct: number,
  preserveExistingColorEdits = true
): PhotoAdjustments {
  const ratio = Math.max(0, Math.min(1, intensityPct / 100));
  const next: PhotoAdjustments = {
    ...current,
    activeFilterId: 'original',
    filterIntensity: 100,
  };

  for (const key of COLOR_KEYS) {
    const baseVal = preserveExistingColorEdits
      ? Number(current[key] ?? DEFAULT_ADJUSTMENTS[key] ?? 0)
      : Number(DEFAULT_ADJUSTMENTS[key] ?? 0);
    const delta = Number(presetAdjustments[key] ?? 0) * ratio;

    let min = -100;
    let max = 100;
    if (key === 'brightness' || key === 'exposure' || key === 'highlights' || key === 'shadows' || key === 'temperature' || key === 'tint' || key === 'hslLightness' || key === 'redShift' || key === 'greenShift' || key === 'blueShift') {
      min = -50;
      max = 50;
    } else if (key === 'hueShift') {
      min = -180;
      max = 180;
    } else if (key === 'vignette' || key === 'sharpness' || key === 'sepia' || key === 'hdr' || key === 'colorPop') {
      min = 0;
      max = 100;
    } else if (key === 'grain' || key === 'bloom') {
      min = 0;
      max = 60;
    }

    (next as unknown as Record<string, number>)[key] = Math.max(
      min,
      Math.min(max, Math.round(baseVal + delta))
    );
  }

  return next;
}

/**
 * Maps any photo preset into compatible VideoClip color properties supported by VideoEditorStudio.
 */
export function mapPresetToVideoColorSettings(
  preset: LibraryPresetItem,
  intensityPct: number
): CompatibleVideoColorGrade {
  const ratio = Math.max(0, Math.min(1, intensityPct / 100));
  const a = preset.adjustments;

  const clampRange = (val: number, min: number, max: number) =>
    Math.max(min, Math.min(max, Math.round(val)));

  let filterId = 'natural';
  if (preset.category === 'Black & White') {
    filterId = preset.id.includes('silver') ? 'silver-gelatin' : 'leica-noir';
  } else if (preset.category === 'Gold') {
    filterId = preset.id.includes('honey') ? 'golden-hour' : 'obsidian-gold';
  } else if (preset.category === 'Purple') {
    filterId = preset.id.includes('cyber') ? 'cyber-magenta' : 'velvet-violet';
  } else if (preset.category === 'Cinematic') {
    filterId = preset.id.includes('tokyo')
      ? 'tokyo-rain'
      : preset.id.includes('blockbuster')
        ? 'blockbuster'
        : 'anamorphic';
  } else if (preset.category === 'Vintage' || preset.category === 'Moody') {
    filterId = 'editorial-matte';
  } else if ((a.temperature ?? 0) >= 18) {
    filterId = 'golden-hour';
  } else if ((a.temperature ?? 0) <= -16) {
    filterId = 'electric-blue';
  }

  return {
    filterId,
    brightness: clampRange(((a.brightness ?? 0) + (a.exposure ?? 0) * 0.7) * ratio, -40, 40),
    contrast: clampRange((a.contrast ?? 0) * ratio, -40, 50),
    saturation: clampRange(((a.saturation ?? 0) + (a.colorPop ?? 0) * 0.45) * ratio, -100, 60),
    temperature: clampRange((a.temperature ?? 0) * ratio, -50, 50),
    vignette: clampRange((a.vignette ?? 0) * ratio, 0, 80),
    grain: clampRange((a.grain ?? 0) * ratio, 0, 60),
  };
}
