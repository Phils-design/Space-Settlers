import './style.css';
import { World } from './render/world';
import { BUILDINGS, type BuildingType } from './sim/config';
import { advance, buildRoadLine, canPlace, placeBuilding, removeRoad, speedUp, startUpgrade } from './sim/game';
import { SAVE_KEY, deserialize, serialize } from './sim/save';
import { byId, createGame, hub, type GameState } from './sim/state';
import { Hud, type UiState } from './ui/hud';

const SEED = 1;

function load(): GameState {
  try {
    const saved = deserialize(localStorage.getItem(SAVE_KEY));
    if (saved) return saved;
  } catch {
    /* storage blocked: start fresh */
  }
  return createGame(SEED, Date.now());
}

function save(s: GameState) {
  try {
    localStorage.setItem(SAVE_KEY, serialize(s));
  } catch {
    /* storage blocked or full: keep playing without saving */
  }
}

let state = load();
const canvas = document.getElementById('game') as HTMLCanvasElement;
const world = new World(canvas, state);
const ui: UiState = { mode: { kind: 'view' }, selected: null, goalsMin: window.innerWidth < 700, settings: false, confirmReset: false };
const hud = new Hud(document.getElementById('hud')!, act);

if (canvas.clientHeight > canvas.clientWidth) world.camera.radius = 72;
if (state.buildings.length === 1) {
  const h = hub(state);
  world.focus(h.x + 1.5, h.y + 1.5);
}

/** Best spot for a new building: the valid one closest to the middle of the screen. */
function suggestSpot(type: BuildingType) {
  const size = BUILDINGS[type].size;
  const centre = world.pick(canvas.clientWidth / 2, canvas.clientHeight / 2).tile ?? { x: state.size / 2, y: state.size / 2 };
  let best: { x: number; y: number; d: number } | null = null;
  for (let y = 0; y <= state.size - size; y++) {
    for (let x = 0; x <= state.size - size; x++) {
      if (!canPlace(state, type, x, y).ok) continue;
      const d = Math.hypot(x + size / 2 - centre.x, y + size / 2 - centre.y);
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  return best ?? { x: Math.max(0, Math.round(centre.x - size / 2)), y: Math.max(0, Math.round(centre.y - size / 2)) };
}

function act(action: string, arg?: string) {
  const now = Date.now();
  switch (action) {
    case 'build':
      ui.mode = ui.mode.kind === 'menu' ? { kind: 'view' } : { kind: 'menu' };
      ui.selected = null;
      break;
    case 'road':
      ui.mode = ui.mode.kind === 'road' ? { kind: 'view' } : { kind: 'road', anchor: null, remove: false };
      ui.selected = null;
      break;
    case 'road-remove':
      if (ui.mode.kind === 'road') ui.mode = { kind: 'road', anchor: null, remove: !ui.mode.remove };
      break;
    case 'choose': {
      const type = arg as BuildingType;
      ui.mode = { kind: 'place', type, ...suggestSpot(type) };
      break;
    }
    case 'place': {
      if (ui.mode.kind !== 'place') break;
      const r = placeBuilding(state, ui.mode.type, ui.mode.x, ui.mode.y, now);
      if (r.ok) {
        hud.toast(`${BUILDINGS[ui.mode.type].name} under construction`);
        ui.mode = { kind: 'view' };
        ui.selected = r.id ?? null;
        save(state);
      } else hud.toast(r.reason);
      break;
    }
    case 'cancel':
      ui.mode = { kind: 'view' };
      break;
    case 'upgrade': {
      const r = startUpgrade(state, Number(arg), now);
      hud.toast(r.ok ? 'Upgrade started' : r.reason);
      if (r.ok) save(state);
      break;
    }
    case 'speedup': {
      const r = speedUp(state, Number(arg), now);
      hud.toast(r.ok ? 'Finished' : r.reason);
      if (r.ok) save(state);
      break;
    }
    case 'deselect':
      ui.selected = null;
      break;
    case 'goals':
      ui.goalsMin = !ui.goalsMin;
      break;
    case 'settings':
      ui.settings = !ui.settings;
      ui.confirmReset = false;
      break;
    case 'reset':
      ui.confirmReset = true;
      break;
    case 'reset-cancel':
      ui.confirmReset = false;
      ui.settings = false;
      break;
    case 'reset-confirm':
      try {
        localStorage.removeItem(SAVE_KEY);
      } catch {
        /* ignore */
      }
      location.reload();
      return;
    case 'recentre': {
      const h = hub(state);
      world.focus(h.x + 1.5, h.y + 1.5);
      break;
    }
  }
  hud.render(state, ui, now);
}

function onTap(px: number, py: number) {
  const m = ui.mode;
  const hit = world.pick(px, py, m.kind === 'place' || m.kind === 'road');
  ui.settings = false;
  if (m.kind === 'place') {
    if (hit.tile) {
      const size = BUILDINGS[m.type].size;
      const x = Math.min(state.size - size, Math.max(0, hit.tile.x - Math.floor((size - 1) / 2)));
      const y = Math.min(state.size - size, Math.max(0, hit.tile.y - Math.floor((size - 1) / 2)));
      ui.mode = { ...m, x, y };
    }
  } else if (m.kind === 'road') {
    if (!hit.tile) return;
    if (m.remove) {
      const r = removeRoad(state, hit.tile.x, hit.tile.y);
      if (!r.ok) hud.toast(r.reason);
      else save(state);
    } else if (!m.anchor) {
      ui.mode = { ...m, anchor: hit.tile };
    } else {
      const r = buildRoadLine(state, m.anchor, hit.tile);
      hud.toast(r.ok ? `Road built · ${r.placed} tile${r.placed === 1 ? '' : 's'}` : r.reason);
      if (r.ok) save(state);
      ui.mode = { ...m, anchor: hit.tile };
    }
  } else {
    ui.mode = { kind: 'view' };
    ui.selected = hit.buildingId ?? null;
  }
  hud.render(state, ui, Date.now());
}

// Taps vs. camera drags: a tap is a short press that barely moves, with one finger.
const pointers = new Map<number, { x: number; y: number; t: number }>();
let multi = false;
canvas.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
  if (pointers.size > 1) multi = true;
});
canvas.addEventListener('pointerup', (e) => {
  const p = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  const wasMulti = multi;
  if (pointers.size === 0) multi = false;
  if (!p || wasMulti || e.button > 0) return;
  if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 10 && performance.now() - p.t < 500) {
    const r = canvas.getBoundingClientRect();
    onTap(e.clientX - r.left, e.clientY - r.top);
  }
});
canvas.addEventListener('pointercancel', (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size === 0) multi = false;
});

let lastHud = 0;
let lastSave = Date.now();
world.engine.runRenderLoop(() => {
  const now = Date.now();
  advance(state, now);
  world.sync(state, now);
  const m = ui.mode;
  if (m.kind === 'place') world.setGhost(m.type, m.x, m.y, canPlace(state, m.type, m.x, m.y).ok);
  else world.setGhost(null);
  world.setAnchor(m.kind === 'road' && !m.remove ? m.anchor : null);
  world.setSelected(ui.mode.kind === 'view' && ui.selected != null ? byId(state, ui.selected) ?? null : null);
  world.scene.render();
  hud.placeLabels(world);
  if (now - lastHud > 250) {
    lastHud = now;
    hud.render(state, ui, now);
  }
  if (now - lastSave > 5000) {
    lastSave = now;
    save(state);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save(state);
});
window.addEventListener('pagehide', () => save(state));

// Handy for debugging from the browser console.
Object.assign(window, { tw: { get state() { return state; }, set state(v: GameState) { state = v; }, world, ui } });
