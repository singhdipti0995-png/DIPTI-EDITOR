export type CreativeStyleId =
  | 'anime-cel'
  | 'pencil-sketch'
  | 'watercolor'
  | 'oil-paint'
  | 'double-exposure'
  | 'colorize-warm'
  | 'cyber-neon'
  | 'gold-editorial';

export const ART_STYLE_OPTIONS: Array<{
  id: CreativeStyleId;
  label: string;
  note: string;
  accent: string;
}> = [
  { id: 'anime-cel', label: 'Anime & Cel', note: 'Pastel cel shading & ink lines', accent: '#A855F7' },
  { id: 'pencil-sketch', label: 'Pencil Sketch', note: 'Graphite cross-hatch & paper', accent: '#E2E8F0' },
  { id: 'watercolor', label: 'Watercolor Wash', note: 'Soft pigment bleed & texture', accent: '#38BDF8' },
  { id: 'oil-paint', label: 'Oil Painting', note: 'Painterly Kuwahara impasto', accent: '#D4AF37' },
  { id: 'double-exposure', label: 'Double Exposure', note: 'Dual-frame silhouette blend', accent: '#C084FC' },
  { id: 'colorize-warm', label: 'Colorize Archive', note: 'Warm & cool tonal restoration', accent: '#F59E0B' },
  { id: 'cyber-neon', label: 'Cyber Neon', note: 'RGB edge glow & magenta lift', accent: '#EC4899' },
  { id: 'gold-editorial', label: 'Gold Editorial', note: 'Obsidian contrast & gold sheen', accent: '#FBBF24' },
];

export interface ColorizePreset {
  id: string;
  label: string;
  shadowHex: string;
  highlightHex: string;
  contrast: number;
}

export const COLORIZE_PRESETS: ColorizePreset[] = [
  { id: 'vintage-kodak', label: '1940s Warm Archive', shadowHex: '#2C1E14', highlightHex: '#F3C98B', contrast: 18 },
  { id: 'cinema-teal-amber', label: 'Teal & Amber Film', shadowHex: '#0F293A', highlightHex: '#F59E0B', contrast: 22 },
  { id: 'royal-violet', label: 'Royal Violet Duotone', shadowHex: '#1E1B4B', highlightHex: '#E879F9', contrast: 20 },
  { id: 'emerald-botanic', label: 'Botanical Emerald', shadowHex: '#062C22', highlightHex: '#FDE68A', contrast: 16 },
];

export type PortraitArtPresetId = 'gold-halo' | 'velvet-noir' | 'neon-rim' | 'pop-art' | 'soft-dream';

export const PORTRAIT_ART_PRESETS: Array<{
  id: PortraitArtPresetId;
  label: string;
  note: string;
}> = [
  { id: 'gold-halo', label: 'Gold Halo', note: 'Warm studio rim & skin glow' },
  { id: 'velvet-noir', label: 'Velvet Noir', note: 'Sculpted monochrome silver' },
  { id: 'neon-rim', label: 'Purple Neon Rim', note: 'Violet & electric edge light' },
  { id: 'pop-art', label: 'Pop Art Print', note: 'Bold 4-tone graphic contrast' },
  { id: 'soft-dream', label: 'Lavender Dream', note: 'Diffused bloom & pastel lift' },
];

export interface CreativePhotoPreset {
  id: string;
  label: string;
  category: string;
  targetTool: 'cartoon' | 'sketch-watercolor' | 'oil-painting' | 'double-exposure' | 'colorize' | 'portrait';
  accent: string;
}

export const CREATIVE_PHOTO_PRESETS: CreativePhotoPreset[] = [
  { id: 'preset-anime', label: 'Studio Anime Cel', category: 'Anime', targetTool: 'cartoon', accent: '#A855F7' },
  { id: 'preset-sketch', label: 'Charcoal Graphite', category: 'Sketch', targetTool: 'sketch-watercolor', accent: '#CBD5E1' },
  { id: 'preset-watercolor', label: 'Aquarelle Wash', category: 'Watercolor', targetTool: 'sketch-watercolor', accent: '#38BDF8' },
  { id: 'preset-oil', label: 'Renaissance Oil', category: 'Oil Paint', targetTool: 'oil-painting', accent: '#D4AF37' },
  { id: 'preset-double', label: 'Horizon Silhouette', category: 'Double Exp', targetTool: 'double-exposure', accent: '#C084FC' },
  { id: 'preset-colorize', label: '1940s Colorized', category: 'Colorize', targetTool: 'colorize', accent: '#F59E0B' },
  { id: 'preset-portrait-gold', label: 'Obsidian Gold Halo', category: 'Portrait', targetTool: 'portrait', accent: '#FBBF24' },
  { id: 'preset-portrait-neon', label: 'Violet Neon Rim', category: 'Portrait', targetTool: 'portrait', accent: '#EC4899' },
];
