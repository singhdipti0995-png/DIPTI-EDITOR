import { OverlayId, StickerKind } from './editor';

export type DesignCanvasCategory = 'custom' | 'logo' | 'thumbnail' | 'instagram' | 'poster';

export type TextStyleEffect =
  | 'solid'
  | 'metallic-gold'
  | 'purple-neon'
  | 'gradient'
  | '3d-extrude';

export type TextAnimPreset =
  | 'none'
  | 'fade'
  | 'slide-up'
  | 'slide-left'
  | 'zoom'
  | 'bounce'
  | 'gold-shimmer'
  | 'neon-pulse'
  | 'typewriter';

export type DesignShapeKind =
  | 'rect'
  | 'pill-box'
  | 'circle-ring'
  | 'accent-line'
  | 'corner-frame'
  | 'diagonal-bar';

export type DesignBackgroundMode = 'transparent' | 'solid' | 'gradient' | 'photo';

export interface DesignBackground {
  mode: DesignBackgroundMode;
  solidColor: string;
  gradientStart: string;
  gradientEnd: string;
  gradientAngle: number; // 0..360
  photoUrl: string;
  photoDim: number; // 0..85
}

export interface DesignTextLayer {
  id: string;
  kind: 'text';
  role: 'headline' | 'subtitle' | 'badge';
  name: string;
  text: string;
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  fontFamily: string;
  fontSize: number; // px on 1000w baseline
  fontWeight: number; // 400..900
  scale: number; // 0.3..3.0
  rotation: number; // -180..180
  align: 'left' | 'center' | 'right';
  uppercase: boolean;
  letterSpacing: number; // -6..36
  lineHeight: number; // 0.8..2.2
  curveAmount: number; // -100..100 (0 = straight)
  opacity: number; // 0..100
  effect: TextStyleEffect;
  color: string;
  gradientColorA: string;
  gradientColorB: string;
  gradientAngle: number;
  neonColor: string;
  depth3D: number; // 2..28
  angle3D: number; // 0..360
  extrudeColor: string;
  strokeWidth: number; // 0..14
  strokeColor: string;
  shadowBlur: number; // 0..48
  shadowColor: string;
  shadowOffsetY: number; // -20..30
  subtitleBgEnabled: boolean;
  subtitleBgColor: string;
  subtitleBgOpacity: number; // 0..100
  animation: TextAnimPreset;
  animDuration: number; // 0.4..3.0
  animDelay: number; // 0..2.0
  visible: boolean;
  locked: boolean;
}

export interface DesignElementLayer {
  id: string;
  kind: 'sticker' | 'shape';
  name: string;
  stickerKind?: StickerKind;
  shapeKind?: DesignShapeKind;
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  width: number; // relative on 1000w baseline
  height: number; // relative on 1000w baseline
  rotation: number; // -180..180
  opacity: number; // 0..100
  color: string;
  secondaryColor?: string;
  strokeWidth: number; // 0..16
  filled: boolean;
  glowBlur: number; // 0..32
  visible: boolean;
  locked: boolean;
}

export type DesignLayer = DesignTextLayer | DesignElementLayer;

export interface TypographyDesignDoc {
  category: DesignCanvasCategory;
  width: number;
  height: number;
  background: DesignBackground;
  overlayId: OverlayId;
  layers: DesignLayer[]; // ordered bottom-to-top
}

export interface DesignTemplatePreset {
  id: string;
  name: string;
  category: Exclude<DesignCanvasCategory, 'custom'>;
  sizeLabel: string;
  doc: TypographyDesignDoc;
}
