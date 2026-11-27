import {
  BuiltInSynthTrack,
  ExportResolution,
  VideoAspect,
  VideoClip,
  VideoFilterPreset,
} from '../types/video';

export const VIDEO_FILTER_PRESETS: VideoFilterPreset[] = [
  { id: 'natural', name: 'Natural', accent: '#94A3B8', cssFilter: 'none' },
  { id: 'anamorphic', name: 'Anamorphic Teal', accent: '#2DD4BF', cssFilter: 'contrast(1.16) saturate(1.12) hue-rotate(-8deg)' },
  { id: 'obsidian-gold', name: 'Obsidian Gold', accent: '#D4AF37', cssFilter: 'sepia(0.22) contrast(1.18) saturate(1.15)' },
  { id: 'electric-blue', name: 'Electric Blue', accent: '#38BDF8', cssFilter: 'contrast(1.2) saturate(1.25) hue-rotate(-14deg)' },
  { id: 'velvet-violet', name: 'Velvet Violet', accent: '#A855F7', cssFilter: 'contrast(1.14) saturate(1.2) hue-rotate(16deg)' },
  { id: 'tokyo-rain', name: 'Tokyo Rain', accent: '#60A5FA', cssFilter: 'brightness(0.95) contrast(1.22) saturate(1.28)' },
  { id: 'leica-noir', name: 'Leica Noir', accent: '#E2E8F0', cssFilter: 'grayscale(1) contrast(1.34)' },
  { id: 'golden-hour', name: 'Golden Hour', accent: '#F59E0B', cssFilter: 'sepia(0.28) brightness(1.06) saturate(1.26)' },
  { id: 'blockbuster', name: 'Blockbuster 70mm', accent: '#F97316', cssFilter: 'contrast(1.24) saturate(1.18) brightness(0.98)' },
  { id: 'cyber-magenta', name: 'Cyber Magenta', accent: '#EC4899', cssFilter: 'contrast(1.2) saturate(1.35) hue-rotate(24deg)' },
  { id: 'silver-gelatin', name: 'Silver Gelatin', accent: '#CBD5E1', cssFilter: 'grayscale(1) contrast(1.15) brightness(1.05)' },
  { id: 'editorial-matte', name: 'Editorial Matte', accent: '#A78BFA', cssFilter: 'contrast(0.92) brightness(1.05) saturate(0.84)' },
];

export interface VideoExportCapabilities {
  mediaRecorderSupported: boolean;
  mp4Supported: boolean;
  mp4MimeType: string | null;
  webmSupported: boolean;
  webmMimeType: string | null;
  bestMimeType: string | null;
  bestExtension: 'mp4' | 'webm';
}

export function detectVideoExportCapabilities(): VideoExportCapabilities {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return {
      mediaRecorderSupported: false,
      mp4Supported: false,
      mp4MimeType: null,
      webmSupported: false,
      webmMimeType: null,
      bestMimeType: null,
      bestExtension: 'webm',
    };
  }

  const mp4Candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1.4D401E,mp4a.40.2',
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
  ];
  const webmCandidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];

  const mp4MimeType = mp4Candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
  const webmMimeType = webmCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;

  return {
    mediaRecorderSupported: true,
    mp4Supported: Boolean(mp4MimeType),
    mp4MimeType,
    webmSupported: Boolean(webmMimeType),
    webmMimeType,
    bestMimeType: mp4MimeType ?? webmMimeType,
    bestExtension: mp4MimeType ? 'mp4' : 'webm',
  };
}

export function getClipEffectiveDuration(clip: VideoClip): number {
  const raw = Math.max(0.2, clip.trimEnd - clip.trimStart);
  return raw / Math.max(0.25, clip.speed);
}

export function getTotalTimelineDuration(clips: VideoClip[]): number {
  return clips.reduce((acc, c) => acc + getClipEffectiveDuration(c), 0);
}

export interface TimelineClipWindow {
  clip: VideoClip;
  clipIndex: number;
  timelineStart: number;
  timelineEnd: number;
  localVideoTime: number; // seconds inside the source media
  nextClip?: VideoClip;
  transitionProgress: number; // 0 if not in outgoing transition, 0..1 during transition
}

export function findActiveClipAtTime(clips: VideoClip[], timeSec: number): TimelineClipWindow | null {
  if (clips.length === 0) return null;
  let cursor = 0;

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const effDur = getClipEffectiveDuration(clip);
    const start = cursor;
    const end = cursor + effDur;

    if (timeSec <= end || i === clips.length - 1) {
      const elapsedInClip = Math.max(0, Math.min(effDur, timeSec - start));
      const localVideoTime = Math.min(clip.trimEnd, clip.trimStart + elapsedInClip * clip.speed);

      let transitionProgress = 0;
      const nextClip = i < clips.length - 1 ? clips[i + 1] : undefined;
      if (nextClip && clip.transitionOut !== 'none') {
        const transDur = Math.min(effDur * 0.45, clip.transitionDuration);
        const remaining = end - timeSec;
        if (remaining <= transDur && remaining >= 0) {
          transitionProgress = Math.max(0, Math.min(1, 1 - remaining / Math.max(0.05, transDur)));
        }
      }

      return {
        clip,
        clipIndex: i,
        timelineStart: start,
        timelineEnd: end,
        localVideoTime,
        nextClip,
        transitionProgress,
      };
    }
    cursor = end;
  }

  return null;
}

export function getExportSpec(
  aspect: VideoAspect,
  resolution: ExportResolution,
  opts?: {
    sourceWidth?: number;
    sourceHeight?: number;
    qualityTier?: 'original' | 'high' | 'maximum' | 'custom';
    customBitrateMbps?: number;
  }
): { width: number; height: number; bitrate: number; label: string } {
  const table: Record<Exclude<ExportResolution, 'original'>, Record<VideoAspect, { w: number; h: number; bitrate: number }>> = {
    '480p': {
      '16:9': { w: 854, h: 480, bitrate: 3_000_000 },
      '9:16': { w: 480, h: 854, bitrate: 3_000_000 },
      '1:1': { w: 480, h: 480, bitrate: 2_600_000 },
    },
    '720p': {
      '16:9': { w: 1280, h: 720, bitrate: 6_500_000 },
      '9:16': { w: 720, h: 1280, bitrate: 6_500_000 },
      '1:1': { w: 720, h: 720, bitrate: 5_800_000 },
    },
    '1080p': {
      '16:9': { w: 1920, h: 1080, bitrate: 14_000_000 },
      '9:16': { w: 1080, h: 1920, bitrate: 14_000_000 },
      '1:1': { w: 1080, h: 1080, bitrate: 12_000_000 },
    },
    '4k': {
      '16:9': { w: 3840, h: 2160, bitrate: 32_000_000 },
      '9:16': { w: 2160, h: 3840, bitrate: 32_000_000 },
      '1:1': { w: 2160, h: 2160, bitrate: 26_000_000 },
    },
  };

  let w: number;
  let h: number;
  let baseBitrate: number;

  if (resolution === 'original') {
    const srcW = opts?.sourceWidth && opts.sourceWidth > 0 ? opts.sourceWidth : 1920;
    const srcH = opts?.sourceHeight && opts.sourceHeight > 0 ? opts.sourceHeight : 1080;
    const maxEdge = Math.min(3840, Math.max(srcW, srcH));
    const ratio = aspect === '16:9' ? 16 / 9 : aspect === '9:16' ? 9 / 16 : 1;

    if (aspect === '1:1') {
      const side = Math.min(2160, Math.min(srcW, srcH));
      w = side % 2 === 0 ? side : Math.max(2, side - 1);
      h = w;
    } else if (ratio >= 1) {
      w = maxEdge % 2 === 0 ? maxEdge : Math.max(2, maxEdge - 1);
      const rawH = Math.round(w / ratio);
      h = rawH % 2 === 0 ? rawH : Math.max(2, rawH - 1);
    } else {
      h = maxEdge % 2 === 0 ? maxEdge : Math.max(2, maxEdge - 1);
      const rawW = Math.round(h * ratio);
      w = rawW % 2 === 0 ? rawW : Math.max(2, rawW - 1);
    }
    const pixels = w * h;
    baseBitrate = pixels >= 3840 * 2160 * 0.85 ? 32_000_000 : pixels >= 1920 * 1080 * 0.85 ? 14_000_000 : 6_500_000;
  } else {
    const entry = table[resolution][aspect];
    w = entry.w;
    h = entry.h;
    baseBitrate = entry.bitrate;
  }

  let bitrate = baseBitrate;
  if (opts?.qualityTier === 'maximum') {
    bitrate = Math.round(baseBitrate * 1.45);
  } else if (opts?.qualityTier === 'original') {
    bitrate = Math.round(baseBitrate * 1.25);
  } else if (opts?.qualityTier === 'custom' && opts.customBitrateMbps) {
    bitrate = Math.max(2_000_000, Math.min(60_000_000, Math.round(opts.customBitrateMbps * 1_000_000)));
  }

  return {
    width: w,
    height: h,
    bitrate,
    label: `${w}×${h}`,
  };
}

export function formatTimecode(sec: number): string {
  const safe = Math.max(0, sec);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const frames = Math.floor((safe % 1) * 30);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

export function computeAudioFadeMultiplier(
  timeSec: number,
  totalDuration: number,
  fadeIn = 0,
  fadeOut = 0
): number {
  let mult = 1;
  if (fadeIn > 0 && timeSec < fadeIn) {
    mult = Math.min(mult, Math.max(0, timeSec / fadeIn));
  }
  if (fadeOut > 0 && totalDuration - timeSec < fadeOut) {
    mult = Math.min(mult, Math.max(0, (totalDuration - timeSec) / fadeOut));
  }
  return mult;
}

let cachedGrainCanvas: HTMLCanvasElement | null = null;

export function getGrainPatternCanvas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  if (cachedGrainCanvas) return cachedGrainCanvas;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const val = Math.floor(Math.random() * 255);
    img.data[i] = val;
    img.data[i + 1] = val;
    img.data[i + 2] = val;
    img.data[i + 3] = 36;
  }
  ctx.putImageData(img, 0, 0);
  cachedGrainCanvas = c;
  return cachedGrainCanvas;
}

export function startSynthSoundtrack(
  ctx: AudioContext,
  dest: AudioNode,
  preset: BuiltInSynthTrack,
  volumePct: number,
  fadeOpts?: { totalDuration: number; fadeIn?: number; fadeOut?: number }
): () => void {
  if (preset === 'none') return () => {};
  const targetGain = Math.max(0, Math.min(0.35, (volumePct / 100) * 0.25));
  const master = ctx.createGain();
  if (fadeOpts && (fadeOpts.fadeIn || fadeOpts.fadeOut)) {
    const now = ctx.currentTime;
    const dur = Math.max(0.5, fadeOpts.totalDuration);
    const fIn = Math.min(dur * 0.45, fadeOpts.fadeIn ?? 0);
    const fOut = Math.min(dur * 0.45, fadeOpts.fadeOut ?? 0);
    master.gain.setValueAtTime(fIn > 0 ? 0.0001 : targetGain, now);
    if (fIn > 0) {
      master.gain.linearRampToValueAtTime(targetGain, now + fIn);
    }
    if (fOut > 0) {
      master.gain.setValueAtTime(targetGain, now + Math.max(fIn, dur - fOut));
      master.gain.linearRampToValueAtTime(0.0001, now + dur);
    }
  } else {
    master.gain.value = targetGain;
  }
  master.connect(dest);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = preset === 'electric-pulse' ? 680 : 420;
  filter.connect(master);

  const freqs =
    preset === 'midnight-pad'
      ? [110, 164.81, 220]
      : preset === 'electric-pulse'
        ? [130.81, 196, 261.63]
        : [98, 146.83, 196];

  const oscs: OscillatorNode[] = [];
  for (const f of freqs) {
    const osc = ctx.createOscillator();
    osc.type = preset === 'electric-pulse' ? 'sawtooth' : 'sine';
    osc.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = 0.28;
    osc.connect(g);
    g.connect(filter);
    osc.start();
    oscs.push(osc);
  }

  return () => {
    for (const o of oscs) {
      try {
        o.stop();
        o.disconnect();
      } catch {
        // ignore
      }
    }
    try {
      filter.disconnect();
      master.disconnect();
    } catch {
      // ignore
    }
  };
}
