export interface CurvePoint {
  x: number; // 0..1 normalized input luminance/channel
  y: number; // 0..1 normalized output luminance/channel
}

export type CurveChannelId = 'master' | 'red' | 'green' | 'blue';

export interface RgbCurvesState {
  master: CurvePoint[];
  red: CurvePoint[];
  green: CurvePoint[];
  blue: CurvePoint[];
}

export interface ColorWheelVector {
  x: number; // -1..1 (warm/cool-red/cyan axis on wheel)
  y: number; // -1..1 (magenta/green axis on wheel)
  luma: number; // -50..50
}

export interface ColorWheelsState {
  lift: ColorWheelVector; // Shadows
  gamma: ColorWheelVector; // Midtones
  gain: ColorWheelVector; // Highlights
}

export interface ColorGradingState {
  presetId: string;
  presetIntensity: number; // 0..100 (scales overall preset contribution)

  // Tone & Light
  brightness: number; // -50..50
  exposure: number; // -50..50
  contrast: number; // -50..50
  highlights: number; // -50..50
  shadows: number; // -50..50
  whites: number; // -50..50
  blacks: number; // -50..50
  gamma: number; // 0.5..2.2 (default 1.0)

  // Color & HSL
  saturation: number; // -100..100
  temperature: number; // -50..50
  tint: number; // -50..50
  hueShift: number; // -180..180
  hslSaturation: number; // -100..100
  hslLightness: number; // -50..50
  redAdjust: number; // -50..50
  greenAdjust: number; // -50..50
  blueAdjust: number; // -50..50

  // Finishing
  vignette: number; // 0..100
  grain: number; // 0..60
  sharpness: number; // 0..100

  // Advanced SVG Curves & 3-Way Wheels
  curves: RgbCurvesState;
  wheels: ColorWheelsState;
}

export interface CinematicGradePreset {
  id: string;
  name: string;
  description: string;
  accentColor: string;
  swatchGradient: string;
  state: Partial<Omit<ColorGradingState, 'curves' | 'wheels'>> & {
    curves?: Partial<RgbCurvesState>;
    wheels?: Partial<ColorWheelsState>;
  };
}

export interface CustomColorGradePreset {
  id: string;
  name: string;
  accentColor: string;
  state: ColorGradingState;
  createdAt: string;
}

export const DEFAULT_CURVE_POINTS: CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

export const DEFAULT_WHEEL_VECTOR: ColorWheelVector = {
  x: 0,
  y: 0,
  luma: 0,
};

export const DEFAULT_COLOR_GRADING_STATE: ColorGradingState = {
  presetId: 'natural-color',
  presetIntensity: 100,
  brightness: 0,
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  gamma: 1.0,
  saturation: 0,
  temperature: 0,
  tint: 0,
  hueShift: 0,
  hslSaturation: 0,
  hslLightness: 0,
  redAdjust: 0,
  greenAdjust: 0,
  blueAdjust: 0,
  vignette: 0,
  grain: 0,
  sharpness: 0,
  curves: {
    master: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    red: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    green: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    blue: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  },
  wheels: {
    lift: { x: 0, y: 0, luma: 0 },
    gamma: { x: 0, y: 0, luma: 0 },
    gain: { x: 0, y: 0, luma: 0 },
  },
};
