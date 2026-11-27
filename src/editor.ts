import { VideoTimelineState } from './video';
import { TypographyDesignDoc } from './typography';
import { ColorGradingState } from './colorGrading';

export type StudioToolId =
  | 'dashboard'
  | 'photo'
  | 'video'
  | 'color-grading'
  | 'preset-library'
  | 'batch-editor'
  | 'hd-quality'
  | 'portrait-studio'
  | 'dslr-studio'
  | 'photo-restoration'
  | 'bg-remover'
  | 'enhancer'
  | 'filters'
  | 'text'
  | 'ai-retouch'
  | 'cinema-fx'
  | 'design-studio'
  | 'motion-vfx'
  | 'export-center'
  | 'projects'
  | 'settings';

export type CropAspect = 'original' | '1:1' | '4:5' | '3:4' | '16:9' | '9:16';

export type OverlayId =
  | 'none'
  | 'golden-flare'
  | 'cyber-prism'
  | 'violet-mist'
  | 'cinema-bars'
  | 'film-border';

export interface PhotoAdjustments {
  brightness: number; // -50 to 50
  exposure: number; // -50 to 50
  contrast: number; // -50 to 50
  highlights: number; // -50 to 50
  shadows: number; // -50 to 50
  saturation: number; // -100 to 100
  hueShift: number; // -180 to 180 (HSL Hue)
  hslLightness: number; // -50 to 50 (HSL Lightness)
  redShift: number; // -50 to 50 (RGB Red)
  greenShift: number; // -50 to 50 (RGB Green)
  blueShift: number; // -50 to 50 (RGB Blue)
  temperature: number; // -50 to 50
  tint: number; // -50 to 50
  blur: number; // 0 to 25
  sharpness: number; // 0 to 100
  vignette: number; // 0 to 100
  grain: number; // 0 to 60
  bloom: number; // 0 to 60
  sepia: number; // 0 to 100
  hdr: number; // 0 to 100
  colorPop: number; // 0 to 100
  rotation: number; // 0, 90, 180, 270
  fineRotation: number; // -45 to 45
  flipH: boolean;
  flipV: boolean;
  cropAspect: CropAspect;
  activeFilterId: string;
  filterIntensity: number; // 0 to 100
  overlayId: OverlayId;
  overlayOpacity: number; // 0 to 100
}

export const DEFAULT_ADJUSTMENTS: PhotoAdjustments = {
  brightness: 0,
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  saturation: 0,
  hueShift: 0,
  hslLightness: 0,
  redShift: 0,
  greenShift: 0,
  blueShift: 0,
  temperature: 0,
  tint: 0,
  blur: 0,
  sharpness: 0,
  vignette: 0,
  grain: 0,
  bloom: 0,
  sepia: 0,
  hdr: 0,
  colorPop: 0,
  rotation: 0,
  fineRotation: 0,
  flipH: false,
  flipV: false,
  cropAspect: 'original',
  activeFilterId: 'original',
  filterIntensity: 100,
  overlayId: 'none',
  overlayOpacity: 55,
};

export interface FilterPreset {
  id: string;
  name: string;
  category: 'Cinema' | 'Editorial' | 'Portrait' | 'Noir' | 'Neon' | 'Vintage';
  accentColor: string;
  adjustments: Partial<PhotoAdjustments>;
}

export interface TextLayer {
  id: string;
  text: string;
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  fontFamily: string;
  fontSize: number; // relative px on 1000px base
  fontWeight: number;
  color: string;
  letterSpacing: number;
  lineHeight: number;
  opacity: number; // 0..100
  rotation: number; // -180..180
  shadowBlur: number;
  strokeWidth: number;
  strokeColor: string;
  align: 'left' | 'center' | 'right';
  uppercase: boolean;
}

export type StickerKind =
  | 'starburst'
  | 'crown'
  | 'aperture'
  | 'sparkle'
  | 'heart'
  | 'bolt'
  | 'badge'
  | 'moon'
  | 'prism'
  | 'frame-stamp'
  | 'compass'
  | 'sun';

export interface StickerLayer {
  id: string;
  kind: StickerKind;
  label: string;
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  size: number; // relative px on 1000px base
  rotation: number; // -180..180
  opacity: number; // 0..100
  color: string;
}

export interface RefineStroke {
  mode: 'keep' | 'erase';
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  radius: number; // normalized radius relative to width
}

export interface SubjectSegmentConfig {
  subjectLabel: string;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  threshold: number;
  feather: number;
  backgroundStyle?: string;
}

export type BackdropMode = 'transparent' | 'navy' | 'purple-glow' | 'gold-noir' | 'studio-white' | 'bokeh';

export interface EnhanceParams {
  sharpen: number;
  denoise: number;
  clarity: number;
  exposureLift: number;
  contrastBoost: number;
  colorVibrance: number;
  upscale2x: boolean;
  diagnosisNote?: string;
}

export interface PortraitStudioConfig {
  primaryPresetId: string;
  primaryIntensity: number; // 0..100
  secondaryPresetId: string; // 'none' or preset id to combine multiple effects
  secondaryIntensity: number; // 0..100
  skinSoftness: number; // 0..100
  portraitGlow: number; // 0..60
  studioKeyLight: number; // -40..60
  softFocus: number; // 0..50
  warmthShift: number; // -40..40
  contrastShift: number; // -40..40
  vignette: number; // 0..100
  grain: number; // 0..60
  focusX: number; // 0..1
  focusY: number; // 0..1
}

export type DslrBokehStyle = 'soft' | 'circular' | 'cinematic-depth';
export type DslrBackgroundMode =
  | 'original-blur'
  | 'black-studio'
  | 'white-studio'
  | 'purple-luxury'
  | 'gold-cinematic'
  | 'custom-gradient'
  | 'custom-image';

export interface DslrStudioConfig {
  blurIntensity: number; // 0..100
  bokehStyle: DslrBokehStyle;
  backgroundMode: DslrBackgroundMode;
  customGradientStart: string;
  customGradientEnd: string;
  customGradientAngle: number; // 0..360
  customBgImageUrl?: string;
  hairRefinement: number; // 0..100
  subjectEdgeShift: number; // -20..20 (erode/dilate)
  edgeFeather: number; // 0..12
  portraitLighting: number; // -40..60
  bgBrightness: number; // -60..60
  bgSaturation: number; // -100..100
  refineStrokes: RefineStroke[];
}

export interface ProjectItem {
  id: string;
  name: string;
  tool: Exclude<StudioToolId, 'dashboard' | 'projects' | 'settings' | 'export-center'>;
  thumbnailDataUrl: string;
  sourceImageUrl: string;
  width: number;
  height: number;
  updatedAt: string;
  adjustments?: PhotoAdjustments;
  textLayers?: TextLayer[];
  stickers?: StickerLayer[];
  bgRemoved?: boolean;
  backdropMode?: BackdropMode;
  filterPresetId?: string;
  filterIntensity?: number;
  portraitStudioState?: PortraitStudioConfig;
  dslrStudioState?: DslrStudioConfig;
  photoRestorationState?: PhotoRestorationConfig;
  colorGradingState?: ColorGradingState;
  videoTimeline?: VideoTimelineState;
  typographyDoc?: TypographyDesignDoc;
  undoSteps?: number;
  redoSteps?: number;
  autoSaved?: boolean;
}

export interface SpotRepairStroke {
  id: string;
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  radius: number; // normalized radius relative to image width
}

export interface PhotoRestorationConfig {
  presetId: string;
  intensity: number; // 0..100 master blend
  noiseReduction: number; // 0..100
  blurReduction: number; // 0..100
  sharpening: number; // 0..100
  detailTexture: number; // 0..100
  fadedColorRestore: number; // 0..100
  castNeutralize: number; // 0..100
  scratchDustReduction: number; // 0..100
  exposureRecovery: number; // -50..50
  brightness: number; // -50..50
  contrast: number; // -50..50
  shadowsRecovery: number; // 0..100
  highlightsRecovery: number; // 0..100
  spotStrokes: SpotRepairStroke[];
}

export interface ProjectHistoryEntry {
  id: string;
  projectId: string;
  projectName: string;
  tool: ProjectItem['tool'];
  label: string;
  snapshot: ProjectItem;
  createdAt: string;
}

export type GalleryDeliveryChannel =
  | 'android-mediastore'
  | 'saf-directory'
  | 'browser-download'
  | 'skipped-disabled'
  | 'duplicate-skipped';

export interface ExportRecord {
  id: string;
  projectId?: string;
  fileName: string;
  mediaType: 'image' | 'video';
  format: 'jpg' | 'png' | 'webp' | 'mp4' | 'webm';
  resolutionLabel: string;
  width: number;
  height: number;
  quality?: number;
  frameRate?: number;
  fileSizeBytes: number;
  status: 'completed' | 'failed';
  errorMessage?: string;
  thumbnailDataUrl?: string;
  galleryDelivery?: GalleryDeliveryChannel;
  albumName?: string;
  galleryLocationLabel?: string;
  createdAt: string;
}

export interface StorageUsageStats {
  indexedDbSupported: boolean;
  projectCount: number;
  historyCount: number;
  exportCount: number;
  projectsBytes: number;
  historyBytes: number;
  exportsBytes: number;
  localStorageBytes: number;
  quotaBytes: number | null;
  usageBytes: number | null;
}

export interface AppSettings {
  exportFormat: 'png' | 'jpeg' | 'webp';
  exportQuality: number; // 50..100
  defaultUpscale: '1x' | '2x';
  showCanvasGrid: boolean;
  autoSaveProjects: boolean;
  autoSaveToGallery: boolean;
  galleryAlbumName: string;
  preventDuplicateGallerySaves: boolean;
  reducedMotion: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  exportFormat: 'png',
  exportQuality: 95,
  defaultUpscale: '2x',
  showCanvasGrid: false,
  autoSaveProjects: true,
  autoSaveToGallery: true,
  galleryAlbumName: 'DIPTI EDITOR',
  preventDuplicateGallerySaves: true,
  reducedMotion: false,
};
