// Fixed scenes for the entry's screenshots, driven by the query string:
//   ?shot=cover   the cover alone, drawn at dw x dh (the gate's screenshot size)
//   ?shot=editor  the whole studio with a cover already built in it
// Scene knobs: layout, grade, size, title, sub, tag, heat, ribbon.
// window.__shotReady is set once the scene is painted, for the capture script.

import { POST_SIZES } from './cover.js';

// One choreography for every layout: the two free samples alternate panel to panel,
// each with its own crop, so a handful of panels reads as a whole photoshoot.
const CHOREOGRAPHY = [
  { photo: 0, zoom: 1.08, panX: -0.08, panY: 1.00 },
  { photo: 1, zoom: 1.18, panX: 0.10, panY: 0.40 },
  { photo: 0, zoom: 1.50, panX: 0.32, panY: 1.00 },
  { photo: 1, zoom: 1.32, panX: -0.22, panY: 0.08 },
  { photo: 0, zoom: 1.60, panX: -0.30, panY: 0.95 },
  { photo: 1, zoom: 1.05, panX: 0, panY: 0.18 },
  { photo: 0, zoom: 1.28, panX: 0.18, panY: -0.20 },
  { photo: 1, zoom: 1.45, panX: -0.05, panY: -0.05 },
  { photo: 0, zoom: 1.15, panX: 0, panY: 0 },
];

export async function runShot(shot, query, api) {
  const { state, loadSample, library, placePhoto, renderTray, syncControls, redraw, canvas } = api;

  state.layout = query.get('layout') ?? 'posterGrid';
  state.grade = query.get('grade') ?? 'sunset';
  state.title = query.get('title') ?? 'Neon Coast';
  state.subtitle = query.get('sub') ?? 'vice nights';
  state.tagline = query.get('tag') ?? 'Every story ends at the shore';
  state.heat = Number(query.get('heat') ?? 5);
  state.ribbon = query.get('ribbon') ?? 'New Season';
  state.grain = true;
  state.vignette = true;
  if (query.get('size') && POST_SIZES[query.get('size')]) state.size = POST_SIZES[query.get('size')];

  for (const name of ['boulevard', 'pier']) {
    const img = await loadSample(name);
    library.push({ img, name });
  }
  const panelTotal = state.layout === 'nineGrid' ? 9 : state.layout === 'heroStrip' ? 4 : state.layout === 'fullBleed' ? 1 : 5;
  for (let i = 0; i < panelTotal; i++) {
    const step = CHOREOGRAPHY[i % CHOREOGRAPHY.length];
    placePhoto(i, step.photo, { zoom: step.zoom, panX: step.panX, panY: step.panY });
  }

  if (shot === 'cover') {
    document.body.classList.add('shot-cover');
    canvas.width = Number(query.get('dw') ?? 1024);
    canvas.height = Number(query.get('dh') ?? 1280);
    redraw();
  } else {
    syncControls();
    renderTray();
    redraw();
  }

  await new Promise((resolve) => setTimeout(resolve, 200));
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__shotReady = true;
    document.documentElement.dataset.shotReady = '1';
  }));
}
