// Neon Coast Cover Studio: the editor. A library of the person's own photos (plus the
// two free sample photos the kit ships), a panel layout, a colour grade and poster
// lettering, all drawn live onto the preview canvas by the cover engine, and an
// export button that renders the same cover at full post size and downloads the PNG.
// Photos are read from the person's own machine and never leave it.

import { drawCoverArt, GRADE_NAMES, LAYOUTS, POST_SIZES } from './cover.js';
import { runShot } from './shots.js';

const canvas = document.getElementById('cover');
const status = document.getElementById('status');

export const state = {
  layout: 'posterGrid',
  grade: 'sunset',
  size: POST_SIZES.portrait,
  panels: [],
  title: 'Neon Coast',
  subtitle: 'vice nights',
  tagline: 'Every story ends at the shore',
  heat: 5,
  ribbon: 'New Season',
  grain: true,
  vignette: true,
};

const library = []; // { img, name } — every photo the person can place
let selectedPanel = 0;
let selectedPhoto = -1;

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export async function loadSample(name) {
  const img = await loadImage(`samples/${name}.jpg`);
  return img;
}

function panelCount() {
  return LAYOUTS[state.layout].panels.length;
}

/** Keeps the panels array the size of the current layout, keeping placements that still fit. */
function syncPanelCount() {
  const n = panelCount();
  while (state.panels.length < n) state.panels.push(null);
  state.panels.length = n;
  if (selectedPanel >= n) selectedPanel = 0;
}

export function redraw() {
  syncPanelCount();
  drawCoverArt(canvas, state);
}

export function applySize(size) {
  state.size = size;
  canvas.width = size.w;
  canvas.height = size.h;
  redraw();
}

/** Places a library photo into a panel with a fresh crop. */
function placePhoto(panelIndex, libIndex, crop = {}) {
  const entry = library[libIndex];
  if (!entry) return;
  state.panels[panelIndex] = {
    img: entry.img,
    zoom: crop.zoom ?? 1,
    panX: crop.panX ?? 0,
    panY: crop.panY ?? 0,
  };
  selectedPhoto = libIndex;
}

const tray = document.getElementById('tray');

function renderTray() {
  tray.replaceChildren();
  library.forEach((entry, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'thumb' + (i === selectedPhoto ? ' picked' : '');
    const img = document.createElement('img');
    img.src = entry.img.src;
    img.alt = entry.name;
    btn.append(img, document.createTextNode(entry.name));
    btn.addEventListener('click', () => {
      placePhoto(selectedPanel, i);
      renderTray();
      syncCropControls();
      redraw();
      status.textContent = `${entry.name} is in panel ${selectedPanel + 1}. Pick another panel to place it again.`;
    });
    tray.append(btn);
  });
}

async function addPhotoFile(file) {
  const url = URL.createObjectURL(file);
  const img = await loadImage(url);
  library.push({ img, name: file.name.replace(/\.[^.]+$/, '').slice(0, 18) || 'photo' });
  renderTray();
  return library.length - 1;
}

const photoInput = document.getElementById('photo-input');
photoInput.addEventListener('change', async () => {
  for (const file of photoInput.files) await addPhotoFile(file);
  if (library.length && selectedPhoto === -1) placePhoto(0, 0);
  renderTray();
  redraw();
});

const dropzone = document.getElementById('dropzone');
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('over'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('over'));
dropzone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropzone.classList.remove('over');
  for (const file of e.dataTransfer.files) {
    if (file.type.startsWith('image/')) await addPhotoFile(file);
  }
  renderTray();
  redraw();
});

document.getElementById('spread').addEventListener('click', () => {
  const libIndex = selectedPhoto >= 0 ? selectedPhoto : 0;
  if (!library[libIndex]) return;
  const crops = [
    { zoom: 1.12, panX: -0.2, panY: -0.1 },
    { zoom: 1.35, panX: 0.25, panY: 0.05 },
    { zoom: 1.05, panX: 0, panY: 0.2 },
    { zoom: 1.5, panX: -0.3, panY: 0.15 },
    { zoom: 1.22, panX: 0.15, panY: -0.2 },
    { zoom: 1.4, panX: 0, panY: 0 },
    { zoom: 1.1, panX: 0.3, panY: 0.3 },
    { zoom: 1.6, panX: -0.15, panY: -0.3 },
    { zoom: 1.25, panX: 0.05, panY: 0.1 },
  ];
  syncPanelCount();
  state.panels = state.panels.map((_, i) => {
    const c = crops[i % crops.length];
    return { img: library[libIndex].img, zoom: c.zoom, panX: c.panX, panY: c.panY };
  });
  redraw();
  status.textContent = 'One photo now fills every panel, each with its own crop.';
});

document.getElementById('clear-panel').addEventListener('click', () => {
  state.panels[selectedPanel] = null;
  redraw();
});

/** Builds a segmented control (Layout / Size / Grade) from a list of [id, label] pairs. */
function buildSeg(id, entries, current, onPick) {
  const host = document.getElementById(id);
  host.replaceChildren();
  for (const [key, label] of entries) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.className = key === current ? 'on' : '';
    btn.addEventListener('click', () => {
      onPick(key);
      buildSeg(id, entries, key, onPick);
    });
    host.append(btn);
  }
}

function buildPickers() {
  buildSeg('layouts', Object.entries(LAYOUTS).map(([k, v]) => [k, v.label]), state.layout, (key) => {
    state.layout = key;
    syncPanelCount();
    redraw();
  });
  buildSeg('sizes', Object.values(POST_SIZES).map((s) => [s.id, s.label]), state.size.id, (key) => {
    applySize(POST_SIZES[key]);
  });
  buildSeg('grades', GRADE_NAMES.map((g) => [g, g[0].toUpperCase() + g.slice(1)]), state.grade, (key) => {
    state.grade = key;
    redraw();
  });
}

// Per-panel crop controls.
const zoomEl = document.getElementById('zoom');
const panxEl = document.getElementById('panx');
const panyEl = document.getElementById('pany');

function syncCropControls() {
  const p = state.panels[selectedPanel];
  zoomEl.value = p ? p.zoom : 1;
  panxEl.value = p ? p.panX : 0;
  panyEl.value = p ? p.panY : 0;
}

function editCrop() {
  const p = state.panels[selectedPanel];
  if (!p) return;
  p.zoom = Number(zoomEl.value);
  p.panX = Number(panxEl.value);
  p.panY = Number(panyEl.value);
  redraw();
}
zoomEl.addEventListener('input', editCrop);
panxEl.addEventListener('input', editCrop);
panyEl.addEventListener('input', editCrop);

// Canvas interaction: click selects a panel, drag pans its photo, wheel zooms it.
function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height };
}

function pointInPoly(fx, fy, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > fy) !== (yj > fy) && fx < ((xj - xi) * (fy - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function panelAt(fx, fy) {
  const polys = LAYOUTS[state.layout].panels;
  for (let i = 0; i < polys.length; i++) if (pointInPoly(fx, fy, polys[i])) return i;
  return -1;
}

let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  const { fx, fy } = canvasPoint(e);
  const idx = panelAt(fx, fy);
  if (idx === -1) return;
  selectedPanel = idx;
  syncCropControls();
  const p = state.panels[idx];
  if (p) drag = { fx, fy, panX: p.panX, panY: p.panY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const { fx, fy } = canvasPoint(e);
  const p = state.panels[selectedPanel];
  if (!p) return;
  p.panX = Math.max(-1, Math.min(1, drag.panX + (fx - drag.fx) * 2.2));
  p.panY = Math.max(-1, Math.min(1, drag.panY + (fy - drag.fy) * 2.2));
  syncCropControls();
  redraw();
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('wheel', (e) => {
  const p = state.panels[selectedPanel];
  if (!p) return;
  e.preventDefault();
  p.zoom = Math.max(1, Math.min(3, p.zoom * (e.deltaY < 0 ? 1.07 : 0.93)));
  syncCropControls();
  redraw();
}, { passive: false });

// Lettering and furniture controls.
function bindText(id, key) {
  document.getElementById(id).addEventListener('input', (e) => {
    state[key] = e.target.value;
    redraw();
  });
}
bindText('title', 'title');
bindText('subtitle', 'subtitle');
bindText('tagline', 'tagline');
bindText('ribbon', 'ribbon');
document.getElementById('heat').addEventListener('input', (e) => { state.heat = Number(e.target.value); redraw(); });
document.getElementById('grain').addEventListener('change', (e) => { state.grain = e.target.checked; redraw(); });
document.getElementById('vignette').addEventListener('change', (e) => { state.vignette = e.target.checked; redraw(); });

document.getElementById('export').addEventListener('click', () => {
  const out = document.createElement('canvas');
  out.width = state.size.w;
  out.height = state.size.h;
  drawCoverArt(out, state);
  out.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `neon-coast-cover-${state.size.w}x${state.size.h}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    status.textContent = `Saved neon-coast-cover-${state.size.w}x${state.size.h}.png`;
  }, 'image/png');
});

/** Reflects the state into every control; used by the screenshot scenes. */
export function syncControls() {
  buildPickers();
  syncCropControls();
  for (const [id, key] of [['title', 'title'], ['subtitle', 'subtitle'], ['tagline', 'tagline'], ['ribbon', 'ribbon']]) {
    document.getElementById(id).value = state[key];
  }
  document.getElementById('heat').value = state.heat;
  document.getElementById('grain').checked = state.grain;
  document.getElementById('vignette').checked = state.vignette;
  canvas.width = state.size.w;
  canvas.height = state.size.h;
}

async function init() {
  buildPickers();
  syncPanelCount();
  const query = new URLSearchParams(location.search);
  const shot = query.get('shot');
  if (shot) {
    await runShot(shot, query, { state, loadSample, library, placePhoto, renderTray, syncControls, redraw, canvas });
    return;
  }
  // A friendly starting cover: the two free samples spread over the poster grid.
  for (const name of ['boulevard', 'pier']) {
    const img = await loadSample(name);
    library.push({ img, name });
  }
  placePhoto(0, 0, { zoom: 1.1, panX: -0.1, panY: 0 });
  placePhoto(1, 1, { zoom: 1.2, panX: 0.1, panY: 0 });
  placePhoto(2, 0, { zoom: 1.45, panX: 0.3, panY: 0.1 });
  placePhoto(3, 1, { zoom: 1.3, panX: -0.2, panY: 0.1 });
  placePhoto(4, 0, { zoom: 1.55, panX: -0.35, panY: -0.1 });
  renderTray();
  syncCropControls();
  redraw();
}

init();
