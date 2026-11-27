import {
  DesignBackground,
  DesignElementLayer,
  DesignLayer,
  DesignTextLayer,
  TypographyDesignDoc,
} from '../types/typography';
import { drawStickersOnContext } from './canvasEngine';

export interface RenderTypographyOptions {
  timeSec?: number;
  animate?: boolean;
  selectedLayerId?: string | null;
  showGuides?: boolean;
  snapCenterX?: boolean;
  snapCenterY?: boolean;
  transparentExport?: boolean;
  bgImage?: HTMLImageElement | null;
}

export function computeAnimState(
  layer: DesignTextLayer,
  timeSec: number,
  animate: boolean
): {
  alphaMul: number;
  offsetX: number;
  offsetY: number;
  scaleMul: number;
  shimmerPhase: number;
  neonPulse: number;
  charLimit: number | null;
} {
  if (!animate || layer.animation === 'none') {
    return {
      alphaMul: 1,
      offsetX: 0,
      offsetY: 0,
      scaleMul: 1,
      shimmerPhase: 0.5,
      neonPulse: 1,
      charLimit: null,
    };
  }

  const dur = Math.max(0.25, layer.animDuration || 1.2);
  const localT = Math.max(0, timeSec - (layer.animDelay || 0));
  const p = Math.min(1, localT / dur);
  const easeOut = 1 - Math.pow(1 - p, 3);

  switch (layer.animation) {
    case 'fade':
      return { alphaMul: easeOut, offsetX: 0, offsetY: 0, scaleMul: 1, shimmerPhase: 0.5, neonPulse: 1, charLimit: null };
    case 'slide-up':
      return {
        alphaMul: easeOut,
        offsetX: 0,
        offsetY: (1 - easeOut) * 68,
        scaleMul: 1,
        shimmerPhase: 0.5,
        neonPulse: 1,
        charLimit: null,
      };
    case 'slide-left':
      return {
        alphaMul: easeOut,
        offsetX: -(1 - easeOut) * 96,
        offsetY: 0,
        scaleMul: 1,
        shimmerPhase: 0.5,
        neonPulse: 1,
        charLimit: null,
      };
    case 'zoom':
      return {
        alphaMul: easeOut,
        offsetX: 0,
        offsetY: 0,
        scaleMul: 0.38 + easeOut * 0.62,
        shimmerPhase: 0.5,
        neonPulse: 1,
        charLimit: null,
      };
    case 'bounce': {
      let s = 1;
      if (p < 1) {
        const c4 = (2 * Math.PI) / 3;
        s = p === 0 ? 0.25 : Math.pow(2, -8 * p) * Math.sin((p * 10 - 0.75) * c4) + 1;
      }
      return {
        alphaMul: Math.min(1, p * 3.5),
        offsetX: 0,
        offsetY: (1 - Math.min(1.2, s)) * 24,
        scaleMul: Math.max(0.25, s),
        shimmerPhase: 0.5,
        neonPulse: 1,
        charLimit: null,
      };
    }
    case 'gold-shimmer':
      return {
        alphaMul: 1,
        offsetX: 0,
        offsetY: 0,
        scaleMul: 1,
        shimmerPhase: (timeSec * 0.55) % 1.4 - 0.2,
        neonPulse: 1,
        charLimit: null,
      };
    case 'neon-pulse':
      return {
        alphaMul: 1,
        offsetX: 0,
        offsetY: 0,
        scaleMul: 1,
        shimmerPhase: 0.5,
        neonPulse: 0.65 + 0.55 * Math.sin(timeSec * 4.5),
        charLimit: null,
      };
    case 'typewriter': {
      const totalChars = layer.text.length;
      const shown = Math.max(1, Math.ceil(totalChars * Math.min(1, localT / dur)));
      return {
        alphaMul: 1,
        offsetX: 0,
        offsetY: 0,
        scaleMul: 1,
        shimmerPhase: 0.5,
        neonPulse: 1,
        charLimit: shown,
      };
    }
    default:
      return { alphaMul: 1, offsetX: 0, offsetY: 0, scaleMul: 1, shimmerPhase: 0.5, neonPulse: 1, charLimit: null };
  }
}

function drawCheckerboard(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cell = Math.max(18, Math.round(Math.min(w, h) / 28));
  ctx.fillStyle = '#090B11';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#121622';
  for (let y = 0; y < h; y += cell) {
    for (let x = (Math.floor(y / cell) % 2) * cell; x < w; x += cell * 2) {
      ctx.fillRect(x, y, cell, cell);
    }
  }
}

export function drawDesignBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bg: DesignBackground,
  bgImage?: HTMLImageElement | null,
  showTransparencyGrid = true
): void {
  if (bg.mode === 'transparent') {
    if (showTransparencyGrid) drawCheckerboard(ctx, w, h);
    return;
  }

  if (bg.mode === 'solid') {
    ctx.fillStyle = bg.solidColor || '#06070B';
    ctx.fillRect(0, 0, w, h);
    return;
  }

  if (bg.mode === 'gradient') {
    const rad = ((bg.gradientAngle ?? 135) * Math.PI) / 180;
    const cx = w / 2;
    const cy = h / 2;
    const len = Math.hypot(w, h) * 0.5;
    const dx = Math.cos(rad) * len;
    const dy = Math.sin(rad) * len;
    const grad = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
    grad.addColorStop(0, bg.gradientStart || '#3B0764');
    grad.addColorStop(1, bg.gradientEnd || '#06070B');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    return;
  }

  if (bg.mode === 'photo') {
    if (bgImage && bgImage.complete && bgImage.naturalWidth > 0) {
      const s = Math.max(w / bgImage.naturalWidth, h / bgImage.naturalHeight);
      const dw = bgImage.naturalWidth * s;
      const dh = bgImage.naturalHeight * s;
      ctx.drawImage(bgImage, (w - dw) / 2, (h - dh) / 2, dw, dh);
      const dimAlpha = Math.max(0, Math.min(0.9, (bg.photoDim ?? 42) / 100));
      if (dimAlpha > 0) {
        ctx.fillStyle = `rgba(6, 7, 11, ${dimAlpha})`;
        ctx.fillRect(0, 0, w, h);
      }
    } else {
      ctx.fillStyle = '#090B14';
      ctx.fillRect(0, 0, w, h);
    }
  }
}

function measureTrackedLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  spacingPx: number
): { width: number; charWidths: number[] } {
  const chars = Array.from(line);
  if (chars.length === 0) return { width: 0, charWidths: [] };
  const charWidths = chars.map((ch) => ctx.measureText(ch).width);
  const total =
    charWidths.reduce((sum, cw) => sum + cw, 0) + Math.max(0, chars.length - 1) * spacingPx;
  return { width: total, charWidths };
}

function renderLineWithTracking(
  ctx: CanvasRenderingContext2D,
  line: string,
  yOffset: number,
  spacingPx: number,
  align: 'left' | 'center' | 'right',
  mode: 'fill' | 'stroke'
): void {
  if (Math.abs(spacingPx) < 0.25) {
    if (mode === 'stroke') ctx.strokeText(line, 0, yOffset);
    else ctx.fillText(line, 0, yOffset);
    return;
  }

  const chars = Array.from(line);
  if (chars.length === 0) return;
  const { width, charWidths } = measureTrackedLine(ctx, line, spacingPx);

  let cursorX = 0;
  if (align === 'center') cursorX = -width / 2;
  else if (align === 'right') cursorX = -width;

  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  for (let i = 0; i < chars.length; i++) {
    if (mode === 'stroke') ctx.strokeText(chars[i], cursorX, yOffset);
    else ctx.fillText(chars[i], cursorX, yOffset);
    cursorX += charWidths[i] + spacingPx;
  }
  ctx.textAlign = prevAlign;
}

function buildTextFillStyle(
  ctx: CanvasRenderingContext2D,
  layer: DesignTextLayer,
  halfW: number,
  halfH: number,
  shimmerPhase: number
): string | CanvasGradient {
  if (layer.effect === 'metallic-gold') {
    const g = ctx.createLinearGradient(-halfW, -halfH, halfW, halfH);
    const s = Math.max(0.12, Math.min(0.88, shimmerPhase));
    g.addColorStop(0, '#854D0E');
    g.addColorStop(Math.max(0.05, s - 0.22), '#D4AF37');
    g.addColorStop(s, '#FEF9C3');
    g.addColorStop(Math.min(0.95, s + 0.18), '#F59E0B');
    g.addColorStop(1, '#78350F');
    return g;
  }

  if (layer.effect === 'purple-neon') {
    return '#FAF5FF';
  }

  if (layer.effect === 'gradient') {
    const rad = ((layer.gradientAngle ?? 135) * Math.PI) / 180;
    const r = Math.max(halfW, halfH, 80);
    const dx = Math.cos(rad) * r;
    const dy = Math.sin(rad) * r;
    const g = ctx.createLinearGradient(-dx, -dy, dx, dy);
    g.addColorStop(0, layer.gradientColorA || '#FDE047');
    g.addColorStop(1, layer.gradientColorB || '#A855F7');
    return g;
  }

  return layer.color || '#F8FAFC';
}

function drawCurvedLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  fontPx: number,
  spacingPx: number,
  curveAmount: number,
  layer: DesignTextLayer,
  scaleFactor: number,
  shimmerPhase: number,
  neonPulse: number
): void {
  const chars = Array.from(line);
  if (chars.length === 0) return;
  const { width, charWidths } = measureTrackedLine(ctx, line, spacingPx);
  const absCurve = Math.abs(curveAmount);
  // Smaller radius => tighter bend; clamp safely so characters stay legible
  const radius = Math.max(fontPx * 1.4, (750 * scaleFactor * 18) / Math.max(8, absCurve));
  const totalAngle = Math.min(Math.PI * 1.65, width / radius);
  const upward = curveAmount > 0; // upward arch (smile-over-top)

  const renderPass = (pass: 'extrude' | 'neon' | 'stroke' | 'fill', extrudeIdx = 0) => {
    let angleCursor = -totalAngle / 2;
    const rad3D = ((layer.angle3D ?? 38) * Math.PI) / 180;
    const exX = Math.cos(rad3D) * extrudeIdx * 1.45 * scaleFactor;
    const exY = Math.sin(rad3D) * extrudeIdx * 1.45 * scaleFactor;

    for (let i = 0; i < chars.length; i++) {
      const charW = charWidths[i];
      const charAngleSpan = (charW + spacingPx) / radius;
      const midAngle = angleCursor + (charW / radius) * 0.5;
      angleCursor += charAngleSpan;

      ctx.save();
      if (pass === 'extrude') ctx.translate(exX, exY);
      if (upward) {
        ctx.translate(0, radius * 0.55);
        ctx.rotate(midAngle);
        ctx.translate(0, -radius);
      } else {
        ctx.translate(0, -radius * 0.55);
        ctx.rotate(-midAngle);
        ctx.translate(0, radius);
      }

      ctx.textAlign = 'center';
      if (pass === 'stroke') {
        ctx.strokeText(chars[i], 0, 0);
      } else if (pass === 'neon') {
        ctx.fillText(chars[i], 0, 0);
      } else {
        ctx.fillText(chars[i], 0, 0);
      }
      ctx.restore();
    }
  };

  if (layer.effect === '3d-extrude') {
    const steps = Math.max(2, Math.min(28, Math.round(layer.depth3D || 10)));
    ctx.save();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = layer.extrudeColor || '#2E1065';
    for (let i = steps; i >= 1; i--) {
      renderPass('extrude', i);
    }
    ctx.restore();
  }

  if (layer.effect === 'purple-neon') {
    ctx.save();
    ctx.shadowColor = layer.neonColor || '#A855F7';
    ctx.shadowBlur = (28 * neonPulse) * scaleFactor;
    ctx.fillStyle = layer.neonColor || '#A855F7';
    renderPass('neon');
    ctx.shadowBlur = (12 * neonPulse) * scaleFactor;
    ctx.fillStyle = '#E9D5FF';
    renderPass('neon');
    ctx.restore();
  }

  if (layer.strokeWidth > 0) {
    ctx.save();
    ctx.lineWidth = layer.strokeWidth * scaleFactor * 2;
    ctx.strokeStyle = layer.strokeColor || '#05070C';
    ctx.lineJoin = 'round';
    renderPass('stroke');
    ctx.restore();
  }

  ctx.fillStyle = buildTextFillStyle(ctx, layer, width / 2, fontPx, shimmerPhase);
  renderPass('fill');
}

export function drawDesignTextLayer(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  layer: DesignTextLayer,
  timeSec: number,
  animate: boolean
): { boxW: number; boxH: number } {
  const scaleFactor = w / 1000;
  const anim = computeAnimState(layer, timeSec, animate);

  const fontPx = Math.max(12, Math.round(layer.fontSize * (layer.scale || 1) * scaleFactor));
  ctx.save();
  ctx.translate(layer.x * w + anim.offsetX * scaleFactor, layer.y * h + anim.offsetY * scaleFactor);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.scale(anim.scaleMul, anim.scaleMul);

  ctx.font = `${layer.fontWeight} ${fontPx}px ${layer.fontFamily}`;
  ctx.textAlign = layer.align;
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = Math.max(0, Math.min(1, (layer.opacity / 100) * anim.alphaMul));

  let rawText = layer.uppercase ? layer.text.toUpperCase() : layer.text;
  if (anim.charLimit !== null) {
    rawText = rawText.slice(0, anim.charLimit);
  }
  const lines = (rawText || ' ').split('\n');
  const spacingPx = (layer.letterSpacing || 0) * scaleFactor;
  const stepY = fontPx * (layer.lineHeight || 1.1);
  const startY = -((lines.length - 1) * stepY) / 2;

  let maxLineW = 0;
  for (const l of lines) {
    const m = measureTrackedLine(ctx, l, spacingPx);
    if (m.width > maxLineW) maxLineW = m.width;
  }
  const totalH = Math.max(fontPx, lines.length * stepY);

  // Optional Subtitle / Caption pill background
  if (layer.subtitleBgEnabled) {
    ctx.save();
    const padX = 24 * scaleFactor;
    const padY = 14 * scaleFactor;
    const bgW = maxLineW + padX * 2;
    const bgH = totalH + padY * 1.4;
    let bx = -bgW / 2;
    if (layer.align === 'left') bx = -padX;
    else if (layer.align === 'right') bx = -bgW + padX;
    ctx.globalAlpha *= Math.max(0, Math.min(1, (layer.subtitleBgOpacity ?? 75) / 100));
    ctx.fillStyle = layer.subtitleBgColor || '#06070B';
    ctx.beginPath();
    ctx.roundRect(bx, -bgH / 2, bgW, bgH, 12 * scaleFactor);
    ctx.fill();
    ctx.restore();
  }

  // Curved text path (single or multi-line centered around arc)
  if (Math.abs(layer.curveAmount || 0) >= 3) {
    if (layer.shadowBlur > 0 && layer.effect !== 'purple-neon') {
      ctx.shadowColor = layer.shadowColor || 'rgba(0,0,0,0.75)';
      ctx.shadowBlur = layer.shadowBlur * scaleFactor;
      ctx.shadowOffsetY = (layer.shadowOffsetY ?? 4) * scaleFactor;
    }
    lines.forEach((line, idx) => {
      ctx.save();
      ctx.translate(0, startY + idx * stepY);
      drawCurvedLine(
        ctx,
        line,
        fontPx,
        spacingPx,
        layer.curveAmount,
        layer,
        scaleFactor,
        anim.shimmerPhase,
        anim.neonPulse
      );
      ctx.restore();
    });
    ctx.restore();
    return { boxW: maxLineW + 40 * scaleFactor, boxH: totalH + 40 * scaleFactor };
  }

  // Standard / 3D / Neon / Metallic / Gradient Straight Lines
  lines.forEach((line, index) => {
    const yOffset = startY + index * stepY;

    // 1) 3D Extrusion pass behind face
    if (layer.effect === '3d-extrude') {
      const steps = Math.max(2, Math.min(28, Math.round(layer.depth3D || 12)));
      const rad3D = ((layer.angle3D ?? 38) * Math.PI) / 180;
      const dx = Math.cos(rad3D);
      const dy = Math.sin(rad3D);
      ctx.save();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = layer.extrudeColor || '#2E1065';
      for (let i = steps; i >= 1; i--) {
        ctx.save();
        ctx.translate(dx * i * 1.45 * scaleFactor, dy * i * 1.45 * scaleFactor);
        renderLineWithTracking(ctx, line, yOffset, spacingPx, layer.align, 'fill');
        ctx.restore();
      }
      ctx.restore();
    }

    // 2) Purple Neon multi-pass outer glow
    if (layer.effect === 'purple-neon') {
      ctx.save();
      ctx.shadowColor = layer.neonColor || '#A855F7';
      ctx.shadowBlur = 32 * anim.neonPulse * scaleFactor;
      ctx.fillStyle = layer.neonColor || '#A855F7';
      renderLineWithTracking(ctx, line, yOffset, spacingPx, layer.align, 'fill');
      ctx.shadowBlur = 14 * anim.neonPulse * scaleFactor;
      ctx.fillStyle = '#D8B4FE';
      renderLineWithTracking(ctx, line, yOffset, spacingPx, layer.align, 'fill');
      ctx.restore();
    }

    // 3) Drop Shadow configuration for main face
    ctx.save();
    if (layer.shadowBlur > 0 && layer.effect !== 'purple-neon') {
      ctx.shadowColor = layer.shadowColor || 'rgba(0,0,0,0.75)';
      ctx.shadowBlur = layer.shadowBlur * scaleFactor;
      ctx.shadowOffsetY = (layer.shadowOffsetY ?? 4) * scaleFactor;
    }

    // 4) Outline stroke
    if (layer.strokeWidth > 0) {
      ctx.lineWidth = layer.strokeWidth * scaleFactor * 2;
      ctx.strokeStyle = layer.strokeColor || '#05070C';
      ctx.lineJoin = 'round';
      renderLineWithTracking(ctx, line, yOffset, spacingPx, layer.align, 'stroke');
    }

    // 5) Main Fill (Solid, Metallic Gold, Gradient, Purple Neon Core, or 3D Face)
    ctx.fillStyle = buildTextFillStyle(ctx, layer, Math.max(80, maxLineW / 2), totalH / 2, anim.shimmerPhase);
    renderLineWithTracking(ctx, line, yOffset, spacingPx, layer.align, 'fill');

    // Metallic bevel highlight rim
    if (layer.effect === 'metallic-gold') {
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = Math.max(0.8, 1.2 * scaleFactor);
      ctx.strokeStyle = 'rgba(254, 249, 195, 0.45)';
      renderLineWithTracking(ctx, line, yOffset, spacingPx, layer.align, 'stroke');
    }

    ctx.restore();
  });

  ctx.restore();
  return { boxW: Math.max(80, maxLineW + 30 * scaleFactor), boxH: totalH + 24 * scaleFactor };
}

export function drawDesignElementLayer(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  el: DesignElementLayer
): void {
  const scaleFactor = w / 1000;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, el.opacity / 100));

  if (el.kind === 'sticker' && el.stickerKind) {
    if (el.glowBlur > 0) {
      ctx.shadowColor = el.color;
      ctx.shadowBlur = el.glowBlur * scaleFactor;
    }
    drawStickersOnContext(ctx, w, h, [
      {
        id: el.id,
        kind: el.stickerKind,
        label: el.name,
        x: el.x,
        y: el.y,
        size: el.width,
        rotation: el.rotation,
        opacity: el.opacity,
        color: el.color,
      },
    ]);
    ctx.restore();
    return;
  }

  if (el.kind === 'shape' && el.shapeKind) {
    const bw = el.width * scaleFactor;
    const bh = el.height * scaleFactor;
    ctx.translate(el.x * w, el.y * h);
    ctx.rotate((el.rotation * Math.PI) / 180);
    ctx.fillStyle = el.color;
    ctx.strokeStyle = el.color;
    ctx.lineWidth = Math.max(2, (el.strokeWidth || 4) * scaleFactor);
    if (el.glowBlur > 0) {
      ctx.shadowColor = el.color;
      ctx.shadowBlur = el.glowBlur * scaleFactor;
    }

    if (el.shapeKind === 'rect' || el.shapeKind === 'diagonal-bar') {
      ctx.beginPath();
      ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 12 * scaleFactor);
      if (el.filled) ctx.fill();
      else ctx.stroke();
    } else if (el.shapeKind === 'pill-box') {
      ctx.beginPath();
      ctx.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
      if (el.filled) ctx.fill();
      else ctx.stroke();
    } else if (el.shapeKind === 'circle-ring') {
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(bw, bh) / 2, 0, Math.PI * 2);
      if (el.filled) ctx.fill();
      else ctx.stroke();
    } else if (el.shapeKind === 'accent-line') {
      ctx.beginPath();
      ctx.roundRect(-bw / 2, -Math.max(2, bh / 2), bw, Math.max(4 * scaleFactor, bh), 4 * scaleFactor);
      ctx.fill();
    } else if (el.shapeKind === 'corner-frame') {
      const arm = Math.min(bw, bh) * 0.14;
      const hw = bw / 2;
      const hh = bh / 2;
      ctx.beginPath();
      // Top-left
      ctx.moveTo(-hw, -hh + arm);
      ctx.lineTo(-hw, -hh);
      ctx.lineTo(-hw + arm, -hh);
      // Top-right
      ctx.moveTo(hw - arm, -hh);
      ctx.lineTo(hw, -hh);
      ctx.lineTo(hw, -hh + arm);
      // Bottom-right
      ctx.moveTo(hw, hh - arm);
      ctx.lineTo(hw, hh);
      ctx.lineTo(hw - arm, hh);
      // Bottom-left
      ctx.moveTo(-hw + arm, hh);
      ctx.lineTo(-hw, hh);
      ctx.lineTo(-hw, hh - arm);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function renderTypographyDocument(
  canvas: HTMLCanvasElement,
  doc: TypographyDesignDoc,
  options: RenderTypographyOptions = {}
): void {
  const {
    timeSec = 0,
    animate = false,
    selectedLayerId = null,
    showGuides = true,
    snapCenterX = false,
    snapCenterY = false,
    transparentExport = false,
    bgImage = null,
  } = options;

  const w = doc.width;
  const h = doc.height;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, w, h);

  if (!transparentExport) {
    drawDesignBackground(ctx, w, h, doc.background, bgImage, true);
  }

  let selectedBox: { x: number; y: number; w: number; h: number } | null = null;
  const scaleFactor = w / 1000;

  for (const layer of doc.layers) {
    if (!layer.visible) continue;
    if (layer.kind === 'text') {
      const bounds = drawDesignTextLayer(ctx, w, h, layer, timeSec, animate);
      if (showGuides && !transparentExport && layer.id === selectedLayerId) {
        selectedBox = { x: layer.x * w, y: layer.y * h, w: bounds.boxW, h: bounds.boxH };
      }
    } else {
      drawDesignElementLayer(ctx, w, h, layer);
      if (showGuides && !transparentExport && layer.id === selectedLayerId) {
        selectedBox = {
          x: layer.x * w,
          y: layer.y * h,
          w: layer.width * scaleFactor + 18 * scaleFactor,
          h: layer.height * scaleFactor + 18 * scaleFactor,
        };
      }
    }
  }

  // Optical studio overlay (excluded during Transparent PNG export so alpha cutouts stay pure)
  if (!transparentExport && doc.overlayId !== 'none') {
    ctx.save();
    ctx.globalAlpha = 0.52;
    if (doc.overlayId === 'golden-flare') {
      ctx.globalCompositeOperation = 'screen';
      const g = ctx.createRadialGradient(w * 0.14, h * 0.12, 0, w * 0.2, h * 0.2, w * 0.72);
      g.addColorStop(0, 'rgba(251, 191, 36, 0.75)');
      g.addColorStop(0.5, 'rgba(245, 158, 11, 0.22)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    } else if (doc.overlayId === 'cyber-prism') {
      ctx.globalCompositeOperation = 'screen';
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, 'rgba(56, 189, 248, 0.48)');
      g.addColorStop(1, 'rgba(168, 85, 247, 0.52)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    } else if (doc.overlayId === 'violet-mist') {
      ctx.globalCompositeOperation = 'screen';
      const g = ctx.createLinearGradient(0, h, 0, h * 0.28);
      g.addColorStop(0, 'rgba(139, 92, 246, 0.62)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    } else if (doc.overlayId === 'cinema-bars') {
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#05060A';
      const bh = Math.round(h * 0.085);
      ctx.fillRect(0, 0, w, bh);
      ctx.fillRect(0, h - bh, w, bh);
    } else if (doc.overlayId === 'film-border') {
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#D4AF37';
      ctx.lineWidth = Math.max(3, 4 * scaleFactor);
      const pad = Math.round(28 * scaleFactor);
      ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
    }
    ctx.restore();
  }

  // Interactive alignment & selection box guides (preview only)
  if (showGuides && !transparentExport) {
    if (snapCenterX) {
      ctx.save();
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2, h);
      ctx.stroke();
      ctx.restore();
    }
    if (snapCenterY) {
      ctx.save();
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      ctx.restore();
    }
    if (selectedBox) {
      ctx.save();
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = Math.max(2, 2.2 * scaleFactor);
      ctx.strokeRect(
        selectedBox.x - selectedBox.w / 2,
        selectedBox.y - selectedBox.h / 2,
        selectedBox.w,
        selectedBox.h
      );
      ctx.restore();
    }
  }
}

export function hitTestDesignCanvas(
  doc: TypographyDesignDoc,
  nx: number,
  ny: number
): DesignLayer | null {
  const aspectRatio = doc.height / Math.max(1, doc.width);
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const layer = doc.layers[i];
    if (!layer.visible || layer.locked) continue;

    if (layer.kind === 'text') {
      const approxHalfW = Math.max(0.14, Math.min(0.45, (layer.text.length * layer.fontSize * layer.scale) / 2200));
      const lines = layer.text.split('\n').length;
      const approxHalfH = Math.max(0.06, ((lines * layer.fontSize * layer.scale * layer.lineHeight) / 1000) / Math.max(0.6, aspectRatio));
      if (Math.abs(nx - layer.x) <= approxHalfW && Math.abs(ny - layer.y) <= approxHalfH) {
        return layer;
      }
    } else {
      const halfW = Math.max(0.06, layer.width / 2000);
      const halfH = Math.max(0.06, (layer.height / 2000) / Math.max(0.5, aspectRatio));
      if (Math.abs(nx - layer.x) <= halfW && Math.abs(ny - layer.y) <= halfH) {
        return layer;
      }
    }
  }
  return null;
}
