import { FilterPreset, OverlayId, StickerKind, StudioToolId } from '../types/editor';

export interface StudioSampleAsset {
  id: string;
  title: string;
  category: string;
  url: string;
  dimensions: string;
}

export const STUDIO_ASSETS: StudioSampleAsset[] = [
  {
    id: 'asset-portrait',
    title: 'Obsidian Rim Portrait',
    category: 'Editorial Portrait',
    url: '/src/assets/images/studio_hero_portrait_1795628683062.jpg',
    dimensions: '1920 × 1080',
  },
  {
    id: 'asset-cutout',
    title: 'Analog Camera Study',
    category: 'Studio Subject',
    url: '/src/assets/images/studio_subject_cutout_1795628683041.jpg',
    dimensions: '1600 × 1200',
  },
  {
    id: 'asset-macro',
    title: 'Botanical Dew Macro',
    category: 'High-Detail Macro',
    url: '/src/assets/images/studio_enhance_macro_1795628683617.jpg',
    dimensions: '1600 × 1200',
  },
  {
    id: 'asset-street',
    title: 'Cobalt Rain Midnight',
    category: 'Night Street',
    url: '/src/assets/images/studio_filters_street_1795628684625.jpg',
    dimensions: '1600 × 1200',
  },
  {
    id: 'asset-cinema',
    title: 'Pacific Twilight Coast',
    category: 'Anamorphic Frame',
    url: '/src/assets/images/studio_video_cinema_1795628683184.jpg',
    dimensions: '1920 × 1080',
  },
  {
    id: 'asset-typography',
    title: 'Brutalist Sunbeam Hall',
    category: 'Architectural Cover',
    url: '/src/assets/images/studio_typography_cover_1795628684111.jpg',
    dimensions: '1600 × 1200',
  },
];

export interface StudioFeatureCardData {
  id: Exclude<StudioToolId, 'dashboard' | 'projects' | 'settings'>;
  title: string;
  subtitle: string;
  specLine: string;
  thumbnail: string;
  accent: 'purple' | 'blue' | 'gold';
}

export const STUDIO_FEATURES: StudioFeatureCardData[] = [
  {
    id: 'photo',
    title: 'AI Photo Editor',
    subtitle: '30 pro filters, AI enhancement, crop & rotate, blur/sharpen, BG cutout, text & stickers.',
    specLine: '30 Filters · Undo/Redo · Split Preview · AI Enhance',
    thumbnail: '/src/assets/images/studio_hero_portrait_1795628683062.jpg',
    accent: 'purple',
  },
  {
    id: 'video',
    title: 'Video Editor',
    subtitle: 'Multi-track timeline, clip split & merge, transitions, slow-mo, music tracks, and 4K export.',
    specLine: 'Multi-Track · 720p/1080p/4K · Undo/Redo · Transitions',
    thumbnail: '/src/assets/images/studio_video_cinema_1795628683184.jpg',
    accent: 'blue',
  },
  {
    id: 'bg-remover',
    title: 'DIPTI AI Background Remover Studio',
    subtitle: 'Free local MediaPipe segmentation, transparent PNG, solid/gradient/custom backdrops, DSLR blur & hair edge refine.',
    specLine: 'Local WASM AI · Alpha PNG · DSLR Blur · Undo/Redo',
    thumbnail: '/src/assets/images/studio_subject_cutout_1795628683041.jpg',
    accent: 'gold',
  },
  {
    id: 'enhancer',
    title: 'AI Image Enhancer',
    subtitle: '2x crisp upscaling, micro-detail deconvolution sharpening, and live split comparison.',
    specLine: '2x Upscale · Unsharp Mask · AI Diagnostics',
    thumbnail: '/src/assets/images/studio_enhance_macro_1795628683617.jpg',
    accent: 'blue',
  },
  {
    id: 'filters',
    title: 'Filters & Effects Studio',
    subtitle: '30 curated cinema film stocks, optical bloom, chromatic warmth, and analog grain.',
    specLine: '30 Cinema Presets · Bloom · Film Grain',
    thumbnail: '/src/assets/images/studio_filters_street_1795628684625.jpg',
    accent: 'purple',
  },
  {
    id: 'text',
    title: 'Text & Fonts Studio',
    subtitle: 'Editorial display typography overlays with drag positioning, stroke, and shadow styling.',
    specLine: '6 Display Fonts · Drag Layers · High-Res PNG',
    thumbnail: '/src/assets/images/studio_typography_cover_1795628684111.jpg',
    accent: 'gold',
  },
];

export interface CreativeStudioCardData extends StudioFeatureCardData {
  badgeLabel: string;
  usesExternalAiApi: boolean;
}

export const CREATIVE_STUDIO_CARDS: CreativeStudioCardData[] = [
  {
    id: 'photo-restoration',
    title: 'DIPTI AI Photo Restoration Studio',
    subtitle: 'Old photo restoration, bilateral noise reduction, blur deconvolution, faded color recovery, dust/scratch repair, spot-heal brush & Gallery export.',
    specLine: 'Local Signal Pipeline · Dust/Blur/Noise · Before/After · JPG/PNG',
    thumbnail: '/src/assets/images/studio_enhance_macro_1795628683617.jpg',
    accent: 'gold',
    badgeLabel: 'Photo Restoration',
    usesExternalAiApi: false,
  },
  {
    id: 'batch-editor',
    title: 'DIPTI Batch Photo Editor',
    subtitle: 'Import multiple photos, batch apply filters, brightness/contrast/exposure/saturation, color grades, watermarks, resize/crop/rotate & Gallery save.',
    specLine: 'Multi-Photo · Full-Res Canvas · Watermark · Cancellable Queue',
    thumbnail: '/src/assets/images/studio_hero_portrait_1795628683062.jpg',
    accent: 'gold',
    badgeLabel: 'Batch Photo Pro',
    usesExternalAiApi: false,
  },
  {
    id: 'preset-library',
    title: 'Custom Preset Library (40+ Looks)',
    subtitle: '42 curated presets across 10 categories, custom preset builder, IndexedDB persistence, favorite/rename/delete & photo/video apply.',
    specLine: '42 Presets · 10 Categories · IndexedDB Save · Photo + Video',
    thumbnail: '/src/assets/images/studio_filters_street_1795628684625.jpg',
    accent: 'purple',
    badgeLabel: 'Preset Library',
    usesExternalAiApi: false,
  },
  {
    id: 'color-grading',
    title: 'Advanced Color Grading Studio',
    subtitle: 'RGB curves, 3-way color wheels, HSL/RGB channels, Whites/Blacks/Gamma, 10 cinematic presets, custom presets & Photo/Video grading.',
    specLine: 'RGB Curves · Color Wheels · Photo + Video Grade · Custom Presets',
    thumbnail: '/src/assets/images/studio_video_cinema_1795628683184.jpg',
    accent: 'gold',
    badgeLabel: 'Color Grading Pro',
    usesExternalAiApi: false,
  },
  {
    id: 'hd-quality',
    title: 'DIPTI HD Quality Engine',
    subtitle: 'Full-resolution export preservation, 1×-4× Original vs Edited zoom compare, lossless PNG/100% JPG, video 4K guard & live QA tests.',
    specLine: 'Original Res Lock · Zoom Compare · Non-Fake 4K Guard · Quality Audit',
    thumbnail: '/src/assets/images/studio_enhance_macro_1795628683617.jpg',
    accent: 'gold',
    badgeLabel: 'HD Quality Engine',
    usesExternalAiApi: false,
  },
  {
    id: 'dslr-studio',
    title: 'DIPTI DSLR Portrait & Background Studio',
    subtitle: 'Local neural subject segmentation, circular/soft/cinematic bokeh blur 0-100%, hair/edge refine & studio backdrops.',
    specLine: 'Local Segmentation · Circular Bokeh · Hair Refine · JPG/PNG',
    thumbnail: '/src/assets/images/studio_hero_portrait_1795628683062.jpg',
    accent: 'purple',
    badgeLabel: 'DSLR Depth AI',
    usesExternalAiApi: false,
  },
  {
    id: 'portrait-studio',
    title: 'AI Portrait & Cinematic Filter Studio',
    subtitle: '30 live-rendered portrait presets (Cinematic, Golden Hour, Royal Gold, Purple Dream, Soft Focus & more), 0-100% intensity, multi-effect stacking & before/after.',
    specLine: '30 Portrait Looks · Multi-Effect Stack · JPG/PNG · Local Engine',
    thumbnail: '/src/assets/images/studio_hero_portrait_1795628683062.jpg',
    accent: 'gold',
    badgeLabel: '30 Portrait Presets',
    usesExternalAiApi: false,
  },
  {
    id: 'ai-retouch',
    title: 'AI Creative Studio',
    subtitle: 'Text-to-Image, Cartoon & Anime, Sketch & Watercolor, Oil Painting, Double Exposure, Colorize, Sky & BG Replace, Portrait Art, Avatar & Templates.',
    specLine: 'Local Canvas Engine + Optional External AI · Prompt History · Multi-Export',
    thumbnail: '/src/assets/images/studio_hero_portrait_1795628683062.jpg',
    accent: 'purple',
    badgeLabel: 'Local + External AI',
    usesExternalAiApi: false,
  },
  {
    id: 'cinema-fx',
    title: 'Cinema Color & FX Studio',
    subtitle: '3-Way Split-Tone Color Grading, 30 Pro LUT Filters, RGB Glitch Split, CRT Scanlines & Neon Edge Glow.',
    specLine: 'Color Wheels · 30 LUTs · Glitch & Neon · Local Engine',
    thumbnail: '/src/assets/images/studio_filters_street_1795628684625.jpg',
    accent: 'blue',
    badgeLabel: 'Local Shader FX',
    usesExternalAiApi: false,
  },
  {
    id: 'design-studio',
    title: 'Typography & Motion Studio',
    subtitle: 'Gold metallic, purple neon, curved 3D text, animated presets, logos, YouTube thumbnails, Instagram posts, posters & transparent PNG.',
    specLine: '12 Pro Fonts · Motion Presets · Templates · Alpha PNG',
    thumbnail: '/src/assets/images/studio_typography_cover_1795628684111.jpg',
    accent: 'gold',
    badgeLabel: 'Typography & Motion',
    usesExternalAiApi: false,
  },
  {
    id: 'motion-vfx',
    title: 'Pro Motion & VFX Video Studio',
    subtitle: 'Green Screen Chroma Keyer, Keyframe Animation, Motion Tracking Reticle, Speed Ramping & 4-Layer Timeline.',
    specLine: 'Chroma Key · Keyframes · Speed Ramp · WebM',
    thumbnail: '/src/assets/images/studio_video_cinema_1795628683184.jpg',
    accent: 'blue',
    badgeLabel: 'Local VFX Timeline',
    usesExternalAiApi: false,
  },
];

// 30 Professional Photo Filters (+ Original)
export const FILTER_PRESETS: FilterPreset[] = [
  { id: 'original', name: 'Original', category: 'Editorial', accentColor: '#94A3B8', adjustments: {} },
  // Cinema (6)
  { id: 'obsidian-gold', name: 'Cinematic Gold', category: 'Cinema', accentColor: '#D4AF37', adjustments: { contrast: 22, highlights: -14, shadows: -8, temperature: 20, redShift: 8, greenShift: 3, blueShift: -10, hdr: 28, vignette: 36, bloom: 16 } },
  { id: 'anamorphic-teal', name: 'Anamorphic Teal', category: 'Cinema', accentColor: '#2DD4BF', adjustments: { contrast: 24, temperature: -16, tint: -14, saturation: 12, blueShift: 10, shadows: -12, hdr: 20, vignette: 34 } },
  { id: 'tokyo-rain', name: 'Tokyo Rain', category: 'Cinema', accentColor: '#60A5FA', adjustments: { exposure: -6, contrast: 24, temperature: -18, saturation: 20, colorPop: 28, highlights: -18, bloom: 22, vignette: 28 } },
  { id: 'royal-amber', name: 'Royal Amber', category: 'Cinema', accentColor: '#FBBF24', adjustments: { contrast: 20, temperature: 24, saturation: 10, redShift: 10, shadows: -8, sharpness: 18, vignette: 28 } },
  { id: 'blockbuster-70', name: 'HDR Blockbuster', category: 'Cinema', accentColor: '#F97316', adjustments: { contrast: 24, temperature: 14, tint: -6, colorPop: 34, hdr: 52, highlights: -14, shadows: 14, sharpness: 20, vignette: 26 } },
  { id: 'midnight-thriller', name: 'Midnight Thriller', category: 'Cinema', accentColor: '#1D4ED8', adjustments: { brightness: -8, contrast: 30, temperature: -26, saturation: -14, blueShift: 12, shadows: -16, vignette: 44 } },
  // Editorial (6)
  { id: 'golden-hour', name: 'Golden Hour', category: 'Editorial', accentColor: '#F59E0B', adjustments: { exposure: 8, contrast: 10, temperature: 28, tint: 6, saturation: 16, bloom: 18 } },
  { id: 'editorial-matte', name: 'Editorial Matte', category: 'Editorial', accentColor: '#A78BFA', adjustments: { contrast: -10, shadows: 24, highlights: -16, saturation: -18, grain: 14 } },
  { id: 'arctic-prism', name: 'Arctic Prism', category: 'Editorial', accentColor: '#7DD3FC', adjustments: { exposure: 10, contrast: 14, temperature: -20, saturation: -12, sharpness: 24, bloom: 14 } },
  { id: 'vogue-crisp', name: 'Vogue Crisp', category: 'Editorial', accentColor: '#E2E8F0', adjustments: { brightness: 4, contrast: 22, highlights: 8, shadows: -6, hdr: 30, sharpness: 32 } },
  { id: 'alabaster-soft', name: 'Alabaster Soft', category: 'Editorial', accentColor: '#FDE68A', adjustments: { brightness: 10, contrast: -6, shadows: 18, temperature: 8, saturation: -14, bloom: 16 } },
  { id: 'monaco-sun', name: 'Color Pop Vivid', category: 'Editorial', accentColor: '#FB923C', adjustments: { brightness: 4, contrast: 16, temperature: 12, colorPop: 68, hdr: 24, highlights: -10 } },
  // Portrait (6)
  { id: 'velvet-skin', name: 'Velvet Skin', category: 'Portrait', accentColor: '#FDA4AF', adjustments: { brightness: 6, contrast: 8, shadows: 14, temperature: 10, tint: 8, bloom: 14 } },
  { id: 'studio-sculpt', name: 'Studio Sculpt', category: 'Portrait', accentColor: '#C084FC', adjustments: { contrast: 20, highlights: -10, shadows: 12, hdr: 22, sharpness: 22, vignette: 24 } },
  { id: 'warm-ivory', name: 'Warm Ivory', category: 'Portrait', accentColor: '#FCD34D', adjustments: { brightness: 8, temperature: 16, tint: 4, saturation: -8, shadows: 16 } },
  { id: 'peach-glow', name: 'Peach Glow', category: 'Portrait', accentColor: '#FB7185', adjustments: { exposure: 6, temperature: 18, tint: 14, saturation: 12, bloom: 20 } },
  { id: 'deep-dramatic', name: 'Deep Dramatic', category: 'Portrait', accentColor: '#6366F1', adjustments: { brightness: -6, contrast: 26, shadows: -12, hdr: 32, sharpness: 24, vignette: 38 } },
  { id: 'silk-pastel', name: 'Silk Pastel', category: 'Portrait', accentColor: '#F9A8D4', adjustments: { brightness: 12, contrast: -8, shadows: 22, saturation: -16, tint: 10 } },
  // Noir (4)
  { id: 'leica-noir', name: 'Black & White', category: 'Noir', accentColor: '#E2E8F0', adjustments: { saturation: -100, contrast: 34, highlights: 10, shadows: -12, sharpness: 26, grain: 16, vignette: 38 } },
  { id: 'silver-gelatin', name: 'Silver Gelatin', category: 'Noir', accentColor: '#CBD5E1', adjustments: { saturation: -100, exposure: 6, contrast: 20, shadows: 12, grain: 14, vignette: 24 } },
  { id: 'carbon-mono', name: 'Carbon Mono', category: 'Noir', accentColor: '#64748B', adjustments: { saturation: -100, brightness: -8, contrast: 42, shadows: -20, sharpness: 34 } },
  { id: 'soft-platinum', name: 'Soft Platinum', category: 'Noir', accentColor: '#94A3B8', adjustments: { saturation: -100, brightness: 10, contrast: 8, shadows: 18, bloom: 12 } },
  // Neon (4)
  { id: 'electric-navy', name: 'Neon Cobalt', category: 'Neon', accentColor: '#38BDF8', adjustments: { exposure: -4, contrast: 26, temperature: -24, tint: -8, colorPop: 44, blueShift: 14, vignette: 30, bloom: 24 } },
  { id: 'velvet-violet', name: 'Purple Dream', category: 'Neon', accentColor: '#A855F7', adjustments: { contrast: 16, shadows: 12, tint: 30, redShift: 12, blueShift: 18, greenShift: -6, saturation: 18, bloom: 28, vignette: 28 } },
  { id: 'cyber-magenta', name: 'Cyberpunk 2099', category: 'Neon', accentColor: '#EC4899', adjustments: { contrast: 28, temperature: -22, tint: 36, redShift: 14, blueShift: 22, colorPop: 55, hdr: 26, bloom: 26, vignette: 30 } },
  { id: 'ultraviolet', name: 'Ultraviolet Glow', category: 'Neon', accentColor: '#8B5CF6', adjustments: { brightness: -4, contrast: 22, temperature: -28, tint: 24, saturation: 22, blueShift: 16, bloom: 24, vignette: 26 } },
  // Vintage (4)
  { id: 'kodak-warmth', name: 'Vintage Kodak', category: 'Vintage', accentColor: '#D97706', adjustments: { contrast: 12, temperature: 26, tint: 6, shadows: 12, sepia: 18, grain: 24, vignette: 22 } },
  { id: 'polaroid-77', name: 'Polaroid 77', category: 'Vintage', accentColor: '#FBBF24', adjustments: { brightness: 6, contrast: -8, shadows: 22, temperature: 18, tint: -10, sepia: 15, grain: 20 } },
  { id: 'sepia-archive', name: 'Sepia Archive', category: 'Vintage', accentColor: '#B45309', adjustments: { sepia: 88, contrast: 14, grain: 18, vignette: 30 } },
  { id: 'faded-8mm', name: 'Faded 8mm Film', category: 'Vintage', accentColor: '#9CA3AF', adjustments: { contrast: -14, shadows: 28, highlights: -20, saturation: -24, sepia: 25, grain: 30, vignette: 26 } },
];

export interface StudioFontOption {
  id: string;
  label: string;
  family: string;
  styleNote: string;
}

export const STUDIO_FONTS: StudioFontOption[] = [
  { id: 'syne', label: 'Syne Display', family: "'Syne', sans-serif", styleNote: 'Avant-garde architectural' },
  { id: 'playfair', label: 'Playfair Display', family: "'Playfair Display', serif", styleNote: 'Luxury magazine serif' },
  { id: 'cormorant', label: 'Cormorant Garamond', family: "'Cormorant Garamond', serif", styleNote: 'Editorial fine art' },
  { id: 'cinzel', label: 'Cinzel Royal', family: "'Cinzel', serif", styleNote: 'Monumental gold title' },
  { id: 'bodoni', label: 'Bodoni Moda', family: "'Bodoni Moda', serif", styleNote: 'High-fashion contrast' },
  { id: 'oswald', label: 'Oswald Condensed', family: "'Oswald', sans-serif", styleNote: 'Cinema poster title' },
  { id: 'bebas', label: 'Bebas Neue', family: "'Bebas Neue', sans-serif", styleNote: 'Bold thumbnail impact' },
  { id: 'archivo', label: 'Archivo Black', family: "'Archivo Black', sans-serif", styleNote: 'Heavy 3D extrusion' },
  { id: 'montserrat', label: 'Montserrat', family: "'Montserrat', sans-serif", styleNote: 'Modern brand geometric' },
  { id: 'jakarta', label: 'Plus Jakarta Sans', family: "'Plus Jakarta Sans', sans-serif", styleNote: 'Clean studio subtitle' },
  { id: 'dancing', label: 'Dancing Script', family: "'Dancing Script', cursive", styleNote: 'Signature calligraphy' },
  { id: 'jetbrains', label: 'JetBrains Mono', family: "'JetBrains Mono', monospace", styleNote: 'Technical timecode' },
];

export interface StickerCatalogItem {
  kind: StickerKind;
  label: string;
  defaultColor: string;
}

export const STUDIO_STICKERS: StickerCatalogItem[] = [
  { kind: 'starburst', label: 'Gold Star', defaultColor: '#D4AF37' },
  { kind: 'crown', label: 'Royal Crown', defaultColor: '#FBBF24' },
  { kind: 'sparkle', label: 'Prism Flare', defaultColor: '#38BDF8' },
  { kind: 'aperture', label: 'Lens Ring', defaultColor: '#E2E8F0' },
  { kind: 'heart', label: 'Neon Heart', defaultColor: '#F43F5E' },
  { kind: 'bolt', label: 'Electric Bolt', defaultColor: '#38BDF8' },
  { kind: 'badge', label: 'Studio Seal', defaultColor: '#A855F7' },
  { kind: 'moon', label: 'Crescent', defaultColor: '#FDE68A' },
  { kind: 'prism', label: 'Diamond', defaultColor: '#C084FC' },
  { kind: 'frame-stamp', label: 'REC Frame', defaultColor: '#F8FAFC' },
  { kind: 'compass', label: 'North Star', defaultColor: '#D4AF37' },
  { kind: 'sun', label: 'Solar Halo', defaultColor: '#F59E0B' },
];

export interface OverlayCatalogItem {
  id: OverlayId;
  label: string;
  swatch: string;
}

export const STUDIO_OVERLAYS: OverlayCatalogItem[] = [
  { id: 'none', label: 'None', swatch: 'bg-[#060812]' },
  { id: 'golden-flare', label: 'Golden Flare', swatch: 'bg-gradient-to-tr from-amber-500/40 via-transparent to-amber-300/30' },
  { id: 'cyber-prism', label: 'Cyber Prism', swatch: 'bg-gradient-to-br from-sky-500/40 via-transparent to-violet-500/40' },
  { id: 'violet-mist', label: 'Violet Mist', swatch: 'bg-gradient-to-t from-violet-700/45 to-transparent' },
  { id: 'cinema-bars', label: 'Cinema 2.35:1', swatch: 'bg-gradient-to-b from-black via-slate-700 to-black' },
  { id: 'film-border', label: 'Editorial Frame', swatch: 'border-2 border-amber-300/70 bg-slate-900' },
];
