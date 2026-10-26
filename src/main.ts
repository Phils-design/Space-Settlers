import './style.css';
import { World } from './render/world';
import { BUILDINGS, type BuildingType } from './sim/config';
import { advance, bestSpot, canPlace, demolish, placeBuilding, speedUp, startUpgrade, togglePause } from './sim/game';
import { connected } from './sim/path';
import { buildRoad, connectRoad, removeRoad, snapRoadTile } from './sim/roads';
import { OLD_SAVE_KEYS, SAVE_KEY, deserialize, serialize } from './sim/save';
import { byId, createGame, hub, type GameState } from './sim/state';
import { Hud, type UiState } from './ui/hud';

const SEED = 1;

function load(): GameState {
  try {
    for (const k of OLD_SAVE_KEYS) localStorage.removeItem(k);
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
const ui: UiState = { mode: { kind: 'view' }, selected: null, goalsMin: window.innerWidth < 700, settings: false, confirmReset: false, confirmDemolish: false };
const hud = new Hud(document.getElementById('hud')!, act);

const hubCentre = () => {
  const h = hub(state);
  return { x: h.x + 1.5, y: h.y + 1.5 };
};
if (canvas.clientHeight > canvas.clientWidth) world.camera.radius = 82;
world.focus(hubCentre().x, hubCentre().y);

/** Best spot for a new building near the middle of the screen. */
function suggestSpot(type: BuildingType) {
  const centre = world.pick(canvas.clientWidth / 2, canvas.clientHeight / 2, true).tile ?? hubCentre();
  const size = BUILDINGS[type].size;
  return bestSpot(state, type, centre) ?? { x: Math.max(0, Math.round(centre.x - size / 2)), y: Math.max(0, Math.round(centre.y - size / 2)) };
}

function select(id: number | null) {
  ui.selected = id;
  ui.confirmDemolish = false;
}

function act(action: string, arg?: string) {
  const id = Number(arg);
  switch (action) {
    case 'build':
      ui.mode = ui.mode.kind === 'menu' ? { kind: 'view' } : { kind: 'menu' };
      select(null);
      break;
    case 'road':
      ui.mode = ui.mode.kind === 'road' ? { kind: 'view' } : { kind: 'road', anchor: null, remove: false };
      select(null);
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
      const r = placeBuilding(state, ui.mode.type, ui.mode.x, ui.mode.y);
      if (r.ok) {
        const b = byId(state, r.id)!;
        hud.toast(connected(state, b) ? `${BUILDINGS[ui.mode.type].name} marked out. Colonists will build it` : 'Marked out. Now give it a road to the Command Hub');
        ui.mode = { kind: 'view' };
        select(b.id);
        save(state);
      } else hud.toast(r.reason);
      break;
    }
    case 'cancel':
      ui.mode = { kind: 'view' };
      break;
    case 'upgrade': {
      const r = startUpgrade(state, id);
      hud.toast(r.ok ? 'Upgrade marked out. Colonists will bring the materials' : r.reason);
      if (r.ok) save(state);
      break;
    }
    case 'speedup': {
      const r = speedUp(state, id);
      hud.toast(r.ok ? 'Finished' : r.reason);
      if (r.ok) save(state);
      break;
    }
    case 'pause': {
      const r = togglePause(state, id);
      if (!r.ok) hud.toast(r.reason);
      else save(state);
      break;
    }
    case 'connect': {
      const r = connectRoad(state, id);
      hud.toast(r.ok ? `Road built · ${r.placed} tile${r.placed === 1 ? '' : 's'}` : r.reason);
      if (r.ok) save(state);
      break;
    }
    case 'demolish':
      ui.confirmDemolish = true;
      break;
    case 'demolish-cancel':
      ui.confirmDemolish = false;
      break;
    case 'demolish-confirm': {
      const r = demolish(state, id);
      hud.toast(r.ok ? 'Demolished' : r.reason);
      if (r.ok) {
        select(null);
        save(state);
      }
      break;
    }
    case 'deselect':
      select(null);
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
    case 'recentre':
      world.focus(hubCentre().x, hubCentre().y);
      break;
  }
  hud.render(state, ui);
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
    } else {
      const tile = snapRoadTile(state, hit.tile, m.anchor);
      if (!tile) hud.toast("A road can't go there");
      else if (!m.anchor) ui.mode = { ...m, anchor: tile };
      else {
        const r = buildRoad(state, m.anchor, tile);
        hud.toast(r.ok ? `Road built · ${r.placed} tile${r.placed === 1 ? '' : 's'}` : r.reason);
        if (r.ok) {
          save(state);
          ui.mode = { ...m, anchor: tile };
        }
      }
    }
  } else {
    ui.mode = { kind: 'view' };
    select(hit.buildingId ?? null);
  }
  hud.render(state, ui);
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
  world.sync(state);
  const m = ui.mode;
  const selected = m.kind === 'view' && ui.selected != null ? byId(state, ui.selected) ?? null : null;
  if (ui.selected != null && !byId(state, ui.selected)) select(null);
  if (m.kind === 'place') {
    world.setGhost(m.type, m.x, m.y, canPlace(state, m.type, m.x, m.y).ok);
    world.setRadius(m.type, m.x, m.y, 1);
  } else {
    world.setGhost(null);
    world.setRadius(selected?.type ?? null, selected?.x, selected?.y, selected?.level);
  }
  world.setAnchor(m.kind === 'road' && !m.remove ? m.anchor : null);
  world.setSelected(selected);
  world.scene.render();
  hud.placeLabels(world);
  if (now - lastHud > 250) {
    lastHud = now;
    hud.render(state, ui);
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
Object.assign(window, {
  tw: {
    get state() {
      return state;
    },
    set state(v: GameState) {
      state = v;
    },
    world,
    ui,
  },
});
