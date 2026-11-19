// Neon Coast cover engine: draws a multi-panel poster cover onto a 2D canvas.
// Panels are clipped polygons filled with photos (cover-fit, per-panel zoom and pan),
// each panel colour-graded with a filter chain and a composite colour wash, then the poster
// furniture is drawn on top: white panel dividers, an outer frame, the heat stars,
// a corner ribbon, the big condensed title with a sunset gradient fill, a neon
// script subtitle, a letter-spaced tagline, and optional grain and vignette.

export const POST_SIZES = {
  square: { id: 'square', label: 'Square 1080 x 1080', w: 1080, h: 1080 },
  portrait: { id: 'portrait', label: 'Portrait 1080 x 1350', w: 1080, h: 1350 },
  wide: { id: 'wide', label: 'Wide 1920 x 1080', w: 1920, h: 1080 },
};

export const GRADE_NAMES = ['sunset', 'neon', 'golden', 'noir', 'none'];

// Panel layouts as polygons in fractions of the cover size. Points are [x, y] pairs.
export const LAYOUTS = {
  posterGrid: {
    label: 'Poster Grid',
    panels: [
      [[0, 0], [0.60, 0], [0.565, 0.52], [0, 0.52]],
      [[0.60, 0], [1, 0], [1, 0.52], [0.565, 0.52]],
      [[0, 0.52], [0.345, 0.52], [0.325, 1], [0, 1]],
      [[0.345, 0.52], [0.675, 0.52], [0.665, 1], [0.325, 1]],
      [[0.675, 0.52], [1, 0.52], [1, 1], [0.665, 1]],
    ],
  },
  heroStrip: {
    label: 'Hero + Strip',
    panels: [
      [[0, 0], [0.615, 0], [0.585, 1], [0, 1]],
      [[0.615, 0], [1, 0], [1, 0.335], [0.60, 0.335]],
      [[0.60, 0.335], [1, 0.335], [1, 0.67], [0.595, 0.67]],
      [[0.595, 0.67], [1, 0.67], [1, 1], [0.585, 1]],
    ],
  },
  nineGrid: {
    label: 'Nine Panel Grid',
    panels: [
      [[0, 0], [0.34, 0], [0.34, 0.34], [0, 0.34]],
      [[0.34, 0], [0.67, 0], [0.67, 0.34], [0.34, 0.34]],
      [[0.67, 0], [1, 0], [1, 0.34], [0.67, 0.34]],
      [[0, 0.34], [0.34, 0.34], [0.34, 0.67], [0, 0.67]],
      [[0.34, 0.34], [0.67, 0.34], [0.67, 0.67], [0.34, 0.67]],
      [[0.67, 0.34], [1, 0.34], [1, 0.67], [0.67, 0.67]],
      [[0, 0.67], [0.34, 0.67], [0.34, 1], [0, 1]],
      [[0.34, 0.67], [0.67, 0.67], [0.67, 1], [0.34, 1]],
      [[0.67, 0.67], [1, 0.67], [1, 1], [0.67, 1]],
    ],
  },
  fullBleed: {
    label: 'Full Bleed',
    panels: [
      [[0, 0], [1, 0], [1, 1], [0, 1]],
    ],
  },
};

// Each grade is a filter chain plus a three-stop colour wash: the wash is laid over the
// photo with the `color` composite (the photo keeps its light, the wash lends its hue)
// and again with `soft-light` for depth. No pixel reads anywhere, so a cover draws the
// same in every browser and the PNG export is never blocked.
const GRADE_LOOKS = {
  sunset: {
    filter: 'saturate(1.32) contrast(1.07) brightness(1.03) sepia(0.30) hue-rotate(-14deg)',
    wash: ['#2a0a4a', '#d63d6e', '#ffb03a'], colorAlpha: 0.34, softAlpha: 0.50,
  },
  neon: {
    filter: 'saturate(1.38) contrast(1.12) brightness(0.99) hue-rotate(-8deg)',
    wash: ['#03182b', '#8f2a6d', '#39d0e8'], colorAlpha: 0.36, softAlpha: 0.55,
  },
  golden: {
    filter: 'saturate(1.18) contrast(1.05) brightness(1.05) sepia(0.48) hue-rotate(-10deg)',
    wash: ['#1d1005', '#c97b2d', '#fff3c4'], colorAlpha: 0.30, softAlpha: 0.45,
  },
  noir: {
    filter: 'grayscale(1) contrast(1.24) brightness(1.06)',
    wash: ['#050505', '#5a5a5a', '#ffffff'], colorAlpha: 0.18, softAlpha: 0.40,
  },
  none: { filter: '', wash: null, colorAlpha: 0, softAlpha: 0 },
};

/** Lays a grade's colour wash over a freshly drawn panel photo on the scratch canvas. */
function applyGradeWash(sctx, bw, bh, look) {
  if (!look.wash) return;
  const grad = sctx.createLinearGradient(0, bh, bw * 0.35, 0);
  grad.addColorStop(0, look.wash[0]);
  grad.addColorStop(0.55, look.wash[1]);
  grad.addColorStop(1, look.wash[2]);
  sctx.save();
  sctx.globalCompositeOperation = 'color';
  sctx.globalAlpha = look.colorAlpha;
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, bw, bh);
  sctx.globalCompositeOperation = 'soft-light';
  sctx.globalAlpha = look.softAlpha;
  sctx.fillRect(0, 0, bw, bh);
  sctx.restore();
}

function panelPath(ctx, poly, w, h) {
  ctx.beginPath();
  poly.forEach(([fx, fy], i) => {
    const x = fx * w;
    const y = fy * h;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

function panelBounds(poly, w, h) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [fx, fy] of poly) {
    x0 = Math.min(x0, fx * w); y0 = Math.min(y0, fy * h);
    x1 = Math.max(x1, fx * w); y1 = Math.max(y1, fy * h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const scratch = document.createElement('canvas');

/** Draws one photo into one panel: cover-fit with the panel's zoom and pan, graded, clipped to the polygon. */
function drawPanelPhoto(ctx, poly, w, h, photo, gradeName) {
  const b = panelBounds(poly, w, h);
  const bw = Math.max(2, Math.round(b.w));
  const bh = Math.max(2, Math.round(b.h));
  scratch.width = bw;
  scratch.height = bh;
  const sctx = scratch.getContext('2d');
  const img = photo.img;
  const zoom = photo.zoom ?? 1;
  const scale = Math.max(bw / img.naturalWidth, bh / img.naturalHeight) * zoom;
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  let dx = b.w / 2 - dw / 2 + (photo.panX ?? 0) * b.w * 0.35;
  let dy = b.h / 2 - dh / 2 + (photo.panY ?? 0) * b.h * 0.35;
  // Clamp the pan so the photo always covers the whole panel: a hard pan can
  // otherwise push the photo off an edge and leave an empty strip behind.
  dx = dw >= bw ? Math.min(0, Math.max(bw - dw, dx)) : (bw - dw) / 2;
  dy = dh >= bh ? Math.min(0, Math.max(bh - dh, dy)) : (bh - dh) / 2;
  const look = GRADE_LOOKS[gradeName] ?? GRADE_LOOKS.none;
  if (look.filter) sctx.filter = look.filter;
  sctx.drawImage(img, dx, dy, dw, dh);
  sctx.filter = 'none';
  applyGradeWash(sctx, bw, bh, look);
  ctx.save();
  panelPath(ctx, poly, w, h);
  ctx.clip();
  ctx.drawImage(scratch, b.x, b.y);
  ctx.restore();
}

/** The poster's star row: `heat` of five stars filled, drawn as polygons in the top-right corner. */
function drawHeatStars(ctx, w, heat) {
  const s = w * 0.021;
  const gap = s * 2.35;
  const x0 = w - s - gap * 4 - w * 0.028;
  const y = w * 0.026;
  for (let i = 0; i < 5; i++) {
    const cx = x0 + i * gap + s;
    ctx.beginPath();
    for (let p = 0; p < 10; p++) {
      const r = p % 2 === 0 ? s : s * 0.45;
      const a = -Math.PI / 2 + p * Math.PI / 5;
      const px = cx + Math.cos(a) * r;
      const py = y + s + Math.sin(a) * r;
      if (p === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = i < heat ? '#ffd23e' : 'rgba(10, 6, 24, 0.45)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = s * 0.14;
    ctx.fill();
    ctx.stroke();
  }
}

/** A rotated corner ribbon, like a sticker slapped on the poster's top-left corner. */
function drawRibbon(ctx, w, text) {
  if (!text) return;
  ctx.save();
  const bandW = w * 0.46;
  const bandH = w * 0.052;
  ctx.translate(bandH * 1.32, bandH * 0.88);
  ctx.rotate(-0.62);
  ctx.fillStyle = '#ff2d78';
  ctx.fillRect(-bandW / 2, -bandH / 2, bandW, bandH);
  ctx.fillStyle = '#ffffff';
  let fontSize = bandH * 0.52;
  ctx.font = `800 ${fontSize}px "Liberation Sans", "Arial Narrow", Arial, sans-serif`;
  const label = text.toUpperCase();
  while (ctx.measureText(label).width > bandW * 0.44 && fontSize > 8) {
    fontSize -= 1;
    ctx.font = `800 ${fontSize}px "Liberation Sans", "Arial Narrow", Arial, sans-serif`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, bandH * 0.03);
  ctx.restore();
}

/**
 * Draws poster lettering: a condensed, slightly skewed title with a gradient fill and a
 * hard outline, fitted to the cover width (splitting into two lines at a space when
 * needed), a neon script subtitle tucked above the title block, and a letter-spaced
 * tagline along the foot, clear of the frame.
 */
function drawLettering(ctx, w, h, state) {
  const title = (state.title ?? '').trim().toUpperCase();
  const cx = w / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  const frame = Math.max(6, w * 0.011) + Math.max(2, w * 0.003);
  const tagSize = h * 0.02;
  const tagY = h - frame - tagSize * 0.6;

  // Title metrics first: the subtitle and tagline are placed around the title block.
  let size = h * 0.148;
  let lines = title ? [title] : [];
  if (title) {
    const setFont = (s) => { ctx.font = `900 ${s}px "Arial Narrow", "Liberation Sans", Arial, sans-serif`; };
    setFont(size);
    const maxWidth = w * 0.94;
    if (ctx.measureText(title).width * 0.84 > maxWidth && title.includes(' ')) {
      const words = title.split(' ');
      const mid = Math.ceil(words.length / 2);
      lines = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
      size = h * 0.128;
      setFont(size);
    }
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width * 0.84));
    if (widest > maxWidth) {
      size *= maxWidth / widest;
      setFont(size);
    }
  }
  const lineHeight = size * 0.94;
  const titleBottom = state.tagline ? tagY - tagSize * 1.8 : h * 0.968;
  const titleTop = titleBottom - Math.max(0, lines.length - 1) * lineHeight - size;

  if (state.subtitle) {
    ctx.save();
    ctx.translate(cx + w * 0.14, lines.length ? titleTop - size * 0.16 : h * 0.8);
    ctx.rotate(-0.045);
    ctx.font = `italic 800 ${h * 0.037}px "Liberation Sans", Arial, sans-serif`;
    ctx.shadowColor = '#ff2d78';
    ctx.shadowBlur = h * 0.02;
    ctx.fillStyle = '#ff7ab0';
    ctx.fillText(state.subtitle, 0, 0);
    ctx.fillText(state.subtitle, 0, 0);
    ctx.restore();
  }

  lines.forEach((line, i) => {
    const ly = titleBottom - (lines.length - 1 - i) * lineHeight;
    ctx.save();
    ctx.translate(cx, ly);
    ctx.transform(1, 0, -0.07, 1, 0, 0);
    ctx.scale(0.84, 1);
    const grad = ctx.createLinearGradient(0, -size, 0, size * 0.25);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.55, '#ffe9a8');
    grad.addColorStop(1, '#ffb03a');
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#180a2e';
    ctx.lineWidth = size * 0.17;
    ctx.shadowColor = 'rgba(10, 4, 26, 0.65)';
    ctx.shadowBlur = size * 0.16;
    ctx.shadowOffsetY = size * 0.06;
    ctx.strokeText(line, 0, 0);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = grad;
    ctx.fillText(line, 0, 0);
    ctx.restore();
  });

  if (state.tagline) {
    ctx.save();
    ctx.font = `700 ${tagSize}px "Liberation Sans", Arial, sans-serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
    ctx.shadowBlur = h * 0.008;
    const text = state.tagline.toUpperCase();
    const spacing = h * 0.012;
    const widths = [...text].map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
    let x = cx - total / 2;
    ctx.textAlign = 'left';
    [...text].forEach((ch, i) => {
      ctx.fillText(ch, x, tagY);
      x += widths[i] + spacing;
    });
    ctx.restore();
  }
}

let grainCanvas = null;
/** A tile of deterministic film grain, generated once and reused at any cover size. */
function getGrain() {
  if (grainCanvas) return grainCanvas;
  grainCanvas = document.createElement('canvas');
  grainCanvas.width = 256;
  grainCanvas.height = 256;
  const g = grainCanvas.getContext('2d');
  const data = g.createImageData(256, 256);
  let seed = 1234567;
  for (let i = 0; i < data.data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const v = 96 + (seed % 128);
    data.data[i] = v;
    data.data[i + 1] = v;
    data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  g.putImageData(data, 0, 0);
  return grainCanvas;
}

/**
 * Draws the whole cover described by `state` onto `canvas` at the canvas's own size.
 * state: { layout, grade, size:{w,h}, panels: [{img, zoom, panX, panY} | null],
 *          title, subtitle, tagline, heat, ribbon, grain, vignette }
 */
export function drawCoverArt(canvas, state) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const layout = LAYOUTS[state.layout] ?? LAYOUTS.posterGrid;

  ctx.fillStyle = '#150826';
  ctx.fillRect(0, 0, w, h);

  layout.panels.forEach((poly, i) => {
    const photo = state.panels[i];
    if (photo && photo.img) {
      drawPanelPhoto(ctx, poly, w, h, photo, state.grade);
    } else {
      ctx.save();
      panelPath(ctx, poly, w, h);
      ctx.clip();
      const b = panelBounds(poly, w, h);
      const grad = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
      grad.addColorStop(0, '#3a1560');
      grad.addColorStop(1, '#150826');
      ctx.fillStyle = grad;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.restore();
    }
  });

  // White dividers between panels, then the poster frame.
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(3, w * 0.0055);
  ctx.lineJoin = 'round';
  for (const poly of layout.panels) {
    panelPath(ctx, poly, w, h);
    ctx.stroke();
  }

  drawLettering(ctx, w, h, state);
  drawHeatStars(ctx, w, state.heat ?? 0);
  drawRibbon(ctx, w, state.ribbon);

  if (state.vignette) {
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.78);
    vg.addColorStop(0, 'rgba(8, 3, 20, 0)');
    vg.addColorStop(1, 'rgba(8, 3, 20, 0.42)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }
  if (state.grain) {
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.globalCompositeOperation = 'overlay';
    const pattern = ctx.createPattern(getGrain(), 'repeat');
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(6, w * 0.011);
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
  ctx.strokeStyle = '#12061f';
  ctx.lineWidth = Math.max(2, w * 0.003);
  const inset = Math.max(6, w * 0.011) + ctx.lineWidth;
  ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
}
