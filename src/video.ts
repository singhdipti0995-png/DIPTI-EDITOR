export type VideoAspect = '16:9' | '9:16' | '1:1';
export type ExportResolution = 'original' | '480p' | '720p' | '1080p' | '4k';
export type VideoQualityTier = 'original' | 'high' | 'maximum' | 'custom';
export type VideoContainerFormat = 'auto' | 'mp4' | 'webm';
export type TransitionType = 'none' | 'crossfade' | 'dip-black' | 'slide-left' | 'zoom';
export type TitleAnimation = 'none' | 'fade-up' | 'slide-in' | 'scale-pop' | 'gold-glow';

export interface VideoFilterPreset {
  id: string;
  name: string;
  accent: string;
  cssFilter: string;
}

export interface VideoClip {
  id: string;
  name: string;
  sourceType: 'video' | 'studio-reel';
  src: string; // Object URL for video, or image URL for studio-reel fallback
  nativeDuration: number; // seconds
  nativeWidth?: number; // measured source pixel width
  nativeHeight?: number; // measured source pixel height
  nativeFps?: number;
  trimStart: number;
  trimEnd: number;
  speed: number; // 0.25 to 4.0
  slowMoBlur: boolean; // frame-blend smoothness for slow motion
  volume: number; // 0 to 100
  brightness: number; // -40 to 40
  contrast: number; // -40 to 50
  saturation: number; // -100 to 60
  temperature?: number; // -50 to 50
  vignette: number; // 0 to 80
  grain?: number; // 0 to 60
  glitch?: number; // 0 to 100
  rgbSplit?: number; // 0 to 100
  filterId: string;
  transitionOut: TransitionType;
  transitionDuration: number; // 0.4 to 1.5s
}

export interface VideoTextItem {
  id: string;
  kind: 'title' | 'subtitle';
  text: string;
  startTime: number;
  endTime: number;
  position: 'top' | 'center' | 'bottom';
  fontFamily: string;
  fontSize: number; // 24 to 96 on 1000px width scale
  color: string;
  animation?: TitleAnimation;
}

export type BuiltInSynthTrack = 'none' | 'midnight-pad' | 'electric-pulse' | 'gold-drone';

export interface VideoAudioTrack {
  mode: 'none' | 'file' | 'synth';
  name: string;
  src?: string;
  synthPreset: BuiltInSynthTrack;
  volume: number; // 0 to 100
  muted: boolean;
  fadeIn?: number; // 0 to 5 seconds
  fadeOut?: number; // 0 to 5 seconds
}

export type VideoOverlayKind =
  | 'golden-flare'
  | 'cyber-prism'
  | 'violet-mist'
  | 'cinema-bars'
  | 'gold-frame'
  | 'image';

export interface VideoOverlayLayer {
  id: string;
  kind: VideoOverlayKind;
  label: string;
  startTime: number;
  endTime: number;
  opacity: number; // 0 to 100
  imageSrc?: string;
  x?: number; // normalized 0..1
  y?: number; // normalized 0..1
  scale?: number; // 10..80 (% of viewport width)
}

export interface VideoTimelineState {
  clips: VideoClip[];
  texts: VideoTextItem[];
  overlays?: VideoOverlayLayer[];
  audio: VideoAudioTrack;
  aspect: VideoAspect;
  resolution: ExportResolution;
  qualityTier?: VideoQualityTier;
  customBitrateMbps?: number;
  exportFormat?: VideoContainerFormat;
  frameRate?: 24 | 30 | 60;
}
